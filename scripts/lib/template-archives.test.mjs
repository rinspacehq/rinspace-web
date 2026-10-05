import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildTemplateArchives, templateFiles } from "./template-archives.mjs";

const contractsRoot = fileURLToPath(
  new URL("../../contracts/", import.meta.url),
);
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const inputs = JSON.parse(
  fs.readFileSync(path.join(contractsRoot, "input-snapshots.json")),
);
const cli = fileURLToPath(
  new URL("../build-latex-template-archives.mjs", import.meta.url),
);

function tarRead(bytes, args) {
  const result = spawnSync("tar", args, {
    input: bytes,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}

function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rinspace-template-fixture-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = {
    ...inputs,
    inputs: inputs.inputs
      .filter((input) => input.source.startsWith("templates/"))
      .map((input) => ({ ...input })),
  };
  for (const input of manifest.inputs) {
    const target = path.join(root, input.snapshot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      fs.readFileSync(path.join(contractsRoot, input.snapshot)),
    );
  }
  const save = () =>
    fs.writeFileSync(
      path.join(root, "input-snapshots.json"),
      JSON.stringify(manifest),
    );
  save();
  return { root, manifest, save };
}

test("contains every unchanged article/book source and the existing project layout", () => {
  const archives = buildTemplateArchives();
  assert.equal(archives.size, 2);
  for (const [id, names] of Object.entries(templateFiles)) {
    const bytes = archives.get(id + ".tar.gz");
    const members = tarRead(bytes, ["-tzf", "-"]).toString().trim().split("\n");
    assert.ok(members.includes("./"));
    assert.ok(members.includes("./figures/"));
    assert.ok(
      members.includes(id === "latex-article" ? "./sections/" : "./chapters/"),
    );
    assert.deepEqual(
      members.filter((name) => !name.endsWith("/")).sort(),
      names.map((name) => "./" + name).sort(),
    );
    for (const name of names) {
      const input = inputs.inputs.find(
        (input) => input.source === "templates/" + id + "/" + name,
      );
      assert.equal(
        digest(tarRead(bytes, ["-xzOf", "-", "./" + name])),
        input.sha256,
      );
      assert.deepEqual(
        tarRead(bytes, ["-xzOf", "-", "./" + name]),
        fs.readFileSync(path.join(contractsRoot, input.snapshot)),
      );
    }
  }
});

test("preserves the checked-in archives payload without depending on their nonfixed timestamps", () => {
  const archives = buildTemplateArchives();
  for (const [id, names] of Object.entries(templateFiles)) {
    const existing = fs.readFileSync(
      fileURLToPath(
        new URL("../../public/templates/" + id + ".tar.gz", import.meta.url),
      ),
    );
    for (const name of names) {
      assert.deepEqual(
        tarRead(archives.get(id + ".tar.gz"), ["-xzOf", "-", "./" + name]),
        tarRead(existing, ["-xzOf", "-", "./" + name]),
      );
    }
  }
});

test("produces the same bytes despite snapshot mtime/mode, caller umask and inherited tar options", (t) => {
  const before = buildTemplateArchives();
  const { root, manifest } = fixture(t);
  for (const input of manifest.inputs) {
    const filename = path.join(root, input.snapshot);
    fs.utimesSync(filename, new Date(0), new Date("2001-02-03T04:05:06Z"));
    fs.chmodSync(filename, 0o600);
  }
  const oldOptions = process.env.TAR_OPTIONS;
  const oldMask = process.umask(0o077);
  process.env.TAR_OPTIONS = "--deliberately-invalid-test-option";
  try {
    const after = buildTemplateArchives({ contractsRoot: root });
    for (const [name, bytes] of before)
      assert.deepEqual(after.get(name), bytes);
  } finally {
    process.umask(oldMask);
    if (oldOptions === undefined) delete process.env.TAR_OPTIONS;
    else process.env.TAR_OPTIONS = oldOptions;
  }
});

test("rejects changed content before allocating scratch space", (t) => {
  const { root, manifest } = fixture(t);
  fs.appendFileSync(path.join(root, manifest.inputs[0].snapshot), "changed");
  const allocation = t.mock.method(fs, "mkdtempSync", () => {
    throw new Error("must not allocate");
  });
  assert.throws(
    () => buildTemplateArchives({ contractsRoot: root }),
    /digest mismatch/,
  );
  assert.equal(allocation.mock.callCount(), 0);
});

test("rejects missing, duplicated, unapproved and malformed input records", (t) => {
  for (const mutation of [
    (manifest) => {
      manifest.inputs.pop();
    },
    (manifest) => {
      manifest.inputs.push({ ...manifest.inputs[0] });
    },
    (manifest) => {
      manifest.inputs[0].source = "templates/not-approved/main.tex";
    },
    (manifest) => {
      manifest.inputs[0].sha256 = "invalid";
    },
    (manifest) => {
      manifest.kind = "different";
    },
    (manifest) => {
      manifest.inputs = null;
    },
  ]) {
    const current = fixture(t);
    mutation(current.manifest);
    current.save();
    assert.throws(() => buildTemplateArchives({ contractsRoot: current.root }));
  }
});

test("rejects traversal, absolute, link and unbounded input files", (t) => {
  for (const snapshot of [
    "../outside",
    "/etc/hosts",
    "templates//bad",
    "templates/./bad",
    "templates/back\\slash",
  ]) {
    const current = fixture(t);
    current.manifest.inputs[0].snapshot = snapshot;
    current.save();
    assert.throws(
      () => buildTemplateArchives({ contractsRoot: current.root }),
      /Unsafe/,
    );
  }
  const linked = fixture(t);
  const original = path.join(linked.root, linked.manifest.inputs[0].snapshot);
  fs.renameSync(original, original + ".actual");
  fs.symlinkSync(original + ".actual", original);
  assert.throws(
    () => buildTemplateArchives({ contractsRoot: linked.root }),
    /must not be a link/,
  );
  const oversized = fixture(t);
  fs.writeFileSync(
    path.join(oversized.root, oversized.manifest.inputs[0].snapshot),
    Buffer.alloc(128 * 1024 + 1),
  );
  assert.throws(
    () => buildTemplateArchives({ contractsRoot: oversized.root }),
    /bounded regular file/,
  );
});

test("CLI --check is a dry run and rejects arbitrary output/source arguments", () => {
  const before = new Map(
    ["latex-article", "latex-book"].map((id) => [
      id,
      fs.readFileSync(
        fileURLToPath(
          new URL("../../public/templates/" + id + ".tar.gz", import.meta.url),
        ),
      ),
    ]),
  );
  const result = spawnSync(process.execPath, [cli, "--check"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /latex-article.tar.gz [a-f0-9]{64}/);
  for (const [id, bytes] of before)
    assert.deepEqual(
      fs.readFileSync(
        fileURLToPath(
          new URL("../../public/templates/" + id + ".tar.gz", import.meta.url),
        ),
      ),
      bytes,
    );
  const bad = spawnSync(
    process.execPath,
    [cli, "--output", "/not-authorized"],
    { encoding: "utf8" },
  );
  assert.notEqual(bad.status, 0);
});

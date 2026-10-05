import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const templateFiles = Object.freeze({
  "latex-article": Object.freeze([
    "main.tex",
    "refs.bib",
    "sections/intro.tex",
    "figures/.gitkeep",
  ]),
  "latex-book": Object.freeze([
    "main.tex",
    "refs.bib",
    "chapters/chapter-01.tex",
    "figures/.gitkeep",
  ]),
});
const defaultRoot = fileURLToPath(new URL("../../contracts/", import.meta.url));
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

function loadInputs(contractsRoot) {
  const root = fs.realpathSync(contractsRoot);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "input-snapshots.json"), "utf8"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "derived-private-compatibility-inputs" ||
    !Array.isArray(manifest.inputs)
  ) {
    throw new Error("Unsupported template input manifest");
  }
  const expected = new Map(
    Object.entries(templateFiles).flatMap(([id, names]) =>
      names.map((name) => ["templates/" + id + "/" + name, { id, name }]),
    ),
  );
  const seen = new Set();
  const templates = new Map(
    Object.keys(templateFiles).map((id) => [id, new Map()]),
  );
  for (const input of manifest.inputs) {
    if (
      typeof input.source !== "string" ||
      !input.source.startsWith("templates/")
    )
      continue;
    const entry = expected.get(input.source);
    if (!entry || seen.has(input.source))
      throw new Error("Unapproved or duplicate template input");
    seen.add(input.source);
    if (
      typeof input.snapshot !== "string" ||
      input.snapshot.includes("\\") ||
      path.isAbsolute(input.snapshot) ||
      input.snapshot
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Unsafe template snapshot path");
    }
    const filename = path.join(root, input.snapshot);
    const resolved = fs.realpathSync(filename);
    if (
      !resolved.startsWith(root + path.sep) ||
      fs.lstatSync(filename).isSymbolicLink()
    )
      throw new Error("Template input must not be a link or escape its root");
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > 128 * 1024)
      throw new Error("Template input must be a bounded regular file");
    const bytes = fs.readFileSync(filename);
    if (
      typeof input.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      digest(bytes) !== input.sha256
    ) {
      throw new Error("Template snapshot digest mismatch");
    }
    templates.get(entry.id).set(entry.name, bytes);
  }
  if (seen.size !== expected.size)
    throw new Error("Missing reviewed template input");
  return templates;
}

export function buildTemplateArchives({ contractsRoot = defaultRoot } = {}) {
  // Resolve and verify every input before allocating scratch space. These are
  // frontend-local snapshots; source provenance paths are NEVER read here.
  const templates = loadInputs(contractsRoot);
  const result = new Map();
  for (const [id, files] of templates) {
    const scratch = fs.mkdtempSync(
      path.join(os.tmpdir(), "rinspace-template-inputs-"),
    );
    try {
      for (const [name, bytes] of files) {
        const filename = path.join(scratch, name);
        fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o755 });
        fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o644 });
        fs.chmodSync(filename, 0o644);
      }
      const tar = spawnSync(
        "tar",
        [
          "--format=ustar",
          "--sort=name",
          "--mtime=@0",
          "--owner=0",
          "--group=0",
          "--numeric-owner",
          "--mode=u+rwX,go+rX,go-w",
          "-cf",
          "-",
          "-C",
          scratch,
          ".",
        ],
        {
          maxBuffer: 2 * 1024 * 1024,
          // TAR_OPTIONS and other inherited configuration are not build inputs.
          env: {
            PATH: process.env.PATH || "/usr/bin:/bin",
            LC_ALL: "C",
            TZ: "UTC",
          },
        },
      );
      if (tar.error) throw tar.error;
      if (tar.status !== 0)
        throw new Error(
          "Template tar generation failed: " + tar.stderr?.toString().trim(),
        );
      result.set(id + ".tar.gz", gzipSync(tar.stdout));
    } finally {
      // Only the temporary directory allocated in this iteration.
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
  return result;
}

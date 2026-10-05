#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTemplateArchives } from "./lib/template-archives.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check"))
  throw new Error("Only --check is supported");
const archives = buildTemplateArchives();
for (const [name, bytes] of archives) {
  if (args[0] === "--check") {
    // Dry-run generation only; never writes authoring or production assets.
    console.log(
      name + " " + crypto.createHash("sha256").update(bytes).digest("hex"),
    );
  } else {
    const directory = path.join(root, "public/templates");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, name), bytes);
    console.log("public/templates/" + name);
  }
}

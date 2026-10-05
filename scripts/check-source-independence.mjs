import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Private preparation, not a source exporter or a production build.
// Only frontend files and installed dependencies are mounted. No parent tree,
// environment files, credentials, inherited environment or network are exposed.
const root = path.resolve(import.meta.dirname, "..");
const directories = [
  "src",
  "scripts",
  "contracts",
  "public",
  "tests",
];
const files = [
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  "playwright.code-editor.config.ts",
  "playwright.identity.config.ts",
  "playwright/code-editor-baseline.spec.ts",
  "playwright/code-editor-fixture.mjs",
  ".gitignore",
  "index.html",
];
const args = [
  "--die-with-parent",
  "--unshare-net",
  "--clearenv",
  "--ro-bind",
  "/usr",
  "/usr",
  "--ro-bind",
  "/lib",
  "/lib",
  "--ro-bind",
  "/lib64",
  "/lib64",
  "--proc",
  "/proc",
  "--dev",
  "/dev",
  "--tmpfs",
  "/tmp",
  "--dir",
  "/app",
  "--dir",
  "/etc",
  "--ro-bind",
  "/etc/hosts",
  "/etc/hosts",
  "--ro-bind",
  "/etc/nsswitch.conf",
  "/etc/nsswitch.conf",
  "--setenv",
  "PATH",
  "/usr/bin:/bin",
  "--setenv",
  "CI",
  "true",
];
for (const name of [...directories, ...files]) {
  const source = path.join(root, name);
  if (!fs.existsSync(source))
    throw new Error("Missing frontend input: " + name);
  args.push("--ro-bind", source, "/app/" + name);
}
if (process.argv.includes("--math-browser")) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const executable = fs.realpathSync(chromium.executablePath());
  if (!fs.statSync(executable).isFile())
    throw new Error("Install the pinned Playwright Chromium dependency first.");
  args.push(
    "--dir",
    "/opt",
    "--ro-bind",
    path.dirname(executable),
    "/opt/rinspace-test-chromium",
  );
  for (const file of ["/etc/fonts", "/etc/ld.so.cache"]) {
    if (fs.existsSync(file)) args.push("--ro-bind", file, file);
  }
}
// Vite's dependency cache is writable; application sources remain read-only.
args.push(
  "--bind",
  path.join(root, "node_modules"),
  "/app/node_modules",
  "--chdir",
  "/app",
  "--",
);
const phases = [
  [
    "source-boundary",
    [
      "-e",
      "const fs=require('node:fs'); for (const p of ['/home/ubuntu/rinspace','/specs','/contracts','/templates','/scripts']) { if(fs.existsSync(p)) throw Error('Private tree visible: '+p); } console.log('No private parent tree mounted.');",
    ],
  ],
  ["routes", ["scripts/generate-typed-route-manifest.mjs", "--check"]],
  ["template-inputs", ["scripts/build-latex-template-archives.mjs", "--check"]],
  ["template-tests", ["--test", "scripts/lib/template-archives.test.mjs"]],
  ["entrypoint-tests", ["--test", "scripts/lib/frontend-entrypoints.test.mjs"]],
  ["application-components", ["scripts/check-animate-ui-application.mjs"]],
  ["math-inputs", ["scripts/check-markdown-math-editor.cjs", "--check-inputs"]],
  ["math-input-tests", ["--test", "scripts/lib/markdown-math-inputs.test.cjs"]],
  ["typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]],
  ["translations", ["scripts/check-i18n.mjs"]],
];
if (process.argv.includes("--math-browser")) {
  phases.push(["math-browser", ["scripts/check-markdown-math-isolated.mjs"]]);
}
if (!process.argv.includes("--typecheck-only")) {
  phases.push([
    "unit-tests",
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--pool",
      "forks",
      "--maxWorkers",
      "1",
    ],
  ]);
}
for (const [label, command] of phases) {
  console.log("Frontend-only check: " + label);
  const result = spawnSync("bwrap", [...args, "/usr/bin/node", ...command], {
    stdio: "inherit",
  });
  if (result.error)
    throw new Error(
      "bubblewrap is required on Linux for this isolation check: " +
        result.error.message,
    );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Frontend-only checks passed. Install, browser, production build and publication are separate checks.",
);

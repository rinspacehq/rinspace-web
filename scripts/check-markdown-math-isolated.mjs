import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "vite";

// Invoked inside the frontend-only network/filesystem namespace. Dev transforms
// are not a production build; only this namespace can reach its loopback server.
const root = path.resolve(import.meta.dirname, "..");
const executablePath = "/opt/rinspace-test-chromium/chrome";
if (!fs.existsSync(executablePath))
  throw new Error(
    "Use the frontend-only check with its pinned Chromium dependency mount.",
  );
const preflight = spawnSync(executablePath, ["--version"], {
  encoding: "utf8",
});
if (preflight.status !== 0)
  throw new Error(
    "Chromium dependency preflight failed: " +
      (preflight.error?.message || preflight.stderr),
  );
console.log(preflight.stdout.trim());
const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  server: { host: "127.0.0.1", port: 4187, strictPort: true },
});
try {
  await server.listen();
  const status = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/check-markdown-math-editor.cjs", "--isolated"],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          PATH: "/usr/bin:/bin",
          HOME: "/tmp/rinspace-check-home",
          HEADLESS: "true",
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath,
          MARKDOWN_MATH_URL: "http://127.0.0.1:4187/rinspace/write/markdown",
        },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (status !== 0) process.exitCode = status;
} finally {
  await server.close();
}

#!/usr/bin/env node

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = (
  process.env.RINSPACE_BROWSER_BASE_URL || "http://127.0.0.1:4173"
).replace(/\/$/, "");
const chromiumPath = process.env.CHROMIUM_BIN;
const browserErrors = [];
const sourceCode = `# This stays source code
const answer = 42;
console.log(answer);`;
const vscodeHTML = `<div style="color: #cccccc; background-color: #1f1f1f; font-family: Consolas, 'Courier New', monospace; white-space: pre;">
  <div><span># This stays source code</span></div>
  <div><span>const answer = 42;</span></div>
  <div><span>console.log(answer);</span></div>
</div>`;

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));

  await page.goto(`${baseURL}/write/markdown`, {
    waitUntil: "domcontentloaded",
  });
  const editor = page.locator(".ProseMirror");
  await editor.waitFor({ state: "visible" });
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");

  await page.evaluate(
    ({ plainText, htmlText }) => {
      const target =
        document.activeElement?.closest?.(".ProseMirror") ||
        document.querySelector(".ProseMirror");
      if (!target) throw new Error("Markdown editor is missing.");
      const data = new DataTransfer();
      data.setData("text/plain", plainText);
      data.setData("text/html", htmlText);
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    },
    { plainText: sourceCode, htmlText: vscodeHTML },
  );
  await page.waitForTimeout(900);

  const pasted = await page.evaluate(() => ({
    headingCount: document.querySelectorAll(".ProseMirror h1").length,
    codeBlockCount: document.querySelectorAll(
      ".milkdown-code-block:not(.rin-latex-block)",
    ).length,
    codeLines: Array.from(document.querySelectorAll(
      ".milkdown-code-block:not(.rin-latex-block) .cm-line",
    )).map(
      (node) => node.textContent || "",
    ),
  }));

  assert.equal(
    pasted.headingCount,
    0,
    "the heading input rule consumed the leading # from pasted source code",
  );
  assert.equal(
    pasted.codeBlockCount,
    1,
    "VS Code clipboard source was not inserted as one code block",
  );
  assert.deepEqual(pasted.codeLines, [
    "# This stays source code",
    "const answer = 42;",
    "console.log(answer);",
  ]);

  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(250);
  assert.equal(
    (await editor.innerText()).trim(),
    "",
    "pasted source code could not be removed from the editor",
  );
  assert.deepEqual(browserErrors, []);
} finally {
  await browser.close();
}

console.log("VS Code source clipboard browser acceptance passed");

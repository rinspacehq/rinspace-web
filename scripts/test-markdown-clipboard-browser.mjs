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
const looseTable = `Table paste fixture.

| Method | Admin | Reddit |

|---|---:|---:|

| Prompt Update | 48.35 | 54.57 |

| Logit Update | 52.31 | 57.64 |

Logit Update performs better.`;

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

  await page.evaluate((plainText) => {
    const target =
      document.activeElement?.closest?.(".ProseMirror") ||
      document.querySelector(".ProseMirror");
    if (!target) throw new Error("Markdown editor is missing.");
    const data = new DataTransfer();
    data.setData("text/plain", plainText);
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, looseTable);
  await page.waitForTimeout(900);

  const tablePaste = await page.evaluate(() => ({
    tableCount: document.querySelectorAll(".ProseMirror table.children").length,
    headers: Array.from(document.querySelectorAll(".ProseMirror th")).map(
      (node) => (node.textContent || "").trim(),
    ),
    cells: Array.from(document.querySelectorAll(".ProseMirror td")).map(
      (node) => (node.textContent || "").trim(),
    ),
    paragraphs: Array.from(document.querySelectorAll(".ProseMirror p")).map(
      (node) => (node.textContent || "").trim(),
    ),
  }));
  assert.equal(
    tablePaste.tableCount,
    1,
    "blank-separated GFM table paste did not create one table",
  );
  assert.deepEqual(tablePaste.headers, ["Method", "Admin", "Reddit"]);
  assert.deepEqual(tablePaste.cells, [
    "Prompt Update",
    "48.35",
    "54.57",
    "Logit Update",
    "52.31",
    "57.64",
  ]);
  assert.ok(tablePaste.paragraphs.includes("Logit Update performs better."));
  assert.deepEqual(browserErrors, []);
} finally {
  await browser.close();
}

console.log("VS Code source and Markdown table clipboard browser acceptance passed");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

// Never let a developer's optional custom manuscript enter these default-input tests.
process.env.LINEAR_ATTN_MD = "";
const {
  linearAttnPath,
  readLinearAttnMarkdown,
  firstMarkdownHeadingText,
  tableAfterArticleSource,
} = require("../check-markdown-math-editor.cjs");
const {
  diagramPath,
  checkedFixtureOrigin,
  installMarkdownMathBrowserFixture,
} = require("./markdown-math-browser-fixture.cjs");
const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/check-markdown-math-editor.cjs");

test("the default manuscript is a frontend-owned synthetic fixture, not a private input", () => {
  assert.equal(
    linearAttnPath,
    path.join(root, "tests/fixtures/markdown-math/linear-attn.md"),
  );
  assert.match(readLinearAttnMarkdown(), /原创的自动化测试输入/);
  assert.equal(
    firstMarkdownHeadingText(readLinearAttnMarkdown()),
    "数学编辑器固定回归样本",
  );
  assert.doesNotMatch(
    fs.readFileSync(script, "utf8"),
    /\.\.\/\.\.\/\.\.\/linear-attn\.md/,
  );
});

test("the synthetic document preserves heading, formula and Python fence coverage", () => {
  const source = readLinearAttnMarkdown();
  const prose = source.replace(/^```.*\n[\s\S]*?^```[ \t]*$/gm, "");
  assert.equal((prose.match(/^# /gm) || []).length, 1);
  assert.equal((prose.match(/^## /gm) || []).length, 8);
  assert.equal((prose.match(/^### /gm) || []).length, 3);
  assert.equal((source.match(/^\$\$.+\$\$$/gm) || []).length, 12);
  assert.match(source, /\\operatorname\{softmax\}/);
  assert.match(source, /M_t=/);
  assert.match(source, /\\begin\{aligned\}/);
  const code = /```python\n([\s\S]*?)\n```/.exec(source)?.[1];
  assert.ok(code);
  assert.match(code, /# q, k:/);
  assert.match(code, /cumsum/);
  assert.doesNotMatch(code, /## [68]\./);
  assert.ok(
    source.indexOf("## 6. 从“累加”走向“遗忘与改写”") > source.indexOf(code),
  );
  assert.ok(
    source.indexOf("## 8. 近期相关架构（截至 2026-07）") > source.indexOf(code),
  );
});

test("the table fixture uses a local synthetic diagram and retains its focus regression text", () => {
  assert.ok(tableAfterArticleSource.includes(diagramPath));
  assert.ok(tableAfterArticleSource.includes("让我测试rang'wo"));
  assert.match(
    tableAfterArticleSource,
    /\| :----- \| :----- \| :----- \| :----- \|/,
  );
  assert.doesNotMatch(
    tableAfterArticleSource,
    /\/rin\/api\/diagrams\/|https?:\/\//,
  );
});

test("all 24 pre-existing browser checks remain in the same execution order", () => {
  const expected = [
    "checkMilkdownBlockMathShortcutCreatesLatex",
    "checkEnterDisplayMathShortcutOpensLatex",
    "checkTypedSingleLineDisplayMathCreatesLatex",
    "checkTypedFourDollarDisplayMathOpensLatex",
    "checkFourDollarAfterCompletedFormulaKeepsPreviousBlock",
    "checkDeleteDeletesDisplayMathBlock",
    "checkTypedDisplayMathThenBlankThenDisplayMath",
    "checkBackspaceDeletesBlankParagraphAfterDisplayMath",
    "checkLatexPanelStripsWrappedDisplayMath",
    "checkConsecutiveTopBarFormulaBlocks",
    "checkHeadingDollarFocus",
    "checkHeadingEnterCreatesParagraph",
    "checkTypedHeadingEnterCreatesParagraph",
    "checkNonFirstH1DemotesToH2",
    "checkRepeatedNonFirstH1DemotionIsFast",
    "checkHeadingOneHiddenFromMenus",
    "checkInlineFormulaEditing",
    "checkTopBarFormulaSeparatedByHeading",
    "checkTopBarFormulaAfterTypedHeadingWithoutEnter",
    "checkTopBarFormulaAfterTypedHeadingWithEnter",
    "checkLinearAttnPasteAndTopBarFormula",
    "checkTableAfterArticleSourceKeepsFocus",
    "checkLinearAttnManualTopBarFormulaInput",
    "checkLinearAttnManualInput",
  ];
  const source = fs.readFileSync(script, "utf8");
  const checks = /const checks = \[([\s\S]*?)\];/.exec(source)?.[1];
  assert.ok(checks);
  assert.deepEqual(checks.match(/check[A-Z]\w+/g), expected);
  assert.match(source, /await check\(page\);/);
  assert.match(source, /unexpectedMessages\.length === 0/);
});

test("input dry run does not launch a browser or need a private tree", () => {
  const result = spawnSync(process.execPath, [script, "--check-inputs"], {
    cwd: root,
    env: { PATH: "/usr/bin:/bin" },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.kind, "markdown-math-test-input");
  assert.equal(report.input, "tests/fixtures/markdown-math/linear-attn.md");
  assert.equal(report.bytes, Buffer.byteLength(readLinearAttnMarkdown()));
});

test("isolated checks accept only explicit HTTP loopback targets", () => {
  assert.equal(
    checkedFixtureOrigin("http://127.0.0.1:4187/rinspace/write/markdown"),
    "http://127.0.0.1:4187",
  );
  assert.equal(
    checkedFixtureOrigin("http://[::1]:4187/write/markdown"),
    "http://[::1]:4187",
  );
  for (const value of [
    "https://rinspace.com/write/markdown",
    "http://127.0.0.1.evil.test/",
    "http://0.0.0.0/",
    "http://name:password@localhost/",
    "file:///tmp/page",
  ]) {
    assert.throws(() => checkedFixtureOrigin(value), /loopback/);
  }
});

test("browser fixture intercepts API/image requests and refuses external targets or business writes", async () => {
  let handler;
  const page = {
    addInitScript: async () => {},
    route: async (pattern, callback) => {
      assert.equal(pattern, "**/*");
      handler = callback;
    },
  };
  const blocked = await installMarkdownMathBrowserFixture(
    page,
    "http://127.0.0.1:4187/rinspace/write/markdown",
  );
  async function dispatch(pathname, method = "GET") {
    let outcome;
    await handler({
      request: () => ({
        url: () => new URL(pathname, "http://127.0.0.1:4187").href,
        method: () => method,
      }),
      fulfill: async (response) => {
        outcome = { type: "fulfilled", ...response };
      },
      abort: async () => {
        outcome = { type: "blocked" };
      },
      continue: async () => {
        outcome = { type: "continued" };
      },
    });
    return outcome;
  }
  assert.equal(
    (await dispatch("/rinspace/api/identity/v1/session")).json.user.id,
    "math-fixture-author",
  );
  assert.equal(
    (await dispatch("/rinspace/api/rin-writer/draft", "POST")).status,
    204,
  );
  assert.equal((await dispatch(diagramPath)).contentType, "image/svg+xml");
  assert.equal((await dispatch("/rinspace/api/content", "POST")).status, 405);
  assert.equal(
    (await dispatch("https://rinspace.com/api/feed")).type,
    "blocked",
  );
  assert.equal((await dispatch("/rinspace/src/main.tsx")).type, "continued");
  assert.deepEqual(blocked, ["POST /api/content", "https://rinspace.com"]);
});

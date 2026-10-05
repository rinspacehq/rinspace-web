#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  checkedFixtureOrigin,
  installMarkdownMathBrowserFixture,
} = require('./lib/markdown-math-browser-fixture.cjs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  throw new Error(
    'Playwright is required for markdown math editor checks. Install it or run this in the Rinspace workspace environment.',
  );
}

const targetUrl =
  process.env.MARKDOWN_MATH_URL || 'http://localhost:3000/write/markdown';
const headless = process.env.HEADLESS !== 'false';
const linearAttnPath =
  process.env.LINEAR_ATTN_MD || path.resolve(__dirname, '../tests/fixtures/markdown-math/linear-attn.md');
const tableAfterArticleSource = `# 这是一次测试

$$
aaa
$$

## aaa

$$
aaa
$$

## aaaa

$$
aaaa
$$

$$
aaa
$$

## aaa

## aaaa

$$
aaa
$$

![aaa](/__math-fixtures__/diagram.svg)

|  |  |  |  |
| :----- | :----- | :----- | :----- |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

让我测试rang'wo`;

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : '';
  throw new Error(`${message}${suffix}`);
}

async function setupPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const blockedRequests = process.argv.includes('--isolated')
    ? await installMarkdownMathBrowserFixture(page, targetUrl)
    : [];
  const unexpectedMessages = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const knownDevWarnings = [
      '`controlId` is ignored on `<FormControl>`',
      'Feature flags __VUE_OPTIONS_API__',
    ];
    if (
      ['error', 'warning'].includes(msg.type()) &&
      !knownDevWarnings.some((pattern) => text.includes(pattern))
    ) {
      unexpectedMessages.push(`${msg.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    unexpectedMessages.push(`pageerror: ${error.message}`);
  });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  return { page, unexpectedMessages, blockedRequests };
}

async function clearMilkdownAutosave(page) {
  await page.evaluate(async () => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('rinspace:milkdown-autosave:')) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Test cleanup is best effort.
    }

    if (!window.indexedDB) return;
    await new Promise((resolve) => {
      const request = window.indexedDB.deleteDatabase('rinspace-milkdown-autosave');
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    });
  });
}

async function resetEditor(page, title) {
  await clearMilkdownAutosave(page);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  await page.locator('.ProseMirror').click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  await page.fill('#markdown-title', title);
  await page.waitForTimeout(300);
}

function readLinearAttnMarkdown() {
  return fs.readFileSync(linearAttnPath, 'utf8');
}

function firstMarkdownHeadingText(source) {
  return (/^#\s+(.+)$/m.exec(source)?.[1] || '').trim();
}

async function pastePlainTextIntoEditor(page, text) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await page.evaluate((clipboardText) => {
    const target = document.activeElement?.closest?.('.ProseMirror') ||
      document.querySelector('.ProseMirror');
    if (!target) throw new Error('Missing ProseMirror editor for paste test.');
    const data = new DataTransfer();
    data.setData('text/plain', clipboardText);
    target.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, text);
  await page.waitForTimeout(2500);
}

async function completeDisplayFormula(page) {
  await page.getByRole('button', { name: '完成' }).click();
}

async function revealFirstNonLatexCodeBlock(page) {
  const firstCodeBlock = page.locator('.milkdown-code-block:not(.rin-latex-block)').first();
  if ((await firstCodeBlock.count()) === 0) return;
  await firstCodeBlock.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

async function checkNewDisplayFormulaContinuesText(page) {
  await resetEditor(page, '连续数学写作');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$$$', { delay: 10 });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.keyboard.type('\\int_a^b f(x) dx', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await page.keyboard.type('下一段正文', { delay: 5 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    const block = document.querySelector('.rin-latex-block');
    return {
      activeInsideProse: Boolean(
        document.activeElement && prose?.contains(document.activeElement),
      ),
      panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
      latexText: block?.querySelector('.cm-content')?.textContent || '',
      paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (p) => p.textContent || '',
      ),
      katexErrorCount: block?.querySelectorAll('.katex-error').length || 0,
    };
  });

  assert(result.panelCount === 0, 'Display math editor should close after clicking 完成.', result);
  assert(result.latexText === '\\int_a^b f(x) dx', 'Display math should persist.', result);
  assert(
    result.paragraphTexts.includes('下一段正文'),
    'Typing after display math should create/fill the following paragraph.',
    result,
  );
  assert(
    result.activeInsideProse,
    'Focus should remain in Milkdown after continuing from display math.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Display math should render without KaTeX errors.', result);
}

async function checkExistingFormulaContinuesText(page) {
  await resetEditor(page, '已有公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$\\int$$', { delay: 5 });
  await page.waitForTimeout(1200);
  await page.locator('.rin-latex-block .preview').click({ force: true });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.keyboard.type(' f', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await page.keyboard.type('继续正文', { delay: 5 });
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    const block = document.querySelector('.rin-latex-block');
    return {
      activeInsideProse: Boolean(
        document.activeElement && prose?.contains(document.activeElement),
      ),
      panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
      latexText: block?.querySelector('.cm-content')?.textContent || '',
      paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (p) => p.textContent || '',
      ),
      katexErrorCount: block?.querySelectorAll('.katex-error').length || 0,
    };
  });

  assert(result.panelCount === 0, 'Existing formula editor should close after clicking 完成.', result);
  assert(result.latexText === '\\int f', 'Existing formula should append at the end.', result);
  assert(result.paragraphTexts.includes('继续正文'), 'Existing formula should continue to text.', result);
  assert(result.activeInsideProse, 'Focus should remain in Milkdown after existing formula.', result);
  assert(result.katexErrorCount === 0, 'Existing formula should render without KaTeX errors.', result);
}

async function checkMultilineFormula(page) {
  await resetEditor(page, '多行公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$$$', { delay: 5 });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.keyboard.type('a+b', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('=c', { delay: 5 });
  const panelLines = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rin-latex-editor-panel .cm-line')).map(
      (line) => line.textContent || '',
    ),
  );
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  const blockLines = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rin-latex-block .cm-line')).map(
      (line) => line.textContent || '',
    ),
  );

  assert(
    panelLines.join('\n') === 'a+b\n=c',
    'Enter should create a new formula editor line.',
    { panelLines },
  );
  assert(
    blockLines.join('\n') === 'a+b\n=c',
    'Multiline formula should persist after submit.',
    { blockLines },
  );
}

async function checkMilkdownBlockMathShortcutCreatesLatex(page) {
  await resetEditor(page, '默认公式快捷');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$', { delay: 5 });
  await page.keyboard.press('Space');
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.keyboard.type('a+b', { delay: 5 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    panelText:
      document.querySelector('.rin-latex-editor-panel .cm-content')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
  }));

  assert(
    result.latexCount === 1,
    'Milkdown default "$$ " block math shortcut should create a LaTeX block.',
    result,
  );
  assert(
    result.panelCount === 1,
    'Typing "$$ " should open the Rinspace latex editor panel.',
    result,
  );
  assert(
    result.panelText === 'a+b' && result.latexTexts[0] === '',
    'Typing after "$$ " should continue inside the latex editor panel before finishing.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$')),
    'Typing "$$ " should not leave raw formula fences in paragraph text.',
    result,
  );
  assert(
    result.katexErrorCount === 0,
    'Milkdown default "$$ " shortcut should not create a broken LaTeX preview.',
    result,
  );

  await completeDisplayFormula(page);
  await page.waitForTimeout(800);

  const committed = await page.evaluate(() => ({
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
  }));
  assert(
    committed.panelCount === 0 &&
      committed.latexTexts.length === 1 &&
      committed.latexTexts[0] === 'a+b',
    'Completing a "$$ " formula should commit the panel content to the latex block.',
    committed,
  );
  assert(
    !committed.paragraphTexts.some((text) => text.includes('a+b') || text.includes('$$')),
    'Completing a "$$ " formula should not leak formula content into paragraph text.',
    committed,
  );
  assert(
    committed.katexErrorCount === 0,
    'Completing a "$$ " formula should keep KaTeX healthy.',
    committed,
  );
}

async function checkEnterDisplayMathShortcutOpensLatex(page) {
  await resetEditor(page, '回车公式快捷');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.waitForTimeout(900);
  await page.keyboard.type('a+b', { delay: 5 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    panelText:
      document.querySelector('.rin-latex-editor-panel .cm-content')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
  }));

  assert(
    result.latexCount === 1 && result.panelCount === 1,
    'Typing "$$" then Enter should create one LaTeX block and open the editor panel.',
    result,
  );
  assert(
    result.panelText === 'a+b' && result.latexTexts[0] === '',
    'Delayed typing after "$$" then Enter should stay inside the latex editor panel.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes('a+b') || text.includes('$$')),
    'Typing after "$$" then Enter should not leak formula content into paragraph text.',
    result,
  );
  assert(
    result.katexErrorCount === 0,
    'Typing "$$" then Enter should keep KaTeX healthy.',
    result,
  );
}

async function checkTypedSingleLineDisplayMathCreatesLatex(page) {
  await resetEditor(page, '手写单行公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$\\int_a^b f(x) \\mathrm{d}x$$', { delay: 5 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    inlineMathCount: document.querySelectorAll('span[data-type="math_inline"]').length,
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    result.latexCount === 1,
    'Typing a complete single-line $$...$$ formula should create one LaTeX block.',
    result,
  );
  assert(
    result.latexTexts[0] === '\\int_a^b f(x) \\mathrm{d}x',
    'Typed single-line display math should preserve formula content.',
    result,
  );
  assert(
    result.inlineMathCount === 0,
    'Typed single-line display math should not be captured as inline math.',
    result,
  );
  assert(
    result.katexErrorCount === 0,
    'Typed single-line display math should render without KaTeX errors.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$')),
    'Typed single-line display math should not leave raw "$$" in paragraphs.',
    result,
  );
}

async function checkTypedFourDollarDisplayMathOpensLatex(page) {
  await resetEditor(page, '四个美元打开公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$$$', { delay: 5 });
  await page.waitForTimeout(1000);
  await page.keyboard.type('aaa', { delay: 5 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    panelText:
      document.querySelector('.rin-latex-editor-panel .cm-content')?.textContent || '',
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    result.latexCount === 1,
    'Typing "$$$$" should open one LaTeX block.',
    result,
  );
  assert(
    result.panelCount === 1,
    'Typing "$$$$" should open the latex editor panel.',
    result,
  );
  assert(
    result.panelText === 'aaa',
    'Typing after "$$$$" should continue inside the latex editor panel.',
    result,
  );
  assert(
    result.latexTexts[0] === '',
    'Typing after "$$$$" should not commit the panel content before finishing.',
    result,
  );
  await completeDisplayFormula(page);
  await page.waitForTimeout(1000);

  const committed = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    activeTag: document.activeElement?.tagName || '',
    activeClass: (document.activeElement && 'className' in document.activeElement
      ? document.activeElement.className
      : '') || '',
    selType: window.getSelection()?.type || '',
    anchorNode: window.getSelection()?.anchorNode?.nodeName || '',
    anchorOffset: window.getSelection()?.anchorOffset ?? -1,
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    committed.panelCount === 0,
    'Completing a "$$$$" display formula should close the latex editor panel.',
    committed,
  );
  assert(
    committed.latexCount === 1 && committed.latexTexts[0] === 'aaa',
    'Completing a "$$$$" display formula should commit the panel content.',
    committed,
  );
  assert(
    committed.activeTag === 'DIV' &&
      committed.activeClass.includes('ProseMirror-focused') &&
      committed.selType === 'Caret' &&
      committed.paragraphTexts[committed.paragraphTexts.length - 1] === '',
    'Completing a display formula should leave an empty placeholder paragraph after the formula.',
    committed,
  );
  assert(
    committed.katexErrorCount === 0,
    'Completing a "$$$$" display formula should keep the formula preview healthy.',
    committed,
  );
  assert(
    !committed.paragraphTexts.some((text) => text.includes('$$aaa$$')),
    'Completing a "$$$$" display formula should not flatten the formula back into plain text.',
    committed,
  );
}

async function checkFourDollarAfterCompletedFormulaKeepsPreviousBlock(page) {
  const wallisFormula =
    '\\frac{2}{1} \\cdot \\frac{2}{3} \\cdot \\frac{4}{3} \\cdot \\frac{4}{5} \\cdot \\frac{6}{5} \\cdot \\frac{6}{7} \\cdot \\frac{8}{7} \\cdot \\frac{8}{9} \\cdots=\\frac{\\pi}{2}';

  await resetEditor(page, '连续四美元公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$$$', { delay: 5 });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.keyboard.type(wallisFormula, { delay: 2 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(1000);
  await page.keyboard.type('$$$$', { delay: 5 });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    panelText:
      document.querySelector('.rin-latex-editor-panel .cm-content')?.textContent || '',
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
  }));

  assert(
    result.latexCount === 2,
    'Typing "$$$$" after a completed display formula should create a second LaTeX block.',
    result,
  );
  assert(
    result.latexTexts[0] === wallisFormula && result.latexTexts[1] === '',
    'Typing "$$$$" after a completed display formula should preserve the first formula and leave the new block empty.',
    result,
  );
  assert(
    result.panelCount === 1 && result.panelText === '',
    'Typing "$$$$" after a completed display formula should open an empty editor panel for the new block.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes(wallisFormula) || text.includes('$$')),
    'Typing "$$$$" after a completed display formula should not flatten formulas into paragraph text.',
    result,
  );
  assert(
    result.katexErrorCount === 0,
    'Typing "$$$$" after a completed display formula should keep KaTeX healthy.',
    result,
  );
}

async function checkDeleteDeletesDisplayMathBlock(page) {
  await resetEditor(page, '删除公式块');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$aaa$$', { delay: 5 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    activeTag: document.activeElement?.tagName || '',
    activeClass: (document.activeElement && 'className' in document.activeElement
      ? document.activeElement.className
      : '') || '',
    selType: window.getSelection()?.type || '',
    anchorNode: window.getSelection()?.anchorNode?.nodeName || '',
    anchorOffset: window.getSelection()?.anchorOffset ?? -1,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(result.latexCount === 0, 'Delete should delete the display math block.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$aaa$$')),
    'Delete should not leave the display math as plain paragraph text.',
    result,
  );
  assert(
    result.activeTag === 'DIV' &&
      result.activeClass.includes('ProseMirror-focused') &&
      result.selType === 'Caret',
    'Delete should keep an editable position after deleting the formula.',
    result,
  );
}

async function checkTypedDisplayMathThenBlankThenDisplayMath(page) {
  await resetEditor(page, '公式空行公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$aaa$$', { delay: 5 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.type('$$bbb$$', { delay: 5 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    activeTag: document.activeElement?.tagName || '',
    activeClass: (document.activeElement && 'className' in document.activeElement
      ? document.activeElement.className
      : '') || '',
    selType: window.getSelection()?.type || '',
  }));

  assert(
    result.latexCount === 2 &&
      result.latexTexts[0] === 'aaa' &&
      result.latexTexts[1] === 'bbb',
    'Typing formula, blank line, formula should keep both display math blocks.',
    result,
  );
  assert(
    result.katexErrorCount === 0,
    'Typing formula, blank line, formula should keep KaTeX healthy.',
    result,
  );
  assert(
    result.activeTag === 'DIV' &&
      result.activeClass.includes('ProseMirror-focused') &&
      result.selType === 'Caret',
    'Typing formula, blank line, formula should keep an editable caret in the editor.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$aaa$$') || text.includes('$$bbb$$')),
    'Typing formula, blank line, formula should not leak raw fences into paragraphs.',
    result,
  );
}

async function checkBackspaceDeletesBlankParagraphAfterDisplayMath(page) {
  await resetEditor(page, '空行删除语义');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$aaa$$', { delay: 5 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    activeTag: document.activeElement?.tagName || '',
    activeClass: (document.activeElement && 'className' in document.activeElement
      ? document.activeElement.className
      : '') || '',
    selType: window.getSelection()?.type || '',
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    result.latexCount === 0,
    'Backspace on a blank line after a display formula should delete the formula block.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$aaa$$')),
    'Backspace on a blank line after a display formula should remove the formula text.',
    result,
  );
  assert(
    result.activeTag === 'DIV' &&
      result.activeClass.includes('ProseMirror-focused') &&
      result.selType === 'Caret',
    'Backspace on a blank line after a display formula should leave a caret in the editor.',
    result,
  );
}

async function checkLatexPanelStripsWrappedDisplayMath(page) {
  await resetEditor(page, '公式面板去围栏');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.locator('button.top-bar-item:has([data-rin-topbar-math="true"])').click();
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.locator('.rin-latex-editor-panel .cm-content').type('$$aaa$$', { delay: 5 });
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    latexCount: document.querySelectorAll('.rin-latex-block').length,
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    result.latexCount === 1,
    'Typing wrapped display math into the latex panel should still produce one latex block.',
    result,
  );
  assert(
    result.latexTexts[0] === 'aaa',
    'Typing wrapped display math into the latex panel should strip the outer fences.',
    result,
  );
  assert(
    result.katexErrorCount === 0,
    'Typing wrapped display math into the latex panel should render without KaTeX errors.',
    result,
  );
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$aaa$$')),
    'Typing wrapped display math into the latex panel should not leave raw fences in paragraphs.',
    result,
  );
}

async function checkHeadingDollarFocus(page) {
  await resetEditor(page, '标题');
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type('$', { delay: 5 });
  await page.waitForTimeout(1000);
  await page.keyboard.type('x', { delay: 5 });
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    return {
      activeInsideProse: Boolean(
        document.activeElement && prose?.contains(document.activeElement),
      ),
      titleValue: document.querySelector('#markdown-title')?.value || '',
      proseText: prose?.textContent || '',
    };
  });

  assert(result.activeInsideProse, 'Typing $ in H1 should not lose Milkdown focus.', result);
  assert(result.titleValue === '标题$x', 'H1 title should sync unescaped dollar text.', result);
  assert(result.proseText === '标题$x', 'H1 text should continue after $.', result);
}

async function checkHeadingEnterCreatesParagraph(page) {
  await resetEditor(page, '标题回车测试');
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  await page.keyboard.type('正文', { delay: 5 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    return {
      activeInsideProse: Boolean(
        document.activeElement && prose?.contains(document.activeElement),
      ),
      h1Text: document.querySelector('.ProseMirror h1')?.textContent || '',
      paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (p) => p.textContent || '',
      ),
    };
  });

  assert(result.activeInsideProse, 'Pressing Enter after H1 should keep Milkdown focus.', result);
  assert(result.h1Text === '标题回车测试', 'H1 text should remain unchanged after Enter.', result);
  assert(
    result.paragraphTexts.includes('正文'),
    'Typing after H1 Enter should fill the new paragraph.',
    result,
  );
}

async function checkTypedHeadingEnterCreatesParagraph(page) {
  await resetEditor(page, '');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('# 手写标题', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  await page.keyboard.type('正文', { delay: 5 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    return {
      activeInsideProse: Boolean(
        document.activeElement && prose?.contains(document.activeElement),
      ),
      titleValue: document.querySelector('#markdown-title')?.value || '',
      h1Text: document.querySelector('.ProseMirror h1')?.textContent || '',
      paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (p) => p.textContent || '',
      ),
    };
  });

  assert(
    result.activeInsideProse,
    'Pressing Enter after a typed first-line H1 should keep Milkdown focus.',
    result,
  );
  assert(result.titleValue === '手写标题', 'Typed H1 should sync to the title field.', result);
  assert(result.h1Text === '手写标题', 'Typed H1 text should remain after Enter.', result);
  assert(
    result.paragraphTexts.includes('正文'),
    'Typing after a typed H1 Enter should fill the new paragraph.',
    result,
  );
}

async function checkNonFirstH1DemotesToH2(page) {
  await resetEditor(page, '非首行标题');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# aaa', { delay: 5 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => ({
    titleValue: document.querySelector('#markdown-title')?.value || '',
    h1Texts: Array.from(document.querySelectorAll('.ProseMirror h1')).map(
      (heading) => heading.textContent || '',
    ),
    h2Texts: Array.from(document.querySelectorAll('.ProseMirror h2')).map(
      (heading) => heading.textContent || '',
    ),
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(result.titleValue === '非首行标题', 'Non-first # heading should not change the title.', result);
  assert(
    result.h1Texts.length === 1 && result.h1Texts[0] === '非首行标题',
    'Only the first document line should remain H1.',
    result,
  );
  assert(result.h2Texts.includes('aaa'), 'Non-first "# " input should be demoted to H2.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('# aaa')),
    'Raw non-first H1 markdown should not remain in a paragraph.',
    result,
  );
}

async function checkRepeatedNonFirstH1DemotionIsFast(page) {
  await resetEditor(page, 'H1 降级压力测试');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');

  const samples = [];
  const headingCount = 60;
  for (let index = 1; index <= headingCount; index += 1) {
    const beforeH2Count = await page.locator('.ProseMirror h2').count();
    await page.keyboard.type('#');
    const start = Date.now();
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (count) => document.querySelectorAll('.ProseMirror h2').length > count,
      beforeH2Count,
      { timeout: 5000 },
    );
    samples.push(Date.now() - start);
    await page.keyboard.type(`标题 ${index}`, { delay: 2 });
    await page.keyboard.press('Enter');
    await page.keyboard.type(`正文 ${index}`, { delay: 2 });
    await page.keyboard.press('Enter');
  }

  const result = await page.evaluate(() => ({
    titleValue: document.querySelector('#markdown-title')?.value || '',
    h1Texts: Array.from(document.querySelectorAll('.ProseMirror h1')).map(
      (heading) => heading.textContent || '',
    ),
    h2Texts: Array.from(document.querySelectorAll('.ProseMirror h2')).map(
      (heading) => heading.textContent || '',
    ),
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(result.titleValue === 'H1 降级压力测试', 'Repeated non-first # input should not change title.', {
    result,
    samples,
  });
  assert(
    result.h1Texts.length === 1 && result.h1Texts[0] === 'H1 降级压力测试',
    'Repeated non-first # input should keep only the title as H1.',
    { result, samples },
  );
  assert(
    result.h2Texts.length === headingCount &&
      result.h2Texts.every((text, index) => text === `标题 ${index + 1}`),
    'Repeated non-first # input should create H2 headings directly.',
    { result, samples },
  );
  assert(
    Math.max(...samples) < 250,
    'Repeated non-first # input should not rely on delayed full-document replacement.',
    { result, samples },
  );
}

async function checkHeadingOneHiddenFromMenus(page) {
  await resetEditor(page, '菜单标题限制');
  await page.locator('.top-bar-heading-button').click();
  await page.waitForSelector('.top-bar-heading-dropdown', { timeout: 5000 });

  const topBarOptions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.top-bar-heading-option')).map(
      (option) => option.textContent?.trim() || '',
    ),
  );
  assert(!topBarOptions.includes('Heading 1'), 'Top bar heading menu should not show Heading 1.', {
    topBarOptions,
  });
  assert(topBarOptions.includes('Heading 2'), 'Top bar heading menu should still show Heading 2.', {
    topBarOptions,
  });

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/', { delay: 5 });
  await page.waitForSelector('.milkdown-slash-menu', { timeout: 5000 });
  await page.waitForTimeout(300);

  const slashItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.milkdown-slash-menu li')).map(
      (item) => item.textContent?.trim() || '',
    ),
  );
  assert(!slashItems.includes('Heading 1'), 'Slash/block menu should not show Heading 1.', {
    slashItems,
  });
  assert(slashItems.includes('Heading 2'), 'Slash/block menu should still show Heading 2.', {
    slashItems,
  });
  assert(!slashItems.includes('Math'), 'Slash/block menu should not expose Crepe default Math.', {
    slashItems,
  });
}

async function checkInlineFormulaEditing(page) {
  await resetEditor(page, '行内公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('inline $a_b+c^2$ text', { delay: 3 });
  await page.waitForTimeout(800);
  await page.locator('span[data-type="math_inline"]').click({ force: true });
  await page.waitForSelector('.milkdown-inline-math-popover input', {
    timeout: 5000,
  });
  await page.fill('.milkdown-inline-math-popover input', 'a_b+c^2+d');
  await page.locator('.milkdown-inline-math-popover button[type="submit"]').click();
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => ({
    inlineCount: document.querySelectorAll('span[data-type="math_inline"]').length,
    inlineValue:
      document.querySelector('span[data-type="math_inline"]')?.getAttribute('data-value') ||
      '',
    popoverCount: document.querySelectorAll('.milkdown-inline-math-popover').length,
  }));

  assert(result.inlineCount === 1, 'Inline formula should remain as one math node.', result);
  assert(result.inlineValue === 'a_b+c^2+d', 'Inline formula should update value.', result);
  assert(result.popoverCount === 0, 'Inline formula popover should close after submit.', result);
}

async function checkFormulaBlocksSeparatedByHeading(page) {
  await resetEditor(page, '公式标题间隔');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$a+b$$', { delay: 5 });
  await page.waitForTimeout(900);
  await page.keyboard.type('## Middle', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.keyboard.type('$$c+d$$', { delay: 5 });
  await page.waitForTimeout(1200);

  await page.locator('.rin-latex-block .preview').nth(0).click({ force: true });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });
  await page.locator('.rin-latex-block .preview').nth(1).click({ force: true });
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => ({
    headingText: document.querySelector('.ProseMirror h2')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    panelText:
      document.querySelector('.rin-latex-editor-panel .cm-content')?.textContent || '',
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (p) => p.textContent || '',
    ),
  }));

  assert(result.headingText === 'Middle', 'Heading between formula blocks should remain an H2.', result);
  assert(result.latexTexts.length === 2, 'Formula blocks should remain separate.', result);
  assert(result.latexTexts[0] === 'a+b', 'First formula block should keep its value.', result);
  assert(result.latexTexts[1] === 'c+d', 'Second formula block should keep its value.', result);
  assert(result.panelText === 'c+d', 'Switching formula blocks should open the second block.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$') || text.includes('\\$')),
    'Formula fences should not leak into paragraphs while switching blocks.',
    result,
  );
}

async function checkFormulaSubmitDoesNotInsertParagraphBeforeHeading(page) {
  await resetEditor(page, '公式后接标题');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$aaa$$', { delay: 5 });
  await page.waitForTimeout(900);
  await page.keyboard.type('## Next Heading', { delay: 5 });
  await page.waitForTimeout(900);

  await page.locator('.rin-latex-block .preview').first().click({ force: true });
  await page.waitForSelector('.rin-latex-editor-panel .cm-content', {
    timeout: 5000,
  });

  const afterClick = await page.evaluate(() => ({
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    blocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
      .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
      .map((block) => ({
        tag: block.tagName,
        latex: block.classList.contains('rin-latex-block'),
        placeholder: block.classList.contains('crepe-placeholder'),
        text: block.textContent || '',
      })),
  }));

  assert(afterClick.panelCount === 1, 'Clicking formula should open the formula editor.', afterClick);
  assert(afterClick.blocks.length === 3, 'Clicking formula should not insert document blocks.', afterClick);
  assert(afterClick.blocks[1]?.latex, 'Formula should remain before the heading after click.', afterClick);
  assert(afterClick.blocks[2]?.tag === 'H2', 'Heading should remain directly after formula.', afterClick);

  await completeDisplayFormula(page);
  await page.waitForTimeout(900);

  const afterSubmit = await page.evaluate(() => ({
    panelCount: document.querySelectorAll('.rin-latex-editor-panel').length,
    blocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
      .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
      .map((block) => ({
        tag: block.tagName,
        latex: block.classList.contains('rin-latex-block'),
        placeholder: block.classList.contains('crepe-placeholder'),
        text: block.textContent || '',
      })),
  }));

  assert(afterSubmit.panelCount === 0, 'Formula editor should close after clicking 完成.', afterSubmit);
  assert(
    afterSubmit.blocks.length === 3,
    'Submitting formula before a heading should not insert an empty paragraph.',
    afterSubmit,
  );
  assert(afterSubmit.blocks[1]?.latex, 'Formula should remain before heading after submit.', afterSubmit);
  assert(afterSubmit.blocks[2]?.tag === 'H2', 'Heading should remain directly after formula after submit.', afterSubmit);
  assert(
    !afterSubmit.blocks.some((block, index) => index > 0 && index < 2 && block.placeholder),
    'No placeholder paragraph should appear between formula and heading.',
    afterSubmit,
  );
}

async function checkHtmlBreakInputIsRemovedFromMarkdown(page) {
  await resetEditor(page, '纯净 Markdown');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('前文', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('<br />', { delay: 5 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.keyboard.type('后文', { delay: 5 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    return {
      proseText: prose?.textContent || '',
      paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (paragraph) => paragraph.textContent || '',
      ),
    };
  });

  assert(!result.proseText.includes('<br'), 'Literal html break tags should be removed from editor text.', result);
  assert(result.paragraphTexts.includes('前文'), 'Text before removed html break should remain.', result);
  assert(result.paragraphTexts.includes('后文'), 'Text after removed html break should remain.', result);
}

async function clickTopBarDisplayFormula(page) {
  const beforeLatexCount = await page.locator('.rin-latex-block').count();
  await page.locator('button.top-bar-item:has([data-rin-topbar-math="true"])').click();
  await page.waitForFunction(
    (count) => document.querySelectorAll('.rin-latex-block').length > count,
    beforeLatexCount,
    { timeout: 5000 },
  );
  const panel = page.locator('.rin-latex-editor-panel .cm-content');
  await panel.first().waitFor({ state: 'visible', timeout: 5000 });
}

async function checkConsecutiveTopBarFormulaBlocks(page) {
  await resetEditor(page, '顶栏连续公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('bbb', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    return {
      activeInsideProse: Boolean(
        document.activeElement && prose?.contains(document.activeElement),
      ),
      latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
        (block) => block.textContent || '',
      ),
      katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
      paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (paragraph) => paragraph.textContent || '',
      ),
      topBlocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
        .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
        .map((block) => ({
          tag: block.tagName,
          latex: block.classList.contains('rin-latex-block'),
          text: block.textContent || '',
        })),
    };
  });

  assert(result.activeInsideProse, 'Consecutive top bar formulas should keep Milkdown focus.', result);
  assert(
    result.latexTexts.length === 2 &&
      result.latexTexts[0] === 'aaa' &&
      result.latexTexts[1] === 'bbb',
    'Consecutive top bar formulas should create two separate LaTeX blocks.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Consecutive top bar formulas should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$')),
    'Consecutive top bar formulas should not leak raw "$" into paragraphs.',
    result,
  );
  assert(
    result.topBlocks.filter((block) => block.latex).length === 2,
    'Consecutive top bar formulas should remain as document code blocks.',
    result,
  );
}

async function checkTopBarFormulaSeparatedByHeading(page) {
  await resetEditor(page, '工具栏公式');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await page.keyboard.type('## Middle', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('bbb', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => ({
    headingText: document.querySelector('.ProseMirror h2')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(result.headingText === 'Middle', 'Top bar formula should keep the heading between formulas.', result);
  assert(result.latexTexts.length === 2, 'Top bar should create two separate formula blocks.', result);
  assert(result.latexTexts[0] === 'aaa', 'First top bar formula should keep its content.', result);
  assert(result.latexTexts[1] === 'bbb', 'Second top bar formula should keep its content.', result);
  assert(result.katexErrorCount === 0, 'Top bar formula flow should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$') || text.includes('Middle')),
    'Top bar formula flow should not leak formula fences or headings into paragraphs.',
    result,
  );
}

async function checkTopBarFormulaAfterTypedHeadingWithoutEnter(page) {
  await resetEditor(page, '工具栏公式未回车');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await page.keyboard.type('## aaa', { delay: 5 });
  await page.waitForTimeout(900);
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => ({
    headingText: document.querySelector('.ProseMirror h2')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    topBlocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
      .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
      .map((block) => ({
        tag: block.tagName,
        latex: block.classList.contains('rin-latex-block'),
        text: block.textContent || '',
      })),
  }));

  assert(result.headingText === 'aaa', 'Typed markdown H2 should remain between top bar formulas.', result);
  assert(result.latexTexts.length === 2, 'Exact top bar formula flow should create two formula blocks.', result);
  assert(
    result.latexTexts.every((text) => text === 'aaa'),
    'Both top bar formula blocks should keep their entered content.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Exact top bar formula flow should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$') || text.includes('##')),
    'Exact top bar formula flow should not leak formula fences or heading syntax into paragraphs.',
    result,
  );
  assert(
    result.topBlocks.some((block) => block.tag === 'H2' && block.text === 'aaa') &&
      result.topBlocks.filter((block) => block.latex).length === 2,
    'Document blocks should remain formula, heading, formula.',
    result,
  );
}

async function checkTopBarFormulaAfterTypedHeadingWithEnter(page) {
  await resetEditor(page, '工具栏公式回车后');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await page.keyboard.type('## aaa', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await clickTopBarDisplayFormula(page);

  const afterSecondClick = await page.evaluate(() => ({
    headingText: document.querySelector('.ProseMirror h2')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    topBlocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
      .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
      .map((block) => ({
        tag: block.tagName,
        latex: block.classList.contains('rin-latex-block'),
        text: block.textContent || '',
      })),
  }));

  assert(
    afterSecondClick.headingText === 'aaa',
    'The second top bar formula click must not absorb the preceding H2.',
    afterSecondClick,
  );
  assert(
    afterSecondClick.latexTexts.length === 2 &&
      afterSecondClick.latexTexts[0] === 'aaa' &&
      afterSecondClick.latexTexts[1] === '',
    'The second top bar formula click should create an empty formula block after the H2.',
    afterSecondClick,
  );
  assert(
    !afterSecondClick.latexTexts.some((text) => text.includes('#')),
    'No heading syntax should enter a LaTeX block immediately after top bar insertion.',
    afterSecondClick,
  );
  assert(
    !afterSecondClick.paragraphTexts.some((text) => text.includes('$') || text.includes('##')),
    'The second top bar formula click should not leak "$" or markdown heading syntax into paragraphs.',
    afterSecondClick,
  );
  assert(
    afterSecondClick.katexErrorCount === 0,
    'The second top bar formula click should not create KaTeX errors before typing.',
    afterSecondClick,
  );

  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => ({
    headingText: document.querySelector('.ProseMirror h2')?.textContent || '',
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    topBlocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
      .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
      .map((block) => ({
        tag: block.tagName,
        latex: block.classList.contains('rin-latex-block'),
        text: block.textContent || '',
      })),
  }));

  assert(result.headingText === 'aaa', 'Typed markdown H2 should remain after pressing Enter.', result);
  assert(result.latexTexts.length === 2, 'Top bar formula after heading Enter should create two formula blocks.', result);
  assert(
    result.latexTexts.every((text) => text === 'aaa'),
    'Heading text should not be absorbed into a formula block after pressing Enter.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Top bar formula after heading Enter should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$') || text.includes('##')),
    'Top bar formula after heading Enter should not leak "$" or markdown heading syntax into paragraphs.',
    result,
  );
  assert(
    result.topBlocks.some((block) => block.tag === 'H2' && block.text === 'aaa') &&
      result.topBlocks.filter((block) => block.latex).length === 2,
    'Document blocks should remain formula, heading, paragraph/formula after heading Enter.',
    result,
  );
}

async function checkTopBarFormulaAfterNonFirstH1Input(page) {
  await resetEditor(page, '工具栏公式 H1 降级');
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);
  await page.keyboard.type('# aaa', { delay: 5 });
  await page.waitForTimeout(1200);
  await clickTopBarDisplayFormula(page);
  await page.keyboard.type('aaa', { delay: 5 });
  await completeDisplayFormula(page);
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => ({
    titleValue: document.querySelector('#markdown-title')?.value || '',
    h1Texts: Array.from(document.querySelectorAll('.ProseMirror h1')).map(
      (heading) => heading.textContent || '',
    ),
    h2Texts: Array.from(document.querySelectorAll('.ProseMirror h2')).map(
      (heading) => heading.textContent || '',
    ),
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block .cm-content')).map(
      (block) => block.textContent || '',
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
    topBlocks: Array.from(document.querySelectorAll('.ProseMirror > *'))
      .filter((block) => !block.classList.contains('prosemirror-virtual-cursor'))
      .map((block) => ({
        tag: block.tagName,
        latex: block.classList.contains('rin-latex-block'),
        text: block.textContent || '',
      })),
  }));

  assert(result.titleValue === '工具栏公式 H1 降级', 'Non-first H1 input should not change title.', result);
  assert(
    result.h1Texts.length === 1 && result.h1Texts[0] === '工具栏公式 H1 降级',
    'Only the top title should remain H1 in the top bar formula flow.',
    result,
  );
  assert(result.h2Texts.includes('aaa'), 'Non-first "# aaa" should become H2 between formulas.', result);
  assert(result.latexTexts.length === 2, 'Top bar flow with demoted H1 should create two formula blocks.', result);
  assert(
    result.latexTexts.every((text) => text === 'aaa'),
    'Both formula blocks should keep their content when non-first H1 is demoted.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Demoted H1 top bar flow should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$') || text.includes('# aaa')),
    'Demoted H1 top bar flow should not leak formula fences or raw heading markdown.',
    result,
  );
  assert(
    result.topBlocks.some((block) => block.tag === 'H2' && block.text === 'aaa') &&
      result.topBlocks.filter((block) => block.latex).length === 2,
    'Document should keep formula, demoted heading, formula blocks.',
    result,
  );
}

async function checkLinearAttnPasteAndTopBarFormula(page) {
  const source = readLinearAttnMarkdown();
  const expectedTitle = firstMarkdownHeadingText(source);
  await resetEditor(page, '');
  await pastePlainTextIntoEditor(page, source);
  await revealFirstNonLatexCodeBlock(page);

  const afterPaste = await page.evaluate(() => ({
    titleValue: document.querySelector('#markdown-title')?.value || '',
    h1Texts: Array.from(document.querySelectorAll('.ProseMirror h1')).map(
      (heading) => heading.textContent || '',
    ),
    h2Texts: Array.from(document.querySelectorAll('.ProseMirror h2')).map(
      (heading) => heading.textContent || '',
    ),
    h3Texts: Array.from(document.querySelectorAll('.ProseMirror h3')).map(
      (heading) => heading.textContent || '',
    ),
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block')).map(
      (block) =>
        block.querySelector('.cm-content')?.textContent ||
        block.querySelector('.rin-latex-placeholder-preview')?.getAttribute('data-source') ||
        block.querySelector('.milkdown-code-block-placeholder code')?.textContent ||
        '',
    ),
    nonLatexCodeTexts: Array.from(document.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)')).map(
      (block) => {
        const lines = Array.from(block.querySelectorAll('.cm-line')).map(
          (line) => line.textContent || '',
        );
        return (
          (lines.length > 0 ? lines.join('\n') : '') ||
          block.querySelector('.cm-content')?.textContent ||
          block.querySelector('.milkdown-code-block-placeholder code')?.textContent ||
          ''
        );
      },
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    afterPaste.titleValue === expectedTitle,
    'Pasting linear-attn.md should sync its first H1 to the title field.',
    afterPaste,
  );
  assert(
    afterPaste.h1Texts.length === 1 &&
      afterPaste.h1Texts[0] === expectedTitle,
    'Pasting linear-attn.md should keep only the first markdown H1 as H1.',
    afterPaste,
  );
  assert(afterPaste.h2Texts.length >= 8, 'Pasting linear-attn.md should preserve H2 sections.', afterPaste);
  assert(afterPaste.h3Texts.length >= 3, 'Pasting linear-attn.md should preserve H3 sections.', afterPaste);
  assert(afterPaste.latexTexts.length >= 9, 'Pasting linear-attn.md should create LaTeX blocks.', afterPaste);
  assert(
    afterPaste.latexTexts.some((text) => text.includes('\\operatorname{softmax}')) &&
      afterPaste.latexTexts.some((text) => text.includes('M_t=')),
    'Pasting linear-attn.md should preserve early and late display formulas.',
    afterPaste,
  );
  assert(
    !afterPaste.latexTexts.some((text) => text.includes('##') || text.includes('```') || text.includes('# q, k')),
    'Pasting linear-attn.md should not absorb headings or code fences into LaTeX blocks.',
    afterPaste,
  );
  assert(
    afterPaste.nonLatexCodeTexts.some((text) => text.includes('# q, k:') && text.includes('cumsum')),
    'Pasting linear-attn.md should preserve the Python code fence as a non-LaTeX code block.',
    afterPaste,
  );
  assert(afterPaste.katexErrorCount === 0, 'Pasting linear-attn.md should not create KaTeX errors.', afterPaste);
  assert(
    !afterPaste.paragraphTexts.some((text) => text.includes('$$') || text.includes('\\$\\$')),
    'Pasting linear-attn.md should not leave raw display math fences in paragraphs.',
    afterPaste,
  );
}

async function typeMarkdownLineByLine(page, source) {
  await page.locator('.ProseMirror').click();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let fenceMarker = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    const opensFence = Boolean(fenceMatch && !fenceMarker);
    const closesFence = Boolean(
      fenceMatch &&
        fenceMarker &&
        fenceMatch[1][0] === fenceMarker[0] &&
        fenceMatch[1].length >= fenceMarker.length,
    );
    const codeBlockCountBefore = opensFence
      ? await page.locator('.milkdown-code-block:not(.rin-latex-block)').count()
      : 0;
    if (line) {
      await page.keyboard.type(line);
    }
    if (index < lines.length - 1) {
      await page.keyboard.press('Enter');
      if (opensFence) {
        fenceMarker = fenceMatch[1];
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)').length >
            count,
          codeBlockCountBefore,
          { timeout: 15000 },
        );
        await page.waitForFunction(
          () => {
            const active = document.activeElement;
            return Boolean(
              active instanceof HTMLElement &&
                active.classList.contains('cm-content') &&
                active.closest('.milkdown-code-block:not(.rin-latex-block)'),
            );
          },
          undefined,
          { timeout: 15000 },
        );
      } else if (closesFence) {
        fenceMarker = '';
        await page.waitForFunction(
          () => {
            const prose = document.querySelector('.ProseMirror');
            const active = document.activeElement;
            return Boolean(
              active instanceof HTMLElement &&
                prose?.contains(active) &&
                !active.closest('.milkdown-code-block'),
            );
          },
          undefined,
          { timeout: 5000 },
        );
      } else {
        await page.waitForTimeout(10);
      }
    }
  }
  await page.waitForTimeout(2500);
}

async function typeMarkdownLineByLineWithTopBarDisplayMath(page, source) {
  await page.locator('.ProseMirror').click();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let fenceMarker = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    const opensFence = Boolean(fenceMatch && !fenceMarker);
    const closesFence = Boolean(
      fenceMatch &&
        fenceMarker &&
        fenceMatch[1][0] === fenceMarker[0] &&
        fenceMatch[1].length >= fenceMarker.length,
    );
    const displayMathMatch = !fenceMarker ? /^\$\$([\s\S]*?)\$\$(.*)$/.exec(line) : null;
    const codeBlockCountBefore = opensFence
      ? await page.locator('.milkdown-code-block:not(.rin-latex-block)').count()
      : 0;

    if (displayMathMatch) {
      const formula = displayMathMatch[1] || '';
      const suffix = displayMathMatch[2] || '';
      await clickTopBarDisplayFormula(page);
      if (formula) {
        await page.keyboard.type(formula, { delay: 3 });
      }
      await completeDisplayFormula(page);
      await page.waitForTimeout(500);
      if (suffix) {
        await page.keyboard.type(suffix, { delay: 3 });
      }
      if (suffix && index < lines.length - 1) {
        await page.keyboard.press('Enter');
      }
      continue;
    }

    if (line) {
      await page.keyboard.type(line);
    }
    if (index < lines.length - 1) {
      await page.keyboard.press('Enter');
      if (opensFence) {
        fenceMarker = fenceMatch[1];
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)').length >
            count,
          codeBlockCountBefore,
          { timeout: 15000 },
        );
        await page.waitForFunction(
          () => {
            const active = document.activeElement;
            return Boolean(
              active instanceof HTMLElement &&
                active.classList.contains('cm-content') &&
                active.closest('.milkdown-code-block:not(.rin-latex-block)'),
            );
          },
          undefined,
          { timeout: 15000 },
        );
      } else if (closesFence) {
        fenceMarker = '';
        await page.waitForFunction(
          () => {
            const prose = document.querySelector('.ProseMirror');
            const active = document.activeElement;
            return Boolean(
              active instanceof HTMLElement &&
                prose?.contains(active) &&
                !active.closest('.milkdown-code-block'),
            );
          },
          undefined,
          { timeout: 5000 },
        );
      } else {
        await page.waitForTimeout(10);
      }
    }
  }
  await page.waitForTimeout(2500);
}

async function checkLinearAttnManualInput(page) {
  const source = readLinearAttnMarkdown();
  const expectedTitle = firstMarkdownHeadingText(source);
  await resetEditor(page, '');
  await typeMarkdownLineByLine(page, source);
  await revealFirstNonLatexCodeBlock(page);

  const result = await page.evaluate(() => ({
    titleValue: document.querySelector('#markdown-title')?.value || '',
    h1Texts: Array.from(document.querySelectorAll('.ProseMirror h1')).map(
      (heading) => heading.textContent || '',
    ),
    h2Texts: Array.from(document.querySelectorAll('.ProseMirror h2')).map(
      (heading) => heading.textContent || '',
    ),
    h3Texts: Array.from(document.querySelectorAll('.ProseMirror h3')).map(
      (heading) => heading.textContent || '',
    ),
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block')).map(
      (block) =>
        block.querySelector('.cm-content')?.textContent ||
        block.querySelector('.rin-latex-placeholder-preview')?.getAttribute('data-source') ||
        block.querySelector('.milkdown-code-block-placeholder code')?.textContent ||
        '',
    ),
    nonLatexCodeTexts: Array.from(document.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)')).map(
      (block) => {
        const lines = Array.from(block.querySelectorAll('.cm-line')).map(
          (line) => line.textContent || '',
        );
        return (
          (lines.length > 0 ? lines.join('\n') : '') ||
          block.querySelector('.cm-content')?.textContent ||
          block.querySelector('.milkdown-code-block-placeholder code')?.textContent ||
          ''
        );
      },
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    result.titleValue === expectedTitle,
    'Typing linear-attn.md should sync its first H1 to the title field.',
    result,
  );
  assert(
    result.h1Texts.length === 1 &&
      result.h1Texts[0] === expectedTitle,
    'Typing linear-attn.md should keep only the first markdown H1 as H1.',
    result,
  );
  assert(result.h2Texts.length >= 8, 'Typing linear-attn.md should preserve H2 sections.', result);
  assert(result.h3Texts.length >= 3, 'Typing linear-attn.md should preserve H3 sections.', result);
  assert(result.h2Texts.includes('6. 从“累加”走向“遗忘与改写”'), 'Typing should exit the Python code fence before section 6.', result);
  assert(result.h2Texts.includes('8. 近期相关架构（截至 2026-07）'), 'Typing should preserve the final H2 after the code fence.', result);
  assert(result.latexTexts.length >= 9, 'Typing linear-attn.md should create LaTeX blocks.', result);
  assert(
    result.latexTexts.some((text) => text.includes('\\operatorname{softmax}')) &&
      result.latexTexts.some((text) => text.includes('M_t=')),
    'Typing linear-attn.md should preserve early and late display formulas.',
    result,
  );
  assert(
    !result.latexTexts.some((text) => text.includes('##') || text.includes('```') || text.includes('# q, k')),
    'Typing linear-attn.md should not absorb headings or code fences into LaTeX blocks.',
    result,
  );
  assert(
    result.nonLatexCodeTexts.some((text) => text.includes('# q, k:') && text.includes('cumsum')),
    'Typing linear-attn.md should preserve the Python code fence as a non-LaTeX code block.',
    result,
  );
  assert(
    !result.nonLatexCodeTexts.some((text) => text.includes('## 6.') || text.includes('## 8.')),
    'Typing linear-attn.md should not leave later sections inside the Python code block.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Typing linear-attn.md should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$') || text.includes('\\$\\$')),
    'Typing linear-attn.md should not leave raw display math fences in paragraphs.',
    result,
  );
}

async function checkLinearAttnManualTopBarFormulaInput(page) {
  const source = readLinearAttnMarkdown();
  const expectedTitle = firstMarkdownHeadingText(source);
  await resetEditor(page, '');
  await typeMarkdownLineByLineWithTopBarDisplayMath(page, source);
  await revealFirstNonLatexCodeBlock(page);

  const result = await page.evaluate(() => ({
    titleValue: document.querySelector('#markdown-title')?.value || '',
    h1Texts: Array.from(document.querySelectorAll('.ProseMirror h1')).map(
      (heading) => heading.textContent || '',
    ),
    h2Texts: Array.from(document.querySelectorAll('.ProseMirror h2')).map(
      (heading) => heading.textContent || '',
    ),
    h3Texts: Array.from(document.querySelectorAll('.ProseMirror h3')).map(
      (heading) => heading.textContent || '',
    ),
    latexTexts: Array.from(document.querySelectorAll('.rin-latex-block')).map(
      (block) =>
        block.querySelector('.cm-content')?.textContent ||
        block.querySelector('.rin-latex-placeholder-preview')?.getAttribute('data-source') ||
        block.querySelector('.milkdown-code-block-placeholder code')?.textContent ||
        '',
    ),
    nonLatexCodeTexts: Array.from(document.querySelectorAll('.milkdown-code-block:not(.rin-latex-block)')).map(
      (block) => {
        const lines = Array.from(block.querySelectorAll('.cm-line')).map(
          (line) => line.textContent || '',
        );
        return (
          (lines.length > 0 ? lines.join('\n') : '') ||
          block.querySelector('.cm-content')?.textContent ||
          block.querySelector('.milkdown-code-block-placeholder code')?.textContent ||
          ''
        );
      },
    ),
    katexErrorCount: document.querySelectorAll('.rin-latex-block .katex-error').length,
    paragraphTexts: Array.from(document.querySelectorAll('.ProseMirror p')).map(
      (paragraph) => paragraph.textContent || '',
    ),
  }));

  assert(
    result.titleValue === expectedTitle,
    'Typing linear-attn.md with top bar formulas should sync its first H1 to the title field.',
    result,
  );
  assert(
    result.h1Texts.length === 1 &&
      result.h1Texts[0] === expectedTitle,
    'Typing linear-attn.md with top bar formulas should keep only the first markdown H1 as H1.',
    result,
  );
  assert(result.h2Texts.length >= 8, 'Top bar formula typing should preserve H2 sections.', result);
  assert(result.h3Texts.length >= 3, 'Top bar formula typing should preserve H3 sections.', result);
  assert(
    result.h2Texts.includes('6. 从“累加”走向“遗忘与改写”') &&
      result.h2Texts.includes('8. 近期相关架构（截至 2026-07）'),
    'Top bar formula typing should preserve later sections after the Python code fence.',
    result,
  );
  assert(result.latexTexts.length >= 9, 'Top bar formula typing should create LaTeX blocks.', result);
  assert(
    result.latexTexts.some((text) => text.includes('\\operatorname{softmax}')) &&
      result.latexTexts.some((text) => text.includes('M_t=')),
    'Top bar formula typing should preserve early and late display formulas.',
    result,
  );
  assert(
    !result.latexTexts.some((text) => text.includes('##') || text.includes('```') || text.includes('# q, k')),
    'Top bar formula typing should not absorb headings or code fences into LaTeX blocks.',
    result,
  );
  assert(
    result.nonLatexCodeTexts.some((text) => text.includes('# q, k:') && text.includes('cumsum')),
    'Top bar formula typing should preserve the Python code fence as a non-LaTeX code block.',
    result,
  );
  assert(
    !result.nonLatexCodeTexts.some((text) => text.includes('## 6.') || text.includes('## 8.')),
    'Top bar formula typing should not leave later sections inside the Python code block.',
    result,
  );
  assert(result.katexErrorCount === 0, 'Top bar formula typing should not create KaTeX errors.', result);
  assert(
    !result.paragraphTexts.some((text) => text.includes('$$') || text.includes('\\$\\$')),
    'Top bar formula typing should not leave raw display math fences in paragraphs.',
    result,
  );
}

async function checkTableAfterArticleSourceKeepsFocus(page) {
  await resetEditor(page, '');
  await pastePlainTextIntoEditor(page, tableAfterArticleSource);
  await page.locator('.ProseMirror p', { hasText: "让我测试rang'wo" }).last().click();
  await page.keyboard.press('End');

  const samples = [];
  const typed = 'rangwoceshi1234567890';
  for (const char of typed) {
    await page.keyboard.type(char, { delay: 15 });
    await page.waitForTimeout(300);
    samples.push(await page.evaluate(() => {
      const active = document.activeElement;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const anchorElement =
        anchor instanceof Element ? anchor : anchor?.parentElement;
      const paragraphTexts = Array.from(document.querySelectorAll('.ProseMirror p')).map(
        (paragraph) => paragraph.textContent || '',
      );
      return {
        activeInsideEditor: Boolean(
          active?.closest?.('.ProseMirror') || active?.classList?.contains('ProseMirror'),
        ),
        selectionInsideEditor: Boolean(anchorElement?.closest('.ProseMirror')),
        tableCount: document.querySelectorAll('.ProseMirror table').length,
        lastParagraph: paragraphTexts[paragraphTexts.length - 1] || '',
      };
    }));
  }

  const finalText = `让我测试rang'wo${typed}`;
  assert(
    samples.every((sample) => sample.activeInsideEditor && sample.selectionInsideEditor),
    'Typing after the article table should keep focus in Milkdown.',
    samples,
  );
  assert(
    samples.every((sample) => sample.tableCount >= 1),
    'Article source should render a table while testing post-table typing.',
    samples,
  );
  assert(
    samples[samples.length - 1]?.lastParagraph === finalText,
    'Typing after the article table should append all characters to the trailing paragraph.',
    samples,
  );

  await page.evaluate(() => {
    const prose = document.querySelector('.ProseMirror');
    if (!prose) throw new Error('Missing ProseMirror editor for mutation trace.');
    window.__rinTableAfterInputTrace = [];
    new MutationObserver((mutations) => {
      window.__rinTableAfterInputTrace.push({
        childList: mutations.filter((mutation) => mutation.type === 'childList').length,
        characterData: mutations.filter((mutation) => mutation.type === 'characterData').length,
        lastParagraph:
          Array.from(document.querySelectorAll('.ProseMirror p')).at(-1)?.textContent || '',
      });
    }).observe(prose, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.keyboard.insertText('中文输入测试');
  await page.waitForTimeout(800);
  const chineseResult = await page.evaluate(() => {
    const active = document.activeElement;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const anchorElement =
      anchor instanceof Element ? anchor : anchor?.parentElement;
    return {
      activeInsideEditor: Boolean(
        active?.closest?.('.ProseMirror') || active?.classList?.contains('ProseMirror'),
      ),
      selectionInsideEditor: Boolean(anchorElement?.closest('.ProseMirror')),
      trace: window.__rinTableAfterInputTrace || [],
      lastParagraph:
        Array.from(document.querySelectorAll('.ProseMirror p')).at(-1)?.textContent || '',
    };
  });
  assert(
    chineseResult.activeInsideEditor && chineseResult.selectionInsideEditor,
    'Chinese input after the article table should keep focus in Milkdown.',
    chineseResult,
  );
  assert(
    !chineseResult.trace.some((entry) => entry.childList > 0),
    'Chinese input after the article table should not trigger whole-document DOM replacement.',
    chineseResult,
  );
  assert(
    chineseResult.lastParagraph === `${finalText}中文输入测试`,
    'Chinese input after the article table should append to the trailing paragraph.',
    chineseResult,
  );
}

async function main() {
  if (process.argv.includes('--check-inputs')) {
    const source = readLinearAttnMarkdown();
    console.log(JSON.stringify({
      kind: 'markdown-math-test-input',
      input: path.relative(path.resolve(__dirname, '..'), linearAttnPath),
      title: firstMarkdownHeadingText(source),
      bytes: Buffer.byteLength(source),
    }));
    return;
  }
  if (process.argv.includes('--isolated')) checkedFixtureOrigin(targetUrl);
  const browser = await chromium.launch({
    headless,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  });
  try {
    const { page, unexpectedMessages, blockedRequests } = await setupPage(browser);
    const checks = [
      checkMilkdownBlockMathShortcutCreatesLatex,
      checkEnterDisplayMathShortcutOpensLatex,
      checkTypedSingleLineDisplayMathCreatesLatex,
      checkTypedFourDollarDisplayMathOpensLatex,
      checkFourDollarAfterCompletedFormulaKeepsPreviousBlock,
      checkDeleteDeletesDisplayMathBlock,
      checkTypedDisplayMathThenBlankThenDisplayMath,
      checkBackspaceDeletesBlankParagraphAfterDisplayMath,
      checkLatexPanelStripsWrappedDisplayMath,
      checkConsecutiveTopBarFormulaBlocks,
      checkHeadingDollarFocus,
      checkHeadingEnterCreatesParagraph,
      checkTypedHeadingEnterCreatesParagraph,
      checkNonFirstH1DemotesToH2,
      checkRepeatedNonFirstH1DemotionIsFast,
      checkHeadingOneHiddenFromMenus,
      checkInlineFormulaEditing,
      checkTopBarFormulaSeparatedByHeading,
      checkTopBarFormulaAfterTypedHeadingWithoutEnter,
      checkTopBarFormulaAfterTypedHeadingWithEnter,
      checkLinearAttnPasteAndTopBarFormula,
      checkTableAfterArticleSourceKeepsFocus,
      checkLinearAttnManualTopBarFormulaInput,
      checkLinearAttnManualInput,
    ];
    for (const check of checks) {
      console.log(`Markdown math check: ${check.name}`);
      await check(page);
    }

    assert(
      unexpectedMessages.length === 0,
      'Unexpected browser console messages were emitted.',
      unexpectedMessages,
    );
    assert(blockedRequests.length === 0, 'Unexpected requests escaped the editor fixture.', blockedRequests);
    console.log(`Markdown math editor checks passed: ${targetUrl}`);
  } finally {
    await browser.close();
  }
}

module.exports = { linearAttnPath, readLinearAttnMarkdown, firstMarkdownHeadingText, tableAfterArticleSource };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

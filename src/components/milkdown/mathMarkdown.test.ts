import { describe, expect, it } from 'vitest';

import {
  markdownMathForMilkdown,
  shouldPasteClipboardAsMarkdown,
} from './mathMarkdown';

const vscodeHTML = `
  <div style="color: #cccccc; background-color: #1f1f1f; font-family: Consolas, 'Courier New', monospace; white-space: pre;">
    <div><span style="color: #569cd6;"># 标题</span></div>
  </div>
`;

describe('Milkdown clipboard normalization', () => {
  it('leaves VS Code syntax-highlighted clipboard data to the package code-paste handler', () => {
    expect(shouldPasteClipboardAsMarkdown('# This stays source code\nconst answer = 42;', vscodeHTML)).toBe(false);
  });

  it('keeps ordinary rich web content on the native HTML paste path', () => {
    expect(shouldPasteClipboardAsMarkdown('标题\n正文', '<h1>标题</h1><p>正文</p>')).toBe(false);
  });

  it('continues to parse math-only plain-text clipboard content as Markdown', () => {
    expect(shouldPasteClipboardAsMarkdown('令 $x = 1$', '')).toBe(true);
  });

  it('does not reinterpret source containing backticks as math Markdown', () => {
    const source = 'const snippet = `value`;';
    expect(markdownMathForMilkdown(source)).toBe(source);
    expect(shouldPasteClipboardAsMarkdown(source, vscodeHTML)).toBe(false);
  });
});

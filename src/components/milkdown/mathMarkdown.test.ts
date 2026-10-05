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
  it('prefers plain Markdown over VS Code syntax-highlighted HTML', () => {
    expect(shouldPasteClipboardAsMarkdown('# 标题\n\n正文', vscodeHTML)).toBe(true);
  });

  it('keeps ordinary rich web content on the native HTML paste path', () => {
    expect(shouldPasteClipboardAsMarkdown('标题\n正文', '<h1>标题</h1><p>正文</p>')).toBe(false);
  });

  it('continues to parse math-only plain-text clipboard content as Markdown', () => {
    expect(shouldPasteClipboardAsMarkdown('令 $x = 1$', '')).toBe(true);
  });

  it('preserves explicit fenced code blocks while normalizing Markdown', () => {
    const fenced = '```ts\nconst answer = 42;\n```';
    expect(markdownMathForMilkdown(fenced)).toBe(fenced);
    expect(shouldPasteClipboardAsMarkdown(fenced, vscodeHTML)).toBe(true);
  });
});

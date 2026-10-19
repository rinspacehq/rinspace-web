import { describe, expect, it } from 'vitest';

import { addLineNumbersToHighlightedCode } from './rinCodeHighlight';

describe('reader code decoration preserves native renderer HTML', () => {
  it('does not flatten Typst token colors or native line breaks', () => {
    const code = document.createElement('code');
    code.innerHTML = '<span style="color: #d73948">let</span> x = 42;<br><span style="color: #b60157">42</span>';
    const before = code.innerHTML;
    addLineNumbersToHighlightedCode(code);
    addLineNumbersToHighlightedCode(code);
    expect(code.innerHTML).toBe(before);
  });

  it('keeps links and other already-rendered inline markup intact', () => {
    const code = document.createElement('code');
    code.innerHTML = '<a href="#definition">token</a>\n<em>another token</em>';
    const before = code.innerHTML;
    addLineNumbersToHighlightedCode(code);
    expect(code.innerHTML).toBe(before);
  });

  it('still numbers plain-text code idempotently', () => {
    const code = document.createElement('code');
    code.textContent = 'first\nsecond';
    addLineNumbersToHighlightedCode(code);
    expect(Array.from(code.querySelectorAll('.rin-code-line-number')).map(node => node.textContent)).toEqual(['1', '2']);
    const before = code.innerHTML;
    addLineNumbersToHighlightedCode(code);
    expect(code.innerHTML).toBe(before);
  });

  it('still decorates explicit Shiki lines without changing colored tokens', () => {
    const code = document.createElement('code');
    code.innerHTML = '<span class="line"><span style="color: #d73948">let</span> x = 42;</span>';
    addLineNumbersToHighlightedCode(code);
    expect(code.querySelector('.rin-code-line-number')?.textContent).toBe('1');
    expect(code.querySelector('.rin-code-line-content span')?.getAttribute('style')).toBe('color: #d73948');
    const before = code.innerHTML;
    addLineNumbersToHighlightedCode(code);
    expect(code.innerHTML).toBe(before);
  });
});

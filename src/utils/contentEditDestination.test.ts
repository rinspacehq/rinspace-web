import { describe, expect, it } from 'vitest';

import { contentEditDestination } from './contentEditDestination';

describe('contentEditDestination', () => {
  it.each([
    ['markdown article', { type: 'blog', editor: 'markdown' }, 'markdown-article'],
    ['LaTeX article', { type: 'blog', editor: 'rin' }, 'quick-edit'],
    ['Typst article', { type: 'blog', editor: 'typst' }, 'quick-edit'],
    ['LaTeX book', { type: 'book', book: { kind: 'original' } }, 'book-workspace'],
    ['Markdown book', { type: 'book', book: { kind: 'markdown' } }, 'book-workspace'],
    ['Typst book', { type: 'book', book: { kind: 'typst' } }, 'book-workspace'],
    ['PDF book', { type: 'book', book: { kind: 'original', pdfUrl: '/book.pdf' } }, 'quick-edit'],
    ['external book', { type: 'book', book: { kind: 'copyrighted' } }, 'legacy-book-editor'],
  ] as const)('routes %s to %s', (_label, item, expected) => {
    expect(contentEditDestination(item)).toBe(expected);
  });
});

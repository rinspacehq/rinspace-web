import { expect, test } from 'vitest';
import { markdownCatalogTitle, parseMarkdownCatalog } from './markdownCatalog';

test('main.md defines chapter order and hierarchy without rendering itself', () => {
  expect(parseMarkdownCatalog('- introduction.md\n- 章节一.md\n  - sections/child.md\n')).toEqual([
    { path: 'introduction.md', depth: 1 }, { path: '章节一.md', depth: 1 }, { path: 'sections/child.md', depth: 2 },
  ]);
});

test('a single leading book title does not add a chapter or change hierarchy', () => {
  const entries = [{ path: 'intro.md', depth: 1 }, { path: 'child.md', depth: 2 }];
  for (const source of ['# 书名\n\n- intro.md\n  - child.md\n', '\r\n# 书名\r\n\r\n- intro.md\r\n  - child.md\r\n']) {
    expect(parseMarkdownCatalog(source)).toEqual(entries);
    expect(markdownCatalogTitle(source)).toBe('书名');
  }
  expect(markdownCatalogTitle('- intro.md')).toBe('');
});

test('rejects old formats, self references, traversal, duplicates and broken nesting', () => {
  for (const catalog of ['', '# Book', '# \n- a.md', '# One\n# Two\n- a.md', '- a.md\n# Late', '## Title\n- a.md', '# Book\nBody\n- a.md', '# Book\tName\n- a.md', '{"files":[]}', '- main.md', '- ../a.md', '- a.md\n- a.md', '  - a.md', '- a.md\n    - b.md', '- a.md\n\t- b.md', '- .git/a.md', '- [Chapter](a.md)']) {
    expect(() => parseMarkdownCatalog(catalog)).toThrow();
  }
});

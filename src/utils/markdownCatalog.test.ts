import { expect, test } from 'vitest';
import { parseMarkdownCatalog } from './markdownCatalog';

test('main.md defines chapter order and hierarchy without rendering itself', () => {
  expect(parseMarkdownCatalog('- introduction.md\n- 章节一.md\n  - sections/child.md\n')).toEqual([
    { path: 'introduction.md', depth: 1 }, { path: '章节一.md', depth: 1 }, { path: 'sections/child.md', depth: 2 },
  ]);
});

test('rejects old formats, self references, traversal, duplicates and broken nesting', () => {
  for (const catalog of ['', '# Book', '{"files":[]}', '- main.md', '- ../a.md', '- a.md\n- a.md', '  - a.md', '- a.md\n    - b.md', '- a.md\n\t- b.md', '- .git/a.md', '- [Chapter](a.md)']) {
    expect(() => parseMarkdownCatalog(catalog)).toThrow();
  }
});

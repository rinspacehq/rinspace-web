import {
  diagramIdFromImageUrl,
  isRepositoryQuiverImageUrl,
  normalizeQuiverImages,
  tikzcdDiagramSourceText,
} from './quiver';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
  not: {
    toContain(expected: string): void;
  };
};

const quiverCode = 'WzAsMixbMCwwLCJBIl0sWzEsMCwiQiJdLFswLDFdXQ==';

test('extracts diagram id from rin diagram image urls', () => {
  expect(diagramIdFromImageUrl('/rin/api/diagrams/example')).toBe('example');
  expect(diagramIdFromImageUrl('https://rinspace.com/rin/api/diagrams/example.svg')).toBe('example');
  expect(diagramIdFromImageUrl('assets/quiver/repository-example.svg')).toBe('repository-example');
  expect(diagramIdFromImageUrl('blob:https://rinspace.com/example#rin-repository-path=assets%2Fquiver%2Frepository-example.svg')).toBe('repository-example');
  expect(isRepositoryQuiverImageUrl('assets/quiver/repository-example.svg')).toBe(true);
  expect(isRepositoryQuiverImageUrl('blob:https://rinspace.com/example#rin-repository-path=assets%2Fquiver%2Frepository-example.svg')).toBe(true);
  expect(isRepositoryQuiverImageUrl('/rin/api/diagrams/example')).toBe(false);
});

test('builds tikzcd source text from stored diagram source', () => {
  expect(tikzcdDiagramSourceText({
    body: 'A \\arrow[r] & B',
    options: 'column sep=large',
  })).toBe('\\begin{tikzcd}[column sep=large]\nA \\arrow[r] & B\n\\end{tikzcd}');
});

test('strips old quiver metadata comments from saved markdown', () => {
  const upgraded = normalizeQuiverImages(
    [
      `<!-- rin-quiver url="https://rinspace.com/quiver/#q=${quiverCode}" type="tikzcd" -->`,
      `![${quiverCode}](/rin/api/diagrams/example)`,
    ].join('\n'),
  );
  expect(upgraded).toBe('![Quiver diagram](/rin/api/diagrams/example)');

  const labelled = normalizeQuiverImages('![Quiver diagram](/rin/api/diagrams/example)');
  expect(labelled).toBe('![Quiver diagram](/rin/api/diagrams/example)');
});

test('normalizes milkdown quiver image caption into markdown alt text', () => {
  const normalized = normalizeQuiverImages('![1.00](/rin/api/diagrams/example "你好")');

  expect(normalized).toBe('![你好](/rin/api/diagrams/example)');
});

import {
  defaultProject,
  slugify,
  sourceOnlyProject,
} from './rinWriter';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
  not: {
    toContain(expected: string): void;
  };
};

function mainFileBody(project: ReturnType<typeof sourceOnlyProject>) {
  return project.files?.find((file) => file.path === project.mainFile)?.body || '';
}

test('sourceOnlyProject keeps wiki source exact without default template injection', () => {
  const source = '\\section*{定义}\\n这里是正文。';
  const body = mainFileBody(sourceOnlyProject('层', source));

  expect(body).toBe(source);
  expect(body).not.toContain('\\documentclass{article}');
  expect(body).not.toContain('\\input{sections/intro}');
  expect(body).not.toContain('\\bibliography{refs}');
});

test('defaultProject still wraps partial source for regular Rin writing', () => {
  const body = mainFileBody(defaultProject('文章', '\\section{Intro}'));

  expect(body).toContain('\\documentclass{article}');
  expect(body).toContain('\\section{Intro}');
  expect(body).toContain('\\end{document}');
});

test('slugify folds Latin diacritics before building slugs', () => {
  expect(slugify('Néron-Severi group')).toBe('neron-severi-group');
});

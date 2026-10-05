import {
  articleGiteaSourcePath,
  canonicalGiteaPathname,
  giteaPath,
  normalizeGiteaBasePath,
  safeGiteaRedirectPath,
} from './giteaPaths';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
};

test('normalizes one-segment Gitea base paths', () => {
  expect(normalizeGiteaBasePath('/repos')).toBe('/repos/');
  expect(normalizeGiteaBasePath('/git/')).toBe('/git/');
  expect(normalizeGiteaBasePath('//outside')).toBe('');
  expect(normalizeGiteaBasePath('/repos/nested')).toBe('');
});

test('canonicalizes both supported Gitea prefixes', () => {
  expect(canonicalGiteaPathname('/git/a/163', '/repos/')).toBe('/repos/a/163');
  expect(canonicalGiteaPathname('/repos/b/160', '/git/')).toBe('/git/b/160');
  expect(canonicalGiteaPathname('/uploads/source.tex', '/repos/')).toBe('');
});

test('links article source to its canonical standalone repository', () => {
  expect(articleGiteaSourcePath(269)).toBe('/repos/a/269/src/branch/main');
});

test('builds standalone article and tag repository paths', () => {
  expect(giteaPath('a', 269)).toBe('/repos/a/269');
  expect(giteaPath('tags', 42)).toBe('/repos/tags/42');
});

test('keeps redirects same-origin and canonical', () => {
  expect(safeGiteaRedirectPath('/git/a/163?tab=1', '/repos/')).toBe('/repos/a/163?tab=1');
  expect(safeGiteaRedirectPath('https://outside.test/path', '/repos/')).toBe('/repos/');
  expect(safeGiteaRedirectPath('//outside.test/path', '/repos/')).toBe('/repos/');
  expect(safeGiteaRedirectPath('/uploads/file', '/repos/')).toBe('/repos/');
  expect(safeGiteaRedirectPath('/git/%2e%2e/admin', '/repos/')).toBe('/repos/');
  expect(safeGiteaRedirectPath('/git/%252e%252e/admin', '/repos/')).toBe('/repos/');
  expect(safeGiteaRedirectPath('/git/a%2fb/repo', '/repos/')).toBe('/repos/');
  expect(safeGiteaRedirectPath('/git/a%255cb/repo', '/repos/')).toBe('/repos/');
});

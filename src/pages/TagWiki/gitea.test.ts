import { describe, expect, it } from 'vitest';
import { tagWikiGiteaHistoryPath, tagWikiGiteaSourcePath } from './gitea';

describe('tag Wiki repository authority', () => {
  it('uses the independent repository, never the obsolete shared source folder', () => {
    const tag = { id: 42, tagId: '42', slugName: 'renamed', wikiSourceFile: { filename: '42-old-name/main.tex' } };
    expect(tagWikiGiteaSourcePath(tag)).toBe('/repos/tags/42/src/branch/main');
    expect(tagWikiGiteaHistoryPath(tag)).toBe('/repos/tags/42/commits/branch/main');
  });

  it('pins source and history to the publication actually being read', () => {
    const sourceCommit = 'a'.repeat(40);
    const tag = { id: 400, wikiPublication: { repositoryOwner: 'tags', repositoryName: '42', sourceCommit, entrypoint: 'sections/main.tex' } };
    expect(tagWikiGiteaSourcePath(tag)).toBe(`/repos/tags/42/src/commit/${sourceCommit}/sections/main.tex`);
    expect(tagWikiGiteaHistoryPath(tag)).toBe(`/repos/tags/42/commits/commit/${sourceCommit}`);
  });

  it('does not guess repository identity from a slug', () => {
    expect(tagWikiGiteaSourcePath('abelian-variety')).toBe('');
    expect(tagWikiGiteaHistoryPath('42')).toBe('/repos/tags/42/commits/branch/main');
  });

  it.each(['../main.tex', '/main.tex', 'sections//main.tex', 'main\\evil.tex'])('rejects unsafe publication source %s', (entrypoint) => {
    const tag = { id: 42, wikiPublication: { repositoryOwner: 'tags', repositoryName: '42', sourceCommit: 'a'.repeat(40), entrypoint } };
    expect(tagWikiGiteaSourcePath(tag)).toBe('');
  });
});

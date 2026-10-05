import { afterEach, expect, test, vi } from 'vitest';
import type { PostDetail } from './feed';
import { syncGiteaSession } from './gitea';
import { loadMarkdownEditorSource } from './markdownEditorSource';

vi.mock('./gitea', () => ({ syncGiteaSession: vi.fn().mockResolvedValue(true) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const commit = 'a'.repeat(40);
const post = {
  id: '345', body: '[[RIN_MARKDOWN_SOURCE]]Old source[[/RIN_MARKDOWN_SOURCE]]',
  repositorySource: { commit, entrypoint: 'content.md', url: `/repos/a/345/raw/commit/${commit}/content.md` },
} as PostDetail;

test('loads the exact repository source instead of stale embedded Markdown', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('# New pushed source', { headers: { 'Content-Type': 'text/plain' } }));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadMarkdownEditorSource(post)).toBe('# New pushed source');
  expect(syncGiteaSession).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith(post.repositorySource!.url, { redirect: 'error' });
});

test('loads a Markdown Book source from its exact book repository commit', async () => {
  const book = {
    ...post,
    type: 'book',
    repositorySource: { commit, entrypoint: 'main.md', url: `/repos/b/345/raw/commit/${commit}/main.md` },
  } as PostDetail;
  const fetcher = vi.fn().mockResolvedValue(new Response('# Book source', { headers: { 'Content-Type': 'text/plain' } }));
  vi.stubGlobal('fetch', fetcher);

  expect(await loadMarkdownEditorSource(book)).toBe('# Book source');
  expect(fetcher).toHaveBeenCalledWith(book.repositorySource!.url, { redirect: 'error' });
});

test('never falls back to stale source when repository delivery fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
  await expect(loadMarkdownEditorSource(post)).rejects.toThrow('could not be loaded');
});

test('rejects foreign or traversing repository references before session synchronization', async () => {
  await expect(loadMarkdownEditorSource({ ...post, repositorySource: { ...post.repositorySource!, url: 'https://example.org/source.md' } })).rejects.toThrow('Invalid repository');
  expect(syncGiteaSession).not.toHaveBeenCalled();
});

test('retains embedded source for a legacy article without a repository binding', async () => {
  expect(await loadMarkdownEditorSource({ ...post, repositorySource: undefined })).toBe('Old source');
  expect(syncGiteaSession).not.toHaveBeenCalled();
});

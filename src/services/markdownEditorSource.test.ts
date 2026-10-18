import { afterEach, expect, test, vi } from 'vitest';
import type { PostDetail } from './feed';
import { syncGiteaSession } from './gitea';
import { loadMarkdownEditorSource } from './markdownEditorSource';
import { markdownBookProjectFromBody } from '@/utils/markdownBook';
import { webcrypto } from 'node:crypto';

vi.mock('./gitea', () => ({ syncGiteaSession: vi.fn().mockResolvedValue(true) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const commit = 'a'.repeat(40);
const post = {
  id: '345', title: 'Book', body: '[[RIN_MARKDOWN_SOURCE]]Old source[[/RIN_MARKDOWN_SOURCE]]',
  repositorySource: { commit, entrypoint: 'main.md', url: `/repos/a/345/raw/commit/${commit}/main.md` },
} as PostDetail;

test('loads the exact repository source instead of stale embedded Markdown', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('# New pushed source', { headers: { 'Content-Type': 'text/plain' } }));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadMarkdownEditorSource(post)).toBe('# New pushed source');
  expect(syncGiteaSession).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith(post.repositorySource!.url, expect.objectContaining({ redirect: 'error' }));
});

test('loads a Markdown Book source from its exact book repository commit', async () => {
  const book = {
    ...post,
    type: 'book',
    repositorySource: { commit, entrypoint: 'main.md', url: `/repos/b/345/raw/commit/${commit}/main.md` },
  } as PostDetail;
  vi.stubGlobal('crypto', webcrypto);
  const bodies: Record<string, string> = { 'main.md': '# 入口书名\n\n- intro.md\n  - chapters/child.md\n', 'intro.md': '# Introduction', 'chapters/child.md': '# Child' };
  const fetcher = vi.fn().mockImplementation(async (url: string) => new Response(bodies[url.split(`/commit/${commit}/`)[1]], { headers: { 'Content-Type': 'text/plain' } }));
  vi.stubGlobal('fetch', fetcher);

  const source = await loadMarkdownEditorSource(book);
  const project = markdownBookProjectFromBody(source, '');
  expect(project.title).toBe('入口书名');
  expect(source).toMatch(/"title":\s*"入口书名"/);
  expect(project.files.map(({ path, body, level }) => ({ path, body, level }))).toEqual([
    { path: 'intro.md', body: '# Introduction', level: 2 },
    { path: 'chapters/child.md', body: '# Child', level: 3 },
  ]);
  expect(project.files[1].parentId).toBe(project.files[0].id);
  expect(project.files[0].id).toBe('rin-md-e37a304847f4c19c210fed51');
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher).toHaveBeenCalledWith(book.repositorySource!.url, expect.objectContaining({ redirect: 'error' }));
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

test('bounds chapter requests to four and preserves catalog order across out-of-order replies', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const book = { ...post, type: 'book', repositorySource: { commit, entrypoint: 'main.md', url: `/repos/b/345/raw/commit/${commit}/main.md` } } as PostDetail;
  const pending = new Map<string, (response: Response) => void>();
  let active = 0;
  let maximum = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const name = url.split(`/commit/${commit}/`)[1];
    if (name === 'main.md') return Promise.resolve(new Response(Array.from({ length: 6 }, (_, i) => `- chapter${i}.md`).join('\n')));
    active += 1; maximum = Math.max(maximum, active);
    return new Promise<Response>((resolve) => pending.set(name, (response) => { active -= 1; resolve(response); }));
  }));
  const loading = loadMarkdownEditorSource(book);
  await vi.waitFor(() => expect(pending.size).toBe(4));
  pending.get('chapter3.md')!(new Response('# Chapter 3'));
  await vi.waitFor(() => expect(pending.size).toBe(5));
  pending.get('chapter4.md')!(new Response('# Chapter 4'));
  await vi.waitFor(() => expect(pending.size).toBe(6));
  for (const i of [5, 2, 1, 0]) pending.get(`chapter${i}.md`)!(new Response(`# Chapter ${i}`));
  const project = markdownBookProjectFromBody(await loading, 'Book');
  expect(maximum).toBe(4);
  expect(project.files.map((file) => file.path)).toEqual(Array.from({ length: 6 }, (_, i) => `chapter${i}.md`));
});

test('rejects old repository entrypoints instead of interpreting a legacy book as a new catalog', async () => {
  await expect(loadMarkdownEditorSource({ ...post, repositorySource: { commit, entrypoint: 'content.md', url: `/repos/a/345/raw/commit/${commit}/content.md` } })).rejects.toThrow('Invalid repository');
  expect(syncGiteaSession).not.toHaveBeenCalled();
});

test('rejects an HTML login page returned with status 200 rather than loading it as source', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Login</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })));
  await expect(loadMarkdownEditorSource(post)).rejects.toThrow('could not be loaded');
});

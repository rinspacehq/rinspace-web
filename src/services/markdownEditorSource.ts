import type { PostDetail } from './feed';
import { syncGiteaSession } from './gitea';
import { markdownBlogSource, markdownSourceFile } from '@/utils/blogBody';

export async function loadMarkdownEditorSource(post: PostDetail) {
  if (post.repositorySource) {
    const source = post.repositorySource;
    const owner = post.type === 'book' ? 'b' : 'a';
    const expectedPath = `/repos/${owner}/${encodeURIComponent(post.id)}/raw/commit/${source.commit}/${source.entrypoint.split('/').map(encodeURIComponent).join('/')}`;
    if (!/^[a-f0-9]{40}$/.test(source.commit) || source.url !== expectedPath
      || source.entrypoint.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Invalid repository source reference.');
    }
    await syncGiteaSession();
    const response = await fetch(source.url, { redirect: 'error' });
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('The repository source could not be loaded.');
    }
    return response.text();
  }
  const embedded = markdownBlogSource(post.body);
  if (embedded) return embedded;
  const file = markdownSourceFile(post);
  if (!file) return '';
  const response = await fetch(file.url);
  return response.ok ? response.text() : '';
}

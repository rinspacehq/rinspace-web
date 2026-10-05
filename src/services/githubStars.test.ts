import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadRinspaceOpenSourceStars } from './githubStars';

describe('loadRinspaceOpenSourceStars', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sums every public repository returned for the organization', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { name: 'markdown-writer', fork: false, archived: false, disabled: false, stargazers_count: 17 },
      { name: 'rinspace-web', fork: false, archived: false, disabled: false, stargazers_count: 99 },
      { name: 'mastodon', fork: true, archived: false, disabled: false, stargazers_count: 88 },
      { name: 'archived-project', fork: false, archived: true, disabled: false, stargazers_count: 77 },
      { name: 'disabled-project', fork: false, archived: false, disabled: true, stargazers_count: 66 },
      { name: 'invalid-project', stargazers_count: -1 },
    ]), { status: 200 }));

    await expect(loadRinspaceOpenSourceStars()).resolves.toBe(347);
  });

  it('rejects invalid GitHub responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(loadRinspaceOpenSourceStars()).rejects.toThrow('response is invalid');
  });
});

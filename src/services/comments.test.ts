import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadComments } from './feed';

const baseComment = {
  id: 41,
  targetType: 'post',
  targetId: 7,
  author: '评论者',
  body: '**Markdown** 评论',
  voteCount: 3,
  createdAt: '2026-08-25T00:00:00Z',
  updatedAt: '2026-08-25T00:00:00Z',
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('comment vote summaries', () => {
  it('parses public like and dislike counts with viewer state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                ...baseComment,
                upVoteCount: 8,
                downVoteCount: 5,
                viewerVoteStatus: 'down',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const [comment] = await loadComments({ targetType: 'post', targetId: 7 });
    expect(comment).toMatchObject({
      upVoteCount: 8,
      downVoteCount: 5,
      viewerVoteStatus: 'down',
    });
  });

  it('keeps old comment responses readable during rollout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [baseComment] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const [comment] = await loadComments({ targetType: 'post', targetId: 7 });
    expect(comment).toMatchObject({
      upVoteCount: 3,
      downVoteCount: 0,
      viewerVoteStatus: 'none',
    });
  });

  it('requests root-thread pagination with an explicit supported order', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ items: [baseComment] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await loadComments({
      targetType: 'post',
      targetId: 7,
      order: 'newest',
      threaded: true,
      limit: 12,
      page: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestURL] = fetchMock.mock.calls[0] || [];
    expect(String(requestURL)).toContain('order=newest');
    expect(String(requestURL)).toContain('threaded=true');
    expect(String(requestURL)).toContain('limit=12');
    expect(String(requestURL)).toContain('page=2');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getAuthAccessToken: vi.fn(async () => 'access-token'),
  authHeaders: vi.fn((accessToken = '') => accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  forceRefreshAuthSession: vi.fn(async () => false),
  getAuthDeviceId: vi.fn(() => 'test-device'),
  getStoredSession: vi.fn(() => null),
}));

vi.mock('@/app/config/env', () => ({
  publicEnv: { publicBasePath: '' },
}));
vi.mock('./phoneAuth', () => authMocks);

import { likePost, loadTagActivity, loadTagPage } from './feed';

const tagPageItem = {
  tag_id: '5815',
  slug_name: 'weil-pairings',
  display_name: 'Weil Pairings',
  description: 'A pairing on torsion points.',
  excerpt: 'A pairing on torsion points.',
  original_text: '# Weil Pairings',
  parsed_text: '<h1>Weil Pairings</h1>',
  follow_count: 11,
  like_count: 7,
  question_count: 2,
  is_follower: false,
  is_liked: true,
  created_at: 1,
  updated_at: 2,
  recommend: false,
  reserved: false,
  usage_excerpt: 'A pairing on torsion points.',
};

describe('tag repository social API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.getAuthAccessToken.mockResolvedValue('access-token');
    window.localStorage.clear();
  });

  it('parses Star and Watch projections independently', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      count: 1,
      page: 1,
      page_size: 1,
      items: [tagPageItem],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const page = await loadTagPage({ slugName: 'weil-pairings', page: 1, pageSize: 1 });

    expect(page.items[0]).toMatchObject({
      tagId: '5815',
      likeCount: 7,
      isLiked: true,
      followCount: 11,
      isFollower: false,
    });
  });

  it('sends a stable tag ID to the Like endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      targetType: 'tag',
      targetId: '5815',
      liked: true,
      likeCount: 8,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(likePost({
      targetType: 'tag',
      targetId: '5815',
      slug: 'weil-pairings',
      bookmark: true,
    })).resolves.toMatchObject({ liked: true, likeCount: 8 });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe('POST');
    const body: unknown = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      targetType: 'tag',
      targetId: '5815',
      slug: 'weil-pairings',
      bookmark: true,
    });
  });

  it('loads tag card metrics and viewer state with optional authentication', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: '5815',
        revisionId: '701',
        type: 'tag',
        title: '更新了标签：Weil Pairings',
        author: 'Lunifans',
        createdAt: '2026-09-21T01:02:03Z',
        publishedAt: '2026-09-21T01:02:03Z',
        contentUpdatedAt: '2026-09-21T01:02:03Z',
        meta: '标签 · 更新',
        excerpt: 'A pairing on torsion points.',
        tags: ['weil-pairings'],
        interactions: '2 内容 · 11 关注',
        heat: '更新',
        readCount: 128,
        likeCount: 7,
        liked: true,
        followCount: 11,
        isFollowed: false,
        shareCount: 4,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(loadTagActivity({ limit: 12 })).resolves.toMatchObject([{
      id: '5815',
      type: 'tag',
      readCount: 128,
      likeCount: 7,
      liked: true,
      followCount: 11,
      isFollowed: false,
      shareCount: 4,
    }]);

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/tags/activity?limit=12');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer access-token',
    });
  });
});

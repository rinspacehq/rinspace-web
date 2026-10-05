import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadCreatorContributions, parseCreatorAnalyticsResponse, parseCreatorContributions } from './creator';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('creator insights response parsing', () => {
  it('parses normalized analytics points', () => {
    expect(parseCreatorAnalyticsResponse({
      granularity: 'month',
      period: '2026-08',
      start: '2026-08-01',
      end: '2026-09-01',
      cumulativeReads: 204,
      periodReads: 18,
      readHistoryStart: '2026-08-27',
      topWorks: [{ id: '12', slug: 'analytics', title: '统计设计', contentType: 'blog', reads: 12 }],
      points: [{ key: '2026-08-24', label: '24', reads: 18, likes: 3, favorites: 2, newFollowers: -1 }],
    })).toMatchObject({
      cumulativeReads: 204,
      periodReads: 18,
      readHistoryStart: '2026-08-27',
      topWorks: [{ id: '12', reads: 12 }],
      points: [{ key: '2026-08-24', label: '24', reads: 18, likes: 3, favorites: 2, newFollowers: -1 }],
    });
  });

  it('rejects incomplete analytics payloads', () => {
    expect(() => parseCreatorAnalyticsResponse({ granularity: 'month', points: [{}] })).toThrow('创作数据格式异常');
  });

  it('parses Gitea contribution values without trusting arbitrary fields', () => {
    expect(parseCreatorContributions([{ timestamp: 1787536800, contributions: 4, ignored: true }]))
      .toEqual([{ timestamp: 1787536800, contributions: 4 }]);
    expect(() => parseCreatorContributions([{ timestamp: 'today', contributions: 4 }])).toThrow('创作活跃数据格式异常');
  });

  it('coalesces concurrent heatmap requests and reuses the short-lived result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { timestamp: 1787536800, contributions: 4 },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      loadCreatorContributions('cache-test-user'),
      loadCreatorContributions('cache-test-user'),
    ]);
    const third = await loadCreatorContributions('cache-test-user');

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/users/cache-test-user/heatmap');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  });
});

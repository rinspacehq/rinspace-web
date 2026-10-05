import { giteaBasePath } from '@/utils/giteaPaths';

export {
  cachedCreatorAnalytics,
  loadCreatorAnalytics,
  parseCreatorAnalyticsResponse,
  type ContentReadWorkSummary,
  type CreatorAnalyticsGranularity,
  type CreatorAnalyticsPoint,
  type CreatorAnalyticsResponse,
} from '@/features/content-analytics/api';

export type CreatorContribution = {
  timestamp: number;
  contributions: number;
};

type CreatorInsightsCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const creatorInsightsCacheLifetimeMs = 5 * 60 * 1000;
const creatorContributionCache = new Map<string, CreatorInsightsCacheEntry<CreatorContribution[]>>();
const creatorContributionRequests = new Map<string, Promise<CreatorContribution[]>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseCreatorContributions(value: unknown): CreatorContribution[] {
  if (!Array.isArray(value)) throw new Error('创作活跃数据格式异常。');
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error('创作活跃数据格式异常。');
    const timestamp = finiteNumber(entry.timestamp);
    const contributions = finiteNumber(entry.contributions);
    if (timestamp === null || contributions === null) throw new Error('创作活跃数据格式异常。');
    return { timestamp, contributions };
  });
}

function freshCacheValue<T>(entry: CreatorInsightsCacheEntry<T> | undefined) {
  return entry && entry.expiresAt > Date.now() ? entry.value : null;
}

function contributionCacheKey(username: string) {
  return username.trim().toLocaleLowerCase('en-US');
}

export function cachedCreatorContributions(username: string) {
  return freshCacheValue(creatorContributionCache.get(contributionCacheKey(username)));
}

export async function loadCreatorContributions(username: string, options: { force?: boolean } = {}) {
  const key = contributionCacheKey(username);
  if (!options.force) {
    const cached = freshCacheValue(creatorContributionCache.get(key));
    if (cached) return cached;
    const pending = creatorContributionRequests.get(key);
    if (pending) return pending;
  }

  const request = fetch(`${giteaBasePath}api/v1/users/${encodeURIComponent(username)}/heatmap`, {
    // Contribution heatmaps are public. Omitting same-origin credentials keeps
    // an expired managed Gitea binding from turning this public read into 401.
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok) throw new Error('创作活跃加载失败。');
    const contributions = parseCreatorContributions(payload);
    creatorContributionCache.set(key, {
      expiresAt: Date.now() + creatorInsightsCacheLifetimeMs,
      value: contributions,
    });
    return contributions;
  }).finally(() => {
    if (creatorContributionRequests.get(key) === request) creatorContributionRequests.delete(key);
  });
  creatorContributionRequests.set(key, request);
  return request;
}

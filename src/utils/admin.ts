const topbarSessionCacheKey = 'rinspace-topbar-session-cache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readCachedAdminState() {
  try {
    const raw = window.localStorage.getItem(topbarSessionCacheKey);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return false;
    return parsed.isAdmin === true;
  } catch {
    return false;
  }
}

import { getStoredSession, type RinspaceUser } from './phoneAuth';

export type TopbarUserProfile = {
  nickname?: string;
  avatarDataUrl?: string;
};

export type TopbarSessionSnapshot = {
  user: RinspaceUser;
  profile: TopbarUserProfile | null;
  nickname: string;
  avatarDataUrl: string;
  publicUserId: string;
  isAdmin: boolean;
  isModerator: boolean;
  cachedAt: number;
};

const topbarSessionCacheKey = 'rinspace-topbar-session-cache';

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cachedRinspaceUser(value: unknown): RinspaceUser | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) {
    return null;
  }
  const metadata = isRecord(value.user_metadata)
    ? value.user_metadata
    : undefined;
  return {
    id: value.id,
    username: optionalString(value.username) || optionalString(metadata?.username),
    phone: optionalString(value.phone),
    user_metadata: metadata,
    is_anonymous:
      typeof value.is_anonymous === 'boolean'
        ? value.is_anonymous
        : undefined,
  };
}

function cachedUserProfile(value: unknown): TopbarUserProfile | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  return {
    nickname: optionalString(value.nickname),
    avatarDataUrl: optionalString(value.avatarDataUrl),
  };
}

export function topbarSessionDisplayName(snapshot: TopbarSessionSnapshot) {
  return (
    snapshot.profile?.nickname?.trim() ||
    snapshot.nickname.trim() ||
    optionalString(snapshot.user.username).trim() ||
    snapshot.publicUserId.trim()
  );
}

export function readTopbarSessionSnapshot(): TopbarSessionSnapshot | null {
  const session = getStoredSession();
  if (!session) return null;
  const raw = window.localStorage.getItem(topbarSessionCacheKey);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const user = cachedRinspaceUser(parsed.user);
    if (!user) return null;
    if (session.sub && user.id !== session.sub) return null;
    const snapshot = {
      user,
      profile: cachedUserProfile(parsed.profile),
      nickname: optionalString(parsed.nickname),
      avatarDataUrl: optionalString(parsed.avatarDataUrl),
      publicUserId: optionalString(parsed.publicUserId),
      isAdmin: parsed.isAdmin === true,
      isModerator: parsed.isModerator === true,
      cachedAt:
        typeof parsed.cachedAt === 'number'
          ? parsed.cachedAt
          : Date.now(),
    };
    if (!topbarSessionDisplayName(snapshot)) {
      window.localStorage.removeItem(topbarSessionCacheKey);
      return null;
    }
    return snapshot;
  } catch {
    window.localStorage.removeItem(topbarSessionCacheKey);
    return null;
  }
}

export function writeTopbarSessionSnapshot(snapshot: TopbarSessionSnapshot) {
  if (!topbarSessionDisplayName(snapshot)) {
    clearTopbarSessionSnapshot();
    return;
  }
  try {
    window.localStorage.setItem(topbarSessionCacheKey, JSON.stringify(snapshot));
  } catch {
    // The cache is optional; login and navigation must continue if storage is full.
  }
}

export function clearTopbarSessionSnapshot() {
  window.localStorage.removeItem(topbarSessionCacheKey);
}

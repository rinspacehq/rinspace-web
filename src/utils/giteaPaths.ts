import { publicEnv } from '@/app/config/env';
const defaultGiteaBasePath = '/repos/';
const supportedGiteaBasePaths = ['/git/', '/repos/'] as const;

function hasUnsafePathEncoding(pathname: string) {
  let current = pathname;
  for (let depth = 0; depth < 3; depth += 1) {
    if (current.includes('\\') || /[\r\n\0]/.test(current)) return true;
    if (current.split('/').some((segment) => segment === '.' || segment === '..')) return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return true;
    }
    if (decoded.split('/').length !== current.split('/').length) return true;
    if (decoded === current) return false;
    current = decoded;
  }
  return true;
}

export function normalizeGiteaBasePath(value: string | undefined | null) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '';
  }
  const segments = raw.split('/').filter(Boolean);
  if (segments.length !== 1 || segments[0] === '.' || segments[0] === '..') {
    return '';
  }
  return `/${segments[0]}/`;
}

export const giteaBasePath =
  normalizeGiteaBasePath(publicEnv.giteaBasePath) ||
  defaultGiteaBasePath;

export function giteaPath(...segments: Array<string | number>) {
  const suffix = segments
    .map((segment) => encodeURIComponent(String(segment).trim()))
    .filter(Boolean)
    .join('/');
  return suffix ? `${giteaBasePath}${suffix}` : giteaBasePath;
}

export function openGiteaPath(...segments: Array<string | number>) {
  window.location.assign(giteaPath(...segments));
}

export function articleGiteaSourcePath(articleId: string | number) {
  return giteaPath('a', articleId, 'src', 'branch', 'main');
}

export function canonicalGiteaPathname(
  pathname: string,
  targetBasePath = giteaBasePath,
) {
  const target = normalizeGiteaBasePath(targetBasePath);
  if (!target || hasUnsafePathEncoding(pathname)) return '';
  for (const base of supportedGiteaBasePaths) {
    const root = base.slice(0, -1);
    if (pathname === root || pathname === base) return target;
    if (pathname.startsWith(base)) return `${target}${pathname.slice(base.length)}`;
  }
  return '';
}

export function safeGiteaRedirectPath(
  value: string | null | undefined,
  fallback = `${giteaBasePath}user/login`,
) {
  const raw = String(value || '').trim();
  if (
    !raw ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    /[\r\n\0]/.test(raw)
  ) {
    return fallback;
  }
  try {
    const base = new URL('https://rinspace.local');
    const parsed = new URL(raw, base);
    if (parsed.origin !== base.origin) return fallback;
    if (hasUnsafePathEncoding(parsed.pathname)) return fallback;
    const pathname = canonicalGiteaPathname(parsed.pathname);
    if (!pathname) return fallback;
    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

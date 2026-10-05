import { publicEnv } from "app/config/env";

import {
  authHeaders,
  getAuthAccessToken,
  hasAuthSession,
  refreshManagedSession,
} from "./phoneAuth";

function normalizeRequestHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) return record;
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) record[key] = value;
    return record;
  }
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string>))
    record[key] = value;
  return record;
}

function requestURL(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === "string") return new URL(input, window.location.origin);
    if (input instanceof URL) return input;
    if (typeof Request !== "undefined" && input instanceof Request)
      return new URL(input.url);
  } catch {
    // An unparseable request target is simply not recoverable.
  }
  return null;
}

function isRecoverableSessionRequest(url: URL): boolean {
  const base = publicEnv.publicBasePath || "";
  if (url.origin !== window.location.origin) return false;
  const path = url.pathname;
  const isApi =
    path.startsWith(`${base}/api/`) || path.startsWith(`${base}/admin/api/`);
  if (!isApi) return false;
  return !path.startsWith(`${base}/api/identity/`);
}

let installed = false;

/**
 * Installs a single same-origin `/api` request interceptor that recovers an
 * expired managed session.
 *
 * Managed browsers keep the access credential in an HttpOnly cookie that
 * expires long before the refresh credential. Any business request sent after
 * that moment is answered 401 even though the session is still recoverable, and
 * previously nothing retried it — the failure only cleared after a manual page
 * reload happened to trigger `/session/refresh`. Instead of repeating retry
 * logic in every service call site, the interceptor refreshes the session once
 * and replays the request with the CSRF token minted for the new session
 * version. Identity endpoints own their own 401 handling and are excluded, so
 * the recovery request can never recurse.
 */
export function installManagedSessionRecovery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const baseFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.status !== 401) return response;
    // A Request body may already be consumed, so it cannot be replayed safely.
    if (typeof Request !== "undefined" && input instanceof Request)
      return response;
    // The local broker renews/checks the formal session before forwarding.
    // A 401 after a real mutation reached it is not permission to repeat an
    // upload/publication/payment with an uncertain outcome. Website behavior
    // stays unchanged; local reads can still use the existing recovery path.
    if (
      publicEnv.localRealClient &&
      !["GET", "HEAD"].includes((init?.method || "GET").toUpperCase())
    )
      return response;
    const url = requestURL(input);
    if (!url || !isRecoverableSessionRequest(url)) return response;
    if (!hasAuthSession()) return response;
    if (!(await refreshManagedSession())) return response;
    const headers = {
      ...normalizeRequestHeaders(init?.headers),
      ...authHeaders(await getAuthAccessToken()),
    };
    return baseFetch(input, { ...init, headers });
  };
}

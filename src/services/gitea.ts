import { publicEnv } from "@/app/config/env";
import { giteaBasePath } from "@/utils/giteaPaths";

import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
  getAuthDeviceId,
  hasAuthSession,
} from "./phoneAuth";

const giteaSSOEndpoint = `${publicEnv.publicBasePath}/api/gitea/sso`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function responseMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (isRecord(payload) && typeof payload.message === "string")
    return payload.message;
  if (isRecord(payload) && typeof payload.error === "string")
    return payload.error;
  return fallback;
}

// The identity service validates the session CSRF token on every non-GET
// request and refuses the request before introspection when the content type is
// not JSON-shaped. Both the sign-in and the sign-out call therefore need an
// explicit JSON content type; without it the browser was answered 401 and the
// Git session silently stayed behind after a logout.
const giteaSSOMutationHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

let giteaSyncRequest: Promise<boolean> | null = null;

async function initializeGiteaSession() {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !hasAuthSession()) return false;
  const response = await fetch(giteaSSOEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      ...giteaSSOMutationHeaders,
      "x-device-id": getAuthDeviceId(),
    },
    body: "{}",
  });
  const payload = parseJson(await response.text());
  if (!response.ok)
    throw new Error(responseMessage(payload, "Git 登录同步失败。"));

  // SSO refreshes the Native binding; Gitea still needs its own cookie round
  // trip. A stale Gitea session can be cleared by the first rejected safe GET.
  // Never apply this retry to repository mutations or Git receive-pack.
  const options: RequestInit = { credentials: "same-origin", cache: "no-store" };
  let bootstrap = await fetch(giteaBasePath, options);
  if (bootstrap.status === 401) bootstrap = await fetch(giteaBasePath, options);
  if (!bootstrap.ok)
    throw new Error(`Gitea web session initialization failed (${bootstrap.status})`);
  return true;
}

export function syncGiteaSession(): Promise<boolean> {
  // The topbar and GitAuth page may initialize together. Complete one whole
  // binding transaction before either caller navigates to its target.
  giteaSyncRequest ??= initializeGiteaSession().finally(() => {
    giteaSyncRequest = null;
  });
  return giteaSyncRequest;
}

export async function clearGiteaSession() {
  const accessToken = await getAuthAccessToken();
  const response = await fetch(giteaSSOEndpoint, {
    method: "DELETE",
    headers: {
      ...sessionAuthHeaders(accessToken),
      ...giteaSSOMutationHeaders,
      "x-device-id": getAuthDeviceId(),
    },
    body: "{}",
  });
  const payload = parseJson(await response.text());
  if (!response.ok)
    throw new Error(responseMessage(payload, "Git 登录清理失败。"));
}

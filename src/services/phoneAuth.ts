import { publicEnv } from "@/app/config/env";

const identityBase = `${publicEnv.publicBasePath || ""}/api/identity/v1`;
const cloudBaseAuthGateway = `https://${publicEnv.cloudbaseEnvId || ""}.api.tcloudbasegateway.com/auth/v1`;
const legacySessionKey = "rinspace-auth-session";
const legacyFallbackKey = "rinspace-auth-session-fallback";
const sessionHintKey = "rinspace-auth-hint";
const pendingRefreshKey = "rinspace-refresh-request-id";
const pendingLogoutKey = "rinspace-logout-pending";
const pendingAdmissionKey = "rinspace-admission-request-id";
const pendingLegacyExchangeKey = "rinspace-legacy-exchange-request-id";
const deviceKey = "rinspace-device-id";
const deviceFallbackKey = "rinspace-device-id-fallback";
const refreshLeaseKey = "rinspace-refresh-lease";
const authRequestTimeoutMs = 8_000;
const refreshLeaseMs = 12_000;
const sessionUnauthorizedConfirmationDelayMs = 250;
const channelName = "rinspace-identity-session-v1";

export type SessionPresentation =
  | "anonymous"
  | "restoring"
  | "authenticated"
  | "temporarily_unavailable"
  | "revoked";

// Compatibility shape for callers that only need a synchronous signed-in hint.
// Credential fields remain empty: browser credentials live only in HttpOnly cookies.
export type StoredSession = {
  access_token: "";
  refresh_token: "";
  sub?: string;
  session_epoch?: number;
  identity_version?: number;
  managed: true;
};

export type OtpChallenge = {
  verificationId: string;
  phoneNumber: string;
  isUser: boolean;
  retryAfter?: number;
};

export type RinspaceUser = {
  id?: string;
  username?: string;
  phone?: string;
  role?: string;
  sessionEpoch?: number;
  identityVersion?: number;
  user_metadata?: Record<string, unknown>;
  is_anonymous?: boolean;
};

type SessionEnvelope = {
  status?: SessionPresentation;
  canRefresh?: boolean;
  csrfToken?: string;
  expiresAt?: string;
  user?: {
    id?: string;
    username?: string;
    phone?: string;
    role?: string;
    sessionEpoch?: number;
    identityVersion?: number;
  };
  currentSession?: {
    sid?: string;
    authTime?: string;
    authMethod?: string;
    version?: number;
  };
  code?: string;
  message?: string;
  challengeId?: string;
  retryAfter?: number;
  admissionProof?: string;
};

export type IdentityDeviceSession = {
  sid: string;
  clientLabel: string;
  authMethod: string;
  createdAt: string;
  lastActiveAt: string;
  idleExpiresAt: string;
  absoluteExpires: string;
  current: boolean;
  revoked: boolean;
  cleanupComplete: boolean;
  runtimes: Record<string, string>;
};

export type IdentityPersonalCredential = {
  ref: string;
  provider: string;
  kind: string;
  label: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  state: string;
};

export type StepUpChallenge = {
  challengeId: string;
  retryAfter?: number;
};

type SessionHint = {
  sub: string;
  sessionEpoch?: number;
  identityVersion?: number;
};

class IdentityHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly payload: SessionEnvelope | null,
  ) {
    super(message);
    this.name = "IdentityHttpError";
  }
}

export class AdmissionRequiredError extends Error {
  constructor(readonly proof: string) {
    super("登录设备已达上限，请先移除一个旧设备。");
    this.name = "AdmissionRequiredError";
  }
}

export type AdmissionSession = {
  sid: string;
  clientLabel: string;
  createdAt: string;
  lastActiveAt: string;
};

let inMemoryDeviceId = "";
let currentState: SessionPresentation = "anonymous";
let currentEnvelope: SessionEnvelope | null = null;
let currentUserRequest: Promise<RinspaceUser | null> | null = null;
let refreshRequest: Promise<StoredSession | null> | null = null;
let channel: BroadcastChannel | null = null;
let lifecycleInstalled = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStoredValue(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStoredValue(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Browser storage is an optional display hint, never the authority.
  }
}

function parseHint(): SessionHint | null {
  const raw = readStoredValue(window.localStorage, sessionHintKey);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.sub !== "string" || !value.sub)
      return null;
    return {
      sub: value.sub,
      sessionEpoch:
        typeof value.sessionEpoch === "number" ? value.sessionEpoch : undefined,
      identityVersion:
        typeof value.identityVersion === "number"
          ? value.identityVersion
          : undefined,
    };
  } catch {
    removeStoredValue(window.localStorage, sessionHintKey);
    return null;
  }
}

function saveHint(user: RinspaceUser) {
  if (!user.id) return;
  writeStoredValue(
    window.localStorage,
    sessionHintKey,
    JSON.stringify({
      sub: user.id,
      sessionEpoch: user.sessionEpoch,
      identityVersion: user.identityVersion,
    }),
  );
}

function purgeLegacyBrowserCredentials() {
  removeStoredValue(window.localStorage, legacySessionKey);
  removeStoredValue(window.sessionStorage, legacyFallbackKey);
}

function legacyAccessToken() {
  for (const [storage, key] of [[window.localStorage, legacySessionKey], [window.sessionStorage, legacyFallbackKey]] as const) {
    const raw = readStoredValue(storage, key);
    if (!raw) continue;
    try {
      const value: unknown = JSON.parse(raw);
      if (isRecord(value) && typeof value.access_token === "string" && value.access_token)
        return value.access_token;
    } catch {
      // Preserve malformed legacy state for support; it is never sent.
    }
  }
  return "";
}

function createOpaqueID(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function getDeviceId() {
  const existing =
    readStoredValue(window.localStorage, deviceKey) ||
    readStoredValue(window.sessionStorage, deviceFallbackKey);
  if (existing) return existing;
  if (inMemoryDeviceId) return inMemoryDeviceId;
  const next = createOpaqueID("browser");
  if (!writeStoredValue(window.localStorage, deviceKey, next)) {
    if (!writeStoredValue(window.sessionStorage, deviceFallbackKey, next))
      inMemoryDeviceId = next;
  }
  return next;
}

export function getAuthDeviceId() {
  return getDeviceId();
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(channelName);
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isRecord(event.data) || event.data.type !== "session-changed") return;
    currentUserRequest = null;
    currentEnvelope = null;
    const status = event.data.status;
    if (status === "anonymous" || status === "revoked") {
      currentState = status;
      removeStoredValue(window.localStorage, sessionHintKey);
    } else if (status === "authenticated" || status === "restoring") {
      currentState = "restoring";
      void getCurrentAuthUser().catch(() => {});
    }
    window.dispatchEvent(
      new CustomEvent("rinspace-session-changed", {
        detail: { status: currentState },
      }),
    );
  });
  return channel;
}

function publishState(status: SessionPresentation) {
  ensureChannel()?.postMessage({ type: "session-changed", status });
  window.dispatchEvent(
    new CustomEvent("rinspace-session-changed", { detail: { status } }),
  );
}

function userFromEnvelope(envelope: SessionEnvelope): RinspaceUser | null {
  const user = envelope.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    username: user.username || "",
    phone: user.phone || "",
    role: user.role || "",
    sessionEpoch: user.sessionEpoch,
    identityVersion: user.identityVersion,
    user_metadata: user.username
      ? { username: user.username, preferred_username: user.username }
      : {},
    is_anonymous: false,
  };
}

function applyEnvelope(envelope: SessionEnvelope) {
  // The CSRF token proves the session version, so it is scoped to the session
  // rather than to one response. A GET that omits it (no refresh cookie was
  // sent, for instance) must never erase the token we are already signing with.
  const carriesToken = typeof envelope.csrfToken === "string" && envelope.csrfToken;
  const keepsToken =
    !carriesToken &&
    (envelope.status === "authenticated" || envelope.status === "restoring") &&
    typeof currentEnvelope?.csrfToken === "string" &&
    currentEnvelope.csrfToken;
  currentEnvelope = keepsToken
    ? { ...envelope, csrfToken: currentEnvelope?.csrfToken }
    : envelope;
  currentState = currentEnvelope.status || "temporarily_unavailable";
  const user = userFromEnvelope(currentEnvelope);
  if (currentState === "authenticated" && user) {
    saveHint(user);
    purgeLegacyBrowserCredentials();
  } else if (currentState === "anonymous" || currentState === "revoked") {
    removeStoredValue(window.localStorage, sessionHintKey);
  }
  return user;
}

async function identityFetch(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    authRequestTimeoutMs,
  );
  try {
    return await fetch(`${identityBase}${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("Rinspace Identity 请求超时。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function decodeEnvelope(response: Response) {
  const text = await response.text();
  let payload: SessionEnvelope | null = null;
  try {
    payload = text ? (JSON.parse(text) as SessionEnvelope) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const code = payload?.code || `http.${response.status}`;
    throw new IdentityHttpError(
      response.status,
      code,
      payload?.message || "Rinspace Identity 请求失败。",
      payload,
    );
  }
  // Every credential-issuing response now carries the CSRF token minted for the
  // session version it just created. Adopt it immediately: keeping the previous
  // token until the next GET /session is what turned a routine refresh into a
  // "csrf.invalid" 403 for whatever request happened to be in flight.
  if (payload && typeof payload.csrfToken === "string" && payload.csrfToken)
    currentEnvelope = { ...(currentEnvelope || {}), csrfToken: payload.csrfToken };
  return payload || {};
}

async function requestSessionEnvelope() {
  const read = async () => decodeEnvelope(await identityFetch("/session"));
  let envelope = await read();
  if (envelope.status === "anonymous" && parseHint()) {
    // A stale GET may arrive after another tab rotated the cookie. Confirm
    // before discarding the local presentation hint.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, sessionUnauthorizedConfirmationDelayMs);
    });
    envelope = await read();
  }
  applyEnvelope(envelope);
  return envelope;
}

function shouldConfirmSessionUnauthorized(error: IdentityHttpError) {
  // HttpOnly cookies are authoritative and cannot be inspected from the app.
  // Confirm every ambiguous 401 even when the non-secret local hint is absent.
  return error.code !== "session.revoked";
}

async function getSessionEnvelope() {
  let failure: unknown;
  try {
    return await requestSessionEnvelope();
  } catch (error) {
    failure = error;
  }

  if (
    failure instanceof IdentityHttpError &&
    failure.status === 401 &&
    shouldConfirmSessionUnauthorized(failure)
  ) {
    // A refresh in this tab or another tab may have rotated the HttpOnly
    // cookies after this request was sent. Give the browser cookie jar a
    // bounded chance to settle, then ask the authoritative service again.
    // No business request is released while the session remains unconfirmed.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, sessionUnauthorizedConfirmationDelayMs);
    });
    try {
      return await requestSessionEnvelope();
    } catch (error) {
      failure = error;
    }
  }

  if (failure instanceof IdentityHttpError && failure.status === 401) {
    // An expired access cookie, a refresh-cookie race, or a deployment cutover
    // is not proof that the account was revoked. Keep the non-secret hint and
    // let the next bootstrap retry the browser's HttpOnly cookies. Only the
    // identity service's explicit revoked code is allowed to clear the hint.
    if (failure.code !== "session.revoked") {
      currentState = "temporarily_unavailable";
      currentEnvelope = {
        status: "temporarily_unavailable",
        code: failure.code,
        message: failure.message,
      };
      publishState("temporarily_unavailable");
      return currentEnvelope;
    }
    currentState = "revoked";
    currentEnvelope = { status: "revoked" };
    removeStoredValue(window.localStorage, sessionHintKey);
    publishState("revoked");
    return currentEnvelope;
  }
  currentState = "temporarily_unavailable";
  throw failure;
}

function storedRequestID(key: string, prefix: string) {
  const existing =
    readStoredValue(window.sessionStorage, key) ||
    readStoredValue(window.localStorage, key);
  if (existing) return existing;
  const next = createOpaqueID(prefix);
  writeStoredValue(
    key === pendingLogoutKey ? window.localStorage : window.sessionStorage,
    key,
    next,
  );
  return next;
}

function refreshRequestID() {
  const existing =
    readStoredValue(window.localStorage, pendingRefreshKey) ||
    readStoredValue(window.sessionStorage, pendingRefreshKey);
  const requestId = existing || createOpaqueID("refresh");
  writeStoredValue(window.localStorage, pendingRefreshKey, requestId);
  removeStoredValue(window.sessionStorage, pendingRefreshKey);
  return requestId;
}

function clearRefreshRequestID() {
  removeStoredValue(window.localStorage, pendingRefreshKey);
  removeStoredValue(window.sessionStorage, pendingRefreshKey);
}

async function postIdentity(
  path: string,
  body: Record<string, unknown>,
  csrfToken: string,
  additionalHeaders: Record<string, string> = {},
) {
  const response = await identityFetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": csrfToken,
      "x-device-id": getDeviceId(),
      ...additionalHeaders,
    },
    body: JSON.stringify(body),
  });
  return decodeEnvelope(response);
}

async function refreshInsideLock() {
  const before = await getSessionEnvelope();
  if (before.status === "authenticated") {
    clearRefreshRequestID();
    return getStoredSession();
  }
  if (before.status !== "restoring" || !before.csrfToken) {
    if (before.status === "anonymous" || before.status === "revoked")
      return null;
    throw new Error("当前会话无法续期。");
  }
  const requestId = refreshRequestID();
  try {
    await postIdentity("/session/refresh", { requestId }, before.csrfToken);
  } catch (error) {
    if (!(error instanceof IdentityHttpError) || error.status !== 409)
      throw error;
  }
  const after = await getSessionEnvelope();
  if (after.status !== "authenticated") return null;
  clearRefreshRequestID();
  publishState("authenticated");
  return getStoredSession();
}

async function withFallbackRefreshLease<T>(run: () => Promise<T>): Promise<T> {
  const owner = createOpaqueID("tab");
  const now = Date.now();
  let lease: { owner?: string; expiresAt?: number } = {};
  try {
    lease = JSON.parse(
      readStoredValue(window.localStorage, refreshLeaseKey) || "{}",
    ) as typeof lease;
  } catch {
    lease = {};
  }
  if (
    typeof lease.expiresAt === "number" &&
    lease.expiresAt > now &&
    lease.owner !== owner
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    const envelope = await getSessionEnvelope();
    if (envelope.status === "authenticated") return getStoredSession() as T;
  }
  writeStoredValue(
    window.localStorage,
    refreshLeaseKey,
    JSON.stringify({ owner, expiresAt: now + refreshLeaseMs }),
  );
  try {
    return await run();
  } finally {
    const active = readStoredValue(window.localStorage, refreshLeaseKey);
    if (active?.includes(owner))
      removeStoredValue(window.localStorage, refreshLeaseKey);
  }
}

async function coordinatedRefresh() {
  if (refreshRequest) return refreshRequest;
  const run = () => refreshInsideLock();
  const coordinated = navigator.locks
    ? (navigator.locks.request(
        "rinspace-identity-refresh",
        { mode: "exclusive" },
        run,
      ) as unknown as Promise<StoredSession | null>)
    : withFallbackRefreshLease(run);
  refreshRequest = coordinated.finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

async function recoverPendingLogout() {
  const requestId = readStoredValue(window.localStorage, pendingLogoutKey);
  if (!requestId) return false;
  const envelope = await getSessionEnvelope();
  if (envelope.status === "anonymous" || envelope.status === "revoked") {
    removeStoredValue(window.localStorage, pendingLogoutKey);
    return true;
  }
  if (!envelope.csrfToken) return true;
  await postIdentity("/session/logout", { requestId }, envelope.csrfToken);
  removeStoredValue(window.localStorage, pendingLogoutKey);
  currentState = "anonymous";
  currentEnvelope = { status: "anonymous" };
  publishState("anonymous");
  return true;
}

function installLifecycleSync() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  ensureChannel();
  const synchronize = () => {
    currentUserRequest = null;
    void getCurrentAuthUser().catch(() => {});
  };
  window.addEventListener("focus", synchronize);
  window.addEventListener("pageshow", synchronize);
}

export function replaceStoredSession(session: StoredSession) {
  if (session.sub)
    saveHint({
      id: session.sub,
      sessionEpoch: session.session_epoch,
      identityVersion: session.identity_version,
    });
  purgeLegacyBrowserCredentials();
}

export function clearStoredSession() {
  currentState = "anonymous";
  currentEnvelope = { status: "anonymous" };
  currentUserRequest = null;
  removeStoredValue(window.localStorage, sessionHintKey);
  purgeLegacyBrowserCredentials();
  publishState("anonymous");
}

export function getStoredSession(): StoredSession | null {
  const hint = parseHint();
  if (!hint) return null;
  return {
    access_token: "",
    refresh_token: "",
    sub: hint.sub,
    session_epoch: hint.sessionEpoch,
    identity_version: hint.identityVersion,
    managed: true,
  };
}

export function hasAuthSession() {
  return (
    currentState === "authenticated" ||
    currentState === "restoring" ||
    getStoredSession() !== null
  );
}

export function authHeaders(accessToken = ""): Record<string, string> {
  if (accessToken)
    return {
      Authorization: `Bearer ${accessToken}`,
      "x-device-id": getDeviceId(),
    };
  if (currentState !== "authenticated" || !currentEnvelope?.csrfToken)
    return {};
  return {
    "X-Rinspace-CSRF": currentEnvelope.csrfToken,
    "x-device-id": getDeviceId(),
  };
}

export function getSessionPresentation() {
  return currentState;
}

export async function getFreshAuthSession() {
  const user = await getCurrentAuthUser();
  return user ? getStoredSession() : null;
}

export async function forceRefreshAuthSession(): Promise<StoredSession | null> {
  try {
    return await coordinatedRefresh();
  } catch {
    return null;
  }
}

/**
 * Refreshes the managed browser session when the access credential has expired
 * but the refresh credential is still valid. Returns true when a usable managed
 * session exists afterwards.
 */
export async function refreshManagedSession(): Promise<boolean> {
  if (!hasAuthSession()) return false;
  return (await forceRefreshAuthSession()) !== null;
}

export async function getCurrentAuthUser(): Promise<RinspaceUser | null> {
  installLifecycleSync();
  if (!readStoredValue(window.localStorage, pendingLogoutKey)) {
    if (currentState === "authenticated" && currentEnvelope) {
      const user = userFromEnvelope(currentEnvelope);
      const hint = getStoredSession();
      if (user && hint?.sub === user.id) return user;
    }
    if (
      (currentState === "anonymous" || currentState === "revoked") &&
      currentEnvelope &&
      !getStoredSession()
    )
      return null;
  }
  if (!currentUserRequest) {
    currentUserRequest = (async () => {
      if (await recoverPendingLogout()) return null;
      const envelope = await getSessionEnvelope();
      if (envelope.status === "restoring") {
        await coordinatedRefresh();
        return userFromEnvelope(currentEnvelope || {});
      }
      if ((envelope.status === "anonymous" || envelope.status === "revoked") && envelope.csrfToken) {
        const legacyToken = legacyAccessToken();
        if (legacyToken) {
          const requestId = storedRequestID(pendingLegacyExchangeKey, "legacy");
          try {
            await postIdentity("/legacy/exchange", {
              legacyToken, requestId, clientLabel: browserClientLabel(),
            }, envelope.csrfToken);
          } catch (error) {
            if (error instanceof IdentityHttpError && error.code === "session.reauthentication_required")
              return null;
            throw error;
          }
          removeStoredValue(window.sessionStorage, pendingLegacyExchangeKey);
          const migrated = await getSessionEnvelope();
          const migratedUser = migrated.status === "authenticated" ? userFromEnvelope(migrated) : null;
          if (migratedUser) {
            purgeLegacyBrowserCredentials();
            publishState("authenticated");
          }
          return migratedUser;
        }
      }
      return envelope.status === "authenticated"
        ? userFromEnvelope(envelope)
        : null;
    })().finally(() => {
      currentUserRequest = null;
    });
  }
  return currentUserRequest;
}

// Managed browser requests authenticate with HttpOnly cookies. An empty value
// tells compatibility callers to rely on same-origin cookies.
export async function getAuthAccessToken() {
  await getCurrentAuthUser();
  return "";
}

async function cloudBaseAuthMutation(path: string, body: Record<string, unknown>) {
  const envId = publicEnv.cloudbaseEnvId;
  if (!envId) throw new Error("CloudBase 环境未配置。");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), authRequestTimeoutMs);
  try {
    const response = await fetch(`${cloudBaseAuthGateway}${path}?client_id=${encodeURIComponent(envId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok || typeof payload.error === "string") {
      throw new Error(typeof payload.error_description === "string" ? payload.error_description : "CloudBase 验证失败。");
    }
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function sendPhoneOtp(phone: string): Promise<OtpChallenge> {
  const envelope = await getSessionEnvelope();
  if (
    !envelope.csrfToken ||
    (envelope.status !== "anonymous" && envelope.status !== "revoked")
  ) {
    throw new Error("当前状态不能开始手机号核验。");
  }
  return sendCloudBasePhoneOtp(phone);
}

export async function sendCloudBasePhoneOtp(phone: string): Promise<OtpChallenge> {
  const digits = phone.replace(/\s+/g, "");
  if (!/^1[0-9]{10}$/.test(digits)) throw new Error("请输入有效的中国大陆手机号。");
  const phoneNumber = `+86${digits}`;
  const result = await cloudBaseAuthMutation("/verification", { phone_number: `+86 ${digits}`, target: "ANY" });
  if (typeof result.verification_id !== "string" || !result.verification_id) throw new Error("验证码请求缺少 verification_id。");
  return {
    verificationId: result.verification_id,
    phoneNumber,
    isUser: result.is_user === true,
    retryAfter: 60,
  };
}

export async function completePhoneOtp(challenge: OtpChallenge, token: string) {
  const envelope = currentEnvelope || (await getSessionEnvelope());
  if (!envelope.csrfToken)
    throw new Error("登录核验状态已过期，请重新发送验证码。");
  const requestId = createOpaqueID("verify");
  const verified = await cloudBaseAuthMutation("/verification/verify", {
    verification_id: challenge.verificationId, verification_code: token,
  });
  if (typeof verified.verification_token !== "string" || !verified.verification_token) {
    throw new Error("CloudBase 验证成功但缺少凭据。");
  }
  try {
    await postIdentity(
      "/cloudbase/exchange",
      { verificationToken: verified.verification_token, phone: challenge.phoneNumber, isUser: challenge.isUser, requestId, clientLabel: browserClientLabel() },
      envelope.csrfToken,
    );
  } catch (error) {
    if (
      error instanceof IdentityHttpError &&
      error.status === 409 &&
      error.payload?.admissionProof
    ) {
      throw new AdmissionRequiredError(error.payload.admissionProof);
    }
    throw error;
  }
  currentUserRequest = null;
  currentEnvelope = null;
  currentState = "restoring";
  const user = await getCurrentAuthUser();
  publishState(user ? "authenticated" : "anonymous");
  return user;
}

function admissionHeader(proof: string) {
  if (!proof.startsWith("rin_ad_") || proof.length < "rin_ad_".length + 32)
    throw new Error("登录准入证明无效，请重新核验手机号。");
  return { "X-Rinspace-Admission": proof };
}

export async function listAdmissionSessions(
  proof: string,
): Promise<AdmissionSession[]> {
  const response = await identityFetch("/login-admission/sessions", {
    headers: admissionHeader(proof),
  });
  const envelope = await decodeEnvelope(response);
  const items = (envelope as SessionEnvelope & { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("登录设备列表返回格式异常。");
  const parsed = items.filter(
    (item): item is AdmissionSession =>
      isRecord(item) &&
      typeof item.sid === "string" &&
      typeof item.clientLabel === "string" &&
      typeof item.createdAt === "string" &&
      typeof item.lastActiveAt === "string",
  );
  if (parsed.length !== items.length)
    throw new Error("登录设备列表返回格式异常。");
  return parsed;
}

export async function revokeAdmissionSession(proof: string, sid: string) {
  const envelope = currentEnvelope || (await getSessionEnvelope());
  if (!envelope.csrfToken)
    throw new Error("登录准入状态已过期，请重新核验手机号。");
  const response = await identityFetch(
    `/login-admission/sessions/${encodeURIComponent(sid)}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Rinspace-CSRF": envelope.csrfToken,
        "x-device-id": getDeviceId(),
        ...admissionHeader(proof),
      },
    },
  );
  await decodeEnvelope(response);
}

export async function completeAdmission(proof: string) {
  const envelope = currentEnvelope || (await getSessionEnvelope());
  if (!envelope.csrfToken)
    throw new Error("登录准入状态已过期，请重新核验手机号。");
  const requestId = storedRequestID(pendingAdmissionKey, "admit");
  await postIdentity(
    "/login-admission/complete",
    { requestId, clientLabel: browserClientLabel() },
    envelope.csrfToken,
    admissionHeader(proof),
  );
  removeStoredValue(window.sessionStorage, pendingAdmissionKey);
  currentUserRequest = null;
  currentEnvelope = null;
  currentState = "restoring";
  const user = await getCurrentAuthUser();
  publishState(user ? "authenticated" : "anonymous");
  return user;
}

export async function logoutCurrentSession() {
  const requestId = storedRequestID(pendingLogoutKey, "logout");
  removeStoredValue(window.localStorage, sessionHintKey);
  currentState = "revoked";
  publishState("revoked");
  try {
    const envelope = await getSessionEnvelope();
    if (envelope.status !== "anonymous" && envelope.status !== "revoked") {
      if (!envelope.csrfToken) throw new Error("退出核验状态不可用。");
      await postIdentity("/session/logout", { requestId }, envelope.csrfToken);
    }
    removeStoredValue(window.localStorage, pendingLogoutKey);
    currentState = "anonymous";
    currentEnvelope = { status: "anonymous" };
    publishState("anonymous");
  } catch (error) {
    writeStoredValue(window.localStorage, pendingLogoutKey, requestId);
    removeStoredValue(window.localStorage, sessionHintKey);
    currentState = "revoked";
    throw error;
  }
}

async function authenticatedEnvelope(): Promise<SessionEnvelope & { status: "authenticated"; csrfToken: string }> {
  await getCurrentAuthUser();
  const envelope = currentEnvelope;
  if (!envelope || envelope.status !== "authenticated" || !envelope.csrfToken)
    throw new Error("当前登录状态不可用于安全设置。");
  return envelope as SessionEnvelope & { status: "authenticated"; csrfToken: string };
}

async function identityMutation(
  path: string,
  method: "POST" | "DELETE",
  body: Record<string, unknown>,
) {
  const envelope = await authenticatedEnvelope();
  const response = await identityFetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": envelope.csrfToken,
      "x-device-id": getDeviceId(),
    },
    body: JSON.stringify(body),
  });
  return decodeEnvelope(response);
}

function checkedItems<T>(value: SessionEnvelope, check: (item: unknown) => item is T) {
  const items = (value as SessionEnvelope & { items?: unknown }).items;
  if (!Array.isArray(items) || !items.every(check))
    throw new Error("安全设置返回格式异常。");
  return items;
}

export async function listIdentityDevices(): Promise<IdentityDeviceSession[]> {
  await authenticatedEnvelope();
  const response = await identityFetch("/sessions");
  return checkedItems(await decodeEnvelope(response), (item): item is IdentityDeviceSession =>
    isRecord(item) && typeof item.sid === "string" && typeof item.clientLabel === "string" &&
    typeof item.current === "boolean" && typeof item.revoked === "boolean" &&
    typeof item.cleanupComplete === "boolean" && isRecord(item.runtimes));
}

export async function listIdentityCredentials(): Promise<IdentityPersonalCredential[]> {
  await authenticatedEnvelope();
  const response = await identityFetch("/credentials");
  return checkedItems(await decodeEnvelope(response), (item): item is IdentityPersonalCredential =>
    isRecord(item) && typeof item.ref === "string" && typeof item.provider === "string" &&
    typeof item.kind === "string" && typeof item.label === "string" &&
    Array.isArray(item.scopes) && item.scopes.every((scope) => typeof scope === "string") &&
    typeof item.state === "string");
}

export async function beginIdentityStepUp(purpose: string, target: string): Promise<StepUpChallenge> {
  const result = await identityMutation("/step-up", "POST", { purpose, target });
  if (!result.challengeId) throw new Error("安全核验请求缺少 challengeId。");
  return { challengeId: result.challengeId, retryAfter: result.retryAfter };
}

export async function completeIdentityStepUp(purpose: string, target: string, challengeId: string, code: string) {
  const result = await identityMutation("/step-up", "POST", { purpose, target, challengeId, code });
  const proof = (result as SessionEnvelope & { stepUpProof?: unknown }).stepUpProof;
  if (typeof proof !== "string" || !proof) throw new Error("安全核验结果缺少操作证明。");
  return proof;
}

export async function completeCloudBaseStepUp(purpose: string, target: string, challenge: OtpChallenge, code: string) {
  if (publicEnv.localRealClient) {
    const result = await identityMutation('/step-up/cloudbase', 'POST', {
      purpose, target, phone: challenge.phoneNumber, verificationId: challenge.verificationId, code,
    });
    const proof = (result as SessionEnvelope & { stepUpProof?: unknown }).stepUpProof;
    if (typeof proof !== 'string' || !proof) throw new Error('安全核验结果缺少操作证明。');
    return proof;
  }
  const verified = await cloudBaseAuthMutation("/verification/verify", {
    verification_id: challenge.verificationId, verification_code: code,
  });
  if (typeof verified.verification_token !== "string" || !verified.verification_token) {
    throw new Error("CloudBase 安全核验缺少凭据。");
  }
  const result = await identityMutation("/step-up/cloudbase", "POST", {
    purpose, target, phone: challenge.phoneNumber, verificationToken: verified.verification_token,
  });
  const proof = (result as SessionEnvelope & { stepUpProof?: unknown }).stepUpProof;
  if (typeof proof !== "string" || !proof) throw new Error("安全核验结果缺少操作证明。");
  return proof;
}

export async function revokeIdentityDevice(sid: string, stepUpProof: string) {
  return identityMutation(`/sessions/${encodeURIComponent(sid)}`, "DELETE", { stepUpProof });
}

export async function sendIdentityStepUpOtp(purpose: string, target: string, phone: string): Promise<OtpChallenge> {
  if (!publicEnv.localRealClient) return sendCloudBasePhoneOtp(phone);
  const result = await identityMutation('/step-up/cloudbase/challenge', 'POST', { purpose, target, phone });
  const value: unknown = result;
  if (!isRecord(value) || typeof value.verificationId !== 'string' || !value.verificationId ||
      typeof value.phoneNumber !== 'string' || !/^\+861[0-9]{10}$/.test(value.phoneNumber) ||
      value.isUser !== true || typeof value.retryAfter !== 'number') throw new Error('安全核验请求返回格式异常。');
  return { verificationId: value.verificationId, phoneNumber: value.phoneNumber, isUser: true, retryAfter: value.retryAfter };
}

export async function revokeAllIdentityDevices(stepUpProof: string) {
  const result = await identityMutation("/sessions/revoke-all", "POST", { confirm: true, stepUpProof });
  clearStoredSession();
  return result;
}

export async function revokeIdentityCredential(ref: string, stepUpProof: string) {
  return identityMutation(`/credentials/${encodeURIComponent(ref)}`, "DELETE", { stepUpProof });
}

export async function revokeAllIdentityPersonalAccess(stepUpProof: string) {
  const result = await identityMutation("/security/revoke-all", "POST", { confirm: true, stepUpProof });
  clearStoredSession();
  return result;
}

function browserClientLabel() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return `${mobile ? "Mobile" : "Desktop"} browser`;
}

import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The gateway is always intercepted by each test's fetch mock. Never require
// private deployment env files or a real SMS provider to run this suite.
vi.mock("@/app/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/config/env")>();
  return {
    ...actual,
    publicEnv: Object.freeze({
      ...actual.publicEnv,
      cloudbaseEnvId: "synthetic-auth-fixture",
      cloudbaseAccessKey: "",
      localRealClient: false,
    }),
  };
});

const hintKey = "rinspace-auth-hint";
const legacyKey = "rinspace-auth-session";
const pendingLogoutKey = "rinspace-logout-pending";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("BroadcastChannel", undefined);
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("legacy proof remains available until a managed session is established", async () => {
  window.localStorage.setItem(legacyKey, JSON.stringify({ access_token: "legacy-proof" }));
  await import("./phoneAuth");
  expect(window.localStorage.getItem(legacyKey)).toContain("legacy-proof");
});

test("a valid legacy proof is exchanged once and removed only after managed recovery", async () => {
  window.localStorage.setItem(legacyKey, JSON.stringify({ access_token: "legacy-proof" }));
  const fetcher = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ status: "anonymous", csrfToken: "preauth-csrf" }))
    .mockResolvedValueOnce(jsonResponse({ status: "authenticated", currentSession: { sid: "sid-new" } }))
    .mockResolvedValueOnce(jsonResponse({ status: "authenticated", csrfToken: "managed-csrf", user: { id: "user-1" } }));
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.getCurrentAuthUser()).resolves.toMatchObject({ id: "user-1" });
  expect(window.localStorage.getItem(legacyKey)).toBeNull();
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("/legacy/exchange");
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({ legacyToken: "legacy-proof" });
});

test("a rotated session adopts the CSRF token minted by the refresh response", async () => {
  let sessionReads = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith("/session/refresh"))
      return jsonResponse({
        status: "authenticated",
        generation: 2,
        csrfToken: "csrf-rotated",
      });
    sessionReads += 1;
    if (sessionReads === 1)
      return jsonResponse({
        status: "restoring",
        canRefresh: true,
        csrfToken: "csrf-stale",
      });
    // Deliberately omits csrfToken: the token adopted from the refresh response
    // has to survive an envelope that does not repeat it.
    return jsonResponse({
      status: "authenticated",
      user: { id: "user-1", username: "rin" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.forceRefreshAuthSession()).resolves.toMatchObject({ sub: "user-1" });
  expect(auth.authHeaders()["X-Rinspace-CSRF"]).toBe("csrf-rotated");
});

test("five callers share one cookie refresh and no browser credential is persisted", async () => {
  window.localStorage.setItem(
    legacyKey,
    JSON.stringify({
      access_token: "old-access",
      refresh_token: "old-refresh",
    }),
  );
  let sessionReads = 0;
  let refreshes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/session/refresh")) {
        refreshes += 1;
        return jsonResponse({ status: "authenticated", generation: 2 });
      }
      sessionReads += 1;
      if (sessionReads < 3) {
        return jsonResponse({
          status: "restoring",
          canRefresh: true,
          csrfToken: "csrf-refresh",
        });
      }
      return jsonResponse({
        status: "authenticated",
        csrfToken: "csrf-current",
        user: {
          id: "user-1",
          role: "author",
          sessionEpoch: 4,
          identityVersion: 8,
        },
      });
    }),
  );

  const auth = await import("./phoneAuth");
  const tokens = await Promise.all(
    Array.from({ length: 5 }, () => auth.getAuthAccessToken()),
  );

  expect(tokens).toEqual(["", "", "", "", ""]);
  expect(refreshes).toBe(1);
  expect(window.localStorage.getItem(legacyKey)).toBeNull();
  expect(window.localStorage.getItem(hintKey)).toContain('"sub":"user-1"');
  expect(window.localStorage.getItem(hintKey)).not.toContain("access");
  expect(window.localStorage.getItem(hintKey)).not.toContain("refresh");
  expect(auth.getStoredSession()).toMatchObject({
    sub: "user-1",
    managed: true,
  });
  expect(auth.authHeaders()).toMatchObject({
    "X-Rinspace-CSRF": "csrf-current",
  });
  expect(auth.authHeaders()).not.toHaveProperty("Authorization");
});

test("refresh reuses the browser-wide request id and clears it after confirmation", async () => {
  window.localStorage.setItem("rinspace-refresh-request-id", "refresh-shared-id");
  let reads = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).endsWith("/session/refresh")) return jsonResponse({ status: "authenticated" });
    reads += 1;
    return reads < 3
      ? jsonResponse({ status: "restoring", canRefresh: true, csrfToken: "csrf-refresh" })
      : jsonResponse({ status: "authenticated", csrfToken: "csrf-current", user: { id: "user-1" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.getCurrentAuthUser()).resolves.toMatchObject({ id: "user-1" });
  const refresh = fetcher.mock.calls.find(([input]) => String(input).endsWith("/session/refresh"));
  expect(JSON.parse(String(refresh?.[1]?.body))).toMatchObject({ requestId: "refresh-shared-id" });
  expect(window.localStorage.getItem("rinspace-refresh-request-id")).toBeNull();
});

test("HTTP 401 clears the local hint and enters the revoked state", async () => {
  window.localStorage.setItem(hintKey, JSON.stringify({ sub: "user-1" }));
  const fetcher = vi
    .fn()
    .mockResolvedValue(jsonResponse({ code: "session.revoked" }, 401));
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.getCurrentAuthUser()).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(auth.getStoredSession()).toBeNull();
  expect(auth.getSessionPresentation()).toBe("revoked");
});

test("a transient session 401 is confirmed for a cookie-only recoverable session", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ status: "anonymous" }, 401))
    .mockResolvedValueOnce(
      jsonResponse({
        status: "authenticated",
        csrfToken: "csrf-current",
        user: { id: "user-1", username: "rin" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.getCurrentAuthUser()).resolves.toMatchObject({
    id: "user-1",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(auth.getStoredSession()?.sub).toBe("user-1");
  expect(auth.getSessionPresentation()).toBe("authenticated");
});

test("a stale anonymous read does not discard a newly rotated browser session", async () => {
  window.localStorage.setItem(hintKey, JSON.stringify({ sub: "user-1" }));
  const fetcher = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ status: "anonymous", csrfToken: "preauth-csrf" }))
    .mockResolvedValueOnce(jsonResponse({ status: "authenticated", csrfToken: "session-csrf", user: { id: "user-1" } }));
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.getCurrentAuthUser()).resolves.toMatchObject({ id: "user-1" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(auth.getStoredSession()?.sub).toBe("user-1");
  expect(auth.getSessionPresentation()).toBe("authenticated");
});

test("two unconfirmed session 401 responses preserve the session hint for retry", async () => {
  window.localStorage.setItem(hintKey, JSON.stringify({ sub: "user-1" }));
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(jsonResponse({ status: "anonymous" }, 401)),
    );
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.getCurrentAuthUser()).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(auth.getStoredSession()?.sub).toBe("user-1");
  expect(auth.getSessionPresentation()).toBe("temporarily_unavailable");
});

test.each([403, 503])(
  "HTTP %s preserves the non-secret user hint and reports a retryable state",
  async (status) => {
    window.localStorage.setItem(
      hintKey,
      JSON.stringify({ sub: "user-1", sessionEpoch: 2 }),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ code: `http.${status}` }, status)),
    );
    const auth = await import("./phoneAuth");

    await expect(auth.getCurrentAuthUser()).rejects.toThrow(
      "Rinspace Identity 请求失败",
    );
    expect(auth.getStoredSession()?.sub).toBe("user-1");
    expect(auth.getSessionPresentation()).toBe("temporarily_unavailable");
  },
);

test("a failed logout stays pending and is completed before session recovery", async () => {
  window.localStorage.setItem(hintKey, JSON.stringify({ sub: "user-1" }));
  let failLogout = true;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith("/session/logout")) {
      if (failLogout) throw new TypeError("offline");
      return new Response(null, { status: 204 });
    }
    return jsonResponse({
      status: "authenticated",
      csrfToken: "csrf-logout",
      user: { id: "user-1", sessionEpoch: 1 },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  await expect(auth.logoutCurrentSession()).rejects.toThrow("offline");
  expect(auth.getStoredSession()).toBeNull();
  expect(window.localStorage.getItem(pendingLogoutKey)).toBeTruthy();

  failLogout = false;
  await expect(auth.getCurrentAuthUser()).resolves.toBeNull();
  expect(window.localStorage.getItem(pendingLogoutKey)).toBeNull();
  expect(
    fetcher.mock.calls.filter(([input]) =>
      String(input).endsWith("/session/logout"),
    ),
  ).toHaveLength(2);
});

test("OTP requests use the configured CloudBase service without creating a CloudBase browser session", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ status: "anonymous", csrfToken: "preauth-csrf" }),
    )
    .mockResolvedValueOnce(
      jsonResponse({ verification_id: "verification-1", is_user: true }),
    );
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");

  const challenge = await auth.sendPhoneOtp("13700000000");
  expect(challenge).toMatchObject({
    verificationId: "verification-1",
    phoneNumber: "+8613700000000",
  });
  const [, init] = fetcher.mock.calls[1] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toMatchObject({
    phone_number: "+86 13700000000",
    target: "ANY",
  });
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("/auth/v1/verification");
  expect(String(fetcher.mock.calls[1]?.[0])).toBe(
    "https://synthetic-auth-fixture.api.tcloudbasegateway.com/auth/v1/verification?client_id=synthetic-auth-fixture",
  );
  expect(new Headers(init.headers).get("x-device-id")).toBeTruthy();
  expect(window.localStorage.getItem(legacyKey)).toBeNull();
});

test("verified CloudBase UID creates an independent Rinspace browser session", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ status: "anonymous", csrfToken: "preauth-csrf" }),
    )
    .mockResolvedValueOnce(
      jsonResponse({ verification_id: "verification-1", is_user: true }),
    )
    .mockResolvedValueOnce(
      jsonResponse({ verification_token: "one-time-proof" }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        status: "authenticated",
        currentSession: { sid: "sid-new" },
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        status: "authenticated",
        csrfToken: "session-csrf",
        user: { id: "user-1" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const auth = await import("./phoneAuth");
  const challenge = await auth.sendPhoneOtp("13700000000");
  await expect(auth.completePhoneOtp(challenge, "123456")).resolves.toMatchObject({
    id: "user-1",
  });
  expect(String(fetcher.mock.calls[2]?.[0])).toContain("/verification/verify");
  expect(String(fetcher.mock.calls[3]?.[0])).toContain("/cloudbase/exchange");
  expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toMatchObject({
    verificationToken: "one-time-proof", isUser: true,
  });
  expect(window.localStorage.getItem(legacyKey)).toBeNull();
});

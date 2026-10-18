import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("./phoneAuth", () => ({
  getAuthAccessToken: vi.fn(async () => ""),
  hasAuthSession: vi.fn(() => true),
  authHeaders: vi.fn(() => ({ "X-Rinspace-CSRF": "own-session-csrf" })),
  getAuthDeviceId: vi.fn(() => "own-device"),
}));

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test("awaits the cookie bootstrap after Native SSO before reporting ready", async () => {
  const calls: string[] = [];
  let finish: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push(`${options?.method || "GET"} ${String(input)}`);
    return options?.method === "POST" ? new Response(null, { status: 204 }) : pending;
  });
  vi.stubGlobal("fetch", fetcher);
  const { syncGiteaSession } = await import("./gitea");
  let ready = false;
  const result = syncGiteaSession().then(value => { ready = value; });
  await vi.waitFor(() => expect(calls).toHaveLength(2));
  expect(ready).toBe(false);
  expect(calls[0]).toMatch(/^POST .*\/api\/gitea\/sso$/);
  expect(calls[1]).toBe("GET /repos/");
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  finish?.(new Response("own repository dashboard"));
  await result;
  expect(ready).toBe(true);
});

test("recovers a stale Gitea cookie with only one extra safe GET", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("inactive", { status: 401 }))
    .mockResolvedValueOnce(new Response("dashboard"));
  vi.stubGlobal("fetch", fetcher);
  const { syncGiteaSession } = await import("./gitea");
  await expect(syncGiteaSession()).resolves.toBe(true);
  expect(fetcher.mock.calls.map(([input, options]) => [String(input), options?.method || "GET"]))
    .toEqual([[expect.stringMatching(/\/api\/gitea\/sso$/), "POST"], ["/repos/", "GET"], ["/repos/", "GET"]]);
});

test("does not loop on a persistent authorization failure", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValue(new Response("inactive", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const { syncGiteaSession } = await import("./gitea");
  await expect(syncGiteaSession()).rejects.toThrow("initialization failed (401)");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test("does not retry other bootstrap failures", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const { syncGiteaSession } = await import("./gitea");
  await expect(syncGiteaSession()).rejects.toThrow("initialization failed (503)");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("coalesces concurrent page and topbar initialization", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("dashboard"));
  vi.stubGlobal("fetch", fetcher);
  const { syncGiteaSession } = await import("./gitea");
  await expect(Promise.all([syncGiteaSession(), syncGiteaSession(), syncGiteaSession()]))
    .resolves.toEqual([true, true, true]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("reports SSO failures and allows a later explicit attempt", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "expired" }), { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("dashboard"));
  vi.stubGlobal("fetch", fetcher);
  const { syncGiteaSession } = await import("./gitea");
  await expect(syncGiteaSession()).rejects.toThrow("expired");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(syncGiteaSession()).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

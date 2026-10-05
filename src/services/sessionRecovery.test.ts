import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publicEnv } from "app/config/env";

vi.mock("./phoneAuth", () => ({
  authHeaders: vi.fn(() => ({ "X-Rinspace-CSRF": "fresh-csrf" })),
  getAuthAccessToken: vi.fn(async () => ""),
  hasAuthSession: vi.fn(() => true),
  refreshManagedSession: vi.fn(async () => true),
}));

const apiBase = `${publicEnv.publicBasePath || ""}/api`;

function jsonResponse(status: number, body = "{}") {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("managed session recovery interceptor", () => {
  const originalFetch = window.fetch;
  let base: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    base = vi.fn();
    window.fetch = base as unknown as typeof window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  async function install() {
    const phoneAuth = await import("./phoneAuth");
    const { installManagedSessionRecovery } = await import("./sessionRecovery");
    installManagedSessionRecovery();
    return phoneAuth;
  }

  it("refreshes once and replays a 401 business request with the fresh CSRF token", async () => {
    const phoneAuth = await install();
    base
      .mockResolvedValueOnce(jsonResponse(401, '{"message":"unauthorized"}'))
      .mockResolvedValueOnce(jsonResponse(200, '{"ok":true}'));

    const response = await window.fetch(`${apiBase}/content`, {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(phoneAuth.refreshManagedSession).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Rinspace-CSRF": "fresh-csrf" }),
      }),
    );
  });

  it("returns the original 401 when the session cannot be refreshed", async () => {
    const phoneAuth = await install();
    (phoneAuth.refreshManagedSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      false,
    );
    base.mockResolvedValueOnce(jsonResponse(401, '{"message":"unauthorized"}'));

    const response = await window.fetch(`${apiBase}/file`, { method: "POST" });

    expect(response.status).toBe(401);
    expect(phoneAuth.refreshManagedSession).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("never touches identity endpoints or anonymous requests", async () => {
    const phoneAuth = await install();
    base.mockResolvedValue(jsonResponse(401, '{"message":"unauthorized"}'));

    const identity = await window.fetch(`${apiBase}/identity/v1/session`, {
      method: "POST",
    });
    expect(identity.status).toBe(401);
    expect(phoneAuth.refreshManagedSession).not.toHaveBeenCalled();

    (phoneAuth.hasAuthSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const anonymous = await window.fetch(`${apiBase}/content`);
    expect(anonymous.status).toBe(401);
    expect(phoneAuth.refreshManagedSession).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("leaves successful and non-api responses untouched", async () => {
    const phoneAuth = await install();
    base.mockResolvedValue(jsonResponse(200, '{"ok":true}'));

    await window.fetch(`${apiBase}/content`);
    await window.fetch("/elsewhere.json");

    expect(phoneAuth.refreshManagedSession).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(2);
  });
});

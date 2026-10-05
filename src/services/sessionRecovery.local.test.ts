import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("app/config/env", () => ({
  publicEnv: { publicBasePath: "", localRealClient: true },
}));
vi.mock("./phoneAuth", () => ({
  authHeaders: vi.fn(() => ({ "X-Rinspace-CSRF": "fresh-csrf" })),
  getAuthAccessToken: vi.fn(async () => ""),
  hasAuthSession: vi.fn(() => true),
  refreshManagedSession: vi.fn(async () => true),
}));

const originalFetch = window.fetch;
let transport: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  transport = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
  window.fetch = transport as unknown as typeof window.fetch;
});
afterEach(() => {
  window.fetch = originalFetch;
});

it.each(["POST", "PUT", "PATCH", "DELETE"])(
  "does not refresh/replay a local %s after an upstream 401",
  async (method) => {
    const auth = await import("./phoneAuth");
    const { installManagedSessionRecovery } = await import("./sessionRecovery");
    installManagedSessionRecovery();
    const response = await window.fetch("/api/file", {
      method,
      body: new FormData(),
    });
    expect(response.status).toBe(401);
    expect(transport).toHaveBeenCalledOnce();
    expect(auth.refreshManagedSession).not.toHaveBeenCalled();
  },
);

it.each(["GET", "HEAD"])(
  "retains one recovery attempt for a local %s",
  async (method) => {
    const auth = await import("./phoneAuth");
    const { installManagedSessionRecovery } = await import("./sessionRecovery");
    installManagedSessionRecovery();
    transport
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect((await window.fetch("/api/file", { method })).status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(auth.refreshManagedSession).toHaveBeenCalledOnce();
  },
);

it("does not replay a body-owning Request object", async () => {
  const auth = await import("./phoneAuth");
  const { installManagedSessionRecovery } = await import("./sessionRecovery");
  installManagedSessionRecovery();
  expect(
    (
      await window.fetch(
        new Request(`${window.location.origin}/api/file`, {
          method: "POST",
          body: "original",
        }),
      )
    ).status,
  ).toBe(401);
  expect(transport).toHaveBeenCalledOnce();
  expect(auth.refreshManagedSession).not.toHaveBeenCalled();
});

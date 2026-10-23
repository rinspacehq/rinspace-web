import { expect, test, vi } from "vitest";

const session = vi.hoisted(() => ({
  getAuthAccessToken: vi.fn(async () => ""),
  getStoredSession: vi.fn(() => null),
  getCurrentAuthUser: vi.fn(async () => ({ id: "testbot" })),
}));

vi.mock("./phoneAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./phoneAuth")>()),
  ...session,
}));

import { createContent } from "./feed";

test("content creation reaches the server when the authenticated cookie has no storage hint", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ message: "upstream rejected" }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetcher);
  try {
    await expect(createContent({
      type: "blog", title: "Test", body: "Test body", tags: [],
      idempotencyKey: "test-create-command",
    })).rejects.toThrow("upstream rejected");
    expect(session.getCurrentAuthUser).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/api\/content$/), expect.objectContaining({ method: "POST" }));
  } finally {
    vi.unstubAllGlobals();
  }
});

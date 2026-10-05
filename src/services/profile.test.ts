import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveProfile, uploadAvatarFile, uploadCoverFile } from "./profile";
import { getAuthAccessToken } from "./phoneAuth";

vi.mock("./phoneAuth", () => ({
  authHeaders: () => ({}),
  getAuthAccessToken: vi.fn().mockResolvedValue(""),
  getCurrentAuthUser: vi.fn(),
}));

describe("managed profile requests", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the Rinspace profile with the host session and no supplier token", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ uid: "managed-user", nickname: "Rin User" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    await saveProfile(
      { id: "managed-user" },
      {
        username: "@rin-user",
        nickname: "Rin User",
        avatarDataUrl: "https://cdn.example/avatar.png",
      },
    );

    expect(getAuthAccessToken).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(String(init.body))).toMatchObject({
      username: "rin-user",
      nickname: "Rin User",
    });
  });

  it.each([
    ["avatar", uploadAvatarFile],
    ["cover", uploadCoverFile],
  ] as const)(
    "uploads a %s using the managed host session",
    async (source, upload) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(`https://cdn.example/${source}.png`), {
          status: 200,
        }),
      );
      vi.stubGlobal("fetch", fetcher);

      const result = await upload(
        { id: "managed-user" },
        new File(["png"], `${source}.png`, { type: "image/png" }),
      );

      expect(result.fileID).toBe(`https://cdn.example/${source}.png`);
      const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
      expect(init.credentials).toBe("same-origin");
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get("source")).toBe(source);
    },
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthAccessToken } from "@/services/phoneAuth";
import {
  createOuterTweetComposerAdapter,
  loadMastodonAccountStatuses,
} from "./mastodonSocial";

vi.mock("@/services/phoneAuth", () => ({
  authHeaders: (token: string) =>
    token ? { Authorization: `Bearer ${token}` } : {},
  getAuthAccessToken: vi.fn(),
  hasAuthSession: vi.fn(() => false),
}));

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(getAuthAccessToken).mockResolvedValue("outer-access-token");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mastodon social bridge client", () => {
  it("uses the current outer session and preserves the idempotency key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          maxCharacters: 500,
          maxMediaAttachments: 4,
          maxMediaBytes: 10_000_000,
          acceptedMediaTypes: ["image/*"],
          pollMinOptions: 2,
          pollMaxOptions: 4,
          pollMaxOptionCharacters: 50,
          pollDurations: [300],
          languages: [{ code: "zh-CN", label: "简体中文" }],
          defaultLanguage: "zh-CN",
          defaultVisibility: "public",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "7001",
          url: "/p/7001",
          createdAt: "2026-09-07T10:00:00Z",
        }),
      );
    const adapter = createOuterTweetComposerAdapter();

    await adapter.loadConfig();
    await adapter.publish(
      {
        text: "真实发布",
        sensitive: false,
        spoilerText: "",
        visibility: "public",
        language: "zh-CN",
        mediaIds: [],
        poll: null,
        idempotencyKey: "tweet-test-1234567890",
      },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/rinspace/api/social/tweet-composer/config",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer outer-access-token",
        }),
      }),
    );
    const publishInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(publishInit.headers).toMatchObject({
      Authorization: "Bearer outer-access-token",
      "Idempotency-Key": "tweet-test-1234567890",
    });
    expect(JSON.parse(String(publishInit.body))).toMatchObject({
      text: "真实发布",
    });
  });

  it("loads a public profile projection without exposing an application credential", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accountId: "44",
        items: [
          {
            id: "7001",
            url: "/p/7001",
            content: "<p>真实推文</p>",
            spoilerText: "",
            visibility: "public",
            language: "zh-CN",
            createdAt: "2026-09-07T10:00:00Z",
            repliesCount: 1,
            reblogsCount: 2,
            favouritesCount: 3,
            media: [],
          },
        ],
        nextMaxId: null,
      }),
    );

    const page = await loadMastodonAccountStatuses("101");

    expect(page.items[0]?.content).toContain("真实推文");
    expect(fetchMock).toHaveBeenCalledWith(
      "/rinspace/api/social/accounts/101/statuses",
      { signal: undefined, headers: { Accept: "application/json" } },
    );
    expect(getAuthAccessToken).not.toHaveBeenCalled();
  });
});

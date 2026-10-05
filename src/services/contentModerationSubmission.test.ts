import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createContent, parseContentModerationSubmission } from "./feed";

const sessionKey = "rinspace-auth-hint";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(
    sessionKey,
    JSON.stringify({
      sub: "moderation-author",
      sessionEpoch: 1,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("content moderation submission response", () => {
  it("accepts a durable AI second-review response", () => {
    expect(
      parseContentModerationSubmission({
        submissionId: "42",
        state: "ai_review_pending",
        message: "一审未通过，已进入 AI 二审。",
      }),
    ).toEqual({
      submissionId: "42",
      state: "ai_review_pending",
      message: "一审未通过，已进入 AI 二审。",
      contentId: undefined,
      contentSlug: undefined,
    });
  });

  it("rejects unknown workflow states", () => {
    expect(
      parseContentModerationSubmission({
        submissionId: "42",
        state: "provider_label",
        message: "internal result",
      }),
    ).toBeNull();
  });

  it("reuses the same create key while an async submission remains in review", async () => {
    const requestPayloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (requestInput: RequestInfo | URL, init?: RequestInit) => {
        if (String(requestInput).endsWith("/api/identity/v1/session")) {
          return new Response(
            JSON.stringify({ status: "authenticated", csrfToken: "csrf", user: { id: "moderation-author" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (typeof init?.body !== "string")
          throw new Error("expected a JSON request body");
        requestPayloads.push(JSON.parse(init.body) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            submissionId: "84",
            state: "ai_review_pending",
            message: "一审未通过，已进入 AI 二审。",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const input = {
      type: "blog" as const,
      status: "published" as const,
      repositoryStatus: "published" as const,
      sourceVisibility: "open" as const,
      sourceVisibilityIntent: "open" as const,
      title: "异步审核文章",
      body: "[[RIN_WRITER]]<p>正文</p>[[/RIN_WRITER]]",
      tags: ["general"],
      editor: "rin" as const,
    };

    const first = await createContent(input);
    const replay = await createContent(input);

    expect(first).toEqual(replay);
    expect(requestPayloads).toHaveLength(2);
    expect(requestPayloads[0].idempotencyKey).toEqual(expect.any(String));
    expect(requestPayloads[1].idempotencyKey).toBe(
      requestPayloads[0].idempotencyKey,
    );
    expect(window.sessionStorage.length).toBe(1);
  });
});

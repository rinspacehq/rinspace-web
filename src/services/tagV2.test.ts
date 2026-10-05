import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authHeaders: (token: string) =>
    token ? { Authorization: `Bearer ${token}` } : {},
  forceRefreshAuthSession: vi.fn(async () => null),
  getAuthAccessToken: vi.fn(async () => "access-token"),
  getAuthDeviceId: vi.fn(() => "device-id"),
  getStoredSession: vi.fn(() => null),
}));

vi.mock("@/app/config/env", () => ({
  publicEnv: { publicBasePath: "" },
}));
vi.mock("./phoneAuth", () => authMocks);

import { compareCanonicalTags, createCanonicalTag, loadCanonicalTagConnections, loadTagStatements } from "./tagV2";

describe("Tag v2 private bridge routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.getAuthAccessToken.mockResolvedValue("access-token");
  });

  it("keeps public reads out of the Mastodon /api/v2 namespace for a root-mounted UI", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response('{"items":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(compareCanonicalTags("逆向工程")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/rinspace/api/v2/tags/candidates?name=%E9%80%86%E5%90%91%E5%B7%A5%E7%A8%8B",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  it("posts authenticated creations to the current private bridge", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          operationId: "operation-1",
          state: "pending",
          tag: {
            id: 73,
            displayName: "逆向工程",
            normalizedName: "逆向工程",
            usageScope: "软件与硬件分析",
            parentTagIds: [],
            version: 1,
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createCanonicalTag({
      displayName: "逆向工程",
      usageScope: "软件与硬件分析",
      parentTagIds: [],
      idempotencyKey: "request-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/rinspace/api/v2/tags",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "x-device-id": "device-id",
        }),
      }),
    );
  });

  it("parses readable parent and child references from relationship responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        tag: { id: 50, displayName: "代数几何", normalizedName: "代数几何", usageScope: "数学", parentTagIds: [2], version: 3 },
        parentTagIds: [2],
        childTagIds: [10750],
        parentTags: [{ id: 2, displayName: "几何", normalizedName: "几何" }],
        childTags: [{ id: 10750, displayName: "导出代数几何", normalizedName: "导出代数几何" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(loadCanonicalTagConnections(50, "backlinks")).resolves.toEqual(expect.objectContaining({
      parentTags: [{ id: 2, displayName: "几何", normalizedName: "几何" }],
      childTags: [{ id: 10750, displayName: "导出代数几何", normalizedName: "导出代数几何" }],
    }));
  });

  it("preserves readable names on prerequisite statements", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        items: [{
          id: "statement-1",
          subjectTagId: 50,
          subjectTagDisplayName: "代数几何",
          predicateTagId: 70,
          objectTagId: 6,
          objectTagDisplayName: "交换代数",
          evidence: {},
          reviewState: "approved",
          rank: 0,
          reason: "先修",
          version: 1,
          createdAt: "2026-09-25T00:00:00Z",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(loadTagStatements(50, "requires")).resolves.toEqual([
      expect.objectContaining({ subjectTagDisplayName: "代数几何", objectTagDisplayName: "交换代数" }),
    ]);
  });
});

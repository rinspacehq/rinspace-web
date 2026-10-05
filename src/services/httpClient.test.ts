import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./phoneAuth", () => ({
  authHeaders: (token: string) =>
    token
      ? { Authorization: `Bearer ${token}`, "x-device-id": "device-id" }
      : {},
  getAuthAccessToken: vi.fn(async () => "access-token"),
  hasAuthSession: vi.fn(() => false),
}));
import { requestAdminJson, requestJson, ServiceError } from "./httpClient";

describe("shared service client contract", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("locks base URL, pagination, credentials, auth and JSON serialization", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      requestJson<{ ok: boolean }>("articles", {
        method: "POST",
        auth: "required",
        query: { page: 2, pageSize: 20, ignored: undefined },
        body: { title: "测试" },
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/rinspace/api/articles?page=2&pageSize=20",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: '{"title":"测试"}',
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "x-device-id": "device-id",
        }),
      }),
    );
  });
  it("preserves structured server errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"message":"权限不足"}', { status: 403 }),
    );
    await expect(requestJson("admin", { auth: "optional" })).rejects.toEqual(
      expect.objectContaining({
        message: "权限不足",
        status: 403,
        payload: { message: "权限不足" },
      }) as ServiceError,
    );
  });
  it("uses the admin BFF boundary and its unified error DTO", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          '{"error":{"code":"permission_denied","message":"没有运营权限","correlationId":"correlation-1234"}}',
          { status: 403 },
        ),
      );
    await expect(
      requestAdminJson("operations/capabilities", { auth: "required" }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "没有运营权限",
        status: 403,
      }) as ServiceError,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/rinspace/admin/api/operations/capabilities",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });
});

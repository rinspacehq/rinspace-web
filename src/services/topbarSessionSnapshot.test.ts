import { beforeEach, describe, expect, it } from "vitest";

import {
  readTopbarSessionSnapshot,
  topbarSessionDisplayName,
  writeTopbarSessionSnapshot,
  type TopbarSessionSnapshot,
} from "./topbarSessionSnapshot";

const sessionCacheKey = "rinspace-topbar-session-cache";

function seedStoredSession() {
  window.localStorage.setItem(
    "rinspace-auth-hint",
    JSON.stringify({
      sub: "user-1",
      sessionEpoch: 1,
    }),
  );
}

function snapshot(
  overrides: Partial<TopbarSessionSnapshot> = {},
): TopbarSessionSnapshot {
  return {
    user: { id: "user-1" },
    profile: null,
    nickname: "",
    avatarDataUrl: "",
    publicUserId: "",
    isAdmin: false,
    isModerator: false,
    cachedAt: 1,
    ...overrides,
  };
}

describe("topbarSessionSnapshot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedStoredSession();
  });

  it("removes a cached session that has no display identity", () => {
    window.localStorage.setItem(sessionCacheKey, JSON.stringify(snapshot()));

    expect(readTopbarSessionSnapshot()).toBeNull();
    expect(window.localStorage.getItem(sessionCacheKey)).toBeNull();
  });

  it("keeps a public user id as a valid display identity", () => {
    window.localStorage.setItem(
      sessionCacheKey,
      JSON.stringify(snapshot({ publicUserId: "reader" })),
    );

    const cachedSnapshot = readTopbarSessionSnapshot();

    expect(cachedSnapshot).not.toBeNull();
    expect(cachedSnapshot && topbarSessionDisplayName(cachedSnapshot)).toBe(
      "reader",
    );
  });

  it("does not persist a snapshot without a display identity", () => {
    window.localStorage.setItem(
      sessionCacheKey,
      JSON.stringify(snapshot({ nickname: "旧昵称" })),
    );

    writeTopbarSessionSnapshot(snapshot());

    expect(window.localStorage.getItem(sessionCacheKey)).toBeNull();
  });
});

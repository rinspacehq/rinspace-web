import { afterEach, expect, test, vi } from "vitest";

import { clearContentCreateIdempotencyKey, contentCreateIdempotencyKey } from "./contentCreateIdempotency";

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

test("a full sessionStorage does not prevent a create command or change its retry key", () => {
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
    if (key === "rinspace:content-create:full") throw new DOMException("Unavailable", "SecurityError");
    return originalGetItem.call(this, key);
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "rinspace:content-create:full") throw new DOMException("Quota exceeded", "QuotaExceededError");
    return originalSetItem.call(this, key, value);
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    if (key === "rinspace:content-create:full") throw new DOMException("Unavailable", "SecurityError");
    return originalRemoveItem.call(this, key);
  });

  const first = contentCreateIdempotencyKey("rinspace:content-create:full");
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(contentCreateIdempotencyKey("rinspace:content-create:full")).toBe(first);
  expect(() => clearContentCreateIdempotencyKey("rinspace:content-create:full")).not.toThrow();
});

test("a successful command gets a new key even if browser cleanup fails", () => {
  const storageKey = "rinspace:content-create:cleanup";
  const first = contentCreateIdempotencyKey(storageKey);
  const originalRemoveItem = Storage.prototype.removeItem;
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    if (key === storageKey) throw new DOMException("Unavailable", "SecurityError");
    return originalRemoveItem.call(this, key);
  });

  clearContentCreateIdempotencyKey(storageKey);
  expect(window.sessionStorage.getItem(storageKey)).toBe(first);
  expect(contentCreateIdempotencyKey(storageKey)).not.toBe(first);
});

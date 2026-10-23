const pendingKeys = new Map<string, string>();
const completedKeys = new Set<string>();
const maxPendingKeys = 32;

export function contentCreateIdempotencyKey(storageKey: string): string {
  const remembered = pendingKeys.get(storageKey);
  if (remembered) return remembered;

  let key = "";
  if (!completedKeys.delete(storageKey)) {
    try {
      key = window.sessionStorage.getItem(storageKey) || "";
    } catch {
      // Browser storage is optional; the current tab can still retry safely.
    }
  }
  if (!key) key = window.crypto.randomUUID();

  pendingKeys.set(storageKey, key);
  if (pendingKeys.size > maxPendingKeys) {
    const oldest = pendingKeys.keys().next().value;
    if (oldest) pendingKeys.delete(oldest);
  }
  try {
    window.sessionStorage.setItem(storageKey, key);
  } catch {
    // A full or disabled sessionStorage must not prevent publication.
  }
  return key;
}

export function clearContentCreateIdempotencyKey(storageKey: string): void {
  pendingKeys.delete(storageKey);
  completedKeys.add(storageKey);
  if (completedKeys.size > maxPendingKeys) {
    const oldest = completedKeys.values().next().value;
    if (oldest) completedKeys.delete(oldest);
  }
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // The server has accepted the command; browser cleanup is best effort.
  }
}

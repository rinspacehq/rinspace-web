import { exactFields, walletUUID } from './validation';

// A single unresolved tip per UID/tab, recoverable from any work or the wallet.
// Only opaque UUIDs persist, never amounts, author data or credentials.
export interface PendingTip { readonly key: string; readonly preview: string }
function storageKey(uid: string): string {
  if (!uid || new TextEncoder().encode(uid).length > 256 || uid !== uid.trim() || /\p{Cc}/u.test(uid)) throw new TypeError('Invalid wallet session scope');
  return `rinspace.wallet.pending-tip:${encodeURIComponent(uid)}`;
}
export function readPendingTip(uid: string): PendingTip | null {
  const raw = sessionStorage.getItem(storageKey(uid));
  if (raw === null) return null;
  const value = exactFields(JSON.parse(raw) as unknown, ['key', 'preview']);
  return Object.freeze({ key: walletUUID(value.key), preview: walletUUID(value.preview) });
}
export function savePendingTip(uid: string, value: PendingTip): void {
  const identity = { key: walletUUID(value.key), preview: walletUUID(value.preview) };
  const old = readPendingTip(uid);
  if (old && (old.key !== identity.key || old.preview !== identity.preview)) throw new Error('Another tip needs resolution');
  const encoded = JSON.stringify(identity);
  sessionStorage.setItem(storageKey(uid), encoded);
  if (sessionStorage.getItem(storageKey(uid)) !== encoded) throw new Error('Pending tip could not be saved');
}
export function clearPendingTip(uid: string, expected: PendingTip): void {
  const old = readPendingTip(uid);
  if (old && (old.key !== expected.key || old.preview !== expected.preview)) throw new Error('Pending tip identity changed');
  sessionStorage.removeItem(storageKey(uid));
}

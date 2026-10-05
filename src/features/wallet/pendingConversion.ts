import { exactFields, walletUUID } from './validation';

// Only the command and confirmation UUIDs persist in this tab, scoped to the
// authenticated UID. No balances, quantity, phone, CSRF or payment form is stored.
export interface PendingConversion { readonly key: string; readonly preview: string }
function storageKey(uid: string): string {
  if (!uid || uid.length > 256 || uid !== uid.trim() || /\p{Cc}/u.test(uid)) throw new TypeError('Invalid wallet session scope');
  return `rinspace.wallet.pending-conversion:${encodeURIComponent(uid)}`;
}
export function readPendingConversion(uid: string): PendingConversion | null {
  const raw = sessionStorage.getItem(storageKey(uid));
  if (raw === null) return null;
  const value = exactFields(JSON.parse(raw) as unknown, ['key', 'preview']);
  return Object.freeze({ key: walletUUID(value.key), preview: walletUUID(value.preview) });
}
export function savePendingConversion(uid: string, value: PendingConversion): void {
  const identity = { key: walletUUID(value.key), preview: walletUUID(value.preview) };
  const old = readPendingConversion(uid);
  if (old && (old.key !== identity.key || old.preview !== identity.preview)) throw new Error('Another conversion needs resolution');
  const encoded = JSON.stringify(identity);
  sessionStorage.setItem(storageKey(uid), encoded);
  if (sessionStorage.getItem(storageKey(uid)) !== encoded) throw new Error('Pending conversion could not be saved');
}
export function clearPendingConversion(uid: string, expected: PendingConversion): void {
  const old = readPendingConversion(uid);
  if (old && (old.key !== expected.key || old.preview !== expected.preview)) throw new Error('Pending conversion identity changed');
  sessionStorage.removeItem(storageKey(uid));
}

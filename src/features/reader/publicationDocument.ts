import { fingerprintPdfStream } from './fingerprint';
import type { ReaderDocument } from './types';

// UUID v5 in the URL namespace, using the canonical immutable publication key.
async function publicationDocumentId(identity: string) {
  const namespace = new Uint8Array([0x6b, 0xa7, 0xb8, 0x11, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8]);
  const name = new TextEncoder().encode(identity);
  const input = new Uint8Array(namespace.length + name.length);
  input.set(namespace);
  input.set(name, namespace.length);
  const id = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).subarray(0, 16);
  id[6] = (id[6] & 0x0f) | 0x50;
  id[8] = (id[8] & 0x3f) | 0x80;
  const hex = Array.from(id, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function publicationReaderDocument(document: ReaderDocument, url: string, etag: string, lifetime: AbortSignal) {
  let pending: Promise<ReaderDocument> | undefined;
  async function read(signal: AbortSignal): Promise<ReaderDocument> {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'If-Match': etag }, signal });
    if (response.status !== 200 || response.headers.get('ETag') !== etag || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error('无法读取当前版本的 PDF，请重新打开后重试。');
    }
    const contentVersion = await fingerprintPdfStream(response.body, document.size);
    signal.throwIfAborted();
    return { ...document, id: await publicationDocumentId(document.id), contentVersion };
  }
  return (operation?: AbortSignal) => {
    const signal = operation ? AbortSignal.any([operation, lifetime]) : lifetime;
    signal.throwIfAborted();
    pending ||= read(signal).catch(error => { pending = undefined; throw error; });
    return pending;
  };
}

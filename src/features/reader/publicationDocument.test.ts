import { Blob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { fingerprintPdf } from './fingerprint';
import { publicationReaderDocument } from './publicationDocument';

afterEach(() => vi.unstubAllGlobals());

it('prepares one server-compatible identity from the exact PDF only on demand', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(9);
  const document = { id: 'publication:article:39:' + 'a'.repeat(64), title: 'Article', size: bytes.length, lastModified: 0, contentVersion: 'a'.repeat(64) };
  const etag = `"sha256-${document.contentVersion}"`;
  const fetchPdf = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, 13));
    controller.enqueue(bytes.subarray(13, bytes.length - 1));
    controller.enqueue(bytes.subarray(bytes.length - 1));
    controller.close();
  } }), { headers: { ETag: etag } }));
  vi.stubGlobal('fetch', fetchPdf);
  const resolve = publicationReaderDocument(document, '/pdf', etag, new AbortController().signal);
  expect(fetchPdf).not.toHaveBeenCalled();
  const request = await resolve();
  expect(request.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(request.contentVersion).toBe(await fingerprintPdf(new Blob([bytes])));
  expect(await resolve()).toBe(request);
  expect(fetchPdf).toHaveBeenCalledExactlyOnceWith('/pdf', expect.objectContaining({ headers: { 'If-Match': etag } }));
  expect(await publicationReaderDocument(document, '/pdf', etag, new AbortController().signal)()).toEqual(request);
  expect(document.id).toMatch(/^publication:article:39:/);
});

it('rejects stale and truncated responses and retries the next request', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const document = { id: 'publication:article:39:' + 'a'.repeat(64), title: 'Article', size: 3, lastModified: 0, contentVersion: 'a'.repeat(64) };
  const etag = `"sha256-${document.contentVersion}"`;
  const fetchPdf = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 412 }))
    .mockResolvedValueOnce(new Response('ab', { headers: { ETag: etag } }))
    .mockResolvedValueOnce(new Response('abc', { headers: { ETag: etag } }));
  vi.stubGlobal('fetch', fetchPdf);
  const resolve = publicationReaderDocument(document, '/pdf', etag, new AbortController().signal);
  await expect(resolve()).rejects.toThrow('无法读取当前版本');
  await expect(resolve()).rejects.toThrow('下载不完整');
  expect((await resolve()).contentVersion).toBe(await fingerprintPdf(new Blob(['abc'])));
});

import { Blob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerprintPdf } from './fingerprint';

afterEach(() => vi.unstubAllGlobals());

describe('local PDF content identity', () => {
  it('matches identical bytes and distinguishes same-size different content', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const first = await fingerprintPdf(new Blob(['%PDF-1.7 a']));
    expect(await fingerprintPdf(new Blob(['%PDF-1.7 a']))).toBe(first);
    expect(await fingerprintPdf(new Blob(['%PDF-1.7 b']))).not.toBe(first);
  });

  it('checks bytes after the first chunk rather than trusting a header fingerprint', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const prefix = new Uint8Array(1024 * 1024);
    expect(await fingerprintPdf(new Blob([prefix, 'a']))).not.toBe(await fingerprintPdf(new Blob([prefix, 'b'])));
  });
});

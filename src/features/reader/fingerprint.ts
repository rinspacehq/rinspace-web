const CHUNK_SIZE = 1024 * 1024;

async function finishFingerprint(size: number, chunks: Uint8Array[]) {
  const prefix = new TextEncoder().encode(`rinspace-pdf-tree-v1:${size}:`);
  const digestInput = new Uint8Array(prefix.length + chunks.length * 32);
  digestInput.set(prefix);
  chunks.forEach((chunk, index) => digestInput.set(chunk, prefix.length + index * 32));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput));
  return `pdf-tree-v1:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

// Hash every byte, with bounded working memory. A versioned tree digest avoids
// trusting names/timestamps while never buffering an entire PDF for WebCrypto.
export async function fingerprintPdf(file: { size: number; slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> } }): Promise<string> {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const data = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
  }
  return finishFingerprint(file.size, chunks);
}

export async function fingerprintPdfStream(body: ReadableStream<Uint8Array>, size: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  const block = new Uint8Array(Math.min(CHUNK_SIZE, size));
  let received = 0;
  let filled = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > size) throw new Error('PDF 文件长度已变化，请重新打开。');
      for (let offset = 0; offset < value.length;) {
        const count = Math.min(block.length - filled, value.length - offset);
        block.set(value.subarray(offset, offset + count), filled);
        offset += count;
        filled += count;
        if (filled === block.length) {
          chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', block)));
          filled = 0;
        }
      }
    }
    if (received !== size) throw new Error('PDF 文件下载不完整，请重试。');
    if (filled) chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', block.subarray(0, filled))));
    return finishFingerprint(size, chunks);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

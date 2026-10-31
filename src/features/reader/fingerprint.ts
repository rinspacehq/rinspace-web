const CHUNK_SIZE = 1024 * 1024;

// Hash every byte, with bounded working memory. A versioned tree digest avoids
// trusting names/timestamps while never buffering an entire PDF for WebCrypto.
export async function fingerprintPdf(file: { size: number; slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> } }): Promise<string> {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const data = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
  }
  const prefix = new TextEncoder().encode(`rinspace-pdf-tree-v1:${file.size}:`);
  const digestInput = new Uint8Array(prefix.length + chunks.length * 32);
  digestInput.set(prefix);
  chunks.forEach((chunk, index) => digestInput.set(chunk, prefix.length + index * 32));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput));
  return `pdf-tree-v1:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

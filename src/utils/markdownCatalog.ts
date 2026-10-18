export type MarkdownCatalogEntry = { path: string; depth: number };

export function parseMarkdownCatalog(source: string): MarkdownCatalogEntry[] {
  const entries: MarkdownCatalogEntry[] = [];
  const paths = new Set<string>();
  let previousDepth = 0;
  let titleSeen = false;
  for (const raw of source.replaceAll('\r\n', '\n').split('\n')) {
    if (!raw.trim()) continue;
    if (!entries.length && !titleSeen && raw.startsWith('# ') && raw.slice(2).trim() && !/[\t\r\0]/.test(raw)) {
      titleSeen = true;
      continue;
    }
    const match = /^( *)- (.+)$/.exec(raw);
    if (!match || match[1].length % 2 || /[\t\r\0]/.test(raw)) throw new Error('Invalid main.md chapter list.');
    const depth = match[1].length / 2 + 1;
    const path = match[2].trim();
    if (depth > 6 || depth > previousDepth + 1 || path === 'main.md' || !path.endsWith('.md')
      || /[\\\0\r\n\t:]/.test(path) || path.split('/').some((part) => !part || part.startsWith('.')) || paths.has(path)) {
      throw new Error('Invalid main.md chapter path or hierarchy.');
    }
    entries.push({ path, depth });
    if (entries.length > 512) throw new Error('main.md exceeds 512 chapters.');
    paths.add(path);
    previousDepth = depth;
  }
  if (!entries.length) throw new Error('main.md requires at least one chapter.');
  return entries;
}

// Call after parseMarkdownCatalog: a leading title is metadata, never a chapter.
export function markdownCatalogTitle(source: string): string {
  const first = source.replaceAll('\r\n', '\n').split('\n').find((line) => line.trim());
  return first?.startsWith('# ') && !/[\t\r\0]/.test(first) ? first.slice(2).trim() : '';
}

export async function markdownCatalogChapterID(path: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
  return `rin-md-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
}

// Browser preview of contracts/tag-normalization-v1.json. The server result is
// authoritative. These replacements cover Unicode folds that lowercasing does
// not express directly in JavaScript.
export function normalizeCanonicalTagName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ßẞ]/g, 'ss')
    .replace(/ς/g, 'σ')
    .trim()
    .replace(/\s+/gu, ' ');
}

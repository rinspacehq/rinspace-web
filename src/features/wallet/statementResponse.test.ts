import { describe, expect, it } from 'vitest';
import fixtures from '../../../contracts/wallet/statement-vectors.json';
import { parseWalletTransaction, parseWalletTransactionArchive, parseWalletTransactionPage } from './statementResponse';

describe('shared statement response contracts', () => {
  for (const fixture of fixtures.cases) {
    it(fixture.name, () => {
      if (fixture.valid) {
        const result = parseWalletTransaction(fixture.value);
        expect(result).toEqual(fixture.value);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.operation)).toBe(true);
      } else expect(() => parseWalletTransaction(fixture.value)).toThrow();
    });
  }
});

describe('statement pages', () => {
  const items = fixtures.cases.slice(0, 5).map((fixture) => parseWalletTransaction(fixture.value));
  const page = { items, watermark: '5', next_cursor: 'synthetic_cursor_123456' };
  it('preserves descending records and freezes nested data', () => {
    const result = parseWalletTransactionPage(page);
    expect(result).toEqual(page);
    expect(Object.isFrozen(result.items)).toBe(true);
    const received = result.items[2];
    if (received.perspective !== 'received') throw new Error('Wrong synthetic fixture');
    expect(Object.isFrozen(received.content)).toBe(true);
  });
  it('keeps an empty page distinct from missing data', () => {
    expect(parseWalletTransactionPage({ items: [], watermark: '0' })).toEqual({ items: [], watermark: '0' });
    for (const items of [null, undefined, {}, new Array(1)]) {
      expect(() => parseWalletTransactionPage({ items, watermark: '0' })).toThrow();
    }
  });
  it('preserves a sequence beyond browser safe integers', () => {
    const large = fixtures.cases[5].value;
    const result = parseWalletTransactionPage({ items: [large], watermark: '9223372036854775807' });
    expect(result.items[0].sequence).toBe('9223372036854775807');
  });
  it('rejects wrong ordering, duplicate operations, over-watermark and excessive pages', () => {
    for (const changed of [
      { ...page, watermark: '4' },
      { ...page, items: [items[1], items[0]] },
      { ...page, items: [items[0], { ...items[1], sequence: '5' }] },
      { ...page, items: [items[0], { ...items[1], operation: { ...items[1].operation, operation_id: items[0].operation.operation_id } }] },
      { ...page, items: Array.from({ length: 101 }, () => items[0]) },
    ]) expect(() => parseWalletTransactionPage(changed)).toThrow();
  });
  it('rejects missing, malformed and incorrectly present optional fields', () => {
    for (const next_cursor of ['', null, 'x', 'a'.repeat(2049), 'synthetic/cursor/1234']) {
      expect(() => parseWalletTransactionPage({ ...page, next_cursor })).toThrow();
    }
    expect(() => parseWalletTransactionPage({ ...page, items: [] })).toThrow();
    expect(() => parseWalletTransactionPage({ ...page, secret: 'unexpected' })).toThrow();
    expect(() => parseWalletTransaction({ ...items[1], amount_fen: null })).toThrow();
    expect(() => parseWalletTransaction({ ...items[1], original_operation_id: '' })).toThrow();
    expect(() => parseWalletTransaction({ ...items[0], refundable_fen: undefined })).toThrow();
    expect(() => parseWalletTransaction({ ...items[0], refundable_fen: '11' })).toThrow();
    expect(() => parseWalletTransaction({ ...items[0], refundable_fen: '110' })).toThrow();
    expect(() => parseWalletTransaction({ ...items[0], operation: { ...items[0].operation, state: 'PAYABLE' } })).toThrow();
  });
  it('never executes an item getter or accepts extra array metadata', () => {
    let invoked = false;
    const unsafe: unknown[] = [];
    Object.defineProperty(unsafe, '0', { enumerable: true, get() { invoked = true; return items[0]; } });
    expect(() => parseWalletTransactionPage({ ...page, items: unsafe })).toThrow();
    expect(invoked).toBe(false);
    const extra = Object.assign([...items], { privateIdentity: 'unexpected' });
    expect(() => parseWalletTransactionPage({ ...page, items: extra })).toThrow();
  });
});

describe('statement archives', () => {
  const items = fixtures.cases.slice(0, 5).map((fixture) => parseWalletTransaction(fixture.value));
  const archive = {
    pages: [
      { items: items.slice(0, 2), watermark: '5', next_cursor: 'synthetic_cursor_123456' },
      { items: items.slice(2, 4), watermark: '5' },
    ],
    exported_pages: 2,
    exported_items: 4,
    truncated: false,
    watermark: '5',
  };
  it('validates a bounded multi-page archive segment', () => {
    const result = parseWalletTransactionArchive(archive);
    expect(result).toEqual(archive);
    expect(Object.isFrozen(result.pages)).toBe(true);
  });
  it('allows explicit truncation with the resumable cursor only on the last page', () => {
    const truncated = { pages: [archive.pages[0]], exported_pages: 1, exported_items: 2, truncated: true, next_cursor: 'synthetic_cursor_123456', watermark: '5' };
    expect(parseWalletTransactionArchive(truncated)).toEqual(truncated);
  });
  it('rejects unbounded or inconsistent archive shapes', () => {
    for (const changed of [
      { ...archive, pages: [] },
      { ...archive, pages: Array.from({ length: 11 }, () => archive.pages[0]), exported_pages: 11, exported_items: 22 },
      { ...archive, exported_pages: 1 },
      { ...archive, exported_items: 3 },
      { ...archive, pages: [archive.pages[0], { ...archive.pages[1], watermark: '4' }] },
      { ...archive, pages: [archive.pages[0], { ...archive.pages[1], items: [archive.pages[0].items[1]] }], exported_items: 3 },
      { ...archive, truncated: true },
      { ...archive, next_cursor: 'synthetic_cursor_123456' },
      { ...archive, secret: 'unexpected' },
    ]) expect(() => parseWalletTransactionArchive(changed)).toThrow();
  });
});

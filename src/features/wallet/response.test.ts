import { describe, expect, it } from 'vitest';
import vectors from '../../../contracts/wallet/response-vectors.json';
import { parseWalletAppealResult, parseWalletBalance, parseWalletCasePage, parseWalletConversionPreview, parseWalletOperation, parseWalletProblem, parseWalletSummary, parseWalletTipPreview, walletOperationCompleted, walletStateAllowed, walletUTCTimestamp } from './response';

describe('wallet response runtime contracts', () => {
  it.each(vectors.operations)('shares operation vector $name', (v) => {
    if (v.valid) expect(parseWalletOperation(v.value)).toEqual(v.value);
    else expect(() => parseWalletOperation(v.value)).toThrow();
  });
  it.each(vectors.summaries)('shares summary vector $name', (v) => {
    if (v.valid) {
      const result = parseWalletSummary(v.value);
      expect(result).toEqual(v.value);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.ordinary)).toBe(true);
      expect(Object.isFrozen(result.quota)).toBe(true);
    } else expect(() => parseWalletSummary(v.value)).toThrow();
  });
  it('matches every kind/state pair, including forbidden combinations', () => {
    const all = new Set([...Object.values(vectors.states).flat(), '', 'COMPLETED|PENDING', 'made-up']);
    for (const [kind, allowed] of Object.entries(vectors.states)) {
      for (const state of all) expect(walletStateAllowed(kind, state)).toBe(allowed.includes(state));
    }
    for (const kind of ['toString', '__proto__', 'constructor', 'withdrawal', null]) {
      expect(walletStateAllowed(kind, 'COMPLETED')).toBe(false);
    }
  });
  it('does not present submission or a channel fact as local completion', () => {
    const base = vectors.operations[0].value;
    for (const state of vectors.states.refund) {
      expect(walletOperationCompleted(parseWalletOperation({ ...base, kind: 'refund', state }))).toBe(state === 'COMPLETED');
    }
    for (const state of vectors.states.recharge) {
      expect(walletOperationCompleted(parseWalletOperation({ ...base, state }))).toBe(state === 'CREDIT_POSTED');
    }
  });
  it('requires full snapshots, never fills missing balances with zero', () => {
    const base = vectors.summaries[0].value;
    for (const key of Object.keys(base)) {
      const input: Record<string, unknown> = { ...base };
      delete input[key];
      expect(() => parseWalletSummary(input)).toThrow();
    }
    for (const key of ['total', 'available', 'reserved', 'restricted']) {
      const input: Record<string, unknown> = { total: '0', available: '0', reserved: '0', restricted: '0' };
      delete input[key];
      expect(() => parseWalletBalance(input)).toThrow();
    }
  });
  it('rejects forged extra fields and unsafe object shapes without calling getters', () => {
    expect(() => parseWalletOperation({ ...vectors.operations[0].value, amount_fen: '999' })).toThrow();
    expect(() => parseWalletSummary({ ...vectors.summaries[0].value, uid: 'other' })).toThrow();
    let invoked = false;
    const value = Object.defineProperty({}, 'total', { enumerable: true, get() { invoked = true; return '0'; } });
    expect(() => parseWalletBalance(value)).toThrow();
    expect(invoked).toBe(false);
  });
  it.each(['2024-02-29T00:00:00Z', '2000-02-29T23:59:59.123456789Z'])('accepts exact UTC calendar timestamp %s', (value) => {
    expect(walletUTCTimestamp(value)).toBe(value);
  });
  it.each(['1900-02-29T00:00:00Z', '2026-00-01T00:00:00Z', '2026-01-00T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z', '2026-01-01T00:00:00Z\n'])('rejects invalid timestamp %#', (value) => {
    expect(() => walletUTCTimestamp(value)).toThrow();
  });
  it('accepts non-cash previews and rejects a changed conversion rate', () => {
    const common = { preview_id: vectors.operations[0].value.operation_id, expires_at: '2026-09-19T12:05:00Z', policy_version: '1' };
    const tip = { ...common, content: { content_type: 'book', post_id: '9007199254740993', title: '原创 Typst' }, recipient: { uid: 'author-uid', display_name: '作者' }, quantity: '23', eligibility_version: '2' };
    expect(parseWalletTipPreview(tip)).toEqual(tip);
    expect(() => parseWalletTipPreview({ ...tip, amount_fen: '230' })).toThrow();
    expect(() => parseWalletTipPreview({ ...tip, content: { ...tip.content, content_type: 'copyrighted' } })).toThrow();
    expect(() => parseWalletTipPreview({ ...tip, recipient: { ...tip.recipient, uid: '善'.repeat(100) } })).toThrow();
    const conversion = { ...common, bound_quantity: '20', ordinary_quantity: '14', remaining_bound: '3' };
    expect(parseWalletConversionPreview(conversion)).toEqual(conversion);
    expect(() => parseWalletConversionPreview({ ...conversion, bound_quantity: '23' })).toThrow();
    expect(() => parseWalletConversionPreview({ ...conversion, ordinary_quantity: '13' })).toThrow();
    expect(() => parseWalletConversionPreview({ ...conversion, remaining_bound: '-1' })).toThrow();
  });
  it('checks public error status and same-key recovery semantics without displaying raw errors', () => {
    const raw = { error: { code: 'RESULT_UNKNOWN', message_key: 'wallet.errors.result_unknown', retryable: true } };
    expect(parseWalletProblem(raw, 503)).toEqual(raw);
    expect(() => parseWalletProblem(raw, 400)).toThrow();
    expect(() => parseWalletProblem({ error: { ...raw.error, retryable: false } }, 503)).toThrow();
    expect(() => parseWalletProblem({ error: { ...raw.error, message_key: 'SQL/credential leak' } }, 503)).toThrow();
    expect(() => parseWalletProblem({ error: { ...raw.error, operation_id: '' } }, 503)).toThrow();
    expect(() => parseWalletProblem({ error: { ...raw.error, code: 'toString' } }, 503)).toThrow();
    expect(() => parseWalletProblem({ error: { ...raw.error, stack: 'internal' } }, 503)).toThrow();
  });
  it('parses minimized user cases and rejects payment or identity leakage',()=>{
    const item={case_id:'12345678-1234-4234-8234-123456789abc',state:'UNDER_REVIEW',version:'3',ordinary_restricted:'7',bound_restricted:'11',created_at:'2026-09-20T08:00:00Z'};
    expect(parseWalletCasePage({items:[item]})).toEqual({items:[item]});
    for(const leaked of [{amount_fen:'700'},{payer_uid:'other'},{channel:'alipay'}])expect(()=>parseWalletCasePage({items:[{...item,...leaked}]})).toThrow();
    expect(parseWalletAppealResult({case_id:item.case_id,appeal_id:'22345678-1234-4234-8234-123456789abc',state:item.state,version:'4',created_at:'2026-09-20T08:01:00Z'}).version).toBe('4');
  });
});

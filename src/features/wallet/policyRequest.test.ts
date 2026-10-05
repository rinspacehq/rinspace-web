import { describe, expect, it } from 'vitest';

import vectors from '../../../contracts/wallet/policy-request-vectors.json';
import limits from '../../../contracts/wallet/policy-limit-vectors.json';
import { createWalletPolicyUpdateRequest } from './policyRequest';

const validInput = () => ({
  expected_version: '1',
  patch: { daily_recharge_limit_fen: '100000', recharge_enabled: false },
  reason: '调整限额',
});

// These are raw transport ambiguities that no object-valued form API can
// observe after JSON.parse. The Go tests consume EVERY raw fixture, including
// these cases; the browser builder is not a replacement raw JSON parser.
const rawOnly = new Set([
  'duplicate_outer', 'duplicate_patch', 'escaped_duplicate_patch',
  'escaped_limit_digits', 'trailing_value',
]);

describe('wallet policy form request contract', () => {
  it.each(limits.cases)('shares configurable limit schema $name', (v) => {
    const input: unknown = JSON.parse(v.body);
    if (v.valid) expect(createWalletPolicyUpdateRequest(input)).toEqual(input);
    else expect(() => createWalletPolicyUpdateRequest(input)).toThrow();
  });
  it.each(vectors.cases.filter((v) => v.valid))('shares valid server vector $name', (v) => {
    const input: unknown = JSON.parse(v.body);
    const result = createWalletPolicyUpdateRequest(input);
    expect(result).toEqual(input);
    expect(createWalletPolicyUpdateRequest(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.patch)).toBe(true);
  });

  it.each(vectors.cases.filter((v) => !v.valid && !rawOnly.has(v.name)))('rejects invalid object vector $name', (v) => {
    const input: unknown = JSON.parse(v.body);
    expect(() => createWalletPolicyUpdateRequest(input)).toThrow();
  });

  it('keeps raw-only fixtures explicit and rejects parsing malformed trailing JSON', () => {
    expect(vectors.cases.filter((v) => rawOnly.has(v.name))).toHaveLength(rawOnly.size);
    const trailing = vectors.cases.find((v) => v.name === 'trailing_value');
    expect(trailing).toBeDefined();
    expect(() => JSON.parse(trailing?.body ?? '')).toThrow();
  });

  it('preserves absent vs false, exact large integers, and input independence', () => {
    const input = validInput();
    input.patch.daily_recharge_limit_fen = '9007199254741000';
    const result = createWalletPolicyUpdateRequest(input);
    input.patch.daily_recharge_limit_fen = '10';
    input.patch.recharge_enabled = true;
    expect(result.patch).toEqual({ daily_recharge_limit_fen: '9007199254741000', recharge_enabled: false });
    expect(Object.hasOwn(result.patch, 'tip_enabled')).toBe(false);
    expect(Object.hasOwn(result.patch, 'convert_enabled')).toBe(false);
    expect(JSON.stringify(result)).toContain('"daily_recharge_limit_fen":"9007199254741000"');
    expect(JSON.stringify(result)).toContain('"recharge_enabled":false');
  });

  it('uses the fixed Go canonical field order independent of form key order', () => {
    const result = createWalletPolicyUpdateRequest({
      reason: '调整',
      patch: { convert_enabled: false, tip_enabled: true, recharge_enabled: false, daily_recharge_limit_fen: '9007199254741000' },
      expected_version: '1',
    });
    expect(JSON.stringify(result)).toBe('{"expected_version":"1","patch":{"daily_recharge_limit_fen":"9007199254741000","recharge_enabled":false,"tip_enabled":true,"convert_enabled":false},"reason":"调整"}');
  });

  it.each([null, undefined, [], 1, 'policy', true, new Date()])('rejects non-object inputs case %#', (raw) => {
    expect(() => createWalletPolicyUpdateRequest(raw)).toThrow();
  });

  it.each(['expected_version', 'patch', 'reason'])('requires own %s', (key) => {
    const input: Record<string, unknown> = validInput();
    delete input[key];
    expect(() => createWalletPolicyUpdateRequest(input)).toThrow();
  });

  it('rejects undefined properties, getters, inherited and hidden fields', () => {
    expect(() => createWalletPolicyUpdateRequest({ ...validInput(), patch: { recharge_enabled: undefined } })).toThrow();
    expect(() => createWalletPolicyUpdateRequest({ ...validInput(), patch: { daily_recharge_limit_fen: undefined } })).toThrow();
    let accessed = false;
    const accessor = Object.defineProperty({}, 'expected_version', {
      enumerable: true, get() { accessed = true; return '1'; },
    });
    expect(() => createWalletPolicyUpdateRequest(accessor)).toThrow();
    expect(accessed).toBe(false);
    expect(() => createWalletPolicyUpdateRequest(Object.create(validInput()))).toThrow();
    expect(() => createWalletPolicyUpdateRequest({ ...validInput(), [Symbol('secret')]: 'x' })).toThrow();
    expect(() => createWalletPolicyUpdateRequest(Object.defineProperty(validInput(), 'hidden', { value: 'x' }))).toThrow();
  });

  it('matches Go Unicode reason boundaries without trimming or rounding', () => {
    for (const reason of ['😀'.repeat(1000), '善'.repeat(1000), '\uFEFF', ' 保留空格 ']) {
      expect(createWalletPolicyUpdateRequest({ ...validInput(), reason }).reason).toBe(reason);
    }
    for (const reason of ['😀'.repeat(1001), '\u0085', '\u0000', '\ud800', '\udc00', '\ufffd']) {
      expect(() => createWalletPolicyUpdateRequest({ ...validInput(), reason })).toThrow();
    }
  });
});

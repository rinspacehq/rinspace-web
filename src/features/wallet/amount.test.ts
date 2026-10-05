import { describe, expect, it } from 'vitest';

import vectors from '../../../contracts/wallet/amount-vectors.json';
import {
  MAX_WALLET_INTEGER, addWalletIntegers, convertBoundShangong,
  formatFenAsYuan, multiplyWalletIntegers, parsePositiveWalletInteger,
  parseWalletInteger, parseYuanToFen, rechargeShangong, refundFen,
  subtractWalletIntegers, walletIntegerString,
} from './amount';

describe('wallet shared precision vectors', () => {
  it.each(vectors.integers)('round trips %s without a Number conversion', (raw) => {
    expect(walletIntegerString(parseWalletInteger(raw))).toBe(raw);
    expect(JSON.parse(JSON.stringify({ amount: walletIntegerString(parseWalletInteger(raw)) }))).toEqual({ amount: raw });
  });
  it.each(vectors.invalidIntegers)('rejects integer %j', (raw) => {
    expect(() => parseWalletInteger(raw)).toThrow();
  });
  it.each([null, undefined, 1, 0, 1n, true, {}, [], Number.NaN, Number.POSITIVE_INFINITY])('rejects non-string input case %#', (raw) => {
    expect(() => parseWalletInteger(raw)).toThrow();
    expect(() => parseYuanToFen(raw)).toThrow();
  });
  it.each(vectors.yuan)('parses yuan $input exactly', (v) => {
    expect(parseYuanToFen(v.input).toString()).toBe(v.fen);
    expect(formatFenAsYuan(BigInt(v.fen))).toBe(v.formatted);
  });
  it.each(vectors.invalidYuan)('rejects yuan %j', (raw) => {
    expect(() => parseYuanToFen(raw)).toThrow();
  });
  for (const [name, convert, valid, invalid] of [
    ['recharge', rechargeShangong, vectors.recharges, vectors.invalidGroups],
    ['conversion', convertBoundShangong, vectors.conversions, vectors.invalidGroups],
    ['refund pricing', refundFen, vectors.refunds, vectors.invalidRefunds],
  ] as const) {
    it.each(valid)(`${name} $input`, (v) => {
      expect(convert(BigInt(v.input)).toString()).toBe(v.output);
    });
    it.each(invalid)(`${name} rejects %s`, (raw) => {
      expect(() => convert(BigInt(raw))).toThrow();
    });
  }
  it('rejects overflow, underflow, negative and non-positive transaction amounts', () => {
    expect(() => addWalletIntegers(MAX_WALLET_INTEGER, 1n)).toThrow();
    expect(() => subtractWalletIntegers(0n, 1n)).toThrow();
    expect(() => multiplyWalletIntegers(MAX_WALLET_INTEGER, 2n)).toThrow();
    expect(() => addWalletIntegers(-1n, 1n)).toThrow();
    expect(() => walletIntegerString(-1n)).toThrow();
    expect(() => formatFenAsYuan(-1n)).toThrow();
    expect(() => parsePositiveWalletInteger('0')).toThrow();
    expect(parsePositiveWalletInteger('1')).toBe(1n);
    expect(multiplyWalletIntegers(MAX_WALLET_INTEGER, 0n)).toBe(0n);
    expect(subtractWalletIntegers(MAX_WALLET_INTEGER, MAX_WALLET_INTEGER)).toBe(0n);
    expect(addWalletIntegers(MAX_WALLET_INTEGER, 0n)).toBe(MAX_WALLET_INTEGER);
  });
  it('retains exact values across 10001 yuan round trips and grouped conversions', () => {
    for (let value = 0n; value <= 10000n; value += 1n) {
      expect(parseYuanToFen(formatFenAsYuan(value))).toBe(value);
      if (value > 0n && value % 10n === 0n) expect(convertBoundShangong(value) * 10n).toBe(value * 7n);
    }
    expect(convertBoundShangong(3n + 7n)).toBe(7n);
    expect(subtractWalletIntegers(23n, 20n)).toBe(3n);
  });
});

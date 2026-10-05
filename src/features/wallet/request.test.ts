import { describe, expect, it } from 'vitest';
import vectors from '../../../contracts/wallet/request-vectors.json';
import { createWalletRequest, isWalletAction } from './request';

const rawOnly = new Set(['duplicate-key', 'escaped-duplicate-key', 'escaped-amount', 'multiple-values']);

describe('wallet form request contracts', () => {
  it.each(vectors.cases.filter((v) => !rawOnly.has(v.name)))('matches shared object vector $name', (v) => {
    const action = v.action;
    if (!isWalletAction(action)) {
      expect(v.valid).toBe(false);
      expect(v.name).toBe('unknown-action');
      return;
    }
    const raw: unknown = JSON.parse(v.body);
    if (v.valid) {
      const result = createWalletRequest(action, raw);
      expect(result).toEqual(raw);
      expect(Object.isFrozen(result)).toBe(true);
      expect(createWalletRequest(action, JSON.parse(JSON.stringify(result)))).toEqual(result);
    } else expect(() => createWalletRequest(action, raw)).toThrow();
  });
  it('leaves raw ambiguities to the complete server decoder', () => {
    expect(vectors.cases.filter((v) => rawOnly.has(v.name))).toHaveLength(rawOnly.size);
    expect(() => JSON.parse('{} {}')).toThrow();
  });
  it('rejects extra, inherited, hidden and accessor fields without invocation', () => {
    let invoked = false;
    const raw = Object.defineProperty({}, 'bound_quantity', { enumerable: true, get() { invoked = true; return '10'; } });
    expect(() => createWalletRequest('conversion.preview', raw)).toThrow();
    expect(invoked).toBe(false);
    for (const input of [Object.create({ bound_quantity: '10' }), { bound_quantity: '10', [Symbol('x')]: true }, Object.defineProperty({ bound_quantity: '10' }, 'extra', { value: 1 })]) {
      expect(() => createWalletRequest('conversion.preview', input)).toThrow();
    }
  });
  it.each(['withdrawal.create', 'toString', '__proto__', 'constructor', '', null])('does not recognize an unknown action %#', (value) => {
    expect(isWalletAction(value)).toBe(false);
  });
  it('keeps exact large amounts and makes a detached value', () => {
    const raw = { content_type: 'book', post_id: '9007199254740993', quantity: '9223372036854775807' };
    const result = createWalletRequest('tip.preview', raw);
    raw.quantity = '1';
    expect(result.quantity).toBe('9223372036854775807');
    expect(JSON.stringify(result)).toContain('"post_id":"9007199254740993"');
  });
});

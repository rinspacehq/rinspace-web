import { describe, expect, it } from 'vitest';
import vectors from '../../../contracts/wallet/public-policy-vectors.json';
import { parseWalletPublicPolicy } from './publicPolicy';

describe('public policy boundary', () => {
  for (const vector of vectors) it(vector.name, () => {
    if (vector.valid) expect(parseWalletPublicPolicy(vector.value)).toEqual(vector.value);
    else expect(() => parseWalletPublicPolicy(vector.value)).toThrow();
  });
  it('rejects secrets and missing switches and freezes nested fields', () => {
    const result = parseWalletPublicPolicy(vectors[0].value);
    expect(Object.isFrozen(result.conversion)).toBe(true);
    expect(() => parseWalletPublicPolicy({ ...result, merchant_id: 'private' })).toThrow();
    expect(() => parseWalletPublicPolicy({ ...result, tip: {} })).toThrow();
  });
});

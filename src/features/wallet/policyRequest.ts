import { parsePositiveWalletInteger, rechargeShangong, walletIntegerString } from './amount';
import { objectFields, reasonText } from './validation';

export const walletPolicyLimitFields = Object.freeze([
  'recharge_min_fen', 'recharge_step_fen', 'ordinary_balance_limit', 'bound_balance_limit',
  'tip_single_limit', 'tip_daily_limit', 'conversion_single_limit', 'conversion_daily_limit',
  'recharge_per_minute', 'tip_per_minute', 'conversion_per_minute', 'unresolved_order_limit',
  'payment_ttl_seconds', 'preview_ttl_seconds',
] as const);
export type WalletPolicyLimit = typeof walletPolicyLimitFields[number];
export interface WalletPolicyPatch extends Readonly<Partial<Record<WalletPolicyLimit, string>>> {
  readonly daily_recharge_limit_fen?: string;
  readonly recharge_enabled?: boolean;
  readonly tip_enabled?: boolean;
  readonly convert_enabled?: boolean;
}

export interface WalletPolicyUpdateRequest {
  readonly expected_version: string;
  readonly patch: WalletPolicyPatch;
  readonly reason: string;
}

/**
 * Builds a request from form data, not from raw JSON or a server response.
 * The server separately rejects duplicate raw JSON fields and performs real
 * authorization, version CAS, approved-range checks and activation gates.
 * Validating `true` here does not grant permission to activate real payments.
 */
export function createWalletPolicyUpdateRequest(raw: unknown): WalletPolicyUpdateRequest {
  const input = objectFields(raw, ['expected_version', 'patch', 'reason']);
  if (Object.keys(input).length !== 3) throw new TypeError('Missing wallet policy fields');
  const version = walletIntegerString(parsePositiveWalletInteger(input.expected_version));
  const reason = reasonText(input.reason);
  const values = objectFields(input.patch, [
    'daily_recharge_limit_fen', 'recharge_enabled', 'tip_enabled', 'convert_enabled',
    ...walletPolicyLimitFields,
  ]);
  if (Object.keys(values).length === 0) throw new TypeError('Empty wallet policy patch');
  const patch: Partial<Record<WalletPolicyLimit, string>> & {
    daily_recharge_limit_fen?: string;
    recharge_enabled?: boolean;
    tip_enabled?: boolean;
    convert_enabled?: boolean;
  } = {};
  if (Object.hasOwn(values, 'daily_recharge_limit_fen')) {
    const limit = parsePositiveWalletInteger(values.daily_recharge_limit_fen);
    rechargeShangong(limit);
    patch.daily_recharge_limit_fen = walletIntegerString(limit);
  }
  for (const key of ['recharge_enabled', 'tip_enabled', 'convert_enabled'] as const) {
    if (Object.hasOwn(values, key)) {
      const value = values[key];
      if (typeof value !== 'boolean') throw new TypeError('Invalid wallet policy switch');
      patch[key] = value;
    }
  }
  for (const [index, key] of walletPolicyLimitFields.entries()) {
    if (Object.hasOwn(values, key)) {
      const value = parsePositiveWalletInteger(values[key]);
      if (['recharge_min_fen', 'recharge_step_fen', 'conversion_single_limit', 'conversion_daily_limit'].includes(key) && value % 10n !== 0n) {
        throw new TypeError('Invalid wallet policy whole-coin group');
      }
      if (index >= 8 && value > 2147483647n) throw new RangeError('Wallet policy exceeds database integer range');
      patch[key] = walletIntegerString(value);
    }
  }
  for (const [single, daily] of [['tip_single_limit', 'tip_daily_limit'], ['conversion_single_limit', 'conversion_daily_limit']] as const) {
    const low = patch[single]; const high = patch[daily];
    if (low !== undefined && high !== undefined && BigInt(low) > BigInt(high)) throw new RangeError('Wallet single limit exceeds daily limit');
  }
  return Object.freeze({ expected_version: version, patch: Object.freeze(patch), reason });
}

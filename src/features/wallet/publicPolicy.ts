import { convertBoundShangong, parsePositiveWalletInteger, rechargeShangong } from './amount';
import { exactFields, objectFields } from './validation';

export interface WalletPublicPolicy {
  readonly policy_version: string;
  readonly recharge: Readonly<{ enabled: boolean; fen_per_shangong: '10'; daily_limit_fen: string; minimum_fen?: string; step_fen?: string; agreement_version?: string }>;
  readonly tip: Readonly<{ enabled: boolean; single_limit?: string; daily_limit?: string }>;
  readonly conversion: Readonly<{ enabled: boolean; bound_group: '10'; ordinary_group: '7'; single_limit?: string; daily_limit?: string }>;
}
function enabled(raw: unknown): boolean { if (typeof raw !== 'boolean') throw new TypeError('Invalid wallet switch'); return raw; }
function integer(raw: unknown): string { return parsePositiveWalletInteger(raw).toString(); }
function limits(raw: Record<string, unknown>, active: boolean, groups: boolean) {
  const single = Object.hasOwn(raw, 'single_limit') ? integer(raw.single_limit) : undefined;
  const daily = Object.hasOwn(raw, 'daily_limit') ? integer(raw.daily_limit) : undefined;
  if ((active && (!single || !daily)) || (single && daily && BigInt(single) > BigInt(daily))) throw new TypeError('Invalid wallet limits');
  if (groups) { if (single) convertBoundShangong(BigInt(single)); if (daily) convertBoundShangong(BigInt(daily)); }
  return { ...(single ? { single_limit: single } : {}), ...(daily ? { daily_limit: daily } : {}) };
}
export function parseWalletPublicPolicy(raw: unknown): WalletPublicPolicy {
  const value = exactFields(raw, ['policy_version', 'recharge', 'tip', 'conversion']);
  const r = objectFields(value.recharge, ['enabled', 'fen_per_shangong', 'daily_limit_fen', 'minimum_fen', 'step_fen', 'agreement_version']);
  const t = objectFields(value.tip, ['enabled', 'single_limit', 'daily_limit']);
  const c = objectFields(value.conversion, ['enabled', 'bound_group', 'ordinary_group', 'single_limit', 'daily_limit']);
  if (r.fen_per_shangong !== '10' || c.bound_group !== '10' || c.ordinary_group !== '7') throw new TypeError('Unsupported wallet rate');
  const rechargeEnabled = enabled(r.enabled), tipEnabled = enabled(t.enabled), conversionEnabled = enabled(c.enabled);
  const daily_limit_fen = integer(r.daily_limit_fen); rechargeShangong(BigInt(daily_limit_fen));
  const minimum = Object.hasOwn(r, 'minimum_fen') ? integer(r.minimum_fen) : undefined;
  const step = Object.hasOwn(r, 'step_fen') ? integer(r.step_fen) : undefined;
  const agreement = Object.hasOwn(r, 'agreement_version') ? integer(r.agreement_version) : undefined;
  if (minimum) rechargeShangong(BigInt(minimum)); if (step) rechargeShangong(BigInt(step));
  if (rechargeEnabled && (!minimum || !step || !agreement)) throw new TypeError('Missing recharge rules');
  return Object.freeze({ policy_version: integer(value.policy_version),
    recharge: Object.freeze({ enabled: rechargeEnabled, fen_per_shangong: '10' as const, daily_limit_fen, ...(minimum ? { minimum_fen: minimum } : {}), ...(step ? { step_fen: step } : {}), ...(agreement ? { agreement_version: agreement } : {}) }),
    tip: Object.freeze({ enabled: tipEnabled, ...limits(t, tipEnabled, false) }),
    conversion: Object.freeze({ enabled: conversionEnabled, bound_group: '10' as const, ordinary_group: '7' as const, ...limits(c, conversionEnabled, true) }),
  });
}

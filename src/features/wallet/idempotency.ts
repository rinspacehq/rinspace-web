import { createWalletRequest, type WalletAction } from './request';
import { walletUUID } from './validation';

function actorUID(value: unknown): string {
  if (typeof value !== 'string' || value === '' || new TextEncoder().encode(value).length > 256
    || /^\p{White_Space}|\p{White_Space}$/u.test(value) || /\p{Cc}|\uFFFD|[\uD800-\uDFFF]/u.test(value)) {
    throw new TypeError('Invalid wallet actor');
  }
  return value;
}

/** Matches Go encoding/json's default escaping, not a generic JSON canonicalizer. */
function goJSON(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * UI semantic binding only. The server always recomputes using its authenticated
 * UID; a client digest or idempotency key is never an authorization credential.
 */
export async function walletFingerprint(action: WalletAction, raw: unknown, uid: string, target = ''): Promise<string> {
  const input = createWalletRequest(action, raw);
  const actor = actorUID(uid);
  const needsTarget = ['recharge.payment_session', 'refund.request', 'refund.cancel', 'refund.review', 'refund.revoke', 'case.review', 'case.restrict', 'case.release', 'case.appeal', 'reconciliation.assign', 'reconciliation.resolve'].includes(action);
  if (needsTarget) walletUUID(target);
  else if (target !== '') throw new TypeError('Unexpected wallet target');
  if (!globalThis.crypto?.subtle) throw new Error('Secure wallet hashing unavailable');
  const bytes = new TextEncoder().encode(goJSON({ schema: 'wallet.v1', actor_uid: actor, action, target, input }));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export interface WalletStepUpBinding {
  // Identity begin/verify receives no suffix; consume uses '<purpose>.current'.
  readonly purpose: 'wallet_refund_review' | 'wallet_refund_revoke' | 'wallet_case_review' | 'wallet_case_restrict' | 'wallet_case_release' | 'wallet_reconciliation_assign' | 'wallet_reconciliation_resolve' | 'wallet_coverage_record';
  readonly target: string;
}

export async function walletStepUpBinding(action: WalletAction, raw: unknown, uid: string, target = ''): Promise<WalletStepUpBinding> {
  let purpose: WalletStepUpBinding['purpose'];
  switch (action) {
    case 'refund.review': purpose = 'wallet_refund_review'; break;
    case 'refund.revoke': purpose = 'wallet_refund_revoke'; break;
    case 'case.review': purpose = 'wallet_case_review'; break;
    case 'case.restrict': purpose = 'wallet_case_restrict'; break;
    case 'case.release': purpose = 'wallet_case_release'; break;
    case 'reconciliation.assign': purpose = 'wallet_reconciliation_assign'; break;
    case 'reconciliation.resolve': purpose = 'wallet_reconciliation_resolve'; break;
    case 'coverage.record': purpose = 'wallet_coverage_record'; break;
    default: throw new TypeError('This wallet action does not request high-risk verification');
  }
  return Object.freeze({ purpose, target: `wallet:v1:${await walletFingerprint(action, raw, uid, target)}` });
}

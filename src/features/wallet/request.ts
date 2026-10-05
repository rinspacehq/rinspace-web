import { convertBoundShangong, parsePositiveWalletInteger, rechargeShangong, walletIntegerString } from './amount';
import { createWalletPolicyUpdateRequest, type WalletPolicyUpdateRequest } from './policyRequest';
import { exactFields, reasonText, walletUUID } from './validation';

type PreviewReference = Readonly<{ preview_id: string }>;
type VersionReason = Readonly<{ expected_version: string; reason: string }>;
export interface WalletRequests {
  'recharge.create': Readonly<{ amount_fen: string; policy_version: string; agreement_version: string }>;
  'recharge.payment_session': Readonly<Record<string, never>>;
  'tip.preview': Readonly<{ content_type: 'blog' | 'book'; post_id: string; quantity: string }>;
  'tip.create': PreviewReference;
  'conversion.preview': Readonly<{ bound_quantity: string }>;
  'conversion.create': PreviewReference;
  'refund.request': Readonly<{ amount_fen: string; reason: string; policy_version: string }>;
  'refund.cancel': VersionReason;
  'refund.review': Readonly<{ decision: 'approve' | 'reject'; expected_version: string; reason: string }>;
  'refund.revoke': VersionReason;
  'case.review': Readonly<{ decision: 'start_review' | 'resolve'; expected_version: string; reason: string }>;
  'case.restrict': Readonly<{ lot_id: string; quantity: string; expected_version: string; reason: string }>;
  'case.release': VersionReason;
  'case.appeal': VersionReason;
  'reconciliation.assign': Readonly<{ expected_version: string; assignee_uid: string; reason: string }>;
  'reconciliation.resolve': Readonly<{ expected_version: string; resolution: 'CHANNEL_CORRECTED' | 'OPERATION_LINKED' | 'CASE_LINKED' | 'EVIDENCE_ACCEPTED'; evidence_reference: string; reason: string }>;
  'coverage.record': Readonly<{ evidence_as_of: string; available_cash_fen: string; approved_required_fen: string; methodology_reference: string; evidence_sha256: string; evidence_reference: string; reason: string }>;
  'policy.update': WalletPolicyUpdateRequest;
}
export type WalletAction = keyof WalletRequests;

const positive = (value: unknown): string => walletIntegerString(parsePositiveWalletInteger(value));
const fen = (value: unknown): string => {
  const integer = parsePositiveWalletInteger(value);
  rechargeShangong(integer);
  return walletIntegerString(integer);
};
const preview = (raw: unknown): PreviewReference => Object.freeze({
  preview_id: walletUUID(exactFields(raw, ['preview_id']).preview_id),
});
const versionReason = (raw: unknown): VersionReason => {
  const input = exactFields(raw, ['expected_version', 'reason']);
  return Object.freeze({ expected_version: positive(input.expected_version), reason: reasonText(input.reason) });
};

const builders: { readonly [A in WalletAction]: (raw: unknown) => WalletRequests[A] } = {
  'recharge.create': (raw) => {
    const r = exactFields(raw, ['amount_fen', 'policy_version', 'agreement_version']);
    return Object.freeze({ amount_fen: fen(r.amount_fen), policy_version: positive(r.policy_version), agreement_version: positive(r.agreement_version) });
  },
  'recharge.payment_session': (raw) => { exactFields(raw, []); return Object.freeze({}); },
  'tip.preview': (raw) => {
    const r = exactFields(raw, ['content_type', 'post_id', 'quantity']);
    if (r.content_type !== 'blog' && r.content_type !== 'book') throw new TypeError('Invalid wallet content type');
    return Object.freeze({ content_type: r.content_type, post_id: positive(r.post_id), quantity: positive(r.quantity) });
  },
  'tip.create': preview,
  'conversion.preview': (raw) => {
    const r = exactFields(raw, ['bound_quantity']);
    const bound = parsePositiveWalletInteger(r.bound_quantity);
    convertBoundShangong(bound);
    return Object.freeze({ bound_quantity: walletIntegerString(bound) });
  },
  'conversion.create': preview,
  'refund.request': (raw) => {
    const r = exactFields(raw, ['amount_fen', 'reason', 'policy_version']);
    return Object.freeze({ amount_fen: fen(r.amount_fen), reason: reasonText(r.reason), policy_version: positive(r.policy_version) });
  },
  'refund.cancel': versionReason,
  'refund.review': (raw) => {
    const r = exactFields(raw, ['decision', 'expected_version', 'reason']);
    if (r.decision !== 'approve' && r.decision !== 'reject') throw new TypeError('Invalid wallet review decision');
    return Object.freeze({ decision: r.decision, expected_version: positive(r.expected_version), reason: reasonText(r.reason) });
  },
  'refund.revoke': versionReason,
  'case.review': (raw) => {
    const r = exactFields(raw, ['decision', 'expected_version', 'reason']);
    if (r.decision !== 'start_review' && r.decision !== 'resolve') throw new TypeError('Invalid wallet case decision');
    return Object.freeze({ decision: r.decision, expected_version: positive(r.expected_version), reason: reasonText(r.reason) });
  },
  'case.restrict': (raw) => {
    const r = exactFields(raw, ['lot_id', 'quantity', 'expected_version', 'reason']);
    return Object.freeze({ lot_id: walletUUID(r.lot_id), quantity: positive(r.quantity), expected_version: positive(r.expected_version), reason: reasonText(r.reason) });
  },
  'case.release': versionReason,
  'case.appeal': versionReason,
  'reconciliation.assign': (raw) => {
    const r = exactFields(raw, ['expected_version', 'assignee_uid', 'reason']);
    if (typeof r.assignee_uid !== 'string' || !r.assignee_uid || new TextEncoder().encode(r.assignee_uid).length > 256 || r.assignee_uid.trim() !== r.assignee_uid || /[\u0000-\u001f\u007f\uFFFD]/u.test(r.assignee_uid)) throw new TypeError('Invalid wallet assignee');
    return Object.freeze({ expected_version: positive(r.expected_version), assignee_uid: r.assignee_uid, reason: reasonText(r.reason) });
  },
  'reconciliation.resolve': (raw) => {
    const r = exactFields(raw, ['expected_version', 'resolution', 'evidence_reference', 'reason']);
    if (r.resolution !== 'CHANNEL_CORRECTED' && r.resolution !== 'OPERATION_LINKED' && r.resolution !== 'CASE_LINKED' && r.resolution !== 'EVIDENCE_ACCEPTED') throw new TypeError('Invalid wallet reconciliation resolution');
    if (typeof r.evidence_reference !== 'string' || !r.evidence_reference.trim() || [...r.evidence_reference].length > 512 || /[\u0000-\u001f\u007f\uFFFD]/u.test(r.evidence_reference)) throw new TypeError('Invalid wallet evidence reference');
    return Object.freeze({ expected_version: positive(r.expected_version), resolution: r.resolution, evidence_reference: r.evidence_reference, reason: reasonText(r.reason) });
  },
  'coverage.record': (raw) => {
    const r = exactFields(raw, ['evidence_as_of', 'available_cash_fen', 'approved_required_fen', 'methodology_reference', 'evidence_sha256', 'evidence_reference', 'reason']);
    if (typeof r.evidence_as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{0,8}[1-9])?Z$/.test(r.evidence_as_of) || Number.isNaN(Date.parse(r.evidence_as_of))) throw new TypeError('Invalid wallet evidence time');
    const aggregate = (value: unknown) => {
      if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,77})$/.test(value)) throw new TypeError('Invalid wallet aggregate');
      return value;
    };
    const reference = (value: unknown) => {
      if (typeof value !== 'string' || !value.trim() || value !== value.trim() || [...value].length > 512 || /[\u0000-\u001f\u007f\uFFFD]/u.test(value)) throw new TypeError('Invalid wallet reference');
      return value;
    };
    if (typeof r.evidence_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.evidence_sha256)) throw new TypeError('Invalid wallet evidence hash');
    return Object.freeze({ evidence_as_of: r.evidence_as_of, available_cash_fen: aggregate(r.available_cash_fen),
      approved_required_fen: aggregate(r.approved_required_fen), methodology_reference: reference(r.methodology_reference),
      evidence_sha256: r.evidence_sha256, evidence_reference: reference(r.evidence_reference), reason: reasonText(r.reason) });
  },
  'policy.update': createWalletPolicyUpdateRequest,
};

export function isWalletAction(value: unknown): value is WalletAction {
  return typeof value === 'string' && Object.hasOwn(builders, value);
}

/** Form-data builder, not a raw JSON decoder or an authorization decision. */
export function createWalletRequest<A extends WalletAction>(action: A, raw: unknown): WalletRequests[A] {
  if (!isWalletAction(action)) throw new TypeError('Invalid wallet action');
  return builders[action](raw);
}

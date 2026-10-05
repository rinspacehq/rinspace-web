import { convertBoundShangong, parsePositiveWalletInteger, parseWalletInteger, rechargeShangong, walletIntegerString } from './amount';
import { exactFields, objectFields, reasonText, walletUUID } from './validation';

const states = {
  recharge: ['RESERVED', 'PAYABLE', 'QUERY_UNKNOWN', 'CLOSE_PENDING', 'PAID_CONFIRMED', 'CREDIT_POSTED', 'CLOSED_UNPAID', 'EXCEPTION'],
  refund: ['REQUESTED_RESERVED', 'REJECTED', 'CANCELLED', 'APPROVED_QUEUED', 'SUBMITTED', 'RESULT_UNKNOWN', 'CHANNEL_SUCCEEDED', 'COMPLETED', 'FAILED_FINAL', 'EXCEPTION'],
  tip: ['PENDING', 'COMPLETED', 'REJECTED', 'EXCEPTION'],
  conversion: ['PENDING', 'COMPLETED', 'REJECTED', 'EXCEPTION'],
  policy: ['PENDING', 'COMPLETED', 'REJECTED', 'EXCEPTION'],
} as const;
export type WalletOperationKind = keyof typeof states;
export type WalletOperation = {
  [K in WalletOperationKind]: Readonly<{
    operation_id: string; kind: K; state: typeof states[K][number]; version: string; created_at: string;
  }>
}[WalletOperationKind];
export interface WalletBalance {
  readonly total: string;
  readonly available: string;
  readonly reserved: string;
  readonly restricted: string;
}
export interface WalletQuota {
  readonly date: string;
  readonly limit_fen: string;
  readonly confirmed_fen: string;
  readonly unresolved_fen: string;
  readonly remaining_fen: string;
}
export interface WalletSummary {
  readonly ordinary: WalletBalance;
  readonly bound: WalletBalance;
  readonly quota: WalletQuota;
  readonly policy_version: string;
  readonly watermark: string;
}
export interface WalletCaseSummary {
  readonly case_id: string;
  readonly state: 'OPEN' | 'UNDER_REVIEW';
  readonly version: string;
  readonly ordinary_restricted: string;
  readonly bound_restricted: string;
  readonly created_at: string;
  readonly last_appeal_at?: string;
}
export interface WalletCasePage { readonly items: readonly WalletCaseSummary[] }
export interface WalletAppealResult {
  readonly case_id: string;
  readonly appeal_id: string;
  readonly state: 'OPEN' | 'UNDER_REVIEW';
  readonly version: string;
  readonly created_at: string;
}

export function walletStateAllowed(kind: unknown, state: unknown): boolean {
  if (typeof kind !== 'string' || !Object.hasOwn(states, kind) || typeof state !== 'string') return false;
  // The own-key test fixes the index to this finite, non-prototype catalog.
  const allowed: readonly string[] = states[kind as WalletOperationKind];
  return allowed.includes(state);
}

function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Invalid wallet date');
  // These bounded calendar components are not money. Amounts never use Number.
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new TypeError('Invalid wallet date');
  return value;
}

export function walletUTCTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)
    || /^0001-01-01T00:00:00(\.0+)?Z$/.test(value)) throw new TypeError('Invalid wallet timestamp');
  calendarDate(value.slice(0, 10));
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) throw new TypeError('Invalid wallet timestamp');
  return value;
}

export function parseWalletOperation(raw: unknown): WalletOperation {
  const r = exactFields(raw, ['operation_id', 'kind', 'state', 'version', 'created_at']);
  const operation_id = walletUUID(r.operation_id);
  const version = walletIntegerString(parsePositiveWalletInteger(r.version));
  const created_at = walletUTCTimestamp(r.created_at);
  if (!walletStateAllowed(r.kind, r.state)) throw new TypeError('Invalid wallet operation state');
  // The paired kind/state catalog above validates this discriminated union;
  // TypeScript cannot derive correlated discriminants from an unknown object.
  return Object.freeze({ operation_id, kind: r.kind, state: r.state, version, created_at }) as WalletOperation;
}

export function parseWalletBalance(raw: unknown): WalletBalance {
  const r = exactFields(raw, ['total', 'available', 'reserved', 'restricted']);
  const total = parseWalletInteger(r.total);
  const available = parseWalletInteger(r.available);
  const reserved = parseWalletInteger(r.reserved);
  const restricted = parseWalletInteger(r.restricted);
  if (total !== available + reserved + restricted) throw new TypeError('Inconsistent wallet balance');
  return Object.freeze({ total: total.toString(), available: available.toString(), reserved: reserved.toString(), restricted: restricted.toString() });
}

export function parseWalletSummary(raw: unknown): WalletSummary {
  const r = exactFields(raw, ['ordinary', 'bound', 'quota', 'policy_version', 'watermark']);
  const q = exactFields(r.quota, ['date', 'limit_fen', 'confirmed_fen', 'unresolved_fen', 'remaining_fen']);
  const date = calendarDate(q.date);
  const limit = parsePositiveWalletInteger(q.limit_fen);
  rechargeShangong(limit);
  const confirmed = parseWalletInteger(q.confirmed_fen);
  const unresolved = parseWalletInteger(q.unresolved_fen);
  const remaining = parseWalletInteger(q.remaining_fen);
  const difference = limit - confirmed - unresolved;
  if (remaining !== (difference < 0n ? 0n : difference)) throw new TypeError('Inconsistent wallet quota');
  return Object.freeze({
    ordinary: parseWalletBalance(r.ordinary), bound: parseWalletBalance(r.bound),
    quota: Object.freeze({ date, limit_fen: limit.toString(), confirmed_fen: confirmed.toString(), unresolved_fen: unresolved.toString(), remaining_fen: remaining.toString() }),
    policy_version: walletIntegerString(parsePositiveWalletInteger(r.policy_version)),
    watermark: walletIntegerString(parseWalletInteger(r.watermark)),
  });
}

export function parseWalletCaseSummary(raw: unknown): WalletCaseSummary {
  const r = objectFields(raw, ['case_id', 'state', 'version', 'ordinary_restricted', 'bound_restricted', 'created_at', 'last_appeal_at']);
  const required = ['case_id', 'state', 'version', 'ordinary_restricted', 'bound_restricted', 'created_at'] as const;
  if (required.some(key => !Object.hasOwn(r, key)) || (r.state !== 'OPEN' && r.state !== 'UNDER_REVIEW')) throw new TypeError('Invalid wallet case');
  const last = Object.hasOwn(r, 'last_appeal_at') ? { last_appeal_at: walletUTCTimestamp(r.last_appeal_at) } : {};
  return Object.freeze({
    case_id: walletUUID(r.case_id), state: r.state,
    version: positive(r.version),
    ordinary_restricted: walletIntegerString(parseWalletInteger(r.ordinary_restricted)),
    bound_restricted: walletIntegerString(parseWalletInteger(r.bound_restricted)),
    created_at: walletUTCTimestamp(r.created_at), ...last,
  });
}

export function parseWalletCasePage(raw: unknown): WalletCasePage {
  const r = exactFields(raw, ['items']);
  if (!Array.isArray(r.items) || r.items.length > 100) throw new TypeError('Invalid wallet cases');
  return Object.freeze({ items: Object.freeze(r.items.map(parseWalletCaseSummary)) });
}

export function parseWalletAppealResult(raw: unknown): WalletAppealResult {
  const r = exactFields(raw, ['case_id', 'appeal_id', 'state', 'version', 'created_at']);
  if (r.state !== 'OPEN' && r.state !== 'UNDER_REVIEW') throw new TypeError('Invalid wallet appeal');
  return Object.freeze({
    case_id: walletUUID(r.case_id), appeal_id: walletUUID(r.appeal_id), state: r.state,
    version: positive(r.version), created_at: walletUTCTimestamp(r.created_at),
  });
}

/** A submitted/confirmed channel fact alone is not a completed wallet effect. */
export function walletOperationCompleted(operation: WalletOperation): boolean {
  return operation.kind === 'recharge' ? operation.state === 'CREDIT_POSTED' : operation.state === 'COMPLETED';
}

export interface WalletTipPreview {
  readonly preview_id: string;
  readonly expires_at: string;
  readonly content: Readonly<{ content_type: 'blog' | 'book'; post_id: string; title: string }>;
  readonly recipient: Readonly<{ uid: string; display_name: string }>;
  readonly quantity: string;
  readonly policy_version: string;
  readonly eligibility_version: string;
}
export interface WalletConversionPreview {
  readonly preview_id: string;
  readonly expires_at: string;
  readonly bound_quantity: string;
  readonly ordinary_quantity: string;
  readonly remaining_bound: string;
  readonly policy_version: string;
}

const positive = (raw: unknown): string => walletIntegerString(parsePositiveWalletInteger(raw));

export function parseWalletTipPreview(raw: unknown): WalletTipPreview {
  const r = exactFields(raw, ['preview_id', 'expires_at', 'content', 'recipient', 'quantity', 'policy_version', 'eligibility_version']);
  const c = exactFields(r.content, ['content_type', 'post_id', 'title']);
  const author = exactFields(r.recipient, ['uid', 'display_name']);
  if (c.content_type !== 'blog' && c.content_type !== 'book') throw new TypeError('Invalid wallet content type');
  const uid = reasonText(author.uid);
  if (new TextEncoder().encode(uid).length > 256) throw new TypeError('Invalid wallet recipient');
  return Object.freeze({
    preview_id: walletUUID(r.preview_id), expires_at: walletUTCTimestamp(r.expires_at),
    content: Object.freeze({ content_type: c.content_type, post_id: positive(c.post_id), title: reasonText(c.title) }),
    recipient: Object.freeze({ uid, display_name: reasonText(author.display_name) }),
    quantity: positive(r.quantity), policy_version: positive(r.policy_version), eligibility_version: positive(r.eligibility_version),
  });
}

export function parseWalletConversionPreview(raw: unknown): WalletConversionPreview {
  const r = exactFields(raw, ['preview_id', 'expires_at', 'bound_quantity', 'ordinary_quantity', 'remaining_bound', 'policy_version']);
  const bound = parsePositiveWalletInteger(r.bound_quantity);
  const ordinary = parsePositiveWalletInteger(r.ordinary_quantity);
  if (ordinary !== convertBoundShangong(bound)) throw new TypeError('Inconsistent wallet conversion');
  return Object.freeze({
    preview_id: walletUUID(r.preview_id), expires_at: walletUTCTimestamp(r.expires_at),
    bound_quantity: bound.toString(), ordinary_quantity: ordinary.toString(),
    remaining_bound: walletIntegerString(parseWalletInteger(r.remaining_bound)), policy_version: positive(r.policy_version),
  });
}

const problemSemantics = {
  INVALID_REQUEST: [400, false], INVALID_AMOUNT: [400, false], INVALID_IDEMPOTENCY_KEY: [400, false],
  UNAUTHENTICATED: [401, false], PERMISSION_DENIED: [403, false], WITHDRAWAL_UNAVAILABLE: [403, false], NOT_FOUND: [404, false],
  CONFIRMATION_STALE: [409, false], IDEMPOTENCY_CONFLICT: [409, false], VERSION_CONFLICT: [409, false], APPROVAL_STALE: [409, false], REFUND_NOT_CANCELLABLE: [409, false],
  INSUFFICIENT_AVAILABLE: [422, false], DAILY_LIMIT: [422, false], BALANCE_LIMIT: [422, false], CONTENT_UNAVAILABLE: [422, false], RECIPIENT_RESTRICTED: [422, false], REFUND_EXCEEDS_SOURCE: [422, false], APPROVAL_REQUIRED: [422, false],
  RATE_LIMITED: [429, true], RESULT_UNKNOWN: [503, true], SERVICE_PAUSED: [503, true], DEPENDENCY_UNAVAILABLE: [503, true],
} as const;
export type WalletProblemCode = keyof typeof problemSemantics;
export interface WalletProblem {
  readonly error: Readonly<{ code: WalletProblemCode; message_key: string; operation_id?: string; retryable: boolean }>;
}

export function parseWalletProblem(raw: unknown, httpStatus: number): WalletProblem {
  const envelope = exactFields(raw, ['error']);
  const r = objectFields(envelope.error, ['code', 'message_key', 'operation_id', 'retryable']);
  if (typeof r.code !== 'string' || !Object.hasOwn(problemSemantics, r.code)) throw new TypeError('Unknown wallet problem');
  const code = r.code as WalletProblemCode;
  const [expectedStatus, retryable] = problemSemantics[code];
  const message_key = `wallet.errors.${code.toLowerCase()}`;
  if (httpStatus !== expectedStatus || r.retryable !== retryable || r.message_key !== message_key) throw new TypeError('Inconsistent wallet problem');
  const operation = Object.hasOwn(r, 'operation_id') ? { operation_id: walletUUID(r.operation_id) } : {};
  return Object.freeze({ error: Object.freeze({ code, message_key, ...operation, retryable }) });
}

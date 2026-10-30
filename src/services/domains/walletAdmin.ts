import { publicEnv } from "@/app/config/env";
import {
  parsePositiveWalletInteger,
  parseWalletInteger,
  walletIntegerString,
} from "@/features/wallet/amount";
import {
  createWalletRequest,
  type WalletRequests,
} from "@/features/wallet/request";
import {
  objectFields,
  reasonText,
  walletUUID,
} from "@/features/wallet/validation";
import { authHeaders, getCurrentAuthUser } from "@/services/phoneAuth";

export type WalletAdminCapabilities = Readonly<
  Record<
    | "wallet.refund.view"
    | "wallet.refund.review"
    | "wallet.refund.revoke"
    | "wallet.policy.view"
    | "wallet.policy.configure"
    | "wallet.risk.view"
    | "wallet.risk.review"
    | "wallet.risk.restrict"
    | "wallet.reconciliation.manage"
    | "wallet.coverage.manage",
    boolean
  >
>;
export type WalletAdminRefund = Readonly<{
  operationId: string;
  applicantUid: string;
  paymentOperationId: string;
  amountFen: string;
  state: string;
  version: string;
  createdAt: string;
  submittedAt: string;
  outTradeNo: string;
  paidAt: string;
  reservedQuantity: string;
  requestReason: string;
}>;
export type WalletAdminRefundPage = Readonly<{
  items: readonly WalletAdminRefund[];
  nextCursor: string;
}>;
export type WalletAdminRefundReview = Readonly<{
  decision: "approve" | "reject" | "revoke";
  reviewerUid: string;
  reason: string;
  createdAt: string;
}>;
export type WalletAdminRefundDetail = WalletAdminRefund &
  Readonly<{
    firstResponseAt: string;
    paymentAmountFen: string;
    reviews: readonly WalletAdminRefundReview[];
  }>;
export type WalletAdminCase = Readonly<{
  caseId: string;
  kind: "dispute" | "refund" | "reconciliation";
  state: "OPEN" | "UNDER_REVIEW" | "RESOLVED";
  version: string;
  subjectUid: string;
  paymentOperationId: string;
  adjustmentCount: string;
  amountFen: string;
  reviewDueAt: string;
  reason: string;
  resolution: string;
  createdAt: string;
}>;
export type WalletAdminCasePage = Readonly<{
  items: readonly WalletAdminCase[];
  nextCursor: string;
}>;
export type WalletAdminCaseActionResult = Readonly<{
  caseId: string;
  state: "UNDER_REVIEW" | "RESOLVED";
  version: string;
  createdAt: string;
}>;
export type WalletAdminCaseSource = Readonly<{
  lotId: string;
  ownerUid: string;
  unit: "SG" | "SG_BOUND";
  kind: "recharge" | "tip" | "conversion";
  issued: string;
  remaining: string;
  reserved: string;
  restricted: string;
  available: string;
  version: string;
}>;
export type WalletAdminCaseRestriction = Readonly<{
  holdId: string;
  lotId: string;
  ownerUid: string;
  unit: "SG" | "SG_BOUND";
  quantity: string;
  state: "ACTIVE" | "RELEASED";
  holdVersion: string;
  createdAt: string;
  closedAt: string;
  reason: string;
}>;
export type WalletAdminCaseSources = Readonly<{
  sources: readonly WalletAdminCaseSource[];
  restrictions: readonly WalletAdminCaseRestriction[];
  appeals: readonly WalletAdminCaseAppeal[];
}>;
export type WalletAdminCaseAppeal = Readonly<{
  appealId: string;
  appellantRole: "subject" | "affected_owner";
  caseVersion: string;
  reason: string;
  createdAt: string;
}>;
export type WalletAdminRestrictionResult = Readonly<{
  caseId: string;
  holdId: string;
  lotId: string;
  quantity: string;
  holdState: "ACTIVE" | "RELEASED";
  caseVersion: string;
  holdVersion: string;
  createdAt: string;
}>;
export type WalletAdminReconciliation = Readonly<{
  runId: string;
  billDate: string;
  billType: string;
  state:
    | "WAITING"
    | "RUNNING"
    | "MISSING"
    | "FAILED"
    | "MATCHED"
    | "DIFFERENCES";
  grossFen: string;
  feeFen: string;
  netFen: string;
  differenceCount: string;
  createdAt: string;
  completedAt: string;
}>;
export type WalletAdminReconciliationItem = Readonly<{
  itemId: string;
  differenceKey: string;
  code: string;
  operationId: string;
  caseId: string;
  expectedFen: string;
  actualFen: string;
  state: "OPEN" | "ASSIGNED" | "RESOLVED";
  version: string;
  assignedTo: string;
  resolution:
    | ""
    | "CHANNEL_CORRECTED"
    | "OPERATION_LINKED"
    | "CASE_LINKED"
    | "EVIDENCE_ACCEPTED";
  evidenceReference: string;
  createdAt: string;
  updatedAt: string;
}>;
export type WalletAdminReconciliationActionResult = Readonly<{
  itemId: string;
  state: "ASSIGNED" | "RESOLVED";
  version: string;
  assignedTo: string;
  resolution: WalletAdminReconciliationItem["resolution"];
  evidenceReference: string;
  createdAt: string;
}>;
export type WalletAdminObligations = Readonly<{
  asOf: string;
  refundablePrincipalFen: string;
  refundReservedFen: string;
  approvedUnpaidRefundFen: string;
  openDisputeExposureFen: string;
  unresolvedPaymentFen: string;
  openCaseCount: string;
  unmatchedReconciliationCount: string;
  reconciliationDifferenceCount: string;
}>;
export type WalletAdminCoverageSnapshot = Readonly<{
  snapshotId: string;
  evidenceAsOf: string;
  availableCashFen: string;
  approvedRequiredFen: string;
  state: "COVERED" | "SHORTFALL";
  shortfallFen: string;
  methodologyReference: string;
  evidenceSha256: string;
  evidenceReference: string;
  refundablePrincipalFen: string;
  refundReservedFen: string;
  approvedUnpaidRefundFen: string;
  openDisputeExposureFen: string;
  unresolvedPaymentFen: string;
  alertState: "" | "OPEN";
  createdBy: string;
  reason: string;
  createdAt: string;
}>;
export type WalletAdminPolicy = Readonly<{
  version: string;
  dailyRechargeLimitFen: string;
  rechargeEnabled: boolean;
  tipEnabled: boolean;
  convertEnabled: boolean;
  createdBy: string;
  reason: string;
  createdAt: string;
}>;
export type WalletAdminAIPrice = Readonly<{
  version: string;
  enabled: boolean;
  priceSg: string;
  singleLimitSg: string | null;
  dailyLimitSg: string | null;
  dailyCallsLimit: number | null;
  createdBy: string;
  reason: string;
  createdAt: string;
}>;
export type WalletAdminDeepSeekPrice = Readonly<{
  currency: "CNY";
  priceUnit: "yuan_per_million_tokens";
  latestPrices: Readonly<Record<string, string>> | null;
  previousPrices: Readonly<Record<string, string>> | null;
  checkedAt: string | null;
  lastAttemptAt: string;
  changedAt: string | null;
  status: "never" | "first" | "changed" | "unchanged" | "error";
  errorCode: string | null;
  stale: boolean;
}>;
export type WalletAdminAgentPolicy = Readonly<{
  version: string;
  enabled: boolean;
  model: "deepseek-flash";
  providerPriceVersion: string;
  providerInputCnyMicrosPerMillion: string;
  providerCachedInputCnyMicrosPerMillion: string;
  providerOutputCnyMicrosPerMillion: string;
  inputSgPerMillion: string;
  cachedInputSgPerMillion: string;
  outputSgPerMillion: string;
  sgRateScale: string;
  maxIterations: number;
  maxOutputTokens: number;
  taskBudgetSg: string;
  dailyCallsLimit: number;
  dailyTokensLimit: string;
  dailySgLimit: string;
  sgCnyMicrosPerUnit: string;
  createdBy: string;
  reason: string;
  createdAt: string;
}>;
export type WalletAdminAgentUsageState =
  | "PREPARED"
  | "RESERVED"
  | "DISPATCHED"
  | "RESULT_UNKNOWN"
  | "RECEIPT_STORED"
  | "SETTLED"
  | "FAILED_FINAL"
  | "ABORTED";
export type WalletAdminAgentUsage = Readonly<{
  runId: string;
  operationId: string;
  actorUid: string;
  projectId: string;
  model: "deepseek-flash";
  providerPriceVersion: string;
  state: WalletAdminAgentUsageState;
  inputTokens: string | null;
  cachedInputTokens: string | null;
  outputTokens: string | null;
  providerCostCnyMicros: string | null;
  goodnessChargedSg: string | null;
  goodnessRevenueCnyMicros: string | null;
  profitCnyMicros: string | null;
  providerRequestId: string;
  createdAt: string;
  updatedAt: string;
}>;
export type WalletAdminAgentUsageFilter = Readonly<{
  actorUid?: string;
  runId?: string;
  model?: "deepseek-flash";
  state?: "all" | "pending" | "settled" | "failed";
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
}>;
export type WalletAdminAgentPolicyUpdate = Readonly<{
  expectedVersion: string;
  enabled: boolean;
  model: "deepseek-flash";
  providerPriceVersion: string;
  providerInputCnyMicrosPerMillion: string;
  providerCachedInputCnyMicrosPerMillion: string;
  providerOutputCnyMicrosPerMillion: string;
  inputSgPerMillion: string;
  cachedInputSgPerMillion: string;
  outputSgPerMillion: string;
  sgRateScale: string;
  maxIterations: number;
  maxOutputTokens: number;
  taskBudgetSg: string;
  dailyCallsLimit: number;
  dailyTokensLimit: string;
  dailySgLimit: string;
  sgCnyMicrosPerUnit: string;
  reason: string;
}>;

export class WalletAdminError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(code);
  }
}

const root = `${publicEnv.publicBasePath || ""}/admin/api/wallet`;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WalletAdminError("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
function text(value: unknown) {
  if (typeof value !== "string") throw new WalletAdminError("INVALID_RESPONSE");
  return value;
}
function invalidResponse<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof WalletAdminError) throw error;
    throw new WalletAdminError("INVALID_RESPONSE");
  }
}
function integer(value: unknown) {
  return invalidResponse(() =>
    walletIntegerString(parsePositiveWalletInteger(value)),
  );
}
function nonNegativeInteger(value: unknown) {
  return invalidResponse(() => walletIntegerString(parseWalletInteger(value)));
}
function signedInteger(value: unknown) {
  const result = text(value);
  if (!/^-?(?:0|[1-9]\d*)$/.test(result))
    throw new WalletAdminError("INVALID_RESPONSE");
  const parsed = BigInt(result);
  if (
    parsed < -(1n << 63n) ||
    parsed > (1n << 63n) - 1n ||
    parsed.toString() !== result
  )
    throw new WalletAdminError("INVALID_RESPONSE");
  return result;
}
function aggregateInteger(value: unknown) {
  const result = text(value);
  if (!/^(?:0|[1-9]\d{0,77})$/.test(result))
    throw new WalletAdminError("INVALID_RESPONSE");
  return result;
}
const refundRequired = [
  "operation_id",
  "applicant_uid",
  "payment_operation_id",
  "amount_fen",
  "state",
  "version",
  "created_at",
  "out_trade_no",
  "paid_at",
  "reserved_quantity",
  "request_reason",
] as const;
const refundStates = new Set([
  "REQUESTED_RESERVED",
  "REJECTED",
  "CANCELLED",
  "APPROVED_QUEUED",
  "SUBMITTED",
  "RESULT_UNKNOWN",
  "CHANNEL_SUCCEEDED",
  "COMPLETED",
  "FAILED_FINAL",
  "EXCEPTION",
]);
function adminText(value: unknown) {
  const result = text(value);
  if (!result || [...result].length > 256)
    throw new WalletAdminError("INVALID_RESPONSE");
  return result;
}
function adminTime(value: unknown) {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{0,8}[1-9])?Z$/.test(result) ||
    Number.isNaN(Date.parse(result))
  )
    throw new WalletAdminError("INVALID_RESPONSE");
  return result;
}
function parseRefund(item: Record<string, unknown>): WalletAdminRefund {
  if (refundRequired.some((key) => !Object.hasOwn(item, key)))
    throw new WalletAdminError("INVALID_RESPONSE");
  const amountFen = integer(item.amount_fen);
  const state = text(item.state);
  const reservedQuantity = walletIntegerString(
    parseWalletInteger(item.reserved_quantity),
  );
  if (
    !refundStates.has(state) ||
    BigInt(amountFen) % 10n !== 0n ||
    BigInt(reservedQuantity) < 0n ||
    BigInt(reservedQuantity) > BigInt(amountFen) / 10n
  )
    throw new WalletAdminError("INVALID_RESPONSE");
  const outTradeNo = text(item.out_trade_no);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(outTradeNo))
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze({
    operationId: walletUUID(item.operation_id),
    applicantUid: adminText(item.applicant_uid),
    paymentOperationId: walletUUID(item.payment_operation_id),
    amountFen,
    state,
    version: integer(item.version),
    createdAt: adminTime(item.created_at),
    submittedAt:
      item.submitted_at === undefined ? "" : adminTime(item.submitted_at),
    outTradeNo,
    paidAt: adminTime(item.paid_at),
    reservedQuantity,
    requestReason: reasonText(item.request_reason),
  });
}
function refund(value: unknown): WalletAdminRefund {
  return invalidResponse(() =>
    parseRefund(objectFields(value, [...refundRequired, "submitted_at"])),
  );
}
function refundDetail(value: unknown): WalletAdminRefundDetail {
  return invalidResponse(() => {
    const item = objectFields(value, [
      ...refundRequired,
      "submitted_at",
      "first_response_at",
      "payment_amount_fen",
      "reviews",
    ]);
    if (
      !Object.hasOwn(item, "payment_amount_fen") ||
      !Object.hasOwn(item, "reviews") ||
      !Array.isArray(item.reviews)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const summary = parseRefund(item);
    const paymentAmountFen = integer(item.payment_amount_fen);
    if (BigInt(paymentAmountFen) < BigInt(summary.amountFen))
      throw new WalletAdminError("INVALID_RESPONSE");
    const reviews = item.reviews.map((value) => {
      const review = objectFields(value, [
        "decision",
        "reviewer_uid",
        "reason",
        "created_at",
      ]);
      if (
        Object.keys(review).length !== 4 ||
        (review.decision !== "approve" &&
          review.decision !== "reject" &&
          review.decision !== "revoke")
      )
        throw new WalletAdminError("INVALID_RESPONSE");
      return Object.freeze({
        decision: review.decision,
        reviewerUid: adminText(review.reviewer_uid),
        reason: reasonText(review.reason),
        createdAt: adminTime(review.created_at),
      });
    });
    return Object.freeze({
      ...summary,
      firstResponseAt:
        item.first_response_at === undefined
          ? ""
          : adminTime(item.first_response_at),
      paymentAmountFen,
      reviews: Object.freeze(reviews),
    });
  });
}
function riskCase(value: unknown): WalletAdminCase {
  return invalidResponse(() => {
    const required = [
      "case_id",
      "kind",
      "state",
      "version",
      "adjustment_count",
      "amount_fen",
      "review_due_at",
      "reason",
      "created_at",
    ] as const;
    const item = objectFields(value, [
      ...required,
      "subject_uid",
      "payment_operation_id",
      "resolution",
    ]);
    if (required.some((key) => !Object.hasOwn(item, key)))
      throw new WalletAdminError("INVALID_RESPONSE");
    if (
      item.kind !== "dispute" &&
      item.kind !== "refund" &&
      item.kind !== "reconciliation"
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    if (
      item.state !== "OPEN" &&
      item.state !== "UNDER_REVIEW" &&
      item.state !== "RESOLVED"
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const subjectUid =
      item.subject_uid === undefined ? "" : adminText(item.subject_uid);
    if (item.kind === "dispute" && !subjectUid)
      throw new WalletAdminError("INVALID_RESPONSE");
    const resolution =
      item.resolution === undefined ? "" : reasonText(item.resolution);
    if ((item.state === "RESOLVED") !== Boolean(resolution))
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      caseId: walletUUID(item.case_id),
      kind: item.kind,
      state: item.state,
      version: integer(item.version),
      subjectUid,
      paymentOperationId:
        item.payment_operation_id === undefined
          ? ""
          : walletUUID(item.payment_operation_id),
      adjustmentCount: nonNegativeInteger(item.adjustment_count),
      amountFen: nonNegativeInteger(item.amount_fen),
      reviewDueAt: adminTime(item.review_due_at),
      reason: reasonText(item.reason),
      resolution,
      createdAt: adminTime(item.created_at),
    });
  });
}
function riskCaseActionResult(value: unknown): WalletAdminCaseActionResult {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "case_id",
      "state",
      "version",
      "created_at",
    ]);
    if (
      Object.keys(item).length !== 4 ||
      (item.state !== "UNDER_REVIEW" && item.state !== "RESOLVED")
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const version = integer(item.version);
    if (BigInt(version) <= 1n) throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      caseId: walletUUID(item.case_id),
      state: item.state,
      version,
      createdAt: adminTime(item.created_at),
    });
  });
}
function caseSource(value: unknown): WalletAdminCaseSource {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "lot_id",
      "owner_uid",
      "unit",
      "kind",
      "issued",
      "remaining",
      "reserved",
      "restricted",
      "available",
      "version",
    ]);
    if (
      Object.keys(item).length !== 10 ||
      (item.unit !== "SG" && item.unit !== "SG_BOUND") ||
      (item.kind !== "recharge" &&
        item.kind !== "tip" &&
        item.kind !== "conversion")
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const issued = integer(item.issued);
    const remaining = nonNegativeInteger(item.remaining);
    const reserved = nonNegativeInteger(item.reserved);
    const restricted = nonNegativeInteger(item.restricted);
    const available = nonNegativeInteger(item.available);
    if (
      BigInt(remaining) > BigInt(issued) ||
      BigInt(reserved) + BigInt(restricted) + BigInt(available) !==
        BigInt(remaining)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      lotId: walletUUID(item.lot_id),
      ownerUid: adminText(item.owner_uid),
      unit: item.unit,
      kind: item.kind,
      issued,
      remaining,
      reserved,
      restricted,
      available,
      version: integer(item.version),
    });
  });
}
function caseRestriction(value: unknown): WalletAdminCaseRestriction {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "hold_id",
      "lot_id",
      "owner_uid",
      "unit",
      "quantity",
      "state",
      "hold_version",
      "created_at",
      "closed_at",
      "reason",
    ]);
    if (
      !Object.hasOwn(item, "hold_id") ||
      !Object.hasOwn(item, "lot_id") ||
      !Object.hasOwn(item, "owner_uid") ||
      !Object.hasOwn(item, "unit") ||
      !Object.hasOwn(item, "quantity") ||
      !Object.hasOwn(item, "state") ||
      !Object.hasOwn(item, "hold_version") ||
      !Object.hasOwn(item, "created_at") ||
      !Object.hasOwn(item, "reason") ||
      (item.unit !== "SG" && item.unit !== "SG_BOUND") ||
      (item.state !== "ACTIVE" && item.state !== "RELEASED")
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const closedAt =
      item.closed_at === undefined ? "" : adminTime(item.closed_at);
    if ((item.state === "ACTIVE") !== !closedAt)
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      holdId: walletUUID(item.hold_id),
      lotId: walletUUID(item.lot_id),
      ownerUid: adminText(item.owner_uid),
      unit: item.unit,
      quantity: integer(item.quantity),
      state: item.state,
      holdVersion: integer(item.hold_version),
      createdAt: adminTime(item.created_at),
      closedAt,
      reason: reasonText(item.reason),
    });
  });
}
function caseAppeal(value: unknown): WalletAdminCaseAppeal {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "appeal_id",
      "appellant_role",
      "case_version",
      "reason",
      "created_at",
    ]);
    if (
      Object.keys(item).length !== 5 ||
      (item.appellant_role !== "subject" &&
        item.appellant_role !== "affected_owner")
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      appealId: walletUUID(item.appeal_id),
      appellantRole: item.appellant_role,
      caseVersion: integer(item.case_version),
      reason: reasonText(item.reason),
      createdAt: adminTime(item.created_at),
    });
  });
}
function restrictionResult(value: unknown): WalletAdminRestrictionResult {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "case_id",
      "hold_id",
      "lot_id",
      "quantity",
      "hold_state",
      "case_version",
      "hold_version",
      "created_at",
    ]);
    if (
      Object.keys(item).length !== 8 ||
      (item.hold_state !== "ACTIVE" && item.hold_state !== "RELEASED")
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      caseId: walletUUID(item.case_id),
      holdId: walletUUID(item.hold_id),
      lotId: walletUUID(item.lot_id),
      quantity: integer(item.quantity),
      holdState: item.hold_state,
      caseVersion: integer(item.case_version),
      holdVersion: integer(item.hold_version),
      createdAt: adminTime(item.created_at),
    });
  });
}
function reconciliation(value: unknown): WalletAdminReconciliation {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "run_id",
      "bill_date",
      "bill_type",
      "state",
      "gross_fen",
      "fee_fen",
      "net_fen",
      "difference_count",
      "created_at",
      "completed_at",
    ]);
    for (const key of [
      "run_id",
      "bill_date",
      "bill_type",
      "state",
      "difference_count",
      "created_at",
    ] as const)
      if (!Object.hasOwn(item, key))
        throw new WalletAdminError("INVALID_RESPONSE");
    if (
      item.state !== "WAITING" &&
      item.state !== "RUNNING" &&
      item.state !== "MISSING" &&
      item.state !== "FAILED" &&
      item.state !== "MATCHED" &&
      item.state !== "DIFFERENCES"
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const billDate = text(item.bill_date);
    const parsedDate = new Date(`${billDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(billDate) ||
      Number.isNaN(parsedDate.valueOf()) ||
      parsedDate.toISOString().slice(0, 10) !== billDate
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const billType = text(item.bill_type);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(billType))
      throw new WalletAdminError("INVALID_RESPONSE");
    const grossFen =
      item.gross_fen === undefined ? "" : signedInteger(item.gross_fen);
    const feeFen =
      item.fee_fen === undefined ? "" : signedInteger(item.fee_fen);
    const netFen =
      item.net_fen === undefined ? "" : signedInteger(item.net_fen);
    if (
      (item.state === "MATCHED" || item.state === "DIFFERENCES") &&
      (!grossFen || !feeFen || !netFen || item.completed_at === undefined)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      runId: walletUUID(item.run_id),
      billDate,
      billType,
      state: item.state,
      grossFen,
      feeFen,
      netFen,
      differenceCount: nonNegativeInteger(item.difference_count),
      createdAt: adminTime(item.created_at),
      completedAt:
        item.completed_at === undefined ? "" : adminTime(item.completed_at),
    });
  });
}
const reconciliationResolutions = new Set([
  "CHANNEL_CORRECTED",
  "OPERATION_LINKED",
  "CASE_LINKED",
  "EVIDENCE_ACCEPTED",
]);
function reconciliationItem(value: unknown): WalletAdminReconciliationItem {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "item_id",
      "difference_key",
      "code",
      "operation_id",
      "case_id",
      "expected_fen",
      "actual_fen",
      "state",
      "version",
      "assigned_to",
      "resolution",
      "evidence_reference",
      "created_at",
      "updated_at",
    ]);
    for (const key of [
      "item_id",
      "difference_key",
      "code",
      "state",
      "version",
      "created_at",
      "updated_at",
    ] as const)
      if (!Object.hasOwn(item, key))
        throw new WalletAdminError("INVALID_RESPONSE");
    if (
      item.state !== "OPEN" &&
      item.state !== "ASSIGNED" &&
      item.state !== "RESOLVED"
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const differenceKey = text(item.difference_key);
    const code = text(item.code);
    if (
      !differenceKey ||
      [...differenceKey].length > 256 ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const assignedTo =
      item.assigned_to === undefined ? "" : adminText(item.assigned_to);
    const resolution =
      item.resolution === undefined ? "" : text(item.resolution);
    const evidenceReference =
      item.evidence_reference === undefined
        ? ""
        : text(item.evidence_reference);
    if (
      (item.state === "OPEN" &&
        (assignedTo || resolution || evidenceReference)) ||
      (item.state === "ASSIGNED" &&
        (!assignedTo || resolution || evidenceReference)) ||
      (item.state === "RESOLVED" &&
        (!assignedTo ||
          !reconciliationResolutions.has(resolution) ||
          !evidenceReference ||
          [...evidenceReference].length > 512))
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      itemId: walletUUID(item.item_id),
      differenceKey,
      code,
      operationId:
        item.operation_id === undefined ? "" : walletUUID(item.operation_id),
      caseId: item.case_id === undefined ? "" : walletUUID(item.case_id),
      expectedFen:
        item.expected_fen === undefined ? "" : signedInteger(item.expected_fen),
      actualFen:
        item.actual_fen === undefined ? "" : signedInteger(item.actual_fen),
      state: item.state,
      version: integer(item.version),
      assignedTo,
      resolution: resolution as WalletAdminReconciliationItem["resolution"],
      evidenceReference,
      createdAt: adminTime(item.created_at),
      updatedAt: adminTime(item.updated_at),
    });
  });
}
function reconciliationActionResult(
  value: unknown,
): WalletAdminReconciliationActionResult {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "item_id",
      "state",
      "version",
      "assigned_to",
      "resolution",
      "evidence_reference",
      "created_at",
    ]);
    for (const key of [
      "item_id",
      "state",
      "version",
      "assigned_to",
      "created_at",
    ] as const)
      if (!Object.hasOwn(item, key))
        throw new WalletAdminError("INVALID_RESPONSE");
    const state = item.state;
    const resolution =
      item.resolution === undefined ? "" : text(item.resolution);
    const evidenceReference =
      item.evidence_reference === undefined
        ? ""
        : text(item.evidence_reference);
    if (
      (state !== "ASSIGNED" && state !== "RESOLVED") ||
      (state === "ASSIGNED" && (resolution || evidenceReference)) ||
      (state === "RESOLVED" &&
        (!reconciliationResolutions.has(resolution) || !evidenceReference))
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      itemId: walletUUID(item.item_id),
      state,
      version: integer(item.version),
      assignedTo: adminText(item.assigned_to),
      resolution: resolution as WalletAdminReconciliationItem["resolution"],
      evidenceReference,
      createdAt: adminTime(item.created_at),
    });
  });
}
function obligations(value: unknown): WalletAdminObligations {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "as_of",
      "refundable_principal_fen",
      "refund_reserved_fen",
      "approved_unpaid_refund_fen",
      "open_dispute_exposure_fen",
      "unresolved_payment_fen",
      "open_case_count",
      "unmatched_reconciliation_count",
      "reconciliation_difference_count",
    ]);
    if (Object.keys(item).length !== 9)
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      asOf: adminTime(item.as_of),
      refundablePrincipalFen: aggregateInteger(item.refundable_principal_fen),
      refundReservedFen: aggregateInteger(item.refund_reserved_fen),
      approvedUnpaidRefundFen: aggregateInteger(
        item.approved_unpaid_refund_fen,
      ),
      openDisputeExposureFen: aggregateInteger(item.open_dispute_exposure_fen),
      unresolvedPaymentFen: aggregateInteger(item.unresolved_payment_fen),
      openCaseCount: nonNegativeInteger(item.open_case_count),
      unmatchedReconciliationCount: nonNegativeInteger(
        item.unmatched_reconciliation_count,
      ),
      reconciliationDifferenceCount: nonNegativeInteger(
        item.reconciliation_difference_count,
      ),
    });
  });
}
function coverageSnapshot(value: unknown): WalletAdminCoverageSnapshot {
  return invalidResponse(() => {
    const item = objectFields(value, [
      "snapshot_id",
      "evidence_as_of",
      "available_cash_fen",
      "approved_required_fen",
      "state",
      "shortfall_fen",
      "methodology_reference",
      "evidence_sha256",
      "evidence_reference",
      "refundable_principal_fen",
      "refund_reserved_fen",
      "approved_unpaid_refund_fen",
      "open_dispute_exposure_fen",
      "unresolved_payment_fen",
      "alert_state",
      "created_by",
      "reason",
      "created_at",
    ]);
    for (const key of [
      "snapshot_id",
      "evidence_as_of",
      "available_cash_fen",
      "approved_required_fen",
      "state",
      "shortfall_fen",
      "methodology_reference",
      "evidence_sha256",
      "evidence_reference",
      "refundable_principal_fen",
      "refund_reserved_fen",
      "approved_unpaid_refund_fen",
      "open_dispute_exposure_fen",
      "unresolved_payment_fen",
      "created_by",
      "reason",
      "created_at",
    ] as const)
      if (!Object.hasOwn(item, key))
        throw new WalletAdminError("INVALID_RESPONSE");
    const available = aggregateInteger(item.available_cash_fen);
    const required = aggregateInteger(item.approved_required_fen);
    const shortfall = aggregateInteger(item.shortfall_fen);
    const alert = item.alert_state === undefined ? "" : text(item.alert_state);
    if (
      (item.state !== "COVERED" && item.state !== "SHORTFALL") ||
      (item.state === "COVERED" &&
        (shortfall !== "0" || alert || BigInt(available) < BigInt(required))) ||
      (item.state === "SHORTFALL" &&
        (alert !== "OPEN" ||
          BigInt(shortfall) !== BigInt(required) - BigInt(available)))
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const reference = (raw: unknown) => {
      const result = text(raw);
      if (
        !result.trim() ||
        result !== result.trim() ||
        [...result].length > 512
      )
        throw new WalletAdminError("INVALID_RESPONSE");
      return result;
    };
    const evidenceSha256 = text(item.evidence_sha256);
    if (!/^[0-9a-f]{64}$/.test(evidenceSha256))
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      snapshotId: walletUUID(item.snapshot_id),
      evidenceAsOf: adminTime(item.evidence_as_of),
      availableCashFen: available,
      approvedRequiredFen: required,
      state: item.state,
      shortfallFen: shortfall,
      methodologyReference: reference(item.methodology_reference),
      evidenceSha256,
      evidenceReference: reference(item.evidence_reference),
      refundablePrincipalFen: aggregateInteger(item.refundable_principal_fen),
      refundReservedFen: aggregateInteger(item.refund_reserved_fen),
      approvedUnpaidRefundFen: aggregateInteger(
        item.approved_unpaid_refund_fen,
      ),
      openDisputeExposureFen: aggregateInteger(item.open_dispute_exposure_fen),
      unresolvedPaymentFen: aggregateInteger(item.unresolved_payment_fen),
      alertState: alert as "" | "OPEN",
      createdBy: adminText(item.created_by),
      reason: reasonText(item.reason),
      createdAt: adminTime(item.created_at),
    });
  });
}
function policy(value: unknown): WalletAdminPolicy {
  const item = objectFields(value, [
    "version",
    "daily_recharge_limit_fen",
    "recharge_enabled",
    "tip_enabled",
    "convert_enabled",
    "created_by",
    "reason",
    "created_at",
  ]);
  if (
    Object.keys(item).length !== 8 ||
    typeof item.recharge_enabled !== "boolean" ||
    typeof item.tip_enabled !== "boolean" ||
    typeof item.convert_enabled !== "boolean"
  ) {
    throw new WalletAdminError("INVALID_RESPONSE");
  }
  return Object.freeze({
    version: integer(item.version),
    dailyRechargeLimitFen: integer(item.daily_recharge_limit_fen),
    rechargeEnabled: item.recharge_enabled,
    tipEnabled: item.tip_enabled,
    convertEnabled: item.convert_enabled,
    createdBy: text(item.created_by),
    reason: text(item.reason),
    createdAt: text(item.created_at),
  });
}
function aiPrice(value: unknown): WalletAdminAIPrice {
  const item = objectFields(value, [
    "version",
    "enabled",
    "price_sg",
    "single_limit_sg",
    "daily_limit_sg",
    "daily_calls_limit",
    "created_by",
    "reason",
    "created_at",
  ]);
  if (
    Object.keys(item).length !== 9 ||
    typeof item.enabled !== "boolean" ||
    (item.daily_calls_limit !== null &&
      (!Number.isInteger(item.daily_calls_limit) ||
        typeof item.daily_calls_limit !== "number" ||
        item.daily_calls_limit <= 0))
  ) {
    throw new WalletAdminError("INVALID_RESPONSE");
  }
  return Object.freeze({
    version: integer(item.version),
    enabled: item.enabled,
    priceSg: nonNegativeInteger(item.price_sg),
    singleLimitSg:
      item.single_limit_sg === null
        ? null
        : nonNegativeInteger(item.single_limit_sg),
    dailyLimitSg:
      item.daily_limit_sg === null
        ? null
        : nonNegativeInteger(item.daily_limit_sg),
    dailyCallsLimit:
      typeof item.daily_calls_limit === "number"
        ? item.daily_calls_limit
        : null,
    createdBy: text(item.created_by),
    reason: text(item.reason),
    createdAt: text(item.created_at),
  });
}
function deepSeekPrices(
  value: unknown,
): Readonly<Record<string, string>> | null {
  if (value === undefined || value === null) return null;
  const item = record(value);
  const keys = [
    "input_cache_hit_off_peak",
    "input_cache_hit_peak",
    "input_cache_miss_off_peak",
    "input_cache_miss_peak",
    "output_off_peak",
    "output_peak",
  ];
  if (
    Object.keys(item).length !== keys.length ||
    keys.some(
      (key) =>
        typeof item[key] !== "string" ||
        !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(item[key] as string),
    )
  ) {
    throw new WalletAdminError("INVALID_RESPONSE");
  }
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, item[key] as string])),
  );
}
function deepSeekPrice(value: unknown): WalletAdminDeepSeekPrice {
  const item = record(value);
  if (
    item.currency !== "CNY" ||
    item.price_unit !== "yuan_per_million_tokens" ||
    typeof item.last_attempt_at !== "string" ||
    typeof item.stale !== "boolean" ||
    !["never", "first", "changed", "unchanged", "error"].includes(
      String(item.status),
    )
  ) {
    throw new WalletAdminError("INVALID_RESPONSE");
  }
  return Object.freeze({
    currency: item.currency,
    priceUnit: item.price_unit,
    latestPrices: deepSeekPrices(item.latest_prices),
    previousPrices: deepSeekPrices(item.previous_prices),
    checkedAt: item.checked_at === undefined ? null : text(item.checked_at),
    lastAttemptAt: item.last_attempt_at,
    changedAt: item.changed_at === undefined ? null : text(item.changed_at),
    status: item.status as WalletAdminDeepSeekPrice["status"],
    errorCode: item.error_code === undefined ? null : text(item.error_code),
    stale: item.stale,
  });
}
const agentMaximum = 1_000_000_000_000n;
const agentPriceVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const agentUsageStates = new Set<WalletAdminAgentUsageState>([
  "PREPARED",
  "RESERVED",
  "DISPATCHED",
  "RESULT_UNKNOWN",
  "RECEIPT_STORED",
  "SETTLED",
  "FAILED_FINAL",
  "ABORTED",
]);
function agentInteger(value: unknown, positive = false): string {
  const result = positive ? integer(value) : nonNegativeInteger(value);
  if (BigInt(result) > agentMaximum)
    throw new WalletAdminError("INVALID_RESPONSE");
  return result;
}
function agentCount(value: unknown, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  )
    throw new WalletAdminError("INVALID_RESPONSE");
  return value;
}
function agentPriceVersion(value: unknown): string {
  const result = text(value);
  if (!agentPriceVersionPattern.test(result))
    throw new WalletAdminError("INVALID_RESPONSE");
  return result;
}
function agentPolicy(value: unknown): WalletAdminAgentPolicy {
  return invalidResponse(() => {
    const fields = [
      "version",
      "enabled",
      "model",
      "provider_price_version",
      "provider_input_cny_micros_per_million",
      "provider_cached_input_cny_micros_per_million",
      "provider_output_cny_micros_per_million",
      "input_sg_per_million",
      "cached_input_sg_per_million",
      "output_sg_per_million",
      "sg_rate_scale",
      "max_iterations",
      "max_output_tokens",
      "task_budget_sg",
      "daily_calls_limit",
      "daily_tokens_limit",
      "daily_sg_limit",
      "sg_cny_micros_per_unit",
      "created_by",
      "reason",
      "created_at",
    ] as const;
    const item = objectFields(value, fields);
    if (
      Object.keys(item).length !== fields.length ||
      typeof item.enabled !== "boolean" ||
      item.model !== "deepseek-flash"
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const providerInput = agentInteger(
      item.provider_input_cny_micros_per_million,
    );
    const providerCached = agentInteger(
      item.provider_cached_input_cny_micros_per_million,
    );
    const providerOutput = agentInteger(
      item.provider_output_cny_micros_per_million,
    );
    const inputSg = agentInteger(item.input_sg_per_million);
    const cachedInputSg = agentInteger(item.cached_input_sg_per_million);
    const outputSg = agentInteger(item.output_sg_per_million);
    const sgRateScale = agentInteger(item.sg_rate_scale, true);
    const maxOutputTokens = agentCount(item.max_output_tokens, 4096);
    const taskBudgetSg = agentInteger(item.task_budget_sg, true);
    const dailyTokensLimit = agentInteger(item.daily_tokens_limit, true);
    const dailySgLimit = agentInteger(item.daily_sg_limit, true);
    if (
      BigInt(providerCached) > BigInt(providerInput) ||
      BigInt(cachedInputSg) > BigInt(inputSg) ||
      BigInt(sgRateScale) > 1_000_000n ||
      BigInt(maxOutputTokens) > BigInt(dailyTokensLimit) ||
      BigInt(taskBudgetSg) > BigInt(dailySgLimit) ||
      (item.enabled &&
        (providerInput === "0" ||
          providerOutput === "0" ||
          inputSg === "0" ||
          outputSg === "0"))
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const reason = reasonText(item.reason);
    if (reason !== reason.trim())
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      version: agentInteger(item.version, true),
      enabled: item.enabled,
      model: item.model,
      providerPriceVersion: agentPriceVersion(item.provider_price_version),
      providerInputCnyMicrosPerMillion: providerInput,
      providerCachedInputCnyMicrosPerMillion: providerCached,
      providerOutputCnyMicrosPerMillion: providerOutput,
      inputSgPerMillion: inputSg,
      cachedInputSgPerMillion: cachedInputSg,
      outputSgPerMillion: outputSg,
      sgRateScale,
      maxIterations: agentCount(item.max_iterations, 128),
      maxOutputTokens,
      taskBudgetSg,
      dailyCallsLimit: agentCount(item.daily_calls_limit, 1_000_000_000),
      dailyTokensLimit,
      dailySgLimit,
      sgCnyMicrosPerUnit: agentInteger(item.sg_cny_micros_per_unit),
      createdBy: adminText(item.created_by),
      reason,
      createdAt: adminTime(item.created_at),
    });
  });
}
function nullableAgentInteger(value: unknown): string | null {
  return value === null ? null : nonNegativeInteger(value);
}
function nullableAgentSignedInteger(value: unknown): string | null {
  return value === null ? null : signedInteger(value);
}
function agentUsage(value: unknown): WalletAdminAgentUsage {
  return invalidResponse(() => {
    const required = [
      "run_id",
      "operation_id",
      "actor_uid",
      "project_id",
      "model",
      "provider_price_version",
      "state",
      "input_tokens",
      "cached_input_tokens",
      "output_tokens",
      "provider_cost_cny_micros",
      "goodness_charged_sg",
      "goodness_revenue_cny_micros",
      "profit_cny_micros",
      "created_at",
      "updated_at",
    ] as const;
    const item = objectFields(value, [...required, "provider_request_id"]);
    if (
      required.some((key) => !Object.hasOwn(item, key)) ||
      item.model !== "deepseek-flash" ||
      typeof item.state !== "string" ||
      !agentUsageStates.has(item.state as WalletAdminAgentUsageState)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const inputTokens = nullableAgentInteger(item.input_tokens);
    const cachedInputTokens = nullableAgentInteger(item.cached_input_tokens);
    const outputTokens = nullableAgentInteger(item.output_tokens);
    const providerCost = nullableAgentInteger(item.provider_cost_cny_micros);
    const chargedSg = nullableAgentInteger(item.goodness_charged_sg);
    const revenue = nullableAgentInteger(item.goodness_revenue_cny_micros);
    const profit = nullableAgentSignedInteger(item.profit_cny_micros);
    const receiptValues = [
      inputTokens,
      cachedInputTokens,
      outputTokens,
      providerCost,
    ];
    const settlementValues = [chargedSg, revenue, profit];
    const hasReceipt = receiptValues.some((entry) => entry !== null);
    const completeReceipt = receiptValues.every((entry) => entry !== null);
    const hasSettlement = settlementValues.some((entry) => entry !== null);
    const completeSettlement = settlementValues.every(
      (entry) => entry !== null,
    );
    if (
      inputTokens !== null &&
      cachedInputTokens !== null &&
      BigInt(cachedInputTokens) > BigInt(inputTokens)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    if (
      hasReceipt !== completeReceipt ||
      hasSettlement !== completeSettlement ||
      (item.state === "RECEIPT_STORED" || item.state === "SETTLED") !==
        completeReceipt ||
      (item.state === "SETTLED") !== completeSettlement
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    const providerRequestId =
      item.provider_request_id === undefined
        ? ""
        : adminText(item.provider_request_id);
    if (
      (item.state === "RECEIPT_STORED" || item.state === "SETTLED") !==
      Boolean(providerRequestId)
    )
      throw new WalletAdminError("INVALID_RESPONSE");
    return Object.freeze({
      runId: walletUUID(item.run_id),
      operationId: walletUUID(item.operation_id),
      actorUid: adminText(item.actor_uid),
      projectId: adminText(item.project_id),
      model: item.model,
      providerPriceVersion: agentPriceVersion(item.provider_price_version),
      state: item.state as WalletAdminAgentUsageState,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      providerCostCnyMicros: providerCost,
      goodnessChargedSg: chargedSg,
      goodnessRevenueCnyMicros: revenue,
      profitCnyMicros: profit,
      providerRequestId,
      createdAt: adminTime(item.created_at),
      updatedAt: adminTime(item.updated_at),
    });
  });
}
function agentUsagePage(value: unknown): readonly WalletAdminAgentUsage[] {
  const item = objectFields(value, ["items"]);
  if (
    Object.keys(item).length !== 1 ||
    !Array.isArray(item.items) ||
    item.items.length > 100
  )
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze(item.items.map(agentUsage));
}
async function responseValue(response: Response) {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new WalletAdminError("INVALID_RESPONSE", response.status);
  }
  if (!response.ok) {
    const item = record(value);
    const error = record(item.error);
    throw new WalletAdminError(
      typeof error.code === "string" ? error.code : "DEPENDENCY_UNAVAILABLE",
      response.status,
    );
  }
  return value;
}
async function get(path: string) {
  return responseValue(
    await fetch(`${root}/${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
    }),
  );
}

export async function loadWalletAdminCapabilities(): Promise<WalletAdminCapabilities> {
  const value = record(await get("capabilities"));
  const map = record(value.capabilities);
  const result = {} as Record<keyof WalletAdminCapabilities, boolean>;
  for (const key of [
    "wallet.refund.view",
    "wallet.refund.review",
    "wallet.refund.revoke",
    "wallet.policy.view",
    "wallet.policy.configure",
    "wallet.risk.view",
    "wallet.risk.review",
    "wallet.risk.restrict",
    "wallet.reconciliation.manage",
    "wallet.coverage.manage",
  ] as const) {
    if (typeof map[key] !== "boolean")
      throw new WalletAdminError("INVALID_RESPONSE");
    result[key] = map[key] as boolean;
  }
  return Object.freeze(result);
}
export async function loadWalletAdminCases(
  status = "open",
  cursor = "",
): Promise<WalletAdminCasePage> {
  const params = new URLSearchParams({ status, limit: "50" });
  if (cursor) params.set("cursor", cursor);
  const value = record(await get(`cases?${params}`));
  if (!Array.isArray(value.items))
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze({
    items: Object.freeze(value.items.map(riskCase)),
    nextCursor: value.next_cursor === undefined ? "" : text(value.next_cursor),
  });
}
export async function reviewWalletAdminCase(
  uid: string,
  id: string,
  key: string,
  decision: "start_review" | "resolve",
  version: string,
  reason: string,
  proof: string,
): Promise<WalletAdminCaseActionResult> {
  walletUUID(id);
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input: WalletRequests["case.review"] = createWalletRequest(
    "case.review",
    { decision, expected_version: version, reason },
  );
  const response = await fetch(
    `${root}/cases/${encodeURIComponent(id)}/review`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Rinspace-CSRF": csrf,
        "X-Rinspace-Step-Up": proof,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(input),
    },
  );
  return riskCaseActionResult(await responseValue(response));
}
export async function loadWalletAdminCaseSources(
  id: string,
): Promise<WalletAdminCaseSources> {
  walletUUID(id);
  const value = record(await get(`cases/${encodeURIComponent(id)}/sources`));
  if (
    !Array.isArray(value.sources) ||
    !Array.isArray(value.restrictions) ||
    !Array.isArray(value.appeals)
  )
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze({
    sources: Object.freeze(value.sources.map(caseSource)),
    restrictions: Object.freeze(value.restrictions.map(caseRestriction)),
    appeals: Object.freeze(value.appeals.map(caseAppeal)),
  });
}
async function caseRestrictionCommand<
  A extends "case.restrict" | "case.release",
>(
  uid: string,
  path: string,
  key: string,
  action: A,
  raw: WalletRequests[A],
  proof: string,
): Promise<WalletAdminRestrictionResult> {
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input = createWalletRequest(action, raw);
  const response = await fetch(`${root}/${path}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": csrf,
      "X-Rinspace-Step-Up": proof,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  });
  return restrictionResult(await responseValue(response));
}
export function restrictWalletAdminCase(
  uid: string,
  caseId: string,
  key: string,
  lotId: string,
  quantity: string,
  version: string,
  reason: string,
  proof: string,
) {
  walletUUID(caseId);
  return caseRestrictionCommand(
    uid,
    `cases/${encodeURIComponent(caseId)}/restrictions`,
    key,
    "case.restrict",
    { lot_id: lotId, quantity, expected_version: version, reason },
    proof,
  );
}
export function releaseWalletAdminRestriction(
  uid: string,
  holdId: string,
  key: string,
  version: string,
  reason: string,
  proof: string,
) {
  walletUUID(holdId);
  return caseRestrictionCommand(
    uid,
    `restrictions/${encodeURIComponent(holdId)}/release`,
    key,
    "case.release",
    { expected_version: version, reason },
    proof,
  );
}
export async function loadWalletAdminReconciliations(
  status = "all",
): Promise<readonly WalletAdminReconciliation[]> {
  const value = record(
    await get(
      `reconciliations?${new URLSearchParams({ status, limit: "30" })}`,
    ),
  );
  if (!Array.isArray(value.items))
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze(value.items.map(reconciliation));
}
export async function loadWalletAdminReconciliationItems(
  runId: string,
  status = "all",
): Promise<readonly WalletAdminReconciliationItem[]> {
  walletUUID(runId);
  const value = record(
    await get(
      `reconciliations/${encodeURIComponent(runId)}/items?${new URLSearchParams({ status, limit: "100" })}`,
    ),
  );
  if (!Array.isArray(value.items))
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze(value.items.map(reconciliationItem));
}
async function reconciliationCommand<
  A extends "reconciliation.assign" | "reconciliation.resolve",
>(
  uid: string,
  itemId: string,
  key: string,
  action: A,
  raw: WalletRequests[A],
  proof: string,
): Promise<WalletAdminReconciliationActionResult> {
  walletUUID(itemId);
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input = createWalletRequest(action, raw);
  const suffix = action === "reconciliation.assign" ? "assign" : "resolve";
  const response = await fetch(
    `${root}/reconciliation-items/${encodeURIComponent(itemId)}/${suffix}`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Rinspace-CSRF": csrf,
        "X-Rinspace-Step-Up": proof,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(input),
    },
  );
  return reconciliationActionResult(await responseValue(response));
}
export function assignWalletAdminReconciliation(
  uid: string,
  itemId: string,
  key: string,
  version: string,
  assigneeUid: string,
  reason: string,
  proof: string,
) {
  return reconciliationCommand(
    uid,
    itemId,
    key,
    "reconciliation.assign",
    { expected_version: version, assignee_uid: assigneeUid, reason },
    proof,
  );
}
export function resolveWalletAdminReconciliation(
  uid: string,
  itemId: string,
  key: string,
  version: string,
  resolution: Exclude<WalletAdminReconciliationItem["resolution"], "">,
  evidenceReference: string,
  reason: string,
  proof: string,
) {
  return reconciliationCommand(
    uid,
    itemId,
    key,
    "reconciliation.resolve",
    {
      expected_version: version,
      resolution,
      evidence_reference: evidenceReference,
      reason,
    },
    proof,
  );
}
export async function loadWalletAdminObligations(): Promise<WalletAdminObligations> {
  return obligations(await get("obligations"));
}
export async function loadWalletAdminCoverageSnapshots(): Promise<
  readonly WalletAdminCoverageSnapshot[]
> {
  const value = record(await get("coverage-snapshots?limit=10"));
  if (!Array.isArray(value.items))
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze(value.items.map(coverageSnapshot));
}
export async function recordWalletAdminCoverageSnapshot(
  uid: string,
  key: string,
  raw: WalletRequests["coverage.record"],
  proof: string,
): Promise<WalletAdminCoverageSnapshot> {
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input = createWalletRequest("coverage.record", raw);
  const response = await fetch(`${root}/coverage-snapshots`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": csrf,
      "X-Rinspace-Step-Up": proof,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  });
  return coverageSnapshot(await responseValue(response));
}
export async function loadWalletAdminRefunds(
  status = "pending",
  cursor = "",
): Promise<WalletAdminRefundPage> {
  const params = new URLSearchParams({ status, limit: "50" });
  if (cursor) params.set("cursor", cursor);
  const value = record(await get(`refunds?${params}`));
  if (!Array.isArray(value.items))
    throw new WalletAdminError("INVALID_RESPONSE");
  return Object.freeze({
    items: Object.freeze(value.items.map(refund)),
    nextCursor: value.next_cursor === undefined ? "" : text(value.next_cursor),
  });
}
export async function loadWalletAdminRefundDetail(
  id: string,
): Promise<WalletAdminRefundDetail> {
  walletUUID(id);
  return refundDetail(await get(`refunds/${encodeURIComponent(id)}`));
}
export async function reviewWalletAdminRefund(
  uid: string,
  id: string,
  key: string,
  decision: "approve" | "reject",
  version: string,
  reason: string,
) {
  walletUUID(id);
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input: WalletRequests["refund.review"] = createWalletRequest(
    "refund.review",
    { decision, expected_version: version, reason },
  );
  const response = await fetch(
    `${root}/refunds/${encodeURIComponent(id)}/review`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Rinspace-CSRF": csrf,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(input),
    },
  );
  return responseValue(response);
}
export async function revokeWalletAdminRefund(
  uid: string,
  id: string,
  key: string,
  version: string,
  reason: string,
) {
  walletUUID(id);
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input: WalletRequests["refund.revoke"] = createWalletRequest(
    "refund.revoke",
    { expected_version: version, reason },
  );
  const response = await fetch(
    `${root}/refunds/${encodeURIComponent(id)}/revoke`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Rinspace-CSRF": csrf,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(input),
    },
  );
  return responseValue(response);
}
export async function loadWalletAdminPolicy(): Promise<WalletAdminPolicy> {
  return policy(await get("policy"));
}
export async function loadWalletAdminAIPrice(): Promise<WalletAdminAIPrice> {
  return aiPrice(await get("ai-price"));
}
export async function loadWalletAdminDeepSeekPrice(): Promise<WalletAdminDeepSeekPrice> {
  return deepSeekPrice(await get("ai-provider-price"));
}
export async function loadWalletAdminAgentPolicy(): Promise<WalletAdminAgentPolicy> {
  return agentPolicy(await get("agent-policy"));
}
export async function loadWalletAdminAgentUsage(
  filter: WalletAdminAgentUsageFilter = {},
): Promise<readonly WalletAdminAgentUsage[]> {
  const params = new URLSearchParams();
  if (filter.actorUid !== undefined) {
    if (
      !filter.actorUid ||
      filter.actorUid !== filter.actorUid.trim() ||
      new TextEncoder().encode(filter.actorUid).length > 256
    )
      throw new WalletAdminError("INVALID_REQUEST");
    params.set("actor_uid", filter.actorUid);
  }
  if (filter.runId !== undefined)
    params.set("run_id", walletUUID(filter.runId));
  if (filter.model !== undefined) {
    if (filter.model !== "deepseek-flash")
      throw new WalletAdminError("INVALID_REQUEST");
    params.set("model", filter.model);
  }
  const state = filter.state ?? "all";
  if (
    state !== "all" &&
    state !== "pending" &&
    state !== "settled" &&
    state !== "failed"
  )
    throw new WalletAdminError("INVALID_REQUEST");
  params.set("state", state);
  const from =
    filter.createdFrom === undefined ? "" : adminTime(filter.createdFrom);
  const to = filter.createdTo === undefined ? "" : adminTime(filter.createdTo);
  if (from && to && Date.parse(from) >= Date.parse(to))
    throw new WalletAdminError("INVALID_REQUEST");
  if (from) params.set("created_from", from);
  if (to) params.set("created_to", to);
  const limit = filter.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new WalletAdminError("INVALID_REQUEST");
  params.set("limit", String(limit));
  return agentUsagePage(await get(`agent-usage?${params}`));
}
function agentRequestInteger(value: string, positive = false): number {
  const parsed = positive
    ? parsePositiveWalletInteger(value)
    : parseWalletInteger(value);
  if (parsed > agentMaximum) throw new WalletAdminError("INVALID_REQUEST");
  return Number(parsed);
}
function agentPolicyRequest(input: WalletAdminAgentPolicyUpdate) {
  if (
    input.model !== "deepseek-flash" ||
    !agentPriceVersionPattern.test(input.providerPriceVersion) ||
    !Number.isInteger(input.maxIterations) ||
    input.maxIterations < 1 ||
    input.maxIterations > 128 ||
    !Number.isInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 1 ||
    input.maxOutputTokens > 4096 ||
    !Number.isInteger(input.dailyCallsLimit) ||
    input.dailyCallsLimit < 1 ||
    input.dailyCallsLimit > 1_000_000_000 ||
    input.reason !== input.reason.trim()
  )
    throw new WalletAdminError("INVALID_REQUEST");
  const providerInput = agentRequestInteger(
    input.providerInputCnyMicrosPerMillion,
  );
  const providerCached = agentRequestInteger(
    input.providerCachedInputCnyMicrosPerMillion,
  );
  const providerOutput = agentRequestInteger(
    input.providerOutputCnyMicrosPerMillion,
  );
  const inputSg = agentRequestInteger(input.inputSgPerMillion);
  const cachedInputSg = agentRequestInteger(input.cachedInputSgPerMillion);
  const outputSg = agentRequestInteger(input.outputSgPerMillion);
  const sgRateScale = agentRequestInteger(input.sgRateScale, true);
  const taskBudgetSg = agentRequestInteger(input.taskBudgetSg, true);
  const dailyTokens = agentRequestInteger(input.dailyTokensLimit, true);
  const dailySg = agentRequestInteger(input.dailySgLimit, true);
  const sgCnyMicros = agentRequestInteger(input.sgCnyMicrosPerUnit);
  if (
    providerCached > providerInput ||
    cachedInputSg > inputSg ||
    sgRateScale > 1_000_000 ||
    input.maxOutputTokens > dailyTokens ||
    taskBudgetSg > dailySg ||
    (input.enabled &&
      (!providerInput || !providerOutput || !inputSg || !outputSg))
  )
    throw new WalletAdminError("INVALID_REQUEST");
  let reason: string;
  try {
    reason = reasonText(input.reason);
  } catch {
    throw new WalletAdminError("INVALID_REQUEST");
  }
  return {
    expected_version: agentRequestInteger(input.expectedVersion, true),
    enabled: input.enabled,
    model: input.model,
    provider_price_version: input.providerPriceVersion,
    provider_input_cny_micros_per_million: providerInput,
    provider_cached_input_cny_micros_per_million: providerCached,
    provider_output_cny_micros_per_million: providerOutput,
    input_sg_per_million: inputSg,
    cached_input_sg_per_million: cachedInputSg,
    output_sg_per_million: outputSg,
    sg_rate_scale: sgRateScale,
    max_iterations: input.maxIterations,
    max_output_tokens: input.maxOutputTokens,
    task_budget_sg: taskBudgetSg,
    daily_calls_limit: input.dailyCallsLimit,
    daily_tokens_limit: dailyTokens,
    daily_sg_limit: dailySg,
    sg_cny_micros_per_unit: sgCnyMicros,
    reason,
  };
}
export async function updateWalletAdminAgentPolicy(
  uid: string,
  key: string,
  input: WalletAdminAgentPolicyUpdate,
): Promise<WalletAdminAgentPolicy> {
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const response = await fetch(`${root}/agent-policy`, {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(agentPolicyRequest(input)),
  });
  return agentPolicy(await responseValue(response));
}
export async function updateWalletAdminAIPrice(
  uid: string,
  key: string,
  input: {
    expectedVersion: string;
    enabled: boolean;
    priceSg: string;
    singleLimitSg: string | null;
    dailyLimitSg: string | null;
    dailyCallsLimit: number | null;
    reason: string;
  },
): Promise<WalletAdminAIPrice> {
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const response = await fetch(`${root}/ai-price`, {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      expected_version: input.expectedVersion,
      enabled: input.enabled,
      price_sg: input.priceSg,
      single_limit_sg: input.singleLimitSg,
      daily_limit_sg: input.dailyLimitSg,
      daily_calls_limit: input.dailyCallsLimit,
      reason: input.reason,
    }),
  });
  return aiPrice(await responseValue(response));
}
export async function updateWalletAdminPolicy(
  uid: string,
  key: string,
  expectedVersion: string,
  dailyRechargeLimitFen: string,
  reason: string,
  rechargeEnabled?: boolean,
): Promise<WalletAdminPolicy> {
  walletUUID(key);
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()["X-Rinspace-CSRF"];
  if (user?.id !== uid || !csrf)
    throw new WalletAdminError("UNAUTHENTICATED", 401);
  const input: WalletRequests["policy.update"] = createWalletRequest(
    "policy.update",
    {
      expected_version: expectedVersion,
      patch: {
        daily_recharge_limit_fen: dailyRechargeLimitFen,
        ...(rechargeEnabled === undefined
          ? {}
          : { recharge_enabled: rechargeEnabled }),
      },
      reason,
    },
  );
  const response = await fetch(`${root}/policy`, {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Rinspace-CSRF": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  });
  return policy(await responseValue(response));
}

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { WalletRiskView } from "./WalletRiskView";
import {
  loadWalletAdminCases,
  loadWalletAdminCaseSources,
  loadWalletAdminCoverageSnapshots,
  loadWalletAdminPolicy,
  loadWalletAdminObligations,
  loadWalletAdminReconciliations,
  loadWalletAdminReconciliationItems,
  assignWalletAdminReconciliation,
  restrictWalletAdminCase,
  recordWalletAdminCoverageSnapshot,
  resolveWalletAdminReconciliation,
  reviewWalletAdminCase,
} from "@/services/domains/walletAdmin";
import { beginIdentityStepUp, completeIdentityStepUp } from "@/services/phoneAuth";

vi.mock("@/services/domains/walletAdmin", () => ({
  loadWalletAdminCases: vi.fn(),
  loadWalletAdminCaseSources: vi.fn(),
  loadWalletAdminCoverageSnapshots: vi.fn(),
  loadWalletAdminPolicy: vi.fn(),
  loadWalletAdminObligations: vi.fn(),
  loadWalletAdminReconciliations: vi.fn(),
  loadWalletAdminReconciliationItems: vi.fn(),
  assignWalletAdminReconciliation: vi.fn(),
  reviewWalletAdminCase: vi.fn(),
  restrictWalletAdminCase: vi.fn(),
  recordWalletAdminCoverageSnapshot: vi.fn(),
  releaseWalletAdminRestriction: vi.fn(),
  resolveWalletAdminReconciliation: vi.fn(),
}));
vi.mock("@/services/phoneAuth", () => ({
  beginIdentityStepUp: vi.fn(),
  completeIdentityStepUp: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(loadWalletAdminCases).mockResolvedValue({
    items: [
      {
        caseId: "12345678-1234-4234-8234-123456789abc",
        kind: "dispute",
        state: "OPEN",
        version: "1",
        subjectUid: "synthetic-user",
        paymentOperationId: "22345678-1234-4234-8234-123456789abc",
        adjustmentCount: "1",
        amountFen: "9007199254741000",
        reviewDueAt: "2026-09-21T08:00:00Z",
        reason: "渠道强退待核对",
        resolution: "",
        createdAt: "2026-09-20T08:00:00Z",
      },
    ],
    nextCursor: "",
  });
  vi.mocked(loadWalletAdminReconciliations).mockResolvedValue([]);
  vi.mocked(loadWalletAdminReconciliationItems).mockResolvedValue([]);
  vi.mocked(loadWalletAdminCaseSources).mockResolvedValue({ sources: [], restrictions: [], appeals: [] });
  vi.mocked(loadWalletAdminObligations).mockResolvedValue({
    asOf: "2026-09-20T08:00:00Z",
    refundablePrincipalFen: "1000",
    refundReservedFen: "400",
    approvedUnpaidRefundFen: "300",
    openDisputeExposureFen: "700",
    unresolvedPaymentFen: "1000",
    openCaseCount: "2",
    unmatchedReconciliationCount: "1",
    reconciliationDifferenceCount: "3",
  });
  vi.mocked(loadWalletAdminCoverageSnapshots).mockResolvedValue([]);
  vi.mocked(loadWalletAdminPolicy).mockResolvedValue({version:'7',dailyRechargeLimitFen:'100000',rechargeEnabled:false,tipEnabled:true,convertEnabled:true,createdBy:'admin',reason:'approved default',createdAt:'2026-09-20T06:00:00Z'});
  vi.mocked(beginIdentityStepUp).mockResolvedValue({ challengeId: "challenge-1" });
  vi.mocked(completeIdentityStepUp).mockResolvedValue("proof-1");
  vi.mocked(reviewWalletAdminCase).mockResolvedValue({
    caseId: "12345678-1234-4234-8234-123456789abc",
    state: "UNDER_REVIEW",
    version: "2",
    createdAt: "2026-09-20T08:01:00Z",
  });
  vi.mocked(restrictWalletAdminCase).mockResolvedValue({
    caseId: "12345678-1234-4234-8234-123456789abc",
    holdId: "32345678-1234-4234-8234-123456789abc",
    lotId: "42345678-1234-4234-8234-123456789abc",
    quantity: "7",
    holdState: "ACTIVE",
    caseVersion: "3",
    holdVersion: "1",
    createdAt: "2026-09-20T08:02:00Z",
  });
  vi.mocked(assignWalletAdminReconciliation).mockResolvedValue({
    itemId: "92345678-1234-4234-8234-123456789abc", state: "ASSIGNED", version: "2",
    assignedTo: "risk-reviewer", resolution: "", evidenceReference: "", createdAt: "2026-09-20T08:02:00Z",
  });
  vi.mocked(resolveWalletAdminReconciliation).mockResolvedValue({
    itemId: "92345678-1234-4234-8234-123456789abc", state: "RESOLVED", version: "3",
    assignedTo: "risk-reviewer", resolution: "EVIDENCE_ACCEPTED", evidenceReference: "controlled://evidence/1",
    createdAt: "2026-09-20T08:03:00Z",
  });
  vi.mocked(recordWalletAdminCoverageSnapshot).mockResolvedValue({
    snapshotId: "52345678-1234-4234-8234-123456789abc", evidenceAsOf: "2026-09-20T08:00:00Z",
    availableCashFen: "100", approvedRequiredFen: "120", state: "SHORTFALL", shortfallFen: "20",
    methodologyReference: "controlled://methodology/v1", evidenceSha256: "a".repeat(64),
    evidenceReference: "controlled://statement/1", refundablePrincipalFen: "90", refundReservedFen: "20",
    approvedUnpaidRefundFen: "10", openDisputeExposureFen: "5", unresolvedPaymentFen: "0", alertState: "OPEN",
    createdBy: "risk-reviewer", reason: "日终核对", createdAt: "2026-09-20T08:01:00Z",
  });
});

it("keeps recharge limits under money risk, separate from refund review", async () => {
  render(<WalletRiskView uid="risk-reviewer" canReview={false} canRestrict={false} canReconcile={false} canCoverage={false} canViewPolicy canConfigurePolicy={false} />);
  fireEvent.click(screen.getByRole("button", { name: /充值限额|policy\.title/ }));
  expect(await screen.findByText("¥1000.00")).toBeTruthy();
  expect(screen.getByText("approved default")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "申请调整" })).toBeNull();
});

it("records an exact coverage snapshot behind step-up verification", async () => {
  render(<WalletRiskView uid="risk-reviewer" canReview={false} canRestrict={false} canReconcile={false} canCoverage />);
  fireEvent.click(screen.getByRole("button", { name: /资金覆盖|risk\.coverage/ }));
  fireEvent.change(screen.getByLabelText(/证据时间|adminRisk\.evidenceTime/), { target: { value: "2026-09-20T16:00" } });
  fireEvent.change(screen.getByLabelText(/可用资金（分）|现金（分）|adminRisk\.availableFen/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText(/核准目标（分）|目标（分）|adminRisk\.targetFen/), { target: { value: "120" } });
  fireEvent.change(screen.getByLabelText(/口径编号|adminRisk\.methodology/), { target: { value: "controlled://methodology/v1" } });
  fireEvent.change(screen.getByLabelText(/证据 SHA-256|adminRisk\.evidenceHash/), { target: { value: "a".repeat(64) } });
  fireEvent.change(screen.getByLabelText(/证据编号|risk\.evidenceReference/), { target: { value: "controlled://statement/1" } });
  fireEvent.change(screen.getByLabelText(/快照理由|adminRisk\.coverageReason/), { target: { value: "日终核对" } });
  fireEvent.click(screen.getByRole("button", { name: /记录快照|adminRisk\.recordCoverage/ }));
  await waitFor(() => expect(beginIdentityStepUp).toHaveBeenCalledWith(
    "wallet_coverage_record", expect.stringMatching(/^wallet:v1:[0-9a-f]{64}$/),
  ));
  fireEvent.change(screen.getByLabelText(/六位验证码|risk\.code/), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /确认|risk\.confirm/ }));
  await waitFor(() => expect(recordWalletAdminCoverageSnapshot).toHaveBeenCalledWith(
    "risk-reviewer", expect.stringMatching(/^[0-9a-f-]{36}$/),
    expect.objectContaining({ available_cash_fen: "100", approved_required_fen: "120" }), "proof-1",
  ));
});

it("binds case review to the current account, case, version and SMS proof", async () => {
  render(<WalletRiskView uid="risk-reviewer" canReview canRestrict={false} canReconcile={false} canCoverage={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "处理" }));
  fireEvent.change(screen.getByLabelText("处理理由"), {
    target: { value: "核对渠道证据" },
  });
  fireEvent.click(screen.getByRole("button", { name: "开始审核" }));
  await waitFor(() =>
    expect(beginIdentityStepUp).toHaveBeenCalledWith(
      "wallet_case_review",
      expect.stringMatching(/^wallet:v1:[0-9a-f]{64}$/),
    ),
  );
  fireEvent.change(screen.getByLabelText("六位验证码"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() =>
    expect(reviewWalletAdminCase).toHaveBeenCalledWith(
      "risk-reviewer",
      "12345678-1234-4234-8234-123456789abc",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      "start_review",
      "1",
      "核对渠道证据",
      "proof-1",
    ),
  );
});

it("shows exact read-only case amounts", async () => {
  render(<WalletRiskView uid="risk-reviewer" canReview={false} canRestrict={false} canReconcile={false} canCoverage={false} />);
  await waitFor(() =>
    expect(loadWalletAdminCases).toHaveBeenCalledWith("open", ""),
  );
  expect(screen.getByText("¥90071992547410.00")).toBeTruthy();
  expect(screen.getByText("渠道强退待核对")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /结案|resolve/i })).toBeNull();
  expect(await screen.findAllByText("¥10.00")).toHaveLength(2);
});

it("shows signed reconciliation totals without a write action", async () => {
  vi.mocked(loadWalletAdminReconciliations).mockResolvedValue([
    {
      runId: "32345678-1234-4234-8234-123456789abc",
      billDate: "2026-09-20",
      billType: "refund",
      state: "DIFFERENCES",
      grossFen: "-1000",
      feeFen: "-6",
      netFen: "-994",
      differenceCount: "1",
      createdAt: "2026-09-20T08:00:00Z",
      completedAt: "2026-09-20T08:01:00Z",
    },
  ]);
  render(<WalletRiskView uid="risk-reviewer" canReview={false} canRestrict={false} canReconcile={false} canCoverage={false} />);
  fireEvent.click(screen.getByRole("button", { name: "渠道对账" }));
  expect(await screen.findByText("−¥9.94")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /处理差异|resolve/i }),
  ).toBeNull();
});

it("claims a difference with a versioned, step-up-bound command", async () => {
  const runId = "32345678-1234-4234-8234-123456789abc";
  const itemId = "92345678-1234-4234-8234-123456789abc";
  vi.mocked(loadWalletAdminReconciliations).mockResolvedValue([{ runId, billDate: "2026-09-20", billType: "trade",
    state: "DIFFERENCES", grossFen: "1000", feeFen: "6", netFen: "994", differenceCount: "1",
    createdAt: "2026-09-20T08:00:00Z", completedAt: "2026-09-20T08:01:00Z" }]);
  vi.mocked(loadWalletAdminReconciliationItems).mockResolvedValue([{ itemId, differenceKey: "payment:x", code: "AMOUNT_MISMATCH",
    operationId: "", caseId: "", expectedFen: "1000", actualFen: "994", state: "OPEN", version: "1",
    assignedTo: "", resolution: "", evidenceReference: "", createdAt: "2026-09-20T08:00:00Z", updatedAt: "2026-09-20T08:00:00Z" }]);
  render(<WalletRiskView uid="risk-reviewer" canReview={false} canRestrict={false} canReconcile canCoverage={false} />);
  fireEvent.click(screen.getByRole("button", { name: "渠道对账" }));
  fireEvent.click(await screen.findByRole("button", { name: "查看" }));
  fireEvent.change(await screen.findByPlaceholderText("处理理由"), { target: { value: "核对差异" } });
  fireEvent.click(screen.getByRole("button", { name: "领取" }));
  await waitFor(() => expect(beginIdentityStepUp).toHaveBeenCalledWith(
    "wallet_reconciliation_assign", expect.stringMatching(/^wallet:v1:[0-9a-f]{64}$/),
  ));
  fireEvent.change(screen.getByLabelText("六位验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() => expect(assignWalletAdminReconciliation).toHaveBeenCalledWith(
    "risk-reviewer", itemId, expect.stringMatching(/^[0-9a-f-]{36}$/), "1", "risk-reviewer", "核对差异", "proof-1",
  ));
});

it("restricts only a selected source lot in integer Shangong units", async () => {
  vi.mocked(loadWalletAdminCases).mockResolvedValue({
    items: [{
      caseId: "12345678-1234-4234-8234-123456789abc", kind: "dispute",
      state: "UNDER_REVIEW", version: "2", subjectUid: "synthetic-user",
      paymentOperationId: "22345678-1234-4234-8234-123456789abc",
      adjustmentCount: "1", amountFen: "700", reviewDueAt: "2026-09-21T08:00:00Z",
      reason: "渠道争议", resolution: "", createdAt: "2026-09-20T08:00:00Z",
    }],
    nextCursor: "",
  });
  vi.mocked(loadWalletAdminCaseSources).mockResolvedValue({
    sources: [{
      lotId: "42345678-1234-4234-8234-123456789abc", ownerUid: "author",
      unit: "SG_BOUND", kind: "tip", issued: "10", remaining: "7",
      reserved: "0", restricted: "0", available: "7", version: "2",
    }],
    restrictions: [],
    appeals: [],
  });
  render(<WalletRiskView uid="risk-reviewer" canReview={false} canRestrict canReconcile={false} canCoverage={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "处理" }));
  fireEvent.change(screen.getByLabelText("处理理由"), { target: { value: "争议来源" } });
  fireEvent.change(await screen.findByLabelText("数量"), { target: { value: "7" } });
  expect(screen.getByText("SG_BOUND · 7")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "限制" }));
  await waitFor(() => expect(beginIdentityStepUp).toHaveBeenCalledWith(
    "wallet_case_restrict", expect.stringMatching(/^wallet:v1:[0-9a-f]{64}$/),
  ));
  fireEvent.change(screen.getByLabelText("六位验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() => expect(restrictWalletAdminCase).toHaveBeenCalledWith(
    "risk-reviewer", "12345678-1234-4234-8234-123456789abc",
    expect.stringMatching(/^[0-9a-f-]{36}$/), "42345678-1234-4234-8234-123456789abc",
    "7", "2", "争议来源", "proof-1",
  ));
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixtures from "../../../contracts/wallet/admin-refund-vectors.json";
import riskFixtures from "../../../contracts/wallet/admin-risk-vectors.json";

import { authHeaders, getCurrentAuthUser } from "@/services/phoneAuth";

import {
  assignWalletAdminReconciliation,
  loadWalletAdminRefundDetail,
  loadWalletAdminCases,
  loadWalletAdminCaseSources,
  loadWalletAdminCoverageSnapshots,
  loadWalletAdminObligations,
  loadWalletAdminReconciliations,
  loadWalletAdminReconciliationItems,
  loadWalletAdminPolicy,
  loadWalletAdminRefunds,
  releaseWalletAdminRestriction,
  recordWalletAdminCoverageSnapshot,
  restrictWalletAdminCase,
  reviewWalletAdminCase,
  resolveWalletAdminReconciliation,
  updateWalletAdminPolicy,
  WalletAdminError,
} from "./walletAdmin";

vi.mock("@/services/phoneAuth", () => ({
  authHeaders: vi.fn(),
  getCurrentAuthUser: vi.fn(),
}));

const key = "12345678-1234-4234-8234-123456789abc";
const rawPolicy = {
  version: "7",
  daily_recharge_limit_fen: "100000",
  recharge_enabled: false,
  tip_enabled: true,
  convert_enabled: true,
  created_by: "wallet-admin",
  reason: "daily limit review",
  created_at: "2026-09-20T08:00:00Z",
};

beforeEach(() => {
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: "wallet-admin" });
  vi.mocked(authHeaders).mockReturnValue({
    "X-Rinspace-CSRF": "synthetic-csrf",
    Authorization: "DO-NOT-FORWARD",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("reads integer policy values without converting them to JavaScript numbers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...rawPolicy,
          daily_recharge_limit_fen: "9007199254741000",
        }),
        { status: 200 },
      ),
    ),
  );
  await expect(loadWalletAdminPolicy()).resolves.toMatchObject({
    version: "7",
    dailyRechargeLimitFen: "9007199254741000",
    rechargeEnabled: false,
  });
});

it("sends a CAS policy update with managed-cookie CSRF, permission and one stable key only", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ...rawPolicy,
        version: "8",
        daily_recharge_limit_fen: "200000",
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    updateWalletAdminPolicy(
      "wallet-admin",
      key,
      "7",
      "200000",
      "raise reviewed limit",
    ),
  ).resolves.toMatchObject({ version: "8", dailyRechargeLimitFen: "200000" });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/admin/api/wallet/policy"),
    expect.objectContaining({
      method: "PUT",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Rinspace-CSRF": "synthetic-csrf",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        expected_version: "7",
        patch: { daily_recharge_limit_fen: "200000" },
        reason: "raise reviewed limit",
      }),
    }),
  );
});

it("sends a versioned case workflow command without a money field", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        case_id: key,
        state: "UNDER_REVIEW",
        version: "2",
        created_at: "2026-09-20T08:01:00Z",
      }),
      { status: 201 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    reviewWalletAdminCase(
      "wallet-admin",
      key,
      "22345678-1234-4234-8234-123456789abc",
      "start_review",
      "1",
      "verify channel evidence",
      "bound-proof",
    ),
  ).resolves.toMatchObject({ state: "UNDER_REVIEW", version: "2" });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining(`/admin/api/wallet/cases/${key}/review`),
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: expect.objectContaining({
        "X-Rinspace-CSRF": "synthetic-csrf",
        "X-Rinspace-Step-Up": "bound-proof",
        "Idempotency-Key": "22345678-1234-4234-8234-123456789abc",
      }),
      body: JSON.stringify({
        decision: "start_review",
        expected_version: "1",
        reason: "verify channel evidence",
      }),
    }),
  );
  expect(fetcher.mock.calls[0]?.[1]?.body).not.toContain("amount");
});

it("keeps case restrictions in integer Shangong units and sends exact source scope", async () => {
  const lot = "32345678-1234-4234-8234-123456789abc";
  const hold = "42345678-1234-4234-8234-123456789abc";
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      sources: [{ lot_id: lot, owner_uid: "author", unit: "SG_BOUND", kind: "tip",
        issued: "9007199254740993", remaining: "9", reserved: "1", restricted: "2", available: "6", version: "4" }],
      restrictions: [],
      appeals: [{ appeal_id: "72345678-1234-4234-8234-123456789abc", appellant_role: "subject", case_version: "3", reason: "申请复核", created_at: "2026-09-20T08:00:00Z" }],
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      case_id: key, hold_id: hold, lot_id: lot, quantity: "6", hold_state: "ACTIVE",
      case_version: "3", hold_version: "1", created_at: "2026-09-20T08:01:00Z",
    }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      case_id: key, hold_id: hold, lot_id: lot, quantity: "6", hold_state: "RELEASED",
      case_version: "4", hold_version: "2", created_at: "2026-09-20T08:02:00Z",
    }), { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(loadWalletAdminCaseSources(key)).resolves.toMatchObject({
    sources: [{ available: "6", unit: "SG_BOUND" }], restrictions: [], appeals: [{ appellantRole: "subject", caseVersion: "3" }],
  });
  await expect(restrictWalletAdminCase("wallet-admin", key,
    "52345678-1234-4234-8234-123456789abc", lot, "6", "2", "争议来源", "proof"))
    .resolves.toMatchObject({ holdState: "ACTIVE", quantity: "6" });
  await expect(releaseWalletAdminRestriction("wallet-admin", hold,
    "62345678-1234-4234-8234-123456789abc", "3", "解除", "proof"))
    .resolves.toMatchObject({ holdState: "RELEASED", caseVersion: "4" });
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({
    lot_id: lot, quantity: "6", expected_version: "2", reason: "争议来源",
  }));
  expect(fetcher.mock.calls[1]?.[1]?.body).not.toContain("amount_fen");
});

it("lists, assigns and evidence-resolves reconciliation differences without a balance field", async () => {
  const run = "82345678-1234-4234-8234-123456789abc";
  const item = "92345678-1234-4234-8234-123456789abc";
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ item_id: item, difference_key: "payment:x",
      code: "AMOUNT_MISMATCH", expected_fen: "1000", actual_fen: "994", state: "OPEN", version: "1",
      created_at: "2026-09-20T08:00:00Z", updated_at: "2026-09-20T08:00:00Z" }] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ item_id: item, state: "ASSIGNED", version: "2",
      assigned_to: "wallet-admin", created_at: "2026-09-20T08:01:00Z" }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ item_id: item, state: "RESOLVED", version: "3",
      assigned_to: "wallet-admin", resolution: "EVIDENCE_ACCEPTED", evidence_reference: "controlled://evidence/1",
      created_at: "2026-09-20T08:02:00Z" }), { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(loadWalletAdminReconciliationItems(run)).resolves.toMatchObject([{ itemId: item, expectedFen: "1000", state: "OPEN" }]);
  await expect(assignWalletAdminReconciliation("wallet-admin", item, key, "1", "wallet-admin", "领取", "proof"))
    .resolves.toMatchObject({ state: "ASSIGNED", version: "2" });
  await expect(resolveWalletAdminReconciliation("wallet-admin", item, "22345678-1234-4234-8234-123456789abc", "2",
    "EVIDENCE_ACCEPTED", "controlled://evidence/1", "复核", "proof")).resolves.toMatchObject({ state: "RESOLVED", version: "3" });
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ expected_version: "1", assignee_uid: "wallet-admin", reason: "领取" }));
  expect(fetcher.mock.calls[2]?.[1]?.body).not.toContain("balance");
});

it("keeps coverage amounts exact and records only evidence-backed inputs", async () => {
  const snapshot = { snapshot_id: key, evidence_as_of: "2026-09-20T08:00:00Z",
    available_cash_fen: "900719925474100000000000", approved_required_fen: "900719925474100000000020",
    state: "SHORTFALL", shortfall_fen: "20", methodology_reference: "controlled://methodology/v1",
    evidence_sha256: "a".repeat(64), evidence_reference: "controlled://statement/1",
    refundable_principal_fen: "90", refund_reserved_fen: "20", approved_unpaid_refund_fen: "10",
    open_dispute_exposure_fen: "5", unresolved_payment_fen: "0", alert_state: "OPEN",
    created_by: "wallet-admin", reason: "日终核对", created_at: "2026-09-20T08:01:00Z" };
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [snapshot] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(loadWalletAdminCoverageSnapshots()).resolves.toMatchObject([{ shortfallFen: "20", alertState: "OPEN" }]);
  await expect(recordWalletAdminCoverageSnapshot("wallet-admin", "22345678-1234-4234-8234-123456789abc", {
    evidence_as_of: "2026-09-20T08:00:00Z", available_cash_fen: "900719925474100000000000",
    approved_required_fen: "900719925474100000000020", methodology_reference: "controlled://methodology/v1",
    evidence_sha256: "a".repeat(64), evidence_reference: "controlled://statement/1", reason: "日终核对",
  }, "proof")).resolves.toMatchObject({ availableCashFen: "900719925474100000000000" });
  expect(Object.hasOwn(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)), "state")).toBe(false);
  expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ "X-Rinspace-Step-Up": "proof" });
});

it("rejects a changed account and malformed policy responses before display", async () => {
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: "someone-else" });
  vi.stubGlobal("fetch", vi.fn());
  await expect(
    updateWalletAdminPolicy(
      "wallet-admin",
      key,
      "7",
      "200000",
      "raise reviewed limit",
    ),
  ).rejects.toEqual(new WalletAdminError("UNAUTHENTICATED", 401));
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: "wallet-admin" });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...rawPolicy, recharge_enabled: "false" }),
          { status: 200 },
        ),
      ),
  );
  await expect(loadWalletAdminPolicy()).rejects.toEqual(
    new WalletAdminError("INVALID_RESPONSE"),
  );
});

it("shares exact refund response fixtures with the Go boundary", async () => {
  for (const vector of fixtures.summaries) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ items: [vector.value], next_cursor: "" }),
            { status: 200 },
          ),
        ),
    );
    const result = loadWalletAdminRefunds();
    if (vector.valid)
      await expect(result, vector.name).resolves.toMatchObject({
        items: [{ amountFen: expect.any(String) }],
      });
    else
      await expect(result, vector.name).rejects.toEqual(
        new WalletAdminError("INVALID_RESPONSE"),
      );
  }
  for (const vector of fixtures.details) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(vector.value), { status: 200 }),
        ),
    );
    const result = loadWalletAdminRefundDetail(key);
    if (vector.valid)
      await expect(result, vector.name).resolves.toMatchObject({
        operationId: key,
        reviews: [{ decision: "approve" }],
      });
    else
      await expect(result, vector.name).rejects.toEqual(
        new WalletAdminError("INVALID_RESPONSE"),
      );
  }
});

it("loads refund detail without converting exact integers to numbers", async () => {
  const value = fixtures.details[0].value;
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ ...value, payment_amount_fen: "9007199254741000" }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(loadWalletAdminRefundDetail(key)).resolves.toMatchObject({
    paymentAmountFen: "9007199254741000",
  });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining(`/admin/api/wallet/refunds/${key}`),
    expect.objectContaining({ credentials: "same-origin", redirect: "error" }),
  );
});

it("shares exact risk projection fixtures with the Go boundary", async () => {
  for (const vector of riskFixtures.cases) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ items: [vector.value], next_cursor: "" }),
            { status: 200 },
          ),
        ),
    );
    const result = loadWalletAdminCases();
    if (vector.valid)
      await expect(result, vector.name).resolves.toMatchObject({
        items: [{ amountFen: "9007199254741000" }],
      });
    else
      await expect(result, vector.name).rejects.toEqual(
        new WalletAdminError("INVALID_RESPONSE"),
      );
  }
});

it("shares exact reconciliation fixtures with the Go boundary", async () => {
  for (const vector of riskFixtures.reconciliations) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [vector.value] }), {
          status: 200,
        }),
      ),
    );
    const result = loadWalletAdminReconciliations();
    if (vector.valid)
      await expect(result, vector.name).resolves.toHaveLength(1);
    else
      await expect(result, vector.name).rejects.toEqual(
        new WalletAdminError("INVALID_RESPONSE"),
      );
  }
});

it("shares exact obligation fixtures with the Go boundary", async () => {
  for (const vector of riskFixtures.obligations) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(vector.value), { status: 200 }),
        ),
    );
    const result = loadWalletAdminObligations();
    if (vector.valid)
      await expect(result, vector.name).resolves.toMatchObject({
        refundablePrincipalFen: "900719925474100000000000",
      });
    else
      await expect(result, vector.name).rejects.toEqual(
        new WalletAdminError("INVALID_RESPONSE"),
      );
  }
});

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { RefreshCw } from "lucide-react";
import { Button, EmptyState, Input, Select, Surface } from "components/ui";

import { formatFenAsYuan, parseWalletInteger } from "@/features/wallet/amount";
import { walletStepUpBinding } from "@/features/wallet/idempotency";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import { beginIdentityStepUp, completeIdentityStepUp } from "@/services/phoneAuth";
import { WalletPolicyPanel } from "./WalletPolicyPanel";
import {
  assignWalletAdminReconciliation,
  loadWalletAdminCaseSources,
  loadWalletAdminCases,
  loadWalletAdminCoverageSnapshots,
  loadWalletAdminObligations,
  loadWalletAdminReconciliationItems,
  loadWalletAdminReconciliations,
  releaseWalletAdminRestriction,
  recordWalletAdminCoverageSnapshot,
  restrictWalletAdminCase,
  reviewWalletAdminCase,
  resolveWalletAdminReconciliation,
  type WalletAdminCase,
  type WalletAdminCaseSources,
  type WalletAdminCoverageSnapshot,
  type WalletAdminObligations,
  type WalletAdminReconciliation,
  type WalletAdminReconciliationItem,
} from "@/services/domains/walletAdmin";

type PendingCaseReview = Readonly<{
  item: WalletAdminCase;
  decision: "start_review" | "resolve";
  reason: string;
  key: string;
  purpose: "wallet_case_review";
  target: string;
  challengeId: string;
}>;
type PendingRestriction = Readonly<{
  item: WalletAdminCase;
  action: "restrict" | "release";
  lotId: string;
  holdId: string;
  quantity: string;
  reason: string;
  key: string;
  purpose: "wallet_case_restrict" | "wallet_case_release";
  target: string;
  challengeId: string;
}>;
type PendingReconciliation = Readonly<{
  difference: WalletAdminReconciliationItem;
  action: "assign" | "resolve";
  resolution: "" | "CHANNEL_CORRECTED" | "OPERATION_LINKED" | "CASE_LINKED" | "EVIDENCE_ACCEPTED";
  evidenceReference: string;
  reason: string;
  key: string;
  purpose: "wallet_reconciliation_assign" | "wallet_reconciliation_resolve";
  target: string;
  challengeId: string;
}>;
type PendingCoverage = Readonly<{
  coverage: true;
  input: Parameters<typeof recordWalletAdminCoverageSnapshot>[2];
  key: string;
  purpose: "wallet_coverage_record";
  target: string;
  challengeId: string;
}>;

function signedFen(raw: string) {
  const value = BigInt(raw);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "−" : ""}¥${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function WalletRiskView({
  uid,
  canReview,
  canRestrict,
  canReconcile,
  canCoverage,
  canViewPolicy = false,
  canConfigurePolicy = false,
}: {
  uid: string;
  canReview: boolean;
  canRestrict: boolean;
  canReconcile: boolean;
  canCoverage: boolean;
  canViewPolicy?: boolean;
  canConfigurePolicy?: boolean;
}) {
  const { t, i18n } = useFeatureTranslation("admin");
  const { t: walletT } = useFeatureTranslation("wallet");
  const [status, setStatus] = useState("open");
  const [section, setSection] = useState<"cases" | "reconciliation" | "coverage" | "policy">("cases");
  const [items, setItems] = useState<readonly WalletAdminCase[]>([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<WalletAdminCase | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<PendingCaseReview | PendingRestriction | PendingReconciliation | PendingCoverage | null>(null);
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [caseSources, setCaseSources] = useState<WalletAdminCaseSources | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconciliations, setReconciliations] = useState<
    readonly WalletAdminReconciliation[]
  >([]);
  const [selectedRun, setSelectedRun] = useState("");
  const [differences, setDifferences] = useState<readonly WalletAdminReconciliationItem[]>([]);
  const [reconciliationReason, setReconciliationReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [resolution, setResolution] = useState<PendingReconciliation["resolution"]>("EVIDENCE_ACCEPTED");
  const [obligations, setObligations] = useState<WalletAdminObligations | null>(
    null,
  );
  const [coverage, setCoverage] = useState<readonly WalletAdminCoverageSnapshot[]>([]);
  const [coverageAsOf, setCoverageAsOf] = useState("");
  const [availableCash, setAvailableCash] = useState("");
  const [requiredCash, setRequiredCash] = useState("");
  const [methodologyReference, setMethodologyReference] = useState("");
  const [coverageEvidenceHash, setCoverageEvidenceHash] = useState("");
  const [coverageEvidenceReference, setCoverageEvidenceReference] = useState("");
  const [coverageReason, setCoverageReason] = useState("");
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage || "zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }),
    [i18n.resolvedLanguage],
  );
  const load = useCallback(
    async (nextCursor = "", append = false) => {
      setLoading(true);
      setError("");
      try {
        const page = await loadWalletAdminCases(status, nextCursor);
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
      } catch {
        setError(t("risk.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [status, t],
  );
  useEffect(() => {
    setCursor("");
    void load();
  }, [load]);
  const loadRiskSummaries = useCallback(async () => {
    const [runs, exposure, coverageItems] = await Promise.allSettled([
      loadWalletAdminReconciliations(),
      loadWalletAdminObligations(),
      loadWalletAdminCoverageSnapshots(),
    ]);
    if (runs.status === "fulfilled") setReconciliations(runs.value);
    if (exposure.status === "fulfilled") setObligations(exposure.value);
    if (coverageItems.status === "fulfilled") setCoverage(coverageItems.value);
    if (runs.status === "rejected" || exposure.status === "rejected" || coverageItems.status === "rejected")
      setError(t("risk.loadFailed"));
  }, [t]);
  useEffect(() => {
    void loadRiskSummaries();
  }, [loadRiskSummaries]);
  const loadDifferences = useCallback(async (runId: string) => {
    setSelectedRun(runId);
    try {
      setDifferences(await loadWalletAdminReconciliationItems(runId));
    } catch {
      setError(t("risk.loadFailed"));
    }
  }, [t]);
  useEffect(() => {
    setCaseSources(null);
    if (!selected || (!canReview && !canRestrict)) return;
    void loadWalletAdminCaseSources(selected.caseId)
      .then(setCaseSources)
      .catch(() => setError(t("risk.loadFailed")));
  }, [canRestrict, canReview, selected, t]);
  const startReview = async (
    item: WalletAdminCase,
    decision: "start_review" | "resolve",
  ) => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const input = {
        decision,
        expected_version: item.version,
        reason,
      } as const;
      const binding = await walletStepUpBinding(
        "case.review",
        input,
        uid,
        item.caseId,
      );
      const challenge = await beginIdentityStepUp(
        binding.purpose,
        binding.target,
      );
      if (binding.purpose !== "wallet_case_review") throw new Error();
      setPending({
        item,
        decision,
        reason,
        key: crypto.randomUUID(),
        purpose: binding.purpose,
        target: binding.target,
        challengeId: challenge.challengeId,
      });
      setCode("");
    } catch {
      setError(t("risk.verifyFailed"));
    } finally {
      setBusy(false);
    }
  };
  const startRestriction = async (
    item: WalletAdminCase,
    action: "restrict" | "release",
    target: { lotId?: string; holdId?: string; quantity?: string; available?: string },
  ) => {
    if (!reason.trim() || busy ||
      (action === "restrict" && (!/^\d+$/.test(quantity) || BigInt(quantity) <= 0n || BigInt(quantity) > BigInt(target.available || "0")))) return;
    setBusy(true);
    setError("");
    try {
      const command = action === "restrict" ? "case.restrict" : "case.release";
      const commandTarget = action === "restrict" ? item.caseId : target.holdId || "";
      const raw = action === "restrict"
        ? { lot_id: target.lotId || "", quantity, expected_version: item.version, reason }
        : { expected_version: item.version, reason };
      const binding = await walletStepUpBinding(command, raw, uid, commandTarget);
      const challenge = await beginIdentityStepUp(binding.purpose, binding.target);
      if (binding.purpose !== "wallet_case_restrict" && binding.purpose !== "wallet_case_release") throw new Error();
      setPending({
        item,
        action,
        lotId: target.lotId || "",
        holdId: target.holdId || "",
        quantity: action === "restrict" ? quantity : target.quantity || "",
        reason,
        key: crypto.randomUUID(),
        purpose: binding.purpose,
        target: binding.target,
        challengeId: challenge.challengeId,
      });
      setCode("");
    } catch {
      setError(t("risk.verifyFailed"));
    } finally {
      setBusy(false);
    }
  };
  const finishReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending || !/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    setError("");
    try {
      const proof = await completeIdentityStepUp(
        pending.purpose,
        pending.target,
        pending.challengeId,
        code,
      );
      if ("coverage" in pending) {
        await recordWalletAdminCoverageSnapshot(uid, pending.key, pending.input, proof);
      } else if ("difference" in pending) {
        if (pending.action === "assign") {
          await assignWalletAdminReconciliation(uid, pending.difference.itemId, pending.key,
            pending.difference.version, uid, pending.reason, proof);
        } else if (pending.resolution) {
          await resolveWalletAdminReconciliation(uid, pending.difference.itemId, pending.key,
            pending.difference.version, pending.resolution, pending.evidenceReference, pending.reason, proof);
        }
      } else if ("decision" in pending) {
        await reviewWalletAdminCase(
          uid, pending.item.caseId, pending.key, pending.decision,
          pending.item.version, pending.reason, proof,
        );
      } else if (pending.action === "restrict") {
        await restrictWalletAdminCase(
          uid, pending.item.caseId, pending.key, pending.lotId, pending.quantity,
          pending.item.version, pending.reason, proof,
        );
      } else {
        await releaseWalletAdminRestriction(
          uid, pending.holdId, pending.key, pending.item.version, pending.reason, proof,
        );
      }
      setPending(null);
      setSelected(null);
      setReason("");
      setCode("");
      setQuantity("");
      await load();
      await loadRiskSummaries();
      if (selectedRun) await loadDifferences(selectedRun);
    } catch {
      setError(t("risk.reviewFailed"));
      await load();
    } finally {
      setBusy(false);
    }
  };
  const startReconciliation = async (difference: WalletAdminReconciliationItem, action: "assign" | "resolve") => {
    if (!canReconcile || !reconciliationReason.trim() || busy ||
      (action === "resolve" && (!evidenceReference.trim() || !resolution))) return;
    setBusy(true); setError("");
    try {
      const raw = action === "assign"
        ? { expected_version: difference.version, assignee_uid: uid, reason: reconciliationReason }
        : { expected_version: difference.version, resolution, evidence_reference: evidenceReference, reason: reconciliationReason };
      const command = action === "assign" ? "reconciliation.assign" : "reconciliation.resolve";
      const binding = await walletStepUpBinding(command, raw, uid, difference.itemId);
      const challenge = await beginIdentityStepUp(binding.purpose, binding.target);
      if (binding.purpose !== "wallet_reconciliation_assign" && binding.purpose !== "wallet_reconciliation_resolve") throw new Error();
      setPending({ difference, action, resolution: action === "resolve" ? resolution : "",
        evidenceReference: action === "resolve" ? evidenceReference : "", reason: reconciliationReason,
        key: crypto.randomUUID(), purpose: binding.purpose, target: binding.target, challengeId: challenge.challengeId });
      setCode("");
    } catch {
      setError(t("risk.verifyFailed"));
    } finally { setBusy(false); }
  };
  const startCoverage = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCoverage || busy || !coverageAsOf || !/^(?:0|[1-9]\d{0,77})$/.test(availableCash) ||
      !/^(?:0|[1-9]\d{0,77})$/.test(requiredCash) || !methodologyReference.trim() ||
      !/^[0-9a-f]{64}$/.test(coverageEvidenceHash) || !coverageEvidenceReference.trim() || !coverageReason.trim()) return;
    setBusy(true); setError("");
    try {
      const input = { evidence_as_of: new Date(coverageAsOf).toISOString().replace(".000Z", "Z"), available_cash_fen: availableCash,
        approved_required_fen: requiredCash, methodology_reference: methodologyReference.trim(),
        evidence_sha256: coverageEvidenceHash, evidence_reference: coverageEvidenceReference.trim(), reason: coverageReason } as const;
      const binding = await walletStepUpBinding("coverage.record", input, uid);
      const challenge = await beginIdentityStepUp(binding.purpose, binding.target);
      if (binding.purpose !== "wallet_coverage_record") throw new Error();
      setPending({ coverage: true, input, key: crypto.randomUUID(), purpose: binding.purpose,
        target: binding.target, challengeId: challenge.challengeId });
      setCode("");
    } catch {
      setError(t("risk.verifyFailed"));
    } finally { setBusy(false); }
  };
  return (
    <main className="admin-refunds-view">
      <header className="admin-refunds-heading">
        <div>
          <h1>{t("risk.title")}</h1>
        </div>
        <Button
          aria-label={t("shared.refresh")}
          title={t("shared.refresh")}
          onClick={() => {
            void load();
            void loadRiskSummaries();
          }}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" size={17} />
        </Button>
      </header>
      <nav className="admin-risk-tabs" aria-label={t("risk.title")}>
        {(["cases", "reconciliation", "coverage", ...(canViewPolicy ? ["policy"] : [])] as const).map((tab) => (
          <Button key={tab} type="button" variant="ghost" aria-current={section === tab ? "page" : undefined}
            onClick={() => setSection(tab as typeof section)}>
            {t(tab === "cases" ? "risk.cases" : tab === "reconciliation" ? "risk.reconciliation" : tab === "coverage" ? "risk.coverage" : "policy.title")}
          </Button>
        ))}
      </nav>
      {obligations ? (
        <section className="admin-wallet-policy admin-risk-obligations" aria-label={t("risk.obligations")}>
          <h2>{t("risk.obligations")}</h2>
          <dl>
            <div>
              <dt>{t("risk.refundablePrincipal")}</dt>
              <dd>{signedFen(obligations.refundablePrincipalFen)}</dd>
            </div>
            <div>
              <dt>{t("risk.refundReserved")}</dt>
              <dd>{signedFen(obligations.refundReservedFen)}</dd>
            </div>
            <div>
              <dt>{t("risk.approvedUnpaid")}</dt>
              <dd>{signedFen(obligations.approvedUnpaidRefundFen)}</dd>
            </div>
            <div>
              <dt>{t("risk.disputeExposure")}</dt>
              <dd>{signedFen(obligations.openDisputeExposureFen)}</dd>
            </div>
            <div>
              <dt>{t("risk.unresolvedPayments")}</dt>
              <dd>{signedFen(obligations.unresolvedPaymentFen)}</dd>
            </div>
            <div>
              <dt>{t("risk.openCases")}</dt>
              <dd>{obligations.openCaseCount}</dd>
            </div>
            <div>
              <dt>{t("risk.unmatchedRuns")}</dt>
              <dd>{obligations.unmatchedReconciliationCount}</dd>
            </div>
            <div>
              <dt>{t("risk.differenceItems")}</dt>
              <dd>{obligations.reconciliationDifferenceCount}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {section === "coverage" ? <Surface className="admin-wallet-policy admin-risk-coverage admin-risk-section">
        <h2>{walletT("adminRisk.coverage")}</h2>
        {coverage[0] ? <dl>
          <div><dt>{walletT("adminRisk.coverageState")}</dt><dd>{walletT(coverage[0].state === "COVERED" ? "adminRisk.covered" : "adminRisk.shortfall")}</dd></div>
          <div><dt>{walletT("adminRisk.availableCash")}</dt><dd>{signedFen(coverage[0].availableCashFen)}</dd></div>
          <div><dt>{walletT("adminRisk.approvedTarget")}</dt><dd>{signedFen(coverage[0].approvedRequiredFen)}</dd></div>
          <div><dt>{walletT("adminRisk.gap")}</dt><dd>{signedFen(coverage[0].shortfallFen)}</dd></div>
          <div><dt>{walletT("adminRisk.evidenceTime")}</dt><dd>{formatter.format(new Date(coverage[0].evidenceAsOf))}</dd></div>
        </dl> : <p>{walletT("adminRisk.coverageUnknown")}</p>}
        {canCoverage ? <form className="admin-risk-coverage-form" onSubmit={startCoverage}>
          <label>{walletT("adminRisk.evidenceTime")}<Input type="datetime-local" value={coverageAsOf} onChange={(event) => setCoverageAsOf(event.currentTarget.value)} /></label>
          <label>{walletT("adminRisk.availableFen")}<Input inputMode="numeric" value={availableCash} onChange={(event) => setAvailableCash(event.currentTarget.value.replace(/\D/g, ""))} /></label>
          <label>{walletT("adminRisk.targetFen")}<Input inputMode="numeric" value={requiredCash} onChange={(event) => setRequiredCash(event.currentTarget.value.replace(/\D/g, ""))} /></label>
          <label>{walletT("adminRisk.methodology")}<Input maxLength={512} value={methodologyReference} onChange={(event) => setMethodologyReference(event.currentTarget.value)} /></label>
          <label>{walletT("adminRisk.evidenceHash")}<Input maxLength={64} value={coverageEvidenceHash} onChange={(event) => setCoverageEvidenceHash(event.currentTarget.value.toLowerCase().replace(/[^0-9a-f]/g, ""))} /></label>
          <label>{t("risk.evidenceReference")}<Input maxLength={512} value={coverageEvidenceReference} onChange={(event) => setCoverageEvidenceReference(event.currentTarget.value)} /></label>
          <label>{walletT("adminRisk.coverageReason")}<Input maxLength={1000} value={coverageReason} onChange={(event) => setCoverageReason(event.currentTarget.value)} /></label>
          <Button type="submit" variant="primary" disabled={busy}>{walletT("adminRisk.recordCoverage")}</Button>
        </form> : null}
        {pending && "coverage" in pending ? <form onSubmit={finishReview} className="admin-refund-verification">
          <label>{t("risk.code")}<Input inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>{t("risk.confirm")}</Button>
        </form> : null}
      </Surface> : null}
      {section === "policy" && canViewPolicy ? <WalletPolicyPanel uid={uid} canConfigure={canConfigurePolicy} /> : null}
      {section === "reconciliation" ? <Surface className="admin-wallet-policy admin-risk-reconciliation admin-risk-section">
        <h2>{t("risk.reconciliation")}</h2>
        {!reconciliations.length ? (
          <p>{t("risk.noReconciliation")}</p>
        ) : (
          <ol>
            {reconciliations.map((item) => (
              <li key={item.runId}>
                <span>{item.billDate}</span>
                <strong>{item.state}</strong>
                <span>
                  {t("risk.differences")} {item.differenceCount}
                </span>
                {item.netFen ? <span>{signedFen(item.netFen)}</span> : null}
                {item.differenceCount !== "0" ? <Button onClick={() => void loadDifferences(item.runId)}>{t("risk.viewDifferences")}</Button> : null}
              </li>
            ))}
          </ol>
        )}
        {selectedRun ? <div className="admin-case-sources">
          <h3>{t("risk.differenceItems")}</h3>
          {!differences.length ? <p>{t("risk.noDifferences")}</p> : differences.map((item) => <div key={item.itemId}>
            <span>{item.code} · {item.state}</span>
            <code>{item.differenceKey}</code>
            {item.expectedFen ? <span>{t("risk.expected")} {signedFen(item.expectedFen)}</span> : null}
            {item.actualFen ? <span>{t("risk.actual")} {signedFen(item.actualFen)}</span> : null}
            {item.assignedTo ? <small>{t("risk.assignee")} {item.assignedTo}</small> : null}
            {canReconcile && item.state !== "RESOLVED" ? <>
              <Input value={reconciliationReason} maxLength={1000} placeholder={t("risk.reviewReason")} onChange={(event) => setReconciliationReason(event.currentTarget.value)} />
              {item.assignedTo !== uid ? <Button disabled={busy || !reconciliationReason.trim()} onClick={() => void startReconciliation(item, "assign")}>{t("risk.claim")}</Button> : null}
              {item.state === "ASSIGNED" && item.assignedTo === uid ? <>
                <Select value={resolution} onChange={(event) => setResolution(event.currentTarget.value as PendingReconciliation["resolution"])}>
                  <option value="EVIDENCE_ACCEPTED">{t("risk.evidenceAccepted")}</option>
                  <option value="CHANNEL_CORRECTED">{t("risk.channelCorrected")}</option>
                  <option value="OPERATION_LINKED">{t("risk.operationLinked")}</option>
                  <option value="CASE_LINKED">{t("risk.caseLinked")}</option>
                </Select>
                <Input value={evidenceReference} maxLength={512} placeholder={t("risk.evidenceReference")} onChange={(event) => setEvidenceReference(event.currentTarget.value)} />
                <Button disabled={busy || !reconciliationReason.trim() || !evidenceReference.trim()} onClick={() => void startReconciliation(item, "resolve")}>{t("risk.resolveDifference")}</Button>
              </> : null}
            </> : null}
          </div>)}
        </div> : null}
        {pending && "difference" in pending ? <form onSubmit={finishReview} className="admin-refund-verification">
          <label>{t("risk.code")}<Input inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>{t("risk.confirm")}</Button>
        </form> : null}
      </Surface> : null}
      {section === "cases" ? <><div className="admin-risk-section-heading"><h2>{t("risk.cases")}</h2></div><div className="admin-risk-filter">
        <label>
          {t("risk.status")}
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="open">{t("risk.open")}</option>
            <option value="UNDER_REVIEW">{t("risk.underReview")}</option>
            <option value="RESOLVED">{t("risk.resolved")}</option>
          </Select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="admin-refunds-error">
          {error}
        </p>
      ) : null}
      {loading && !items.length ? (
        <p role="status">{t("shared.loading")}</p>
      ) : null}
      {!loading && !items.length ? (
        <EmptyState title={t("risk.empty")} />
      ) : (
        <ol className="admin-refunds-list">
          {items.map((item) => (
            <li key={item.caseId}>
              <div className="admin-risk-card">
                <div>
                  <strong>
                    ¥{formatFenAsYuan(parseWalletInteger(item.amountFen))}
                  </strong>
                  <span>{t(item.state === "OPEN" ? "risk.open" : item.state === "UNDER_REVIEW" ? "risk.underReview" : "risk.resolved")}</span>
                </div>
                <p>{item.reason}</p>
                <small>{formatter.format(new Date(item.createdAt))}</small>
                <code>{item.caseId}</code>
                {(canReview || canRestrict) && item.state !== "RESOLVED" ? (
                  <Button
                    onClick={() => {
                      setSelected(item);
                      setReason("");
                      setQuantity("");
                      setPending(null);
                    }}
                    disabled={busy}
                  >
                    {t("risk.manage")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {selected ? (
        <Surface className="admin-refund-detail">
          <h2>{t("risk.reviewTitle")}</h2>
          <label>
            {t("risk.reviewReason")}
            <Input
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="admin-refund-actions">
            {canReview && selected.state === "OPEN" ? (
              <Button
                variant="primary"
                disabled={busy || !reason.trim() || Boolean(pending)}
                onClick={() => void startReview(selected, "start_review")}
              >
                {t("risk.startReview")}
              </Button>
            ) : null}
            {canReview && selected.state === "UNDER_REVIEW" ? (
              <Button
                variant="primary"
                disabled={busy || !reason.trim() || Boolean(pending)}
                onClick={() => void startReview(selected, "resolve")}
              >
                {t("risk.resolve")}
              </Button>
            ) : null}
          </div>
          {caseSources?.appeals.length ? (
            <div className="admin-case-sources">
              <h3>{t("risk.appeals")}</h3>
              {caseSources.appeals.map((appeal) => (
                <div key={appeal.appealId}>
                  <span>{t(appeal.appellantRole === "subject" ? "risk.appealSubject" : "risk.appealAffected")} · v{appeal.caseVersion}</span>
                  <p>{appeal.reason}</p>
                  <small>{formatter.format(new Date(appeal.createdAt))}</small>
                </div>
              ))}
            </div>
          ) : null}
          {selected.state === "UNDER_REVIEW" && canRestrict && caseSources ? (
            <div className="admin-case-sources">
              <h3>{t("risk.sources")}</h3>
              <label>
                {t("risk.quantity")}
                <Input
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              {caseSources.sources.map((source) => (
                <div key={source.lotId}>
                  <span>{source.unit} · {source.available}</span>
                  <code>{source.lotId}</code>
                  {BigInt(source.available) > 0n ? (
                    <Button
                      disabled={busy || !reason.trim() || !quantity || Boolean(pending)}
                      onClick={() =>
                        void startRestriction(selected, "restrict", { lotId: source.lotId, available: source.available })
                      }
                    >
                      {t("risk.restrict")}
                    </Button>
                  ) : null}
                </div>
              ))}
              {caseSources.restrictions
                .filter((hold) => hold.state === "ACTIVE")
                .map((hold) => (
                  <div key={hold.holdId}>
                    <span>{hold.unit} · {hold.quantity}</span>
                    <Button
                      disabled={busy || !reason.trim() || Boolean(pending)}
                      onClick={() =>
                        void startRestriction(selected, "release", {
                          holdId: hold.holdId,
                          quantity: hold.quantity,
                        })
                      }
                    >
                      {t("risk.release")}
                    </Button>
                  </div>
                ))}
            </div>
          ) : null}
          {pending && !("difference" in pending) ? (
            <form
              onSubmit={finishReview}
              className="admin-refund-verification"
            >
              <label>
                {t("risk.code")}
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || code.length !== 6}
              >
                {t("risk.confirm")}
              </Button>
            </form>
          ) : null}
        </Surface>
      ) : null}
      {cursor ? (
        <Button onClick={() => void load(cursor, true)} disabled={loading}>
          {t("shared.loadMore")}
        </Button>
      ) : null}</> : null}
    </main>
  );
}

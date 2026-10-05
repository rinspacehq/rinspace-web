import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, EmptyState, Input, Select, Surface } from "components/ui";

import { formatFenAsYuan, parseWalletInteger } from "@/features/wallet/amount";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import {
  loadWalletAdminRefundDetail,
  loadWalletAdminRefunds,
  revokeWalletAdminRefund,
  reviewWalletAdminRefund,
  type WalletAdminRefund,
  type WalletAdminRefundDetail,
} from "@/services/domains/walletAdmin";

const refundStatusKeys: Readonly<Record<string, string>> = Object.freeze({
  REQUESTED_RESERVED: "refunds.pending",
  APPROVED_QUEUED: "refunds.approvedQueued",
  SUBMITTED: "refunds.submitted",
  RESULT_UNKNOWN: "refunds.resultUnknown",
  CHANNEL_SUCCEEDED: "refunds.channelSucceeded",
  COMPLETED: "statuses.completed",
  FAILED_FINAL: "refunds.failedFinal",
  REJECTED: "statuses.rejected",
  CANCELLED: "refunds.cancelled",
  EXCEPTION: "refunds.exception",
});

export function WalletRefundsView({
  uid,
  canReview,
  canRevoke,
}: {
  uid: string;
  canReview: boolean;
  canRevoke: boolean;
}) {
  const { t, i18n } = useFeatureTranslation("admin");
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<readonly WalletAdminRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<WalletAdminRefundDetail | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage || "zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }),
    [i18n.resolvedLanguage],
  );
  const formatTime = (value: string) =>
    value ? formatter.format(new Date(value)) : "-";
  const statusLabel = (value: string) =>
    t(refundStatusKeys[value] || "statuses.unknown");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await loadWalletAdminRefunds(status);
      setItems(page.items);
    } catch {
      setError(t("refunds.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [status, t]);
  useEffect(() => {
    setSelectedId("");
    setSelected(null);
    void reload();
  }, [reload]);

  const openDetail = async (item: WalletAdminRefund) => {
    setSelectedId(item.operationId);
    setSelected(null);
    setReason("");
    setDetailLoading(true);
    setError("");
    try {
      setSelected(await loadWalletAdminRefundDetail(item.operationId));
    } catch {
      setError(t("refunds.detailFailed"));
    } finally {
      setDetailLoading(false);
    }
  };
  const finishAction = async (action: "approve" | "reject" | "revoke") => {
    if (!selected || !reason.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "revoke") {
        await revokeWalletAdminRefund(
          uid,
          selected.operationId,
          crypto.randomUUID(),
          selected.version,
          reason,
        );
      } else {
        await reviewWalletAdminRefund(
          uid,
          selected.operationId,
          crypto.randomUUID(),
          action,
          selected.version,
          reason,
        );
      }
      setSelectedId("");
      setSelected(null);
      setReason("");
      await reload();
    } catch {
      setError(t("refunds.reviewFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-refunds-view">
      <header className="admin-refunds-heading">
        <h1>{t("refunds.title")}</h1>
        <Button
          aria-label={t("shared.refresh")}
          title={t("shared.refresh")}
          onClick={() => void reload()}
          disabled={loading || busy}
        >
          <RefreshCw aria-hidden="true" size={17} />
        </Button>
      </header>
      <div className="admin-refund-filter">
        <label>
          {t("refunds.status")}
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="pending">{t("refunds.pending")}</option>
            <option value="APPROVED_QUEUED">{t("refunds.approvedQueued")}</option>
            <option value="RESULT_UNKNOWN">{t("refunds.resultUnknown")}</option>
            <option value="COMPLETED">{t("statuses.completed")}</option>
            <option value="FAILED_FINAL">{t("refunds.failedFinal")}</option>
            <option value="REJECTED">{t("statuses.rejected")}</option>
          </Select>
        </label>
      </div>
      {error ? <p role="alert" className="admin-refunds-error">{error}</p> : null}
      {loading ? <p role="status">{t("shared.loading")}</p> : null}
      <div className="admin-refund-workspace">
        <div className="admin-refund-queue">
          {!loading && !items.length ? (
            <EmptyState title={t("refunds.empty")} />
          ) : (
            <ol className="admin-refunds-list">
              {items.map((item) => (
                <li key={item.operationId}>
                  <Button
                    type="button"
                    onClick={() => void openDetail(item)}
                    aria-pressed={selectedId === item.operationId}
                  >
                    <span>
                      <strong>¥{formatFenAsYuan(parseWalletInteger(item.amountFen))}</strong>
                      <small>{formatTime(item.createdAt)}</small>
                    </span>
                    <span>{statusLabel(item.state)}</span>
                    <code>{item.operationId}</code>
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
        {detailLoading ? <p role="status">{t("shared.loading")}</p> : null}
        {selected ? (
          <Surface className="admin-refund-detail">
            <div className="admin-refund-detail-heading">
              <h2>{t("refunds.reviewTitle")}</h2>
              <span>{statusLabel(selected.state)}</span>
            </div>
            <dl>
              <div><dt>{t("refunds.amount")}</dt><dd>¥{formatFenAsYuan(parseWalletInteger(selected.amountFen))}</dd></div>
              <div><dt>{t("refunds.originalOrder")}</dt><dd><code>{selected.outTradeNo}</code></dd></div>
              <div><dt>{t("refunds.reserved")}</dt><dd>{selected.reservedQuantity}</dd></div>
              <div><dt>{t("refunds.submittedAt")}</dt><dd>{formatTime(selected.submittedAt)}</dd></div>
              <div><dt>{t("refunds.firstResponseAt")}</dt><dd>{formatTime(selected.firstResponseAt)}</dd></div>
              <div><dt>{t("refunds.reason")}</dt><dd>{selected.requestReason}</dd></div>
            </dl>
            {selected.reviews.length ? (
              <section className="admin-refund-history">
                <h3>{t("refunds.history")}</h3>
                <ol>
                  {selected.reviews.map((review, index) => (
                    <li key={`${review.createdAt}-${index}`}>
                      <strong>{t(`refunds.decision.${review.decision}`)}</strong>
                      <span>{review.reason}</span>
                      <small>{formatTime(review.createdAt)}</small>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            {(canReview && selected.state === "REQUESTED_RESERVED") ||
            (canRevoke && selected.state === "APPROVED_QUEUED") ? (
              <>
                <label>
                  {t("refunds.reviewReason")}
                  <Input
                    value={reason}
                    maxLength={1000}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <div className="admin-refund-actions">
                  {canRevoke && selected.state === "APPROVED_QUEUED" ? (
                    <Button disabled={busy || !reason.trim()} onClick={() => void finishAction("revoke")}>
                      {t("refunds.revoke")}
                    </Button>
                  ) : null}
                  {canReview && selected.state === "REQUESTED_RESERVED" ? (
                    <>
                      <Button disabled={busy || !reason.trim()} onClick={() => void finishAction("reject")}>
                        {t("refunds.reject")}
                      </Button>
                      <Button variant="primary" disabled={busy || !reason.trim()} onClick={() => void finishAction("approve")}>
                        {t("refunds.approve")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </Surface>
        ) : null}
      </div>
    </main>
  );
}

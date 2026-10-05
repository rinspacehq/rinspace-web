import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Select,
  Sheet,
  SheetContent,
  Textarea,
} from "@/components/ui";
import {
  loadReportReasonCatalog,
  submitReportSubmission,
  type ReportReasonCatalog,
  type ReportReceipt,
  type ReportTarget,
} from "@/services/domains/reporting";
import { messageFromError } from "@/services/errors";
import { subscribeToMediaQuery } from "@/utils/mediaQuery";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

type ReportDialogProps = {
  target: ReportTarget | null;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: (receipt: ReportReceipt) => void;
};

function useCompactReportOverlay() {
  const query = "(max-width: 560px)";
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    return subscribeToMediaQuery(media, update);
  }, []);
  return compact;
}

function reportTargetKey(target: ReportTarget | null) {
  if (!target) return "";
  return [
    target.targetType,
    target.targetId || "",
    target.objectId || "",
    target.slug || "",
  ].join(":");
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ReportDialog({
  target,
  onOpenChange,
  onSubmitted,
}: ReportDialogProps) {
  const { i18n, t } = useTranslation("common");
  const compact = useCompactReportOverlay();
  const targetKey = reportTargetKey(target);
  const targetType = target?.targetType;
  const [catalog, setCatalog] = useState<ReportReasonCatalog | null>(null);
  const [reasonKey, setReasonKey] = useState("");
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const attemptRef = useRef({ fingerprint: "", key: "" });
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!targetType) return;
    if (document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
    let cancelled = false;
    setCatalog(null);
    setReasonKey("");
    setDetail("");
    setError("");
    setLoading(true);
    setSubmitting(false);
    attemptRef.current = { fingerprint: "", key: "" };
    void loadReportReasonCatalog(targetType)
      .then((next) => {
        if (cancelled) return;
        setCatalog(next);
        setReasonKey(next.reasons[0]?.key || "");
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(messageFromError(failure, "report.loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetKey, targetType]);

  const selectedReason = useMemo(
    () => catalog?.reasons.find((reason) => reason.key === reasonKey) || null,
    [catalog, reasonKey],
  );

  const close = () => {
    onOpenChange(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !catalog || !selectedReason || submitting) return;
    const content = detail.trim();
    if (selectedReason.requiresDetail && !content) {
      setError(t("report.detailRequired"));
      return;
    }
    const fingerprint = JSON.stringify({
      targetKey,
      reasonKey,
      reasonVersion: catalog.version,
      content,
    });
    if (attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, key: newIdempotencyKey() };
    }
    setSubmitting(true);
    setError("");
    try {
      const receipt = await submitReportSubmission({
        ...target,
        reasonKey,
        reasonVersion: catalog.version,
        content,
        idempotencyKey: attemptRef.current.key,
      });
      close();
      onSubmitted?.(receipt);
    } catch (failure) {
      setError(messageFromError(failure, "report.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const form = target ? (
    <form className="rin-report-form" onSubmit={(event) => void submit(event)}>
      <strong className="rin-report-target">{target.title}</strong>
      <Field label={t("report.reason")}>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={reasonKey}
            disabled={loading || !catalog || submitting}
            onChange={(event) => {
              setReasonKey(event.currentTarget.value);
              setDetail("");
              setError("");
            }}
          >
            {catalog?.reasons.map((reason) => (
              <option key={reason.key} value={reason.key}>
                {i18n.exists(`common:report.reasons.${reason.key}`)
                  ? t(`report.reasons.${reason.key}`)
                  : t("report.reasons.other")}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {selectedReason?.requiresDetail ? (
        <Field label={t("report.detail")} required>
          {({ inputId, errorId }) => (
            <Textarea
              id={inputId}
              aria-describedby={errorId}
              rows={4}
              maxLength={500}
              value={detail}
              disabled={submitting}
              onChange={(event) => {
                setDetail(event.currentTarget.value);
                setError("");
              }}
            />
          )}
        </Field>
      ) : null}
      {error ? (
        <div className="rin-report-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="rin-report-actions">
        <Button type="button" variant="ghost" disabled={submitting} onClick={close}>
          {t("actions.cancel")}
        </Button>
        <Button
          type="submit"
          variant="primary"
          pending={submitting}
          disabled={
            loading ||
            !catalog ||
            !selectedReason ||
            (selectedReason.requiresDetail && !detail.trim())
          }
        >
          {t("report.submit")}
        </Button>
      </div>
    </form>
  ) : null;

  if (compact) {
    return (
      <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
        <SheetContent title={t("report.title")} side="bottom" className="rin-report-sheet">
          {form}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent title={t("report.title")} className="rin-report-dialog">
        {form}
      </DialogContent>
    </Dialog>
  );
}

import {
  AnimateCross,
  Button,
  Dialog,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "components/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { TFunction } from "i18next";

import CodeMirrorEditor from "@/components/CodeMirrorEditor";
import { formatDate, formatNumber } from "@/i18n/format";
import { useResolvedLocale } from "@/i18n/LanguageProvider";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import type { LocaleId } from "@/i18n/types";
import { createComment, loadComments } from "@/services/domains/discussion";
import type { CommentSummary } from "@/services/contracts";
import { requestAuthDialog } from "@/utils/authDialog";

import {
  BookPublicationConflictError,
  createBookAnnotation,
  deleteBookAnnotation,
  loadBookAnnotation,
  loadBookAnnotationPage,
  updateBookAnnotation,
  type BookAnnotationBlockGroup,
  type BookAnnotationItem,
  type BookAnnotationKind,
  type BookAnnotationPageSummary,
} from "./service";

type BookAnnotationsLayerProps = {
  bookRef: string;
  pageId: string;
  publicationCommit: string;
  capabilities: {
    annotationsRead: boolean;
    annotationsWrite: boolean;
    annotationsWriteAvailable: boolean;
    erratumSync: boolean;
    erratumSyncAvailable: boolean;
  };
  articleRef: RefObject<HTMLDivElement | null>;
  hasSession: boolean;
  preferCenteredDialog?: boolean;
};

type TriggerPosition = { left: number; top: number };
type ComposerState = {
  blockId: string;
  kind: Exclude<BookAnnotationKind, "highlight">;
  body: string;
  correctionText: string;
  editingId?: string;
};
type RailPosition = { top: number; viewportTop: number };

const interactiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menu"]',
  ".rin-code-copy",
  "mjx-container",
  ".MathJax",
].join(",");

function annotationBlock(target: EventTarget | null, article: HTMLElement) {
  if (!(target instanceof Element)) return null;
  const block = target.closest<HTMLElement>(
    "[data-rin-block-id][data-rin-block-kind]",
  );
  return block && article.contains(block) ? block : null;
}

function hasInteractionPriority(target: EventTarget | null) {
  return (
    target instanceof Element && Boolean(target.closest(interactiveSelector))
  );
}

function blockId(block: HTMLElement) {
  return block.dataset.rinBlockId || "";
}

function itemText(item: BookAnnotationItem) {
  return (
    (item.kind === "erratum" ? item.correctionText || item.body : item.body) ||
    ""
  ).trim();
}

function preferredItem(items: BookAnnotationItem[]) {
  const rank: Record<BookAnnotationKind, number> = {
    question: 0,
    erratum: 1,
    comment: 2,
    note: 3,
    highlight: 4,
  };
  return [...items].sort(
    (left, right) => rank[left.kind] - rank[right.kind],
  )[0];
}

function mergeGroups(
  summary: BookAnnotationPageSummary | null,
  blockOrder: Map<string, number>,
) {
  const merged = new Map<string, BookAnnotationItem[]>();
  for (const group of [...(summary?.public || []), ...(summary?.mine || [])]) {
    const items = merged.get(group.blockId) || [];
    merged.set(group.blockId, [...items, ...group.items]);
  }
  return [...merged.entries()]
    .map(([id, items]) => ({ blockId: id, items }))
    .sort(
      (left, right) =>
        (blockOrder.get(left.blockId) ?? Number.MAX_SAFE_INTEGER) -
        (blockOrder.get(right.blockId) ?? Number.MAX_SAFE_INTEGER),
    );
}

function sourceBlock(article: HTMLElement | null, id: string) {
  if (!article || !id) return null;
  return (
    [...article.querySelectorAll<HTMLElement>("[data-rin-block-id]")].find(
      (item) => item.dataset.rinBlockId === id,
    ) || null
  );
}

function annotationDate(value: string, locale: LocaleId) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(locale, date, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function annotationKindLabel(kind: BookAnnotationKind, t: TFunction<"reader">) {
  return t(`annotations.kinds.${kind}`);
}

function annotationStatusLabel(
  item: BookAnnotationItem,
  t: TFunction<"reader">,
) {
  if (item.anchorState === "orphaned") return t("annotations.status.orphaned");
  if (item.status === "active") return "";
  const knownStatuses = [
    "open",
    "answered",
    "pending_issue",
    "confirmed",
    "fixed",
    "rejected",
  ];
  return knownStatuses.includes(item.status)
    ? t(`annotations.status.${item.status}`)
    : item.status;
}

function railGroupVisible(group: BookAnnotationBlockGroup) {
  return group.items.some((item) => item.kind !== "highlight");
}

function BlockGroupSummary({
  group,
  onOpen,
}: {
  group: BookAnnotationBlockGroup;
  onOpen(): void;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const item = preferredItem(group.items);
  if (!item || item.kind === "highlight") return null;
  const status = annotationStatusLabel(item, t);
  const count =
    item.replyCount ||
    group.items.filter((entry) => entry.kind !== "highlight").length;
  return (
    <Button
      className="book-annotation-card"
      type="button"
      variant="ghost"
      onClick={onOpen}
    >
      <span className="book-annotation-card-meta">
        <span>
          {annotationKindLabel(item.kind, t)}
          {status ? ` · ${status}` : ""}
        </span>
        {count > 0 ? <strong>{formatNumber(locale, count)}</strong> : null}
      </span>
      {itemText(item) ? (
        <span className="book-annotation-card-text">{itemText(item)}</span>
      ) : null}
    </Button>
  );
}

function AnnotationComposer({
  composer,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  composer: ComposerState;
  busy: boolean;
  error: string;
  onChange(next: ComposerState): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const { t } = useFeatureTranslation("reader");
  const bodyRequired = composer.kind !== "erratum";
  return (
    <div className="book-annotation-composer" data-kind={composer.kind}>
      {composer.kind === "erratum" ? (
        <label>
          <span>{t("annotations.suggestedCorrection")}</span>
          <CodeMirrorEditor
            value={composer.correctionText}
            minHeight="96px"
            ariaLabel={t("annotations.suggestedCorrection")}
            showLineNumbers={false}
            submitOnEnter={false}
            onChange={(correctionText) =>
              onChange({ ...composer, correctionText })
            }
          />
        </label>
      ) : null}
      <label>
        <span>
          {composer.kind === "erratum"
            ? t("annotations.rationale")
            : annotationKindLabel(composer.kind, t)}
        </span>
        <CodeMirrorEditor
          value={composer.body}
          minHeight="112px"
          ariaLabel={
            composer.kind === "erratum"
              ? t("annotations.rationaleLabel")
              : annotationKindLabel(composer.kind, t)
          }
          showLineNumbers={false}
          submitOnEnter={false}
          onChange={(body) => onChange({ ...composer, body })}
        />
      </label>
      {error ? (
        <p className="book-annotation-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="book-annotation-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("annotations.cancel")}
        </Button>
        <Button
          type="button"
          variant="primary"
          pending={busy}
          disabled={
            busy ||
            (bodyRequired
              ? !composer.body.trim()
              : !composer.correctionText.trim())
          }
          onClick={onSubmit}
        >
          {t("annotations.submit")}
        </Button>
      </div>
    </div>
  );
}

function AnnotationThread({
  group,
  selectedId,
  comments,
  replyBody,
  replyBusy,
  error,
  onSelect,
  onReplyBody,
  onReply,
  onEdit,
  onDelete,
}: {
  group: BookAnnotationBlockGroup;
  selectedId: string;
  comments: CommentSummary[];
  replyBody: string;
  replyBusy: boolean;
  error: string;
  onSelect(id: string): void;
  onReplyBody(body: string): void;
  onReply(): void;
  onEdit(item: BookAnnotationItem): void;
  onDelete(item: BookAnnotationItem): void;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const roots = group.items.filter((item) => item.kind !== "highlight");
  const active =
    roots.find((item) => item.id === selectedId) || preferredItem(roots);
  if (!active) return null;
  const canReply = active.kind === "comment" || active.kind === "question";
  const status = annotationStatusLabel(active, t);
  return (
    <div className="book-annotation-thread">
      {roots.length > 1 ? (
        <div
          className="book-annotation-root-tabs"
          role="tablist"
          aria-label={t("annotations.blockContent")}
        >
          {roots.map((item) => (
            <Button
              type="button"
              variant="ghost"
              role="tab"
              aria-selected={item.id === active.id}
              onClick={() => onSelect(item.id)}
              key={item.id}
            >
              {annotationKindLabel(item.kind, t)}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="book-annotation-thread-head">
        <strong>
          {annotationKindLabel(active.kind, t)}
          {status ? ` · ${status}` : ""}
        </strong>
        <span>
          {active.replyCount ? formatNumber(locale, active.replyCount) : ""}
        </span>
      </div>
      <div className="book-annotation-thread-byline">
        <span>
          {active.own
            ? t("annotations.mine")
            : active.author || t("annotations.reader")}
        </span>
        <time dateTime={active.createdAt}>
          {annotationDate(active.createdAt, locale)}
        </time>
      </div>
      {active.kind === "erratum" && active.correctionText ? (
        <div className="book-annotation-correction">
          {active.correctionText}
        </div>
      ) : null}
      {active.body ? (
        <div className="book-annotation-root-body">{active.body}</div>
      ) : null}
      {active.own ? (
        <div className="book-annotation-root-actions">
          {active.kind !== "highlight" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEdit(active)}
            >
              {t("annotations.edit")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onDelete(active)}
          >
            {t("annotations.delete")}
          </Button>
        </div>
      ) : null}
      {comments.length ? (
        <div className="book-annotation-comments">
          {comments.map((comment) => (
            <article key={comment.id}>
              <header>
                <strong>{comment.author}</strong>
                <time dateTime={comment.createdAt}>
                  {annotationDate(comment.createdAt, locale)}
                </time>
              </header>
              <div>{comment.body}</div>
            </article>
          ))}
        </div>
      ) : null}
      {canReply ? (
        <div className="book-annotation-reply">
          <CodeMirrorEditor
            value={replyBody}
            minHeight="88px"
            ariaLabel={t("annotations.reply")}
            showLineNumbers={false}
            submitOnEnter={false}
            onChange={onReplyBody}
          />
          <Button
            type="button"
            variant="primary"
            pending={replyBusy}
            disabled={replyBusy || !replyBody.trim()}
            onClick={onReply}
          >
            {t("annotations.send")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="book-annotation-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function BookAnnotationsLayer({
  bookRef,
  pageId,
  publicationCommit,
  capabilities,
  articleRef,
  hasSession,
  preferCenteredDialog = false,
}: BookAnnotationsLayerProps) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const draftsRef = useRef<
    Record<string, Pick<ComposerState, "body" | "correctionText">>
  >({});
  const [summary, setSummary] = useState<BookAnnotationPageSummary | null>(
    null,
  );
  const [operational, setOperational] = useState(capabilities.annotationsRead);
  const [activeBlockId, setActiveBlockId] = useState("");
  const [activeAnnotationId, setActiveAnnotationId] = useState("");
  const [triggerPosition, setTriggerPosition] =
    useState<TriggerPosition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    () => globalThis.window?.innerWidth || 1440,
  );
  const [domVersion, setDomVersion] = useState(0);
  const [positions, setPositions] = useState<Record<string, RailPosition>>({});
  const [railHeight, setRailHeight] = useState(0);
  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [threadError, setThreadError] = useState("");
  const canWrite = operational && capabilities.annotationsWrite && hasSession;
  const canInvokeActions =
    canWrite ||
    (operational && !hasSession && capabilities.annotationsWriteAvailable);
  const useCenteredDialog = preferCenteredDialog || viewportWidth < 1440;

  const refresh = useCallback(async () => {
    if (!capabilities.annotationsRead || !pageId || !publicationCommit) return;
    const next = await loadBookAnnotationPage(
      bookRef,
      pageId,
      publicationCommit,
    );
    setSummary(next);
    setOperational(true);
  }, [bookRef, capabilities.annotationsRead, pageId, publicationCommit]);

  useEffect(() => {
    let cancelled = false;
    if (!capabilities.annotationsRead || !pageId || !publicationCommit) {
      setOperational(false);
      setSummary(null);
      return undefined;
    }
    void loadBookAnnotationPage(bookRef, pageId, publicationCommit)
      .then((next) => {
        if (!cancelled) {
          setSummary(next);
          setOperational(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setOperational(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookRef, capabilities.annotationsRead, pageId, publicationCommit]);

  useEffect(() => {
    setActiveBlockId("");
    setActiveAnnotationId("");
    setComposer(null);
    setMenuOpen(false);
    setAnnotationPanelOpen(false);
    setComments([]);
    setReplyBody("");
  }, [pageId, publicationCommit]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return undefined;
    const observer = new MutationObserver(() =>
      setDomVersion((value) => value + 1),
    );
    observer.observe(article, { childList: true, subtree: true });
    setDomVersion((value) => value + 1);
    return () => observer.disconnect();
  }, [articleRef, pageId]);

  const blockOrder = useMemo(() => {
    void domVersion;
    void pageId;
    const order = new Map<string, number>();
    articleRef.current
      ?.querySelectorAll<HTMLElement>("[data-rin-block-id]")
      .forEach((block, index) => {
        const id = blockId(block);
        if (id && !order.has(id)) order.set(id, index);
      });
    return order;
  }, [articleRef, domVersion, pageId]);

  const groups = useMemo(
    () => mergeGroups(summary, blockOrder),
    [blockOrder, summary],
  );
  const visibleGroups = useMemo(
    () => groups.filter(railGroupVisible),
    [groups],
  );
  const groupByBlock = useMemo(
    () => new Map(groups.map((group) => [group.blockId, group])),
    [groups],
  );
  const activeGroup = activeBlockId
    ? groupByBlock.get(activeBlockId) || null
    : null;

  useEffect(() => {
    const active = sourceBlock(articleRef.current, activeBlockId);
    active?.classList.add("is-rin-annotation-target");
    return () => active?.classList.remove("is-rin-annotation-target");
  }, [activeBlockId, articleRef]);

  const updateTrigger = useCallback(
    (block: HTMLElement, preferred?: { x: number; y: number }) => {
      const rect = block.getBoundingClientRect();
      const left = preferred?.x ?? rect.right + 6;
      const top =
        preferred?.y ??
        rect.top + Math.min(Math.max(rect.height / 2, 18), 34) - 22;
      setTriggerPosition({
        left: Math.max(4, Math.min(left, window.innerWidth - 48)),
        top: Math.max(68, Math.min(top, window.innerHeight - 48)),
      });
    },
    [],
  );

  const activateBlock = useCallback(
    (block: HTMLElement, preferred?: { x: number; y: number }) => {
      const id = blockId(block);
      if (!id) return;
      if (hideTimerRef.current !== null)
        window.clearTimeout(hideTimerRef.current);
      setActiveBlockId(id);
      updateTrigger(block, preferred);
    },
    [updateTrigger],
  );

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current !== null)
      window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!menuOpen && !composer) {
        setActiveBlockId("");
        setTriggerPosition(null);
      }
    }, 120);
  }, [composer, menuOpen]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !canInvokeActions) return undefined;
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const block = annotationBlock(event.target, article);
      if (block) activateBlock(block);
      else scheduleHide();
    };
    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!article.contains(event.relatedTarget as Node | null)) scheduleHide();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || hasInteractionPriority(event.target))
        return;
      const block = annotationBlock(event.target, article);
      if (block) activateBlock(block);
    };
    const onFocusIn = (event: FocusEvent) => {
      const block = annotationBlock(event.target, article);
      if (block) activateBlock(block);
    };
    const onContextMenu = (event: MouseEvent) => {
      if (hasInteractionPriority(event.target)) return;
      const block = annotationBlock(event.target, article);
      if (!block) return;
      event.preventDefault();
      activateBlock(block, { x: event.clientX, y: event.clientY });
      setMenuOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.shiftKey && event.key === "F10")) return;
      const focusedBlock =
        annotationBlock(event.target, article) ||
        sourceBlock(article, activeBlockId) ||
        [...article.querySelectorAll<HTMLElement>("[data-rin-block-id]")].find(
          (block) => {
            const rect = block.getBoundingClientRect();
            return rect.bottom > 72 && rect.top < window.innerHeight;
          },
        );
      if (!focusedBlock) return;
      event.preventDefault();
      activateBlock(focusedBlock);
      setMenuOpen(true);
    };
    article.addEventListener("pointerover", onPointerOver);
    article.addEventListener("pointerout", onPointerOut);
    article.addEventListener("pointerdown", onPointerDown);
    article.addEventListener("focusin", onFocusIn);
    article.addEventListener("contextmenu", onContextMenu);
    article.addEventListener("keydown", onKeyDown);
    return () => {
      article.removeEventListener("pointerover", onPointerOver);
      article.removeEventListener("pointerout", onPointerOut);
      article.removeEventListener("pointerdown", onPointerDown);
      article.removeEventListener("focusin", onFocusIn);
      article.removeEventListener("contextmenu", onContextMenu);
      article.removeEventListener("keydown", onKeyDown);
    };
  }, [
    activateBlock,
    activeBlockId,
    articleRef,
    canInvokeActions,
    operational,
    scheduleHide,
  ]);

  const positionRail = useCallback(() => {
    const article = articleRef.current;
    const layer = layerRef.current;
    if (!article || !layer) return;
    const layerRect = layer.getBoundingClientRect();
    const next: Record<string, RailPosition> = {};
    let previousBottom = 0;
    const ids = [
      ...visibleGroups.map((group) => group.blockId),
      ...(composer ? [composer.blockId] : []),
    ]
      .filter((id, index, values) => values.indexOf(id) === index)
      .sort(
        (left, right) =>
          (blockOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (blockOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
      );
    for (const id of ids) {
      const block = sourceBlock(article, id);
      if (!block) continue;
      const blockRect = block.getBoundingClientRect();
      const card = layer.querySelector<HTMLElement>(
        `[data-annotation-block-id="${CSS.escape(id)}"]`,
      );
      const height = card?.offsetHeight || 78;
      const naturalTop = blockRect.top - layerRect.top;
      const top = Math.max(
        naturalTop,
        previousBottom + (previousBottom ? 12 : 0),
      );
      next[id] = {
        top,
        viewportTop: Math.max(
          70,
          Math.min(blockRect.top, window.innerHeight - 48),
        ),
      };
      previousBottom = top + height;
    }
    setPositions(next);
    setRailHeight(Math.max(article.scrollHeight, previousBottom));
  }, [articleRef, blockOrder, composer, visibleGroups]);

  useLayoutEffect(() => {
    positionRail();
  }, [positionRail, activeAnnotationId, comments.length, domVersion]);

  useEffect(() => {
    const onViewport = () => {
      setViewportWidth(window.innerWidth);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(positionRail);
    };
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, { passive: true });
    const observer = new ResizeObserver(onViewport);
    if (articleRef.current) observer.observe(articleRef.current);
    return () => {
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport);
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [articleRef, positionRail]);

  useEffect(() => {
    if (!activeBlockId) return;
    const block = sourceBlock(articleRef.current, activeBlockId);
    if (block) updateTrigger(block);
  }, [activeBlockId, articleRef, domVersion, updateTrigger]);

  useEffect(() => {
    const annotationId = new URLSearchParams(window.location.search).get(
      "annotation",
    );
    if (!annotationId || !operational) return;
    let cancelled = false;
    void loadBookAnnotation(annotationId)
      .then((item) => {
        if (cancelled) return;
        setActiveBlockId(item.blockId);
        setActiveAnnotationId(item.id);
        const block = sourceBlock(articleRef.current, item.blockId);
        block?.scrollIntoView({ block: "center" });
        if (useCenteredDialog) setAnnotationPanelOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [articleRef, operational, pageId, useCenteredDialog]);

  useEffect(() => {
    const group = activeGroup;
    const root =
      group?.items.find((item) => item.id === activeAnnotationId) ||
      (group
        ? preferredItem(group.items.filter((item) => item.kind !== "highlight"))
        : undefined);
    if (!root || (root.kind !== "comment" && root.kind !== "question")) {
      setComments([]);
      return undefined;
    }
    if (!activeAnnotationId) setActiveAnnotationId(root.id);
    let cancelled = false;
    void loadComments({
      targetType: "book_annotation",
      targetId: Number(root.id),
      limit: 40,
      page: 1,
    })
      .then((items) => {
        if (!cancelled) setComments(items);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAnnotationId, activeGroup]);

  const openGroup = useCallback(
    (group: BookAnnotationBlockGroup) => {
      const item = preferredItem(
        group.items.filter((entry) => entry.kind !== "highlight"),
      );
      setActiveBlockId(group.blockId);
      setActiveAnnotationId(item?.id || "");
      setComposer(null);
      setThreadError("");
      sourceBlock(articleRef.current, group.blockId)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      if (useCenteredDialog) setAnnotationPanelOpen(true);
    },
    [articleRef, useCenteredDialog],
  );

  const openComposer = useCallback(
    (
      kind: Exclude<BookAnnotationKind, "highlight">,
      item?: BookAnnotationItem,
    ) => {
      if (!canWrite) {
        setMenuOpen(false);
        requestAuthDialog();
        return;
      }
      if (!activeBlockId) return;
      const key = `${pageId}:${activeBlockId}:${kind}`;
      const draft = draftsRef.current[key];
      setComposer({
        blockId: activeBlockId,
        kind,
        body: item?.body ?? draft?.body ?? "",
        correctionText: item?.correctionText ?? draft?.correctionText ?? "",
        editingId: item?.id,
      });
      setComposerError("");
      setMenuOpen(false);
      if (useCenteredDialog) setAnnotationPanelOpen(true);
    },
    [activeBlockId, canWrite, pageId, useCenteredDialog],
  );

  const closeComposer = useCallback(() => {
    if (composer) {
      draftsRef.current[`${pageId}:${composer.blockId}:${composer.kind}`] = {
        body: composer.body,
        correctionText: composer.correctionText,
      };
    }
    setComposer(null);
    setComposerError("");
    if (!activeGroup) setAnnotationPanelOpen(false);
  }, [activeGroup, composer, pageId]);

  const saveComposer = useCallback(async () => {
    if (!composer) return;
    if (composer.kind !== "erratum" && !composer.body.trim()) {
      setComposerError(
        t("annotations.validation.required", {
          kind: annotationKindLabel(composer.kind, t),
        }),
      );
      return;
    }
    if (composer.kind === "erratum" && !composer.correctionText.trim()) {
      setComposerError(t("annotations.validation.correctionRequired"));
      return;
    }
    setComposerBusy(true);
    setComposerError("");
    try {
      if (composer.editingId) {
        await updateBookAnnotation(composer.editingId, {
          body: composer.body,
          correctionText: composer.correctionText,
        });
      } else {
        await createBookAnnotation(bookRef, pageId, {
          blockId: composer.blockId,
          publicationCommit,
          kind: composer.kind,
          body: composer.body,
          correctionText: composer.correctionText,
          selection: null,
        });
      }
      delete draftsRef.current[
        `${pageId}:${composer.blockId}:${composer.kind}`
      ];
      setComposer(null);
      await refresh();
      if (!useCenteredDialog) setAnnotationPanelOpen(false);
    } catch (error) {
      setComposerError(
        error instanceof BookPublicationConflictError
          ? t("annotations.errors.publicationChanged")
          : t("annotations.errors.submitFailed"),
      );
    } finally {
      setComposerBusy(false);
    }
  }, [
    bookRef,
    composer,
    pageId,
    publicationCommit,
    refresh,
    t,
    useCenteredDialog,
  ]);

  const removeItem = useCallback(
    async (item: BookAnnotationItem) => {
      setThreadError("");
      try {
        await deleteBookAnnotation(item.id);
        setActiveAnnotationId("");
        await refresh();
      } catch (error) {
        setThreadError(t("annotations.errors.deleteFailed"));
      }
    },
    [refresh, t],
  );

  const submitReply = useCallback(async () => {
    if (!activeAnnotationId || !replyBody.trim()) return;
    setReplyBusy(true);
    setThreadError("");
    try {
      await createComment({
        targetType: "book_annotation",
        targetId: Number(activeAnnotationId),
        body: replyBody,
      });
      setReplyBody("");
      const items = await loadComments({
        targetType: "book_annotation",
        targetId: Number(activeAnnotationId),
        limit: 40,
        page: 1,
      });
      setComments(items);
      await refresh();
    } catch (error) {
      setThreadError(t("annotations.errors.replyFailed"));
    } finally {
      setReplyBusy(false);
    }
  }, [activeAnnotationId, refresh, replyBody, t]);

  const renderActiveContent = () => {
    if (composer) {
      return (
        <AnnotationComposer
          composer={composer}
          busy={composerBusy}
          error={composerError}
          onChange={setComposer}
          onCancel={closeComposer}
          onSubmit={() => void saveComposer()}
        />
      );
    }
    if (!activeGroup || !railGroupVisible(activeGroup)) return null;
    return (
      <AnnotationThread
        group={activeGroup}
        selectedId={activeAnnotationId}
        comments={comments}
        replyBody={replyBody}
        replyBusy={replyBusy}
        error={threadError}
        onSelect={setActiveAnnotationId}
        onReplyBody={setReplyBody}
        onReply={() => void submitReply()}
        onEdit={(item) =>
          openComposer(
            item.kind as Exclude<BookAnnotationKind, "highlight">,
            item,
          )
        }
        onDelete={(item) => void removeItem(item)}
      />
    );
  };

  const shouldRenderRail =
    !useCenteredDialog &&
    viewportWidth >= 1440 &&
    (visibleGroups.length > 0 || Boolean(composer));
  const dialogTitle = composer
    ? annotationKindLabel(composer.kind, t)
    : activeGroup
      ? annotationKindLabel(preferredItem(activeGroup.items).kind, t)
      : t("annotations.title");

  return (
    <div
      className="book-annotations-layer"
      data-layout={useCenteredDialog ? "overlay" : "rail"}
      ref={layerRef}
      style={
        { "--book-annotation-rail-height": `${railHeight}px` } as CSSProperties
      }
    >
      {canInvokeActions && activeBlockId && triggerPosition ? (
        <Menu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open && !composer) scheduleHide();
          }}
        >
          <MenuTrigger asChild>
            <Button
              className="book-annotation-cross-trigger"
              type="button"
              variant="ghost"
              style={{ left: triggerPosition.left, top: triggerPosition.top }}
              aria-label={t("annotations.openBlockActions", {
                displayIndex: formatNumber(
                  locale,
                  (blockOrder.get(activeBlockId) ?? 0) + 1,
                ),
              })}
              onPointerEnter={() => {
                if (hideTimerRef.current !== null)
                  window.clearTimeout(hideTimerRef.current);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== "touch") scheduleHide();
              }}
            >
              <AnimateCross animateOnHover animateOnTap size={16} />
            </Button>
          </MenuTrigger>
          <MenuContent
            side="right"
            align="start"
            sideOffset={8}
            aria-label={t("annotations.blockActions")}
          >
            <MenuItem onSelect={() => openComposer("note")}>
              {t("annotations.kinds.note")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => openComposer("comment")}>
              {t("annotations.kinds.comment")}
            </MenuItem>
            <MenuItem onSelect={() => openComposer("question")}>
              {t("annotations.kinds.question")}
            </MenuItem>
            <MenuItem
              onSelect={() => openComposer("erratum")}
              disabled={
                hasSession
                  ? !capabilities.erratumSync
                  : !capabilities.erratumSyncAvailable
              }
            >
              {t("annotations.kinds.erratum")}
            </MenuItem>
          </MenuContent>
        </Menu>
      ) : null}

      {shouldRenderRail ? (
        <aside
          className="book-annotation-margin-rail"
          aria-label={t("annotations.bodyAnnotations")}
        >
          {visibleGroups.map((group) => (
            <div
              className={`book-annotation-margin-group${activeBlockId === group.blockId ? " is-active" : ""}`}
              data-annotation-block-id={group.blockId}
              style={{ top: positions[group.blockId]?.top || 0 }}
              key={group.blockId}
            >
              {activeBlockId === group.blockId ? (
                renderActiveContent()
              ) : (
                <BlockGroupSummary
                  group={group}
                  onOpen={() => openGroup(group)}
                />
              )}
            </div>
          ))}
          {composer && !groupByBlock.has(composer.blockId) ? (
            <div
              className="book-annotation-margin-group is-active"
              data-annotation-block-id={composer.blockId}
              style={{ top: positions[composer.blockId]?.top || 0 }}
            >
              {renderActiveContent()}
            </div>
          ) : null}
        </aside>
      ) : null}

      {!shouldRenderRail
        ? visibleGroups.map((group) => (
            <Button
              className="book-annotation-narrow-marker"
              type="button"
              variant="ghost"
              style={{ top: positions[group.blockId]?.viewportTop || 72 }}
              aria-label={t("annotations.openBlockAnnotations", {
                displayIndex: formatNumber(
                  locale,
                  (blockOrder.get(group.blockId) ?? 0) + 1,
                ),
              })}
              onClick={() => openGroup(group)}
              key={group.blockId}
            >
              {group.items.reduce(
                (total, item) => total + (item.kind === "highlight" ? 0 : 1),
                0,
              )}
            </Button>
          ))
        : null}

      {useCenteredDialog && (composer || activeGroup) ? (
        <Dialog
          open={annotationPanelOpen}
          onOpenChange={setAnnotationPanelOpen}
        >
          <DialogContent
            title={dialogTitle}
            className="book-annotation-dialog"
          >
            {renderActiveContent()}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

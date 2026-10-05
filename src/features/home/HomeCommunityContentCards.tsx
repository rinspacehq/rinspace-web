import {
  AnimateButton,
  AnimateTabs,
  AnimateTabsList,
  AnimateTabsTrigger,
  Dialog,
  DialogContent,
  Icon,
  Sheet,
  SheetContent,
  Tooltip,
} from "@/components/ui";
import AvatarName from "@/components/AvatarName";
import CardActionButton, { CardActionIcon } from "@/components/CardActionButton";
import LoadingState from "@/components/LoadingState";
import UserIdentity from "@/components/UserIdentity";
import { formatDate, formatNumber } from "@/i18n/format";
import { i18n as appI18n } from "@/i18n";
import { useResolvedLocale } from "@/i18n/LanguageProvider";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import {
  ContentCommentMoreMenu,
  ContentCommentThreadList,
  ContentCommentVotes,
  groupContentCommentThreads,
  type ContentCommentMenuAction,
} from "@/features/comments/ContentCommentThreadList";
import { ReportDialog } from "@/features/reporting";
import {
  createComment,
  deleteComment,
  loadComments,
  postAnswerStyleVote,
  updateComment,
} from "@/services/domains/discussion";
import { loadBookReviews, submitBookReview } from "@/services/domains/book";
import { uploadAnswerFile } from "@/services/domains/publication";
import { messageFromError } from "@/services/errors";
import { subscribeToMediaQuery } from "@/utils/mediaQuery";
import type {
  BookRatingSummary,
  BookReview,
  CommentSummary,
  FeedItem,
} from "@/services/contracts";
import {
  type ChangeEvent,
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
const CodeMirrorEditor = lazy(() => import("@/components/CodeMirrorEditor"));
const MathText = lazy(() => import("@/components/MathText"));
const RinStickerPicker = lazy(() => import("@/components/RinStickerPicker"));

const commentPageSize = 12;
const commentPageCache = new Map<string, Map<number, CommentSummary[]>>();

export { CardActionButton };
const CommunityActionIcon = CardActionIcon;

function useMobileOverlay() {
  const query = "(max-width: 640px)";
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMobile(media.matches);
    update();
    return subscribeToMediaQuery(media, update);
  }, []);
  return mobile;
}

function exactDateParts(value: string | undefined, locale: "zh-CN" | "en") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(locale, date, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function compactDateParts(value: string | undefined, locale: "zh-CN" | "en") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(locale, date, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function contentTimePresentation(
  item: Pick<FeedItem, "publishedAt" | "contentUpdatedAt" | "createdAt">,
  locale: "zh-CN" | "en" = "zh-CN",
) {
  const t = appI18n.getFixedT(locale, "discovery");
  const publishedAt = item.publishedAt || item.createdAt || "";
  const contentUpdatedAt = item.contentUpdatedAt || publishedAt;
  const publishedTime = publishedAt ? new Date(publishedAt).getTime() : 0;
  const updatedTime = contentUpdatedAt
    ? new Date(contentUpdatedAt).getTime()
    : 0;
  const updated = Boolean(
    publishedTime && updatedTime && updatedTime - publishedTime >= 60_000,
  );
  const visibleAt = updated ? contentUpdatedAt : publishedAt;
  return {
    dateTime: visibleAt,
    label: compactDateParts(visibleAt, locale) || t("home.time.unknown"),
    detail: [
      publishedAt
        ? t("home.time.published", { time: exactDateParts(publishedAt, locale) })
        : "",
      updated && contentUpdatedAt
        ? t("home.time.updated", { time: exactDateParts(contentUpdatedAt, locale) })
        : "",
    ]
      .filter(Boolean)
      .join("；"),
  };
}

export function CardExactTime({ item }: { item: FeedItem }) {
  const resolvedLocale = useResolvedLocale();
  const presentation = contentTimePresentation(item, resolvedLocale);
  const node = (
    <time
      className="home-card-exact-time"
      dateTime={presentation.dateTime || undefined}
      aria-label={presentation.detail || presentation.label}
    >
      {presentation.label}
    </time>
  );
  return presentation.detail ? (
    <Tooltip content={presentation.detail}>{node}</Tooltip>
  ) : (
    node
  );
}

function ResponsiveOverlay({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const mobile = useMobileOverlay();
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          title={title}
          description={description}
          headerActions={headerActions}
          className="home-community-overlay home-community-sheet"
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        headerActions={headerActions}
        className="home-community-overlay home-community-dialog"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export const groupCommentThreads = groupContentCommentThreads;

export type HomeCommentViewer = {
  id?: string;
  username?: string;
  name: string;
  imageUrl?: string;
  rank?: number;
};

function normalizedIdentity(value?: string) {
  return (value || "").trim().toLocaleLowerCase();
}

function sameCommentIdentity(
  left: Array<string | undefined>,
  right: Array<string | undefined>,
) {
  const leftValues = new Set(left.map(normalizedIdentity).filter(Boolean));
  return right.some((value) => leftValues.has(normalizedIdentity(value)));
}

function invalidateCommentTargetCache(target: FeedItem) {
  const prefix = `${target.type}:${target.id}:`;
  Array.from(commentPageCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) commentPageCache.delete(key);
  });
}

function commentImageMarkdown(url: string, filename: string, fallbackLabel: string) {
  const fallbackAlt = filename.replace(/\.[^.]+$/, "").trim() || fallbackLabel;
  const alt = fallbackAlt.replace(/[\[\]\r\n]+/g, " ").trim() || fallbackLabel;
  return `![${alt}](${url})`;
}

function targetCommentRef(item: FeedItem) {
  const targetId = Number(item.id);
  return Number.isInteger(targetId) && targetId > 0
    ? { targetId }
    : { slug: item.id };
}

function targetCommentType(item: FeedItem) {
  if (item.type === "announcement" || item.type === "forum")
    return "discussion" as const;
  if (item.type === "status") return "dynamic" as const;
  if (item.type === "book") return "post" as const;
  if (item.type === "task" || item.type === "tag") return "post" as const;
  return item.type;
}

export function ContentCommentDialog({
  target,
  canWrite,
  viewer,
  onOpenChange,
  onChanged,
  onMessage,
}: {
  target: FeedItem | null;
  canWrite: boolean;
  viewer?: HomeCommentViewer;
  onOpenChange: (open: boolean) => void;
  onChanged: (commentCount: number) => void | Promise<void>;
  onMessage: (kind: "error" | "status", message: string) => void;
}) {
  const { t } = useFeatureTranslation("discovery");
  const resolvedLocale = useResolvedLocale();
  const [order, setOrder] = useState<"hot" | "newest">("hot");
  const [items, setItems] = useState<CommentSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<{
    item: CommentSummary;
    rootId: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [voteBusyId, setVoteBusyId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<CommentSummary | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Set<number>>(
    () => new Set(),
  );
  const draftCache = useRef(new Map<string, string>());
  const activeTargetKey = useRef("");

  const cacheKey = target ? `${target.type}:${target.id}:${order}` : "";
  const draftKey = target ? `${targetCommentType(target)}:${target.id}` : "";
  const updateBody = useCallback(
    (next: string | ((current: string) => string)) => {
      setBody((current) => {
        const value = typeof next === "function" ? next(current) : next;
        if (draftKey) draftCache.current.set(draftKey, value);
        return value;
      });
    },
    [draftKey],
  );
  const loadPage = useCallback(
    async (nextPage: number, force = false) => {
      if (!target) return;
      const cachedPages = commentPageCache.get(cacheKey);
      const cached = force ? undefined : cachedPages?.get(nextPage);
      setLoading(true);
      setLoadError("");
      try {
        const next =
          cached ||
          (await loadComments({
            targetType: targetCommentType(target),
            ...targetCommentRef(target),
            order,
            threaded: true,
            limit: commentPageSize,
            page: nextPage,
          }));
        const nextCache = cachedPages || new Map<number, CommentSummary[]>();
        nextCache.set(nextPage, next);
        commentPageCache.set(cacheKey, nextCache);
        setItems((current) => {
          const base = nextPage === 1 ? [] : current;
          return Array.from(
            new Map([...base, ...next].map((item) => [item.id, item])).values(),
          );
        });
        setPage(nextPage);
        setHasMore(
          next.filter((item) => !item.parentId).length >= commentPageSize,
        );
      } catch (error) {
        setLoadError(messageFromError(error, "comments.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, order, target],
  );

  useEffect(() => {
    if (!target) {
      activeTargetKey.current = "";
      return;
    }
    const targetChanged = activeTargetKey.current !== draftKey;
    activeTargetKey.current = draftKey;
    setItems([]);
    setPage(1);
    if (targetChanged) {
      setReplyTarget(null);
      setBody(draftCache.current.get(draftKey) || "");
      setCommentCount(target.commentCount ?? 0);
      setEditingCommentId(null);
      setEditBody("");
      setDeleteConfirmId(null);
      setReportTarget(null);
      setExpandedRoots(new Set());
    }
    void loadPage(1);
  }, [draftKey, loadPage, target]);

  const threads = useMemo(() => groupCommentThreads(items), [items]);

  const submit = async () => {
    if (
      !target ||
      !canWrite ||
      body.trim().length < 2 ||
      body.trim().length > 5000
    )
      return;
    setBusy(true);
    try {
      const rootID = replyTarget?.rootId;
      await createComment({
        targetType: targetCommentType(target),
        ...targetCommentRef(target),
        body: body.trim(),
        parentId: rootID,
        replyToCommentId: replyTarget?.item.id,
      });
      invalidateCommentTargetCache(target);
      draftCache.current.delete(draftKey);
      setBody("");
      setReplyTarget(null);
      const nextCommentCount = commentCount + 1;
      setCommentCount(nextCommentCount);
      await loadPage(1, true);
      await onChanged(nextCommentCount);
      onMessage("status", t("home.comments.status.created", { title: target.title }));
    } catch (error) {
      onMessage("error", messageFromError(error, "comments.publishFailed"));
    } finally {
      setBusy(false);
    }
  };

  const vote = async (item: CommentSummary, type: "up" | "down") => {
    if (!canWrite) return;
    const isCancel = item.viewerVoteStatus === type;
    setVoteBusyId(item.id);
    try {
      const result = await postAnswerStyleVote({
        objectId: item.id,
        objectType: "comment",
        type,
        isCancel,
      });
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                upVoteCount: result.up_votes,
                downVoteCount: result.down_votes,
                voteCount: result.votes,
                viewerVoteStatus:
                  result.vote_status === "up" || result.vote_status === "down"
                    ? result.vote_status
                    : "none",
              }
            : candidate,
        ),
      );
    } catch (error) {
      onMessage("error", messageFromError(error, "comments.voteFailed"));
    } finally {
      setVoteBusyId(null);
    }
  };

  const canManageComment = (item: CommentSummary) =>
    Boolean(
      viewer &&
        sameCommentIdentity(
          [viewer.id, viewer.username, viewer.name],
          [item.authorId, item.authorUid, item.author],
        ),
    );

  const isContentAuthor = (item: CommentSummary) =>
    Boolean(
      target &&
        sameCommentIdentity(
          [target.authorId, target.authorUid, target.author],
          [item.authorId, item.authorUid, item.author],
        ),
    );

  const saveEdit = async (item: CommentSummary) => {
    const content = editBody.trim();
    if (!content || content.length > 5000) return;
    setBusy(true);
    try {
      const updated = await updateComment({ commentId: item.id, body: content });
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
      if (target) invalidateCommentTargetCache(target);
      setEditingCommentId(null);
      setEditBody("");
      onMessage("status", t("home.comments.status.updated"));
    } catch (error) {
      onMessage("error", messageFromError(error, "comments.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: CommentSummary) => {
    if (deleteConfirmId !== item.id) {
      setDeleteConfirmId(item.id);
      onMessage("status", t("home.comments.status.confirmDelete"));
      return;
    }
    setBusy(true);
    try {
      await deleteComment(item.id);
      if (target) invalidateCommentTargetCache(target);
      setDeleteConfirmId(null);
      setEditingCommentId(null);
      const nextCommentCount = Math.max(0, commentCount - 1);
      setCommentCount(nextCommentCount);
      await loadPage(1, true);
      await onChanged(nextCommentCount);
      onMessage("status", t("home.comments.status.deleted"));
    } catch (error) {
      onMessage("error", messageFromError(error, "comments.deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const menuActions = (item: CommentSummary): ContentCommentMenuAction[] => [
    ...(canManageComment(item)
      ? [
          {
            key: "edit",
            label: t("home.comments.edit"),
            disabled: busy,
            onSelect: () => {
              setEditingCommentId(item.id);
              setEditBody(item.body);
              setDeleteConfirmId(null);
            },
          },
          {
            key: "delete",
            label: deleteConfirmId === item.id
              ? t("home.comments.confirmDelete")
              : t("home.comments.delete"),
            disabled: busy,
            dangerous: true,
            onSelect: () => void remove(item),
          },
        ]
      : []),
    {
      key: "report",
      label: t("home.comments.report"),
      onSelect: () => {
        if (!canWrite) {
          onMessage("error", appI18n.t("errors:comments.signInToReport"));
          return;
        }
        setReportTarget(item);
      },
    },
  ];

  const uploadImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!files.length || !canWrite) return;
    const invalid = files.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      onMessage("error", appI18n.t("errors:comments.imageOnly"));
      return;
    }
    const oversized = files.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      onMessage("error", appI18n.t("errors:comments.imageTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const markdown: string[] = [];
      for (const file of files.slice(0, 9)) {
        const url = await uploadAnswerFile("post", file);
        markdown.push(commentImageMarkdown(url, file.name, t("home.comments.imageAlt")));
      }
      updateBody((current) =>
        [current.trimEnd(), markdown.join("\n\n")].filter(Boolean).join("\n\n"),
      );
    } catch (error) {
      onMessage("error", messageFromError(error, "comments.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <ResponsiveOverlay
        open={Boolean(target)}
        onOpenChange={onOpenChange}
        title={
          <span className="home-overlay-title">
            {t("home.comments.title")}
            <small>{formatNumber(resolvedLocale, commentCount)}</small>
          </span>
        }
        description={target?.title}
        headerActions={
          <AnimateTabs
            value={order}
            onValueChange={(value) => {
              if (value === "hot" || value === "newest") setOrder(value);
            }}
          >
            <AnimateTabsList aria-label={t("home.comments.sort")} className="home-overlay-tabs">
              <AnimateTabsTrigger value="hot">{t("home.comments.hot")}</AnimateTabsTrigger>
              <AnimateTabsTrigger value="newest">{t("home.comments.newest")}</AnimateTabsTrigger>
            </AnimateTabsList>
          </AnimateTabs>
        }
      >
        <div className="home-overlay-layout">
          <div className="home-comment-list" aria-live="polite">
            {loading && !items.length ? <LoadingState variant="compact" /> : null}
            {loadError ? (
              <div className="home-overlay-state">
                <p>{loadError}</p>
                <AnimateButton
                  type="button"
                  onClick={() => void loadPage(page, true)}
                >
                  {t("home.comments.retry")}
                </AnimateButton>
              </div>
            ) : null}
            {!loading && !loadError ? (
              <ContentCommentThreadList
                threads={threads}
                canReply={canWrite && !busy}
                resolveIdentity={(item) => ({
                  userId: item.authorId || item.authorUid || item.author,
                  imageUrl: item.authorAvatar,
                  rank: item.authorRank,
                })}
                isAuthor={isContentAuthor}
                isEditing={(item) => editingCommentId === item.id}
                renderEditForm={(item) => (
                  <form
                    className="comment-edit-form content-comment-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveEdit(item);
                    }}
                  >
                    <Suspense fallback={null}>
                      <CodeMirrorEditor
                        id={`home-comment-edit-${item.id}`}
                        value={editBody}
                        minHeight="96px"
                        ariaLabel={`${t("home.comments.edit")} ${formatNumber(resolvedLocale, item.id)}`}
                        placeholder=""
                        preferPlainTextPaste
                        showLineNumbers={false}
                        submitOnEnter={false}
                        onChange={setEditBody}
                      />
                    </Suspense>
                    <div className="comment-form-actions">
                      <div className="comment-form-tools">
                        {editBody.trim().length >= 4000 ? (
                          <span>{editBody.trim().length} / 5000</span>
                        ) : null}
                      </div>
                      <AnimateButton
                        unstyled
                        type="button"
                        className="content-comment-cancel"
                        disabled={busy}
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditBody("");
                        }}
                      >
                        {t("home.comments.cancel")}
                      </AnimateButton>
                      <AnimateButton
                        type="submit"
                        disabled={
                          busy ||
                          editBody.trim().length < 2 ||
                          editBody.trim().length > 5000
                        }
                      >
                        {busy ? t("home.comments.saving") : t("home.comments.save")}
                      </AnimateButton>
                    </div>
                  </form>
                )}
                renderMoreMenu={(item) => (
                  <ContentCommentMoreMenu actions={menuActions(item)} />
                )}
                renderVotes={(item) => (
                  <ContentCommentVotes
                    upCount={item.upVoteCount}
                    downCount={item.downVoteCount}
                    status={item.viewerVoteStatus}
                    disabled={!canWrite || voteBusyId === item.id}
                    onVote={(direction) => void vote(item, direction)}
                  />
                )}
                isRepliesExpanded={(rootId) => expandedRoots.has(rootId)}
                onToggleReplies={(rootId) =>
                  setExpandedRoots((current) => {
                    const next = new Set(current);
                    if (next.has(rootId)) next.delete(rootId);
                    else next.add(rootId);
                    return next;
                  })
                }
                onReply={(item, rootId) =>
                  setReplyTarget({ item, rootId })
                }
                emptyLabel={t("home.comments.empty")}
              />
            ) : null}
            {hasMore ? (
              <AnimateButton
                type="button"
                className="home-comment-load-more"
                disabled={loading}
                onClick={() => void loadPage(page + 1)}
              >
                {loading ? t("home.comments.loading") : t("home.comments.loadMore")}
              </AnimateButton>
            ) : null}
          </div>

          {canWrite ? (
            <form
              className="content-comment-composer home-overlay-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {replyTarget ? (
                <div className="home-comment-replying">
                  {t("home.comments.replying", { author: replyTarget.item.author })}
                  <AnimateButton
                    unstyled
                    type="button"
                    onClick={() => setReplyTarget(null)}
                  >
                    {t("home.comments.cancelReply")}
                  </AnimateButton>
                </div>
              ) : null}
              <div className="comment-avatar-composer-row">
                <AvatarName
                  name={viewer?.name || t("home.comments.viewer")}
                  imageUrl={viewer?.imageUrl}
                  rank={viewer?.rank}
                  size="md"
                />
                <div className="comment-avatar-composer-main">
                  <Suspense fallback={null}>
                    <CodeMirrorEditor
                      id={`home-comment-dialog-${target?.id || "content"}`}
                      value={body}
                      minHeight="88px"
                      ariaLabel={
                        replyTarget
                          ? t("home.comments.replyLabel", { author: replyTarget.item.author })
                          : t("home.comments.contentLabel")
                      }
                      placeholder=""
                      preferPlainTextPaste
                      showLineNumbers={false}
                      submitOnEnter={false}
                      onChange={updateBody}
                    />
                  </Suspense>
                </div>
              </div>
              <div className="comment-form-actions">
                <div className="comment-form-tools">
                  {body.trim().length >= 4000 ? (
                    <span>{body.trim().length} / 5000</span>
                  ) : null}
                  <Suspense fallback={null}>
                    <RinStickerPicker
                      disabled={busy || uploading}
                      onSelect={(sticker) => {
                        void import("@/utils/rinStickers").then(
                          ({ appendRinStickerToken }) =>
                            updateBody((current) =>
                              appendRinStickerToken(current, sticker.token),
                            ),
                        );
                      }}
                    />
                  </Suspense>
                  <label
                    className={
                      busy || uploading
                        ? "comment-image-button disabled"
                        : "comment-image-button"
                    }
                    htmlFor={`home-comment-image-${target?.id || "content"}`}
                  >
                    <CommunityActionIcon name="image" />
                    {uploading ? t("home.comments.uploading") : t("home.comments.image")}
                  </label>
                  <input
                    id={`home-comment-image-${target?.id || "content"}`}
                    className="comment-image-input"
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={busy || uploading}
                    onChange={(event) => void uploadImages(event)}
                  />
                </div>
                <AnimateButton
                  type="submit"
                  disabled={
                    busy ||
                    uploading ||
                    body.trim().length < 2 ||
                    body.trim().length > 5000
                  }
                >
                  {busy ? t("home.comments.publishing") : t("home.comments.publish")}
                </AnimateButton>
              </div>
            </form>
          ) : (
            <div className="content-comment-login home-overlay-login">
              <Link to="/#login">{t("home.comments.signIn")}</Link>
            </div>
          )}
        </div>
      </ResponsiveOverlay>

      <ReportDialog
        target={
          reportTarget
            ? {
                targetType: "comment",
                objectId: reportTarget.id,
                title: reportTarget.body.slice(0, 96),
              }
            : null
        }
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
        onSubmitted={() => onMessage("status", t("home.comments.status.reportSubmitted"))}
      />
    </>
  );
}

function scoreFromPointer(
  event: { clientX: number; currentTarget: HTMLButtonElement },
  star: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 1;
  return Math.max(1, Math.min(10, (star - 1) * 2 + (ratio <= 0.5 ? 1 : 2)));
}

function BookScorePicker({
  score,
  onChange,
}: {
  score: number;
  onChange: (score: number) => void;
}) {
  const { t } = useFeatureTranslation("discovery");
  const resolvedLocale = useResolvedLocale();
  const [hoverScore, setHoverScore] = useState(0);
  const preview = hoverScore || score;
  return (
    <div className="book-score-picker" onPointerLeave={() => setHoverScore(0)}>
      <div className="book-score-stars" aria-label={t("home.rating.picker")}>
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, (preview - (star - 1) * 2) / 2));
          return (
            <AnimateButton
              unstyled
              type="button"
              className={fill > 0 ? "active" : ""}
              key={star}
              aria-label={t("home.rating.points", { score: formatNumber(resolvedLocale, star * 2) })}
              title={t("home.rating.points", { score: formatNumber(resolvedLocale, star * 2) })}
              onClick={(event) => onChange(scoreFromPointer(event, star))}
              onPointerMove={(event) =>
                setHoverScore(scoreFromPointer(event, star))
              }
            >
              <span className="book-score-star-base" aria-hidden="true">
                ★
              </span>
              <span
                className="book-score-star-fill"
                aria-hidden="true"
                style={{ width: `${fill * 100}%` }}
              >
                ★
              </span>
            </AnimateButton>
          );
        })}
      </div>
      <strong>{t("home.rating.points", { score: formatNumber(resolvedLocale, preview) })}</strong>
    </div>
  );
}

function BookReviewEntry({
  review,
  canWrite,
  onVote,
}: {
  review: BookReview;
  canWrite: boolean;
  onVote: (review: BookReview, direction: "up" | "down") => void;
}) {
  const { t } = useFeatureTranslation("discovery");
  const resolvedLocale = useResolvedLocale();
  return (
    <article>
      <UserIdentity
        className="book-review-author"
        name={review.author}
        userId={review.authorId || review.author}
        imageUrl={review.authorAvatar}
        size="sm"
      />
      <div className="book-review-main">
        <div className="book-review-meta">
          <strong>
            {t("home.rating.scoreAndStars", {
              score: formatNumber(resolvedLocale, review.score),
              stars: "★".repeat(Math.max(1, Math.round(review.stars))),
            })}
          </strong>
          <span>{exactDateParts(review.updatedAt, resolvedLocale)}</span>
        </div>
        {review.body ? (
          <Suspense fallback={null}>
            <MathText text={review.body} />
          </Suspense>
        ) : (
          <p>{t("home.rating.onlyScore")}</p>
        )}
        <div className="book-review-actions">
          <AnimateButton
            unstyled
            type="button"
            className={review.voteStatus === "up" ? "active" : ""}
            disabled={!canWrite}
            aria-label={t("home.rating.helpfulLabel", { count: review.voteCount })}
            onClick={() => onVote(review, "up")}
          >
            <Icon name="hand-thumbs-up" />
            <span>{review.voteCount > 0
              ? formatNumber(resolvedLocale, review.voteCount)
              : t("home.rating.helpful")}</span>
          </AnimateButton>
          <AnimateButton
            unstyled
            type="button"
            className={review.voteStatus === "down" ? "active down" : ""}
            disabled={!canWrite}
            aria-label={t("home.rating.notHelpfulLabel")}
            onClick={() => onVote(review, "down")}
          >
            <Icon name="hand-thumbs-down" />
            <span>{t("home.rating.notHelpful")}</span>
          </AnimateButton>
        </div>
      </div>
    </article>
  );
}

export function BookRatingDialog({
  target,
  canWrite,
  onOpenChange,
  onRatingChanged,
  onMessage,
}: {
  target: FeedItem | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onRatingChanged: (rating: BookRatingSummary) => void | Promise<void>;
  onMessage: (kind: "error" | "status", message: string) => void;
}) {
  const { t } = useFeatureTranslation("discovery");
  const resolvedLocale = useResolvedLocale();
  const [order, setOrder] = useState<"hot" | "newest">("hot");
  const [reviews, setReviews] = useState<BookReview[]>([]);
  const [rating, setRating] = useState<BookRatingSummary | null>(null);
  const [score, setScore] = useState(10);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await loadBookReviews(
        target.id,
        order === "hot" ? "hot" : "desc",
      );
      setReviews(response.items);
      setRating(response.rating);
      setScore(response.rating.myReview?.score || 10);
      setBody(response.rating.myReview?.body || "");
    } catch (error) {
      setLoadError(messageFromError(error, "rating.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [order, target]);

  useEffect(() => {
    if (target) void load();
  }, [load, target]);

  useEffect(() => {
    setEditing(false);
  }, [target?.id]);

  const submit = async () => {
    if (!target || !canWrite || body.trim().length > 4000) return;
    setBusy(true);
    try {
      const nextRating = await submitBookReview(target.id, {
        score,
        body: body.trim(),
      });
      setRating(nextRating);
      await onRatingChanged(nextRating);
      await load();
      setEditing(false);
      onMessage("status", t("home.rating.statusSubmitted", { title: target.title }));
    } catch (error) {
      onMessage("error", messageFromError(error, "rating.submitFailed"));
    } finally {
      setBusy(false);
    }
  };

  const vote = async (review: BookReview, direction: "up" | "down") => {
    if (!canWrite) return;
    try {
      const result = await postAnswerStyleVote({
        objectId: review.id,
        objectType: "book_review",
        type: direction,
        isCancel: review.voteStatus === direction,
      });
      setReviews((current) =>
        current.map((candidate) =>
          candidate.id === review.id
            ? {
                ...candidate,
                voteCount: result.votes,
                voteStatus: result.vote_status,
              }
            : candidate,
        ),
      );
    } catch (error) {
      onMessage("error", messageFromError(error, "rating.voteFailed"));
    }
  };

  const summary = rating || target?.bookRating;
  const myReview = summary?.myReview;
  const shouldShowForm = canWrite && (!myReview || editing);
  return (
    <ResponsiveOverlay
      open={Boolean(target)}
      onOpenChange={onOpenChange}
      title={t("home.rating.title")}
      description={target?.title}
    >
      <div className="home-overlay-layout home-rating-layout">
        <div className="home-rating-scroll">
          {loading && !summary ? <LoadingState variant="compact" /> : null}
          {loadError ? (
            <div className="home-overlay-state">
              <p>{loadError}</p>
              <AnimateButton onClick={() => void load()}>{t("home.rating.retry")}</AnimateButton>
            </div>
          ) : null}
          {summary ? (
            <section
              className="book-rating-stats-panel home-rating-overview"
              aria-label={t("home.rating.summary")}
            >
              <div className="book-rating-stats-score">
                <strong>{formatNumber(resolvedLocale, summary.averageScore, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}</strong>
                <span>{t("home.rating.stars", {
                  stars: formatNumber(resolvedLocale, summary.averageScore / 2, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
                })}</span>
                <em>{t("home.rating.reviewerCount", {
                  count: summary.reviewCount,
                  displayCount: formatNumber(resolvedLocale, summary.reviewCount),
                })}</em>
              </div>
              <div className="book-rating-bars">
                {(summary.breakdown.length
                  ? summary.breakdown
                  : Array.from({ length: 10 }, (_, index) => ({
                      score: 10 - index,
                      stars: (10 - index) / 2,
                      count: 0,
                      percent: 0,
                    }))
                ).map((part) => (
                  <div className="book-rating-bar-row" key={part.score}>
                    <span>
                      {t("home.rating.star", {
                        stars: formatNumber(resolvedLocale, part.stars, {
                          maximumFractionDigits: 1,
                        }),
                      })}
                    </span>
                    <i aria-hidden="true">
                      <b
                        style={{
                          width: `${Math.max(0, Math.min(100, part.percent))}%`,
                        }}
                      />
                    </i>
                    <em>{formatNumber(resolvedLocale, part.percent / 100, {
                      style: "percent",
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}</em>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {myReview && !editing ? (
            <section className="book-my-review">
              <div>
                <span>{t("home.rating.myReview")}</span>
                <strong>
                  {t("home.rating.scoreAndStars", {
                    score: formatNumber(resolvedLocale, myReview.score),
                    stars: "★".repeat(Math.max(1, Math.round(myReview.stars))),
                  })}
                </strong>
                {myReview.body ? (
                  <Suspense fallback={null}>
                    <MathText text={myReview.body} />
                  </Suspense>
                ) : (
                  <p>{t("home.rating.onlyScore")}</p>
                )}
              </div>
              {canWrite ? (
                <AnimateButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setScore(myReview.score);
                    setBody(myReview.body);
                    setEditing(true);
                  }}
                >
                  {t("home.rating.edit")}
                </AnimateButton>
              ) : null}
            </section>
          ) : null}

          {shouldShowForm ? (
            <form
              className="book-review-form home-rating-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <BookScorePicker score={score} onChange={setScore} />
              <div className="book-review-editor">
                <div className="comment-form-tools">
                  <Suspense fallback={null}>
                    <RinStickerPicker
                      disabled={busy}
                      onSelect={(sticker) => {
                        void import("@/utils/rinStickers").then(
                          ({ appendRinStickerToken }) =>
                            setBody((current) =>
                              appendRinStickerToken(current, sticker.token),
                            ),
                        );
                      }}
                    />
                  </Suspense>
                </div>
                <Suspense fallback={null}>
                  <CodeMirrorEditor
                    id={`home-book-review-dialog-${target?.id || "book"}`}
                    value={body}
                    minHeight="110px"
                    ariaLabel={t("home.rating.editor")}
                    onChange={setBody}
                  />
                </Suspense>
              </div>
              <div className="book-review-form-actions">
                <span>{formatNumber(resolvedLocale, body.trim().length)} / {formatNumber(resolvedLocale, 4000)}</span>
                {myReview ? (
                  <AnimateButton
                    variant="ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setScore(myReview.score);
                      setBody(myReview.body);
                      setEditing(false);
                    }}
                  >
                    {t("home.rating.cancel")}
                  </AnimateButton>
                ) : null}
                <AnimateButton
                  variant="primary"
                  type="submit"
                  disabled={busy || body.trim().length > 4000}
                >
                  {busy
                    ? t("home.rating.submitting")
                    : summary?.myReview
                      ? t("home.rating.save")
                      : t("home.rating.submit")}
                </AnimateButton>
              </div>
            </form>
          ) : null}

          <section className="home-book-review-list book-review-card">
            <header className="home-review-heading">
              <div>
                <strong>{t("home.rating.reviews")}</strong>
                <span>{t("home.rating.reviewCount", {
                  count: summary?.reviewCount ?? reviews.length,
                  displayCount: formatNumber(resolvedLocale, summary?.reviewCount ?? reviews.length),
                })}</span>
              </div>
              <div className="book-review-heading-tools">
                <AnimateTabs
                  value={order}
                  onValueChange={(value) => {
                    if (value === "hot" || value === "newest") setOrder(value);
                  }}
                >
                  <AnimateTabsList
                    className="book-review-sort-tabs"
                    aria-label={t("home.rating.sort")}
                  >
                    <AnimateTabsTrigger value="hot">{t("home.rating.hot")}</AnimateTabsTrigger>
                    <AnimateTabsTrigger value="newest">{t("home.rating.newest")}</AnimateTabsTrigger>
                  </AnimateTabsList>
                </AnimateTabs>
              </div>
            </header>
            <div className="book-review-list">
              {reviews.map((review) => (
                <BookReviewEntry
                  key={review.id}
                  review={review}
                  canWrite={canWrite}
                  onVote={vote}
                />
              ))}
              {!loading && !reviews.length ? (
                <div className="home-overlay-state">{t("home.rating.empty")}</div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </ResponsiveOverlay>
  );
}

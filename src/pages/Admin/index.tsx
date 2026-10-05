import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Pagination,
  SegmentedControl,
  Select,
  Surface,
  Tabs,
  TabsList,
  TabsTrigger,
  useNoticeToasts,
} from "components/ui";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";

import SiteTopbar from "@/components/SiteTopbarShell";
import AvatarName from "@/components/AvatarName";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import LoadingState from "@/components/LoadingState";
import {
  AdminHomeView,
  AdminWorkspaceShell,
  WalletRefundsView,
  WalletRiskView,
  ReviewWorkbench,
  SystemOperationsView,
  adminContentSectionSearchParams,
  adminReviewSearchParams,
  adminSystemSectionSearchParams,
  adminWorkspaceViewSearchParams,
  firstAllowedAdminView,
  parseAdminWorkspaceQuery,
  useAdminWorkspaceAccess,
  adminContentKindLabel,
  adminPermissionRuleDescription,
  adminPermissionRuleLabel,
  adminStatusLabel,
  adminUserRoleLabel,
  type AdminTranslation,
  type AdminContentSection,
  type AdminView,
} from "@/features/admin-workspace";
import { identityCultivationRealmLabel } from "@/features/identity/labels";
import { localizedErrorMessage } from "@/i18n/errors";
import { formatDate, formatNumber } from "@/i18n/format";
import { useResolvedLocale } from "@/i18n/LanguageProvider";
import type { LocaleId } from "@/i18n/types";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import { MathInline } from "@/components/MathText";
import TagPicker from "@/components/TagPicker";
import {
  adminDeleteContent,
  adminUpdateContentTags,
  adminUpdateContentStatus,
  adminUpdateAnswerStatus,
  adminUpdateQuestionStatus,
  adminUpdateUserStatus,
  loadAdminAnswerPage,
  loadAdminContentPage,
  loadAdminQuestionPage,
  loadAdminUserPage,
} from "@/services/domains/admin";
import {
  loadCultivationPermissions,
  updateCultivationPermissions,
} from "@/services/domains/group";
import { operateQuestion, reopenQuestion } from "@/services/domains/question";
import { deleteTag, loadTagPage } from "@/services/domains/tag";
import type {
  AdminAnswerInfo,
  AdminAnswerPageInput,
  AdminAnswerPageResponse,
  AdminContentPageResponse,
  AdminContentPageState,
  AdminContentSourceVisibility,
  AdminContentType,
  AdminQuestionInfo,
  AdminQuestionPageInput,
  AdminQuestionPageResponse,
  AdminUserInfo,
  AdminUserPageInput,
  AdminUserPageResponse,
  AdminUserRole,
  AdminUserStatus,
  AdminUserStatusInput,
  CultivationPermissionRule,
  FeedItem,
  QuestionOperation,
  TagPageItem,
} from "@/services/contracts";
import { blogEditPath } from "@/utils/blogBody";
import { cultivationForRank } from "@/utils/cultivation";
import {
  contentPath,
  legacyTagPath,
  profilePath,
  questionPath as routeQuestionPath,
  tagReadPath,
} from "@/utils/routes";

type ContentAdminTab = "blogs" | "books" | "discussions" | "dynamics";
type AdminTab =
  | ContentAdminTab
  | "questions"
  | "answers"
  | "users"
  | "tags"
  | "cultivation";
type QuestionStatusFilter = NonNullable<AdminQuestionPageInput["status"]>;
type AnswerStatusFilter = NonNullable<AdminAnswerPageInput["status"]>;
type UserStatusFilter = NonNullable<AdminUserPageInput["status"]>;
type SuspendDuration = NonNullable<AdminUserStatusInput["suspendDuration"]>;
type PendingAdminAction =
  | { kind: "content-delete"; tab: ContentAdminTab; item: FeedItem }
  | { kind: "question-delete"; question: AdminQuestionInfo }
  | { kind: "answer-delete"; answer: AdminAnswerInfo }
  | { kind: "tag-delete"; tag: TagPageItem };
type AdminTagEditorTarget =
  | { kind: "content"; tab: ContentAdminTab; item: FeedItem }
  | { kind: "question"; question: AdminQuestionInfo };
type PermissionGroupKey =
  | "create"
  | "question"
  | "moderation"
  | "revision"
  | "postReview"
  | "report"
  | "operations"
  | "other";

const pageSize = 8;

const questionStatusOptions: Array<QuestionStatusFilter | ""> = [
  "",
  "available",
  "closed",
  "deleted",
  "pending",
];
const answerStatusOptions: Array<AnswerStatusFilter | ""> = [
  "",
  "available",
  "deleted",
  "pending",
];
const userStatusOptions: AdminUserStatus[] = [
  "normal",
  "suspended",
  "deleted",
  "inactive",
];
const userRoleOptions: AdminUserRole[] = ["member", "moderator"];
const suspendOptions: SuspendDuration[] = ["24h", "72h", "7d", "1m", "1y"];

const permissionGroupOrder: PermissionGroupKey[] = [
  "create",
  "question",
  "moderation",
  "revision",
  "postReview",
  "report",
  "operations",
  "other",
];

function questionPath(question: AdminQuestionInfo) {
  return routeQuestionPath(question.id, question.title);
}

function answerPath(answer: AdminAnswerInfo) {
  return `${routeQuestionPath(answer.question_id)}#answer-${encodeURIComponent(answer.id)}`;
}

function contentEditPath(item: FeedItem) {
  if (item.type === "blog") return blogEditPath(item);
  if (item.type === "book") return `/books/${encodeURIComponent(item.id)}/edit`;
  if (item.type === "discussion" || item.type === "forum")
    return `/discussions/${encodeURIComponent(item.id)}/edit`;
  if (item.type === "dynamic" || item.type === "status")
    return `/dynamics/${encodeURIComponent(item.id)}/edit`;
  return contentPath(item.type, item.id, item.title);
}

function contentLabel(t: AdminTranslation, item: FeedItem) {
  return adminContentKindLabel(t, item.type);
}

function dateLabel(
  t: AdminTranslation,
  locale: LocaleId,
  epochSeconds: number,
) {
  if (!epochSeconds) return t("content.labels.unknownTime");
  return formatDate(locale, epochSeconds * 1000, {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function adminContentTypeForTab(tab: ContentAdminTab): AdminContentType {
  if (tab === "books") return "book";
  if (tab === "discussions") return "forum";
  if (tab === "dynamics") return "status";
  return "blog";
}

function adminTagsForCompare(tags: string[]) {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, 6);
}

function sameAdminTags(left: string[], right: string[]) {
  return (
    adminTagsForCompare(left).join("\n") ===
    adminTagsForCompare(right).join("\n")
  );
}

function pageStateForItem(item: FeedItem): AdminContentPageState {
  return item.publishStatus === "draft" ? "draft" : "published";
}

function sourceVisibilityForItem(item: FeedItem): AdminContentSourceVisibility {
  if (item.sourceVisibility === "open") return "open";
  if (item.sourceVisibility === "private") return "private";
  if (item.repositoryStatus === "published") return "open";
  return item.publishStatus === "published" ? "open" : "private";
}

function contentTimeLabel(
  t: AdminTranslation,
  locale: LocaleId,
  item: FeedItem,
) {
  const createdAt = item.createdAt ? new Date(item.createdAt) : null;
  const updatedAt = item.updatedAt ? new Date(item.updatedAt) : null;
  const format = (value: Date) =>
    formatDate(locale, value, {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (
    updatedAt &&
    !Number.isNaN(updatedAt.getTime()) &&
    (!createdAt || updatedAt.getTime() !== createdAt.getTime())
  ) {
    return t("content.labels.updated", { date: format(updatedAt) });
  }
  if (createdAt && !Number.isNaN(createdAt.getTime()))
    return t("content.labels.created", { date: format(createdAt) });
  return t("content.labels.unknownTime");
}

function contentStatusTone(
  item: FeedItem,
): "success" | "warning" | "destructive" {
  if (pageStateForItem(item) === "draft") return "warning";
  if (sourceVisibilityForItem(item) === "private") return "destructive";
  return "success";
}

function questionOperationLabel(
  t: AdminTranslation,
  operation: QuestionOperation,
) {
  if (operation === "hide") return t("content.actions.hide");
  if (operation === "show") return t("content.actions.show");
  if (operation === "pin") return t("content.actions.pin");
  return t("content.actions.unpin");
}

function contentStatusLabel(t: AdminTranslation, item: FeedItem) {
  if (pageStateForItem(item) === "draft") return adminStatusLabel(t, "draft");
  if (sourceVisibilityForItem(item) === "private")
    return adminStatusLabel(t, "private");
  return adminStatusLabel(t, "available");
}

function renderContentAuthor(t: AdminTranslation, item: FeedItem) {
  const author = (
    <AvatarName
      name={item.author || t("content.labels.unknownAuthor")}
      imageUrl={item.authorAvatar}
      rank={item.authorRank}
    />
  );
  if (!item.authorId) return author;
  return (
    <Link className="admin-row-author" to={profilePath(item.authorId)}>
      {author}
    </Link>
  );
}

function userPath(user: AdminUserInfo) {
  return profilePath(user.username || user.user_id);
}

function userDisplayName(user: AdminUserInfo) {
  return user.display_name || user.username || user.user_id;
}

function userHandle(user: AdminUserInfo) {
  return user.username ? `@${user.username}` : user.user_id;
}

function userStatusTone(
  status: AdminUserStatus,
): "neutral" | "success" | "warning" | "destructive" {
  if (status === "normal") return "success";
  if (status === "suspended") return "warning";
  if (status === "deleted") return "destructive";
  return "neutral";
}

function permissionGroupForKey(key: string): PermissionGroupKey {
  if (
    key.startsWith("blog.") ||
    key.startsWith("book.") ||
    key.startsWith("discussion.") ||
    key.startsWith("dynamic.")
  ) {
    return "create";
  }
  if (key.startsWith("question.") || key.startsWith("answer.")) {
    return "question";
  }
  if (key.startsWith("moderation.case.")) {
    return "moderation";
  }
  if (key.startsWith("review.revision.")) {
    return "revision";
  }
  if (key.startsWith("review.post.")) {
    return "postReview";
  }
  if (key.startsWith("review.report.")) {
    return "report";
  }
  if (key.startsWith("operations.")) {
    return "operations";
  }
  return "other";
}

function totalPages(count: number) {
  return Math.max(1, Math.ceil(count / pageSize));
}

function PageButtons({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (nextPage: number) => void;
}) {
  return (
    <Pagination
      page={page}
      pageCount={totalPages(count)}
      onPageChange={onChange}
    />
  );
}

function RowActionMenu({
  items,
}: {
  items: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
}) {
  const { t } = useFeatureTranslation("admin");
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost">{t("shared.actions")}</Button>
      </MenuTrigger>
      <MenuContent align="end" aria-label={t("shared.actions")}>
        {items.map((item) => (
          <MenuItem
            disabled={item.disabled}
            key={item.label}
            onSelect={item.onClick}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function AdminContentManagement({
  isAdmin,
  section,
  onSectionChange,
}: {
  isAdmin: boolean;
  section: AdminContentSection;
  onSectionChange(section: AdminContentSection): void;
}) {
  const { t } = useFeatureTranslation("admin");
  const { t: identityT } = useFeatureTranslation("identity");
  const locale = useResolvedLocale();
  const [tab, setTab] = useState<AdminTab>(section);
  const isModerator = true;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [blogResult, setBlogResult] = useState<AdminContentPageResponse | null>(
    null,
  );
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogPage, setBlogPage] = useState(1);
  const [bookResult, setBookResult] = useState<AdminContentPageResponse | null>(
    null,
  );
  const [bookLoading, setBookLoading] = useState(false);
  const [bookPage, setBookPage] = useState(1);
  const [discussionResult, setDiscussionResult] =
    useState<AdminContentPageResponse | null>(null);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionPage, setDiscussionPage] = useState(1);
  const [dynamicResult, setDynamicResult] =
    useState<AdminContentPageResponse | null>(null);
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [dynamicPage, setDynamicPage] = useState(1);

  const [questionResult, setQuestionResult] =
    useState<AdminQuestionPageResponse | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionPage, setQuestionPage] = useState(1);
  const [questionQuery, setQuestionQuery] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [questionStatus, setQuestionStatus] = useState<
    QuestionStatusFilter | ""
  >("");

  const [answerResult, setAnswerResult] =
    useState<AdminAnswerPageResponse | null>(null);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerPage, setAnswerPage] = useState(1);
  const [answerQuery, setAnswerQuery] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerStatus, setAnswerStatus] = useState<AnswerStatusFilter | "">("");

  const [userResult, setUserResult] = useState<AdminUserPageResponse | null>(
    null,
  );
  const [userLoading, setUserLoading] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userQuery, setUserQuery] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [userStatus, setUserStatus] = useState<UserStatusFilter | "">("");
  const [staffOnly, setStaffOnly] = useState(false);
  const [userStatusDrafts, setUserStatusDrafts] = useState<
    Record<string, AdminUserStatus>
  >({});
  const [userRoleDrafts, setUserRoleDrafts] = useState<
    Record<string, AdminUserRole>
  >({});
  const [userSuspendDrafts, setUserSuspendDrafts] = useState<
    Record<string, SuspendDuration>
  >({});
  const [userRemoveDrafts, setUserRemoveDrafts] = useState<
    Record<string, boolean>
  >({});
  const [tagItems, setTagItems] = useState<TagPageItem[]>([]);
  const [tagCount, setTagCount] = useState(0);
  const [tagPage, setTagPage] = useState(1);
  const [tagLoading, setTagLoading] = useState(false);
  const [permissionRules, setPermissionRules] = useState<
    CultivationPermissionRule[]
  >([]);
  const [permissionDrafts, setPermissionDrafts] = useState<
    Record<string, number>
  >({});
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(
    null,
  );
  const [tagEditorTarget, setTagEditorTarget] =
    useState<AdminTagEditorTarget | null>(null);
  const [tagEditorDraft, setTagEditorDraft] = useState<string[]>([]);
  const [tagEditorSaving, setTagEditorSaving] = useState(false);

  const blogCount = blogResult?.count ?? 0;
  const bookCount = bookResult?.count ?? 0;
  const discussionCount = discussionResult?.count ?? 0;
  const dynamicCount = dynamicResult?.count ?? 0;
  const questionCount = questionResult?.count ?? 0;
  const answerCount = answerResult?.count ?? 0;
  const userCount = userResult?.count ?? 0;
  const permissionCount = permissionRules.length;

  useNoticeToasts({
    error,
    notice,
  });
  useEffect(() => {
    setTab(section);
  }, [section]);

  const loadBlogs = useCallback(async () => {
    setBlogLoading(true);
    setError("");
    try {
      const result = await loadAdminContentPage({
        type: "blog",
        page: blogPage,
        pageSize,
        status: "active",
      });
      setBlogResult(result);
    } catch (loadError) {
      setBlogResult({ items: [], count: 0 });
      setError(localizedErrorMessage(loadError, "admin.contentLoadFailed"));
    } finally {
      setBlogLoading(false);
    }
  }, [blogPage]);

  const loadBooks = useCallback(async () => {
    setBookLoading(true);
    setError("");
    try {
      const result = await loadAdminContentPage({
        type: "book",
        page: bookPage,
        pageSize,
        status: "active",
      });
      setBookResult(result);
    } catch (loadError) {
      setBookResult({ items: [], count: 0 });
      setError(localizedErrorMessage(loadError, "admin.contentLoadFailed"));
    } finally {
      setBookLoading(false);
    }
  }, [bookPage]);

  const loadDiscussions = useCallback(async () => {
    setDiscussionLoading(true);
    setError("");
    try {
      const result = await loadAdminContentPage({
        type: "forum",
        page: discussionPage,
        pageSize,
        status: "active",
      });
      setDiscussionResult(result);
    } catch (loadError) {
      setDiscussionResult({ items: [], count: 0 });
      setError(localizedErrorMessage(loadError, "admin.contentLoadFailed"));
    } finally {
      setDiscussionLoading(false);
    }
  }, [discussionPage]);

  const loadDynamics = useCallback(async () => {
    setDynamicLoading(true);
    setError("");
    try {
      const result = await loadAdminContentPage({
        type: "status",
        page: dynamicPage,
        pageSize,
        status: "active",
      });
      setDynamicResult(result);
    } catch (loadError) {
      setDynamicResult({ items: [], count: 0 });
      setError(localizedErrorMessage(loadError, "admin.contentLoadFailed"));
    } finally {
      setDynamicLoading(false);
    }
  }, [dynamicPage]);

  const loadQuestions = useCallback(async () => {
    setQuestionLoading(true);
    setError("");
    try {
      const result = await loadAdminQuestionPage({
        page: questionPage,
        pageSize,
        status: questionStatus || undefined,
        query: questionQuery || undefined,
      });
      setQuestionResult(result);
    } catch (loadError) {
      setQuestionResult(null);
      setError(localizedErrorMessage(loadError, "admin.questionLoadFailed"));
    } finally {
      setQuestionLoading(false);
    }
  }, [questionPage, questionQuery, questionStatus]);

  const loadAnswers = useCallback(async () => {
    setAnswerLoading(true);
    setError("");
    try {
      const result = await loadAdminAnswerPage({
        page: answerPage,
        pageSize,
        status: answerStatus || undefined,
        query: answerQuery || undefined,
      });
      setAnswerResult(result);
    } catch (loadError) {
      setAnswerResult(null);
      setError(localizedErrorMessage(loadError, "admin.answerLoadFailed"));
    } finally {
      setAnswerLoading(false);
    }
  }, [answerPage, answerQuery, answerStatus]);

  const loadUsers = useCallback(async () => {
    setUserLoading(true);
    setError("");
    try {
      const result = await loadAdminUserPage({
        page: userPage,
        pageSize,
        status: userStatus || undefined,
        query: userQuery || undefined,
        staff: staffOnly || undefined,
      });
      setUserResult(result);
      setUserStatusDrafts((current) => {
        const next = { ...current };
        result.items.forEach((user) => {
          if (!next[user.user_id]) next[user.user_id] = user.status;
        });
        return next;
      });
      setUserRoleDrafts((current) => {
        const next = { ...current };
        result.items.forEach((user) => {
          if (!next[user.user_id]) next[user.user_id] = user.role_name;
        });
        return next;
      });
    } catch (loadError) {
      setUserResult(null);
      setError(localizedErrorMessage(loadError, "admin.userLoadFailed"));
    } finally {
      setUserLoading(false);
    }
  }, [staffOnly, userPage, userQuery, userStatus]);

  const loadPermissions = useCallback(async () => {
    setPermissionLoading(true);
    setError("");
    try {
      const result = await loadCultivationPermissions();
      setPermissionRules(result.items);
      setPermissionDrafts(
        Object.fromEntries(
          result.items.map((rule) => [rule.key, rule.minRank]),
        ),
      );
    } catch (loadError) {
      setPermissionRules([]);
      setPermissionDrafts({});
      setError(localizedErrorMessage(loadError, "admin.permissionLoadFailed"));
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  const loadTags = useCallback(async () => {
    setTagLoading(true);
    setError("");
    try {
      const result = await loadTagPage({
        page: tagPage,
        pageSize,
        queryCond: "newest",
      });
      setTagItems(result.items);
      setTagCount(result.count);
    } catch (loadError) {
      setTagItems([]);
      setTagCount(0);
      setError(localizedErrorMessage(loadError, "admin.tagLoadFailed"));
    } finally {
      setTagLoading(false);
    }
  }, [tagPage]);

  useEffect(() => {
    if (isAdmin && tab === "blogs") void loadBlogs();
  }, [isAdmin, loadBlogs, tab]);

  useEffect(() => {
    if (isAdmin && tab === "books") void loadBooks();
  }, [isAdmin, loadBooks, tab]);

  useEffect(() => {
    if (isAdmin && tab === "discussions") void loadDiscussions();
  }, [isAdmin, loadDiscussions, tab]);

  useEffect(() => {
    if (isAdmin && tab === "dynamics") void loadDynamics();
  }, [isAdmin, loadDynamics, tab]);

  useEffect(() => {
    if (isModerator && tab === "questions") void loadQuestions();
  }, [isModerator, loadQuestions, tab]);

  useEffect(() => {
    if (isModerator && tab === "answers") void loadAnswers();
  }, [isModerator, loadAnswers, tab]);

  useEffect(() => {
    if (isAdmin && tab === "users") void loadUsers();
  }, [isAdmin, loadUsers, tab]);

  useEffect(() => {
    if (isAdmin && tab === "cultivation") void loadPermissions();
  }, [isAdmin, loadPermissions, tab]);

  useEffect(() => {
    if (isAdmin && tab === "tags") void loadTags();
  }, [isAdmin, loadTags, tab]);

  const submitQuestionSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuestionPage(1);
    setQuestionQuery(questionDraft.trim());
  };

  const submitAnswerSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAnswerPage(1);
    setAnswerQuery(answerDraft.trim());
  };

  const submitUserSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserPage(1);
    setUserQuery(userDraft.trim());
  };

  const savePermissions = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPermissionSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await updateCultivationPermissions(
        permissionRules.map((rule) => ({
          ...rule,
          minRank: Math.max(
            0,
            Math.floor(permissionDrafts[rule.key] ?? rule.minRank),
          ),
        })),
      );
      setPermissionRules(result.items);
      setPermissionDrafts(
        Object.fromEntries(
          result.items.map((rule) => [rule.key, rule.minRank]),
        ),
      );
      setNotice(t("content.notices.permissionsUpdated"));
    } catch (saveError) {
      setError(
        localizedErrorMessage(saveError, "admin.permissionUpdateFailed"),
      );
    } finally {
      setPermissionSaving(false);
    }
  };

  const changeQuestionStatus = async (
    question: AdminQuestionInfo,
    status: "available" | "closed" | "deleted",
  ) => {
    const key = `question-${question.id}-${status}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await adminUpdateQuestionStatus({ questionId: question.id, status });
      await loadQuestions();
      setNotice(
        t("content.notices.questionUpdated", {
          status: adminStatusLabel(t, status),
        }),
      );
    } catch (statusError) {
      setError(
        localizedErrorMessage(statusError, "admin.questionUpdateFailed"),
      );
    } finally {
      setBusyKey("");
    }
  };

  const changeAnswerStatus = async (
    answer: AdminAnswerInfo,
    status: "available" | "deleted",
  ) => {
    const key = `answer-${answer.id}-${status}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await adminUpdateAnswerStatus({ answerId: answer.id, status });
      await loadAnswers();
      setNotice(
        t("content.notices.answerUpdated", {
          status: adminStatusLabel(t, status),
        }),
      );
    } catch (statusError) {
      setError(localizedErrorMessage(statusError, "admin.answerUpdateFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const reopenQuestionItem = async (question: AdminQuestionInfo) => {
    const key = `question-reopen-${question.id}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await reopenQuestion(question.url_title || question.id);
      await loadQuestions();
      setNotice(t("content.notices.questionReopened"));
    } catch (statusError) {
      setError(
        localizedErrorMessage(statusError, "admin.questionUpdateFailed"),
      );
    } finally {
      setBusyKey("");
    }
  };

  const operateQuestionItem = async (
    question: AdminQuestionInfo,
    operation: QuestionOperation,
  ) => {
    const key = `question-op-${question.id}-${operation}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await operateQuestion({
        slug: question.url_title || question.id,
        operation,
      });
      await loadQuestions();
      setNotice(
        t("content.notices.questionOperated", {
          operation: questionOperationLabel(t, operation),
        }),
      );
    } catch (statusError) {
      setError(
        localizedErrorMessage(statusError, "admin.questionUpdateFailed"),
      );
    } finally {
      setBusyKey("");
    }
  };

  const updateContentResult = (
    targetTab: ContentAdminTab,
    updater: (
      current: AdminContentPageResponse | null,
    ) => AdminContentPageResponse | null,
  ) => {
    if (targetTab === "blogs") setBlogResult(updater);
    if (targetTab === "books") setBookResult(updater);
    if (targetTab === "discussions") setDiscussionResult(updater);
    if (targetTab === "dynamics") setDynamicResult(updater);
  };

  const openContentTagEditor = (
    contentTab: ContentAdminTab,
    item: FeedItem,
  ) => {
    setTagEditorTarget({ kind: "content", tab: contentTab, item });
    setTagEditorDraft(adminTagsForCompare(item.tags));
    setError("");
    setNotice("");
  };

  const openQuestionTagEditor = (question: AdminQuestionInfo) => {
    setTagEditorTarget({ kind: "question", question });
    setTagEditorDraft(adminTagsForCompare(question.tags));
    setError("");
    setNotice("");
  };

  const closeTagEditor = () => {
    if (tagEditorSaving) return;
    setTagEditorTarget(null);
    setTagEditorDraft([]);
  };

  const saveTagEditor = async () => {
    const target = tagEditorTarget;
    if (!target) return;
    const tags = adminTagsForCompare(tagEditorDraft);
    const id = target.kind === "content" ? target.item.id : target.question.id;
    const type =
      target.kind === "content"
        ? adminContentTypeForTab(target.tab)
        : "question";
    const key = `tags-${type}-${id}`;
    setBusyKey(key);
    setTagEditorSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await adminUpdateContentTags({ id, type, tags });
      if (target.kind === "content") {
        updateContentResult(target.tab, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === id ? { ...entry, tags: result.tags } : entry,
                ),
              }
            : current,
        );
      } else {
        setQuestionResult((current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === id ? { ...entry, tags: result.tags } : entry,
                ),
              }
            : current,
        );
      }
      setNotice(t("content.notices.tagsUpdated"));
      setTagEditorTarget(null);
      setTagEditorDraft([]);
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, "admin.tagUpdateFailed"));
    } finally {
      setTagEditorSaving(false);
      setBusyKey("");
    }
  };

  const changeContentPublishing = async (
    contentTab: ContentAdminTab,
    item: FeedItem,
    pageState: AdminContentPageState,
    sourceVisibility: AdminContentSourceVisibility,
  ) => {
    const key = `content-${contentTab}-${item.id}-${pageState}-${sourceVisibility}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      const result = await adminUpdateContentStatus({
        id: item.id,
        type: adminContentTypeForTab(contentTab),
        pageState,
        sourceVisibility,
      });
      updateContentResult(contentTab, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === item.id ? result.item : entry,
              ),
            }
          : current,
      );
      setNotice(
        t("content.notices.contentUpdated", {
          type: contentLabel(t, result.item),
        }),
      );
    } catch (statusError) {
      setError(localizedErrorMessage(statusError, "admin.contentUpdateFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const deleteFeedItem = async (
    contentTab: ContentAdminTab,
    item: FeedItem,
  ) => {
    const key = `delete-${contentTab}-${item.id}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await adminDeleteContent({
        id: item.id,
        type: adminContentTypeForTab(contentTab),
      });
      updateContentResult(contentTab, (current) =>
        current
          ? {
              ...current,
              count: Math.max(0, current.count - 1),
              items: current.items.filter((entry) => entry.id !== item.id),
            }
          : current,
      );
      setNotice(
        t("content.notices.contentDeleted", { type: contentLabel(t, item) }),
      );
    } catch (deleteError) {
      setError(localizedErrorMessage(deleteError, "admin.contentDeleteFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const deleteTagItem = async (tag: TagPageItem) => {
    const key = `tag-delete-${tag.tagId}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await deleteTag({
        tagId: tag.tagId,
        slugName: tag.slugName,
      });
      await loadTags();
      setNotice(
        t("content.notices.tagDeleted", {
          name: tag.displayName || tag.slugName,
        }),
      );
    } catch (tagError) {
      setError(localizedErrorMessage(tagError, "admin.tagDeleteFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const confirmPendingAction = async () => {
    const action = pendingAction;
    if (!action) return;
    if (action.kind === "content-delete") {
      await deleteFeedItem(action.tab, action.item);
    } else if (action.kind === "question-delete") {
      await changeQuestionStatus(action.question, "deleted");
    } else if (action.kind === "answer-delete") {
      await changeAnswerStatus(action.answer, "deleted");
    } else {
      await deleteTagItem(action.tag);
    }
    setPendingAction(null);
  };

  const changeUserStatus = async (user: AdminUserInfo) => {
    const status = userStatusDrafts[user.user_id] || user.status;
    const roleName = userRoleDrafts[user.user_id] || user.role_name;
    const key = `user-${user.user_id}-${status}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await adminUpdateUserStatus({
        userId: user.user_id,
        status,
        roleName: status === "normal" ? roleName : undefined,
        suspendDuration:
          status === "suspended"
            ? userSuspendDrafts[user.user_id] || "7d"
            : undefined,
        removeAllContent: Boolean(userRemoveDrafts[user.user_id]),
      });
      await loadUsers();
      setNotice(
        t("content.notices.userUpdated", {
          status: adminStatusLabel(t, status),
        }),
      );
    } catch (statusError) {
      setError(localizedErrorMessage(statusError, "admin.userUpdateFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const renderTagItem = (tag: TagPageItem) => (
    <article className="admin-row" key={tag.tagId || tag.slugName}>
      <div className="admin-row-main">
        <div className="stream-card-head">
          <span>{tag.slugName || tag.tagId}</span>
          <strong>
            {t("content.counts.questions", {
              count: tag.questionCount,
              displayCount: formatNumber(locale, tag.questionCount),
            })}{" "}
            ·{" "}
            {t("content.counts.followers", {
              count: tag.followCount,
              displayCount: formatNumber(locale, tag.followCount),
            })}
          </strong>
        </div>
        <h2>
          <Link
            to={tagReadPath(
              tag.tagId,
              tag.slugName || tag.displayName || tag.tagId,
            )}
          >
            <MathInline text={tag.displayName || tag.slugName} />
          </Link>
        </h2>
        <p>{tag.usageExcerpt || tag.description || tag.slugName}</p>
      </div>
      <div className="admin-row-action-menu">
        <Link
          className="admin-row-link-button"
          to={tagReadPath(
            tag.tagId,
            tag.slugName || tag.displayName || tag.tagId,
          )}
        >
          {t("shared.open")}
        </Link>
        <Button
          variant="destructive"
          type="button"
          disabled={Boolean(busyKey)}
          onClick={() => setPendingAction({ kind: "tag-delete", tag })}
        >
          {busyKey === `tag-delete-${tag.tagId}`
            ? t("shared.processing")
            : t("content.actions.delete")}
        </Button>
      </div>
    </article>
  );

  const renderQuestion = (question: AdminQuestionInfo) => (
    <article className="admin-row" key={question.id}>
      <div className="admin-row-main">
        <div className="stream-card-head">
          <span>{adminStatusLabel(t, question.status)}</span>
          <strong>
            {t("content.counts.answers", {
              count: question.answer_count,
              displayCount: formatNumber(locale, question.answer_count),
            })}{" "}
            ·{" "}
            {t("content.counts.votes", {
              count: question.vote_count,
              displayCount: formatNumber(locale, question.vote_count),
            })}
          </strong>
        </div>
        <h2>
          <Link to={questionPath(question)}>
            <MathInline text={question.title} />
          </Link>
        </h2>
        <p>
          {question.user_info ? (
            <AvatarName
              name={
                question.user_info.display_name || question.user_info.username
              }
              imageUrl={question.user_info.avatar}
              rank={question.user_info.rank}
            />
          ) : (
            t("content.labels.anonymous")
          )}
          <span className="meta-dot">·</span>
          <span>{dateLabel(t, locale, question.create_time)}</span>
          {!question.show ? (
            <Badge tone="destructive">{t("content.actions.hide")}</Badge>
          ) : null}
        </p>
        {question.tags.length ? (
          <div
            className="admin-row-tags"
            aria-label={t("content.labels.tags", { title: question.title })}
          >
            {question.tags.slice(0, 6).map((tag) => (
              <Link to={legacyTagPath(tag)} key={tag}>
                {tag}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <RowActionMenu
        items={[
          ...(isAdmin
            ? [
                {
                  label:
                    busyKey === `tags-question-${question.id}`
                      ? t("shared.processing")
                      : t("content.actions.editTags"),
                  disabled: Boolean(busyKey),
                  onClick: () => openQuestionTagEditor(question),
                },
              ]
            : []),
          {
            label:
              busyKey === `question-${question.id}-available`
                ? t("shared.processing")
                : adminStatusLabel(t, "available"),
            disabled: Boolean(busyKey),
            onClick: () => void changeQuestionStatus(question, "available"),
          },
          {
            label:
              busyKey === `question-${question.id}-closed`
                ? t("shared.processing")
                : t("content.actions.close"),
            disabled: Boolean(busyKey),
            onClick: () => void changeQuestionStatus(question, "closed"),
          },
          {
            label:
              busyKey === `question-reopen-${question.id}`
                ? t("shared.processing")
                : t("content.actions.reopen"),
            disabled: Boolean(busyKey),
            onClick: () => void reopenQuestionItem(question),
          },
          {
            label:
              busyKey ===
              `question-op-${question.id}-${question.show ? "hide" : "show"}`
                ? t("shared.processing")
                : question.show
                  ? t("content.actions.hide")
                  : t("content.actions.show"),
            disabled: Boolean(busyKey),
            onClick: () =>
              void operateQuestionItem(
                question,
                question.show ? "hide" : "show",
              ),
          },
          {
            label:
              busyKey === `question-${question.id}-deleted`
                ? t("shared.processing")
                : t("content.actions.delete"),
            disabled: Boolean(busyKey),
            onClick: () =>
              setPendingAction({ kind: "question-delete", question }),
          },
        ]}
      />
    </article>
  );

  const renderAnswer = (answer: AdminAnswerInfo) => (
    <article className="admin-row" key={answer.id}>
      <div className="admin-row-main">
        <div className="stream-card-head">
          <span>{adminStatusLabel(t, answer.status)}</span>
          <strong>
            {t("content.counts.votes", {
              count: answer.vote_count,
              displayCount: formatNumber(locale, answer.vote_count),
            })}{" "}
            ·{" "}
            {answer.accepted === 2
              ? t("content.labels.accepted")
              : t("content.labels.notAccepted")}
          </strong>
        </div>
        <h2>
          <Link to={answerPath(answer)}>
            <MathInline
              text={
                answer.question_info.title ||
                `${adminContentKindLabel(t, "answer")} #${answer.id}`
              }
            />
          </Link>
        </h2>
        <p>
          {answer.user_info ? (
            <AvatarName
              name={answer.user_info.display_name || answer.user_info.username}
              imageUrl={answer.user_info.avatar}
              rank={answer.user_info.rank}
            />
          ) : (
            t("content.labels.anonymous")
          )}
          <span className="meta-dot">·</span>
          <span>{dateLabel(t, locale, answer.create_time)}</span>
        </p>
        {answer.description ? (
          <p>
            <MathInline text={answer.description.slice(0, 180)} />
          </p>
        ) : null}
      </div>
      <RowActionMenu
        items={[
          {
            label:
              busyKey === `answer-${answer.id}-available`
                ? t("shared.processing")
                : adminStatusLabel(t, "available"),
            disabled: Boolean(busyKey),
            onClick: () => void changeAnswerStatus(answer, "available"),
          },
          {
            label:
              busyKey === `answer-${answer.id}-deleted`
                ? t("shared.processing")
                : t("content.actions.delete"),
            disabled: Boolean(busyKey),
            onClick: () => setPendingAction({ kind: "answer-delete", answer }),
          },
        ]}
      />
    </article>
  );

  const renderContentItem = (contentTab: ContentAdminTab, item: FeedItem) => {
    const pageState = pageStateForItem(item);
    const sourceVisibility = sourceVisibilityForItem(item);
    const isBusy =
      busyKey.startsWith(`content-${contentTab}-${item.id}-`) ||
      busyKey === `delete-${contentTab}-${item.id}`;
    return (
      <article className="admin-row content-admin-row" key={item.id}>
        <div className="admin-row-main">
          <div className="stream-card-head admin-row-head">
            <Badge tone={contentStatusTone(item)}>
              {contentStatusLabel(t, item)}
            </Badge>
            <strong>{contentLabel(t, item)}</strong>
          </div>
          <h2>
            <Link to={contentPath(item.type, item.id, item.title)}>
              <MathInline text={item.title} />
            </Link>
          </h2>
          <div className="admin-row-meta admin-content-meta">
            <span className="admin-meta-item">
              <span className="admin-meta-label">
                {t("content.labels.author")}
              </span>
              {renderContentAuthor(t, item)}
            </span>
            <span className="admin-meta-item">
              <span className="admin-meta-label">
                {t("content.labels.time")}
              </span>
              <span>{contentTimeLabel(t, locale, item)}</span>
            </span>
          </div>
          {item.excerpt ? (
            <p className="admin-row-excerpt">{item.excerpt}</p>
          ) : null}
          {item.tags.length ? (
            <div
              className="admin-row-tags"
              aria-label={t("content.labels.tags", { title: item.title })}
            >
              {item.tags.slice(0, 6).map((tag) => (
                <Link to={legacyTagPath(tag)} key={tag}>
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div
          className="admin-row-action-menu content-admin-actions"
          aria-label={t("content.labels.managementActions", {
            title: item.title,
          })}
        >
          {busyKey ? (
            <span
              className="admin-row-link-button disabled"
              aria-disabled="true"
            >
              {t("shared.edit")}
            </span>
          ) : (
            <Link className="admin-row-link-button" to={contentEditPath(item)}>
              {t("shared.edit")}
            </Link>
          )}
          <Button
            variant="ghost"
            type="button"
            disabled={Boolean(busyKey)}
            onClick={() => openContentTagEditor(contentTab, item)}
          >
            {busyKey === `tags-${adminContentTypeForTab(contentTab)}-${item.id}`
              ? t("shared.processing")
              : t("content.actions.editTags")}
          </Button>
          <SegmentedControl
            label={t("content.labels.visibility", { title: item.title })}
            value={sourceVisibility}
            items={[
              {
                value: "open",
                label: adminStatusLabel(t, "available"),
                disabled: isBusy,
              },
              {
                value: "private",
                label: adminStatusLabel(t, "private"),
                disabled: isBusy,
              },
            ]}
            onValueChange={(value) =>
              void changeContentPublishing(contentTab, item, pageState, value)
            }
          />
          <SegmentedControl
            label={t("content.labels.publicationState", { title: item.title })}
            value={pageState}
            items={[
              {
                value: "published",
                label: t("content.actions.publish"),
                disabled: isBusy,
              },
              {
                value: "draft",
                label: adminStatusLabel(t, "draft"),
                disabled: isBusy,
              },
            ]}
            onValueChange={(value) =>
              void changeContentPublishing(
                contentTab,
                item,
                value,
                sourceVisibility,
              )
            }
          />
          <Button
            variant="destructive"
            type="button"
            disabled={Boolean(busyKey)}
            onClick={() =>
              setPendingAction({
                kind: "content-delete",
                tab: contentTab,
                item,
              })
            }
          >
            {busyKey === `delete-${contentTab}-${item.id}`
              ? t("shared.processing")
              : t("content.actions.delete")}
          </Button>
        </div>
      </article>
    );
  };

  const renderUser = (user: AdminUserInfo) => {
    const draftStatus = userStatusDrafts[user.user_id] || user.status;
    const draftRole = userRoleDrafts[user.user_id] || user.role_name;
    const isLockedAdmin = user.role_name === "admin";
    const isChanged =
      draftStatus !== user.status ||
      (draftStatus === "normal" && draftRole !== user.role_name) ||
      Boolean(userRemoveDrafts[user.user_id]) ||
      (draftStatus === "suspended" && Boolean(userSuspendDrafts[user.user_id]));
    const suspendedUntil = user.suspended_until
      ? dateLabel(t, locale, user.suspended_until)
      : "";
    return (
      <article className="admin-row user-admin-row" key={user.user_id}>
        <div className="admin-user-identity">
          <Link className="admin-user-avatar-link" to={userPath(user)}>
            <AvatarName
              name={userDisplayName(user)}
              imageUrl={user.avatar}
              rank={user.rank}
              size="md"
            />
          </Link>
          <div>
            <div className="admin-user-title">
              <Link to={userPath(user)}>{userDisplayName(user)}</Link>
              <Badge tone={userStatusTone(user.status)}>
                {adminStatusLabel(t, user.status)}
              </Badge>
            </div>
            <div className="admin-user-subline">
              <span>{userHandle(user)}</span>
              <span>{user.e_mail || t("content.labels.emailMissing")}</span>
              <span>UID {user.user_id}</span>
            </div>
          </div>
        </div>

        <div
          className="admin-user-profile-grid"
          aria-label={t("content.labels.profile", {
            name: userDisplayName(user),
          })}
        >
          <div>
            <span>{t("content.labels.rank")}</span>
            <strong>{formatNumber(locale, user.rank)}</strong>
          </div>
          <div>
            <span>{t("content.labels.role")}</span>
            <strong>{adminUserRoleLabel(t, user.role_name)}</strong>
          </div>
          <div>
            <span>{t("content.labels.registered")}</span>
            <strong>{dateLabel(t, locale, user.created_at)}</strong>
          </div>
          <div>
            <span>{t("content.labels.suspendedUntil")}</span>
            <strong>{suspendedUntil || "-"}</strong>
          </div>
        </div>

        <div
          className="admin-user-controls"
          aria-label={t("content.labels.userActions", {
            name: userDisplayName(user),
          })}
        >
          <div className="admin-user-control-row">
            <label htmlFor={`status-${user.user_id}`}>
              {t("content.labels.status")}
            </label>
            <Select
              id={`status-${user.user_id}`}
              value={draftStatus}
              aria-label={t("content.labels.userStatus", {
                name: userDisplayName(user),
              })}
              onChange={(event) =>
                setUserStatusDrafts((current) => ({
                  ...current,
                  [user.user_id]: event.currentTarget.value as AdminUserStatus,
                }))
              }
            >
              {userStatusOptions.map((status) => (
                <option value={status} key={status}>
                  {adminStatusLabel(t, status)}
                </option>
              ))}
            </Select>
          </div>
          <div className="admin-user-control-row">
            <label htmlFor={`role-${user.user_id}`}>
              {t("content.labels.role")}
            </label>
            <Select
              id={`role-${user.user_id}`}
              value={isLockedAdmin ? "admin" : draftRole}
              aria-label={t("content.labels.userRole", {
                name: userDisplayName(user),
              })}
              disabled={isLockedAdmin || draftStatus !== "normal"}
              onChange={(event) =>
                setUserRoleDrafts((current) => ({
                  ...current,
                  [user.user_id]: event.currentTarget.value as AdminUserRole,
                }))
              }
            >
              {isLockedAdmin ? (
                <option value="admin">{adminUserRoleLabel(t, "admin")}</option>
              ) : null}
              {userRoleOptions.map((role) => (
                <option value={role} key={role}>
                  {adminUserRoleLabel(t, role)}
                </option>
              ))}
            </Select>
          </div>
          {draftStatus === "suspended" ? (
            <div className="admin-user-control-row">
              <label htmlFor={`suspend-${user.user_id}`}>
                {t("content.labels.suspensionDuration")}
              </label>
              <Select
                id={`suspend-${user.user_id}`}
                value={userSuspendDrafts[user.user_id] || "7d"}
                aria-label={t("content.labels.userSuspensionDuration", {
                  name: userDisplayName(user),
                })}
                onChange={(event) =>
                  setUserSuspendDrafts((current) => ({
                    ...current,
                    [user.user_id]: event.currentTarget
                      .value as SuspendDuration,
                  }))
                }
              >
                {suspendOptions.map((duration) => (
                  <option value={duration} key={duration}>
                    {t(`content.durations.${duration}`)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Checkbox
            label={t("content.user.removeContent")}
            id={`remove-content-${user.user_id}`}
            checked={Boolean(userRemoveDrafts[user.user_id])}
            onCheckedChange={(checked) =>
              setUserRemoveDrafts((current) => ({
                ...current,
                [user.user_id]: checked === true,
              }))
            }
          />
          <Button
            variant="primary"
            type="button"
            disabled={Boolean(busyKey) || !isChanged}
            onClick={() => void changeUserStatus(user)}
          >
            {busyKey.startsWith(`user-${user.user_id}-`)
              ? t("shared.processing")
              : t("shared.save")}
          </Button>
        </div>
      </article>
    );
  };

  const renderPermissionRule = (rule: CultivationPermissionRule) => {
    const value = permissionDrafts[rule.key] ?? rule.minRank;
    const ruleLabel = adminPermissionRuleLabel(t, rule.key, rule.label);
    const ruleDescription = adminPermissionRuleDescription(
      t,
      rule.key,
      rule.description,
    );
    const cultivation = cultivationForRank(value);
    return (
      <div className="admin-permission-row" key={rule.key}>
        <div>
          <strong>{ruleLabel}</strong>
          <span>{ruleDescription}</span>
          <code>{rule.key}</code>
        </div>
        <div className="admin-permission-input">
          <Input
            type="number"
            min={0}
            step={1}
            value={value}
            aria-label={t("content.permissions.minimumRank", {
              label: ruleLabel,
            })}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value);
              setPermissionDrafts((current) => ({
                ...current,
                [rule.key]: Number.isFinite(nextValue)
                  ? Math.max(0, Math.floor(nextValue))
                  : 0,
              }));
            }}
          />
          <span>
            {cultivation
              ? identityCultivationRealmLabel(identityT, cultivation)
              : ""}
          </span>
        </div>
      </div>
    );
  };

  const blogItems = blogResult?.items ?? [];
  const bookItems = bookResult?.items ?? [];
  const discussionItems = discussionResult?.items ?? [];
  const dynamicItems = dynamicResult?.items ?? [];
  const permissionGroups = useMemo(
    () =>
      permissionGroupOrder
        .map((groupKey) => ({
          key: groupKey,
          label: t(`content.permissionGroups.${groupKey}`),
          items: permissionRules.filter(
            (rule) => permissionGroupForKey(rule.key) === groupKey,
          ),
        }))
        .filter((group) => group.items.length > 0),
    [permissionRules, t],
  );
  const pendingActionTitle =
    pendingAction?.kind === "tag-delete"
      ? t("content.delete.tagTitle")
      : t("content.delete.title");
  const pendingActionDescription =
    pendingAction?.kind === "content-delete"
      ? t("content.delete.contentDescription", {
          title: pendingAction.item.title,
        })
      : pendingAction?.kind === "question-delete"
        ? t("content.delete.questionDescription", {
            title: pendingAction.question.title,
          })
        : pendingAction?.kind === "answer-delete"
          ? t("content.delete.answerDescription", {
              title:
                pendingAction.answer.question_info.title ||
                `${adminContentKindLabel(t, "answer")} #${pendingAction.answer.id}`,
            })
          : pendingAction?.kind === "tag-delete"
            ? t("content.delete.tagDescription", {
                name:
                  pendingAction.tag.displayName || pendingAction.tag.slugName,
              })
            : "";
  const pendingActionDetails =
    pendingAction?.kind === "content-delete"
      ? [
          t("content.delete.contentRemoved", {
            type: t(`content.tabs.${pendingAction.tab}`),
          }),
          pendingAction.tab === "blogs" || pendingAction.tab === "books"
            ? t("content.delete.repositoryDeleted")
            : t("content.delete.interactionsUnavailable"),
        ]
      : pendingAction?.kind === "question-delete"
        ? [t("content.delete.questionImpact")]
        : pendingAction?.kind === "answer-delete"
          ? [t("content.delete.answerImpact")]
          : pendingAction?.kind === "tag-delete"
            ? [
                t("content.delete.tagFallback"),
                t("content.delete.generalProtected"),
              ]
            : [];
  const tagEditorSourceTags = tagEditorTarget
    ? tagEditorTarget.kind === "content"
      ? tagEditorTarget.item.tags
      : tagEditorTarget.question.tags
    : [];
  const tagEditorChanged = tagEditorTarget
    ? !sameAdminTags(tagEditorDraft, tagEditorSourceTags)
    : false;
  const tagEditorTitle = tagEditorTarget
    ? tagEditorTarget.kind === "content"
      ? tagEditorTarget.item.title
      : tagEditorTarget.question.title
    : "";
  const tagEditorTypeLabel = tagEditorTarget
    ? tagEditorTarget.kind === "content"
      ? t(`content.tabs.${tagEditorTarget.tab}`)
      : t("content.tabs.questions")
    : "";
  const visibleTabs: AdminTab[] = isAdmin
    ? [
        "blogs",
        "books",
        "questions",
        "answers",
        "discussions",
        "dynamics",
        "users",
        "tags",
        "cultivation",
      ]
    : ["questions", "answers"];

  return (
    <div className="admin-content-management">
      <main className="admin-shell">
        <ConfirmActionDialog
          show={Boolean(pendingAction)}
          title={pendingActionTitle}
          description={pendingActionDescription}
          details={pendingActionDetails}
          confirmLabel={t("shared.confirmDelete")}
          busy={Boolean(busyKey)}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmPendingAction()}
        />
        <Dialog
          open={Boolean(tagEditorTarget)}
          onOpenChange={(open) => {
            if (!open) closeTagEditor();
          }}
        >
          <DialogContent
            className="admin-tag-dialog"
            title={t("content.tagEditor.title")}
            showCloseButton={!tagEditorSaving}
          >
            <div className="admin-tag-editor">
              <div>
                <span>{tagEditorTypeLabel}</span>
                <strong>
                  <MathInline text={tagEditorTitle} />
                </strong>
              </div>
              <TagPicker
                value={tagEditorDraft}
                onChange={setTagEditorDraft}
                disabled={tagEditorSaving}
                max={6}
                placeholder={t("content.tagEditor.placeholder")}
                createMode="add"
                ariaLabel={t("content.tagEditor.ariaLabel")}
              />
            </div>
            <div className="admin-dialog-actions">
              <Button
                type="button"
                disabled={tagEditorSaving}
                onClick={closeTagEditor}
              >
                {t("shared.cancel")}
              </Button>
              <Button
                variant="primary"
                pending={tagEditorSaving}
                type="button"
                disabled={!tagEditorChanged}
                onClick={() => void saveTagEditor()}
              >
                {tagEditorSaving
                  ? t("shared.saving")
                  : t("content.tagEditor.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {isModerator ? (
          <Tabs
            value={tab}
            onValueChange={(value) => {
              const next = visibleTabs.find((item) => item === value);
              if (!next) return;
              setTab(next);
              onSectionChange(next);
            }}
          >
            <TabsList
              className="admin-tabs"
              aria-label={t("content.tabsLabel")}
            >
              {visibleTabs.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {t(`content.tabs.${item}`)}
                </TabsTrigger>
              ))}
            </TabsList>

            <section className="admin-board">
              {tab === "blogs" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.blogs")}</span>
                      <strong>
                        {blogLoading
                          ? t("shared.loading")
                          : formatNumber(locale, blogCount)}
                      </strong>
                    </div>
                  </div>
                  {blogLoading ? <LoadingState variant="compact" /> : null}
                  {blogItems.length ? (
                    <div className="admin-list">
                      {blogItems.map((item) =>
                        renderContentItem("blogs", item),
                      )}
                    </div>
                  ) : !blogLoading ? (
                    <EmptyState title={t("content.empty.blogs")} />
                  ) : null}
                  <PageButtons
                    page={blogPage}
                    count={blogCount}
                    onChange={setBlogPage}
                  />
                </Surface>
              ) : null}

              {tab === "books" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.books")}</span>
                      <strong>
                        {bookLoading
                          ? t("shared.loading")
                          : formatNumber(locale, bookCount)}
                      </strong>
                    </div>
                  </div>
                  {bookLoading ? <LoadingState variant="compact" /> : null}
                  {bookItems.length ? (
                    <div className="admin-list">
                      {bookItems.map((item) =>
                        renderContentItem("books", item),
                      )}
                    </div>
                  ) : !bookLoading ? (
                    <EmptyState title={t("content.empty.books")} />
                  ) : null}
                  <PageButtons
                    page={bookPage}
                    count={bookCount}
                    onChange={setBookPage}
                  />
                </Surface>
              ) : null}

              {tab === "questions" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.questions")}</span>
                      <strong>
                        {questionLoading
                          ? t("shared.loading")
                          : formatNumber(locale, questionCount)}
                      </strong>
                    </div>
                  </div>
                  <form
                    className="admin-filter-form"
                    onSubmit={submitQuestionSearch}
                  >
                    <Input
                      aria-label={t("content.filters.searchQuestions")}
                      value={questionDraft}
                      placeholder={t("content.filters.searchQuestions")}
                      onChange={(event) =>
                        setQuestionDraft(event.currentTarget.value)
                      }
                    />
                    <Select
                      aria-label={t("content.filters.questionStatus")}
                      value={questionStatus}
                      onChange={(event) => {
                        setQuestionPage(1);
                        setQuestionStatus(
                          event.currentTarget.value as
                            | QuestionStatusFilter
                            | "",
                        );
                      }}
                    >
                      {questionStatusOptions.map((option) => (
                        <option value={option} key={option || "all"}>
                          {option
                            ? adminStatusLabel(t, option)
                            : t("content.filters.allQuestions")}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit">{t("shared.filter")}</Button>
                  </form>
                  {questionLoading ? <LoadingState variant="compact" /> : null}
                  {questionResult?.items.length ? (
                    <div className="admin-list">
                      {questionResult.items.map(renderQuestion)}
                    </div>
                  ) : !questionLoading ? (
                    <EmptyState title={t("content.empty.questions")} />
                  ) : null}
                  <PageButtons
                    page={questionPage}
                    count={questionCount}
                    onChange={setQuestionPage}
                  />
                </Surface>
              ) : null}

              {tab === "answers" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.answers")}</span>
                      <strong>
                        {answerLoading
                          ? t("shared.loading")
                          : formatNumber(locale, answerCount)}
                      </strong>
                    </div>
                  </div>
                  <form
                    className="admin-filter-form"
                    onSubmit={submitAnswerSearch}
                  >
                    <Input
                      aria-label={t("content.filters.searchAnswers")}
                      value={answerDraft}
                      placeholder={t("content.filters.searchAnswers")}
                      onChange={(event) =>
                        setAnswerDraft(event.currentTarget.value)
                      }
                    />
                    <Select
                      aria-label={t("content.filters.answerStatus")}
                      value={answerStatus}
                      onChange={(event) => {
                        setAnswerPage(1);
                        setAnswerStatus(
                          event.currentTarget.value as AnswerStatusFilter | "",
                        );
                      }}
                    >
                      {answerStatusOptions.map((option) => (
                        <option value={option} key={option || "all"}>
                          {option
                            ? adminStatusLabel(t, option)
                            : t("content.filters.allAnswers")}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit">{t("shared.filter")}</Button>
                  </form>
                  {answerLoading ? <LoadingState variant="compact" /> : null}
                  {answerResult?.items.length ? (
                    <div className="admin-list">
                      {answerResult.items.map(renderAnswer)}
                    </div>
                  ) : !answerLoading ? (
                    <EmptyState title={t("content.empty.answers")} />
                  ) : null}
                  <PageButtons
                    page={answerPage}
                    count={answerCount}
                    onChange={setAnswerPage}
                  />
                </Surface>
              ) : null}

              {tab === "discussions" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.discussions")}</span>
                      <strong>
                        {discussionLoading
                          ? t("shared.loading")
                          : formatNumber(locale, discussionCount)}
                      </strong>
                    </div>
                  </div>
                  {discussionLoading ? (
                    <LoadingState variant="compact" />
                  ) : null}
                  {discussionItems.length ? (
                    <div className="admin-list">
                      {discussionItems.map((item) =>
                        renderContentItem("discussions", item),
                      )}
                    </div>
                  ) : !discussionLoading ? (
                    <EmptyState title={t("content.empty.discussions")} />
                  ) : null}
                  <PageButtons
                    page={discussionPage}
                    count={discussionCount}
                    onChange={setDiscussionPage}
                  />
                </Surface>
              ) : null}

              {tab === "dynamics" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.dynamics")}</span>
                      <strong>
                        {dynamicLoading
                          ? t("shared.loading")
                          : formatNumber(locale, dynamicCount)}
                      </strong>
                    </div>
                  </div>
                  {dynamicLoading ? <LoadingState variant="compact" /> : null}
                  {dynamicItems.length ? (
                    <div className="admin-list">
                      {dynamicItems.map((item) =>
                        renderContentItem("dynamics", item),
                      )}
                    </div>
                  ) : !dynamicLoading ? (
                    <EmptyState title={t("content.empty.dynamics")} />
                  ) : null}
                  <PageButtons
                    page={dynamicPage}
                    count={dynamicCount}
                    onChange={setDynamicPage}
                  />
                </Surface>
              ) : null}

              {tab === "users" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.users")}</span>
                      <strong>
                        {userLoading
                          ? t("shared.loading")
                          : formatNumber(locale, userCount)}
                      </strong>
                    </div>
                  </div>
                  <form
                    className="admin-filter-form user-filter-form"
                    onSubmit={submitUserSearch}
                  >
                    <Input
                      aria-label={t("content.filters.searchUsers")}
                      value={userDraft}
                      placeholder={t("content.filters.searchUsers")}
                      onChange={(event) =>
                        setUserDraft(event.currentTarget.value)
                      }
                    />
                    <Select
                      aria-label={t("content.filters.userStatus")}
                      value={userStatus}
                      onChange={(event) => {
                        setUserPage(1);
                        setUserStatus(
                          event.currentTarget.value as UserStatusFilter | "",
                        );
                      }}
                    >
                      <option value="">{t("content.filters.allUsers")}</option>
                      {userStatusOptions.map((option) => (
                        <option value={option} key={option}>
                          {adminStatusLabel(t, option)}
                        </option>
                      ))}
                    </Select>
                    <Checkbox
                      id="admin-staff-only"
                      label={t("content.filters.staffOnly")}
                      checked={staffOnly}
                      onCheckedChange={(checked) => {
                        setUserPage(1);
                        setStaffOnly(checked === true);
                      }}
                    />
                    <Button type="submit">{t("shared.filter")}</Button>
                  </form>
                  {userLoading ? <LoadingState variant="compact" /> : null}
                  {userResult?.items.length ? (
                    <div className="admin-list">
                      {userResult.items.map(renderUser)}
                    </div>
                  ) : !userLoading ? (
                    <EmptyState title={t("content.empty.users")} />
                  ) : null}
                  <PageButtons
                    page={userPage}
                    count={userCount}
                    onChange={setUserPage}
                  />
                </Surface>
              ) : null}

              {tab === "tags" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.tags")}</span>
                      <strong>
                        {tagLoading
                          ? t("shared.loading")
                          : formatNumber(locale, tagCount)}
                      </strong>
                    </div>
                  </div>
                  {tagLoading ? <LoadingState variant="compact" /> : null}
                  {tagItems.length ? (
                    <div className="admin-list">
                      {tagItems.map(renderTagItem)}
                    </div>
                  ) : !tagLoading ? (
                    <EmptyState title={t("content.empty.tags")} />
                  ) : null}
                  <PageButtons
                    page={tagPage}
                    count={tagCount}
                    onChange={setTagPage}
                  />
                </Surface>
              ) : null}

              {tab === "cultivation" ? (
                <Surface className="admin-panel">
                  <div className="panel-heading large">
                    <div>
                      <span>{t("content.panels.cultivation")}</span>
                      <strong>
                        {permissionLoading
                          ? t("shared.loading")
                          : formatNumber(locale, permissionCount)}
                      </strong>
                    </div>
                  </div>
                  {permissionLoading ? (
                    <LoadingState variant="compact" />
                  ) : null}
                  {!permissionLoading && permissionRules.length ? (
                    <form
                      className="admin-permission-form"
                      onSubmit={savePermissions}
                    >
                      <div className="admin-permission-list">
                        {permissionGroups.map((group) => (
                          <section
                            className="admin-permission-group"
                            key={group.key}
                          >
                            <div className="admin-permission-group-head">
                              <strong>{group.label}</strong>
                              <span>
                                {t("content.counts.items", {
                                  count: group.items.length,
                                  displayCount: formatNumber(
                                    locale,
                                    group.items.length,
                                  ),
                                })}
                              </span>
                            </div>
                            <div className="admin-permission-group-list">
                              {group.items.map(renderPermissionRule)}
                            </div>
                          </section>
                        ))}
                      </div>
                      <div className="admin-permission-actions">
                        <Button
                          type="button"
                          disabled={permissionSaving}
                          onClick={() => void loadPermissions()}
                        >
                          {t("shared.reset")}
                        </Button>
                        <Button
                          variant="primary"
                          pending={permissionSaving}
                          type="submit"
                        >
                          {permissionSaving
                            ? t("shared.saving")
                            : t("content.permissions.save")}
                        </Button>
                      </div>
                    </form>
                  ) : !permissionLoading ? (
                    <EmptyState title={t("content.empty.permissions")} />
                  ) : null}
                </Surface>
              ) : null}
            </section>
          </Tabs>
        ) : null}
      </main>
    </div>
  );
}

function AdminPage() {
  const { t } = useFeatureTranslation("admin");
  const [searchParams, setSearchParams] = useSearchParams();
  const query = parseAdminWorkspaceQuery(searchParams);
  const accessState = useAdminWorkspaceAccess();
  const access = accessState.kind === "ready" ? accessState.access : null;
  const activeView = access ? firstAllowedAdminView(access, query.view) : null;
  const contentSection: AdminContentSection =
    access?.isAdmin ||
    query.section === "questions" ||
    query.section === "answers"
      ? query.section
      : "questions";
  const systemSection = access?.systemSections[query.systemSection]
    ? query.systemSection
    : (Object.entries(access?.systemSections || {}).find(
        ([, allowed]) => allowed,
      )?.[0] as typeof query.systemSection | undefined) || "overview";

  useEffect(() => {
    if (!access || !activeView) return;
    if (activeView !== query.view) {
      setSearchParams(
        adminWorkspaceViewSearchParams(searchParams, activeView),
        { replace: true },
      );
      return;
    }
    if (activeView === "content" && contentSection !== query.section) {
      setSearchParams(
        adminContentSectionSearchParams(searchParams, contentSection),
        { replace: true },
      );
      return;
    }
    if (activeView === "system" && systemSection !== query.systemSection) {
      setSearchParams(
        adminSystemSectionSearchParams(searchParams, systemSection),
        { replace: true },
      );
    }
  }, [
    access,
    activeView,
    contentSection,
    query.section,
    query.systemSection,
    query.view,
    searchParams,
    setSearchParams,
    systemSection,
  ]);

  const selectView = (view: AdminView) => {
    setSearchParams(adminWorkspaceViewSearchParams(searchParams, view));
  };
  const selectContentSection = (section: AdminContentSection) => {
    setSearchParams(adminContentSectionSearchParams(searchParams, section));
  };
  const view = activeView || "home";

  return (
    <>
      <Helmet title={t(`documentTitles.${view}`)} />
      <SiteTopbar />
      {accessState.kind === "loading" ? (
        <main className="admin-workspace-route-state">
          <LoadingState variant="panel" />
        </main>
      ) : null}
      {accessState.kind === "denied" ? (
        <main className="admin-workspace-route-state">
          <section>
            <h1>{t("access.denied")}</h1>
          </section>
        </main>
      ) : null}
      {accessState.kind === "unavailable" ? (
        <main className="admin-workspace-route-state">
          <section>
            <h1>{t("access.unavailable")}</h1>
          </section>
        </main>
      ) : null}
      {access && activeView ? (
        <AdminWorkspaceShell
          access={access}
          view={activeView}
          onViewChange={selectView}
        >
          {activeView === "home" ? (
            <AdminHomeView access={access} onViewChange={selectView} />
          ) : null}
          {activeView === "content" ? (
            <AdminContentManagement
              isAdmin={access.isAdmin}
              section={contentSection}
              onSectionChange={selectContentSection}
            />
          ) : null}
          {activeView === "review" ? (
            <ReviewWorkbench
              query={query}
              onQueryChange={(patch) =>
                setSearchParams(adminReviewSearchParams(searchParams, patch))
              }
            />
          ) : null}
          {activeView === "refunds" ? (
            <WalletRefundsView
              uid={access.actorUID}
              canReview={access.walletCapabilities["wallet.refund.review"]}
              canRevoke={access.walletCapabilities["wallet.refund.revoke"]}
            />
          ) : null}
          {activeView === "risk" ? (
            <WalletRiskView
              uid={access.actorUID}
              canReview={access.walletCapabilities["wallet.risk.review"]}
              canRestrict={access.walletCapabilities["wallet.risk.restrict"]}
              canReconcile={access.walletCapabilities["wallet.reconciliation.manage"]}
              canCoverage={access.walletCapabilities["wallet.coverage.manage"]}
              canViewPolicy={access.walletCapabilities["wallet.policy.view"]}
              canConfigurePolicy={access.walletCapabilities["wallet.policy.configure"]}
            />
          ) : null}
          {activeView === "system" ? (
            <SystemOperationsView
              access={access}
              section={systemSection}
              onSectionChange={(section) =>
                setSearchParams(
                  adminSystemSectionSearchParams(searchParams, section),
                )
              }
            />
          ) : null}
        </AdminWorkspaceShell>
      ) : null}
    </>
  );
}

export default AdminPage;

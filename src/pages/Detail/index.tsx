import {
  AnimateScrollProgress,
  AnimateTabs,
  AnimateTabsList,
  AnimateTabsTrigger,
  Code,
  CodeBlock,
  CodeHeader,
  Icon,
  type IconName,
  AnimateButton,
  useNoticeToasts,
} from "components/ui";
import { createRoot } from "react-dom/client";
import { FileCode2 } from "lucide-react";
import { publicEnv } from "@/app/config/env";
import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SiteIcpLink from "@/components/SiteIcpLink";
import SiteTopbar from "@/components/SiteTopbarShell";
import UserIdentity from "@/components/UserIdentity";
import {
  ContentCommentMoreMenu,
  ContentCommentThreadList,
  ContentCommentVotes,
} from "@/features/comments/ContentCommentThreadList";
import { useContentReadEvent } from "@/features/content-analytics/useContentReadEvent";
import BookProfileDialog from "@/features/publish/BookProfileDialog";
import {
  ReportDialog,
  type ReportTarget,
  type ReportTargetType,
} from "@/features/reporting";
import { Alert, Button, Form, Modal } from "@/components/ui/compat";
import katex from "katex";

import AvatarName from "@/components/AvatarName";
import CodeMirrorEditor, {
  type CodeMirrorEditorHandle,
  type CodeMirrorSelection,
} from "@/components/CodeMirrorEditor";
import CollectionFolderDialog from "@/components/CollectionFolderDialog";
import CultivationBadge from "@/components/CultivationBadge";
import InternalContentLinkPreview from "@/components/InternalContentLinkPreview";
import LoadingState from "@/components/LoadingState";
import DocumentMetadataController, { absolutePublicUrl } from "@/components/DocumentMetadataController";
import MilkdownMarkdownArticle from "@/components/MilkdownMarkdownArticle";
import MathText, { MathInline } from "@/components/MathText";
import PublicationProgressPanel from "@/components/PublicationProgressPanel";
import TipButton from "@/features/wallet/TipButton";
import RinMilkdownEditor, {
  type RinMilkdownEditorHandle,
} from "@/components/RinMilkdownEditor";
import RinStickerPicker from "@/components/RinStickerPicker";
import TagPicker, {
  joinTagValues,
  splitTagValues,
} from "@/components/TagPicker";
import { formatDate, formatNumber } from "@/i18n/format";
import { localizedErrorMessage } from "@/i18n/errors";
import { useResolvedLocale } from "@/i18n/LanguageProvider";
import type { LocaleId } from "@/i18n/types";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import {
  blogEditPath,
  blogEditorKind,
  giteaSourceFilePageUrl,
  markdownBlogHtml,
  markdownBlogSource,
  markdownStoredArticleRender,
  markdownToHtml,
  markdownSourceFile,
  rinWriterSourceFile,
  rinWriterSourceFallbackFile,
  typstSourceFile,
} from "@/utils/blogBody";
import { removeMatchingArticleDocumentTitle } from "@/utils/articleHtml";
import { articleGiteaSourcePath } from "@/utils/giteaPaths";
import { prefixInlineSvgIds } from "@/utils/inlineSvgIds";
import { markdownWithoutMatchingTitle } from "@/utils/markdownTitle";
import { contentTypeMetaChar } from "@/utils/contentTypeMeta";
import { contentEditDestination } from "@/utils/contentEditDestination";
import { rinArticleHydrationPlan } from "@/utils/rinArticleHydration";
import { normalizeRinCodeLanguage } from "@/utils/rinCodeHighlight";
import {
  hydrateRinMathJaxOfficialMenu,
  hydrateRinMathJaxStretchyMath,
} from "@/utils/rinMathJaxMenu";
import {
  prefixRinWriterDiagramSvgIds,
  sanitizeRinWriterDiagramSvgUses,
} from "@/utils/rinWriterSvg";
import {
  queryReactionUsers,
  queryReactions,
  queryRepostUsers,
  updateReaction,
} from "@/services/domains/activity";
import {
  loadRelatedBooks,
  loadContentDetail,
  readCachedContentDetail,
} from "@/services/domains/article";
import {
  createBookChapterErratum,
  createBookChapterThread,
  loadBookActivity,
  loadBookContext,
  loadBookReaderPage,
  loadBookReviews,
  loadBookChapterActivity,
  submitBookReview,
  updateBookChapterErratumStatus,
} from "@/services/domains/book";
import {
  createComment,
  deleteComment,
  loadComments,
  repostContent,
  followTarget,
  switchCollection,
  likePost,
  updateComment,
} from "@/services/domains/discussion";
import {
  loadCurrentUserInfo,
  loadPersonalRankPage,
  loadPersonalUserInfo,
  searchUserInfo,
} from "@/services/domains/identity";
import {
  listRevisions,
  postAnswerStyleVote,
} from "@/services/domains/moderation";
import {
  uploadAnswerFile,
} from "@/services/domains/publication";
import {
  acceptAnswerById,
  closeQuestion,
  createAnswerByQuestion,
  deleteAnswerById,
  deleteQuestion,
  loadAnswerQuestionPage,
  loadLinkedAnswerQuestionPage,
  loadQuestionDetail,
  loadQuestionInviteUsers,
  readCachedQuestionDetail,
  loadSimilarQuestionsByTitle,
  loadSimilarQuestionsByTag,
  recoverQuestion,
  reopenQuestion,
  updateAnswerById,
  updateQuestion,
  updateQuestionInviteUsers,
} from "@/services/domains/question";
import type {
  AnswerSummary,
  AnswerQuestionInfo,
  AnswerUserBasicInfo,
  AnswerUserInfo,
  BookReviewOrder,
  BookRatingSummary,
  BookReview,
  BookActivityItem,
  BookActivityKind,
  BookContextSummary,
  BookChapterActivityDetail,
  BookChapterActivityResponse,
  BookChapterActivitySummary,
  BookChapterThread,
  BookChapterThreadKind,
  BookChapterErratumStatus,
  BookReaderPageResponse,
  BookTOCItem,
  CommentSummary,
  CollectionTargetInput,
  CollectionFolder,
  ContentType,
  CreateCommentInput,
  FeedItem,
  FeedTagItem,
  PostDetail,
  QuestionDetail,
  ReactionItem,
  ReactionUserItem,
  RepostUserItem,
  RevisionObjectType,
  RevisionSummary,
} from "@/services/contracts";
import { getStoredSession } from "@/services/phoneAuth";
import { ServiceError } from "@/services/httpClient";
import BookAnnotationsLayer from "@/features/book-reader/annotations/BookAnnotationsLayer";
import {
  PublicationProgressPoller,
  type PublicationProgress,
} from "@/services/publicationProgress";
import { getCurrentUser } from "@/services/profile";
import type {
  RinPageContextAnswer,
  RinPageContextComment,
  RinPageContextDraft,
  RinPageContextSection,
  RinPageContextSnapshot,
} from "@/types/rinPageContext";
import { appendRinStickerToken, type RinSticker } from "@/utils/rinStickers";
import { polishRinBibliographyDocument } from "@/utils/wikiLinks";
import {
  contentPath,
  contentTitleSlug,
  legacyTagPath,
  tagReadPath,
  bookChapterPath,
  bookReadingPath,
  bookWorkspacePath,
  profilePath as routeProfilePath,
  questionPath as routeQuestionPath,
} from "@/utils/routes";

type DetailKind = Exclude<ContentType, "task" | "tag">;

type DetailPageProps = {
  kind: DetailKind;
  view?: "overview" | "read";
  variant?: "typographyTest";
};

const blogTypographyTestContentOrigin = "https://rinspace.com";

type VoteTargetType = "question" | "answer" | "comment" | "book_review";
type VoteDirection = "up" | "down";
type VoteSnapshot = {
  count: number;
  status: string;
  upCount?: number;
  downCount?: number;
};
type AnswerOrder = "hot" | "asc" | "desc";
type ContentCommentOrder = "hot" | "latest";

type CommentTargetType = CreateCommentInput["targetType"];
type DiscussionReplyView = "all" | "owner";
type DiscussionReplyOrder = "hot" | "asc" | "desc";
type BookChapterActivityTab = "discussions" | "questions" | "errata";
type BookChapterActivityDialog = "" | BookChapterActivityTab;
type BookChapterComposer = "" | BookChapterActivityTab;

type CommentTargetRef = {
  targetType: CommentTargetType;
  targetId?: number;
  slug?: string;
};

type CommentFormOptions = {
  className?: string;
  contentComposer?: boolean;
  editorKeySuffix?: string;
  formId?: string;
  replyContextUnit?: string;
  withAvatar?: boolean;
};

type FloorReplyDraft = {
  parentId: number;
  replyToCommentId: number;
  floorNumber?: number;
  author: string;
};

function isAuthenticationFailure(error: unknown) {
  return (
    error instanceof ServiceError &&
    (error.status === 401 ||
      error.code === "authentication.required" ||
      error.code === "unauthorized")
  );
}

type InlineDynamicReplyTarget = FloorReplyDraft & {
  anchorCommentId: number;
};

type DetailParticipant = {
  key: string;
  name: string;
  profileId?: string;
  avatar?: string;
  rank?: number;
};

type DetailCurrentUser = {
  id?: string;
  phone?: string;
  username?: string;
  display_name?: string;
  displayName?: string;
  rank?: number;
  role_id?: number;
  role_name?: string;
  roleName?: string;
  user_metadata?: Record<string, unknown>;
  avatar?: {
    custom?: string;
    gravatar?: string;
    type?: string;
  };
};

function detailCurrentUserName(
  currentUser: DetailCurrentUser | null,
  anonymousName: string,
  phoneUser: (suffix: string) => string,
) {
  const metadata = currentUser?.user_metadata || {};
  return (
    currentUser?.display_name ||
    currentUser?.displayName ||
    currentUser?.username ||
    (typeof metadata.nickName === "string" ? metadata.nickName : "") ||
    (typeof metadata.nickname === "string" ? metadata.nickname : "") ||
    (currentUser?.phone ? phoneUser(currentUser.phone.slice(-4)) : "") ||
    anonymousName
  );
}

function detailCurrentUserAvatar(currentUser: DetailCurrentUser | null) {
  const metadata = currentUser?.user_metadata || {};
  return (
    currentUser?.avatar?.custom ||
    currentUser?.avatar?.gravatar ||
    (typeof metadata.avatarUrl === "string" ? metadata.avatarUrl : "") ||
    (typeof metadata.avatar_url === "string" ? metadata.avatar_url : "") ||
    (typeof metadata.picture === "string" ? metadata.picture : "")
  );
}

function codeBlockLanguage(pre: HTMLPreElement, code: HTMLElement) {
  const dataLanguage =
    pre.dataset.rinCodeLanguage || code.dataset.language || "";
  const classLanguage =
    Array.from(code.classList)
      .find((className) => className.startsWith("language-"))
      ?.replace(/^language-/, "") || "";
  return normalizeRinCodeLanguage(dataLanguage || classLanguage);
}

function mountRinCodeBlock(
  originalPre: HTMLPreElement,
  source: string,
  language: string,
  html: string | undefined,
  signal: AbortSignal,
) {
  const mount = document.createElement("div");
  mount.className = "rin-code-mount";
  originalPre.replaceWith(mount);
  const root = createRoot(mount);
  signal.addEventListener("abort", () => root.unmount(), { once: true });
  root.render(
    <Code code={source}>
      <CodeHeader icon={FileCode2} copyButton>
        {language || "text"}
      </CodeHeader>
      <CodeBlock code={html ? undefined : source} lang={language} html={html} />
    </Code>,
  );
}

function decorateFinalRinCodeBlocks(root: HTMLElement, signal: AbortSignal) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLPreElement>("pre"),
  ).filter(
    (pre) =>
      !pre.closest(".rin-code-mount") && !pre.closest(".rin-reader-diagram"),
  );
  blocks.forEach((pre) => {
    if (signal.aborted || pre.closest(".rin-code-mount")) return;
    const code = pre.querySelector<HTMLElement>("code");
    if (!code) return;
    const source = code.textContent || "";
    const canonicalLanguage = codeBlockLanguage(pre, code);
    const sourceLanguage = (
      pre.dataset.rinCodeLanguage ||
      code.dataset.language ||
      ""
    )
      .trim()
      .slice(0, 128);
    const label =
      canonicalLanguage ||
      sourceLanguage ||
      (pre.classList.contains("shiki") ? "code" : "text");
    pre.classList.add("rin-code-pre");
    if (canonicalLanguage) pre.dataset.rinCodeLanguage = canonicalLanguage;
    mountRinCodeBlock(pre, source, label, pre.outerHTML, signal);
  });
}

function enhanceRinCodeBlocks(root: HTMLElement, signal: AbortSignal) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLPreElement>("pre"),
  ).filter(
    (pre) =>
      !pre.closest(".rin-code-mount") && !pre.closest(".rin-reader-diagram"),
  );
  blocks.forEach((pre) => {
    if (signal.aborted || pre.closest(".rin-code-mount")) return;
    const originalCode = pre.querySelector<HTMLElement>("code");
    const source = originalCode?.textContent || pre.textContent || "";
    const language = codeBlockLanguage(pre, originalCode || pre);
    mountRinCodeBlock(pre, source, language, undefined, signal);
  });
}

type InviteCandidate = Pick<
  AnswerUserBasicInfo,
  "id" | "username" | "display_name" | "avatar" | "rank" | "status"
> & {
  answerCount?: number;
  questionCount?: number;
};

type MentionCandidate = Pick<
  AnswerUserBasicInfo,
  "id" | "username" | "display_name" | "avatar" | "rank" | "status"
> & {
  answerCount?: number;
  questionCount?: number;
};

type MentionQueryState = {
  key: string;
  query: string;
  from: number;
  to: number;
};

type RinArchiveInfo = {
  filename: string;
  mime: string;
  bytes?: number;
  url: string;
};

type BlogTocItem = {
  id: string;
  text: string;
  level: 2 | 3 | 4;
};

type BlogTocNode = BlogTocItem & {
  children: BlogTocNode[];
};

type BookTOCNode = BookTOCItem & {
  id: string;
  chapterKey: string;
  tocIndex: number;
  level: number;
  children: BookTOCNode[];
};

const reactionIconClass: Record<string, IconName> = {
  heart: "heart",
  smile: "emoji-smile",
  frown: "emoji-frown",
};

const discussionCommentPageSize = 50;
const trustedQuestionEditCultivation = 10000;
const blogTocScrollOffset = 112;

function bookTOCLevel(item: BookTOCItem) {
  const level = Math.trunc(item.level || 1);
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(8, level));
}

function bookChapterSlug(value: string) {
  const normalized = value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  let result = "";
  let previousDash = false;
  for (const character of normalized) {
    const keep =
      (character >= "a" && character <= "z") ||
      (character >= "0" && character <= "9") ||
      /[\u4e00-\u9fff]/u.test(character);
    if (keep) {
      result += character;
      previousDash = false;
    } else if (!previousDash) {
      result += "-";
      previousDash = true;
    }
  }
  result = result.replace(/^-+|-+$/g, "").replace(/--+/g, "-");
  return result || "chapter";
}

function bookChapterKey(index: number, item: BookTOCItem) {
  const level = Math.max(1, Math.min(6, Math.trunc(item.level || 1) || 1));
  const page =
    typeof item.page === "number" && Number.isFinite(item.page)
      ? Math.max(0, Math.trunc(item.page))
      : 0;
  return `c-${String(Math.max(1, index + 1)).padStart(3, "0")}-l${level}-p${page}-${bookChapterSlug(item.title).slice(0, 72)}`;
}

function buildBookTOCTree(items: BookTOCItem[]) {
  const roots: BookTOCNode[] = [];
  const stack: BookTOCNode[] = [];
  items.forEach((item, index) => {
    const level = bookTOCLevel(item);
    const node: BookTOCNode = {
      ...item,
      id: `${index}-${level}-${item.title}`,
      chapterKey: bookChapterKey(index, item),
      tocIndex: index,
      level,
      children: [],
    };
    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });
  return roots;
}

function collectCollapsibleBookTOCNodeIds(nodes: BookTOCNode[]) {
  const ids = new Set<string>();
  const visit = (node: BookTOCNode) => {
    if (node.children.length) {
      ids.add(node.id);
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return ids;
}

function userMetadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
) {
  if (!metadata) return "";
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function userMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
) {
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function dateLabel(value: string, locale: LocaleId) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(locale, date, {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function profilePath(userId: string | undefined | null) {
  return routeProfilePath(userId);
}

function authorProfileId(
  userId: string | undefined | null,
  uid?: string | undefined | null,
) {
  return (userId || uid || "").trim();
}

function authorProfilePath(
  userId: string | undefined | null,
  uid?: string | undefined | null,
) {
  const profileId = authorProfileId(userId, uid);
  return profileId ? routeProfilePath(profileId) : "/users";
}

function sameUserId(
  left: string | undefined | null,
  right: string | undefined | null,
) {
  const normalizedLeft = (left || "").trim();
  const normalizedRight = (right || "").trim();
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
}

function normalizeAuthorKey(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

function isPostOwnerComment(post: PostDetail, comment: CommentSummary) {
  const ownerUid = post.authorUid || post.authorId;
  if (sameUserId(comment.authorUid, ownerUid)) {
    return true;
  }
  const ownerKeys = new Set(
    [post.authorUid, post.authorId, post.author]
      .map(normalizeAuthorKey)
      .filter(Boolean),
  );
  return [comment.authorUid, comment.authorId, comment.author]
    .map(normalizeAuthorKey)
    .some((key) => ownerKeys.has(key));
}

function displayTypeClass(type: DetailKind) {
  if (type === "forum") return "discussion";
  if (type === "status") return "dynamic";
  return type;
}

function detailTypePath(type: DetailKind) {
  switch (displayTypeClass(type)) {
    case "blog":
      return "/blog";
    case "question":
      return "/questions";
    case "discussion":
      return "/discussions";
    case "announcement":
      return "/announcements";
    case "dynamic":
      return "/dynamics";
    case "book":
      return "/books";
    default:
      return "/";
  }
}

function TypeMetaCategory({
  type,
  label,
}: {
  type: DetailKind;
  label: string;
}) {
  const displayType = displayTypeClass(type);
  return (
    <span
      className={`meta-category content-type-meta content-type-meta-${displayType}`}
      title={label}
    >
      <Link to={detailTypePath(type)}>
        <span className="char" aria-hidden="true">
          {contentTypeMetaChar(displayType, label.slice(0, 1).toLowerCase())}
        </span>
        <span className="label">{label}</span>
      </Link>
    </span>
  );
}

function detailMetaText(post: PostDetail, type: DetailKind) {
  if (type !== "forum" && type !== "announcement") return "";
  return post.forumSection?.trim() || "";
}

function tagsFor(post: Pick<PostDetail, "tags">) {
  return post.tags.length ? post.tags : ["general"];
}

function detailSearchGraph(post: PostDetail, canonicalPath: string) {
  const canonical = absolutePublicUrl(canonicalPath);
  const pageId = `${canonical}#webpage`;
  const entityId = `${canonical}#entity`;
  const entity: Record<string, unknown> = {
    '@type': post.type === 'book' ? 'Book' : 'BlogPosting',
    '@id': entityId,
    name: post.title,
    description: post.searchDescription || post.excerpt || undefined,
    url: canonical,
    datePublished: post.publishedAt || post.createdAt || undefined,
    dateModified: post.contentUpdatedAt || post.updatedAt || undefined,
  };
  if (post.type === 'blog' && post.author && post.authorId) {
    const authorUrl = absolutePublicUrl(`/@${encodeURIComponent(post.authorId.replace(/^@+/, ''))}`);
    entity.author = { '@type': 'Person', '@id': `${authorUrl}#person`, name: post.author, url: authorUrl };
  }
  const about = (post.tagItems || [])
    .filter((tag) => tag.tagId && tag.slugName)
    .map((tag) => {
      const url = absolutePublicUrl(tagReadPath(tag.tagId, tag.slugName));
      return { '@type': 'DefinedTerm', '@id': `${url}#entity`, name: tag.displayName || tag.slugName, url };
    });
  if (about.length) entity.about = about;
  if (post.type === 'book' && post.book) {
    const authors = post.book.authorEntities?.length
      ? post.book.authorEntities.map((author, index) => ({
        '@type': 'Person', '@id': `${canonical}#author-${index + 1}`, name: author.name,
        ...(author.officialUrl ? { sameAs: author.officialUrl } : {}),
      }))
      : post.book.authors.map((name) => ({ '@type': 'Person', name }));
    if (authors.length) entity.author = authors;
    const isbn = (post.book.isbn || []).map((item) => item.value).filter(Boolean);
    if (isbn.length) entity.isbn = isbn;
    if (post.book.doi) entity.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: post.book.doi };
    if (post.book.publisher) entity.publisher = { '@type': 'Organization', name: post.book.publisher };
    if (post.book.editionNumber) entity.bookEdition = post.book.editionNumber;
    if (post.book.numberOfPages) entity.numberOfPages = post.book.numberOfPages;
    if (post.book.seriesTitle) entity.isPartOf = { '@type': 'CreativeWorkSeries', name: post.book.seriesTitle };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': pageId, name: post.title, url: canonical, mainEntity: { '@id': entityId } },
      entity,
    ],
  };
}

type DetailTagLink = {
  key: string;
  label: string;
  to: string;
};

function tagLinksFor(
  post: Pick<PostDetail, "tags" | "tagItems">,
): DetailTagLink[] {
  if (post.tagItems?.length) {
    return post.tagItems.map((tag: FeedTagItem) => ({
      key: tag.tagId,
      label: tag.displayName || tag.slugName,
      to: tagReadPath(tag.tagId, tag.slugName),
    }));
  }
  return tagsFor(post).map((tag) => ({
    key: `legacy:${tag}`,
    label: tag,
    to: legacyTagPath(tag),
  }));
}

function rinContextComment(comment: CommentSummary): RinPageContextComment {
  return {
    id: comment.id,
    author: comment.author,
    body: comment.body,
    voteCount: comment.voteCount,
    replyToAuthor: comment.replyToAuthor,
  };
}

function nonEmptyDraft(
  label: string,
  body: string,
): RinPageContextDraft | null {
  const trimmed = body.trim();
  return trimmed ? { label, body: trimmed } : null;
}

function appendDraft(
  drafts: RinPageContextDraft[],
  label: string,
  body: string,
) {
  const draft = nonEmptyDraft(label, body);
  if (draft) drafts.push(draft);
}

function avatarFromMap(
  author: string,
  directAvatar: string | undefined,
  avatarMap: Record<string, string>,
) {
  return directAvatar || avatarMap[author] || "";
}

type AuthorProfileMeta = {
  avatar: string;
  rank?: number;
};

function rankFromMap(
  author: string,
  directRank: number | undefined,
  profileMap: Record<string, AuthorProfileMeta>,
) {
  return directRank ?? profileMap[author]?.rank;
}

function extractMarkedSection(body: string, marker: string) {
  const startMarker = `[[${marker}]]`;
  const endMarker = `[[/${marker}]]`;
  const start = body.indexOf(startMarker);
  if (start < 0) return "";
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return "";
  return body.slice(start + startMarker.length, end).trim();
}

function rinWriterHtml(body: string) {
  return extractMarkedSection(body, "RIN_WRITER");
}

function markdownBookReaderJson(body: string) {
  return extractMarkedSection(body, "RIN_MARKDOWN_BOOK");
}

function editableBookWorkspaceKind(kindValue: string | undefined) {
  return kindValue === "original" || kindValue === "markdown" || kindValue === "typst";
}

type BlogArticleOutput = {
  html: string;
  serverFinal: boolean;
};

function blogArticleOutput(post: PostDetail): BlogArticleOutput {
  if (blogEditorKind(post) === "markdown") {
    const stored = markdownStoredArticleRender(post.body);
    if (stored) {
      return { html: stored.html, serverFinal: true };
    }
    return { html: "", serverFinal: false };
  }
  const storedHtml = rinWriterHtml(post.body);
  return {
    html: storedHtml,
    serverFinal: Boolean(storedHtml),
  };
}

function markdownArticleHtml(
  body: string,
  options: { deferMath?: boolean } = {},
) {
  const source = markdownBlogSource(body);
  if (source)
    return markdownToHtml(source, { deferMath: options.deferMath ?? true });
  return markdownToHtml(body, { deferMath: options.deferMath ?? true });
}

function hasBlogArticleBody(post: PostDetail) {
  if (blogEditorKind(post) === "markdown") {
    return Boolean(markdownStoredArticleRender(post.body));
  }
  return Boolean(rinWriterHtml(post.body));
}

function rinWriterArchive(body: string): RinArchiveInfo | null {
  const raw = extractMarkedSection(body, "RIN_ARCHIVE");
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object") {
      const archive = value as Record<string, unknown>;
      if (
        typeof archive.url !== "string" ||
        typeof archive.filename !== "string"
      ) {
        return null;
      }
      return {
        url: archive.url,
        filename: archive.filename,
        mime:
          typeof archive.mime === "string" ? archive.mime : "application/zip",
        bytes: typeof archive.bytes === "number" ? archive.bytes : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function formatBytes(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const blockedRinElements = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "link",
  "meta",
  "base",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "foreignobject",
  "mpath",
]);

const blockedRinAttributes = new Set([
  "attributename",
  "values",
  "from",
  "to",
  "by",
  "begin",
  "dur",
  "keytimes",
  "keysplines",
  "repeatcount",
  "data-action",
]);

const urlAttributes = new Set([
  "href",
  "src",
  "xlink:href",
  "formaction",
  "action",
  "poster",
  "data",
]);

function isSafeRinUrl(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return true;
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("data:image/")
  );
}

function normalizedTitleText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function slugifyHeading(value: string, fallback: string) {
  const slug = normalizedTitleText(value)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || fallback;
}

function uniqueHeadingId(
  base: string,
  existingIds: Set<string>,
  usedIds: Map<string, number>,
) {
  const nextCount = (usedIds.get(base) || 0) + 1;
  usedIds.set(base, nextCount);
  let candidate = nextCount === 1 ? base : `${base}-${nextCount}`;
  while (existingIds.has(candidate)) {
    const retryCount = (usedIds.get(base) || 0) + 1;
    usedIds.set(base, retryCount);
    candidate = `${base}-${retryCount}`;
  }
  existingIds.add(candidate);
  return candidate;
}

function removeGeneratedRinReaderToc(document: Document) {
  document.body
    .querySelectorAll(".rin-toc")
    .forEach((element) => element.remove());
}

function prepareRinWriterDocument(
  html: string,
  title: string,
  options: { removeGeneratedToc?: boolean } = {},
) {
  if (typeof window === "undefined") return "";
  const document = new DOMParser().parseFromString(html, "text/html");

  sanitizeRinWriterDiagramSvgUses(document.body);
  document.body.querySelectorAll("*").forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (blockedRinElements.has(tagName)) {
      element.remove();
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        blockedRinAttributes.has(name)
      ) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === "srcset") {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === "style" && /javascript:|expression\s*\(/i.test(value)) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (urlAttributes.has(name) && !isSafeRinUrl(value)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.tagName.toLowerCase() === "a") {
      element.setAttribute("rel", "noopener noreferrer");
      const href = element.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) element.setAttribute("target", "_blank");
    }
  });

  prefixRinWriterDiagramSvgIds(document);
  removeMatchingArticleDocumentTitle(document, title);
  if (options.removeGeneratedToc) {
    removeGeneratedRinReaderToc(document);
  }
  const firstSectionHeading = findFirstSectionHeading(document.body);
  if (firstSectionHeading) {
    firstSectionHeading.classList.add("rin-first-section-heading");
    firstSectionHeading.classList.add(
      hasVisibleContentBefore(document.body, firstSectionHeading)
        ? "rin-first-section-with-intro"
        : "rin-first-section-no-intro",
    );
  }

  const existingIds = new Set(
    Array.from(document.body.querySelectorAll("[id]"))
      .map((element) => element.id)
      .filter(Boolean),
  );
  const usedIds = new Map<string, number>();
  document.body.querySelectorAll("h2, h3, h4").forEach((heading, index) => {
    if (heading.id) return;
    const base = slugifyHeading(
      heading.textContent || "",
      `section-${index + 1}`,
    );
    heading.id = uniqueHeadingId(base, existingIds, usedIds);
  });

  return document;
}

const rinMathJaxCommonHtmlStyleSelector =
  'style.rin-mathjax-chtml-style[data-rin-math-engine="mathjax-chtml"]';
const rinMathJaxCommonHtmlStyleMaxBytes = 1024 * 1024;

function trustedRinMathJaxCommonHtmlStyleHtml(document: Document) {
  const styles = Array.from(
    document.head.querySelectorAll(rinMathJaxCommonHtmlStyleSelector),
  ).filter((element): element is HTMLStyleElement => {
    if (!(element instanceof HTMLStyleElement)) return false;
    const text = element.textContent || "";
    return (
      new Blob([text]).size <= rinMathJaxCommonHtmlStyleMaxBytes &&
      text.includes("mjx-container") &&
      text.includes("@font-face") &&
      text.includes("/fonts/mathjax-newcm/")
    );
  });

  if (!styles.length) return "";
  const seen = new Set<string>();
  return styles
    .map((style) => style.outerHTML)
    .filter((styleHtml) => {
      if (seen.has(styleHtml)) return false;
      seen.add(styleHtml);
      return true;
    })
    .join("\n");
}

function sanitizeRinWriterHtml(
  html: string,
  title: string,
  options: {
    removeGeneratedToc?: boolean;
    deferMath?: boolean;
    serverFinal?: boolean;
  } = {},
) {
  const document = prepareRinWriterDocument(html, title, options);
  if (!document) return "";
  const references = rinWriterReferenceMap(document);
  repairRinWriterCleverReferences(document, references);
  if (!options.serverFinal) {
    repairRenderedKatexLatexArtifacts(document, references);
    if (!options.deferMath) {
      renderRinMathTextNodes(document, references);
      repairRenderedKatexLatexArtifacts(document, references);
    }
  }
  polishRinBibliographyDocument(document);
  const trustedStyleHtml = trustedRinMathJaxCommonHtmlStyleHtml(document);
  const bodyHtml = document.body.innerHTML.trim();
  return [trustedStyleHtml, bodyHtml].filter(Boolean).join("\n").trim();
}

function isEscapedHtmlMathDelimiter(value: string, index: number) {
  let slashCount = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && value[cursor] === "\\";
    cursor -= 1
  ) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findHtmlMathDelimiterEnd(
  value: string,
  start: number,
  marker: string,
) {
  for (let index = start; index < value.length; index += 1) {
    if (
      !isEscapedHtmlMathDelimiter(value, index) &&
      value.startsWith(marker, index)
    ) {
      return index;
    }
  }
  return -1;
}

function appendRenderedHtmlMath(
  document: Document,
  fragment: DocumentFragment,
  value: string,
  displayMode: boolean,
  references?: Map<string, string>,
) {
  const diagram = readUnsupportedHtmlDiagram(value);
  if (diagram) {
    if (displayMode) {
      fragment.appendChild(createRinReaderDiagramFigure(document, diagram));
      return;
    }
    const wrapper = document.createElement("span");
    wrapper.className = "math-fragment";
    wrapper.textContent = value;
    fragment.appendChild(wrapper);
    return;
  }
  const wrapper = document.createElement("span");
  wrapper.className = displayMode
    ? "math-fragment math-fragment-display"
    : "math-fragment";
  wrapper.innerHTML = renderKatexReaderMath(value, displayMode, references);
  fragment.appendChild(wrapper);
}

const rinReaderMathEnvironmentNames = new Set([
  "aligned",
  "gathered",
  "split",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "smallmatrix",
]);

const rinReaderDisplayMathEnvironments = new Set([
  "align",
  "aligned",
  "gather",
  "multline",
  "equation",
  "eqnarray",
  "split",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "smallmatrix",
]);

function isSingleKatexEnvironment(value: string) {
  const match = value.match(/^\\begin\{([A-Za-z*]+)\}(?:\[[^\]]*\])?/);
  if (!match) return false;
  const environment = match[1];
  const endMarker = `\\end{${environment}}`;
  const endIndex = value.lastIndexOf(endMarker);
  return (
    endIndex >= 0 && value.slice(endIndex + endMarker.length).trim() === ""
  );
}

function hasTopLevelAlignment(value: string) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      if (value[index + 1] === "\\" && depth === 0) return true;
      index += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "&" && depth === 0) return true;
  }
  return false;
}

function closeUnbalancedKatexEnvironments(value: string) {
  const stack: string[] = [];
  const pattern = /\\(begin|end)\{([A-Za-z*]+)\}(?:\[[^\]]*\])?/g;
  let balanced = "";
  let lastIndex = 0;
  let match = pattern.exec(value);
  while (match) {
    const action = match[1];
    const environment = match[2];
    const normalized = environment.toLowerCase().replace(/\*$/, "");
    if (rinReaderMathEnvironmentNames.has(normalized)) {
      balanced += value.slice(lastIndex, match.index);
      if (action === "begin") {
        stack.push(environment);
        balanced += match[0];
      } else if (stack[stack.length - 1] === environment) {
        stack.pop();
        balanced += match[0];
      } else {
        const existing = stack.lastIndexOf(environment);
        if (existing >= 0) {
          const missing = stack.splice(existing + 1).reverse();
          balanced += missing
            .map((missingEnvironment) => `\\end{${missingEnvironment}}`)
            .join("");
          stack.pop();
          balanced += match[0];
        }
      }
      lastIndex = match.index + match[0].length;
    }
    match = pattern.exec(value);
  }
  if (lastIndex > 0) {
    balanced += value.slice(lastIndex);
    value = balanced;
  }
  if (!stack.length) return value;
  return `${value}${stack
    .reverse()
    .map((environment) => `\\end{${environment}}`)
    .join("")}`;
}

function repairKatexDelimiterCommands(value: string) {
  return value
    .replace(
      /\\(left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)\{/g,
      "\\$1\\{",
    )
    .replace(
      /\\(left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)\}/g,
      "\\$1\\}",
    );
}

function repairUnbalancedKatexLeftRight(value: string) {
  const leftCount = (value.match(/\\left\b/g) || []).length;
  const rightCount = (value.match(/\\right\b/g) || []).length;
  if (leftCount === rightCount) return value;
  if (leftCount > rightCount) {
    return value.replace(
      /\\left(?=\\[{}]|\(|\[|\.|\||\\lvert|\\rvert|\\langle|\\rangle)/g,
      "",
    );
  }
  return value.replace(
    /\\right(?=\\[{}]|\)|\]|\.|\||\\lvert|\\rvert|\\langle|\\rangle)/g,
    "",
  );
}

function repairJoinedKatexCommandIdentifiers(value: string) {
  return value
    .replace(
      /\\colon(?=(?:Set|sSet|Cat|Top|Grp|Ab|Ring|Vect|Mod)\b)/g,
      "\\colon ",
    )
    .replace(/\\longrightarrowsSet\b/g, "\\longrightarrow sSet")
    .replace(
      /\\longrightarrow(?=(?:Set|sSet|Cat|Top|Grp|Ab|Ring|Vect|Mod)\b)/g,
      "\\longrightarrow ",
    );
}

function repairTextWrappedKatexMathCommands(value: string) {
  return value.replace(
    /\\text\{\s*\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)\s*\}/g,
    (_, command: string) => `\\${command}`,
  );
}

function extractEmbeddedKatexDelimitedMath(
  value: string,
  displayMode: boolean,
) {
  if (displayMode) {
    const displayStart = value.indexOf("$$");
    if (displayStart >= 0) {
      const displayEnd = value.indexOf("$$", displayStart + 2);
      if (displayEnd > displayStart)
        return value.slice(displayStart + 2, displayEnd);
      return value.slice(displayStart + 2);
    }
  }
  return value;
}

function normalizeKatexMathSource(
  value: string,
  displayMode = false,
  references?: Map<string, string>,
) {
  let normalized = closeUnbalancedKatexEnvironments(
    repairUnbalancedKatexLeftRight(
      repairKatexDelimiterCommands(
        repairJoinedKatexCommandIdentifiers(
          repairTextWrappedKatexMathCommands(
            rewriteRinCleverReferencesToText(
              extractEmbeddedKatexDelimitedMath(value, displayMode),
              references,
            ),
          ),
        ),
      ),
    )
      .trim()
      .replace(/\\label\s*\{[^{}]*\}/g, "")
      .replace(/\\(?:notag|nonumber)\b/g, "")
      .replace(/^\\\[\s*/g, "")
      .replace(/\s*\\\]$/g, "")
      .replace(/^\$\$\s*/g, "")
      .replace(/\s*\$\$$/g, "")
      .replace(/\\begin\{align\*?\}/g, "\\begin{aligned}")
      .replace(/\\end\{align\*?\}/g, "\\end{aligned}")
      .replace(/\\begin\{gather\*?\}/g, "\\begin{aligned}")
      .replace(/\\end\{gather\*?\}/g, "\\end{aligned}")
      .replace(/\\begin\{equation\*?\}/g, "")
      .replace(/\\end\{equation\*?\}/g, ""),
  );
  if (displayMode && hasCjkText(normalized) && normalized.includes("$")) {
    const inlineMatch = normalized.match(/\$([^$\n]+)\$/);
    if (inlineMatch) normalized = inlineMatch[1];
  }
  if (
    displayMode &&
    hasTopLevelAlignment(normalized) &&
    !isSingleKatexEnvironment(normalized)
  ) {
    return `\\begin{aligned}${normalized}\\end{aligned}`;
  }
  return normalized;
}

function renderKatexReaderMath(
  value: string,
  displayMode: boolean,
  references?: Map<string, string>,
) {
  const normalized = normalizeKatexMathSource(value, displayMode, references);
  const candidates = [normalized];
  if (
    displayMode &&
    hasTopLevelAlignment(normalized) &&
    !isSingleKatexEnvironment(normalized)
  ) {
    candidates.unshift(`\\begin{aligned}${normalized}\\end{aligned}`);
  }
  const seen = new Set<string>();
  let hadStrictFailure = false;
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return katex.renderToString(candidate, {
        displayMode,
        throwOnError: true,
        strict: "ignore",
        trust: false,
      });
    } catch {
      hadStrictFailure = true;
    }
  }
  if (hadStrictFailure) {
    return katex.renderToString(normalized, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  }
  return katex.renderToString(normalized, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });
}

function readDisplayMathEnvironmentAt(value: string, index: number) {
  if (!value.startsWith("\\begin{", index)) return null;
  const begin = value
    .slice(index)
    .match(/^\\begin\{([A-Za-z*]+)\}(\[[^\]]*\])?/);
  if (!begin) return null;
  const environment = begin[1];
  const normalized = environment.toLowerCase().replace(/\*$/, "");
  if (!rinReaderDisplayMathEnvironments.has(normalized)) return null;
  const endMarker = `\\end{${environment}}`;
  const end = value.indexOf(endMarker, index + begin[0].length);
  if (end < 0) return null;
  return {
    source: value.slice(index, end + endMarker.length),
    nextIndex: end + endMarker.length,
  };
}

function looksLikeOrphanDisplayMath(value: string) {
  return hasVisibleLatexCommand(value) || /[_^{}=&]/.test(value);
}

function readOrphanDisplayMathCloseAt(value: string, index: number) {
  const close = value.indexOf("\\]", index);
  if (close < 0) return null;
  const source = value.slice(index, close).trim();
  if (source.includes("\\[") || source.includes("$")) return null;
  if (!source || !looksLikeOrphanDisplayMath(source)) return null;
  return {
    source,
    nextIndex: close + "\\]".length,
  };
}

function readOrphanAlignedTailAt(value: string, index: number) {
  if (
    !value.startsWith("\\right}", index) &&
    !value.startsWith("\\end{aligned}", index)
  ) {
    return null;
  }
  const endMarker = "\\end{aligned}";
  const end = value.indexOf(endMarker, index);
  if (end < 0) return null;
  const source = value
    .slice(index, end)
    .replace(/\\right\}/g, "\\}")
    .trim();
  if (!source) return null;
  return {
    source: `\\begin{aligned}${source}\\end{aligned}`,
    nextIndex: end + endMarker.length,
  };
}

type RinReaderDiagramSource = {
  type: string;
  options: string;
  body: string;
};

type RinReaderDiagramMatch = {
  diagram: RinReaderDiagramSource;
  nextIndex: number;
};

function normalizeRinReaderDiagramType(value: string) {
  const normalized = value.toLowerCase().replace(/\*$/, "");
  if (normalized === "tikzcd") return "tikzcd";
  if (normalized === "tikzpicture") return "tikzpicture";
  if (normalized === "axis") return "axis";
  if (normalized === "pspicture") return "pspicture";
  if (normalized === "xymatrix") return "xymatrix";
  if (normalized === "cd") return "amscd";
  if (normalized === "picture") return "picture";
  if (normalized === "forest") return "forest";
  if (normalized === "circuitikz") return "circuitikz";
  return "";
}

function isTransparentRinReaderEnvironment(value: string) {
  const normalized = value.toLowerCase().replace(/\*$/, "");
  return [
    "center",
    "figure",
    "minipage",
    "flushleft",
    "flushright",
    "quote",
    "quotation",
  ].includes(normalized);
}

function stripTransparentLatexEnvironmentMarkers(value: string) {
  return value.replace(
    /\\(?:begin|end)\{(?:center|figure\*?|minipage|flushleft|flushright|quote|quotation)\}(?:\[[^\]]*\])?/gi,
    "",
  );
}

function rewriteVisibleLatexText(value: string) {
  const circledDigits = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
  return value
    .replace(/\\protectExample\b/g, "Example")
    .replace(/\\(?:Blindtext|blindtext)\b/g, "")
    .replace(/\\addcontentsline\{[^{}]*\}(?:\{[^{}]*\}){0,2}/g, "")
    .replace(/\\captionsetup(?:\[[^\]]*\])?\{[^{}]*\}/g, " ")
    .replace(/\\label\s*\{[^{}]*\}/g, "")
    .replace(
      /\\begin\{proof\}(?:\[([^\]]+)\])?/gi,
      (_, title: string | undefined) => (title ? `${title}. ` : "Proof. "),
    )
    .replace(/\\end\{proof\}/gi, "")
    .replace(
      /\{\[\u6ce8\]\}\s*[:\uff1a]?/g,
      "\u6ce8\uff1a",
    )
    .replace(
      /\\textcircled\{([0-9])\}/g,
      (_, digit: string) => circledDigits[Number(digit)] || digit,
    )
    .replace(
      /\\eqref\s*\{([^{}]+)\}/g,
      (_, label: string) => `(${fallbackLatexReferenceLabel(label)})`,
    )
    .replace(/\\ref\s*\{([^{}]+)\}/g, "$1")
    .replace(/\\colon(?=(?:Set|sSet|Cat|Top|Grp|Ab|Ring|Vect|Mod)\b)/g, ": ")
    .replace(/\\longrightarrowsSet\b/g, "→ sSet")
    .replace(
      /\\longrightarrow(?=(?:Set|sSet|Cat|Top|Grp|Ab|Ring|Vect|Mod)\b)/g,
      "→ ",
    )
    .replace(
      /\\(?:vfill|hfill|normalfont|rmfamily|sffamily|ttfamily|bfseries|itshape|upshape|mdseries)\b/g,
      " ",
    )
    .replace(/\s+/g, " ");
}

function fallbackLatexReferenceLabel(value: string) {
  const label = value.trim();
  const colonIndex = label.lastIndexOf(":");
  if (colonIndex >= 0 && colonIndex + 1 < label.length) {
    return label.slice(colonIndex + 1);
  }
  return label;
}

function compactRinReferenceTitle(value: string) {
  return normalizedTitleText(value)
    .replace(/\s*[（(].*$/, "")
    .trim();
}

function fallbackRinCleverReferenceLabel(value: string) {
  const label = value.trim();
  const prefix = label.includes(":") ? label.slice(0, label.indexOf(":")) : "";
  const suffix = fallbackLatexReferenceLabel(label);
  const names: Record<string, string> = {
    constr: "Construction",
    cor: "Corollary",
    def: "Definition",
    eq: "Equation",
    fig: "Figure",
    lem: "Lemma",
    prop: "Proposition",
    rem: "Remark",
    sec: "Section",
    thm: "Theorem",
  };
  const name = names[prefix];
  if (!name || !suffix || suffix === label) return label;
  return `${name} ${suffix}`;
}

function rinReferenceTextForLabel(
  label: string,
  references: Map<string, string>,
) {
  const normalized = label.trim();
  if (!normalized) return "";
  return (
    references.get(normalized) || fallbackRinCleverReferenceLabel(normalized)
  );
}

function rinReferenceListText(value: string, references: Map<string, string>) {
  return value
    .split(",")
    .map((label) => rinReferenceTextForLabel(label, references))
    .filter(Boolean)
    .join(", ");
}

function rewriteRinCleverReferencesToText(
  value: string,
  references?: Map<string, string>,
) {
  if (!references || !value.includes("\\")) return value;
  return value.replace(/\\[cC]ref\s*\{([^{}]+)\}/g, (_, labels: string) =>
    rinReferenceListText(labels, references),
  );
}

function rinWriterReferenceText(element: Element): string {
  if (element.classList.contains("rin-equation")) {
    const number = normalizedTitleText(
      element.querySelector(".rin-equation-number")?.textContent || "",
    );
    return number ? `Equation ${number}` : "";
  }
  if (element.classList.contains("rin-env")) {
    return compactRinReferenceTitle(
      element.querySelector(":scope > .rin-env-title")?.textContent ||
        element.querySelector(".rin-env-title")?.textContent ||
        "",
    );
  }
  if (/^h[2-6]$/i.test(element.tagName)) {
    return compactRinReferenceTitle(element.textContent || "");
  }
  const closestEnvironment = element.closest(".rin-env");
  if (closestEnvironment) return rinWriterReferenceText(closestEnvironment);
  return compactRinReferenceTitle(element.textContent || "");
}

function rinWriterReferenceMap(document: Document) {
  const references = new Map<string, string>();
  document.body.querySelectorAll<HTMLElement>("[id]").forEach((element) => {
    const id = element.id.trim();
    if (!id || references.has(id)) return;
    references.set(
      id,
      rinWriterReferenceText(element) || fallbackRinCleverReferenceLabel(id),
    );
  });
  return references;
}

function shouldSkipRinReferenceTextNode(node: Text) {
  let element = node.parentElement;
  while (element) {
    const tagName = element.tagName.toLowerCase();
    if (
      [
        "a",
        "script",
        "style",
        "textarea",
        "pre",
        "code",
        "kbd",
        "samp",
      ].includes(tagName)
    ) {
      return true;
    }
    if (
      element.classList.contains("katex") ||
      element.classList.contains("katex-display") ||
      element.classList.contains("math-fragment")
    ) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

function appendRinCleverReference(
  document: Document,
  fragment: DocumentFragment,
  label: string,
  references: Map<string, string>,
) {
  const normalized = label.trim();
  if (!normalized) return;
  const link = document.createElement("a");
  link.className = references.has(normalized)
    ? "rin-ref rin-ref-clever"
    : "rin-ref rin-ref-missing";
  link.href = `#${normalized}`;
  link.textContent =
    references.get(normalized) || fallbackRinCleverReferenceLabel(normalized);
  fragment.appendChild(link);
}

function repairRenderedKatexLatexArtifacts(
  document: Document,
  references: Map<string, string>,
) {
  document.body
    .querySelectorAll<HTMLElement>(".katex .mord.text")
    .forEach((element) => {
      const command = normalizedTitleText(element.textContent || "").replace(
        /\s+/g,
        "",
      );
      if (command !== "\\label" && command !== "\\cref" && command !== "\\Cref")
        return;

      const argument = element.nextElementSibling;
      const rawArgument = normalizedTitleText(
        argument?.textContent || "",
      ).replace(/\s+/g, "");
      if (command === "\\label") {
        argument?.remove();
        element.remove();
        return;
      }

      const text = rinReferenceListText(rawArgument, references);
      element.className = "mord";
      element.removeAttribute("style");
      element.textContent =
        text || fallbackRinCleverReferenceLabel(rawArgument);
      argument?.remove();
    });

  document.body
    .querySelectorAll<HTMLElement>(".katex-error")
    .forEach((element) => {
      const source = element.textContent || "";
      const rewritten = rewriteVisibleLatexText(source).trim();
      if (!rewritten || rewritten === source.trim()) return;
      const replacement = document.createTextNode(rewritten);
      const wrapper = element.closest(".math-fragment");
      if (wrapper) {
        wrapper.replaceWith(replacement);
      } else {
        element.replaceWith(replacement);
      }
    });
}

function repairRinWriterCleverReferences(
  document: Document,
  references: Map<string, string>,
) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (
      current instanceof Text &&
      current.textContent?.includes("\\") &&
      !shouldSkipRinReferenceTextNode(current)
    ) {
      nodes.push(current);
    }
    current = walker.nextNode();
  }

  nodes.forEach((node) => {
    const source = node.textContent || "";
    const pattern = /\\[cC]ref\{([^{}]+)\}/g;
    let match = pattern.exec(source);
    if (!match) return;

    const fragment = document.createDocumentFragment();
    let index = 0;
    while (match) {
      if (match.index > index) {
        fragment.appendChild(
          document.createTextNode(source.slice(index, match.index)),
        );
      }
      const labels = match[1]
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean);
      labels.forEach((label, labelIndex) => {
        if (labelIndex > 0) fragment.appendChild(document.createTextNode(", "));
        appendRinCleverReference(document, fragment, label, references);
      });
      index = match.index + match[0].length;
      match = pattern.exec(source);
    }
    if (index < source.length) {
      fragment.appendChild(document.createTextNode(source.slice(index)));
    }
    node.replaceWith(fragment);
  });
}

function hasVisibleLatexCommand(value: string) {
  return /\\[A-Za-z]+/.test(value);
}

function hasCjkText(value: string) {
  return /[\p{Script=Han}]/u.test(value);
}

function hasBalancedLatexBraces(value: string) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function looksLikeLooseLatexMath(value: string) {
  const trimmed = value
    .trim()
    .replace(/^\$|\$$/g, "")
    .trim();
  if (!trimmed || !hasVisibleLatexCommand(trimmed) || hasCjkText(trimmed))
    return false;
  if (!hasBalancedLatexBraces(trimmed)) return false;
  return /\\(?:in|to|Delta|sigma|alpha|beta|tau|varphi|psi|ell|circ|ast|prod|coprod|limits|operatorname|mathop|times|partial|hookrightarrow|longrightarrow|colon|left|right|amalg|mathrm|hat)\b|[_^{}=<>]/.test(
    trimmed,
  );
}

function appendLooseLatexMath(
  document: Document,
  fragment: DocumentFragment,
  value: string,
) {
  const normalized = value
    .trim()
    .replace(/^\$|\$$/g, "")
    .trim();
  const wrapper = document.createElement("span");
  wrapper.className = "math-fragment";
  wrapper.innerHTML = katex.renderToString(
    normalizeKatexMathSource(normalized, false),
    {
      displayMode: false,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    },
  );
  fragment.appendChild(wrapper);
}

function appendLooseLatexText(
  document: Document,
  fragment: DocumentFragment,
  value: string,
) {
  if (!value) return;
  if (looksLikeLooseLatexMath(value)) {
    appendLooseLatexMath(document, fragment, value);
    return;
  }
  fragment.appendChild(document.createTextNode(value));
}

function renderLooseLatexText(document: Document, value: string) {
  const source = rewriteVisibleLatexText(value);
  const fragment = document.createDocumentFragment();
  let index = 0;
  const rawMathPattern =
    /[$]?[^$\p{Script=Han}，。；：、（）！？]*\\[A-Za-z]+[^$\p{Script=Han}，。；：、（）！？]*[$]?/gu;
  let match = rawMathPattern.exec(source);
  while (match) {
    const start = match.index || 0;
    const end = start + match[0].length;
    if (start > index) {
      fragment.appendChild(document.createTextNode(source.slice(index, start)));
    }
    appendLooseLatexText(document, fragment, match[0]);
    index = end;
    match = rawMathPattern.exec(source);
  }
  if (index < source.length) {
    fragment.appendChild(document.createTextNode(source.slice(index)));
  }
  return fragment;
}

function shouldRepairLooseLatexElement(element: Element) {
  const text = element.textContent || "";
  if (!hasVisibleLatexCommand(text)) return false;
  if (
    /\\(?:begin|end)\{(?:align\*?|aligned|gather\*?|equation\*?|cases|matrix|pmatrix|bmatrix|vmatrix|split)\}|\\[\[\]]|\$\$/.test(
      text,
    )
  ) {
    return false;
  }
  if (
    element.querySelector(
      "a[href], img, svg, video, iframe, table, pre, code, kbd, samp, canvas, math, figure, .katex, .katex-display, .math-fragment, .rin-inline-math, .rin-display-math, .rin-deferred-math, mjx-container, .rin-tikz, .rin-reader-diagram",
    )
  ) {
    return false;
  }
  return true;
}

function collectLooseLatexRepairElements(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<HTMLElement>("p, .rin-env-title, .rin-toc-link"),
  ).filter((element) => shouldRepairLooseLatexElement(element));
}

function repairLooseLatexElementBatch(
  elements: HTMLElement[],
  document: Document,
) {
  elements.forEach((element) => {
    const text = element.textContent || "";
    element.replaceChildren(renderLooseLatexText(document, text));
  });
}

function repairLooseLatexElementsInRoot(root: ParentNode, document: Document) {
  repairLooseLatexElementBatch(collectLooseLatexRepairElements(root), document);
}

function repairLooseLatexElements(document: Document) {
  repairLooseLatexElementsInRoot(document.body, document);
}

function readUnsupportedHtmlDiagram(
  value: string,
): RinReaderDiagramSource | null {
  for (let index = 0; index < value.length; index += 1) {
    const match = readUnsupportedHtmlDiagramAt(value, index);
    if (match) return match.diagram;
  }
  return null;
}

function readUnsupportedHtmlDiagramAt(
  value: string,
  index: number,
): RinReaderDiagramMatch | null {
  if (!value.startsWith("\\begin{", index)) return null;
  const begin = value
    .slice(index)
    .match(/^\\begin\{([A-Za-z*]+)\}(\[[^\]]*\])?/);
  if (!begin) return null;
  const environment = begin[1];
  const bodyStart = index + begin[0].length;
  const endMarker = `\\end{${environment}}`;
  const bodyEnd = value.indexOf(endMarker, bodyStart);
  if (bodyEnd < 0) return null;
  const body = value.slice(bodyStart, bodyEnd);
  const nextIndex = bodyEnd + endMarker.length;
  const type = normalizeRinReaderDiagramType(environment);
  if (!type && isTransparentRinReaderEnvironment(environment)) {
    const nested = readUnsupportedHtmlDiagram(body);
    if (nested) {
      return { diagram: nested, nextIndex };
    }
  }
  if (!type) return null;
  return {
    diagram: {
      type,
      options: (begin[2] || "").replace(/^\[|\]$/g, "").trim(),
      body: body.trim(),
    },
    nextIndex,
  };
}

function createRinReaderDiagramFigure(
  document: Document,
  diagram: RinReaderDiagramSource,
) {
  const figure = document.createElement("figure");
  figure.className = "rin-reader-diagram";
  figure.dataset.rinDiagramType = diagram.type;
  if (diagram.options) figure.dataset.rinDiagramOptions = diagram.options;
  const source = document.createElement("pre");
  source.className = "rin-reader-diagram-source";
  source.textContent = diagram.body;
  const caption = document.createElement("figcaption");
  caption.textContent = "Rendering diagram...";
  figure.appendChild(source);
  figure.appendChild(caption);
  return figure;
}

function renderRinMathTextNode(
  document: Document,
  node: Text,
  references?: Map<string, string>,
) {
  let source = node.textContent || "";
  const strippedSource = stripTransparentLatexEnvironmentMarkers(source);
  const rewrittenSource = rewriteVisibleLatexText(strippedSource);
  const strippedLayoutMarkers = rewrittenSource !== source;
  source = rewrittenSource;
  if (
    !source.includes("$") &&
    !source.includes("\\(") &&
    !source.includes("\\[") &&
    !source.includes("\\]") &&
    !source.includes("\\end{") &&
    !source.includes("\\begin{")
  ) {
    if (strippedLayoutMarkers) {
      node.textContent = source;
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  let index = 0;
  let changed = strippedLayoutMarkers;
  const appendText = (value: string) => {
    if (value) fragment.appendChild(document.createTextNode(value));
  };

  while (index < source.length) {
    const diagram = readUnsupportedHtmlDiagramAt(source, index);
    if (diagram) {
      fragment.appendChild(
        createRinReaderDiagramFigure(document, diagram.diagram),
      );
      changed = true;
      index = diagram.nextIndex;
      continue;
    }
    const displayMathEnvironment = readDisplayMathEnvironmentAt(source, index);
    if (displayMathEnvironment) {
      appendRenderedHtmlMath(
        document,
        fragment,
        displayMathEnvironment.source,
        true,
        references,
      );
      changed = true;
      index = displayMathEnvironment.nextIndex;
      continue;
    }
    const orphanAlignedTail = readOrphanAlignedTailAt(source, index);
    if (orphanAlignedTail) {
      appendRenderedHtmlMath(
        document,
        fragment,
        orphanAlignedTail.source,
        true,
        references,
      );
      changed = true;
      index = orphanAlignedTail.nextIndex;
      continue;
    }
    const orphanEnvironmentEnd = source
      .slice(index)
      .match(
        /^\\end\{(?:aligned|gathered|split|cases|matrix|pmatrix|bmatrix|vmatrix|smallmatrix)\}/,
      );
    if (orphanEnvironmentEnd) {
      changed = true;
      index += orphanEnvironmentEnd[0].length;
      continue;
    }
    const orphanDisplayMath = readOrphanDisplayMathCloseAt(source, index);
    if (orphanDisplayMath) {
      appendRenderedHtmlMath(
        document,
        fragment,
        orphanDisplayMath.source,
        true,
        references,
      );
      changed = true;
      index = orphanDisplayMath.nextIndex;
      continue;
    }

    const delimiter =
      !isEscapedHtmlMathDelimiter(source, index) &&
      source.startsWith("$$", index)
        ? { open: "$$", close: "$$", display: true }
        : !isEscapedHtmlMathDelimiter(source, index) &&
            source.startsWith("\\[", index)
          ? { open: "\\[", close: "\\]", display: true }
          : !isEscapedHtmlMathDelimiter(source, index) &&
              source.startsWith("\\(", index)
            ? { open: "\\(", close: "\\)", display: false }
            : !isEscapedHtmlMathDelimiter(source, index) &&
                source[index] === "$" &&
                source[index + 1] !== "$"
              ? { open: "$", close: "$", display: false }
              : null;

    if (!delimiter) {
      const nextDollar = source.indexOf("$", index + 1);
      const nextParenMath = source.indexOf("\\(", index + 1);
      const nextBracketMath = source.indexOf("\\[", index + 1);
      const nextBegin = source.indexOf("\\begin{", index + 1);
      if (nextBegin > index) {
        const inlineDisplayMathEnvironment = readDisplayMathEnvironmentAt(
          source,
          nextBegin,
        );
        const prefix = source.slice(index, nextBegin);
        if (
          inlineDisplayMathEnvironment &&
          looksLikeOrphanDisplayMath(prefix) &&
          !hasCjkText(prefix)
        ) {
          appendRenderedHtmlMath(
            document,
            fragment,
            `${prefix}${inlineDisplayMathEnvironment.source}`,
            true,
            references,
          );
          changed = true;
          index = inlineDisplayMathEnvironment.nextIndex;
          continue;
        }
      }
      const nextCandidates = [
        nextDollar,
        nextParenMath,
        nextBracketMath,
        nextBegin,
      ].filter((candidate) => candidate > index);
      const next = nextCandidates.length
        ? Math.min(...nextCandidates)
        : source.length;
      appendText(source.slice(index, next));
      index = next;
      continue;
    }

    const contentStart = index + delimiter.open.length;
    const contentEnd = findHtmlMathDelimiterEnd(
      source,
      contentStart,
      delimiter.close,
    );
    if (contentEnd < 0) {
      if (delimiter.display) {
        const orphanSource = source.slice(contentStart).trim();
        if (orphanSource && looksLikeOrphanDisplayMath(orphanSource)) {
          appendRenderedHtmlMath(
            document,
            fragment,
            orphanSource,
            true,
            references,
          );
          changed = true;
          index = source.length;
          continue;
        }
      }
      appendText(source.slice(index));
      index = source.length;
      continue;
    }

    appendRenderedHtmlMath(
      document,
      fragment,
      source.slice(contentStart, contentEnd),
      delimiter.display,
      references,
    );
    changed = true;
    index = contentEnd + delimiter.close.length;
  }

  if (changed) {
    node.replaceWith(fragment);
  }
}

function shouldSkipRinMathTextNode(node: Text) {
  let element = node.parentElement;
  while (element) {
    const tagName = element.tagName.toLowerCase();
    if (
      ["script", "style", "textarea", "pre", "code", "kbd", "samp"].includes(
        tagName,
      )
    ) {
      return true;
    }
    if (
      element.classList.contains("katex") ||
      element.classList.contains("katex-display") ||
      element.classList.contains("math-fragment")
    ) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

function renderRinMathTextNodes(
  document: Document,
  references = rinWriterReferenceMap(document),
) {
  repairLooseLatexElements(document);
  const nodes = collectRinMathTextNodes(document.body, document);
  nodes.forEach((textNode) =>
    renderRinMathTextNode(document, textNode, references),
  );
}

function collectRinMathTextNodes(root: ParentNode, document: Document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text && !shouldSkipRinMathTextNode(node)) {
      nodes.push(node);
    }
    node = walker.nextNode();
  }
  return nodes;
}

function scheduleRinReaderWork(callback: () => void, delayMs = 32): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = window.setTimeout(callback, delayMs);
  return () => window.clearTimeout(handle);
}

function rinReaderHashTarget(document: Document) {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const rawHash = window.location.hash.slice(1);
  if (!rawHash) return null;
  try {
    return (
      document.getElementById(decodeURIComponent(rawHash)) ||
      document.getElementById(rawHash)
    );
  } catch {
    return document.getElementById(rawHash);
  }
}

function rinReaderElementPriority(
  element: Element | null,
  hashTarget: Element | null,
) {
  if (typeof window === "undefined" || !element) return Number.MAX_SAFE_INTEGER;
  const rect = element.getBoundingClientRect();
  const viewportHeight = Math.max(window.innerHeight || 0, 1);
  const viewportCenter = viewportHeight / 2;
  const visible = rect.bottom >= 0 && rect.top <= viewportHeight;
  const viewportDistance = visible
    ? 0
    : Math.min(
        Math.abs(rect.top - viewportCenter),
        Math.abs(rect.bottom - viewportCenter),
      );
  if (!hashTarget)
    return visible ? -viewportHeight + viewportDistance : viewportDistance;
  const hashRect = hashTarget.getBoundingClientRect();
  const hashDistance = Math.min(
    Math.abs(rect.top - hashRect.top),
    Math.abs(rect.bottom - hashRect.bottom),
  );
  return Math.min(
    visible ? -viewportHeight + viewportDistance : viewportDistance,
    hashDistance,
  );
}

function sortRinReaderWorkByViewport<T>(
  items: T[],
  document: Document,
  elementFor: (item: T) => Element | null,
) {
  const hashTarget = rinReaderHashTarget(document);
  items.sort(
    (left, right) =>
      rinReaderElementPriority(elementFor(left), hashTarget) -
      rinReaderElementPriority(elementFor(right), hashTarget),
  );
  return items;
}

function renderRinMathTextNodesInBatches(
  root: HTMLElement,
  signal: AbortSignal,
) {
  const document = root.ownerDocument;
  const references = rinWriterReferenceMap(document);
  const looseElements = sortRinReaderWorkByViewport(
    collectLooseLatexRepairElements(root),
    document,
    (element) => element,
  );
  let looseIndex = 0;
  let mathNodes: Text[] = [];
  let mathIndex = 0;
  let cancelScheduled: () => void = () => {};
  const processBatch = () => {
    if (signal.aborted) return;
    if (looseIndex < looseElements.length) {
      const end = Math.min(looseIndex + 6, looseElements.length);
      repairLooseLatexElementBatch(
        looseElements.slice(looseIndex, end),
        document,
      );
      looseIndex = end;
      cancelScheduled = scheduleRinReaderWork(processBatch, 48);
      return;
    }
    if (mathNodes.length === 0) {
      mathNodes = sortRinReaderWorkByViewport(
        collectRinMathTextNodes(root, document),
        document,
        (node) => node.parentElement,
      );
    }
    const end = Math.min(mathIndex + 24, mathNodes.length);
    for (; mathIndex < end; mathIndex += 1) {
      renderRinMathTextNode(document, mathNodes[mathIndex], references);
    }
    if (mathIndex < mathNodes.length) {
      cancelScheduled = scheduleRinReaderWork(processBatch, 48);
    }
  };
  const startHandle = window.setTimeout(() => {
    if (!signal.aborted) {
      cancelScheduled = scheduleRinReaderWork(processBatch, 48);
    }
  }, 350);
  signal.addEventListener("abort", () => cancelScheduled(), { once: true });
  signal.addEventListener("abort", () => window.clearTimeout(startHandle), {
    once: true,
  });
}

function renderDeferredMathElement(element: HTMLElement) {
  if (element.dataset.rinMathRendered === "true") return;
  const source = element.dataset.rinMathSource || element.textContent || "";
  const displayMode = element.dataset.rinMathDisplay === "block";
  element.innerHTML = renderKatexReaderMath(source, displayMode);
  element.dataset.rinMathRendered = "true";
}

function collectDeferredMathElements(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '.rin-deferred-math:not([data-rin-math-rendered="true"])',
    ),
  );
}

function elementNearViewport(element: Element, margin = 900) {
  if (typeof window === "undefined") return false;
  const rect = element.getBoundingClientRect();
  const viewportHeight = Math.max(window.innerHeight || 0, 1);
  return rect.bottom >= -margin && rect.top <= viewportHeight + margin;
}

function renderDeferredMathInBatches(root: HTMLElement, signal: AbortSignal) {
  const elements = sortRinReaderWorkByViewport(
    collectDeferredMathElements(root),
    root.ownerDocument,
    (element) => element,
  );
  if (!elements.length) return;

  const initialBatch = elements.slice(0, 48);
  initialBatch.forEach(renderDeferredMathElement);

  const pending = elements.filter(
    (element) => element.dataset.rinMathRendered !== "true",
  );
  if (!pending.length) return;

  const queued = new Set<HTMLElement>();
  let scheduled = false;
  let cancelScheduled: () => void = () => {};

  const pumpQueue = () => {
    if (signal.aborted) return;
    scheduled = false;
    const batch = Array.from(queued).slice(0, 24);
    batch.forEach((element) => {
      queued.delete(element);
      renderDeferredMathElement(element);
    });
    if (queued.size) {
      scheduled = true;
      cancelScheduled = scheduleRinReaderWork(pumpQueue, 64);
    }
  };

  const enqueue = (element: HTMLElement) => {
    if (element.dataset.rinMathRendered === "true" || queued.has(element))
      return;
    queued.add(element);
    if (scheduled) return;
    scheduled = true;
    cancelScheduled = scheduleRinReaderWork(pumpQueue, 48);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          observer.unobserve(element);
          enqueue(element);
        });
      },
      { rootMargin: "1200px 0px" },
    );
    pending.forEach((element) => observer.observe(element));
    const backgroundHandle = globalThis.setTimeout(() => {
      if (signal.aborted) return;
      pending.forEach(enqueue);
    }, 1800);
    signal.addEventListener(
      "abort",
      () => {
        observer.disconnect();
        queued.clear();
        cancelScheduled();
        globalThis.clearTimeout(backgroundHandle);
      },
      { once: true },
    );
    return;
  }

  const startHandle = globalThis.setTimeout(() => {
    if (signal.aborted) return;
    pending.forEach(enqueue);
  }, 160);
  signal.addEventListener(
    "abort",
    () => {
      queued.clear();
      cancelScheduled();
      globalThis.clearTimeout(startHandle);
    },
    { once: true },
  );
}

function latexmlMathDisplayMode(element: Element) {
  return (
    element.getAttribute("display") === "block" ||
    element.classList.contains("rin-math-display") ||
    Boolean(element.closest(".ltx_equation, .ltx_equationgroup, .ltx_align"))
  );
}

function shouldKeepLateXMLEquationTableMath(element: Element) {
  return Boolean(
    element.closest(
      ".ltx_equationgroup, .ltx_eqn_table, .ltx_eqn_row, .ltx_eqn_cell",
    ),
  );
}

function renderLateXMLMathElement(element: Element) {
  if (element.getAttribute("data-rin-latexml-math-rendered") === "true") return;
  const source = (element.getAttribute("alttext") || "").trim();
  if (!source) return;
  if (shouldKeepLateXMLEquationTableMath(element)) {
    element.setAttribute("data-rin-latexml-math-rendered", "preserved");
    return;
  }
  const displayMode = latexmlMathDisplayMode(element);
  const document = element.ownerDocument;
  const wrapper = document.createElement(displayMode ? "div" : "span");
  wrapper.className = displayMode
    ? "math-fragment math-fragment-display rin-latexml-katex"
    : "math-fragment rin-latexml-katex";
  wrapper.setAttribute("data-rin-latexml-math-rendered", "true");
  wrapper.setAttribute("data-rin-math-source", source);
  wrapper.innerHTML = renderKatexReaderMath(source, displayMode);
  if (wrapper.querySelector(".katex-error")) {
    element.setAttribute("data-rin-latexml-math-rendered", "true");
    return;
  }
  element.replaceWith(wrapper);
}

function collectLateXMLMathElements(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<Element>(
      'math.ltx_Math[alttext]:not([data-rin-latexml-math-rendered="true"])',
    ),
  ).filter((element) => {
    const source = (element.getAttribute("alttext") || "").trim();
    return (
      source.length > 0 &&
      !shouldKeepLateXMLEquationTableMath(element) &&
      !element.closest(".katex, .katex-display, .math-fragment")
    );
  });
}

function hasServerRenderedRinMath(root: ParentNode) {
  return Boolean(root.querySelector(".rin-math-katex, .rin-math-svg"));
}

function renderLateXMLMathMLInBatches(root: HTMLElement, signal: AbortSignal) {
  if (hasServerRenderedRinMath(root)) return;
  const elements = sortRinReaderWorkByViewport(
    collectLateXMLMathElements(root),
    root.ownerDocument,
    (element) => element,
  );
  if (!elements.length) return;

  const hashTarget = rinReaderHashTarget(root.ownerDocument);
  const initialBatch = elements
    .filter(
      (element) =>
        elementNearViewport(element) ||
        rinReaderElementPriority(element, hashTarget) < 1200,
    )
    .slice(0, 32);
  const initiallyRendered = new Set(initialBatch);
  initialBatch.forEach(renderLateXMLMathElement);

  const pending = elements.filter((element) => !initiallyRendered.has(element));
  if (!pending.length) return;

  const queued = new Set<Element>();
  let scheduled = false;
  let cancelScheduled: () => void = () => {};

  const pumpQueue = () => {
    if (signal.aborted) return;
    scheduled = false;
    const batch = Array.from(queued).slice(0, 18);
    batch.forEach((element) => {
      queued.delete(element);
      renderLateXMLMathElement(element);
    });
    if (queued.size) {
      scheduled = true;
      cancelScheduled = scheduleRinReaderWork(pumpQueue, 80);
    }
  };

  const enqueue = (element: Element) => {
    if (
      element.getAttribute("data-rin-latexml-math-rendered") === "true" ||
      queued.has(element)
    )
      return;
    queued.add(element);
    if (scheduled) return;
    scheduled = true;
    cancelScheduled = scheduleRinReaderWork(pumpQueue, 64);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enqueue(entry.target);
        });
      },
      { rootMargin: "1200px 0px" },
    );
    pending.forEach((element) => observer.observe(element));
    signal.addEventListener(
      "abort",
      () => {
        observer.disconnect();
        queued.clear();
        cancelScheduled();
      },
      { once: true },
    );
    return;
  }

  const startHandle = globalThis.setTimeout(() => {
    if (signal.aborted) return;
    pending.slice(0, 64).forEach(enqueue);
  }, 220);
  signal.addEventListener(
    "abort",
    () => {
      queued.clear();
      cancelScheduled();
      globalThis.clearTimeout(startHandle);
    },
    { once: true },
  );
}

function extractRinReaderDiagramSvg(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const svg = (payload as Record<string, unknown>).svg;
  return typeof svg === "string" ? svg : "";
}

let rinReaderDiagramSvgInstance = 0;

function nextRinReaderDiagramSvgPrefix() {
  rinReaderDiagramSvgInstance += 1;
  return `rin-reader-diagram-${rinReaderDiagramSvgInstance}-`;
}

function localApiUrl(path: string) {
  const basePath = `${publicEnv.publicBasePath || ""}${path}`;
  if (typeof window === "undefined") return basePath;
  return new URL(basePath, window.location.origin).toString();
}

function isFullRinReaderDiagramSource(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("\\begin{") ||
    trimmed.startsWith("\\[") ||
    trimmed.startsWith("$$")
  );
}

function renderRinReaderDiagramFigure(
  figure: HTMLElement,
  signal: AbortSignal,
) {
  if (figure.dataset.rinDiagramRendered === "true") return Promise.resolve();
  const type = figure.dataset.rinDiagramType || "";
  const source = figure.querySelector<HTMLElement>(
    ".rin-reader-diagram-source",
  );
  const body = source?.textContent?.trim() || "";
  if (!type || !body) return Promise.resolve();
  const payload: { body: string; options: string; source?: string } = {
    body,
    options: figure.dataset.rinDiagramOptions || "",
  };
  if (isFullRinReaderDiagramSource(body)) {
    payload.source = body;
  }
  figure.dataset.rinDiagramRendered = "true";
  figure.classList.add("is-loading");
  return fetch(localApiUrl(`/api/diagrams/${encodeURIComponent(type)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  })
    .then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("diagram render failed");
      const svg = extractRinReaderDiagramSvg(payload);
      if (!svg) throw new Error("empty diagram svg");
      const svgHost = figure.ownerDocument.createElement("div");
      svgHost.className = "rin-reader-diagram-svg";
      svgHost.innerHTML = prefixInlineSvgIds(
        svg,
        nextRinReaderDiagramSvgPrefix(),
      );
      figure.replaceChildren(svgHost);
      figure.classList.remove("is-loading", "is-error");
    })
    .catch((error: unknown) => {
      if (signal.aborted) return;
      figure.classList.remove("is-loading");
      figure.classList.add("is-error");
      const caption =
        figure.querySelector("figcaption") ||
        figure.ownerDocument.createElement("figcaption");
      caption.textContent = localizedErrorMessage(
        error,
        "reader.diagramRenderFailed",
      );
      if (!caption.parentElement) figure.appendChild(caption);
    });
}

function renderRinReaderDiagrams(root: HTMLElement, signal: AbortSignal) {
  const figures = sortRinReaderWorkByViewport(
    Array.from(
      root.querySelectorAll<HTMLElement>(
        ".rin-reader-diagram[data-rin-diagram-type]",
      ),
    ),
    root.ownerDocument,
    (figure) => figure,
  );
  const queued = new Set<HTMLElement>();
  let active = 0;
  const maxActive = 2;
  const pump = () => {
    if (signal.aborted) return;
    while (active < maxActive && queued.size > 0) {
      const next = queued.values().next().value;
      if (!next) break;
      queued.delete(next);
      active += 1;
      renderRinReaderDiagramFigure(next, signal).finally(() => {
        active -= 1;
        pump();
      });
    }
  };
  const enqueue = (figure: HTMLElement) => {
    if (figure.dataset.rinDiagramRendered === "true") return;
    queued.add(figure);
    pump();
  };

  let observer: IntersectionObserver | null = null;
  const startHandle = window.setTimeout(() => {
    if (signal.aborted) return;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            observer?.unobserve(entry.target);
            enqueue(entry.target as HTMLElement);
          });
        },
        { rootMargin: "900px 0px" },
      );
      figures.forEach((figure) => observer?.observe(figure));
    } else {
      figures.slice(0, 8).forEach(enqueue);
    }
  }, 2200);
  signal.addEventListener(
    "abort",
    () => {
      observer?.disconnect();
      window.clearTimeout(startHandle);
    },
    { once: true },
  );
}

function blogTocMathSource(element: Element) {
  if (
    element instanceof HTMLElement &&
    element.classList.contains("rin-deferred-math")
  ) {
    const source = (
      element.dataset.rinMathSource ||
      element.textContent ||
      ""
    ).trim();
    if (!source) return "";
    return element.dataset.rinMathDisplay === "block"
      ? `$$${source}$$`
      : `$${source}$`;
  }

  if (
    element.classList.contains("katex") ||
    element.classList.contains("katex-display") ||
    element.classList.contains("math-fragment")
  ) {
    const annotation = element.querySelector(
      'annotation[encoding="application/x-tex"]',
    );
    const source = (annotation?.textContent || "").trim();
    return source ? `$${source}$` : "";
  }

  return "";
}

function blogTocHeadingText(heading: Element) {
  const parts: string[] = [];
  const appendNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const mathSource = blogTocMathSource(element);
    if (mathSource) {
      parts.push(mathSource);
      return;
    }
    if (["script", "style", "template"].includes(element.tagName.toLowerCase()))
      return;
    element.childNodes.forEach(appendNode);
  };

  heading.childNodes.forEach(appendNode);
  return normalizedTitleText(parts.join(""));
}

function rinWriterTocItems(html: string, title: string): BlogTocItem[] {
  const document = prepareRinWriterDocument(html, title);
  if (!document) return [];
  return Array.from(document.body.querySelectorAll("h2, h3, h4"))
    .map((heading) => {
      const level = Number(heading.tagName.slice(1));
      const text = blogTocHeadingText(heading);
      if (!heading.id || !text || (level !== 2 && level !== 3 && level !== 4)) {
        return null;
      }
      return { id: heading.id, text, level };
    })
    .filter((item): item is BlogTocItem => Boolean(item));
}

function decodeBookReaderHash(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function bookReaderContentItems(items: BlogTocItem[]) {
  const ids = new Set(items.map((item) => item.id));
  return items.filter(
    (item) => item.level !== 2 || !item.id.startsWith("page-") || !ids.has(item.id.slice(5)),
  );
}

function bookReaderPageItems(items: BlogTocItem[]) {
  const contentItems = bookReaderContentItems(items);
  const sections = contentItems.filter((item) => item.level === 3);
  if (!sections.length) {
    const chapters = contentItems.filter((item) => item.level === 2);
    return chapters.length ? chapters : contentItems;
  }
  return contentItems.filter((item, index) => {
    if (item.level === 3) return true;
    if (item.level !== 2) return false;
    const nextChapter = contentItems.findIndex(
      (candidate, nextIndex) => nextIndex > index && candidate.level === 2,
    );
    const end = nextChapter < 0 ? contentItems.length : nextChapter;
    return !contentItems.slice(index + 1, end).some((candidate) => candidate.level === 3);
  });
}

// The reader keeps three independent numbers apart: the web pages the reader
// paginates, the outline nodes that make up the TOC, and the physical PDF page
// count recorded in the book metadata. They must never be conflated, so the
// TOC head renders them as separate labelled values.
function bookReaderPageCounts(
  items: BlogTocItem[],
  pdfPageCount?: number | null,
) {
  const pdfPages =
    typeof pdfPageCount === "number" &&
    Number.isFinite(pdfPageCount) &&
    pdfPageCount > 0
      ? Math.trunc(pdfPageCount)
      : null;
  return {
    webPages: bookReaderPageItems(items).length,
    tocNodes: items.length,
    pdfPages,
  };
}

function bookPdfPageCount(book?: { numberOfPages?: string } | null) {
  const match = (book?.numberOfPages || "").match(/\d+/);
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function bookReaderNavigationItems(items: BlogTocItem[]) {
  const sectionItems = items.filter((item) => item.level === 3);
  if (!sectionItems.length) return bookReaderPageItems(items);

  const navigationItems: BlogTocItem[] = [];
  const pageIds = new Set(bookReaderPageItems(items).map((item) => item.id));
  let currentChapter: BlogTocItem | null = null;
  let includedChapterId = "";
  const includeStandaloneChapter = () => {
    if (currentChapter && currentChapter.id !== includedChapterId && pageIds.has(currentChapter.id)) {
      navigationItems.push(currentChapter);
      includedChapterId = currentChapter.id;
    }
  };
  bookReaderContentItems(items).forEach((item) => {
    if (item.level === 2) {
      includeStandaloneChapter();
      currentChapter = item;
      return;
    }
    if (item.level !== 3) return;
    if (currentChapter && includedChapterId !== currentChapter.id) {
      navigationItems.push(currentChapter);
      includedChapterId = currentChapter.id;
    }
    navigationItems.push(item);
  });
  includeStandaloneChapter();
  return navigationItems;
}

function bookReaderPageForTarget(
  items: BlogTocItem[],
  targetId: string,
): BlogTocItem | null {
  if (!items.length) return null;
  const pages = bookReaderPageItems(items);
  const targetIndex = targetId
    ? items.findIndex((item) => item.id === targetId)
    : -1;
  if (targetIndex >= 0) {
    const pageIds = new Set(pages.map((item) => item.id));
    if (items[targetIndex].level === 2 && !items[targetIndex].id.startsWith("page-")) {
      if (pageIds.has(targetId)) return items[targetIndex];
      for (let index = targetIndex + 1; index < items.length && items[index].level !== 2; index += 1) {
        if (pageIds.has(items[index].id)) return items[index];
      }
    }
    for (let index = targetIndex; index >= 0; index -= 1) {
      if (pageIds.has(items[index].id)) return items[index];
    }
    return (
      pages.find(
        (page) => items.findIndex((item) => item.id === page.id) > targetIndex,
      ) ||
      pages[0] ||
      items[targetIndex]
    );
  }
  return pages[0] || items[0];
}

function bookReaderAdjacentPages(items: BlogTocItem[], pageId: string) {
  const pages = bookReaderPageItems(items);
  const index = pages.findIndex((item) => item.id === pageId);
  return {
    currentIndex: index,
    total: pages.length,
    previous: index > 0 ? pages[index - 1] : null,
    next: index >= 0 && index < pages.length - 1 ? pages[index + 1] : null,
  };
}

function bookReaderHashPath(path: string, id: string) {
  return `${path}#${encodeURIComponent(id)}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeReaderTOCLevel(value: unknown): BlogTocItem["level"] | null {
  const level = typeof value === "number" ? Math.trunc(value) : Number(value);
  return level === 2 || level === 3 || level === 4 ? level : null;
}

function storedBookReaderTocItems(
  body: string,
  marker: "RIN_MARKDOWN_BOOK" | "RIN_READER",
) {
  const raw = extractMarkedSection(body, marker);
  if (!raw) return [];
  try {
    const payload: unknown = JSON.parse(raw);
    if (!isPlainRecord(payload) || !Array.isArray(payload.toc)) return [];
    return payload.toc
      .map((item): BlogTocItem | null => {
        if (
          !isPlainRecord(item) ||
          typeof item.id !== "string" ||
          typeof item.text !== "string"
        ) {
          return null;
        }
        const level = normalizeReaderTOCLevel(item.level);
        if (!level || !item.id.trim() || !item.text.trim()) return null;
        return {
          id: item.id.trim(),
          text: item.text.trim(),
          level,
        };
      })
      .filter((item): item is BlogTocItem => item !== null);
  } catch {
    return [];
  }
}

function comparableBookChapterText(value: string) {
  let result = "";
  for (const character of value.normalize("NFKC").toLowerCase()) {
    if (/[\p{L}\p{N}]/u.test(character)) {
      result += character;
    }
  }
  return result;
}

function normalizedBookChapterText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function bookTOCReaderMatchIndex(
  toc: BookTOCItem[],
  readerItem: BlogTocItem,
  readerIndex = -1,
) {
  const readerLevel = readerItem.level;
  const readerText = normalizedBookChapterText(readerItem.text);
  const exactIndex = toc.findIndex(
    (item) =>
      bookTOCLevel(item) === readerLevel &&
      normalizedBookChapterText(item.title) === readerText,
  );
  if (exactIndex >= 0) return exactIndex;

  const comparableText = comparableBookChapterText(readerItem.text);
  if (comparableText) {
    const comparableIndex = toc.findIndex(
      (item) =>
        bookTOCLevel(item) === readerLevel &&
        comparableBookChapterText(item.title) === comparableText,
    );
    if (comparableIndex >= 0) return comparableIndex;
  }

  if (readerIndex >= 0 && readerIndex < toc.length) return readerIndex;
  return -1;
}

function bookReaderTargetForChapter(
  node: BookTOCNode,
  readerItems: BlogTocItem[],
) {
  if (!readerItems.length) return "";
  const targetIndex = bookTOCReaderMatchIndex(
    readerItems.map((item) => ({ title: item.text, level: item.level })),
    {
      id: node.id,
      text: node.title,
      level: normalizeReaderTOCLevel(node.level) || 2,
    },
    node.tocIndex,
  );
  return targetIndex >= 0 ? readerItems[targetIndex]?.id || "" : "";
}

function bookChapterKeyForReaderPage(
  toc: BookTOCItem[],
  readerItems: BlogTocItem[],
  readerItem: BlogTocItem | null,
) {
  if (!toc.length || !readerItem) return "";
  const readerIndex = readerItems.findIndex(
    (item) => item.id === readerItem.id,
  );
  const tocIndex = bookTOCReaderMatchIndex(toc, readerItem, readerIndex);
  return tocIndex >= 0 ? bookChapterKey(tocIndex, toc[tocIndex]) : "";
}

function pushHashWithoutNavigation(targetId: string) {
  if (typeof window === "undefined") return;
  const nextHash = `#${encodeURIComponent(targetId)}`;
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  if (window.location.hash === nextHash) return;
  window.history.pushState(null, "", nextUrl);
}

function markdownFootnoteScrollAnchor(target: HTMLElement) {
  if (!target.classList.contains("rin-footnote-ref")) return target;
  const paragraph = target.closest("p");
  return paragraph instanceof HTMLElement ? paragraph : target;
}

function scrollMarkdownFootnoteTarget(target: HTMLElement) {
  if (typeof window === "undefined") return;
  const anchor = markdownFootnoteScrollAnchor(target);
  const topbar = document.querySelector<HTMLElement>(".topbar");
  const offset = Math.max(
    blogTocScrollOffset + 72,
    Math.ceil((topbar?.getBoundingClientRect().bottom || 0) + 88),
  );
  const top = window.scrollY + anchor.getBoundingClientRect().top - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

function alignMarkdownFootnoteTarget(target: HTMLElement) {
  if (typeof window === "undefined") return;
  const align = () => scrollMarkdownFootnoteTarget(target);
  window.requestAnimationFrame(() => {
    align();
    window.setTimeout(align, 120);
    window.setTimeout(align, 420);
    window.setTimeout(align, 900);
    window.setTimeout(align, 1400);
  });
}

function handleMarkdownFootnoteNavigationClick(
  event: ReactMouseEvent<HTMLElement>,
  target: Element,
) {
  const footnoteLink = target.closest<HTMLAnchorElement>(
    'a.rin-footnote-backref[href^="#"], .rin-footnote-ref a[href^="#"]',
  );
  if (!footnoteLink) return false;
  const rawFootnoteId = footnoteLink.getAttribute("href")?.slice(1) || "";
  if (!rawFootnoteId) return false;
  const decodedFootnoteId = decodeBookReaderHash(`#${rawFootnoteId}`);
  const footnoteTarget = document.getElementById(decodedFootnoteId);
  if (!footnoteTarget) return false;
  event.preventDefault();
  pushHashWithoutNavigation(decodedFootnoteId);
  alignMarkdownFootnoteTarget(footnoteTarget);
  return true;
}

function articleHashTarget(rawId: string) {
  if (typeof document === "undefined" || !rawId) return null;
  const decodedId = decodeBookReaderHash(`#${rawId}`);
  return document.getElementById(decodedId) || document.getElementById(rawId);
}

function alignArticleHashTarget(rawId: string) {
  if (typeof window === "undefined" || !rawId) return () => {};
  const timers: number[] = [];
  let frame = 0;
  const align = () => {
    const target = articleHashTarget(rawId);
    if (!target) return;
    target.scrollIntoView({ block: "start" });
  };
  frame = window.requestAnimationFrame(() => {
    align();
    timers.push(window.setTimeout(align, 120));
    timers.push(window.setTimeout(align, 420));
    timers.push(window.setTimeout(align, 900));
    timers.push(window.setTimeout(align, 1400));
  });
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}

function scheduleRinWriterBibliographyHashAlignment(hash: string) {
  if (!hash || !hash.startsWith("#rin-bib-")) return undefined;
  return alignArticleHashTarget(hash.slice(1));
}

function handleRinBibliographyLinkClick(
  event: ReactMouseEvent<HTMLElement>,
  target: Element,
) {
  const bibliographyLink = target.closest<HTMLAnchorElement>(
    'a.rin-citation[href^="#rin-bib-"], a[href^="#rin-bib-"]',
  );
  if (!bibliographyLink) return false;
  const rawId = bibliographyLink.getAttribute("href")?.slice(1) || "";
  if (!rawId) return false;
  const decodedId = decodeBookReaderHash(`#${rawId}`);
  event.preventDefault();
  pushHashWithoutNavigation(decodedId || rawId);
  alignArticleHashTarget(rawId);
  return true;
}

function currentBlogTocId(items: BlogTocItem[], offset = blogTocScrollOffset) {
  if (typeof document === "undefined") return items[0]?.id || "";
  if (!items.length) return "";
  const headings = items
    .map((item) => document.getElementById(item.id))
    .filter((element): element is HTMLElement => element !== null);
  if (!headings.length) return items[0]?.id || "";

  let activeId = headings[0].id;
  for (const heading of headings) {
    const top = heading.getBoundingClientRect().top;
    if (top <= offset) {
      activeId = heading.id;
      continue;
    }
    if (activeId === headings[0].id && top <= window.innerHeight * 0.36) {
      activeId = heading.id;
    }
    break;
  }
  return activeId;
}

function blogTocTree(items: BlogTocItem[]) {
  const roots: BlogTocNode[] = [];
  const stack: BlogTocNode[] = [];

  for (const item of items) {
    const node: BlogTocNode = { ...item, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }

  return roots;
}

function blogTocCollapsibleIds(nodes: BlogTocNode[]) {
  const ids: string[] = [];
  const visit = (node: BlogTocNode) => {
    if (node.children.length) ids.push(node.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

function blogTocActivePathIds(nodes: BlogTocNode[], activeId: string) {
  const path = new Set<string>();
  const visit = (node: BlogTocNode): boolean => {
    if (node.id === activeId) {
      path.add(node.id);
      return true;
    }
    if (node.children.some(visit)) {
      path.add(node.id);
      return true;
    }
    return false;
  };
  nodes.forEach(visit);
  return path;
}

function hasVisibleRinContent(element: Element) {
  if (
    element.classList.contains("rin-doc-meta") ||
    element.classList.contains("rin-doc-classification")
  ) {
    return false;
  }

  const text = normalizedTitleText(element.textContent || "").replace(
    /\u00a0/g,
    "",
  );
  if (text) return true;

  return Boolean(
    element.querySelector(
      "img, svg, video, iframe, table, pre, blockquote, figure, canvas, math, .katex, .katex-display, .rin-display-math, .rin-env, .rin-tikz, .rin-quiver, .rin-asset, .rin-float",
    ),
  );
}

function nodeHasVisibleIntroContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(
      normalizedTitleText(node.textContent || "").replace(/\u00a0/g, ""),
    );
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return hasVisibleRinContent(node as Element);
}

function isRinSectionHeading(element: Element) {
  return element.tagName.toLowerCase() === "h2";
}

function findFirstSectionHeading(root: ParentNode): Element | null {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (isRinSectionHeading(element)) return element;

    const nestedHeading = findFirstSectionHeading(element);
    if (nestedHeading) return nestedHeading;
  }

  return null;
}

function hasVisibleContentBefore(root: ParentNode, target: Element): boolean {
  for (const child of Array.from(root.childNodes)) {
    if (child === target) return false;
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child as Element).contains(target)
    ) {
      return hasVisibleContentBefore(child as Element, target);
    }
    if (nodeHasVisibleIntroContent(child)) return true;
  }

  return false;
}

function hasIntroBeforeFirstSectionHtml(html: string) {
  if (typeof window === "undefined" || !html.trim()) return false;
  const document = new DOMParser().parseFromString(html, "text/html");
  const firstSectionHeading = findFirstSectionHeading(document.body);
  if (!firstSectionHeading) return false;
  return hasVisibleContentBefore(document.body, firstSectionHeading);
}

function sanitizedRinWriterHtmlHasIntro(html: string) {
  return html.includes("rin-first-section-with-intro");
}

const RinWriterArticle = memo(function RinWriterArticle({
  html,
  title,
  onReaderReference,
  removeGeneratedToc,
  deferMath,
  serverFinal,
  enableBibliographyHashNavigation,
  enableInternalLinkPreviews,
}: {
  html: string;
  title: string;
  onReaderReference?: (targetId: string, ownerPageId?: string) => void;
  removeGeneratedToc?: boolean;
  deferMath?: boolean;
  serverFinal?: boolean;
  enableBibliographyHashNavigation?: boolean;
  enableInternalLinkPreviews?: boolean;
}) {
  const { t } = useFeatureTranslation("reader");
  const articleRef = useRef<HTMLElement | null>(null);
  const sanitizedHtml = useMemo(
    () =>
      sanitizeRinWriterHtml(html, title, {
        removeGeneratedToc,
        deferMath,
        serverFinal,
      }),
    [deferMath, html, removeGeneratedToc, serverFinal, title],
  );
  const hasIntro = useMemo(
    () => sanitizedRinWriterHtmlHasIntro(sanitizedHtml),
    [sanitizedHtml],
  );

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return undefined;
    const controller = new AbortController();
    const hydration = rinArticleHydrationPlan({
      serverFinal: Boolean(serverFinal),
      deferMath: Boolean(deferMath),
      hasDeferredMath: Boolean(root.querySelector(".rin-deferred-math")),
    });
    if (hydration.renderDeferredMath) {
      renderDeferredMathInBatches(root, controller.signal);
    }
    if (hydration.renderMathTextNodes) {
      renderRinMathTextNodesInBatches(root, controller.signal);
    }
    if (hydration.renderLateXMLMathML) {
      renderLateXMLMathMLInBatches(root, controller.signal);
    }
    if (hydration.renderDiagrams) {
      renderRinReaderDiagrams(root, controller.signal);
    }
    // Final Bundles already contain MathJax CHTML. Only the established font/stretchy repair is
    // allowed to touch it; the official menu remains event-driven in handleArticleContextMenu.
    if (hydration.hydrateMathJaxStretchy) {
      void hydrateRinMathJaxStretchyMath(root, controller.signal);
    }
    return () => controller.abort();
  }, [deferMath, sanitizedHtml, serverFinal]);

  // Code blocks are wrapped in a separate layout effect with no deps so they are re-applied after
  // every commit. A re-render that re-applies dangerouslySetInnerHTML (e.g. when post state
  // refreshes) otherwise reverts the imperative wrapping and leaves server-final <pre> blocks bare.
  // The enhancement is idempotent: already-wrapped blocks are skipped.
  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const hydration = rinArticleHydrationPlan({
      serverFinal: Boolean(serverFinal),
      deferMath: Boolean(deferMath),
      hasDeferredMath: Boolean(root.querySelector(".rin-deferred-math")),
    });
    if (hydration.enhanceCodeWithShiki) {
      enhanceRinCodeBlocks(root, new AbortController().signal);
    }
    if (hydration.decorateFinalCode) {
      // Preserve reader chrome without importing Shiki or replacing its server-rendered tokens.
      decorateFinalRinCodeBlocks(root, new AbortController().signal);
    }
  });

  useEffect(() => {
    if (!enableBibliographyHashNavigation || typeof window === "undefined")
      return undefined;
    return scheduleRinWriterBibliographyHashAlignment(window.location.hash);
  }, [enableBibliographyHashNavigation, sanitizedHtml]);

  const handleArticleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (handleMarkdownFootnoteNavigationClick(event, target)) return;
      if (
        enableBibliographyHashNavigation &&
        handleRinBibliographyLinkClick(event, target)
      ) {
        return;
      }
      const link = target.closest<HTMLAnchorElement>(
        'a.rin-reader-ref[href^="#"]',
      );
      if (!link) return;
      const rawId = link.getAttribute("href")?.slice(1) || "";
      if (!rawId) return;
      const decodedId = decodeBookReaderHash(`#${rawId}`);
      event.preventDefault();
      // The Typst adapter authorises data-rin-page only for references whose
      // target lives on another reader page; same-page references carry no
      // marker. Forwarding it lets the reader open the declared owner page
      // instead of re-scanning every page for the anchor.
      const ownerPageId = (link.getAttribute("data-rin-page") || "").trim();
      onReaderReference?.(decodedId, ownerPageId || undefined);
      alignArticleHashTarget(rawId);
    },
    [enableBibliographyHashNavigation, onReaderReference],
  );

  const handleArticleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      void hydrateRinMathJaxOfficialMenu(event.nativeEvent);
    },
    [],
  );

  return (
    <section
      className="rin-writer-article"
      aria-label={t("detail.article.rinWriterBody")}
      data-rin-render-source={serverFinal ? "server-final" : "browser-fallback"}
      ref={articleRef}
      onClick={handleArticleClick}
      onContextMenu={handleArticleContextMenu}
    >
      <div
        className={`rin-writer-html${
          hasIntro ? " rin-writer-html-has-intro" : " rin-writer-html-no-intro"
        }`}
        dangerouslySetInnerHTML={{
          __html: sanitizedHtml || "<p>Empty article.</p>",
        }}
      />
      {enableInternalLinkPreviews ? (
        <InternalContentLinkPreview rootRef={articleRef} />
      ) : null}
    </section>
  );
});

function MarkdownArticle({
  markdown,
  title,
  onReaderReference,
  removeGeneratedToc,
  deferMath,
}: {
  markdown: string;
  title: string;
  onReaderReference?: (targetId: string) => void;
  removeGeneratedToc?: boolean;
  deferMath?: boolean;
}) {
  const { t } = useFeatureTranslation("reader");
  const articleRef = useRef<HTMLElement | null>(null);
  const renderedHtml = useMemo(
    () => markdownArticleHtml(markdown, { deferMath }),
    [deferMath, markdown],
  );
  const sanitizedHtml = useMemo(
    () =>
      sanitizeRinWriterHtml(renderedHtml, title, {
        removeGeneratedToc,
        deferMath,
      }),
    [deferMath, renderedHtml, removeGeneratedToc, title],
  );
  const hasIntro = useMemo(
    () => sanitizedRinWriterHtmlHasIntro(sanitizedHtml),
    [sanitizedHtml],
  );

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return undefined;
    const controller = new AbortController();
    renderDeferredMathInBatches(root, controller.signal);
    if (deferMath && !root.querySelector(".rin-deferred-math")) {
      renderRinMathTextNodesInBatches(root, controller.signal);
    }
    renderRinReaderDiagrams(root, controller.signal);
    void hydrateRinMathJaxStretchyMath(root, controller.signal);
    return () => controller.abort();
  }, [deferMath, sanitizedHtml]);

  // Re-applied after every commit so a re-render can't leave code blocks unwrapped.
  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    enhanceRinCodeBlocks(root, new AbortController().signal);
  });

  const handleArticleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (handleMarkdownFootnoteNavigationClick(event, target)) return;
      const link = target.closest<HTMLAnchorElement>(
        'a.rin-reader-ref[href^="#"]',
      );
      if (!link) return;
      const rawId = link.getAttribute("href")?.slice(1) || "";
      if (!rawId) return;
      const decodedId = decodeBookReaderHash(`#${rawId}`);
      event.preventDefault();
      onReaderReference?.(decodedId);
      window.setTimeout(() => {
        document.getElementById(decodedId)?.scrollIntoView({ block: "start" });
      }, 0);
    },
    [onReaderReference],
  );

  const handleArticleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      void hydrateRinMathJaxOfficialMenu(event.nativeEvent);
    },
    [],
  );

  return (
    <section
      className="rin-writer-article"
      aria-label={t("detail.article.markdownBody")}
      ref={articleRef}
      onClick={handleArticleClick}
      onContextMenu={handleArticleContextMenu}
    >
      <div
        className={`rin-writer-html${
          hasIntro ? " rin-writer-html-has-intro" : " rin-writer-html-no-intro"
        }`}
        dangerouslySetInnerHTML={{
          __html: sanitizedHtml || "<p>Empty article.</p>",
        }}
      />
    </section>
  );
}

function BlogTableOfContents({
  items,
  activeId,
  onSelect,
}: {
  items: BlogTocItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const tocTree = useMemo(() => blogTocTree(items), [items]);
  const collapsibleIds = useMemo(
    () => blogTocCollapsibleIds(tocTree),
    [tocTree],
  );
  const activePathIds = useMemo(
    () => blogTocActivePathIds(tocTree, activeId),
    [activeId, tocTree],
  );
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [overflowsScreen, setOverflowsScreen] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState(0);

  useEffect(() => {
    setCollapsedIds(new Set());
    setOverflowsScreen(false);
  }, [items]);

  useEffect(() => {
    const measure = () => {
      const list = listRef.current;
      if (!list) return;
      const availableHeight = Math.max(220, window.innerHeight - 192);
      const estimatedFullHeight = items.length * 30;
      const nextOverflowsScreen =
        Math.max(list.scrollHeight, estimatedFullHeight) > availableHeight + 8;
      setListMaxHeight(availableHeight);
      setOverflowsScreen(nextOverflowsScreen);
      if (nextOverflowsScreen) {
        setCollapsedIds((current) => {
          if (current.size) return current;
          return new Set(collapsibleIds.filter((id) => !activePathIds.has(id)));
        });
      }
    };
    const frameId = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measure);
    };
  }, [activePathIds, collapsibleIds, items]);

  useEffect(() => {
    if (!activePathIds.size) return;
    setCollapsedIds((current) => {
      if (!Array.from(activePathIds).some((id) => current.has(id)))
        return current;
      const next = new Set(current);
      activePathIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [activePathIds]);

  useEffect(() => {
    const activeItem = activeItemRef.current;
    const scrollRoot = activeItem?.closest(".blog-toc-list");
    if (!activeItem || !scrollRoot) return;
    const activeRect = activeItem.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    if (activeRect.top < rootRect.top || activeRect.bottom > rootRect.bottom) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeId, collapsedIds]);

  if (!items.length) return null;

  const toggleNode = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectNode = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    event.preventDefault();
    onSelect(id);
  };

  const renderNodes = (nodes: BlogTocNode[]) =>
    nodes.map((item) => {
      const collapsed = collapsedIds.has(item.id);
      const hasChildren = Boolean(item.children.length);
      return (
        <li
          className={`level-${item.level}${activeId === item.id ? " active" : ""}${hasChildren ? " has-children" : ""}${collapsed ? " collapsed" : " expanded"}`}
          key={item.id}
          ref={activeId === item.id ? activeItemRef : undefined}
        >
          <div className="blog-toc-row">
            {hasChildren ? (
              <AnimateButton
                unstyled
                type="button"
                className="blog-toc-collapse"
                aria-label={
                  collapsed
                    ? t("detail.toc.expand", { title: item.text })
                    : t("detail.toc.collapse", { title: item.text })
                }
                aria-expanded={!collapsed}
                onClick={() => toggleNode(item.id)}
              >
                <Icon name={collapsed ? "chevron-right" : "chevron-down"} />
              </AnimateButton>
            ) : (
              <span className="blog-toc-spacer" aria-hidden="true" />
            )}
            <a
              href={`#${item.id}`}
              aria-current={activeId === item.id ? "location" : undefined}
              onClick={(event) => selectNode(event, item.id)}
            >
              <MathInline text={item.text} />
            </a>
          </div>
          {hasChildren && !collapsed ? (
            <ul>{renderNodes(item.children)}</ul>
          ) : null}
        </li>
      );
    });

  return (
    <nav
      className={`blog-toc${overflowsScreen ? " has-many-items" : ""}`}
      aria-label={t("detail.toc.blogLabel")}
      style={
        listMaxHeight
          ? ({
              "--blog-toc-list-max-height": `${listMaxHeight}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="blog-toc-head">
        <span>{t("detail.toc.title")}</span>
        {overflowsScreen ? (
          <em>
            {t("detail.toc.itemCount", {
              count: items.length,
              displayCount: formatNumber(locale, items.length),
            })}
          </em>
        ) : null}
      </div>
      <ul className="blog-toc-list" ref={listRef}>
        {renderNodes(tocTree)}
      </ul>
    </nav>
  );
}

function BookReaderTableOfContents({
  items,
  activeId,
  pageId,
  pdfPageCount,
  onSelect,
}: {
  items: BlogTocItem[];
  activeId: string;
  pageId: string;
  pdfPageCount?: number | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const navigationItems = useMemo(
    () => bookReaderNavigationItems(items),
    [items],
  );
  const tocTree = useMemo(
    () => blogTocTree(navigationItems),
    [navigationItems],
  );
  const activePathIds = useMemo(
    () => blogTocActivePathIds(tocTree, activeId || pageId),
    [activeId, pageId, tocTree],
  );
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const pageCounts = useMemo(
    () => bookReaderPageCounts(items, pdfPageCount),
    [items, pdfPageCount],
  );

  useEffect(() => {
    setCollapsedIds(new Set());
  }, [items]);

  useEffect(() => {
    if (!activePathIds.size) return;
    setCollapsedIds((current) => {
      if (!Array.from(activePathIds).some((id) => current.has(id)))
        return current;
      const next = new Set(current);
      activePathIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [activePathIds]);

  useEffect(() => {
    const activeItem = activeItemRef.current;
    const scrollRoot = listRef.current;
    if (!activeItem || !scrollRoot) return;
    const activeRect = activeItem.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    if (activeRect.top < rootRect.top || activeRect.bottom > rootRect.bottom) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeId, pageId, collapsedIds]);

  if (!navigationItems.length) return null;

  const toggleNode = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNodes = (nodes: BlogTocNode[]) =>
    nodes.map((item) => {
      const collapsed = collapsedIds.has(item.id);
      const hasChildren = item.children.length > 0;
      const isCurrentPage = pageId === item.id;
      const isActiveTarget = activeId === item.id;
      return (
        <li
          className={`book-reader-toc-node level-${item.level}${isCurrentPage ? " current-page" : ""}${isActiveTarget ? " active" : ""}${hasChildren ? " has-children" : ""}`}
          key={item.id}
          ref={isActiveTarget || isCurrentPage ? activeItemRef : undefined}
        >
          <div className="book-reader-toc-row">
            {hasChildren ? (
              <AnimateButton
                unstyled
                type="button"
                className="book-reader-toc-collapse"
                aria-label={
                  collapsed
                    ? t("detail.toc.expand", { title: item.text })
                    : t("detail.toc.collapse", { title: item.text })
                }
                aria-expanded={!collapsed}
                onClick={() => toggleNode(item.id)}
              >
                <Icon name={collapsed ? "chevron-right" : "chevron-down"} />
              </AnimateButton>
            ) : (
              <span className="book-reader-toc-spacer" aria-hidden="true" />
            )}
            <AnimateButton
              unstyled
              type="button"
              className="book-reader-toc-link"
              aria-current={
                isActiveTarget || isCurrentPage ? "location" : undefined
              }
              onClick={() => onSelect(item.id)}
            >
              <span>{item.text}</span>
            </AnimateButton>
          </div>
          {hasChildren && !collapsed ? (
            <ol>{renderNodes(item.children)}</ol>
          ) : null}
        </li>
      );
    });

  return (
    <nav className="book-reader-toc" aria-label={t("detail.toc.bookLabel")}>
      <div className="book-reader-toc-head">
        <span>{t("detail.toc.bookLabel")}</span>
        <strong className="book-reader-toc-counts">
          <span data-rin-reader-web-pages={pageCounts.webPages}>
            {t("detail.toc.webPageCount", {
              count: pageCounts.webPages,
              displayCount: formatNumber(locale, pageCounts.webPages),
            })}
          </span>
          <span className="book-reader-toc-count-divider" aria-hidden="true">
            {" · "}
          </span>
          <span data-rin-reader-toc-nodes={pageCounts.tocNodes}>
            {t("detail.toc.nodeCount", {
              count: pageCounts.tocNodes,
              displayCount: formatNumber(locale, pageCounts.tocNodes),
            })}
          </span>
          {pageCounts.pdfPages ? (
            <>
              <span
                className="book-reader-toc-count-divider"
                aria-hidden="true"
              >
                {" · "}
              </span>
              <span
                className="book-reader-toc-count-pdf"
                data-rin-reader-pdf-pages={pageCounts.pdfPages}
              >
                {t("detail.toc.pdfPageCount", {
                  count: pageCounts.pdfPages,
                  displayCount: formatNumber(locale, pageCounts.pdfPages),
                })}
              </span>
            </>
          ) : null}
        </strong>
      </div>
      <ol className="book-reader-toc-list" ref={listRef}>
        {renderNodes(tocTree)}
      </ol>
    </nav>
  );
}

function detailBodyClassName(post: PostDetail | null) {
  if (!post || (post.type !== "blog" && post.type !== "book"))
    return "detail-body";
  const html = rinWriterHtml(post.body);
  if (!html) return "detail-body";
  const sanitizedHtml = sanitizeRinWriterHtml(html, post.title, {
    serverFinal: true,
  });
  return `detail-body ${
    hasIntroBeforeFirstSectionHtml(sanitizedHtml)
      ? "detail-body-has-section-intro"
      : "detail-body-no-section-intro"
  }`;
}

function bookReaderTocItems(post: PostDetail | null) {
  if (!post || post.type !== "book") return [];
  const markdownItems = storedBookReaderTocItems(
    post.body,
    "RIN_MARKDOWN_BOOK",
  );
  if (markdownItems.length) return markdownItems;
  const storedItems = storedBookReaderTocItems(post.body, "RIN_READER");
  if (storedItems.length) return storedItems;
  const html = rinWriterHtml(post.body);
  return html
    ? rinWriterTocItems(html, post.book?.bookTitle || post.title)
    : [];
}

function bookOverviewIntroText(post: PostDetail | null) {
  if (!post || post.type !== "book") return "";
  const candidates = [post.searchDescription, post.excerpt, post.body];
  for (const candidate of candidates) {
    const text = (candidate || "").trim();
    if (!text || /\[\[RIN_[A-Z_]+\]\]/.test(text)) continue;
    return text;
  }
  return "";
}

function questionStatusKey(status: number) {
  if (status === 2) return "closed";
  if (status === 10) return "deleted";
  return "open";
}

function questionPath(question: AnswerQuestionInfo) {
  return routeQuestionPath(question.id, question.title);
}

const QUESTION_NETWORK_LIMIT = 5;

function mergeQuestionNetworkItems(
  currentQuestionID: string | number,
  groups: AnswerQuestionInfo[][],
  limit = QUESTION_NETWORK_LIMIT,
) {
  const seen = new Set<string>([String(currentQuestionID).trim()]);
  const items: AnswerQuestionInfo[] = [];
  groups.forEach((group) => {
    group.forEach((item) => {
      const id = String(item.id).trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      items.push(item);
    });
  });
  return items.slice(0, limit);
}

async function loadRelatedQuestionNetwork(detail: QuestionDetail) {
  const questionID = detail.question.id;
  const results = await Promise.allSettled([
    loadSimilarQuestionsByTag({
      questionId: questionID,
      pageSize: QUESTION_NETWORK_LIMIT + 3,
    }),
    loadSimilarQuestionsByTitle({
      title: detail.question.title,
      pageSize: QUESTION_NETWORK_LIMIT + 3,
    }),
    loadAnswerQuestionPage({
      order: "hot",
      pageSize: QUESTION_NETWORK_LIMIT + 3,
    }),
  ]);
  const groups: AnswerQuestionInfo[][] = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      groups.push(result.value.items);
    }
  });
  const items = mergeQuestionNetworkItems(questionID, groups);
  const failedCount = results.filter(
    (result) => result.status === "rejected",
  ).length;
  return {
    items,
    error:
      !items.length && failedCount === results.length
        ? "loadFailed"
        : "",
  };
}

function activityPath(post: PostDetail) {
  const objectType = post.type === "question" ? "question" : post.type;
  return `/activity?object_type=${encodeURIComponent(objectType)}&object_id=${encodeURIComponent(post.id)}`;
}

function revisionActivityPath(post: PostDetail, objectId: number | null) {
  const objectType = revisionObjectTypeForPost(post);
  const targetId = objectId ?? post.id;
  return `/activity?object_type=${encodeURIComponent(objectType)}&object_id=${encodeURIComponent(String(targetId))}`;
}

function revisionDetailActivityPath(
  post: PostDetail,
  objectId: number | null,
  revisionId: number,
) {
  return `${revisionActivityPath(post, objectId)}&revision_id=${encodeURIComponent(String(revisionId))}`;
}

function revisionObjectTypeForPost(post: PostDetail): RevisionObjectType {
  switch (post.type) {
    case "question":
      return "question";
    case "blog":
      return "blog";
    case "discussion":
    case "announcement":
      return "discussion";
    case "dynamic":
      return "dynamic";
    case "forum":
      return "forum";
    case "status":
      return "status";
    case "task":
      return "post";
    default:
      return "post";
  }
}

function commentTargetKey(target: CommentTargetRef) {
  return `${target.targetType}:${target.targetId ?? target.slug ?? "current"}`;
}

function postCommentTarget(post: PostDetail): CommentTargetType {
  if (post.type === "task" || post.type === "tag") return "post";
  if (post.type === "announcement") return "discussion";
  if (post.type === "forum") return "discussion";
  if (post.type === "status") return "dynamic";
  if (post.type === "book") return "post";
  return post.type;
}

function voteKey(targetType: VoteTargetType, targetId: number) {
  return `${targetType}:${targetId}`;
}

function inviteIdentity(
  user: Pick<AnswerUserBasicInfo, "username" | "display_name">,
) {
  return user.display_name.trim() || user.username.trim();
}

function inviteIdentifier(
  user: Pick<AnswerUserBasicInfo, "id" | "username" | "display_name">,
) {
  return (
    user.id.trim() ||
    user.username.trim().toLowerCase() ||
    user.display_name.trim()
  );
}

function isRinInviteUser(
  user: Pick<AnswerUserBasicInfo, "id" | "username" | "display_name">,
) {
  return [user.id, user.username, user.display_name].some(
    (value) =>
      value.trim().toLowerCase() === "rin" || value.trim() === "\u7433",
  );
}

function isRinAnswer(answer: Pick<AnswerSummary, "author" | "authorId">) {
  return [answer.authorId || "", answer.author].some(
    (value) =>
      value.trim().toLowerCase() === "rin" || value.trim() === "\u7433",
  );
}

function isRinInviteQuery(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^@/, "");
  return normalized === "rin" || normalized === "\u7433";
}

function inviteLookupKey(
  user: Pick<AnswerUserBasicInfo, "id" | "username" | "display_name">,
) {
  return (
    user.id.trim() ||
    user.username.trim().toLowerCase() ||
    user.display_name.trim().toLowerCase()
  );
}

function inviteCandidateFromUser(user: AnswerUserInfo): InviteCandidate {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar: user.avatar,
    rank: user.rank,
    status: user.status,
    answerCount: user.answer_count,
    questionCount: user.question_count,
  };
}

function rinInviteCandidate(): InviteCandidate {
  return {
    id: "rin",
    username: "rin",
    display_name: "\u7433",
    avatar: `${publicEnv.publicBasePath || ""}/assets/rin-avatar.png`,
    rank: 0,
    status: "available",
  };
}

function mentionCandidateFromUser(user: AnswerUserInfo): MentionCandidate {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar: user.avatar,
    rank: user.rank,
    status: user.status,
    answerCount: user.answer_count,
    questionCount: user.question_count,
  };
}

function mentionDisplayName(
  user: Pick<AnswerUserBasicInfo, "username" | "display_name">,
) {
  return user.display_name.trim() || user.username.trim();
}

function mentionInsertText(
  user: Pick<AnswerUserBasicInfo, "id" | "username" | "display_name">,
) {
  const displayName =
    mentionDisplayName(user)
      .replace(/[\]\n\r]/g, " ")
      .trim() || user.id;
  return `@[${displayName}](user:${user.id}) `;
}

function detectMentionQuery(
  value: string,
  selection: CodeMirrorSelection,
  key: string,
): MentionQueryState | null {
  if (selection.from !== selection.to) return null;
  const beforeCursor = value.slice(0, selection.from);
  const match = beforeCursor.match(
    /(^|[\s([{>])[@＠]([A-Za-z0-9_.\-\u4e00-\u9fff]{0,32})$/u,
  );
  if (!match || match.index === undefined) return null;
  const prefixLength = match[1]?.length || 0;
  const from = match.index + prefixLength;
  return {
    key,
    query: match[2] || "",
    from,
    to: selection.from,
  };
}

function revisionSummaryText(revision: RevisionSummary, fallback: string) {
  const source =
    revision.reason.trim() || revision.title.trim() || revision.content.trim();
  if (!source) return fallback;
  return source.length > 72 ? `${source.slice(0, 72)}...` : source;
}

function revisionObjectIdFromPost(post: PostDetail) {
  const objectId = Number(post.id);
  return Number.isFinite(objectId) && objectId > 0 ? objectId : null;
}

function revisionObjectIdFromQuestion(detail: QuestionDetail) {
  const answerQuestionId = detail.answers.find(
    (answer) => answer.questionId > 0,
  )?.questionId;
  if (
    typeof answerQuestionId === "number" &&
    Number.isFinite(answerQuestionId) &&
    answerQuestionId > 0
  ) {
    return answerQuestionId;
  }
  return revisionObjectIdFromPost(detail.question);
}

function collectionCountHint(post: PostDetail | null) {
  if (!post) return null;
  return typeof post.favoriteCount === "number" && Number.isFinite(post.favoriteCount)
    ? post.favoriteCount
    : null;
}

function repostCountHint(post: PostDetail | null) {
  if (!post) return null;
  return typeof post.shareCount === "number" && Number.isFinite(post.shareCount)
    ? post.shareCount
    : null;
}

function reportTypeForPost(type: ContentType): ReportTargetType {
  if (type === "forum") return "discussion";
  if (type === "announcement") return "discussion";
  if (type === "status") return "dynamic";
  if (type === "book") return "post";
  return type === "task" || type === "tag" ? "post" : type;
}

function contentActionTargetType(
  type: ContentType,
): CollectionTargetInput["targetType"] {
  if (type === "announcement") return "discussion";
  if (type === "forum") return "discussion";
  if (type === "status") return "dynamic";
  if (type === "book") return "post";
  return type === "task" || type === "tag" ? "post" : type;
}


function QuestionNetworkPanel({
  title,
  questions,
  moreTo,
  loading = false,
  errorKey = "",
  emptyText,
  showEmpty = false,
}: {
  title: string;
  questions: AnswerQuestionInfo[];
  moreTo?: string;
  loading?: boolean;
  errorKey?: string;
  emptyText?: string;
  showEmpty?: boolean;
}) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  if (!questions.length && !loading && !errorKey && !showEmpty) return null;
  return (
    <section className="panel linked-question-panel">
      <div className="panel-heading">
        <span>{title}</span>
        {moreTo && questions.length ? (
          <Link to={moreTo}>{t("detail.questionNetwork.all")}</Link>
        ) : loading ? (
          <strong>{t("detail.questionNetwork.loadingShort")}</strong>
        ) : (
          <strong>{formatNumber(locale, questions.length)}</strong>
        )}
      </div>
      {errorKey ? (
        <div className="linked-question-state error">
          {t(`detail.questionNetwork.errors.${errorKey}`)}
        </div>
      ) : null}
      {loading && !errorKey ? (
        <div className="linked-question-state">
          {t("detail.questionNetwork.loading")}
        </div>
      ) : null}
      {!loading && !errorKey && questions.length ? (
        <div className="linked-question-list">
          {questions.map((item, index) => (
            <Link
              className="linked-question-item"
              key={item.id}
              to={questionPath(item)}
            >
              <span className="linked-question-mark" aria-hidden="true">
                <span>q</span>
                <small>{String(index + 1).padStart(2, "0")}</small>
              </span>
              <span className="linked-question-main">
                <strong>
                  <MathInline text={item.title} />
                </strong>
                <span className="linked-question-meta">
                  <span>
                    {t("detail.questionNetwork.answerCount", {
                      count: item.answer_count,
                      displayCount: formatNumber(locale, item.answer_count),
                    })}
                  </span>
                  <span>
                    {t("detail.questionNetwork.voteCount", {
                      count: item.vote_count,
                      displayCount: formatNumber(locale, item.vote_count),
                    })}
                  </span>
                  <span>
                    {item.accepted_answer_id !== "0"
                      ? t("detail.questionNetwork.accepted")
                      : t("detail.questionNetwork.discussing")}
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
      {!loading && !errorKey && !questions.length && showEmpty ? (
        <div className="linked-question-state">
          {emptyText || t("detail.questionNetwork.empty")}
        </div>
      ) : null}
    </section>
  );
}

function DetailPage({ kind, view = "overview", variant }: DetailPageProps) {
  const { t } = useFeatureTranslation("reader");
  const locale = useResolvedLocale();
  const localizedInteractionText = useCallback(
    (item: PostDetail, isAnnouncement: boolean) => {
      const parts: string[] = [
        t("detail.metrics.readCount", {
          count: item.readCount,
          displayCount: formatNumber(locale, item.readCount),
        }),
      ];
      const commentCount = item.replyCount ?? item.commentCount;
      if (typeof commentCount === "number") {
        parts.push(
          t(
            isAnnouncement
              ? "detail.metrics.responseCount"
              : "detail.metrics.commentCount",
            {
              count: commentCount,
              displayCount: formatNumber(locale, commentCount),
            },
          ),
        );
      }
      if (typeof item.likeCount === "number") {
        parts.push(
          t("detail.metrics.likeCount", {
            count: item.likeCount,
            displayCount: formatNumber(locale, item.likeCount),
          }),
        );
      }
      if (typeof item.favoriteCount === "number") {
        parts.push(
          t("detail.metrics.collectionCount", {
            count: item.favoriteCount,
            displayCount: formatNumber(locale, item.favoriteCount),
          }),
        );
      }
      if (typeof item.shareCount === "number") {
        parts.push(
          t("detail.metrics.shareCount", {
            count: item.shareCount,
            displayCount: formatNumber(locale, item.shareCount),
          }),
        );
      }
      return parts.join(" · ");
    },
    [locale, t],
  );
  const { postId = "", titleSlug = "", slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = postId || slug;
  const isBookReadingRoute = kind === "book" && view === "read";
  const isBlogTypographyTest = kind === "blog" && variant === "typographyTest";
  const [post, setPost] = useState<PostDetail | null>(null);
  const [publicationProgress, setPublicationProgress] =
    useState<PublicationProgress | null>(null);
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [bookReaderPage, setBookReaderPage] =
    useState<BookReaderPageResponse | null>(null);
  const [selectedBookReaderTargetId, setSelectedBookReaderTargetId] =
    useState("");
  const [linkedQuestions, setLinkedQuestions] = useState<AnswerQuestionInfo[]>(
    [],
  );
  const [linkedQuestionsLoading, setLinkedQuestionsLoading] = useState(false);
  const [linkedQuestionsError, setLinkedQuestionsError] = useState("");
  const [relatedQuestions, setRelatedQuestions] = useState<
    AnswerQuestionInfo[]
  >([]);
  const [relatedQuestionsLoading, setRelatedQuestionsLoading] = useState(false);
  const [relatedQuestionsError, setRelatedQuestionsError] = useState("");
  const [revisionItems, setRevisionItems] = useState<RevisionSummary[]>([]);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [inviteUsers, setInviteUsers] = useState<AnswerUserBasicInfo[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteCandidates, setInviteCandidates] = useState<InviteCandidate[]>(
    [],
  );
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerStatus, setAnswerStatus] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [hasSession, setHasSession] = useState(() =>
    Boolean(getStoredSession()),
  );
  const [sessionRevision, setSessionRevision] = useState(0);
  const [currentUser, setCurrentUser] = useState<DetailCurrentUser | null>(
    null,
  );
  const refreshDetailSession = useCallback(() => {
    setHasSession(Boolean(getStoredSession()));
    setSessionRevision((revision) => revision + 1);
  }, []);
  const [questionComments, setQuestionComments] = useState<CommentSummary[]>(
    [],
  );
  const [postComments, setPostComments] = useState<CommentSummary[]>([]);
  const [bookReviews, setBookReviews] = useState<BookReview[]>([]);
  const [bookRating, setBookRating] = useState<BookRatingSummary | null>(null);
  const [bookReviewOrder, setBookReviewOrder] =
    useState<BookReviewOrder>("hot");
  const [bookReviewScore, setBookReviewScore] = useState(10);
  const [bookReviewHoverScore, setBookReviewHoverScore] = useState(0);
  const [bookReviewBody, setBookReviewBody] = useState("");
  const [bookReviewEditing, setBookReviewEditing] = useState(false);
  const [bookReviewLoading, setBookReviewLoading] = useState(false);
  const [bookReviewSubmitting, setBookReviewSubmitting] = useState(false);
  const [bookReviewError, setBookReviewError] = useState("");
  const [relatedBooks, setRelatedBooks] = useState<FeedItem[]>([]);
  const [relatedBooksLoading, setRelatedBooksLoading] = useState(false);
  const [relatedBooksError, setRelatedBooksError] = useState("");
  const [bookActivityItems, setBookActivityItems] = useState<
    BookActivityItem[]
  >([]);
  const [bookActivityTotal, setBookActivityTotal] = useState(0);
  const [bookActivityLoading, setBookActivityLoading] = useState(false);
  const [bookActivityError, setBookActivityError] = useState("");
  const [bookContexts, setBookContexts] = useState<BookContextSummary[]>([]);
  const [bookContextLoading, setBookContextLoading] = useState(false);
  const [bookContextError, setBookContextError] = useState("");
  const [collapsedBookTOCNodes, setCollapsedBookTOCNodes] = useState<
    Set<string>
  >(() => new Set());
  const [bookChapterActivity, setBookChapterActivity] =
    useState<BookChapterActivityResponse | null>(null);
  const [bookChapterLoading, setBookChapterLoading] = useState(false);
  const [bookChapterError, setBookChapterError] = useState("");
  const [selectedBookChapterKey, setSelectedBookChapterKey] = useState("");
  const [bookChapterInvalidNotice, setBookChapterInvalidNotice] = useState("");
  const [bookChapterTab, setBookChapterTab] =
    useState<BookChapterActivityTab>("discussions");
  const [bookChapterDialog, setBookChapterDialog] =
    useState<BookChapterActivityDialog>("");
  const [bookChapterComposer, setBookChapterComposer] =
    useState<BookChapterComposer>("");
  const [bookChapterThreadTitle, setBookChapterThreadTitle] = useState("");
  const [bookChapterThreadBody, setBookChapterThreadBody] = useState("");
  const [bookChapterThreadBusy, setBookChapterThreadBusy] = useState(false);
  const [bookChapterThreadError, setBookChapterThreadError] = useState("");
  const [bookErrataTitle, setBookErrataTitle] = useState("");
  const [bookErrataLocation, setBookErrataLocation] = useState("");
  const [bookErrataOriginal, setBookErrataOriginal] = useState("");
  const [bookErrataCorrection, setBookErrataCorrection] = useState("");
  const [bookErrataNote, setBookErrataNote] = useState("");
  const [bookErrataBusy, setBookErrataBusy] = useState(false);
  const [bookErrataError, setBookErrataError] = useState("");
  const [bookErrataStatusBusy, setBookErrataStatusBusy] = useState("");
  const [answerComments, setAnswerComments] = useState<
    Record<number, CommentSummary[]>
  >({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [openCommentForms, setOpenCommentForms] = useState<
    Record<string, boolean>
  >({});
  const [expandedCommentLists, setExpandedCommentLists] = useState<
    Record<string, boolean>
  >({});
  const [expandedContentReplyGroups, setExpandedContentReplyGroups] = useState<
    Record<number, boolean>
  >({});
  const [contentCommentSectionVisible, setContentCommentSectionVisible] =
    useState(false);
  const [primaryCommentComposerPassed, setPrimaryCommentComposerPassed] =
    useState(false);
  const [floatingCommentComposerExpanded, setFloatingCommentComposerExpanded] =
    useState(false);
  const [floatingCommentComposerBounds, setFloatingCommentComposerBounds] =
    useState({ left: 16, width: 640 });
  const [floatingCommentComposerBottom, setFloatingCommentComposerBottom] =
    useState(12);
  const contentCommentSectionRef = useRef<HTMLElement | null>(null);
  const bookAnnotationArticleRef = useRef<HTMLDivElement | null>(null);
  const primaryCommentComposerRef = useRef<HTMLDivElement | null>(null);
  const [floorReplyDrafts, setFloorReplyDrafts] = useState<
    Record<string, FloorReplyDraft>
  >({});
  const [inlineDynamicReplyTarget, setInlineDynamicReplyTarget] =
    useState<InlineDynamicReplyTarget | null>(null);
  const [commentStatus, setCommentStatus] = useState("");
  const [commentError, setCommentError] = useState("");
  const [commentBusyKey, setCommentBusyKey] = useState("");
  const [commentUploadBusyKey, setCommentUploadBusyKey] = useState("");
  const commentEditorRefs = useRef<
    Record<string, CodeMirrorEditorHandle | null>
  >({});
  const answerEditorRef = useRef<RinMilkdownEditorHandle | null>(null);
  const answerEditEditorRef = useRef<RinMilkdownEditorHandle | null>(null);
  const questionEditBodyEditorRef = useRef<CodeMirrorEditorHandle | null>(null);
  const bookReviewEditorRef = useRef<CodeMirrorEditorHandle | null>(null);
  const [commentSelections, setCommentSelections] = useState<
    Record<string, CodeMirrorSelection>
  >({});
  const [mentionQuery, setMentionQuery] = useState<MentionQueryState | null>(
    null,
  );
  const [mentionCandidates, setMentionCandidates] = useState<
    MentionCandidate[]
  >([]);
  const [mentionSearching, setMentionSearching] = useState(false);
  const [mentionError, setMentionError] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const [commentDeleteConfirmId, setCommentDeleteConfirmId] = useState<
    number | null
  >(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeActive, setLikeActive] = useState(false);
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  const [collectionRecordId, setCollectionRecordId] = useState("");
  const [collectionFolderId, setCollectionFolderId] = useState("");
  const [collectionFolders, setCollectionFolders] = useState<
    CollectionFolder[]
  >([]);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionStatus, setCollectionStatus] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [repostBusy, setRepostBusy] = useState(false);
  const [repostStatus, setRepostStatus] = useState("");
  const [repostError, setRepostError] = useState("");
  const [repostDelta, setRepostDelta] = useState(0);
  const [repostComposerOpen, setRepostComposerOpen] = useState(false);
  const [repostDraft, setRepostDraft] = useState("");
  const [dynamicAuthorFollowed, setDynamicAuthorFollowed] = useState(false);
  const [dynamicAuthorFollowBusy, setDynamicAuthorFollowBusy] = useState(false);
  const [dynamicAuthorFollowStatus, setDynamicAuthorFollowStatus] =
    useState("");
  const [dynamicAuthorFollowError, setDynamicAuthorFollowError] = useState("");
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportStatus, setReportStatus] = useState("");

  const registerCommentEditor = (
    key: string,
    handle: CodeMirrorEditorHandle | null,
  ) => {
    if (handle) {
      commentEditorRefs.current[key] = handle;
      return;
    }
    delete commentEditorRefs.current[key];
  };

  const updateMentionQuery = (
    key: string,
    value: string,
    selection: CodeMirrorSelection,
  ) => {
    const nextQuery = detectMentionQuery(value, selection, key);
    setMentionQuery(nextQuery);
    if (!nextQuery) {
      setMentionCandidates([]);
      setMentionSearching(false);
      setMentionError("");
    }
  };

  const updateCommentDraft = (
    key: string,
    nextValue: string,
    editorKey = key,
  ) => {
    setCommentDrafts((current) => ({ ...current, [key]: nextValue }));
    const selection =
      commentEditorRefs.current[editorKey]?.getSelection() ||
      commentSelections[editorKey] ||
      ({
        from: nextValue.length,
        to: nextValue.length,
      } satisfies CodeMirrorSelection);
    updateMentionQuery(editorKey, nextValue, selection);
  };

  const updateCommentEditorSelection = (
    key: string,
    value: string,
    selection: CodeMirrorSelection,
  ) => {
    setCommentSelections((current) => ({ ...current, [key]: selection }));
    updateMentionQuery(key, value, selection);
  };

  const chooseMentionCandidate = (candidate: MentionCandidate) => {
    if (!mentionQuery) return;
    const editor = commentEditorRefs.current[mentionQuery.key];
    if (!editor) return;
    editor.replaceRange(
      mentionQuery.from,
      mentionQuery.to,
      mentionInsertText(candidate),
    );
    setMentionQuery(null);
    setMentionCandidates([]);
    setMentionSearching(false);
    setMentionError("");
  };

  const renderMentionSuggestions = (key: string) => {
    if (!hasSession || !mentionQuery || mentionQuery.key !== key) return null;
    return (
      <div className="mention-suggestion-panel">
        {mentionSearching ? (
          <div className="mention-suggestion-state">
            {t("detail.mentions.searching")}
          </div>
        ) : mentionError ? (
          <div className="mention-suggestion-state">{mentionError}</div>
        ) : mentionCandidates.length ? (
          mentionCandidates.map((candidate) => (
            <AnimateButton
              unstyled
              type="button"
              key={inviteLookupKey(candidate)}
              className="mention-suggestion-item"
              onMouseDown={(event) => {
                event.preventDefault();
                chooseMentionCandidate(candidate);
              }}
            >
              <AvatarName
                name={mentionDisplayName(candidate)}
                imageUrl={candidate.avatar}
                rank={candidate.rank}
              />
              <span className="mention-suggestion-meta">
                @{candidate.username}
                {candidate.id && candidate.id !== candidate.username
                  ? ` · ${candidate.id.slice(0, 8)}`
                  : ""}
              </span>
            </AnimateButton>
          ))
        ) : (
          <div className="mention-suggestion-state">
            {t("detail.mentions.empty")}
          </div>
        )}
      </div>
    );
  };

  const appendCommentSticker = (
    target: CommentTargetRef,
    sticker: RinSticker,
  ) => {
    const key = commentTargetKey(target);
    setCommentDrafts((current) => ({
      ...current,
      [key]: appendRinStickerToken(current[key] || "", sticker.token),
    }));
  };

  const appendCommentEditSticker = (sticker: RinSticker) => {
    setCommentEditDraft((current) =>
      appendRinStickerToken(current, sticker.token),
    );
  };
  const [voteStates, setVoteStates] = useState<Record<string, VoteSnapshot>>(
    {},
  );
  const [voteBusyKey, setVoteBusyKey] = useState("");
  const [voteError, setVoteError] = useState("");
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [reactionBusyKey, setReactionBusyKey] = useState("");
  const [reactionError, setReactionError] = useState("");
  const [reactionLoading, setReactionLoading] = useState(false);
  const [dynamicInteractionTab, setDynamicInteractionTab] = useState<
    "comments" | "reposts" | "likes"
  >("comments");
  const [pendingDynamicCommentFocus, setPendingDynamicCommentFocus] =
    useState(false);
  const [dynamicLikeUsers, setDynamicLikeUsers] = useState<ReactionUserItem[]>(
    [],
  );
  const [dynamicLikeUserCount, setDynamicLikeUserCount] = useState(0);
  const [dynamicLikeUsersLoading, setDynamicLikeUsersLoading] = useState(false);
  const [dynamicLikeUsersError, setDynamicLikeUsersError] = useState("");
  const [dynamicRepostUsers, setDynamicRepostUsers] = useState<
    RepostUserItem[]
  >([]);
  const [dynamicRepostUserCount, setDynamicRepostUserCount] = useState(0);
  const [dynamicRepostUsersLoading, setDynamicRepostUsersLoading] =
    useState(false);
  const [dynamicRepostUsersError, setDynamicRepostUsersError] = useState("");
  const [dynamicRepostUsersLoaded, setDynamicRepostUsersLoaded] =
    useState(false);
  const [dynamicImageViewerIndex, setDynamicImageViewerIndex] = useState<
    number | null
  >(null);
  const [dynamicImageViewerScale, setDynamicImageViewerScale] = useState(1);
  const dynamicImageDragRef = useRef<{
    mode: "pan" | "swipe";
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [dynamicBodyExpanded, setDynamicBodyExpanded] = useState(false);
  const [expandedDynamicReplyParents, setExpandedDynamicReplyParents] =
    useState<Record<number, boolean>>({});
  const [acceptBusyKey, setAcceptBusyKey] = useState("");
  const [acceptStatus, setAcceptStatus] = useState("");
  const [acceptError, setAcceptError] = useState("");
  const [editingAnswerId, setEditingAnswerId] = useState<number | null>(null);
  const [answerEditDraft, setAnswerEditDraft] = useState("");
  const [answerEditSummary, setAnswerEditSummary] = useState("");
  const [answerMutationBusyKey, setAnswerMutationBusyKey] = useState("");
  const [answerMutationStatus, setAnswerMutationStatus] = useState("");
  const [answerMutationError, setAnswerMutationError] = useState("");
  const [answerDeleteConfirmId, setAnswerDeleteConfirmId] = useState<
    number | null
  >(null);
  const [questionMaintenanceBusy, setQuestionMaintenanceBusy] = useState("");
  const [questionMaintenanceStatus, setQuestionMaintenanceStatus] =
    useState("");
  const [questionMaintenanceError, setQuestionMaintenanceError] = useState("");
  const [questionDeleteConfirm, setQuestionDeleteConfirm] = useState(false);
  const [questionCloseReason, setQuestionCloseReason] = useState("");
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [questionEditTitle, setQuestionEditTitle] = useState("");
  const [questionEditBody, setQuestionEditBody] = useState("");
  const [questionEditTags, setQuestionEditTags] = useState("");
  const [questionEditBusy, setQuestionEditBusy] = useState(false);
  const [questionEditStatus, setQuestionEditStatus] = useState("");
  const [questionEditError, setQuestionEditError] = useState("");
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string>>(
    {},
  );
  const [authorProfiles, setAuthorProfiles] = useState<
    Record<string, AuthorProfileMeta>
  >({});
  const [discussionReplyView, setDiscussionReplyView] =
    useState<DiscussionReplyView>("all");
  const [discussionReplyOrder, setDiscussionReplyOrder] =
    useState<DiscussionReplyOrder>("hot");
  const [contentCommentOrder, setContentCommentOrder] =
    useState<ContentCommentOrder>("hot");
  const [dynamicCommentOrder, setDynamicCommentOrder] =
    useState<DiscussionReplyOrder>("hot");
  const [answerOrder, setAnswerOrder] = useState<AnswerOrder>("hot");
  const [activeBlogTocId, setActiveBlogTocId] = useState("");

  const loadCommentThreads = async (detail: QuestionDetail) => {
    const questionId = Number(detail.question.id);
    if (Number.isFinite(questionId) && questionId > 0) {
      const items = await loadComments({
        targetType: "question",
        targetId: questionId,
        limit: 20,
      });
      setQuestionComments(items);
    } else {
      setQuestionComments([]);
    }

    const entries = await Promise.all(
      detail.answers.map(async (answer) => {
        const items = await loadComments({
          targetType: "answer",
          targetId: answer.id,
          limit: 12,
        });
        return [answer.id, items] as const;
      }),
    );
    setAnswerComments(Object.fromEntries(entries));
  };

  const loadPostCommentThread = async (detail: PostDetail) => {
    if (detail.type === "blog" || detail.type === "book") {
      const pages: CommentSummary[][] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const items = await loadComments({
          targetType: postCommentTarget(detail),
          slug: detail.slug || detail.id,
          limit: discussionCommentPageSize,
          page,
        });
        pages.push(items);
        hasMore = items.length === discussionCommentPageSize;
        page += 1;
      }
      setPostComments(pages.flat());
      return;
    }
    if (detail.type === "discussion" || detail.type === "forum") {
      const pages: CommentSummary[][] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const items = await loadComments({
          targetType: postCommentTarget(detail),
          slug: detail.slug || detail.id,
          limit: discussionCommentPageSize,
          page,
        });
        pages.push(items);
        hasMore = items.length === discussionCommentPageSize;
        page += 1;
      }
      setPostComments(pages.flat());
      return;
    }
    const items = await loadComments({
      targetType: postCommentTarget(detail),
      slug: detail.slug || detail.id,
      limit: 24,
    });
    setPostComments(items);
  };

  const applyQuestionMainDetail = (detail: QuestionDetail) => {
    setQuestion(detail);
    setPost(detail.question);
    setBookmarked(detail.question.collected);
    setCollectionCount(collectionCountHint(detail.question));
  };

  const applyPostMainDetail = (detail: PostDetail) => {
    setPost(detail);
    setBookmarked(detail.collected);
    setCollectionCount(collectionCountHint(detail));
    setLikeActive(Boolean(detail.liked));
    setLikeCount(
      typeof detail.likeCount === "number" ? detail.likeCount : null,
    );
  };

  const applyQuestionDetail = async (detail: QuestionDetail) => {
    applyQuestionMainDetail(detail);
    await loadCommentThreads(detail);
  };

  useNoticeToasts({
    error,
    collectionStatus,
    collectionError,
    reportStatus,
    inviteStatus,
    inviteError,
    commentStatus,
    commentError,
    answerStatus,
    answerError,
    answerMutationError,
    acceptStatus,
    acceptError,
    reactionError,
    voteError,
    repostStatus,
    repostError,
    revisionError,
    relatedBooksError,
    bookReviewError,
    bookActivityError,
    bookContextError,
    bookChapterError,
    bookChapterInvalidNotice:
      bookChapterInvalidNotice === "invalidChapter"
        ? t("detail.book.chapter.invalidChapter")
        : "",
    bookChapterThreadError,
    bookErrataError,
    dynamicLikeUsersError,
    dynamicRepostUsersError,
    questionEditStatus,
    questionEditError,
    questionMaintenanceError,
    mentionError,
    dynamicAuthorFollowStatus,
    dynamicAuthorFollowError,
    linkedQuestionsError,
    relatedQuestionsError,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPost(null);
    setQuestion(null);
    setBookReaderPage(null);
    setLinkedQuestions([]);
    setRelatedQuestions([]);
    setRevisionItems([]);
    setRevisionLoading(false);
    setRevisionError("");
    setInviteUsers([]);
    setInviteQuery("");
    setInviteCandidates([]);
    setInviteLoading(false);
    setInviteSearching(false);
    setInviteSubmitting(false);
    setInviteStatus("");
    setInviteError("");
    setAnswerDraft("");
    setAnswerStatus("");
    setAnswerError("");
    setQuickEditOpen(false);
    setHasSession(Boolean(getStoredSession()));
    setQuestionComments([]);
    setPostComments([]);
    setExpandedContentReplyGroups({});
    setAnswerComments({});
    setCommentDrafts({});
    setFloorReplyDrafts({});
    setCommentStatus("");
    setCommentError("");
    setCommentBusyKey("");
    setEditingCommentId(null);
    setCommentEditDraft("");
    setCommentDeleteConfirmId(null);
    setBookmarked(false);
    setLikeActive(false);
    setLikeCount(null);
    setCollectionCount(null);
    setCollectionRecordId("");
    setCollectionFolderId("");
    setCollectionFolders([]);
    setCollectionDialogOpen(false);
    setCollectionBusy(false);
    setCollectionStatus("");
    setCollectionError("");
    setRepostBusy(false);
    setRepostStatus("");
    setRepostError("");
    setRepostDelta(0);
    setRepostComposerOpen(false);
    setRepostDraft("");
    setReportTarget(null);
    setReportStatus("");
    setVoteStates({});
    setVoteBusyKey("");
    setVoteError("");
    setReactions([]);
    setReactionBusyKey("");
    setReactionError("");
    setReactionLoading(false);
    setDynamicInteractionTab("comments");
    setDynamicLikeUsers([]);
    setDynamicLikeUserCount(0);
    setDynamicLikeUsersLoading(false);
    setDynamicLikeUsersError("");
    setDynamicImageViewerIndex(null);
    setAcceptBusyKey("");
    setAcceptStatus("");
    setAcceptError("");
    setEditingAnswerId(null);
    setAnswerEditDraft("");
    setAnswerEditSummary("");
    setAnswerMutationBusyKey("");
    setAnswerMutationStatus("");
    setAnswerMutationError("");
    setAnswerDeleteConfirmId(null);
    setQuestionMaintenanceBusy("");
    setQuestionMaintenanceStatus("");
    setQuestionMaintenanceError("");
    setQuestionDeleteConfirm(false);
    setQuestionCloseReason("");
    setEditingQuestion(false);
    setQuestionEditTitle("");
    setQuestionEditBody("");
    setQuestionEditTags("");
    setQuestionEditBusy(false);
    setQuestionEditStatus("");
    setQuestionEditError("");
    setDiscussionReplyView("all");
    setDiscussionReplyOrder("hot");
    setContentCommentOrder("hot");
    setDynamicCommentOrder("hot");
    setAnswerOrder("hot");
    setActiveBlogTocId("");
    setLinkedQuestions([]);
    setLinkedQuestionsLoading(false);
    setLinkedQuestionsError("");
    setRelatedQuestions([]);
    setRelatedQuestionsLoading(false);
    setRelatedQuestionsError("");

    if (kind === "question") {
      const cachedDetail = readCachedQuestionDetail(contentRef);
      if (cachedDetail) {
        applyQuestionMainDetail(cachedDetail.data);
      }
    } else if (!isBookReadingRoute) {
      const cachedDetail = readCachedContentDetail(kind, contentRef);
      if (cachedDetail) {
        applyPostMainDetail(cachedDetail.data);
      }
    }

    const load =
      kind === "question"
        ? loadQuestionDetail(contentRef).then((detail) => {
            if (!cancelled) {
              applyQuestionMainDetail(detail);
            }
            void loadCommentThreads(detail).catch(() => {
              if (!cancelled) {
                setQuestionComments([]);
                setAnswerComments({});
              }
            });
            if (!cancelled) setLinkedQuestionsLoading(true);
            void loadLinkedAnswerQuestionPage({
              questionId: detail.question.id,
              pageSize: 5,
            })
              .then((linkedPage) => {
                if (!cancelled) setLinkedQuestions(linkedPage.items);
              })
              .catch((linkedLoadError) => {
                if (!cancelled) {
                  setLinkedQuestions([]);
                  console.error("Failed to load linked questions", linkedLoadError);
                  setLinkedQuestionsError("loadFailed");
                }
              })
              .finally(() => {
                if (!cancelled) setLinkedQuestionsLoading(false);
              });
            if (!cancelled) setRelatedQuestionsLoading(true);
            void loadRelatedQuestionNetwork(detail)
              .then((relatedPage) => {
                if (!cancelled) {
                  setRelatedQuestions(relatedPage.items);
                  setRelatedQuestionsError(relatedPage.error);
                }
              })
              .catch((relatedLoadError) => {
                if (!cancelled) {
                  setRelatedQuestions([]);
                  console.error("Failed to load related questions", relatedLoadError);
                  setRelatedQuestionsError("loadFailed");
                }
              })
              .finally(() => {
                if (!cancelled) setRelatedQuestionsLoading(false);
              });
            const questionID = revisionObjectIdFromQuestion(detail);
            if (questionID !== null) {
              if (!cancelled) setRevisionLoading(true);
              void listRevisions({
                objectType: revisionObjectTypeForPost(detail.question),
                objectId: questionID,
                limit: 4,
              })
                .then((items) => {
                  if (!cancelled) setRevisionItems(items);
                })
                .catch((revisionLoadError) => {
                  if (!cancelled) {
                    setRevisionItems([]);
                    setRevisionError(
                      localizedErrorMessage(
                        revisionLoadError,
                        "reader.revisionLoadFailed",
                      ),
                    );
                  }
                })
                .finally(() => {
                  if (!cancelled) setRevisionLoading(false);
                });
            }
            if (!cancelled) setInviteLoading(true);
            void loadQuestionInviteUsers(detail.question.id)
              .then((items) => {
                if (!cancelled) setInviteUsers(items);
              })
              .catch((inviteLoadError) => {
                if (!cancelled) {
                  setInviteUsers([]);
                  setInviteError(
                    localizedErrorMessage(
                      inviteLoadError,
                      "reader.inviteLoadFailed",
                    ),
                  );
                }
              })
              .finally(() => {
                if (!cancelled) setInviteLoading(false);
              });
          })
        : isBookReadingRoute
          ? loadBookReaderPage(
              contentRef,
              decodeBookReaderHash(location.hash),
            ).then((reader) => {
              if (!cancelled) {
                setBookReaderPage(reader);
                applyPostMainDetail(reader.post);
              }
            })
          : loadContentDetail(
              contentRef,
              isBlogTypographyTest
                ? { origin: blogTypographyTestContentOrigin }
                : undefined,
            ).then((detail) => {
              if (!cancelled) {
                applyPostMainDetail(detail);
              }
              if (isBlogTypographyTest) return;
              void loadPostCommentThread(detail).catch(() => {
                if (!cancelled) setPostComments([]);
              });
              const objectID = revisionObjectIdFromPost(detail);
              if (objectID !== null) {
                if (!cancelled) setRevisionLoading(true);
                void listRevisions({
                  objectType: revisionObjectTypeForPost(detail),
                  objectId: objectID,
                  limit: 4,
                })
                  .then((items) => {
                    if (!cancelled) setRevisionItems(items);
                  })
                  .catch((revisionLoadError) => {
                    if (!cancelled) {
                      setRevisionItems([]);
                      setRevisionError(
                        localizedErrorMessage(
                          revisionLoadError,
                          "reader.revisionLoadFailed",
                        ),
                      );
                    }
                  })
                  .finally(() => {
                    if (!cancelled) setRevisionLoading(false);
                  });
              }
            });

    void load
      .catch((detailError) => {
        if (!cancelled) {
          setError(
            localizedErrorMessage(detailError, "reader.detailLoadFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    contentRef,
    isBlogTypographyTest,
    isBookReadingRoute,
    kind,
    location.hash,
    sessionRevision,
  ]);

  useEffect(() => {
    if ((kind !== "blog" && kind !== "book") || isBlogTypographyTest) {
      setPublicationProgress(null);
      return undefined;
    }

    setPublicationProgress(null);
    const poller = new PublicationProgressPoller(
      contentRef,
      setPublicationProgress,
    );
    poller.start();
    return () => poller.stop();
  }, [contentRef, isBlogTypographyTest, kind]);

  useContentReadEvent({
    target: post ? { id: post.id, slug: post.slug || contentRef, type: post.type } : null,
    enabled: kind !== "question" && !isBlogTypographyTest,
    onReadCount: (readCount) => {
      setPost((current) => (
        current && current.id === post?.id
          ? { ...current, readCount }
          : current
      ));
      setBookReaderPage((current) => (
        current && current.post.id === post?.id
          ? { ...current, post: { ...current.post, readCount } }
          : current
      ));
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!post || isBlogTypographyTest || kind === "blog") {
      setReactions([]);
      setReactionError("");
      setReactionLoading(false);
      return undefined;
    }

    setReactionLoading(true);
    setReactionError("");
    void queryReactions(post.slug || post.id, reportTypeForPost(post.type))
      .then((items) => {
        if (!cancelled) setReactions(items.reaction_summary);
      })
      .catch((reactionLoadError) => {
        if (!cancelled) {
          setReactions([]);
          setReactionError(
            localizedErrorMessage(
              reactionLoadError,
              "reader.reactionLoadFailed",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReactionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isBlogTypographyTest, kind, post]);

  useEffect(() => {
    let cancelled = false;
    const query = inviteQuery.trim();
    setInviteStatus("");
    if (!question || !query || (query.length < 2 && !isRinInviteQuery(query))) {
      setInviteCandidates([]);
      setInviteSearching(false);
      return undefined;
    }
    if (!hasSession) {
      setInviteCandidates([]);
      setInviteSearching(false);
      return undefined;
    }

    setInviteSearching(true);
    setInviteError("");
    void searchUserInfo(query, 6)
      .then((items) => {
        if (!cancelled) {
          const candidates = items.map(inviteCandidateFromUser);
          if (isRinInviteQuery(query) && !candidates.some(isRinInviteUser)) {
            candidates.unshift(rinInviteCandidate());
          }
          setInviteCandidates(candidates);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          if (isAuthenticationFailure(searchError)) {
            setHasSession(false);
          }
          setInviteCandidates(
            isRinInviteQuery(query) ? [rinInviteCandidate()] : [],
          );
          setInviteError(
            localizedErrorMessage(searchError, "reader.memberSearchFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInviteSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasSession, inviteQuery, question]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const query = (mentionQuery?.query || "").trim();
    if (!mentionQuery || !hasSession) {
      setMentionCandidates([]);
      setMentionSearching(false);
      setMentionError("");
      return undefined;
    }

    setMentionSearching(true);
    setMentionError("");
    timer = window.setTimeout(() => {
      if (cancelled) return;
      void searchUserInfo(query || "rin", 6)
        .then((items) => {
          if (!cancelled) {
            setMentionCandidates(items.map(mentionCandidateFromUser));
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            if (isAuthenticationFailure(searchError)) {
              setHasSession(false);
            }
            setMentionCandidates([]);
            setMentionError(
              localizedErrorMessage(searchError, "reader.memberSearchFailed"),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setMentionSearching(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [hasSession, mentionQuery]);

  const title = useMemo(
    () =>
      post?.title ||
      t("detail.pageTitle", {
        type: t(`detail.type.${displayTypeClass(kind)}`),
      }),
    [kind, post?.title, t],
  );
  const isBookReadingPage = isBookReadingRoute;
  const hasUnifiedContentComments = Boolean(
    post &&
    (post.type === "blog" || post.type === "book") &&
    !isBookReadingPage,
  );
  useEffect(() => {
    const section = contentCommentSectionRef.current;
    const primaryComposer = primaryCommentComposerRef.current;
    if (
      !hasUnifiedContentComments ||
      !section ||
      !primaryComposer ||
      typeof IntersectionObserver === "undefined"
    ) {
      setContentCommentSectionVisible(false);
      setPrimaryCommentComposerPassed(false);
      setFloatingCommentComposerExpanded(false);
      return undefined;
    }

    const updateBounds = () => {
      const rect = section.getBoundingClientRect();
      const left = Math.max(
        12,
        Math.min(rect.left, Math.max(12, window.innerWidth - 292)),
      );
      setFloatingCommentComposerBounds({
        left,
        width: Math.max(
          280,
          Math.min(rect.width, window.innerWidth - left - 12),
        ),
      });
    };
    const updateViewportOffset = () => {
      const viewport = window.visualViewport;
      const keyboardOverlap = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setFloatingCommentComposerBottom(Math.max(12, keyboardOverlap + 12));
    };
    const sectionObserver = new IntersectionObserver(
      ([entry]) =>
        setContentCommentSectionVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "-72px 0px -32px", threshold: 0 },
    );
    const composerObserver = new IntersectionObserver(
      ([entry]) => {
        setPrimaryCommentComposerPassed(
          Boolean(
            entry &&
            !entry.isIntersecting &&
            entry.boundingClientRect.bottom <= 72,
          ),
        );
      },
      { rootMargin: "-72px 0px 0px", threshold: 0.05 },
    );
    sectionObserver.observe(section);
    composerObserver.observe(primaryComposer);
    updateBounds();
    updateViewportOffset();
    window.addEventListener("resize", updateBounds);
    window.visualViewport?.addEventListener("resize", updateViewportOffset);
    window.visualViewport?.addEventListener("scroll", updateViewportOffset);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateBounds);
    resizeObserver?.observe(section);

    return () => {
      sectionObserver.disconnect();
      composerObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.visualViewport?.removeEventListener(
        "resize",
        updateViewportOffset,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateViewportOffset,
      );
    };
  }, [hasUnifiedContentComments, post?.id]);
  const showFloatingCommentComposer = Boolean(
    hasSession &&
    hasUnifiedContentComments &&
    contentCommentSectionVisible &&
    primaryCommentComposerPassed,
  );
  useEffect(() => {
    if (!showFloatingCommentComposer) {
      setFloatingCommentComposerExpanded(false);
    }
  }, [showFloatingCommentComposer]);
  const displayKind = (post?.type || kind) as DetailKind;
  const displayKindLabel = t(
    `detail.type.${displayTypeClass(displayKind || kind)}`,
  );
  const canonicalPath = post
    ? isBookReadingPage
      ? bookReadingPath(post.id, post.book?.bookTitle || post.title)
      : contentPath(displayKind, post.id, post.title)
    : isBookReadingPage
      ? bookReadingPath(contentRef, title)
      : contentPath(kind, contentRef, title);
  useEffect(() => {
    if (isBlogTypographyTest) return;
    if (!post || !postId) return;
    if (String(post.id) !== String(postId)) return;
    const expectedTitleSlug = contentTitleSlug(post.title);
    if (
      titleSlug === expectedTitleSlug &&
      location.pathname.endsWith(canonicalPath)
    )
      return;
    navigate(`${canonicalPath}${location.search}${location.hash}`, {
      replace: true,
    });
  }, [
    canonicalPath,
    isBlogTypographyTest,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    post,
    postId,
    titleSlug,
  ]);
  const blogArticle = useMemo<BlogArticleOutput>(() => {
    if (!post || kind !== "blog") return { html: "", serverFinal: false };
    return blogArticleOutput(post);
  }, [kind, post]);
  const blogArticleBodyHtml = blogArticle.html;
  const blogTocItems = useMemo(() => {
    if (!post || kind !== "blog") return [];
    return blogArticleBodyHtml
      ? rinWriterTocItems(blogArticleBodyHtml, post.title)
      : [];
  }, [blogArticleBodyHtml, kind, post]);
  const bookReaderItems = useMemo(
    () =>
      isBookReadingPage ? bookReaderPage?.toc || [] : bookReaderTocItems(post),
    [bookReaderPage, isBookReadingPage, post],
  );
  const bookOverviewTocItems = useMemo<BookTOCItem[]>(() => {
    const renderedItems = bookReaderItems.filter(
      (item) => item.level === 2 || item.level === 3,
    );
    if (renderedItems.some((item) => item.level === 3)) {
      return renderedItems.map((item) => ({
        title: item.text,
        level: item.level,
      }));
    }
    return post?.type === "book" ? post.book?.toc || [] : [];
  }, [bookReaderItems, post]);
  const bookReadTocItems = useMemo(
    () => (isBookReadingPage ? bookReaderItems : []),
    [bookReaderItems, isBookReadingPage],
  );
  const activeArticleTocItems = isBookReadingPage
    ? bookReadTocItems
    : blogTocItems;
  const navigateBlogTocTarget = useCallback((targetId: string) => {
    if (!targetId) return;
    setActiveBlogTocId(targetId);
    pushHashWithoutNavigation(targetId);
    const alignTarget = () => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      setActiveBlogTocId(targetId);
    };
    window.requestAnimationFrame(() => {
      alignTarget();
      window.setTimeout(alignTarget, 120);
      window.setTimeout(alignTarget, 420);
      window.setTimeout(alignTarget, 900);
    });
  }, []);

  useEffect(() => {
    if (
      (kind !== "blog" && !isBookReadingPage) ||
      !activeArticleTocItems.length
    ) {
      setActiveBlogTocId("");
      return undefined;
    }

    let frame = 0;
    const syncActiveHeading = () => {
      frame = 0;
      const nextId = currentBlogTocId(activeArticleTocItems);
      setActiveBlogTocId((currentId) =>
        currentId === nextId ? currentId : nextId,
      );
    };
    const requestSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncActiveHeading);
    };

    requestSync();
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);
    window.addEventListener("hashchange", requestSync);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", requestSync);
      window.removeEventListener("hashchange", requestSync);
    };
  }, [activeArticleTocItems, isBookReadingPage, kind]);

  useEffect(() => {
    if (!post || post.type !== "book") {
      setBookReviews([]);
      setBookRating(null);
      setBookReviewError("");
      setBookReviewEditing(false);
      setRelatedBooks([]);
      setRelatedBooksError("");
      return undefined;
    }
    let cancelled = false;
    setBookReviewLoading(true);
    setBookReviewError("");
    void loadBookReviews(post.id, bookReviewOrder)
      .then((result) => {
        if (cancelled) return;
        setBookReviews(result.items);
        setBookRating(result.rating);
        if (result.rating.myReview) {
          setBookReviewScore(result.rating.myReview.score);
          setBookReviewBody(result.rating.myReview.body);
          setBookReviewEditing(false);
        } else {
          setBookReviewEditing(true);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setBookReviewError(
            localizedErrorMessage(loadError, "rating.loadFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBookReviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post, bookReviewOrder]);

  useEffect(() => {
    if (!post || post.type !== "book") return undefined;
    let cancelled = false;
    setRelatedBooksLoading(true);
    setRelatedBooksError("");
    void loadRelatedBooks(post.id, 6)
      .then((result) => {
        if (!cancelled)
          setRelatedBooks(result.items.filter((item) => item.id !== post.id));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRelatedBooksError(
            localizedErrorMessage(loadError, "reader.relatedBooksLoadFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRelatedBooksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post]);

  useEffect(() => {
    if (!post || post.type !== "book") {
      setBookActivityItems([]);
      setBookActivityTotal(0);
      setBookActivityError("");
      setBookActivityLoading(false);
      return undefined;
    }
    let cancelled = false;
    setBookActivityLoading(true);
    setBookActivityError("");
    void loadBookActivity(post.id, { limit: 10 })
      .then((result) => {
        if (cancelled) return;
        setBookActivityItems(result.items);
        setBookActivityTotal(result.total);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setBookActivityError(
            localizedErrorMessage(loadError, "reader.bookActivityLoadFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBookActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post]);

  useEffect(() => {
    if (
      !post ||
      isBlogTypographyTest ||
      post.type === "book" ||
      post.type === "dynamic" ||
      post.type === "status"
    ) {
      setBookContexts([]);
      setBookContextError("");
      setBookContextLoading(false);
      return undefined;
    }
    let cancelled = false;
    setBookContextLoading(true);
    setBookContextError("");
    void loadBookContext(post.id)
      .then((result) => {
        if (!cancelled) setBookContexts(result.items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setBookContextError(
            localizedErrorMessage(loadError, "reader.bookContextLoadFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBookContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBlogTypographyTest, post]);

  useEffect(() => {
    if (!post || post.type !== "book" || !post.book?.toc?.length) {
      setBookChapterActivity(null);
      setSelectedBookChapterKey("");
      setBookChapterError("");
      setBookChapterInvalidNotice("");
      setBookChapterDialog("");
      setBookChapterComposer("");
      return undefined;
    }
    if (isBookReadingPage) {
      setSelectedBookChapterKey("");
      setBookChapterInvalidNotice("");
      setBookChapterDialog("");
      setBookChapterComposer("");
      return undefined;
    }
    const params = new URLSearchParams(location.search);
    const chapterFromURL = params.get("chapter") || "";
    const tocKeys = new Set(
      post.book.toc.map((item, index) => bookChapterKey(index, item)),
    );
    if (chapterFromURL && tocKeys.has(chapterFromURL)) {
      setSelectedBookChapterKey(chapterFromURL);
      setBookChapterInvalidNotice("");
      setBookChapterDialog("");
      setBookChapterComposer("");
    } else if (chapterFromURL) {
      setSelectedBookChapterKey("");
      setBookChapterInvalidNotice("invalidChapter");
      setBookChapterDialog("");
      setBookChapterComposer("");
    } else {
      setSelectedBookChapterKey("");
      setBookChapterInvalidNotice("");
      setBookChapterDialog("");
      setBookChapterComposer("");
    }
    return undefined;
  }, [isBookReadingPage, location.search, post]);

  useEffect(() => {
    if (
      !isBookReadingPage ||
      !post ||
      post.type !== "book" ||
      !post.book?.toc?.length
    ) {
      setBookChapterActivity(null);
      setBookChapterLoading(false);
      return undefined;
    }
    if (!selectedBookChapterKey) {
      setBookChapterActivity(null);
      setBookChapterLoading(false);
      return undefined;
    }
    let cancelled = false;
    setBookChapterLoading(true);
    setBookChapterError("");
    void loadBookChapterActivity(post.id, selectedBookChapterKey)
      .then((result) => {
        if (!cancelled) setBookChapterActivity(result);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setBookChapterError(
            localizedErrorMessage(loadError, "reader.bookChapterLoadFailed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBookChapterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBookReadingPage, post, selectedBookChapterKey]);

  const questionClosed = question ? question.question.status === 2 : false;
  const questionDeleted = question ? question.question.status === 10 : false;
  const questionAnswerLocked = questionClosed || questionDeleted;
  const answerLength = answerDraft.trim().length;
  const canSubmitAnswer =
    Boolean(question) &&
    hasSession &&
    !questionAnswerLocked &&
    !submittingAnswer;
  const canEditBlog = Boolean(
    post &&
    kind === "blog" &&
    hasSession &&
    sameUserId(currentUser?.id, post.authorUid || post.authorId),
  );
  const currentCultivation =
    typeof currentUser?.rank === "number" && Number.isFinite(currentUser.rank)
      ? currentUser.rank
      : 0;
  const canEditQuestion = Boolean(
    post &&
    question &&
    hasSession &&
    (sameUserId(currentUser?.id, post.authorUid || post.authorId) ||
      currentCultivation >= trustedQuestionEditCultivation),
  );
  const isCurrentUserAdmin =
    currentUser?.role_id === 2 ||
    currentUser?.role_name === "admin" ||
    currentUser?.roleName === "admin" ||
    userMetadataString(currentUser?.user_metadata, ["role", "role_name"]) ===
      "admin";
  const currentUserRoleName =
    currentUser?.role_name ||
    currentUser?.roleName ||
    userMetadataString(currentUser?.user_metadata, ["role", "role_name"]);
  const canModerateComments =
    isCurrentUserAdmin ||
    currentUser?.role_id === 3 ||
    currentUserRoleName === "moderator";
  const canManageComment = (item: CommentSummary) =>
    Boolean(
      hasSession &&
      (canModerateComments ||
        sameUserId(currentUser?.id, item.authorUid || item.authorId) ||
        sameUserId(currentUser?.username, item.authorId || item.authorUid)),
    );
  const canManageAnswer = (item: AnswerSummary) =>
    Boolean(
      hasSession &&
      (canModerateComments ||
        sameUserId(currentUser?.id, item.authorId) ||
        sameUserId(currentUser?.username, item.authorId)),
    );
  const canAcceptQuestionAnswer = Boolean(
    post &&
    question &&
    hasSession &&
    (canModerateComments ||
      sameUserId(currentUser?.id, post.authorUid || post.authorId) ||
      sameUserId(currentUser?.username, post.authorId || post.authorUid)),
  );
  useEffect(() => {
    let cancelled = false;
    if (!hasSession) {
      setCurrentUser(null);
      return undefined;
    }
    void loadCurrentUserInfo()
      .then(async (siteUser) => {
        if (siteUser) {
          if (!cancelled) {
            setCurrentUser({
              id: siteUser.id,
              username: siteUser.username,
              display_name: siteUser.display_name,
              rank: siteUser.rank,
              role_id: siteUser.role_id,
              role_name: siteUser.role_name,
              avatar: siteUser.avatar,
            });
          }
          return;
        }
        const user = await getCurrentUser();
        const metadata = user?.user_metadata || {};
        const profileId =
          user?.id ||
          userMetadataString(metadata, ["username", "userName", "user_id"]);
        let rank = userMetadataNumber(metadata, [
          "rank",
          "reputation",
          "cultivation",
        ]);
        if (profileId) {
          try {
            const page = await loadPersonalRankPage({
              userId: profileId,
              pageSize: 200,
            });
            rank = page.items.reduce(
              (total, item) => total + item.reputation,
              0,
            );
          } catch {
            // Keep the auth metadata value if the rank endpoint is unavailable.
          }
        }
        if (!cancelled) setCurrentUser({ ...user, rank });
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasSession]);
  const isDiscussionDetail = Boolean(
    post &&
    !question &&
    (kind === "discussion" ||
      post.type === "discussion" ||
      post.type === "forum"),
  );
  const isAnnouncementDetail = Boolean(
    post &&
    !question &&
    (kind === "announcement" || post.type === "announcement"),
  );
  const isThreadLikeDetail = isDiscussionDetail || isAnnouncementDetail;
  const isDiscussionPostDetail = isDiscussionDetail && !isAnnouncementDetail;
  const isDynamicDetail = Boolean(
    post &&
    !question &&
    (kind === "dynamic" ||
      kind === "status" ||
      post.type === "dynamic" ||
      post.type === "status"),
  );
  const hasPrimaryDetail =
    Boolean(post) && (kind !== "question" || Boolean(question));
  const showBlockingLoading = loading && !hasPrimaryDetail && !error;
  const showGenericDetailHeader =
    Boolean(post) &&
    hasPrimaryDetail &&
    !isThreadLikeDetail &&
    !isDynamicDetail &&
    kind !== "blog" &&
    kind !== "book" &&
    !question;
  const selectedBookChapter = useMemo(() => {
    if (!selectedBookChapterKey || !bookChapterActivity) return null;
    return (
      bookChapterActivity.chapters.find(
        (chapter) => chapter.key === selectedBookChapterKey,
      ) || null
    );
  }, [bookChapterActivity, selectedBookChapterKey]);
  const selectedBookChapterDetail: BookChapterActivityDetail | null =
    bookChapterActivity?.selected?.key === selectedBookChapterKey
      ? bookChapterActivity.selected
      : null;
  const chapterCountsByKey = useMemo(() => {
    const map = new Map<string, BookChapterActivitySummary>();
    bookChapterActivity?.chapters.forEach((chapter) => {
      map.set(chapter.key, chapter);
    });
    return map;
  }, [bookChapterActivity]);
  const autoSelectedBookChapterTabKeyRef = useRef("");
  useEffect(() => {
    if (!selectedBookChapterKey || !selectedBookChapterDetail) {
      autoSelectedBookChapterTabKeyRef.current = "";
      return;
    }
    if (autoSelectedBookChapterTabKeyRef.current === selectedBookChapterKey)
      return;
    const { counts } = selectedBookChapterDetail;
    const firstNonEmptyTab: BookChapterActivityTab =
      counts.discussion > 0
        ? "discussions"
        : counts.question > 0
          ? "questions"
          : counts.errata > 0
            ? "errata"
            : "discussions";
    setBookChapterTab(firstNonEmptyTab);
    autoSelectedBookChapterTabKeyRef.current = selectedBookChapterKey;
  }, [selectedBookChapterDetail, selectedBookChapterKey]);
  const refreshSelectedBookChapter = async () => {
    if (!post || post.type !== "book") return;
    const result = await loadBookChapterActivity(
      post.id,
      selectedBookChapterKey || undefined,
    );
    setBookChapterActivity(result);
  };
  const createCurrentBookChapterThread = async (
    kind: BookChapterThreadKind,
  ) => {
    if (!post || !selectedBookChapterKey) return;
    if (!bookChapterThreadTitle.trim()) {
      setBookChapterThreadError(t("detail.book.chapter.titleRequired"));
      return;
    }
    setBookChapterThreadBusy(true);
    setBookChapterThreadError("");
    try {
      const result = await createBookChapterThread(
        post.id,
        selectedBookChapterKey,
        {
          kind,
          title: bookChapterThreadTitle,
          body: bookChapterThreadBody,
        },
      );
      setBookChapterActivity(result);
      setBookChapterThreadTitle("");
      setBookChapterThreadBody("");
      setBookChapterComposer("");
      setBookChapterTab(kind === "question" ? "questions" : "discussions");
    } catch (threadError) {
      setBookChapterThreadError(
        localizedErrorMessage(threadError, "reader.bookChapterSubmitFailed"),
      );
    } finally {
      setBookChapterThreadBusy(false);
    }
  };
  const createCurrentBookErratum = async () => {
    if (!post || !selectedBookChapterKey) return;
    setBookErrataBusy(true);
    setBookErrataError("");
    try {
      const result = await createBookChapterErratum(
        post.id,
        selectedBookChapterKey,
        {
          title: bookErrataTitle,
          location: bookErrataLocation,
          originalText: bookErrataOriginal,
          correctionText: bookErrataCorrection,
          note: bookErrataNote,
        },
      );
      setBookChapterActivity(result);
      setBookErrataTitle("");
      setBookErrataLocation("");
      setBookErrataOriginal("");
      setBookErrataCorrection("");
      setBookErrataNote("");
      setBookChapterTab("errata");
      setBookChapterComposer("");
    } catch (errataError) {
      setBookErrataError(
        localizedErrorMessage(errataError, "reader.bookErrataSubmitFailed"),
      );
    } finally {
      setBookErrataBusy(false);
    }
  };
  const updateCurrentBookErratumStatus = async (
    erratumId: string,
    status: BookChapterErratumStatus,
  ) => {
    if (!post || !selectedBookChapterKey) return;
    setBookErrataStatusBusy(`${erratumId}:${status}`);
    setBookErrataError("");
    try {
      const result = await updateBookChapterErratumStatus(
        post.id,
        selectedBookChapterKey,
        erratumId,
        status,
      );
      setBookChapterActivity(result);
    } catch (statusError) {
      setBookErrataError(
        localizedErrorMessage(statusError, "reader.bookErrataUpdateFailed"),
      );
    } finally {
      setBookErrataStatusBusy("");
    }
  };
  useEffect(() => {
    setDynamicBodyExpanded(false);
  }, [isDynamicDetail, post?.id, post?.slug, post?.body]);
  useEffect(() => {
    const tocTree =
      post?.type === "book" && bookOverviewTocItems.length
        ? buildBookTOCTree(bookOverviewTocItems)
        : [];
    setCollapsedBookTOCNodes(collectCollapsibleBookTOCNodeIds(tocTree));
  }, [bookOverviewTocItems, post?.id, post?.type]);
  const canEditDiscussion = Boolean(
    post &&
    isDiscussionDetail &&
    hasSession &&
    sameUserId(currentUser?.id, post.authorUid || post.authorId),
  );
  const canEditAnnouncement = Boolean(
    post && isAnnouncementDetail && hasSession && isCurrentUserAdmin,
  );
  const canEditDynamic = Boolean(
    post &&
    isDynamicDetail &&
    hasSession &&
    sameUserId(currentUser?.id, post.authorUid || post.authorId),
  );
  const canEditBook = Boolean(
    post &&
    post.type === "book" &&
    hasSession &&
    (editableBookWorkspaceKind(post.book?.kind)
      ? sameUserId(currentUser?.id, post.authorUid || post.authorId)
      : isCurrentUserAdmin),
  );
  const hasBookReader = Boolean(
    post?.type === "book" &&
    (bookReaderItems.length ||
      (isBookReadingPage
        ? bookReaderPage?.toc.length
        : rinWriterHtml(post.body) || markdownBookReaderJson(post.body))),
  );
  const activeBookTitle = post?.book?.bookTitle || post?.title || title;
  const activeBookReadingPath = post
    ? bookReadingPath(post.id, activeBookTitle)
    : bookReadingPath(contentRef, title);
  const routeBookReaderTargetId = useMemo(() => {
    const hashId = decodeBookReaderHash(location.hash);
    return hashId;
  }, [location.hash]);
  const bookReaderTargetId =
    selectedBookReaderTargetId || routeBookReaderTargetId;
  useEffect(() => {
    setSelectedBookReaderTargetId("");
  }, [routeBookReaderTargetId]);
  const currentBookReaderPage = useMemo(
    () =>
      bookReaderPage?.page ||
      bookReaderPageForTarget(bookReadTocItems, bookReaderTargetId),
    [bookReadTocItems, bookReaderPage, bookReaderTargetId],
  );
  const bookReaderPageNavigation = useMemo(() => {
    if (bookReaderPage) {
      return {
        currentIndex: bookReaderPage.pageIndex,
        total: bookReaderPage.pageCount,
        previous: bookReaderPage.previous || null,
        next: bookReaderPage.next || null,
      };
    }
    return bookReaderAdjacentPages(
      bookReadTocItems,
      currentBookReaderPage?.id || "",
    );
  }, [bookReadTocItems, bookReaderPage, currentBookReaderPage]);
  const currentBookReaderPageHtml = isBookReadingPage
    ? bookReaderPage?.page.html || ""
    : "";
  useEffect(() => {
    if (
      !isBookReadingPage ||
      !post ||
      post.type !== "book" ||
      !post.book?.toc?.length
    )
      return;
    const nextKey = bookChapterKeyForReaderPage(
      post.book.toc,
      bookReaderItems,
      currentBookReaderPage,
    );
    setSelectedBookChapterKey((current) => {
      if (current === nextKey) return current;
      setBookChapterDialog("");
      setBookChapterComposer("");
      return nextKey;
    });
    setBookChapterInvalidNotice("");
  }, [bookReaderItems, currentBookReaderPage, isBookReadingPage, post]);
  const navigateBookReaderTarget = useCallback(
    (targetId: string, ownerPageId?: string) => {
      if (!targetId) return;
      setSelectedBookReaderTargetId(targetId);
      if (document.getElementById(targetId)) {
        // The anchor is already rendered on the loaded page: keep the URL and
        // the TOC highlight in sync and let the hash effect scroll, without
        // re-fetching the page the reader is already showing.
        pushHashWithoutNavigation(targetId);
        return;
      }
      // Prefer the reader page declared by data-rin-page when it is a known
      // page of this book; otherwise let the server resolve the anchor from a
      // TOC id, a page id, or its per-page anchor scan.
      const declaredOwnerPageId = (ownerPageId || "").trim();
      const section =
        declaredOwnerPageId &&
        bookReaderPageItems(bookReadTocItems).some(
          (item) => item.id === declaredOwnerPageId,
        )
          ? declaredOwnerPageId
          : targetId;
      void loadBookReaderPage(contentRef, section)
        .then((reader) => {
          setBookReaderPage(reader);
          applyPostMainDetail(reader.post);
          pushHashWithoutNavigation(targetId);
        })
        .catch((readerError) => {
          setSelectedBookReaderTargetId("");
          setError(
            localizedErrorMessage(readerError, "reader.bookReaderLoadFailed"),
          );
        });
    },
    [bookReadTocItems, contentRef],
  );
  useEffect(() => {
    if (!isBookReadingPage || !bookReaderTargetId) return undefined;
    let frame = 0;
    const scrollToTarget = () => {
      document
        .getElementById(bookReaderTargetId)
        ?.scrollIntoView({ block: "start" });
    };
    frame = window.requestAnimationFrame(scrollToTarget);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [bookReaderTargetId, currentBookReaderPageHtml, isBookReadingPage]);
  useEffect(() => {
    let cancelled = false;
    if (!post || !isDynamicDetail) {
      setDynamicLikeUsers([]);
      setDynamicLikeUserCount(0);
      setDynamicLikeUsersLoading(false);
      setDynamicLikeUsersError("");
      return undefined;
    }

    setDynamicLikeUsersLoading(true);
    setDynamicLikeUsersError("");
    void queryReactionUsers({
      objectId: post.slug || post.id,
      objectType: reportTypeForPost(post.type),
      emoji: "heart",
      limit: 1000,
    })
      .then((result) => {
        if (!cancelled) {
          setDynamicLikeUsers(result.items);
          setDynamicLikeUserCount(result.count);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDynamicLikeUsers([]);
          setDynamicLikeUserCount(0);
          setDynamicLikeUsersError(
            localizedErrorMessage(
              loadError,
              "reader.dynamicActivityLoadFailed",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDynamicLikeUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDynamicDetail, post]);

  useEffect(() => {
    let cancelled = false;
    if (!post || !isDynamicDetail) {
      setDynamicRepostUsers([]);
      setDynamicRepostUserCount(0);
      setDynamicRepostUsersLoading(false);
      setDynamicRepostUsersError("");
      setDynamicRepostUsersLoaded(false);
      return undefined;
    }

    setDynamicRepostUsersLoading(true);
    setDynamicRepostUsersError("");
    setDynamicRepostUsersLoaded(false);
    void queryRepostUsers({
      objectId: post.slug || post.id,
      objectType: reportTypeForPost(post.type),
      limit: 1000,
    })
      .then((result) => {
        if (!cancelled) {
          setDynamicRepostUsers(result.items);
          setDynamicRepostUserCount(result.count);
          setDynamicRepostUsersLoaded(true);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDynamicRepostUsers([]);
          setDynamicRepostUserCount(0);
          setDynamicRepostUsersError(
            localizedErrorMessage(
              loadError,
              "reader.dynamicActivityLoadFailed",
            ),
          );
          setDynamicRepostUsersLoaded(false);
        }
      })
      .finally(() => {
        if (!cancelled) setDynamicRepostUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDynamicDetail, post]);
  useEffect(() => {
    if (
      !pendingDynamicCommentFocus ||
      !post ||
      !isDynamicDetail ||
      dynamicInteractionTab !== "comments"
    ) {
      return;
    }
    const target = {
      targetType: postCommentTarget(post),
      slug: post.slug || post.id,
    };
    focusCommentComposer(commentTargetKey(target), true);
    setPendingDynamicCommentFocus(false);
  }, [
    dynamicInteractionTab,
    isDynamicDetail,
    pendingDynamicCommentFocus,
    post,
  ]);
  useEffect(() => {
    if (
      !post ||
      !isDynamicDetail ||
      dynamicImageViewerIndex === null ||
      !post.images?.length
    ) {
      return undefined;
    }
    const count = Math.min(post.images.length, 9);
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDynamicImageViewerScale(1);
        setDynamicImageViewerIndex(null);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDynamicImageViewerScale(1);
        setDynamicImageViewerIndex((current) =>
          current === null ? current : (current - 1 + count) % count,
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setDynamicImageViewerScale(1);
        setDynamicImageViewerIndex((current) =>
          current === null ? current : (current + 1) % count,
        );
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [dynamicImageViewerIndex, isDynamicDetail, post]);

  useEffect(() => {
    if (!collectionDialogOpen) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCollectionDialogOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [collectionDialogOpen]);

  const discussionOwnerComments = useMemo(() => {
    if (!post) return [];
    return postComments.filter(
      (comment) => !comment.parentId && isPostOwnerComment(post, comment),
    );
  }, [post, postComments]);
  const topLevelPostComments = useMemo(
    () =>
      postComments.filter(
        (comment) => !comment.parentId && !comment.replyToCommentId,
      ),
    [postComments],
  );
  const contentCommentChildren = useMemo(() => {
    const groups = new Map<number, CommentSummary[]>();
    const commentsById = new Map(
      postComments.map((comment) => [comment.id, comment]),
    );
    const rootCommentId = (comment: CommentSummary) => {
      let parentId = comment.parentId || comment.replyToCommentId;
      const visited = new Set<number>();
      while (parentId && parentId > 0 && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = commentsById.get(parentId);
        if (!parent) return parentId;
        const nextParentId = parent.parentId || parent.replyToCommentId;
        if (!nextParentId || nextParentId <= 0) return parent.id;
        parentId = nextParentId;
      }
      return parentId || 0;
    };
    postComments.forEach((comment) => {
      const parentId = rootCommentId(comment);
      if (!parentId || parentId <= 0) return;
      const items = groups.get(parentId) || [];
      items.push(comment);
      groups.set(parentId, items);
    });
    groups.forEach((items) => {
      items.sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      );
    });
    return groups;
  }, [postComments]);
  const contentVisibleComments = useMemo(() => {
    const items = topLevelPostComments.slice();
    if (contentCommentOrder === "hot") {
      items.sort((left, right) => {
        const leftVote = voteStates[voteKey("comment", left.id)];
        const rightVote = voteStates[voteKey("comment", right.id)];
        const leftScore =
          (leftVote?.upCount ?? left.upVoteCount) -
          (leftVote?.downCount ?? left.downVoteCount);
        const rightScore =
          (rightVote?.upCount ?? right.upVoteCount) -
          (rightVote?.downCount ?? right.downVoteCount);
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
        return (
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime()
        );
      });
      return items;
    }
    items.sort((left, right) => {
      const delta =
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime();
      return -delta;
    });
    return items;
  }, [contentCommentOrder, topLevelPostComments, voteStates]);
  const discussionChildComments = useMemo(() => {
    const groups = new Map<number, CommentSummary[]>();
    postComments.forEach((comment) => {
      if (!comment.parentId) return;
      const items = groups.get(comment.parentId) || [];
      items.push(comment);
      groups.set(comment.parentId, items);
    });
    groups.forEach((items) => {
      items.sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      );
    });
    return groups;
  }, [postComments]);
  const dynamicChildComments = useMemo(() => {
    const groups = new Map<number, CommentSummary[]>();
    postComments.forEach((comment) => {
      if (!comment.parentId) return;
      const items = groups.get(comment.parentId) || [];
      items.push(comment);
      groups.set(comment.parentId, items);
    });
    groups.forEach((items) => {
      items.sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      );
    });
    return groups;
  }, [postComments]);
  const contentParticipants = useMemo(() => {
    if (!post) return [];
    const participants: DetailParticipant[] = [];
    const seen = new Set<string>();
    const pushParticipant = (participant: DetailParticipant) => {
      const key = participant.key.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      participants.push(participant);
    };
    if (kind !== "blog") {
      pushParticipant({
        key: post.authorUid || post.authorId || post.author,
        name: post.author,
        profileId: authorProfileId(post.authorId, post.authorUid),
        avatar: avatarFromMap(post.author, post.authorAvatar, authorAvatars),
        rank: rankFromMap(post.author, post.authorRank, authorProfiles),
      });
    }
    postComments.forEach((comment) => {
      pushParticipant({
        key: comment.authorUid || comment.authorId || comment.author,
        name: comment.author,
        profileId: authorProfileId(comment.authorId, comment.authorUid),
        avatar: avatarFromMap(
          comment.author,
          comment.authorAvatar,
          authorAvatars,
        ),
        rank: rankFromMap(comment.author, comment.authorRank, authorProfiles),
      });
    });
    return participants;
  }, [authorAvatars, authorProfiles, kind, post, postComments]);
  const visibleDiscussionComments = useMemo(() => {
    let items = [...topLevelPostComments];
    if (post && discussionReplyView === "owner") {
      items = items.filter((comment) => isPostOwnerComment(post, comment));
    }
    if (discussionReplyOrder === "hot") {
      items.sort((left, right) => {
        if (right.voteCount !== left.voteCount) {
          return right.voteCount - left.voteCount;
        }
        return (
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime()
        );
      });
      return items;
    }
    items.sort((left, right) => {
      const delta =
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime();
      return discussionReplyOrder === "asc" ? delta : -delta;
    });
    return items;
  }, [discussionReplyOrder, discussionReplyView, post, topLevelPostComments]);
  const hotDiscussionCount = useMemo(
    () =>
      topLevelPostComments.filter((comment) => comment.voteCount > 0).length,
    [topLevelPostComments],
  );
  const visibleDynamicComments = useMemo(() => {
    const items = postComments.filter((comment) => !comment.parentId);
    if (dynamicCommentOrder === "hot") {
      items.sort((left, right) => {
        if (right.voteCount !== left.voteCount) {
          return right.voteCount - left.voteCount;
        }
        return (
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime()
        );
      });
      return items;
    }
    items.sort((left, right) => {
      const delta =
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime();
      return dynamicCommentOrder === "asc" ? delta : -delta;
    });
    return items;
  }, [dynamicCommentOrder, postComments]);
  const hotDynamicCommentCount = useMemo(
    () => postComments.filter((comment) => comment.voteCount > 0).length,
    [postComments],
  );
  const dynamicHotCommentPreview = useMemo(
    () =>
      postComments
        .filter((comment) => !comment.parentId && comment.voteCount > 0)
        .slice()
        .sort((left, right) => {
          if (right.voteCount !== left.voteCount) {
            return right.voteCount - left.voteCount;
          }
          return (
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime()
          );
        })
        .slice(0, 3),
    [postComments],
  );

  const dynamicHeartReaction = useMemo(
    () => reactions.find((reaction) => reaction.emoji === "heart"),
    [reactions],
  );
  const dynamicPositiveReactionTotal = useMemo(
    () =>
      reactions
        .filter(
          (reaction) =>
            reaction.emoji === "heart" || reaction.emoji === "smile",
        )
        .reduce((total, reaction) => total + reaction.count, 0),
    [reactions],
  );
  const dynamicIsLiked = Boolean(dynamicHeartReaction?.is_active);
  const dynamicLikeCount = dynamicHeartReaction?.count ?? dynamicLikeUserCount;
  const dynamicVisibleLikeCount = Math.max(
    dynamicLikeCount,
    dynamicLikeUserCount,
    dynamicLikeUsers.length,
  );
  const dynamicCollectionCount = collectionCount ?? collectionCountHint(post);
  const dynamicRepostCount =
    (dynamicRepostUsersLoaded
      ? dynamicRepostUserCount
      : repostCountHint(post) || dynamicRepostUserCount || 0) + repostDelta;
  const discussionFloorNumbers = useMemo(() => {
    const floors = new Map<number, number>();
    topLevelPostComments
      .slice()
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      )
      .forEach((comment, index) => {
        floors.set(comment.id, index + 2);
      });
    return floors;
  }, [topLevelPostComments]);
  const sortedAnswers = useMemo(() => {
    if (!question) return [];
    const items = [...question.answers];
    items.sort((left, right) => {
      if (answerOrder === "asc") {
        return (
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime()
        );
      }
      if (answerOrder === "desc") {
        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        );
      }
      if (Number(right.accepted) !== Number(left.accepted)) {
        return Number(right.accepted) - Number(left.accepted);
      }
      if (right.voteCount !== left.voteCount) {
        return right.voteCount - left.voteCount;
      }
      return (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
    });
    return items;
  }, [answerOrder, question]);

  const buildRinPageContextSnapshot = useCallback(():
    | RinPageContextSnapshot
    | undefined => {
    if (!post) return undefined;
    const drafts: RinPageContextDraft[] = [];
    Object.entries(commentDrafts)
      .filter(([, body]) => body.trim())
      .slice(0, 8)
      .forEach(([key, body]) => {
        appendDraft(drafts, t("detail.context.commentDraft", { key }), body);
      });
    Object.entries(floorReplyDrafts)
      .filter(([key]) => (commentDrafts[key] || "").trim())
      .slice(0, 8)
      .forEach(([key, draft]) => {
        appendDraft(
          drafts,
          t("detail.context.nestedReplyDraft", {
            key,
            author: draft.author,
          }),
          commentDrafts[key] || "",
        );
      });
    appendDraft(
      drafts,
      t("detail.context.editingComment"),
      commentEditDraft,
    );
    appendDraft(drafts, t("detail.context.repostDraft"), repostDraft);

    const sections: RinPageContextSection[] = [];
    if (blogTocItems.length) {
      sections.push({
        title: t("detail.toc.blogLabel"),
        body: blogTocItems.map((item) => item.text).join("\n"),
      });
    }

    let snapshot: RinPageContextSnapshot;
    if (question) {
      appendDraft(
        drafts,
        t("detail.context.answerDraft"),
        answerEditorRef.current?.getValue() || answerDraft,
      );
      if (editingAnswerId !== null) {
        appendDraft(
          drafts,
          t("detail.context.editingAnswer", {
            id: formatNumber(locale, editingAnswerId),
          }),
          answerEditEditorRef.current?.getValue() || answerEditDraft,
        );
      }
      if (editingQuestion) {
        appendDraft(
          drafts,
          t("detail.context.editingQuestion"),
          [
            questionEditTitle.trim(),
            (
              questionEditBodyEditorRef.current?.getValue() || questionEditBody
            ).trim(),
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }
      const answers: RinPageContextAnswer[] = sortedAnswers
        .slice(0, 20)
        .map((answer) => ({
          id: answer.id,
          author: answer.author,
          body: answer.body,
          accepted: answer.accepted,
          voteCount: answer.voteCount,
          comments: (answerComments[answer.id] || [])
            .slice(0, 12)
            .map(rinContextComment),
        }));
      snapshot = {
        kind: "question",
        id: question.question.id,
        slug: question.question.slug,
        title: question.question.title,
        author: question.question.author,
        tags: tagsFor(question.question),
        body: question.question.body || question.body,
        excerpt: question.question.excerpt,
        comments: questionComments.slice(0, 20).map(rinContextComment),
        answers,
        drafts,
        sections,
        updatedAt: question.question.updatedAt,
      };
    } else {
      const visibleComments = isThreadLikeDetail
        ? visibleDiscussionComments
        : isDynamicDetail
          ? visibleDynamicComments
          : kind === "blog"
            ? contentVisibleComments
            : postComments;
      snapshot = {
        kind: post.type || kind,
        id: post.id,
        slug: post.slug,
        title: post.title,
        author: post.author,
        tags: tagsFor(post),
        body: post.body,
        excerpt: post.excerpt,
        comments: visibleComments.slice(0, 30).map(rinContextComment),
        drafts,
        sections,
        updatedAt: post.updatedAt,
      };
    }

    return snapshot;
  }, [
    answerComments,
    answerDraft,
    answerEditDraft,
    blogTocItems,
    contentVisibleComments,
    commentDrafts,
    commentEditDraft,
    editingAnswerId,
    editingQuestion,
    floorReplyDrafts,
    isDynamicDetail,
    isThreadLikeDetail,
    kind,
    post,
    postComments,
    question,
    questionComments,
    questionEditBody,
    questionEditTitle,
    repostDraft,
    sortedAnswers,
    locale,
    t,
    visibleDiscussionComments,
    visibleDynamicComments,
  ]);

  useEffect(() => {
    const snapshot = buildRinPageContextSnapshot();
    if (!snapshot) {
      delete window.__rinspacePageContext;
      delete window.__rinspaceBuildPageContext;
      return;
    }

    window.__rinspaceBuildPageContext = buildRinPageContextSnapshot;
    window.__rinspacePageContext = snapshot;
    window.dispatchEvent(new CustomEvent("rinspace:page-context"));
    return () => {
      if (window.__rinspacePageContext === snapshot) {
        delete window.__rinspacePageContext;
      }
      if (window.__rinspaceBuildPageContext === buildRinPageContextSnapshot) {
        delete window.__rinspaceBuildPageContext;
      }
    };
  }, [buildRinPageContextSnapshot]);

  const voteSnapshot = (
    targetType: VoteTargetType,
    targetId: number,
    fallbackCount: number,
  ): VoteSnapshot =>
    voteStates[voteKey(targetType, targetId)] || {
      count: fallbackCount,
      status: "none",
    };

  const reloadQuestionThread = async () => {
    if (!question) return null;
    const updated = await loadQuestionDetail(question.question.slug || slug);
    await applyQuestionDetail(updated);
    return updated;
  };

  const reloadPostThread = async () => {
    if (!post || question) return null;
    const updated = await loadContentDetail(post.slug || slug);
    setPost(updated);
    setBookmarked(updated.collected);
    setCollectionCount(collectionCountHint(updated));
    await loadPostCommentThread(updated);
    return updated;
  };

  const setLocalQuestionStatus = (status: number) => {
    if (!question) return;
    const updated = {
      ...question,
      question: {
        ...question.question,
        status,
      },
    };
    setQuestion(updated);
    setPost(updated.question);
  };

  const closeActiveQuestion = async () => {
    if (!question) return;
    setQuestionMaintenanceStatus("");
    setQuestionMaintenanceError("");
    setQuestionDeleteConfirm(false);
    if (!hasSession) {
      setQuestionMaintenanceError(t("detail.notices.signInToCloseQuestion"));
      return;
    }
    setQuestionMaintenanceBusy("close");
    try {
      const updated = await closeQuestion({
        slug: question.question.slug || slug,
        closeType: 0,
        closeMsg: questionCloseReason.trim(),
      });
      await applyQuestionDetail(updated);
      setQuestionCloseReason("");
      setQuestionMaintenanceStatus(t("detail.notices.questionClosed"));
    } catch (closeFailure) {
      if (isAuthenticationFailure(closeFailure)) {
        setHasSession(false);
      }
      setQuestionMaintenanceError(
        localizedErrorMessage(closeFailure, "reader.questionActionFailed"),
      );
    } finally {
      setQuestionMaintenanceBusy("");
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (isBlogTypographyTest) return undefined;
    const authorLookupIds = new Map<string, string>();
    const addAuthorLookup = (
      author: string,
      authorId: string | undefined,
      authorAvatar: string | undefined,
    ) => {
      const name = author.trim();
      if (name && authorId) {
        authorLookupIds.set(name, authorId);
      }
    };
    if (post) addAuthorLookup(post.author, post.authorId, post.authorAvatar);
    if (question?.question) {
      addAuthorLookup(
        question.question.author,
        question.question.authorId,
        question.question.authorAvatar,
      );
    }
    question?.answers.forEach((answer) => {
      addAuthorLookup(answer.author, answer.authorId, answer.authorAvatar);
    });
    questionComments.forEach((comment) => {
      addAuthorLookup(comment.author, comment.authorId, comment.authorAvatar);
    });
    postComments.forEach((comment) => {
      addAuthorLookup(comment.author, comment.authorId, comment.authorAvatar);
    });
    Object.values(answerComments)
      .flat()
      .forEach((comment) => {
        addAuthorLookup(comment.author, comment.authorId, comment.authorAvatar);
      });

    const missing = Array.from(authorLookupIds.entries()).filter(
      ([name]) => !(name in authorProfiles),
    );
    if (!missing.length) return undefined;

    void Promise.all(
      missing.map(async ([name, authorId]) => {
        try {
          const info = await loadPersonalUserInfo(authorId);
          return [
            name,
            { avatar: info.avatar || "", rank: info.rank },
          ] as const;
        } catch {
          return [name, { avatar: "", rank: undefined }] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setAuthorProfiles((current) => {
        const next = { ...current };
        entries.forEach(([name, profile]) => {
          next[name] = profile;
        });
        return next;
      });
      setAuthorAvatars((current) => {
        const next = { ...current };
        entries.forEach(([name, profile]) => {
          next[name] = profile.avatar;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    authorProfiles,
    answerComments,
    isBlogTypographyTest,
    post,
    postComments,
    question,
    questionComments,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!post || !isDynamicDetail) {
      setDynamicAuthorFollowed(false);
      setDynamicAuthorFollowStatus("");
      setDynamicAuthorFollowError("");
      return undefined;
    }
    const authorProfile = authorProfileId(post.authorId, post.authorUid);
    if (!authorProfile) {
      setDynamicAuthorFollowed(false);
      return undefined;
    }
    void loadPersonalUserInfo(authorProfile)
      .then((info) => {
        if (cancelled) return;
        setDynamicAuthorFollowed(info.is_follower);
      })
      .catch(() => {
        if (cancelled) return;
        setDynamicAuthorFollowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDynamicDetail, post]);

  const reopenActiveQuestion = async () => {
    if (!question) return;
    setQuestionMaintenanceStatus("");
    setQuestionMaintenanceError("");
    setQuestionDeleteConfirm(false);
    if (!hasSession) {
      setQuestionMaintenanceError(t("detail.notices.signInToReopenQuestion"));
      return;
    }
    setQuestionMaintenanceBusy("reopen");
    try {
      const updated = await reopenQuestion(question.question.slug || slug);
      await applyQuestionDetail(updated);
      setQuestionMaintenanceStatus(t("detail.notices.questionReopened"));
    } catch (reopenFailure) {
      if (isAuthenticationFailure(reopenFailure)) {
        setHasSession(false);
      }
      setQuestionMaintenanceError(
        localizedErrorMessage(reopenFailure, "reader.questionActionFailed"),
      );
    } finally {
      setQuestionMaintenanceBusy("");
    }
  };

  const deleteActiveQuestion = async () => {
    if (!question) return;
    setQuestionMaintenanceStatus("");
    setQuestionMaintenanceError("");
    if (!hasSession) {
      setQuestionMaintenanceError(t("detail.notices.signInToDeleteQuestion"));
      return;
    }
    if (!questionDeleteConfirm) {
      setQuestionDeleteConfirm(true);
      setQuestionMaintenanceStatus(t("detail.notices.confirmQuestionDelete"));
      return;
    }
    setQuestionMaintenanceBusy("delete");
    try {
      await deleteQuestion({ id: question.question.id });
      setLocalQuestionStatus(10);
      setQuestionDeleteConfirm(false);
      setQuestionMaintenanceStatus(t("detail.notices.questionDeleted"));
    } catch (deleteFailure) {
      if (isAuthenticationFailure(deleteFailure)) {
        setHasSession(false);
      }
      setQuestionMaintenanceError(
        localizedErrorMessage(deleteFailure, "reader.questionActionFailed"),
      );
    } finally {
      setQuestionMaintenanceBusy("");
    }
  };

  const recoverActiveQuestion = async () => {
    if (!question) return;
    setQuestionMaintenanceStatus("");
    setQuestionMaintenanceError("");
    setQuestionDeleteConfirm(false);
    if (!hasSession) {
      setQuestionMaintenanceError(t("detail.notices.signInToRecoverQuestion"));
      return;
    }
    setQuestionMaintenanceBusy("recover");
    try {
      await recoverQuestion(question.question.id);
      setLocalQuestionStatus(0);
      setQuestionMaintenanceStatus(t("detail.notices.questionRecovered"));
    } catch (recoverFailure) {
      if (isAuthenticationFailure(recoverFailure)) {
        setHasSession(false);
      }
      setQuestionMaintenanceError(
        localizedErrorMessage(recoverFailure, "reader.questionActionFailed"),
      );
    } finally {
      setQuestionMaintenanceBusy("");
    }
  };

  const saveCollectionToFolder = async (
    folderId: string,
    targetFolder?: CollectionFolder,
  ) => {
    if (!post) return;
    setCollectionStatus("");
    setCollectionError("");
    if (!hasSession) {
      setCollectionError(t("detail.notices.signInToBookmark"));
      return;
    }
    setCollectionBusy(true);
    try {
      const next = await switchCollection({
        targetType: contentActionTargetType(kind),
        slug: post.slug || post.id,
        bookmark: true,
        isCancel: false,
        folderId: folderId || undefined,
      });
      setBookmarked(next.bookmarked);
      setCollectionCount(next.collectionCount);
      setCollectionRecordId(next.collectionId || "");
      setCollectionFolderId(next.folderId || folderId || "");
      const resolvedFolder =
        targetFolder ||
        collectionFolders.find(
          (folder) => folder.id === next.folderId || folder.id === folderId,
        );
      setCollectionStatus(
        next.bookmarked
          ? t("detail.notices.bookmarkedInFolder", {
              folder:
                resolvedFolder?.name || t("detail.collection.defaultFolder"),
            })
          : t("detail.notices.bookmarkRemoved"),
      );
      setCollectionDialogOpen(false);
    } catch (collectionFailure) {
      if (isAuthenticationFailure(collectionFailure)) {
        setHasSession(false);
      }
      setCollectionError(
        localizedErrorMessage(collectionFailure, "home.collectionFailed"),
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const cancelCollection = async () => {
    if (!post) return;
    setCollectionStatus("");
    setCollectionError("");
    if (!hasSession) {
      setCollectionError(t("detail.notices.signInToBookmark"));
      return;
    }
    setCollectionBusy(true);
    try {
      const next = await switchCollection({
        targetType: contentActionTargetType(kind),
        slug: post.slug || post.id,
        bookmark: false,
        isCancel: true,
      });
      setBookmarked(next.bookmarked);
      setCollectionCount(next.collectionCount);
      setCollectionRecordId("");
      setCollectionFolderId("");
      setCollectionStatus(t("detail.notices.bookmarkRemoved"));
      setCollectionDialogOpen(false);
    } catch (collectionFailure) {
      if (isAuthenticationFailure(collectionFailure)) {
        setHasSession(false);
      }
      setCollectionError(
        localizedErrorMessage(collectionFailure, "home.collectionFailed"),
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const openCollectionDialog = () => {
    setCollectionStatus("");
    setCollectionError("");
    if (!hasSession) {
      setCollectionError(t("detail.notices.signInToBookmark"));
      return;
    }
    setCollectionDialogOpen(true);
  };

  const toggleCollection = async () => {
    if (bookmarked) {
      await cancelCollection();
      return;
    }
    openCollectionDialog();
  };

  const toggleRepositoryLike = async () => {
    if (!post || (kind !== "blog" && kind !== "book")) return;
    setCollectionStatus("");
    setCollectionError("");
    if (!hasSession) {
      setCollectionError(t("detail.notices.signInToLike"));
      return;
    }
    setCollectionBusy(true);
    try {
      if (post.likeSource === "reaction") {
        const result = await updateReaction({
          object_id: post.id,
          object_type: reportTypeForPost(post.type),
          emoji: "heart",
          reaction: likeActive ? "deactivate" : "activate",
        });
        const heart = result.reaction_summary.find((reaction) => reaction.emoji === "heart");
        const active = Boolean(heart?.is_active);
        setLikeActive(active);
        setLikeCount(heart?.count ?? 0);
        setReactions(result.reaction_summary);
        setCollectionStatus(active ? t("detail.notices.liked") : t("detail.notices.likeRemoved"));
        return;
      }
      const next = await likePost({
        targetType: contentActionTargetType(kind),
        slug: post.slug || post.id,
        bookmark: !likeActive,
        isCancel: likeActive,
      });
      setLikeActive(next.liked);
      setLikeCount(next.likeCount);
      setCollectionStatus(
        next.liked
          ? t("detail.notices.liked")
          : t("detail.notices.likeRemoved"),
      );
    } catch (likeFailure) {
      if (isAuthenticationFailure(likeFailure)) {
        setHasSession(false);
      }
      setCollectionError(
        localizedErrorMessage(likeFailure, "home.reactionFailed"),
      );
    } finally {
      setCollectionBusy(false);
    }
  };

  const runDynamicRepost = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!post || !isDynamicDetail) return;
    setRepostStatus("");
    setRepostError("");
    if (!hasSession) {
      setRepostError(t("detail.notices.signInToRepost"));
      return;
    }
    setRepostBusy(true);
    try {
      const created = await repostContent({
        targetType: "dynamic",
        slug: post.slug || post.id,
        body: repostDraft.trim() || undefined,
      });
      setRepostDelta((current) => current + 1);
      setRepostDraft("");
      setRepostComposerOpen(false);
      setRepostStatus(
        t("detail.notices.reposted", { title: created.title }),
      );
    } catch (repostFailure) {
      if (isAuthenticationFailure(repostFailure)) {
        setHasSession(false);
      }
      setRepostError(
        localizedErrorMessage(repostFailure, "home.shareFailed"),
      );
    } finally {
      setRepostBusy(false);
    }
  };

  const copyDynamicLink = async () => {
    if (!post || !isDynamicDetail) return;
    setRepostStatus("");
    setRepostError("");
    const path = `${publicEnv.publicBasePath || ""}/s/${encodeURIComponent(
      String(post.slug || post.id),
    )}`;
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setRepostStatus(t("detail.notices.dynamicLinkCopied"));
    } catch {
      setRepostError(t("detail.notices.copyLinkFailed"));
    }
  };

  const toggleDynamicAuthorFollow = async () => {
    if (!post || !isDynamicDetail) return;
    const authorProfile = authorProfileId(post.authorId, post.authorUid);
    if (!authorProfile) return;
    setDynamicAuthorFollowStatus("");
    setDynamicAuthorFollowError("");
    if (!hasSession) {
      setDynamicAuthorFollowError(t("detail.notices.signInToFollowAuthor"));
      return;
    }
    if (sameUserId(currentUser?.id, post.authorUid || post.authorId)) {
      setDynamicAuthorFollowError(t("detail.notices.cannotFollowSelf"));
      return;
    }
    setDynamicAuthorFollowBusy(true);
    try {
      const result = await followTarget({
        targetType: "user",
        targetId: authorProfile,
        isCancel: dynamicAuthorFollowed,
      });
      setDynamicAuthorFollowed(result.following);
      setDynamicAuthorFollowStatus(
        result.following
          ? t("detail.notices.authorFollowed")
          : t("detail.notices.authorUnfollowed"),
      );
    } catch (followFailure) {
      if (isAuthenticationFailure(followFailure)) {
        setHasSession(false);
      }
      setDynamicAuthorFollowError(
        localizedErrorMessage(followFailure, "reader.authorFollowFailed"),
      );
    } finally {
      setDynamicAuthorFollowBusy(false);
    }
  };

  const submitInviteList = async (
    nextUsers: InviteCandidate[],
    successMessage: string,
    rinSuccessMessage = t("detail.notices.rinInvited"),
  ) => {
    if (!question) return;
    setInviteStatus("");
    setInviteError("");
    if (!hasSession) {
      setInviteError(t("detail.notices.signInToInvite"));
      return;
    }
    setInviteSubmitting(true);
    try {
      const identifiers = Array.from(
        new Set(nextUsers.map(inviteIdentifier).filter(Boolean)),
      );
      const updated = await updateQuestionInviteUsers({
        id: question.question.id,
        inviteUser: identifiers,
      });
      setInviteUsers(updated);
      setInviteCandidates((current) =>
        current.filter(
          (candidate) =>
            !updated.some(
              (user) => inviteLookupKey(user) === inviteLookupKey(candidate),
            ),
        ),
      );
      setInviteQuery("");
      setInviteStatus(
        updated.some(isRinInviteUser) ? rinSuccessMessage : successMessage,
      );
    } catch (inviteFailure) {
      if (isAuthenticationFailure(inviteFailure)) {
        setHasSession(false);
      }
      setInviteError(
        localizedErrorMessage(inviteFailure, "reader.inviteUpdateFailed"),
      );
    } finally {
      setInviteSubmitting(false);
    }
  };

  const inviteCandidate = async (candidate: InviteCandidate) => {
    const current = inviteUsers.map((user) => ({ ...user }));
    const exists = current.some(
      (user) => inviteLookupKey(user) === inviteLookupKey(candidate),
    );
    if (exists) {
      setInviteStatus(t("detail.notices.alreadyInvited"));
      return;
    }
    await submitInviteList(
      [...current, candidate],
      t("detail.notices.memberInvited", {
        member: inviteIdentity(candidate),
      }),
    );
  };

  const removeInvite = async (user: AnswerUserBasicInfo) => {
    const next = inviteUsers.filter(
      (item) => inviteLookupKey(item) !== inviteLookupKey(user),
    );
    await submitInviteList(
      next,
      t("detail.notices.inviteRemoved", {
        member: inviteIdentity(user),
      }),
    );
  };

  const startQuestionEdit = () => {
    if (!post || !question) return;
    setQuestionEditStatus("");
    setQuestionEditError("");
    setEditingQuestion(true);
    setQuestionEditTitle(post.title);
    setQuestionEditBody(post.body);
    setQuestionEditTags(tagsFor(post).join(", "));
  };

  const cancelQuestionEdit = () => {
    setEditingQuestion(false);
    setQuestionEditTitle("");
    setQuestionEditBody("");
    setQuestionEditTags("");
    setQuestionEditError("");
  };

  const saveQuestionEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question) return;
    setQuestionEditStatus("");
    setQuestionEditError("");
    if (!hasSession) {
      setQuestionEditError(t("detail.notices.signInToEditQuestion"));
      return;
    }
    if (!canEditQuestion) {
      setQuestionEditError(t("detail.notices.questionEditPermission"));
      return;
    }
    const titleValue = questionEditTitle.trim();
    const bodyValue = questionEditBody.trim();
    if (!titleValue) {
      setQuestionEditError(t("detail.notices.questionTitleRequired"));
      return;
    }
    setQuestionEditBusy(true);
    try {
      await updateQuestion({
        id: question.question.id,
        title: titleValue,
        content: bodyValue,
        tags: splitTagValues(questionEditTags)
          .slice(0, 6)
          .map((tag) => ({ slugName: tag })),
      });
      const updated = await loadQuestionDetail(question.question.slug || slug);
      await applyQuestionDetail(updated);
      const questionID = revisionObjectIdFromQuestion(updated);
      if (questionID !== null) {
        setRevisionLoading(true);
        try {
          const items = await listRevisions({
            objectType: revisionObjectTypeForPost(updated.question),
            objectId: questionID,
            limit: 4,
          });
          setRevisionItems(items);
          setRevisionError("");
        } catch (revisionLoadError) {
          setRevisionError(
            localizedErrorMessage(
              revisionLoadError,
              "reader.revisionLoadFailed",
            ),
          );
        } finally {
          setRevisionLoading(false);
        }
      }
      setEditingQuestion(false);
      setQuestionEditStatus(t("detail.notices.questionUpdated"));
    } catch (editFailure) {
      if (isAuthenticationFailure(editFailure)) {
        setHasSession(false);
      }
      setQuestionEditError(
        localizedErrorMessage(editFailure, "reader.questionEditFailed"),
      );
    } finally {
      setQuestionEditBusy(false);
    }
  };

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAnswerStatus("");
    setAnswerError("");
    if (!question) return;
    if (!hasSession) {
      setAnswerError(t("detail.notices.signInToPublishAnswer"));
      return;
    }
    const content = answerDraft.trim();
    if (questionClosed) {
      setAnswerError(t("detail.notices.questionClosedForAnswers"));
      return;
    }

    setSubmittingAnswer(true);
    try {
      await createAnswerByQuestion({
        questionId: question.question.id,
        content,
      });
      const updated = await loadQuestionDetail(question.question.slug);
      setQuestion(updated);
      setPost(updated.question);
      setAnswerDraft("");
      setAnswerStatus(t("detail.notices.answerPublished"));
      await loadCommentThreads(updated);
    } catch (submitError) {
      if (isAuthenticationFailure(submitError)) {
        setHasSession(false);
      }
      setAnswerError(
        localizedErrorMessage(submitError, "reader.answerPublishFailed"),
      );
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const setAcceptedAnswer = async (
    answerId: number,
    currentlyAccepted: boolean,
  ) => {
    setAcceptStatus("");
    setAcceptError("");
    if (!question) return;
    if (!hasSession) {
      setAcceptError(t("detail.notices.signInToAcceptAnswer"));
      return;
    }

    const key = `accept-${answerId}`;
    setAcceptBusyKey(key);
    try {
      await acceptAnswerById({
        questionId: question.question.id,
        answerId: currentlyAccepted ? "0" : answerId,
      });
      const updated = await loadQuestionDetail(question.question.slug || slug);
      setQuestion(updated);
      setPost(updated.question);
      setCollectionCount(collectionCountHint(updated.question));
      setAcceptStatus(
        currentlyAccepted
          ? t("detail.notices.answerUnaccepted")
          : t("detail.notices.answerAccepted"),
      );
      await loadCommentThreads(updated);
    } catch (acceptFailure) {
      if (isAuthenticationFailure(acceptFailure)) {
        setHasSession(false);
      }
      setAcceptError(
        localizedErrorMessage(acceptFailure, "reader.answerAcceptFailed"),
      );
    } finally {
      setAcceptBusyKey("");
    }
  };

  const startAnswerEdit = (answer: QuestionDetail["answers"][number]) => {
    setAnswerMutationStatus("");
    setAnswerMutationError("");
    setAnswerDeleteConfirmId(null);
    setEditingAnswerId(answer.id);
    setAnswerEditDraft(answer.body);
    setAnswerEditSummary("");
  };

  const cancelAnswerEdit = () => {
    setEditingAnswerId(null);
    setAnswerEditDraft("");
    setAnswerEditSummary("");
    setAnswerMutationError("");
  };

  const saveAnswerEdit = async (
    event: FormEvent<HTMLFormElement>,
    answerId: number,
  ) => {
    event.preventDefault();
    setAnswerMutationStatus("");
    setAnswerMutationError("");
    if (!hasSession) {
      setAnswerMutationError(t("detail.notices.signInToEditAnswer"));
      return;
    }
    const content = answerEditDraft.trim();
    setAnswerMutationBusyKey(`edit-${answerId}`);
    try {
      await updateAnswerById({
        id: answerId,
        content,
        editSummary: answerEditSummary.trim(),
      });
      await reloadQuestionThread();
      setEditingAnswerId(null);
      setAnswerEditDraft("");
      setAnswerEditSummary("");
      setAnswerMutationStatus(t("detail.notices.answerUpdated"));
    } catch (editFailure) {
      if (isAuthenticationFailure(editFailure)) {
        setHasSession(false);
      }
      setAnswerMutationError(
        localizedErrorMessage(editFailure, "reader.answerUpdateFailed"),
      );
    } finally {
      setAnswerMutationBusyKey("");
    }
  };

  const deleteAnswer = async (answerId: number) => {
    setAnswerMutationStatus("");
    setAnswerMutationError("");
    if (!hasSession) {
      setAnswerMutationError(t("detail.notices.signInToDeleteAnswer"));
      return;
    }
    if (answerDeleteConfirmId !== answerId) {
      setAnswerDeleteConfirmId(answerId);
      setAnswerMutationStatus(t("detail.notices.confirmAnswerDelete"));
      return;
    }
    setAnswerMutationBusyKey(`delete-${answerId}`);
    try {
      await deleteAnswerById({ id: answerId });
      await reloadQuestionThread();
      setAnswerDeleteConfirmId(null);
      if (editingAnswerId === answerId) {
        setEditingAnswerId(null);
        setAnswerEditDraft("");
        setAnswerEditSummary("");
      }
      setAnswerMutationStatus(t("detail.notices.answerDeleted"));
    } catch (deleteFailure) {
      if (isAuthenticationFailure(deleteFailure)) {
        setHasSession(false);
      }
      setAnswerMutationError(
        localizedErrorMessage(deleteFailure, "reader.answerDeleteFailed"),
      );
    } finally {
      setAnswerMutationBusyKey("");
    }
  };

  const submitComment = async (
    event: FormEvent<HTMLFormElement>,
    target: CommentTargetRef,
  ) => {
    event.preventDefault();
    setCommentStatus("");
    setCommentError("");
    if (!hasSession) {
      setCommentError(t("detail.notices.signInToComment"));
      return;
    }
    const key = commentTargetKey(target);
    const body = (commentDrafts[key] || "").trim();
    const floorReplyDraft = floorReplyDrafts[key];
    if (body.length < 2 || body.length > 5000) {
      setCommentError(t("detail.notices.commentLength"));
      return;
    }

    setCommentBusyKey(key);
    try {
      await createComment({
        targetType: target.targetType,
        targetId: target.targetId,
        slug: target.slug,
        body,
        parentId: floorReplyDraft?.parentId,
        replyToCommentId: floorReplyDraft?.replyToCommentId,
      });
      if (question) {
        const items = await loadComments({
          targetType: target.targetType,
          targetId: target.targetId,
          slug: target.slug,
          limit: target.targetType === "answer" ? 12 : 24,
        });
        if (target.targetType === "question") {
          setQuestionComments(items);
        } else if (
          target.targetType === "answer" &&
          typeof target.targetId === "number"
        ) {
          const answerTargetId = target.targetId;
          setAnswerComments((current) => ({
            ...current,
            [answerTargetId]: items,
          }));
        }
        const updated = await loadQuestionDetail(question.question.slug);
        setQuestion(updated);
        setPost(updated.question);
      } else if (post) {
        const updated = await loadContentDetail(post.slug || slug);
        setPost(updated);
        setCollectionCount(collectionCountHint(updated));
        await loadPostCommentThread(updated);
      }
      setCommentDrafts((current) => ({ ...current, [key]: "" }));
      setFloatingCommentComposerExpanded(false);
      setOpenCommentForms((current) => ({ ...current, [key]: false }));
      setExpandedCommentLists((current) => ({ ...current, [key]: true }));
      setFloorReplyDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (isDynamicDetail && target.targetType === "dynamic") {
        setInlineDynamicReplyTarget(null);
      }
      setCommentStatus(t("detail.notices.commentPublished"));
    } catch (submitError) {
      if (isAuthenticationFailure(submitError)) {
        setHasSession(false);
      }
      setCommentError(
        localizedErrorMessage(submitError, "comments.publishFailed"),
      );
    } finally {
      setCommentBusyKey("");
    }
  };

  const appendCommentDraft = (key: string, addition: string) => {
    setCommentDrafts((current) => {
      const existing = current[key] || "";
      const separator = existing.trim() ? "\n\n" : "";
      return {
        ...current,
        [key]: `${existing}${separator}${addition}`.trimStart(),
      };
    });
  };

  const focusCommentComposer = (key: string, shouldScroll = false) => {
    setOpenCommentForms((current) =>
      current[key] ? current : { ...current, [key]: true },
    );
    const focusWhenReady = (attempt = 0) =>
      window.requestAnimationFrame(() => {
        const composer = document.getElementById(`comment-${key}`);
        if (!composer && attempt < 5) {
          focusWhenReady(attempt + 1);
          return;
        }
        if (shouldScroll) {
          composer?.scrollIntoView({ block: "center", behavior: "smooth" });
          composer
            ?.closest(".inline-comment-form")
            ?.classList.add("composer-focus-pulse");
          window.setTimeout(() => {
            composer
              ?.closest(".inline-comment-form")
              ?.classList.remove("composer-focus-pulse");
          }, 1200);
        }
        const editor = composer?.querySelector<HTMLElement>(".cm-content");
        if (!editor && attempt < 5) {
          focusWhenReady(attempt + 1);
          return;
        }
        editor?.focus();
      });
    focusWhenReady();
  };

  const jumpToComment = (commentId: number) => {
    const target = document.getElementById(`comment-${commentId}`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("comment-reference-highlight");
    window.setTimeout(() => {
      target.classList.remove("comment-reference-highlight");
    }, 1600);
  };

  const replyToCommentFloor = (
    comment: CommentSummary,
    floorNumber?: number,
    target?: CommentTargetRef,
    rootCommentId?: number,
  ) => {
    if (!target) {
      setCommentError(t("detail.notices.replyUnavailable"));
      return;
    }
    const key = commentTargetKey(target);
    const nextReplyDraft = {
      parentId: rootCommentId || comment.parentId || comment.id,
      replyToCommentId: comment.id,
      floorNumber: rootCommentId ? undefined : floorNumber,
      author: comment.author.trim() || t("detail.comments.unknownUser"),
    };
    setFloorReplyDrafts((current) => ({
      ...current,
      [key]: nextReplyDraft,
    }));
    setCommentDrafts((current) => {
      const existing = current[key] || "";
      if (existing.trim()) return current;
      return {
        ...current,
        [key]: `@${comment.author.trim() || t("detail.comments.unknownUser")} `,
      };
    });
    setCommentStatus("");
    setCommentError("");
    if (isDynamicDetail && target.targetType === "dynamic") {
      setInlineDynamicReplyTarget({
        ...nextReplyDraft,
        anchorCommentId: comment.id,
      });
      requestAnimationFrame(() => {
        document
          .getElementById(`dynamic-inline-reply-${comment.id}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        focusCommentComposer(key);
      });
      return;
    }
    document
      .getElementById("content-comment-composer")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    focusCommentComposer(key);
  };

  const commentImageMarkdown = (url: string, filename: string) => {
    const fallbackAlt =
      filename.replace(/\.[^.]+$/, "").trim() ||
      t("detail.comments.imageAlt");
    const alt =
      fallbackAlt.replace(/[\[\]\r\n]+/g, " ").trim() ||
      t("detail.comments.imageAlt");
    return `![${alt}](${url})`;
  };

  const uploadCommentImages = async (
    event: ChangeEvent<HTMLInputElement>,
    target: CommentTargetRef,
  ) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;

    setCommentStatus("");
    setCommentError("");
    if (!hasSession) {
      setCommentError(t("detail.notices.signInToUploadCommentImage"));
      return;
    }

    const invalid = files.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      setCommentError(t("errors:comments.imageOnly"));
      return;
    }
    const oversized = files.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setCommentError(t("errors:comments.imageTooLarge"));
      return;
    }

    const key = commentTargetKey(target);
    setCommentUploadBusyKey(key);
    try {
      const markdown: string[] = [];
      for (const file of files.slice(0, 9)) {
        const url = await uploadAnswerFile("post", file);
        markdown.push(commentImageMarkdown(url, file.name));
      }
      appendCommentDraft(key, markdown.join("\n\n"));
    } catch (uploadError) {
      if (isAuthenticationFailure(uploadError)) {
        setHasSession(false);
      }
      setCommentError(
        localizedErrorMessage(uploadError, "comments.uploadFailed"),
      );
    } finally {
      setCommentUploadBusyKey("");
    }
  };

  const startCommentEdit = (comment: CommentSummary) => {
    setCommentStatus("");
    setCommentError("");
    setCommentDeleteConfirmId(null);
    setEditingCommentId(comment.id);
    setCommentEditDraft(comment.body);
  };

  const cancelCommentEdit = () => {
    setEditingCommentId(null);
    setCommentEditDraft("");
    setCommentError("");
  };

  const saveCommentEdit = async (
    event: FormEvent<HTMLFormElement>,
    commentId: number,
  ) => {
    event.preventDefault();
    setCommentStatus("");
    setCommentError("");
    if (!hasSession) {
      setCommentError(t("detail.notices.signInToEditComment"));
      return;
    }
    const body = commentEditDraft.trim();
    if (body.length < 2 || body.length > 5000) {
      setCommentError(t("detail.notices.commentLength"));
      return;
    }
    setCommentBusyKey(`edit-comment-${commentId}`);
    try {
      await updateComment({ commentId, body });
      if (question) {
        await reloadQuestionThread();
      } else {
        await reloadPostThread();
      }
      setEditingCommentId(null);
      setCommentEditDraft("");
      setCommentStatus(t("detail.notices.commentUpdated"));
    } catch (editFailure) {
      if (isAuthenticationFailure(editFailure)) {
        setHasSession(false);
      }
      setCommentError(
        localizedErrorMessage(editFailure, "comments.updateFailed"),
      );
    } finally {
      setCommentBusyKey("");
    }
  };

  const removeComment = async (commentId: number) => {
    setCommentStatus("");
    setCommentError("");
    if (!hasSession) {
      setCommentError(t("detail.notices.signInToDeleteComment"));
      return;
    }
    if (commentDeleteConfirmId !== commentId) {
      setCommentDeleteConfirmId(commentId);
      setCommentStatus(t("detail.notices.confirmCommentDelete"));
      return;
    }
    setCommentBusyKey(`delete-comment-${commentId}`);
    try {
      await deleteComment(commentId);
      if (question) {
        await reloadQuestionThread();
      } else {
        await reloadPostThread();
      }
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setCommentEditDraft("");
      }
      setCommentDeleteConfirmId(null);
      setCommentStatus(t("detail.notices.commentDeleted"));
    } catch (deleteFailure) {
      if (isAuthenticationFailure(deleteFailure)) {
        setHasSession(false);
      }
      setCommentError(
        localizedErrorMessage(deleteFailure, "comments.deleteFailed"),
      );
    } finally {
      setCommentBusyKey("");
    }
  };

  const openReport = (target: ReportTarget) => {
    setReportTarget(target);
    setReportStatus("");
  };

  const runVote = async (
    targetType: VoteTargetType,
    targetId: number,
    direction: VoteDirection,
    fallbackCount: number,
    fallbackStatus = "none",
  ) => {
    setVoteError("");
    if (!hasSession) {
      setVoteError(t("detail.notices.signInToVote"));
      return;
    }
    const key = voteKey(targetType, targetId);
    const current = voteStates[key] || {
      count: fallbackCount,
      status: fallbackStatus,
    };
    setVoteBusyKey(`${key}:${direction}`);
    try {
      const result = await postAnswerStyleVote({
        objectId: targetId,
        objectType: targetType,
        type: direction,
        isCancel: current.status === direction,
      });
      setVoteStates((snapshots) => ({
        ...snapshots,
        [key]: {
          count: result.votes,
          status: result.vote_status,
          upCount: result.up_votes,
          downCount: result.down_votes,
        },
      }));
    } catch (voteFailure) {
      if (isAuthenticationFailure(voteFailure)) {
        setHasSession(false);
      }
      setVoteError(localizedErrorMessage(voteFailure, "comments.voteFailed"));
    } finally {
      setVoteBusyKey("");
    }
  };

  const toggleReaction = async (reaction: ReactionItem) => {
    setReactionError("");
    if (!post) return;
    if (!hasSession) {
      setReactionError(t("detail.notices.signInToReact"));
      return;
    }
    setReactionBusyKey(reaction.emoji);
    try {
      const result = await updateReaction({
        object_id: post.slug || post.id,
        object_type: reportTypeForPost(post.type),
        emoji: reaction.emoji as "heart" | "smile" | "frown",
        reaction: reaction.is_active ? "deactivate" : "activate",
      });
      setReactions(result.reaction_summary);
      if (post.likeSource === "reaction" && reaction.emoji === "heart") {
        const heart = result.reaction_summary.find((item) => item.emoji === "heart");
        setLikeActive(Boolean(heart?.is_active));
        setLikeCount(heart?.count ?? 0);
      }
      if (isDynamicDetail && reaction.emoji === "heart") {
        const users = await queryReactionUsers({
          objectId: post.slug || post.id,
          objectType: reportTypeForPost(post.type),
          emoji: "heart",
          limit: 1000,
        });
        setDynamicLikeUsers(users.items);
        setDynamicLikeUserCount(users.count);
      }
    } catch (reactionFailure) {
      if (isAuthenticationFailure(reactionFailure)) {
        setHasSession(false);
      }
      setReactionError(
        localizedErrorMessage(reactionFailure, "home.reactionFailed"),
      );
    } finally {
      setReactionBusyKey("");
    }
  };

  const renderVoteControls = (
    targetType: VoteTargetType,
    targetId: number,
    fallbackCount: number,
    label: string,
    compact = false,
  ) => {
    const current = voteSnapshot(targetType, targetId, fallbackCount);
    const key = voteKey(targetType, targetId);
    return (
      <div
        className={compact ? "vote-controls compact" : "vote-controls"}
        aria-label={t("detail.votes.label", { target: label })}
      >
        <AnimateButton
          unstyled
          type="button"
          className={current.status === "up" ? "active" : ""}
          disabled={Boolean(voteBusyKey)}
          onClick={() =>
            void runVote(targetType, targetId, "up", fallbackCount)
          }
          title={t("detail.votes.upvote")}
        >
          <Icon name="caret-up-fill" />
        </AnimateButton>
        <strong>{current.count}</strong>
        <AnimateButton
          unstyled
          type="button"
          className={current.status === "down" ? "active down" : ""}
          disabled={Boolean(voteBusyKey)}
          onClick={() =>
            void runVote(targetType, targetId, "down", fallbackCount)
          }
          title={t("detail.votes.downvote")}
        >
          <Icon name="caret-down-fill" />
        </AnimateButton>
        {!compact ? (
          <span>
            {voteBusyKey.startsWith(`${key}:`)
              ? t("detail.common.syncing")
              : label}
          </span>
        ) : null}
      </div>
    );
  };

  const renderCommentVoteControls = (comment: CommentSummary) => {
    const key = voteKey("comment", comment.id);
    const current = voteStates[key] || {
      count: comment.voteCount,
      status: comment.viewerVoteStatus,
      upCount: comment.upVoteCount,
      downCount: comment.downVoteCount,
    };
    const upCount = current.upCount ?? comment.upVoteCount;
    const downCount = current.downCount ?? comment.downVoteCount;
    const busy = voteBusyKey.startsWith(`${key}:`);
    return (
      <ContentCommentVotes
        upCount={upCount}
        downCount={downCount}
        status={
          current.status === "up" || current.status === "down"
            ? current.status
            : "none"
        }
        disabled={busy}
        onVote={(direction) =>
          void runVote(
            "comment",
            comment.id,
            direction,
            comment.voteCount,
            comment.viewerVoteStatus,
          )
        }
      />
    );
  };

  const renderReactionBar = (compact = false, actions: ReactNode = null) => {
    if (!post) return null;
    const items = reactions.length
      ? reactions
      : ["heart", "smile", "frown"].map((emoji) => ({
          emoji,
          count: 0,
          tooltip: "",
          is_active: false,
        }));
    const reactionButtons = items.map((reaction) => {
      const label = t(`detail.reactions.types.${reaction.emoji}`, {
        defaultValue: reaction.emoji,
      });
      return (
        <AnimateButton
          unstyled
          type="button"
          className={reaction.is_active ? "active" : ""}
          disabled={Boolean(reactionBusyKey)}
          aria-label={t("detail.reactions.action", {
            label,
            count: reaction.count,
            displayCount: formatNumber(locale, reaction.count),
            state: reaction.is_active
              ? t("detail.reactions.selectedState")
              : "",
          })}
          onClick={() => void toggleReaction(reaction)}
          key={reaction.emoji}
        >
          <Icon name={reactionIconClass[reaction.emoji] || "circle"} />
          <strong>{reaction.count}</strong>
        </AnimateButton>
      );
    });
    return (
      <section
        className={
          compact ? "reaction-strip side-reaction-strip" : "reaction-strip"
        }
        aria-label={t("detail.reactions.label")}
      >
        <span className="visually-hidden" aria-live="polite">
          {reactionLoading
            ? t("detail.reactions.syncing")
            : t("detail.reactions.total", {
                count: items.reduce((total, item) => total + item.count, 0),
                displayCount: formatNumber(
                  locale,
                  items.reduce((total, item) => total + item.count, 0),
                ),
              })}
        </span>
        {actions ? (
          <div className="reaction-action-row">
            <div className="reaction-list">{reactionButtons}</div>
            {actions}
          </div>
        ) : (
          <div className="reaction-list">{reactionButtons}</div>
        )}
      </section>
    );
  };

  const renderCommentList = (
    items: CommentSummary[],
    options: {
      floorMode?: boolean;
      floorOffset?: number;
      floorNumbers?: Map<number, number>;
      floorUnit?: string;
      ownerId?: string;
      ownerLabel?: string;
      ownerName?: string;
      replyActionLabel?: string;
      ownerPost?: PostDetail;
      replyTarget?: CommentTargetRef;
      childComments?: Map<number, CommentSummary[]>;
      nestedReplies?: boolean;
      replyPrefix?: string;
      topLevelReplyLabel?: string;
      depth?: number;
      blogTree?: boolean;
    } = {},
  ) => {
    const replyPrefix = options.replyPrefix || "";
    const topLevelReplyLabel =
      options.topLevelReplyLabel || t("detail.comments.reply");
    const depth = options.depth || 0;
    const renderCommentActions = (
      item: CommentSummary,
      floorNumber?: number,
      compact = false,
    ) => (
      <>
        {canManageComment(item) ? (
          <>
            <AnimateButton
              unstyled
              type="button"
              className="inline-report-button"
              disabled={Boolean(commentBusyKey)}
              onClick={() => startCommentEdit(item)}
            >
              {t("detail.common.edit")}
            </AnimateButton>
            <AnimateButton
              unstyled
              type="button"
              className={
                commentDeleteConfirmId === item.id
                  ? "inline-report-button danger active"
                  : "inline-report-button danger"
              }
              disabled={Boolean(commentBusyKey)}
              onClick={() => void removeComment(item.id)}
            >
              {commentBusyKey === `delete-comment-${item.id}`
                ? t("detail.common.deleting")
                : commentDeleteConfirmId === item.id
                  ? t("detail.common.confirmDelete")
                  : t("detail.common.delete")}
            </AnimateButton>
          </>
        ) : null}
        {(options.floorMode || options.nestedReplies || options.blogTree) &&
        floorNumber ? (
          <AnimateButton
            unstyled
            type="button"
            className="inline-report-button floor-reply-button"
            disabled={Boolean(commentBusyKey)}
            onClick={() =>
              replyToCommentFloor(
                item,
                options.blogTree ? undefined : floorNumber,
                options.replyTarget,
                options.blogTree ? item.parentId || item.id : undefined,
              )
            }
          >
            <Icon name="reply" />
            {options.replyActionLabel || t("detail.comments.reply")}
          </AnimateButton>
        ) : null}
        <AnimateButton
          unstyled
          type="button"
          className="inline-report-button"
          onClick={() =>
            void openReport({
              targetType: "comment",
              objectId: item.id,
              title:
                item.body.slice(0, 48) ||
                t("detail.comments.reportTitle", {
                  id: formatNumber(locale, item.id),
                }),
            })
          }
        >
          {t("detail.common.report")}
        </AnimateButton>
      </>
    );

    const renderReplyReference = (item: CommentSummary) => {
      if (!item.replyToCommentId || !item.replyToAuthor) return null;
      const excerpt = (item.replyToBody || "").replace(/\s+/g, " ").trim();
      return (
        <AnimateButton
          unstyled
          type="button"
          className="floor-reply-reference"
          onClick={() => jumpToComment(item.replyToCommentId || 0)}
        >
          <span>
            {replyPrefix}@{item.replyToAuthor}
          </span>
          {excerpt ? <small>{excerpt.slice(0, 72)}</small> : null}
        </AnimateButton>
      );
    };

    const renderCommentControls = (
      item: CommentSummary,
      floorNumber?: number,
      compact = false,
    ) => (
      <>
        {renderVoteControls(
          "comment",
          item.id,
          item.voteCount,
          t("detail.comments.voteLabel"),
          true,
        )}
        {renderCommentActions(item, floorNumber, compact)}
      </>
    );

    if (!items.length) {
      if (options.nestedReplies && options.replyTarget) {
        return null;
      }
      return <div className="state-strip">{t("comments.empty")}</div>;
    }

    const renderBranch = (
      item: CommentSummary,
      index: number,
      depth: number,
      childMap: Map<number, CommentSummary[]>,
      floorNumber?: number,
    ): React.ReactNode => {
      const isOwner =
        (options.ownerPost && isPostOwnerComment(options.ownerPost, item)) ||
        sameUserId(item.authorUid || item.authorId, options.ownerId) ||
        (!item.authorId && item.author === options.ownerName);
      const isDynamicAuthor =
        options.nestedReplies &&
        post &&
        sameUserId(
          item.authorUid || item.authorId,
          post.authorUid || post.authorId,
        );
      const replyChildren = childMap.get(item.id) || [];
      const canShowChildren = replyChildren.length > 0;
      const branchFloorNumber =
        floorNumber ??
        options.floorNumbers?.get(item.id) ??
        index + (options.floorOffset || 1);
      const showFloorRail = Boolean(options.floorMode && depth === 0);
      const replyLabel = topLevelReplyLabel;

      return (
        <article
          id={`comment-${item.id}`}
          className={
            showFloorRail && isOwner
              ? "forum-floor owner-floor"
              : showFloorRail
                ? "forum-floor"
                : undefined
          }
          key={item.id}
        >
          {showFloorRail ? (
            <aside className="forum-floor-rail">
              <span className="floor-badge">
                {formatNumber(locale, branchFloorNumber)} {options.floorUnit || t("detail.comments.floor")}
              </span>
            </aside>
          ) : null}
          <div className="forum-floor-body">
            <div className="comment-meta">
              <UserIdentity
                name={item.author}
                userId={
                  authorProfileId(item.authorId, item.authorUid) || item.author
                }
                imageUrl={avatarFromMap(
                  item.author,
                  item.authorAvatar,
                  authorAvatars,
                )}
                rank={rankFromMap(item.author, item.authorRank, authorProfiles)}
                size={showFloorRail ? "md" : undefined}
                variant={showFloorRail ? "prominent" : "default"}
              />
              {showFloorRail && isOwner ? (
                <span className="owner-badge">
                  {options.ownerLabel || t("detail.comments.owner")}
                </span>
              ) : null}
              {isDynamicAuthor ? (
                <span className="dynamic-author-badge">
                  {t("comments.author")}
                </span>
              ) : null}
              <span data-author={item.author}>
                {dateLabel(item.createdAt, locale)}
              </span>
              {!options.nestedReplies
                ? renderCommentControls(item, branchFloorNumber)
                : null}
            </div>
            {editingCommentId === item.id ? (
              <Form
                className="comment-edit-form"
                onSubmit={(event) => void saveCommentEdit(event, item.id)}
              >
                <Form.Group controlId={`comment-edit-${item.id}`}>
                  <Form.Label>{t("detail.comments.edit")}</Form.Label>
                  <CodeMirrorEditor
                    id={`comment-edit-${item.id}`}
                    value={commentEditDraft}
                    minHeight="104px"
                    ariaLabel={t("detail.comments.editAria", {
                      id: formatNumber(locale, item.id),
                    })}
                    placeholder=""
                    onReady={(handle) =>
                      registerCommentEditor(`edit-comment-${item.id}`, handle)
                    }
                    onSelectionChange={(selection) =>
                      updateCommentEditorSelection(
                        `edit-comment-${item.id}`,
                        commentEditDraft,
                        selection,
                      )
                    }
                    onChange={(nextValue) => {
                      setCommentEditDraft(nextValue);
                      updateMentionQuery(
                        `edit-comment-${item.id}`,
                        nextValue,
                        commentEditorRefs.current[
                          `edit-comment-${item.id}`
                        ]?.getSelection() ||
                          ({
                            from: nextValue.length,
                            to: nextValue.length,
                          } satisfies CodeMirrorSelection),
                      );
                    }}
                  />
                  {renderMentionSuggestions(`edit-comment-${item.id}`)}
                </Form.Group>
                {commentEditDraft.trim() ? (
                  <div className="math-preview compact">
                    <MathText text={commentEditDraft} />
                  </div>
                ) : null}
                <div className="comment-form-actions">
                  <div className="comment-form-tools">
                    <span>
                      {formatNumber(locale, commentEditDraft.trim().length)} /{" "}
                      {formatNumber(locale, 5000)}
                    </span>
                    <RinStickerPicker
                      disabled={Boolean(commentBusyKey)}
                      onSelect={appendCommentEditSticker}
                    />
                  </div>
                  <AnimateButton
                    unstyled
                    type="button"
                    className="answer-resolution-action"
                    disabled={Boolean(commentBusyKey)}
                    onClick={cancelCommentEdit}
                  >
                    {t("detail.common.cancel")}
                  </AnimateButton>
                  <Button
                    className="secondary-button"
                    type="submit"
                    disabled={
                      Boolean(commentBusyKey) ||
                      commentEditDraft.trim().length < 2 ||
                      commentEditDraft.trim().length > 5000
                    }
                  >
                    {commentBusyKey === `edit-comment-${item.id}`
                      ? t("detail.common.saving")
                      : t("detail.comments.save")}
                  </Button>
                </div>
              </Form>
            ) : (
              <>
                {options.nestedReplies ? null : renderReplyReference(item)}
                <MathText text={item.body} />
              </>
            )}
            {options.nestedReplies ? (
              <div className="dynamic-comment-actions">
                {renderCommentControls(item, branchFloorNumber)}
              </div>
            ) : null}
            {options.nestedReplies &&
            options.replyTarget &&
            inlineDynamicReplyTarget?.anchorCommentId === item.id ? (
              <div
                id={`dynamic-inline-reply-${item.id}`}
                className="dynamic-inline-reply"
              >
                {renderCommentForm(
                  options.replyTarget,
                  t("comments.replyTo", {
                    author: inlineDynamicReplyTarget.author,
                  }),
                  t("detail.comments.replyPlaceholder"),
                  {
                    className:
                      "dynamic-comment-composer dynamic-inline-reply-composer",
                    formId: `dynamic-inline-reply-form-${item.id}`,
                  },
                )}
              </div>
            ) : null}
            {canShowChildren ? (
              <div className="floor-child-replies">
                {renderCommentList(replyChildren, {
                  ...options,
                  blogTree: options.blogTree,
                  depth: depth + 1,
                  replyPrefix: `${replyLabel} `,
                  topLevelReplyLabel: replyLabel,
                  childComments: childMap,
                })}
              </div>
            ) : null}
          </div>
        </article>
      );
    };

    return (
      <div
        className={
          options.floorMode ? "comment-list forum-floor-list" : "comment-list"
        }
      >
        {items.map((item, index) => {
          const floorNumber =
            options.floorNumbers?.get(item.id) ??
            index + (options.floorOffset || 1);
          const childMap =
            options.childComments || new Map<number, CommentSummary[]>();
          return renderBranch(item, index, depth, childMap, floorNumber);
        })}
      </div>
    );
  };

  const renderContentCommentEditForm = (item: CommentSummary) => (
    <Form
      className="comment-edit-form content-comment-edit-form"
      onSubmit={(event) => void saveCommentEdit(event, item.id)}
    >
      <Form.Group controlId={`comment-edit-${item.id}`}>
        <Form.Label className="visually-hidden">
          {t("detail.comments.edit")}
        </Form.Label>
        <CodeMirrorEditor
          id={`comment-edit-${item.id}`}
          value={commentEditDraft}
          minHeight="96px"
          ariaLabel={t("detail.comments.editAria", {
            id: formatNumber(locale, item.id),
          })}
          placeholder=""
          preferPlainTextPaste
          showLineNumbers={false}
          submitOnEnter={false}
          onReady={(handle) =>
            registerCommentEditor(`edit-comment-${item.id}`, handle)
          }
          onSelectionChange={(selection) =>
            updateCommentEditorSelection(
              `edit-comment-${item.id}`,
              commentEditDraft,
              selection,
            )
          }
          onChange={(nextValue) => {
            setCommentEditDraft(nextValue);
            updateMentionQuery(
              `edit-comment-${item.id}`,
              nextValue,
              commentEditorRefs.current[
                `edit-comment-${item.id}`
              ]?.getSelection() ||
                ({
                  from: nextValue.length,
                  to: nextValue.length,
                } satisfies CodeMirrorSelection),
            );
          }}
        />
        {renderMentionSuggestions(`edit-comment-${item.id}`)}
      </Form.Group>
      <div className="comment-form-actions">
        <div className="comment-form-tools">
          {commentEditDraft.trim().length >= 4500 ? (
            <span>
              {formatNumber(locale, commentEditDraft.trim().length)} /{" "}
              {formatNumber(locale, 5000)}
            </span>
          ) : null}
          <RinStickerPicker
            disabled={Boolean(commentBusyKey)}
            onSelect={appendCommentEditSticker}
          />
        </div>
        <AnimateButton
          unstyled
          type="button"
          className="content-comment-cancel"
          disabled={Boolean(commentBusyKey)}
          onClick={cancelCommentEdit}
        >
          {t("detail.common.cancel")}
        </AnimateButton>
        <Button
          className="secondary-button"
          type="submit"
          disabled={
            Boolean(commentBusyKey) ||
            commentEditDraft.trim().length < 2 ||
            commentEditDraft.trim().length > 5000
          }
        >
          {commentBusyKey === `edit-comment-${item.id}`
            ? t("detail.common.saving")
            : t("detail.common.save")}
        </Button>
      </div>
    </Form>
  );

  const renderContentCommentMoreMenu = (item: CommentSummary) => (
    <ContentCommentMoreMenu
      actions={[
        ...(canManageComment(item)
          ? [
              {
                key: "edit",
                label: t("detail.common.edit"),
                disabled: Boolean(commentBusyKey),
                onSelect: () => startCommentEdit(item),
              },
              {
                key: "delete",
                label:
                  commentBusyKey === `delete-comment-${item.id}`
                    ? t("detail.common.deleting")
                    : commentDeleteConfirmId === item.id
                      ? t("detail.common.confirmDelete")
                      : t("detail.common.delete"),
                disabled: Boolean(commentBusyKey),
                dangerous: true,
                onSelect: () => void removeComment(item.id),
              },
            ]
          : []),
        {
          key: "report",
          label: t("detail.common.report"),
          onSelect: () =>
            void openReport({
              targetType: "comment",
              objectId: item.id,
              title:
                item.body.slice(0, 48) ||
                t("detail.comments.reportTitle", {
                  id: formatNumber(locale, item.id),
                }),
            }),
        },
      ]}
    />
  );

  const renderContentCommentList = (
    items: CommentSummary[],
    childMap: Map<number, CommentSummary[]>,
    target: CommentTargetRef,
  ) => {
    return (
      <ContentCommentThreadList
        threads={items.map((item) => ({
          root: item,
          replies: childMap.get(item.id) || [],
        }))}
        canReply={!commentBusyKey}
        resolveIdentity={(item) => ({
          userId:
            authorProfileId(item.authorId, item.authorUid) || item.author,
          imageUrl: avatarFromMap(
            item.author,
            item.authorAvatar,
            authorAvatars,
          ),
          rank: rankFromMap(item.author, item.authorRank, authorProfiles),
        })}
        isAuthor={(item) => Boolean(post && isPostOwnerComment(post, item))}
        isEditing={(item) => editingCommentId === item.id}
        renderEditForm={renderContentCommentEditForm}
        renderMoreMenu={renderContentCommentMoreMenu}
        renderVotes={renderCommentVoteControls}
        isRepliesExpanded={(rootId) =>
          Boolean(expandedContentReplyGroups[rootId])
        }
        onToggleReplies={(rootId) =>
          setExpandedContentReplyGroups((current) => ({
            ...current,
            [rootId]: !current[rootId],
          }))
        }
        onReply={(item, rootId) =>
          replyToCommentFloor(item, undefined, target, rootId)
        }
        onJumpToComment={jumpToComment}
      />
    );
  };

  const renderDiscussionReplyToolbar = () => {
    if (!post) return null;
    const replyAllLabel = t(
      isAnnouncementDetail
        ? "detail.discussion.allResponses"
        : "detail.discussion.allReplies",
    );
    const ownerOnlyLabel = t(
      isAnnouncementDetail
        ? "detail.discussion.publisher"
        : "detail.discussion.ownerOnly",
    );
    const sortLabel = t(
      isAnnouncementDetail
        ? "detail.discussion.responseSort"
        : "detail.discussion.floorSort",
    );
    const toolbarLabel = t(
      isAnnouncementDetail
        ? "detail.discussion.responseFilter"
        : "detail.discussion.replyFilter",
    );
    const viewOptions: Array<{
      value: DiscussionReplyView;
      label: string;
      count: number;
      icon: string;
    }> = [
      {
        value: "all",
        label: replyAllLabel,
        count: topLevelPostComments.length,
        icon: "chat-square-text",
      },
      {
        value: "owner",
        label: ownerOnlyLabel,
        count: discussionOwnerComments.length,
        icon: "person-lines-fill",
      },
    ];
    return (
      <div className="discussion-reply-toolbar" aria-label={toolbarLabel}>
        <div className="discussion-reply-tabs" role="tablist">
          {viewOptions.map((option) => (
            <AnimateButton
              unstyled
              type="button"
              className={discussionReplyView === option.value ? "active" : ""}
              onClick={() => setDiscussionReplyView(option.value)}
              key={option.value}
            >
              <Icon name={option.icon as IconName} />
              <span>{option.label}</span>
              <strong>{formatNumber(locale, option.count)}</strong>
            </AnimateButton>
          ))}
        </div>
        <div className="discussion-sort-tabs" aria-label={sortLabel}>
          <AnimateButton
            unstyled
            type="button"
            className={discussionReplyOrder === "hot" ? "active" : ""}
            onClick={() => setDiscussionReplyOrder("hot")}
          >
            <Icon name="fire" />
            {t("detail.sort.hot")}
            <strong>{formatNumber(locale, hotDiscussionCount)}</strong>
          </AnimateButton>
          <AnimateButton
            unstyled
            type="button"
            className={discussionReplyOrder === "asc" ? "active" : ""}
            onClick={() => setDiscussionReplyOrder("asc")}
          >
            <Icon name="sort-numeric-down" />
            {t("detail.sort.asc")}
          </AnimateButton>
          <AnimateButton
            unstyled
            type="button"
            className={discussionReplyOrder === "desc" ? "active" : ""}
            onClick={() => setDiscussionReplyOrder("desc")}
          >
            <Icon name="sort-numeric-up-alt" />
            {t("detail.sort.desc")}
          </AnimateButton>
        </div>
      </div>
    );
  };

  const renderDynamicCommentToolbar = () => (
    <div
      className="discussion-sort-tabs dynamic-comment-toolbar"
      aria-label={t("detail.comments.sortLabel")}
    >
      <AnimateButton
        unstyled
        type="button"
        className={dynamicCommentOrder === "hot" ? "active" : ""}
        onClick={() => setDynamicCommentOrder("hot")}
      >
        <Icon name="fire" />
        {t("detail.sort.hot")}
        <strong>{formatNumber(locale, hotDynamicCommentCount)}</strong>
      </AnimateButton>
      <AnimateButton
        unstyled
        type="button"
        className={dynamicCommentOrder === "asc" ? "active" : ""}
        onClick={() => setDynamicCommentOrder("asc")}
      >
        <Icon name="sort-numeric-down" />
        {t("detail.sort.asc")}
      </AnimateButton>
      <AnimateButton
        unstyled
        type="button"
        className={dynamicCommentOrder === "desc" ? "active" : ""}
        onClick={() => setDynamicCommentOrder("desc")}
      >
        <Icon name="sort-numeric-up-alt" />
        {t("detail.sort.desc")}
      </AnimateButton>
    </div>
  );

  const renderDynamicInteractionTabs = () => (
    <div
      className="dynamic-interaction-tabs"
      aria-label={t("detail.dynamic.interactions")}
    >
      <AnimateButton
        unstyled
        type="button"
        className={dynamicInteractionTab === "comments" ? "active" : ""}
        onClick={() => {
          setDynamicInteractionTab("comments");
          setPendingDynamicCommentFocus(true);
        }}
      >
        <span>{t("detail.comments.title")}</span>
        <strong>{formatNumber(locale, postComments.length)}</strong>
      </AnimateButton>
      <AnimateButton
        unstyled
        type="button"
        className={dynamicInteractionTab === "reposts" ? "active" : ""}
        onClick={() => setDynamicInteractionTab("reposts")}
      >
        <span>{t("detail.dynamic.reposts")}</span>
        <strong>{formatNumber(locale, dynamicRepostCount)}</strong>
      </AnimateButton>
      <AnimateButton
        unstyled
        type="button"
        className={dynamicInteractionTab === "likes" ? "active" : ""}
        onClick={() => setDynamicInteractionTab("likes")}
      >
        <span>{t("detail.dynamic.likes")}</span>
        <strong>{formatNumber(locale, dynamicVisibleLikeCount)}</strong>
      </AnimateButton>
    </div>
  );

  const renderDynamicSocialProof = () => {
    if (!post || !isDynamicDetail) return null;
    const previewUsers = dynamicLikeUsers.slice(0, 5);
    const focusComments = () => {
      setDynamicInteractionTab("comments");
      requestAnimationFrame(() => {
        document.getElementById("content-comments")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
    };
    const openLikes = () => {
      setDynamicInteractionTab("likes");
      requestAnimationFrame(() => {
        document.getElementById("content-comments")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
    };
    const heart = dynamicHeartReaction || {
      emoji: "heart",
      count: 0,
      tooltip: "",
      is_active: false,
    };
    const openRepostComposer = () => {
      setRepostStatus("");
      setRepostError("");
      setReactionError("");
      if (!hasSession) {
        void copyDynamicLink();
        return;
      }
      setDynamicInteractionTab("reposts");
      setRepostComposerOpen(true);
      requestAnimationFrame(() => {
        document.getElementById("content-comments")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
    };
    return (
      <section
        className="dynamic-social-proof"
        aria-label={t("detail.dynamic.interactionSummary")}
      >
        <AnimateButton
          unstyled
          type="button"
          className="dynamic-social-proof-like"
          onClick={openLikes}
        >
          <span className="dynamic-social-proof-avatars" aria-hidden="true">
            {previewUsers.length ? (
              previewUsers.map((user) => (
                <span key={`${user.uid}-${user.reacted_at}`}>
                  <AvatarName
                    name={user.display_name}
                    imageUrl={user.avatar}
                    rank={user.rank}
                    size="sm"
                  />
                </span>
              ))
            ) : (
              <Icon name="hand-thumbs-up" />
            )}
          </span>
          <span>
            {dynamicLikeUsersLoading
              ? t("detail.dynamic.syncingLikes")
              : dynamicVisibleLikeCount > 0
                ? t("detail.dynamic.peopleLiked", {
                    count: dynamicVisibleLikeCount,
                    displayCount: formatNumber(
                      locale,
                      dynamicVisibleLikeCount,
                    ),
                  })
                : t("detail.dynamic.viewLikes")}
          </span>
        </AnimateButton>
        <div className="dynamic-social-proof-actions">
          <AnimateButton unstyled type="button" onClick={focusComments}>
            <Icon name="chat-dots" />
            <span>
              {t("detail.dynamic.commentCount", {
                count: postComments.length,
                displayCount: formatNumber(locale, postComments.length),
              })}
            </span>
          </AnimateButton>
          <AnimateButton
            unstyled
            type="button"
            className={dynamicIsLiked ? "active" : ""}
            disabled={Boolean(reactionBusyKey)}
            onClick={() => void toggleReaction(heart)}
          >
            <Icon
              name={dynamicIsLiked ? "hand-thumbs-up-fill" : "hand-thumbs-up"}
            />
            <span>
              {reactionBusyKey === "heart"
                ? t("detail.common.syncing")
                : t("detail.dynamic.likeCount", {
                    count: dynamicVisibleLikeCount,
                    displayCount: formatNumber(
                      locale,
                      dynamicVisibleLikeCount,
                    ),
                  })}
            </span>
          </AnimateButton>
          <AnimateButton
            unstyled
            type="button"
            disabled={repostBusy}
            onClick={openRepostComposer}
          >
            <Icon name="share" />
            <span>
              {repostBusy
                ? t("detail.dynamic.reposting")
                : t("detail.dynamic.repostCount", {
                    count: dynamicRepostCount,
                    displayCount: formatNumber(locale, dynamicRepostCount),
                  })}
            </span>
          </AnimateButton>
        </div>
      </section>
    );
  };

  const renderDynamicRepostUsers = () => (
    <div className="dynamic-repost-users">
      {dynamicRepostUsersLoading ? <LoadingState variant="compact" /> : null}

      {dynamicRepostUsers.length ? (
        <div className="dynamic-repost-user-list">
          {dynamicRepostUsers.map((user) => (
            <article
              className="dynamic-repost-user"
              key={`${user.post_id}-${user.uid}`}
            >
              <Link
                className="dynamic-repost-user-author"
                to={authorProfilePath(user.user_id, user.uid)}
                title={user.display_name}
              >
                <AvatarName
                  name={user.display_name}
                  imageUrl={user.avatar}
                  rank={user.rank}
                  size="md"
                />
              </Link>
              <div className="dynamic-repost-user-main">
                <div className="dynamic-repost-user-meta">
                  <Link to={authorProfilePath(user.user_id, user.uid)}>
                    <span>{user.display_name}</span>
                    <CultivationBadge rank={user.rank} />
                  </Link>
                  <span>{dateLabel(user.reposted_at, locale)}</span>
                </div>
                <Link
                  className="dynamic-repost-user-body"
                  to={`/s/${encodeURIComponent(user.post_slug || user.post_id)}`}
                >
                  {user.body ? (
                    <MathInline text={user.body} />
                  ) : (
                    t("detail.dynamic.viewRepost")
                  )}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderDynamicLikeUsers = () => (
    <div className="dynamic-like-users">
      {dynamicLikeUsersLoading ? <LoadingState variant="compact" /> : null}

      {dynamicLikeUsers.length ? (
        <div className="dynamic-like-user-grid">
          {dynamicLikeUsers.map((user) => (
            <Link
              className="dynamic-like-user"
              to={authorProfilePath(user.user_id, user.uid)}
              title={user.display_name}
              key={`${user.uid}-${user.reacted_at}`}
            >
              <AvatarName
                name={user.display_name}
                imageUrl={user.avatar}
                rank={user.rank}
                size="md"
              />
              <span className="dynamic-like-user-time">
                {dateLabel(user.reacted_at, locale)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderDynamicHotCommentPreview = () => {
    if (!post || !isDynamicDetail || !dynamicHotCommentPreview.length)
      return null;
    const target = {
      targetType: postCommentTarget(post),
      slug: post.slug || post.id,
    };
    return (
      <section
        className="dynamic-hot-comments"
        aria-label={t("detail.dynamic.hotCommentsPreview")}
      >
        <div className="dynamic-hot-comments-head">
          <div>
            <span>{t("detail.dynamic.hotComments")}</span>
            <strong>{formatNumber(locale, hotDynamicCommentCount)}</strong>
          </div>
          <div className="dynamic-hot-comments-tools">
            <AnimateButton
              unstyled
              type="button"
              onClick={() => {
                setDynamicInteractionTab("comments");
                setDynamicCommentOrder("hot");
                requestAnimationFrame(() => {
                  document.getElementById("content-comments")?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                });
              }}
            >
              {t("detail.dynamic.hotFirst")}
            </AnimateButton>
            <AnimateButton
              unstyled
              type="button"
              onClick={() => {
                setDynamicInteractionTab("comments");
                setDynamicCommentOrder("asc");
                requestAnimationFrame(() => {
                  document.getElementById("content-comments")?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                });
              }}
            >
              {t("detail.dynamic.allComments")}
              <Icon name="chevron-right" />
            </AnimateButton>
          </div>
        </div>
        <div className="dynamic-hot-comment-list">
          {dynamicHotCommentPreview.map((comment) => (
            <article className="dynamic-hot-comment" key={comment.id}>
              <Link
                className="dynamic-hot-comment-author identity-link"
                to={authorProfilePath(comment.authorId, comment.authorUid)}
              >
                <AvatarName
                  name={comment.author}
                  imageUrl={avatarFromMap(
                    comment.author,
                    comment.authorAvatar,
                    authorAvatars,
                  )}
                  rank={rankFromMap(
                    comment.author,
                    comment.authorRank,
                    authorProfiles,
                  )}
                  size="sm"
                />
              </Link>
              <AnimateButton
                unstyled
                type="button"
                className="dynamic-hot-comment-body"
                onClick={() => jumpToComment(comment.id)}
              >
                <span data-author={comment.author}>
                  {dateLabel(comment.createdAt, locale)}
                </span>
                <MathText text={comment.body} />
              </AnimateButton>
              <div className="dynamic-hot-comment-actions">
                <span>
                  <Icon name="hand-thumbs-up" />
                  {comment.voteCount}
                </span>
                <AnimateButton
                  unstyled
                  type="button"
                  onClick={() => replyToCommentFloor(comment, 1, target)}
                >
                  {t("detail.comments.reply")}
                </AnimateButton>
                <AnimateButton
                  unstyled
                  type="button"
                  onClick={() => jumpToComment(comment.id)}
                >
                  {t("detail.dynamic.viewOriginalComment")}
                </AnimateButton>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  };

  const renderDynamicImages = () => {
    if (!post || !isDynamicDetail || !post.images?.length) return null;
    const images = post.images.slice(0, 9);
    return (
      <div className={`dynamic-detail-images image-count-${images.length}`}>
        {images.map((image, index) => (
          <AnimateButton
            unstyled
            type="button"
            onClick={() => {
              setDynamicImageViewerScale(1);
              setDynamicImageViewerIndex(index);
            }}
            key={`${image}-${index}`}
          >
            <img
              src={image}
              alt={t("detail.dynamic.imageAlt", {
                index: formatNumber(locale, index + 1),
              })}
              loading="lazy"
            />
          </AnimateButton>
        ))}
      </div>
    );
  };

  const renderDynamicImageViewer = () => {
    if (
      !post ||
      !isDynamicDetail ||
      !post.images?.length ||
      dynamicImageViewerIndex === null
    ) {
      return null;
    }
    const images = post.images.slice(0, 9);
    const image = images[dynamicImageViewerIndex];
    if (!image) return null;
    const closeViewer = () => {
      setDynamicImageViewerScale(1);
      setDynamicImageViewerIndex(null);
    };
    const go = (direction: -1 | 1) => {
      setDynamicImageViewerScale(1);
      setDynamicImageViewerIndex((current) => {
        if (current === null) return current;
        return (current + direction + images.length) % images.length;
      });
    };
    const zoom = (delta: number) => {
      setDynamicImageViewerScale((current) =>
        Math.min(3, Math.max(1, Number((current + delta).toFixed(2)))),
      );
    };
    const toggleZoom = () => {
      setDynamicImageViewerScale((current) => (current > 1 ? 1 : 2));
    };
    const endDrag = (
      target: EventTarget | null,
      endX?: number,
      endY?: number,
    ) => {
      const activeDrag = dynamicImageDragRef.current;
      if (
        activeDrag &&
        target instanceof HTMLElement &&
        target.hasPointerCapture(activeDrag.pointerId)
      ) {
        target.releasePointerCapture(activeDrag.pointerId);
      }
      if (target instanceof HTMLElement) {
        target.classList.remove("is-dragging");
        target.classList.remove("is-swiping");
      }
      if (
        activeDrag?.mode === "swipe" &&
        typeof endX === "number" &&
        typeof endY === "number"
      ) {
        const deltaX = endX - activeDrag.startX;
        const deltaY = endY - activeDrag.startY;
        if (deltaY > 72 && deltaY > Math.abs(deltaX) * 1.35) {
          closeViewer();
        } else if (
          images.length > 1 &&
          Math.abs(deltaX) > 54 &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.4
        ) {
          go(deltaX < 0 ? 1 : -1);
        }
      }
      dynamicImageDragRef.current = null;
    };
    return (
      <div
        className="dynamic-image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={t("detail.dynamic.imageViewer")}
      >
        <AnimateButton
          unstyled
          type="button"
          className="dynamic-image-viewer-backdrop"
          aria-label={t("detail.dynamic.closeImageViewer")}
          onClick={closeViewer}
        />
        <div className="dynamic-image-viewer-topbar">
          <span>
            {formatNumber(locale, dynamicImageViewerIndex + 1)} /{" "}
            {formatNumber(locale, images.length)}
          </span>
          <div
            className="dynamic-image-viewer-zoom"
            aria-label={t("detail.dynamic.imageZoom")}
          >
            <AnimateButton
              unstyled
              type="button"
              aria-label={t("detail.dynamic.zoomOut")}
              disabled={dynamicImageViewerScale <= 1}
              onClick={() => zoom(-0.25)}
            >
              <Icon name="dash-lg" />
            </AnimateButton>
            <strong>{Math.round(dynamicImageViewerScale * 100)}%</strong>
            <AnimateButton
              unstyled
              type="button"
              aria-label={t("detail.dynamic.zoomIn")}
              disabled={dynamicImageViewerScale >= 3}
              onClick={() => zoom(0.25)}
            >
              <Icon name="plus-lg" />
            </AnimateButton>
            <AnimateButton
              unstyled
              type="button"
              aria-label={t("detail.dynamic.resetZoom")}
              disabled={dynamicImageViewerScale === 1}
              onClick={() => setDynamicImageViewerScale(1)}
            >
              <Icon name="aspect-ratio" />
            </AnimateButton>
          </div>
          <a href={image} target="_blank" rel="noreferrer">
            {t("detail.dynamic.originalImage")}
          </a>
          <AnimateButton unstyled type="button" onClick={closeViewer}>
            <Icon name="x-lg" />
            {t("detail.common.close")}
          </AnimateButton>
        </div>
        {images.length > 1 ? (
          <AnimateButton
            unstyled
            type="button"
            className="dynamic-image-viewer-nav prev"
            aria-label={t("detail.dynamic.previousImage")}
            onClick={() => go(-1)}
          >
            <Icon name="chevron-left" />
          </AnimateButton>
        ) : null}
        <div
          className={
            dynamicImageViewerScale > 1
              ? "dynamic-image-viewer-stage is-zoomed"
              : "dynamic-image-viewer-stage"
          }
          onDoubleClick={toggleZoom}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const stage = event.currentTarget;
            if (dynamicImageViewerScale <= 1) {
              dynamicImageDragRef.current = {
                mode: "swipe",
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                scrollLeft: 0,
                scrollTop: 0,
              };
              stage.setPointerCapture(event.pointerId);
              return;
            }
            dynamicImageDragRef.current = {
              mode: "pan",
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              scrollLeft: stage.scrollLeft,
              scrollTop: stage.scrollTop,
            };
            stage.setPointerCapture(event.pointerId);
            stage.classList.add("is-dragging");
          }}
          onPointerMove={(event) => {
            const activeDrag = dynamicImageDragRef.current;
            if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
            event.preventDefault();
            if (activeDrag.mode === "swipe") {
              const deltaX = event.clientX - activeDrag.startX;
              const deltaY = event.clientY - activeDrag.startY;
              if (
                (Math.abs(deltaX) > 12 &&
                  Math.abs(deltaX) > Math.abs(deltaY)) ||
                (deltaY > 14 && deltaY > Math.abs(deltaX))
              ) {
                event.currentTarget.classList.add("is-swiping");
              }
              return;
            }
            const stage = event.currentTarget;
            stage.scrollLeft =
              activeDrag.scrollLeft - (event.clientX - activeDrag.startX);
            stage.scrollTop =
              activeDrag.scrollTop - (event.clientY - activeDrag.startY);
          }}
          onPointerUp={(event) =>
            endDrag(event.currentTarget, event.clientX, event.clientY)
          }
          onPointerCancel={(event) => endDrag(event.currentTarget)}
          onPointerLeave={(event) =>
            endDrag(event.currentTarget, event.clientX, event.clientY)
          }
          onWheel={(event) => {
            event.preventDefault();
            zoom(event.deltaY < 0 ? 0.25 : -0.25);
          }}
        >
          <img
            src={image}
            alt={t("detail.dynamic.imageAlt", {
              index: formatNumber(locale, dynamicImageViewerIndex + 1),
            })}
            style={
              dynamicImageViewerScale > 1
                ? { width: `${dynamicImageViewerScale * 100}%` }
                : undefined
            }
          />
        </div>
        {images.length > 1 ? (
          <AnimateButton
            unstyled
            type="button"
            className="dynamic-image-viewer-nav next"
            aria-label={t("detail.dynamic.nextImage")}
            onClick={() => go(1)}
          >
            <Icon name="chevron-right" />
          </AnimateButton>
        ) : null}
        {images.length > 1 ? (
          <div
            className="dynamic-image-viewer-thumbs"
            aria-label={t("detail.dynamic.thumbnailNavigation")}
          >
            {images.map((thumb, index) => (
              <AnimateButton
                unstyled
                type="button"
                className={index === dynamicImageViewerIndex ? "active" : ""}
                aria-label={t("detail.dynamic.viewImage", {
                  index: formatNumber(locale, index + 1),
                })}
                onClick={() => {
                  setDynamicImageViewerScale(1);
                  setDynamicImageViewerIndex(index);
                }}
                key={`${thumb}-${index}`}
              >
                <img src={thumb} alt="" aria-hidden="true" loading="lazy" />
              </AnimateButton>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderDynamicRepostComposer = () => {
    if (!post || !isDynamicDetail || !repostComposerOpen) return null;
    return (
      <Form
        className="dynamic-repost-composer"
        onSubmit={(event) => void runDynamicRepost(event)}
      >
        <div className="dynamic-repost-head">
          <span>{t("detail.dynamic.repostUpdate")}</span>
          <div className="dynamic-repost-head-actions">
            <AnimateButton
              unstyled
              type="button"
              disabled={repostBusy}
              onClick={() => void copyDynamicLink()}
            >
              <Icon name="link-45deg" />
              {t("detail.dynamic.copyLink")}
            </AnimateButton>
            <AnimateButton
              unstyled
              type="button"
              disabled={repostBusy}
              onClick={() => {
                setRepostComposerOpen(false);
                setRepostDraft("");
              }}
            >
              {t("detail.common.cancel")}
            </AnimateButton>
          </div>
        </div>
        <CodeMirrorEditor
          id="dynamic-repost-body"
          value={repostDraft}
          minHeight="88px"
          ariaLabel={t("detail.dynamic.repostNote")}
          placeholder={t("detail.dynamic.repostPlaceholder")}
          onChange={setRepostDraft}
        />
        <div className="dynamic-repost-target">
          <Icon name="arrow-return-right" />
          <span>
            {t("detail.dynamic.originalUpdate")} ·{" "}
            <MathInline text={post.title || post.author} />
          </span>
        </div>
        <div className="dynamic-repost-actions">
          <span>
            {formatNumber(locale, repostDraft.trim().length)} /{" "}
            {formatNumber(locale, 2000)}
          </span>
          <Button
            className="secondary-button"
            type="submit"
            disabled={repostBusy || repostDraft.trim().length > 2000}
          >
            {repostBusy
              ? t("detail.dynamic.reposting")
              : t("detail.dynamic.repost")}
          </Button>
        </div>
      </Form>
    );
  };

  const renderCommentForm = (
    target: CommentTargetRef,
    label: string,
    placeholder = "",
    options: CommentFormOptions | string = {},
    legacyFormId?: string,
  ) => {
    const formOptions =
      typeof options === "string"
        ? { className: options, formId: legacyFormId }
        : options;
    const className = formOptions.className || "";
    const formId = formOptions.formId;
    const key = commentTargetKey(target);
    const editorKey = `${key}${formOptions.editorKeySuffix || ""}`;
    const value = commentDrafts[key] || "";
    const busy = commentBusyKey === key;
    const uploading = commentUploadBusyKey === key;
    const floorReplyDraft = floorReplyDrafts[key];
    const imageInputId = `comment-image-${editorKey.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    const isDynamicComposer = className
      .split(/\s+/)
      .includes("dynamic-comment-composer");
    const isContentComposer = Boolean(formOptions.contentComposer);
    const withAvatarComposer = Boolean(
      formOptions.withAvatar || isDynamicComposer || isContentComposer,
    );
    const avatarComposerRowClassName = [
      "comment-avatar-composer-row",
      isDynamicComposer ? "dynamic-comment-composer-row" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const avatarComposerMainClassName = [
      "comment-avatar-composer-main",
      isDynamicComposer ? "dynamic-comment-composer-main" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const currentUserName = detailCurrentUserName(
      currentUser,
      t("detail.comments.anonymousUser"),
      (suffix) => t("detail.comments.phoneUser", { suffix }),
    );
    const currentUserAvatar = detailCurrentUserAvatar(currentUser);
    if (isContentComposer && !hasSession) {
      return (
        <div className="content-comment-login">
          <Link className="secondary-button" to="/#login">
            {t("detail.comments.loginToComment")}
          </Link>
        </div>
      );
    }
    const formBody = (
      <>
        <Form.Group controlId={`comment-${editorKey}`}>
          {!isContentComposer ? <Form.Label>{label}</Form.Label> : null}
          {floorReplyDraft ? (
            <div className="floor-reply-context">
              <span>
                {t("detail.comments.replyContext", {
                  floor:
                    typeof floorReplyDraft.floorNumber === "number"
                      ? formatNumber(locale, floorReplyDraft.floorNumber)
                      : "",
                  unit:
                    formOptions.replyContextUnit ||
                    t("detail.comments.floor"),
                  author: floorReplyDraft.author,
                })}
              </span>
              <AnimateButton
                unstyled
                type="button"
                disabled={busy || uploading}
                onClick={() =>
                  setFloorReplyDrafts((current) => {
                    const next = { ...current };
                    delete next[key];
                    if (isDynamicComposer) {
                      setInlineDynamicReplyTarget(null);
                    }
                    return next;
                  })
                }
              >
                {t("detail.common.cancel")}
              </AnimateButton>
            </div>
          ) : null}
          <CodeMirrorEditor
            id={`comment-${editorKey}`}
            value={value}
            minHeight={isContentComposer ? "96px" : "112px"}
            ariaLabel={label}
            placeholder={placeholder}
            preferPlainTextPaste={isContentComposer}
            showLineNumbers={!isContentComposer}
            submitOnEnter={!isContentComposer}
            onReady={(handle) => registerCommentEditor(editorKey, handle)}
            onSelectionChange={(selection) =>
              updateCommentEditorSelection(editorKey, value, selection)
            }
            onChange={(nextValue) =>
              updateCommentDraft(key, nextValue, editorKey)
            }
          />
          {renderMentionSuggestions(editorKey)}
        </Form.Group>
        {!isContentComposer && value.trim() ? (
          <div className="math-preview compact">
            <MathText text={value} />
          </div>
        ) : null}
        <div className="comment-form-actions">
          <div className="comment-form-tools">
            {!isContentComposer || value.trim().length >= 4500 ? (
              <span>
                {formatNumber(locale, value.trim().length)} /{" "}
                {formatNumber(locale, 5000)}
              </span>
            ) : null}
            {hasSession ? (
              <>
                <RinStickerPicker
                  disabled={uploading || busy}
                  onSelect={(sticker) => appendCommentSticker(target, sticker)}
                />
                <label
                  className={
                    uploading || busy
                      ? "comment-image-button disabled"
                      : "comment-image-button"
                  }
                  htmlFor={imageInputId}
                >
                  <Icon name="image" />
                  {uploading
                    ? t("detail.comments.uploading")
                    : t("detail.comments.image")}
                </label>
                <input
                  id={imageInputId}
                  className="comment-image-input"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading || busy}
                  onChange={(event) => void uploadCommentImages(event, target)}
                />
              </>
            ) : null}
          </div>
          {hasSession ? (
            <Button
              className="secondary-button"
              type="submit"
              disabled={
                busy ||
                uploading ||
                value.trim().length < 2 ||
                value.trim().length > 5000
              }
            >
              {busy
                ? t("detail.common.publishing")
                : isContentComposer
                  ? t("detail.common.publish")
                  : t("detail.comments.submit")}
            </Button>
          ) : (
            <Link className="secondary-button" to="/#login">
              {t("detail.comments.loginToComment")}
            </Link>
          )}
        </div>
      </>
    );
    return (
      <Form
        id={
          formId ||
          (target.targetType === "discussion" || target.targetType === "dynamic"
            ? "content-comment-composer"
            : undefined)
        }
        className={["inline-comment-form", className].filter(Boolean).join(" ")}
        onSubmit={(event) => void submitComment(event, target)}
      >
        {withAvatarComposer ? (
          <div className={avatarComposerRowClassName}>
            <AvatarName
              name={currentUserName}
              imageUrl={currentUserAvatar}
              size="md"
            />
            <div className={avatarComposerMainClassName}>{formBody}</div>
          </div>
        ) : (
          formBody
        )}
      </Form>
    );
  };

  const renderUnifiedContentComments = () => {
    if (!post || !hasUnifiedContentComments) return null;
    const target: CommentTargetRef = {
      targetType: postCommentTarget(post),
      slug: post.slug || post.id,
    };
    const key = commentTargetKey(target);
    const draftPreview =
      (commentDrafts[key] || "").split("\n")[0]?.trim() || "";
    const commenterName = detailCurrentUserName(
      currentUser,
      t("detail.comments.anonymousUser"),
      (suffix) => t("detail.comments.phoneUser", { suffix }),
    );
    const commenterAvatar = detailCurrentUserAvatar(currentUser);
    return (
      <section
        ref={contentCommentSectionRef}
        className={
          showFloatingCommentComposer
            ? "content-comment-section has-floating-composer"
            : "content-comment-section"
        }
        id="comments"
      >
        <header className="content-comment-heading">
          <h2>
            {t("detail.comments.title")} {" "}
            <span>{formatNumber(locale, postComments.length)}</span>
          </h2>
          <AnimateTabs
            value={contentCommentOrder}
            onValueChange={(value) =>
              setContentCommentOrder(value === "latest" ? "latest" : "hot")
            }
          >
            <AnimateTabsList aria-label={t("detail.comments.sortLabel")}>
              <AnimateTabsTrigger value="hot">
                {t("detail.sort.hot")}
              </AnimateTabsTrigger>
              <AnimateTabsTrigger value="latest">
                {t("detail.sort.latest")}
              </AnimateTabsTrigger>
            </AnimateTabsList>
          </AnimateTabs>
        </header>
        <div
          ref={primaryCommentComposerRef}
          className="content-comment-primary-composer"
        >
          {renderCommentForm(target, t("detail.comments.title"), "", {
            className: "content-comment-composer",
            contentComposer: true,
            formId: "content-comment-composer",
          })}
        </div>
        {renderContentCommentList(
          contentVisibleComments,
          contentCommentChildren,
          target,
        )}
        {showFloatingCommentComposer ? (
          <aside
            className={
              floatingCommentComposerExpanded
                ? "content-comment-floating is-expanded"
                : "content-comment-floating"
            }
            aria-label={t("detail.comments.floatingEditor")}
            style={{
              bottom: floatingCommentComposerBottom,
              left: floatingCommentComposerBounds.left,
              width: floatingCommentComposerBounds.width,
            }}
          >
            {floatingCommentComposerExpanded ? (
              <>
                <div className="content-comment-floating-head">
                  <AnimateButton
                    unstyled
                    type="button"
                    aria-label={t("detail.comments.collapseFloatingEditor")}
                    onClick={() => setFloatingCommentComposerExpanded(false)}
                  >
                    <Icon name="x" />
                  </AnimateButton>
                </div>
                {renderCommentForm(
                  target,
                  t("detail.comments.title"),
                  "",
                  {
                  className:
                    "content-comment-composer content-comment-floating-form",
                  contentComposer: true,
                  editorKeySuffix: ":floating",
                  formId: "floating-comment-composer",
                  },
                )}
              </>
            ) : (
              <div className="content-comment-floating-collapsed">
                <AvatarName
                  name={commenterName}
                  imageUrl={commenterAvatar}
                  rank={currentUser?.rank}
                  size="sm"
                />
                <AnimateButton
                  unstyled
                  type="button"
                  className="content-comment-floating-entry"
                  aria-label={t("detail.comments.expandFloatingEditor")}
                  onClick={() => setFloatingCommentComposerExpanded(true)}
                >
                  <span>{draftPreview || "\u00a0"}</span>
                  <Icon name="pencil-square" />
                </AnimateButton>
              </div>
            )}
          </aside>
        ) : null}
      </section>
    );
  };

  const renderQnaCommentThread = (
    title: string,
    comments: CommentSummary[],
    target: CommentTargetRef,
    className = "",
    showAlerts = false,
  ) => {
    const key = commentTargetKey(target);
    const formOpen = Boolean(openCommentForms[key]);
    const listExpanded = Boolean(expandedCommentLists[key]);
    const previewLimit = 3;
    const visibleComments = listExpanded
      ? comments
      : comments.slice(0, previewLimit);
    const hiddenCount = Math.max(0, comments.length - visibleComments.length);

    return (
      <section
        className={["qna-comment-thread", className].filter(Boolean).join(" ")}
      >
        <div className="qna-comment-head">
          <div>
            <span>{title}</span>
            <strong>{comments.length}</strong>
          </div>
          <AnimateButton
            unstyled
            type="button"
            onClick={() =>
              setOpenCommentForms((current) => ({
                ...current,
                [key]: !formOpen,
              }))
            }
          >
            {formOpen
              ? t("detail.comments.collapseComposer")
              : t("detail.comments.add")}
          </AnimateButton>
        </div>

        {comments.length ? (
          <>
            {renderCommentList(visibleComments)}
            {hiddenCount > 0 ? (
              <AnimateButton
                unstyled
                type="button"
                className="qna-comment-more"
                onClick={() =>
                  setExpandedCommentLists((current) => ({
                    ...current,
                    [key]: true,
                  }))
                }
              >
                {t("detail.comments.showRemaining", {
                  count: hiddenCount,
                  displayCount: formatNumber(locale, hiddenCount),
                })}
              </AnimateButton>
            ) : null}
          </>
        ) : (
          <div className="qna-comment-empty">{t("comments.empty")}</div>
        )}
        {formOpen
          ? renderCommentForm(target, title, "", {
              className: "qna-comment-form",
            })
          : null}
      </section>
    );
  };

  const renderInvitePanel = () => {
    if (!question) return null;
    const invitedKeys = new Set(inviteUsers.map(inviteLookupKey));
    const rinInvited = inviteUsers.some(isRinInviteUser);
    const rinAnswered = question.answers.some(isRinAnswer);
    const canShowInviteCandidates =
      inviteQuery.trim().length >= 2 || isRinInviteQuery(inviteQuery);
    const visibleCandidates = inviteCandidates.filter(
      (candidate) => !invitedKeys.has(inviteLookupKey(candidate)),
    );
    return (
      <section className="panel question-invite-panel">
        <div className="panel-heading">
          <span>{t("detail.invites.title")}</span>
          <strong>
            {inviteLoading
              ? t("detail.common.syncing")
              : t("detail.invites.count", {
                  count: inviteUsers.length,
                  displayCount: formatNumber(locale, inviteUsers.length),
                })}
          </strong>
        </div>
        {inviteUsers.length ? (
          <div className="invite-user-list">
            {inviteUsers.map((user) => (
              <div className="invite-user-row" key={inviteLookupKey(user)}>
                <Link
                  className="identity-link"
                  to={profilePath(user.username || user.id)}
                >
                  <AvatarName
                    name={inviteIdentity(user)}
                    imageUrl={user.avatar}
                    rank={user.rank}
                  />
                </Link>
                {hasSession ? (
                  <AnimateButton
                    unstyled
                    type="button"
                    disabled={inviteSubmitting}
                    onClick={() => void removeInvite(user)}
                  >
                    {t("detail.invites.remove")}
                  </AnimateButton>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="state-strip compact">
            {t("detail.invites.empty")}
          </div>
        )}
        {rinInvited && !rinAnswered ? (
          <div className="state-strip compact">
            {t("detail.invites.rinPending")}
          </div>
        ) : null}
        {rinInvited && rinAnswered ? (
          <div className="state-strip compact">
            {t("detail.invites.rinAnswered")}
          </div>
        ) : null}

        {hasSession ? (
          <Form
            className="invite-search-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <Form.Group controlId="invite-user-search">
              <Form.Label>{t("detail.invites.search")}</Form.Label>
              <Form.Control
                value={inviteQuery}
                placeholder={t("detail.invites.searchPlaceholder")}
                maxLength={64}
                onChange={(event) => setInviteQuery(event.currentTarget.value)}
              />
            </Form.Group>
            {inviteSearching ? (
              <div className="state-strip compact">
                {t("detail.invites.searching")}
              </div>
            ) : null}
            {canShowInviteCandidates && !inviteSearching ? (
              visibleCandidates.length ? (
                <div className="invite-candidate-list">
                  {visibleCandidates.map((candidate) => (
                    <AnimateButton
                      unstyled
                      type="button"
                      key={inviteLookupKey(candidate)}
                      disabled={inviteSubmitting}
                      onClick={() => void inviteCandidate(candidate)}
                    >
                      <AvatarName
                        name={inviteIdentity(candidate)}
                        imageUrl={candidate.avatar}
                        rank={candidate.rank}
                      />
                      <span>
                        {t("detail.invites.candidateStats", {
                          answers: formatNumber(
                            locale,
                            candidate.answerCount ?? 0,
                          ),
                          questions: formatNumber(
                            locale,
                            candidate.questionCount ?? 0,
                          ),
                        })}
                      </span>
                    </AnimateButton>
                  ))}
                </div>
              ) : (
                <div className="state-strip compact">
                  {t("detail.invites.noCandidates")}
                </div>
              )
            ) : null}
          </Form>
        ) : (
          <Link className="collection-toggle" to="/#login">
            <Icon name="person-plus" />
            {t("detail.invites.loginToInvite")}
          </Link>
        )}
      </section>
    );
  };

  const renderReadingPanel = () => {
    if (!post || question || kind === "blog") return null;
    const reactionTotal = reactions.reduce(
      (total, item) => total + item.count,
      0,
    );
    return (
      <section className="panel detail-reading-panel">
        <div className="panel-heading">
          <span>{t("detail.reading.communityResponse")}</span>
          <strong>{t(`detail.type.${displayTypeClass(kind)}`)}</strong>
        </div>
        <Link
          className="detail-author-block identity-link"
          to={authorProfilePath(post.authorId, post.authorUid)}
        >
          <AvatarName
            name={post.author}
            imageUrl={avatarFromMap(
              post.author,
              post.authorAvatar,
              authorAvatars,
            )}
            rank={rankFromMap(post.author, post.authorRank, authorProfiles)}
          />
          <span>{t("detail.reading.viewMember")}</span>
        </Link>
        <dl className="detail-reading-stats">
          <div>
            <dt>{t("detail.reading.reads")}</dt>
            <dd>{formatNumber(locale, post.readCount)}</dd>
          </div>
          <div>
            <dt>{t("detail.comments.title")}</dt>
            <dd>{formatNumber(locale, postComments.length)}</dd>
          </div>
          <div>
            <dt>{t("detail.reading.reactions")}</dt>
            <dd>
              {reactionLoading ? "-" : formatNumber(locale, reactionTotal)}
            </dd>
          </div>
          <div>
            <dt>{t("detail.reading.revisions")}</dt>
            <dd>
              {revisionLoading
                ? "-"
                : formatNumber(locale, revisionItems.length)}
            </dd>
          </div>
        </dl>
        <div className="detail-reading-actions">
          <a href="#content-comments">
            <Icon name="chat-dots" />
            {t("detail.reading.joinComments")}
          </a>
          <Link to={revisionActivityPath(post, revisionObjectIdFromPost(post))}>
            <Icon name="clock-history" />
            {t("detail.reading.revisionHistory")}
          </Link>
        </div>
        {tagLinksFor(post).length ? (
          <div className="detail-reading-tags">
            {tagLinksFor(post)
              .slice(0, 4)
              .map((tag) => (
                <Link to={tag.to} key={tag.key}>
                  {tag.label}
                </Link>
              ))}
          </div>
        ) : null}
      </section>
    );
  };

  const renderArticleReadingDock = () => {
    if (!post || question) return null;
    if (post.type === "book") return null;
    if (kind === "blog") return null;
    if (isThreadLikeDetail) return null;
    if (isDynamicDetail) return null;
    const reactionTotal = reactions.reduce(
      (total, item) => total + item.count,
      0,
    );
    const objectId = revisionObjectIdFromPost(post);
    return (
      <section
        className="article-reading-dock"
        aria-label={t("detail.reading.contentActions")}
      >
        <Link
          className="article-reading-author identity-link"
          to={authorProfilePath(post.authorId, post.authorUid)}
        >
          <AvatarName
            name={post.author}
            imageUrl={avatarFromMap(
              post.author,
              post.authorAvatar,
              authorAvatars,
            )}
            rank={rankFromMap(post.author, post.authorRank, authorProfiles)}
            size="md"
          />
          <span>{dateLabel(post.createdAt, locale)}</span>
        </Link>
        <dl className="article-reading-metrics">
          <div>
            <dt>{t("detail.comments.title")}</dt>
            <dd>{formatNumber(locale, postComments.length)}</dd>
          </div>
          <div>
            <dt>{t("detail.reading.reactions")}</dt>
            <dd>
              {reactionLoading ? "-" : formatNumber(locale, reactionTotal)}
            </dd>
          </div>
          <div>
            <dt>{t("detail.reading.revisions")}</dt>
            <dd>
              {revisionLoading
                ? "-"
                : formatNumber(locale, revisionItems.length)}
            </dd>
          </div>
        </dl>
        <div className="article-reading-controls">
          <a href="#content-comments">
            <Icon name="chat-dots" />
            {t("detail.comments.title")}
          </a>
          <AnimateButton
            unstyled
            type="button"
            className={bookmarked ? "active" : ""}
            disabled={collectionBusy}
            onClick={() => void toggleCollection()}
          >
            <Icon name={bookmarked ? "bookmark-check" : "bookmark"} />
            {collectionBusy
              ? t("detail.common.syncing")
              : bookmarked
                ? t("detail.collection.remove")
                : t("detail.collection.bookmark")}
          </AnimateButton>
          <Link to={revisionActivityPath(post, objectId)}>
            <Icon name="clock-history" />
            {t("detail.reading.revisions")}
          </Link>
          <AnimateButton
            unstyled
            type="button"
            onClick={() =>
              void openReport({
                targetType: reportTypeForPost(post.type),
                slug: post.slug || post.id,
                title: post.title,
              })
            }
          >
            <Icon name="flag" />
            {t("detail.common.report")}
          </AnimateButton>
        </div>
      </section>
    );
  };

  const renderCollectionDialog = () => {
    return (
      <CollectionFolderDialog
        open={collectionDialogOpen}
        title={
          bookmarked
            ? t("detail.collection.changeFolder")
            : t("detail.collection.addToFolder")
        }
        currentFolderId={bookmarked ? collectionFolderId : ""}
        initialFolderId={collectionFolderId}
        confirmLabel={
          bookmarked
            ? t("detail.collection.confirmChange")
            : t("detail.collection.confirmBookmark")
        }
        busy={collectionBusy}
        status={collectionStatus}
        error={collectionError}
        onClose={() => setCollectionDialogOpen(false)}
        onFoldersLoaded={setCollectionFolders}
        onConfirm={(folderId, folder) =>
          void saveCollectionToFolder(folderId, folder)
        }
      />
    );
  };

  const renderCollectionAction = (
    compact = false,
    className = "",
    presentation: { count?: number; showLabel?: boolean } = {},
  ) => {
    const activeClassName = [className, bookmarked ? "active" : ""]
      .filter(Boolean)
      .join(" ");
    const { count, showLabel = true } = presentation;
    const actionLabel = collectionBusy
      ? compact
        ? t("detail.common.syncing")
        : t("detail.common.processing")
      : bookmarked
        ? t("detail.collection.remove")
        : compact
          ? t("detail.collection.bookmark")
          : t("detail.collection.bookmarkContent");
    if (hasSession) {
      return (
        <AnimateButton
          unstyled
          type="button"
          className={activeClassName || undefined}
          disabled={collectionBusy}
          aria-pressed={bookmarked}
          aria-label={
            typeof count === "number"
              ? t("detail.collection.actionCount", {
                  action: actionLabel,
                  count,
                  displayCount: formatNumber(locale, count),
                })
              : undefined
          }
          onClick={() => void toggleCollection()}
        >
          <Icon name={bookmarked ? "bookmark-check" : "bookmark"} />
          {typeof count === "number" ? (
            <strong className="detail-action-count">{formatNumber(locale, count)}</strong>
          ) : null}
          {showLabel ? <span className="detail-action-label">{actionLabel}</span> : null}
        </AnimateButton>
      );
    }
    return (
      <Link
        className={className || "blog-like-link"}
        to="/#login"
        aria-label={
          typeof count === "number"
            ? t("detail.collection.loginActionCount", {
                count,
                displayCount: formatNumber(locale, count),
              })
            : undefined
        }
      >
        <Icon name="bookmark" />
        {typeof count === "number" ? (
          <strong className="detail-action-count">{formatNumber(locale, count)}</strong>
        ) : null}
        {showLabel ? (
          <span className="detail-action-label">
            {compact
              ? t("detail.collection.bookmark")
              : t("detail.collection.loginToBookmark")}
          </span>
        ) : null}
      </Link>
    );
  };

  const renderBlogHeaderActions = () => {
    if (!post || kind !== "blog") return null;
    if (!canEditBlog) return null;
    const editDestination = contentEditDestination(post);
    return (
      <div
        className="blog-header-actions"
        aria-label={t("detail.article.actions")}
      >
        {editDestination === "quick-edit" ? (
          <AnimateButton
            unstyled
            type="button"
            onClick={() => setQuickEditOpen(true)}
          >
            <Icon name="pencil-square" />
            {t("detail.common.edit")}
          </AnimateButton>
        ) : (
          <Link to={blogEditPath(post)}>
            <Icon name="pencil-square" />
            {t("detail.common.edit")}
          </Link>
        )}
      </div>
    );
  };

  const renderReportDialog = () => {
    return (
      <ReportDialog
        target={reportTarget}
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
        onSubmitted={() => setReportStatus(t("detail.notices.reportSubmitted"))}
      />
    );
  };

  const renderRepositoryLikeAction = (showLabel = true) => {
    if (!post || (kind !== "blog" && kind !== "book")) return null;
    const displayedLikeCount = likeCount ?? 0;
    const likeLabel = collectionBusy
      ? t("detail.common.syncing")
      : likeActive
        ? t("detail.likes.liked")
        : t("detail.likes.like");
    if (hasSession) {
      return (
        <AnimateButton
          unstyled
          type="button"
          className={`repository-like-action${likeActive ? " active" : ""}`}
          data-tone="like"
          disabled={collectionBusy}
          aria-pressed={likeActive}
          aria-label={t("detail.likes.actionCount", {
            action: likeLabel,
            count: displayedLikeCount,
            displayCount: formatNumber(locale, displayedLikeCount),
          })}
          onClick={() => void toggleRepositoryLike()}
        >
          <Icon
            name={likeActive ? "heart-fill" : "heart"}
            size={18}
            fill={likeActive ? "currentColor" : "none"}
          />
          <strong className="detail-action-count">{formatNumber(locale, displayedLikeCount)}</strong>
          {showLabel ? <span className="detail-action-label">{likeLabel}</span> : null}
        </AnimateButton>
      );
    }
    return (
      <Link
        className="blog-like-link repository-like-action"
        data-tone="like"
        to="/#login"
        aria-label={t("detail.likes.loginActionCount", {
          count: displayedLikeCount,
          displayCount: formatNumber(locale, displayedLikeCount),
        })}
      >
        <Icon name="heart" size={18} />
        <strong className="detail-action-count">{formatNumber(locale, displayedLikeCount)}</strong>
        {showLabel ? <span className="detail-action-label">{t("detail.likes.like")}</span> : null}
      </Link>
    );
  };

  const renderBlogLikeSection = (compact = false) => {
    if (!post || kind !== "blog") return null;
    const displayedCollectionCount =
      collectionCount ?? collectionCountHint(post) ?? 0;
    const displayedReportCount = post.reportCount ?? 0;
    return (
      <section
        className={compact ? "blog-like-section side" : "blog-like-section"}
        aria-label={t("detail.likes.articleLikes")}
      >
        <div className="blog-like-row">
          {renderRepositoryLikeAction(!compact)}
          {renderCollectionAction(true, "", {
            count: displayedCollectionCount,
            showLabel: !compact,
          })}
          <TipButton target={{ contentType: "blog", postID: String(post.id) }} showLabel={!compact} />
          <AnimateButton
            unstyled
            type="button"
            aria-label={t("detail.reports.actionCount", {
              count: displayedReportCount,
              displayCount: formatNumber(locale, displayedReportCount),
            })}
            title={compact ? t("detail.common.report") : undefined}
            onClick={() =>
              void openReport({
                targetType: reportTypeForPost(post.type),
                targetId: String(post.id),
                title: post.title,
              })
            }
          >
            <Icon name="flag" />
            <strong className="detail-action-count">{formatNumber(locale, displayedReportCount)}</strong>
            {!compact ? t("detail.common.report") : null}
          </AnimateButton>
        </div>
      </section>
    );
  };

  const renderContentHeaderActions = () => {
    if (!post) return null;
    if (kind === "blog") return renderBlogHeaderActions();
    if (!isThreadLikeDetail && !isDynamicDetail) return null;
    if (isDynamicDetail) {
      return (
        <div
          className="blog-header-actions dynamic-header-actions"
          aria-label={t("detail.dynamic.actions")}
        >
          {canEditDynamic ? (
            <Link
              to={`/dynamics/${encodeURIComponent(post.slug || post.id)}/edit`}
            >
              <Icon name="pencil-square" />
              {t("detail.common.edit")}
            </Link>
          ) : null}
          {renderCollectionAction(true)}
          <AnimateButton
            unstyled
            type="button"
            onClick={() =>
              void openReport({
                targetType: reportTypeForPost(post.type),
                slug: post.slug || post.id,
                title: post.title,
              })
            }
          >
            <Icon name="flag" />
            {t("detail.common.report")}
          </AnimateButton>
        </div>
      );
    }
    return (
      <div
        className="blog-header-actions discussion-header-actions"
        aria-label={t("detail.discussion.actions")}
      >
        {canEditDiscussion || canEditAnnouncement ? (
          <Link
            to={`/${isAnnouncementDetail ? "announcements" : "discussions"}/${encodeURIComponent(
              post.slug || post.id,
            )}/edit`}
          >
            <Icon name="pencil-square" />
            {t("detail.common.edit")}
          </Link>
        ) : null}
        {renderCollectionAction(true)}
        <AnimateButton
          unstyled
          type="button"
          onClick={() =>
            void openReport({
              targetType: reportTypeForPost(post.type),
              slug: post.slug || post.id,
              title: post.title,
            })
          }
        >
          <Icon name="flag" />
          {t("detail.common.report")}
        </AnimateButton>
      </div>
    );
  };

  const renderBlogArticleHeader = () => {
    if (!post || kind !== "blog") return null;
    const metaText = detailMetaText(post, displayKind);
    return (
      <header className="blog-article-header">
        <div className="blog-article-topline">
          <div className="blog-article-taxonomy">
            <TypeMetaCategory type={displayKind} label={displayKindLabel} />
            <div className="blog-header-tags">
              {tagLinksFor(post).map((tag) => (
                <Link to={tag.to} key={tag.key}>
                  {tag.label}
                </Link>
              ))}
            </div>
          </div>
          {renderContentHeaderActions()}
        </div>
        {post.coverUrl ? (
          <figure className="blog-cover-figure">
            <img src={post.coverUrl} alt="" loading="lazy" />
          </figure>
        ) : null}
        <h1>
          <MathInline text={title} />
        </h1>
        <div className="detail-meta-row blog-article-meta">
          <UserIdentity
            className="detail-author-link"
            name={post.author}
            userId={
              authorProfileId(post.authorId, post.authorUid) || post.author
            }
            imageUrl={avatarFromMap(
              post.author,
              post.authorAvatar,
              authorAvatars,
            )}
            rank={rankFromMap(post.author, post.authorRank, authorProfiles)}
          />
          <span>{dateLabel(post.createdAt, locale)}</span>
          {metaText ? (
            <span>
              <MathInline text={metaText} />
            </span>
          ) : null}
          <strong>{localizedInteractionText(post, false)}</strong>
        </div>
      </header>
    );
  };

  const renderDiscussionArticleHeader = () => {
    if (!post || !isThreadLikeDetail) return null;
    return (
      <header className="blog-article-header discussion-article-header">
        <div className="blog-article-topline">
          <div className="blog-article-taxonomy">
            <TypeMetaCategory type={displayKind} label={displayKindLabel} />
            <div className="blog-header-tags discussion-header-tags">
              {tagLinksFor(post).map((tag) => (
                <Link to={tag.to} key={tag.key}>
                  {tag.label}
                </Link>
              ))}
            </div>
          </div>
          {renderContentHeaderActions()}
        </div>
      </header>
    );
  };

  const renderQuestionHeaderActions = () => {
    if (!post || !question) return null;
    return (
      <div
        className="blog-header-actions question-header-actions"
        aria-label={t("detail.question.actions")}
      >
        {canEditQuestion ? (
          <AnimateButton unstyled type="button" onClick={startQuestionEdit}>
            <Icon name="pencil-square" />
            {t("detail.common.edit")}
          </AnimateButton>
        ) : null}
        {renderCollectionAction(true)}
        <AnimateButton
          unstyled
          type="button"
          onClick={() =>
            void openReport({
              targetType: reportTypeForPost(post.type),
              slug: post.slug || post.id,
              title: post.title,
            })
          }
        >
          <Icon name="flag" />
          {t("detail.common.report")}
        </AnimateButton>
      </div>
    );
  };

  const renderQuestionArticleHeader = () => {
    if (!post || !question) return null;
    const metaText = detailMetaText(post, displayKind);
    const visibleCollectionCount =
      collectionCount ?? collectionCountHint(post) ?? 0;
    return (
      <header className="question-article-header">
        <div className="blog-article-topline">
          <div className="blog-article-taxonomy">
            <TypeMetaCategory type={displayKind} label={displayKindLabel} />
            <div className="blog-header-tags question-header-tags">
              {tagLinksFor(post).map((tag) => (
                <Link to={tag.to} key={tag.key}>
                  {tag.label}
                </Link>
              ))}
            </div>
          </div>
          {renderQuestionHeaderActions()}
        </div>
        <h1>
          <MathInline text={title} />
        </h1>
        <div className="question-article-meta">
          <UserIdentity
            className="detail-author-link"
            name={post.author}
            userId={
              authorProfileId(post.authorId, post.authorUid) || post.author
            }
            imageUrl={avatarFromMap(
              post.author,
              post.authorAvatar,
              authorAvatars,
            )}
            rank={rankFromMap(post.author, post.authorRank, authorProfiles)}
          />
          <span>{dateLabel(post.createdAt, locale)}</span>
          <span>
            {t("detail.metrics.readCount", {
              count: post.readCount || question.question.viewCount,
              displayCount: formatNumber(
                locale,
                post.readCount || question.question.viewCount,
              ),
            })}
          </span>
          <span>
            {t("detail.metrics.collectionCount", {
              count: visibleCollectionCount,
              displayCount: formatNumber(locale, visibleCollectionCount),
            })}
          </span>
          <strong>
            {t(
              `detail.questionStatus.${questionStatusKey(question.question.status)}`,
            )}
          </strong>
          {metaText ? (
            <span>
              <MathInline text={metaText} />
            </span>
          ) : null}
        </div>
      </header>
    );
  };

  const submitCurrentBookReview = async () => {
    if (!post || post.type !== "book") return;
    setBookReviewSubmitting(true);
    setBookReviewError("");
    try {
      const rating = await submitBookReview(post.id, {
        score: bookReviewScore,
        body: bookReviewBody,
      });
      setBookRating(rating);
      const result = await loadBookReviews(post.id, bookReviewOrder);
      setBookReviews(result.items);
      setBookRating(result.rating);
      setBookReviewEditing(false);
    } catch (reviewError) {
      setBookReviewError(
        localizedErrorMessage(reviewError, "rating.submitFailed"),
      );
    } finally {
      setBookReviewSubmitting(false);
    }
  };

  const scoreFromPointer = (
    event: Pick<
      | React.PointerEvent<HTMLButtonElement>
      | React.MouseEvent<HTMLButtonElement>,
      "clientX" | "currentTarget"
    >,
    star: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 1;
    return Math.max(1, Math.min(10, (star - 1) * 2 + (ratio <= 0.5 ? 1 : 2)));
  };

  const renderBookScorePicker = () => {
    const previewScore = bookReviewHoverScore || bookReviewScore;
    return (
      <div
        className="book-score-picker"
        onPointerLeave={() => setBookReviewHoverScore(0)}
      >
        <div
          className="book-score-stars"
          aria-label={t("detail.book.rating.select")}
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const fill = Math.max(
              0,
              Math.min(1, (previewScore - (star - 1) * 2) / 2),
            );
            const score = Math.max(1, Math.min(10, star * 2));
            return (
              <AnimateButton
                unstyled
                type="button"
                className={fill > 0 ? "active" : ""}
                key={star}
                aria-label={t("detail.book.rating.score", {
                  score: formatNumber(locale, score),
                })}
                title={t("detail.book.rating.score", {
                  score: formatNumber(locale, score),
                })}
                onClick={(event) =>
                  setBookReviewScore(scoreFromPointer(event, star))
                }
                onPointerMove={(event) =>
                  setBookReviewHoverScore(scoreFromPointer(event, star))
                }
              >
                <span className="book-score-star-base" aria-hidden="true">
                  ★
                </span>
                <span
                  className="book-score-star-fill"
                  style={{ width: `${fill * 100}%` }}
                  aria-hidden="true"
                >
                  ★
                </span>
              </AnimateButton>
            );
          })}
        </div>
        <strong>
          {t("detail.book.rating.score", {
            score: formatNumber(locale, previewScore),
          })}
        </strong>
      </div>
    );
  };

  const voteBookReview = async (
    review: BookReview,
    direction: VoteDirection,
  ) => {
    setBookReviewError("");
    if (!hasSession) {
      setBookReviewError(t("detail.notices.signInToVote"));
      return;
    }
    const reviewId = Number(review.id);
    if (!Number.isFinite(reviewId) || reviewId <= 0) {
      setBookReviewError(t("detail.book.reviews.invalidId"));
      return;
    }
    const key = voteKey("book_review", reviewId);
    setVoteBusyKey(`${key}:${direction}`);
    try {
      const result = await postAnswerStyleVote({
        objectId: review.id,
        objectType: "book_review",
        type: direction,
        isCancel: review.voteStatus === direction,
      });
      setBookReviews((items) =>
        items.map((item) =>
          item.id === review.id
            ? {
                ...item,
                voteCount: result.votes,
                voteStatus: result.vote_status,
              }
            : item,
        ),
      );
    } catch (voteFailure) {
      if (isAuthenticationFailure(voteFailure)) {
        setHasSession(false);
      }
      setBookReviewError(
        localizedErrorMessage(voteFailure, "rating.voteFailed"),
      );
    } finally {
      setVoteBusyKey("");
    }
  };

  const renderBookArticleHeader = () => {
    if (!post || post.type !== "book") return null;
    const book = post.book;
    const rating = bookRating || post.bookRating;
    const bookPdfUrl =
      book?.kind === "original" ? book.pdfUrl?.trim() || "" : "";
    const bookEditRef = encodeURIComponent(post.slug || post.id);
    const editDestination = contentEditDestination(post);
    const bookEditPath = editDestination === "book-workspace"
      ? bookWorkspacePath(post.id)
      : `/books/${bookEditRef}/edit`;
    if (isBookReadingPage) return null;
    return (
      <header className="book-detail-header">
        <div className="blog-article-topline">
          <div className="blog-article-taxonomy">
            <TypeMetaCategory type="book" label={t("detail.type.book")} />
            <div className="blog-header-tags">
              {tagLinksFor(post).map((tag) => (
                <Link to={tag.to} key={tag.key}>
                  {tag.label}
                </Link>
              ))}
            </div>
          </div>
          <div
            className="blog-header-actions"
            aria-label={t("detail.book.actions")}
          >
            {canEditBook && editDestination === "quick-edit" ? (
              <AnimateButton
                unstyled
                type="button"
                aria-label={t("detail.common.edit")}
                onClick={() => setQuickEditOpen(true)}
              >
                <Icon name="pencil-square" />
                <span className="detail-action-label">{t("detail.common.edit")}</span>
              </AnimateButton>
            ) : canEditBook ? (
              <Link
                to={bookEditPath}
                aria-label={
                  editDestination === "book-workspace"
                    ? t("detail.book.workspace")
                    : t("detail.common.edit")
                }
              >
                <Icon name="pencil-square" />
                <span className="detail-action-label">
                  {editDestination === "book-workspace"
                    ? t("detail.book.workspace")
                    : t("detail.common.edit")}
                </span>
              </Link>
            ) : null}
            {renderRepositoryLikeAction(true)}
            {renderCollectionAction(true, "", {
              count: collectionCount ?? collectionCountHint(post) ?? 0,
            })}
            {editableBookWorkspaceKind(book?.kind) ? (
              <TipButton target={{ contentType: "book", postID: String(post.id) }} />
            ) : null}
            <AnimateButton
              unstyled
              type="button"
              aria-label={t("detail.reports.actionCount", {
                count: post.reportCount ?? 0,
                displayCount: formatNumber(locale, post.reportCount ?? 0),
              })}
              onClick={() =>
                void openReport({
                  targetType: reportTypeForPost(post.type),
                  targetId: String(post.id),
                  title: post.title,
                })
              }
            >
              <Icon name="flag" />
              <strong className="detail-action-count">{formatNumber(locale, post.reportCount ?? 0)}</strong>
              <span className="detail-action-label">{t("detail.common.report")}</span>
            </AnimateButton>
          </div>
        </div>
        <div className="book-detail-hero">
          {post.coverUrl ? (
            <figure>
              <img src={post.coverUrl} alt="" loading="lazy" />
            </figure>
          ) : (
            <div className="book-cover-fallback">
              <span>{book?.bookTitle || post.title}</span>
            </div>
          )}
          <div className="book-detail-hero-main">
            <span className="book-kind-pill">
              {book?.kind === "markdown"
                ? t("detail.book.kind.markdown")
                : book?.kind === "typst"
                  ? t("detail.book.kind.typst")
                  : book?.kind === "original"
                    ? t("detail.book.kind.original")
                    : t("detail.book.kind.external")}
            </span>
            <h1>
              <MathInline text={book?.bookTitle || post.title} />
            </h1>
            {editableBookWorkspaceKind(book?.kind) ? (
              <Link
                className="book-original-author identity-link"
                to={authorProfilePath(post.authorId, post.authorUid)}
              >
                <AvatarName
                  name={post.author}
                  imageUrl={avatarFromMap(
                    post.author,
                    post.authorAvatar,
                    authorAvatars,
                  )}
                  rank={rankFromMap(
                    post.author,
                    post.authorRank,
                    authorProfiles,
                  )}
                  size="sm"
                />
              </Link>
            ) : book?.authorEntities?.length ? (
              <p className="book-author-links">
                {book.authorEntities.map((author) => (
                  <Link
                    to={`/author/${encodeURIComponent(author.id)}`}
                    key={author.id}
                  >
                    {author.name}
                  </Link>
                ))}
              </p>
            ) : book?.authors?.length ? (
              <p>{book.authors.join(" / ")}</p>
            ) : null}
            {isBookReadingPage ? (
              <p className="book-reader-subline">
                {t("detail.book.readerRatingNotice")}
              </p>
            ) : (
              <div className="book-rating-summary">
                <strong>
                  {rating?.averageScore
                    ? formatNumber(locale, rating.averageScore, {
                        maximumFractionDigits: 1,
                      })
                    : t("detail.common.none")}
                </strong>
                <span>
                  {rating?.averageScore
                    ? t("detail.book.rating.starsOutOfFive", {
                        stars: formatNumber(locale, rating.averageScore / 2, {
                          maximumFractionDigits: 1,
                        }),
                      })
                    : t("detail.book.rating.awaiting")}
                </span>
                <em>
                  {t("detail.book.rating.reviewCount", {
                    count: rating?.reviewCount || 0,
                    displayCount: formatNumber(
                      locale,
                      rating?.reviewCount || 0,
                    ),
                  })}
                </em>
              </div>
            )}
            {bookPdfUrl ? (
              <a
                className="book-detail-read-action"
                href={bookPdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="book" />
                {t("detail.book.startReading")}
              </a>
            ) : hasBookReader ? (
              <Link
                className="book-detail-read-action"
                to={activeBookReadingPath}
              >
                <Icon name="book" />
                {t("detail.book.startReading")}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
    );
  };

  const renderBookReaderPageFooter = () => {
    if (!isBookReadingPage || !bookReaderPageNavigation.total) return null;
    return (
      <nav
        className="book-reader-page-footer"
        aria-label={t("detail.book.chapterPagination")}
      >
        {bookReaderPageNavigation.previous ? (
          <Link
            to={bookReaderHashPath(
              activeBookReadingPath,
              bookReaderPageNavigation.previous.id,
            )}
          >
            <span>{t("detail.book.previousPage")}</span>
            <strong>{bookReaderPageNavigation.previous.text}</strong>
          </Link>
        ) : null}
        {bookReaderPageNavigation.next ? (
          <Link
            to={bookReaderHashPath(
              activeBookReadingPath,
              bookReaderPageNavigation.next.id,
            )}
          >
            <span>{t("detail.book.nextPage")}</span>
            <strong>{bookReaderPageNavigation.next.text}</strong>
          </Link>
        ) : null}
      </nav>
    );
  };

  const toggleBookTOCNode = (nodeId: string) => {
    setCollapsedBookTOCNodes((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderBookTOCNodes = (nodes: BookTOCNode[]) => (
    <ol className="book-toc-list">
      {nodes.map((node) => {
        const collapsed = collapsedBookTOCNodes.has(node.id);
        const hasChildren = node.children.length > 0;
        const activity = chapterCountsByKey.get(node.chapterKey);
        const counts = activity?.counts;
        const totalActivity = counts
          ? counts.discussion + counts.question + counts.errata
          : 0;
        const readerTargetId = hasBookReader
          ? bookReaderTargetForChapter(node, bookReaderItems)
          : "";
        const readerTargetPath = readerTargetId
          ? bookReaderHashPath(activeBookReadingPath, readerTargetId)
          : "";
        return (
          <li
            className={
              selectedBookChapterKey === node.chapterKey
                ? "book-toc-node active"
                : "book-toc-node"
            }
            key={node.id}
          >
            <div className="book-toc-row">
              {hasChildren ? (
                <AnimateButton
                  unstyled
                  type="button"
                  className="book-toc-collapse"
                  aria-expanded={!collapsed}
                  aria-label={
                    collapsed
                      ? t("detail.toc.expand", { title: node.title })
                      : t("detail.toc.collapse", { title: node.title })
                  }
                  onClick={() => toggleBookTOCNode(node.id)}
                >
                  <Icon name={collapsed ? "chevron-right" : "chevron-down"} />
                </AnimateButton>
              ) : (
                <span className="book-toc-spacer" aria-hidden="true" />
              )}
              {readerTargetPath ? (
                <Link className="book-toc-title-button" to={readerTargetPath}>
                  <span>{node.title}</span>
                </Link>
              ) : (
                <span className="book-toc-title-button book-toc-title-static">
                  <span>{node.title}</span>
                </span>
              )}
              {counts && totalActivity > 0 ? (
                <span
                  className="book-chapter-counts"
                  aria-label={t("detail.book.chapterActivity")}
                >
                  {counts.discussion ? (
                    <b>
                      {t("detail.book.chapterDiscussionCount", {
                        count: counts.discussion,
                        displayCount: formatNumber(locale, counts.discussion),
                      })}
                    </b>
                  ) : null}
                  {counts.question ? (
                    <b>
                      {t("detail.book.chapterQuestionCount", {
                        count: counts.question,
                        displayCount: formatNumber(locale, counts.question),
                      })}
                    </b>
                  ) : null}
                  {counts.errata ? (
                    <b
                      className={
                        counts.openErrata ? "has-open-errata" : undefined
                      }
                    >
                      {t("detail.book.chapterErrataCount", {
                        count: counts.errata,
                        displayCount: formatNumber(locale, counts.errata),
                      })}
                    </b>
                  ) : null}
                </span>
              ) : bookChapterLoading ? (
                <span
                  className="book-chapter-counts loading"
                  aria-hidden="true"
                >
                  <b>{t("detail.common.syncing")}</b>
                </span>
              ) : null}
              {node.page ? <em>{node.page}</em> : null}
            </div>
            {hasChildren && !collapsed
              ? renderBookTOCNodes(node.children)
              : null}
          </li>
        );
      })}
    </ol>
  );

  const renderBookMetadata = () => {
    if (!post || post.type !== "book" || !post.book) return null;
    const book = post.book;
    const tocTree = bookOverviewTocItems.length
      ? buildBookTOCTree(bookOverviewTocItems)
      : [];
    const rows = [
      [t("detail.book.metadata.bookTitle"), book.bookTitle],
      editableBookWorkspaceKind(book.kind)
        ? null
        : [t("detail.book.metadata.authors"), book.authors.join(", ")],
      [t("detail.book.metadata.seriesTitle"), book.seriesTitle],
      [t("detail.book.metadata.doi"), book.doi],
      [t("detail.book.metadata.publisher"), book.publisher],
      [t("detail.book.metadata.ebookPackages"), book.ebookPackages],
      [t("detail.book.metadata.copyright"), book.copyrightInformation],
      [t("detail.book.metadata.seriesIssn"), book.seriesISSN],
      [t("detail.book.metadata.seriesEIssn"), book.seriesEISSN],
      [t("detail.book.metadata.edition"), book.editionNumber],
      [t("detail.book.metadata.pages"), book.numberOfPages],
      [t("detail.book.metadata.topics"), book.topics?.join(", ")],
      [t("detail.book.metadata.keywords"), book.keywords?.join(", ")],
    ].filter((row): row is [string, string | undefined] => Boolean(row?.[1]));
    return (
      <section className="book-detail-card">
        <div className="panel-heading">
          <span>{t("detail.book.metadata.title")}</span>
          <strong>
            {book.kind === "markdown"
              ? t("detail.book.metadata.markdown")
              : book.kind === "typst"
                ? t("detail.book.metadata.typst")
                : book.kind === "original"
                  ? t("detail.book.metadata.original")
                  : t("detail.book.metadata.reference")}
          </strong>
        </div>
        <dl className="book-bibliography">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          {book.isbn?.map((isbn) => (
            <div key={`${isbn.kind}-${isbn.value}`}>
              <dt>
                {isbn.kind === "ebook"
                  ? t("detail.book.metadata.ebookIsbn")
                  : t("detail.book.metadata.isbn", {
                      kind: `${isbn.kind.slice(0, 1).toUpperCase()}${isbn.kind.slice(1)}`,
                    })}
              </dt>
              <dd>
                {isbn.value}
                {isbn.publishedAt
                  ? t("detail.book.metadata.published", {
                      date: isbn.publishedAt,
                    })
                  : ""}
              </dd>
            </div>
          ))}
        </dl>
        {tocTree.length ? (
          <div className="book-toc">
            <h2>{t("detail.toc.title")}</h2>

            {renderBookTOCNodes(tocTree)}
          </div>
        ) : null}
      </section>
    );
  };

  const renderBookOverviewIntro = () => {
    const intro = bookOverviewIntroText(post);
    if (!post || post.type !== "book" || isBookReadingPage || !intro)
      return null;
    return (
      <section className="book-detail-card book-intro-card">
        <div className="panel-heading">
          <span>{t("detail.book.introduction")}</span>
          <strong>{t("detail.book.about")}</strong>
        </div>
        <div className="detail-body book-intro-body" data-rin-primary-text="description">
          <MathText text={intro} />
        </div>
      </section>
    );
  };

  const renderBookReviews = () => {
    if (!post || post.type !== "book") return null;
    const myReview = bookRating?.myReview;
    const shouldShowForm = hasSession && (!myReview || bookReviewEditing);
    return (
      <section className="book-detail-card book-review-card" id="book-reviews">
        <div className="panel-heading">
          <span>{t("detail.book.reviews.title")}</span>
          <div className="book-review-heading-tools">
            <div
              className="discussion-sort-tabs book-review-sort-tabs"
              aria-label={t("detail.book.reviews.sortLabel")}
            >
              <AnimateButton
                unstyled
                type="button"
                className={bookReviewOrder === "hot" ? "active" : ""}
                onClick={() => setBookReviewOrder("hot")}
              >
                {t("detail.sort.hot")}
              </AnimateButton>
              <AnimateButton
                unstyled
                type="button"
                className={bookReviewOrder === "asc" ? "active" : ""}
                onClick={() => setBookReviewOrder("asc")}
              >
                {t("detail.sort.asc")}
              </AnimateButton>
              <AnimateButton
                unstyled
                type="button"
                className={bookReviewOrder === "desc" ? "active" : ""}
                onClick={() => setBookReviewOrder("desc")}
              >
                {t("detail.sort.desc")}
              </AnimateButton>
            </div>
            <strong>
              {bookReviewLoading
                ? t("detail.common.loading")
                : t("detail.book.reviews.count", {
                    count: bookRating?.reviewCount || bookReviews.length,
                    displayCount: formatNumber(
                      locale,
                      bookRating?.reviewCount || bookReviews.length,
                    ),
                  })}
            </strong>
          </div>
        </div>
        {myReview && !bookReviewEditing ? (
          <div className="book-my-review">
            <div>
              <span>{t("detail.book.reviews.mine")}</span>
              <strong>
                {t("detail.book.rating.score", {
                  score: formatNumber(locale, myReview.score),
                })} ·{" "}
                {"★".repeat(Math.max(1, Math.round(myReview.stars)))}
              </strong>
              {myReview.body ? (
                <MathText text={myReview.body} />
              ) : (
                <p>{t("detail.book.reviews.scoreOnly")}</p>
              )}
            </div>
            <AnimateButton
              unstyled
              type="button"
              className="secondary-button"
              onClick={() => {
                setBookReviewScore(myReview.score);
                setBookReviewBody(myReview.body);
                setBookReviewEditing(true);
              }}
            >
              {t("detail.book.reviews.edit")}
            </AnimateButton>
          </div>
        ) : null}
        {shouldShowForm ? (
          <div className="book-review-form">
            {renderBookScorePicker()}
            <div className="book-review-editor">
              <div className="comment-form-tools">
                <RinStickerPicker
                  disabled={bookReviewSubmitting}
                  onSelect={(sticker) =>
                    setBookReviewBody((current) =>
                      appendRinStickerToken(current, sticker.token),
                    )
                  }
                />
              </div>
              <CodeMirrorEditor
                id="book-review-editor"
                value={bookReviewBody}
                minHeight="120px"
                ariaLabel={t("detail.book.reviews.editorLabel")}
                placeholder={t("detail.book.reviews.placeholder")}
                editorRef={bookReviewEditorRef}
                onChange={setBookReviewBody}
              />
            </div>
            <div className="book-review-form-actions">
              <span>
                {formatNumber(locale, bookReviewBody.trim().length)} /{" "}
                {formatNumber(locale, 4000)}
              </span>
              {myReview ? (
                <AnimateButton
                  unstyled
                  type="button"
                  className="secondary-button"
                  disabled={bookReviewSubmitting}
                  onClick={() => {
                    setBookReviewBody(myReview.body);
                    setBookReviewScore(myReview.score);
                    setBookReviewEditing(false);
                  }}
                >
                  {t("detail.common.cancel")}
                </AnimateButton>
              ) : null}
              <AnimateButton
                unstyled
                type="button"
                className="primary-button"
                disabled={bookReviewSubmitting}
                onClick={() => void submitCurrentBookReview()}
              >
                {bookReviewSubmitting
                  ? t("detail.common.submitting")
                  : myReview
                    ? t("detail.book.reviews.save")
                    : t("detail.book.reviews.submit")}
              </AnimateButton>
            </div>
          </div>
        ) : !hasSession ? (
          <Link className="secondary-button" to="/#login">
            {t("detail.book.reviews.loginToRate")}
          </Link>
        ) : null}
        <div className="book-review-list">
          {bookReviews.map((review) => {
            const reviewId = Number(review.id);
            const voteBusy = voteBusyKey.startsWith(`book_review:${reviewId}:`);
            return (
              <article key={review.id}>
                <Link
                  className="book-review-author identity-link"
                  to={authorProfilePath(review.authorId)}
                >
                  <AvatarName
                    name={review.author}
                    imageUrl={review.authorAvatar}
                    size="sm"
                  />
                </Link>
                <div className="book-review-main">
                  <div className="book-review-meta">
                    <strong>
                      {t("detail.book.rating.score", {
                        score: formatNumber(locale, review.score),
                      })} ·{" "}
                      {"★".repeat(Math.max(1, Math.round(review.stars)))}
                    </strong>
                    <span>{dateLabel(review.updatedAt, locale)}</span>
                  </div>
                  {review.body ? (
                    <MathText text={review.body} />
                  ) : (
                    <p>{t("detail.book.reviews.scoreOnly")}</p>
                  )}
                  <div className="book-review-actions">
                    <AnimateButton
                      unstyled
                      type="button"
                      className={review.voteStatus === "up" ? "active" : ""}
                      disabled={voteBusy}
                      onClick={() => void voteBookReview(review, "up")}
                    >
                      <Icon name="hand-thumbs-up" />
                      <span>
                        {review.voteCount > 0
                          ? formatNumber(locale, review.voteCount)
                          : t("detail.book.reviews.helpful")}
                      </span>
                    </AnimateButton>
                    <AnimateButton
                      unstyled
                      type="button"
                      className={
                        review.voteStatus === "down" ? "active down" : ""
                      }
                      disabled={voteBusy}
                      onClick={() => void voteBookReview(review, "down")}
                    >
                      <Icon name="hand-thumbs-down" />
                      <span>{t("detail.book.reviews.notHelpful")}</span>
                    </AnimateButton>
                  </div>
                </div>
              </article>
            );
          })}
          {!bookReviewLoading && !bookReviews.length ? (
            <div className="state-strip">
              {t("detail.book.reviews.empty")}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const bookActivityKindLabel = (kind: BookActivityKind) =>
    t(`detail.book.activity.kind.${kind}`);

  const bookChapterFullLabel = (chapter: {
    chapterTitle: string;
    chapterPath?: string[];
    chapterPage?: number;
  }) => {
    const path = chapter.chapterPath?.length
      ? chapter.chapterPath
      : [chapter.chapterTitle];
    const label = path.join(" / ");
    return chapter.chapterPage ? `${label} · p. ${chapter.chapterPage}` : label;
  };

  const primaryBookContext = bookContexts[0];

  const renderBookActivityCard = (item: BookActivityItem) => {
    const chapterLabel = bookChapterFullLabel(item);
    if (item.kind === "errata") {
      return (
        <article
          className="book-activity-card book-activity-card-errata"
          key={`errata-${item.erratum?.id || item.updatedAt}`}
        >
          <div className="book-activity-card-top">
            <span>{bookActivityKindLabel(item.kind)}</span>
            <time>{dateLabel(item.updatedAt, locale)}</time>
          </div>
          <h3>
            {item.erratum?.title || t("detail.book.activity.kind.errata")}
          </h3>
          <p>{item.erratum?.location || chapterLabel}</p>
          <Link
            to={bookChapterPath(
              post?.id,
              post?.book?.bookTitle || post?.title,
              item.chapterKey,
            )}
          >
            {chapterLabel}
          </Link>
        </article>
      );
    }
    const content = item.content;
    const thread = item.thread;
    return (
      <article
        className="book-activity-card"
        key={`${item.kind}-${thread?.id || content?.id || item.updatedAt}`}
      >
        <div className="book-activity-card-top">
          <span>{bookActivityKindLabel(item.kind)}</span>
          <time>{dateLabel(item.updatedAt, locale)}</time>
        </div>
        {thread ? (
          <Link
            className="book-activity-card-title"
            to={bookChapterPath(
              post?.id,
              post?.book?.bookTitle || post?.title,
              item.chapterKey,
            )}
          >
            <MathInline text={thread.title} />
          </Link>
        ) : content ? (
          <Link
            className="book-activity-card-title"
            to={contentPath(content.type, content.id, content.title)}
          >
            <MathInline text={content.title} />
          </Link>
        ) : (
          <h3>{t("detail.book.activity.chapterContent")}</h3>
        )}
        <p>
          {thread
            ? `${thread.author} · ${thread.body || chapterLabel}`
            : content
              ? `${content.author} · ${content.excerpt || chapterLabel}`
              : chapterLabel}
        </p>
        <Link
          to={bookChapterPath(
            post?.id,
            post?.book?.bookTitle || post?.title,
            item.chapterKey,
          )}
        >
          {chapterLabel}
        </Link>
      </article>
    );
  };

  const renderBookActivityShelf = () => {
    if (!post || post.type !== "book") return null;
    const visibleActivityItems = bookActivityItems.filter(
      (item) => item.kind !== "blog",
    );
    const total =
      visibleActivityItems.length ||
      (bookChapterActivity?.chapters || []).reduce(
        (sum, chapter) =>
          sum +
          chapter.counts.discussion +
          chapter.counts.question +
          chapter.counts.errata,
        0,
      );
    return (
      <section className="book-detail-card book-activity-shelf-section">
        <div className="panel-heading">
          <span>{t("detail.book.activity.relatedContent")}</span>
          <Link
            to={`/books/${encodeURIComponent(post.id)}/${contentTitleSlug(post.book?.bookTitle || post.title)}/activity`}
          >
            {t("detail.common.more")}
            {total ? ` ${formatNumber(locale, total)}` : ""}
          </Link>
        </div>
        {bookActivityLoading && !bookActivityItems.length ? (
          <LoadingState variant="strip" />
        ) : visibleActivityItems.length ? (
          <div
            className="book-activity-shelf"
            aria-label={t("detail.book.activity.latestRelated")}
          >
            {visibleActivityItems.map(renderBookActivityCard)}
          </div>
        ) : (
          <div className="book-chapter-empty">
            <strong>{t("detail.book.activity.empty")}</strong>
          </div>
        )}
      </section>
    );
  };

  const renderBookContextPanel = () => {
    if (
      post?.type === "book" ||
      post?.type === "dynamic" ||
      post?.type === "status"
    )
      return null;
    if (!bookContextLoading && !bookContexts.length && !bookContextError)
      return null;
    return (
      <section className="panel content-book-context-panel">
        <div className="panel-heading">
          <span>{t("detail.book.context.fromBook")}</span>
          <strong>
            {bookContextLoading
              ? t("detail.common.loading")
              : formatNumber(locale, bookContexts.length)}
          </strong>
        </div>
        <div className="content-book-context-list">
          {bookContexts.map((context) => (
            <Link
              className="content-book-context-item"
              to={bookChapterPath(
                context.bookId,
                context.bookTitle,
                context.chapterKey,
              )}
              key={`${context.bookId}-${context.chapterKey}-${context.kind}`}
            >
              <span>{bookActivityKindLabel(context.kind)}</span>
              <strong>
                <MathInline text={context.bookTitle} />
              </strong>
              <small>{bookChapterFullLabel(context)}</small>
            </Link>
          ))}
        </div>
      </section>
    );
  };

  const renderBookChapterActivityPanel = () => {
    if (
      !isBookReadingPage ||
      !post ||
      post.type !== "book" ||
      !post.book?.toc?.length
    )
      return null;
    const selected = selectedBookChapterDetail;
    const summary = selected || selectedBookChapter;
    const activityButtons = [
      {
        key: "discussions" as const,
        label: t("detail.book.chapter.discussions"),
        count: summary?.counts.discussion || 0,
        icon: "chat-dots" as IconName,
      },
      {
        key: "questions" as const,
        label: t("detail.book.chapter.questions"),
        count: summary?.counts.question || 0,
        icon: "question-circle" as IconName,
      },
      {
        key: "errata" as const,
        label: t("detail.book.chapter.errata"),
        count: summary?.counts.errata || 0,
        icon: "exclamation-diamond" as IconName,
      },
    ];
    const statusLabels: Record<BookChapterErratumStatus, string> = {
      open: t("detail.book.chapter.errataStatus.open"),
      confirmed: t("detail.book.chapter.errataStatus.confirmed"),
      fixed: t("detail.book.chapter.errataStatus.fixed"),
      rejected: t("detail.book.chapter.errataStatus.rejected"),
    };
    const dialogMeta = activityButtons.find(
      (item) => item.key === bookChapterDialog,
    );
    const dialogTitle = dialogMeta
      ? t("detail.book.chapter.dialogTitle", {
          action: dialogMeta.label,
          chapter: summary?.title || t("detail.book.chapter.current"),
        })
      : t("detail.book.chapter.activity");
    const openChapterDialog = (type: BookChapterActivityTab) => {
      setBookChapterTab(type);
      setBookChapterDialog(type);
      setBookChapterComposer("");
    };
    const closeChapterDialog = () => {
      setBookChapterDialog("");
      setBookChapterComposer("");
      setBookChapterThreadError("");
      setBookErrataError("");
    };
    const renderThreadItems = (
      items: BookChapterThread[],
      emptyLabel: string,
    ) =>
      items.length ? (
        <div className="book-chapter-activity-list">
          {items.map((item) => (
            <article
              className="book-chapter-activity-item"
              key={`${item.kind}-${item.id}`}
            >
              <strong>
                <MathInline text={item.title} />
              </strong>
              {item.body ? <MathText text={item.body} /> : null}
              <small>
                {item.author} · {dateLabel(item.updatedAt, locale)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <div className="book-chapter-empty">
          <strong>{emptyLabel}</strong>
        </div>
      );
    const threadKindForTab = (
      tab: BookChapterActivityTab,
    ): BookChapterThreadKind =>
      tab === "questions" ? "question" : "discussion";
    const renderChapterMathPreview = (value: string) =>
      value.trim() ? (
        <div className="math-preview compact book-chapter-math-preview">
          <MathText text={value} />
        </div>
      ) : null;
    const renderThreadForm = (kind: BookChapterThreadKind) => (
      <div className="book-chapter-composer book-chapter-thread-form">
        <Form.Control
          value={bookChapterThreadTitle}
          placeholder={t(
            kind === "question"
              ? "detail.book.chapter.questionTitle"
              : "detail.book.chapter.discussionTitle",
          )}
          onChange={(event) =>
            setBookChapterThreadTitle(event.currentTarget.value)
          }
        />
        <CodeMirrorEditor
          id={`book-chapter-${kind}-body`}
          value={bookChapterThreadBody}
          minHeight="130px"
          ariaLabel={t(
            kind === "question"
              ? "detail.book.chapter.questionBody"
              : "detail.book.chapter.discussionBody",
          )}
          placeholder={t(
            kind === "question"
              ? "detail.book.chapter.questionPlaceholder"
              : "detail.book.chapter.discussionPlaceholder",
          )}
          onChange={setBookChapterThreadBody}
        />
        {renderChapterMathPreview(bookChapterThreadBody)}
        <AnimateButton
          unstyled
          type="button"
          className="secondary-button"
          disabled={bookChapterThreadBusy}
          onClick={() => void createCurrentBookChapterThread(kind)}
        >
          {bookChapterThreadBusy
            ? t("detail.common.submitting")
            : kind === "question"
              ? t("detail.book.chapter.submitQuestion")
              : t("detail.book.chapter.startDiscussion")}
        </AnimateButton>
      </div>
    );
    const renderErrataForm = () => (
      <div className="book-chapter-composer book-errata-form">
        <Form.Control
          value={bookErrataTitle}
          placeholder={t("detail.book.chapter.errataTitle")}
          onChange={(event) => setBookErrataTitle(event.currentTarget.value)}
        />
        <Form.Control
          value={bookErrataLocation}
          placeholder={t("detail.book.chapter.errataLocation")}
          onChange={(event) => setBookErrataLocation(event.currentTarget.value)}
        />
        <div className="book-chapter-editor-field">
          <span>{t("detail.book.chapter.originalText")}</span>
          <CodeMirrorEditor
            id="book-chapter-errata-original"
            value={bookErrataOriginal}
            minHeight="90px"
            ariaLabel={t("detail.book.chapter.originalTextAria")}
            placeholder={t("detail.book.chapter.originalText")}
            onChange={setBookErrataOriginal}
          />
          {renderChapterMathPreview(bookErrataOriginal)}
        </div>
        <div className="book-chapter-editor-field">
          <span>{t("detail.book.chapter.correction")}</span>
          <CodeMirrorEditor
            id="book-chapter-errata-correction"
            value={bookErrataCorrection}
            minHeight="90px"
            ariaLabel={t("detail.book.chapter.correctionAria")}
            placeholder={t("detail.book.chapter.correction")}
            onChange={setBookErrataCorrection}
          />
          {renderChapterMathPreview(bookErrataCorrection)}
        </div>
        <div className="book-chapter-editor-field">
          <span>{t("detail.book.chapter.note")}</span>
          <CodeMirrorEditor
            id="book-chapter-errata-note"
            value={bookErrataNote}
            minHeight="90px"
            ariaLabel={t("detail.book.chapter.noteAria")}
            placeholder={t("detail.book.chapter.note")}
            onChange={setBookErrataNote}
          />
          {renderChapterMathPreview(bookErrataNote)}
        </div>
        <AnimateButton
          unstyled
          type="button"
          className="secondary-button"
          disabled={bookErrataBusy}
          onClick={() => void createCurrentBookErratum()}
        >
          {bookErrataBusy
            ? t("detail.common.submitting")
            : t("detail.book.chapter.submitErratum")}
        </AnimateButton>
      </div>
    );
    return (
      <>
        <section
          className="book-chapter-quick-panel"
          aria-label={t("detail.book.chapter.activity")}
        >
          <div
            className="book-chapter-quick-actions"
            aria-label={t("detail.book.chapter.subcontent")}
          >
            {activityButtons.map((item) => (
              <AnimateButton
                unstyled
                key={item.key}
                type="button"
                aria-label={t("detail.book.chapter.actionLabel", {
                  label: item.label,
                  count: summary ? item.count : 0,
                  displayCount: summary
                    ? formatNumber(locale, item.count)
                    : "",
                })}
                title={item.label}
                disabled={!summary}
                onClick={() => openChapterDialog(item.key)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                <strong>{formatNumber(locale, item.count)}</strong>
              </AnimateButton>
            ))}
          </div>
        </section>
        <Modal
          show={Boolean(bookChapterDialog)}
          onHide={closeChapterDialog}
          centered
          size="lg"
          dialogClassName="book-chapter-dialog"
        >
          <Modal.Header closeButton>
            <Modal.Title>{dialogTitle}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {bookChapterLoading && !selected ? (
              <LoadingState variant="strip" />
            ) : null}
            {!summary ? (
              <div className="book-chapter-empty">
                <strong>{t("detail.book.chapter.notLocated")}</strong>
                <span>{t("detail.book.chapter.openReaderFirst")}</span>
              </div>
            ) : selected ? (
              <div className="book-chapter-dialog-body">
                {bookChapterTab === "discussions"
                  ? renderThreadItems(
                      selected.threads.discussions,
                      t("detail.book.chapter.emptyDiscussions"),
                    )
                  : null}
                {bookChapterTab === "questions"
                  ? renderThreadItems(
                      selected.threads.questions,
                      t("detail.book.chapter.emptyQuestions"),
                    )
                  : null}
                {bookChapterTab === "errata" ? (
                  selected.errata.length ? (
                    <div className="book-chapter-errata-list">
                      {selected.errata.map((erratum) => (
                        <article
                          className="book-chapter-erratum"
                          key={erratum.id}
                        >
                          <div>
                            <strong>{erratum.title}</strong>
                            <span
                              className={`book-errata-status status-${erratum.status}`}
                            >
                              {statusLabels[erratum.status]}
                            </span>
                          </div>
                          {erratum.location ? (
                            <small>{erratum.location}</small>
                          ) : null}
                          {erratum.originalText ? (
                            <div className="book-errata-rich-text">
                              <span>
                                {t("detail.book.chapter.originalText")}
                              </span>
                              <MathText text={erratum.originalText} />
                            </div>
                          ) : null}
                          {erratum.correctionText ? (
                            <div className="book-errata-rich-text">
                              <span>
                                {t("detail.book.chapter.correction")}
                              </span>
                              <MathText text={erratum.correctionText} />
                            </div>
                          ) : null}
                          {erratum.note ? (
                            <MathText text={erratum.note} />
                          ) : null}
                          <footer>
                            <span>
                              {erratum.reporter} ·{" "}
                              {dateLabel(erratum.updatedAt, locale)}
                            </span>
                            {isCurrentUserAdmin ? (
                              <span className="book-errata-status-actions">
                                {(
                                  [
                                    "open",
                                    "confirmed",
                                    "fixed",
                                    "rejected",
                                  ] as BookChapterErratumStatus[]
                                ).map((status) => (
                                  <AnimateButton
                                    unstyled
                                    type="button"
                                    key={status}
                                    disabled={
                                      bookErrataStatusBusy ===
                                        `${erratum.id}:${status}` ||
                                      erratum.status === status
                                    }
                                    onClick={() =>
                                      void updateCurrentBookErratumStatus(
                                        erratum.id,
                                        status,
                                      )
                                    }
                                  >
                                    {statusLabels[status]}
                                  </AnimateButton>
                                ))}
                              </span>
                            ) : null}
                          </footer>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="book-chapter-empty">
                      <strong>{t("detail.book.chapter.emptyErrata")}</strong>
                    </div>
                  )
                ) : null}
                {hasSession ? (
                  <div className="book-chapter-actions">
                    <div className="book-chapter-actionbar">
                      {bookChapterTab === "errata" ? (
                        <AnimateButton
                          unstyled
                          type="button"
                          className="book-chapter-primary-action"
                          onClick={() =>
                            setBookChapterComposer(
                              bookChapterComposer === "errata" ? "" : "errata",
                            )
                          }
                        >
                          <Icon name="exclamation-diamond" />
                          {t("detail.book.chapter.reportErratum")}
                        </AnimateButton>
                      ) : (
                        <AnimateButton
                          unstyled
                          type="button"
                          className="book-chapter-primary-action"
                          onClick={() =>
                            setBookChapterComposer(
                              bookChapterComposer === bookChapterTab
                                ? ""
                                : bookChapterTab,
                            )
                          }
                        >
                          <Icon
                            name={
                              bookChapterTab === "questions"
                                ? "question-circle"
                                : "chat-dots"
                            }
                          />
                          {bookChapterTab === "questions"
                            ? t("detail.book.chapter.askQuestion")
                            : t("detail.book.chapter.startDiscussion")}
                        </AnimateButton>
                      )}
                    </div>
                    {bookChapterComposer === bookChapterTab &&
                    bookChapterTab !== "errata"
                      ? renderThreadForm(threadKindForTab(bookChapterTab))
                      : null}
                    {bookChapterComposer === "errata"
                      ? renderErrataForm()
                      : null}
                  </div>
                ) : (
                  <Link className="book-chapter-login-action" to="/#login">
                    {t("detail.book.chapter.loginToParticipate")}
                  </Link>
                )}
              </div>
            ) : null}
          </Modal.Body>
        </Modal>
      </>
    );
  };

  const renderRelatedBooksPanel = () => {
    if (!post || post.type !== "book") return null;
    return (
      <section className="panel book-related-panel">
        <div className="panel-heading">
          <span>{t("detail.book.related.title")}</span>
          <strong>
            {relatedBooksLoading
              ? t("detail.common.loading")
              : formatNumber(locale, relatedBooks.length)}
          </strong>
        </div>

        {relatedBooks.length ? (
          <div className="book-related-list">
            {relatedBooks.map((book) => (
              <Link
                className="book-related-item"
                to={contentPath(book.type, book.id, book.title)}
                key={book.id}
              >
                <span className="book-related-cover">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <Icon name="book" />
                  )}
                </span>
                <span className="book-related-main">
                  <strong>
                    <MathInline text={book.book?.bookTitle || book.title} />
                  </strong>
                  <small>
                    {book.book?.authors?.join(" / ") || book.author}
                  </small>
                  <em>
                    {book.bookRating?.reviewCount
                      ? t("detail.book.related.rating", {
                          score: formatNumber(
                            locale,
                            book.bookRating.averageScore,
                            { maximumFractionDigits: 1 },
                          ),
                          count: book.bookRating.reviewCount,
                          displayCount: formatNumber(
                            locale,
                            book.bookRating.reviewCount,
                          ),
                        })
                      : t("detail.book.rating.none")}
                  </em>
                </span>
              </Link>
            ))}
          </div>
        ) : !relatedBooksLoading ? (
          <div className="state-strip">{t("detail.book.related.empty")}</div>
        ) : null}
      </section>
    );
  };

  const renderBookRatingStatsPanel = () => {
    if (!post || post.type !== "book") return null;
    const rating = bookRating || post.bookRating;
    const breakdown = rating?.breakdown || [];
    const reviewCount = rating?.reviewCount || 0;
    return (
      <section className="panel book-rating-stats-panel">
        <div className="panel-heading">
          <span>{t("detail.book.rating.statistics")}</span>
          <strong>
            {t("detail.book.rating.peopleCount", {
              count: reviewCount,
              displayCount: formatNumber(locale, reviewCount),
            })}
          </strong>
        </div>
        <div className="book-rating-stats-score">
          <strong>
            {rating?.averageScore
              ? formatNumber(locale, rating.averageScore, {
                  maximumFractionDigits: 1,
                })
              : t("detail.common.none")}
          </strong>
          <span>
            {rating?.averageScore
              ? t("detail.book.rating.starsOutOfFive", {
                  stars: formatNumber(locale, rating.averageScore / 2, {
                    maximumFractionDigits: 1,
                  }),
                })
              : t("detail.book.rating.awaiting")}
          </span>
        </div>
        <div className="book-rating-bars">
          {(breakdown.length
            ? breakdown
            : Array.from({ length: 10 }, (_, index) => {
                const score = 10 - index;
                return { score, stars: score / 2, count: 0, percent: 0 };
              })
          ).map((item) => (
            <div className="book-rating-bar-row" key={item.score}>
              <span>
                {t("detail.book.rating.starCount", {
                  stars: formatNumber(locale, item.stars, {
                    maximumFractionDigits: 1,
                  }),
                })}
              </span>
              <i aria-hidden="true">
                <b
                  style={{
                    width: `${Math.max(0, Math.min(100, item.percent))}%`,
                  }}
                />
              </i>
              <em>
                {formatNumber(locale, item.percent / 100, {
                  style: "percent",
                  maximumFractionDigits: 1,
                })}
              </em>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderDynamicArticleHeader = () => {
    if (!post || !isDynamicDetail) return null;
    const authorProfile = authorProfileId(post.authorId, post.authorUid);
    const authorPath = authorProfilePath(post.authorId, post.authorUid);
    const viewingOwnDynamic = sameUserId(
      currentUser?.id,
      post.authorUid || post.authorId,
    );
    return (
      <header className="dynamic-article-header">
        <div className="blog-article-topline">
          <div className="blog-article-taxonomy">
            <TypeMetaCategory type={displayKind} label={displayKindLabel} />
            <div className="blog-header-tags dynamic-header-tags">
              {tagLinksFor(post).map((tag) => (
                <Link to={tag.to} key={tag.key}>
                  {tag.label}
                </Link>
              ))}
            </div>
          </div>
          {renderContentHeaderActions()}
        </div>
        <div className="dynamic-author-row">
          <Link className="dynamic-author-card identity-link" to={authorPath}>
            <AvatarName
              name={post.author}
              imageUrl={avatarFromMap(
                post.author,
                post.authorAvatar,
                authorAvatars,
              )}
              rank={rankFromMap(post.author, post.authorRank, authorProfiles)}
              size="md"
            />
          </Link>
          <div className="dynamic-author-meta">
            <Link className="dynamic-author-name" to={authorPath}>
              <span>{post.author}</span>
              <CultivationBadge
                rank={rankFromMap(post.author, post.authorRank, authorProfiles)}
              />
            </Link>
            <div className="dynamic-author-subline">
              <span>{dateLabel(post.createdAt, locale)}</span>
              <span>{t("detail.dynamic.publishedUpdate")}</span>
            </div>
          </div>
          <div className="dynamic-author-actions">
            {authorProfile && !viewingOwnDynamic ? (
              <AnimateButton
                unstyled
                type="button"
                className={
                  dynamicAuthorFollowed
                    ? "dynamic-author-follow-button is-followed"
                    : "dynamic-author-follow-button"
                }
                onClick={toggleDynamicAuthorFollow}
                disabled={dynamicAuthorFollowBusy}
              >
                <Icon name={dynamicAuthorFollowed ? "check2" : "plus-lg"} />
                {dynamicAuthorFollowBusy
                  ? t("detail.common.syncing")
                  : dynamicAuthorFollowed
                    ? t("detail.dynamic.following")
                    : t("detail.dynamic.follow")}
              </AnimateButton>
            ) : null}
          </div>
        </div>
      </header>
    );
  };

  const renderRevisionPanel = () => {
    if (!post) return null;
    const objectId = question
      ? revisionObjectIdFromQuestion(question)
      : revisionObjectIdFromPost(post);
    const historyPath = revisionActivityPath(post, objectId);
    return (
      <section className="panel detail-revision-panel">
        <div className="panel-heading">
          <span>{t("detail.revisions.title")}</span>
          <Link to={historyPath}>
            {revisionLoading
              ? t("detail.common.syncing")
              : t("detail.common.all")}
          </Link>
        </div>

        {revisionItems.length ? (
          <div className="detail-revision-list">
            {revisionItems.map((revision) => (
              <Link
                to={revisionDetailActivityPath(post, objectId, revision.id)}
                className="detail-revision-item"
                key={revision.id}
              >
                <span>{dateLabel(revision.createdAt, locale)}</span>
                <strong>{revision.author || "Rinspace"}</strong>
                <small>
                  <MathInline
                    text={revisionSummaryText(
                      revision,
                      t("detail.revisions.updatedContent"),
                    )}
                  />
                </small>
              </Link>
            ))}
          </div>
        ) : revisionLoading ? (
          <LoadingState variant="compact" />
        ) : (
          <div className="state-strip compact">
            {t("detail.revisions.empty")}
          </div>
        )}
      </section>
    );
  };

  const renderBlogSourceStat = (activePost: PostDetail) => {
    if (kind !== "blog" || !hasBlogArticleBody(activePost)) return null;
    const editorKind = blogEditorKind(activePost);
    const source =
      editorKind === "markdown"
        ? markdownSourceFile(activePost)
        : editorKind === "typst"
          ? typstSourceFile(activePost)
          : rinWriterSourceFile(activePost.body) ||
            rinWriterArchive(activePost.body) ||
            rinWriterSourceFallbackFile(activePost.body);
    if (!source) return null;
    const editorLabel =
      editorKind === "markdown"
        ? "Markdown"
        : editorKind === "typst"
          ? "Typst"
          : "LaTeX";
    const repositoryUrl = articleGiteaSourcePath(activePost.id);
    const label = t("detail.article.giteaSource");
    const sourceHref = editorKind === "markdown" && activePost.repositorySource
      ? giteaSourceFilePageUrl(activePost.repositorySource.url) || repositoryUrl
      : repositoryUrl;
    const sourceMeta = formatBytes(source.bytes);
    const sourceTitle = t("detail.article.openGiteaSource", {
      filename: source.filename,
    });
    return (
      <div>
        <dt>{editorLabel}</dt>
        <dd>
          <a
            className="tex-source-link"
            href={sourceHref}
            rel="noreferrer"
            target="_blank"
            title={sourceTitle}
          >
            <Icon name="git" />
            <span>{label}</span>
            {sourceMeta ? <small>{sourceMeta}</small> : null}
          </a>
        </dd>
      </div>
    );
  };

  return (
    <>
      <DocumentMetadataController metadata={{
        title: `${title} - ${t('navigation:brandName')}`,
        description: post?.searchDescription || post?.excerpt,
        canonicalPath,
        robots: isBookReadingPage ? 'noindex,follow' : 'index,follow',
        openGraphType: 'article',
        jsonLd: post && !isBookReadingPage ? detailSearchGraph(post, canonicalPath) : undefined,
      }} />
      <SiteTopbar onSessionChange={refreshDetailSession} />
      <AnimateScrollProgress />

      <main
        className={`detail-shell detail-${kind}${kind === "question" ? " question-detail-shell" : ""}${isThreadLikeDetail ? " discussion-thread-shell" : ""}${isAnnouncementDetail ? " announcement-detail-shell" : ""}${isDynamicDetail ? " dynamic-detail-shell" : ""}${isBookReadingPage ? " book-reader-shell" : ""}${isBlogTypographyTest ? " detail-blog-typography-test" : ""}`}
        data-rin-public-document={
          kind === "blog" ? "article" : kind === "book" ? "book" : undefined
        }
        data-rin-object-id={
          kind === "blog" || kind === "book" ? post?.id : undefined
        }
        data-rin-public-version={
          kind === "blog" || kind === "book" ? post?.publicVersion : undefined
        }
        data-rin-content-digest={
          kind === "blog" || kind === "book" ? post?.contentDigest : undefined
        }
      >
        {showGenericDetailHeader ? (
          <section
            className={
              kind === "question"
                ? "detail-header question-detail-header"
                : "detail-header"
            }
          >
            <div className="detail-kicker">
              <TypeMetaCategory type={displayKind} label={displayKindLabel} />
            </div>
            <h1>
              <MathInline text={title} />
            </h1>
            {post ? (
              <div className="detail-meta-row">
                <Link
                  className="detail-author-link"
                  to={authorProfilePath(post.authorId, post.authorUid)}
                >
                  <AvatarName
                    name={post.author}
                    imageUrl={avatarFromMap(
                      post.author,
                      post.authorAvatar,
                      authorAvatars,
                    )}
                    rank={rankFromMap(
                      post.author,
                      post.authorRank,
                      authorProfiles,
                    )}
                  />
                </Link>
                <span>{dateLabel(post.createdAt, locale)}</span>
                {detailMetaText(post, displayKind) ? (
                  <span>
                    <MathInline text={detailMetaText(post, displayKind)} />
                  </span>
                ) : null}
                <strong>
                  {localizedInteractionText(post, isAnnouncementDetail)}
                </strong>
              </div>
            ) : null}
          </section>
        ) : null}

        {showBlockingLoading ? <LoadingState variant="panel" /> : null}

        {post && hasPrimaryDetail ? (
          <div
            className={
              isBookReadingPage
                ? `detail-grid book-reader-grid${bookReadTocItems.length ? "" : " book-reader-no-toc"}`
                : isDynamicDetail
                  ? "detail-grid dynamic-detail-grid"
                  : isAnnouncementDetail
                    ? "detail-grid announcement-no-side"
                    : kind === "blog" && !blogTocItems.length
                      ? "detail-grid blog-no-toc"
                      : "detail-grid"
            }
          >
            {isBookReadingPage && bookReadTocItems.length ? (
              <aside className="book-reader-toc-side">
                <BookReaderTableOfContents
                  items={bookReadTocItems}
                  activeId={
                    bookReaderTargetId || currentBookReaderPage?.id || ""
                  }
                  pageId={currentBookReaderPage?.id || ""}
                  pdfPageCount={bookPdfPageCount(post.book)}
                  onSelect={navigateBookReaderTarget}
                />
              </aside>
            ) : kind === "blog" && blogTocItems.length ? (
              <aside className="blog-toc-side">
                <BlogTableOfContents
                  items={activeArticleTocItems}
                  activeId={activeBlogTocId}
                  onSelect={navigateBlogTocTarget}
                />
              </aside>
            ) : null}
            <div className="detail-main">
              <article
                className={
                  question
                    ? "detail-article panel question-statement-panel"
                    : kind === "blog"
                      ? "detail-article panel blog-detail-article"
                      : isBookReadingPage
                        ? "detail-article panel book-reader-article"
                        : isDynamicDetail
                          ? "detail-article panel dynamic-detail-article"
                          : isThreadLikeDetail
                            ? "detail-article panel discussion-thread-panel"
                            : "detail-article panel"
                }
              >
                {kind !== "blog" &&
                kind !== "book" &&
                !isThreadLikeDetail &&
                !isDynamicDetail &&
                !question ? (
                  <div className="panel-heading large">
                    <div>
                      <span>
                        {post.type === "question"
                          ? t("detail.question.statement")
                          : t("detail.article.body")}
                      </span>
                      <strong>
                        {t(`detail.type.${displayTypeClass(kind)}`)}
                      </strong>
                    </div>
                    <div className="panel-heading-actions">
                      <AnimateButton
                        unstyled
                        type="button"
                        onClick={() =>
                          void openReport({
                            targetType: reportTypeForPost(post.type),
                            slug: post.slug || post.id,
                            title: post.title,
                          })
                        }
                      >
                        {t("detail.common.report")}
                      </AnimateButton>
                    </div>
                  </div>
                ) : null}
                {renderBlogArticleHeader()}
                {renderQuestionArticleHeader()}
                {renderDiscussionArticleHeader()}
                {renderDynamicArticleHeader()}
                {renderBookArticleHeader()}
                {renderArticleReadingDock()}
                <div
                  className={
                    post.type === "question" && question
                      ? "question-statement-layout"
                      : "detail-body-layout"
                  }
                >
                  {post.type === "question" && question ? (
                    <aside className="question-vote-rail">
                      {renderVoteControls(
                        "question",
                        Number(question.question.id),
                        question.question.voteCount,
                        t("detail.question.voteLabel"),
                      )}
                    </aside>
                  ) : null}
                  <div className="question-statement-content">
                    {kind !== "blog" &&
                    kind !== "book" &&
                    !isThreadLikeDetail &&
                    !isDynamicDetail &&
                    !question ? (
                      <div className="detail-tags">
                        {tagsFor(post).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    {isThreadLikeDetail ? (
                      <>
                        <div className="discussion-main-floor">
                          <span className="floor-badge">
                            {isAnnouncementDetail
                              ? t("detail.type.announcement")
                              : t("detail.discussion.firstFloor")}
                          </span>
                          <Link
                            className="discussion-floor-author identity-link"
                            to={authorProfilePath(
                              post.authorId,
                              post.authorUid,
                            )}
                          >
                            <AvatarName
                              name={post.author}
                              imageUrl={avatarFromMap(
                                post.author,
                                post.authorAvatar,
                                authorAvatars,
                              )}
                              rank={rankFromMap(
                                post.author,
                                post.authorRank,
                                authorProfiles,
                              )}
                              size="md"
                            />
                          </Link>
                          <span className="owner-badge">
                            {isAnnouncementDetail
                              ? t("detail.discussion.publisher")
                              : t("detail.comments.owner")}
                          </span>
                          <span>{dateLabel(post.createdAt, locale)}</span>
                        </div>
                        <h1 className="discussion-floor-title">
                          <MathInline text={title} />
                        </h1>
                      </>
                    ) : null}
                    {question && editingQuestion ? (
                      <Form
                        className="question-edit-form"
                        onSubmit={saveQuestionEdit}
                      >
                        <Form.Group controlId="question-edit-title">
                          <Form.Label>
                            {t("detail.question.edit.title")}
                          </Form.Label>
                          <Form.Control
                            value={questionEditTitle}
                            maxLength={150}
                            onChange={(event) =>
                              setQuestionEditTitle(event.currentTarget.value)
                            }
                          />
                        </Form.Group>
                        <Form.Group controlId="question-edit-body">
                          <Form.Label>
                            {t("detail.question.edit.body")}
                          </Form.Label>
                          <CodeMirrorEditor
                            id="question-edit-body"
                            value={questionEditBody}
                            minHeight="220px"
                            ariaLabel={t("detail.question.edit.bodyAria")}
                            placeholder={t(
                              "detail.question.edit.bodyPlaceholder",
                            )}
                            editorRef={questionEditBodyEditorRef}
                            onChange={setQuestionEditBody}
                          />
                        </Form.Group>
                        <Form.Group controlId="question-edit-tags">
                          <Form.Label>{t("detail.common.tags")}</Form.Label>
                          <TagPicker
                            value={splitTagValues(questionEditTags).slice(0, 6)}
                            onChange={(next) =>
                              setQuestionEditTags(joinTagValues(next))
                            }
                            disabled={questionEditBusy}
                            ariaLabel={t("detail.question.edit.tagsAria")}
                          />
                        </Form.Group>
                        {questionEditBody.trim() ? (
                          <div className="math-preview compact">
                            <MathText text={questionEditBody} />
                          </div>
                        ) : null}

                        <div className="question-edit-actions">
                          <span>{questionEditBody.trim().length}</span>
                          <AnimateButton
                            unstyled
                            type="button"
                            className="answer-resolution-action"
                            disabled={questionEditBusy}
                            onClick={cancelQuestionEdit}
                          >
                            {t("detail.common.cancel")}
                          </AnimateButton>
                          <Button
                            className="secondary-button"
                            type="submit"
                            disabled={questionEditBusy}
                          >
                            {questionEditBusy
                              ? t("detail.common.saving")
                              : t("detail.common.saveRevision")}
                          </Button>
                        </div>
                      </Form>
                    ) : (
                      <div
                        className={
                          isDynamicDetail ? "dynamic-content-flow" : undefined
                        }
                      >
                        {(() => {
                          if (post.type === "book" && !isBookReadingPage)
                            return null;
                          const bodyHtml = isBookReadingPage
                            ? currentBookReaderPageHtml
                            : kind === "blog"
                              ? blogArticleBodyHtml
                              : post.type === "question"
                                ? markdownArticleHtml(post.body)
                                : rinWriterHtml(post.body);
                          if (
                            post.type === "book" &&
                            isBookReadingPage &&
                            !bodyHtml
                          )
                            return null;
                          const shouldCollapseDynamicBody =
                            isDynamicDetail && post.body.trim().length > 420;
                          const isMarkdownBlog =
                            kind === "blog" &&
                            blogEditorKind(post) === "markdown";
                          const isRinWriterBlog =
                            kind === "blog" && !isMarkdownBlog;
                          const shouldDeferArticleMath =
                            isBookReadingPage ||
                            post.type === "question" ||
                            isMarkdownBlog;
                          const bodyClassName = isBookReadingPage
                            ? "detail-body detail-body-no-section-intro"
                            : detailBodyClassName(post);
                          const bodyNode = (
                            <div
                              className={bodyClassName}
                              data-rin-primary-text={
                                kind === "blog" ? "article" : undefined
                              }
                              ref={
                                isBookReadingPage
                                  ? bookAnnotationArticleRef
                                  : undefined
                              }
                            >
                              {post.type === "question" ? (
                                <MilkdownMarkdownArticle markdown={post.body} />
                              ) : bodyHtml ? (
                                <RinWriterArticle
                                  html={bodyHtml}
                                  title={post.title}
                                  removeGeneratedToc={isBookReadingPage}
                                  deferMath={shouldDeferArticleMath}
                                  serverFinal={
                                    kind === "blog"
                                      ? blogArticle.serverFinal
                                      : isBookReadingPage &&
                                        (bookReaderPage?.source ===
                                          "markdown-book-renderer" ||
                                          bookReaderPage?.source === "stored")
                                  }
                                  onReaderReference={
                                    isBookReadingPage
                                      ? navigateBookReaderTarget
                                      : undefined
                                  }
                                  enableBibliographyHashNavigation={
                                    isRinWriterBlog
                                  }
                                  enableInternalLinkPreviews={
                                    kind === "blog" || isBookReadingPage
                                  }
                                />
                              ) : post.type === "blog" ? (
                                <div className="book-reader-empty">
                                  <strong>
                                    {t("detail.article.renderUnavailable")}
                                  </strong>
                                  <span>
                                    {t("detail.article.noBrowserFallback")}
                                  </span>
                                </div>
                              ) : post.type === "book" ? null : (
                                <MathText text={post.body} />
                              )}
                            </div>
                          );
                          if (!shouldCollapseDynamicBody) return bodyNode;
                          return (
                            <div
                              className={
                                dynamicBodyExpanded
                                  ? "dynamic-body-collapsible is-expanded"
                                  : "dynamic-body-collapsible"
                              }
                            >
                              <div className="dynamic-body-collapsible-content">
                                {bodyNode}
                              </div>
                              <AnimateButton
                                unstyled
                                type="button"
                                className="dynamic-body-toggle"
                                onClick={() =>
                                  setDynamicBodyExpanded(
                                    (expanded) => !expanded,
                                  )
                                }
                              >
                                {dynamicBodyExpanded
                                  ? t("detail.dynamic.collapseBody")
                                  : t("detail.dynamic.expandBody")}
                                <Icon
                                  name={
                                    dynamicBodyExpanded
                                      ? "chevron-up"
                                      : "chevron-down"
                                  }
                                />
                              </AnimateButton>
                            </div>
                          );
                        })()}
                        {renderDynamicImages()}
                      </div>
                    )}
                    {isThreadLikeDetail && post.images?.length ? (
                      <div className="discussion-detail-images">
                        {post.images.slice(0, 9).map((image, index) => (
                          <a
                            href={image}
                            target="_blank"
                            rel="noreferrer"
                            key={`${image}-${index}`}
                          >
                            <img
                              src={image}
                              alt={t("detail.discussion.imageAlt", {
                                index: formatNumber(locale, index + 1),
                              })}
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                {isBookReadingPage ? renderBookReaderPageFooter() : null}
                {!isBookReadingPage ? renderBookOverviewIntro() : null}
                {!isBookReadingPage ? renderBookMetadata() : null}
                {!isBookReadingPage ? renderBookActivityShelf() : null}
                {!isBookReadingPage ? renderBookReviews() : null}
                {post.type !== "book" ? renderDynamicSocialProof() : null}
                {post.type !== "book" ? renderDynamicRepostComposer() : null}
                {!isDynamicDetail && post.type !== "book"
                  ? kind === "blog"
                    ? renderBlogLikeSection(false)
                    : renderReactionBar(false)
                  : null}
                {question ? (
                  renderQnaCommentThread(
                    t("detail.question.comments"),
                    questionComments,
                    {
                      targetType: "question",
                      targetId: Number(question.question.id),
                    },
                    "comment-thread question-comments",
                    true,
                  )
                ) : hasUnifiedContentComments ? (
                  renderUnifiedContentComments()
                ) : post.type === "book" ? null : (
                  <section
                    className={
                      isThreadLikeDetail
                        ? "comment-thread post-comment-thread discussion-reply-thread"
                        : isDynamicDetail
                          ? "comment-thread post-comment-thread dynamic-comment-thread"
                          : "comment-thread post-comment-thread"
                    }
                    id="content-comments"
                  >
                    <div className="panel-heading">
                      {isDynamicDetail ? (
                        renderDynamicInteractionTabs()
                      ) : (
                        <>
                          <span>
                            {kind === "blog"
                              ? t("detail.comments.articleComments")
                              : isThreadLikeDetail
                                ? isAnnouncementDetail
                                  ? t("detail.comments.announcementResponses")
                                  : t("detail.comments.floorReplies")
                                : t("detail.comments.contentComments")}
                          </span>
                          <strong>
                            {isThreadLikeDetail
                              ? `${formatNumber(locale, visibleDiscussionComments.length)} / ${formatNumber(locale, topLevelPostComments.length)}`
                              : formatNumber(locale, postComments.length)}
                          </strong>
                        </>
                      )}
                      {isDynamicDetail && dynamicInteractionTab === "comments"
                        ? renderDynamicCommentToolbar()
                        : null}
                    </div>
                    {isThreadLikeDetail && topLevelPostComments.length
                      ? renderDiscussionReplyToolbar()
                      : null}

                    {isDynamicDetail && dynamicInteractionTab === "reposts" ? (
                      renderDynamicRepostUsers()
                    ) : isDynamicDetail && dynamicInteractionTab === "likes" ? (
                      renderDynamicLikeUsers()
                    ) : (
                      <>
                        {isDynamicDetail && !inlineDynamicReplyTarget
                          ? renderCommentForm(
                              {
                                targetType: postCommentTarget(post),
                                slug: post.slug || post.id,
                              },
                              t("detail.comments.join"),
                              "",
                              { className: "dynamic-comment-composer" },
                            )
                          : null}
                        {isDynamicDetail
                          ? renderDynamicHotCommentPreview()
                          : null}
                        {renderCommentList(
                          isThreadLikeDetail
                            ? visibleDiscussionComments
                            : isDynamicDetail
                              ? visibleDynamicComments
                              : postComments,
                          {
                            floorMode: isThreadLikeDetail,
                            floorOffset: 2,
                            floorNumbers: isThreadLikeDetail
                              ? discussionFloorNumbers
                              : undefined,
                            floorUnit: isAnnouncementDetail
                              ? t("detail.discussion.responseUnit")
                              : undefined,
                            ownerPost: isThreadLikeDetail ? post : undefined,
                            ownerId: isThreadLikeDetail
                              ? post.authorUid || post.authorId
                              : undefined,
                            ownerLabel: isAnnouncementDetail
                              ? t("detail.discussion.publisher")
                              : undefined,
                            ownerName: isThreadLikeDetail
                              ? post.author
                              : undefined,
                            replyActionLabel: isAnnouncementDetail
                              ? t("detail.discussion.respond")
                              : undefined,
                            replyTarget:
                              isThreadLikeDetail || isDynamicDetail
                                ? {
                                    targetType: postCommentTarget(post),
                                    slug: post.slug || post.id,
                                  }
                                : undefined,
                            childComments: isDynamicDetail
                              ? dynamicChildComments
                              : isThreadLikeDetail
                                ? discussionChildComments
                                : undefined,
                            nestedReplies: isDynamicDetail,
                          },
                        )}
                        {!isDynamicDetail
                          ? renderCommentForm(
                              {
                                targetType: postCommentTarget(post),
                                slug: post.slug || post.id,
                              },
                              kind === "blog"
                                ? t("detail.comments.articleComments")
                                : isThreadLikeDetail
                                  ? isAnnouncementDetail
                                    ? t("detail.comments.respondAnnouncement")
                                    : t("detail.comments.replyPost")
                                  : t("detail.comments.contentComments"),
                              kind === "blog"
                                ? ""
                                : isThreadLikeDetail
                                  ? ""
                                  : "",
                              isThreadLikeDetail
                                ? isAnnouncementDetail
                                  ? {
                                      replyContextUnit: t(
                                        "detail.discussion.responseUnit",
                                      ),
                                    }
                                  : {
                                      className: "discussion-comment-composer",
                                      withAvatar: true,
                                    }
                                : undefined,
                            )
                          : null}
                      </>
                    )}
                  </section>
                )}
              </article>

              {isDynamicDetail ? (
                <div className="dynamic-detail-icp">
                  <SiteIcpLink />
                </div>
              ) : null}

              {question ? (
                <section className="question-answer-panel panel">
                  <div className="answer-section-head" id="answerHeader">
                    <div>
                      <span>{t("detail.answers.title")}</span>
                      <strong>
                        {t("detail.answers.count", {
                          count: question.answers.length,
                          displayCount: formatNumber(
                            locale,
                            question.answers.length,
                          ),
                        })}
                      </strong>
                    </div>
                    <div
                      className="answer-sort-tabs"
                      aria-label={t("detail.answers.sortLabel")}
                    >
                      <AnimateButton
                        unstyled
                        type="button"
                        className={answerOrder === "hot" ? "active" : ""}
                        onClick={() => setAnswerOrder("hot")}
                      >
                        {t("detail.sort.hot")}
                      </AnimateButton>
                      <AnimateButton
                        unstyled
                        type="button"
                        className={answerOrder === "asc" ? "active" : ""}
                        onClick={() => setAnswerOrder("asc")}
                      >
                        {t("detail.sort.asc")}
                      </AnimateButton>
                      <AnimateButton
                        unstyled
                        type="button"
                        className={answerOrder === "desc" ? "active" : ""}
                        onClick={() => setAnswerOrder("desc")}
                      >
                        {t("detail.sort.desc")}
                      </AnimateButton>
                    </div>
                  </div>

                  {sortedAnswers.length ? (
                    <div className="answer-list">
                      {sortedAnswers.map((answer) => (
                        <article
                          className={
                            answer.accepted
                              ? "answer-card accepted"
                              : "answer-card"
                          }
                          key={answer.id}
                        >
                          {renderVoteControls(
                            "answer",
                            answer.id,
                            answer.voteCount,
                            t("detail.answers.voteLabel"),
                          )}
                          <div className="answer-card-main">
                            <div className="answer-card-head">
                              <div className="answer-author-line">
                                <UserIdentity
                                  name={answer.author}
                                  userId={answer.authorId || answer.author}
                                  imageUrl={avatarFromMap(
                                    answer.author,
                                    answer.authorAvatar,
                                    authorAvatars,
                                  )}
                                  rank={rankFromMap(
                                    answer.author,
                                    answer.authorRank,
                                    authorProfiles,
                                  )}
                                  size="md"
                                  variant="prominent"
                                />
                                <span>{dateLabel(answer.createdAt, locale)}</span>
                                <span>
                                  {t("detail.answers.commentCount", {
                                    count: answer.commentCount,
                                    displayCount: formatNumber(
                                      locale,
                                      answer.commentCount,
                                    ),
                                  })}
                                </span>
                              </div>
                              {answer.accepted ? (
                                <strong>
                                  <Icon name="check-circle-fill" />
                                  {t("detail.answers.accepted")}
                                </strong>
                              ) : null}
                            </div>
                            {editingAnswerId === answer.id ? (
                              <Form
                                className="answer-edit-form"
                                onSubmit={(event) =>
                                  void saveAnswerEdit(event, answer.id)
                                }
                              >
                                <Form.Group
                                  controlId={`answer-edit-${answer.id}`}
                                >
                                  <Form.Label>
                                    {t("detail.answers.edit.title")}
                                  </Form.Label>
                                  <RinMilkdownEditor
                                    id={`answer-edit-${answer.id}`}
                                    value={answerEditDraft}
                                    minHeight="180px"
                                    ariaLabel={t(
                                      "detail.answers.edit.bodyAria",
                                      {
                                        id: formatNumber(locale, answer.id),
                                      },
                                    )}
                                    placeholder={t(
                                      "detail.answers.edit.bodyPlaceholder",
                                    )}
                                    ref={answerEditEditorRef}
                                    onChange={setAnswerEditDraft}
                                    readOnly={Boolean(answerMutationBusyKey)}
                                    onError={setAnswerMutationError}
                                  />
                                </Form.Group>
                                <Form.Group
                                  controlId={`answer-edit-summary-${answer.id}`}
                                >
                                  <Form.Label>
                                    {t("detail.answers.edit.summary")}
                                  </Form.Label>
                                  <Form.Control
                                    value={answerEditSummary}
                                    maxLength={120}
                                    placeholder={t(
                                      "detail.answers.edit.summaryPlaceholder",
                                    )}
                                    onChange={(event) =>
                                      setAnswerEditSummary(
                                        event.currentTarget.value,
                                      )
                                    }
                                  />
                                </Form.Group>
                                <div className="answer-edit-actions">
                                  <span>{answerEditDraft.trim().length}</span>
                                  <AnimateButton
                                    unstyled
                                    type="button"
                                    className="answer-resolution-action"
                                    disabled={Boolean(answerMutationBusyKey)}
                                    onClick={cancelAnswerEdit}
                                  >
                                    {t("detail.common.cancel")}
                                  </AnimateButton>
                                  <Button
                                    className="secondary-button"
                                    type="submit"
                                    disabled={Boolean(answerMutationBusyKey)}
                                  >
                                    {answerMutationBusyKey ===
                                    `edit-${answer.id}`
                                      ? t("detail.common.saving")
                                      : t("detail.common.saveRevision")}
                                  </Button>
                                </div>
                              </Form>
                            ) : (
                              <div className="answer-body">
                                <MilkdownMarkdownArticle
                                  markdown={answer.body}
                                />
                              </div>
                            )}
                            <div className="answer-actions-row">
                              {canManageAnswer(answer) ? (
                                <>
                                  <AnimateButton
                                    unstyled
                                    type="button"
                                    className="answer-resolution-action"
                                    disabled={Boolean(answerMutationBusyKey)}
                                    onClick={() => startAnswerEdit(answer)}
                                  >
                                    {t("detail.common.edit")}
                                  </AnimateButton>
                                  <AnimateButton
                                    unstyled
                                    type="button"
                                    className={
                                      answerDeleteConfirmId === answer.id
                                        ? "answer-resolution-action danger active"
                                        : "answer-resolution-action danger"
                                    }
                                    disabled={Boolean(answerMutationBusyKey)}
                                    onClick={() => void deleteAnswer(answer.id)}
                                  >
                                    {answerMutationBusyKey ===
                                    `delete-${answer.id}`
                                      ? t("detail.common.deleting")
                                      : answerDeleteConfirmId === answer.id
                                        ? t("detail.common.confirmDelete")
                                        : t("detail.common.delete")}
                                  </AnimateButton>
                                </>
                              ) : null}
                              {canAcceptQuestionAnswer ? (
                                <AnimateButton
                                  unstyled
                                  type="button"
                                  className={
                                    answer.accepted
                                      ? "answer-resolution-action active"
                                      : "answer-resolution-action"
                                  }
                                  disabled={Boolean(acceptBusyKey)}
                                  onClick={() =>
                                    void setAcceptedAnswer(
                                      answer.id,
                                      answer.accepted,
                                    )
                                  }
                                >
                                  {acceptBusyKey === `accept-${answer.id}`
                                    ? t("detail.common.syncing")
                                    : answer.accepted
                                      ? t("detail.answers.unaccept")
                                      : t("detail.answers.accept")}
                                </AnimateButton>
                              ) : null}
                              <AnimateButton
                                unstyled
                                type="button"
                                className="inline-report-button"
                                onClick={() =>
                                  void openReport({
                                    targetType: "answer",
                                    objectId: answer.id,
                                    title: t("detail.answers.reportTitle", {
                                      id: formatNumber(locale, answer.id),
                                    }),
                                  })
                                }
                              >
                                {t("detail.common.report")}
                              </AnimateButton>
                            </div>
                            {renderQnaCommentThread(
                              t("detail.answers.comments"),
                              answerComments[answer.id] || [],
                              { targetType: "answer", targetId: answer.id },
                              "answer-comments",
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="state-strip">
                      {t("detail.answers.empty")}
                    </div>
                  )}

                  <div className="answer-workbench" id="answer-composer">
                    <div className="panel-heading large">
                      <div>
                        <span>{t("detail.answers.write")}</span>
                        <strong>
                          {questionAnswerLocked
                            ? t(
                                `detail.questionStatus.${questionStatusKey(question.question.status)}`,
                              )
                            : hasSession
                              ? t("detail.answers.ready")
                              : t("detail.answers.loginRequired")}
                        </strong>
                      </div>
                    </div>
                    {questionAnswerLocked ? (
                      <div className="state-strip">
                        {questionDeleted
                          ? t("detail.answers.deletedNotice")
                          : t("detail.answers.closedNotice")}
                      </div>
                    ) : (
                      <Form className="answer-composer" onSubmit={submitAnswer}>
                        <Form.Group controlId="answer-body">
                          <Form.Label>
                            {t("detail.answers.composer.body")}
                          </Form.Label>
                          <RinMilkdownEditor
                            id="answer-body"
                            value={answerDraft}
                            minHeight="220px"
                            ariaLabel={t("detail.answers.composer.body")}
                            placeholder={t(
                              "detail.answers.composer.placeholder",
                            )}
                            ref={answerEditorRef}
                            onChange={setAnswerDraft}
                            readOnly={submittingAnswer || !hasSession}
                            onError={setAnswerError}
                          />
                        </Form.Group>

                        <div className="answer-composer-actions">
                          <span>{answerLength}</span>
                          {hasSession ? (
                            <Button
                              className="primary-button"
                              type="submit"
                              disabled={!canSubmitAnswer}
                            >
                              {submittingAnswer
                                ? t("detail.common.publishing")
                                : t("detail.answers.publish")}
                            </Button>
                          ) : (
                            <Link className="primary-button" to="/#login">
                              {t("detail.answers.loginToAnswer")}
                            </Link>
                          )}
                        </div>
                      </Form>
                    )}
                  </div>
                </section>
              ) : null}
            </div>

            {isBookReadingPage && bookReaderPage?.publicationCommit ? (
              <BookAnnotationsLayer
                bookRef={contentRef}
                pageId={bookReaderPage.page.id}
                publicationCommit={bookReaderPage.publicationCommit}
                capabilities={bookReaderPage.capabilities}
                articleRef={bookAnnotationArticleRef}
                hasSession={hasSession}
              />
            ) : null}

            {post.type === "book" && !isBookReadingPage ? (
              <aside className="detail-side book-detail-side">
                {renderRelatedBooksPanel()}
                {renderBookRatingStatsPanel()}
                <PublicationProgressPanel progress={publicationProgress} />
                <SiteIcpLink />
              </aside>
            ) : !isBookReadingPage &&
              !isDynamicDetail &&
              !isAnnouncementDetail ? (
              <aside
                className={
                  question ? "detail-side question-detail-side" : "detail-side"
                }
              >
                {question ? (
                  <QuestionNetworkPanel
                    title={t("detail.questionNetwork.related")}
                    questions={relatedQuestions}
                    loading={relatedQuestionsLoading}
                    errorKey={relatedQuestionsError}
                    showEmpty
                  />
                ) : null}
                {!question ? (
                  <section
                    className={
                      kind === "blog"
                        ? "panel blog-side-summary"
                        : isThreadLikeDetail
                          ? "panel discussion-side-summary"
                          : "panel"
                    }
                  >
                    <div className="panel-heading">
                      <span>
                        {kind === "blog"
                          ? t("detail.sidebar.articleInfo")
                          : isThreadLikeDetail
                            ? isAnnouncementDetail
                              ? t("detail.sidebar.announcementInfo")
                              : t("detail.sidebar.postInfo")
                            : t("detail.sidebar.status")}
                      </span>
                      <strong>
                        {t(`detail.type.${displayTypeClass(kind)}`)}
                      </strong>
                    </div>
                    {kind === "blog" || isThreadLikeDetail ? (
                      <Link
                        className={
                          isThreadLikeDetail
                            ? "blog-side-author discussion-side-author identity-link"
                            : "blog-side-author identity-link"
                        }
                        to={authorProfilePath(post.authorId, post.authorUid)}
                        title={post.author}
                      >
                        <AvatarName
                          name={post.author}
                          imageUrl={avatarFromMap(
                            post.author,
                            post.authorAvatar,
                            authorAvatars,
                          )}
                          rank={rankFromMap(
                            post.author,
                            post.authorRank,
                            authorProfiles,
                          )}
                          size="md"
                        />
                        {kind !== "blog" ? (
                          <span>
                            {isDiscussionDetail
                              ? t("detail.sidebar.ownerProfile")
                              : isAnnouncementDetail
                                ? t("detail.sidebar.publisherProfile")
                                : question
                                  ? t("detail.sidebar.questionOwnerProfile")
                                  : t("detail.sidebar.authorProfile")}
                          </span>
                        ) : null}
                      </Link>
                    ) : null}
                    <dl className="detail-stats">
                      {kind !== "blog" && !isThreadLikeDetail ? (
                        <div>
                          <dt>{t("comments.author")}</dt>
                          <dd>{post.author}</dd>
                        </div>
                      ) : null}
                      {isThreadLikeDetail && !isDiscussionPostDetail ? (
                        <>
                          <div>
                            <dt>
                              {isAnnouncementDetail
                                ? t("detail.discussion.respond")
                                : t("detail.comments.reply")}
                            </dt>
                            <dd>{formatNumber(locale, postComments.length)}</dd>
                          </div>
                          <div>
                            <dt>
                              {isAnnouncementDetail
                                ? t("detail.discussion.publisher")
                                : t("detail.discussion.ownerOnly")}
                            </dt>
                            <dd>
                              {formatNumber(
                                locale,
                                discussionOwnerComments.length,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>{t("detail.sort.hot")}</dt>
                            <dd>{formatNumber(locale, hotDiscussionCount)}</dd>
                          </div>
                          <div>
                            <dt>{t("detail.reading.reads")}</dt>
                            <dd>{formatNumber(locale, post.readCount)}</dd>
                          </div>
                        </>
                      ) : null}
                      {kind !== "blog" ? (
                        <div>
                          <dt>{t("detail.sidebar.interactions")}</dt>
                          <dd>
                            {localizedInteractionText(
                              post,
                              isAnnouncementDetail,
                            )}
                          </dd>
                        </div>
                      ) : null}
                      {primaryBookContext ? (
                        <>
                          <div>
                            <dt>{t("detail.type.book")}</dt>
                            <dd>
                              <Link
                                to={bookChapterPath(
                                  primaryBookContext.bookId,
                                  primaryBookContext.bookTitle,
                                  primaryBookContext.chapterKey,
                                )}
                              >
                                <MathInline
                                  text={primaryBookContext.bookTitle}
                                />
                              </Link>
                            </dd>
                          </div>
                          <div>
                            <dt>{t("detail.sidebar.chapter")}</dt>
                            <dd>
                              <Link
                                to={bookChapterPath(
                                  primaryBookContext.bookId,
                                  primaryBookContext.bookTitle,
                                  primaryBookContext.chapterKey,
                                )}
                              >
                                {bookChapterFullLabel(primaryBookContext)}
                              </Link>
                            </dd>
                          </div>
                        </>
                      ) : null}
                      {collectionCount !== null &&
                      kind !== "blog" &&
                      !isDiscussionPostDetail ? (
                        <div>
                          <dt>{t("detail.collection.bookmark")}</dt>
                          <dd>{formatNumber(locale, collectionCount)}</dd>
                        </div>
                      ) : null}
                      {(post.type === "discussion" ||
                        post.type === "forum" ||
                        post.type === "announcement") &&
                      post.tags.length &&
                      !isDiscussionPostDetail ? (
                        <div>
                          <dt>{t("detail.common.tags")}</dt>
                          <dd>{post.tags.slice(0, 3).join(" · ")}</dd>
                        </div>
                      ) : null}
                      {post.type === "dynamic" || post.type === "status" ? (
                        <div>
                          <dt>{t("detail.sidebar.fluidity")}</dt>
                          <dd>{t("detail.sidebar.shortUpdate")}</dd>
                        </div>
                      ) : null}
                      {kind === "blog" ? renderBlogSourceStat(post) : null}
                    </dl>
                    {kind === "blog" ? renderBlogLikeSection(true) : null}
                  </section>
                ) : null}
                {renderBookContextPanel()}
                {kind === "blog" || isThreadLikeDetail ? (
                  <section className="panel discussion-participants-panel">
                    <div className="panel-heading">
                      <span>
                        {kind === "blog"
                          ? t("detail.sidebar.commentParticipants")
                          : isAnnouncementDetail
                            ? t("detail.sidebar.responseParticipants")
                            : t("detail.sidebar.discussionParticipants")}
                      </span>
                      <strong>
                        {formatNumber(locale, contentParticipants.length)}
                      </strong>
                    </div>
                    <div className="discussion-participant-avatars">
                      {contentParticipants.map((participant) => (
                        <Link
                          className="discussion-participant-avatar"
                          to={authorProfilePath(participant.profileId)}
                          title={participant.name}
                          aria-label={participant.name}
                          key={participant.key}
                        >
                          <AvatarName
                            name={participant.name}
                            imageUrl={participant.avatar}
                            rank={participant.rank}
                            size="sm"
                          />
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
                {isThreadLikeDetail ? renderRevisionPanel() : null}
                {!isThreadLikeDetail && kind !== "blog"
                  ? renderReadingPanel()
                  : null}
                {!isThreadLikeDetail && kind !== "blog"
                  ? renderInvitePanel()
                  : null}
                {!isThreadLikeDetail && kind !== "blog" && !question ? (
                  <section className="panel detail-collection-panel">
                    <div className="panel-heading">
                      <span>
                        {question
                          ? t("detail.collection.bookmarkQuestion")
                          : t("detail.collection.bookmark")}
                      </span>
                      <strong>
                        {collectionCount === null
                          ? t("detail.collection.available")
                          : formatNumber(locale, collectionCount)}
                      </strong>
                    </div>

                    {bookmarked && collectionFolderId ? (
                      <div className="detail-collection-target">
                        {t("detail.collection.savedTo", {
                          folder:
                            collectionFolders.find(
                              (folder) => folder.id === collectionFolderId,
                            )?.name || t("detail.collection.folder"),
                        })}
                        {collectionRecordId ? (
                          <span>#{collectionRecordId}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {renderCollectionAction(false, "collection-toggle")}
                    {bookmarked && hasSession ? (
                      <AnimateButton
                        unstyled
                        type="button"
                        className="detail-collection-change"
                        disabled={collectionBusy}
                        onClick={openCollectionDialog}
                      >
                        {t("detail.collection.changeFolder")}
                      </AnimateButton>
                    ) : null}
                  </section>
                ) : null}
                {!isThreadLikeDetail && kind !== "blog" && kind !== "book" && !question ? (
                  <section className="panel detail-report-panel">
                    <AnimateButton
                      unstyled
                      type="button"
                      className="collection-toggle"
                      onClick={() =>
                        void openReport({
                          targetType: reportTypeForPost(post.type),
                          slug: post.slug || post.id,
                          title: post.title,
                        })
                      }
                    >
                      <Icon name="flag" />
                      {t("detail.common.report")}
                    </AnimateButton>
                  </section>
                ) : null}
                {!isThreadLikeDetail && kind !== "blog"
                  ? renderRevisionPanel()
                  : null}
                {!isThreadLikeDetail && kind !== "blog" && !question ? (
                  <section className="panel detail-jump">
                    <Link to="/">{t("detail.jump.home")}</Link>
                    <Link
                      to={revisionActivityPath(
                        post,
                        question
                          ? revisionObjectIdFromQuestion(question)
                          : revisionObjectIdFromPost(post),
                      )}
                    >
                      {t("detail.jump.revisionHistory")}
                    </Link>
                    <Link
                      to={
                        kind === "question"
                          ? "/#questions"
                          : kind === "dynamic" || kind === "status"
                            ? "/dynamics"
                            : kind === "announcement"
                              ? "/announcements"
                              : kind === "discussion" || kind === "forum"
                                ? "/discussions"
                                : "/#feed"
                      }
                    >
                      {t("detail.jump.adjacentContent")}
                    </Link>
                    {question ? (
                      <a href="#answer-composer">
                        {t("detail.answers.write")}
                      </a>
                    ) : null}
                  </section>
                ) : null}
                {question ? (
                  <QuestionNetworkPanel
                    title={t("detail.questionNetwork.linked")}
                    questions={linkedQuestions}
                    loading={linkedQuestionsLoading}
                    errorKey={linkedQuestionsError}
                    moreTo={
                      post.type === "question"
                        ? `/linked/${encodeURIComponent(post.id)}`
                        : undefined
                    }
                  />
                ) : null}
                {kind === "blog" ? (
                  <PublicationProgressPanel progress={publicationProgress} />
                ) : null}
                <SiteIcpLink />
              </aside>
            ) : null}
          </div>
        ) : null}
      </main>

      <BookProfileDialog
        open={quickEditOpen}
        post={post}
        user={currentUser}
        variant={post?.type === "blog" ? "article" : "book"}
        onClose={() => setQuickEditOpen(false)}
        onSaved={applyPostMainDetail}
      />
      {renderCollectionDialog()}
      {renderReportDialog()}
      {renderDynamicImageViewer()}
    </>
  );
}

export {
  BlogTableOfContents,
  BookReaderTableOfContents,
  QuestionNetworkPanel,
  RinWriterArticle,
  bookPdfPageCount,
  bookReaderPageCounts,
};
export default DetailPage;

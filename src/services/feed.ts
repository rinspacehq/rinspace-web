import { publicEnv } from "@/app/config/env";
import { beginEditorOpenTrace } from "@/utils/editorOpenTrace";
import {
  authHeaders as sessionAuthHeaders,
  forceRefreshAuthSession,
  getAuthAccessToken,
  getAuthDeviceId,
  getStoredSession,
} from "./phoneAuth";
import {
  contentDeletionCommand,
  contentDeletionStepUpHeader,
} from "./contentDeletion";
import { ServiceError } from "./httpClient";

export type CachedSnapshot<T> = {
  data: T;
  cachedAt: number;
};

const responseCacheVersion = 1;
const responseCachePrefix = "rinspace-response-cache";

export type ContentType =
  | "blog"
  | "question"
  | "discussion"
  | "announcement"
  | "dynamic"
  | "book"
  | "forum"
  | "status"
  | "task"
  | "tag";
export type PublishContentType =
  | "blog"
  | "question"
  | "discussion"
  | "announcement"
  | "dynamic"
  | "book";

export type BookKind = "original" | "copyrighted" | "markdown" | "typst";

export type BookISBN = {
  kind: "hardcover" | "softcover" | "ebook" | "other";
  value: string;
  publishedAt?: string;
};

export type BookTOCItem = {
  title: string;
  page?: number;
  level?: number;
};

export type BookAuthor = {
  id: string;
  name: string;
  sortName?: string;
  bio?: string;
  officialUrl?: string;
  bookCount?: number;
};

export type BookMetadata = {
  kind: BookKind;
  bookTitle: string;
  authors: string[];
  authorIds?: string[];
  authorEntities?: BookAuthor[];
  seriesTitle?: string;
  doi?: string;
  officialUrl?: string;
  publisher?: string;
  ebookPackages?: string;
  copyrightInformation?: string;
  isbn?: BookISBN[];
  seriesISSN?: string;
  seriesEISSN?: string;
  editionNumber?: string;
  numberOfPages?: string;
  topics?: string[];
  keywords?: string[];
  pdfUrl?: string;
  pdfFilename?: string;
  toc?: BookTOCItem[];
};

export type BookRatingSummary = {
  averageScore: number;
  reviewCount: number;
  breakdown: BookRatingBreakdown[];
  myReview?: BookReview;
};

export type BookRatingBreakdown = {
  score: number;
  stars: number;
  count: number;
  percent: number;
};

export type BookReviewListResponse = {
  items: BookReview[];
  rating: BookRatingSummary;
};

export type BookReviewOrder = "hot" | "asc" | "desc";

export type BookReview = {
  id: string;
  bookId: string;
  score: number;
  stars: number;
  body: string;
  author: string;
  authorId?: string;
  authorAvatar?: string;
  voteCount: number;
  voteStatus: "up" | "down" | "none" | string;
  createdAt: string;
  updatedAt: string;
};

export type BookChapterActivityCounts = {
  discussion: number;
  question: number;
  blog: number;
  errata: number;
  openErrata: number;
};

export type BookChapterActivitySummary = {
  key: string;
  title: string;
  page?: number;
  level: number;
  counts: BookChapterActivityCounts;
};

export type BookChapterActivityLinks = {
  discussions: FeedItem[];
  questions: FeedItem[];
  blogs: FeedItem[];
};

export type BookChapterThreadKind = "discussion" | "question";

export type BookChapterThread = {
  id: string;
  bookId: string;
  chapterKey: string;
  kind: BookChapterThreadKind;
  title: string;
  body: string;
  author: string;
  authorId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BookChapterActivityThreads = {
  discussions: BookChapterThread[];
  questions: BookChapterThread[];
};

export type BookWorkspaceCodeOpenResponse = {
  url: string;
  workspacePath: string;
  state: "ready" | "preparing";
  owner: string;
  repository: string;
  repositoryUrl: string;
  branch: string;
  traceId?: string;
};

export type BookChapterErratumStatus =
  | "open"
  | "confirmed"
  | "fixed"
  | "rejected";

export type BookChapterErratum = {
  id: string;
  bookId: string;
  chapterKey: string;
  title: string;
  location: string;
  originalText: string;
  correctionText: string;
  note: string;
  status: BookChapterErratumStatus;
  reporter: string;
  reporterId?: string;
  reviewerId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BookChapterActivityDetail = BookChapterActivitySummary & {
  links: BookChapterActivityLinks;
  threads: BookChapterActivityThreads;
  errata: BookChapterErratum[];
};

export type BookChapterActivityResponse = {
  bookId: string;
  chapters: BookChapterActivitySummary[];
  selected?: BookChapterActivityDetail;
};

export type BookActivityKind = "discussion" | "question" | "blog" | "errata";

export type BookActivityItem = {
  kind: BookActivityKind;
  chapterKey: string;
  chapterTitle: string;
  chapterPath: string[];
  chapterPage?: number;
  content?: FeedItem;
  thread?: BookChapterThread;
  erratum?: BookChapterErratum;
  updatedAt: string;
};

export type BookActivityResponse = {
  bookId: string;
  items: BookActivityItem[];
  counts: BookChapterActivityCounts;
  total: number;
  page: number;
  pageSize: number;
  generatedAt: string;
};

export type BookContextSummary = {
  bookId: string;
  bookTitle: string;
  bookSlug?: string;
  chapterKey: string;
  chapterTitle: string;
  chapterPath: string[];
  chapterPage?: number;
  kind: BookActivityKind;
};

export type BookContextResponse = {
  items: BookContextSummary[];
  generatedAt: string;
};

export type BookReaderTocItem = {
  id: string;
  text: string;
  level: 2 | 3 | 4;
};

export type BookReaderPage = {
  id: string;
  text: string;
  level: 2 | 3 | 4;
  html: string;
};

export type BookReaderPageLink = {
  id: string;
  text: string;
  level: 2 | 3 | 4;
};

export type BookReaderPageResponse = {
  post: PostDetail;
  toc: BookReaderTocItem[];
  page: BookReaderPage;
  previous?: BookReaderPageLink;
  next?: BookReaderPageLink;
  pageIndex: number;
  pageCount: number;
  source: string;
  anchorVersion?: string;
  publicationCommit?: string;
  capabilities: {
    annotationsRead: boolean;
    annotationsWrite: boolean;
    annotationsWriteAvailable: boolean;
    erratumSync: boolean;
    erratumSyncAvailable: boolean;
  };
};

export type FeedItem = {
  id: string;
  revisionId?: string;
  type: ContentType;
  publishStatus?: "draft" | "private" | "published" | string;
  repositoryStatus?: "draft" | "private" | "published" | string;
  sourceVisibility?: "open" | "private" | string;
  title: string;
  author: string;
  authorId?: string;
  authorUid?: string;
  authorAvatar?: string;
  authorRank?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  contentUpdatedAt?: string;
  meta: string;
  excerpt: string;
  tags: string[];
  tagItems?: FeedTagItem[];
  images?: string[];
  coverUrl?: string;
  editor?: "rin" | "markdown" | string;
  markdownSource?: SourceFileInfo;
  markdownServerRender?: boolean;
  interactions: string;
  heat: string;
  readCount?: number;
  voteScore?: number;
  answerCount?: number;
  commentCount?: number;
  replyCount?: number;
  favoriteCount?: number;
  shareCount?: number;
  liked?: boolean;
  likeCount?: number;
  likeSource?: "repository" | "reaction";
  collectionActive?: boolean;
  reportCount?: number;
  lastReplyAt?: string;
  accepted?: boolean;
  followCount?: number;
  isFollowed?: boolean;
  forumSection?: string;
  forumPinned?: boolean;
  forumAnnouncement?: boolean;
  reaction_summary?: ReactionItem[];
  book?: BookMetadata;
  bookRating?: BookRatingSummary;
};

export type FeedTagItem = {
  tagId: string;
  slugName: string;
  displayName: string;
};

export type SourceFileInfo = {
  filename: string;
  mime?: string;
  bytes?: number;
  url: string;
};

export type CompactItem = {
  id: string;
  type: ContentType;
  title: string;
  author: string;
  authorId?: string;
  authorRank?: number;
  meta: string;
  accent: string;
  tags?: string[];
  tagItems?: FeedTagItem[];
  interactions: string;
  readCount?: number;
  voteScore?: number;
  answerCount?: number;
  commentCount?: number;
  replyCount?: number;
  favoriteCount?: number;
  liked?: boolean;
  likeCount?: number;
  lastReplyAt?: string;
  accepted?: boolean;
  forumSection?: string;
  forumPinned?: boolean;
  forumAnnouncement?: boolean;
};

export type HomeFeed = {
  featuredBlog: FeedItem;
  stream: FeedItem[];
  questionHotlist: CompactItem[];
  community: CompactItem[];
  announcements: CompactItem[];
  tasks: CompactItem[];
  followedTags: string[];
  generatedAt: string;
};

export type HomeSidebarMetrics = {
  todayReads: number;
  todayNewFans: number;
};

export type HomeSidebar = {
  metrics: HomeSidebarMetrics;
  hotDiscussions: CompactItem[];
  recommendedUsers: AnswerUserBasicInfo[];
  source: string;
  generatedAt: string;
};

export type HomeFeedMode = "hot" | "latest" | "following" | "unanswered";

export type HomeFeedInput = {
  mode?: HomeFeedMode;
  page?: number;
  size?: number;
};

export type ContentListResponse = {
  items: FeedItem[];
  count: number;
  page: number;
  pageSize: number;
  generatedAt: string;
};

export type KnowledgeGraphNodeKind = "tag" | "content";

export type KnowledgeGraphNode = {
  id: string;
  kind: KnowledgeGraphNodeKind;
  label: string;
  type?: string;
  slug?: string;
  url: string;
  count?: number;
  author?: string;
  meta?: string;
  tags?: string[];
  weight?: number;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
};

export type KnowledgeGraphResponse = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  generatedAt: string;
};

export type AnswerSiteInfo = {
  general: {
    name: string;
    shortDescription: string;
    description: string;
    siteUrl: string;
    contactEmail: string;
  };
  interface: {
    language: string;
    timeZone: string;
  };
  version: string;
  revision: string;
  aiEnabled: boolean;
  mcpEnabled: boolean;
};

export type SiteLegalInfo = {
  termsOfServiceOriginalText?: string;
  termsOfServiceParsedText?: string;
  privacyPolicyOriginalText?: string;
  privacyPolicyParsedText?: string;
};

export type RenderConfig = {
  selectTheme: string;
};

export type EmbedConfig = {
  platform: string;
  enable: boolean;
};

export type PluginStatus = {
  name: string;
  slugName: string;
  description: string;
  version: string;
  enabled: boolean;
  haveConfig: boolean;
  link: string;
};

export type AnswerFileUploadSource =
  | "post"
  | "post_attachment"
  | "avatar"
  | "branding";

export type ConnectorInfo = {
  name: string;
  icon: string;
  link: string;
};

export type ConnectorUserInfo = ConnectorInfo & {
  binding: boolean;
  externalId: string;
};

export type UserPluginSummary = {
  name: string;
  slugName: string;
};

export type UserPluginConfigField = {
  name: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  value: unknown;
  uiOptions: Record<string, unknown>;
  options: Array<{ label: string; value: string }>;
};

export type UserPluginConfig = {
  name: string;
  slugName: string;
  configFields: UserPluginConfigField[];
};

export type LanguageOption = {
  label: string;
  value: string;
};

export type PermissionResult = {
  hasPermission: boolean;
  noPermissionTip: string;
};

export type ReasonItem = {
  reasonKey: string;
  reasonType: number;
  name: string;
  description: string;
  contentType: string;
  placeholder: string;
};

export type RinChatContext = {
  url: string;
  title: string;
  selection: string;
  excerpt: string;
  contentType: string;
};

export type RinWebSearchMode = "auto" | "on" | "off";

export type RinChatParticipant = {
  uid: string;
  userId: string;
  nickname: string;
  avatarUrl: string;
  role: string;
};

export type RinChatMessage = {
  id: number;
  conversationId: number;
  senderUid: string;
  senderUserId: string;
  senderNickname: string;
  senderAvatar: string;
  body: string;
  status: string;
  createdAt: string;
};

export type RinChatConversation = {
  id: number;
  type: string;
  title: string;
  participants: RinChatParticipant[];
  messages: RinChatMessage[];
  updatedAt: string;
};

const feedEndpoint = `${publicEnv.publicBasePath || ""}/api/feed`;
const homeSidebarEndpoint = `${publicEnv.publicBasePath || ""}/api/home/sidebar`;
const contentEndpoint = `${publicEnv.publicBasePath || ""}/api/content`;
const discussionEndpoint = `${publicEnv.publicBasePath || ""}/api/discussions`;
const announcementEndpoint = `${publicEnv.publicBasePath || ""}/api/announcements`;
const statusEndpoint = `${publicEnv.publicBasePath || ""}/api/statuses`;
const questionEndpoint = `${publicEnv.publicBasePath || ""}/api/questions`;
const commentEndpoint = `${publicEnv.publicBasePath || ""}/api/comments`;
const answerCommentEndpoint = `${publicEnv.publicBasePath || ""}/api/comment`;
const contentShareEndpoint = `${publicEnv.publicBasePath || ""}/api/content/share`;
const followEndpoint = `${publicEnv.publicBasePath || ""}/api/follows`;
const answerFollowEndpoint = `${publicEnv.publicBasePath || ""}/api/follow`;
const collectionEndpoint = `${publicEnv.publicBasePath || ""}/api/collections`;
const answerCollectionSwitchEndpoint = `${publicEnv.publicBasePath || ""}/api/collection/switch`;
const likeEndpoint = `${publicEnv.publicBasePath || ""}/api/like`;
const notificationEndpoint = `${publicEnv.publicBasePath || ""}/api/notifications`;
const answerNotificationPageEndpoint = `${publicEnv.publicBasePath || ""}/api/notification/page`;
const answerNotificationStatusEndpoint = `${publicEnv.publicBasePath || ""}/api/notification/status`;
const answerNotificationReadStateEndpoint = `${publicEnv.publicBasePath || ""}/api/notification/read/state`;
const answerNotificationReadStateAllEndpoint = `${publicEnv.publicBasePath || ""}/api/notification/read/state/all`;
const repostEndpoint = `${publicEnv.publicBasePath || ""}/api/reposts`;
const repostUsersEndpoint = `${publicEnv.publicBasePath || ""}/api/reposts/users`;
const reportEndpoint = `${publicEnv.publicBasePath || ""}/api/reports`;
const answerReportEndpoint = `${publicEnv.publicBasePath || ""}/api/report`;
const revisionEndpoint = `${publicEnv.publicBasePath || ""}/api/revisions`;
const activityTimelineEndpoint = `${publicEnv.publicBasePath || ""}/api/activity/timeline`;
const reviewEndpoint = `${publicEnv.publicBasePath || ""}/api/review`;
const reviewingEndpoint = `${publicEnv.publicBasePath || ""}/api/reviewing`;
const moderationEndpoint = `${publicEnv.publicBasePath || ""}/api/moderation`;
const searchEndpoint = `${publicEnv.publicBasePath || ""}/api/search`;
const citationSearchEndpoint = `${publicEnv.publicBasePath || ""}/api/wiki/citations/search`;
const citationResolveEndpoint = `${publicEnv.publicBasePath || ""}/api/wiki/citations/resolve`;
const rankEndpoint = `${publicEnv.publicBasePath || ""}/api/personal/rank/page`;
const personalUserInfoEndpoint = `${publicEnv.publicBasePath || ""}/api/personal/user/info`;
const answerUserInfoEndpoint = `${publicEnv.publicBasePath || ""}/api/user/info`;
const answerUserInfoSearchEndpoint = `${publicEnv.publicBasePath || ""}/api/user/info/search`;
const userRelationsEndpoint = `${publicEnv.publicBasePath || ""}/api/user/relations`;
const answerUserActionRecordEndpoint = `${publicEnv.publicBasePath || ""}/api/user/action/record`;
const answerUserInterfaceEndpoint = `${publicEnv.publicBasePath || ""}/api/user/interface`;
const answerUserNotificationConfigEndpoint = `${publicEnv.publicBasePath || ""}/api/user/notification/config`;

export const notificationStateChangedEvent =
  "rinspace:notification-state-changed";

export function notifyNotificationStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(notificationStateChangedEvent));
}
const userRankingEndpoint = `${publicEnv.publicBasePath || ""}/api/user/ranking`;
const userStaffEndpoint = `${publicEnv.publicBasePath || ""}/api/user/staff`;
const badgesEndpoint = `${publicEnv.publicBasePath || ""}/api/badges`;
const badgeEndpoint = `${publicEnv.publicBasePath || ""}/api/badge`;
const answerEndpoint = `${publicEnv.publicBasePath || ""}/api/answer`;
const answerInfoEndpoint = `${publicEnv.publicBasePath || ""}/api/answer/info`;
const answerPageEndpoint = `${publicEnv.publicBasePath || ""}/api/answer/page`;
const voteEndpoint = `${publicEnv.publicBasePath || ""}/api/vote`;
const reactionEndpoint = `${publicEnv.publicBasePath || ""}/api/meta/reaction`;
const followTagsEndpoint = `${publicEnv.publicBasePath || ""}/api/follow/tags`;
const knowledgeGraphEndpoint = `${publicEnv.publicBasePath || ""}/api/knowledge-graph`;
const tagEndpoint = `${publicEnv.publicBasePath || ""}/api/tag`;
const tagStatsEndpoint = `${publicEnv.publicBasePath || ""}/api/tag/stats`;
const tagCultivationsEndpoint = `${publicEnv.publicBasePath || ""}/api/tag/cultivations`;
const tagSynonymsEndpoint = `${publicEnv.publicBasePath || ""}/api/tag/synonyms`;
const tagSynonymEndpoint = `${publicEnv.publicBasePath || ""}/api/tag/synonym`;
const tagMergeEndpoint = `${publicEnv.publicBasePath || ""}/api/tag/merge`;
const tagSuggestEndpoint = `${publicEnv.publicBasePath || ""}/api/question/tags`;
const tagListEndpoint = `${publicEnv.publicBasePath || ""}/api/tags`;
const tagActivityEndpoint = `${publicEnv.publicBasePath || ""}/api/tags/activity`;
const answerQuestionEndpoint = `${publicEnv.publicBasePath || ""}/api/question`;
const siteInfoEndpoint = `${publicEnv.publicBasePath || ""}/api/siteinfo`;
const siteLegalEndpoint = `${publicEnv.publicBasePath || ""}/api/siteinfo/legal`;
const renderConfigEndpoint = `${publicEnv.publicBasePath || ""}/api/render/config`;
const markdownRenderJobsEndpoint = `${publicEnv.publicBasePath || ""}/api/render/markdown/jobs`;
const postRenderEndpoint = `${publicEnv.publicBasePath || ""}/api/post/render`;
const fileUploadEndpoint = `${publicEnv.publicBasePath || ""}/api/file`;
const embedConfigEndpoint = `${publicEnv.publicBasePath || ""}/api/embed/config`;
const pluginStatusEndpoint = `${publicEnv.publicBasePath || ""}/api/plugin/status`;
const connectorInfoEndpoint = `${publicEnv.publicBasePath || ""}/api/connector/info`;
const connectorUserInfoEndpoint = `${publicEnv.publicBasePath || ""}/api/connector/user/info`;
const userPluginConfigsEndpoint = `${publicEnv.publicBasePath || ""}/api/user/plugin/configs`;
const userPluginConfigEndpoint = `${publicEnv.publicBasePath || ""}/api/user/plugin/config`;
const languageOptionsEndpoint = `${publicEnv.publicBasePath || ""}/api/language/options`;
const languageConfigEndpoint = `${publicEnv.publicBasePath || ""}/api/language/config`;
const permissionEndpoint = `${publicEnv.publicBasePath || ""}/api/permission`;
const reasonsEndpoint = `${publicEnv.publicBasePath || ""}/api/reasons`;
const rinChatEndpoint = `${publicEnv.publicBasePath || ""}/api/chats/rin`;
const bookReviewEndpoint = `${publicEnv.publicBasePath || ""}/api/books`;
const bookAuthorEndpoint = `${publicEnv.publicBasePath || ""}/api/book-authors`;

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export type CreateContentInput = {
  idempotencyKey?: string;
  type: PublishContentType;
  status?: "draft" | "private" | "published";
  repositoryStatus?: "draft" | "private" | "published";
  sourceVisibility?: "open" | "private";
  sourceVisibilityIntent?: "open" | "private";
  title: string;
  body: string;
  excerpt?: string;
  tags: string[];
  images?: string[];
  coverUrl?: string;
  removeCover?: boolean;
  editor?: "rin" | "markdown" | "typst";
  sourceCommit?: string;
  markdownSource?: SourceFileInfo | null;
  renderJobId?: string;
  repositoryFiles?: Array<{
    path: string;
    mediaType: string;
    sha256: string;
    content: string;
    delete?: boolean;
  }>;
  forumSection?: string;
  forumPinned?: boolean;
  forumAnnouncement?: boolean;
  book?: BookMetadata;
};

export type ContentModerationSubmission = {
  submissionId: string;
  state:
    | "ai_review_pending"
    | "ai_review_running"
    | "manual_review_pending"
    | "publish_pending"
    | "publish_running"
    | "published"
    | "rejected";
  message: string;
  contentId?: string;
  contentSlug?: string;
};

export function isContentModerationSubmission(
  value: PostDetail | ContentModerationSubmission,
): value is ContentModerationSubmission {
  return "submissionId" in value;
}

export type MarkdownRenderEstimatedStartRange = {
  earliest: string;
  latest: string;
};

export type MarkdownRenderWaitEstimate = {
  estimatedStartAt: string;
  estimatedStartRange: MarkdownRenderEstimatedStartRange;
  confidence: "low" | "medium" | "high";
  sampleCount: number;
  estimatorVersion: string;
  scope: "instance" | "cluster";
  calculatedAt: string;
};

export type MarkdownRenderQueue = {
  jobsAheadEstimate: number;
  queuedProjects: number;
  activeProjects: number;
  estimate: MarkdownRenderWaitEstimate | null;
  scope: "instance" | "cluster";
  calculatedAt: string;
};

export type MarkdownRenderJob = {
  jobId: string;
  contentKind: "markdown";
  documentEngine: "unified";
  state: "queued" | "running" | "succeeded" | "failed" | "canceled" | "expired";
  stage?: string;
  createdAt: string;
  updatedAt: string;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt: string;
  cancelRequested: boolean;
  error?: { code: string; category: string; message: string; retryable: boolean };
  queue?: MarkdownRenderQueue;
};

export type MarkdownRenderSubmission =
  | {
      enabled: true;
      mode: "cohort" | "all";
      job: MarkdownRenderJob;
      queue: MarkdownRenderQueue;
      location: string;
      reused: boolean;
    }
  | {
      enabled: false;
      mode: "disabled" | "cohort";
    };

export type LoadDiscussionFeedInput = {
  section?: string;
  order?: "active" | "newest" | "hot";
  page?: number;
  size?: number;
};

export type LoadDynamicFeedInput = {
  username?: string;
  order?: "latest" | "newest" | "hot";
  page?: number;
  size?: number;
};

export type LoadContentFeedInput = {
  type?: ContentType;
  username?: string;
  tagId?: string;
  tag?: string;
  order?: "newest" | "active" | "hot" | "score" | "recommend";
  page?: number;
  size?: number;
  includeDrafts?: boolean;
};

export type QuestionTagInput = {
  slugName?: string;
  name?: string;
  displayName?: string;
  originalText?: string;
};

export type CreateQuestionInput = {
  title: string;
  content: string;
  tags: QuestionTagInput[];
  captchaId?: string;
  captchaCode?: string;
};

export type CreateQuestionByAnswerInput = CreateQuestionInput & {
  answerContent: string;
};

export type UpdateQuestionInput = {
  id: string;
  title: string;
  content: string;
  tags: QuestionTagInput[];
  inviteUser?: string[];
  captchaId?: string;
  captchaCode?: string;
};

export type QuestionWriteResult = {
  id: string;
  slug: string;
  urlTitle: string;
  waitForReview: boolean;
  question?: QuestionDetail["question"];
};

export type PostDetail = FeedItem & {
  repositorySource?: { commit: string; entrypoint: string; url: string };
  slug: string;
  body: string;
  readCount: number;
  collected: boolean;
  createdAt: string;
  updatedAt: string;
  publicationPending?: boolean;
  pendingCommit?: string;
  publicVersion?: string;
  contentDigest?: string;
  searchDescription?: string;
};

export type BookImportJobStatus = "queued" | "running" | "succeeded" | "failed";

export type BookImportJob = {
  id: string;
  bookId: string;
  status: BookImportJobStatus;
  filename: string;
  contentType?: string;
  sizeBytes: number;
  sourceUrl?: string;
  error?: string;
  resultPostId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type AnswerSummary = {
  id: number;
  questionId: number;
  author: string;
  authorId?: string;
  authorAvatar?: string;
  authorRank?: number;
  body: string;
  html: string;
  accepted: boolean;
  voteCount: number;
  commentCount: number;
  status: number;
  createdAt: string;
  updatedAt: string;
};

export type QuestionDetail = {
  question: PostDetail & {
    viewCount: number;
    voteCount: number;
    answerCount: number;
    followCount: number;
    isFollowed: boolean;
    acceptedAnswerId: number;
    lastAnswerId: number;
    status: number;
    pin: number;
    show: number;
  };
  body: string;
  answers: AnswerSummary[];
};

export type RevisionObjectType =
  | "question"
  | "answer"
  | "comment"
  | "tag"
  | "post"
  | "blog"
  | "book"
  | "discussion"
  | "dynamic"
  | "forum"
  | "status";

export type RevisionSummary = {
  id: number;
  userId: string;
  author: string;
  authorAvatar?: string;
  objectType: string;
  objectId: number;
  title: string;
  content: string;
  reason: string;
  status: number;
  createdAt: string;
  updatedAt: string;
};

export type ListRevisionsInput = {
  objectType: RevisionObjectType;
  objectId: number;
  limit?: number;
};

export type ReviewPage<T> = {
  count: number;
  page: number;
  pageSize: number;
  items: T[];
};

export type AnswerRevisionInfo = {
  id: string;
  objectId: string;
  title: string;
  content: string;
  reason: string;
  status: number;
  createdAt: number;
  urlTitle: string;
  userId: string;
};

export type ReviewObjectInfo = {
  objectId: string;
  objectType: string;
  questionId: string;
  answerId: string;
  commentId: string;
  title: string;
  content: string;
  status: number;
  showStatus: number;
  createdAt: number;
};

export type UnreviewedRevisionItem = {
  type: string;
  info: ReviewObjectInfo;
  unreviewedInfo: AnswerRevisionInfo;
};

export type PendingReviewPostItem = {
  reviewId: number;
  objectId: string;
  objectType: string;
  objectStatus: number;
  objectShowStatus: number;
  questionId: string;
  answerId: string;
  commentId: string;
  title: string;
  urlTitle: string;
  originalText: string;
  parsedText: string;
  reason: string;
  createdAt: number;
  submitAt: number;
  submitterDisplayName: string;
};

export type ModerationCaseSource = "machine" | "report" | "hybrid";
export type ModerationCaseStatus =
  | "pending"
  | "deferred"
  | "approved"
  | "rejected"
  | "ignored"
  | "completed";
export type ModerationCaseFilterSource = "all" | ModerationCaseSource;
export type ModerationCaseFilterStatus =
  | "active"
  | "pending"
  | "deferred"
  | "closed";

export type ModerationCaseReport = {
  id: number;
  reporter: string;
  reportedUser: string;
  reportType: number;
  reasonKey: string;
  reasonLabel: string;
  reasonVersion: number;
  content: string;
  status: number;
  publicOutcome: string;
  version: number;
  createdAt: string;
};

export type ModerationCaseItem = {
  id: number;
  source: ModerationCaseSource;
  status: ModerationCaseStatus;
  targetScope: string;
  targetType: string;
  targetId: string;
  contentKind: string;
  actorUid: string;
  actorName: string;
  reportedUid: string;
  reportedName: string;
  title: string;
  excerpt: string;
  provider: string;
  bizType: string;
  decision: string;
  label: string;
  subLabel: string;
  score: number;
  requestId: string;
  error: string;
  payloadSha256: string;
  raw: string;
  moderationEventId: number;
  reportCount: number;
  reportType: number;
  reportContent: string;
  operation: string;
  reviewNote: string;
  reviewedBy: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  reports: ModerationCaseReport[];
  version: number;
  allowedActions: ModerationCaseOperation[];
};

export type ModerationCaseCounts = {
  active: number;
  pending: number;
  deferred: number;
  machine: number;
  report: number;
  hybrid: number;
  closed: number;
};

export type ModerationCasePage = {
  count: number;
  page: number;
  pageSize: number;
  items: ModerationCaseItem[];
  counts: ModerationCaseCounts;
  generatedAt: string;
};

export type ModerationCaseOperation =
  | "approve"
  | "reject"
  | "defer"
  | "ignore_report"
  | "hide_question"
  | "hide_post"
  | "delete_answer"
  | "hide_comment"
  | "hide_book_annotation"
  | "hide_user"
  | "suspend_user"
  | "target_unavailable";

export type ModerationCaseMachineEvidence = {
  id: number;
  provider: string;
  decision: string;
  label: string;
  subLabel: string;
  score: number;
  excerpt: string;
  createdAt: string;
};

export type ModerationCaseReasonCount = {
  reasonKey: string;
  reasonLabel: string;
  count: number;
};

export type ModerationCaseTimelineItem = {
  id: string;
  kind: string;
  action: string;
  actorUid: string;
  summary: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
};

export type ModerationDecisionAction = Readonly<{
  operation: ModerationCaseOperation;
  label: string;
  tone: "neutral" | "warning" | "destructive";
  requiresNote: boolean;
  requiresDuration: boolean;
  impact: string;
}>;

export type ModerationDecisionOption = Readonly<{
  key: "no_violation" | "violation" | "defer";
  label: string;
  actions: readonly ModerationDecisionAction[];
}>;

export type ModerationCaseDetail = {
  case: ModerationCaseItem;
  decisionOptions: ModerationDecisionOption[];
  snapshot: Readonly<Record<string, unknown>>;
  machineEvidence: ModerationCaseMachineEvidence[];
  reasonDistribution: ModerationCaseReasonCount[];
  timeline: ModerationCaseTimelineItem[];
  generatedAt: string;
};

export type ModerationCaseReviewInput = {
  id: number;
  operation: ModerationCaseOperation;
  note?: string;
  expectedVersion: number;
  idempotencyKey: string;
  correlationId: string;
  suspendDuration?: string;
};

export type ModerationCaseReviewResponse = {
  id: number;
  status: string;
  operation: string;
  publicOutcome: string;
  version: number;
  replayed: boolean;
  correlationId: string;
  reviewedAt: string;
};

export class ModerationCaseServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ModerationCaseServiceError";
    this.status = status;
  }
}

export type AuditRevisionInput = {
  id: string;
  operation: "approve" | "reject";
};

export type PendingReviewInput = {
  reviewId: number;
  status: "approve" | "reject";
};

export type RevisionReviewResponse = {
  id: string;
  reviewId: number;
  status: number;
  operation: string;
  reviewedAt: string;
};

export type ReviewingTypeItem = {
  name: string;
  label: string;
  todoAmount: number;
};

export type RevisionEditCheck = {
  canUpdate: boolean;
};

export type ActivityTimelineObjectInfo = {
  title: string;
  objectType: string;
  questionId: string;
  answerId: string;
  username: string;
  displayName: string;
  mainTagSlugName: string;
};

export type ActivityTimelineTag = {
  slugName: string;
  displayName: string;
  mainTagSlugName: string;
  recommend: boolean;
  reserved: boolean;
};

export type ActivityTimelineEntry = {
  activityId: string;
  revisionId: string;
  createdAt: number;
  activityType: string;
  comment: string;
  objectId: string;
  objectType: string;
  cancelled: boolean;
  cancelledAt: number;
  userInfo?: AnswerUserBasicInfo;
};

export type ActivityTimelineResponse = {
  objectInfo: ActivityTimelineObjectInfo | null;
  timeline: ActivityTimelineEntry[];
};

export type ActivityTimelineInput = {
  objectId: string;
  objectType?: RevisionObjectType;
  showVote?: boolean;
};

export type ActivityTimelineRevisionDetail = {
  id: string;
  author: string;
  userId: string;
  objectId: string;
  objectType: string;
  reason: string;
  status: number;
  createdAt: number;
  updatedAt: number;
  title: string;
  tags: ActivityTimelineTag[];
  originalText: string;
  excerpt: string;
  slugName: string;
  mainTagSlugName: string;
};

export type ActivityTimelineDetailResponse = {
  newRevision: ActivityTimelineRevisionDetail | null;
  oldRevision: ActivityTimelineRevisionDetail | null;
};

export type ActivityTimelineDetailInput = {
  newRevisionId: string;
  oldRevisionId?: string;
};

export type SearchOrder = "newest" | "active" | "score" | "relevance";
export type SearchType =
  | "all"
  | "question"
  | "answer"
  | "tag"
  | "user"
  | "post"
  | "blog"
  | "book"
  | "discussion"
  | "dynamic"
  | "forum"
  | "status";

export type SearchInput = {
  query: string;
  type?: SearchType;
  order?: SearchOrder;
  page?: number;
  size?: number;
};

export type SearchResult = {
  objectType: string;
  id: string;
  slug?: string;
  userId?: string;
  title: string;
  excerpt: string;
  author: string;
  avatarUrl?: string;
  tags?: string[];
  voteCount: number;
  answerCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type SearchResponse = {
  count: number;
  items: SearchResult[];
};

export type CitationSummary = {
  key: string;
  requestedKey?: string;
  targetType: string;
  targetId: string;
  targetKey: string;
  targetSlugName: string;
  targetDisplayName: string;
  label: string;
  href: string;
  section: string;
  resolved: boolean;
  parentTags: TagParentSummary[];
  error?: string;
};

export type CitationSearchInput = {
  query: string;
  types?: Array<"tag" | "blog" | "book">;
  limit?: number;
};

export type CitationResponse = {
  items: CitationSummary[];
};

export type RankSummary = {
  createdAt: number;
  objectId: string;
  questionId: string;
  answerId: string;
  objectType: string;
  title: string;
  urlTitle: string;
  content: string;
  reputation: number;
  rankType: string;
};

export type RankPageInput = {
  page?: number;
  pageSize?: number;
  username?: string;
  userId?: string;
};

export type PersonalPageInput = RankPageInput & {
  order?: "newest" | "active" | "hot" | "score" | "unanswered";
};

export type RankPageResponse = {
  count: number;
  items: RankSummary[];
};

export type PersonalQuestionSummary = {
  id: string;
  question_id: string;
  title: string;
  url_title: string;
  description: string;
  vote_count: number;
  tags: TagSummary[];
  view_count: number;
  answer_count: number;
  collection_count: number;
  created_at: number;
  accepted_answer_id: string;
  status: string;
};

export type PersonalQuestionPageResponse = {
  count: number;
  items: PersonalQuestionSummary[];
};

export type PersonalAnswerSummary = {
  answer_id: string;
  question_id: string;
  accepted: number;
  vote_count: number;
  create_time: number;
  update_time: number;
  question_info: {
    title: string;
    url_title: string;
    tags: TagSummary[];
  };
};

export type PersonalAnswerPageResponse = {
  count: number;
  items: PersonalAnswerSummary[];
};

export type AnswerTagInfo = {
  slug_name: string;
  display_name: string;
};

export type AnswerUserBasicInfo = {
  id: string;
  username: string;
  rank: number;
  display_name: string;
  avatar: string;
  status: string;
};

export type AnswerQuestionInfo = {
  id: string;
  title: string;
  url_title: string;
  description: string;
  tags: AnswerTagInfo[];
  vote_count: number;
  answer_count: number;
  accepted_answer_id: string;
  create_time: number;
  update_time: number;
  status: number;
  user_info?: AnswerUserBasicInfo;
};

export type AnswerInfo = {
  id: string;
  question_id: string;
  content: string;
  html: string;
  create_time: number;
  update_time: number;
  accepted: number;
  vote_count: number;
  vote_status: string;
  status: number;
  user_info?: AnswerUserBasicInfo;
  question_info?: AnswerQuestionInfo;
};

export type AnswerInfoResponse = {
  info: AnswerInfo;
  question: AnswerQuestionInfo;
};

export type AnswerPageResponse = {
  count: number;
  items: AnswerInfo[];
};

export type AdminAnswerInfo = {
  id: string;
  question_id: string;
  description: string;
  create_time: number;
  update_time: number;
  accepted: number;
  vote_count: number;
  user_info?: AnswerUserBasicInfo;
  question_info: {
    title: string;
  };
  status: string;
};

export type AdminAnswerPageResponse = {
  count: number;
  items: AdminAnswerInfo[];
};

export type AdminAnswerPageInput = {
  page?: number;
  pageSize?: number;
  status?: "available" | "deleted" | "pending";
  query?: string;
  questionId?: string | number;
};

export type AdminContentType =
  | "blog"
  | "book"
  | "forum"
  | "status"
  | "discussion"
  | "dynamic";
export type AdminContentStatus =
  | "active"
  | "published"
  | "private"
  | "draft"
  | "deleted";
export type AdminContentPageState = "draft" | "published";
export type AdminContentSourceVisibility = "private" | "open";

export type AdminContentPageInput = {
  page?: number;
  pageSize?: number;
  type?: AdminContentType;
  status?: AdminContentStatus;
  query?: string;
};

export type AdminContentPageResponse = {
  count: number;
  items: FeedItem[];
};

export type AdminContentStatusInput = {
  id: string;
  type?: AdminContentType;
  pageState: AdminContentPageState;
  sourceVisibility: AdminContentSourceVisibility;
};

export type AdminContentDeleteInput = {
  id: string;
  type?: AdminContentType;
};

export type AdminContentTagsInput = {
  id: string;
  type?: AdminContentType | "question";
  tags: string[];
};

export type AdminContentMutationResponse = {
  id: string;
  status: string;
  repositoryStatus: string;
  sourceVisibility: string;
  item: FeedItem;
};

export type AdminContentTagsResponse = {
  id: string;
  type: ContentType;
  tags: string[];
};

export type AdminQuestionInfo = {
  id: string;
  title: string;
  vote_count: number;
  show: number;
  pin: number;
  answer_count: number;
  accepted_answer_id: string;
  create_time: number;
  update_time: number;
  edit_time: number;
  user_info?: AnswerUserBasicInfo;
  status?: string;
  url_title?: string;
  tags: string[];
};

export type AdminQuestionPageResponse = {
  count: number;
  items: AdminQuestionInfo[];
};

export type AdminQuestionPageInput = {
  page?: number;
  pageSize?: number;
  status?: "available" | "closed" | "deleted" | "pending";
  query?: string;
};

export type AdminUserStatus = "normal" | "suspended" | "deleted" | "inactive";
export type AdminUserRole = "member" | "moderator" | "admin";

export type AdminUserInfo = {
  user_id: string;
  created_at: number;
  deleted_at: number;
  suspended_at: number;
  suspended_until: number;
  username: string;
  e_mail: string;
  rank: number;
  status: AdminUserStatus;
  display_name: string;
  avatar: string;
  role_id: number;
  role_name: AdminUserRole;
};

export type AdminUserPageResponse = {
  count: number;
  items: AdminUserInfo[];
};

export type AdminUserPageInput = {
  page?: number;
  pageSize?: number;
  status?: AdminUserStatus;
  query?: string;
  staff?: boolean;
};

export type AdminUserStatusInput = {
  userId: string;
  status: AdminUserStatus;
  suspendDuration?:
    | "24h"
    | "48h"
    | "72h"
    | "7d"
    | "14d"
    | "1m"
    | "2m"
    | "3m"
    | "6m"
    | "1y";
  removeAllContent?: boolean;
  roleName?: AdminUserRole;
};

export type AdminUserStatusResult = {
  userId: string;
  status: AdminUserStatus;
  suspendedUntil: number;
  roleId: number;
  roleName: AdminUserRole;
};

export type CultivationPermissionRule = {
  key: string;
  label: string;
  description: string;
  minRank: number;
};

export type CultivationPermissionResponse = {
  items: CultivationPermissionRule[];
  updatedAt: number;
};

export type AnswerQuestionPageInput = {
  order?:
    | "recommend"
    | "newest"
    | "active"
    | "hot"
    | "score"
    | "unanswered"
    | "frequent";
  tagId?: string;
  tag?: string;
  username?: string;
  inDays?: number;
  page?: number;
  pageSize?: number;
};

export type AnswerQuestionLinkInput = {
  questionId: string | number;
  order?: "newest" | "active" | "hot" | "score" | "unanswered" | "frequent";
  inDays?: number;
  page?: number;
  pageSize?: number;
};

export type QuestionInviteUpdateInput = {
  id: string | number;
  inviteUser: string[];
  captchaId?: string;
  captchaCode?: string;
};

export type AnswerQuestionPageResponse = {
  count: number;
  items: AnswerQuestionInfo[];
};

export type TagStats = {
  tagId: string;
  slugName: string;
  total: number;
  questions: number;
  blogs: number;
  discussions: number;
  dynamics: number;
  announcements: number;
};

export type TagCultivationUser = {
  uid: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  rank: number;
  tagScore: number;
  postScore: number;
  answerScore: number;
  commentScore: number;
  voteScore: number;
  acceptedScore: number;
  contentCount: number;
  answerCount: number;
  commentCount: number;
  updatedAt: number;
};

export type TagCultivationResult = {
  tagId: string;
  slugName: string;
  count: number;
  page: number;
  pageSize: number;
  items: TagCultivationUser[];
};

export type PersonalCommentSummary = {
  comment_id: string;
  created_at: number;
  object_id: string;
  question_id: string;
  answer_id: string;
  object_type: string;
  title: string;
  url_title: string;
  content: string;
};

export type PersonalCommentPageResponse = {
  count: number;
  items: PersonalCommentSummary[];
};

export type PersonalVoteSummary = {
  answer_id: string;
  content: string;
  created_at: number;
  object_id: string;
  object_type: "question" | "answer" | "comment" | string;
  question_id: string;
  title: string;
  url_title: string;
  vote_type: "up_vote" | "down_vote" | string;
};

export type PersonalVotePageResponse = {
  count: number;
  items: PersonalVoteSummary[];
};

export type PersonalQATopResponse = {
  answer: PersonalAnswerSummary[];
  question: PersonalQuestionSummary[];
};

export type AnswerUserInfo = {
  id: string;
  created_at: number;
  last_login_date: number;
  username: string;
  follow_count: number;
  following_count: number;
  answer_count: number;
  question_count: number;
  rank: number;
  display_name: string;
  avatar: string;
  cover_url: string;
  mobile: string;
  bio: string;
  bio_html: string;
  website: string;
  location: string;
  about_html: string;
  status: string;
  status_msg?: string;
  suspended_until: number;
  is_follower: boolean;
};

export type UserRelationKind = "following" | "followers";

export type UserRelationItem = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  rank: number;
  bio: string;
  followedAt: number;
  isFollowing: boolean;
};

export type UserRelationListResult = {
  count: number;
  page: number;
  pageSize: number;
  items: UserRelationItem[];
};

export type AnswerAvatarInfo = {
  type: string;
  gravatar: string;
  custom: string;
};

export type CurrentUserInfo = {
  id: string;
  created_at: number;
  last_login_date: number;
  username: string;
  display_name: string;
  avatar: AnswerAvatarInfo;
  cover_url: string;
  mobile: string;
  bio: string;
  bio_html: string;
  website: string;
  location: string;
  about_html: string;
  language: string;
  color_scheme: string;
  access_token: string;
  role_id: number;
  role_name: AdminUserRole;
  rank: number;
  status: string;
  have_password: boolean;
  visit_token: string;
  suspended_until: number;
};

export type CurrentUserInfoUpdateInput = {
  displayName?: string;
  username?: string;
  avatar?: Partial<AnswerAvatarInfo>;
  coverUrl?: string;
  bio?: string;
  website?: string;
  location?: string;
  aboutHtml?: string;
};

export type UserActionRecordAction =
  | "email"
  | "password"
  | "edit_userinfo"
  | "question"
  | "answer"
  | "comment"
  | "edit"
  | "invitation_answer"
  | "search"
  | "report"
  | "delete"
  | "vote";

export type UserActionRecord = {
  captchaId: string;
  captchaImg: string;
  verify: boolean;
  count: number;
  limit: number;
  periodSeconds: number;
};

export type UserInterfaceConfig = {
  language: string;
  colorScheme: string;
};

export type AnswerNotificationChannelConfig = {
  key: string;
  enable: boolean;
};

export type UserNotificationConfig = {
  inbox: AnswerNotificationChannelConfig;
  allNewQuestion: AnswerNotificationChannelConfig;
  allNewQuestionForFollowingTags: AnswerNotificationChannelConfig;
};

const defaultUserNotificationConfig: UserNotificationConfig = {
  inbox: { key: "email", enable: false },
  allNewQuestion: { key: "email", enable: false },
  allNewQuestionForFollowingTags: { key: "email", enable: false },
};

export type UserRankingSimpleInfo = {
  id?: string;
  username: string;
  rank: number;
  vote_count: number;
  display_name: string;
  avatar: string;
};

export type UserRankingResponse = {
  users_with_the_most_reputation: UserRankingSimpleInfo[];
  users_with_the_most_vote: UserRankingSimpleInfo[];
  staffs: UserRankingSimpleInfo[];
};

export type UserStaffSummary = {
  username: string;
  display_name: string;
  avatar: string;
};

export type BadgeListItem = {
  id: string;
  name: string;
  icon: string;
  award_count: number;
  earned: boolean;
  level: number;
  earned_count?: number;
};

export type BadgeGroup = {
  group_name: string;
  badges: BadgeListItem[];
};

export type BadgeInfo = BadgeListItem & {
  description: string;
  is_single: boolean;
};

export type BadgeAwardItem = {
  created_at: number;
  author_user_info: AnswerUserBasicInfo;
  object_type: string;
  object_id: string;
  url_title: string;
  question_id: string;
  answer_id: string;
  comment_id: string;
};

export type BadgeAwardPageResponse = {
  count: number;
  items: BadgeAwardItem[];
};

export type UserBadgeAwardResponse = {
  count: number;
  items: BadgeListItem[];
};

export type AnswerStyleVoteResponse = {
  up_votes: number;
  down_votes: number;
  votes: number;
  vote_status: string;
};

export type ReactionItem = {
  emoji: string;
  count: number;
  tooltip: string;
  is_active: boolean;
};

export type ReactionItems = {
  reaction_summary: ReactionItem[];
};

export type ReactionUserItem = {
  uid: string;
  user_id: string;
  display_name: string;
  avatar: string;
  rank: number;
  reacted_at: string;
};

export type ReactionUserList = {
  count: number;
  items: ReactionUserItem[];
};

export type RepostUserItem = {
  uid: string;
  user_id: string;
  display_name: string;
  avatar: string;
  rank: number;
  reposted_at: string;
  post_id: string;
  post_slug: string;
  body: string;
};

export type RepostUserList = {
  count: number;
  items: RepostUserItem[];
};

export type TagSummary = {
  tagId?: string;
  slug: string;
  name: string;
  displayName: string;
  postCount: number;
  parentTags: TagParentSummary[];
  usageExcerpt: string;
  repositoryState?: "legacy" | "pending" | "failed" | "active";
  repositoryId?: number;
};

export type TagDetail = {
  id: number;
  tagId: string;
  slug: string;
  slugName: string;
  name: string;
  displayName: string;
  excerpt: string;
  originalText: string;
  parsedText: string;
  html: string;
  texSource: string;
  rendererFinal: boolean;
  wikiSourceFile?: SourceFileInfo;
  followCount: number;
  readCount: number;
  questionCount: number;
  status: number;
  lifecycle?: string;
  createdAt: string;
  updatedAt: string;
  usageExcerpt: string;
  repositoryState?: "legacy" | "pending" | "failed" | "active";
  repositoryId?: number;
  parentTags: TagParentSummary[];
  outgoingReferences: TagReferenceSummary[];
  incomingReferences: TagReferenceSummary[];
  outgoingObjectReferences: ObjectReferenceSummary[];
  incomingObjectReferences: ObjectReferenceSummary[];
  publicVersion?: string;
  contentDigest?: string;
};

export type TagParentSummary = {
  tagId: string;
  slugName: string;
  displayName: string;
};

export type TagReferenceSummary = {
  sourceTagId: string;
  sourceSlugName: string;
  sourceDisplayName: string;
  targetTagId: string;
  targetKey: string;
  targetSlugName: string;
  targetDisplayName: string;
  label: string;
  section: string;
  resolved: boolean;
};

export type ObjectReferenceSummary = {
  sourceType: string;
  sourceId: string;
  sourceSlugName: string;
  sourceDisplayName: string;
  targetType: "tag" | "blog" | "book" | string;
  targetId: string;
  targetKey: string;
  targetSlugName: string;
  targetDisplayName: string;
  label: string;
  section: string;
  href: string;
  resolved: boolean;
};

export type TagPageInput = {
  page?: number;
  pageSize?: number;
  slugName?: string;
  queryCond?: "popular" | "name" | "newest";
};

export type TagPageItem = {
  tagId: string;
  slugName: string;
  displayName: string;
  description: string;
  excerpt: string;
  originalText: string;
  parsedText: string;
  followCount: number;
  likeCount: number;
  questionCount: number;
  isFollower: boolean;
  isLiked: boolean;
  createdAt: number;
  updatedAt: number;
  recommend: boolean;
  reserved: boolean;
  usageExcerpt: string;
};

export type TagPageResult = {
  count: number;
  page: number;
  pageSize: number;
  items: TagPageItem[];
};

export type FollowingTag = {
  tagId: string;
  slugName: string;
  displayName: string;
  mainTagSlugName: string;
  recommend: boolean;
  reserved: boolean;
  usageExcerpt: string;
};

export type TagMemberAction = {
  action: string;
  name: string;
  type: string;
};

export type TagSynonym = {
  tagId: string;
  slugName: string;
  displayName: string;
  mainTagSlugName: string;
  usageExcerpt: string;
};

export type TagSynonymResult = {
  synonyms: TagSynonym[];
  memberActions: TagMemberAction[];
};

export type TagSynonymUpdateInput = {
  tagId: string;
  synonyms: Array<{
    tagId?: string;
    slugName: string;
    displayName: string;
  }>;
};

export type TagMergeInput = {
  sourceTagId: string;
  targetTagId: string;
};

export type TagMutationInput = {
  tagId?: string;
  slugName?: string;
  displayName?: string;
  originalText?: string;
  parsedText?: string;
  wikiSourceFile?: SourceFileInfo | null;
  editSummary?: string;
  usageExcerpt?: string;
  parentTags?: string[];
  baseRevisionId?: number;
  confirmation?: string;
  idempotencyKey?: string;
  stepUpProof?: string;
};

export type TagMutationResponse = {
  tagId: string;
  slug: string;
  slugName: string;
  displayName: string;
  waitForReview: boolean;
  status: number;
  updatedAt: string;
  usageExcerpt: string;
  repositoryState?: "legacy" | "pending" | "failed" | "active";
  repositoryId?: number;
};

export type CreateCommentInput = {
  targetType:
    | Exclude<PublishContentType, "question" | "announcement">
    | "question"
    | "post"
    | "answer"
    | "book_annotation";
  targetId?: number;
  slug?: string;
  body: string;
  parentId?: number;
  replyToCommentId?: number;
};

export type ListCommentsInput = {
  targetType: CreateCommentInput["targetType"];
  targetId?: number;
  slug?: string;
  limit?: number;
  page?: number;
  order?: "hot" | "newest";
  threaded?: boolean;
};

export type UpdateCommentInput = {
  commentId: number;
  body: string;
};

export type CommentSummary = {
  id: number;
  targetType: string;
  targetId: number;
  parentId?: number;
  replyToCommentId?: number;
  replyToAuthor?: string;
  replyToAuthorId?: string;
  replyToAuthorUid?: string;
  replyToBody?: string;
  author: string;
  authorId?: string;
  authorUid?: string;
  authorAvatar?: string;
  authorRank?: number;
  body: string;
  voteCount: number;
  upVoteCount: number;
  downVoteCount: number;
  viewerVoteStatus: "up" | "down" | "none";
  createdAt: string;
  updatedAt: string;
};

export type AnswerStyleComment = {
  commentId: string;
  createdAt: number;
  objectId: string;
  voteCount: number;
  isVote: boolean;
  originalText: string;
  parsedText: string;
  username: string;
  userDisplayName: string;
  targetType: string;
  targetId: number;
  body: string;
  author: string;
};

export type AnswerStyleCommentPage = {
  count: number;
  items: AnswerStyleComment[];
};

export type AnswerStyleCommentPageInput = {
  objectId: string | number;
  objectType?:
    | "question"
    | "answer"
    | "post"
    | "blog"
    | "discussion"
    | "dynamic"
    | "forum"
    | "status"
    | string;
  page?: number;
  pageSize?: number;
  queryCond?: "vote" | "created_at";
};

export type CreateAnswerStyleCommentInput = {
  objectId: string | number;
  objectType?: AnswerStyleCommentPageInput["objectType"];
  originalText: string;
  replyCommentId?: string;
  mentionUsernameList?: string[];
  captchaId?: string;
  captchaCode?: string;
};

export type UpdateAnswerStyleCommentInput = {
  commentId: string | number;
  originalText: string;
  captchaId?: string;
  captchaCode?: string;
};

export type UpdateAnswerInput = {
  slug: string;
  answerId: number;
  body: string;
  editSummary?: string;
};

export type CreateAnswerByQuestionInput = {
  questionId: string | number;
  content: string;
  captchaId?: string;
  captchaCode?: string;
};

export type UpdateAnswerByIdInput = {
  id: string | number;
  content: string;
  editSummary?: string;
  captchaId?: string;
  captchaCode?: string;
};

export type AnswerMutationResult = {
  id: string;
  questionId: string;
  waitForReview: boolean;
  deleted?: boolean;
  recovered?: boolean;
};

export type AnswerAcceptanceInput = {
  questionId: string | number;
  answerId?: string | number;
};

export type AnswerAcceptanceResult = {
  questionId: string;
  acceptedAnswerId: string;
  accepted: boolean;
  waitForReview: boolean;
};

export type AdminAnswerStatusInput = {
  answerId: string | number;
  status: "available" | "deleted";
};

export type AdminAnswerStatusResult = {
  answerId: string;
  questionId: string;
  status: string;
  waitForReview: boolean;
};

export type AdminQuestionStatusInput = {
  questionId: string | number;
  status: "available" | "closed" | "deleted";
};

export type AdminQuestionStatusResult = {
  questionId: string;
  slug: string;
  status: string;
  waitForReview: boolean;
};

export type CloseQuestionInput = {
  slug: string;
  closeType?: number;
  closeMsg?: string;
};

export type QuestionMutationResult = {
  id: string;
  slug: string;
  status: string;
  deleted?: boolean;
  recovered?: boolean;
};

export type DeleteQuestionInput = {
  id: string;
  captchaId?: string;
  captchaCode?: string;
};

export type QuestionOperation = "pin" | "unpin" | "hide" | "show";

export type OperateQuestionInput = {
  slug: string;
  operation: QuestionOperation;
};

export type FollowTargetInput = {
  targetType:
    | "user"
    | "tag"
    | "post"
    | "question"
    | "blog"
    | "discussion"
    | "dynamic"
    | "status"
    | "forum";
  targetId?: string;
  slug?: string;
  isCancel?: boolean;
  idempotencyKey?: string;
};

export type FollowTargetResult = {
  targetType: string;
  targetId: string;
  following: boolean;
  followerCount: number;
};

export type CollectionTargetInput = {
  targetType:
    | "post"
    | "question"
    | "blog"
    | "discussion"
    | "dynamic"
    | "status"
    | "forum";
  targetId?: string;
  slug?: string;
  bookmark: boolean;
  isCancel?: boolean;
  folderId?: string;
  idempotencyKey?: string;
};

export type LikeTargetInput = Omit<CollectionTargetInput, "targetType" | "folderId"> & {
  targetType: CollectionTargetInput["targetType"] | "tag";
};

export type CollectionSwitchResult = {
  targetType: string;
  targetId: string;
  bookmarked: boolean;
  collectionCount: number;
  collectionId?: string;
  folderId?: string;
};

export type CollectionFolder = {
  id: string;
  parentId?: string;
  name: string;
  scope?: "collection" | "works" | string;
  position: number;
  itemCount: number;
  childCount: number;
  isDefault: boolean;
  systemKind?: "works" | "works-private" | string;
  createdAt: string;
  updatedAt: string;
};

export type CollectionFolderTreeNode = CollectionFolder & {
  children: CollectionFolderTreeNode[];
};

export type CollectionFolderItem = {
  collectionId: string;
  folderId: string;
  collectedAt: string;
  updatedAt: string;
  source?: "collection" | "work" | string;
  item: FeedItem;
};

export type CollectionFolderPage = {
  ownerUserId: string;
  ownerUid: string;
  canManage: boolean;
  defaultId: string;
  currentId: string;
  folders: CollectionFolder[];
  tree: CollectionFolderTreeNode[];
  breadcrumbs: CollectionFolder[];
  children: CollectionFolder[];
  items: CollectionFolderItem[];
  count: number;
};

export type RepostContentInput = {
  targetType: Exclude<ContentType, "task" | "tag">;
  targetId?: number;
  slug?: string;
  body?: string;
};

export type ReportTargetInput = {
  targetType:
    | "post"
    | "question"
    | "answer"
    | "comment"
    | "user"
    | "blog"
    | "discussion"
    | "dynamic"
    | "forum"
    | "status";
  targetId?: string;
  objectId?: number;
  slug?: string;
  reportType: number;
  content?: string;
};

export type ReportResponse = {
  id: number;
  targetType: string;
  targetId: string;
  status: number;
  createdAt: string;
};

export type ReportSummary = ReportResponse & {
  reporter: string;
  reportedUser: string;
  reportType: number;
  content: string;
  updatedAt: string;
};

export type ReviewReportInput = {
  id: number;
  operationType:
    | "ignore_report"
    | "hide_question"
    | "hide_post"
    | "delete_answer"
    | "hide_comment"
    | "hide_user";
  note?: string;
};

export type AnswerStyleReportInput = {
  objectId: string | number;
  reportType: number;
  content?: string;
  source?: "question" | "answer" | "comment" | "user" | "post";
};

export type AnswerStyleReportReviewInput = {
  flagId: string | number;
  operationType:
    | ReviewReportInput["operationType"]
    | "edit_post"
    | "close_post"
    | "delete_post"
    | "unlist_post";
  note?: string;
};

export type AnswerStyleReportPage = {
  count: number;
  page: number;
  pageSize: number;
  items: ReportSummary[];
};

export type ReportReviewResponse = {
  id: number;
  status: number;
  operationType: string;
  reviewedAt: string;
};

export type NotificationItem = {
  id: number;
  actor: string;
  type: string;
  targetType: string;
  targetId: string;
  excerpt?: string;
  readAt?: string;
  createdAt: string;
};

export type NotificationReadState = {
  readCount: number;
  unreadCount: number;
};

export type NotificationPageInput = {
  page?: number;
  pageSize?: number;
  type?: "inbox" | "system";
  inboxType?: "all" | "posts" | "follows" | "likes" | "collections";
};

export type NotificationPageItem = {
  id: string;
  userInfo?: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
  objectInfo: {
    title: string;
    objectId: string;
    objectMap: Record<string, string>;
    objectType: string;
    excerpt?: string;
  };
  rank: number;
  actorKind: "user" | "system";
  notificationAction: string;
  isRead: boolean;
  updateTime: number;
  type: string;
  targetType: string;
  targetId: string;
  message?: string;
  href?: string;
  reportResult?: {
    outcome: string;
    reportId: string;
    targetType: string;
    targetSummary: string;
    targetAvailable: boolean;
  };
};

export type NotificationPageResult = {
  count: number;
  page: number;
  pageSize: number;
  items: NotificationPageItem[];
};

export type NotificationStatus = {
  inbox: number;
  system: number;
  achievement: number;
  revision: number;
  canRevision: boolean;
  badgeAward?: {
    notificationId: string;
    badgeId: string;
    name: string;
  } | null;
};

export const emptyHomeFeed: HomeFeed = {
  featuredBlog: {
    id: "initial-featured-blog",
    type: "blog",
    title: "正在加载数学社区内容",
    author: "",
    meta: "",
    excerpt: "",
    tags: [],
    interactions: "",
    heat: "",
  },
  stream: [],
  questionHotlist: [],
  community: [],
  announcements: [],
  tasks: [],
  followedTags: [],
  generatedAt: new Date(0).toISOString(),
};

export const fallbackHomeFeed: HomeFeed = emptyHomeFeed;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function jsonMessageFromText(text: string, fallback: string) {
  if (!text.trim()) return fallback;
  try {
    const payload: unknown = JSON.parse(text);
    if (isRecord(payload) && typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    return text;
  }
  return fallback;
}

function parseUnknownJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseMarkdownRenderEstimate(
  value: unknown,
): MarkdownRenderWaitEstimate | null {
  if (!isRecord(value) || !isRecord(value.estimatedStartRange)) return null;
  const confidence =
    value.confidence === "low" ||
    value.confidence === "medium" ||
    value.confidence === "high"
      ? value.confidence
      : null;
  const scope =
    value.scope === "cluster"
      ? "cluster"
      : value.scope === "instance"
        ? "instance"
        : null;
  if (
    !confidence ||
    !scope ||
    typeof value.estimatedStartAt !== "string" ||
    typeof value.estimatedStartRange.earliest !== "string" ||
    typeof value.estimatedStartRange.latest !== "string" ||
    typeof value.sampleCount !== "number" ||
    typeof value.estimatorVersion !== "string" ||
    typeof value.calculatedAt !== "string"
  ) {
    return null;
  }
  return {
    estimatedStartAt: value.estimatedStartAt,
    estimatedStartRange: {
      earliest: value.estimatedStartRange.earliest,
      latest: value.estimatedStartRange.latest,
    },
    confidence,
    sampleCount: value.sampleCount,
    estimatorVersion: value.estimatorVersion,
    scope,
    calculatedAt: value.calculatedAt,
  };
}

function parseMarkdownRenderQueue(value: unknown): MarkdownRenderQueue | null {
  if (
    !isRecord(value) ||
    typeof value.queuedProjects !== "number" ||
    typeof value.activeProjects !== "number" ||
    typeof value.calculatedAt !== "string"
  ) {
    return null;
  }
  const scope =
    value.scope === "cluster"
      ? "cluster"
      : value.scope === "instance"
        ? "instance"
        : null;
  if (!scope) return null;
  return {
    jobsAheadEstimate:
      typeof value.jobsAheadEstimate === "number" ? value.jobsAheadEstimate : 0,
    queuedProjects: value.queuedProjects,
    activeProjects: value.activeProjects,
    estimate: parseMarkdownRenderEstimate(value.estimate),
    scope,
    calculatedAt: value.calculatedAt,
  };
}

function parseMarkdownRenderJob(value: unknown): MarkdownRenderJob | null {
  if (
    !isRecord(value) ||
    typeof value.jobId !== "string" ||
    value.contentKind !== "markdown" ||
    value.documentEngine !== "unified" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.expiresAt !== "string" ||
    typeof value.cancelRequested !== "boolean"
  ) {
    return null;
  }
  const state = value.state;
  if (
    state !== "queued" &&
    state !== "running" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "canceled" &&
    state !== "expired"
  ) {
    return null;
  }
  const queue = parseMarkdownRenderQueue(value.queue);
  const failure = isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.category === "string" &&
    typeof value.error.message === "string" &&
    typeof value.error.retryable === "boolean"
      ? {
          code: value.error.code,
          category: value.error.category,
          message: value.error.message,
          retryable: value.error.retryable,
        }
      : undefined;
  return {
    jobId: value.jobId,
    contentKind: "markdown",
    documentEngine: "unified",
    state,
    stage: optionalString(value.stage),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    queuedAt: optionalString(value.queuedAt),
    startedAt: optionalString(value.startedAt),
    finishedAt: optionalString(value.finishedAt),
    expiresAt: value.expiresAt,
    cancelRequested: value.cancelRequested,
    error: failure,
    queue: queue || undefined,
  };
}

function bookImportJobStatus(value: unknown): BookImportJobStatus | null {
  switch (value) {
    case "queued":
    case "running":
    case "succeeded":
    case "failed":
      return value;
    default:
      return null;
  }
}

function stringArrayField(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function bookISBN(value: unknown): BookISBN | null {
  if (!isRecord(value) || typeof value.value !== "string") return null;
  const kind =
    value.kind === "hardcover" ||
    value.kind === "softcover" ||
    value.kind === "ebook" ||
    value.kind === "other"
      ? value.kind
      : "other";
  return {
    kind,
    value: value.value,
    publishedAt: optionalString(value.publishedAt),
  };
}

function bookTOCItem(value: unknown): BookTOCItem | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  return {
    title: value.title,
    page: typeof value.page === "number" ? value.page : undefined,
    level: typeof value.level === "number" ? value.level : undefined,
  };
}

function bookAuthor(value: unknown): BookAuthor | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    sortName: optionalString(value.sortName),
    bio: optionalString(value.bio),
    officialUrl: optionalString(value.officialUrl),
    bookCount:
      typeof value.bookCount === "number" ? value.bookCount : undefined,
  };
}

function bookMetadata(value: unknown): BookMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const kind =
    value.kind === "original" || value.kind === "markdown" || value.kind === "typst"
      ? value.kind
      : "copyrighted";
  const bookTitle =
    optionalString(value.bookTitle) || optionalString(value.title) || "";
  const authors = stringArrayField(value.authors);
  const authorEntities = Array.isArray(value.authorEntities)
    ? value.authorEntities
        .map(bookAuthor)
        .filter((item): item is BookAuthor => item !== null)
    : [];
  if (!bookTitle) return undefined;
  return {
    kind,
    bookTitle,
    authors,
    authorIds: stringArrayField(value.authorIds),
    authorEntities,
    seriesTitle: optionalString(value.seriesTitle),
    doi: optionalString(value.doi),
    officialUrl: optionalString(value.officialUrl),
    publisher: optionalString(value.publisher),
    ebookPackages: optionalString(value.ebookPackages),
    copyrightInformation: optionalString(value.copyrightInformation),
    isbn: Array.isArray(value.isbn)
      ? value.isbn
          .map(bookISBN)
          .filter((item): item is BookISBN => item !== null)
      : [],
    seriesISSN: optionalString(value.seriesISSN),
    seriesEISSN: optionalString(value.seriesEISSN),
    editionNumber: optionalString(value.editionNumber),
    numberOfPages: optionalString(value.numberOfPages),
    topics: stringArrayField(value.topics),
    keywords: stringArrayField(value.keywords),
    pdfUrl: optionalString(value.pdfUrl),
    pdfFilename: optionalString(value.pdfFilename),
    toc: Array.isArray(value.toc)
      ? value.toc
          .map(bookTOCItem)
          .filter((item): item is BookTOCItem => item !== null)
      : [],
  };
}

function bookReview(value: unknown): BookReview | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.bookId !== "string" ||
    typeof value.score !== "number" ||
    typeof value.body !== "string" ||
    typeof value.author !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    bookId: value.bookId,
    score: value.score,
    stars: typeof value.stars === "number" ? value.stars : value.score / 2,
    body: value.body,
    author: value.author,
    authorId: optionalString(value.authorId),
    authorAvatar: optionalString(value.authorAvatar),
    voteCount:
      typeof value.voteCount === "number" && Number.isFinite(value.voteCount)
        ? value.voteCount
        : 0,
    voteStatus:
      typeof value.voteStatus === "string" ? value.voteStatus : "none",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function bookChapterActivityCounts(
  value: unknown,
): BookChapterActivityCounts | null {
  if (!isRecord(value)) return null;
  return {
    discussion: typeof value.discussion === "number" ? value.discussion : 0,
    question: typeof value.question === "number" ? value.question : 0,
    blog: typeof value.blog === "number" ? value.blog : 0,
    errata: typeof value.errata === "number" ? value.errata : 0,
    openErrata: typeof value.openErrata === "number" ? value.openErrata : 0,
  };
}

function bookChapterActivitySummary(
  value: unknown,
): BookChapterActivitySummary | null {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    typeof value.title !== "string" ||
    typeof value.level !== "number"
  ) {
    return null;
  }
  const counts = bookChapterActivityCounts(value.counts);
  if (!counts) return null;
  return {
    key: value.key,
    title: value.title,
    page: typeof value.page === "number" ? value.page : undefined,
    level: value.level,
    counts,
  };
}

function bookChapterErratumStatus(
  value: unknown,
): BookChapterErratumStatus | null {
  return value === "open" ||
    value === "confirmed" ||
    value === "fixed" ||
    value === "rejected"
    ? value
    : null;
}

function bookChapterErratum(value: unknown): BookChapterErratum | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.bookId !== "string" ||
    typeof value.chapterKey !== "string" ||
    typeof value.title !== "string" ||
    typeof value.location !== "string" ||
    typeof value.originalText !== "string" ||
    typeof value.correctionText !== "string" ||
    typeof value.note !== "string" ||
    typeof value.reporter !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const status = bookChapterErratumStatus(value.status);
  if (!status) return null;
  return {
    id: value.id,
    bookId: value.bookId,
    chapterKey: value.chapterKey,
    title: value.title,
    location: value.location,
    originalText: value.originalText,
    correctionText: value.correctionText,
    note: value.note,
    status,
    reporter: value.reporter,
    reporterId: optionalString(value.reporterId),
    reviewerId: optionalString(value.reviewerId),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function bookChapterThreadKind(value: unknown): BookChapterThreadKind | null {
  return value === "discussion" || value === "question" ? value : null;
}

function bookChapterThread(value: unknown): BookChapterThread | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.bookId !== "string" ||
    typeof value.chapterKey !== "string" ||
    typeof value.title !== "string" ||
    typeof value.body !== "string" ||
    typeof value.author !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const kind = bookChapterThreadKind(value.kind);
  if (!kind) return null;
  return {
    id: value.id,
    bookId: value.bookId,
    chapterKey: value.chapterKey,
    kind,
    title: value.title,
    body: value.body,
    author: value.author,
    authorId: optionalString(value.authorId),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function bookChapterActivityDetail(
  value: unknown,
): BookChapterActivityDetail | null {
  const summary = bookChapterActivitySummary(value);
  if (
    !summary ||
    !isRecord(value) ||
    !isRecord(value.links) ||
    !Array.isArray(value.errata)
  ) {
    return null;
  }
  const discussions = Array.isArray(value.links.discussions)
    ? value.links.discussions.map(feedItem)
    : [];
  const questions = Array.isArray(value.links.questions)
    ? value.links.questions.map(feedItem)
    : [];
  const blogs = Array.isArray(value.links.blogs)
    ? value.links.blogs.map(feedItem)
    : [];
  const threads = isRecord(value.threads) ? value.threads : {};
  const threadDiscussions = Array.isArray(threads.discussions)
    ? threads.discussions.map(bookChapterThread)
    : [];
  const threadQuestions = Array.isArray(threads.questions)
    ? threads.questions.map(bookChapterThread)
    : [];
  const errata = value.errata.map(bookChapterErratum);
  if (
    discussions.some((item) => item === null) ||
    questions.some((item) => item === null) ||
    blogs.some((item) => item === null) ||
    threadDiscussions.some((item) => item === null) ||
    threadQuestions.some((item) => item === null) ||
    errata.some((item) => item === null)
  ) {
    return null;
  }
  return {
    ...summary,
    links: {
      discussions: discussions.filter(
        (item): item is FeedItem => item !== null,
      ),
      questions: questions.filter((item): item is FeedItem => item !== null),
      blogs: blogs.filter((item): item is FeedItem => item !== null),
    },
    threads: {
      discussions: threadDiscussions.filter(
        (item): item is BookChapterThread => item !== null,
      ),
      questions: threadQuestions.filter(
        (item): item is BookChapterThread => item !== null,
      ),
    },
    errata: errata.filter((item): item is BookChapterErratum => item !== null),
  };
}

function parseBookChapterActivityResponse(
  value: unknown,
): BookChapterActivityResponse | null {
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    !Array.isArray(value.chapters)
  ) {
    return null;
  }
  const chapters = value.chapters.map(bookChapterActivitySummary);
  if (chapters.some((item) => item === null)) return null;
  let selected: BookChapterActivityDetail | undefined;
  if (typeof value.selected !== "undefined") {
    const parsedSelected = bookChapterActivityDetail(value.selected);
    if (!parsedSelected) return null;
    selected = parsedSelected;
  }
  return {
    bookId: value.bookId,
    chapters: chapters.filter(
      (item): item is BookChapterActivitySummary => item !== null,
    ),
    selected,
  };
}

function bookActivityKind(value: unknown): BookActivityKind | null {
  return value === "discussion" ||
    value === "question" ||
    value === "blog" ||
    value === "errata"
    ? value
    : null;
}

function bookActivityItem(value: unknown): BookActivityItem | null {
  if (
    !isRecord(value) ||
    typeof value.chapterKey !== "string" ||
    typeof value.chapterTitle !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const kind = bookActivityKind(value.kind);
  if (!kind) return null;
  const content =
    typeof value.content === "undefined" ? undefined : feedItem(value.content);
  const thread =
    typeof value.thread === "undefined"
      ? undefined
      : bookChapterThread(value.thread);
  const erratum =
    typeof value.erratum === "undefined"
      ? undefined
      : bookChapterErratum(value.erratum);
  if (
    (typeof value.content !== "undefined" && !content) ||
    (typeof value.thread !== "undefined" && !thread) ||
    (typeof value.erratum !== "undefined" && !erratum)
  ) {
    return null;
  }
  return {
    kind,
    chapterKey: value.chapterKey,
    chapterTitle: value.chapterTitle,
    chapterPath: stringArrayField(value.chapterPath),
    chapterPage:
      typeof value.chapterPage === "number" ? value.chapterPage : undefined,
    content: content || undefined,
    thread: thread || undefined,
    erratum: erratum || undefined,
    updatedAt: value.updatedAt,
  };
}

function parseBookActivityResponse(
  value: unknown,
): BookActivityResponse | null {
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const counts = bookChapterActivityCounts(value.counts);
  if (!counts) return null;
  const items = value.items.map(bookActivityItem);
  if (items.some((item) => item === null)) return null;
  return {
    bookId: value.bookId,
    items: items.filter((item): item is BookActivityItem => item !== null),
    counts,
    total: typeof value.total === "number" ? value.total : items.length,
    page: typeof value.page === "number" ? value.page : 1,
    pageSize:
      typeof value.pageSize === "number" ? value.pageSize : items.length,
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
  };
}

function bookContextSummary(value: unknown): BookContextSummary | null {
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    typeof value.bookTitle !== "string" ||
    typeof value.chapterKey !== "string" ||
    typeof value.chapterTitle !== "string"
  ) {
    return null;
  }
  const kind = bookActivityKind(value.kind);
  if (!kind) return null;
  return {
    bookId: value.bookId,
    bookTitle: value.bookTitle,
    bookSlug: optionalString(value.bookSlug),
    chapterKey: value.chapterKey,
    chapterTitle: value.chapterTitle,
    chapterPath: stringArrayField(value.chapterPath),
    chapterPage:
      typeof value.chapterPage === "number" ? value.chapterPage : undefined,
    kind,
  };
}

function parseBookContextResponse(value: unknown): BookContextResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map(bookContextSummary);
  if (items.some((item) => item === null)) return null;
  return {
    items: items.filter((item): item is BookContextSummary => item !== null),
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
  };
}

function defaultBookRatingBreakdown(): BookRatingBreakdown[] {
  return Array.from({ length: 10 }, (_, index) => {
    const score = 10 - index;
    return {
      score,
      stars: score / 2,
      count: 0,
      percent: 0,
    };
  });
}

function bookRatingBreakdown(value: unknown): BookRatingBreakdown | null {
  if (!isRecord(value)) return null;
  const score =
    typeof value.score === "number" && Number.isFinite(value.score)
      ? value.score
      : typeof value.stars === "number" && Number.isFinite(value.stars)
        ? Math.round(value.stars * 2)
        : 0;
  const stars =
    typeof value.stars === "number" && Number.isFinite(value.stars)
      ? value.stars
      : score / 2;
  const count =
    typeof value.count === "number" && Number.isFinite(value.count)
      ? value.count
      : 0;
  const percent =
    typeof value.percent === "number" && Number.isFinite(value.percent)
      ? value.percent
      : 0;
  if (score < 1 || score > 10 || stars <= 0 || stars > 5) return null;
  return {
    score,
    stars,
    count: Math.max(0, count),
    percent: Math.max(0, Math.min(100, percent)),
  };
}

function bookRatingSummary(value: unknown): BookRatingSummary | undefined {
  if (!isRecord(value)) return undefined;
  const myReview = bookReview(value.myReview);
  const parsedBreakdown = Array.isArray(value.breakdown)
    ? value.breakdown
        .map(bookRatingBreakdown)
        .filter((item): item is BookRatingBreakdown => item !== null)
    : [];
  const fallbackBreakdown = defaultBookRatingBreakdown();
  const breakdown = fallbackBreakdown.map(
    (fallback) =>
      parsedBreakdown.find((item) => item.score === fallback.score) || fallback,
  );
  return {
    averageScore:
      typeof value.averageScore === "number" &&
      Number.isFinite(value.averageScore)
        ? value.averageScore
        : 0,
    reviewCount:
      typeof value.reviewCount === "number" &&
      Number.isFinite(value.reviewCount)
        ? value.reviewCount
        : 0,
    breakdown,
    myReview: myReview || undefined,
  };
}

function rinChatParticipantFromPayload(
  value: unknown,
): RinChatParticipant | null {
  if (!isRecord(value)) return null;
  return {
    uid: stringField(value.uid),
    userId: stringField(value.userId),
    nickname: stringField(value.nickname),
    avatarUrl: stringField(value.avatarUrl),
    role: stringField(value.role),
  };
}

function rinChatMessageFromPayload(value: unknown): RinChatMessage | null {
  if (!isRecord(value)) return null;
  return {
    id: numberField(value.id),
    conversationId: numberField(value.conversationId),
    senderUid: stringField(value.senderUid),
    senderUserId: stringField(value.senderUserId),
    senderNickname: stringField(value.senderNickname),
    senderAvatar: stringField(value.senderAvatar),
    body: stringField(value.body),
    status: stringField(value.status),
    createdAt: stringField(value.createdAt),
  };
}

function rinChatConversationFromPayload(value: unknown): RinChatConversation {
  if (!isRecord(value)) {
    throw new Error("聊天返回格式异常。");
  }
  const rawParticipants = Array.isArray(value.participants)
    ? value.participants
    : [];
  const rawMessages = Array.isArray(value.messages) ? value.messages : [];
  const participants = rawParticipants
    .map(rinChatParticipantFromPayload)
    .filter((item): item is RinChatParticipant => item !== null);
  const messages = rawMessages
    .map(rinChatMessageFromPayload)
    .filter((item): item is RinChatMessage => item !== null);
  return {
    id: numberField(value.id),
    type: stringField(value.type),
    title: stringField(value.title),
    participants,
    messages,
    updatedAt: stringField(value.updatedAt),
  };
}

function isContentType(value: unknown): value is ContentType {
  return (
    value === "blog" ||
    value === "question" ||
    value === "discussion" ||
    value === "announcement" ||
    value === "dynamic" ||
    value === "book" ||
    value === "forum" ||
    value === "status" ||
    value === "task" ||
    value === "tag"
  );
}

function questionMutationResult(value: unknown): QuestionMutationResult | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const slug = typeof value.slug === "string" ? value.slug : id;
  const status = typeof value.status === "string" ? value.status : "";
  if (!id || !slug || !status) return null;
  return {
    id,
    slug,
    status,
    deleted: typeof value.deleted === "boolean" ? value.deleted : undefined,
    recovered:
      typeof value.recovered === "boolean" ? value.recovered : undefined,
  };
}

function answerQuestionTagPayload(tag: QuestionTagInput) {
  return {
    slug_name: tag.slugName || tag.name || tag.originalText || "",
    name: tag.name || tag.slugName || tag.originalText || "",
    display_name:
      tag.displayName || tag.name || tag.originalText || tag.slugName || "",
    original_text:
      tag.originalText || tag.displayName || tag.name || tag.slugName || "",
  };
}

function questionWriteResult(value: unknown): QuestionWriteResult | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const slug = typeof value.slug === "string" ? value.slug : "";
  const urlTitle =
    typeof value.url_title === "string"
      ? value.url_title
      : typeof value.urlTitle === "string"
        ? value.urlTitle
        : slug;
  const waitForReview =
    typeof value.wait_for_review === "boolean"
      ? value.wait_for_review
      : typeof value.waitForReview === "boolean"
        ? value.waitForReview
        : false;
  const rawQuestion = isRecord(value.question) ? value.question : null;
  const question = parsePostDetail(rawQuestion);
  if (!id || !slug || !urlTitle) return null;
  return {
    id,
    slug,
    urlTitle,
    waitForReview,
    question: question
      ? {
          ...question,
          viewCount:
            typeof rawQuestion?.viewCount === "number"
              ? rawQuestion.viewCount
              : 0,
          voteCount:
            typeof rawQuestion?.voteCount === "number"
              ? rawQuestion.voteCount
              : 0,
          answerCount:
            typeof rawQuestion?.answerCount === "number"
              ? rawQuestion.answerCount
              : 0,
          followCount:
            typeof rawQuestion?.followCount === "number"
              ? rawQuestion.followCount
              : 0,
          isFollowed:
            typeof rawQuestion?.isFollowed === "boolean"
              ? rawQuestion.isFollowed
              : false,
          acceptedAnswerId:
            typeof rawQuestion?.acceptedAnswerId === "number"
              ? rawQuestion.acceptedAnswerId
              : 0,
          lastAnswerId:
            typeof rawQuestion?.lastAnswerId === "number"
              ? rawQuestion.lastAnswerId
              : 0,
          status:
            typeof rawQuestion?.status === "number" ? rawQuestion.status : 1,
          pin: typeof rawQuestion?.pin === "number" ? rawQuestion.pin : 0,
          show: typeof rawQuestion?.show === "number" ? rawQuestion.show : 1,
        }
      : undefined,
  };
}

function answerMutationResult(value: unknown): AnswerMutationResult | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const questionId =
    typeof value.question_id === "string"
      ? value.question_id
      : typeof value.questionId === "string"
        ? value.questionId
        : "";
  const waitForReview =
    typeof value.wait_for_review === "boolean"
      ? value.wait_for_review
      : typeof value.waitForReview === "boolean"
        ? value.waitForReview
        : false;
  if (!id || !questionId) return null;
  return {
    id,
    questionId,
    waitForReview,
    deleted: typeof value.deleted === "boolean" ? value.deleted : undefined,
    recovered:
      typeof value.recovered === "boolean" ? value.recovered : undefined,
  };
}

function answerAcceptanceResult(value: unknown): AnswerAcceptanceResult | null {
  if (!isRecord(value)) return null;
  const questionId =
    typeof value.question_id === "string"
      ? value.question_id
      : typeof value.questionId === "string"
        ? value.questionId
        : "";
  const acceptedAnswerId =
    typeof value.accepted_answer_id === "string"
      ? value.accepted_answer_id
      : typeof value.acceptedAnswerId === "string"
        ? value.acceptedAnswerId
        : "";
  const waitForReview =
    typeof value.wait_for_review === "boolean"
      ? value.wait_for_review
      : typeof value.waitForReview === "boolean"
        ? value.waitForReview
        : false;
  if (!questionId || !acceptedAnswerId || typeof value.accepted !== "boolean")
    return null;
  return {
    questionId,
    acceptedAnswerId,
    accepted: value.accepted,
    waitForReview,
  };
}

function adminAnswerStatusResult(
  value: unknown,
): AdminAnswerStatusResult | null {
  if (!isRecord(value)) return null;
  const answerId =
    typeof value.answer_id === "string"
      ? value.answer_id
      : typeof value.answerId === "string"
        ? value.answerId
        : "";
  const questionId =
    typeof value.question_id === "string"
      ? value.question_id
      : typeof value.questionId === "string"
        ? value.questionId
        : "";
  const waitForReview =
    typeof value.wait_for_review === "boolean"
      ? value.wait_for_review
      : typeof value.waitForReview === "boolean"
        ? value.waitForReview
        : false;
  if (!answerId || !questionId || typeof value.status !== "string") return null;
  return {
    answerId,
    questionId,
    status: value.status,
    waitForReview,
  };
}

function adminQuestionStatusResult(
  value: unknown,
): AdminQuestionStatusResult | null {
  if (!isRecord(value)) return null;
  const questionId =
    typeof value.question_id === "string"
      ? value.question_id
      : typeof value.questionId === "string"
        ? value.questionId
        : "";
  const slug = typeof value.slug === "string" ? value.slug : "";
  const waitForReview =
    typeof value.wait_for_review === "boolean"
      ? value.wait_for_review
      : typeof value.waitForReview === "boolean"
        ? value.waitForReview
        : false;
  if (!questionId || !slug || typeof value.status !== "string") return null;
  return {
    questionId,
    slug,
    status: value.status,
    waitForReview,
  };
}

function isAdminUserStatus(value: unknown): value is AdminUserStatus {
  return (
    value === "normal" ||
    value === "suspended" ||
    value === "deleted" ||
    value === "inactive"
  );
}

function isAdminUserRole(value: unknown): value is AdminUserRole {
  return value === "member" || value === "moderator" || value === "admin";
}

function adminUserStatusResult(value: unknown): AdminUserStatusResult | null {
  if (!isRecord(value)) return null;
  const userId =
    typeof value.user_id === "string"
      ? value.user_id
      : typeof value.userId === "string"
        ? value.userId
        : "";
  const suspendedUntil =
    typeof value.suspended_until === "number"
      ? value.suspended_until
      : typeof value.suspendedUntil === "number"
        ? value.suspendedUntil
        : 0;
  const roleId =
    typeof value.role_id === "number"
      ? value.role_id
      : typeof value.roleId === "number"
        ? value.roleId
        : 0;
  const roleName = isAdminUserRole(value.role_name)
    ? value.role_name
    : isAdminUserRole(value.roleName)
      ? value.roleName
      : "member";
  if (!userId || !isAdminUserStatus(value.status)) return null;
  return {
    userId,
    status: value.status,
    suspendedUntil,
    roleId,
    roleName,
  };
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function tagMetadataFields(value: Record<string, unknown>) {
  return {
    usageExcerpt:
      typeof value.usage_excerpt === "string" ? value.usage_excerpt : "",
  };
}

function tagParentSummary(value: unknown): TagParentSummary | null {
  if (
    !isRecord(value) ||
    typeof value.tag_id !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string"
  ) {
    return null;
  }
  return {
    tagId: value.tag_id,
    slugName: value.slug_name,
    displayName: value.display_name,
  };
}

function tagParentSummaries(value: unknown): TagParentSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(tagParentSummary)
    .filter((item): item is TagParentSummary => item !== null);
}

function tagReferenceSummary(value: unknown): TagReferenceSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.source_tag_id !== "string" ||
    typeof value.source_slug_name !== "string" ||
    typeof value.source_display_name !== "string" ||
    typeof value.target_tag_id !== "string" ||
    typeof value.target_slug_name !== "string" ||
    typeof value.target_display_name !== "string" ||
    typeof value.label !== "string" ||
    typeof value.section !== "string" ||
    typeof value.resolved !== "boolean"
  ) {
    return null;
  }
  return {
    sourceTagId: value.source_tag_id,
    sourceSlugName: value.source_slug_name,
    sourceDisplayName: value.source_display_name,
    targetTagId: value.target_tag_id,
    targetKey:
      typeof value.target_key === "string"
        ? value.target_key
        : value.target_tag_id
          ? `tags/${value.target_tag_id}`
          : value.target_slug_name
            ? `tag:${value.target_slug_name}`
            : "",
    targetSlugName: value.target_slug_name,
    targetDisplayName: value.target_display_name,
    label: value.label,
    section: value.section,
    resolved: value.resolved,
  };
}

function tagReferenceSummaries(value: unknown): TagReferenceSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(tagReferenceSummary)
    .filter((item): item is TagReferenceSummary => item !== null);
}

function objectReferenceSummary(value: unknown): ObjectReferenceSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.source_type !== "string" ||
    typeof value.source_id !== "string" ||
    typeof value.source_slug_name !== "string" ||
    typeof value.source_display_name !== "string" ||
    typeof value.target_type !== "string" ||
    typeof value.target_id !== "string" ||
    typeof value.target_key !== "string" ||
    typeof value.target_slug_name !== "string" ||
    typeof value.target_display_name !== "string" ||
    typeof value.label !== "string" ||
    typeof value.section !== "string" ||
    typeof value.href !== "string" ||
    typeof value.resolved !== "boolean"
  ) {
    return null;
  }
  return {
    sourceType: value.source_type,
    sourceId: value.source_id,
    sourceSlugName: value.source_slug_name,
    sourceDisplayName: value.source_display_name,
    targetType: value.target_type,
    targetId: value.target_id,
    targetKey: value.target_key,
    targetSlugName: value.target_slug_name,
    targetDisplayName: value.target_display_name,
    label: value.label,
    section: value.section,
    href: value.href,
    resolved: value.resolved,
  };
}

function objectReferenceSummaries(value: unknown): ObjectReferenceSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(objectReferenceSummary)
    .filter((item): item is ObjectReferenceSummary => item !== null);
}

function answerSiteInfo(value: unknown): AnswerSiteInfo | null {
  if (
    !isRecord(value) ||
    !isRecord(value.general) ||
    !isRecord(value.interface)
  )
    return null;
  if (
    typeof value.general.name !== "string" ||
    typeof value.general.short_description !== "string" ||
    typeof value.general.description !== "string" ||
    typeof value.general.site_url !== "string" ||
    typeof value.general.contact_email !== "string" ||
    typeof value.interface.language !== "string" ||
    typeof value.interface.time_zone !== "string" ||
    typeof value.version !== "string" ||
    typeof value.revision !== "string" ||
    typeof value.ai_enabled !== "boolean" ||
    typeof value.mcp_enabled !== "boolean"
  ) {
    return null;
  }
  return {
    general: {
      name: value.general.name,
      shortDescription: value.general.short_description,
      description: value.general.description,
      siteUrl: value.general.site_url,
      contactEmail: value.general.contact_email,
    },
    interface: {
      language: value.interface.language,
      timeZone: value.interface.time_zone,
    },
    version: value.version,
    revision: value.revision,
    aiEnabled: value.ai_enabled,
    mcpEnabled: value.mcp_enabled,
  };
}

function siteLegalInfo(value: unknown): SiteLegalInfo | null {
  if (!isRecord(value)) return null;
  return {
    termsOfServiceOriginalText:
      typeof value.terms_of_service_original_text === "string"
        ? value.terms_of_service_original_text
        : undefined,
    termsOfServiceParsedText:
      typeof value.terms_of_service_parsed_text === "string"
        ? value.terms_of_service_parsed_text
        : undefined,
    privacyPolicyOriginalText:
      typeof value.privacy_policy_original_text === "string"
        ? value.privacy_policy_original_text
        : undefined,
    privacyPolicyParsedText:
      typeof value.privacy_policy_parsed_text === "string"
        ? value.privacy_policy_parsed_text
        : undefined,
  };
}

function renderConfig(value: unknown): RenderConfig | null {
  if (!isRecord(value) || typeof value.select_theme !== "string") return null;
  return { selectTheme: value.select_theme };
}

function embedConfig(value: unknown): EmbedConfig | null {
  if (
    !isRecord(value) ||
    typeof value.platform !== "string" ||
    typeof value.enable !== "boolean"
  )
    return null;
  return { platform: value.platform, enable: value.enable };
}

function pluginStatus(value: unknown): PluginStatus | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.version !== "string" ||
    typeof value.enabled !== "boolean" ||
    typeof value.have_config !== "boolean" ||
    typeof value.link !== "string"
  ) {
    return null;
  }
  return {
    name: value.name,
    slugName: value.slug_name,
    description: value.description,
    version: value.version,
    enabled: value.enabled,
    haveConfig: value.have_config,
    link: value.link,
  };
}

function connectorInfo(value: unknown): ConnectorInfo | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.icon !== "string" ||
    typeof value.link !== "string"
  ) {
    return null;
  }
  return {
    name: value.name,
    icon: value.icon,
    link: value.link,
  };
}

function connectorUserInfo(value: unknown): ConnectorUserInfo | null {
  const base = connectorInfo(value);
  if (
    !base ||
    !isRecord(value) ||
    typeof value.binding !== "boolean" ||
    typeof value.external_id !== "string"
  ) {
    return null;
  }
  return {
    ...base,
    binding: value.binding,
    externalId: value.external_id,
  };
}

function userPluginSummary(value: unknown): UserPluginSummary | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.slug_name !== "string"
  ) {
    return null;
  }
  return {
    name: value.name,
    slugName: value.slug_name,
  };
}

function userPluginConfigField(value: unknown): UserPluginConfigField | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.type !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.required !== "boolean" ||
    !isRecord(value.ui_options)
  ) {
    return null;
  }
  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const options = rawOptions.map((option) => {
    if (
      !isRecord(option) ||
      typeof option.label !== "string" ||
      typeof option.value !== "string"
    ) {
      return null;
    }
    return { label: option.label, value: option.value };
  });
  if (options.some((option) => option === null)) {
    return null;
  }
  return {
    name: value.name,
    type: value.type,
    title: value.title,
    description: value.description,
    required: value.required,
    value: value.value,
    uiOptions: value.ui_options,
    options: options.filter(
      (option): option is { label: string; value: string } => option !== null,
    ),
  };
}

function userPluginConfig(value: unknown): UserPluginConfig | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.slug_name !== "string" ||
    !Array.isArray(value.config_fields)
  ) {
    return null;
  }
  const configFields = value.config_fields.map(userPluginConfigField);
  if (configFields.some((field) => field === null)) {
    return null;
  }
  return {
    name: value.name,
    slugName: value.slug_name,
    configFields: configFields.filter(
      (field): field is UserPluginConfigField => field !== null,
    ),
  };
}

function languageOption(value: unknown): LanguageOption | null {
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    typeof value.value !== "string"
  )
    return null;
  return { label: value.label, value: value.value };
}

function permissionResult(value: unknown): PermissionResult | null {
  if (
    !isRecord(value) ||
    typeof value.has_permission !== "boolean" ||
    typeof value.no_permission_tip !== "string"
  )
    return null;
  return {
    hasPermission: value.has_permission,
    noPermissionTip: value.no_permission_tip,
  };
}

function reasonItem(value: unknown): ReasonItem | null {
  if (
    !isRecord(value) ||
    typeof value.reason_key !== "string" ||
    typeof value.reason_type !== "number" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.content_type !== "string" ||
    typeof value.placeholder !== "string"
  ) {
    return null;
  }
  return {
    reasonKey: value.reason_key,
    reasonType: value.reason_type,
    name: value.name,
    description: value.description,
    contentType: value.content_type,
    placeholder: value.placeholder,
  };
}

function compactItem(value: unknown): CompactItem | null {
  if (!isRecord(value) || !isContentType(value.type)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.author !== "string" ||
    typeof value.meta !== "string" ||
    typeof value.accent !== "string" ||
    typeof value.interactions !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    type: value.type,
    title: value.title,
    author: value.author,
    authorId: typeof value.authorId === "string" ? value.authorId : undefined,
    authorRank:
      typeof value.authorRank === "number" ? value.authorRank : undefined,
    meta: value.meta,
    accent: value.accent,
    tags: strings(value.tags),
    tagItems: feedTagItems(value.tag_items ?? value.tagItems),
    interactions: value.interactions,
    readCount: optionalNumber(value.readCount),
    voteScore: optionalNumber(value.voteScore),
    answerCount: optionalNumber(value.answerCount),
    commentCount: optionalNumber(value.commentCount),
    replyCount: optionalNumber(value.replyCount),
    favoriteCount: optionalNumber(value.favoriteCount),
    liked: typeof value.liked === "boolean" ? value.liked : undefined,
    likeCount: optionalNumber(value.likeCount),
    lastReplyAt:
      typeof value.lastReplyAt === "string" ? value.lastReplyAt : undefined,
    accepted: typeof value.accepted === "boolean" ? value.accepted : undefined,
    forumSection:
      typeof value.forumSection === "string" ? value.forumSection : undefined,
    forumPinned:
      typeof value.forumPinned === "boolean" ? value.forumPinned : undefined,
    forumAnnouncement:
      typeof value.forumAnnouncement === "boolean"
        ? value.forumAnnouncement
        : undefined,
  };
}

function feedItem(value: unknown): FeedItem | null {
  if (!isRecord(value) || !isContentType(value.type)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.author !== "string" ||
    typeof value.meta !== "string" ||
    typeof value.excerpt !== "string" ||
    typeof value.interactions !== "string" ||
    typeof value.heat !== "string"
  ) {
    return null;
  }
  const reactionSummary = Array.isArray(value.reaction_summary)
    ? value.reaction_summary
        .map(reactionItem)
        .filter((item): item is ReactionItem => item !== null)
    : undefined;
  if (
    Array.isArray(value.reaction_summary) &&
    reactionSummary?.length !== value.reaction_summary.length
  ) {
    return null;
  }
  const markdownSource = sourceFileInfo(value.markdownSource);
  return {
    id: value.id,
    revisionId:
      typeof value.revisionId === "string" ? value.revisionId : undefined,
    type: value.type,
    publishStatus: typeof value.status === "string" ? value.status : undefined,
    repositoryStatus:
      typeof value.repositoryStatus === "string"
        ? value.repositoryStatus
        : undefined,
    sourceVisibility:
      typeof value.sourceVisibility === "string"
        ? value.sourceVisibility
        : undefined,
    title: value.title,
    author: value.author,
    authorId: typeof value.authorId === "string" ? value.authorId : undefined,
    authorUid:
      typeof value.authorUid === "string" ? value.authorUid : undefined,
    authorAvatar:
      typeof value.authorAvatar === "string" ? value.authorAvatar : undefined,
    authorRank:
      typeof value.authorRank === "number" ? value.authorRank : undefined,
    createdAt:
      typeof value.createdAt === "string" ? value.createdAt : undefined,
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    publishedAt:
      typeof value.publishedAt === "string" ? value.publishedAt : undefined,
    contentUpdatedAt:
      typeof value.contentUpdatedAt === "string"
        ? value.contentUpdatedAt
        : undefined,
    meta: value.meta,
    excerpt: value.excerpt,
    tags: strings(value.tags),
    tagItems: feedTagItems(value.tag_items ?? value.tagItems),
    images: strings(value.images).slice(0, 9),
    coverUrl: typeof value.coverUrl === "string" ? value.coverUrl : undefined,
    editor: typeof value.editor === "string" ? value.editor : undefined,
    markdownSource: markdownSource || undefined,
    markdownServerRender:
      typeof value.markdownServerRender === "boolean"
        ? value.markdownServerRender
        : undefined,
    interactions: value.interactions,
    heat: value.heat,
    readCount: optionalNumber(value.readCount),
    voteScore: optionalNumber(value.voteScore),
    answerCount: optionalNumber(value.answerCount),
    commentCount: optionalNumber(value.commentCount),
    replyCount: optionalNumber(value.replyCount),
    favoriteCount: optionalNumber(value.favoriteCount),
    shareCount: optionalNumber(value.shareCount),
    liked: typeof value.liked === "boolean" ? value.liked : undefined,
    likeCount: optionalNumber(value.likeCount),
    likeSource:
      value.likeSource === "repository" || value.likeSource === "reaction"
        ? value.likeSource
        : undefined,
    collectionActive:
      typeof value.collectionActive === "boolean"
        ? value.collectionActive
        : undefined,
    reportCount: optionalNumber(value.reportCount),
    lastReplyAt:
      typeof value.lastReplyAt === "string" ? value.lastReplyAt : undefined,
    accepted: typeof value.accepted === "boolean" ? value.accepted : undefined,
    followCount:
      typeof value.followCount === "number" ? value.followCount : undefined,
    isFollowed:
      typeof value.isFollowed === "boolean" ? value.isFollowed : undefined,
    forumSection:
      typeof value.forumSection === "string" ? value.forumSection : undefined,
    forumPinned:
      typeof value.forumPinned === "boolean" ? value.forumPinned : undefined,
    forumAnnouncement:
      typeof value.forumAnnouncement === "boolean"
        ? value.forumAnnouncement
        : undefined,
    reaction_summary: reactionSummary,
    book: bookMetadata(value.book),
    bookRating: bookRatingSummary(value.bookRating),
  };
}

function feedTagItem(value: unknown): FeedTagItem | null {
  if (!isRecord(value)) return null;
  const tagId =
    typeof value.tag_id === "string"
      ? value.tag_id
      : typeof value.tagId === "string"
        ? value.tagId
        : typeof value.id === "string"
          ? value.id
          : "";
  const slugName =
    typeof value.slug_name === "string"
      ? value.slug_name
      : typeof value.slugName === "string"
        ? value.slugName
        : typeof value.slug === "string"
          ? value.slug
          : "";
  const displayName =
    typeof value.display_name === "string"
      ? value.display_name
      : typeof value.displayName === "string"
        ? value.displayName
        : typeof value.name === "string"
          ? value.name
          : slugName || tagId;
  if (!tagId && !slugName && !displayName) return null;
  return { tagId, slugName, displayName };
}

function feedTagItems(value: unknown): FeedTagItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(feedTagItem)
    .filter((item): item is FeedTagItem => item !== null);
}

function sourceFileInfo(value: unknown): SourceFileInfo | null {
  if (!isRecord(value)) return null;
  if (typeof value.filename !== "string" || typeof value.url !== "string") {
    return null;
  }
  return {
    filename: value.filename,
    mime: typeof value.mime === "string" ? value.mime : undefined,
    bytes: typeof value.bytes === "number" ? value.bytes : undefined,
    url: value.url,
  };
}

function knowledgeGraphNode(value: unknown): KnowledgeGraphNode | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.kind !== "tag" && value.kind !== "content") ||
    typeof value.label !== "string" ||
    typeof value.url !== "string"
  ) {
    return null;
  }
  if (typeof value.type !== "undefined" && typeof value.type !== "string") {
    return null;
  }
  return {
    id: value.id,
    kind: value.kind,
    label: value.label,
    type: value.type,
    slug: typeof value.slug === "string" ? value.slug : undefined,
    url: value.url,
    count: typeof value.count === "number" ? value.count : undefined,
    author: typeof value.author === "string" ? value.author : undefined,
    meta: typeof value.meta === "string" ? value.meta : undefined,
    tags: strings(value.tags),
    weight: typeof value.weight === "number" ? value.weight : undefined,
  };
}

function knowledgeGraphEdge(value: unknown): KnowledgeGraphEdge | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.source !== "string" ||
    typeof value.target !== "string" ||
    typeof value.kind !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    source: value.source,
    target: value.target,
    kind: value.kind,
  };
}

function parseKnowledgeGraphResponse(
  value: unknown,
): KnowledgeGraphResponse | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  ) {
    return null;
  }
  const nodes = value.nodes.map(knowledgeGraphNode);
  const edges = value.edges.map(knowledgeGraphEdge);
  if (
    nodes.some((item) => item === null) ||
    edges.some((item) => item === null)
  ) {
    return null;
  }
  return {
    nodes: nodes.filter((item): item is KnowledgeGraphNode => item !== null),
    edges: edges.filter((item): item is KnowledgeGraphEdge => item !== null),
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
  };
}

function parseHomeFeed(value: unknown): HomeFeed | null {
  if (!isRecord(value)) return null;
  const featuredBlog = feedItem(value.featuredBlog);
  if (!featuredBlog || featuredBlog.type !== "blog") return null;
  if (
    !Array.isArray(value.stream) ||
    !Array.isArray(value.questionHotlist) ||
    !Array.isArray(value.community) ||
    (typeof value.announcements !== "undefined" &&
      !Array.isArray(value.announcements)) ||
    !Array.isArray(value.tasks) ||
    typeof value.generatedAt !== "string"
  ) {
    return null;
  }

  const stream = value.stream.map(feedItem);
  const questionHotlist = value.questionHotlist.map(compactItem);
  const community = value.community.map(compactItem);
  const announcements = Array.isArray(value.announcements)
    ? value.announcements.map(compactItem)
    : [];
  const tasks = value.tasks.map(compactItem);
  if (
    stream.some((item) => item === null) ||
    questionHotlist.some((item) => item === null) ||
    community.some((item) => item === null) ||
    announcements.some((item) => item === null) ||
    tasks.some((item) => item === null)
  ) {
    return null;
  }

  return {
    featuredBlog,
    stream: stream.filter((item): item is FeedItem => item !== null),
    questionHotlist: questionHotlist.filter(
      (item): item is CompactItem => item !== null,
    ),
    community: community.filter((item): item is CompactItem => item !== null),
    announcements: announcements.filter(
      (item): item is CompactItem => item !== null,
    ),
    tasks: tasks.filter((item): item is CompactItem => item !== null),
    followedTags: strings(value.followedTags),
    generatedAt: value.generatedAt,
  };
}

function parseHomeSidebar(value: unknown): HomeSidebar | null {
  if (!isRecord(value) || !isRecord(value.metrics)) return null;
  if (
    typeof value.metrics.todayReads !== "number" ||
    typeof value.metrics.todayNewFans !== "number" ||
    !Array.isArray(value.hotDiscussions) ||
    !Array.isArray(value.recommendedUsers)
  ) {
    return null;
  }
  const hotDiscussions = value.hotDiscussions.map(compactItem);
  const recommendedUsers = value.recommendedUsers.map(answerUserBasicInfo);
  if (
    hotDiscussions.some((item) => item === null) ||
    recommendedUsers.some((item) => item === null)
  ) {
    return null;
  }
  return {
    metrics: {
      todayReads: value.metrics.todayReads,
      todayNewFans: value.metrics.todayNewFans,
    },
    hotDiscussions: hotDiscussions.filter(
      (item): item is CompactItem => item !== null,
    ),
    recommendedUsers: recommendedUsers.filter(
      (item): item is AnswerUserBasicInfo => item !== null,
    ),
    source: typeof value.source === "string" ? value.source : "database",
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
  };
}

function responseCacheScope() {
  const session = getStoredSession();
  if (!session) return "anonymous";
  const subject =
    session.sub || session.access_token.slice(0, 24) || "authenticated";
  return `${subject}:epoch-${session.session_epoch ?? "unknown"}`;
}

function responseCacheKey(parts: string[]) {
  return [
    responseCachePrefix,
    String(responseCacheVersion),
    responseCacheScope(),
    ...parts.map((part) => encodeURIComponent(part)),
  ].join(":");
}

async function optionalAuthHeaders() {
  const headers: Record<string, string> = { Accept: "application/json" };
  let accessToken = "";
  try {
    accessToken = await getAuthAccessToken();
  } catch {
    return headers;
  }
  Object.assign(headers, sessionAuthHeaders(accessToken));
  return headers;
}

function readCachedSnapshot<T>(
  key: string,
  parse: (value: unknown) => T | null,
): CachedSnapshot<T> | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.cachedAt !== "number") {
      window.localStorage.removeItem(key);
      return null;
    }
    const data = parse(parsed.data);
    if (!data) {
      window.localStorage.removeItem(key);
      return null;
    }
    return {
      data,
      cachedAt: parsed.cachedAt,
    };
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writeCachedSnapshot<T>(key: string, data: T) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      }),
    );
  } catch {
    // localStorage can be full or disabled; network data should still render.
  }
}

export function readCachedHomeFeed(mode: HomeFeedMode) {
  return readCachedSnapshot(
    responseCacheKey(["home-feed-v5", mode]),
    parseHomeFeed,
  );
}

export function homeFeedForSharedCache(feed: HomeFeed): HomeFeed {
  const stripViewerRating = (item: FeedItem): FeedItem => {
    const { myReview: _myReview, ...publicRating } = item.bookRating ?? {};
    return {
      ...item,
      liked: false,
      collectionActive: false,
      reaction_summary: item.reaction_summary?.map((reaction) => ({
        ...reaction,
        is_active: false,
      })),
      bookRating: item.bookRating ? publicRating as FeedItem["bookRating"] : undefined,
    };
  };
  return {
    ...feed,
    featuredBlog: stripViewerRating(feed.featuredBlog),
    stream: feed.stream.map(stripViewerRating),
  };
}

function writeCachedHomeFeed(mode: HomeFeedMode, feed: HomeFeed) {
  writeCachedSnapshot(
    responseCacheKey(["home-feed-v5", mode]),
    homeFeedForSharedCache(feed),
  );
}

function parseContentListResponse(value: unknown): ContentListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map(feedItem);
  if (items.some((item) => item === null)) return null;
  return {
    items: items.filter((item): item is FeedItem => item !== null),
    count: typeof value.count === "number" ? value.count : items.length,
    page: typeof value.page === "number" ? value.page : 1,
    pageSize:
      typeof value.pageSize === "number" ? value.pageSize : items.length,
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
  };
}

function parseCollectionFolder(value: unknown): CollectionFolder | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.position !== "number" ||
    typeof value.itemCount !== "number" ||
    typeof value.childCount !== "number" ||
    typeof value.isDefault !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    parentId: typeof value.parentId === "string" ? value.parentId : undefined,
    name: value.name,
    scope: typeof value.scope === "string" ? value.scope : undefined,
    position: value.position,
    itemCount: value.itemCount,
    childCount: value.childCount,
    isDefault: value.isDefault,
    systemKind:
      typeof value.systemKind === "string" ? value.systemKind : undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseCollectionFolderTreeNode(
  value: unknown,
): CollectionFolderTreeNode | null {
  const folder = parseCollectionFolder(value);
  if (!folder || !isRecord(value) || !Array.isArray(value.children))
    return null;
  const children = value.children.map(parseCollectionFolderTreeNode);
  if (children.some((child) => child === null)) return null;
  return {
    ...folder,
    children: children.filter(
      (child): child is CollectionFolderTreeNode => child !== null,
    ),
  };
}

function parseCollectionFolderItem(
  value: unknown,
): CollectionFolderItem | null {
  if (
    !isRecord(value) ||
    typeof value.collectionId !== "string" ||
    typeof value.folderId !== "string" ||
    typeof value.collectedAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const item = feedItem(value.item);
  if (!item) return null;
  return {
    collectionId: value.collectionId,
    folderId: value.folderId,
    collectedAt: value.collectedAt,
    updatedAt: value.updatedAt,
    source: typeof value.source === "string" ? value.source : undefined,
    item,
  };
}

function parseCollectionFolderPage(
  value: unknown,
): CollectionFolderPage | null {
  if (
    !isRecord(value) ||
    typeof value.ownerUserId !== "string" ||
    typeof value.ownerUid !== "string" ||
    typeof value.canManage !== "boolean" ||
    typeof value.defaultId !== "string" ||
    typeof value.currentId !== "string" ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.tree) ||
    !Array.isArray(value.breadcrumbs) ||
    !Array.isArray(value.children) ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const folders = value.folders.map(parseCollectionFolder);
  const tree = value.tree.map(parseCollectionFolderTreeNode);
  const breadcrumbs = value.breadcrumbs.map(parseCollectionFolder);
  const children = value.children.map(parseCollectionFolder);
  const items = value.items.map(parseCollectionFolderItem);
  if (
    folders.some((item) => item === null) ||
    tree.some((item) => item === null) ||
    breadcrumbs.some((item) => item === null) ||
    children.some((item) => item === null) ||
    items.some((item) => item === null)
  ) {
    return null;
  }
  return {
    ownerUserId: value.ownerUserId,
    ownerUid: value.ownerUid,
    canManage: value.canManage,
    defaultId: value.defaultId,
    currentId: value.currentId,
    folders: folders.filter((item): item is CollectionFolder => item !== null),
    tree: tree.filter(
      (item): item is CollectionFolderTreeNode => item !== null,
    ),
    breadcrumbs: breadcrumbs.filter(
      (item): item is CollectionFolder => item !== null,
    ),
    children: children.filter(
      (item): item is CollectionFolder => item !== null,
    ),
    items: items.filter((item): item is CollectionFolderItem => item !== null),
    count: typeof value.count === "number" ? value.count : items.length,
  };
}

function parsePostDetail(value: unknown): PostDetail | null {
  const item = feedItem(value);
  if (!item || !isRecord(value)) return null;
  if (
    typeof value.slug !== "string" ||
    typeof value.body !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const readCount =
    typeof value.readCount === "number"
      ? value.readCount
      : typeof value.read_count === "number"
        ? value.read_count
        : readCountFromInteractions(item.interactions);
  return {
    ...item,
    slug: value.slug,
    body: value.body,
    readCount,
    collected: typeof value.collected === "boolean" ? value.collected : false,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    publicationPending:
      typeof value.publicationPending === "boolean"
        ? value.publicationPending
        : undefined,
    pendingCommit:
      typeof value.pendingCommit === "string" ? value.pendingCommit : undefined,
    publicVersion:
      typeof value.publicVersion === "string" ? value.publicVersion : undefined,
    contentDigest:
      typeof value.contentDigest === "string" ? value.contentDigest : undefined,
    searchDescription:
      typeof value.searchDescription === "string" ? value.searchDescription : undefined,
    repositorySource:
      isRecord(value.repositorySource) &&
      typeof value.repositorySource.commit === "string" &&
      typeof value.repositorySource.entrypoint === "string" &&
      typeof value.repositorySource.url === "string"
        ? {
            commit: value.repositorySource.commit,
            entrypoint: value.repositorySource.entrypoint,
            url: value.repositorySource.url,
          }
        : undefined,
  };
}

export function parseContentModerationSubmission(
  value: unknown,
): ContentModerationSubmission | null {
  if (!isRecord(value)) return null;
  const states: ContentModerationSubmission["state"][] = [
    "ai_review_pending",
    "ai_review_running",
    "manual_review_pending",
    "publish_pending",
    "publish_running",
    "published",
    "rejected",
  ];
  if (
    typeof value.submissionId !== "string" ||
    typeof value.state !== "string" ||
    !states.includes(value.state as ContentModerationSubmission["state"]) ||
    typeof value.message !== "string"
  ) {
    return null;
  }
  return {
    submissionId: value.submissionId,
    state: value.state as ContentModerationSubmission["state"],
    message: value.message,
    contentId:
      typeof value.contentId === "string" ? value.contentId : undefined,
    contentSlug:
      typeof value.contentSlug === "string" ? value.contentSlug : undefined,
  };
}

function parseBookImportJob(value: unknown): BookImportJob | null {
  if (!isRecord(value)) return null;
  const status = bookImportJobStatus(value.status);
  if (
    typeof value.id !== "string" ||
    typeof value.bookId !== "string" ||
    !status ||
    typeof value.filename !== "string" ||
    typeof value.sizeBytes !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    bookId: value.bookId,
    status,
    filename: value.filename,
    contentType: optionalString(value.contentType),
    sizeBytes: value.sizeBytes,
    sourceUrl: optionalString(value.sourceUrl),
    error: optionalString(value.error),
    resultPostId: optionalString(value.resultPostId),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: optionalString(value.completedAt),
  };
}

function bookReaderLevel(value: unknown): 2 | 3 | 4 | null {
  return value === 2 || value === 3 || value === 4 ? value : null;
}

function cleanBookReaderLatexLabel(value: string) {
  return value
    .replace(/&emsp;/gi, " ")
    .replace(/\\protectExample\b/g, "Example")
    .replace(/\\(?:hfill|vfill|emsp|enspace|quad|qquad)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bookReaderTocItem(value: unknown): BookReaderTocItem | null {
  if (!isRecord(value)) return null;
  const level = bookReaderLevel(value.level);
  if (
    typeof value.id !== "string" ||
    typeof value.text !== "string" ||
    !level
  ) {
    return null;
  }
  return { id: value.id, text: cleanBookReaderLatexLabel(value.text), level };
}

function bookReaderPage(value: unknown): BookReaderPage | null {
  if (!isRecord(value)) return null;
  const level = bookReaderLevel(value.level);
  if (
    typeof value.id !== "string" ||
    typeof value.text !== "string" ||
    typeof value.html !== "string" ||
    !level
  ) {
    return null;
  }
  return {
    id: value.id,
    text: cleanBookReaderLatexLabel(value.text),
    level,
    html: value.html,
  };
}

function bookReaderPageLink(value: unknown): BookReaderPageLink | undefined {
  const item = bookReaderTocItem(value);
  return item ? { id: item.id, text: item.text, level: item.level } : undefined;
}

function parseBookReaderPageResponse(
  value: unknown,
): BookReaderPageResponse | null {
  if (!isRecord(value) || !Array.isArray(value.toc)) return null;
  const post = parsePostDetail(value.post);
  const page = bookReaderPage(value.page);
  const toc = value.toc.map(bookReaderTocItem);
  if (!post || !page || toc.some((item) => item === null)) return null;
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
  const annotationsRead = capabilities.annotationsRead ?? false;
  const annotationsWrite = capabilities.annotationsWrite ?? false;
  const annotationsWriteAvailable =
    capabilities.annotationsWriteAvailable ?? annotationsWrite;
  const erratumSync = capabilities.erratumSync ?? false;
  const erratumSyncAvailable = capabilities.erratumSyncAvailable ?? erratumSync;
  if (
    typeof annotationsRead !== "boolean" ||
    typeof annotationsWrite !== "boolean" ||
    typeof annotationsWriteAvailable !== "boolean" ||
    typeof erratumSync !== "boolean" ||
    typeof erratumSyncAvailable !== "boolean"
  )
    return null;
  return {
    post,
    toc: toc.filter((item): item is BookReaderTocItem => item !== null),
    page,
    previous: bookReaderPageLink(value.previous),
    next: bookReaderPageLink(value.next),
    pageIndex: numberField(value.pageIndex),
    pageCount: numberField(value.pageCount),
    source: stringField(value.source),
    anchorVersion:
      typeof value.anchorVersion === "string" ? value.anchorVersion : undefined,
    publicationCommit:
      typeof value.publicationCommit === "string"
        ? value.publicationCommit
        : undefined,
    capabilities: {
      annotationsRead,
      annotationsWrite,
      annotationsWriteAvailable,
      erratumSync,
      erratumSyncAvailable,
    },
  };
}

function readCountFromInteractions(interactions: string) {
  const match = interactions.match(/(\d+)\s*阅读/);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

function answerSummary(value: unknown): AnswerSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.questionId !== "number" ||
    typeof value.author !== "string" ||
    typeof value.body !== "string" ||
    typeof value.html !== "string" ||
    typeof value.accepted !== "boolean" ||
    typeof value.voteCount !== "number" ||
    typeof value.commentCount !== "number" ||
    typeof value.status !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    questionId: value.questionId,
    author: value.author,
    authorId: typeof value.authorId === "string" ? value.authorId : undefined,
    authorAvatar:
      typeof value.authorAvatar === "string" ? value.authorAvatar : undefined,
    authorRank:
      typeof value.authorRank === "number" ? value.authorRank : undefined,
    body: value.body,
    html: value.html,
    accepted: value.accepted,
    voteCount: value.voteCount,
    commentCount: value.commentCount,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function commentSummary(value: unknown): CommentSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.targetType !== "string" ||
    typeof value.targetId !== "number" ||
    typeof value.author !== "string" ||
    typeof value.body !== "string" ||
    typeof value.voteCount !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    targetType: value.targetType,
    targetId: value.targetId,
    parentId:
      typeof value.parentId === "number" && value.parentId > 0
        ? value.parentId
        : undefined,
    replyToCommentId:
      typeof value.replyToCommentId === "number" && value.replyToCommentId > 0
        ? value.replyToCommentId
        : undefined,
    replyToAuthor:
      typeof value.replyToAuthor === "string" ? value.replyToAuthor : undefined,
    replyToAuthorId:
      typeof value.replyToAuthorId === "string"
        ? value.replyToAuthorId
        : undefined,
    replyToAuthorUid:
      typeof value.replyToAuthorUid === "string"
        ? value.replyToAuthorUid
        : undefined,
    replyToBody:
      typeof value.replyToBody === "string" ? value.replyToBody : undefined,
    author: value.author,
    authorId: typeof value.authorId === "string" ? value.authorId : undefined,
    authorUid:
      typeof value.authorUid === "string" ? value.authorUid : undefined,
    authorAvatar:
      typeof value.authorAvatar === "string" ? value.authorAvatar : undefined,
    authorRank:
      typeof value.authorRank === "number" ? value.authorRank : undefined,
    body: value.body,
    voteCount: value.voteCount,
    upVoteCount:
      typeof value.upVoteCount === "number"
        ? value.upVoteCount
        : Math.max(value.voteCount, 0),
    downVoteCount:
      typeof value.downVoteCount === "number"
        ? value.downVoteCount
        : Math.max(-value.voteCount, 0),
    viewerVoteStatus:
      value.viewerVoteStatus === "up" || value.viewerVoteStatus === "down"
        ? value.viewerVoteStatus
        : "none",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function answerStyleComment(value: unknown): AnswerStyleComment | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.comment_id !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.object_id !== "string" ||
    typeof value.vote_count !== "number" ||
    typeof value.is_vote !== "boolean" ||
    typeof value.original_text !== "string" ||
    typeof value.parsed_text !== "string"
  ) {
    return null;
  }
  return {
    commentId: value.comment_id,
    createdAt: value.created_at,
    objectId: value.object_id,
    voteCount: value.vote_count,
    isVote: value.is_vote,
    originalText: value.original_text,
    parsedText: value.parsed_text,
    username: typeof value.username === "string" ? value.username : "",
    userDisplayName:
      typeof value.user_display_name === "string"
        ? value.user_display_name
        : "",
    targetType: typeof value.targetType === "string" ? value.targetType : "",
    targetId: typeof value.targetId === "number" ? value.targetId : 0,
    body: typeof value.body === "string" ? value.body : value.original_text,
    author: typeof value.author === "string" ? value.author : "",
  };
}

function parseAnswerStyleCommentPage(
  value: unknown,
): AnswerStyleCommentPage | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(answerStyleComment)
    .filter((item): item is AnswerStyleComment => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function revisionSummary(value: unknown): RevisionSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.userId !== "string" ||
    typeof value.author !== "string" ||
    typeof value.objectType !== "string" ||
    typeof value.objectId !== "number" ||
    typeof value.title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.status !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    userId: value.userId,
    author: value.author,
    authorAvatar:
      typeof value.authorAvatar === "string" ? value.authorAvatar : undefined,
    objectType: value.objectType,
    objectId: value.objectId,
    title: value.title,
    content: value.content,
    reason: value.reason,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function answerRevisionInfo(value: unknown): AnswerRevisionInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.object_id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.status !== "number" ||
    typeof value.create_at !== "number" ||
    typeof value.url_title !== "string" ||
    typeof value.use_id !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    objectId: value.object_id,
    title: value.title,
    content: value.content,
    reason: value.reason,
    status: value.status,
    createdAt: value.create_at,
    urlTitle: value.url_title,
    userId: value.use_id,
  };
}

function reviewObjectInfo(value: unknown): ReviewObjectInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.object_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.answer_id !== "string" ||
    typeof value.comment_id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.status !== "number" ||
    typeof value.show_status !== "number" ||
    typeof value.created_at !== "number"
  ) {
    return null;
  }
  return {
    objectId: value.object_id,
    objectType: value.object_type,
    questionId: value.question_id,
    answerId: value.answer_id,
    commentId: value.comment_id,
    title: value.title,
    content: value.content,
    status: value.status,
    showStatus: value.show_status,
    createdAt: value.created_at,
  };
}

function unreviewedRevisionItem(value: unknown): UnreviewedRevisionItem | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const info = reviewObjectInfo(value.info);
  const unreviewedInfo = answerRevisionInfo(value.unreviewed_info);
  if (!info || !unreviewedInfo) return null;
  return { type: value.type, info, unreviewedInfo };
}

function pendingReviewPostItem(value: unknown): PendingReviewPostItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.review_id !== "number" ||
    typeof value.object_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.object_status !== "number" ||
    typeof value.object_show_status !== "number" ||
    typeof value.question_id !== "string" ||
    typeof value.answer_id !== "string" ||
    typeof value.comment_id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.original_text !== "string" ||
    typeof value.parsed_text !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.submit_at !== "number" ||
    typeof value.submitter_display_name !== "string"
  ) {
    return null;
  }
  return {
    reviewId: value.review_id,
    objectId: value.object_id,
    objectType: value.object_type,
    objectStatus: value.object_status,
    objectShowStatus: value.object_show_status,
    questionId: value.question_id,
    answerId: value.answer_id,
    commentId: value.comment_id,
    title: value.title,
    urlTitle: value.url_title,
    originalText: value.original_text,
    parsedText: value.parsed_text,
    reason: value.reason,
    createdAt: value.created_at,
    submitAt: value.submit_at,
    submitterDisplayName: value.submitter_display_name,
  };
}

function reviewPage<T>(
  value: unknown,
  parser: (item: unknown) => T | null,
): ReviewPage<T> | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const items = rawItems.map(parser);
  if (items.some((item) => item === null)) return null;
  return {
    count: value.count,
    page: typeof value.page === "number" ? value.page : 1,
    pageSize:
      typeof value.page_size === "number" ? value.page_size : rawItems.length,
    items: items.filter((item): item is T => item !== null),
  };
}

function moderationCaseSource(value: unknown): ModerationCaseSource {
  return value === "report" || value === "hybrid" ? value : "machine";
}

function moderationCaseStatus(value: unknown): ModerationCaseStatus {
  switch (value) {
    case "deferred":
    case "approved":
    case "rejected":
    case "ignored":
    case "completed":
      return value;
    default:
      return "pending";
  }
}

function moderationCaseOperation(
  value: unknown,
): ModerationCaseOperation | null {
  switch (value) {
    case "approve":
    case "reject":
    case "defer":
    case "ignore_report":
    case "hide_question":
    case "hide_post":
    case "delete_answer":
    case "hide_comment":
    case "hide_book_annotation":
    case "hide_user":
    case "suspend_user":
    case "target_unavailable":
      return value;
    default:
      return null;
  }
}

function moderationCaseReport(value: unknown): ModerationCaseReport | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.reportType !== "number" ||
    typeof value.reasonKey !== "string" ||
    typeof value.reasonLabel !== "string" ||
    typeof value.reasonVersion !== "number" ||
    typeof value.content !== "string" ||
    typeof value.status !== "number" ||
    typeof value.version !== "number" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    reporter: typeof value.reporter === "string" ? value.reporter : "",
    reportedUser:
      typeof value.reportedUser === "string" ? value.reportedUser : "",
    reportType: value.reportType,
    reasonKey: value.reasonKey,
    reasonLabel: value.reasonLabel,
    reasonVersion: value.reasonVersion,
    content: value.content,
    status: value.status,
    publicOutcome:
      typeof value.publicOutcome === "string" ? value.publicOutcome : "",
    version: value.version,
    createdAt: value.createdAt,
  };
}

function moderationCaseItem(value: unknown): ModerationCaseItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.targetScope !== "string" ||
    typeof value.targetType !== "string" ||
    typeof value.targetId !== "string" ||
    typeof value.contentKind !== "string" ||
    typeof value.actorUid !== "string" ||
    typeof value.actorName !== "string" ||
    typeof value.reportedUid !== "string" ||
    typeof value.reportedName !== "string" ||
    typeof value.title !== "string" ||
    typeof value.excerpt !== "string" ||
    typeof value.provider !== "string" ||
    typeof value.bizType !== "string" ||
    typeof value.decision !== "string" ||
    typeof value.label !== "string" ||
    typeof value.subLabel !== "string" ||
    typeof value.score !== "number" ||
    typeof value.requestId !== "string" ||
    typeof value.error !== "string" ||
    typeof value.payloadSha256 !== "string" ||
    typeof value.raw !== "string" ||
    typeof value.moderationEventId !== "number" ||
    typeof value.reportCount !== "number" ||
    typeof value.reportType !== "number" ||
    typeof value.reportContent !== "string" ||
    typeof value.operation !== "string" ||
    typeof value.reviewNote !== "string" ||
    typeof value.reviewedBy !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.version !== "number" ||
    !Array.isArray(value.allowedActions) ||
    !Array.isArray(value.reports)
  ) {
    return null;
  }
  const reports = value.reports.map(moderationCaseReport);
  if (reports.some((item) => item === null)) return null;
  const allowedActions = value.allowedActions.map(moderationCaseOperation);
  if (allowedActions.some((item) => item === null)) return null;
  const reviewedAt =
    typeof value.reviewedAt === "string" ? value.reviewedAt : undefined;
  return {
    id: value.id,
    source: moderationCaseSource(value.source),
    status: moderationCaseStatus(value.status),
    targetScope: value.targetScope,
    targetType: value.targetType,
    targetId: value.targetId,
    contentKind: value.contentKind,
    actorUid: value.actorUid,
    actorName: value.actorName,
    reportedUid: value.reportedUid,
    reportedName: value.reportedName,
    title: value.title,
    excerpt: value.excerpt,
    provider: value.provider,
    bizType: value.bizType,
    decision: value.decision,
    label: value.label,
    subLabel: value.subLabel,
    score: value.score,
    requestId: value.requestId,
    error: value.error,
    payloadSha256: value.payloadSha256,
    raw: value.raw,
    moderationEventId: value.moderationEventId,
    reportCount: value.reportCount,
    reportType: value.reportType,
    reportContent: value.reportContent,
    operation: value.operation,
    reviewNote: value.reviewNote,
    reviewedBy: value.reviewedBy,
    reviewedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    reports: reports.filter(
      (item): item is ModerationCaseReport => item !== null,
    ),
    version: value.version,
    allowedActions: allowedActions.filter(
      (item): item is ModerationCaseOperation => item !== null,
    ),
  };
}

function moderationCaseMachineEvidenceItem(
  value: unknown,
): ModerationCaseMachineEvidence | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.provider !== "string" ||
    typeof value.decision !== "string" ||
    typeof value.label !== "string" ||
    typeof value.score !== "number" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    provider: value.provider,
    decision: value.decision,
    label: value.label,
    subLabel: typeof value.subLabel === "string" ? value.subLabel : "",
    score: value.score,
    excerpt: typeof value.excerpt === "string" ? value.excerpt : "",
    createdAt: value.createdAt,
  };
}

function moderationCaseReasonCountItem(
  value: unknown,
): ModerationCaseReasonCount | null {
  if (
    !isRecord(value) ||
    typeof value.reasonKey !== "string" ||
    typeof value.reasonLabel !== "string" ||
    typeof value.count !== "number"
  ) {
    return null;
  }
  return {
    reasonKey: value.reasonKey,
    reasonLabel: value.reasonLabel,
    count: value.count,
  };
}

function moderationCaseTimelineEntry(
  value: unknown,
): ModerationCaseTimelineItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.action !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    kind: value.kind,
    action: value.action,
    actorUid: typeof value.actorUid === "string" ? value.actorUid : "",
    summary: typeof value.summary === "string" ? value.summary : "",
    payload: isRecord(value.payload) ? value.payload : {},
    createdAt: value.createdAt,
  };
}

function moderationDecisionActionItem(
  value: unknown,
): ModerationDecisionAction | null {
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    (value.tone !== "neutral" &&
      value.tone !== "warning" &&
      value.tone !== "destructive") ||
    typeof value.requiresNote !== "boolean" ||
    typeof value.requiresDuration !== "boolean" ||
    (value.impact !== undefined && typeof value.impact !== "string")
  ) {
    return null;
  }
  const operation = moderationCaseOperation(value.operation);
  if (!operation) return null;
  return {
    operation,
    label: value.label,
    tone: value.tone,
    requiresNote: value.requiresNote,
    requiresDuration: value.requiresDuration,
    impact: typeof value.impact === "string" ? value.impact : "",
  };
}

function moderationDecisionOptionItem(
  value: unknown,
): ModerationDecisionOption | null {
  if (
    !isRecord(value) ||
    (value.key !== "no_violation" &&
      value.key !== "violation" &&
      value.key !== "defer") ||
    typeof value.label !== "string" ||
    !Array.isArray(value.actions) ||
    value.actions.length === 0
  ) {
    return null;
  }
  const actions = value.actions.map(moderationDecisionActionItem);
  if (actions.some((item) => item === null)) return null;
  return {
    key: value.key,
    label: value.label,
    actions: actions.filter(
      (item): item is ModerationDecisionAction => item !== null,
    ),
  };
}

function moderationCaseDetail(value: unknown): ModerationCaseDetail | null {
  if (
    !isRecord(value) ||
    !isRecord(value.snapshot) ||
    !Array.isArray(value.decisionOptions) ||
    !Array.isArray(value.machineEvidence) ||
    !Array.isArray(value.reasonDistribution) ||
    !Array.isArray(value.timeline) ||
    typeof value.generatedAt !== "string"
  ) {
    return null;
  }
  const caseItem = moderationCaseItem(value.case);
  const decisionOptions = value.decisionOptions.map(
    moderationDecisionOptionItem,
  );
  const machineEvidence = value.machineEvidence.map(
    moderationCaseMachineEvidenceItem,
  );
  const reasonDistribution = value.reasonDistribution.map(
    moderationCaseReasonCountItem,
  );
  const timeline = value.timeline.map(moderationCaseTimelineEntry);
  if (
    !caseItem ||
    decisionOptions.some((item) => item === null) ||
    machineEvidence.some((item) => item === null) ||
    reasonDistribution.some((item) => item === null) ||
    timeline.some((item) => item === null)
  ) {
    return null;
  }
  return {
    case: caseItem,
    decisionOptions: decisionOptions.filter(
      (item): item is ModerationDecisionOption => item !== null,
    ),
    snapshot: value.snapshot,
    machineEvidence: machineEvidence.filter(
      (item): item is ModerationCaseMachineEvidence => item !== null,
    ),
    reasonDistribution: reasonDistribution.filter(
      (item): item is ModerationCaseReasonCount => item !== null,
    ),
    timeline: timeline.filter(
      (item): item is ModerationCaseTimelineItem => item !== null,
    ),
    generatedAt: value.generatedAt,
  };
}

function moderationCaseCounts(value: unknown): ModerationCaseCounts | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.active !== "number" ||
    typeof value.pending !== "number" ||
    typeof value.deferred !== "number" ||
    typeof value.machine !== "number" ||
    typeof value.report !== "number" ||
    typeof value.hybrid !== "number" ||
    typeof value.closed !== "number"
  ) {
    return null;
  }
  return {
    active: value.active,
    pending: value.pending,
    deferred: value.deferred,
    machine: value.machine,
    report: value.report,
    hybrid: value.hybrid,
    closed: value.closed,
  };
}

function moderationCasePage(value: unknown): ModerationCasePage | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const items = rawItems.map(moderationCaseItem);
  if (items.some((item) => item === null)) return null;
  const counts = moderationCaseCounts(value.counts);
  if (!counts || typeof value.generatedAt !== "string") return null;
  return {
    count: value.count,
    page: typeof value.page === "number" ? value.page : 1,
    pageSize:
      typeof value.pageSize === "number"
        ? value.pageSize
        : typeof value.page_size === "number"
          ? value.page_size
          : rawItems.length,
    items: items.filter((item): item is ModerationCaseItem => item !== null),
    counts,
    generatedAt: value.generatedAt,
  };
}

function moderationCaseReviewResponse(
  value: unknown,
): ModerationCaseReviewResponse | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.status !== "string" ||
    typeof value.operation !== "string" ||
    typeof value.version !== "number" ||
    typeof value.reviewedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    status: value.status,
    operation: value.operation,
    publicOutcome:
      typeof value.publicOutcome === "string" ? value.publicOutcome : "",
    version: value.version,
    replayed: value.replayed === true,
    correlationId:
      typeof value.correlationId === "string" ? value.correlationId : "",
    reviewedAt: value.reviewedAt,
  };
}

function revisionReviewResponse(value: unknown): RevisionReviewResponse | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.review_id !== "number" ||
    typeof value.status !== "number" ||
    typeof value.operation !== "string" ||
    typeof value.reviewedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    reviewId: value.review_id,
    status: value.status,
    operation: value.operation,
    reviewedAt: value.reviewedAt,
  };
}

function reviewingTypeItem(value: unknown): ReviewingTypeItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.name !== "string" ||
    typeof value.label !== "string" ||
    typeof value.todo_amount !== "number"
  ) {
    return null;
  }
  return {
    name: value.name,
    label: value.label,
    todoAmount: value.todo_amount,
  };
}

function revisionEditCheck(value: unknown): RevisionEditCheck | null {
  if (!isRecord(value) || typeof value.canUpdate !== "boolean") return null;
  return { canUpdate: value.canUpdate };
}

function activityTimelineObjectInfo(
  value: unknown,
): ActivityTimelineObjectInfo | null {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.answer_id !== "string" ||
    typeof value.username !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.main_tag_slug_name !== "string"
  ) {
    return null;
  }
  return {
    title: value.title,
    objectType: value.object_type,
    questionId: value.question_id,
    answerId: value.answer_id,
    username: value.username,
    displayName: value.display_name,
    mainTagSlugName: value.main_tag_slug_name,
  };
}

function activityTimelineTag(value: unknown): ActivityTimelineTag | null {
  if (
    !isRecord(value) ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.main_tag_slug_name !== "string" ||
    typeof value.recommend !== "boolean" ||
    typeof value.reserved !== "boolean"
  ) {
    return null;
  }
  return {
    slugName: value.slug_name,
    displayName: value.display_name,
    mainTagSlugName: value.main_tag_slug_name,
    recommend: value.recommend,
    reserved: value.reserved,
  };
}

function activityTimelineEntry(value: unknown): ActivityTimelineEntry | null {
  if (
    !isRecord(value) ||
    typeof value.activity_id !== "string" ||
    typeof value.revision_id !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.activity_type !== "string" ||
    typeof value.comment !== "string" ||
    typeof value.object_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.cancelled !== "boolean" ||
    typeof value.cancelled_at !== "number"
  ) {
    return null;
  }
  let userInfo: AnswerUserBasicInfo | undefined;
  if (value.user_info !== undefined && value.user_info !== null) {
    const parsedUser = answerUserBasicInfo(value.user_info);
    if (!parsedUser) return null;
    userInfo = parsedUser;
  }
  return {
    activityId: value.activity_id,
    revisionId: value.revision_id,
    createdAt: value.created_at,
    activityType: value.activity_type,
    comment: value.comment,
    objectId: value.object_id,
    objectType: value.object_type,
    cancelled: value.cancelled,
    cancelledAt: value.cancelled_at,
    userInfo,
  };
}

function activityTimelineResponse(
  value: unknown,
): ActivityTimelineResponse | null {
  if (!isRecord(value) || !Array.isArray(value.timeline)) return null;
  const objectInfo =
    value.object_info === null || value.object_info === undefined
      ? null
      : activityTimelineObjectInfo(value.object_info);
  if (
    value.object_info !== null &&
    value.object_info !== undefined &&
    !objectInfo
  )
    return null;
  const timeline = value.timeline.map(activityTimelineEntry);
  if (timeline.some((item) => item === null)) return null;
  return {
    objectInfo,
    timeline: timeline.filter(
      (item): item is ActivityTimelineEntry => item !== null,
    ),
  };
}

function activityTimelineRevisionDetail(
  value: unknown,
): ActivityTimelineRevisionDetail | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.author !== "string" ||
    typeof value.user_id !== "string" ||
    typeof value.object_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.status !== "number" ||
    typeof value.created_at !== "number" ||
    typeof value.updated_at !== "number" ||
    typeof value.title !== "string" ||
    !Array.isArray(value.tags) ||
    typeof value.original_text !== "string" ||
    typeof value.excerpt !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.main_tag_slug_name !== "string"
  ) {
    return null;
  }
  const tags = value.tags.map(activityTimelineTag);
  if (tags.some((item) => item === null)) return null;
  return {
    id: value.id,
    author: value.author,
    userId: value.user_id,
    objectId: value.object_id,
    objectType: value.object_type,
    reason: value.reason,
    status: value.status,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    title: value.title,
    tags: tags.filter((item): item is ActivityTimelineTag => item !== null),
    originalText: value.original_text,
    excerpt: value.excerpt,
    slugName: value.slug_name,
    mainTagSlugName: value.main_tag_slug_name,
  };
}

function activityTimelineDetailResponse(
  value: unknown,
): ActivityTimelineDetailResponse | null {
  if (!isRecord(value)) return null;
  const newRevision =
    value.new_revision === null || value.new_revision === undefined
      ? null
      : activityTimelineRevisionDetail(value.new_revision);
  const oldRevision =
    value.old_revision === null || value.old_revision === undefined
      ? null
      : activityTimelineRevisionDetail(value.old_revision);
  if (
    value.new_revision !== null &&
    value.new_revision !== undefined &&
    !newRevision
  )
    return null;
  if (
    value.old_revision !== null &&
    value.old_revision !== undefined &&
    !oldRevision
  )
    return null;
  return { newRevision, oldRevision };
}

function searchResult(value: unknown): SearchResult | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.objectType !== "string" ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.excerpt !== "string" ||
    typeof value.author !== "string" ||
    typeof value.voteCount !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    objectType: value.objectType,
    id: value.id,
    slug: typeof value.slug === "string" ? value.slug : undefined,
    userId: typeof value.userId === "string" ? value.userId : undefined,
    title: value.title,
    excerpt: value.excerpt,
    author: value.author,
    avatarUrl:
      typeof value.avatarUrl === "string" ? value.avatarUrl : undefined,
    tags: Array.isArray(value.tags) ? strings(value.tags) : undefined,
    voteCount: value.voteCount,
    answerCount:
      typeof value.answerCount === "number" ? value.answerCount : undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseSearchResponse(value: unknown): SearchResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(searchResult)
    .filter((item): item is SearchResult => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function citationSummary(value: unknown): CitationSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.key !== "string" ||
    typeof value.target_type !== "string" ||
    typeof value.target_id !== "string" ||
    typeof value.target_key !== "string" ||
    typeof value.target_slug_name !== "string" ||
    typeof value.target_display_name !== "string" ||
    typeof value.label !== "string" ||
    typeof value.href !== "string" ||
    typeof value.section !== "string" ||
    typeof value.resolved !== "boolean"
  ) {
    return null;
  }
  return {
    key: value.key,
    requestedKey:
      typeof value.requested_key === "string" ? value.requested_key : undefined,
    targetType: value.target_type,
    targetId: value.target_id,
    targetKey: value.target_key,
    targetSlugName: value.target_slug_name,
    targetDisplayName: value.target_display_name,
    label: value.label,
    href: value.href,
    section: value.section,
    resolved: value.resolved,
    parentTags: tagParentSummaries(value.parent_tags),
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function parseCitationResponse(value: unknown): CitationResponse | null {
  if (!isRecord(value)) return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(citationSummary)
    .filter((item): item is CitationSummary => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { items: parsed };
}

function rankSummary(value: unknown): RankSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.created_at !== "number" ||
    typeof value.object_id !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.answer_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.title !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.reputation !== "number" ||
    typeof value.rank_type !== "string"
  ) {
    return null;
  }
  return {
    createdAt: value.created_at,
    objectId: value.object_id,
    questionId: value.question_id,
    answerId: value.answer_id,
    objectType: value.object_type,
    title: value.title,
    urlTitle: value.url_title,
    content: value.content,
    reputation: value.reputation,
    rankType: value.rank_type,
  };
}

function parseRankPageResponse(value: unknown): RankPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(rankSummary)
    .filter((item): item is RankSummary => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parsePersonalQuestionSummary(
  value: unknown,
): PersonalQuestionSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.vote_count !== "number" ||
    !Array.isArray(value.tags) ||
    typeof value.view_count !== "number" ||
    typeof value.answer_count !== "number" ||
    typeof value.collection_count !== "number" ||
    typeof value.created_at !== "number" ||
    typeof value.accepted_answer_id !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  const tags = value.tags
    .map(tagSummary)
    .filter((item): item is TagSummary => item !== null);
  if (tags.length !== value.tags.length) {
    return null;
  }
  return {
    id: value.id,
    question_id: value.question_id,
    title: value.title,
    url_title: value.url_title,
    description: value.description,
    vote_count: value.vote_count,
    tags,
    view_count: value.view_count,
    answer_count: value.answer_count,
    collection_count: value.collection_count,
    created_at: value.created_at,
    accepted_answer_id: value.accepted_answer_id,
    status: value.status,
  };
}

function parsePersonalQuestionPageResponse(
  value: unknown,
): PersonalQuestionPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(parsePersonalQuestionSummary)
    .filter((item): item is PersonalQuestionSummary => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parsePersonalAnswerSummary(
  value: unknown,
): PersonalAnswerSummary | null {
  if (!isRecord(value) || !isRecord(value.question_info)) return null;
  if (
    typeof value.answer_id !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.accepted !== "number" ||
    typeof value.vote_count !== "number" ||
    typeof value.create_time !== "number" ||
    typeof value.update_time !== "number" ||
    typeof value.question_info.title !== "string" ||
    typeof value.question_info.url_title !== "string" ||
    !Array.isArray(value.question_info.tags)
  ) {
    return null;
  }
  const tags = value.question_info.tags
    .map(tagSummary)
    .filter((item): item is TagSummary => item !== null);
  if (tags.length !== value.question_info.tags.length) {
    return null;
  }
  return {
    answer_id: value.answer_id,
    question_id: value.question_id,
    accepted: value.accepted,
    vote_count: value.vote_count,
    create_time: value.create_time,
    update_time: value.update_time,
    question_info: {
      title: value.question_info.title,
      url_title: value.question_info.url_title,
      tags,
    },
  };
}

function parsePersonalAnswerPageResponse(
  value: unknown,
): PersonalAnswerPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(parsePersonalAnswerSummary)
    .filter((item): item is PersonalAnswerSummary => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function answerTagInfo(value: unknown): AnswerTagInfo | null {
  if (
    !isRecord(value) ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string"
  ) {
    return null;
  }
  return {
    slug_name: value.slug_name,
    display_name: value.display_name,
  };
}

function answerUserBasicInfo(value: unknown): AnswerUserBasicInfo | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.username !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    username: value.username,
    rank: value.rank,
    display_name: value.display_name,
    avatar: value.avatar,
    status: value.status,
  };
}

function answerQuestionInfo(value: unknown): AnswerQuestionInfo | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.description !== "string" ||
    !Array.isArray(value.tags) ||
    typeof value.vote_count !== "number" ||
    typeof value.answer_count !== "number" ||
    typeof value.accepted_answer_id !== "string" ||
    typeof value.create_time !== "number" ||
    typeof value.update_time !== "number" ||
    typeof value.status !== "number"
  ) {
    return null;
  }
  const tags = value.tags
    .map(answerTagInfo)
    .filter((item): item is AnswerTagInfo => item !== null);
  if (tags.length !== value.tags.length) return null;
  const userInfo = answerUserBasicInfo(value.user_info);
  return {
    id: value.id,
    title: value.title,
    url_title: value.url_title,
    description: value.description,
    tags,
    vote_count: value.vote_count,
    answer_count: value.answer_count,
    accepted_answer_id: value.accepted_answer_id,
    create_time: value.create_time,
    update_time: value.update_time,
    status: value.status,
    user_info: userInfo || undefined,
  };
}

function answerInfo(value: unknown): AnswerInfo | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.content !== "string" ||
    typeof value.html !== "string" ||
    typeof value.create_time !== "number" ||
    typeof value.update_time !== "number" ||
    typeof value.accepted !== "number" ||
    typeof value.vote_count !== "number" ||
    typeof value.vote_status !== "string" ||
    typeof value.status !== "number"
  ) {
    return null;
  }
  const userInfo = answerUserBasicInfo(value.user_info);
  const questionInfo = answerQuestionInfo(value.question_info);
  return {
    id: value.id,
    question_id: value.question_id,
    content: value.content,
    html: value.html,
    create_time: value.create_time,
    update_time: value.update_time,
    accepted: value.accepted,
    vote_count: value.vote_count,
    vote_status: value.vote_status,
    status: value.status,
    user_info: userInfo || undefined,
    question_info: questionInfo || undefined,
  };
}

function parseAnswerInfoResponse(value: unknown): AnswerInfoResponse | null {
  if (!isRecord(value)) return null;
  const info = answerInfo(value.info);
  const question = answerQuestionInfo(value.question);
  if (!info || !question) return null;
  return { info, question };
}

function parseAnswerPageResponse(value: unknown): AnswerPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(answerInfo)
    .filter((item): item is AnswerInfo => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function adminAnswerInfo(value: unknown): AdminAnswerInfo | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.description !== "string" ||
    typeof value.create_time !== "number" ||
    typeof value.update_time !== "number" ||
    typeof value.accepted !== "number" ||
    typeof value.vote_count !== "number" ||
    !isRecord(value.question_info) ||
    typeof value.question_info.title !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  const userInfo = answerUserBasicInfo(value.user_info);
  return {
    id: value.id,
    question_id: value.question_id,
    description: value.description,
    create_time: value.create_time,
    update_time: value.update_time,
    accepted: value.accepted,
    vote_count: value.vote_count,
    user_info: userInfo || undefined,
    question_info: {
      title: value.question_info.title,
    },
    status: value.status,
  };
}

function parseAdminAnswerPageResponse(
  value: unknown,
): AdminAnswerPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(adminAnswerInfo)
    .filter((item): item is AdminAnswerInfo => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parseAdminContentPageResponse(
  value: unknown,
): AdminContentPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(feedItem)
    .filter((item): item is FeedItem => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function adminContentMutationResponse(
  value: unknown,
): AdminContentMutationResponse | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.status !== "string" ||
    typeof value.repositoryStatus !== "string" ||
    typeof value.sourceVisibility !== "string"
  ) {
    return null;
  }
  const item = feedItem(value.item);
  if (!item) return null;
  return {
    id: value.id,
    status: value.status,
    repositoryStatus: value.repositoryStatus,
    sourceVisibility: value.sourceVisibility,
    item,
  };
}

function adminContentTagsResponse(
  value: unknown,
): AdminContentTagsResponse | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isContentType(value.type) ||
    !Array.isArray(value.tags)
  ) {
    return null;
  }
  return {
    id: value.id,
    type: value.type,
    tags: strings(value.tags),
  };
}

function adminQuestionInfo(value: unknown): AdminQuestionInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.vote_count !== "number" ||
    typeof value.show !== "number" ||
    typeof value.pin !== "number" ||
    typeof value.answer_count !== "number" ||
    typeof value.accepted_answer_id !== "string" ||
    typeof value.create_time !== "number" ||
    typeof value.update_time !== "number" ||
    typeof value.edit_time !== "number"
  ) {
    return null;
  }
  const userInfo = answerUserBasicInfo(value.user_info);
  return {
    id: value.id,
    title: value.title,
    vote_count: value.vote_count,
    show: value.show,
    pin: value.pin,
    answer_count: value.answer_count,
    accepted_answer_id: value.accepted_answer_id,
    create_time: value.create_time,
    update_time: value.update_time,
    edit_time: value.edit_time,
    user_info: userInfo || undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    url_title:
      typeof value.url_title === "string" ? value.url_title : undefined,
    tags: strings(value.tags),
  };
}

function parseAdminQuestionPageResponse(
  value: unknown,
): AdminQuestionPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(adminQuestionInfo)
    .filter((item): item is AdminQuestionInfo => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function cultivationPermissionRule(
  value: unknown,
): CultivationPermissionRule | null {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    typeof value.label !== "string" ||
    typeof value.description !== "string" ||
    typeof value.min_rank !== "number"
  ) {
    return null;
  }
  return {
    key: value.key,
    label: value.label,
    description: value.description,
    minRank: value.min_rank,
  };
}

function parseCultivationPermissionResponse(
  value: unknown,
): CultivationPermissionResponse | null {
  if (!isRecord(value)) return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(cultivationPermissionRule)
    .filter((item): item is CultivationPermissionRule => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return {
    items: parsed,
    updatedAt: typeof value.updated_at === "number" ? value.updated_at : 0,
  };
}

function adminUserInfo(value: unknown): AdminUserInfo | null {
  if (
    !isRecord(value) ||
    typeof value.user_id !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.deleted_at !== "number" ||
    typeof value.suspended_at !== "number" ||
    typeof value.suspended_until !== "number" ||
    typeof value.username !== "string" ||
    typeof value.e_mail !== "string" ||
    typeof value.rank !== "number" ||
    !isAdminUserStatus(value.status) ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.role_id !== "number" ||
    !isAdminUserRole(value.role_name)
  ) {
    return null;
  }
  return {
    user_id: value.user_id,
    created_at: value.created_at,
    deleted_at: value.deleted_at,
    suspended_at: value.suspended_at,
    suspended_until: value.suspended_until,
    username: value.username,
    e_mail: value.e_mail,
    rank: value.rank,
    status: value.status,
    display_name: value.display_name,
    avatar: value.avatar,
    role_id: value.role_id,
    role_name: value.role_name,
  };
}

function parseAdminUserPageResponse(
  value: unknown,
): AdminUserPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(adminUserInfo)
    .filter((item): item is AdminUserInfo => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parseAnswerQuestionPageResponse(
  value: unknown,
): AnswerQuestionPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(answerQuestionInfo)
    .filter((item): item is AnswerQuestionInfo => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parsePersonalCommentSummary(
  value: unknown,
): PersonalCommentSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.comment_id !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.object_id !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.answer_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.title !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.content !== "string"
  ) {
    return null;
  }
  return {
    comment_id: value.comment_id,
    created_at: value.created_at,
    object_id: value.object_id,
    question_id: value.question_id,
    answer_id: value.answer_id,
    object_type: value.object_type,
    title: value.title,
    url_title: value.url_title,
    content: value.content,
  };
}

function parsePersonalCommentPageResponse(
  value: unknown,
): PersonalCommentPageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(parsePersonalCommentSummary)
    .filter((item): item is PersonalCommentSummary => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parsePersonalVoteSummary(value: unknown): PersonalVoteSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.answer_id !== "string" ||
    typeof value.content !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.object_id !== "string" ||
    typeof value.object_type !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.vote_type !== "string"
  ) {
    return null;
  }
  return {
    answer_id: value.answer_id,
    content: value.content,
    created_at: value.created_at,
    object_id: value.object_id,
    object_type: value.object_type,
    question_id: value.question_id,
    title: value.title,
    url_title: value.url_title,
    vote_type: value.vote_type,
  };
}

function parsePersonalVotePageResponse(
  value: unknown,
): PersonalVotePageResponse | null {
  if (!isRecord(value) || typeof value.count !== "number") return null;
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const parsed = rawItems
    .map(parsePersonalVoteSummary)
    .filter((item): item is PersonalVoteSummary => item !== null);
  if (parsed.length !== rawItems.length) return null;
  return { count: value.count, items: parsed };
}

function parsePersonalQATopResponse(
  value: unknown,
): PersonalQATopResponse | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.answer) ||
    !Array.isArray(value.question)
  ) {
    return null;
  }
  const answers = value.answer
    .map(parsePersonalAnswerSummary)
    .filter((item): item is PersonalAnswerSummary => item !== null);
  const questions = value.question
    .map(parsePersonalQuestionSummary)
    .filter((item): item is PersonalQuestionSummary => item !== null);
  if (
    answers.length !== value.answer.length ||
    questions.length !== value.question.length
  ) {
    return null;
  }
  return {
    answer: answers,
    question: questions,
  };
}

function answerUserInfo(value: unknown): AnswerUserInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.last_login_date !== "number" ||
    typeof value.username !== "string" ||
    typeof value.follow_count !== "number" ||
    typeof value.answer_count !== "number" ||
    typeof value.question_count !== "number" ||
    typeof value.rank !== "number" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.cover_url !== "string" ||
    typeof value.mobile !== "string" ||
    typeof value.bio !== "string" ||
    typeof value.bio_html !== "string" ||
    typeof value.website !== "string" ||
    typeof value.location !== "string" ||
    typeof value.status !== "string" ||
    typeof value.suspended_until !== "number"
  ) {
    return null;
  }
  return {
    id: value.id,
    created_at: value.created_at,
    last_login_date: value.last_login_date,
    username: value.username,
    follow_count: value.follow_count,
    following_count:
      typeof value.following_count === "number"
        ? value.following_count
        : typeof value.followingCount === "number"
          ? value.followingCount
          : 0,
    answer_count: value.answer_count,
    question_count: value.question_count,
    rank: value.rank,
    display_name: value.display_name,
    avatar: value.avatar,
    cover_url: value.cover_url,
    mobile: value.mobile,
    bio: value.bio,
    bio_html: value.bio_html,
    website: value.website,
    location: value.location,
    about_html: typeof value.about_html === "string" ? value.about_html : "",
    status: value.status,
    status_msg:
      typeof value.status_msg === "string" ? value.status_msg : undefined,
    suspended_until: value.suspended_until,
    is_follower:
      typeof value.is_follower === "boolean" ? value.is_follower : false,
  };
}

function userRelationItem(value: unknown): UserRelationItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.username !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.bio !== "string" ||
    typeof value.followed_at !== "number" ||
    typeof value.is_following !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    username: value.username,
    displayName: value.display_name,
    avatar: value.avatar,
    rank: value.rank,
    bio: value.bio,
    followedAt: value.followed_at,
    isFollowing: value.is_following,
  };
}

function userRelationListResult(value: unknown): UserRelationListResult | null {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    typeof value.page !== "number" ||
    typeof value.page_size !== "number"
  ) {
    return null;
  }
  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.list)
      ? value.list
      : null;
  if (!rawItems) return null;
  const items = rawItems.map(userRelationItem);
  if (items.some((item) => item === null)) return null;
  return {
    count: value.count,
    page: value.page,
    pageSize: value.page_size,
    items: items.filter((item): item is UserRelationItem => item !== null),
  };
}

function answerAvatarInfo(value: unknown): AnswerAvatarInfo | null {
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    typeof value.gravatar !== "string" ||
    typeof value.custom !== "string"
  ) {
    return null;
  }
  return {
    type: value.type,
    gravatar: value.gravatar,
    custom: value.custom,
  };
}

function currentUserInfo(value: unknown): CurrentUserInfo | null {
  if (!isRecord(value)) return null;
  const avatar = answerAvatarInfo(value.avatar);
  if (
    !avatar ||
    typeof value.id !== "string" ||
    typeof value.created_at !== "number" ||
    typeof value.last_login_date !== "number" ||
    typeof value.username !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.cover_url !== "string" ||
    typeof value.mobile !== "string" ||
    typeof value.bio !== "string" ||
    typeof value.bio_html !== "string" ||
    typeof value.website !== "string" ||
    typeof value.location !== "string" ||
    typeof value.language !== "string" ||
    typeof value.color_scheme !== "string" ||
    typeof value.access_token !== "string" ||
    typeof value.role_id !== "number" ||
    !isAdminUserRole(value.role_name) ||
    typeof value.rank !== "number" ||
    typeof value.status !== "string" ||
    typeof value.have_password !== "boolean" ||
    typeof value.visit_token !== "string" ||
    typeof value.suspended_until !== "number"
  ) {
    return null;
  }
  return {
    id: value.id,
    created_at: value.created_at,
    last_login_date: value.last_login_date,
    username: value.username,
    display_name: value.display_name,
    avatar,
    cover_url: value.cover_url,
    mobile: value.mobile,
    bio: value.bio,
    bio_html: value.bio_html,
    website: value.website,
    location: value.location,
    about_html: typeof value.about_html === "string" ? value.about_html : "",
    language: value.language,
    color_scheme: value.color_scheme,
    access_token: value.access_token,
    role_id: value.role_id,
    role_name: value.role_name,
    rank: value.rank,
    status: value.status,
    have_password: value.have_password,
    visit_token: value.visit_token,
    suspended_until: value.suspended_until,
  };
}

function userInterfaceConfig(value: unknown): UserInterfaceConfig | null {
  if (
    !isRecord(value) ||
    typeof value.language !== "string" ||
    typeof value.color_scheme !== "string"
  ) {
    return null;
  }
  return {
    language: value.language,
    colorScheme: value.color_scheme,
  };
}

function userActionRecord(value: unknown): UserActionRecord | null {
  if (
    !isRecord(value) ||
    typeof value.captcha_id !== "string" ||
    typeof value.captcha_img !== "string" ||
    typeof value.verify !== "boolean"
  ) {
    return null;
  }
  return {
    captchaId: value.captcha_id,
    captchaImg: value.captcha_img,
    verify: value.verify,
    count: typeof value.count === "number" ? value.count : 0,
    limit: typeof value.limit === "number" ? value.limit : 0,
    periodSeconds:
      typeof value.period_seconds === "number" ? value.period_seconds : 0,
  };
}

function answerNotificationChannelConfig(
  value: unknown,
): AnswerNotificationChannelConfig | null {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    typeof value.enable !== "boolean"
  ) {
    return null;
  }
  return {
    key: value.key,
    enable: value.enable,
  };
}

function userNotificationConfig(value: unknown): UserNotificationConfig | null {
  if (!isRecord(value)) return null;
  const inbox =
    answerNotificationChannelConfig(value.inbox) ??
    defaultUserNotificationConfig.inbox;
  const allNewQuestion =
    answerNotificationChannelConfig(value.all_new_question) ??
    defaultUserNotificationConfig.allNewQuestion;
  const allNewQuestionForFollowingTags =
    answerNotificationChannelConfig(
      value.all_new_question_for_following_tags,
    ) ?? defaultUserNotificationConfig.allNewQuestionForFollowingTags;
  return {
    inbox,
    allNewQuestion,
    allNewQuestionForFollowingTags,
  };
}

function userRankingSimpleInfo(value: unknown): UserRankingSimpleInfo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.username !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.vote_count !== "number" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string"
  ) {
    return null;
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    username: value.username,
    rank: value.rank,
    vote_count: value.vote_count,
    display_name: value.display_name,
    avatar: value.avatar,
  };
}

function parseUserRankingResponse(value: unknown): UserRankingResponse | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.users_with_the_most_reputation) ||
    !Array.isArray(value.users_with_the_most_vote) ||
    !Array.isArray(value.staffs)
  ) {
    return null;
  }
  const reputation = value.users_with_the_most_reputation
    .map(userRankingSimpleInfo)
    .filter((item): item is UserRankingSimpleInfo => item !== null);
  const vote = value.users_with_the_most_vote
    .map(userRankingSimpleInfo)
    .filter((item): item is UserRankingSimpleInfo => item !== null);
  const staffs = value.staffs
    .map(userRankingSimpleInfo)
    .filter((item): item is UserRankingSimpleInfo => item !== null);
  if (
    reputation.length !== value.users_with_the_most_reputation.length ||
    vote.length !== value.users_with_the_most_vote.length ||
    staffs.length !== value.staffs.length
  ) {
    return null;
  }
  return {
    users_with_the_most_reputation: reputation,
    users_with_the_most_vote: vote,
    staffs,
  };
}

function userStaffSummary(value: unknown): UserStaffSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.username !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string"
  ) {
    return null;
  }
  return {
    username: value.username,
    display_name: value.display_name,
    avatar: value.avatar,
  };
}

function badgeListItem(value: unknown): BadgeListItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.icon !== "string" ||
    typeof value.award_count !== "number" ||
    typeof value.earned !== "boolean" ||
    typeof value.level !== "number"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    icon: value.icon,
    award_count: value.award_count,
    earned: value.earned,
    level: value.level,
    earned_count:
      typeof value.earned_count === "number" ? value.earned_count : undefined,
  };
}

function badgeGroup(value: unknown): BadgeGroup | null {
  if (
    !isRecord(value) ||
    typeof value.group_name !== "string" ||
    !Array.isArray(value.badges)
  ) {
    return null;
  }
  const parsed = value.badges
    .map(badgeListItem)
    .filter((item): item is BadgeListItem => item !== null);
  if (parsed.length !== value.badges.length) {
    return null;
  }
  return {
    group_name: value.group_name,
    badges: parsed,
  };
}

function badgeInfo(value: unknown): BadgeInfo | null {
  const base = badgeListItem(value);
  if (
    !base ||
    typeof (value as Record<string, unknown>).description !== "string" ||
    typeof (value as Record<string, unknown>).is_single !== "boolean"
  ) {
    return null;
  }
  return {
    ...base,
    description: (value as Record<string, unknown>).description as string,
    is_single: (value as Record<string, unknown>).is_single as boolean,
  };
}

function badgeAwardItem(value: unknown): BadgeAwardItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.created_at !== "number" ||
    typeof value.object_type !== "string" ||
    typeof value.object_id !== "string" ||
    typeof value.url_title !== "string" ||
    typeof value.question_id !== "string" ||
    typeof value.answer_id !== "string" ||
    typeof value.comment_id !== "string"
  ) {
    return null;
  }
  const author = answerUserBasicInfo(value.author_user_info);
  if (!author) return null;
  return {
    created_at: value.created_at,
    author_user_info: author,
    object_type: value.object_type,
    object_id: value.object_id,
    url_title: value.url_title,
    question_id: value.question_id,
    answer_id: value.answer_id,
    comment_id: value.comment_id,
  };
}

function parseBadgeListResponse(value: unknown): BadgeGroup[] | null {
  if (!isRecord(value) || !Array.isArray(value)) return null;
  const parsed = value
    .map(badgeGroup)
    .filter((item): item is BadgeGroup => item !== null);
  return parsed.length === value.length ? parsed : null;
}

function parseBadgeAwardPageResponse(
  value: unknown,
): BadgeAwardPageResponse | null {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const parsed = value.items
    .map(badgeAwardItem)
    .filter((item): item is BadgeAwardItem => item !== null);
  if (parsed.length !== value.items.length) return null;
  return { count: value.count, items: parsed };
}

function parseUserBadgeAwardResponse(
  value: unknown,
): UserBadgeAwardResponse | null {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const parsed = value.items
    .map(badgeListItem)
    .filter((item): item is BadgeListItem => item !== null);
  if (parsed.length !== value.items.length) return null;
  return { count: value.count, items: parsed };
}

function answerStyleVoteResponse(
  value: unknown,
): AnswerStyleVoteResponse | null {
  if (
    !isRecord(value) ||
    typeof value.up_votes !== "number" ||
    typeof value.down_votes !== "number" ||
    typeof value.votes !== "number" ||
    typeof value.vote_status !== "string"
  ) {
    return null;
  }
  return {
    up_votes: value.up_votes,
    down_votes: value.down_votes,
    votes: value.votes,
    vote_status: value.vote_status,
  };
}

function reactionItem(value: unknown): ReactionItem | null {
  if (
    !isRecord(value) ||
    typeof value.emoji !== "string" ||
    typeof value.count !== "number" ||
    typeof value.tooltip !== "string" ||
    typeof value.is_active !== "boolean"
  ) {
    return null;
  }
  return {
    emoji: value.emoji,
    count: value.count,
    tooltip: value.tooltip,
    is_active: value.is_active,
  };
}

function reactionItems(value: unknown): ReactionItems | null {
  if (!isRecord(value) || !Array.isArray(value.reaction_summary)) {
    return null;
  }
  const parsed = value.reaction_summary
    .map(reactionItem)
    .filter((item): item is ReactionItem => item !== null);
  if (parsed.length !== value.reaction_summary.length) {
    return null;
  }
  return { reaction_summary: parsed };
}

function reactionUserItem(value: unknown): ReactionUserItem | null {
  if (
    !isRecord(value) ||
    typeof value.uid !== "string" ||
    typeof value.user_id !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.reacted_at !== "string"
  ) {
    return null;
  }
  return {
    uid: value.uid,
    user_id: value.user_id,
    display_name: value.display_name,
    avatar: value.avatar,
    rank: value.rank,
    reacted_at: value.reacted_at,
  };
}

function reactionUserList(value: unknown): ReactionUserList | null {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const items = value.items
    .map(reactionUserItem)
    .filter((item): item is ReactionUserItem => item !== null);
  if (items.length !== value.items.length) {
    return null;
  }
  return { count: value.count, items };
}

function repostUserItem(value: unknown): RepostUserItem | null {
  if (
    !isRecord(value) ||
    typeof value.uid !== "string" ||
    typeof value.user_id !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.reposted_at !== "string" ||
    typeof value.post_id !== "string" ||
    typeof value.post_slug !== "string" ||
    typeof value.body !== "string"
  ) {
    return null;
  }
  return {
    uid: value.uid,
    user_id: value.user_id,
    display_name: value.display_name,
    avatar: value.avatar,
    rank: value.rank,
    reposted_at: value.reposted_at,
    post_id: value.post_id,
    post_slug: value.post_slug,
    body: value.body,
  };
}

function repostUserList(value: unknown): RepostUserList | null {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const items = value.items
    .map(repostUserItem)
    .filter((item): item is RepostUserItem => item !== null);
  if (items.length !== value.items.length) {
    return null;
  }
  return { count: value.count, items };
}

function tagSummary(value: unknown): TagSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.slug !== "string" ||
    typeof value.name !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.postCount !== "number"
  ) {
    return null;
  }
  return {
    tagId: typeof value.tag_id === "string" ? value.tag_id : undefined,
    slug: value.slug,
    name: value.name,
    displayName: value.displayName,
    postCount: value.postCount,
    parentTags: tagParentSummaries(value.parent_tags),
    repositoryState:
      typeof value.repository_state === "string"
        ? (value.repository_state as TagSummary["repositoryState"])
        : undefined,
    repositoryId:
      typeof value.repository_id === "number" ? value.repository_id : undefined,
    ...tagMetadataFields(value),
  };
}

function tagDetail(value: unknown): TagDetail | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.tag_id !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.name !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.excerpt !== "string" ||
    typeof value.originalText !== "string" ||
    typeof value.parsedText !== "string" ||
    typeof value.followCount !== "number" ||
    typeof value.questionCount !== "number" ||
    typeof value.status !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const wikiSourceFile =
    sourceFileInfo(value.wikiSourceFile) ||
    sourceFileInfo(value.wiki_source_file);
  return {
    id: value.id,
    tagId: value.tag_id,
    slug: value.slug,
    slugName: value.slug_name,
    name: value.name,
    displayName: value.displayName,
    excerpt: value.excerpt,
    originalText: value.originalText,
    parsedText: value.parsedText,
    html: typeof value.html === "string" ? value.html : value.parsedText,
    texSource:
      typeof value.tex_source === "string"
        ? value.tex_source
        : value.originalText,
    rendererFinal: value.rendererFinal === true,
    wikiSourceFile: wikiSourceFile || undefined,
    followCount: value.followCount,
    readCount:
      typeof value.readCount === "number"
        ? value.readCount
        : typeof value.read_count === "number"
          ? value.read_count
          : 0,
    questionCount: value.questionCount,
    status: value.status,
    lifecycle:
      typeof value.lifecycle_state === "string" ? value.lifecycle_state : "active",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    repositoryState:
      typeof value.repository_state === "string"
        ? (value.repository_state as TagDetail["repositoryState"])
        : undefined,
    repositoryId:
      typeof value.repository_id === "number" ? value.repository_id : undefined,
    ...tagMetadataFields(value),
    parentTags: tagParentSummaries(value.parent_tags),
    outgoingReferences: tagReferenceSummaries(value.outgoing_references),
    incomingReferences: tagReferenceSummaries(value.incoming_references),
    outgoingObjectReferences: objectReferenceSummaries(
      value.outgoing_object_references,
    ),
    incomingObjectReferences: objectReferenceSummaries(
      value.incoming_object_references,
    ),
    publicVersion:
      typeof value.publicVersion === "string" ? value.publicVersion : undefined,
    contentDigest:
      typeof value.contentDigest === "string" ? value.contentDigest : undefined,
  };
}

function tagStats(value: unknown): TagStats | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.tag_id !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.total !== "number" ||
    typeof value.questions !== "number" ||
    typeof value.blogs !== "number" ||
    typeof value.discussions !== "number" ||
    typeof value.dynamics !== "number" ||
    typeof value.announcements !== "number"
  ) {
    return null;
  }
  return {
    tagId: value.tag_id,
    slugName: value.slug_name,
    total: value.total,
    questions: value.questions,
    blogs: value.blogs,
    discussions: value.discussions,
    dynamics: value.dynamics,
    announcements: value.announcements,
  };
}

function tagCultivationUser(value: unknown): TagCultivationUser | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.uid !== "string" ||
    typeof value.user_id !== "string" ||
    typeof value.username !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.avatar !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.tag_score !== "number" ||
    typeof value.post_score !== "number" ||
    typeof value.answer_score !== "number" ||
    typeof value.comment_score !== "number" ||
    typeof value.vote_score !== "number" ||
    typeof value.accepted_score !== "number" ||
    typeof value.content_count !== "number" ||
    typeof value.answer_count !== "number" ||
    typeof value.comment_count !== "number" ||
    typeof value.updated_at !== "number"
  ) {
    return null;
  }
  return {
    uid: value.uid,
    userId: value.user_id,
    username: value.username,
    displayName: value.display_name,
    avatar: value.avatar,
    rank: value.rank,
    tagScore: value.tag_score,
    postScore: value.post_score,
    answerScore: value.answer_score,
    commentScore: value.comment_score,
    voteScore: value.vote_score,
    acceptedScore: value.accepted_score,
    contentCount: value.content_count,
    answerCount: value.answer_count,
    commentCount: value.comment_count,
    updatedAt: value.updated_at,
  };
}

function tagCultivationResult(value: unknown): TagCultivationResult | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.tag_id !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.count !== "number" ||
    typeof value.page !== "number" ||
    typeof value.page_size !== "number" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const items = value.items.map(tagCultivationUser);
  if (items.some((item) => item === null)) return null;
  return {
    tagId: value.tag_id,
    slugName: value.slug_name,
    count: value.count,
    page: value.page,
    pageSize: value.page_size,
    items: items.filter((item): item is TagCultivationUser => item !== null),
  };
}

function tagPageItem(value: unknown): TagPageItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.tag_id !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.excerpt !== "string" ||
    typeof value.original_text !== "string" ||
    typeof value.parsed_text !== "string" ||
    typeof value.follow_count !== "number" ||
    typeof value.question_count !== "number" ||
    typeof value.is_follower !== "boolean" ||
    typeof value.created_at !== "number" ||
    typeof value.updated_at !== "number" ||
    typeof value.recommend !== "boolean" ||
    typeof value.reserved !== "boolean"
  ) {
    return null;
  }
  return {
    tagId: value.tag_id,
    slugName: value.slug_name,
    displayName: value.display_name,
    description: value.description,
    excerpt: value.excerpt,
    originalText: value.original_text,
    parsedText: value.parsed_text,
    followCount: value.follow_count,
    likeCount: typeof value.like_count === "number" ? value.like_count : 0,
    questionCount: value.question_count,
    isFollower: value.is_follower,
    isLiked: value.is_liked === true,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    recommend: value.recommend,
    reserved: value.reserved,
    ...tagMetadataFields(value),
  };
}

function followingTag(value: unknown): FollowingTag | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.tag_id !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.main_tag_slug_name !== "string" ||
    typeof value.recommend !== "boolean" ||
    typeof value.reserved !== "boolean"
  ) {
    return null;
  }
  return {
    tagId: value.tag_id,
    slugName: value.slug_name,
    displayName: value.display_name,
    mainTagSlugName: value.main_tag_slug_name,
    recommend: value.recommend,
    reserved: value.reserved,
    ...tagMetadataFields(value),
  };
}

function tagMemberAction(value: unknown): TagMemberAction | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.action !== "string" ||
    typeof value.name !== "string" ||
    typeof value.type !== "string"
  ) {
    return null;
  }
  return {
    action: value.action,
    name: value.name,
    type: value.type,
  };
}

function tagSynonym(value: unknown): TagSynonym | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.tag_id !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.main_tag_slug_name !== "string"
  ) {
    return null;
  }
  return {
    tagId: value.tag_id,
    slugName: value.slug_name,
    displayName: value.display_name,
    mainTagSlugName: value.main_tag_slug_name,
    ...tagMetadataFields(value),
  };
}

function tagSynonymResult(value: unknown): TagSynonymResult | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.synonyms) ||
    !Array.isArray(value.member_actions)
  ) {
    return null;
  }
  const synonyms = value.synonyms.map(tagSynonym);
  const memberActions = value.member_actions.map(tagMemberAction);
  if (
    synonyms.some((item) => item === null) ||
    memberActions.some((item) => item === null)
  ) {
    return null;
  }
  return {
    synonyms: synonyms.filter((item): item is TagSynonym => item !== null),
    memberActions: memberActions.filter(
      (item): item is TagMemberAction => item !== null,
    ),
  };
}

function tagMutationResponse(value: unknown): TagMutationResponse | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.tag_id !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.slug_name !== "string" ||
    typeof value.display_name !== "string" ||
    typeof value.waitForReview !== "boolean" ||
    typeof value.status !== "number" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    tagId: value.tag_id,
    slug: value.slug,
    slugName: value.slug_name,
    displayName: value.display_name,
    waitForReview: value.waitForReview,
    status: value.status,
    updatedAt: value.updatedAt,
    repositoryState:
      typeof value.repository_state === "string"
        ? (value.repository_state as TagMutationResponse["repositoryState"])
        : undefined,
    repositoryId:
      typeof value.repository_id === "number" ? value.repository_id : undefined,
    ...tagMetadataFields(value),
  };
}

function parseQuestionDetail(value: unknown): QuestionDetail | null {
  if (
    !isRecord(value) ||
    !isRecord(value.question) ||
    !Array.isArray(value.answers) ||
    typeof value.body !== "string"
  ) {
    return null;
  }
  const questionItem = feedItem(value.question);
  if (
    !questionItem ||
    typeof value.question.slug !== "string" ||
    typeof value.question.createdAt !== "string" ||
    typeof value.question.updatedAt !== "string" ||
    typeof value.question.viewCount !== "number" ||
    typeof value.question.voteCount !== "number" ||
    typeof value.question.answerCount !== "number" ||
    typeof value.question.followCount !== "number" ||
    typeof value.question.isFollowed !== "boolean" ||
    typeof value.question.acceptedAnswerId !== "number" ||
    typeof value.question.lastAnswerId !== "number" ||
    typeof value.question.status !== "number" ||
    typeof value.question.pin !== "number" ||
    typeof value.question.show !== "number"
  ) {
    return null;
  }
  const answers = value.answers.map(answerSummary);
  if (answers.some((item) => item === null)) return null;
  return {
    question: {
      ...questionItem,
      slug: value.question.slug,
      body: value.body,
      readCount: value.question.viewCount,
      createdAt: value.question.createdAt,
      updatedAt: value.question.updatedAt,
      viewCount: value.question.viewCount,
      voteCount: value.question.voteCount,
      answerCount: value.question.answerCount,
      followCount: value.question.followCount,
      isFollowed: value.question.isFollowed,
      collected:
        typeof value.question.collected === "boolean"
          ? value.question.collected
          : false,
      acceptedAnswerId: value.question.acceptedAnswerId,
      lastAnswerId: value.question.lastAnswerId,
      status: value.question.status,
      pin: value.question.pin,
      show: value.question.show,
    },
    body: value.body,
    answers: answers.filter((item): item is AnswerSummary => item !== null),
  };
}

function canonicalContentCacheType(type: ContentType) {
  if (type === "forum") return "discussion";
  if (type === "status") return "dynamic";
  return type;
}

export function readCachedContentDetail(type: ContentType, slug: string) {
  return readCachedSnapshot(
    responseCacheKey(["content-detail", canonicalContentCacheType(type), slug]),
    parsePostDetail,
  );
}

function writeCachedContentDetail(
  type: ContentType,
  slug: string,
  detail: PostDetail,
) {
  const cacheType = canonicalContentCacheType(type);
  writeCachedSnapshot(
    responseCacheKey(["content-detail", cacheType, slug]),
    detail,
  );
  if (detail.slug && detail.slug !== slug) {
    writeCachedSnapshot(
      responseCacheKey(["content-detail", cacheType, detail.slug]),
      detail,
    );
  }
}

export function readCachedQuestionDetail(slug: string) {
  return readCachedSnapshot(
    responseCacheKey(["question-detail", slug]),
    parseQuestionDetail,
  );
}

function writeCachedQuestionDetail(slug: string, detail: QuestionDetail) {
  writeCachedSnapshot(responseCacheKey(["question-detail", slug]), detail);
  if (detail.question.slug && detail.question.slug !== slug) {
    writeCachedSnapshot(
      responseCacheKey(["question-detail", detail.question.slug]),
      detail,
    );
  }
}

function notificationItem(value: unknown): NotificationItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.actor !== "string" ||
    typeof value.type !== "string" ||
    typeof value.targetType !== "string" ||
    typeof value.targetId !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    actor: value.actor,
    type: value.type,
    targetType: value.targetType,
    targetId: value.targetId,
    excerpt: typeof value.excerpt === "string" ? value.excerpt : undefined,
    readAt: typeof value.readAt === "string" ? value.readAt : undefined,
    createdAt: value.createdAt,
  };
}

function stringMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function notificationPageItem(value: unknown): NotificationPageItem | null {
  if (!isRecord(value) || !isRecord(value.object_info)) return null;
  const objectMap = stringMap(value.object_info.object_map);
  if (
    typeof value.id !== "string" ||
    typeof value.object_info.title !== "string" ||
    typeof value.object_info.object_id !== "string" ||
    !objectMap ||
    typeof value.object_info.object_type !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.notification_action !== "string" ||
    typeof value.is_read !== "boolean" ||
    typeof value.update_time !== "number" ||
    typeof value.type !== "string" ||
    typeof value.target_type !== "string" ||
    typeof value.target_id !== "string"
  ) {
    return null;
  }
  let userInfo: NotificationPageItem["userInfo"];
  if (isRecord(value.user_info)) {
    if (
      typeof value.user_info.id !== "string" ||
      typeof value.user_info.username !== "string" ||
      typeof value.user_info.display_name !== "string"
    ) {
      return null;
    }
    userInfo = {
      id: value.user_info.id,
      username: value.user_info.username,
      displayName: value.user_info.display_name,
      avatar:
        typeof value.user_info.avatar === "string"
          ? value.user_info.avatar
          : undefined,
    };
  }
  let reportResult: NotificationPageItem["reportResult"];
  if (
    isRecord(value.report_result) &&
    typeof value.report_result.outcome === "string" &&
    typeof value.report_result.reportId === "string" &&
    typeof value.report_result.targetType === "string" &&
    typeof value.report_result.targetSummary === "string" &&
    typeof value.report_result.targetAvailable === "boolean"
  ) {
    reportResult = {
      outcome: value.report_result.outcome,
      reportId: value.report_result.reportId,
      targetType: value.report_result.targetType,
      targetSummary: value.report_result.targetSummary,
      targetAvailable: value.report_result.targetAvailable,
    };
  }
  return {
    id: value.id,
    userInfo,
    objectInfo: {
      title: value.object_info.title,
      objectId: value.object_info.object_id,
      objectMap,
      objectType: value.object_info.object_type,
      excerpt:
        typeof value.object_info.excerpt === "string"
          ? value.object_info.excerpt
          : undefined,
    },
    rank: value.rank,
    actorKind: value.actor_kind === "system" ? "system" : "user",
    notificationAction: value.notification_action,
    isRead: value.is_read,
    updateTime: value.update_time,
    type: value.type,
    targetType: value.target_type,
    targetId: value.target_id,
    message: typeof value.message === "string" ? value.message : undefined,
    href: typeof value.href === "string" ? value.href : undefined,
    reportResult,
  };
}

function notificationStatus(value: unknown): NotificationStatus | null {
  if (
    !isRecord(value) ||
    typeof value.inbox !== "number" ||
    typeof value.revision !== "number" ||
    typeof value.can_revision !== "boolean"
  ) {
    return null;
  }
  const system = typeof value.system === "number"
    ? value.system
    : typeof value.achievement === "number"
      ? value.achievement
      : null;
  if (system === null) return null;
  let badgeAward: NotificationStatus["badgeAward"] = null;
  if (isRecord(value.badge_award)) {
    if (
      typeof value.badge_award.notification_id !== "string" ||
      typeof value.badge_award.badge_id !== "string" ||
      typeof value.badge_award.name !== "string"
    ) {
      return null;
    }
    badgeAward = {
      notificationId: value.badge_award.notification_id,
      badgeId: value.badge_award.badge_id,
      name: value.badge_award.name,
    };
  }
  return {
    inbox: value.inbox,
    system,
    achievement: typeof value.achievement === "number" ? value.achievement : system,
    revision: value.revision,
    canRevision: value.can_revision,
    badgeAward,
  };
}

function reportSummary(value: unknown): ReportSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "number" ||
    typeof value.reporter !== "string" ||
    typeof value.reportedUser !== "string" ||
    typeof value.targetType !== "string" ||
    typeof value.targetId !== "string" ||
    typeof value.reportType !== "number" ||
    typeof value.content !== "string" ||
    typeof value.status !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    reporter: value.reporter,
    reportedUser: value.reportedUser,
    targetType: value.targetType,
    targetId: value.targetId,
    reportType: value.reportType,
    content: value.content,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export async function loadSiteInfo(): Promise<AnswerSiteInfo> {
  const response = await fetch(siteInfoEndpoint, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "站点信息加载失败。";
    throw new Error(message);
  }
  const parsed = answerSiteInfo(payload);
  if (!parsed) throw new Error("站点信息返回格式异常。");
  return parsed;
}

export async function loadSiteLegalInfo(
  infoType: "tos" | "privacy",
): Promise<SiteLegalInfo> {
  const params = new URLSearchParams({ info_type: infoType });
  const response = await fetch(`${siteLegalEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "站点法律信息加载失败。";
    throw new Error(message);
  }
  const parsed = siteLegalInfo(payload);
  if (!parsed) throw new Error("站点法律信息返回格式异常。");
  return parsed;
}

export async function loadRenderConfig(): Promise<RenderConfig> {
  const response = await fetch(renderConfigEndpoint, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("渲染配置加载失败。");
  const parsed = renderConfig(payload);
  if (!parsed) throw new Error("渲染配置返回格式异常。");
  return parsed;
}

export async function renderPostContent(content: string): Promise<string> {
  const response = await fetch(postRenderEndpoint, {
    method: "POST",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(jsonMessageFromText(text, "内容渲染失败。"));
  }
  return text;
}

export async function uploadAnswerFile(
  source: AnswerFileUploadSource,
  file: File,
): Promise<string> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后上传文件。");
  }
  const body = new FormData();
  body.set("source", source);
  body.set("file", file);
  const response = await fetch(fileUploadEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body,
  });
  const text = await response.text();
  const payload = parseUnknownJson(text);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : jsonMessageFromText(text, "文件上传失败。");
    throw new Error(message);
  }
  if (typeof payload !== "string" || !payload.trim()) {
    throw new Error("文件上传返回格式异常。");
  }
  return payload;
}

export async function startBookImportJob(
  slug: string,
  file: File,
): Promise<BookImportJob> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后导入书籍。");
  }
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(slug)}/import-jobs`,
    {
      method: "POST",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body,
    },
  );
  const text = await response.text();
  const payload = parseUnknownJson(text);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : jsonMessageFromText(text, "书籍导入任务创建失败。");
    throw new Error(message);
  }
  const parsed = parseBookImportJob(payload);
  if (!parsed) throw new Error("书籍导入任务返回格式异常。");
  return parsed;
}

export async function loadBookImportJob(
  slug: string,
  jobId: string,
): Promise<BookImportJob> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看导入任务。");
  }
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(slug)}/import-jobs/${encodeURIComponent(jobId)}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const text = await response.text();
  const payload = parseUnknownJson(text);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : jsonMessageFromText(text, "书籍导入任务读取失败。");
    throw new Error(message);
  }
  const parsed = parseBookImportJob(payload);
  if (!parsed) throw new Error("书籍导入任务返回格式异常。");
  return parsed;
}

export async function loadEmbedConfig(): Promise<EmbedConfig[]> {
  const response = await fetch(embedConfigEndpoint, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("嵌入配置加载失败。");
  if (!Array.isArray(payload)) throw new Error("嵌入配置返回格式异常。");
  const parsed = payload.map(embedConfig);
  if (parsed.some((item) => item === null))
    throw new Error("嵌入配置条目格式异常。");
  return parsed.filter((item): item is EmbedConfig => item !== null);
}

export async function loadPluginStatus(): Promise<PluginStatus[]> {
  const response = await fetch(pluginStatusEndpoint, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("插件状态加载失败。");
  if (!Array.isArray(payload)) throw new Error("插件状态返回格式异常。");
  const parsed = payload.map(pluginStatus);
  if (parsed.some((item) => item === null))
    throw new Error("插件状态条目格式异常。");
  return parsed.filter((item): item is PluginStatus => item !== null);
}

export async function loadConnectorInfo(): Promise<ConnectorInfo[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看连接器。");
  }
  const response = await fetch(connectorInfoEndpoint, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("连接器信息加载失败。");
  if (!Array.isArray(payload)) throw new Error("连接器信息返回格式异常。");
  const parsed = payload.map(connectorInfo);
  if (parsed.some((item) => item === null))
    throw new Error("连接器信息条目格式异常。");
  return parsed.filter((item): item is ConnectorInfo => item !== null);
}

export async function loadConnectorUserInfo(): Promise<ConnectorUserInfo[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看连接器绑定状态。");
  }
  const response = await fetch(connectorUserInfoEndpoint, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("连接器绑定状态加载失败。");
  if (!Array.isArray(payload)) throw new Error("连接器绑定状态返回格式异常。");
  const parsed = payload.map(connectorUserInfo);
  if (parsed.some((item) => item === null))
    throw new Error("连接器绑定状态条目格式异常。");
  return parsed.filter((item): item is ConnectorUserInfo => item !== null);
}

export async function loadUserPluginConfigs(): Promise<UserPluginSummary[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看插件列表。");
  }
  const response = await fetch(userPluginConfigsEndpoint, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("插件列表加载失败。");
  if (!Array.isArray(payload)) throw new Error("插件列表返回格式异常。");
  const parsed = payload.map(userPluginSummary);
  if (parsed.some((item) => item === null))
    throw new Error("插件列表条目格式异常。");
  return parsed.filter((item): item is UserPluginSummary => item !== null);
}

export async function loadUserPluginConfig(
  pluginSlugName: string,
): Promise<UserPluginConfig> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看插件配置。");
  }
  const params = new URLSearchParams({ plugin_slug_name: pluginSlugName });
  const response = await fetch(
    `${userPluginConfigEndpoint}?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("插件配置加载失败。");
  const parsed = userPluginConfig(payload);
  if (!parsed) throw new Error("插件配置返回格式异常。");
  return parsed;
}

export async function updateUserPluginConfig(input: {
  pluginSlugName: string;
  configFields: Record<string, unknown>;
}): Promise<void> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后更新插件配置。");
  }
  const response = await fetch(userPluginConfigEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      plugin_slug_name: input.pluginSlugName,
      config_fields: input.configFields,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "插件配置更新失败。";
    throw new Error(message);
  }
}

export async function loadLanguageOptions(): Promise<LanguageOption[]> {
  const response = await fetch(languageOptionsEndpoint, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("语言选项加载失败。");
  if (!Array.isArray(payload)) throw new Error("语言选项返回格式异常。");
  const parsed = payload.map(languageOption);
  if (parsed.some((item) => item === null))
    throw new Error("语言选项条目格式异常。");
  return parsed.filter((item): item is LanguageOption => item !== null);
}

export async function loadLanguageConfig(): Promise<Record<string, string>> {
  const response = await fetch(languageConfigEndpoint, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("语言配置加载失败。");
  if (!isRecord(payload)) throw new Error("语言配置返回格式异常。");
  const entries = Object.entries(payload);
  if (entries.some(([, value]) => typeof value !== "string"))
    throw new Error("语言配置条目格式异常。");
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function checkPermissions(
  actions: string[],
): Promise<Record<string, PermissionResult>> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后检查权限。");
  const params = new URLSearchParams({ action: actions.join(",") });
  const response = await fetch(`${permissionEndpoint}?${params.toString()}`, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "权限检查失败。";
    throw new Error(message);
  }
  if (!isRecord(payload)) throw new Error("权限返回格式异常。");
  const result: Record<string, PermissionResult> = {};
  for (const [action, value] of Object.entries(payload)) {
    const parsed = permissionResult(value);
    if (!parsed) throw new Error("权限条目格式异常。");
    result[action] = parsed;
  }
  return result;
}

export async function loadReasons(input: {
  objectType: ReportTargetInput["targetType"] | "tag";
  action: "status" | "close" | "flag" | "review";
}): Promise<ReasonItem[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看原因列表。");
  const params = new URLSearchParams({
    object_type: input.objectType,
    action: input.action,
  });
  const response = await fetch(`${reasonsEndpoint}?${params.toString()}`, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "原因列表加载失败。";
    throw new Error(message);
  }
  if (!Array.isArray(payload)) throw new Error("原因列表返回格式异常。");
  const parsed = payload.map(reasonItem);
  if (parsed.some((item) => item === null))
    throw new Error("原因条目格式异常。");
  return parsed.filter((item): item is ReasonItem => item !== null);
}

export async function loadHomeFeed(
  input: HomeFeedMode | HomeFeedInput = "hot",
) {
  const options: HomeFeedInput =
    typeof input === "string" ? { mode: input } : input;
  const mode = options.mode || "hot";
  const params = new URLSearchParams({ mode });
  if (typeof options.page === "number") {
    params.set("page", String(options.page));
  }
  if (typeof options.size === "number") {
    params.set("size", String(options.size));
  }
  const headers = await optionalAuthHeaders();
  const response = await fetch(`${feedEndpoint}?${params.toString()}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error("首页聚合流加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseHomeFeed(payload);
  if (!parsed) {
    throw new Error("首页聚合流返回格式异常。");
  }
  if (!options.page || options.page <= 1) {
    writeCachedHomeFeed(mode, parsed);
  }
  return parsed;
}

export async function loadTagActivity(
  input: { limit?: number } = {},
): Promise<FeedItem[]> {
  const params = new URLSearchParams();
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const headers = await optionalAuthHeaders();
  const response = await fetch(`${tagActivityEndpoint}${suffix}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error("标签动态加载失败。");
  }
  const payload: unknown = await response.json();
  const rawItems = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : null;
  if (!rawItems) {
    throw new Error("标签动态返回格式异常。");
  }
  const parsed = rawItems.map(feedItem);
  if (parsed.some((item) => item === null)) {
    throw new Error("标签动态条目格式异常。");
  }
  return parsed.filter((item): item is FeedItem => item !== null);
}

export async function loadHomeSidebar(
  input: { limit?: number } = {},
): Promise<HomeSidebar> {
  const params = new URLSearchParams();
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const headers = await optionalAuthHeaders();
  const query = params.toString();
  const response = await fetch(
    `${homeSidebarEndpoint}${query ? `?${query}` : ""}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "首页侧栏加载失败。";
    throw new Error(message);
  }
  const parsed = parseHomeSidebar(payload);
  if (!parsed) {
    throw new Error("首页侧栏返回格式异常。");
  }
  return parsed;
}

export async function loadKnowledgeGraph(
  input: {
    tagLimit?: number;
    contentLimit?: number;
    username?: string;
  } = {},
): Promise<KnowledgeGraphResponse> {
  const params = new URLSearchParams();
  if (typeof input.tagLimit === "number") {
    params.set("tag_limit", String(input.tagLimit));
  }
  if (typeof input.contentLimit === "number") {
    params.set("content_limit", String(input.contentLimit));
  }
  if (input.username) {
    params.set("username", input.username);
  }
  const query = params.toString();
  const response = await fetch(
    `${knowledgeGraphEndpoint}${query ? `?${query}` : ""}`,
    { headers: { Accept: "application/json" } },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "知识图谱加载失败。";
    throw new Error(message);
  }
  const parsed = parseKnowledgeGraphResponse(payload);
  if (!parsed) throw new Error("知识图谱返回格式异常。");
  return parsed;
}

type LoadContentDetailOptions = {
  origin?: string;
};

function contentDetailEndpoint(options?: LoadContentDetailOptions) {
  if (!options?.origin) return contentEndpoint;
  return `${options.origin.replace(/\/+$/, "")}/api/content`;
}

export async function loadContentDetail(
  slug: string,
  options?: LoadContentDetailOptions,
) {
  const headers = await optionalAuthHeaders();
  const response = await fetch(
    `${contentDetailEndpoint(options)}/${encodeURIComponent(slug)}`,
    {
      headers,
    },
  );
  if (!response.ok) {
    throw new Error("内容详情加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePostDetail(payload);
  if (!parsed) {
    throw new Error("内容详情返回格式异常。");
  }
  writeCachedContentDetail(parsed.type, slug, parsed);
  return parsed;
}

function parseBookWorkspaceCodeOpenResponse(
  value: unknown,
): BookWorkspaceCodeOpenResponse | null {
  if (!isRecord(value)) return null;
  const url = optionalString(value.url);
  const workspacePath = optionalString(value.workspacePath);
  const state = optionalString(value.state) || "ready";
  const owner = optionalString(value.owner);
  const repository = optionalString(value.repository);
  const repositoryUrl = optionalString(value.repositoryUrl) || "";
  const branch = optionalString(value.branch) || "main";
  const traceId = optionalString(value.traceId);
  if (
    !url ||
    !workspacePath ||
    !owner ||
    !repository ||
    (state !== "ready" && state !== "preparing")
  )
    return null;
  return {
    url,
    workspacePath,
    state,
    owner,
    repository,
    repositoryUrl,
    branch,
    traceId,
  };
}

export async function openBookCodeWorkspace(
  bookId: string,
): Promise<BookWorkspaceCodeOpenResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后打开 code-server。");
  const editorTrace = beginEditorOpenTrace();
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/workspace/code`,
    {
      method: "POST",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
        ...editorTrace.headers,
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "code-server 工作区打开失败。";
    throw new Error(message);
  }
  const parsed = parseBookWorkspaceCodeOpenResponse(payload);
  if (!parsed) throw new Error("code-server 工作区返回格式异常。");
  return parsed;
}

export async function openArticleCodeWorkspace(
  articleId: string,
): Promise<BookWorkspaceCodeOpenResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后打开 code-server。");
  const editorTrace = beginEditorOpenTrace();
  const response = await fetch(
    `${contentEndpoint}/${encodeURIComponent(articleId)}/workspace/code`,
    {
      method: "POST",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
        ...editorTrace.headers,
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "code-server 工作区打开失败。";
    throw new Error(message);
  }
  const parsed = parseBookWorkspaceCodeOpenResponse(payload);
  if (!parsed) throw new Error("code-server 工作区返回格式异常。");
  return parsed;
}

type TagCodeWorkspaceRef =
  | string
  | {
      tagId?: string;
      slugName?: string;
      slug?: string;
    };

function tagCodeWorkspaceRef(ref: TagCodeWorkspaceRef) {
  if (typeof ref === "string") return ref;
  const tagId = (ref.tagId || "").trim();
  if (/^\d+$/.test(tagId)) return tagId;
  return ref.slugName || ref.slug || tagId;
}

export async function openTagCodeWorkspace(
  ref: TagCodeWorkspaceRef,
): Promise<BookWorkspaceCodeOpenResponse> {
  const tagRef = tagCodeWorkspaceRef(ref);
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后打开 code-server。");
  const editorTrace = beginEditorOpenTrace();
  const response = await fetch(
    `${tagListEndpoint}/${encodeURIComponent(tagRef)}/workspace/code`,
    {
      method: "POST",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
        ...editorTrace.headers,
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "code-server 工作区打开失败。";
    throw new Error(message);
  }
  const parsed = parseBookWorkspaceCodeOpenResponse(payload);
  if (!parsed) throw new Error("code-server 工作区返回格式异常。");
  return parsed;
}

export async function loadContentFeed(
  input: LoadContentFeedInput = {},
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  if (input.type) params.set("type", input.type);
  if (input.username) params.set("username", input.username);
  if (input.tagId) params.set("tag_id", input.tagId);
  if (input.tag) params.set("tag", input.tag);
  if (input.order) params.set("order", input.order);
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.size === "number") params.set("size", String(input.size));
  if (input.includeDrafts) params.set("include_drafts", "true");
  const query = params.toString();
  const headers = await optionalAuthHeaders();
  const response = await fetch(
    `${contentEndpoint}${query ? `?${query}` : ""}`,
    {
      headers,
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("内容列表返回格式异常。");
  return parsed;
}

export async function loadBookFeed(
  input: Omit<LoadContentFeedInput, "type"> = {},
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  if (input.username) params.set("username", input.username);
  if (input.tagId) params.set("tag_id", input.tagId);
  if (input.tag) params.set("tag", input.tag);
  if (input.order) params.set("order", input.order);
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.size === "number") params.set("size", String(input.size));
  if (input.includeDrafts) params.set("include_drafts", "true");
  const query = params.toString();
  const headers = await optionalAuthHeaders();
  const response = await fetch(
    `${bookReviewEndpoint}${query ? `?${query}` : ""}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "书库加载失败。";
    throw new Error(message);
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("书库返回格式异常。");
  return parsed;
}

export async function loadDiscussionFeed(
  input: LoadDiscussionFeedInput = {},
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  if (input.section) params.set("section", input.section);
  if (input.order) params.set("order", input.order);
  if (input.page) params.set("page", String(input.page));
  if (input.size) params.set("size", String(input.size));
  const query = params.toString();
  const response = await fetch(
    `${discussionEndpoint}${query ? `?${query}` : ""}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "讨论列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("讨论列表返回格式异常。");
  return parsed;
}

export async function loadAnnouncementFeed(
  input: Pick<LoadDiscussionFeedInput, "page" | "size"> = {},
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.size) params.set("size", String(input.size));
  const query = params.toString();
  const response = await fetch(
    `${announcementEndpoint}${query ? `?${query}` : ""}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "公告列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("公告列表返回格式异常。");
  return parsed;
}

export async function loadDynamicFeed(
  input: LoadDynamicFeedInput = {},
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  if (input.username) params.set("username", input.username);
  if (input.order) params.set("order", input.order);
  if (input.page) params.set("page", String(input.page));
  if (input.size) params.set("size", String(input.size));
  const query = params.toString();
  const response = await fetch(`${statusEndpoint}${query ? `?${query}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "动态列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("动态列表返回格式异常。");
  return parsed;
}

export async function loadQuestionDetail(slug: string) {
  const headers = await optionalAuthHeaders();
  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(slug)}`,
    {
      headers,
    },
  );
  if (!response.ok) {
    throw new Error("题目详情加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("题目详情返回格式异常。");
  }
  writeCachedQuestionDetail(slug, parsed);
  return parsed;
}

export async function searchContent(
  input: SearchInput,
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: input.query,
    order: input.order || "relevance",
  });
  if (input.type) {
    params.set("type", input.type);
  }
  if (typeof input.page === "number") {
    params.set("page", String(input.page));
  }
  if (typeof input.size === "number") {
    params.set("size", String(input.size));
  }
  const response = await fetch(`${searchEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("搜索结果加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseSearchResponse(payload);
  if (!parsed) {
    throw new Error("搜索结果返回格式异常。");
  }
  return parsed;
}

export async function searchCitations(
  input: CitationSearchInput,
): Promise<CitationResponse> {
  const params = new URLSearchParams({ q: input.query });
  if (input.types?.length) params.set("types", input.types.join(","));
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const response = await fetch(
    `${citationSearchEndpoint}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "引用搜索失败。";
    throw new Error(message);
  }
  const parsed = parseCitationResponse(payload);
  if (!parsed) {
    throw new Error("引用搜索返回格式异常。");
  }
  return parsed;
}

export async function resolveCitations(
  keys: string[],
): Promise<CitationResponse> {
  const params = new URLSearchParams({ keys: keys.join(",") });
  const response = await fetch(
    `${citationResolveEndpoint}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "引用解析失败。";
    throw new Error(message);
  }
  const parsed = parseCitationResponse(payload);
  if (!parsed) {
    throw new Error("引用解析返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalRankPage(
  input: RankPageInput = {},
): Promise<RankPageResponse> {
  const params = new URLSearchParams();
  if (typeof input.page === "number") {
    params.set("page", String(input.page));
  }
  if (typeof input.pageSize === "number") {
    params.set("page_size", String(input.pageSize));
  }
  if (input.username) {
    params.set("username", input.username);
  }
  if (input.userId) {
    params.set("user_id", input.userId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${rankEndpoint}${suffix}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("修为记录加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseRankPageResponse(payload);
  if (!parsed) {
    throw new Error("修为记录返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalQuestionPage(
  input: PersonalPageInput = {},
): Promise<PersonalQuestionPageResponse> {
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.username) params.set("username", input.username);
  if (input.userId) params.set("user_id", input.userId);
  if (input.order) params.set("order", input.order);
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/question/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("个人题目加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePersonalQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("个人题目返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalAnswerPage(
  input: PersonalPageInput = {},
): Promise<PersonalAnswerPageResponse> {
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.username) params.set("username", input.username);
  if (input.userId) params.set("user_id", input.userId);
  if (input.order) params.set("order", input.order);
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/answer/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("个人回答加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePersonalAnswerPageResponse(payload);
  if (!parsed) {
    throw new Error("个人回答返回格式异常。");
  }
  return parsed;
}

export async function loadAnswerInfo(
  answerId: string | number,
): Promise<AnswerInfoResponse> {
  const params = new URLSearchParams({ id: String(answerId) });
  const response = await fetch(`${answerInfoEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("回答详情加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerInfoResponse(payload);
  if (!parsed) {
    throw new Error("回答详情返回格式异常。");
  }
  return parsed;
}

export async function loadAnswerPage(input: {
  questionId: string | number;
  order?: "default" | "updated" | "created" | "active" | "newest";
  page?: number;
  pageSize?: number;
}): Promise<AnswerPageResponse> {
  const params = new URLSearchParams({ question_id: String(input.questionId) });
  if (input.order) params.set("order", input.order);
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const response = await fetch(`${answerPageEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("回答列表加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerPageResponse(payload);
  if (!parsed) {
    throw new Error("回答列表返回格式异常。");
  }
  return parsed;
}

export async function loadAnswerQuestionInfo(
  questionId: string | number,
): Promise<AnswerQuestionInfo> {
  const params = new URLSearchParams({ id: String(questionId) });
  const response = await fetch(
    `${answerQuestionEndpoint}/info?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("题目信息加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = answerQuestionInfo(payload);
  if (!parsed) {
    throw new Error("题目信息返回格式异常。");
  }
  return parsed;
}

export async function loadQuestionInviteUsers(
  questionId: string | number,
): Promise<AnswerUserBasicInfo[]> {
  const params = new URLSearchParams({ id: String(questionId) });
  const response = await fetch(
    `${answerQuestionEndpoint}/invite?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("邀请回答用户加载失败。");
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("邀请回答用户返回格式异常。");
  }
  const parsed = payload
    .map(answerUserBasicInfo)
    .filter((item): item is AnswerUserBasicInfo => item !== null);
  if (parsed.length !== payload.length) {
    throw new Error("邀请回答用户条目格式异常。");
  }
  return parsed;
}

export async function updateQuestionInviteUsers(
  input: QuestionInviteUpdateInput,
): Promise<AnswerUserBasicInfo[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后邀请回答。");
  }
  const response = await fetch(`${answerQuestionEndpoint}/invite`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      id: String(input.id),
      invite_user: input.inviteUser,
      captcha_id: input.captchaId,
      captcha_code: input.captchaCode,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "邀请回答更新失败。";
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error("邀请回答更新返回格式异常。");
  }
  const parsed = payload
    .map(answerUserBasicInfo)
    .filter((item): item is AnswerUserBasicInfo => item !== null);
  if (parsed.length !== payload.length) {
    throw new Error("邀请回答更新条目格式异常。");
  }
  return parsed;
}

export async function loadAnswerQuestionPage(
  input: AnswerQuestionPageInput = {},
): Promise<AnswerQuestionPageResponse> {
  const params = answerQuestionPageParams(input);
  const response = await fetch(
    `${answerQuestionEndpoint}/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("题目列表加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("题目列表返回格式异常。");
  }
  return parsed;
}

export async function loadRecommendedAnswerQuestionPage(
  input: AnswerQuestionPageInput = {},
): Promise<AnswerQuestionPageResponse> {
  const params = answerQuestionPageParams(input);
  const response = await fetch(
    `${answerQuestionEndpoint}/recommend/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("推荐题目加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("推荐题目返回格式异常。");
  }
  return parsed;
}

export async function loadLinkedAnswerQuestionPage(
  input: AnswerQuestionLinkInput,
): Promise<AnswerQuestionPageResponse> {
  const params = new URLSearchParams({ question_id: String(input.questionId) });
  if (input.order) params.set("order", input.order);
  if (typeof input.inDays === "number")
    params.set("in_days", String(input.inDays));
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const response = await fetch(
    `${answerQuestionEndpoint}/link?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("关联题目加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("关联题目返回格式异常。");
  }
  return parsed;
}

export async function loadSimilarQuestionsByTitle(input: {
  title: string;
  page?: number;
  pageSize?: number;
}): Promise<AnswerQuestionPageResponse> {
  const params = new URLSearchParams({ title: input.title });
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const response = await fetch(
    `${answerQuestionEndpoint}/similar?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("相似题目加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("相似题目返回格式异常。");
  }
  return parsed;
}

export async function loadSimilarQuestionsByTag(input: {
  questionId: string | number;
  page?: number;
  pageSize?: number;
}): Promise<AnswerQuestionPageResponse> {
  const params = new URLSearchParams({ question_id: String(input.questionId) });
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const response = await fetch(
    `${answerQuestionEndpoint}/similar/tag?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("同标签题目加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseAnswerQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("同标签题目返回格式异常。");
  }
  return parsed;
}

function answerQuestionPageParams(
  input: AnswerQuestionPageInput,
): URLSearchParams {
  const params = new URLSearchParams();
  if (input.order) params.set("order", input.order);
  if (input.tagId) params.set("tag_id", input.tagId);
  if (input.tag) params.set("tag", input.tag);
  if (input.username) params.set("username", input.username);
  if (typeof input.inDays === "number")
    params.set("in_days", String(input.inDays));
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  return params;
}

export async function loadPersonalCommentPage(
  input: RankPageInput = {},
): Promise<PersonalCommentPageResponse> {
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.username) params.set("username", input.username);
  if (input.userId) params.set("user_id", input.userId);
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/comment/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("个人评论加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePersonalCommentPageResponse(payload);
  if (!parsed) {
    throw new Error("个人评论返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalCollectionPage(
  input: RankPageInput = {},
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.username) params.set("username", input.username);
  if (input.userId) params.set("user_id", input.userId);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (!input.username && !input.userId) {
    const accessToken = await getAuthAccessToken();
    if (!accessToken && !getStoredSession()) {
      throw new Error("请先登录后查看收藏。");
    }
    Object.assign(headers, sessionAuthHeaders(accessToken));
  }
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/collection/page?${params.toString()}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error("个人收藏加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseContentListResponse(payload);
  if (!parsed) {
    throw new Error("个人收藏返回格式异常。");
  }
  return parsed;
}

async function collectionAuthHeaders() {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后管理收藏。");
  return {
    ...sessionAuthHeaders(accessToken),
    "Content-Type": "application/json",
    "x-device-id": getAuthDeviceId(),
  };
}

export async function loadCollectionFolderPage(
  input: {
    username?: string;
    userId?: string;
    folderId?: string;
  } = {},
): Promise<CollectionFolderPage> {
  const params = new URLSearchParams();
  if (input.username) params.set("username", input.username);
  if (input.userId) params.set("user_id", input.userId);
  if (input.folderId) params.set("folderId", input.folderId);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!input.username && !input.userId) {
    const accessToken = await getAuthAccessToken();
    if (!accessToken && !getStoredSession())
      throw new Error("请先登录后查看收藏。");
    Object.assign(headers, sessionAuthHeaders(accessToken));
  } else {
    const accessToken = await getAuthAccessToken();
    Object.assign(headers, sessionAuthHeaders(accessToken));
  }
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/collection/folders?${params.toString()}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "收藏文件夹加载失败。";
    throw new Error(message);
  }
  const parsed = parseCollectionFolderPage(payload);
  if (!parsed) {
    throw new Error("收藏文件夹返回格式异常。");
  }
  return parsed;
}

export async function createCollectionFolder(input: {
  parentId?: string;
  name: string;
}): Promise<CollectionFolder> {
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/collection/folders`,
    {
      method: "POST",
      headers: await collectionAuthHeaders(),
      body: JSON.stringify(input),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "新建收藏文件夹失败。";
    throw new Error(message);
  }
  const parsed = parseCollectionFolder(payload);
  if (!parsed) throw new Error("收藏文件夹返回格式异常。");
  return parsed;
}

export async function updateCollectionFolder(input: {
  folderId: string;
  parentId?: string;
  name: string;
}): Promise<CollectionFolder> {
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/collection/folders/${encodeURIComponent(input.folderId)}`,
    {
      method: "PUT",
      headers: await collectionAuthHeaders(),
      body: JSON.stringify({ parentId: input.parentId, name: input.name }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "更新收藏文件夹失败。";
    throw new Error(message);
  }
  const parsed = parseCollectionFolder(payload);
  if (!parsed) throw new Error("收藏文件夹返回格式异常。");
  return parsed;
}

export async function deleteCollectionFolder(folderId: string): Promise<void> {
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/collection/folders/${encodeURIComponent(folderId)}`,
    {
      method: "DELETE",
      headers: await collectionAuthHeaders(),
    },
  );
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "删除收藏文件夹失败。";
    throw new Error(message);
  }
}

export async function moveCollectionItem(input: {
  collectionId: string;
  folderId: string;
}): Promise<{ collectionId: string; folderId: string }> {
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/collections/${encodeURIComponent(input.collectionId)}/folder`,
    {
      method: "PUT",
      headers: await collectionAuthHeaders(),
      body: JSON.stringify({ folderId: input.folderId }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "移动收藏失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.collectionId !== "string" ||
    typeof payload.folderId !== "string"
  ) {
    throw new Error("移动收藏返回格式异常。");
  }
  return { collectionId: payload.collectionId, folderId: payload.folderId };
}

export async function moveWorkItem(input: {
  postId: string;
  folderId: string;
}): Promise<{ collectionId: string; folderId: string }> {
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/works/${encodeURIComponent(input.postId)}/folder`,
    {
      method: "PUT",
      headers: await collectionAuthHeaders(),
      body: JSON.stringify({ folderId: input.folderId }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "移动作品失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.collectionId !== "string" ||
    typeof payload.folderId !== "string"
  ) {
    throw new Error("移动作品返回格式异常。");
  }
  return { collectionId: payload.collectionId, folderId: payload.folderId };
}

export async function loadPersonalFollowPage(
  input: { page?: number; pageSize?: number } = {},
): Promise<PersonalQuestionPageResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看关注题目。");
  }
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/follow/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  if (!response.ok) {
    throw new Error("关注题目加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePersonalQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("关注题目返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalVotePage(
  input: RankPageInput = {},
): Promise<PersonalVotePageResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看投票记录。");
  }
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/vote/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  if (!response.ok) {
    throw new Error("个人投票记录加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePersonalVotePageResponse(payload);
  if (!parsed) {
    throw new Error("个人投票记录返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalQATop(
  username: string,
): Promise<PersonalQATopResponse> {
  const params = new URLSearchParams({ username });
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/personal/qa/top?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("个人精选问答加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parsePersonalQATopResponse(payload);
  if (!parsed) {
    throw new Error("个人精选问答返回格式异常。");
  }
  return parsed;
}

export async function loadPersonalUserInfo(
  username: string,
): Promise<AnswerUserInfo> {
  const params = new URLSearchParams({ username });
  const headers = await optionalAuthHeaders();
  const response = await fetch(
    `${personalUserInfoEndpoint}?${params.toString()}`,
    {
      headers,
    },
  );
  if (!response.ok) {
    throw new Error("用户资料加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = answerUserInfo(payload);
  if (!parsed) {
    throw new Error("用户资料返回格式异常。");
  }
  return parsed;
}

export async function loadUserRelations(input: {
  username: string;
  relation: UserRelationKind;
  page?: number;
  pageSize?: number;
}): Promise<UserRelationListResult> {
  const params = new URLSearchParams({
    username: input.username,
    relation: input.relation,
  });
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const headers = await optionalAuthHeaders();
  const response = await fetch(
    `${userRelationsEndpoint}?${params.toString()}`,
    {
      headers,
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "用户关系列表加载失败。";
    throw new Error(message);
  }
  const parsed = userRelationListResult(payload);
  if (!parsed) {
    throw new Error("用户关系列表返回格式异常。");
  }
  return parsed;
}

const currentUserInfoCacheLifetimeMs = 30 * 1000;
let currentUserInfoCache: {
  accessToken: string;
  expiresAt: number;
  value: CurrentUserInfo | null;
} | null = null;
let currentUserInfoRequest: {
  accessToken: string;
  promise: Promise<CurrentUserInfo | null>;
} | null = null;

export async function loadCurrentUserInfo(): Promise<CurrentUserInfo | null> {
  let accessToken = "";
  try {
    accessToken = await getAuthAccessToken();
  } catch {
    return null;
  }
  if (!accessToken && !getStoredSession()) {
    return null;
  }
  if (
    currentUserInfoCache?.accessToken === accessToken &&
    currentUserInfoCache.expiresAt > Date.now()
  ) {
    return currentUserInfoCache.value;
  }
  if (currentUserInfoRequest?.accessToken === accessToken) {
    return currentUserInfoRequest.promise;
  }

  const promise = fetch(answerUserInfoEndpoint, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  })
    .then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.message === "string"
            ? payload.message
            : "当前用户资料加载失败。";
        throw new Error(message);
      }
      if (payload === null) {
        currentUserInfoCache = {
          accessToken,
          expiresAt: Date.now() + currentUserInfoCacheLifetimeMs,
          value: null,
        };
        return null;
      }
      const parsed = currentUserInfo(payload);
      if (!parsed) {
        throw new Error("当前用户资料返回格式异常。");
      }
      currentUserInfoCache = {
        accessToken,
        expiresAt: Date.now() + currentUserInfoCacheLifetimeMs,
        value: parsed,
      };
      return parsed;
    })
    .finally(() => {
      if (currentUserInfoRequest?.promise === promise)
        currentUserInfoRequest = null;
    });
  currentUserInfoRequest = { accessToken, promise };
  return promise;
}

export async function updateCurrentUserInfo(
  input: CurrentUserInfoUpdateInput,
): Promise<CurrentUserInfo> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后更新资料。");
  }
  const response = await fetch(answerUserInfoEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      display_name: input.displayName,
      username: input.username,
      avatar: input.avatar,
      cover_url: input.coverUrl,
      bio: input.bio,
      website: input.website,
      location: input.location,
      about_html: input.aboutHtml,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "用户资料更新失败。";
    throw new Error(message);
  }
  const parsed = currentUserInfo(payload);
  if (!parsed) {
    throw new Error("用户资料更新返回格式异常。");
  }
  currentUserInfoCache = {
    accessToken,
    expiresAt: Date.now() + currentUserInfoCacheLifetimeMs,
    value: parsed,
  };
  return parsed;
}

export async function loadUserActionRecord(
  action: UserActionRecordAction,
): Promise<UserActionRecord> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后继续操作。");
  }
  const params = new URLSearchParams({ action });
  const response = await fetch(
    `${answerUserActionRecordEndpoint}?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "操作验证状态加载失败。";
    throw new Error(message);
  }
  const parsed = userActionRecord(payload);
  if (!parsed) {
    throw new Error("操作验证状态返回格式异常。");
  }
  return parsed;
}

export async function updateUserInterfaceConfig(
  input: UserInterfaceConfig,
): Promise<UserInterfaceConfig> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后更新界面设置。");
  }
  const response = await fetch(answerUserInterfaceEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      language: input.language,
      color_scheme: input.colorScheme,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "界面设置更新失败。";
    throw new Error(message);
  }
  const parsed = userInterfaceConfig(payload);
  if (!parsed) {
    throw new Error("界面设置返回格式异常。");
  }
  if (
    currentUserInfoCache?.accessToken === accessToken &&
    currentUserInfoCache.value
  ) {
    currentUserInfoCache = {
      ...currentUserInfoCache,
      value: {
        ...currentUserInfoCache.value,
        language: parsed.language,
        color_scheme: parsed.colorScheme,
      },
    };
  }
  return parsed;
}

export async function loadUserNotificationConfig(): Promise<UserNotificationConfig> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看通知设置。");
  }
  const response = await fetch(answerUserNotificationConfigEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知设置加载失败。";
    throw new Error(message);
  }
  const parsed = userNotificationConfig(payload);
  if (!parsed) {
    throw new Error("通知设置返回格式异常。");
  }
  return parsed;
}

export async function updateUserNotificationConfig(
  input: Partial<UserNotificationConfig>,
): Promise<UserNotificationConfig> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后更新通知设置。");
  }
  const response = await fetch(answerUserNotificationConfigEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      inbox: input.inbox,
      all_new_question: input.allNewQuestion,
      all_new_question_for_following_tags: input.allNewQuestionForFollowingTags,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知设置更新失败。";
    throw new Error(message);
  }
  const parsed = userNotificationConfig(payload);
  if (!parsed) {
    throw new Error("通知设置更新返回格式异常。");
  }
  return parsed;
}

export async function searchUserInfo(
  username: string,
  limit = 5,
): Promise<AnswerUserInfo[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后搜索用户。");
  }
  const params = new URLSearchParams({ username, limit: String(limit) });
  const response = await fetch(
    `${answerUserInfoSearchEndpoint}?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "用户搜索失败。";
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error("用户搜索返回格式异常。");
  }
  const parsed = payload
    .map(answerUserInfo)
    .filter((item): item is AnswerUserInfo => item !== null);
  if (parsed.length !== payload.length) {
    throw new Error("用户搜索条目格式异常。");
  }
  return parsed;
}

export async function loadUserRanking(): Promise<UserRankingResponse> {
  const response = await fetch(userRankingEndpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("用户榜单加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseUserRankingResponse(payload);
  if (!parsed) {
    throw new Error("用户榜单返回格式异常。");
  }
  return parsed;
}

export async function loadUserStaff(
  input: { username?: string; pageSize?: number } = {},
): Promise<UserStaffSummary[]> {
  const params = new URLSearchParams();
  if (input.username) params.set("username", input.username);
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${userStaffEndpoint}${suffix}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("站务成员加载失败。");
  }
  const payload: unknown = await response.json();
  const items =
    isRecord(payload) && Array.isArray(payload.items) ? payload.items : null;
  if (!items) {
    throw new Error("站务成员返回格式异常。");
  }
  const parsed = items
    .map(userStaffSummary)
    .filter((item): item is UserStaffSummary => item !== null);
  if (parsed.length !== items.length) {
    throw new Error("站务成员返回格式异常。");
  }
  return parsed;
}

export async function loadBadges(): Promise<BadgeGroup[]> {
  const response = await fetch(badgesEndpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("徽章列表加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseBadgeListResponse(payload);
  if (!parsed) {
    throw new Error("徽章列表返回格式异常。");
  }
  return parsed;
}

export async function loadBadgeInfo(id: string): Promise<BadgeInfo> {
  const params = new URLSearchParams({ id });
  const response = await fetch(`${badgeEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("徽章详情加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = badgeInfo(payload);
  if (!parsed) {
    throw new Error("徽章详情返回格式异常。");
  }
  return parsed;
}

export async function loadBadgeAwardsPage(input: {
  badgeId: string;
  page?: number;
  pageSize?: number;
  username?: string;
}): Promise<BadgeAwardPageResponse> {
  const params = new URLSearchParams({ badge_id: input.badgeId });
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.username) params.set("username", input.username);
  const response = await fetch(
    `${badgeEndpoint}/awards/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("徽章获得记录加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseBadgeAwardPageResponse(payload);
  if (!parsed) {
    throw new Error("徽章获得记录返回格式异常。");
  }
  return parsed;
}

export async function loadUserBadgeAwards(
  username: string,
): Promise<UserBadgeAwardResponse> {
  const params = new URLSearchParams({ username });
  const response = await fetch(
    `${badgeEndpoint}/user/awards?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("用户徽章加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseUserBadgeAwardResponse(payload);
  if (!parsed) {
    throw new Error("用户徽章返回格式异常。");
  }
  return parsed;
}

export async function loadRecentUserBadgeAwards(
  username: string,
): Promise<UserBadgeAwardResponse> {
  const params = new URLSearchParams({ username });
  const response = await fetch(
    `${badgeEndpoint}/user/awards/recent?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("近期徽章加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = parseUserBadgeAwardResponse(payload);
  if (!parsed) {
    throw new Error("近期徽章返回格式异常。");
  }
  return parsed;
}

export async function postAnswerStyleVote(input: {
  objectId: string | number;
  type: "up" | "down";
  isCancel?: boolean;
  objectType?:
    | "question"
    | "answer"
    | "comment"
    | "book_review"
    | "book_annotation";
}): Promise<AnswerStyleVoteResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后投票。");
  }
  const response = await fetch(`${voteEndpoint}/${input.type}`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      object_id: String(input.objectId),
      object_type: input.objectType || "",
      is_cancel: Boolean(input.isCancel),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "投票失败。";
    throw new Error(message);
  }
  const parsed = answerStyleVoteResponse(payload);
  if (!parsed) {
    throw new Error("投票返回格式异常。");
  }
  return parsed;
}

export async function queryReactions(
  objectId: string,
  objectType?: string,
): Promise<ReactionItems> {
  const params = new URLSearchParams({ object_id: objectId });
  if (objectType) params.set("object_type", objectType);
  let token = "";
  try {
    token = await getAuthAccessToken();
  } catch {
    token = "";
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  Object.assign(headers, sessionAuthHeaders(token));
  let response = await fetch(`${reactionEndpoint}?${params.toString()}`, {
    headers,
  });
  if (!response.ok && token) {
    response = await fetch(`${reactionEndpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
  }
  if (!response.ok) {
    throw new Error("互动表情加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = reactionItems(payload);
  if (!parsed) {
    throw new Error("互动表情返回格式异常。");
  }
  return parsed;
}

export async function queryReactionUsers(input: {
  objectId: string;
  objectType?: string;
  emoji?: string;
  limit?: number;
}): Promise<ReactionUserList> {
  const params = new URLSearchParams({
    object_id: input.objectId,
    emoji: input.emoji || "heart",
    limit: String(input.limit || 100),
  });
  if (input.objectType) params.set("object_type", input.objectType);
  const response = await fetch(
    `${reactionEndpoint}/users?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("喜欢用户加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = reactionUserList(payload);
  if (!parsed) {
    throw new Error("喜欢用户返回格式异常。");
  }
  return parsed;
}

export async function queryRepostUsers(input: {
  objectId: string;
  objectType?: string;
  limit?: number;
}): Promise<RepostUserList> {
  const params = new URLSearchParams({
    object_id: input.objectId,
    limit: String(input.limit || 100),
  });
  if (input.objectType) params.set("object_type", input.objectType);
  const response = await fetch(`${repostUsersEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("转发用户加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = repostUserList(payload);
  if (!parsed) {
    throw new Error("转发用户返回格式异常。");
  }
  return parsed;
}

export async function updateReaction(input: {
  object_id: string;
  emoji: "heart" | "smile" | "frown";
  reaction: "activate" | "deactivate";
  object_type?: string;
}): Promise<ReactionItems> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后互动。");
  }
  const response = await fetch(reactionEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "互动表情更新失败。";
    throw new Error(message);
  }
  const parsed = reactionItems(payload);
  if (!parsed) {
    throw new Error("互动表情返回格式异常。");
  }
  return parsed;
}

export async function suggestTags(
  query: string,
  limit = 20,
): Promise<TagSummary[]> {
  const params = new URLSearchParams({ tag: query, limit: String(limit) });
  const response = await fetch(`${tagSuggestEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("标签搜索失败。");
  }
  const payload: unknown = await response.json();
  const items =
    isRecord(payload) && Array.isArray(payload.items) ? payload.items : null;
  if (!items) {
    throw new Error("标签搜索返回格式异常。");
  }
  const parsed = items
    .map(tagSummary)
    .filter((item): item is TagSummary => item !== null);
  if (parsed.length !== items.length) {
    throw new Error("标签搜索返回格式异常。");
  }
  return parsed;
}

export async function loadTagPage(
  input: TagPageInput = {},
): Promise<TagPageResult> {
  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.slugName) params.set("slug_name", input.slugName);
  if (input.queryCond) params.set("query_cond", input.queryCond);
  const accessToken = await getAuthAccessToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  Object.assign(headers, sessionAuthHeaders(accessToken));
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/tags/page?${params.toString()}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "标签分页加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload) || typeof payload.count !== "number") {
    throw new Error("标签分页返回格式异常。");
  }
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.list)
      ? payload.list
      : null;
  if (!rawItems) {
    throw new Error("标签分页返回格式异常。");
  }
  const items = rawItems.map(tagPageItem);
  if (items.some((item) => item === null)) {
    throw new Error("标签分页条目格式异常。");
  }
  return {
    count: payload.count,
    page: typeof payload.page === "number" ? payload.page : input.page || 1,
    pageSize:
      typeof payload.page_size === "number"
        ? payload.page_size
        : input.pageSize || rawItems.length,
    items: items.filter((item): item is TagPageItem => item !== null),
  };
}

export async function loadFollowingTags(): Promise<FollowingTag[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后查看关注标签。");
  }
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/tags/following`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "关注标签加载失败。";
    throw new Error(message);
  }
  const payloadRecord = isRecord(payload) ? payload : null;
  const rawItems =
    payloadRecord && Array.isArray(payloadRecord.items)
      ? payloadRecord.items
      : payloadRecord && Array.isArray(payloadRecord.data)
        ? payloadRecord.data
        : null;
  if (!rawItems) {
    throw new Error("关注标签返回格式异常。");
  }
  const items: Array<FollowingTag | null> = rawItems.map(followingTag);
  if (items.some((item) => item === null)) {
    throw new Error("关注标签条目格式异常。");
  }
  return items.filter((item): item is FollowingTag => item !== null);
}

export async function updateFollowingTags(
  slugNameList: string[],
): Promise<FollowingTag[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) {
    throw new Error("请先登录后更新关注标签。");
  }
  const response = await fetch(followTagsEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      slug_name_list: slugNameList,
      idempotencyKey: window.crypto.randomUUID(),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "关注标签更新失败。";
    throw new Error(message);
  }
  const payloadRecord = isRecord(payload) ? payload : null;
  const rawItems =
    payloadRecord && Array.isArray(payloadRecord.items)
      ? payloadRecord.items
      : payloadRecord && Array.isArray(payloadRecord.data)
        ? payloadRecord.data
        : null;
  if (!rawItems) {
    throw new Error("关注标签更新返回格式异常。");
  }
  const items: Array<FollowingTag | null> = rawItems.map(followingTag);
  if (items.some((item) => item === null)) {
    throw new Error("关注标签更新条目格式异常。");
  }
  return items.filter((item): item is FollowingTag => item !== null);
}

export async function loadTagSynonyms(input: {
  tagId?: string;
  slugName?: string;
}): Promise<TagSynonymResult> {
  const params = new URLSearchParams();
  if (input.tagId) params.set("tag_id", input.tagId);
  if (input.slugName) params.set("slug_name", input.slugName);
  const token = await getAuthAccessToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  Object.assign(headers, sessionAuthHeaders(token));
  const response = await fetch(`${tagSynonymsEndpoint}?${params.toString()}`, {
    headers,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "标签同义词加载失败。";
    throw new Error(message);
  }
  const parsed = tagSynonymResult(payload);
  if (!parsed) {
    throw new Error("标签同义词返回格式异常。");
  }
  return parsed;
}

export async function updateTagSynonyms(
  input: TagSynonymUpdateInput,
): Promise<TagSynonymResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后管理标签同义词。");
  const response = await fetch(tagSynonymEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      tag_id: input.tagId,
      synonym_tag_list: input.synonyms.map((item) => ({
        tag_id: item.tagId,
        slug_name: item.slugName,
        display_name: item.displayName,
      })),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "标签同义词更新失败。";
    throw new Error(message);
  }
  const parsed = tagSynonymResult(payload);
  if (!parsed) {
    throw new Error("标签同义词更新返回格式异常。");
  }
  return parsed;
}

export async function mergeTags(
  input: TagMergeInput,
): Promise<TagMutationResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后合并标签。");
  const response = await fetch(tagMergeEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      source_tag_id: input.sourceTagId,
      target_tag_id: input.targetTagId,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "标签合并失败。";
    throw new Error(message);
  }
  const parsed = tagMutationResponse(payload);
  if (!parsed) {
    throw new Error("标签合并返回格式异常。");
  }
  return parsed;
}

export async function loadTagsBySlug(slugs: string[]): Promise<TagSummary[]> {
  const params = new URLSearchParams({ tags: slugs.join(",") });
  const response = await fetch(`${tagListEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("标签列表加载失败。");
  }
  const payload: unknown = await response.json();
  const items =
    isRecord(payload) && Array.isArray(payload.items) ? payload.items : null;
  if (!items) {
    throw new Error("标签列表返回格式异常。");
  }
  const parsed = items
    .map(tagSummary)
    .filter((item): item is TagSummary => item !== null);
  if (parsed.length !== items.length) {
    throw new Error("标签列表返回格式异常。");
  }
  return parsed;
}

export async function loadTagDetail(input: {
  tagId?: string;
  name?: string;
}): Promise<TagDetail> {
  const params = new URLSearchParams();
  if (input.tagId) {
    if (/^\d+$/.test(input.tagId.trim())) {
      params.set("tag_id", input.tagId);
    } else {
      params.set("tag_name", input.tagId);
    }
  }
  if (input.name) params.set("tag_name", input.name);
  const response = await fetch(`${tagEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("标签详情加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = tagDetail(payload);
  if (!parsed) {
    throw new Error("标签详情返回格式异常。");
  }
  return parsed;
}

export async function loadTagStats(input: {
  tagId?: string;
  name?: string;
}): Promise<TagStats> {
  const params = new URLSearchParams();
  if (input.tagId) {
    if (/^\d+$/.test(input.tagId.trim())) {
      params.set("tag_id", input.tagId);
    } else {
      params.set("tag_name", input.tagId);
    }
  }
  if (input.name) params.set("tag_name", input.name);
  const response = await fetch(`${tagStatsEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("标签统计加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = tagStats(payload);
  if (!parsed) {
    throw new Error("标签统计返回格式异常。");
  }
  return parsed;
}

export async function loadTagCultivations(input: {
  tagId?: string;
  name?: string;
  page?: number;
  pageSize?: number;
}): Promise<TagCultivationResult> {
  const params = new URLSearchParams();
  if (input.tagId) {
    if (/^\d+$/.test(input.tagId.trim())) {
      params.set("tag_id", input.tagId);
    } else {
      params.set("tag_name", input.tagId);
    }
  }
  if (input.name) params.set("tag_name", input.name);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.pageSize) params.set("page_size", String(input.pageSize));
  const response = await fetch(
    `${tagCultivationsEndpoint}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("标签修为榜加载失败。");
  }
  const payload: unknown = await response.json();
  const parsed = tagCultivationResult(payload);
  if (!parsed) {
    throw new Error("标签修为榜返回格式异常。");
  }
  return parsed;
}

async function writeTag(
  method: "POST" | "PUT" | "DELETE",
  input: TagMutationInput,
  path = tagEndpoint,
): Promise<TagMutationResponse> {
  let accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后管理标签。");
  const body = {
    tag_id: input.tagId,
    slug_name: input.slugName,
    display_name: input.displayName,
    original_text: input.originalText,
    parsed_text: input.parsedText,
    wiki_source_file: input.wikiSourceFile,
    edit_summary: input.editSummary,
    usage_excerpt: input.usageExcerpt,
    parent_tags: input.parentTags,
    base_revision_id: input.baseRevisionId,
    confirmation: input.confirmation,
    idempotencyKey: input.idempotencyKey,
  };
  const performWrite = async () => {
    const response = await fetch(path, {
      method,
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
        ...contentDeletionStepUpHeader(input.stepUpProof),
      },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    return { response, payload };
  };
  let result = await performWrite();
  if (result.response.status === 401) {
    const message =
      isRecord(result.payload) && typeof result.payload.message === "string"
        ? result.payload.message
        : "";
    if (/recent|freshly issued|sign in again/i.test(message)) {
      const fresh = await forceRefreshAuthSession();
      if (fresh && (fresh.managed || fresh.access_token !== accessToken)) {
        accessToken = fresh.access_token;
        result = await performWrite();
      }
    }
  }
  if (!result.response.ok) {
    const message =
      isRecord(result.payload) && typeof result.payload.message === "string"
        ? result.payload.message
        : "标签管理失败。";
    throw new ApiRequestError(message, result.response.status);
  }
  const parsed = tagMutationResponse(result.payload);
  if (!parsed) {
    throw new Error("标签管理返回格式异常。");
  }
  return parsed;
}

export async function createTag(
  input: TagMutationInput,
): Promise<TagMutationResponse> {
  return writeTag("POST", input);
}

export async function updateTag(
  input: TagMutationInput,
): Promise<TagMutationResponse> {
  return writeTag("PUT", input);
}

export async function deleteTag(
  input: TagMutationInput,
  stepUpProof?: string,
): Promise<TagMutationResponse> {
  if (!input.tagId) throw new Error("删除标签需要稳定标签 ID。");
  return writeTag("DELETE", {
    ...input,
    confirmation: `DELETE tags/${input.tagId}`,
    idempotencyKey: window.crypto.randomUUID(),
    stepUpProof,
  });
}

export async function recoverTag(
  input: TagMutationInput,
): Promise<TagMutationResponse> {
  return writeTag("POST", input, `${tagEndpoint}/recover`);
}

export async function listRevisions(
  input: ListRevisionsInput,
): Promise<RevisionSummary[]> {
  const params = new URLSearchParams({
    objectType: input.objectType,
    objectId: String(input.objectId),
  });
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const response = await fetch(`${revisionEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("修订历史加载失败。");
  }
  const payload: unknown = await response.json();
  const items =
    isRecord(payload) && Array.isArray(payload.items) ? payload.items : null;
  if (!items) {
    throw new Error("修订历史返回格式异常。");
  }
  const parsed = items
    .map(revisionSummary)
    .filter((item): item is RevisionSummary => item !== null);
  if (parsed.length !== items.length) {
    throw new Error("修订历史返回格式异常。");
  }
  return parsed;
}

export async function loadActivityTimeline(
  input: ActivityTimelineInput,
): Promise<ActivityTimelineResponse> {
  const params = new URLSearchParams({ object_id: input.objectId });
  if (input.objectType) {
    params.set("object_type", input.objectType);
  }
  if (typeof input.showVote === "boolean") {
    params.set("show_vote", input.showVote ? "true" : "false");
  }
  const response = await fetch(
    `${activityTimelineEndpoint}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "活动时间线加载失败。";
    throw new Error(message);
  }
  const parsed = activityTimelineResponse(payload);
  if (!parsed) throw new Error("活动时间线返回格式异常。");
  return parsed;
}

export async function loadActivityTimelineDetail(
  input: ActivityTimelineDetailInput,
): Promise<ActivityTimelineDetailResponse> {
  const params = new URLSearchParams({ new_revision_id: input.newRevisionId });
  if (input.oldRevisionId) {
    params.set("old_revision_id", input.oldRevisionId);
  }
  const response = await fetch(
    `${activityTimelineEndpoint}/detail?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "活动时间线详情加载失败。";
    throw new Error(message);
  }
  const parsed = activityTimelineDetailResponse(payload);
  if (!parsed) throw new Error("活动时间线详情返回格式异常。");
  return parsed;
}

export async function loadUnreviewedRevisions(
  page = 1,
  pageSize = 20,
): Promise<ReviewPage<UnreviewedRevisionItem>> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看待审修订。");

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await fetch(
    `${revisionEndpoint}/unreviewed?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "待审修订加载失败。";
    throw new Error(message);
  }
  const parsed = reviewPage(payload, unreviewedRevisionItem);
  if (!parsed) throw new Error("待审修订返回格式异常。");
  return parsed;
}

export async function auditRevision(
  input: AuditRevisionInput,
): Promise<RevisionReviewResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后审核修订。");

  const response = await fetch(`${revisionEndpoint}/audit`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "修订审核失败。";
    throw new Error(message);
  }
  const parsed = revisionReviewResponse(payload);
  if (!parsed) throw new Error("修订审核返回格式异常。");
  return parsed;
}

export async function loadPendingReviewPosts(
  page = 1,
  pageSize = 20,
): Promise<ReviewPage<PendingReviewPostItem>> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看待审内容。");

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await fetch(
    `${reviewEndpoint}/pending/post/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "待审内容加载失败。";
    throw new Error(message);
  }
  const parsed = reviewPage(payload, pendingReviewPostItem);
  if (!parsed) throw new Error("待审内容返回格式异常。");
  return parsed;
}

export async function reviewPendingPost(
  input: PendingReviewInput,
): Promise<RevisionReviewResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后审核内容。");

  const response = await fetch(`${reviewEndpoint}/pending/post`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      review_id: input.reviewId,
      status: input.status,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容审核失败。";
    throw new Error(message);
  }
  const parsed = revisionReviewResponse(payload);
  if (!parsed) throw new Error("内容审核返回格式异常。");
  return parsed;
}

export async function checkCanUpdateRevision(
  id: string,
): Promise<RevisionEditCheck> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后检查修订状态。");

  const params = new URLSearchParams({ id });
  const response = await fetch(
    `${revisionEndpoint}/edit/check?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "修订状态检查失败。";
    throw new Error(message);
  }
  const parsed = revisionEditCheck(payload);
  if (!parsed) throw new Error("修订状态检查返回格式异常。");
  return parsed;
}

export async function getReviewingTypes(): Promise<ReviewingTypeItem[]> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看审核类型。");

  const response = await fetch(`${reviewingEndpoint}/type`, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "审核类型加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload)) throw new Error("审核类型返回格式异常。");
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.data)
      ? payload.data
      : null;
  if (!rawItems) throw new Error("审核类型返回格式异常。");
  const items = rawItems.map(reviewingTypeItem);
  if (items.some((item) => item === null))
    throw new Error("审核类型条目格式异常。");
  return items.filter((item): item is ReviewingTypeItem => item !== null);
}

export async function loadModerationCases(
  input: {
    page?: number;
    pageSize?: number;
    source?: ModerationCaseFilterSource;
    status?: ModerationCaseFilterStatus;
  } = {},
): Promise<ModerationCasePage> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看审核工单。");

  const params = new URLSearchParams({
    page: String(input.page || 1),
    page_size: String(input.pageSize || 20),
  });
  if (input.source && input.source !== "all") {
    params.set("source", input.source);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  const response = await fetch(
    `${moderationEndpoint}/cases?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "审核工单加载失败。";
    throw new Error(message);
  }
  const parsed = moderationCasePage(payload);
  if (!parsed) throw new Error("审核工单返回格式异常。");
  return parsed;
}

function moderationCaseError(
  status: number,
  payload: unknown,
  fallback: string,
) {
  const message =
    isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : fallback;
  return new ModerationCaseServiceError(status, message);
}

export async function loadModerationCaseDetail(
  caseId: number,
): Promise<ModerationCaseDetail> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new ModerationCaseServiceError(401, "需要登录");
  const response = await fetch(
    `${moderationEndpoint}/cases/${encodeURIComponent(String(caseId))}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw moderationCaseError(response.status, payload, "审核案件加载失败。");
  }
  const parsed = moderationCaseDetail(payload);
  if (!parsed)
    throw new ModerationCaseServiceError(502, "审核案件返回格式异常。");
  return parsed;
}

export async function reviewModerationCase(
  input: ModerationCaseReviewInput,
): Promise<ModerationCaseReviewResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后审核工单。");

  const response = await fetch(`${moderationEndpoint}/cases/${input.id}`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
      "Idempotency-Key": input.idempotencyKey,
      "X-Correlation-ID": input.correlationId,
    },
    body: JSON.stringify({
      operation: input.operation,
      note: input.note || "",
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      suspendDuration: input.suspendDuration || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw moderationCaseError(response.status, payload, "审核工单处理失败。");
  }
  const parsed = moderationCaseReviewResponse(payload);
  if (!parsed)
    throw new ModerationCaseServiceError(502, "审核工单处理返回格式异常。");
  return parsed;
}

export async function deleteQuestion(
  input: DeleteQuestionInput,
): Promise<QuestionMutationResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后删除题目。");

  const response = await fetch(answerQuestionEndpoint, {
    method: "DELETE",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      id: input.id,
      captcha_id: input.captchaId || "",
      captcha_code: input.captchaCode || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目删除失败。";
    throw new Error(message);
  }
  const parsed = questionMutationResult(payload);
  if (!parsed) {
    throw new Error("题目删除返回格式异常。");
  }
  return parsed;
}

export async function recoverQuestion(
  questionId: string,
): Promise<QuestionMutationResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后恢复题目。");

  const response = await fetch(`${answerQuestionEndpoint}/recover`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ question_id: questionId }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目恢复失败。";
    throw new Error(message);
  }
  const parsed = questionMutationResult(payload);
  if (!parsed) {
    throw new Error("题目恢复返回格式异常。");
  }
  return parsed;
}

export async function closeQuestion(input: CloseQuestionInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后关闭题目。");

  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(input.slug)}/status`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        closeType: input.closeType || 0,
        closeMsg: input.closeMsg || "",
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目关闭失败。";
    throw new Error(message);
  }
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("题目关闭返回格式异常。");
  }
  return parsed;
}

export async function reopenQuestion(slug: string) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后重开题目。");

  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(slug)}/reopen`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目重开失败。";
    throw new Error(message);
  }
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("题目重开返回格式异常。");
  }
  return parsed;
}

export async function operateQuestion(input: OperateQuestionInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后操作题目。");

  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(input.slug)}/operation`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({ operation: input.operation }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目操作失败。";
    throw new Error(message);
  }
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("题目操作返回格式异常。");
  }
  return parsed;
}

export async function updateAnswer(input: UpdateAnswerInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后编辑回答。");

  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(input.slug)}/answers/${input.answerId}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        body: input.body,
        editSummary: input.editSummary || "",
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答编辑失败。";
    throw new Error(message);
  }
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("回答编辑返回格式异常。");
  }
  return parsed;
}

export async function createAnswerByQuestion(
  input: CreateAnswerByQuestionInput,
): Promise<AnswerInfoResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后发布回答。");

  const response = await fetch(answerEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      question_id: String(input.questionId),
      content: input.content,
      captcha_id: input.captchaId || "",
      captcha_code: input.captchaCode || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答发布失败。";
    throw new Error(message);
  }
  const parsed = parseAnswerInfoResponse(payload);
  if (!parsed) {
    throw new Error("回答发布返回格式异常。");
  }
  return parsed;
}

export async function updateAnswerById(
  input: UpdateAnswerByIdInput,
): Promise<AnswerMutationResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后编辑回答。");

  const response = await fetch(answerEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      id: String(input.id),
      content: input.content,
      edit_summary: input.editSummary || "",
      captcha_id: input.captchaId || "",
      captcha_code: input.captchaCode || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答编辑失败。";
    throw new Error(message);
  }
  const parsed = answerMutationResult(payload);
  if (!parsed) {
    throw new Error("回答编辑返回格式异常。");
  }
  return parsed;
}

export async function deleteAnswerById(input: {
  id: string | number;
  captchaId?: string;
  captchaCode?: string;
}): Promise<AnswerMutationResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后删除回答。");

  const response = await fetch(answerEndpoint, {
    method: "DELETE",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      id: String(input.id),
      captcha_id: input.captchaId || "",
      captcha_code: input.captchaCode || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答删除失败。";
    throw new Error(message);
  }
  const parsed = answerMutationResult(payload);
  if (!parsed) {
    throw new Error("回答删除返回格式异常。");
  }
  return parsed;
}

export async function recoverAnswerById(input: {
  answerId: string | number;
}): Promise<AnswerMutationResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后恢复回答。");

  const response = await fetch(`${answerEndpoint}/recover`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      answer_id: String(input.answerId),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答恢复失败。";
    throw new Error(message);
  }
  const parsed = answerMutationResult(payload);
  if (!parsed) {
    throw new Error("回答恢复返回格式异常。");
  }
  return parsed;
}

export async function acceptAnswerById(
  input: AnswerAcceptanceInput,
): Promise<AnswerAcceptanceResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后采纳回答。");

  const response = await fetch(`${answerEndpoint}/acceptance`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      question_id: String(input.questionId),
      answer_id: input.answerId === undefined ? "0" : String(input.answerId),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答采纳状态更新失败。";
    throw new Error(message);
  }
  const parsed = answerAcceptanceResult(payload);
  if (!parsed) {
    throw new Error("回答采纳状态返回格式异常。");
  }
  return parsed;
}

export async function adminUpdateAnswerStatus(
  input: AdminAnswerStatusInput,
): Promise<AdminAnswerStatusResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后更新回答状态。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/answer/status`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        answer_id: String(input.answerId),
        status: input.status,
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答状态更新失败。";
    throw new Error(message);
  }
  const parsed = adminAnswerStatusResult(payload);
  if (!parsed) {
    throw new Error("回答状态返回格式异常。");
  }
  return parsed;
}

export async function adminUpdateQuestionStatus(
  input: AdminQuestionStatusInput,
): Promise<AdminQuestionStatusResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后更新题目状态。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/question/status`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        question_id: String(input.questionId),
        status: input.status,
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目状态更新失败。";
    throw new Error(message);
  }
  const parsed = adminQuestionStatusResult(payload);
  if (!parsed) {
    throw new Error("题目状态返回格式异常。");
  }
  return parsed;
}

export async function loadAdminAnswerPage(
  input: AdminAnswerPageInput = {},
): Promise<AdminAnswerPageResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后查看回答列表。");

  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("page_size", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  if (input.query) params.set("query", input.query);
  if (input.questionId !== undefined)
    params.set("question_id", String(input.questionId));

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/answer/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseAdminAnswerPageResponse(payload);
  if (!parsed) {
    throw new Error("回答列表返回格式异常。");
  }
  return parsed;
}

export async function loadAdminContentPage(
  input: AdminContentPageInput = {},
): Promise<AdminContentPageResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后查看内容列表。");

  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("page_size", String(input.pageSize));
  if (input.type) params.set("type", input.type);
  if (input.status) params.set("status", input.status);
  if (input.query) params.set("query", input.query);

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/content/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseAdminContentPageResponse(payload);
  if (!parsed) {
    throw new Error("内容列表返回格式异常。");
  }
  return parsed;
}

export async function adminUpdateContentStatus(
  input: AdminContentStatusInput,
): Promise<AdminContentMutationResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后更新内容状态。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/content/status`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        content_id: input.id,
        type: input.type,
        page_state: input.pageState,
        source_visibility: input.sourceVisibility,
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容状态更新失败。";
    throw new Error(message);
  }
  const parsed = adminContentMutationResponse(payload);
  if (!parsed) {
    throw new Error("内容状态返回格式异常。");
  }
  return parsed;
}

export async function adminUpdateContentTags(
  input: AdminContentTagsInput,
): Promise<AdminContentTagsResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后更新内容标签。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/content/tags`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        content_id: input.id,
        type: input.type,
        tags: input.tags,
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容标签更新失败。";
    throw new Error(message);
  }
  const parsed = adminContentTagsResponse(payload);
  if (!parsed) {
    throw new Error("内容标签返回格式异常。");
  }
  return parsed;
}

export async function adminDeleteContent(
  input: AdminContentDeleteInput,
): Promise<AdminContentMutationResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后删除内容。");
  if (!input.type) throw new Error("删除内容需要明确内容类型。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/content`,
    {
      method: "DELETE",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        content_id: input.id,
        type: input.type,
        confirmation: `DELETE ${input.type}/${input.id}`,
        idempotencyKey: window.crypto.randomUUID(),
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容删除失败。";
    throw new Error(message);
  }
  const parsed = adminContentMutationResponse(payload);
  if (!parsed) {
    throw new Error("内容删除返回格式异常。");
  }
  return parsed;
}

export async function loadAdminQuestionPage(
  input: AdminQuestionPageInput = {},
): Promise<AdminQuestionPageResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后查看题目列表。");

  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("page_size", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  if (input.query) params.set("query", input.query);

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/question/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseAdminQuestionPageResponse(payload);
  if (!parsed) {
    throw new Error("题目列表返回格式异常。");
  }
  return parsed;
}

export async function loadAdminUserPage(
  input: AdminUserPageInput = {},
): Promise<AdminUserPageResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后查看用户列表。");

  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("page_size", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  if (input.query) params.set("query", input.query);
  if (input.staff !== undefined)
    params.set("staff", input.staff ? "true" : "false");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/users/page?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "用户列表加载失败。";
    throw new Error(message);
  }
  const parsed = parseAdminUserPageResponse(payload);
  if (!parsed) {
    throw new Error("用户列表返回格式异常。");
  }
  return parsed;
}

export async function adminUpdateUserStatus(
  input: AdminUserStatusInput,
): Promise<AdminUserStatusResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后更新用户状态。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/user/status`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        user_id: input.userId,
        status: input.status,
        suspend_duration: input.suspendDuration || "",
        remove_all_content: Boolean(input.removeAllContent),
        role_name: input.roleName || "",
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "用户状态更新失败。";
    throw new Error(message);
  }
  const parsed = adminUserStatusResult(payload);
  if (!parsed) {
    throw new Error("用户状态返回格式异常。");
  }
  return parsed;
}

export async function loadCultivationPermissions(): Promise<CultivationPermissionResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后查看境界权限。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/cultivation/permissions`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "境界权限加载失败。";
    throw new Error(message);
  }
  const parsed = parseCultivationPermissionResponse(payload);
  if (!parsed) {
    throw new Error("境界权限返回格式异常。");
  }
  return parsed;
}

export async function updateCultivationPermissions(
  rules: CultivationPermissionRule[],
): Promise<CultivationPermissionResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录管理员账号后更新境界权限。");

  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/admin/api/cultivation/permissions`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        rules: rules.map((rule) => ({
          key: rule.key,
          label: rule.label,
          description: rule.description,
          min_rank: rule.minRank,
        })),
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "境界权限更新失败。";
    throw new Error(message);
  }
  const parsed = parseCultivationPermissionResponse(payload);
  if (!parsed) {
    throw new Error("境界权限返回格式异常。");
  }
  return parsed;
}

export async function deleteAnswer(slug: string, answerId: number) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后删除回答。");

  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(slug)}/answers/${answerId}`,
    {
      method: "DELETE",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答删除失败。";
    throw new Error(message);
  }
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("回答删除返回格式异常。");
  }
  return parsed;
}

export async function recoverAnswer(slug: string, answerId: number) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后恢复回答。");

  const response = await fetch(
    `${questionEndpoint}/${encodeURIComponent(slug)}/answers/${answerId}/recover`,
    {
      method: "POST",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "回答恢复失败。";
    throw new Error(message);
  }
  const parsed = parseQuestionDetail(payload);
  if (!parsed) {
    throw new Error("回答恢复返回格式异常。");
  }
  return parsed;
}

async function markdownRenderRequest(
  endpoint: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<unknown> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后发布内容。");
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
      ...init.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : fallbackMessage;
    throw new ApiRequestError(message, response.status);
  }
  return payload;
}

export async function submitMarkdownRenderJob(
  source: string,
  title: string,
  projectRef = "",
): Promise<MarkdownRenderSubmission> {
  const payload = await markdownRenderRequest(
    markdownRenderJobsEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        title,
        entrypoint: "article.md",
        publishIntent: "publish",
        projectRef,
      }),
    },
    "Markdown 渲染任务提交失败。",
  );
  if (!isRecord(payload)) throw new Error("Markdown 渲染任务返回格式异常。");
  const mode =
    payload.mode === "all" || payload.mode === "cohort"
      ? payload.mode
      : "disabled";
  if (payload.enabled === false) {
    return { enabled: false, mode: mode === "all" ? "disabled" : mode };
  }
  const job = parseMarkdownRenderJob(payload.job);
  const queue = parseMarkdownRenderQueue(payload.queue);
  if (
    !job ||
    !queue ||
    typeof payload.location !== "string" ||
    typeof payload.reused !== "boolean"
  ) {
    throw new Error("Markdown 渲染任务返回格式异常。");
  }
  return {
    enabled: true,
    mode: mode === "disabled" ? "cohort" : mode,
    job,
    queue,
    location: payload.location,
    reused: payload.reused,
  };
}

export type MarkdownBookRenderPage = {
  id: string;
  path: string;
  title: string;
  body: string;
  level: number;
  parentId?: string;
};

export async function submitMarkdownBookRenderJob(
  pages: MarkdownBookRenderPage[],
  title: string,
  projectRef = "",
): Promise<MarkdownRenderSubmission> {
  const payload = await markdownRenderRequest(
    markdownRenderJobsEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        documentMode: "book",
        bookPages: pages,
        publishIntent: "publish",
        projectRef,
      }),
    },
    "Markdown 书籍渲染任务提交失败。",
  );
  if (!isRecord(payload))
    throw new Error("Markdown 书籍渲染任务返回格式异常。");
  const mode =
    payload.mode === "all" || payload.mode === "cohort"
      ? payload.mode
      : "disabled";
  if (payload.enabled === false) {
    return { enabled: false, mode: mode === "all" ? "disabled" : mode };
  }
  const job = parseMarkdownRenderJob(payload.job);
  const queue = parseMarkdownRenderQueue(payload.queue);
  if (
    !job ||
    !queue ||
    typeof payload.location !== "string" ||
    typeof payload.reused !== "boolean"
  ) {
    throw new Error("Markdown 书籍渲染任务返回格式异常。");
  }
  return {
    enabled: true,
    mode: mode === "disabled" ? "cohort" : mode,
    job,
    queue,
    location: payload.location,
    reused: payload.reused,
  };
}

export function markdownRenderJobNotice(job: MarkdownRenderJob): string {
  if (job.state === "running")
    return `Markdown 渲染中${job.stage ? `：${job.stage}` : "…"}`;
  if (job.state === "queued") {
    const ahead = job.queue?.jobsAheadEstimate || 0;
    const estimate = job.queue?.estimate?.estimatedStartAt;
    const estimateText = estimate
      ? `，预计 ${new Date(estimate).toLocaleTimeString()} 开始`
      : "";
    return `Markdown 渲染排队中，前方约 ${ahead} 个项目${estimateText}。`;
  }
  return `Markdown 渲染状态：${job.state}`;
}

export async function waitForMarkdownRenderJob(
  job: MarkdownRenderJob,
  onUpdate?: (job: MarkdownRenderJob) => void,
): Promise<MarkdownRenderJob> {
  let current = job;
  onUpdate?.(current);
  while (current.state === "queued" || current.state === "running") {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    current = await loadMarkdownRenderJob(current.jobId);
    onUpdate?.(current);
  }
  if (current.state !== "succeeded" || current.cancelRequested) {
    throw new Error(`Markdown 渲染未完成（${current.state}）。`);
  }
  return current;
}

export async function loadMarkdownRenderJob(
  jobId: string,
): Promise<MarkdownRenderJob> {
  const payload = await markdownRenderRequest(
    `${markdownRenderJobsEndpoint}/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    "Markdown 渲染状态读取失败。",
  );
  const job = parseMarkdownRenderJob(payload);
  if (!job) throw new Error("Markdown 渲染状态返回格式异常。");
  return job;
}

export async function cancelMarkdownRenderJob(
  jobId: string,
): Promise<MarkdownRenderJob> {
  const payload = await markdownRenderRequest(
    `${markdownRenderJobsEndpoint}/${encodeURIComponent(jobId)}`,
    { method: "DELETE" },
    "Markdown 渲染任务取消失败。",
  );
  const job = parseMarkdownRenderJob(payload);
  if (!job) throw new Error("Markdown 渲染状态返回格式异常。");
  return job;
}

export async function createContent(input: CreateContentInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后发布内容。");
  const endpoint =
    input.type === "announcement"
      ? announcementEndpoint
      : input.type === "discussion"
        ? discussionEndpoint
        : input.type === "dynamic"
          ? statusEndpoint
          : input.type === "book"
            ? bookReviewEndpoint
            : contentEndpoint;

  let requestInput = input;
  let idempotencyStorageKey = "";
  if (
    (input.type === "blog" ||
      (input.type === "book" &&
        (Boolean(input.book?.pdfUrl) ||
          input.book?.kind === "original" ||
          input.book?.kind === "markdown" ||
          input.book?.kind === "typst"))) &&
    !input.idempotencyKey
  ) {
    const stableBody = input.body
      .replace(
        /\[\[RIN_MARKDOWN_FILE\]\][\s\S]*?\[\[\/RIN_MARKDOWN_FILE\]\]/g,
        "[[RIN_MARKDOWN_FILE]]",
      )
      .replace(
        /\[\[RIN_SOURCE_FILE\]\][\s\S]*?\[\[\/RIN_SOURCE_FILE\]\]/g,
        "[[RIN_SOURCE_FILE]]",
      );
    const {
      markdownSource: _markdownSource,
      renderJobId: _renderJobId,
      idempotencyKey: _idempotencyKey,
      ...stableInput
    } = input;
    const repositoryFiles = input.repositoryFiles?.map(({ path, mediaType, sha256, delete: deleteFile }) => ({
      path,
      mediaType,
      sha256,
      delete: deleteFile,
    }));
    const encoded = new TextEncoder().encode(
      JSON.stringify({ ...stableInput, body: stableBody, repositoryFiles }),
    );
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    const fingerprint = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    idempotencyStorageKey = `rinspace:content-create:${fingerprint}`;
    let idempotencyKey =
      window.sessionStorage.getItem(idempotencyStorageKey) || "";
    if (!idempotencyKey) {
      idempotencyKey = window.crypto.randomUUID();
      window.sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
    }
    requestInput = { ...input, idempotencyKey };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(requestInput),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容发布失败。";
    throw new Error(message);
  }
  const moderationSubmission = parseContentModerationSubmission(payload);
  if (moderationSubmission) return moderationSubmission;
  const parsed = parsePostDetail(payload);
  if (!parsed) {
    throw new Error("内容发布返回格式异常。");
  }
  if (idempotencyStorageKey) {
    window.sessionStorage.removeItem(idempotencyStorageKey);
  }
  return parsed;
}

export async function updateContent(
  slug: string,
  input: CreateContentInput,
): Promise<PostDetail> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后编辑内容。");

  const response = await fetch(
    `${contentEndpoint}/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({
        ...input,
        removeCover: input.removeCover ?? input.coverUrl === "",
      }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "内容编辑失败。";
    if (response.status === 409)
      throw new ServiceError(message, 409, payload, "conflict");
    throw new Error(message);
  }
  const parsed = parsePostDetail(payload);
  if (!parsed) throw new Error("内容编辑返回格式异常。");
  return parsed;
}

export async function updateContentVisibility(
  slug: string,
  status: "private" | "published",
): Promise<PostDetail> {
  const detail = await loadContentDetail(slug);
  const type: PublishContentType =
    detail.type === "discussion" || detail.type === "forum"
      ? "discussion"
      : detail.type === "dynamic" || detail.type === "status"
        ? "dynamic"
        : detail.type === "book"
          ? "book"
          : "blog";
  return updateContent(slug, {
    type,
    status,
    sourceVisibility:
      detail.sourceVisibility === "open"
        ? "open"
        : detail.sourceVisibility === "private"
          ? "private"
          : undefined,
    title: detail.title,
    body: detail.body,
    tags: detail.tags,
    coverUrl: detail.coverUrl,
    editor:
      detail.editor === "markdown"
        ? "markdown"
        : detail.editor === "rin"
          ? "rin"
          : undefined,
    markdownSource: detail.markdownSource || null,
    forumSection: detail.forumSection,
    forumPinned: detail.forumPinned,
    forumAnnouncement: detail.forumAnnouncement,
    book: detail.book,
  });
}

export async function loadRelatedBooks(
  bookId: string,
  limit = 6,
): Promise<ContentListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/related?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "相关书籍加载失败。"),
    );
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("相关书籍返回格式异常。");
  return parsed;
}

export async function searchBookAuthors(
  query: string,
  limit = 12,
): Promise<BookAuthor[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`${bookAuthorEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "作者搜索失败。"),
    );
  }
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("作者搜索返回格式异常。");
  }
  const items = payload.items.map(bookAuthor);
  if (items.some((item) => item === null)) {
    throw new Error("作者搜索条目格式异常。");
  }
  return items.filter((item): item is BookAuthor => item !== null);
}

export async function createBookAuthor(input: {
  name: string;
  sortName?: string;
  bio?: string;
  officialUrl?: string;
}): Promise<BookAuthor> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后创建作者。");
  const response = await fetch(bookAuthorEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "作者创建失败。"),
    );
  }
  const parsed = bookAuthor(payload);
  if (!parsed) throw new Error("作者创建返回格式异常。");
  return parsed;
}

export async function loadBookAuthor(authorId: string): Promise<BookAuthor> {
  const response = await fetch(
    `${bookAuthorEndpoint}/${encodeURIComponent(authorId)}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "作者信息加载失败。"),
    );
  }
  const parsed = bookAuthor(payload);
  if (!parsed) throw new Error("作者信息返回格式异常。");
  return parsed;
}

export async function loadBooksByAuthor(
  authorId: string,
  limit = 36,
): Promise<ContentListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(
    `${bookAuthorEndpoint}/${encodeURIComponent(authorId)}/books?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "作者书籍加载失败。"),
    );
  }
  const parsed = parseContentListResponse(payload);
  if (!parsed) throw new Error("作者书籍返回格式异常。");
  return parsed;
}

export async function loadBookReaderPage(
  bookId: string,
  section?: string,
): Promise<BookReaderPageResponse> {
  const headers = await optionalAuthHeaders();
  const params = new URLSearchParams();
  if (section) params.set("section", section);
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/read${params.toString() ? `?${params.toString()}` : ""}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "书籍阅读页加载失败。"),
    );
  }
  const parsed = parseBookReaderPageResponse(payload);
  if (!parsed) throw new Error("书籍阅读页返回格式异常。");
  return parsed;
}

export async function loadBookReviews(
  bookId: string,
  order: BookReviewOrder = "hot",
): Promise<BookReviewListResponse> {
  const headers = await optionalAuthHeaders();
  const params = new URLSearchParams({ order });
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/reviews?${params.toString()}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "书籍评论加载失败。"),
    );
  }
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.items) ||
    !isRecord(payload.rating)
  ) {
    throw new Error("书籍评论返回格式异常。");
  }
  const items = payload.items.map(bookReview);
  if (items.some((item) => item === null)) {
    throw new Error("书籍评论条目格式异常。");
  }
  const rating = bookRatingSummary(payload.rating);
  if (!rating) throw new Error("书籍评分摘要格式异常。");
  return {
    items: items.filter((item): item is BookReview => item !== null),
    rating,
  };
}

function bookChapterHeaders(accessToken?: string) {
  return {
    Accept: "application/json",
    ...sessionAuthHeaders(accessToken),
  };
}

export async function loadBookChapterActivity(
  bookId: string,
  chapterKey?: string,
): Promise<BookChapterActivityResponse> {
  const headers = await optionalAuthHeaders();
  const params = new URLSearchParams();
  if (chapterKey) params.set("chapterKey", chapterKey);
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/chapters/activity${params.toString() ? `?${params.toString()}` : ""}`,
    { headers },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "章节活动加载失败。"),
    );
  }
  const parsed = parseBookChapterActivityResponse(payload);
  if (!parsed) throw new Error("章节活动返回格式异常。");
  return parsed;
}

export async function loadBookActivity(
  bookId: string,
  input: {
    kind?: BookActivityKind | "all";
    limit?: number;
    page?: number;
  } = {},
): Promise<BookActivityResponse> {
  const params = new URLSearchParams();
  if (input.kind && input.kind !== "all") params.set("kind", input.kind);
  if (input.limit) params.set("limit", String(input.limit));
  if (input.page) params.set("page", String(input.page));
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/activity${params.toString() ? `?${params.toString()}` : ""}`,
    { headers: { Accept: "application/json" } },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "书籍相关内容加载失败。"),
    );
  }
  const parsed = parseBookActivityResponse(payload);
  if (!parsed) throw new Error("书籍相关内容返回格式异常。");
  return parsed;
}

export async function loadBookContext(
  contentId: string,
): Promise<BookContextResponse> {
  const response = await fetch(
    `${contentEndpoint}/${encodeURIComponent(contentId)}/book-context`,
    { headers: { Accept: "application/json" } },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "书籍来源加载失败。"),
    );
  }
  const parsed = parseBookContextResponse(payload);
  if (!parsed) throw new Error("书籍来源返回格式异常。");
  return parsed;
}

export async function attachBookChapterLink(
  bookId: string,
  chapterKey: string,
  input: {
    targetType: "discussion" | "question" | "blog";
    targetPostId: string;
  },
): Promise<BookChapterActivityResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后关联内容。");
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterKey)}/links`,
    {
      method: "POST",
      headers: {
        ...bookChapterHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "章节内容关联失败。"),
    );
  }
  const parsed = parseBookChapterActivityResponse(payload);
  if (!parsed) throw new Error("章节内容关联返回格式异常。");
  return parsed;
}

export async function createBookChapterThread(
  bookId: string,
  chapterKey: string,
  input: { kind: BookChapterThreadKind; title: string; body: string },
): Promise<BookChapterActivityResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后参与章节讨论。");
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterKey)}/threads`,
    {
      method: "POST",
      headers: {
        ...bookChapterHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "章节内容提交失败。"),
    );
  }
  const parsed = parseBookChapterActivityResponse(payload);
  if (!parsed) throw new Error("章节内容提交返回格式异常。");
  return parsed;
}

export async function createBookChapterErratum(
  bookId: string,
  chapterKey: string,
  input: {
    title: string;
    location: string;
    originalText: string;
    correctionText: string;
    note: string;
  },
): Promise<BookChapterActivityResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后报告勘误。");
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterKey)}/errata`,
    {
      method: "POST",
      headers: {
        ...bookChapterHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "勘误提交失败。"),
    );
  }
  const parsed = parseBookChapterActivityResponse(payload);
  if (!parsed) throw new Error("勘误提交返回格式异常。");
  return parsed;
}

export async function updateBookChapterErratumStatus(
  bookId: string,
  chapterKey: string,
  erratumId: string,
  status: BookChapterErratumStatus,
): Promise<BookChapterActivityResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后更新勘误状态。");
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterKey)}/errata/${encodeURIComponent(erratumId)}/status`,
    {
      method: "PUT",
      headers: {
        ...bookChapterHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      jsonMessageFromText(JSON.stringify(payload), "勘误状态更新失败。"),
    );
  }
  const parsed = parseBookChapterActivityResponse(payload);
  if (!parsed) throw new Error("勘误状态更新返回格式异常。");
  return parsed;
}

export async function submitBookReview(
  bookId: string,
  input: { score: number; body: string },
): Promise<BookRatingSummary> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后评分。");
  const response = await fetch(
    `${bookReviewEndpoint}/${encodeURIComponent(bookId)}/reviews`,
    {
      method: "POST",
      headers: {
        ...sessionAuthHeaders(accessToken),
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify(input),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "书籍评分提交失败。",
    );
  }
  if (!isRecord(payload) || !isRecord(payload.rating)) {
    throw new Error("书籍评分返回格式异常。");
  }
  const rating = bookRatingSummary(payload.rating);
  if (!rating) throw new Error("书籍评分摘要格式异常。");
  return rating;
}

export async function deleteContent(slug: string): Promise<PostDetail> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) throw new Error("删除内容需要有效的内容标识。");
  const idempotencyKey = window.crypto.randomUUID();

  const performDelete = async (accessToken: string) => {
    const response = await fetch(
      `${contentEndpoint}/${encodeURIComponent(normalizedSlug)}`,
      {
        method: "DELETE",
        headers: {
          ...sessionAuthHeaders(accessToken),
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-id":
            getAuthDeviceId(),
          "X-Correlation-ID": `creator-delete-${idempotencyKey}`,
        },
        body: JSON.stringify(
          contentDeletionCommand(normalizedSlug, idempotencyKey),
        ),
      },
    );
    const payload: unknown = await response.json();
    return { response, payload };
  };

  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后删除内容。");
  const result = await performDelete(accessToken);
  if (!result.response.ok) {
    const message =
      isRecord(result.payload) && typeof result.payload.message === "string"
        ? result.payload.message
        : "内容删除失败。";
    throw new Error(message);
  }
  const parsed = parsePostDetail(result.payload);
  if (!parsed) throw new Error("内容删除返回格式异常。");
  return parsed;
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<QuestionWriteResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后发布题目。");

  const response = await fetch(answerQuestionEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      tags: input.tags.map(answerQuestionTagPayload),
      captcha_id: input.captchaId || "",
      captcha_code: input.captchaCode || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目发布失败。";
    throw new Error(message);
  }
  const parsed = questionWriteResult(payload);
  if (!parsed) {
    throw new Error("题目发布返回格式异常。");
  }
  return parsed;
}

export async function createQuestionByAnswer(
  input: CreateQuestionByAnswerInput,
): Promise<AnswerInfoResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后发布题目和回答。");

  const response = await fetch(`${answerQuestionEndpoint}/answer`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      answer_content: input.answerContent,
      tags: input.tags.map(answerQuestionTagPayload),
      captcha_id: input.captchaId || "",
      captcha_code: input.captchaCode || "",
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目和回答发布失败。";
    throw new Error(message);
  }
  const parsed = parseAnswerInfoResponse(payload);
  if (!parsed) {
    throw new Error("题目和回答发布返回格式异常。");
  }
  return parsed;
}

export async function updateQuestion(
  input: UpdateQuestionInput,
): Promise<QuestionWriteResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后编辑题目。");

  const body: {
    id: string;
    title: string;
    content: string;
    tags: ReturnType<typeof answerQuestionTagPayload>[];
    invite_user?: string[];
    captcha_id: string;
    captcha_code: string;
  } = {
    id: input.id,
    title: input.title,
    content: input.content,
    tags: input.tags.map(answerQuestionTagPayload),
    captcha_id: input.captchaId || "",
    captcha_code: input.captchaCode || "",
  };
  if (input.inviteUser !== undefined) {
    body.invite_user = input.inviteUser;
  }

  const response = await fetch(answerQuestionEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "题目编辑失败。";
    throw new Error(message);
  }
  const parsed = questionWriteResult(payload);
  if (!parsed) {
    throw new Error("题目编辑返回格式异常。");
  }
  return parsed;
}

export async function createComment(
  input: CreateCommentInput,
): Promise<CommentSummary> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后评论。");

  const response = await fetch(commentEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "评论发布失败。";
    throw new Error(message);
  }
  const parsed = commentSummary(payload);
  if (!parsed) {
    throw new Error("评论发布返回格式异常。");
  }
  return parsed;
}

export async function loadComments(
  input: ListCommentsInput,
): Promise<CommentSummary[]> {
  const params = new URLSearchParams({ targetType: input.targetType });
  if (typeof input.targetId === "number") {
    params.set("targetId", String(input.targetId));
  }
  if (input.slug) {
    params.set("slug", input.slug);
  }
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  if (typeof input.page === "number") {
    params.set("page", String(input.page));
  }
  if (input.order) {
    params.set("order", input.order);
  }
  if (input.threaded) {
    params.set("threaded", "true");
  }
  const response = await fetch(`${commentEndpoint}?${params.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "评论加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("评论返回格式异常。");
  }
  const parsed = payload.items.map(commentSummary);
  if (parsed.some((item) => item === null)) {
    throw new Error("评论条目返回格式异常。");
  }
  return parsed.filter((item): item is CommentSummary => item !== null);
}

export async function recordContentShare(input: {
  targetType: string;
  targetId: string;
  channel?: "copy_link" | "native_share";
  requestId: string;
}): Promise<{ targetType: string; targetId: string; shareCount: number }> {
  const accessToken = await getAuthAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-id": getAuthDeviceId(),
  };
  Object.assign(headers, sessionAuthHeaders(accessToken));
  const response = await fetch(contentShareEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      targetType: input.targetType,
      targetId: input.targetId,
      channel: input.channel || "copy_link",
      requestId: input.requestId,
    }),
  });
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    !isRecord(payload) ||
    typeof payload.targetType !== "string" ||
    typeof payload.targetId !== "string" ||
    typeof payload.shareCount !== "number"
  ) {
    throw new Error(
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "分享计数失败。",
    );
  }
  return {
    targetType: payload.targetType,
    targetId: payload.targetId,
    shareCount: payload.shareCount,
  };
}

export async function loadAnswerStyleComments(
  input: AnswerStyleCommentPageInput,
): Promise<AnswerStyleCommentPage> {
  const params = new URLSearchParams({ object_id: String(input.objectId) });
  if (input.objectType) params.set("object_type", input.objectType);
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  if (input.queryCond) params.set("query_cond", input.queryCond);
  const response = await fetch(
    `${answerCommentEndpoint}/page?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Answer 风格评论加载失败。";
    throw new Error(message);
  }
  const parsed = parseAnswerStyleCommentPage(payload);
  if (!parsed) {
    throw new Error("Answer 风格评论返回格式异常。");
  }
  return parsed;
}

export async function getAnswerStyleComment(
  commentId: string | number,
): Promise<AnswerStyleComment> {
  const params = new URLSearchParams({ id: String(commentId) });
  const response = await fetch(
    `${answerCommentEndpoint}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Answer 风格评论详情加载失败。";
    throw new Error(message);
  }
  const parsed = answerStyleComment(payload);
  if (!parsed) {
    throw new Error("Answer 风格评论详情返回格式异常。");
  }
  return parsed;
}

export async function createAnswerStyleComment(
  input: CreateAnswerStyleCommentInput,
): Promise<AnswerStyleComment> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后评论。");

  const response = await fetch(answerCommentEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      object_id: String(input.objectId),
      object_type: input.objectType,
      original_text: input.originalText,
      reply_comment_id: input.replyCommentId,
      mention_username_list: input.mentionUsernameList,
      captcha_id: input.captchaId,
      captcha_code: input.captchaCode,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Answer 风格评论发布失败。";
    throw new Error(message);
  }
  const parsed = answerStyleComment(payload);
  if (!parsed) {
    throw new Error("Answer 风格评论发布返回格式异常。");
  }
  return parsed;
}

export async function updateComment(
  input: UpdateCommentInput,
): Promise<CommentSummary> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后编辑评论。");

  const response = await fetch(`${commentEndpoint}/${input.commentId}`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ body: input.body }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "评论更新失败。";
    throw new Error(message);
  }
  const parsed = commentSummary(payload);
  if (!parsed) {
    throw new Error("评论更新返回格式异常。");
  }
  return parsed;
}

export async function updateAnswerStyleComment(
  input: UpdateAnswerStyleCommentInput,
): Promise<AnswerStyleComment> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后编辑评论。");

  const response = await fetch(answerCommentEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      comment_id: String(input.commentId),
      original_text: input.originalText,
      captcha_id: input.captchaId,
      captcha_code: input.captchaCode,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Answer 风格评论更新失败。";
    throw new Error(message);
  }
  const parsed = answerStyleComment(payload);
  if (!parsed) {
    throw new Error("Answer 风格评论更新返回格式异常。");
  }
  return parsed;
}

export async function deleteComment(
  commentId: number,
): Promise<CommentSummary> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后删除评论。");

  const response = await fetch(`${commentEndpoint}/${commentId}`, {
    method: "DELETE",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "评论删除失败。";
    throw new Error(message);
  }
  const parsed = commentSummary(payload);
  if (!parsed) {
    throw new Error("评论删除返回格式异常。");
  }
  return parsed;
}

export async function deleteAnswerStyleComment(
  commentId: string | number,
): Promise<AnswerStyleComment> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后删除评论。");

  const response = await fetch(answerCommentEndpoint, {
    method: "DELETE",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ comment_id: String(commentId) }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Answer 风格评论删除失败。";
    throw new Error(message);
  }
  const parsed = answerStyleComment(payload);
  if (!parsed) {
    throw new Error("Answer 风格评论删除返回格式异常。");
  }
  return parsed;
}

export async function recoverComment(
  commentId: number,
): Promise<CommentSummary> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后恢复评论。");

  const response = await fetch(`${commentEndpoint}/${commentId}/recover`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "评论恢复失败。";
    throw new Error(message);
  }
  const parsed = commentSummary(payload);
  if (!parsed) {
    throw new Error("评论恢复返回格式异常。");
  }
  return parsed;
}

export async function recoverAnswerStyleComment(
  commentId: string | number,
): Promise<AnswerStyleComment> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后恢复评论。");

  const response = await fetch(`${answerCommentEndpoint}/recover`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ comment_id: String(commentId) }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Answer 风格评论恢复失败。";
    throw new Error(message);
  }
  const parsed = answerStyleComment(payload);
  if (!parsed) {
    throw new Error("Answer 风格评论恢复返回格式异常。");
  }
  return parsed;
}

async function postFollowTarget(
  endpoint: string,
  input: FollowTargetInput,
): Promise<FollowTargetResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后关注。");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey || window.crypto.randomUUID(),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "关注操作失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.targetType !== "string" ||
    typeof payload.targetId !== "string" ||
    typeof payload.following !== "boolean" ||
    typeof payload.followerCount !== "number"
  ) {
    throw new Error("关注返回格式异常。");
  }
  return {
    targetType: payload.targetType,
    targetId: payload.targetId,
    following: payload.following,
    followerCount: payload.followerCount,
  };
}

export async function followTarget(
  input: FollowTargetInput,
): Promise<FollowTargetResult> {
  return postFollowTarget(followEndpoint, input);
}

export async function switchAnswerFollow(
  input: FollowTargetInput,
): Promise<FollowTargetResult> {
  return postFollowTarget(answerFollowEndpoint, input);
}

async function postCollectionSwitch(
  endpoint: string,
  input: CollectionTargetInput,
): Promise<CollectionSwitchResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后收藏。");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey || window.crypto.randomUUID(),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "收藏操作失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.targetType !== "string" ||
    typeof payload.targetId !== "string" ||
    typeof payload.bookmarked !== "boolean" ||
    typeof payload.collectionCount !== "number"
  ) {
    throw new Error("收藏返回格式异常。");
  }
  return {
    targetType: payload.targetType,
    targetId: payload.targetId,
    bookmarked: payload.bookmarked,
    collectionCount: payload.collectionCount,
    collectionId:
      typeof payload.collectionId === "string"
        ? payload.collectionId
        : undefined,
    folderId:
      typeof payload.folderId === "string" ? payload.folderId : undefined,
  };
}

export async function switchCollection(
  input: CollectionTargetInput,
): Promise<CollectionSwitchResult> {
  return postCollectionSwitch(collectionEndpoint, input);
}

export async function switchAnswerCollection(
  input: CollectionTargetInput,
): Promise<CollectionSwitchResult> {
  return postCollectionSwitch(answerCollectionSwitchEndpoint, input);
}

export type LikeSwitchResult = {
  targetType: string;
  targetId: string;
  liked: boolean;
  likeCount: number;
};

export async function likePost(
  input: LikeTargetInput,
): Promise<LikeSwitchResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后喜欢。");

  const response = await fetch(likeEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey || window.crypto.randomUUID(),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "喜欢操作失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.targetType !== "string" ||
    typeof payload.targetId !== "string" ||
    typeof payload.liked !== "boolean" ||
    typeof payload.likeCount !== "number"
  ) {
    throw new Error("喜欢返回格式异常。");
  }
  return {
    targetType: payload.targetType,
    targetId: payload.targetId,
    liked: payload.liked,
    likeCount: payload.likeCount,
  };
}

export async function loadNotifications() {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) return [];

  const response = await fetch(notificationEndpoint, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  if (!response.ok) {
    throw new Error("通知加载失败。");
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("通知返回格式异常。");
  }
  return payload.items
    .map(notificationItem)
    .filter((item): item is NotificationItem => item !== null);
}

export async function loadNotificationPage(
  input: NotificationPageInput = {},
): Promise<NotificationPageResult> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看通知。");

  const params = new URLSearchParams();
  if (typeof input.page === "number") params.set("page", String(input.page));
  if (typeof input.pageSize === "number")
    params.set("page_size", String(input.pageSize));
  params.set("type", input.type || "inbox");
  params.set("inbox_type", input.inboxType || "all");

  const response = await fetch(
    `${answerNotificationPageEndpoint}?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知分页加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload) || typeof payload.count !== "number") {
    throw new Error("通知分页返回格式异常。");
  }
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.list)
      ? payload.list
      : null;
  if (!rawItems) {
    throw new Error("通知分页返回格式异常。");
  }
  const items = rawItems.map(notificationPageItem);
  if (items.some((item) => item === null)) {
    throw new Error("通知分页条目格式异常。");
  }
  return {
    count: payload.count,
    page: typeof payload.page === "number" ? payload.page : input.page || 1,
    pageSize:
      typeof payload.page_size === "number"
        ? payload.page_size
        : input.pageSize || rawItems.length,
    items: items.filter((item): item is NotificationPageItem => item !== null),
  };
}

export async function loadNotificationStatus(): Promise<NotificationStatus> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看通知状态。");

  const response = await fetch(answerNotificationStatusEndpoint, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知状态加载失败。";
    throw new Error(message);
  }
  const parsed = notificationStatus(payload);
  if (!parsed) {
    throw new Error("通知状态返回格式异常。");
  }
  return parsed;
}

function parseNotificationReadState(
  value: unknown,
): NotificationReadState | null {
  if (!isRecord(value)) {
    return null;
  }
  const readCount =
    typeof value.readCount === "number"
      ? value.readCount
      : typeof value.read_count === "number"
        ? value.read_count
        : null;
  const unreadCount =
    typeof value.unreadCount === "number"
      ? value.unreadCount
      : typeof value.unread_count === "number"
        ? value.unread_count
        : null;
  if (readCount === null || unreadCount === null) return null;
  return {
    readCount,
    unreadCount,
  };
}

export async function markNotificationRead(notificationId: number) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后更新通知。");

  const response = await fetch(
    `${notificationEndpoint}/${notificationId}/read`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知已读状态更新失败。";
    throw new Error(message);
  }
  const parsed = parseNotificationReadState(payload);
  if (!parsed) {
    throw new Error("通知已读状态返回格式异常。");
  }
  return parsed;
}

export async function markNotificationReadState(
  notificationId: string | number,
): Promise<NotificationReadState> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后更新通知。");

  const response = await fetch(answerNotificationReadStateEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ id: String(notificationId) }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知已读状态更新失败。";
    throw new Error(message);
  }
  const parsed = parseNotificationReadState(payload);
  if (!parsed) {
    throw new Error("通知已读状态返回格式异常。");
  }
  return parsed;
}

export async function markAllNotificationsRead(type?: string) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后更新通知。");

  const response = await fetch(`${notificationEndpoint}/read-all`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ type: type || "" }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知已读状态更新失败。";
    throw new Error(message);
  }
  const parsed = parseNotificationReadState(payload);
  if (!parsed) {
    throw new Error("通知已读状态返回格式异常。");
  }
  return parsed;
}

export async function markAllNotificationReadState(
  type: "inbox" | "system" = "inbox",
): Promise<NotificationReadState> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后更新通知。");

  const response = await fetch(answerNotificationReadStateAllEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ type }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知已读状态更新失败。";
    throw new Error(message);
  }
  const parsed = parseNotificationReadState(payload);
  if (!parsed) {
    throw new Error("通知已读状态返回格式异常。");
  }
  return parsed;
}

export async function clearNotificationStatus(
  type: "inbox" | "system" = "inbox",
): Promise<NotificationStatus> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后更新通知状态。");

  const response = await fetch(answerNotificationStatusEndpoint, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({ type }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "通知状态更新失败。";
    throw new Error(message);
  }
  const parsed = notificationStatus(payload);
  if (!parsed) {
    throw new Error("通知状态返回格式异常。");
  }
  return parsed;
}

export async function repostContent(input: RepostContentInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后转发。");

  const response = await fetch(repostEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "转发操作失败。";
    throw new Error(message);
  }
  const parsed = parsePostDetail(payload);
  if (!parsed) {
    throw new Error("转发返回格式异常。");
  }
  return parsed;
}

export async function submitReport(input: ReportTargetInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后举报。");

  const response = await fetch(reportEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "举报提交失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.id !== "number" ||
    typeof payload.targetType !== "string" ||
    typeof payload.targetId !== "string" ||
    typeof payload.status !== "number" ||
    typeof payload.createdAt !== "string"
  ) {
    throw new Error("举报返回格式异常。");
  }
  return {
    id: payload.id,
    targetType: payload.targetType,
    targetId: payload.targetId,
    status: payload.status,
    createdAt: payload.createdAt,
  };
}

export async function submitAnswerStyleReport(
  input: AnswerStyleReportInput,
): Promise<ReportResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession()) throw new Error("请先登录后举报。");

  const response = await fetch(answerReportEndpoint, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      object_id: String(input.objectId),
      report_type: input.reportType,
      content: input.content,
      source: input.source,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "举报提交失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.id !== "number" ||
    typeof payload.targetType !== "string" ||
    typeof payload.targetId !== "string" ||
    typeof payload.status !== "number" ||
    typeof payload.createdAt !== "string"
  ) {
    throw new Error("举报返回格式异常。");
  }
  return {
    id: payload.id,
    targetType: payload.targetType,
    targetId: payload.targetId,
    status: payload.status,
    createdAt: payload.createdAt,
  };
}

export async function loadPendingReports(limit = 20) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看举报。");

  const response = await fetch(
    `${reportEndpoint}/pending?limit=${encodeURIComponent(String(limit))}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "举报列表加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("举报列表返回格式异常。");
  }
  const items = payload.items.map(reportSummary);
  if (items.some((item) => item === null)) {
    throw new Error("举报列表条目格式异常。");
  }
  return items.filter((item): item is ReportSummary => item !== null);
}

export async function loadUnreviewedReportPosts(
  page = 1,
  pageSize = 20,
): Promise<AnswerStyleReportPage> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后查看举报。");

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await fetch(
    `${answerReportEndpoint}/unreviewed/post?${params.toString()}`,
    {
      headers: {
        ...sessionAuthHeaders(accessToken),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "举报列表加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload) || typeof payload.count !== "number") {
    throw new Error("举报列表返回格式异常。");
  }
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.list)
      ? payload.list
      : null;
  if (!rawItems) {
    throw new Error("举报列表返回格式异常。");
  }
  const items = rawItems.map(reportSummary);
  if (items.some((item) => item === null)) {
    throw new Error("举报列表条目格式异常。");
  }
  return {
    count: payload.count,
    page: typeof payload.page === "number" ? payload.page : page,
    pageSize:
      typeof payload.page_size === "number" ? payload.page_size : pageSize,
    items: items.filter((item): item is ReportSummary => item !== null),
  };
}

export async function reviewReport(input: ReviewReportInput) {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后审核举报。");

  const response = await fetch(`${reportEndpoint}/review`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "举报审核失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.id !== "number" ||
    typeof payload.status !== "number" ||
    typeof payload.operationType !== "string" ||
    typeof payload.reviewedAt !== "string"
  ) {
    throw new Error("举报审核返回格式异常。");
  }
  return {
    id: payload.id,
    status: payload.status,
    operationType: payload.operationType,
    reviewedAt: payload.reviewedAt,
  };
}

export async function reviewAnswerStyleReport(
  input: AnswerStyleReportReviewInput,
): Promise<ReportReviewResponse> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后审核举报。");

  const response = await fetch(`${answerReportEndpoint}/review`, {
    method: "PUT",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      flag_id: String(input.flagId),
      operation_type: input.operationType,
      note: input.note,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "举报审核失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    typeof payload.id !== "number" ||
    typeof payload.status !== "number" ||
    typeof payload.operationType !== "string" ||
    typeof payload.reviewedAt !== "string"
  ) {
    throw new Error("举报审核返回格式异常。");
  }
  return {
    id: payload.id,
    status: payload.status,
    operationType: payload.operationType,
    reviewedAt: payload.reviewedAt,
  };
}

export async function loadRinChat(): Promise<RinChatConversation> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后召唤琳。");

  const response = await fetch(`${rinChatEndpoint}?limit=40`, {
    headers: {
      ...sessionAuthHeaders(accessToken),
      Accept: "application/json",
      "x-device-id": getAuthDeviceId(),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(jsonMessageFromText(text, "聊天加载失败。"));
  }
  const payload = parseUnknownJson(text);
  return rinChatConversationFromPayload(payload);
}

export async function sendRinChatMessage(
  body: string,
  context: RinChatContext,
  messages: RinChatMessage[] = [],
  webSearchMode: RinWebSearchMode = "auto",
): Promise<RinChatConversation> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken && !getStoredSession())
    throw new Error("请先登录后召唤琳。");

  const response = await fetch(`${rinChatEndpoint}/messages`, {
    method: "POST",
    headers: {
      ...sessionAuthHeaders(accessToken),
      "Content-Type": "application/json",
      "x-device-id": getAuthDeviceId(),
    },
    body: JSON.stringify({
      body,
      context,
      webSearchMode,
      messages: messages.slice(-12).map((message) => ({
        role: message.senderUid === "rin" ? "assistant" : "user",
        content: message.body,
      })),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(jsonMessageFromText(text, "消息发送失败。"));
  }
  const payload = parseUnknownJson(text);
  return rinChatConversationFromPayload(payload);
}

import { useNoticeToasts,
  AnimateTabs,
  AnimateTabsList,
  AnimateTabsTrigger,
  AnimateButton,
  Icon,
  type IconName,
} from 'components/ui';
import { publicEnv } from '@/app/config/env';
import { useTheme } from '@/app/providers/ThemeProvider';
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import katex from 'katex';
import { Button, Form } from '@/components/ui/compat';
import { RuntimeHelmet as Helmet } from '@/components/RuntimeHelmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';
import LoadingState from '@/components/LoadingState';

import AvatarImage from '@/components/AvatarImage';
import CultivationBadge from '@/components/CultivationBadge';
import CodeMirrorEditor from '@/components/CodeMirrorEditor';
import ImageCropDialog from '@/components/ImageCropDialog';
import MathText, { MathInline } from '@/components/MathText';
import { type IdentityTranslation } from '@/features/identity/labels';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatDate, formatList, formatNumber } from '@/i18n/format';
import type { LocaleId } from '@/i18n/types';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadKnowledgeGraph } from '@/services/domains/activity';
import { loadContentFeed } from '@/services/domains/article';
import { followTarget, switchCollection } from '@/services/domains/discussion';
import { createCollectionFolder, deleteCollectionFolder, loadCollectionFolderPage, loadUserBadgeAwards, loadPersonalAnswerPage, loadPersonalCommentPage, loadPersonalCollectionPage, loadPersonalQATop, loadPersonalQuestionPage, loadPersonalUserInfo, loadCurrentUserInfo, loadUserRelations, moveCollectionItem, moveWorkItem, updateCollectionFolder, updateCurrentUserInfo } from '@/services/domains/identity';
import type { AnswerUserInfo, BadgeListItem, CollectionFolder, CollectionFolderItem, CollectionFolderPage, CollectionFolderTreeNode, CurrentUserInfo, FeedItem, KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphResponse, PersonalAnswerSummary, PersonalCommentSummary, PersonalQATopResponse, PersonalQuestionSummary, UserRelationItem, UserRelationKind, UserRelationListResult } from '@/services/contracts';
import {
  getCurrentUser,
  loadProfile,
  saveProfile,
  uploadAvatarFile,
  uploadCoverFile,
} from '@/services/profile';
import { type CloudUser } from '@/services/phoneAuth';
import { useAuthAdapter, useAuthSnapshot } from '@/platform/auth/context';
import { useBootstrap } from '@/app/bootstrap/context';
import {
  cleanUserId,
  contentPath,
  legacyTagPath,
  questionPath as routeQuestionPath,
  profilePath as routeProfilePath,
  profileRankPath,
} from '@/utils/routes';

type ProfileData = {
  user: AnswerUserInfo;
  qaTop: PersonalQATopResponse;
  questions: PersonalQuestionSummary[];
  answers: PersonalAnswerSummary[];
  comments: PersonalCommentSummary[];
  badges: BadgeListItem[];
  collectionCount: number;
};

type UserProfile = {
  nickname?: string;
  avatarDataUrl?: string;
  coverUrl?: string;
  aboutHtml?: string;
};

type ProfileDraft = {
  userId: string;
  displayName: string;
  avatar: string;
  coverUrl: string;
  bio: string;
  website: string;
  location: string;
  aboutHtml: string;
};

type ProfileTab = 'about' | 'overview' | 'blog' | 'book' | 'qa' | 'discussion' | 'dynamic' | 'collection' | 'graph';

type ProfileTimelineType = 'blog' | 'book' | 'question' | 'answer' | 'comment' | 'discussion' | 'dynamic';

const collectionWorksFolderID = '__rinspace_works';
const collectionWorksPrivateFolderID = '__rinspace_works_private';
const texLogoHtml = katex.renderToString('\\TeX', {
  displayMode: false,
  throwOnError: false,
  strict: 'ignore',
  trust: false,
});

type ProfileTimelineItem = {
  key: string;
  type: ProfileTimelineType;
  label: string;
  title: string;
  excerpt: string;
  path: string;
  timestamp: number;
  meta: string;
};

function isOriginalStyleBook(item: FeedItem) {
  return item.book?.kind === 'original' || item.book?.kind === 'markdown';
}

type PendingImageCrop = {
  kind: 'avatar' | 'cover';
  imageUrl: string;
  fileName: string;
};

type RelationDialogState = {
  relation: UserRelationKind;
  page: number;
};

const profileTabs: ProfileTab[] = ['about', 'overview', 'blog', 'book', 'qa', 'discussion', 'dynamic', 'collection', 'graph'];

function profileTabLabel(t: IdentityTranslation, tab: ProfileTab) {
  return t(`profile.tabs.${tab}`);
}

function normalizeProfileTab(value: string | null): ProfileTab {
  return profileTabs.includes(value as ProfileTab) ? (value as ProfileTab) : 'about';
}

const aboutFrameCSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "img-src https: data:",
  "style-src 'unsafe-inline' https:",
  "font-src https: data:",
  "media-src https: data:",
].join('; ');

function defaultAboutHTML(dark: boolean, emptyText: string) {
  const color = dark ? '#a8b6c2' : '#64748b';
  const background = dark ? '#0b1218' : '#fff';
  const escapedText = emptyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return `<main style="min-height:100vh;display:grid;place-items:center;margin:0;font:16px system-ui;color:${color};background:${background};"><p>${escapedText}</p></main>`;
}

function profileAboutSrcDoc(source: string, dark: boolean, emptyText: string) {
  const html = source.trim() || defaultAboutHTML(dark, emptyText);
  const csp = `<meta http-equiv="Content-Security-Policy" content="${aboutFrameCSP.replace(/"/g, '&quot;')}">`;
  const base = '<base target="_blank">';
  const theme = dark
    ? '<style>html{background:#0b1218;color:#d7e1ea;color-scheme:dark}body{min-height:100vh;margin:0;padding:1rem;background:inherit;color:inherit;font:16px/1.7 system-ui}a{color:#8cc9f0}</style>'
    : '<style>html{background:#fff;color:#1f2937;color-scheme:light}body{min-height:100vh;margin:0;padding:1rem;background:inherit;color:inherit;font:16px/1.7 system-ui}a{color:#245d82}</style>';
  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${csp}${base}${theme}`);
  }
  if (/<html(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${csp}${base}${theme}</head>`);
  }
  return `<!doctype html><html><head>${csp}${base}${theme}</head><body>${html}</body></html>`;
}

function dateTimeLabel(t: IdentityTranslation, locale: LocaleId, timestamp: number) {
  if (!timestamp) return t('shared.unknownTime');
  return formatDate(locale, timestamp, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function feedItemTime(item: FeedItem) {
  return Date.parse(item.publishedAt || item.contentUpdatedAt || item.updatedAt || item.createdAt || '') || 0;
}

function timelineMetaTypeClass(type: ProfileTimelineType) {
  if (type === 'answer') return 'question';
  if (type === 'comment') return 'discussion';
  return type;
}

function timelineMetaChar(type: ProfileTimelineType) {
  switch (type) {
    case 'blog':
      return 'b';
    case 'book':
      return 'k';
    case 'question':
      return 'q';
    case 'answer':
      return 'a';
    case 'comment':
      return 'c';
    case 'discussion':
      return 'd';
    case 'dynamic':
      return 's';
    default:
      return 'c';
  }
}

function TimelineMetaCategory({
  type,
  label,
}: {
  type: ProfileTimelineType;
  label: string;
}) {
  const displayType = timelineMetaTypeClass(type);
  return (
    <span
      className={`meta-category content-type-meta content-type-meta-${displayType} profile-timeline-category`}
      title={label}
    >
      <span className="profile-timeline-category-token">
        <span className="char" aria-hidden="true">{timelineMetaChar(type)}</span>
        <span className="label">{label}</span>
      </span>
    </span>
  );
}

function profileTimelineType(item: FeedItem): ProfileTimelineType {
  if (item.type === 'book') return 'book';
  if (item.type === 'question') return 'question';
  if (item.type === 'discussion' || item.type === 'forum') return 'discussion';
  if (item.type === 'dynamic' || item.type === 'status') return 'dynamic';
  return 'blog';
}

function profileTimelineLabel(t: IdentityTranslation, type: ProfileTimelineType) {
  return t(`profile.timeline.types.${type}`);
}

function profileCountLabel(
  t: IdentityTranslation,
  locale: LocaleId,
  key: 'answers' | 'votes' | 'reads' | 'likes' | 'bookmarks' | 'comments' | 'replies' | 'shares',
  value: number,
) {
  return t(`profile.counts.${key}`, {
    count: value,
    displayCount: formatNumber(locale, value),
  });
}

function profileTimelineMeta(t: IdentityTranslation, locale: LocaleId, item: FeedItem, type: ProfileTimelineType) {
  const parts: string[] = [];
  const add = (key: Parameters<typeof profileCountLabel>[2], value: number | undefined) => {
    if (typeof value === 'number' && value >= 0) parts.push(profileCountLabel(t, locale, key, value));
  };
  if (type === 'question') {
    add('answers', item.answerCount);
    add('votes', item.voteScore);
  } else if (type === 'discussion') {
    add('replies', item.replyCount ?? item.commentCount);
    add('likes', item.likeCount);
  } else if (type === 'dynamic') {
    add('comments', item.commentCount ?? item.replyCount);
    add('likes', item.likeCount);
  } else {
    add('reads', item.readCount);
    add('likes', item.likeCount);
    add('bookmarks', item.favoriteCount);
  }
  return parts.join(' · ');
}

function feedItemProfileMeta(t: IdentityTranslation, locale: LocaleId, item: FeedItem) {
  const type = profileTimelineType(item);
  return {
    type,
    label: profileTimelineLabel(t, type),
    timestamp: feedItemTime(item),
    detail: profileTimelineMeta(t, locale, item, type),
  };
}

function commentTimelineType(item: PersonalCommentSummary): ProfileTimelineType {
  if (item.object_type === 'answer') return 'answer';
  if (item.object_type === 'question') return 'question';
  if (item.object_type === 'blog') return 'blog';
  if (item.object_type === 'book') return 'book';
  if (item.object_type === 'dynamic' || item.object_type === 'status') return 'dynamic';
  return 'discussion';
}

function ProfileItemMeta({
  type,
  label,
  timestamp,
  detail,
}: {
  type: ProfileTimelineType;
  label: string;
  timestamp: number;
  detail?: string;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  return (
    <div className="profile-timeline-meta">
      <TimelineMetaCategory type={type} label={label} />
      <span className="profile-timeline-time">{dateTimeLabel(t, locale, timestamp)}</span>
      {detail ? <span className="profile-timeline-detail">{detail}</span> : null}
    </div>
  );
}

function questionPath(question: Pick<PersonalQuestionSummary, 'url_title' | 'question_id' | 'id' | 'title'>) {
  return routeQuestionPath(question.question_id || question.id || question.url_title, question.title);
}

function answerQuestionPath(answer: PersonalAnswerSummary) {
  return routeQuestionPath(answer.question_info.url_title || answer.question_id);
}

function commentPath(comment: PersonalCommentSummary) {
  if (comment.url_title) return routeQuestionPath(comment.url_title);
  if (comment.question_id) return routeQuestionPath(comment.question_id);
  return '/';
}

function compactCount(locale: LocaleId, value: number) {
  return formatNumber(locale, Math.max(0, value), {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  });
}

function initialsFor(name: string) {
  const normalized = Array.from(name.trim().replace(/\s+/g, ''));
  return (normalized.slice(0, 2).join('') || 'R').toUpperCase();
}

function defaultCoverUrl() {
  return `${publicEnv.publicBasePath || ''}/profile-cover.svg`;
}

function websiteDetails(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { href: url.href, host: url.host };
  } catch {
    return null;
  }
}

function ProfileWebsiteLink({ value }: { value: string }) {
  const website = websiteDetails(value);
  if (!website) return null;

  return (
    <a
      className="profile-website-link"
      href={website.href}
      target="_blank"
      rel="noreferrer"
      aria-label={website.host}
    >
      <span>{website.host}</span>
      <Icon name="box-arrow-up-right" aria-hidden="true" />
    </a>
  );
}

const profileContentPageSize = 50;

async function loadAllContentFeedItems(type: 'blog' | 'book' | 'status' | 'forum', username: string) {
  const firstPage = await loadContentFeed({ type, username, page: 1, size: profileContentPageSize });
  const items = [...firstPage.items];
  let page = 2;
  while (items.length < firstPage.count) {
    const nextPage = await loadContentFeed({ type, username, page, size: profileContentPageSize });
    if (!nextPage.items.length) break;
    items.push(...nextPage.items);
    page += 1;
  }
  return items;
}

async function loadAllPersonalQuestionItems(username: string) {
  const firstPage = await loadPersonalQuestionPage({ username, page: 1, pageSize: profileContentPageSize });
  const items = [...firstPage.items];
  let page = 2;
  while (items.length < firstPage.count) {
    const nextPage = await loadPersonalQuestionPage({ username, page, pageSize: profileContentPageSize });
    if (!nextPage.items.length) break;
    items.push(...nextPage.items);
    page += 1;
  }
  return items;
}

async function loadAllPersonalAnswerItems(username: string) {
  const firstPage = await loadPersonalAnswerPage({ username, page: 1, pageSize: profileContentPageSize });
  const items = [...firstPage.items];
  let page = 2;
  while (items.length < firstPage.count) {
    const nextPage = await loadPersonalAnswerPage({ username, page, pageSize: profileContentPageSize });
    if (!nextPage.items.length) break;
    items.push(...nextPage.items);
    page += 1;
  }
  return items;
}

function QuestionList({ items }: { items: PersonalQuestionSummary[] }) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  if (!items.length) return <div className="state-strip">{t('profile.empty.questions')}</div>;
  return (
    <div className="profile-item-list">
      {items.map((item) => (
        <Link to={questionPath(item)} key={item.id || item.question_id}>
          <ProfileItemMeta
            type="question"
            label={profileTimelineLabel(t, 'question')}
            timestamp={item.created_at * 1000}
            detail={`${profileCountLabel(t, locale, 'answers', item.answer_count)} · ${profileCountLabel(t, locale, 'votes', item.vote_count)}`}
          />
          <strong><MathInline text={item.title} /></strong>
          {item.description ? <p><MathInline text={item.description} /></p> : null}
        </Link>
      ))}
    </div>
  );
}

function AnswerList({ items }: { items: PersonalAnswerSummary[] }) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  if (!items.length) return <div className="state-strip">{t('profile.empty.answers')}</div>;
  return (
    <div className="profile-item-list">
      {items.map((item) => (
        <Link to={answerQuestionPath(item)} key={item.answer_id}>
          <ProfileItemMeta
            type="answer"
            label={profileTimelineLabel(t, 'answer')}
            timestamp={item.create_time * 1000}
            detail={`${profileCountLabel(t, locale, 'votes', item.vote_count)}${item.accepted === 2 ? ` · ${t('profile.accepted')}` : ''}`}
          />
          <strong><MathInline text={item.question_info.title} /></strong>
          <p>{formatList(locale, item.question_info.tags.map((tag) => tag.displayName || tag.name).filter(Boolean)) || t('profile.tabs.qa')}</p>
        </Link>
      ))}
    </div>
  );
}

function CommentList({ items }: { items: PersonalCommentSummary[] }) {
  const { t } = useFeatureTranslation('identity');
  if (!items.length) return <div className="state-strip">{t('profile.empty.comments')}</div>;
  return (
    <div className="profile-item-list compact-profile-list">
      {items.map((item) => {
        const type = commentTimelineType(item);
        return (
          <Link to={commentPath(item)} key={item.comment_id}>
            <ProfileItemMeta
              type="comment"
              label={profileTimelineLabel(t, 'comment')}
              timestamp={item.created_at * 1000}
              detail={profileTimelineLabel(t, type)}
            />
            <strong><MathInline text={item.title || t('profile.timeline.types.comment')} /></strong>
            <p><MathInline text={item.content} /></p>
          </Link>
        );
      })}
    </div>
  );
}

function ContentList({
  items,
  emptyText,
}: {
  items: FeedItem[];
  emptyText: string;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  if (!items.length) return <div className="state-strip">{emptyText}</div>;
  return (
    <div className="profile-item-list compact-profile-list">
      {items.map((item) => {
        const meta = feedItemProfileMeta(t, locale, item);
        return (
          <Link to={contentPath(item.type, item.id, item.title)} key={`${item.type}-${item.id}`}>
            <ProfileItemMeta
              type={meta.type}
              label={meta.label}
              timestamp={meta.timestamp}
              detail={meta.detail}
            />
            <strong><MathInline text={item.title} /></strong>
            {item.excerpt ? <p><MathInline text={item.excerpt} /></p> : null}
          </Link>
        );
      })}
    </div>
  );
}

function TimelineList({ items }: { items: ProfileTimelineItem[] }) {
  const { t } = useFeatureTranslation('identity');
  if (!items.length) return <div className="state-strip">{t('profile.empty.content')}</div>;
  return (
    <div className="profile-item-list compact-profile-list profile-timeline-list">
      {items.map((item) => (
        <Link to={item.path} key={item.key}>
          <ProfileItemMeta type={item.type} label={item.label} timestamp={item.timestamp} detail={item.meta} />
          <strong><MathInline text={item.title} /></strong>
          {item.excerpt ? <p><MathInline text={item.excerpt} /></p> : null}
        </Link>
      ))}
    </div>
  );
}

function BlogList({ items }: { items: FeedItem[] }) {
  const { t } = useFeatureTranslation('identity');
  return <ContentList items={items} emptyText={t('profile.empty.blogs')} />;
}

function BookList({ items }: { items: FeedItem[] }) {
  const { t } = useFeatureTranslation('identity');
  return <ContentList items={items} emptyText={t('profile.empty.books')} />;
}

function DiscussionList({ items }: { items: FeedItem[] }) {
  const { t } = useFeatureTranslation('identity');
  return <ContentList items={items} emptyText={t('profile.empty.discussions')} />;
}

function DynamicList({ items }: { items: FeedItem[] }) {
  const { t } = useFeatureTranslation('identity');
  return <ContentList items={items} emptyText={t('profile.empty.dynamics')} />;
}

function CollectionList({ items }: { items: FeedItem[] }) {
  const { t } = useFeatureTranslation('identity');
  return <ContentList items={items} emptyText={t('profile.empty.collections')} />;
}

function isSystemCollectionFolder(folder?: CollectionFolder | null) {
  return Boolean(folder?.systemKind);
}

function isWorksCollectionFolder(folder?: CollectionFolder | null) {
  return Boolean(folder?.scope === 'works' || folder?.systemKind === 'works' || folder?.systemKind === 'works-private');
}

function isWorkCollectionEntry(entry: CollectionFolderItem) {
  return entry.source === 'work';
}

function workPostIdFromCollectionId(collectionId: string) {
  return collectionId.startsWith('work:') ? collectionId.slice(5) : '';
}

function collectionFolderUnitLabel(t: IdentityTranslation, folder?: CollectionFolder | null) {
  return isWorksCollectionFolder(folder) ? t('profile.collections.works') : t('profile.collections.bookmarks');
}

function collectionSidebarTreeNodes(nodes: CollectionFolderTreeNode[]): CollectionFolderTreeNode[] {
  return nodes
    .filter((node) => !isWorksCollectionFolder(node))
    .map((node) => ({
      ...node,
      children: collectionSidebarTreeNodes(node.children),
    }));
}

function collectionTreeNodeCount(nodes: CollectionFolderTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + collectionTreeNodeCount(node.children), 0);
}

function CollectionFolderTree({
  nodes,
  currentId,
  droppable,
  dragTargetId,
  draggableFolders,
  draggingFolderId,
  folderDropTargetId,
  canDropEntryToFolder,
  canDropFolder,
  onOpen,
  onDropToFolder,
  onDragTargetChange,
  onFolderDragStart,
  onFolderDragEnd,
  onFolderDropToFolder,
  onFolderDropTargetChange,
  onFolderContextMenu,
  depth = 0,
}: {
  nodes: CollectionFolderTreeNode[];
  currentId: string;
  droppable: boolean;
  dragTargetId: string;
  draggableFolders: boolean;
  draggingFolderId: string;
  folderDropTargetId: string;
  canDropEntryToFolder: (targetFolderId: string) => boolean;
  canDropFolder: (targetFolderId: string) => boolean;
  onOpen: (folderId: string) => void;
  onDropToFolder: (folderId: string) => void;
  onDragTargetChange: (folderId: string) => void;
  onFolderDragStart: (event: DragEvent<HTMLButtonElement>, folderId: string) => void;
  onFolderDragEnd: () => void;
  onFolderDropToFolder: (folderId: string) => void;
  onFolderDropTargetChange: (folderId: string) => void;
  onFolderContextMenu: (event: MouseEvent<HTMLButtonElement>, folderId: string) => void;
  depth?: number;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  if (!nodes.length) return null;
  return (
    <div className={depth === 0 ? 'collection-folder-tree' : 'collection-folder-tree nested'}>
      {nodes.map((node) => {
        const isCurrent = node.id === currentId;
        const unitLabel = collectionFolderUnitLabel(t, node);
        const entryDropAllowed = droppable && canDropEntryToFolder(node.id);
        const isDropTarget = entryDropAllowed && dragTargetId === node.id;
        const isDraggingFolder = draggingFolderId === node.id;
        const isFolderDropTarget = Boolean(draggingFolderId) && folderDropTargetId === node.id;
        const folderDropAllowed = isFolderDropTarget && canDropFolder(node.id);
        const folderDropDisabled = Boolean(draggingFolderId) && !canDropFolder(node.id);
        return (
          <div className="collection-folder-tree-node" key={node.id}>
            <AnimateButton unstyled
              className={`collection-folder-tree-button${isCurrent ? ' active' : ''}${isDropTarget || folderDropAllowed ? ' drop-target' : ''}${droppable && isCurrent || folderDropDisabled ? ' drop-disabled' : ''}${isDraggingFolder ? ' dragging-folder' : ''}`}
              type="button"
              draggable={draggableFolders && !node.isDefault && !isSystemCollectionFolder(node)}
              onClick={() => onOpen(node.id)}
              onContextMenu={(event) => onFolderContextMenu(event, node.id)}
              onDragStart={(event) => onFolderDragStart(event, node.id)}
              onDragEnd={onFolderDragEnd}
              onDragEnter={(event) => {
                if (!droppable && !draggingFolderId) return;
                event.preventDefault();
                if (draggingFolderId) {
                  onFolderDropTargetChange(node.id);
                } else if (canDropEntryToFolder(node.id)) {
                  onDragTargetChange(node.id);
                }
              }}
              onDragOver={(event) => {
                if (!droppable && !draggingFolderId) return;
                event.preventDefault();
                if (draggingFolderId) {
                  event.dataTransfer.dropEffect = canDropFolder(node.id) ? 'move' : 'none';
                  onFolderDropTargetChange(node.id);
                } else {
                  event.dataTransfer.dropEffect = isCurrent || !canDropEntryToFolder(node.id) ? 'none' : 'move';
                  if (!canDropEntryToFolder(node.id)) return;
                  onDragTargetChange(node.id);
                }
              }}
              onDragLeave={(event) => {
                if (!droppable && !draggingFolderId) return;
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                if (draggingFolderId) {
                  onFolderDropTargetChange('');
                } else {
                  onDragTargetChange('');
                }
              }}
              onDrop={(event) => {
                if (!droppable && !draggingFolderId) return;
                event.preventDefault();
                if (draggingFolderId) {
                  onFolderDropTargetChange('');
                  onFolderDropToFolder(node.id);
                } else {
                  onDragTargetChange('');
                  onDropToFolder(node.id);
                }
              }}
              style={{ paddingLeft: `${10 + depth * 12}px` }}
            >
              <Icon name={node.children.length ? 'folder2-open' : 'folder2'} />
              <span>
                <strong><MathInline text={node.name} /></strong>
                <em>{node.childCount
                  ? t('profile.collections.folderSummary', {
                    items: formatNumber(locale, node.itemCount),
                    unit: unitLabel,
                    folders: formatNumber(locale, node.childCount),
                  })
                  : t('profile.collections.itemSummary', {
                    items: formatNumber(locale, node.itemCount),
                    unit: unitLabel,
                  })}</em>
              </span>
              <small>{folderDropAllowed
                ? t('profile.collections.dropHere')
                : isFolderDropTarget
                  ? t('profile.collections.cannotDrop')
                  : isDropTarget && !isCurrent
                    ? t('profile.collections.moveHere')
                    : formatNumber(locale, node.itemCount)}</small>
            </AnimateButton>
            <CollectionFolderTree
              nodes={node.children}
              currentId={currentId}
              droppable={droppable}
              dragTargetId={dragTargetId}
              draggableFolders={draggableFolders}
              draggingFolderId={draggingFolderId}
              folderDropTargetId={folderDropTargetId}
              canDropEntryToFolder={canDropEntryToFolder}
              canDropFolder={canDropFolder}
              onOpen={onOpen}
              onDropToFolder={onDropToFolder}
              onDragTargetChange={onDragTargetChange}
              onFolderDragStart={onFolderDragStart}
              onFolderDragEnd={onFolderDragEnd}
              onFolderDropToFolder={onFolderDropToFolder}
              onFolderDropTargetChange={onFolderDropTargetChange}
              onFolderContextMenu={onFolderContextMenu}
              depth={depth + 1}
            />
          </div>
        );
      })}
    </div>
  );
}

function CollectionMoveSheet({
  title,
  currentLabel,
  targetLabel,
  selectedPreview,
  folders,
  recommendedFolders = [],
  recentTargetFolderId,
  currentFolderId,
  targetFolderId,
  folderQuery,
  busy,
  moveFolderName,
  canCreateFolder,
  createPlaceholder,
  createLocationLabel,
  emptyText,
  currentTargetNote,
  onClose,
  onTargetChange,
  onFolderQueryChange,
  onMoveFolderNameChange,
  onCreateFolder,
  onConfirmTarget,
  onConfirm,
}: {
  title: string;
  currentLabel?: string;
  targetLabel: string;
  selectedPreview: Array<{ id: string; title: string }>;
  folders: Array<{ id: string; name: string; path: string; itemCount: number; depth: number; parentName: string }>;
  recommendedFolders?: Array<{ id: string; name: string; path: string; itemCount: number; depth: number; parentName: string; reason: string }>;
  recentTargetFolderId?: string;
  currentFolderId: string;
  targetFolderId: string;
  folderQuery: string;
  busy: boolean;
  moveFolderName?: string;
  canCreateFolder?: boolean;
  createPlaceholder?: string;
  createLocationLabel?: string;
  emptyText?: string;
  currentTargetNote?: string;
  onClose: () => void;
  onTargetChange: (folderId: string) => void;
  onFolderQueryChange: (value: string) => void;
  onMoveFolderNameChange?: (value: string) => void;
  onCreateFolder?: () => void;
  onConfirmTarget?: (folderId: string) => void;
  onConfirm: () => void;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const [showOnlySelectableTargets, setShowOnlySelectableTargets] = useState(false);
  const hasSelectedTarget = Boolean(targetFolderId);
  const selectedTargetIsCurrent = targetFolderId === currentFolderId;
  const selectedCount = selectedPreview.length;
  const selectableFolderCount = folders.filter((folder) => folder.id !== currentFolderId).length;
  const selectedTargetFolder = folders.find((folder) => folder.id === targetFolderId);
  const visibleTargetFolders = showOnlySelectableTargets
    ? folders.filter((folder) => folder.id !== currentFolderId)
    : folders;
  const visibleRecommendedFolders = recommendedFolders.filter((folder) => (
    folder.id !== currentFolderId && folders.some((option) => option.id === folder.id)
  ));
  return (
    <div className="collection-move-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="collection-move-panel collection-move-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="collection-move-panel-head">
          <strong>{title}</strong>
          <AnimateButton unstyled type="button" onClick={onClose} disabled={busy} aria-label={t('profile.collections.closeMovePanel')}>
            <Icon name="x-lg" />
          </AnimateButton>
        </div>
        <div className={`collection-move-panel-target${hasSelectedTarget ? '' : ' empty'}`}>
          {currentLabel ? <span>{currentLabel}</span> : null}
          <strong>{targetLabel}</strong>
        </div>
        <div className="collection-move-workbench">
          <div className="collection-move-pending" aria-label={t('profile.collections.pendingMove')}>
            <div className="collection-move-section-head">
              <span>{t('profile.collections.pendingContent')}</span>
              <strong>{formatNumber(locale, selectedCount)}</strong>
            </div>
            {selectedPreview.length ? (
              <div className="collection-move-selection-list">
                {selectedPreview.slice(0, 8).map((entry, index) => (
                  <div className="collection-move-selection-row" key={entry.id}>
                    <b>{index + 1}</b>
                    <strong><MathInline text={entry.title} /></strong>
                  </div>
                ))}
                {selectedPreview.length > 8 ? <em>{t('profile.collections.additionalMoveCount', {
                  count: selectedPreview.length - 8,
                  displayCount: formatNumber(locale, selectedPreview.length - 8),
                })}</em> : null}
              </div>
            ) : (
              <div className="state-strip">{t('profile.collections.noSelectedContent')}</div>
            )}
            <div className="collection-move-confirm-grid" aria-label={t('profile.collections.moveConfirmation')}>
              <div>
                <span>{t('profile.collections.operation')}</span>
                <strong>{t('profile.collections.moveBookmarks')}</strong>
              </div>
              <Icon name="arrow-right" />
              <div>
                <span>{t('profile.collections.target')}</span>
                <strong>{hasSelectedTarget ? selectedTargetFolder?.path || targetLabel : t('shared.notSelected')}</strong>
              </div>
            </div>
          </div>
          <div className="collection-move-targets">
            <div className="collection-move-section-head">
              <span>{t('profile.collections.selectTargetFolder')}</span>
              <strong>{formatNumber(locale, visibleTargetFolders.length)}</strong>
            </div>
            <label className="collection-folder-search collection-folder-search-compact">
              <Icon name="search" />
              <input
                value={folderQuery}
                onChange={(event) => onFolderQueryChange(event.target.value)}
                placeholder={t('profile.collections.searchTargetFolders')}
                aria-label={t('profile.collections.searchTargetFolders')}
              />
            </label>
            <div className="collection-move-target-tools" aria-label={t('profile.collections.targetFolderStatus')}>
              <span>
                <Icon name="folder-check" />
                {t('profile.collections.selectableTargets', {
                  count: selectableFolderCount,
                  displayCount: formatNumber(locale, selectableFolderCount),
                })}
              </span>
              <strong>{selectedTargetFolder ? selectedTargetFolder.path : t('profile.collections.noTargetPath')}</strong>
              {folderQuery.trim() ? (
                <AnimateButton unstyled type="button" onClick={() => onFolderQueryChange('')} disabled={busy}>
                  {t('profile.collections.clearSearch')}
                </AnimateButton>
              ) : null}
            </div>
            <div className="collection-move-target-filter" aria-label={t('profile.collections.targetFolderFilter')}>
              <AnimateButton unstyled
                type="button"
                className={!showOnlySelectableTargets ? 'active' : ''}
                onClick={() => setShowOnlySelectableTargets(false)}
                aria-pressed={!showOnlySelectableTargets}
                disabled={busy}
              >
                {t('profile.collections.allTargets')}
              </AnimateButton>
              <AnimateButton unstyled
                type="button"
                className={showOnlySelectableTargets ? 'active' : ''}
                onClick={() => setShowOnlySelectableTargets(true)}
                aria-pressed={showOnlySelectableTargets}
                disabled={busy}
              >
                {t('profile.collections.selectableOnly')}
              </AnimateButton>
            </div>
            {canCreateFolder ? (
              <div className="collection-create-inline">
                <Icon name="folder-plus" />
                <span className="collection-create-inline-body">
                  <input
                    aria-label={t('profile.collections.newTargetFolderName')}
                    placeholder={createPlaceholder || t('profile.collections.newTargetFolder')}
                    value={moveFolderName || ''}
                    onChange={(event) => onMoveFolderNameChange?.(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        onCreateFolder?.();
                      }
                    }}
                  />
                  {createLocationLabel ? <small>{createLocationLabel}</small> : null}
                </span>
                <AnimateButton unstyled type="button" onClick={onCreateFolder} disabled={busy || !(moveFolderName || '').trim()}>
                  {t('shared.create')}
                </AnimateButton>
              </div>
            ) : null}
            {visibleRecommendedFolders.length ? (
              <div className="collection-move-quick-targets" aria-label={t('profile.collections.recommendedTargets')}>
                <div className="collection-move-section-head">
                  <span>{t('profile.collections.recommendedTargets')}</span>
                  <strong>{formatNumber(locale, visibleRecommendedFolders.length)}</strong>
                </div>
                <div className="collection-move-quick-grid">
                  {visibleRecommendedFolders.map((folder) => {
                    const isActive = folder.id === targetFolderId;
                    const isRecent = folder.id === recentTargetFolderId;
                    return (
                      <AnimateButton unstyled
                        type="button"
                        className={isActive ? 'active' : ''}
                        key={folder.id}
                        onClick={() => onTargetChange(folder.id)}
                        disabled={busy}
                      >
                        <Icon name={isActive ? 'check-circle-fill' : isRecent ? 'clock-history' : 'folder2'} />
                        <span>
                          <strong><MathInline text={folder.name} /></strong>
                          <em>{folder.reason}</em>
                          <small>{folder.path}</small>
                        </span>
                        <b>{folder.itemCount}</b>
                      </AnimateButton>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="collection-move-folder-list">
              <div className="collection-move-folder-head" aria-hidden="true">
                <span>{t('profile.collections.targetFolder')}</span>
                <span>{t('profile.collections.location')}</span>
                <span>{t('profile.collections.bookmarks')}</span>
                <span>{t('profile.collections.status')}</span>
              </div>
              {visibleTargetFolders.map((folder) => {
                const isCurrent = folder.id === currentFolderId;
                const isActive = folder.id === targetFolderId;
                return (
                  <div
                    className={`collection-move-folder-row${isActive ? ' active' : ''}${isCurrent ? ' current' : ''}`}
                    key={folder.id}
                  >
                    <AnimateButton unstyled
                      type="button"
                      className="collection-move-folder-select"
                      onClick={() => onTargetChange(folder.id)}
                      disabled={isCurrent}
                    >
                      <Icon name={isActive ? 'check-circle-fill' : 'folder2'} />
                      <span style={{ paddingLeft: `${Math.min(folder.depth, 5) * 14}px` }}>
                        <strong><MathInline text={folder.name} /></strong>
                        <em>{folder.path}</em>
                      </span>
                      <small>{folder.parentName ? folder.parentName : t('profile.collections.root')}</small>
                      <small>{t('profile.collections.itemCount', {
                        count: folder.itemCount,
                        displayCount: formatNumber(locale, folder.itemCount),
                      })}</small>
                      <b>{isCurrent ? t('profile.collections.current') : isActive ? t('shared.selected') : t('shared.select')}</b>
                    </AnimateButton>
                    <AnimateButton unstyled
                      type="button"
                      className="collection-move-folder-quick"
                      onClick={() => onConfirmTarget?.(folder.id)}
                      disabled={busy || isCurrent}
                    >
                      {t('shared.move')}
                    </AnimateButton>
                  </div>
                );
              })}
            </div>
            {!visibleTargetFolders.length ? <div className="state-strip">{emptyText || t('profile.collections.noMatchingFolders')}</div> : null}
          </div>
        </div>
        {selectedTargetIsCurrent ? (
          <div className="collection-move-panel-note">{currentTargetNote || t('profile.collections.currentTargetNote')}</div>
        ) : !hasSelectedTarget ? (
          <div className="collection-move-panel-note">{t('profile.collections.selectTargetBeforeMove')}</div>
        ) : null}
        <div className="collection-move-panel-actions">
          <AnimateButton unstyled type="button" onClick={onClose} disabled={busy}>{t('shared.cancel')}</AnimateButton>
          <AnimateButton unstyled type="button" className="primary" onClick={onConfirm} disabled={busy || !targetFolderId || selectedTargetIsCurrent}>
            {selectedCount ? t('profile.collections.moveCount', {
              count: selectedCount,
              displayCount: formatNumber(locale, selectedCount),
            }) : t('profile.collections.confirmMove')}
          </AnimateButton>
        </div>
      </div>
    </div>
  );
}

function CollectionFolderManager({
  page,
  loading,
  error,
  notice,
  busy,
  moveFolderName,
  canManage,
  batchMode,
  selectedIds,
  batchTargetFolderId,
  movePanelOpen,
  batchRemoveConfirming,
  searchQuery,
  folderQuery,
  treeQuery,
  typeFilter,
  sortMode,
  onOpenFolder,
  onMoveFolderNameChange,
  onFolderQueryChange,
  onTreeQueryChange,
  onTypeFilterChange,
  onCreateMoveFolder,
  onMoveFolderToParent,
  onDeleteFolder,
  onToggleBatchMode,
  onToggleSelected,
  onSelectAll,
  onInvertSelected,
  onClearSelected,
  onBatchTargetChange,
  onMovePanelOpen,
  onMovePanelClose,
  onBatchRemoveConfirmingChange,
  onSearchChange,
  onSortChange,
  onBatchMove,
  onBatchMoveToFolder,
  onBatchRemove,
  onSingleMove,
  onSingleRemove,
}: {
  page: CollectionFolderPage | null;
  loading: boolean;
  error: string;
  notice: string;
  busy: boolean;
  moveFolderName: string;
  canManage: boolean;
  batchMode: boolean;
  selectedIds: string[];
  batchTargetFolderId: string;
  movePanelOpen: boolean;
  batchRemoveConfirming: boolean;
  searchQuery: string;
  folderQuery: string;
  treeQuery: string;
  typeFilter: string;
  sortMode: CollectionSortMode;
  onOpenFolder: (folderId: string) => void;
  onMoveFolderNameChange: (value: string) => void;
  onFolderQueryChange: (value: string) => void;
  onTreeQueryChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onCreateMoveFolder: () => void;
  onMoveFolderToParent: (folderId: string, parentId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onToggleBatchMode: () => void;
  onToggleSelected: (collectionId: string) => void;
  onSelectAll: (visibleIds: string[]) => void;
  onInvertSelected: (visibleIds: string[]) => void;
  onClearSelected: () => void;
  onBatchTargetChange: (folderId: string) => void;
  onMovePanelOpen: () => void;
  onMovePanelClose: () => void;
  onBatchRemoveConfirmingChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: CollectionSortMode) => void;
  onBatchMove: () => void;
  onBatchMoveToFolder: (folderId: string) => void;
  onBatchRemove: () => void;
  onSingleMove: (collectionId: string, folderId: string) => void;
  onSingleRemove: (entry: CollectionFolderItem) => void;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const [folderSidebarCollapsed, setFolderSidebarCollapsed] = useState(true);
  const [selectionInspectorOpen, setSelectionInspectorOpen] = useState(false);
  const [singleMoveCollectionId, setSingleMoveCollectionId] = useState('');
  const [singleRemoveConfirmingId, setSingleRemoveConfirmingId] = useState('');
  const [folderDeleteConfirmingId, setFolderDeleteConfirmingId] = useState('');
  const [folderQuickAction, setFolderQuickAction] = useState<{
    kind: 'create' | 'rename';
    folderId: string;
    value: string;
    createAtRoot?: boolean;
  } | null>(null);
  const [folderQuickActionBusy, setFolderQuickActionBusy] = useState(false);
  const [folderQuickActionError, setFolderQuickActionError] = useState('');
  const [draggingCollectionId, setDraggingCollectionId] = useState('');
  const [dragTargetFolderId, setDragTargetFolderId] = useState('');
  const [draggingFolderId, setDraggingFolderId] = useState('');
  const [folderDropTargetId, setFolderDropTargetId] = useState('');
  const [recentMoveTargetFolderId, setRecentMoveTargetFolderId] = useState('');
  const [folderToastVisible, setFolderToastVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    kind: 'folder' | 'item';
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [workCreateSubmenu, setWorkCreateSubmenu] = useState<'blog' | 'book' | ''>('');

  useEffect(() => {
    if (!batchMode || selectedIds.length === 0) {
      setSelectionInspectorOpen(false);
    }
  }, [batchMode, selectedIds.length]);

  useEffect(() => {
    setSingleMoveCollectionId('');
    setSingleRemoveConfirmingId('');
    setFolderDeleteConfirmingId('');
    setFolderQuickAction(null);
    setFolderQuickActionError('');
    setDraggingCollectionId('');
    setDragTargetFolderId('');
    setDraggingFolderId('');
    setFolderDropTargetId('');
    setContextMenu(null);
    setWorkCreateSubmenu('');
  }, [page?.currentId]);

  useEffect(() => {
    if (!movePanelOpen && !singleMoveCollectionId && !contextMenu && !selectionInspectorOpen && !folderQuickAction) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (folderQuickAction) {
        setFolderQuickAction(null);
        setFolderQuickActionError('');
        return;
      }
      if (selectionInspectorOpen) {
        setSelectionInspectorOpen(false);
        return;
      }
      if (contextMenu) {
        setContextMenu(null);
        setWorkCreateSubmenu('');
        return;
      }
      if (singleMoveCollectionId) {
        setSingleMoveCollectionId('');
        onFolderQueryChange('');
        onBatchTargetChange('');
        return;
      }
      onMovePanelClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu, folderQuickAction, movePanelOpen, onBatchTargetChange, onFolderQueryChange, onMovePanelClose, selectionInspectorOpen, singleMoveCollectionId]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeContextMenu = (event: globalThis.MouseEvent) => {
      if (event.button !== 0) return;
      setContextMenu(null);
      setWorkCreateSubmenu('');
    };
    const closeContextMenuOnScroll = () => {
      setContextMenu(null);
      setWorkCreateSubmenu('');
    };
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenuOnScroll, true);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenuOnScroll, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    const message = error || notice;
    if (!page || !message) {
      setFolderToastVisible(false);
      return undefined;
    }
    setFolderToastVisible(true);
    const timeoutId = window.setTimeout(() => {
      setFolderToastVisible(false);
    }, error ? 4200 : 2800);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [error, notice, page]);

  if (loading && !page) {
    return (
      <LoadingState variant="panel" className="collection-folder-loading" />
    );
  }
  if (error && !page) return <div className="state-strip">{error}</div>;
  if (!page) return <CollectionList items={[]} />;

  const current = page.folders.find((folder) => folder.id === page.currentId);
  const currentUnitLabel = collectionFolderUnitLabel(t, current);
  const currentIsSystemFolder = isSystemCollectionFolder(current);
  const currentIsWorksFolder = isWorksCollectionFolder(current);
  const collectionFolderOptions = page.folders.filter((folder) => !isSystemCollectionFolder(folder) && !isWorksCollectionFolder(folder));
  const worksFolderOptions = page.folders.filter((folder) => isWorksCollectionFolder(folder));
  const folderById = new Map(page.folders.map((folder) => [folder.id, folder]));
  const childFolderIdsByParent = page.folders.reduce<Map<string, string[]>>((childrenByParent, folder) => {
    if (!folder.parentId) return childrenByParent;
    childrenByParent.set(folder.parentId, [...(childrenByParent.get(folder.parentId) || []), folder.id]);
    return childrenByParent;
  }, new Map());
  const collectDescendantFolderIds = (folderId: string) => {
    const descendants = new Set<string>();
    const stack = [...(childFolderIdsByParent.get(folderId) || [])];
    while (stack.length) {
      const childId = stack.pop();
      if (!childId || descendants.has(childId)) continue;
      descendants.add(childId);
      stack.push(...(childFolderIdsByParent.get(childId) || []));
    }
    return descendants;
  };
  const folderPath = (folder: CollectionFolder) => {
    const chain: string[] = [folder.name];
    let parentId = folder.parentId;
    const seen = new Set([folder.id]);
    while (parentId && !seen.has(parentId)) {
      const parent = folderById.get(parentId);
      if (!parent) break;
      chain.unshift(parent.name);
      seen.add(parent.id);
      parentId = parent.parentId;
    }
    return chain.join(' / ');
  };
  const folderIsInPrivateWorksBranch = (folder: CollectionFolder) => {
    let current: CollectionFolder | undefined = folder;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === collectionWorksPrivateFolderID || current.systemKind === 'works-private') {
        return true;
      }
      seen.add(current.id);
      current = current.parentId ? folderById.get(current.parentId) : undefined;
    }
    return false;
  };
  const workCreateLink = (to: string, folder: CollectionFolder) => {
    const [pathname, query = ''] = to.split('?');
    const params = new URLSearchParams(query);
    params.set('worksFolderId', folder.id);
    if (folderIsInPrivateWorksBranch(folder)) {
      params.set('worksVisibility', 'private');
    } else {
      params.delete('worksVisibility');
    }
    const nextQuery = params.toString();
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
  };
  const folderDepth = (folder: CollectionFolder) => folderPath(folder).split(' / ').filter(Boolean).length - 1;
  const folderParentName = (folder: CollectionFolder) => (folder.parentId ? folderById.get(folder.parentId)?.name || '' : '');
  const defaultFolder = folderById.get(page.defaultId) || current || page.folders[0];
  const selectedCount = selectedIds.length;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const normalizedFolderQuery = folderQuery.trim().toLowerCase();
  const normalizedTreeQuery = treeQuery.trim().toLowerCase();
  const filteredCollectionFolderOptions = collectionFolderOptions.filter((folder) => {
    if (!normalizedFolderQuery) return true;
    return folderPath(folder).toLowerCase().includes(normalizedFolderQuery);
  });
  const filteredWorksFolderOptions = worksFolderOptions.filter((folder) => {
    if (!normalizedFolderQuery) return true;
    return folderPath(folder).toLowerCase().includes(normalizedFolderQuery);
  });
  const filterTreeNodes = (nodes: CollectionFolderTreeNode[]): CollectionFolderTreeNode[] => {
    if (!normalizedTreeQuery) return nodes;
    return nodes
      .map((node) => {
        const children = filterTreeNodes(node.children);
        const matched = folderPath(node).toLowerCase().includes(normalizedTreeQuery);
        if (!matched && !children.length) return null;
        return {
          ...node,
          children,
        };
      })
      .filter((node): node is CollectionFolderTreeNode => node !== null);
  };
  const sidebarTree = collectionSidebarTreeNodes(page.tree);
  const sidebarFolderCount = collectionTreeNodeCount(sidebarTree);
  const filteredTree = filterTreeNodes(sidebarTree);
  const selectedTargetFolder = batchTargetFolderId ? folderById.get(batchTargetFolderId) : undefined;
  const singleMoveItem = page.items.find((entry) => entry.collectionId === singleMoveCollectionId);
  const singleMoveItemIsWork = singleMoveItem ? isWorkCollectionEntry(singleMoveItem) : false;
  const singleMoveFolderOptions = singleMoveItemIsWork ? filteredWorksFolderOptions : filteredCollectionFolderOptions;
  const singleMoveTargetFolder = batchTargetFolderId ? folderById.get(batchTargetFolderId) : undefined;
  const parentFolderId = page.breadcrumbs.at(-2)?.id || '';
  const moveSheetRecommendedFolders = Array.from(new Set([
    recentMoveTargetFolderId,
    parentFolderId,
    ...page.children.slice(0, 4).map((folder) => folder.id),
    ...(singleMoveItemIsWork ? worksFolderOptions : collectionFolderOptions)
      .filter((folder) => folder.id !== page.currentId)
      .sort((left, right) => right.itemCount - left.itemCount)
      .slice(0, 4)
      .map((folder) => folder.id),
  ]))
    .map((folderId) => {
      const folder = folderById.get(folderId);
      if (!folder || folder.id === page.currentId) return null;
      return {
        id: folder.id,
        name: folder.name,
        path: folderPath(folder),
        itemCount: folder.itemCount,
        depth: folderDepth(folder),
        parentName: folderParentName(folder),
        reason: folder.id === recentMoveTargetFolderId
          ? t('profile.collections.reasons.recent')
          : folder.id === parentFolderId
            ? t('profile.collections.reasons.parent')
            : folder.parentId === page.currentId
              ? t('profile.collections.reasons.child')
              : t('profile.collections.reasons.populated'),
      };
    })
    .filter((folder): folder is {
      id: string;
      name: string;
      path: string;
      itemCount: number;
      depth: number;
      parentName: string;
      reason: string;
    } => folder !== null)
    .slice(0, 6);
  const totalItems = page.folders.reduce((sum, folder) => sum + folder.itemCount, 0);
  const currentPathLabel = current ? folderPath(current) : t('profile.collections.folder');
  const typeOptions = page.items.reduce<{ value: string; label: string; count: number }[]>((options, entry) => {
    const meta = feedItemProfileMeta(t, locale, entry.item);
    const currentIndex = options.findIndex((option) => option.value === meta.type);
    if (currentIndex >= 0) {
      options[currentIndex] = {
        ...options[currentIndex],
        count: options[currentIndex].count + 1,
      };
      return options;
    }
    return [...options, { value: meta.type, label: meta.label, count: 1 }];
  }, []);
  const visibleItems = page.items
    .filter((entry) => {
      if (typeFilter) {
        const meta = feedItemProfileMeta(t, locale, entry.item);
        if (meta.type !== typeFilter) return false;
      }
      if (!normalizedQuery) return true;
      const target = [
        entry.item.title,
        entry.item.excerpt,
        entry.item.author,
        entry.item.type,
        ...entry.item.tags,
      ].join(' ').toLowerCase();
      return target.includes(normalizedQuery);
    })
    .sort((left, right) => {
      if (sortMode === 'title') return left.item.title.localeCompare(right.item.title, locale);
      const leftTime = new Date(left.updatedAt || left.collectedAt).getTime();
      const rightTime = new Date(right.updatedAt || right.collectedAt).getTime();
      return sortMode === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });
  const visibleChildren = page.children.filter((folder) => {
    if (!normalizedQuery) return true;
    return [folder.name, folderPath(folder)].join(' ').toLowerCase().includes(normalizedQuery);
  });
  const hasFolderEntries = page.children.length > 0 || page.items.length > 0;
  const hasVisibleEntries = visibleChildren.length > 0 || visibleItems.length > 0;
  const showFilteredEmpty = hasFolderEntries && !hasVisibleEntries;
  const visibleCollectionItems = visibleItems.filter((entry) => !isWorkCollectionEntry(entry));
  const visibleIds = visibleCollectionItems.map((entry) => entry.collectionId);
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allSelected = visibleCollectionItems.length > 0 && visibleSelectedCount === visibleCollectionItems.length;
  const selectedItems = page.items.filter((entry) => !isWorkCollectionEntry(entry) && selectedIds.includes(entry.collectionId));
  const primarySelectedItem = selectedItems.at(-1);
  const primarySelectedMeta = primarySelectedItem ? feedItemProfileMeta(t, locale, primarySelectedItem.item) : null;
  const primarySelectedCollectedAt = primarySelectedItem
    ? dateTimeLabel(t, locale, new Date(primarySelectedItem.collectedAt).getTime())
    : '';
  const primarySelectedTags = primarySelectedItem?.item.tags.slice(0, 6) || [];
  const selectedTypeSummary = selectedItems
    .reduce<{ label: string; count: number }[]>((summary, entry) => {
      const label = feedItemProfileMeta(t, locale, entry.item).label;
      const currentIndex = summary.findIndex((item) => item.label === label);
      if (currentIndex >= 0) {
        summary[currentIndex] = {
          ...summary[currentIndex],
          count: summary[currentIndex].count + 1,
        };
        return summary;
      }
      return [...summary, { label, count: 1 }];
    }, []);
  const sortModeLabel = t(`profile.collections.sort.${sortMode}`);
  const draggingFolder = draggingFolderId ? folderById.get(draggingFolderId) : undefined;
  const draggingEntry = draggingCollectionId ? page.items.find((entry) => entry.collectionId === draggingCollectionId) : undefined;
  const draggingEntryIsWork = draggingEntry ? isWorkCollectionEntry(draggingEntry) : false;
  const dragDropEnabled = canManage && Boolean(draggingCollectionId) && !busy;
  const draggingFolderDescendants = draggingFolderId ? collectDescendantFolderIds(draggingFolderId) : new Set<string>();
  const canDropDraggedEntryToFolder = (targetFolderId: string) => {
    const targetFolder = folderById.get(targetFolderId);
    if (!draggingEntry || !targetFolder || busy || targetFolderId === page.currentId) return false;
    return draggingEntryIsWork
      ? isWorksCollectionFolder(targetFolder)
      : !isWorksCollectionFolder(targetFolder) && !isSystemCollectionFolder(targetFolder);
  };
  const canDropDraggedFolder = (targetFolderId: string) => {
    const targetFolder = folderById.get(targetFolderId);
    if (!draggingFolder || busy) return false;
    if (!targetFolder || isSystemCollectionFolder(draggingFolder)) return false;
    if (targetFolderId === draggingFolder.id) return false;
    if (draggingFolderDescendants.has(targetFolderId)) return false;
    if (targetFolderId === (draggingFolder.parentId || page.defaultId)) return false;
    if (isWorksCollectionFolder(draggingFolder)) {
      return isWorksCollectionFolder(targetFolder);
    }
    return !isWorksCollectionFolder(targetFolder) && !isSystemCollectionFolder(targetFolder);
  };
  const handleDropCollectionToFolder = (folderId: string) => {
    if (!canManage || busy || !draggingCollectionId || !canDropDraggedEntryToFolder(folderId)) {
      setDraggingCollectionId('');
      setDragTargetFolderId('');
      return;
    }
    setRecentMoveTargetFolderId(folderId);
    if (batchMode && selectedIds.includes(draggingCollectionId) && selectedIds.length > 0) {
      onBatchMoveToFolder(folderId);
    } else {
      onSingleMove(draggingCollectionId, folderId);
    }
    setDraggingCollectionId('');
    setDragTargetFolderId('');
  };
  const handleCollectionDragStart = (event: DragEvent<HTMLElement>, collectionId: string) => {
    const entry = page.items.find((item) => item.collectionId === collectionId);
    if (!canManage || busy || !entry) {
      event.preventDefault();
      return;
    }
    const selectedMoveCount = !isWorkCollectionEntry(entry) && batchMode && selectedIds.includes(collectionId)
      ? Math.max(selectedIds.length, 1)
      : 1;
    setDraggingCollectionId(collectionId);
    setDragTargetFolderId('');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-rinspace-collection-id', collectionId);
    event.dataTransfer.setData('text/plain', `${selectedMoveCount} collection item${selectedMoveCount > 1 ? 's' : ''}`);
  };
  const handleCollectionDragEnd = () => {
    setDraggingCollectionId('');
    setDragTargetFolderId('');
  };
  const handleFolderDragStart = (event: DragEvent<HTMLButtonElement>, folderId: string) => {
    const folder = folderById.get(folderId);
    if (!canManage || busy || !folder || folder.isDefault || isSystemCollectionFolder(folder)) {
      event.preventDefault();
      return;
    }
    setDraggingFolderId(folderId);
    setFolderDropTargetId('');
    setDraggingCollectionId('');
    setDragTargetFolderId('');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-rinspace-folder-id', folderId);
    event.dataTransfer.setData('text/plain', `folder:${folder.name}`);
  };
  const handleFolderDragEnd = () => {
    setDraggingFolderId('');
    setFolderDropTargetId('');
  };
  const handleDropFolderToFolder = (targetFolderId: string) => {
    if (!draggingFolder || !canDropDraggedFolder(targetFolderId)) {
      setDraggingFolderId('');
      setFolderDropTargetId('');
      return;
    }
    onMoveFolderToParent(draggingFolder.id, targetFolderId);
    setDraggingFolderId('');
    setFolderDropTargetId('');
  };
  const handleBatchMoveToFolder = (folderId: string) => {
    const targetFolder = folderById.get(folderId);
    if (!folderId || folderId === page.currentId || !targetFolder || isWorksCollectionFolder(targetFolder) || isSystemCollectionFolder(targetFolder)) return;
    setRecentMoveTargetFolderId(folderId);
    onBatchMoveToFolder(folderId);
  };
  const handleSingleMoveToFolder = (collectionId: string, folderId: string) => {
    const entry = page.items.find((item) => item.collectionId === collectionId);
    const targetFolder = folderById.get(folderId);
    if (!folderId || folderId === page.currentId || !entry || !targetFolder) return;
    if (isWorkCollectionEntry(entry)) {
      if (!isWorksCollectionFolder(targetFolder)) return;
    } else if (isWorksCollectionFolder(targetFolder) || isSystemCollectionFolder(targetFolder)) {
      return;
    }
    setRecentMoveTargetFolderId(folderId);
    onSingleMove(collectionId, folderId);
  };
  const handleConfirmBatchMove = () => {
    const targetFolder = folderById.get(batchTargetFolderId);
    if (!batchTargetFolderId || batchTargetFolderId === page.currentId || !targetFolder || isWorksCollectionFolder(targetFolder) || isSystemCollectionFolder(targetFolder)) return;
    setRecentMoveTargetFolderId(batchTargetFolderId);
    onBatchMove();
  };
  const openFolderQuickAction = (
    kind: 'create' | 'rename',
    folder: CollectionFolder,
    options: { createAtRoot?: boolean } = {},
  ) => {
    if (kind === 'rename' && (isSystemCollectionFolder(folder) || folder.isDefault)) return;
    if (kind === 'create' && isSystemCollectionFolder(folder) && !isWorksCollectionFolder(folder)) return;
    setContextMenu(null);
    setFolderDeleteConfirmingId('');
    setFolderQuickAction({
      kind,
      folderId: folder.id,
      value: kind === 'rename' ? folder.name : '',
      createAtRoot: kind === 'create' && options.createAtRoot,
    });
    setFolderQuickActionError('');
  };
  const submitFolderQuickAction = () => {
    if (!folderQuickAction || folderQuickActionBusy) return;
    const folder = folderById.get(folderQuickAction.folderId);
    const name = folderQuickAction.value.trim();
    if (!folder || !name) return;
    if (folderQuickAction.kind === 'rename' && (folder.isDefault || name === folder.name)) return;
    setFolderQuickActionBusy(true);
    setFolderQuickActionError('');
    const request = folderQuickAction.kind === 'create'
      ? createCollectionFolder(folderQuickAction.createAtRoot ? { name } : { parentId: folder.id, name })
      : updateCollectionFolder({
        folderId: folder.id,
        parentId: folder.parentId || (isWorksCollectionFolder(folder) ? collectionWorksFolderID : page.defaultId),
        name,
      });
    void request
      .then(() => {
        setFolderQuickAction(null);
        setFolderQuickActionError('');
        onOpenFolder(page.currentId);
      })
      .catch((quickActionError) => {
        setFolderQuickActionError(localizedErrorMessage(quickActionError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setFolderQuickActionBusy(false);
      });
  };
  const openContextMenu = (
    event: MouseEvent<HTMLElement>,
    next: { kind: 'folder' | 'item'; id: string },
  ) => {
    if (!canManage || busy) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      ...next,
      x: Math.min(event.clientX, window.innerWidth - 226),
      y: Math.min(event.clientY, window.innerHeight - 236),
    });
    setWorkCreateSubmenu('');
  };
  const renderContextMenu = () => {
    if (!contextMenu) return null;
    if (contextMenu.kind === 'folder') {
      const folder = folderById.get(contextMenu.id);
      if (!folder) return null;
      const folderIsSystem = isSystemCollectionFolder(folder);
      const folderIsWorks = isWorksCollectionFolder(folder);
      const canCreateChildFolder = !folderIsSystem || folderIsWorks;
      const canDeleteFolder = !folderIsSystem && !folder.isDefault && folder.itemCount === 0 && folder.childCount === 0;
      const blogCreateLinks = [
        { to: workCreateLink('/write', folder), icon: '', label: 'LaTeX', latex: true },
        { to: workCreateLink('/write/markdown', folder), icon: 'markdown' as IconName, label: 'Markdown' },
      ];
      const bookCreateLinks = [
        { to: workCreateLink('/books/new?kind=pdf', folder), icon: 'filetype-pdf' as IconName, label: 'PDF' },
        { to: workCreateLink('/books/new?kind=latex', folder), icon: '', label: 'LaTeX', latex: true },
        { to: workCreateLink('/books/new?kind=markdown', folder), icon: 'markdown' as IconName, label: 'Markdown' },
      ];
      const workCreateLinks = [
        { to: workCreateLink('/questions/ask', folder), icon: 'question-circle' as IconName, label: t('profile.collections.createQuestion') },
        { to: workCreateLink('/discussions/new', folder), icon: 'chat-square-text' as IconName, label: t('profile.collections.createDiscussion') },
        { to: workCreateLink('/dynamics/new', folder), icon: 'lightning-charge' as IconName, label: t('profile.collections.createDynamic') },
      ];
      return (
        <div
          className="collection-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="collection-context-menu-head">
            <Icon name="folder2-open" />
            <span>
              <strong><MathInline text={folder.name} /></strong>
              <em>{folderPath(folder)}</em>
            </span>
          </div>
          <AnimateButton unstyled type="button" role="menuitem" onClick={() => { setContextMenu(null); onOpenFolder(folder.id); }}>
            <Icon name="folder2-open" />
            {t('shared.open')}
          </AnimateButton>
          {canCreateChildFolder ? (
            <AnimateButton unstyled type="button" role="menuitem" onClick={() => openFolderQuickAction('create', folder)}>
              <Icon name="folder-plus" />
              {t('profile.collections.newSubfolder')}
            </AnimateButton>
          ) : null}
          {folderIsWorks ? (
            <>
              <div className="collection-context-submenu">
                <AnimateButton unstyled
                  type="button"
                  role="menuitem"
                  className="collection-context-submenu-trigger"
                  aria-expanded={workCreateSubmenu === 'blog'}
                  onClick={() => setWorkCreateSubmenu((value) => (value === 'blog' ? '' : 'blog'))}
                >
                  <Icon name="journal-text" />
                  <span>{t('profile.collections.createBlog')}</span>
                  <Icon name="chevron-right" />
                </AnimateButton>
                {workCreateSubmenu === 'blog' ? (
                  <div className="collection-context-submenu-list">
                    {blogCreateLinks.map((link) => (
                      <Link role="menuitem" to={link.to} key={link.to} onClick={() => setContextMenu(null)}>
                        {link.latex ? (
                          <span
                            className="latex-menu-mark"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{ __html: texLogoHtml }}
                          />
                        ) : (
                          <Icon name={link.icon as IconName} />
                        )}
                        <span>{link.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              {workCreateLinks.map((link) => (
                <Link role="menuitem" to={link.to} key={link.to} onClick={() => setContextMenu(null)}>
                  <Icon name={link.icon} />
                  {link.label}
                </Link>
              ))}
              <div className="collection-context-submenu">
                <AnimateButton unstyled
                  type="button"
                  role="menuitem"
                  className="collection-context-submenu-trigger"
                  aria-expanded={workCreateSubmenu === 'book'}
                  onClick={() => setWorkCreateSubmenu((value) => (value === 'book' ? '' : 'book'))}
                >
                  <Icon name="book" />
                  <span>{t('profile.collections.createBook')}</span>
                  <Icon name="chevron-right" />
                </AnimateButton>
                {workCreateSubmenu === 'book' ? (
                  <div className="collection-context-submenu-list">
                    {bookCreateLinks.map((link) => (
                      <Link role="menuitem" to={link.to} key={link.to} onClick={() => setContextMenu(null)}>
                        {link.latex ? (
                          <span
                            className="latex-menu-mark"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{ __html: texLogoHtml }}
                          />
                        ) : (
                          <Icon name={link.icon as IconName} />
                        )}
                        <span>{link.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {!folderIsSystem ? (
            <>
              <AnimateButton unstyled type="button" role="menuitem" disabled={folder.isDefault} onClick={() => openFolderQuickAction('rename', folder)}>
                <Icon name="pencil-square" />
                {t('profile.collections.rename')}
              </AnimateButton>
              <AnimateButton unstyled
                type="button"
                role="menuitem"
                className={folderDeleteConfirmingId === folder.id ? 'danger confirm' : 'danger'}
                disabled={!canDeleteFolder}
                onClick={() => {
                  if (folderDeleteConfirmingId !== folder.id) {
                    setFolderDeleteConfirmingId(folder.id);
                    return;
                  }
                  setContextMenu(null);
                  setFolderDeleteConfirmingId('');
                  onDeleteFolder(folder.id);
                }}
              >
                <Icon name="trash3" />
                {folderDeleteConfirmingId === folder.id ? t('profile.collections.confirmDelete') : t('profile.collections.deleteEmptyFolder')}
              </AnimateButton>
            </>
          ) : null}
        </div>
      );
    }
    const entry = page.items.find((item) => item.collectionId === contextMenu.id);
    if (!entry) return null;
    const meta = feedItemProfileMeta(t, locale, entry.item);
    const entryIsWork = isWorkCollectionEntry(entry);
    return (
      <div
        className="collection-context-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        role="menu"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="collection-context-menu-head">
          <Icon name="file-earmark-text" />
          <span>
            <strong><MathInline text={entry.item.title} /></strong>
            <em>{meta.label} / {currentPathLabel}</em>
          </span>
        </div>
        <Link
          role="menuitem"
          to={contentPath(entry.item.type, entry.item.id, entry.item.title)}
          onClick={() => setContextMenu(null)}
        >
          <Icon name="box-arrow-up-right" />
          {t('profile.collections.openContent')}
        </Link>
        <AnimateButton unstyled
          type="button"
          role="menuitem"
          onClick={() => {
            setContextMenu(null);
            onBatchTargetChange('');
            onFolderQueryChange('');
            setSingleRemoveConfirmingId('');
            setSingleMoveCollectionId(entry.collectionId);
          }}
        >
          <Icon name="folder-symlink" />
          {t('profile.collections.moveTo')}
        </AnimateButton>
        {!entryIsWork ? (
          <>
            <AnimateButton unstyled
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                if (!batchMode) onToggleBatchMode();
                onToggleSelected(entry.collectionId);
              }}
            >
              <Icon name={selectedIds.includes(entry.collectionId) ? 'check-square-fill' : 'check2-square'} />
              {selectedIds.includes(entry.collectionId) ? t('profile.collections.deselect') : t('shared.select')}
            </AnimateButton>
            <AnimateButton unstyled
              type="button"
              role="menuitem"
              className={singleRemoveConfirmingId === entry.collectionId ? 'danger confirm' : 'danger'}
              onClick={() => {
                setContextMenu(null);
                if (singleRemoveConfirmingId !== entry.collectionId) {
                  setSingleRemoveConfirmingId(entry.collectionId);
                  return;
                }
                setSingleRemoveConfirmingId('');
                onSingleRemove(entry);
              }}
            >
              <Icon name="trash3" />
              {singleRemoveConfirmingId === entry.collectionId ? t('profile.collections.confirmRemove') : t('profile.collections.removeBookmark')}
            </AnimateButton>
          </>
        ) : null}
      </div>
    );
  };
  const openCurrentFolderContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (!current) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        [
          'a',
          'button',
          'input',
          'select',
          'textarea',
          'label',
          '[role="dialog"]',
          '.collection-context-menu',
          '.collection-folder-icon-card',
          '.collection-move-sheet',
          '.collection-folder-quick-modal',
        ].join(','),
      )
    ) {
      return;
    }
    openContextMenu(event, { kind: 'folder', id: current.id });
  };

  return (
    <div className={`collection-folder-manager${folderSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="collection-folder-sidebar" aria-label={t('profile.collections.sidebar')}>
        <div className="collection-folder-sidebar-head">
          <AnimateButton unstyled
            type="button"
            className="collection-folder-sidebar-toggle"
            onClick={() => setFolderSidebarCollapsed((value) => !value)}
            aria-label={folderSidebarCollapsed ? t('profile.collections.expandSidebar') : t('profile.collections.collapseSidebar')}
            title={folderSidebarCollapsed ? t('profile.collections.expandSidebar') : t('profile.collections.collapseSidebar')}
          >
            <Icon name={folderSidebarCollapsed ? 'layout-sidebar-inset' : 'layout-sidebar'} />
          </AnimateButton>
          <span>{t('profile.collections.folders')}</span>
          <strong>{formatNumber(locale, sidebarFolderCount)}</strong>
          {canManage && defaultFolder ? (
            <AnimateButton unstyled
              type="button"
              onClick={() => openFolderQuickAction('create', defaultFolder, { createAtRoot: true })}
              disabled={busy}
              aria-label={t('profile.collections.newFolder')}
              title={t('profile.collections.newFolder')}
            >
              <Icon name="folder-plus" />
            </AnimateButton>
          ) : null}
        </div>
        {!folderSidebarCollapsed ? (
          <>
            <label className="collection-folder-search collection-folder-tree-search">
              <Icon name="search" />
              <input
                value={treeQuery}
                onChange={(event) => onTreeQueryChange(event.target.value)}
                placeholder={t('profile.collections.searchFolders')}
                aria-label={t('profile.collections.searchFolderDirectory')}
              />
            </label>
            <CollectionFolderTree
              nodes={filteredTree}
              currentId={page.currentId}
              droppable={dragDropEnabled}
              dragTargetId={dragTargetFolderId}
              draggableFolders={canManage && !busy}
              draggingFolderId={draggingFolderId}
              folderDropTargetId={folderDropTargetId}
              canDropEntryToFolder={canDropDraggedEntryToFolder}
              canDropFolder={canDropDraggedFolder}
              onOpen={onOpenFolder}
              onDropToFolder={handleDropCollectionToFolder}
              onDragTargetChange={setDragTargetFolderId}
              onFolderDragStart={handleFolderDragStart}
              onFolderDragEnd={handleFolderDragEnd}
              onFolderDropToFolder={handleDropFolderToFolder}
              onFolderDropTargetChange={setFolderDropTargetId}
              onFolderContextMenu={(event, folderId) => openContextMenu(event, { kind: 'folder', id: folderId })}
            />
            {normalizedTreeQuery && !filteredTree.length ? (
              <div className="collection-folder-tree-empty">{t('profile.collections.noMatchingFolders')}</div>
            ) : null}
          </>
        ) : null}
      </aside>
      <div className="collection-folder-main">
        <div className="collection-folder-toolbar">
          <div className="collection-folder-navtools" aria-label={t('profile.collections.navigation')}>
            <AnimateButton unstyled
              type="button"
              onClick={() => parentFolderId && onOpenFolder(parentFolderId)}
              disabled={busy || !parentFolderId}
              aria-label={t('profile.collections.goToParent')}
            >
              <Icon name="arrow-up" />
            </AnimateButton>
            <AnimateButton unstyled
              type="button"
              onClick={() => onOpenFolder(page.currentId)}
              disabled={busy}
              aria-label={t('profile.collections.refreshCurrent')}
            >
              <Icon name="arrow-clockwise" />
            </AnimateButton>
          </div>
          <nav className="collection-breadcrumbs" aria-label={t('profile.collections.path')}>
            {page.breadcrumbs.map((folder, index) => {
              const isEntryDropAllowed = canDropDraggedEntryToFolder(folder.id);
              const isCollectionDropTarget = dragDropEnabled && isEntryDropAllowed && dragTargetFolderId === folder.id;
              const isCurrentCollectionTarget = isCollectionDropTarget && folder.id === page.currentId;
              const isFolderDropTarget = Boolean(draggingFolderId) && folderDropTargetId === folder.id;
              const folderDropAllowed = isFolderDropTarget && canDropDraggedFolder(folder.id);
              const folderDropDisabled = isFolderDropTarget && !canDropDraggedFolder(folder.id);
              const breadcrumbClassName = [
                folder.id === page.currentId ? 'active' : '',
                (isCollectionDropTarget && !isCurrentCollectionTarget) || folderDropAllowed ? 'drop-target' : '',
                isCurrentCollectionTarget || folderDropDisabled ? 'drop-disabled' : '',
              ].filter(Boolean).join(' ');
              return (
                <AnimateButton unstyled
                  type="button"
                  key={folder.id}
                  onClick={() => onOpenFolder(folder.id)}
                  className={breadcrumbClassName}
                  onDragEnter={(event) => {
                    if (!dragDropEnabled && !draggingFolderId) return;
                    event.preventDefault();
                    if (draggingFolderId) {
                      setFolderDropTargetId(folder.id);
                    } else if (canDropDraggedEntryToFolder(folder.id)) {
                      setDragTargetFolderId(folder.id);
                    }
                  }}
                  onDragOver={(event) => {
                    if (!dragDropEnabled && !draggingFolderId) return;
                    event.preventDefault();
                    if (draggingFolderId) {
                      event.dataTransfer.dropEffect = canDropDraggedFolder(folder.id) ? 'move' : 'none';
                      setFolderDropTargetId(folder.id);
                    } else {
                      event.dataTransfer.dropEffect = canDropDraggedEntryToFolder(folder.id) ? 'move' : 'none';
                      if (!canDropDraggedEntryToFolder(folder.id)) return;
                      setDragTargetFolderId(folder.id);
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!dragDropEnabled && !draggingFolderId) return;
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    if (draggingFolderId) {
                      setFolderDropTargetId('');
                    } else {
                      setDragTargetFolderId('');
                    }
                  }}
                  onDrop={(event) => {
                    if (!dragDropEnabled && !draggingFolderId) return;
                    event.preventDefault();
                    if (draggingFolderId) {
                      setFolderDropTargetId('');
                      handleDropFolderToFolder(folder.id);
                    } else {
                      setDragTargetFolderId('');
                      handleDropCollectionToFolder(folder.id);
                    }
                  }}
                >
                  {index > 0 ? <Icon name="chevron-right" /> : null}
                  <span><MathInline text={folder.name} /></span>
                </AnimateButton>
              );
            })}
          </nav>
        </div>
        {folderToastVisible && (notice || error) ? (
          <div className={`collection-folder-toast${error ? ' error' : ''}`} role="status" aria-live="polite">
            <Icon name={error ? 'exclamation-triangle' : 'check2-circle'} />
            <span>{error || notice}</span>
          </div>
        ) : null}
        <div className="collection-folder-content">
          <div className={`collection-folder-explorerbar${batchMode ? ' batch' : ''}`}>
            <div className="collection-folder-explorer-summary">
              <Icon name="folder2-open" />
              <div>
                <span>{batchMode ? t('profile.collections.batchManage') : currentIsSystemFolder ? t('profile.collections.currentDirectory') : t('profile.collections.currentFolder')}</span>
                <strong><MathInline text={current?.name || t('profile.collections.folder')} /></strong>
                <em>{currentPathLabel}</em>
              </div>
              <dl>
                <div>
                  <dt>{currentUnitLabel}</dt>
                  <dd>{page.items.length}</dd>
                </div>
                <div>
                  <dt>{t('profile.collections.folders')}</dt>
                  <dd>{formatNumber(locale, page.children.length)}</dd>
                </div>
                <div>
                  <dt>{t('profile.collections.allContent')}</dt>
                  <dd>{formatNumber(locale, totalItems)}</dd>
                </div>
              </dl>
            </div>
            <div className="collection-folder-commandbar" aria-label={t('profile.collections.commandBar')}>
              <label className="collection-folder-search">
                <Icon name="search" />
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={t('profile.collections.searchCurrent')}
                  aria-label={t('profile.collections.searchCurrent')}
                />
              </label>
              <select
                value={typeFilter}
                onChange={(event) => onTypeFilterChange(event.target.value)}
                aria-label={t('profile.collections.filterByType')}
              >
                <option value="">{t('profile.collections.allTypes')}</option>
                {typeOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label} {option.count}
                  </option>
                ))}
              </select>
              <select
                value={sortMode}
                onChange={(event) => onSortChange(event.target.value as CollectionSortMode)}
                aria-label={t('profile.collections.sortLabel')}
              >
                <option value="newest">{t('profile.collections.sort.newest')}</option>
                <option value="oldest">{t('profile.collections.sort.oldest')}</option>
                <option value="title">{t('profile.collections.sort.title')}</option>
              </select>
              {canManage && visibleCollectionItems.length ? (
                <AnimateButton unstyled
                  type="button"
                  onClick={() => {
                    if (batchMode) {
                      onToggleBatchMode();
                      return;
                    }
                    onToggleBatchMode();
                  }}
                  disabled={busy}
                >
                  <Icon name={batchMode ? 'box-arrow-left' : 'check2-square'} />
                  {batchMode ? t('profile.collections.exitBatch') : t('profile.collections.batchManage')}
                </AnimateButton>
              ) : null}
            </div>
          </div>
          {canManage && batchMode && movePanelOpen ? (
            <CollectionMoveSheet
              title={t('profile.collections.moveToFolder')}
              currentLabel={t('profile.collections.selectedCount', {
                count: selectedCount,
                displayCount: formatNumber(locale, selectedCount),
              })}
              targetLabel={selectedTargetFolder ? t('profile.collections.targetNamed', { target: folderPath(selectedTargetFolder) }) : t('profile.collections.selectTargetFolder')}
              selectedPreview={selectedItems.map((entry) => ({ id: entry.collectionId, title: entry.item.title }))}
              folders={filteredCollectionFolderOptions.map((folder) => ({
                id: folder.id,
                name: folder.name,
                path: folderPath(folder),
                itemCount: folder.itemCount,
                depth: folderDepth(folder),
                parentName: folderParentName(folder),
              }))}
              recommendedFolders={moveSheetRecommendedFolders}
              recentTargetFolderId={recentMoveTargetFolderId}
              currentFolderId={page.currentId}
              targetFolderId={batchTargetFolderId}
              folderQuery={folderQuery}
              busy={busy}
              moveFolderName={moveFolderName}
              canCreateFolder={!currentIsSystemFolder && !currentIsWorksFolder}
              createLocationLabel={t('profile.collections.createAt', { target: current ? folderPath(current) : t('profile.collections.currentDirectory') })}
              onClose={onMovePanelClose}
              onTargetChange={onBatchTargetChange}
              onFolderQueryChange={onFolderQueryChange}
              onMoveFolderNameChange={onMoveFolderNameChange}
              onCreateFolder={onCreateMoveFolder}
              onConfirmTarget={(folderId) => {
                onBatchTargetChange(folderId);
                handleBatchMoveToFolder(folderId);
              }}
              onConfirm={handleConfirmBatchMove}
            />
          ) : null}
          {canManage && !batchMode && singleMoveItem ? (
            <CollectionMoveSheet
              title={t('profile.collections.moveBookmarks')}
              currentLabel={t('profile.collections.currentNamed', { target: currentPathLabel })}
              targetLabel={singleMoveTargetFolder ? t('profile.collections.targetNamed', { target: folderPath(singleMoveTargetFolder) }) : t('profile.collections.selectTargetFolder')}
              selectedPreview={[{ id: singleMoveItem.collectionId, title: singleMoveItem.item.title }]}
              folders={singleMoveFolderOptions.map((folder) => ({
                id: folder.id,
                name: folder.name,
                path: folderPath(folder),
                itemCount: folder.itemCount,
                depth: folderDepth(folder),
                parentName: folderParentName(folder),
              }))}
              recommendedFolders={moveSheetRecommendedFolders}
              recentTargetFolderId={recentMoveTargetFolderId}
              currentFolderId={page.currentId}
              targetFolderId={batchTargetFolderId}
              folderQuery={folderQuery}
              busy={busy}
              moveFolderName={moveFolderName}
              canCreateFolder={singleMoveItemIsWork ? currentIsWorksFolder : (!currentIsSystemFolder && !currentIsWorksFolder)}
              createLocationLabel={t('profile.collections.createAt', { target: current ? folderPath(current) : t('profile.collections.currentDirectory') })}
              currentTargetNote={t('profile.collections.singleCurrentTargetNote')}
              onClose={() => {
                setSingleMoveCollectionId('');
                onFolderQueryChange('');
                onBatchTargetChange('');
              }}
              onTargetChange={onBatchTargetChange}
              onFolderQueryChange={onFolderQueryChange}
              onMoveFolderNameChange={onMoveFolderNameChange}
              onCreateFolder={onCreateMoveFolder}
              onConfirmTarget={(folderId) => {
                handleSingleMoveToFolder(singleMoveItem.collectionId, folderId);
                setSingleMoveCollectionId('');
                onFolderQueryChange('');
                onBatchTargetChange('');
              }}
              onConfirm={() => {
                if (!batchTargetFolderId) return;
                handleSingleMoveToFolder(singleMoveItem.collectionId, batchTargetFolderId);
                setSingleMoveCollectionId('');
                onFolderQueryChange('');
                onBatchTargetChange('');
              }}
            />
          ) : null}
          {showFilteredEmpty ? (
            <div className="collection-folder-empty-workbench compact">
              <Icon name="search" />
              <div>
                <strong>{t('profile.collections.noMatchingContent')}</strong>
              </div>
              <div className="collection-folder-empty-actions">
                <AnimateButton unstyled type="button" onClick={() => onSearchChange('')} disabled={busy || !searchQuery.trim()}>
                  {t('profile.collections.clearSearch')}
                </AnimateButton>
                <AnimateButton unstyled type="button" onClick={() => onTypeFilterChange('')} disabled={busy || !typeFilter}>
                  {t('profile.collections.allTypes')}
                </AnimateButton>
              </div>
            </div>
          ) : null}
          {!showFilteredEmpty ? (
            <div
              className={`collection-folder-workarea${batchMode ? ' batch' : ''}`}
              onContextMenu={openCurrentFolderContextMenu}
            >
              <div className={`collection-folder-list-section${batchMode ? ' batch' : ''}`}>
                <div className="collection-folder-list-head">
                  <div>
                    <span>{batchMode ? t('profile.collections.batchQueue') : t('profile.collections.currentDirectory')}</span>
                    <strong>{t('profile.collections.entryCount', {
                      count: visibleChildren.length + visibleItems.length,
                      displayCount: formatNumber(locale, visibleChildren.length + visibleItems.length),
                    })}</strong>
                  </div>
                  {batchMode ? (
                    <em>{t('profile.collections.visibleSelectedCount', {
                      count: visibleSelectedCount,
                      displayCount: formatNumber(locale, visibleSelectedCount),
                    })}</em>
                  ) : (
                    <em>{sortModeLabel}</em>
                  )}
                </div>
                {canManage && batchMode ? (
                  <div className={`collection-selection-strip${selectedCount ? ' active' : ''}`} aria-label={t('profile.collections.selectionActions')}>
                    <div className="collection-selection-strip-summary">
                      <Icon name={selectedCount ? 'check2-square' : 'square'} />
                      <span>
                        <strong>{selectedCount ? t('profile.collections.selectedCount', {
                          count: selectedCount,
                          displayCount: formatNumber(locale, selectedCount),
                        }) : t('profile.collections.noneSelected')}</strong>
                        <em>{selectedTypeSummary.length
                          ? formatList(locale, selectedTypeSummary.map((item) => `${item.label} ${formatNumber(locale, item.count)}`))
                          : t('profile.collections.itemCount', { count: 0, displayCount: formatNumber(locale, 0) })}</em>
                      </span>
                    </div>
                    <div className="collection-selection-strip-actions">
                      <AnimateButton unstyled
                        type="button"
                        onClick={() => onSelectAll(visibleIds)}
                        disabled={busy || !visibleIds.length}
                        aria-pressed={allSelected}
                      >
                        <Icon name={allSelected ? 'check-square-fill' : 'check2-square'} />
                        {allSelected ? t('profile.collections.deselectAll') : t('profile.collections.selectAllCurrent')}
                      </AnimateButton>
                      <AnimateButton unstyled type="button" onClick={() => onInvertSelected(visibleIds)} disabled={busy || !visibleIds.length}>
                        <Icon name="arrow-left-right" />
                        {t('profile.collections.invertSelection')}
                      </AnimateButton>
                      <AnimateButton unstyled type="button" onClick={() => setSelectionInspectorOpen(true)} disabled={busy || !selectedCount}>
                        <Icon name="layout-sidebar-inset-reverse" />
                        {t('shared.details')}
                      </AnimateButton>
                      <AnimateButton unstyled type="button" onClick={onMovePanelOpen} disabled={busy || !selectedCount}>
                        <Icon name="folder-symlink" />
                        {t('shared.move')}
                      </AnimateButton>
                      <AnimateButton unstyled type="button" onClick={onClearSelected} disabled={busy || !selectedCount}>
                        <Icon name="x-square" />
                        {t('shared.clear')}
                      </AnimateButton>
                      <AnimateButton unstyled
                        type="button"
                        className={batchRemoveConfirming ? 'danger confirm' : 'danger'}
                        onClick={() => {
                          if (!batchRemoveConfirming) {
                            onBatchRemoveConfirmingChange(true);
                            return;
                          }
                          onBatchRemove();
                        }}
                        disabled={busy || !selectedCount}
                      >
                        <Icon name="trash3" />
                        {batchRemoveConfirming ? t('profile.collections.confirmRemove') : t('shared.remove')}
                      </AnimateButton>
                    </div>
                    {batchRemoveConfirming ? (
                      <div className="collection-selection-strip-warning" role="status">
                        <Icon name="exclamation-triangle" />
                        <span>{t('profile.collections.removeScope')}</span>
                        <AnimateButton unstyled type="button" onClick={() => onBatchRemoveConfirmingChange(false)} disabled={busy}>
                          {t('shared.cancel')}
                        </AnimateButton>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className={`collection-folder-item-list collection-folder-icon-grid${batchMode ? ' batch' : ''}`}>
	                  {visibleChildren.map((folder) => {
	                    const folderIsSystem = isSystemCollectionFolder(folder);
	                    const entryDropAllowed = canDropDraggedEntryToFolder(folder.id);
	                    const isCollectionDropTarget = dragDropEnabled && entryDropAllowed && dragTargetFolderId === folder.id;
	                    const isFolderDropTarget = Boolean(draggingFolderId) && folderDropTargetId === folder.id;
                    const folderDropAllowed = isFolderDropTarget && canDropDraggedFolder(folder.id);
                    const folderDropDisabled = Boolean(draggingFolderId) && !canDropDraggedFolder(folder.id);
                    return (
                      <AnimateButton unstyled
                        type="button"
                        className={`collection-folder-icon-card collection-folder-icon-card-folder${isCollectionDropTarget || folderDropAllowed ? ' drop-target' : ''}${folderDropDisabled ? ' drop-disabled' : ''}`}
                        key={folder.id}
	                        draggable={canManage && !busy && !folder.isDefault && !folderIsSystem}
                        onClick={() => onOpenFolder(folder.id)}
                        onContextMenu={(event) => openContextMenu(event, { kind: 'folder', id: folder.id })}
                        onDragStart={(event) => handleFolderDragStart(event, folder.id)}
                        onDragEnd={handleFolderDragEnd}
                        onDragEnter={(event) => {
                          if (!dragDropEnabled && !draggingFolderId) return;
                          event.preventDefault();
                          if (draggingFolderId) {
                            setFolderDropTargetId(folder.id);
	                          } else if (canDropDraggedEntryToFolder(folder.id)) {
	                            setDragTargetFolderId(folder.id);
	                          }
                        }}
                        onDragOver={(event) => {
                          if (!dragDropEnabled && !draggingFolderId) return;
                          event.preventDefault();
                          if (draggingFolderId) {
                            event.dataTransfer.dropEffect = canDropDraggedFolder(folder.id) ? 'move' : 'none';
                            setFolderDropTargetId(folder.id);
                          } else {
	                            event.dataTransfer.dropEffect = canDropDraggedEntryToFolder(folder.id) ? 'move' : 'none';
	                            if (!canDropDraggedEntryToFolder(folder.id)) return;
	                            setDragTargetFolderId(folder.id);
                          }
                        }}
                        onDragLeave={(event) => {
                          if (!dragDropEnabled && !draggingFolderId) return;
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                          if (draggingFolderId) {
                            setFolderDropTargetId('');
                          } else {
                            setDragTargetFolderId('');
                          }
                        }}
                        onDrop={(event) => {
                          if (!dragDropEnabled && !draggingFolderId) return;
                          event.preventDefault();
                          if (draggingFolderId) {
                            setFolderDropTargetId('');
                            handleDropFolderToFolder(folder.id);
                          } else {
                            setDragTargetFolderId('');
                            handleDropCollectionToFolder(folder.id);
                          }
                        }}
                      >
                        <span className="collection-folder-icon-glyph">
                          <Icon name="folder2" />
                        </span>
                        <strong><MathInline text={folder.name} /></strong>
                        <small>{t('profile.collections.itemSummary', {
                          items: formatNumber(locale, folder.itemCount),
                          unit: collectionFolderUnitLabel(t, folder),
                        })}</small>
                        {canManage && !isSystemCollectionFolder(folder) ? (
                          <span
                            className="collection-folder-icon-more"
                            aria-label={t('profile.collections.moreFolderActions')}
                            onClick={(event) => openContextMenu(event, { kind: 'folder', id: folder.id })}
                          >
                            <Icon name="three-dots" />
                          </span>
                        ) : null}
                        <b>{folderDropAllowed
                          ? t('profile.collections.drop')
                          : folderDropDisabled
                            ? t('profile.collections.cannotDrop')
                            : isCollectionDropTarget
                              ? t('profile.collections.moveHere')
                              : t('profile.collections.folder')}</b>
                      </AnimateButton>
                    );
                  })}
                  {visibleItems.map((entry) => (
                    <CollectionFolderItemRow
                      canManage={canManage}
                      entry={entry}
                      busy={busy}
                      batchMode={batchMode}
                      selected={selectedIds.includes(entry.collectionId)}
                      dragging={draggingCollectionId === entry.collectionId}
                      visibleIds={visibleIds}
                      key={entry.collectionId}
                      onDragStart={handleCollectionDragStart}
                      onDragEnd={handleCollectionDragEnd}
                      onToggleSelected={onToggleSelected}
                      onOpenContextMenu={(event, item) => openContextMenu(event, { kind: 'item', id: item.collectionId })}
                    />
                  ))}
                </div>
              </div>
              {canManage && batchMode && selectionInspectorOpen && primarySelectedItem && primarySelectedMeta ? (
                <div
                  className="collection-selection-inspector-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('profile.collections.selectionDetails')}
                  onClick={() => setSelectionInspectorOpen(false)}
                >
                  <aside className="collection-selection-inspector" aria-label={t('profile.collections.selectionDetails')} onClick={(event) => event.stopPropagation()}>
                  <div className="collection-selection-inspector-head">
                    <span>{t('profile.collections.selectionDetails')}</span>
                    <strong>{selectedCount ? t('profile.collections.itemCount', {
                      count: selectedCount,
                      displayCount: formatNumber(locale, selectedCount),
                    }) : t('shared.notSelected')}</strong>
                    <AnimateButton unstyled type="button" onClick={() => setSelectionInspectorOpen(false)} disabled={busy} aria-label={t('profile.collections.closeSelectionDetails')}>
                      <Icon name="x-lg" />
                    </AnimateButton>
                  </div>
                  <div className="collection-selection-primary">
                    <Icon name="check2-square" />
                    <span>
                      <em>{primarySelectedMeta.label}</em>
                      <strong><MathInline text={primarySelectedItem.item.title} /></strong>
                    </span>
                  </div>
                  <dl className="collection-selection-facts">
                    <div>
                      <dt>{t('profile.collections.directory')}</dt>
                      <dd>{currentPathLabel}</dd>
                    </div>
                    <div>
                      <dt>{t('profile.collections.bookmarkedAt')}</dt>
                      <dd>{primarySelectedCollectedAt}</dd>
                    </div>
                    <div>
                      <dt>{t('profile.collections.author')}</dt>
                      <dd>{primarySelectedItem.item.author || t('shared.unknown')}</dd>
                    </div>
                  </dl>
                  {primarySelectedTags.length ? (
                    <div className="collection-selection-tags" aria-label={t('profile.collections.selectedTags')}>
                      {primarySelectedTags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  ) : null}
                  {selectedTypeSummary.length ? (
                    <div className="collection-selection-types">
                      <span>{t('profile.collections.currentSelection')}</span>
                      {selectedTypeSummary.map((item) => (
                        <strong key={item.label}>{item.label} {item.count}</strong>
                      ))}
                    </div>
                  ) : null}
                  <div className="collection-selection-recent" aria-label={t('profile.collections.recentSelection')}>
                    <span>{t('profile.collections.recentSelection')}</span>
                    {selectedItems.slice(-4).reverse().map((entry) => {
                      const meta = feedItemProfileMeta(t, locale, entry.item);
                      return (
                        <AnimateButton unstyled
                          type="button"
                          key={entry.collectionId}
                          onClick={() => onToggleSelected(entry.collectionId)}
                          disabled={busy}
                          aria-label={t('profile.collections.deselectNamed', { title: entry.item.title })}
                        >
                          <Icon name="check-circle-fill" />
                          <strong><MathInline text={entry.item.title} /></strong>
                          <em>{meta.label}</em>
                        </AnimateButton>
                      );
                    })}
                  </div>
                  </aside>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {folderQuickAction ? (
        <div
          className="collection-folder-quick-modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            folderQuickAction.kind === 'create'
              ? folderQuickAction.createAtRoot
                ? t('profile.collections.newFolder')
                : t('profile.collections.newSubfolder')
              : t('profile.collections.renameFolder')
          }
          onClick={() => {
            if (folderQuickActionBusy) return;
            setFolderQuickAction(null);
            setFolderQuickActionError('');
          }}
        >
          <div className="collection-folder-quick-card" onClick={(event) => event.stopPropagation()}>
            <div className="collection-folder-quick-head">
              <Icon name={folderQuickAction.kind === 'create' ? 'folder-plus' : 'pencil-square'} />
              <span>
                <strong>
                  {folderQuickAction.kind === 'create'
                    ? folderQuickAction.createAtRoot
                      ? t('profile.collections.newFolder')
                      : t('profile.collections.newSubfolder')
                    : t('profile.collections.renameFolder')}
                </strong>
                <em>{folderById.get(folderQuickAction.folderId) ? folderPath(folderById.get(folderQuickAction.folderId) as CollectionFolder) : t('profile.collections.folder')}</em>
              </span>
              <AnimateButton unstyled
                type="button"
                onClick={() => {
                  setFolderQuickAction(null);
                  setFolderQuickActionError('');
                }}
                disabled={folderQuickActionBusy}
                aria-label={t('profile.collections.closeFolderAction')}
              >
                <Icon name="x-lg" />
              </AnimateButton>
            </div>
            <label className="collection-folder-quick-field" htmlFor="collection-folder-quick-name">
              <span>{t('profile.collections.folderName')}</span>
              <input
                id="collection-folder-quick-name"
                value={folderQuickAction.value}
                disabled={folderQuickActionBusy}
                autoFocus
                onChange={(event) => {
                  setFolderQuickAction({ ...folderQuickAction, value: event.target.value });
                  setFolderQuickActionError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitFolderQuickAction();
                }}
              />
            </label>
            {folderQuickActionError ? <div className="collection-folder-quick-error">{folderQuickActionError}</div> : null}
            <div className="collection-folder-quick-actions">
              <AnimateButton unstyled
                type="button"
                onClick={() => {
                  setFolderQuickAction(null);
                  setFolderQuickActionError('');
                }}
                disabled={folderQuickActionBusy}
              >
                {t('shared.cancel')}
              </AnimateButton>
              <AnimateButton unstyled
                type="button"
                className="primary"
                onClick={submitFolderQuickAction}
                disabled={
                  folderQuickActionBusy ||
                  !folderQuickAction.value.trim() ||
                  (folderQuickAction.kind === 'rename' && folderQuickAction.value.trim() === folderById.get(folderQuickAction.folderId)?.name)
                }
              >
                {folderQuickAction.kind === 'create' ? t('shared.create') : t('shared.save')}
              </AnimateButton>
            </div>
          </div>
        </div>
      ) : null}
      {renderContextMenu()}
    </div>
  );
}

function CollectionFolderItemRow({
  entry,
  canManage,
  busy,
  batchMode,
  selected,
  dragging,
  visibleIds,
  onDragStart,
  onDragEnd,
  onToggleSelected,
  onOpenContextMenu,
}: {
  entry: CollectionFolderItem;
  canManage: boolean;
  busy: boolean;
  batchMode: boolean;
  selected: boolean;
  dragging: boolean;
  visibleIds: string[];
  onDragStart: (event: DragEvent<HTMLElement>, collectionId: string) => void;
  onDragEnd: () => void;
  onToggleSelected: (collectionId: string, visibleIds?: string[], range?: boolean) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, entry: CollectionFolderItem) => void;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const meta = feedItemProfileMeta(t, locale, entry.item);
  const author = entry.item.author || t('profile.unknownAuthor');
  const entryIsWork = isWorkCollectionEntry(entry);
  const canManageEntry = canManage;
  const canBatchEntry = canManage && !entryIsWork;
  const singleActionBlock = canManageEntry ? (
    <AnimateButton unstyled
      type="button"
      className="collection-folder-single-actions"
      aria-label={t('profile.collections.moreBookmarkActions')}
      onClick={(event) => onOpenContextMenu(event, entry)}
      disabled={busy}
    >
      <Icon name="three-dots" />
    </AnimateButton>
  ) : null;
  const cardBody = (
    <>
      <span className="collection-folder-icon-glyph collection-folder-icon-glyph-content">
        <Icon name="file-earmark-text" />
      </span>
      <TimelineMetaCategory type={meta.type} label={meta.label} />
      <strong><MathInline text={entry.item.title} /></strong>
      <small>{author}</small>
      {batchMode ? (
        <span className="collection-folder-item-state">
          <Icon name={selected ? 'check2-circle' : 'plus-circle'} />
          {selected ? t('shared.selected') : t('shared.select')}
        </span>
      ) : null}
    </>
  );
  return (
    <article
      className={`collection-folder-item collection-folder-icon-card collection-folder-icon-card-content${selected ? ' selected' : ''}${batchMode ? ' batch' : ''}${dragging ? ' dragging' : ''}`}
      draggable={canManageEntry && !busy}
      onContextMenu={(event) => {
        if (!canManage) return;
        onOpenContextMenu(event, entry);
      }}
      onDragStart={(event) => onDragStart(event, entry.collectionId)}
      onDragEnd={onDragEnd}
    >
      {canBatchEntry && batchMode ? (
        <AnimateButton unstyled
          type="button"
          className="collection-folder-item-check"
          onClick={(event) => onToggleSelected(entry.collectionId, visibleIds, event.shiftKey)}
          aria-label={selected ? t('profile.collections.deselectBookmark') : t('profile.collections.selectBookmark')}
          aria-pressed={selected}
          disabled={busy}
        >
          <Icon name={selected ? 'check-square-fill' : 'square'} />
          <span>{selected ? t('shared.selected') : t('shared.select')}</span>
        </AnimateButton>
      ) : null}
      {batchMode && canBatchEntry ? (
        <AnimateButton unstyled
          type="button"
          className="collection-folder-icon-body collection-folder-item-pick"
          onClick={(event) => onToggleSelected(entry.collectionId, visibleIds, event.shiftKey)}
          aria-label={selected ? t('profile.collections.deselectBookmark') : t('profile.collections.selectBookmark')}
          aria-pressed={selected}
          disabled={busy}
        >
          {cardBody}
        </AnimateButton>
      ) : (
        <>
          <Link className="collection-folder-icon-body" to={contentPath(entry.item.type, entry.item.id, entry.item.title)}>
            {cardBody}
          </Link>
          {singleActionBlock}
        </>
      )}
    </article>
  );
}

type ProfileGraphViewport = {
  x: number;
  y: number;
  scale: number;
};

type CollectionSortMode = 'newest' | 'oldest' | 'title';

export function CollectionFolderWorkspace({
  username,
  active = true,
}: {
  username?: string;
  active?: boolean;
}) {
  const { t } = useFeatureTranslation('identity');
  const [collectionFolderPage, setCollectionFolderPage] = useState<CollectionFolderPage | null>(null);
  const [collectionFolderLoading, setCollectionFolderLoading] = useState(false);
  const [collectionFolderError, setCollectionFolderError] = useState('');
  const [collectionFolderNotice, setCollectionFolderNotice] = useState('');
  const [collectionMoveFolderName, setCollectionMoveFolderName] = useState('');
  const [collectionBatchMode, setCollectionBatchMode] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [lastSelectedCollectionId, setLastSelectedCollectionId] = useState('');
  const [collectionBatchTargetFolderId, setCollectionBatchTargetFolderId] = useState('');
  const [collectionMovePanelOpen, setCollectionMovePanelOpen] = useState(false);
  const [collectionBatchRemoveConfirming, setCollectionBatchRemoveConfirming] = useState(false);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const [collectionFolderQuery, setCollectionFolderQuery] = useState('');
  const [collectionTreeQuery, setCollectionTreeQuery] = useState('');
  const [collectionTypeFilter, setCollectionTypeFilter] = useState('');
  const [collectionSortMode, setCollectionSortMode] = useState<CollectionSortMode>('newest');
  const [collectionFolderBusy, setCollectionFolderBusy] = useState(false);

  const resetCollectionFolderView = useCallback(() => {
    setCollectionBatchTargetFolderId('');
    setSelectedCollectionIds([]);
    setLastSelectedCollectionId('');
    setCollectionMovePanelOpen(false);
    setCollectionBatchRemoveConfirming(false);
    setCollectionMoveFolderName('');
    setCollectionSearchQuery('');
    setCollectionFolderQuery('');
    setCollectionTreeQuery('');
    setCollectionTypeFilter('');
  }, []);

  const refreshCollectionFolders = useCallback((folderId?: string) => {
    setCollectionFolderLoading(true);
    setCollectionFolderError('');
    void loadCollectionFolderPage({ username, folderId })
      .then((page) => {
        setCollectionFolderPage(page);
        resetCollectionFolderView();
      })
      .catch((collectionError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(collectionError, 'identity.profileCollectionLoadFailed'));
      })
      .finally(() => {
        setCollectionFolderLoading(false);
      });
  }, [resetCollectionFolderView, username]);

  useEffect(() => {
    if (!active || collectionFolderPage || collectionFolderLoading) {
      return undefined;
    }
    refreshCollectionFolders();
    return undefined;
  }, [active, collectionFolderLoading, collectionFolderPage, refreshCollectionFolders]);

  useEffect(() => {
    setCollectionFolderPage(null);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    resetCollectionFolderView();
  }, [resetCollectionFolderView, username]);

  const createCollectionFolderForMove = useCallback(() => {
    const name = collectionMoveFolderName.trim();
    if (!name || !collectionFolderPage || collectionFolderBusy) return;
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    void createCollectionFolder({ parentId: collectionFolderPage.currentId, name })
      .then((created) => (
        loadCollectionFolderPage({ username, folderId: collectionFolderPage.currentId })
          .then((page) => {
            setCollectionFolderPage(page);
            setCollectionBatchTargetFolderId(created.id);
            setCollectionMoveFolderName('');
            setCollectionMovePanelOpen(true);
            setCollectionFolderNotice(t('profile.collections.notices.createdTarget', { name }));
          })
      ))
      .catch((createError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(createError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, collectionMoveFolderName, t, username]);

  const deleteCurrentCollectionFolder = useCallback((folderId: string) => {
    if (!collectionFolderPage || collectionFolderBusy) return;
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    const parentId = collectionFolderPage.breadcrumbs.at(-2)?.id || collectionFolderPage.defaultId;
    void deleteCollectionFolder(folderId)
      .then(() => {
        setCollectionFolderNotice(t('profile.collections.notices.deleted'));
        refreshCollectionFolders(parentId);
      })
      .catch((deleteError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(deleteError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, refreshCollectionFolders, t]);

  const moveCollectionFolderToParent = useCallback((folderId: string, parentId: string) => {
    if (!collectionFolderPage || collectionFolderBusy) return;
    const folder = collectionFolderPage.folders.find((entry) => entry.id === folderId);
    if (!folder || folder.isDefault) return;
    if (parentId === (folder.parentId || collectionFolderPage.defaultId)) return;
    const targetParent = collectionFolderPage.folders.find((entry) => entry.id === parentId);
    if (!targetParent) return;
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    void updateCollectionFolder({
      folderId: folder.id,
      parentId,
      name: folder.name,
    })
      .then(() => {
        setCollectionFolderNotice(t('profile.collections.notices.folderMoved', {
          name: folder.name,
          target: targetParent.name,
        }));
        refreshCollectionFolders(collectionFolderPage.currentId);
      })
      .catch((updateError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(updateError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, refreshCollectionFolders, t]);

  const moveCollectionToFolder = useCallback((collectionId: string, folderId: string) => {
    if (!collectionFolderPage || collectionFolderBusy) return;
    const targetFolder = collectionFolderPage.folders.find((folder) => folder.id === folderId);
    const workPostId = workPostIdFromCollectionId(collectionId);
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    const moveRequest = workPostId
      ? moveWorkItem({ postId: workPostId, folderId })
      : moveCollectionItem({ collectionId, folderId });
    void moveRequest
      .then(() => {
        const target = targetFolder?.name || t('profile.collections.targetFolder');
        setCollectionFolderNotice(workPostId && targetFolder?.systemKind === 'works-private'
          ? t('profile.collections.notices.movedPrivate', { target })
          : t('profile.collections.notices.moved', { target }));
        refreshCollectionFolders(collectionFolderPage.currentId);
      })
      .catch((moveError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(moveError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, refreshCollectionFolders, t]);

  const toggleCollectionBatchMode = useCallback(() => {
    setCollectionBatchMode((activeBatch) => {
      if (activeBatch) setSelectedCollectionIds([]);
      if (activeBatch) setLastSelectedCollectionId('');
      if (activeBatch) setCollectionMovePanelOpen(false);
      if (activeBatch) setCollectionBatchRemoveConfirming(false);
      if (activeBatch) setCollectionFolderQuery('');
      if (activeBatch) setCollectionTreeQuery('');
      setCollectionBatchTargetFolderId('');
      return !activeBatch;
    });
  }, []);

  const toggleSelectedCollection = useCallback((collectionId: string, visibleIds?: string[], range?: boolean) => {
    setCollectionBatchRemoveConfirming(false);
    setSelectedCollectionIds((ids) => {
      if (range && visibleIds?.length && lastSelectedCollectionId) {
        const startIndex = visibleIds.indexOf(lastSelectedCollectionId);
        const endIndex = visibleIds.indexOf(collectionId);
        if (startIndex >= 0 && endIndex >= 0) {
          const [start, end] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          return Array.from(new Set([...ids, ...visibleIds.slice(start, end + 1)]));
        }
      }
      return ids.includes(collectionId)
        ? ids.filter((id) => id !== collectionId)
        : [...ids, collectionId];
    });
    setLastSelectedCollectionId(collectionId);
  }, [lastSelectedCollectionId]);

  const toggleSelectAllCollections = useCallback((visibleIds: string[]) => {
    if (!visibleIds.length) return;
    setCollectionBatchRemoveConfirming(false);
    setLastSelectedCollectionId('');
    setSelectedCollectionIds((ids) => (
      visibleIds.every((id) => ids.includes(id))
        ? []
        : Array.from(new Set([...ids, ...visibleIds]))
    ));
  }, []);

  const invertSelectedCollections = useCallback((visibleIds: string[]) => {
    if (!visibleIds.length) return;
    setCollectionBatchRemoveConfirming(false);
    setLastSelectedCollectionId('');
    setSelectedCollectionIds((ids) => {
      const visibleSet = new Set(visibleIds);
      const kept = ids.filter((id) => !visibleSet.has(id));
      const added = visibleIds.filter((id) => !ids.includes(id));
      return [...kept, ...added];
    });
  }, []);

  const clearSelectedCollections = useCallback(() => {
    setCollectionBatchRemoveConfirming(false);
    setCollectionMovePanelOpen(false);
    setLastSelectedCollectionId('');
    setSelectedCollectionIds([]);
  }, []);

  const batchMoveCollectionsToFolder = useCallback((targetFolderId: string) => {
    if (!collectionFolderPage || collectionFolderBusy || !selectedCollectionIds.length || !targetFolderId) return;
    const selectedCount = selectedCollectionIds.length;
    const targetFolder = collectionFolderPage.folders.find((folder) => folder.id === targetFolderId);
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    void Promise.all(selectedCollectionIds.map((collectionId) => (
      moveCollectionItem({ collectionId, folderId: targetFolderId })
    )))
      .then(() => {
        setSelectedCollectionIds([]);
        setCollectionBatchMode(false);
        setCollectionMovePanelOpen(false);
        setCollectionBatchRemoveConfirming(false);
        setCollectionFolderNotice(t('profile.collections.notices.batchMoved', {
          count: selectedCount,
          displayCount: selectedCount,
          target: targetFolder?.name || t('profile.collections.targetFolder'),
        }));
        refreshCollectionFolders(collectionFolderPage.currentId);
      })
      .catch((moveError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(moveError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, refreshCollectionFolders, selectedCollectionIds, t]);

  const batchMoveCollections = useCallback(() => {
    batchMoveCollectionsToFolder(collectionBatchTargetFolderId);
  }, [batchMoveCollectionsToFolder, collectionBatchTargetFolderId]);

  const batchRemoveCollections = useCallback(() => {
    if (!collectionFolderPage || collectionFolderBusy || !selectedCollectionIds.length) return;
    const selected = collectionFolderPage.items.filter((entry) => selectedCollectionIds.includes(entry.collectionId));
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    void Promise.all(selected.map((entry) => (
      switchCollection({
        targetType: profileCollectionTargetType(entry.item.type),
        targetId: entry.item.id,
        bookmark: false,
        isCancel: true,
      })
    )))
      .then(() => {
        setSelectedCollectionIds([]);
        setCollectionBatchMode(false);
        setCollectionMovePanelOpen(false);
        setCollectionBatchRemoveConfirming(false);
        setCollectionFolderNotice(t('profile.collections.notices.batchRemoved', {
          count: selected.length,
          displayCount: selected.length,
        }));
        refreshCollectionFolders(collectionFolderPage.currentId);
      })
      .catch((removeError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(removeError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, refreshCollectionFolders, selectedCollectionIds, t]);

  const removeSingleCollection = useCallback((entry: CollectionFolderItem) => {
    if (!collectionFolderPage || collectionFolderBusy) return;
    setCollectionFolderBusy(true);
    setCollectionFolderError('');
    setCollectionFolderNotice('');
    void switchCollection({
      targetType: profileCollectionTargetType(entry.item.type),
      targetId: entry.item.id,
      bookmark: false,
      isCancel: true,
    })
      .then(() => {
        setSelectedCollectionIds((ids) => ids.filter((id) => id !== entry.collectionId));
        setCollectionBatchTargetFolderId('');
        setCollectionFolderQuery('');
        setCollectionFolderNotice(t('profile.collections.notices.removedNamed', { title: entry.item.title }));
        refreshCollectionFolders(collectionFolderPage.currentId);
      })
      .catch((removeError) => {
        setCollectionFolderNotice('');
        setCollectionFolderError(localizedErrorMessage(removeError, 'identity.profileCollectionUpdateFailed'));
      })
      .finally(() => {
        setCollectionFolderBusy(false);
      });
  }, [collectionFolderBusy, collectionFolderPage, refreshCollectionFolders, t]);

  return (
    <CollectionFolderManager
      page={collectionFolderPage}
      loading={collectionFolderLoading}
      error={collectionFolderError}
      notice={collectionFolderNotice}
      busy={collectionFolderBusy}
      moveFolderName={collectionMoveFolderName}
      canManage={Boolean(collectionFolderPage?.canManage)}
      batchMode={collectionBatchMode}
      selectedIds={selectedCollectionIds}
      batchTargetFolderId={collectionBatchTargetFolderId}
      movePanelOpen={collectionMovePanelOpen}
      batchRemoveConfirming={collectionBatchRemoveConfirming}
      searchQuery={collectionSearchQuery}
      folderQuery={collectionFolderQuery}
      treeQuery={collectionTreeQuery}
      typeFilter={collectionTypeFilter}
      sortMode={collectionSortMode}
      onOpenFolder={(folderId) => refreshCollectionFolders(folderId)}
      onMoveFolderNameChange={setCollectionMoveFolderName}
      onFolderQueryChange={setCollectionFolderQuery}
      onTreeQueryChange={setCollectionTreeQuery}
      onTypeFilterChange={setCollectionTypeFilter}
      onCreateMoveFolder={createCollectionFolderForMove}
      onMoveFolderToParent={moveCollectionFolderToParent}
      onDeleteFolder={deleteCurrentCollectionFolder}
      onToggleBatchMode={toggleCollectionBatchMode}
      onToggleSelected={toggleSelectedCollection}
      onSelectAll={toggleSelectAllCollections}
      onInvertSelected={invertSelectedCollections}
      onClearSelected={clearSelectedCollections}
      onBatchTargetChange={setCollectionBatchTargetFolderId}
      onMovePanelOpen={() => {
        setCollectionBatchTargetFolderId('');
        setCollectionFolderQuery('');
        setCollectionBatchRemoveConfirming(false);
        setCollectionMovePanelOpen(true);
      }}
      onMovePanelClose={() => {
        setCollectionMovePanelOpen(false);
        setCollectionFolderQuery('');
      }}
      onBatchRemoveConfirmingChange={setCollectionBatchRemoveConfirming}
      onSearchChange={setCollectionSearchQuery}
      onSortChange={setCollectionSortMode}
      onBatchMove={batchMoveCollections}
      onBatchMoveToFolder={batchMoveCollectionsToFolder}
      onBatchRemove={batchRemoveCollections}
      onSingleMove={moveCollectionToFolder}
      onSingleRemove={removeSingleCollection}
    />
  );
}

type ProfileGraphNodeLayout = KnowledgeGraphNode & {
  x: number;
  y: number;
  radius: number;
  group: number;
};

type ProfileGraphEdgeLayout = KnowledgeGraphEdge & {
  weight: number;
  isTagEdge: boolean;
};

const defaultProfileGraphViewport: ProfileGraphViewport = { x: 0, y: 0, scale: 1 };

function graphNodeTone(node: KnowledgeGraphNode): ProfileTimelineType | 'tag' {
  if (node.kind === 'tag') return 'tag';
  if (node.type === 'forum') return 'discussion';
  if (node.type === 'status') return 'dynamic';
  if (node.type === 'blog' || node.type === 'book' || node.type === 'question' || node.type === 'answer' || node.type === 'comment' || node.type === 'discussion' || node.type === 'dynamic') {
    return node.type;
  }
  return 'question';
}

function graphNodeLabel(t: IdentityTranslation, node: KnowledgeGraphNode) {
  const tone = graphNodeTone(node);
  return tone === 'tag' ? t('objects.tag') : profileTimelineLabel(t, tone);
}

function graphEdgeWeight(edge: KnowledgeGraphEdge) {
  if (!edge.kind.startsWith('tag-tag')) return 1;
  const weight = Number(edge.kind.split(':')[1]);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function profileCollectionTargetType(type: FeedItem['type']) {
  if (type === 'announcement') return 'discussion';
  if (type === 'forum') return 'discussion';
  if (type === 'status') return 'dynamic';
  if (type === 'book') return 'post';
  return type === 'task' || type === 'tag' ? 'post' : type;
}

function graphNeighborIDs(graph: KnowledgeGraphResponse | null, selectedID: string | undefined) {
  if (!graph || !selectedID) return new Set<string>();
  const neighborIDs = new Set<string>();
  graph.edges.forEach((edge) => {
    if (edge.source === selectedID) neighborIDs.add(edge.target);
    if (edge.target === selectedID) neighborIDs.add(edge.source);
  });
  return neighborIDs;
}

function graphNodeRelationClass(nodeID: string, selectedID: string | undefined, neighborIDs: Set<string>) {
  if (!selectedID) return '';
  if (nodeID === selectedID) return ' is-selected';
  if (neighborIDs.has(nodeID)) return ' is-neighbor';
  return ' is-muted';
}

function keepGraphNodeInBounds(node: ProfileGraphNodeLayout, width: number, height: number) {
  node.x = Math.max(node.radius + 8, Math.min(width - node.radius - 8, node.x));
  node.y = Math.max(node.radius + 8, Math.min(height - node.radius - 8, node.y));
}

function separateGraphNodes(nodes: ProfileGraphNodeLayout[], width: number, height: number, padding: number) {
  for (let iteration = 0; iteration < 16; iteration += 1) {
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const source = nodes[left];
        const target = nodes[right];
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        const minDistance = source.radius + target.radius + padding;
        if (distance >= minDistance) continue;
        const shift = (minDistance - distance) / 2;
        const offsetX = (dx / distance) * shift;
        const offsetY = (dy / distance) * shift;
        source.x -= offsetX;
        source.y -= offsetY;
        target.x += offsetX;
        target.y += offsetY;
        keepGraphNodeInBounds(source, width, height);
        keepGraphNodeInBounds(target, width, height);
      }
    }
  }
}

function buildProfileKnowledgeGraphLayout(graph: KnowledgeGraphResponse) {
  const width = 1120;
  const height = 620;
  const centerX = width / 2;
  const centerY = height / 2;
  const tagNodes = graph.nodes.filter((node) => node.kind === 'tag');
  const contentNodes = graph.nodes.filter((node) => node.kind === 'content');
  const layouts = new Map<string, ProfileGraphNodeLayout>();
  const tagEdges = graph.edges.filter((edge) => edge.kind.startsWith('tag-tag'));
  const tagDegree = new Map<string, number>();
  tagEdges.forEach((edge) => {
    const weight = graphEdgeWeight(edge);
    tagDegree.set(edge.source, (tagDegree.get(edge.source) || 0) + weight);
    tagDegree.set(edge.target, (tagDegree.get(edge.target) || 0) + weight);
  });
  const sortedTags = tagNodes.slice().sort((left, right) => {
    const leftDegree = tagDegree.get(left.id) || 0;
    const rightDegree = tagDegree.get(right.id) || 0;
    if (leftDegree === rightDegree) return (right.weight || right.count || 0) - (left.weight || left.count || 0);
    return rightDegree - leftDegree;
  });
  const tagAnchorBySlug = new Map<string, ProfileGraphNodeLayout>();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  sortedTags.forEach((node, index) => {
    const group = index % 3;
    const ring = Math.floor(index / 3);
    const angle = index * goldenAngle - Math.PI / 2;
    const baseRadius = group === 0 ? 82 : group === 1 ? 168 : 250;
    const ringOffset = (ring % 4) * 16;
    const degree = tagDegree.get(node.id) || 0;
    const weight = Math.min(9, Math.max(1, Math.log2((node.weight || node.count || 1) + degree + 1)));
    const layout = {
      ...node,
      x: centerX + Math.cos(angle) * (baseRadius + ringOffset),
      y: centerY + Math.sin(angle) * (baseRadius + ringOffset * 0.68),
      radius: 15 + weight * 2,
      group,
    };
    layouts.set(node.id, layout);
    if (node.slug) tagAnchorBySlug.set(node.slug, layout);
  });

  contentNodes.forEach((node, index) => {
    const anchors = (node.tags || [])
      .map((tag) => tagAnchorBySlug.get(tag))
      .filter((anchor): anchor is ProfileGraphNodeLayout => Boolean(anchor));
    const primaryAnchor = anchors[0];
    const angle = primaryAnchor
      ? Math.atan2(primaryAnchor.y - centerY, primaryAnchor.x - centerX) + ((index % 5) - 2) * 0.2
      : index * goldenAngle - Math.PI / 2;
    const distance = primaryAnchor ? 74 + (index % 4) * 22 : 310 + (index % 5) * 14;
    const anchorX = primaryAnchor?.x ?? centerX;
    const anchorY = primaryAnchor?.y ?? centerY;
    const jitter = ((index % 7) - 3) * 7;
    layouts.set(node.id, {
      ...node,
      x: Math.max(34, Math.min(width - 34, anchorX + Math.cos(angle) * distance + jitter)),
      y: Math.max(34, Math.min(height - 34, anchorY + Math.sin(angle) * distance - jitter)),
      radius: 9 + Math.min(6, Math.max(0, (node.weight || 1) - 1)),
      group: 3,
    });
  });

  const nodes = Array.from(layouts.values());
  separateGraphNodes(nodes.filter((node) => node.kind === 'tag'), width, height, 16);
  separateGraphNodes(nodes, width, height, 8);
  const edges = graph.edges.map((edge) => ({
    ...edge,
    weight: graphEdgeWeight(edge),
    isTagEdge: edge.kind.startsWith('tag-tag'),
  }));
  return { width, height, nodes, edges, layouts };
}

function ProfileGraphPanel({
  graph,
  loading,
  error,
  selectedNode,
  onSelectNode,
}: {
  graph: KnowledgeGraphResponse | null;
  loading: boolean;
  error: string;
  selectedNode: KnowledgeGraphNode | null;
  onSelectNode: (node: KnowledgeGraphNode) => void;
}) {
  const { t } = useFeatureTranslation('identity');
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: ProfileGraphViewport;
  } | null>(null);
  const [viewport, setViewport] = useState<ProfileGraphViewport>(defaultProfileGraphViewport);
  const layout = useMemo(
    () => buildProfileKnowledgeGraphLayout(graph || { nodes: [], edges: [], generatedAt: '' }),
    [graph],
  );
  const selected = selectedNode || layout.nodes[0] || null;
  const selectedID = selected?.id;
  const neighborIDs = useMemo(() => graphNeighborIDs(graph, selectedID), [graph, selectedID]);
  const clampScale = (value: number) => Math.min(2.8, Math.max(0.45, value));

  const handleWheel = useCallback((event: globalThis.WheelEvent) => {
    const target = canvasRef.current;
    if (!target) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextScale = clampScale(viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1));
    const ratio = nextScale / viewport.scale;
    setViewport({
      x: pointerX - (pointerX - viewport.x) * ratio,
      y: pointerY - (pointerY - viewport.y) * ratio,
      scale: nextScale,
    });
  }, [viewport]);

  useEffect(() => {
    const target = canvasRef.current;
    if (!target) return undefined;
    target.addEventListener('wheel', handleWheel, { passive: false });
    return () => target.removeEventListener('wheel', handleWheel);
  });

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('.knowledge-node')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewport({
      ...drag.viewport,
      x: drag.viewport.x + event.clientX - drag.startX,
      y: drag.viewport.y + event.clientY - drag.startY,
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  if (loading && !graph) {
    return (
      <div className="knowledge-graph-stage knowledge-graph-stage-loading profile-graph-stage">
        <div className="knowledge-graph-skeleton" />
      </div>
    );
  }
  if (error) return <div className="state-strip">{error}</div>;
  if (!graph || !layout.nodes.length) return <div className="state-strip">{t('profile.empty.graph')}</div>;

  return (
    <div
      ref={canvasRef}
      className="knowledge-graph-canvas profile-graph-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={t('profile.graph.label')}>
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          <g className="knowledge-graph-edges">
            {layout.edges.map((edge: ProfileGraphEdgeLayout) => {
              const source = layout.layouts.get(edge.source);
              const target = layout.layouts.get(edge.target);
              if (!source || !target) return null;
              const relationClass = selectedID && (edge.source === selectedID || edge.target === selectedID)
                ? ' is-neighbor'
                : selectedID
                  ? ' is-muted'
                  : '';
              return (
                <line
                  key={edge.id}
                  className={`${edge.isTagEdge ? 'knowledge-edge-tag' : 'knowledge-edge-content'}${relationClass}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  style={{
                    strokeWidth: edge.isTagEdge
                      ? Math.min(4, 1.8 + edge.weight * 0.5)
                      : 1.15,
                  }}
                />
              );
            })}
          </g>
          <g className="knowledge-graph-nodes">
            {layout.nodes.map((node) => (
              <g
                key={node.id}
                className={`knowledge-node knowledge-node-${graphNodeTone(node)} knowledge-node-group-${node.group}${selected?.id === node.id ? ' active' : ''}${graphNodeRelationClass(node.id, selectedID, neighborIDs)}`}
                transform={`translate(${node.x} ${node.y})`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node);
                }}
                role="button"
                tabIndex={0}
              >
                <circle r={node.radius} />
                <text y={node.radius + 15}>{node.label.slice(0, 18)}</text>
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

function ProfileGraphInspector({
  graph,
  selectedNode,
  collapsed,
  onToggle,
}: {
  graph: KnowledgeGraphResponse | null;
  selectedNode: KnowledgeGraphNode | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useFeatureTranslation('identity');
  const selected = selectedNode || graph?.nodes[0] || null;
  const relatedNodes = useMemo(() => {
    if (!graph || !selected) return [];
    const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
    const seen = new Set<string>();
    return graph.edges
      .flatMap((edge) => {
        if (edge.source === selected.id) return [edge.target];
        if (edge.target === selected.id) return [edge.source];
        return [];
      })
      .filter((nodeID) => {
        if (seen.has(nodeID)) return false;
        seen.add(nodeID);
        return true;
      })
      .map((nodeID) => nodeMap.get(nodeID))
      .filter((node): node is KnowledgeGraphNode => Boolean(node))
      .slice(0, 10);
  }, [graph, selected]);

  if (collapsed) {
    return (
      <aside className="profile-graph-inspector collapsed">
        <AnimateButton unstyled
          type="button"
          className="profile-graph-inspector-toggle"
          onClick={onToggle}
          aria-label={t('profile.graph.expandSidebar')}
          title={t('shared.expand')}
        >
          <Icon name="chevron-left" />
        </AnimateButton>
      </aside>
    );
  }

  if (!selected) return null;
  return (
    <aside className="profile-graph-inspector">
      <div className="profile-graph-inspector-head">
        <span>{graphNodeLabel(t, selected)}</span>
        <AnimateButton unstyled
          type="button"
          className="profile-graph-inspector-toggle"
          onClick={onToggle}
          aria-label={t('profile.graph.collapseSidebar')}
          title={t('shared.collapse')}
        >
          <Icon name="chevron-right" />
        </AnimateButton>
      </div>
      <h3>
        <Link to={selected.url}>
          <MathInline text={selected.label} />
        </Link>
      </h3>
      {selected.tags?.length ? (
        <div className="tag-row">
          {selected.tags.slice(0, 6).map((tag) => (
            <Link to={legacyTagPath(tag)} key={tag}>
              {tag}
            </Link>
          ))}
        </div>
      ) : null}
      {relatedNodes.length ? (
        <div className="knowledge-related-list">
          <span>{t('profile.graph.relatedNodes')}</span>
          {relatedNodes.map((node) => (
            <Link
              className={`knowledge-related-item knowledge-related-item-${graphNodeTone(node)}`}
              key={node.id}
              to={node.url}
            >
              <span>{graphNodeLabel(t, node)}</span>
              <strong><MathInline text={node.label} /></strong>
            </Link>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function relationTitle(t: IdentityTranslation, relation: UserRelationKind) {
  return relation === 'following' ? t('profile.relations.following') : t('profile.relations.followers');
}

function RelationDialog({
  busyID,
  currentUserID,
  error,
  loading,
  onClose,
  onPageChange,
  onToggleFollow,
  relation,
  result,
}: {
  busyID: string;
  currentUserID: string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onPageChange: (page: number) => void;
  onToggleFollow: (item: UserRelationItem) => void;
  relation: UserRelationKind;
  result: UserRelationListResult | null;
}) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const title = relationTitle(t, relation);
  const page = result?.page || 1;
  const pageCount = result ? Math.max(1, Math.ceil(result.count / result.pageSize)) : 1;
  return (
    <div className="profile-relation-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="profile-relation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-relation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-relation-head">
          <div>
            <h2 id="profile-relation-title">{title}</h2>
            <span>{result ? t('profile.counts.people', {
              count: result.count,
              displayCount: formatNumber(locale, result.count),
            }) : ' '}</span>
          </div>
          <AnimateButton unstyled type="button" aria-label={t('shared.close')} onClick={onClose}>
            <Icon name="x-lg" />
          </AnimateButton>
        </div>
        {loading ? (
          <LoadingState variant="panel" className="profile-relation-loading" />
        ) : null}
        {!loading && !error && result && !result.items.length ? (
          <div className="state-strip">{t(`profile.empty.${relation}`)}</div>
        ) : null}
        <div className="profile-relation-list">
          {result?.items.map((item) => {
            const isSelf = currentUserID && item.id === currentUserID;
            return (
              <article className="profile-relation-item" key={item.id}>
                <Link to={routeProfilePath(item.username || item.id)} onClick={onClose}>
                  <span className="profile-relation-avatar">
                    <AvatarImage src={item.avatar} fallback={<span>{initialsFor(item.displayName || item.username)}</span>} />
                  </span>
                  <span className="profile-relation-copy">
                    <strong>{item.displayName || item.username}</strong>
                    <small>@{item.username}</small>
                    {item.bio ? <p><MathInline text={item.bio} /></p> : null}
                  </span>
                  <CultivationBadge rank={item.rank} />
                </Link>
                {!isSelf ? (
                  <AnimateButton unstyled
                    type="button"
                    className={item.isFollowing ? 'secondary-button' : 'primary-button'}
                    disabled={busyID === item.id}
                    onClick={() => onToggleFollow(item)}
                  >
                    {busyID === item.id ? t('shared.processing') : item.isFollowing ? t('profile.relations.unfollow') : t('profile.relations.follow')}
                  </AnimateButton>
                ) : null}
              </article>
            );
          })}
        </div>
        {result && pageCount > 1 ? (
          <div className="profile-relation-pagination">
            <Button className="secondary-button" type="button" disabled={loading || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
              {t('shared.previous')}
            </Button>
            <span>{t('shared.page', { page: formatNumber(locale, page), pageCount: formatNumber(locale, pageCount) })}</span>
            <Button className="secondary-button" type="button" disabled={loading || page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>
              {t('shared.next')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ProfilePage() {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const { resolved: resolvedTheme } = useTheme();
  const bootstrap = useBootstrap();
  const authAdapter = useAuthAdapter();
  const authSnapshot = useAuthSnapshot();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const username = cleanUserId(decodeURIComponent(params.username || ''));
  const [data, setData] = useState<ProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => normalizeProfileTab(searchParams.get('tab')));
  const [editingProfile, setEditingProfile] = useState(false);
  const [blogs, setBlogs] = useState<FeedItem[]>([]);
  const [books, setBooks] = useState<FeedItem[]>([]);
  const [dynamics, setDynamics] = useState<FeedItem[]>([]);
  const [discussions, setDiscussions] = useState<FeedItem[]>([]);
  const [collections, setCollections] = useState<FeedItem[]>([]);
  const [profileGraph, setProfileGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [profileGraphLoading, setProfileGraphLoading] = useState(false);
  const [profileGraphError, setProfileGraphError] = useState('');
  const [selectedGraphNode, setSelectedGraphNode] = useState<KnowledgeGraphNode | null>(null);
  const [profileGraphInspectorCollapsed, setProfileGraphInspectorCollapsed] = useState(true);
  const [authUser, setAuthUser] = useState<CloudUser | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    userId: '',
    displayName: '',
    avatar: '',
    coverUrl: '',
    bio: '',
    website: '',
    location: '',
    aboutHtml: '',
  });
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutEditorFrame, setAboutEditorFrame] = useState({
    x: 180,
    y: 120,
    width: 760,
    height: 560,
  });
  const aboutEditorRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editError, setEditError] = useState('');
  const [editNotice, setEditNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [followingProfile, setFollowingProfile] = useState(false);
  const [profileFollowCount, setProfileFollowCount] = useState(0);
  const [profileFollowingCount, setProfileFollowingCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  const [relationDialog, setRelationDialog] = useState<RelationDialogState | null>(null);
  const [relationResult, setRelationResult] = useState<UserRelationListResult | null>(null);
  const [relationLoading, setRelationLoading] = useState(false);
  const [relationError, setRelationError] = useState('');
  const [relationFollowBusyID, setRelationFollowBusyID] = useState('');
  const [pendingImageCrop, setPendingImageCrop] = useState<PendingImageCrop | null>(null);
  const [cropUploading, setCropUploading] = useState(false);
  useNoticeToasts({
    editError, editNotice, error, followError, relationError,
  });
  const runtimeAuthUser = useMemo<CloudUser | null>(() => (
    authSnapshot.status === 'authenticated' && authSnapshot.user
      ? {
          id: authSnapshot.user.id,
          username: authSnapshot.user.username,
          user_metadata: {
            nickname: authSnapshot.user.displayName,
            avatarUrl: authSnapshot.user.avatarUrl || '',
          },
        }
      : null
  ), [authSnapshot.status, authSnapshot.user]);

  const isOwnProfile = Boolean(
    data &&
    ((currentUser && (data.user.id === currentUser.id || data.user.username === currentUser.username)) ||
      (authUser && authUser.id && authUser.id === data.user.id)),
  );
  const canSaveProfile = Boolean(
    isOwnProfile &&
    authUser &&
    profileDraft.userId.trim().replace(/^@+/, '').length >= 3 &&
    profileDraft.userId.trim().replace(/^@+/, '').length <= 32 &&
    profileDraft.displayName.trim().length >= 2 &&
    profileDraft.displayName.trim().length <= 24 &&
    profileDraft.bio.trim().length <= 5000 &&
    profileDraft.aboutHtml.length <= 50000 &&
    !savingProfile,
  );

  useEffect(() => {
    setActiveTab(normalizeProfileTab(searchParams.get('tab')));
  }, [searchParams]);

  const switchProfileTab = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'about') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!username) {
      setError(localizedErrorMessage(null, 'identity.profileMissingUsername'));
      setLoading(false);
      return undefined;
    }

    setLoading(true);
      setError('');
      setEditError('');
      setEditNotice('');
      setProfileGraph(null);
      setProfileGraphError('');
      setSelectedGraphNode(null);
      setEditingAbout(false);
    void Promise.all([
      loadPersonalUserInfo(username),
      loadPersonalQATop(username),
      loadAllPersonalQuestionItems(username),
      loadAllPersonalAnswerItems(username),
      loadPersonalCommentPage({ username, page: 1, pageSize: 5 }),
      loadUserBadgeAwards(username),
      loadAllContentFeedItems('blog', username),
      loadAllContentFeedItems('book', username),
      loadAllContentFeedItems('status', username),
      loadAllContentFeedItems('forum', username),
      loadPersonalCollectionPage({ username, page: 1, pageSize: 6 }),
    ])
      .then(async ([user, qaTop, questionItems, answerItems, commentPage, badgePage, blogItems, bookFeedItems, dynamicItems, discussionItems, collectionPage]) => {
        if (cancelled) return;
        setData({
          user,
          qaTop,
          questions: questionItems,
          answers: answerItems,
          comments: commentPage.items,
          badges: badgePage.items,
          collectionCount: collectionPage.count,
        });
        setBlogs(blogItems);
        setBooks(bookFeedItems);
        setDynamics(dynamicItems);
        setDiscussions(discussionItems);
        setCollections(collectionPage.items);
        setFollowingProfile(user.is_follower);
        setProfileFollowCount(user.follow_count);
        setProfileFollowingCount(user.following_count);
        setFollowError('');

        const [nextAuthUser, nextCurrentUser] = await Promise.all([
          bootstrap.config.mode === 'demo'
            ? Promise.resolve(runtimeAuthUser)
            : getCurrentUser().catch(() => null),
          loadCurrentUserInfo().catch(() => null),
        ]);
        if (cancelled) return;
        setAuthUser(nextAuthUser);
        setCurrentUser(nextCurrentUser);
        const ownProfile = Boolean(
          (nextCurrentUser &&
            (nextCurrentUser.id === user.id || nextCurrentUser.username === user.username)) ||
          (nextAuthUser && nextAuthUser.id === user.id),
        );
        if (ownProfile && nextAuthUser) {
          const profile = await loadProfile(nextAuthUser).catch(() => null) as UserProfile | null;
          if (cancelled) return;
          setProfileDraft({
            userId: nextCurrentUser?.username || user.username,
            displayName: profile?.nickname || nextCurrentUser?.display_name || user.display_name || user.username,
            avatar: profile?.avatarDataUrl || nextCurrentUser?.avatar.custom || nextCurrentUser?.avatar.gravatar || user.avatar,
            coverUrl: profile?.coverUrl || nextCurrentUser?.cover_url || user.cover_url || '',
            bio: nextCurrentUser?.bio || user.bio || '',
            website: nextCurrentUser?.website || user.website || '',
            location: nextCurrentUser?.location || user.location || '',
            aboutHtml: profile?.aboutHtml || nextCurrentUser?.about_html || user.about_html || '',
          });
          setAboutDraft(profile?.aboutHtml || nextCurrentUser?.about_html || user.about_html || '');
        } else {
          setProfileDraft({
            userId: '',
            displayName: '',
            avatar: '',
            coverUrl: '',
            bio: '',
            website: '',
            location: '',
            aboutHtml: '',
          });
          setAboutDraft(user.about_html || '');
        }
      })
      .catch((profileError) => {
        if (!cancelled) setError(localizedErrorMessage(profileError, 'identity.profileLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      };
  }, [bootstrap.config.mode, runtimeAuthUser, username]);

  useEffect(() => {
    if (activeTab !== 'graph' || !username || profileGraph) {
      return undefined;
    }
    let cancelled = false;
    setProfileGraphLoading(true);
    setProfileGraphError('');
    void loadKnowledgeGraph({ username, tagLimit: 32, contentLimit: 80 })
      .then((graph) => {
        if (cancelled) return;
        setProfileGraph(graph);
        setSelectedGraphNode(graph.nodes[0] || null);
      })
      .catch((graphError) => {
        if (!cancelled) setProfileGraphError(localizedErrorMessage(graphError, 'identity.profileGraphLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setProfileGraphLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, profileGraph, username]);

  useEffect(() => {
    if (!relationDialog || !data) return undefined;
    let cancelled = false;
    setRelationLoading(true);
    setRelationError('');
    void loadUserRelations({
      username: data.user.username || username,
      relation: relationDialog.relation,
      page: relationDialog.page,
      pageSize: 20,
    })
      .then((result) => {
        if (!cancelled) setRelationResult(result);
      })
      .catch((relationLoadError) => {
        if (!cancelled) {
          setRelationResult(null);
          setRelationError(localizedErrorMessage(relationLoadError, 'identity.profileRelationsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setRelationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, relationDialog, username]);

  useEffect(() => () => {
    if (pendingImageCrop) URL.revokeObjectURL(pendingImageCrop.imageUrl);
  }, [pendingImageCrop]);

  const changeDraft = (key: keyof ProfileDraft, value: string) => {
    setProfileDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const openImageCrop = (event: ChangeEvent<HTMLInputElement>, kind: PendingImageCrop['kind']) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !authUser) return;
    setEditError('');
    setEditNotice('');
    if (!file.type.startsWith('image/')) {
      setEditError(localizedErrorMessage(null, 'identity.profileImageRequired'));
      return;
    }
    if (pendingImageCrop) URL.revokeObjectURL(pendingImageCrop.imageUrl);
    setPendingImageCrop({
      kind,
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || (kind === 'avatar' ? 'avatar.jpg' : 'cover.jpg'),
    });
  };

  const changeAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    openImageCrop(event, 'avatar');
  };

  const changeCover = (event: ChangeEvent<HTMLInputElement>) => {
    openImageCrop(event, 'cover');
  };

  const closeImageCrop = () => {
    if (cropUploading) return;
    if (pendingImageCrop) URL.revokeObjectURL(pendingImageCrop.imageUrl);
    setPendingImageCrop(null);
  };

  const uploadCroppedImage = async (file: File) => {
    if (!authUser || !pendingImageCrop) return;
    const cropKind = pendingImageCrop.kind;
    setCropUploading(true);
    setEditError('');
    setEditNotice(cropKind === 'avatar' ? t('profile.notices.uploadingAvatar') : t('profile.notices.uploadingCover'));
    try {
      const uploaded = cropKind === 'avatar'
        ? bootstrap.config.mode === 'demo'
          ? await bootstrap.ports.uploads.upload({ name: file.name, type: file.type, bytes: file })
              .then(({ url }) => ({ fileID: url }))
          : await uploadAvatarFile(authUser, file)
        : bootstrap.config.mode === 'demo'
          ? await bootstrap.ports.uploads.upload({ name: file.name, type: file.type, bytes: file })
              .then(({ url }) => ({ fileID: url }))
          : await uploadCoverFile(authUser, file);
      changeDraft(cropKind === 'avatar' ? 'avatar' : 'coverUrl', uploaded.fileID);
      setEditNotice(cropKind === 'avatar' ? t('profile.notices.avatarUploaded') : t('profile.notices.coverUploaded'));
      if (pendingImageCrop) URL.revokeObjectURL(pendingImageCrop.imageUrl);
      setPendingImageCrop(null);
    } catch (uploadError) {
      setEditError(localizedErrorMessage(uploadError, 'identity.profileUploadFailed'));
      setEditNotice('');
    } finally {
      setCropUploading(false);
    }
  };

  const openRelationDialog = (relation: UserRelationKind) => {
    setRelationDialog({ relation, page: 1 });
    setRelationResult(null);
    setRelationError('');
  };

  const closeRelationDialog = () => {
    setRelationDialog(null);
    setRelationResult(null);
    setRelationError('');
    setRelationFollowBusyID('');
  };

  const changeRelationPage = (page: number) => {
    setRelationDialog((current) => current ? { ...current, page } : current);
  };

  const saveIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authUser || !data) return;
    setSavingProfile(true);
    setEditError('');
    setEditNotice('');
    try {
      const nickname = profileDraft.displayName.trim();
      await saveProfile(authUser, {
        username: profileDraft.userId,
        nickname,
        avatarDataUrl: profileDraft.avatar,
        coverUrl: profileDraft.coverUrl,
        bio: profileDraft.bio,
        website: profileDraft.website,
        location: profileDraft.location,
        aboutHtml: profileDraft.aboutHtml,
      }, { syncCloudBase: bootstrap.config.mode !== 'demo' });
      const nextUser = await updateCurrentUserInfo({
        displayName: nickname,
        username: profileDraft.userId,
        avatar: { type: 'custom', custom: profileDraft.avatar },
        coverUrl: profileDraft.coverUrl,
        bio: profileDraft.bio,
        website: profileDraft.website,
        location: profileDraft.location,
        aboutHtml: profileDraft.aboutHtml,
      });
      setCurrentUser(nextUser);
      authAdapter.updateProfile?.({
        username: nextUser.username,
        publicUserId: nextUser.username,
        displayName: nextUser.display_name,
        avatarUrl: nextUser.avatar.custom || nextUser.avatar.gravatar || null,
      });
      setProfileDraft((current) => ({ ...current, userId: nextUser.username }));
      setData((current) => current ? {
        ...current,
        user: {
          ...current.user,
          display_name: nextUser.display_name,
          username: nextUser.username,
          avatar: nextUser.avatar.custom || nextUser.avatar.gravatar,
          cover_url: nextUser.cover_url,
          bio: nextUser.bio,
          website: nextUser.website,
          location: nextUser.location,
          about_html: nextUser.about_html,
        },
      } : current);
      setEditNotice(t('profile.notices.saved'));
      setEditingProfile(false);
      const nextPath = routeProfilePath(nextUser.username);
      if (nextUser.username && nextUser.username !== username) {
        navigate(nextPath, { replace: true });
      }
    } catch (saveError) {
      setEditError(localizedErrorMessage(saveError, 'identity.profileSaveFailed'));
    } finally {
      setSavingProfile(false);
    }
  };

  const openAboutEditor = () => {
    if (!data || !isOwnProfile) return;
    const width = Math.min(820, Math.max(360, window.innerWidth - 32));
    const height = Math.min(620, Math.max(420, window.innerHeight - 32));
    setAboutEditorFrame({
      x: Math.max(12, Math.round((window.innerWidth - width) / 2)),
      y: Math.max(12, Math.round((window.innerHeight - height) / 2)),
      width,
      height,
    });
    setAboutDraft(data.user.about_html || '');
    setEditingAbout(true);
    setEditError('');
    setEditNotice('');
  };

  const cancelAboutEditor = () => {
    if (aboutSaving) return;
    setAboutDraft(data?.user.about_html || '');
    setEditingAbout(false);
  };

  const saveAbout = async () => {
    if (!data || !authUser || !isOwnProfile) return;
    setAboutSaving(true);
    setEditError('');
    setEditNotice('');
    try {
      const nextAbout = aboutDraft.slice(0, 50000);
      const nextUser = await updateCurrentUserInfo({
        displayName: data.user.display_name,
        username: data.user.username,
        avatar: { type: 'custom', custom: data.user.avatar },
        coverUrl: data.user.cover_url,
        bio: data.user.bio,
        website: data.user.website,
        location: data.user.location,
        aboutHtml: nextAbout,
      });
      setCurrentUser(nextUser);
      setProfileDraft((current) => ({
        ...current,
        aboutHtml: nextUser.about_html,
      }));
      setData((current) => current ? {
        ...current,
        user: {
          ...current.user,
          about_html: nextUser.about_html,
        },
      } : current);
      setAboutDraft(nextUser.about_html);
      setEditingAbout(false);
      setEditNotice(t('profile.notices.aboutSaved'));
    } catch (aboutError) {
      setEditError(localizedErrorMessage(aboutError, 'identity.profileAboutSaveFailed'));
    } finally {
      setAboutSaving(false);
    }
  };

  const dragAboutEditor = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = aboutEditorRef.current?.getBoundingClientRect();
    const startFrame = rect
      ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      : aboutEditorFrame;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const maxX = Math.max(12, window.innerWidth - 120);
      const maxY = Math.max(12, window.innerHeight - 80);
      setAboutEditorFrame({
        ...startFrame,
        x: Math.min(maxX, Math.max(12, startFrame.x + moveEvent.clientX - startX)),
        y: Math.min(maxY, Math.max(12, startFrame.y + moveEvent.clientY - startY)),
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const toggleUserFollow = async () => {
    if (!data || isOwnProfile) return;
    if (!authUser && !currentUser) {
      setFollowError(localizedErrorMessage(null, 'identity.profileFollowSignInRequired'));
      return;
    }
    setFollowBusy(true);
    setFollowError('');
    try {
      const result = await followTarget({
        targetType: 'user',
        targetId: data.user.id,
        isCancel: followingProfile,
      });
      setFollowingProfile(result.following);
      setProfileFollowCount(result.followerCount);
      setData((current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                follow_count: result.followerCount,
                is_follower: result.following,
              },
            }
          : current,
      );
    } catch (followToggleError) {
      setFollowError(localizedErrorMessage(followToggleError, 'identity.profileFollowFailed'));
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleRelationFollow = async (item: UserRelationItem) => {
    if (!authUser && !currentUser) {
      setRelationError(localizedErrorMessage(null, 'identity.profileFollowSignInRequired'));
      return;
    }
    setRelationFollowBusyID(item.id);
    setRelationError('');
    try {
      const result = await followTarget({
        targetType: 'user',
        targetId: item.id,
        isCancel: item.isFollowing,
      });
      setRelationResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((candidate) =>
                candidate.id === item.id
                  ? { ...candidate, isFollowing: result.following }
                  : candidate,
              ),
            }
          : current,
      );
      if (data && item.id === data.user.id) {
        setFollowingProfile(result.following);
        setProfileFollowCount(result.followerCount);
      }
      if (currentUser && relationDialog?.relation === 'following' && data && data.user.id === currentUser.id) {
        setProfileFollowingCount((count) => Math.max(0, count + (result.following ? 1 : -1)));
      }
    } catch (relationToggleError) {
      setRelationError(localizedErrorMessage(relationToggleError, 'identity.profileFollowFailed'));
    } finally {
      setRelationFollowBusyID('');
    }
  };

  const title = useMemo(() => {
    if (data?.user.display_name) return t('profile.documentTitleNamed', { name: data.user.display_name });
    return t('profile.documentTitle');
  }, [data?.user.display_name, t]);

  const blogTitle = useMemo(() => t('profile.namedBlogs', {
    name: data?.user.display_name || t('profile.memberFallback'),
  }), [data?.user.display_name, t]);
  const bookTitle = useMemo(() => t('profile.namedBooks', {
    name: data?.user.display_name || t('profile.memberFallback'),
  }), [data?.user.display_name, t]);

  const blogItems = useMemo(() => blogs.filter((item) => item.type === 'blog'), [blogs]);
  const bookItems = useMemo(() => books.filter((item) => item.type === 'book' && isOriginalStyleBook(item)), [books]);
  const dynamicItems = useMemo(() => dynamics.filter((item) => item.type === 'dynamic' || item.type === 'status'), [dynamics]);
  const discussionItems = useMemo(() => discussions.filter((item) => item.type === 'discussion' || item.type === 'forum'), [discussions]);
  const collectionItems = useMemo(() => collections, [collections]);
  const qaItems = useMemo(() => ({
    questions: data?.questions || [],
    answers: data?.answers || [],
    comments: data?.comments || [],
  }), [data?.answers, data?.comments, data?.questions]);
  const timelineItems = useMemo<ProfileTimelineItem[]>(() => {
    const contentItems = [...blogItems, ...discussionItems, ...dynamicItems].map((item) => {
      const type = profileTimelineType(item);
      return {
        key: `${item.type}-${item.id}`,
        type,
        label: profileTimelineLabel(t, type),
        title: item.title,
        excerpt: item.excerpt,
        path: contentPath(item.type, item.id, item.title),
        timestamp: feedItemTime(item),
        meta: profileTimelineMeta(t, locale, item, type),
      };
    });
    const questionItems = qaItems.questions.map((item) => ({
      key: `question-${item.question_id || item.id}`,
      type: 'question' as const,
      label: profileTimelineLabel(t, 'question'),
      title: item.title,
      excerpt: item.description,
      path: questionPath(item),
      timestamp: item.created_at * 1000,
      meta: `${profileCountLabel(t, locale, 'answers', item.answer_count)} · ${profileCountLabel(t, locale, 'votes', item.vote_count)}`,
    }));
    const answerItems = qaItems.answers.map((item) => ({
      key: `answer-${item.answer_id}`,
      type: 'answer' as const,
      label: profileTimelineLabel(t, 'answer'),
      title: item.question_info.title,
      excerpt: item.question_info.tags.map((tag) => tag.displayName || tag.name).filter(Boolean).join(' / '),
      path: answerQuestionPath(item),
      timestamp: item.create_time * 1000,
      meta: `${profileCountLabel(t, locale, 'votes', item.vote_count)}${item.accepted === 2 ? ` · ${t('profile.accepted')}` : ''}`,
    }));
    return [...contentItems, ...questionItems, ...answerItems].sort(
      (left, right) => right.timestamp - left.timestamp,
    );
  }, [blogItems, discussionItems, dynamicItems, locale, qaItems.answers, qaItems.questions, t]);
  const aboutPreviewHTML = editingAbout ? aboutDraft : data?.user.about_html || '';

  return (
    <>
      <Helmet title={title} />
      <SiteTopbar />

      <main className="profile-shell">
        {loading ? (
          <LoadingState variant="panel" />
        ) : null}

        {data ? (
          <>
            <Form className="profile-inline-form" onSubmit={saveIdentity}>
              <section className={`profile-cover-card${editingProfile ? ' editing' : ''}`}>
                <div className="profile-cover-art">
                  <img src={(editingProfile ? profileDraft.coverUrl : data.user.cover_url) || defaultCoverUrl()} alt="" />
                  <span>{editingProfile ? profileDraft.userId || data.user.username : data.user.username}</span>
                  {isOwnProfile && editingProfile ? (
                    <Form.Label className="cover-upload-button" title={t('profile.edit.uploadCover')}>
                      <Icon name="image" />
                      <span>{t('profile.edit.changeCover')}</span>
                      <Form.Control type="file" accept="image/*" onChange={changeCover} />
                    </Form.Label>
                  ) : null}
                </div>
                <div className="profile-identity-bar">
                  <div className="profile-avatar" role="img" aria-label={t('profile.avatarLabel', { name: data.user.display_name || data.user.username || 'Rinspace' })}>
                    <AvatarImage
                      src={editingProfile ? profileDraft.avatar : data.user.avatar}
                      fallback={<span>{initialsFor((editingProfile ? profileDraft.displayName : data.user.display_name) || data.user.username)}</span>}
                    />
                    {isOwnProfile && editingProfile ? (
                      <Form.Label className="avatar-upload-button" title={t('profile.edit.uploadAvatar')}>
                        <Icon name="camera" />
                        <Form.Control type="file" accept="image/*" onChange={changeAvatar} />
                      </Form.Label>
                    ) : null}
                  </div>
                  <div className="profile-masthead-copy">
                    {editingProfile ? (
                      <div className="profile-inline-fields">
                        <Form.Group controlId="profile-display-name">
                          <Form.Label>{t('profile.edit.displayName')}</Form.Label>
                          <Form.Control
                            value={profileDraft.displayName}
                            maxLength={24}
                            onChange={(event) => changeDraft('displayName', event.currentTarget.value)}
                          />
                        </Form.Group>
                        <Form.Group controlId="profile-user-id">
                          <Form.Label>User ID</Form.Label>
                          <Form.Control
                            value={profileDraft.userId}
                            maxLength={33}
                            placeholder="@user-id"
                            onChange={(event) => changeDraft('userId', event.currentTarget.value)}
                          />
                        </Form.Group>
                        <Form.Group controlId="profile-bio">
                          <Form.Label>{t('profile.edit.bio')}</Form.Label>
                          <CodeMirrorEditor
                            id="profile-bio"
                            value={profileDraft.bio}
                            minHeight="108px"
                            ariaLabel={t('profile.edit.bioLabel')}
                            onChange={(value) => changeDraft('bio', value)}
                          />
                        </Form.Group>
                        <div className="profile-editor-two">
                          <Form.Group controlId="profile-website">
                            <Form.Label>{t('profile.edit.website')}</Form.Label>
                            <Form.Control
                              value={profileDraft.website}
                              maxLength={160}
                              placeholder="https://..."
                              onChange={(event) => changeDraft('website', event.currentTarget.value)}
                            />
                          </Form.Group>
                          <Form.Group controlId="profile-location">
                            <Form.Label>{t('profile.edit.field')}</Form.Label>
                            <Form.Control
                              value={profileDraft.location}
                              maxLength={80}
                              onChange={(event) => changeDraft('location', event.currentTarget.value)}
                            />
                          </Form.Group>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="profile-title-row">
                          <h1>{data.user.display_name}</h1>
                          <Link
                            className="profile-cultivation-link"
                            to={profileRankPath(data.user.username)}
                            aria-label={t('profile.viewCultivation')}
                            title={t('profile.viewCultivation')}
                          >
                            <CultivationBadge rank={data.user.rank} />
                          </Link>
                        </div>
                        <p>@{data.user.username}</p>
                        {data.user.bio ? (
                          <MathText text={data.user.bio} />
                        ) : (
                          <p>{t('profile.empty.bio')}</p>
                        )}
                        <div className="profile-meta-row">
                          {data.user.location ? <span>{data.user.location}</span> : null}
                          {data.user.website ? (
                            <ProfileWebsiteLink
                              key={data.user.website}
                              value={data.user.website}
                            />
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="profile-action-stack">
                    {isOwnProfile ? (
                      <div className="profile-edit-actions">
                        <Button
                          className="secondary-link profile-edit-toggle"
                          type="button"
                          onClick={() => setEditingProfile((current) => !current)}
                        >
                          <Icon name="pencil-square" />
                          {editingProfile ? t('profile.edit.cancelEdit') : t('profile.edit.editProfile')}
                        </Button>
                        {editingProfile ? (
                          <Button className="primary-button profile-save-button" type="submit" disabled={!canSaveProfile}>
                            {savingProfile ? t('shared.saving') : t('shared.save')}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {!isOwnProfile && !editingProfile ? (
                      <Button
                        className={`profile-follow-button ${followingProfile ? 'secondary-button' : 'primary-button'}`}
                        type="button"
                        disabled={followBusy}
                        onClick={toggleUserFollow}
                      >
                        {followBusy
                          ? t('shared.processing')
                          : followingProfile
                            ? t('profile.relations.unfollow')
                            : t('profile.relations.follow')}
                      </Button>
                    ) : null}
                    {!editingProfile ? (
                      <div className="profile-relation-stats" aria-label={t('profile.relations.label')}>
                        <AnimateButton unstyled
                          type="button"
                          className="profile-relation-stat"
                          title={t('profile.relations.followingCount', { displayCount: compactCount(locale, profileFollowingCount) })}
                          onClick={() => openRelationDialog('following')}
                        >
                          <span>{compactCount(locale, profileFollowingCount)}</span>
                          <strong>{t('profile.relations.following')}</strong>
                        </AnimateButton>
                        <AnimateButton unstyled
                          type="button"
                          className="profile-relation-stat"
                          title={t('profile.relations.followerCount', { displayCount: compactCount(locale, profileFollowCount) })}
                          onClick={() => openRelationDialog('followers')}
                        >
                          <span>{compactCount(locale, profileFollowCount)}</span>
                          <strong>{t('profile.relations.followers')}</strong>
                        </AnimateButton>
                      </div>
                    ) : null}
                    {editingProfile ? <span className="profile-edit-count">{profileDraft.bio.trim().length} / 5000</span> : null}
                  </div>
                </div>
              </section>
            </Form>

            {pendingImageCrop ? (
              <ImageCropDialog
                open
                imageUrl={pendingImageCrop.imageUrl}
                title={pendingImageCrop.kind === 'avatar' ? t('profile.edit.cropAvatar') : t('profile.edit.cropCover')}
                aspect={pendingImageCrop.kind === 'avatar' ? 1 : 16 / 5}
                cropShape={pendingImageCrop.kind === 'avatar' ? 'round' : 'rect'}
                outputWidth={pendingImageCrop.kind === 'avatar' ? 512 : 1600}
                outputHeight={pendingImageCrop.kind === 'avatar' ? 512 : 500}
                outputFileName={pendingImageCrop.fileName}
                busy={cropUploading}
                onCancel={closeImageCrop}
                onConfirm={uploadCroppedImage}
              />
            ) : null}

            {relationDialog ? (
              <RelationDialog
                busyID={relationFollowBusyID}
                currentUserID={currentUser?.id || authUser?.id || ''}
                error={relationError}
                loading={relationLoading}
                relation={relationDialog.relation}
                result={relationResult}
                onClose={closeRelationDialog}
                onPageChange={changeRelationPage}
                onToggleFollow={toggleRelationFollow}
              />
            ) : null}

            {editingAbout ? (
              <div className="profile-about-editor-layer" role="presentation">
                <div
                  className="profile-about-editor-dialog"
                  ref={aboutEditorRef}
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="profile-about-editor-title"
                  style={{
                    left: aboutEditorFrame.x,
                    top: aboutEditorFrame.y,
                    width: aboutEditorFrame.width,
                    height: aboutEditorFrame.height,
                  }}
                >
                  <div className="profile-about-editor-head" onPointerDown={dragAboutEditor}>
                    <h2 id="profile-about-editor-title">{t('profile.edit.about')}</h2>
                    <AnimateButton unstyled type="button" className="icon-button" aria-label={t('shared.close')} onClick={cancelAboutEditor}>
                      <Icon name="x-lg" />
                    </AnimateButton>
                  </div>
                  <div className="profile-about-editor-body">
                    <CodeMirrorEditor
                      id="profile-about-html"
                      value={aboutDraft}
                      minHeight="320px"
                      ariaLabel={t('profile.edit.aboutHtml')}
                      placeholder="<section><h1>Hello Rinspace</h1></section>"
                      onChange={setAboutDraft}
                    />
                  </div>
                  <div className="profile-about-editor-foot">
                    <span>{aboutDraft.length} / 50000</span>
                    <Button className="secondary-button" type="button" disabled={aboutSaving} onClick={cancelAboutEditor}>
                      {t('shared.cancel')}
                    </Button>
                    <Button className="primary-button" type="button" disabled={aboutSaving || aboutDraft.length > 50000} onClick={saveAbout}>
                      {aboutSaving ? t('shared.saving') : t('shared.save')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="profile-content-layout">
              <div className="profile-main-column">
                <AnimateTabs value={activeTab} onValueChange={(value) => switchProfileTab(value as ProfileTab)}>
                  <AnimateTabsList className="profile-tabs" aria-label={t('profile.tabsLabel')}>
                    {profileTabs.map((tab) => (
                      <AnimateTabsTrigger key={tab} value={tab}>
                        <span>{profileTabLabel(t, tab)}</span>
                        <strong>
                          {tab === 'about'
                            ? data.user.about_html ? 1 : 0
                            : tab === 'overview'
                            ? timelineItems.length
                            : tab === 'blog'
                            ? blogItems.length
                            : tab === 'book'
                              ? bookItems.length
                            : tab === 'qa'
                              ? qaItems.questions.length + qaItems.answers.length
                              : tab === 'discussion'
                                ? discussionItems.length
                                : tab === 'dynamic'
                                  ? dynamicItems.length
                            : tab === 'collection'
                                    ? data.collectionCount
                                    : profileGraph?.nodes.length || 0}
                        </strong>
                      </AnimateTabsTrigger>
                    ))}
                  </AnimateTabsList>
                </AnimateTabs>

                <section className="panel profile-tab-panel">
                  {activeTab === 'about' ? (
                    <>
                      <div className="panel-heading profile-about-heading">
                        <span>{t('profile.tabs.about')}</span>
                        {isOwnProfile ? (
                          <Button className="secondary-button profile-about-edit-button" type="button" onClick={openAboutEditor}>
                            <Icon name="pencil-square" />
                            {t('shared.edit')}
                          </Button>
                        ) : null}
                      </div>
                      <div className="profile-about-frame-wrap">
                        <iframe
                          title={t('profile.aboutFrameTitle', { name: data.user.display_name || data.user.username })}
                          className="profile-about-frame"
                          sandbox=""
                          referrerPolicy="no-referrer"
                          srcDoc={profileAboutSrcDoc(aboutPreviewHTML, resolvedTheme === 'dark', t('profile.empty.about'))}
                        />
                      </div>
                    </>
                  ) : null}

                  {activeTab === 'overview' ? (
                    <>
                      <div className="panel-heading">
                        <span>{t('profile.tabs.overview')}</span>
                        <strong>{timelineItems.length}</strong>
                      </div>
                      <TimelineList items={timelineItems} />
                    </>
                  ) : null}

                  {activeTab === 'blog' ? (
                    <>
                      <div className="panel-heading">
                        <span>{blogTitle}</span>
                        <strong>{blogItems.length}</strong>
                      </div>
                      <BlogList items={blogItems} />
                    </>
                  ) : null}

                  {activeTab === 'book' ? (
                    <>
                      <div className="panel-heading">
                        <span>{bookTitle}</span>
                        <strong>{bookItems.length}</strong>
                      </div>
                      <BookList items={bookItems} />
                    </>
                  ) : null}

                  {activeTab === 'qa' ? (
                    <>
                      <div className="panel-heading">
                        <span>{t('profile.tabs.qa')}</span>
                        <strong>{qaItems.questions.length + qaItems.answers.length}</strong>
                      </div>
                      <div className="profile-qa-grid">
                        <article>
                          <div className="profile-subheading">{t('profile.timeline.types.question')}</div>
                          <QuestionList items={qaItems.questions} />
                        </article>
                        <article>
                          <div className="profile-subheading">{t('profile.timeline.types.answer')}</div>
                          <AnswerList items={qaItems.answers} />
                        </article>
                      </div>
                    </>
                  ) : null}

                  {activeTab === 'discussion' ? (
                    <>
                      <div className="panel-heading">
                        <span>{t('profile.tabs.discussion')}</span>
                        <strong>{discussionItems.length}</strong>
                      </div>
                      <DiscussionList items={discussionItems} />
                    </>
                  ) : null}

                  {activeTab === 'dynamic' ? (
                    <>
                      <div className="panel-heading">
                        <span>{t('profile.tabs.dynamic')}</span>
                        <strong>{dynamicItems.length}</strong>
                      </div>
                      <DynamicList items={dynamicItems} />
                    </>
                  ) : null}

                  {activeTab === 'collection' ? (
                    <>
                      <div className="panel-heading">
                        <span>{isOwnProfile ? t('profile.collectionManage') : t('profile.recentCollections')}</span>
                        <strong>{data.collectionCount}</strong>
                      </div>
                      {isOwnProfile ? (
                        <CollectionFolderWorkspace
                          username={username}
                          active={activeTab === 'collection' && isOwnProfile}
                        />
                      ) : (
                        <CollectionList items={collections} />
                      )}
                    </>
                  ) : null}

                  {activeTab === 'graph' ? (
                    <>
                      <div className="panel-heading">
                        <span>{t('profile.tabs.graph')}</span>
                        <strong>
                          {profileGraph
                            ? `${profileGraph.nodes.length} / ${profileGraph.edges.length}`
                            : profileGraphLoading
                              ? t('shared.syncing')
                              : '0 / 0'}
                        </strong>
                      </div>
                      <div className={`profile-graph-grid${profileGraphInspectorCollapsed ? ' inspector-collapsed' : ''}`}>
                        <ProfileGraphPanel
                          graph={profileGraph}
                          loading={profileGraphLoading}
                          error={profileGraphError}
                          selectedNode={selectedGraphNode}
                          onSelectNode={setSelectedGraphNode}
                        />
                        <ProfileGraphInspector
                          graph={profileGraph}
                          selectedNode={selectedGraphNode}
                          collapsed={profileGraphInspectorCollapsed}
                          onToggle={() => setProfileGraphInspectorCollapsed((current) => !current)}
                        />
                      </div>
                    </>
                  ) : null}
                </section>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}

export default ProfilePage;

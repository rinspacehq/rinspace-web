import { AnimateGithubStars, AnimateTabs, AnimateTabsList, AnimateTabsTrigger, Icon, UserPresenceAvatar, type UserPresenceAvatarItem, useNoticeToasts } from 'components/ui';
import { publicEnv } from '@/app/config/env';
import type { TFunction } from 'i18next';
import {
  type PointerEvent,
  type WheelEvent as ReactWheelEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Container, Form } from '@/components/ui/compat';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import AvatarImage from '@/components/AvatarImage';
import AvatarName from '@/components/AvatarName';
import CultivationBadge from '@/components/CultivationBadge';
import DocumentMetadataController from '@/components/DocumentMetadataController';
import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';
import UserIdentity from '@/components/UserIdentity';
import { getCurrentAuthUser, type RinspaceUser } from '@/services/phoneAuth';
import { messageFromError } from '@/services/errors';
import { formatDate, formatList, formatNumber } from '@/i18n/format';
import {
  feedPresentationMetrics,
  type FeedPresentationMetric,
} from '@/i18n/feedPresentation';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { LocaleId } from '@/i18n/types';
import { emptyHomeFeed, fallbackHomeFeed, loadHomeFeed, loadHomeSidebar, loadKnowledgeGraph, queryReactions, readCachedHomeFeed, updateReaction } from '@/services/domains/activity';
import { loadBookFeed } from '@/services/domains/book';
import { followTarget, likePost, recordContentShare, switchCollection } from '@/services/domains/discussion';
import { loadPersonalCollectionPage, loadPersonalUserInfo } from '@/services/domains/identity';
import { loadFollowingTags, loadTagActivity } from '@/services/domains/tag';
import { loadRinspaceOpenSourceStars } from '@/services/githubStars';
import { loadSponsorSupporters, type SponsorSupporter } from '@/services/sponsor';
import type { CompactItem, CollectionFolder, ContentType, FeedItem, FollowingTag, HomeFeed, HomeFeedMode, HomeSidebar, KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphResponse, PublishContentType, ReactionItem } from '@/services/contracts';
import {
  contentPath,
  profilePath as routeProfilePath,
  tagReadOrLegacyPath,
} from '@/utils/routes';
import { contentTypeMetaChar } from '@/utils/contentTypeMeta';
import { requestAuthDialog } from '@/utils/authDialog';
import { subscribeToMediaQuery } from '@/utils/mediaQuery';
import { useRinPageContext } from '@/utils/rinPageContext';
import {
  BookRatingDialog,
  CardActionButton,
  CardExactTime,
  ContentCommentDialog,
  type HomeCommentViewer,
} from '@/features/home/HomeCommunityContentCards';
import {
  homeOriginalBookFormat,
  isHomeOriginalBook,
} from '@/features/home/homeBookScope';

const CollectionFolderDialog = lazy(() => import('@/components/CollectionFolderDialog'));

type SidebarTag = {
  tagId: string;
  slugName: string;
  displayName: string;
};

type HomeTagItem = NonNullable<FeedItem['tagItems']>[number];

type HomeTagLink = {
  key: string;
  label: string;
  path: string;
};

type FeedMode = HomeFeedMode;
type CommunityView = 'stream' | 'tags' | 'books' | 'graph';
type BookMode = 'hot' | 'latest' | 'following' | 'shelf';
type SocialTargetType = Exclude<ContentType, 'task' | 'tag'>;
type SocialApiTargetType = Exclude<PublishContentType, 'announcement' | 'book'> | 'post';
type DynamicReactionState = {
  count: number;
  isActive: boolean;
};

const feedModes: readonly FeedMode[] = ['hot', 'latest', 'following'];

function normalizeFeedMode(value: string | null) {
  return feedModes.find((mode) => mode === value) ?? 'hot';
}

const bookModes: readonly BookMode[] = ['hot', 'latest', 'following', 'shelf'];

function normalizeBookMode(value: string | null) {
  return bookModes.find((mode) => mode === value) ?? 'hot';
}

const communityViews: readonly CommunityView[] = ['stream', 'tags', 'books', 'graph'];

function normalizeCommunityView(value: string | null) {
  const matched = communityViews.find((view) => view === value);
  if (matched) return matched;
  return 'stream';
}

const cardNavigationInteractiveSelector = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[role="button"]',
  '[contenteditable="true"]',
  '.inline-comment-form',
  '.home-book-review-form',
  '.cm-editor',
].join(', ');

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return !(target instanceof Element) || Boolean(target.closest(cardNavigationInteractiveSelector));
}

function shortInitialsFor(name: string) {
  const letters = Array.from(name.trim().replace(/\s+/g, ''));
  return letters.slice(0, 1).join('').toUpperCase() || 'R';
}

function sponsorIdentityKey(supporter: SponsorSupporter) {
  return supporter.userId.trim() || supporter.uid.trim();
}

function uniqueSponsorAvatars(supporters: SponsorSupporter[], limit = 6): UserPresenceAvatarItem[] {
  const seen = new Set<string>();
  const avatars: UserPresenceAvatarItem[] = [];
  for (const supporter of supporters) {
    const id = sponsorIdentityKey(supporter);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    avatars.push({
      id,
      name: supporter.nickname.trim() || id,
      imageUrl: supporter.avatarUrl,
      profilePath: routeProfilePath(id),
    });
    if (avatars.length >= limit) break;
  }
  return avatars;
}

function orderedStream(feed: HomeFeed) {
  return feed.stream;
}

function distributeItemsAcrossColumns<T>(items: T[], columnCount: number) {
  if (columnCount <= 1) {
    return [items];
  }
  const columns = Array.from({ length: columnCount }, () => [] as T[]);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function useMediaQuery(query: string) {
  const getMatches = useCallback(
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
    [query],
  );
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const media = window.matchMedia(query);
    const updateMatches = () => setMatches(media.matches);
    updateMatches();
    return subscribeToMediaQuery(media, updateMatches);
  }, [query]);

  return matches;
}

function tagLabelFromItem(tag: HomeTagItem) {
  return tag.displayName || tag.slugName || tag.tagId || 'tag';
}

function tagLinkFromItem(tag: HomeTagItem): HomeTagLink {
  const label = tagLabelFromItem(tag);
  const slugOrTitle = tag.slugName || label;
  const idOrSlug = tag.tagId || slugOrTitle;
  return {
    key: tag.tagId || tag.slugName || label,
    label,
    path: tagReadOrLegacyPath(idOrSlug, slugOrTitle),
  };
}

function tagsFor(
  item: Pick<FeedItem | CompactItem, 'tags' | 'tagItems'>,
): HomeTagLink[] {
  const tagItems = item.tagItems || [];
  if (tagItems.length) {
    return tagItems.map(tagLinkFromItem);
  }
  return (item.tags || []).map((tag) => ({
    key: tag,
    label: tag,
    path: tagReadOrLegacyPath(tag, tag),
  }));
}

function displayTypeClass(type: ContentType) {
  if (type === 'forum') return 'discussion';
  if (type === 'status') return 'dynamic';
  return type;
}

function graphContentType(type: string | undefined): ContentType {
  if (type === 'blog' || type === 'question' || type === 'discussion' || type === 'announcement' || type === 'dynamic' || type === 'book' || type === 'forum' || type === 'status' || type === 'task' || type === 'tag') {
    return type;
  }
  return 'question';
}

function contentTypeLabel(type: ContentType, t: TFunction<'discovery'>) {
  return t(`contentTypes.${type}`, { defaultValue: t('contentTypes.content') });
}

function graphContentLabel(node: KnowledgeGraphNode, t: TFunction<'discovery'>) {
  if (node.kind === 'tag') return t('contentTypes.tag');
  return contentTypeLabel(graphContentType(node.type), t);
}

type HomeMetric = FeedPresentationMetric | Readonly<{
  kind: 'lastReply';
  date: Date;
}> | Readonly<{
  kind: 'questionState';
  state: 'accepted' | 'waiting' | 'open';
}>;

function metricToneClass(type: ContentType, metric: HomeMetric | 'bookScore') {
  const displayType = displayTypeClass(type);
  if (metric === 'bookScore') {
    return 'stream-metric-book-score';
  }
  if (displayType === 'blog' && (metric.kind === 'read' || metric.kind === 'favorite')) {
    return 'stream-metric-primary';
  }
  if (displayType === 'question' && ['vote', 'answer'].includes(metric.kind)) {
    return 'stream-metric-primary';
  }
  if (displayType === 'discussion' && metric.kind === 'reply') {
    return 'stream-metric-primary';
  }
  if (displayType === 'dynamic' && metric.kind === 'like') {
    return 'stream-metric-primary';
  }
  return '';
}

function structuredReplyCount(item: FeedItem | CompactItem) {
  if (typeof item.replyCount === 'number') return item.replyCount;
  if (typeof item.commentCount === 'number') return item.commentCount;
  return null;
}

function lastReplyMetricFor(item: FeedItem | CompactItem): HomeMetric | null {
  const replyCount = structuredReplyCount(item);
  if (replyCount !== null && replyCount <= 0) return null;
  if (!item.lastReplyAt) return null;
  const date = new Date(item.lastReplyAt);
  if (Number.isNaN(date.getTime())) return null;
  return { kind: 'lastReply', date };
}

function metricsForItem(item: FeedItem | CompactItem) {
  const displayType = displayTypeClass(item.type);
  const metrics: HomeMetric[] = [...feedPresentationMetrics(item)];
  if (displayType === 'discussion') {
    const lastReply = lastReplyMetricFor(item);
    if (lastReply) metrics.push(lastReply);
  }
  if (displayType === 'question' && !metrics.some((metric) => metric.kind === 'answer')) {
    metrics.push({
      kind: 'questionState',
      state: item.accepted ? 'accepted' : item.answerCount === 0 ? 'waiting' : 'open',
    });
  }
  return metrics;
}

function homeMetricLabel(
  metric: HomeMetric,
  locale: LocaleId,
  t: TFunction<'discovery'>,
) {
  if (metric.kind === 'lastReply') {
    return t('home.time.lastReply', {
      time: formatDate(locale, metric.date, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  }
  if (metric.kind === 'questionState') {
    return t(`directory.questionStatus.${metric.state}`);
  }
  return t(`directory.metrics.${metric.kind}`, {
    count: metric.value,
    displayCount: formatNumber(locale, metric.value),
  });
}

function bookMetricsForItem(
  item: FeedItem,
  locale: LocaleId,
  t: TFunction<'discovery'>,
) {
  const rating = item.bookRating;
  const reviewCount = rating?.reviewCount ?? 0;
  const readCount = feedPresentationMetrics(item)
    .find((metric) => metric.kind === 'read')?.value ?? 0;
  return [
    reviewCount > 0 && rating
      ? t('pages.book.score', { score: formatBookScore(rating.averageScore, locale) })
      : t('pages.book.noRating'),
    t('pages.book.reviewCount', {
      count: reviewCount,
      displayCount: formatNumber(locale, reviewCount),
    }),
    t('directory.metrics.read', {
      count: readCount,
      displayCount: formatNumber(locale, readCount),
    }),
  ];
}

function feedMetricSummary(
  item: FeedItem | CompactItem,
  locale: LocaleId,
  t: TFunction<'discovery'>,
) {
  return formatList(
    locale,
    metricsForItem(item)
      .filter((metric) => metric.kind !== 'lastReply')
      .map((metric) => homeMetricLabel(metric, locale, t)),
    { style: 'short', type: 'conjunction' },
  );
}

function formatBookScore(score: number, locale: LocaleId) {
  const rounded = Math.round(score * 10) / 10;
  return formatNumber(locale, rounded, { maximumFractionDigits: 1 });
}

function bookAuthorText(item: FeedItem, t: TFunction<'discovery'>) {
  if ((item.authorId || item.authorUid) && item.author.trim()) {
    return item.author;
  }
  const authors = item.book?.authors?.filter(Boolean) || [];
  if (authors.length) return authors.join(' / ');
  return item.author || t('pages.book.authorMissing');
}

function bookAuthorNodes(
  item: FeedItem,
  t: TFunction<'discovery'>,
  imageUrl?: string,
  rank?: number,
) {
  const identity = item.authorId || item.authorUid;
  if (identity) {
    return (
      <UserIdentity
        name={bookAuthorText(item, t)}
        userId={identity}
        imageUrl={imageUrl}
        rank={rank}
      />
    );
  }
  return <AvatarName name={bookAuthorText(item, t)} imageUrl={imageUrl} rank={rank} />;
}

function authMetadataText(user: RinspaceUser, keys: string[]) {
  for (const key of keys) {
    const value = user.user_metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function authMetadataNumber(user: RinspaceUser, keys: string[]) {
  for (const key of keys) {
    const value = user.user_metadata?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function homeCommentViewer(
  user: RinspaceUser | null,
  t: TFunction<'discovery'>,
): HomeCommentViewer | undefined {
  if (!user) return undefined;
  const name =
    authMetadataText(user, ['display_name', 'nickName', 'nickname', 'name']) ||
    user.username ||
    t('home.comments.viewer');
  return {
    id: user.id,
    username: user.username,
    name,
    imageUrl: authMetadataText(user, ['avatar', 'avatar_url', 'picture']),
    rank: authMetadataNumber(user, ['rank', 'cultivation']),
  };
}

function isFeedItem(item: FeedItem | CompactItem): item is FeedItem {
  return 'excerpt' in item;
}

function isSocialTargetType(value: ContentType): value is SocialTargetType {
  return value !== 'task' && value !== 'tag';
}

function socialTargetType(value: SocialTargetType): SocialApiTargetType {
  if (value === 'announcement') return 'discussion';
  if (value === 'forum') return 'discussion';
  if (value === 'status') return 'dynamic';
  if (value === 'book') return 'post';
  return value;
}

function reactionTargetType(value: ContentType) {
  if (value === 'announcement') return 'discussion';
  if (value === 'forum') return 'discussion';
  if (value === 'status') return 'dynamic';
  if (value === 'book') return 'post';
  return value === 'task' ? 'post' : value;
}

function heartReactionState(summary?: ReactionItem[]): DynamicReactionState | null {
  if (!summary) return null;
  const heart = summary.find((reaction) => reaction.emoji === 'heart');
  return {
    count: heart?.count ?? 0,
    isActive: heart?.is_active ?? false,
  };
}

function itemPath(
  item: Pick<FeedItem | CompactItem, 'type' | 'id' | 'title' | 'tags' | 'tagItems'>,
) {
  if (item.type === 'tag') {
    const tagItem = item.tagItems?.[0];
    if (tagItem) {
      return tagReadOrLegacyPath(
        tagItem.tagId || item.id,
        tagItem.slugName || item.tags?.[0] || tagItem.displayName || item.title || item.id,
      );
    }
    return tagReadOrLegacyPath(item.id, item.tags?.[0] || item.title || item.id);
  }
  return contentPath(item.type, item.id, item.title);
}

function numericFeedItemId(item: Pick<FeedItem, 'id'>) {
  const value = Number(item.id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function collectionTargetRef(item: Pick<FeedItem, 'id'>) {
  const targetId = numericFeedItemId(item);
  return targetId ? { targetId: String(targetId) } : { slug: item.id };
}

function followedTagPath(tag: SidebarTag) {
  return tagReadOrLegacyPath(tag.tagId, tag.slugName || tag.displayName);
}

function scrollTagsOnWheel(event: ReactWheelEvent<HTMLDivElement>) {
  const target = event.currentTarget;
  if (target.scrollWidth <= target.clientWidth) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  event.preventDefault();
  target.scrollLeft += event.deltaY;
}

function authorProfilePath(item: Pick<FeedItem | CompactItem, 'authorId'>) {
  return item.authorId ? routeProfilePath(item.authorId) : '/users';
}

type GraphNodeLayout = KnowledgeGraphNode & {
  x: number;
  y: number;
  radius: number;
  group: number;
};

type GraphLayoutEdge = KnowledgeGraphEdge & {
  weight: number;
  isTagEdge: boolean;
};

type GraphViewport = {
  x: number;
  y: number;
  scale: number;
};

const defaultGraphViewport: GraphViewport = { x: 0, y: 0, scale: 1 };

function graphNodeTone(node: KnowledgeGraphNode) {
  if (node.kind === 'tag') return 'tag';
  return displayTypeClass(graphContentType(node.type));
}

function graphEdgeWeight(edge: KnowledgeGraphEdge) {
  if (!edge.kind.startsWith('tag-tag')) return 1;
  const weight = Number(edge.kind.split(':')[1]);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
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

function keepGraphNodeInBounds(node: GraphNodeLayout, width: number, height: number) {
  node.x = Math.max(node.radius + 8, Math.min(width - node.radius - 8, node.x));
  node.y = Math.max(node.radius + 8, Math.min(height - node.radius - 8, node.y));
}

function separateGraphNodes(nodes: GraphNodeLayout[], width: number, height: number, padding: number) {
  for (let iteration = 0; iteration < 18; iteration += 1) {
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

function buildKnowledgeGraphLayout(graph: KnowledgeGraphResponse) {
  const width = 1160;
  const height = 680;
  const centerX = width / 2;
  const centerY = height / 2;
  const tagNodes = graph.nodes.filter((node) => node.kind === 'tag');
  const contentNodes = graph.nodes.filter((node) => node.kind === 'content');
  const layouts = new Map<string, GraphNodeLayout>();
  const tagEdges = graph.edges.filter((edge) => edge.kind.startsWith('tag-tag'));
  const tagDegree = new Map<string, number>();
  tagEdges.forEach((edge) => {
    const weight = graphEdgeWeight(edge);
    tagDegree.set(edge.source, (tagDegree.get(edge.source) || 0) + weight);
    tagDegree.set(edge.target, (tagDegree.get(edge.target) || 0) + weight);
  });
  const sortedTagNodes = tagNodes.slice().sort((left, right) => {
    const leftDegree = tagDegree.get(left.id) || 0;
    const rightDegree = tagDegree.get(right.id) || 0;
    if (leftDegree === rightDegree) return (right.weight || right.count || 0) - (left.weight || left.count || 0);
    return rightDegree - leftDegree;
  });
  const tagAnchorBySlug = new Map<string, GraphNodeLayout>();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  sortedTagNodes.forEach((node, index) => {
    const group = index % 3;
    const ring = Math.floor(index / 3);
    const angle = index * goldenAngle - Math.PI / 2;
    const baseRadius = group === 0 ? 95 : group === 1 ? 185 : 280;
    const ringOffset = (ring % 4) * 16;
    const degree = tagDegree.get(node.id) || 0;
    const weight = Math.min(10, Math.max(1, Math.log2((node.weight || node.count || 1) + degree + 1)));
    const layout = {
      ...node,
      x: centerX + Math.cos(angle) * (baseRadius + ringOffset),
      y: centerY + Math.sin(angle) * (baseRadius + ringOffset * 0.68),
      radius: 16 + weight * 2,
      group,
    };
    layouts.set(node.id, layout);
    if (node.slug) tagAnchorBySlug.set(node.slug, layout);
  });

  contentNodes.forEach((node, index) => {
    const anchors = (node.tags || [])
      .map((tag) => tagAnchorBySlug.get(tag))
      .filter((anchor): anchor is GraphNodeLayout => Boolean(anchor));
    const primaryAnchor = anchors[0];
    const angle = primaryAnchor
      ? Math.atan2(primaryAnchor.y - centerY, primaryAnchor.x - centerX) + ((index % 5) - 2) * 0.18
      : index * goldenAngle - Math.PI / 2;
    const distance = primaryAnchor ? 78 + (index % 4) * 24 : 330 + (index % 5) * 16;
    const anchorX = primaryAnchor?.x ?? centerX;
    const anchorY = primaryAnchor?.y ?? centerY;
    const jitter = ((index % 7) - 3) * 7;
    layouts.set(node.id, {
      ...node,
      x: Math.max(36, Math.min(width - 36, anchorX + Math.cos(angle) * distance + jitter)),
      y: Math.max(36, Math.min(height - 36, anchorY + Math.sin(angle) * distance - jitter)),
      radius: 9 + Math.min(6, Math.max(0, (node.weight || 1) - 1)),
      group: 3,
    });
  });

  const layoutNodes = Array.from(layouts.values());
  separateGraphNodes(
    layoutNodes.filter((node) => node.kind === 'tag'),
    width,
    height,
    18,
  );
  separateGraphNodes(layoutNodes, width, height, 8);

  const edges = graph.edges.map((edge) => {
    const weight = graphEdgeWeight(edge);
    return {
      ...edge,
      weight,
      isTagEdge: edge.kind.startsWith('tag-tag'),
    };
  });

  return { width, height, nodes: layoutNodes, edges, layouts };
}

function KnowledgeGraphPanel({
  graph,
  loading,
  error,
  selectedNode,
  onSelectNode,
  viewport,
  onViewportChange,
}: {
  graph: KnowledgeGraphResponse | null;
  loading: boolean;
  error: string;
  selectedNode: KnowledgeGraphNode | null;
  onSelectNode: (node: KnowledgeGraphNode) => void;
  viewport: GraphViewport;
  onViewportChange: (viewport: GraphViewport) => void;
}) {
  const { t } = useFeatureTranslation('discovery');
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: GraphViewport;
  } | null>(null);
  const layout = useMemo(
    () => buildKnowledgeGraphLayout(graph || { nodes: [], edges: [], generatedAt: '' }),
    [graph],
  );
  const selected = selectedNode || layout.nodes[0] || null;
  const selectedID = selected?.id;
  const neighborIDs = useMemo(
    () => graphNeighborIDs(graph, selectedID),
    [graph, selectedID],
  );
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
    onViewportChange({
      x: pointerX - (pointerX - viewport.x) * ratio,
      y: pointerY - (pointerY - viewport.y) * ratio,
      scale: nextScale,
    });
  }, [onViewportChange, viewport]);

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
    onViewportChange({
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
      <div className="knowledge-graph-stage knowledge-graph-stage-loading">
        <div className="knowledge-graph-skeleton" />
      </div>
    );
  }

  if (error) {
    return <div className="state-strip mb-3">{error}</div>;
  }

  if (!graph || !layout.nodes.length) {
    return <div className="state-strip mb-3">{t('home.graph.empty')}</div>;
  }

  return (
    <div className="knowledge-graph-stage">
      <div
        ref={canvasRef}
        className="knowledge-graph-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={t('home.graph.title')}>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <g className="knowledge-graph-edges">
              {layout.edges.map((edge: GraphLayoutEdge) => {
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
                        ? Math.min(4.2, 1.8 + edge.weight * 0.55)
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
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectNode(node);
                    }
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
    </div>
  );
}

function KnowledgeGraphInspector({
  graph,
  selectedNode,
}: {
  graph: KnowledgeGraphResponse | null;
  selectedNode: KnowledgeGraphNode | null;
}) {
  const { t } = useFeatureTranslation('discovery');
  const locale = useResolvedLocale();
  const selected = selectedNode || graph?.nodes[0] || null;
  const tagNodePathBySlug = useMemo(() => {
    const paths = new Map<string, string>();
    (graph?.nodes || []).forEach((node) => {
      if (node.kind !== 'tag' || !node.slug || !node.url) return;
      paths.set(node.slug, node.url);
    });
    return paths;
  }, [graph]);
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
  if (!selected) {
    return (
      <section className="panel knowledge-graph-inspector knowledge-graph-inspector-empty">
        <span>{t('home.graph.title')}</span>
        <strong>{t('home.graph.nodes', { count: 0, displayCount: formatNumber(locale, 0) })}</strong>
      </section>
    );
  }
  const selectedTone = graphNodeTone(selected);
  return (
    <section className={`panel knowledge-graph-inspector knowledge-graph-inspector-${selectedTone}`}>
      <div className="panel-heading">
        <span>{t('home.graph.title')}</span>
        <strong>{graph ? `${formatNumber(locale, graph.nodes.length)} / ${formatNumber(locale, graph.edges.length)}` : t('home.graph.syncing')}</strong>
      </div>
      <span>{graphContentLabel(selected, t)}</span>
      <h2>
        <Link to={selected.url}>
          <MathInline text={selected.label} />
        </Link>
      </h2>
      {selected.author ? <p>{selected.author}</p> : null}
      {selected.kind === 'tag' ? (
        <strong>
          {t('home.graph.associated', {
            count: selected.count || 0,
            displayCount: formatNumber(locale, selected.count || 0),
          })}
        </strong>
      ) : null}
      {selected.tags?.length ? (
        <div className="tag-row">
          {selected.tags.slice(0, 5).map((tag) => {
            const path = tagNodePathBySlug.get(tag) || tagReadOrLegacyPath(tag, tag);
            return (
              <Link to={path} key={tag}>
                {tag}
              </Link>
            );
          })}
        </div>
      ) : null}
      {relatedNodes.length ? (
        <div className="knowledge-related-list">
          <span>{t('home.graph.related')}</span>
          {relatedNodes.map((node) => (
            <Link
              className={`knowledge-related-item knowledge-related-item-${graphNodeTone(node)}`}
              key={node.id}
              to={node.url}
            >
              <span>{graphContentLabel(node, t)}</span>
              <strong>
                <MathInline text={node.label} />
              </strong>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function discussionImagesFor(item: FeedItem | CompactItem) {
  if (!isFeedItem(item)) return [];
  return item.images?.filter(Boolean).slice(0, 9) || [];
}

function itemTypePath(displayType: string) {
  switch (displayType) {
    case 'blog':
      return '/blog';
    case 'question':
      return '/questions';
    case 'discussion':
      return '/discussions';
    case 'dynamic':
      return '/dynamics';
    case 'book':
      return '/books';
    case 'tag':
      return '/tags';
    default:
      return '/';
  }
}

function shareUrlFor(item: Pick<FeedItem | CompactItem, 'type' | 'id' | 'title' | 'tags'>) {
  if (typeof window === 'undefined') return itemPath(item);
  const basePath = publicEnv.publicBasePath || '';
  return `${window.location.origin}${basePath}${itemPath(item)}`;
}

function TypeMetaCategory({
  type,
  label,
}: {
  type: ContentType;
  label: string;
}) {
  const displayType = displayTypeClass(type);
  return (
    <span className={`meta-category content-type-meta content-type-meta-${displayType}`} title={label}>
      <Link to={itemTypePath(displayType)}>
        <span className="char" aria-hidden="true">
          {contentTypeMetaChar(displayType, label.slice(0, 1).toLowerCase())}
        </span>
        <span className="label">{label}</span>
      </Link>
    </span>
  );
}

async function copyTextToClipboard(text: string, errorMessage: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) {
    throw new Error(errorMessage);
  }
}

function avatarFromMap(
  item: Pick<FeedItem | CompactItem, 'author'> & { authorAvatar?: string },
  avatars: Record<string, string>,
) {
  return item.authorAvatar || avatars[item.author] || '';
}

type AuthorProfileMeta = {
  avatar: string;
  rank?: number;
};

const homeFeedPageSize = 8;
const homeFeedNearBottomMargin = 900;
const homeFeedDuplicateSkipLimit = 3;

const emptyHomeSidebar: HomeSidebar = {
  metrics: {
    todayReads: 0,
    todayNewFans: 0,
  },
  hotDiscussions: [],
  recommendedUsers: [],
  source: 'loading',
  generatedAt: '',
};

function feedItemKey(item: Pick<FeedItem, 'type' | 'id' | 'revisionId'>) {
  return `${item.type}:${item.revisionId || item.id}`;
}

function appendUniqueFeedItems(current: FeedItem[], next: FeedItem[]) {
  const seen = new Set(current.map(feedItemKey));
  const appended = next.filter((item) => {
    const key = feedItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    items: current.concat(appended),
    appendedCount: appended.length,
  };
}

function hasMoreHomeFeedPages(feed: Pick<HomeFeed, 'stream'>) {
  return feed.stream.length >= homeFeedPageSize;
}

function isElementNearViewport(node: Element | null, margin = homeFeedNearBottomMargin) {
  if (!node || typeof window === 'undefined') return false;
  const rect = node.getBoundingClientRect();
  return rect.top <= window.innerHeight + margin;
}

function isWindowNearBottom(margin = homeFeedNearBottomMargin) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const documentElement = document.documentElement;
  return window.innerHeight + window.scrollY >= documentElement.scrollHeight - margin;
}

function HomePage() {
  const { t } = useFeatureTranslation('discovery');
  const { t: tNavigation } = useTranslation('navigation');
  const locale = useResolvedLocale();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const homeSeoTitle = t('home.seo.title');
  const homeSeoDescription = t('home.seo.description');
  const homeSeoSiteName = tNavigation('brandName');
  const homeSeoJsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: homeSeoSiteName,
    url: 'https://rinspace.com/',
    description: homeSeoDescription,
    inLanguage: locale,
    publisher: {
      '@type': 'Organization',
      name: t('home.seo.publisher'),
      url: 'https://rinspace.com/',
      email: 'lunifans@outlook.com',
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://rinspace.com/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }), [homeSeoDescription, homeSeoSiteName, locale, t]);
  const [initialFeedMode] = useState<FeedMode>(() =>
    normalizeFeedMode(searchParams.get('feed')),
  );
  const [initialBookMode] = useState<BookMode>(() =>
    normalizeBookMode(searchParams.get('book')),
  );
  const [initialCommunityView] = useState<CommunityView>(() =>
    normalizeCommunityView(searchParams.get('view')),
  );
  const [initialHomeFeedSnapshot] = useState(() =>
    readCachedHomeFeed(initialFeedMode),
  );
  const [user, setUser] = useState<RinspaceUser | null>(null);
  const [homeFeed, setHomeFeed] = useState<HomeFeed>(
    () => initialHomeFeedSnapshot?.data ?? emptyHomeFeed,
  );
  const homeFeedStreamRef = useRef<FeedItem[]>(homeFeed.stream);
  const [feedMode, setFeedMode] = useState<FeedMode>(initialFeedMode);
  const [bookMode, setBookMode] = useState<BookMode>(initialBookMode);
  const [communityView, setCommunityView] = useState<CommunityView>(initialCommunityView);
  const [feedError, setFeedError] = useState('');
  const [feedLoading, setFeedLoading] = useState(
    () => !initialHomeFeedSnapshot,
  );
  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const feedLoadingMoreRef = useRef(false);
  const feedLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [bookItems, setBookItems] = useState<FeedItem[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState('');
  const [tagActivityItems, setTagActivityItems] = useState<FeedItem[]>([]);
  const [tagActivityLoading, setTagActivityLoading] = useState(false);
  const [tagActivityError, setTagActivityError] = useState('');
  const [homeSidebar, setHomeSidebar] = useState<HomeSidebar>(emptyHomeSidebar);
  const [homeSidebarLoading, setHomeSidebarLoading] = useState(true);
  const [homeSidebarError, setHomeSidebarError] = useState('');
  const [sponsorSupporters, setSponsorSupporters] = useState<SponsorSupporter[]>([]);
  const [openSourceStars, setOpenSourceStars] = useState<number | null>(null);
  const [commentTarget, setCommentTarget] = useState<FeedItem | null>(null);
  const [bookReviewTarget, setBookReviewTarget] = useState<FeedItem | null>(null);
  const overlayTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [collectedItems, setCollectedItems] = useState<Set<string>>(
    () => new Set(),
  );
  const [collectionDialogItem, setCollectionDialogItem] = useState<FeedItem | null>(null);
  const [collectionDialogError, setCollectionDialogError] = useState('');
  const [followedTags, setFollowedTags] = useState<FollowingTag[]>([]);
  const [followedTagsLoading, setFollowedTagsLoading] = useState(false);
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string>>(
    {},
  );
  const [authorProfiles, setAuthorProfiles] = useState<
    Record<string, AuthorProfileMeta>
  >({});
  const [status, setStatus] = useState('');
  useNoticeToasts({
    feedError, bookError, tagActivityError, homeSidebarError, collectionDialogError, status,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dynamicReactionStates, setDynamicReactionStates] = useState<
    Record<string, DynamicReactionState>
  >({});
  const [reactionBusyKey, setReactionBusyKey] = useState('');
  const [tagActionBusyKey, setTagActionBusyKey] = useState('');
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [knowledgeGraphLoading, setKnowledgeGraphLoading] = useState(false);
  const [knowledgeGraphError, setKnowledgeGraphError] = useState('');
  const [selectedGraphNode, setSelectedGraphNode] = useState<KnowledgeGraphNode | null>(null);
  const [knowledgeGraphViewport, setKnowledgeGraphViewport] = useState<GraphViewport>(
    defaultGraphViewport,
  );

  const visibleStream = useMemo(
    () =>
      orderedStream(homeFeed).filter(
        (item) => item.type !== 'book' || isHomeOriginalBook(item),
      ),
    [homeFeed],
  );
  const visibleTagActivityItems = useMemo(
    () =>
      tagActivityItems.filter(
        (item) => item.type !== 'book' || isHomeOriginalBook(item),
      ),
    [tagActivityItems],
  );
  const boardItems = communityView === 'tags' ? visibleTagActivityItems : visibleStream;
  const streamUsesTwoColumns = useMediaQuery('(min-width: 721px)');
  const boardColumns = useMemo(
    () => distributeItemsAcrossColumns(boardItems, streamUsesTwoColumns ? 2 : 1),
    [boardItems, streamUsesTwoColumns],
  );
  const bookColumns = useMemo(
    () => distributeItemsAcrossColumns(bookItems, streamUsesTwoColumns ? 2 : 1),
    [bookItems, streamUsesTwoColumns],
  );
  const announcementItems = useMemo(
    () => homeFeed.announcements,
    [homeFeed.announcements],
  );
  const sponsorAvatars = useMemo(
    () => uniqueSponsorAvatars(sponsorSupporters),
    [sponsorSupporters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRinspaceOpenSourceStars(controller.signal)
      .then(setOpenSourceStars)
      .catch((starsError: unknown) => {
        if (!(starsError instanceof DOMException && starsError.name === 'AbortError')) {
          setOpenSourceStars(0);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    homeFeedStreamRef.current = homeFeed.stream;
  }, [homeFeed.stream]);

  useEffect(() => {
    const nextFeedMode = normalizeFeedMode(searchParams.get('feed'));
    setFeedMode((current) => (current === nextFeedMode ? current : nextFeedMode));
    const nextBookMode = normalizeBookMode(searchParams.get('book'));
    setBookMode((current) => (current === nextBookMode ? current : nextBookMode));
    const nextCommunityView = normalizeCommunityView(searchParams.get('view'));
    setCommunityView((current) => (
      current === nextCommunityView ? current : nextCommunityView
    ));
  }, [searchParams]);

  const handleCommunityViewChange = useCallback((nextCommunityView: CommunityView) => {
    setCommunityView(nextCommunityView);
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (nextCommunityView === 'stream') {
        nextParams.delete('view');
      } else {
        nextParams.set('view', nextCommunityView);
      }
      if (nextCommunityView !== 'books') {
        nextParams.delete('book');
      }
      return nextParams;
    });
  }, [setSearchParams]);

  const handleFeedModeChange = useCallback((nextFeedMode: FeedMode) => {
    setFeedMode(nextFeedMode);
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (nextFeedMode === 'hot') {
        nextParams.delete('feed');
      } else {
        nextParams.set('feed', nextFeedMode);
      }
      return nextParams;
    });
  }, [setSearchParams]);

  const handleBookModeChange = useCallback((nextBookMode: BookMode) => {
    setBookMode(nextBookMode);
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (nextBookMode === 'hot') {
        nextParams.delete('book');
      } else {
        nextParams.set('book', nextBookMode);
      }
      return nextParams;
    });
  }, [setSearchParams]);

  const sidebarFollowedTags = useMemo<SidebarTag[]>(() => {
    if (!user) return [];
    return followedTags.map((tag) => ({
      tagId: tag.tagId,
      slugName: tag.slugName,
      displayName: tag.displayName || tag.slugName,
    }));
  }, [followedTags, user]);
  useEffect(() => {
    if (!status && !error) return undefined;
    const timeout = window.setTimeout(() => {
      setStatus('');
      setError('');
    }, error ? 4800 : 3200);
    return () => window.clearTimeout(timeout);
  }, [error, status]);

  useRinPageContext(
    useMemo(() => ({
      kind: 'page' as const,
      title: t('home.assistant.title'),
      excerpt: t('home.assistant.excerpt', {
        view: t(`home.views.${communityView}`),
        mode: t(`home.modes.${feedMode}`),
      }),
      sections: [
        boardItems.length
          ? {
              title: communityView === 'tags'
                ? t('home.assistant.tagActivityTitle')
                : t('home.assistant.streamTitle'),
              body: boardItems
                .slice(0, 12)
                .map((item, index) => t('home.assistant.contentItem', {
                  index: formatNumber(locale, index + 1),
                  type: contentTypeLabel(item.type, t),
                  title: item.title,
                  author: item.author,
                  summary: item.excerpt || feedMetricSummary(item, locale, t),
                }))
                .join('\n'),
            }
          : undefined,
        bookItems.length
          ? {
              title: t('home.assistant.bookTitle', { mode: t(`home.modes.${bookMode}`) }),
              body: bookItems
                .slice(0, 10)
                .map((item, index) => t('home.assistant.bookItem', {
                  index: formatNumber(locale, index + 1),
                  title: item.book?.bookTitle || item.title,
                  author: item.book?.authors?.join(', ') || item.author,
                  score: formatNumber(locale, item.bookRating?.averageScore || 0, { maximumFractionDigits: 1 }),
                }))
                .join('\n'),
            }
          : undefined,
        homeSidebar.hotDiscussions.length
          ? {
              title: t('home.assistant.hotDiscussions'),
              body: homeSidebar.hotDiscussions
                .slice(0, 6)
                .map((item, index) => t('home.assistant.compactItem', {
                  index: formatNumber(locale, index + 1),
                  type: contentTypeLabel(item.type, t),
                  title: item.title,
                  summary: feedMetricSummary(item, locale, t),
                }))
                .join('\n'),
            }
          : undefined,
        announcementItems.length
          ? {
              title: t('home.assistant.announcements'),
              body: announcementItems
                .slice(0, 6)
                .map((item, index) => t('home.assistant.compactItem', {
                  index: formatNumber(locale, index + 1),
                  type: contentTypeLabel(item.type, t),
                  title: item.title,
                  summary: feedMetricSummary(item, locale, t),
                }))
                .join('\n'),
            }
          : undefined,
        sidebarFollowedTags.length
          ? {
              title: t('home.assistant.followedTags'),
              body: sidebarFollowedTags
                .map((tag) => tag.displayName || tag.slugName)
                .join(locale === 'zh-CN' ? '、' : ', '),
            }
          : undefined,
      ].filter((section): section is { title: string; body: string } => Boolean(section)),
      updatedAt: homeFeed.generatedAt,
    }), [
      announcementItems,
      boardItems,
      bookMode,
      bookItems,
      communityView,
      feedMode,
      homeFeed.generatedAt,
      homeSidebar.hotDiscussions,
      locale,
      sidebarFollowedTags,
      t,
    ]),
  );

  useEffect(() => {
    if (communityView !== 'books') {
      return undefined;
    }
    if (bookMode === 'following' && user && followedTagsLoading) {
      setBookLoading(true);
      setBookError('');
      return undefined;
    }
    let cancelled = false;
    setBookLoading(true);
    setBookError('');
    const loadBooks = async () => {
      if (bookMode === 'shelf') {
        if (!user) throw new Error(t('home.errors.signInShelf'));
        const page = await loadPersonalCollectionPage({ page: 1, pageSize: 100 });
        return page.items.filter((item) => item.type === 'book');
      }
      if (bookMode === 'following') {
        if (!user) throw new Error(t('home.errors.signInFollowingBooks'));
        if (!followedTags.length) return [];
        const pages = await Promise.all(
          followedTags.slice(0, 8).map((tag) =>
            loadBookFeed({
              tag: tag.slugName,
              order: 'newest',
              size: 12,
            }),
          ),
        );
        const seen = new Set<string>();
        return pages
          .flatMap((page) => page.items)
          .filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          })
          .slice(0, 24);
      }
      return loadBookFeed({
        order: bookMode === 'latest' ? 'newest' : 'recommend',
        size: 24,
      }).then((response) => response.items);
    };
    void loadBooks()
      .then((items) => {
        if (!cancelled) setBookItems(items.filter(isHomeOriginalBook));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setBookItems([]);
          setBookError(messageFromError(loadError, 'home.bookLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setBookLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookMode, communityView, followedTags, followedTagsLoading, t, user]);

  useEffect(() => {
    if (communityView !== 'tags' || tagActivityItems.length) {
      return undefined;
    }
    let cancelled = false;
    setTagActivityLoading(true);
    setTagActivityError('');
    void loadTagActivity({ limit: 24 })
      .then((items) => {
        if (!cancelled) setTagActivityItems(items);
      })
      .catch((loadError) => {
        if (!cancelled) setTagActivityError(messageFromError(loadError, 'home.tagActivityLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setTagActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [communityView, tagActivityItems.length]);

  useEffect(() => {
    let cancelled = false;
    setHomeSidebarLoading(true);
    setHomeSidebarError('');
    void loadHomeSidebar({ limit: 4 })
      .then((sidebar) => {
        if (cancelled) return;
        setHomeSidebar(sidebar);
      })
      .catch((sidebarError) => {
        if (cancelled) return;
        setHomeSidebar(emptyHomeSidebar);
        setHomeSidebarError(messageFromError(sidebarError, 'home.sidebarLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setHomeSidebarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    void loadSponsorSupporters(24)
      .then(({ items }) => {
        if (!cancelled) setSponsorSupporters(items);
      })
      .catch(() => {
        if (!cancelled) setSponsorSupporters([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (communityView !== 'graph' || knowledgeGraph) {
      return undefined;
    }
    let cancelled = false;
    setKnowledgeGraphLoading(true);
    setKnowledgeGraphError('');
    void loadKnowledgeGraph({ tagLimit: 32, contentLimit: 80 })
      .then((graph) => {
        if (cancelled) return;
        setKnowledgeGraph(graph);
        setSelectedGraphNode(graph.nodes[0] || null);
      })
      .catch((graphError) => {
        if (!cancelled) setKnowledgeGraphError(messageFromError(graphError, 'home.graphLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setKnowledgeGraphLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [communityView, knowledgeGraph]);

  const refreshSession = useCallback(async () => {
    setError('');
    try {
      const nextUser = await getCurrentAuthUser();
      setUser(nextUser);
      if (!nextUser) {
        setCollectedItems(new Set());
        setFollowedTags([]);
        setFollowedTagsLoading(false);
        return;
      }
    } catch (sessionError) {
      setError(messageFromError(sessionError, 'home.sessionLoadFailed'));
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCollectedItems(new Set());
      return undefined;
    }

    void loadPersonalCollectionPage({ page: 1, pageSize: 100 })
      .then((page) => {
        if (cancelled) return;
        setCollectedItems(new Set(page.items.map((item) => item.id)));
      })
      .catch(() => {
        if (!cancelled) setCollectedItems(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFollowedTags([]);
      setFollowedTagsLoading(false);
      return undefined;
    }

    setFollowedTagsLoading(true);
    void loadFollowingTags()
      .then((items) => {
        if (!cancelled) setFollowedTags(items);
      })
      .catch(() => {
        if (!cancelled) setFollowedTags([]);
      })
      .finally(() => {
        if (!cancelled) setFollowedTagsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const authorLookupIds = new Map<string, string>();
    [
      homeFeed.featuredBlog,
      ...homeFeed.stream,
      ...homeFeed.questionHotlist,
      ...homeFeed.community,
      ...homeFeed.announcements,
      ...homeFeed.tasks,
      ...tagActivityItems,
    ].forEach((item) => {
      if (item.type === 'task') return;
      const name = item.author.trim();
      if (name && item.authorId) authorLookupIds.set(name, item.authorId);
    });
    const missing = Array.from(authorLookupIds.entries()).filter(
      ([name]) => !(name in authorProfiles),
    );
    if (!missing.length) return undefined;

    void Promise.all(
      missing.map(async ([name, authorId]) => {
        try {
          const info = await loadPersonalUserInfo(authorId);
          return [name, { avatar: info.avatar || '', rank: info.rank }] as const;
        } catch {
          return [name, { avatar: '', rank: undefined }] as const;
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
  }, [authorProfiles, homeFeed, tagActivityItems]);

  useEffect(() => {
    let cancelled = false;
    const reactionItems = [...visibleStream, ...bookItems].filter(
      (item): item is FeedItem =>
        isFeedItem(item) &&
        isSocialTargetType(item.type),
    );
    const feedStateEntries = reactionItems
      .map((item) => {
        const state = item.likeSource === 'repository'
          ? { count: item.likeCount ?? 0, isActive: Boolean(item.liked) }
          : heartReactionState(item.reaction_summary);
        return state ? ([item.id, state] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, DynamicReactionState] =>
          entry !== null,
      );
    if (feedStateEntries.length) {
      setDynamicReactionStates((current) => {
        let changed = false;
        const next = { ...current };
        feedStateEntries.forEach(([id, state]) => {
          if (
            next[id]?.count !== state.count ||
            next[id]?.isActive !== state.isActive
          ) {
            next[id] = state;
            changed = true;
          }
        });
        return changed ? next : current;
      });
    }
    const missing = reactionItems.filter(
      (item) => item.likeSource !== 'repository' && !item.reaction_summary && !(item.id in dynamicReactionStates),
    );
    if (!missing.length) return undefined;

    void Promise.all(
      missing.map(async (item) => {
        try {
          const result = await queryReactions(
            item.id,
            reactionTargetType(item.type),
          );
          const heart = result.reaction_summary.find(
            (reaction) => reaction.emoji === 'heart',
          );
          return [
            item.id,
            {
              count: heart?.count ?? 0,
              isActive: heart?.is_active ?? false,
            },
          ] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const validEntries = entries.filter(
        (entry): entry is readonly [string, DynamicReactionState] =>
          entry !== null,
      );
      if (!validEntries.length) return;
      setDynamicReactionStates((current) => ({
        ...current,
        ...Object.fromEntries(validEntries),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [visibleStream, bookItems, dynamicReactionStates]);

  const avatarForItem = (item: FeedItem | CompactItem) =>
    avatarFromMap(
      {
        author: item.author,
        authorAvatar: isFeedItem(item) ? item.authorAvatar : undefined,
      },
      authorAvatars,
    );
  const rankForItem = (item: FeedItem | CompactItem) =>
    item.authorRank ?? authorProfiles[item.author]?.rank;

  const reloadHomeFeed = useCallback(async () => {
    const nextFeed = await loadHomeFeed({
      mode: feedMode,
      page: 1,
      size: homeFeedPageSize,
    });
    homeFeedStreamRef.current = nextFeed.stream;
    setHomeFeed(nextFeed);
    setFeedPage(1);
    setFeedHasMore(hasMoreHomeFeedPages(nextFeed));
    setFeedError('');
  }, [feedMode]);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedHomeFeed(feedMode);
    if (cached) {
      homeFeedStreamRef.current = cached.data.stream;
      setHomeFeed(cached.data);
      setFeedError('');
    } else {
      homeFeedStreamRef.current = emptyHomeFeed.stream;
      setHomeFeed(emptyHomeFeed);
    }
    setFeedPage(1);
    setFeedHasMore(true);
    setFeedLoadingMore(false);
    feedLoadingMoreRef.current = false;
    setFeedLoading(true);
    void loadHomeFeed({
      mode: feedMode,
      page: 1,
      size: homeFeedPageSize,
    })
      .then((nextFeed) => {
        if (cancelled) return;
        homeFeedStreamRef.current = nextFeed.stream;
        setHomeFeed(nextFeed);
        setFeedPage(1);
        setFeedHasMore(hasMoreHomeFeedPages(nextFeed));
        setFeedError('');
      })
      .catch((feedLoadError) => {
        if (!cancelled) {
          setFeedError(messageFromError(feedLoadError, 'home.feedLoadFailed'));
          setFeedHasMore(false);
          if (!cached) {
            setHomeFeed(fallbackHomeFeed);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFeedLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [feedMode]);

  const loadMoreHomeFeed = useCallback(async () => {
    if (communityView !== 'stream' || feedLoading || feedLoadingMoreRef.current || !feedHasMore) return;
    let nextPage = feedPage;
    let hasMore: boolean = feedHasMore;
    setFeedLoadingMore(true);
    feedLoadingMoreRef.current = true;
    try {
      for (let attempt = 0; attempt < homeFeedDuplicateSkipLimit && hasMore; attempt += 1) {
        nextPage += 1;
        const nextFeed = await loadHomeFeed({
          mode: feedMode,
          page: nextPage,
          size: homeFeedPageSize,
        });
        const result = appendUniqueFeedItems(homeFeedStreamRef.current, nextFeed.stream);
        homeFeedStreamRef.current = result.items;
        setHomeFeed((current) => ({
          ...current,
          stream: result.items,
          generatedAt: nextFeed.generatedAt,
        }));
        setFeedPage(nextPage);
        hasMore = hasMoreHomeFeedPages(nextFeed);
        setFeedHasMore(hasMore);
        if (!hasMore || result.appendedCount > 0) break;
      }
      setFeedError('');
    } catch {
      setFeedHasMore(false);
    } finally {
      feedLoadingMoreRef.current = false;
      setFeedLoadingMore(false);
    }
  }, [communityView, feedHasMore, feedLoading, feedMode, feedPage]);

  const shouldLoadMoreHomeFeed = useCallback(() => {
    if (communityView !== 'stream' || feedLoading || feedLoadingMoreRef.current || !feedHasMore) {
      return false;
    }
    return isElementNearViewport(feedLoadMoreRef.current) || isWindowNearBottom();
  }, [communityView, feedHasMore, feedLoading]);

  useEffect(() => {
    const node = feedLoadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && shouldLoadMoreHomeFeed()) {
          void loadMoreHomeFeed();
        }
      },
      { rootMargin: `${homeFeedNearBottomMargin}px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMoreHomeFeed, shouldLoadMoreHomeFeed]);

  useEffect(() => {
    if (communityView !== 'stream') return undefined;
    let animationFrame = 0;
    const requestLoadMore = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (shouldLoadMoreHomeFeed()) {
          void loadMoreHomeFeed();
        }
      });
    };
    window.addEventListener('scroll', requestLoadMore, { passive: true });
    window.addEventListener('resize', requestLoadMore);
    requestLoadMore();
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', requestLoadMore);
      window.removeEventListener('resize', requestLoadMore);
    };
  }, [communityView, loadMoreHomeFeed, shouldLoadMoreHomeFeed]);

  useEffect(() => {
    if (!shouldLoadMoreHomeFeed()) return undefined;
    const timer = window.setTimeout(() => {
      if (shouldLoadMoreHomeFeed()) {
        void loadMoreHomeFeed();
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [boardItems.length, loadMoreHomeFeed, shouldLoadMoreHomeFeed]);

  const handleSessionChange = useCallback(async () => {
    await refreshSession();
    setFeedLoading(true);
    try {
      await reloadHomeFeed();
    } catch (feedLoadError) {
      setFeedError(messageFromError(feedLoadError, 'home.feedLoadFailed'));
    } finally {
      setFeedLoading(false);
    }
  }, [refreshSession, reloadHomeFeed]);

  const openComment = async (item: FeedItem) => {
    if (!isSocialTargetType(item.type)) {
      return;
    }
    await import('@/styles/product-families/unified-comments.css');
    setError('');
    setBookReviewTarget(null);
    setCommentTarget(item);
  };

  const openBookReview = async (item: FeedItem) => {
    if (item.type !== 'book') return;
    await import('@/styles/product-families/unified-book-reviews.css');
    setError('');
    setCommentTarget(null);
    setBookReviewTarget(item);
  };

  const updateBookRatingInFeed = (
    item: FeedItem,
    rating: NonNullable<FeedItem['bookRating']>,
  ) => {
    const updateItem = (currentItem: FeedItem) =>
      currentItem.id === item.id && currentItem.type === 'book'
        ? { ...currentItem, bookRating: rating }
        : currentItem;
    setBookItems((current) => current.map(updateItem));
    setHomeFeed((current) => ({
      ...current,
      stream: current.stream.map(updateItem),
    }));
  };

  const updateCommentCountInFeed = (item: FeedItem, commentCount: number) => {
    const updateItem = (candidate: FeedItem) =>
      candidate.id === item.id && candidate.type === item.type
        ? { ...candidate, commentCount }
        : candidate;
    setBookItems((current) => current.map(updateItem));
    setHomeFeed((current) => ({
      ...current,
      featuredBlog: updateItem(current.featuredBlog),
      stream: current.stream.map(updateItem),
    }));
  };

  const collectItem = async (item: FeedItem) => {
    if (!isSocialTargetType(item.type)) {
      return;
    }
    if (!user) {
      setError(t('home.errors.signInSave'));
      return;
    }
    const isCollected = item.likeSource === 'repository'
      ? Boolean(item.collectionActive)
      : collectedItems.has(item.id);
    if (!isCollected) {
      setStatus('');
      setError('');
      setCollectionDialogError('');
      setCollectionDialogItem(item);
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await switchCollection({
        targetType: socialTargetType(item.type),
        ...collectionTargetRef(item),
        bookmark: !isCollected,
        isCancel: isCollected,
      });
      setCollectedItems((current) => {
        const next = new Set(current);
        if (result.bookmarked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
        return next;
      });
      const updateItem = (candidate: FeedItem) =>
        candidate.id === item.id && candidate.type === item.type
          ? { ...candidate, favoriteCount: result.collectionCount, collectionActive: result.bookmarked }
          : candidate;
      setBookItems((current) => current.map(updateItem));
      setHomeFeed((current) => ({
        ...current,
        featuredBlog: updateItem(current.featuredBlog),
        stream: current.stream.map(updateItem),
      }));
      setStatus(
        result.bookmarked
          ? t('home.status.saved', { title: item.title })
          : t('home.status.unsaved', { title: item.title }),
      );
    } catch (collectionError) {
      setError(messageFromError(collectionError, 'home.collectionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveItemToCollectionFolder = async (folderId: string, folder?: CollectionFolder) => {
    const item = collectionDialogItem;
    if (!item || !isSocialTargetType(item.type)) return;
    if (!user) {
      setCollectionDialogError(t('home.errors.signInSave'));
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    setCollectionDialogError('');
    try {
      const result = await switchCollection({
        targetType: socialTargetType(item.type),
        ...collectionTargetRef(item),
        bookmark: true,
        isCancel: false,
        folderId: folderId || undefined,
      });
      setCollectedItems((current) => {
        const next = new Set(current);
        if (result.bookmarked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
        return next;
      });
      const updateItem = (candidate: FeedItem) =>
        candidate.id === item.id && candidate.type === item.type
          ? { ...candidate, favoriteCount: result.collectionCount, collectionActive: result.bookmarked }
          : candidate;
      setBookItems((current) => current.map(updateItem));
      setHomeFeed((current) => ({
        ...current,
        featuredBlog: updateItem(current.featuredBlog),
        stream: current.stream.map(updateItem),
      }));
      setStatus(t('home.status.savedTo', {
        folder: folder?.name || t('home.status.defaultCollection'),
        title: item.title,
      }));
      setCollectionDialogItem(null);
    } catch (collectionError) {
      setCollectionDialogError(messageFromError(collectionError, 'home.collectionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const shareItem = async (item: FeedItem) => {
    if (item.type === 'task') {
      return;
    }
    setError('');
    setStatus('');
    try {
      await copyTextToClipboard(shareUrlFor(item), t('home.errors.copyFailed'));
      const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await recordContentShare({
        targetType: item.type,
        targetId: item.id,
        requestId,
      });
      const updateItem = (candidate: FeedItem) =>
        candidate.id === item.id && candidate.type === item.type
          ? { ...candidate, shareCount: result.shareCount }
          : candidate;
      setBookItems((current) => current.map(updateItem));
      setTagActivityItems((current) => current.map(updateItem));
      setHomeFeed((current) => ({
        ...current,
        featuredBlog: updateItem(current.featuredBlog),
        stream: current.stream.map(updateItem),
      }));
      setStatus(t('home.status.copied', { title: item.title }));
    } catch (shareError) {
      setError(messageFromError(shareError, 'home.shareFailed'));
    }
  };

  const updateTagActivityItem = (
    item: FeedItem,
    update: (candidate: FeedItem) => FeedItem,
  ) => {
    setTagActivityItems((current) =>
      current.map((candidate) =>
        candidate.type === 'tag' && candidate.id === item.id
          ? update(candidate)
          : candidate,
      ),
    );
  };

  const toggleTagLike = async (item: FeedItem) => {
    if (item.type !== 'tag') return;
    if (!user) {
      requestAuthDialog();
      return;
    }
    const busyKey = `like:${item.id}`;
    setTagActionBusyKey(busyKey);
    setError('');
    setStatus('');
    try {
      const result = await likePost({
        targetType: 'tag',
        targetId: item.id,
        slug: item.tagItems?.[0]?.slugName || item.tags?.[0],
        bookmark: !item.liked,
        isCancel: Boolean(item.liked),
      });
      updateTagActivityItem(item, (candidate) => ({
        ...candidate,
        likeCount: result.likeCount,
        liked: result.liked,
      }));
    } catch (likeError) {
      setError(messageFromError(likeError, 'home.reactionFailed'));
    } finally {
      setTagActionBusyKey('');
    }
  };

  const toggleTagFollow = async (item: FeedItem) => {
    if (item.type !== 'tag') return;
    if (!user) {
      requestAuthDialog();
      return;
    }
    const busyKey = `follow:${item.id}`;
    setTagActionBusyKey(busyKey);
    setError('');
    setStatus('');
    try {
      const slug = item.tagItems?.[0]?.slugName || item.tags?.[0] || item.id;
      const result = await followTarget({
        targetType: 'tag',
        targetId: slug,
        slug,
        isCancel: Boolean(item.isFollowed),
      });
      updateTagActivityItem(item, (candidate) => ({
        ...candidate,
        followCount: result.followerCount,
        isFollowed: result.following,
      }));
    } catch (followError) {
      setError(messageFromError(followError, 'home.followFailed'));
    } finally {
      setTagActionBusyKey('');
    }
  };

  const toggleDynamicLike = async (item: FeedItem) => {
    if (!isSocialTargetType(item.type)) return;
    if (!user) {
      setError(t('home.errors.signInLike'));
      return;
    }
    const current = dynamicReactionStates[item.id];
    setReactionBusyKey(item.id);
    setError('');
    setStatus('');
    try {
      if (item.likeSource === 'repository') {
        const result = await likePost({
          targetType: socialTargetType(item.type),
          ...collectionTargetRef(item),
          bookmark: !current?.isActive,
          isCancel: Boolean(current?.isActive),
        });
        setDynamicReactionStates((states) => ({
          ...states,
          [item.id]: { count: result.likeCount, isActive: result.liked },
        }));
        const updateItem = (candidate: FeedItem) =>
          candidate.id === item.id && candidate.type === item.type
            ? { ...candidate, likeCount: result.likeCount, liked: result.liked }
            : candidate;
        setBookItems((items) => items.map(updateItem));
        setHomeFeed((feed) => ({
          ...feed,
          featuredBlog: updateItem(feed.featuredBlog),
          stream: feed.stream.map(updateItem),
        }));
        setStatus(result.liked ? t('home.status.liked') : t('home.status.unliked'));
        return;
      }
      const result = await updateReaction({
        object_id: item.id,
        object_type: reactionTargetType(item.type),
        emoji: 'heart',
        reaction: current?.isActive ? 'deactivate' : 'activate',
      });
      const heart = result.reaction_summary.find(
        (reaction: ReactionItem) => reaction.emoji === 'heart',
      );
      setDynamicReactionStates((states) => ({
        ...states,
        [item.id]: {
          count: heart?.count ?? 0,
          isActive: heart?.is_active ?? false,
        },
      }));
      const updateItem = (candidate: FeedItem) =>
        candidate.id === item.id && candidate.type === item.type
          ? {
              ...candidate,
              likeCount: heart?.count ?? 0,
              liked: heart?.is_active ?? false,
              reaction_summary: result.reaction_summary,
            }
          : candidate;
      setBookItems((current) => current.map(updateItem));
      setHomeFeed((current) => ({
        ...current,
        featuredBlog: updateItem(current.featuredBlog),
        stream: current.stream.map(updateItem),
      }));
      setStatus(current?.isActive ? t('home.status.unliked') : t('home.status.liked'));
    } catch (reactionError) {
      setError(messageFromError(reactionError, 'home.reactionFailed'));
    } finally {
      setReactionBusyKey('');
    }
  };

  const renderSocialActions = (item: FeedItem) => {
    if (!isSocialTargetType(item.type)) return null;
    const isCollected = item.likeSource === 'repository'
      ? Boolean(item.collectionActive)
      : collectedItems.has(item.id);
    const reaction = dynamicReactionStates[item.id] || {
      count: item.likeCount || 0,
      isActive: Boolean(item.liked),
    };
    const rememberTrigger = () => {
      if (document.activeElement instanceof HTMLButtonElement) {
        overlayTriggerRef.current = document.activeElement;
      }
    };
    return (
      <div className="home-card-actions" aria-label={t('home.actions.interactions')}>
        <CardActionButton
          icon={reaction.isActive ? 'heart-fill' : 'heart'}
          label={t('home.actions.like')}
          value={reaction.count}
          active={reaction.isActive}
          toggle
          tone="like"
          disabled={reactionBusyKey === item.id}
          onClick={() => void toggleDynamicLike(item)}
        />
        <CardActionButton
          icon={isCollected ? 'bookmark-check' : 'bookmark'}
          label={t('home.actions.save')}
          value={item.favoriteCount ?? 0}
          active={isCollected}
          toggle
          disabled={busy}
          onClick={() => void collectItem(item)}
        />
        <CardActionButton
          icon="chat-dots"
          label={t('home.actions.comment')}
          value={item.commentCount ?? 0}
          onClick={() => {
            rememberTrigger();
            openComment(item);
          }}
        />
        <CardActionButton
          icon="share"
          label={t('home.actions.share')}
          value={item.shareCount ?? 0}
          disabled={busy}
          onClick={() => void shareItem(item)}
        />
      </div>
    );
  };

  const renderTagSocialActions = (item: FeedItem) => {
    if (item.type !== 'tag') return null;
    return (
      <div className="home-card-actions" aria-label={t('home.actions.interactions')}>
        <CardActionButton
          icon={item.liked ? 'heart-fill' : 'heart'}
          label={t('home.actions.like')}
          value={item.likeCount ?? 0}
          active={Boolean(item.liked)}
          toggle
          tone="like"
          disabled={tagActionBusyKey === `like:${item.id}`}
          onClick={() => void toggleTagLike(item)}
        />
        <CardActionButton
          icon={item.isFollowed ? 'bookmark-check' : 'bookmark'}
          label={t('pages.tag.follow')}
          value={item.followCount ?? 0}
          active={Boolean(item.isFollowed)}
          toggle
          disabled={tagActionBusyKey === `follow:${item.id}`}
          onClick={() => void toggleTagFollow(item)}
        />
        <CardActionButton
          icon="share"
          label={t('home.actions.share')}
          value={item.shareCount ?? 0}
          disabled={busy}
          onClick={() => void shareItem(item)}
        />
      </div>
    );
  };

  const renderSidebarCompactItem = (item: CompactItem) => {
    const displayType = displayTypeClass(item.type);
    return (
      <article
        className={`sidebar-compact-card type-${displayType}`}
        key={item.id}
      >
        <span
          className={`meta-category content-type-meta content-type-meta-${displayType}`}
          title={contentTypeLabel(item.type, t)}
        >
          <span className="sidebar-meta-label">
            <span className="char" aria-hidden="true">
              {contentTypeMetaChar(
                displayType,
                contentTypeLabel(item.type, t).slice(0, 1).toLowerCase(),
              )}
            </span>
          </span>
        </span>
        <Link className="sidebar-compact-title" to={itemPath(item)}>
          <MathInline text={item.title} />
        </Link>
      </article>
    );
  };

  const renderTodayMetricsCard = () => (
    <section className="panel home-insight-panel">
      <div className="panel-heading">
        <span>{t('home.sidebar.today')}</span>
        {homeSidebarLoading ? <strong>{t('home.sidebar.syncing')}</strong> : null}
      </div>
      <div className="home-insight-grid">
        <div className="home-insight-metric primary">
          <span>{t('home.sidebar.reads')}</span>
          <strong>{formatNumber(locale, homeSidebar.metrics.todayReads, { notation: 'compact' })}</strong>
        </div>
        <div className="home-insight-metric">
          <span>{t('home.sidebar.fans')}</span>
          <strong>{formatNumber(locale, homeSidebar.metrics.todayNewFans, { notation: 'compact' })}</strong>
        </div>
      </div>
      {homeSidebarError ? (
        <p className="home-insight-note">{t('home.sidebar.failed')}</p>
      ) : null}
    </section>
  );

  const renderHotDiscussionCard = () => (
    <section className="panel home-recommend-panel">
      <div className="panel-heading">
        <span>{t('home.sidebar.hotDiscussions')}</span>
      </div>
      {homeSidebar.hotDiscussions.length ? (
        <div className="compact-list home-hot-list">
          {homeSidebar.hotDiscussions.map(renderSidebarCompactItem)}
        </div>
      ) : (
        <div className="state-strip compact">{t('home.sidebar.emptyDiscussions')}</div>
      )}
    </section>
  );

  const renderFollowRecommendationCard = () => (
    <section className="panel home-follow-panel">
      <div className="panel-heading">
        <span>{t('home.sidebar.recommended')}</span>
        <strong>{homeSidebar.source === 'gorse' ? 'Gorse' : t('home.sidebar.cultivation')}</strong>
      </div>
      {homeSidebar.recommendedUsers.length ? (
        <div className="home-follow-list">
          {homeSidebar.recommendedUsers.map((item) => (
            <Link className="home-follow-user" key={item.id} to={routeProfilePath(item.username)}>
              <AvatarImage
                className="home-follow-avatar"
                src={item.avatar}
                fallback={(
                  <span className="home-follow-avatar home-follow-avatar-fallback">
                    {shortInitialsFor(item.display_name || item.username)}
                  </span>
                )}
              />
              <span>
                <strong>{item.display_name || item.username}</strong>
                <CultivationBadge rank={item.rank} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="state-strip compact">{t('home.sidebar.emptyRecommended')}</div>
      )}
    </section>
  );

  const renderBookItem = (item: FeedItem) => {
    const book = item.book;
    const originalFormat = homeOriginalBookFormat(item);
    if (!originalFormat) return null;
    const pageCount = Number(book?.numberOfPages || 0);
    const footerMetrics = bookMetricsForItem(item, locale, t);
    const scoreMetric = footerMetrics[0];
    const readMetric = footerMetrics[2];
    const itemTags = tagsFor(item);
    const hasRated = Boolean(item.bookRating?.myReview);
    const isCollected = item.likeSource === 'repository'
      ? Boolean(item.collectionActive)
      : collectedItems.has(item.id);
    const reaction = dynamicReactionStates[item.id] || {
      count: item.likeCount || 0,
      isActive: Boolean(item.liked),
    };
    const rememberTrigger = () => {
      if (document.activeElement instanceof HTMLButtonElement) {
        overlayTriggerRef.current = document.activeElement;
      }
    };
    return (
      <article
        className="home-book-card"
        data-book-format={originalFormat || undefined}
        key={item.id}
        onClick={(event) => {
          if (shouldIgnoreCardNavigation(event.target)) return;
          navigate(itemPath(item));
        }}
      >
        <Link className="home-book-cover" to={itemPath(item)} aria-label={t('home.actions.viewBook', { title: item.title })}>
          {item.coverUrl ? (
            <img src={item.coverUrl} alt="" loading="lazy" />
          ) : (
            <Icon name="book" />
          )}
        </Link>
        <div className="home-book-main">
          <div className="stream-card-topline home-book-topline">
            <TypeMetaCategory type="book" label={t('contentTypes.book')} />
            {itemTags.length ? (
              <div
                className="stream-topline-tags tag-row home-book-topline-tags"
                onWheel={scrollTagsOnWheel}
                aria-label={t('home.actions.bookTags')}
              >
                {itemTags.map((tag) => (
                  <Link
                    aria-label={t('home.actions.viewTag', { tag: tag.label })}
                    key={tag.key}
                    to={tag.path}
                  >
                    {tag.label}
                  </Link>
                ))}
              </div>
            ) : null}
            <CardExactTime item={item} />
          </div>
          <h2>
            <Link to={itemPath(item)}>
              <MathInline text={book?.bookTitle || item.title} />
            </Link>
          </h2>
          <p className="stream-meta stream-author-meta book-author-links home-book-author">
            {bookAuthorNodes(item, t, avatarForItem(item), rankForItem(item))}
          </p>
          <div className="home-book-meta">
            {book?.seriesTitle ? <span>{book.seriesTitle}</span> : null}
            {Number.isFinite(pageCount) && pageCount > 0 ? (
              <span>
                {t('home.book.pageCount', {
                  count: pageCount,
                  displayCount: formatNumber(locale, pageCount),
                })}
              </span>
            ) : null}
          </div>
          {item.excerpt ? <p className="stream-excerpt"><MathInline text={item.excerpt} /></p> : null}
        </div>
        <div className="home-book-footer">
          <div className="stream-metrics home-book-metrics">
            <span className={metricToneClass(item.type, 'bookScore')}>{scoreMetric}</span>
            <span>{readMetric}</span>
          </div>
          <div className="home-book-actions home-card-actions">
            <CardActionButton
              icon={hasRated ? 'star-fill' : 'star'}
              label={t('home.actions.rating')}
              value={item.bookRating?.reviewCount ?? 0}
              active={hasRated}
              tone="rating"
              onClick={() => {
                rememberTrigger();
                void openBookReview(item);
              }}
            />
            <CardActionButton
              icon={reaction.isActive ? 'heart-fill' : 'heart'}
              label={t('home.actions.like')}
              value={reaction.count}
              active={reaction.isActive}
              toggle
              tone="like"
              disabled={reactionBusyKey === item.id}
              onClick={() => void toggleDynamicLike(item)}
            />
            <CardActionButton
              icon={isCollected ? 'bookmark-check' : 'bookmark'}
              label={t('home.actions.save')}
              value={item.favoriteCount ?? 0}
              active={isCollected}
              toggle
              disabled={busy}
              onClick={() => void collectItem(item)}
            />
            <CardActionButton
              icon="chat-dots"
              label={t('home.actions.comment')}
              value={item.commentCount ?? 0}
              onClick={() => {
                rememberTrigger();
                openComment(item);
              }}
            />
            <CardActionButton
              icon="share"
              label={t('home.actions.share')}
              value={item.shareCount ?? 0}
              disabled={busy}
              onClick={() => void shareItem(item)}
            />
          </div>
        </div>
      </article>
    );
  };

  const renderBoardItem = (item: FeedItem) => {
    const displayType = displayTypeClass(item.type);
    const isDynamic = displayType === 'dynamic';
    const isBook = displayType === 'book';
    if (isBook) {
      return renderBookItem(item);
    }
    const footerMetrics = metricsForItem(item);
    const visibleFooterMetrics = (() => {
      if (displayType === 'blog' || displayType === 'dynamic' || displayType === 'tag') {
        return footerMetrics.filter((metric) => metric.kind === 'read').slice(0, 1);
      }
      if (displayType === 'discussion') {
        return footerMetrics.filter((metric) => ['read', 'lastReply'].includes(metric.kind));
      }
      if (displayType === 'question') {
        return footerMetrics.filter((metric) => metric.kind !== 'favorite');
      }
      return footerMetrics;
    })();
    const itemTags = tagsFor(item);
    const renderToplineTags = () =>
      itemTags.length ? (
        <div
          className="stream-topline-tags tag-row"
          onWheel={scrollTagsOnWheel}
          aria-label={t('home.actions.contentTags')}
        >
          {itemTags.map((tag) => (
            <Link
              aria-label={t('home.actions.viewTag', { tag: tag.label })}
              key={tag.key}
              to={tag.path}
            >
              {tag.label}
            </Link>
          ))}
        </div>
      ) : null;
    return (
      <article
        className={`stream-card stream-card-${displayType}`}
        data-type={displayType}
        key={`${item.type}-${item.revisionId || item.id}`}
        onClick={(event) => {
          if (shouldIgnoreCardNavigation(event.target)) return;
          navigate(itemPath(item));
        }}
      >
        {isDynamic ? (
          <div className="stream-dynamic-head">
            <div className="stream-dynamic-meta-row">
              <div className="stream-card-topline">
                <TypeMetaCategory type={item.type} label={contentTypeLabel(item.type, t)} />
                {renderToplineTags()}
              </div>
              <CardExactTime item={item} />
            </div>
            <div className="stream-dynamic-lead">
              <Link className="stream-author-lead" to={authorProfilePath(item)}>
                <span className="stream-dynamic-avatar" aria-hidden="true">
                  <AvatarImage src={avatarForItem(item)} fallback={shortInitialsFor(item.author)} />
                </span>
                <span className="stream-dynamic-author-name">
                  <span>{item.author}</span>
                  <CultivationBadge rank={rankForItem(item)} />
                </span>
              </Link>
              <span className="stream-dynamic-colon">{t('home.punctuation.authorSeparator')}</span>
              <Link className="stream-dynamic-title" to={itemPath(item)}>
                <MathInline text={item.excerpt || item.title} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="stream-card-head">
            <div className="stream-card-topline">
              <TypeMetaCategory type={item.type} label={contentTypeLabel(item.type, t)} />
              {renderToplineTags()}
            </div>
            <CardExactTime item={item} />
          </div>
        )}
        {!isDynamic ? (
          <h2>
            <Link to={itemPath(item)}>
              <MathInline text={item.title} />
            </Link>
          </h2>
        ) : null}
        {!isDynamic && !isBook ? (
          <p className="stream-meta stream-author-meta">
            {item.authorId ? (
              <UserIdentity
                name={item.author}
                userId={item.authorId}
                imageUrl={avatarForItem(item)}
                rank={rankForItem(item)}
              />
            ) : (
              <Link className="identity-link" to={authorProfilePath(item)}>
              <AvatarName
                name={item.author}
                imageUrl={avatarForItem(item)}
                rank={rankForItem(item)}
              />
              </Link>
            )}
          </p>
        ) : null}
        {isBook ? (
          <p className="stream-meta stream-author-meta book-author-links">
            {bookAuthorNodes(item, t, avatarForItem(item), rankForItem(item))}
          </p>
        ) : null}
        {!isDynamic ? (
          <p className={isDynamic ? 'stream-dynamic-content' : 'stream-excerpt'}>
            <MathInline text={item.excerpt} />
          </p>
        ) : null}
        {displayType === 'blog' && item.coverUrl ? (
          <figure className="stream-blog-cover">
            <img src={item.coverUrl} alt="" loading="lazy" />
          </figure>
        ) : null}
        {displayType === 'discussion' && discussionImagesFor(item).length ? (
          <div
            className={`stream-discussion-images count-${discussionImagesFor(item).length}`}
          >
            {discussionImagesFor(item).map((image, index) => (
              <Link
                to={itemPath(item)}
                className="stream-discussion-image"
                key={`${image}-${index}`}
              >
                <img src={image} alt="" loading="lazy" />
              </Link>
            ))}
          </div>
        ) : null}
        <div className="stream-footer">
          <div className="stream-metrics">
            {visibleFooterMetrics.map((metric) => (
              <span
                className={metricToneClass(item.type, metric)}
                key={metric.kind === 'lastReply' ? metric.date.toISOString() : metric.kind}
              >
                {homeMetricLabel(metric, locale, t)}
              </span>
            ))}
          </div>
          {item.type === 'tag' ? renderTagSocialActions(item) : renderSocialActions(item)}
        </div>
      </article>
    );
  };

  const communitySummary = communityView === 'graph'
    ? knowledgeGraph
      ? t('home.graph.summary', {
        nodes: formatNumber(locale, knowledgeGraph.nodes.length),
        edges: formatNumber(locale, knowledgeGraph.edges.length),
      })
      : knowledgeGraphLoading
        ? t('home.graph.syncing')
        : t('home.graph.fallback')
    : communityView === 'books'
      ? bookLoading
        ? t('home.graph.syncing')
        : t('home.book.count', {
          count: bookItems.length,
          displayCount: formatNumber(locale, bookItems.length),
        })
      : communityView === 'tags'
        ? tagActivityLoading
          ? t('home.graph.syncing')
          : t('home.book.tagActivityCount', {
            count: visibleTagActivityItems.length,
            displayCount: formatNumber(locale, visibleTagActivityItems.length),
          })
        : '';

  return (
    <>
      <DocumentMetadataController metadata={{
        title: homeSeoTitle,
        description: homeSeoDescription,
        canonicalPath: '/',
        openGraphType: 'website',
        jsonLd: homeSeoJsonLd,
      }} />
      <SiteTopbar onSessionChange={handleSessionChange} />
      {status || error ? (
        <div aria-live="polite" aria-atomic="true">
          
          
        </div>
      ) : null}
      {collectionDialogItem ? (
        <Suspense fallback={null}>
          <CollectionFolderDialog
            open
            title={t('home.collection.title')}
            initialFolderId=""
            confirmLabel={t('home.collection.confirm')}
            busy={busy}
            error={collectionDialogError}
            onClose={() => {
              if (busy) return;
              setCollectionDialogError('');
              setCollectionDialogItem(null);
            }}
            onConfirm={(folderId, folder) => void saveItemToCollectionFolder(folderId, folder)}
          />
        </Suspense>
      ) : null}
      <ContentCommentDialog
        target={commentTarget}
        canWrite={Boolean(user)}
        viewer={homeCommentViewer(user, t)}
        onOpenChange={(open) => {
          if (open) return;
          setCommentTarget(null);
          window.requestAnimationFrame(() => overlayTriggerRef.current?.focus());
        }}
        onChanged={(commentCount) => {
          if (commentTarget) {
            updateCommentCountInFeed(commentTarget, commentCount);
          }
        }}
        onMessage={(kind, message) => {
          if (kind === 'error') setError(message);
          else setStatus(message);
        }}
      />
      <BookRatingDialog
        target={bookReviewTarget}
        canWrite={Boolean(user)}
        onOpenChange={(open) => {
          if (open) return;
          setBookReviewTarget(null);
          window.requestAnimationFrame(() => overlayTriggerRef.current?.focus());
        }}
        onRatingChanged={(rating) => {
          if (bookReviewTarget) updateBookRatingInFeed(bookReviewTarget, rating);
        }}
        onMessage={(kind, message) => {
          if (kind === 'error') setError(message);
          else setStatus(message);
        }}
      />

      <Container fluid className="home-shell">
        <main
          className="community-board panel"
          id="feed"
          aria-label={t('home.board.landmark')}
        >
          <div className="panel-heading large home-community-toolbar">
            <div className="community-view-head">
              <AnimateTabs
                className="community-view-tabs-scroll"
                value={communityView}
                onValueChange={(value) => handleCommunityViewChange(value as CommunityView)}
              >
                <AnimateTabsList className="community-view-tabs" aria-label={t('home.board.views')}>
                {communityViews.map((view) => (
                  <AnimateTabsTrigger
                    key={view}
                    value={view}
                  >
                    {t(`home.views.${view}`)}
                  </AnimateTabsTrigger>
                ))}
                </AnimateTabsList>
              </AnimateTabs>
              {communitySummary ? <strong>{communitySummary}</strong> : null}
            </div>
            {communityView === 'stream' ? (
              <AnimateTabs
                className="home-desktop-mode-tabs"
                value={feedMode}
                onValueChange={(value) => handleFeedModeChange(value as FeedMode)}
              >
                <AnimateTabsList className="feed-tabs" aria-label={t('home.board.feedFilter')}>
                {feedModes.map((mode) => (
                  <AnimateTabsTrigger
                    key={mode}
                    value={mode}
                  >
                    {t(`home.modes.${mode}`)}
                  </AnimateTabsTrigger>
                ))}
                </AnimateTabsList>
              </AnimateTabs>
            ) : communityView === 'books' ? (
              <AnimateTabs
                className="home-desktop-mode-tabs"
                value={bookMode}
                onValueChange={(value) => handleBookModeChange(value as BookMode)}
              >
                <AnimateTabsList className="feed-tabs" aria-label={t('home.board.bookFilter')}>
                {bookModes.map((mode) => (
                  <AnimateTabsTrigger
                    key={mode}
                    value={mode}
                  >
                    {t(`home.modes.${mode}`)}
                  </AnimateTabsTrigger>
                ))}
                </AnimateTabsList>
              </AnimateTabs>
            ) : null}
            {communityView === 'stream' ? (
              <Form.Select
                aria-label={t('home.board.feedFilter')}
                className="home-mobile-mode-select"
                value={feedMode}
                onChange={(event) => handleFeedModeChange(event.currentTarget.value as FeedMode)}
              >
                {feedModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`home.modes.${mode}`)}
                  </option>
                ))}
              </Form.Select>
            ) : communityView === 'books' ? (
              <Form.Select
                aria-label={t('home.board.bookFilter')}
                className="home-mobile-mode-select"
                value={bookMode}
                onChange={(event) => handleBookModeChange(event.currentTarget.value as BookMode)}
              >
                {bookModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`home.modes.${mode}`)}
                  </option>
                ))}
              </Form.Select>
            ) : null}
          </div>
          {communityView === 'graph' ? (
            <KnowledgeGraphPanel
              graph={knowledgeGraph}
              loading={knowledgeGraphLoading}
              error={knowledgeGraphError}
              selectedNode={selectedGraphNode}
              onSelectNode={setSelectedGraphNode}
              viewport={knowledgeGraphViewport}
              onViewportChange={setKnowledgeGraphViewport}
            />
          ) : communityView === 'books' ? (
            <>
              {bookError ? <div className="state-strip mb-3">{bookError}</div> : null}
              {bookLoading && !bookItems.length ? (
                <div className="community-grid community-grid-loading">
                  {Array.from({ length: 4 }, (_, index) => (
                    <article className="stream-card stream-card-skeleton" key={index}>
                      <div className="stream-card-head">
                        <div className="stream-badge-group">
                          <span />
                          <strong />
                        </div>
                        <time />
                      </div>
                      <h2 />
                      <p className="stream-excerpt" />
                      <div className="stream-context-row" />
                    </article>
                  ))}
                </div>
              ) : bookItems.length ? (
                <div className="community-grid community-grid-books">
                  {streamUsesTwoColumns
                    ? bookColumns.map((columnItems, columnIndex) => (
                      <div
                        className="community-grid-column"
                        key={`book-column-${columnIndex}`}
                      >
                        {columnItems.map(renderBookItem)}
                      </div>
                    ))
                    : bookItems.map(renderBookItem)}
                </div>
              ) : null}
            </>
          ) : (
            <>
          {communityView === 'tags' && tagActivityError ? (
            <div className="state-strip mb-3">
              {t('home.board.tagSyncFailed', { error: tagActivityError })}
            </div>
          ) : null}
          {communityView !== 'tags' && feedError ? (
            <div className="state-strip mb-3">
              {t('home.board.usingLocal', { error: feedError })}
            </div>
          ) : null}
          {communityView !== 'tags' && feedLoading && boardItems.length ? (
            <div className="state-strip compact mb-3">
              {t('home.board.syncingContent')}
            </div>
          ) : null}
          {((communityView === 'tags' && tagActivityLoading) || (communityView !== 'tags' && feedLoading)) && !boardItems.length ? (
            <div className="community-grid community-grid-loading" id="questions">
              {Array.from({ length: 4 }, (_, index) => (
                <article className="stream-card stream-card-skeleton" key={index}>
                  <div className="stream-card-head">
                    <div className="stream-badge-group">
                      <span />
                      <strong />
                    </div>
                    <time />
                  </div>
                  <h2 />
                  <p className="stream-excerpt" />
                  <div className="stream-context-row" />
                  <div className="stream-footer" />
                </article>
              ))}
            </div>
          ) : boardItems.length ? (
            <>
              <div className="community-grid" id="questions">
                {streamUsesTwoColumns
                  ? boardColumns.map((columnItems, columnIndex) => (
                    <div
                      className="community-grid-column"
                      key={`community-column-${columnIndex}`}
                    >
                      {columnItems.map(renderBoardItem)}
                    </div>
                  ))
                  : boardItems.map(renderBoardItem)}
              </div>
              {communityView !== 'tags' ? (
                <div ref={feedLoadMoreRef} className="home-feed-sentinel">
                  {feedLoadingMore ? (
                    <LoadingState variant="compact" />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
            </>
          )}
        </main>

        <aside
          className="right-rail"
          id="community"
          aria-label={communityView === 'graph' ? t('home.rail.graph') : t('home.rail.announcements')}
        >
          {communityView === 'graph' ? (
            <KnowledgeGraphInspector
              graph={knowledgeGraph}
              selectedNode={selectedGraphNode}
            />
          ) : (
            <>
              {user ? renderTodayMetricsCard() : null}
              {renderHotDiscussionCard()}
              {renderFollowRecommendationCard()}
              <section className="panel forum-panel announcement-panel">
                <div className="panel-heading">
                  <span>{t('home.rail.announcements')}</span>
                  <strong>
                    {t('home.rail.announcementCount', {
                      count: announcementItems.length,
                      displayCount: formatNumber(locale, announcementItems.length),
                    })}
                  </strong>
                </div>
                {announcementItems.length ? (
                  <div className="compact-list">
                    {announcementItems.map(renderSidebarCompactItem)}
                  </div>
                ) : (
                  <div className="state-strip">{t('home.rail.emptyAnnouncements')}</div>
                )}
              </section>
              <section className="panel tag-panel">
                <div className="panel-heading">
                  <span>{t('home.rail.followedTags')}</span>
                  <strong>
                    {followedTagsLoading
                      ? t('home.graph.syncing')
                      : formatNumber(locale, sidebarFollowedTags.length)}
                  </strong>
                </div>
                <div className="tag-cloud">
                  {sidebarFollowedTags.map((tag) => (
                    <Link key={tag.tagId || tag.slugName} to={followedTagPath(tag)}>
                      {tag.displayName}
                    </Link>
                  ))}
                </div>
                {!followedTagsLoading && !sidebarFollowedTags.length ? (
                  <div className="state-strip compact">
                    {user ? t('home.rail.emptyFollowed') : t('home.rail.signInFollowed')}
                  </div>
                ) : null}
              </section>
              <section className="panel sponsor-rail-panel">
                <Link className="panel-heading sponsor-rail-heading-link" to="/sponsor" aria-label={t('home.rail.sponsor')}>
                  <span>{t('home.rail.sponsor')}</span>
                  <strong>{t('home.rail.support')}</strong>
                </Link>
                <UserPresenceAvatar users={sponsorAvatars} label={t('home.rail.supporters')} />
              </section>
              <a
                className="panel sponsor-rail-link github-stars-rail-link"
                href="https://github.com/orgs/rinspacehq/repositories?type=source"
                target="_blank"
                rel="noreferrer"
                aria-label={t('home.rail.openSourceStars')}
              >
                <span className="panel-heading github-stars-rail-title">GITHUB</span>
                <AnimateGithubStars
                  value={openSourceStars ?? 0}
                  loading={openSourceStars === null}
                  label={t('home.rail.openSourceStars')}
                />
              </a>
              <SiteIcpLink />
            </>
          )}
        </aside>
      </Container>
    </>
  );
}

export default HomePage;

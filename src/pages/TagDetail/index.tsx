import { AnimateButton , useNoticeToasts } from 'components/ui';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import SiteIcpLink from "@/components/SiteIcpLink";
import SiteTopbar from "@/components/SiteTopbarShell";

import AvatarName from "@/components/AvatarName";
import CardActionButton from '@/components/CardActionButton';
import DocumentMetadataController, { absolutePublicUrl } from '@/components/DocumentMetadataController';
import LoadingState from "@/components/LoadingState";
import MathText, { MathInline } from "@/components/MathText";
import TagKnowledgeConnections from '@/features/tags/TagKnowledgeConnections';
import { formatDate, formatList, formatNumber } from '@/i18n/format';
import {
  feedPresentationDate,
  feedPresentationMetrics,
  type FeedPresentationMetric,
} from '@/i18n/feedPresentation';
import { useLanguage, useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadBookFeed, loadContentFeed } from '@/services/domains/article';
import { followTarget, likePost } from '@/services/domains/discussion';
import { listRevisions } from '@/services/domains/moderation';
import { loadAnswerQuestionPage } from '@/services/domains/question';
import { loadTagCultivations, loadTagDetail, loadTagPage, loadTagStats } from '@/services/domains/tag';
import type { AnswerQuestionInfo, AnswerQuestionPageInput, FeedItem, ObjectReferenceSummary, RevisionSummary, TagCultivationUser, TagDetail, TagPageItem, TagReferenceSummary, TagStats } from '@/services/contracts';
import { messageFromError } from "@/services/errors";
import { useRinPageContext } from "@/utils/rinPageContext";
import { sanitizeReaderHtml } from "@/utils/sanitizeHtml";
import {
  contentPath,
  legacyTagPath,
  profilePath as routeProfilePath,
  questionPath as routeQuestionPath,
  tagReadPath,
  tagWikiPath,
} from "@/utils/routes";
import {
  enhanceWikiTagLinks,
  extractWikiTagReferences,
  polishRinBibliographyHtml,
  stripRinDocumentTitle,
  wikiPlainTextFromHtml,
  type WikiResolvedReference,
  type WikiTagReference,
} from "@/utils/wikiLinks";

type QuestionOrder = Exclude<
  NonNullable<AnswerQuestionPageInput["order"]>,
  "recommend"
>;
type ContentTab =
  | "wiki"
  | "all"
  | "blog"
  | "book";
type TagSort = "hot" | "asc" | "desc";
type CombinedTagItem =
  | { kind: "content"; item: FeedItem }
  | { kind: "question"; item: AnswerQuestionInfo };
type WikiReferenceLink = {
  kind: string;
  slug: string;
  label: string;
  section: string;
  href: string;
  resolved: boolean;
};

function tagSearchGraph(tag: TagDetail, contentItems: FeedItem[]) {
  const canonical = absolutePublicUrl(tagReadPath(tag.id, tag.slugName || tagName(tag)));
  const pageId = `${canonical}#webpage`;
  const entityId = `${canonical}#entity`;
  const term: Record<string, unknown> = {
    '@type': 'DefinedTerm', '@id': entityId, name: tagName(tag),
    description: tag.usageExcerpt || tag.excerpt || undefined, url: canonical,
  };
  const broader = tag.parentTags.slice(0, 12).map((parent) => {
    const url = absolutePublicUrl(tagReadPath(parent.tagId, parent.slugName || parent.displayName));
    return { '@type': 'DefinedTerm', '@id': `${url}#entity`, name: parent.displayName || parent.slugName };
  });
  if (broader.length) term.inDefinedTermSet = broader;
  const related = tag.outgoingReferences.slice(0, 16).map((reference) => {
    const url = absolutePublicUrl(tagReadPath(reference.targetTagId, reference.targetSlugName || reference.targetDisplayName));
    return { '@type': 'DefinedTerm', '@id': `${url}#entity`, name: reference.targetDisplayName || reference.targetSlugName };
  });
  if (related.length) term.relatedLink = related;
  const hasPart = contentItems
    .filter((item) => item.type === 'blog' || item.type === 'book')
    .slice(0, 12)
    .map((item) => {
      const url = absolutePublicUrl(contentPath(item.type, item.id, item.title));
      return { '@type': item.type === 'book' ? 'Book' : 'BlogPosting', '@id': `${url}#entity`, name: item.title, url };
    });
  const page: Record<string, unknown> = {
    '@type': 'CollectionPage', '@id': pageId, name: tagName(tag), url: canonical,
    mainEntity: { '@id': entityId },
  };
  if (hasPart.length) page.hasPart = hasPart;
  return { '@context': 'https://schema.org', '@graph': [page, term] };
}
type WikiContributor = {
  key: string;
  userId: string;
  author: string;
  authorAvatar?: string;
  editCount: number;
  firstEditedAt: string;
  lastEditedAt: string;
  latestReason: string;
  created: boolean;
};

const sortOptions: TagSort[] = ["hot", "asc", "desc"];

const contentTabs: ContentTab[] = ["wiki", "all", "blog", "book"];

function tagName(
  tag: Pick<TagDetail | TagPageItem, "displayName" | "slugName">,
) {
  return tag.displayName.trim() || tag.slugName;
}

function dateLabel(locale: 'zh-CN' | 'en', value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(locale, date, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function revisionTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function revisionContributorKey(revision: RevisionSummary) {
  return (
    revision.userId.trim() ||
    revision.author.trim() ||
    `revision-${revision.id}`
  );
}

function isCreateRevision(revision: RevisionSummary) {
  const text = `${revision.reason} ${revision.title}`.toLowerCase();
  return (
    text.includes("create") ||
    text.includes("initial tag") ||
    text.includes("\u521b\u5efa")
  );
}

function buildWikiContributors(revisions: RevisionSummary[]) {
  const contributors = new Map<string, WikiContributor>();
  revisions.forEach((revision) => {
    const key = revisionContributorKey(revision);
    const current = contributors.get(key);
    const editedAt = revision.updatedAt || revision.createdAt;
    if (!current) {
      contributors.set(key, {
        key,
        userId: revision.userId.trim(),
        author: revision.author.trim() || revision.userId.trim() || "system",
        authorAvatar: revision.authorAvatar,
        editCount: 1,
        firstEditedAt: editedAt,
        lastEditedAt: editedAt,
        latestReason: revision.reason.trim(),
        created: isCreateRevision(revision),
      });
      return;
    }
    current.editCount += 1;
    if (revisionTime(editedAt) < revisionTime(current.firstEditedAt)) {
      current.firstEditedAt = editedAt;
    }
    if (revisionTime(editedAt) >= revisionTime(current.lastEditedAt)) {
      current.lastEditedAt = editedAt;
      current.latestReason = revision.reason.trim();
    }
    if (!current.authorAvatar && revision.authorAvatar) {
      current.authorAvatar = revision.authorAvatar;
    }
    current.created = current.created || isCreateRevision(revision);
  });
  return Array.from(contributors.values()).sort((left, right) => {
    if (left.created !== right.created) return left.created ? -1 : 1;
    if (left.editCount !== right.editCount)
      return right.editCount - left.editCount;
    return revisionTime(right.lastEditedAt) - revisionTime(left.lastEditedAt);
  });
}

function questionDateLabel(locale: 'zh-CN' | 'en', seconds: number) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(locale, date, {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeSort(value: string | null): TagSort {
  return sortOptions.includes(value as TagSort)
    ? (value as TagSort)
    : "hot";
}

function questionOrderFromSort(sort: TagSort): QuestionOrder {
  if (sort === "asc") return "newest";
  if (sort === "desc") return "active";
  return "hot";
}

function questionPath(question: AnswerQuestionInfo) {
  return routeQuestionPath(question.id, question.title);
}

function profilePath(question: AnswerQuestionInfo) {
  const author = question.user_info?.username || question.user_info?.id || "";
  return author ? routeProfilePath(author) : "/users";
}

function authorLabel(question: AnswerQuestionInfo) {
  return (
    question.user_info?.display_name ||
    question.user_info?.username ||
    "Rinspace"
  );
}

function statusKey(question: AnswerQuestionInfo) {
  if (question.accepted_answer_id && question.accepted_answer_id !== "0")
    return "accepted";
  if (question.answer_count === 0) return "awaitingAnswer";
  if (question.status !== 1) return "closed";
  return "discussing";
}

function questionTagLabel(tag: AnswerQuestionInfo["tags"][number]) {
  return tag.display_name.trim() || tag.slug_name;
}

function contentTabFromParam(value: string | null): ContentTab {
  return contentTabs.includes(value as ContentTab)
    ? (value as ContentTab)
    : "wiki";
}

function normalizeTagRouteToken(value: string | number | undefined | null) {
  return String(value || "")
    .trim()
    .normalize("NFKC")
    .toLowerCase();
}

function tagMatchesCurrentRoute(
  tag: TagDetail,
  routeTagId: string,
  routeTagName: string,
) {
  if (routeTagId) {
    const normalizedRouteId = normalizeTagRouteToken(routeTagId);
    return (
      normalizeTagRouteToken(tag.tagId) === normalizedRouteId ||
      normalizeTagRouteToken(tag.id) === normalizedRouteId
    );
  }

  const normalizedRouteName = normalizeTagRouteToken(routeTagName);
  if (!normalizedRouteName) return false;
  return [tag.slugName, tag.slug, tag.name, tag.displayName].some(
    (candidate) => normalizeTagRouteToken(candidate) === normalizedRouteName,
  );
}

function feedItemPath(item: FeedItem) {
  return contentPath(item.type, item.id, item.title);
}

function feedItemTimestamp(item: FeedItem) {
  return feedPresentationDate(item)?.getTime() ?? 0;
}

function feedMetricLabel(
  metric: FeedPresentationMetric,
  locale: 'zh-CN' | 'en',
  t: TFunction<'reader'>,
) {
  return t(`tagDetail.metrics.${metric.kind}`, {
    count: metric.value,
    displayCount: formatNumber(locale, metric.value),
  });
}

function feedItemMetricLabels(
  item: FeedItem,
  locale: 'zh-CN' | 'en',
  t: TFunction<'reader'>,
) {
  return feedPresentationMetrics(item).map((metric) => feedMetricLabel(metric, locale, t));
}

function feedItemMetricSummary(
  item: FeedItem,
  locale: 'zh-CN' | 'en',
  t: TFunction<'reader'>,
) {
  return formatList(locale, feedItemMetricLabels(item, locale, t), {
    style: 'short',
    type: 'conjunction',
  });
}

function feedItemDateLabel(item: FeedItem, locale: 'zh-CN' | 'en') {
  const date = feedPresentationDate(item);
  return date ? dateLabel(locale, date.toISOString()) : '';
}

function questionTimestamp(item: AnswerQuestionInfo) {
  return (item.update_time || item.create_time || 0) * 1000;
}

function sortFeedItems(items: FeedItem[], sort: TagSort, locale: 'zh-CN' | 'en') {
  if (sort === "asc") {
    return [...items].sort((left, right) => (
      feedItemTimestamp(left) - feedItemTimestamp(right)
      || left.title.localeCompare(right.title, locale)
    ));
  }
  if (sort === "desc") {
    return [...items].sort((left, right) => (
      feedItemTimestamp(right) - feedItemTimestamp(left)
      || right.title.localeCompare(left.title, locale)
    ));
  }
  return items;
}

function combinedItemTimestamp(entry: CombinedTagItem) {
  return entry.kind === "content"
    ? feedItemTimestamp(entry.item)
    : questionTimestamp(entry.item);
}

function combinedItemTitle(entry: CombinedTagItem) {
  return entry.item.title;
}

function sortCombinedTagItems(items: CombinedTagItem[], sort: TagSort, locale: 'zh-CN' | 'en') {
  if (sort === "asc") {
    return [...items].sort((left, right) => (
      combinedItemTimestamp(left) - combinedItemTimestamp(right)
      || combinedItemTitle(left).localeCompare(combinedItemTitle(right), locale)
    ));
  }
  if (sort === "desc") {
    return [...items].sort((left, right) => (
      combinedItemTimestamp(right) - combinedItemTimestamp(left)
      || combinedItemTitle(right).localeCompare(combinedItemTitle(left), locale)
    ));
  }
  return items;
}

function feedItemTypeKey(item: FeedItem) {
  if (item.type === "announcement" || item.forumAnnouncement) return "announcement";
  if (item.type === "book") return "book";
  if (item.type === "blog") return "blog";
  if (item.type === "discussion" || item.type === "forum") return "discussion";
  if (item.type === "dynamic" || item.type === "status") return "dynamic";
  if (item.type === "question") return "question";
  return "content";
}

function isQuestionFeedItem(item: FeedItem) {
  return item.type === "question";
}

function countForTab(
  stats: TagStats | null,
  tab: ContentTab,
  fallback: number,
) {
  if (!stats) return fallback;
  if (tab === "wiki") return 0;
  if (tab === "all") return stats.total;
  if (tab === "blog") return stats.blogs;
  return fallback;
}

function wikiTagReferencePath(
  id: string | number | undefined,
  slug: string,
  display: string,
  section = "",
) {
  const idText = String(id || "").trim();
  if (/^\d+$/.test(idText)) {
    return withSection(tagWikiPath(idText, slug || display || idText), section);
  }
  const wikiSlug = (slug || display).trim();
  if (wikiSlug && !/^\d+$/.test(wikiSlug)) {
    return withSection(`${legacyTagPath(wikiSlug)}/info`, section);
  }
  return withSection(legacyTagPath(idText || display || slug), section);
}

function withSection(href: string, section = "") {
  return section ? `${href}#${encodeURIComponent(section)}` : href;
}

function objectReferencePath(reference: ObjectReferenceSummary) {
  const label =
    reference.targetDisplayName || reference.label || reference.targetKey;
  if (reference.targetType === "tag") {
    return wikiTagReferencePath(
      reference.targetId,
      reference.targetSlugName ||
        reference.targetKey.replace(/^tag:/, "").replace(/^tags\//, ""),
      label,
      reference.section,
    );
  }
  if (reference.targetType === "blog" || reference.targetType === "book") {
    return withSection(
      contentPath(
        reference.targetType,
        reference.targetId || reference.targetKey.replace(/^[^/]+\//, ""),
        label,
      ),
      reference.section,
    );
  }
  return reference.href || "#";
}

function objectReferenceLabel(reference: ObjectReferenceSummary) {
  const slug =
    reference.targetSlugName ||
    reference.targetKey.replace(/^tag:/, "").replace(/^tags\//, "");
  return cleanReferenceLabel(
    reference.label,
    reference.targetDisplayName,
    slug,
    reference.targetKey,
  );
}

function cleanReferenceLabel(
  label: string,
  display: string,
  slug: string,
  key = "",
) {
  const value = label.trim();
  const lower = value.toLowerCase();
  if (
    !value ||
    value === slug ||
    value === key ||
    value === key.replace(/^tags\//, "") ||
    value.startsWith("tags/") ||
    value.startsWith("tag:") ||
    value.includes("/tags/") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://")
  ) {
    return display || slug || key || value;
  }
  return value;
}

function objectReferenceResolution(
  reference: ObjectReferenceSummary,
): WikiResolvedReference | null {
  if (!reference.targetKey) return null;
  return {
    key: reference.section
      ? `${reference.targetKey}#${reference.section}`
      : reference.targetKey,
    label: objectReferenceLabel(reference),
    href: objectReferencePath(reference),
    resolved: reference.resolved,
  };
}

function objectReferenceResolutions(references: ObjectReferenceSummary[]) {
  return references
    .map(objectReferenceResolution)
    .filter(
      (reference): reference is WikiResolvedReference => reference !== null,
    );
}

function outgoingReferenceFromObject(
  reference: ObjectReferenceSummary,
): WikiReferenceLink | null {
  if (reference.targetType !== "tag") return null;
  const slug =
    reference.targetSlugName ||
    reference.targetId ||
    reference.targetKey.replace(/^tag:/, "").replace(/^tags\//, "");
  if (!slug) return null;
  const display = reference.targetDisplayName || slug;
  return {
    kind: "tag",
    slug,
    label: cleanReferenceLabel(
      reference.label,
      display,
      slug,
      reference.targetKey,
    ),
    section: reference.section,
    href: objectReferencePath(reference),
    resolved: reference.resolved,
  };
}

function outgoingReferenceFromTag(
  reference: TagReferenceSummary,
): WikiReferenceLink {
  const slug = reference.targetSlugName;
  const display = reference.targetDisplayName || slug;
  return {
    kind: "tag",
    slug,
    label: cleanReferenceLabel(reference.label, display, slug),
    section: reference.section,
    href: wikiTagReferencePath(
      reference.targetTagId,
      slug,
      display,
      reference.section,
    ),
    resolved: reference.resolved,
  };
}

function outgoingReferenceFromClient(
  reference: WikiTagReference,
): WikiReferenceLink | null {
  if (reference.kind && reference.kind !== "tag") return null;
  const slug = reference.slug || reference.tagId || "";
  if (!slug) return null;
  const targetKey = reference.tagId
    ? `tags/${reference.tagId}`
    : reference.slug;
  const display = reference.slug || reference.tagId || reference.label;
  const label = cleanReferenceLabel(reference.label, display, slug, targetKey);
  return {
    kind: "tag",
    slug,
    label,
    section: reference.section,
    href: wikiTagReferencePath(
      reference.tagId,
      reference.slug || slug,
      label,
      reference.section,
    ),
    resolved: true,
  };
}

function incomingReferenceFromObject(
  reference: ObjectReferenceSummary,
): WikiReferenceLink | null {
  if (reference.sourceType !== "tag") return null;
  const slug = reference.sourceSlugName || reference.sourceId;
  if (!slug) return null;
  const display = reference.sourceDisplayName || slug;
  return {
    kind: "tag",
    slug,
    label: display,
    section: "",
    href: wikiTagReferencePath(reference.sourceId, slug, display),
    resolved: true,
  };
}

function incomingReferenceFromTag(
  reference: TagReferenceSummary,
): WikiReferenceLink {
  const slug = reference.sourceSlugName;
  const display = reference.sourceDisplayName || slug;
  return {
    kind: "tag",
    slug,
    label: display,
    section: "",
    href: wikiTagReferencePath(reference.sourceTagId, slug, display),
    resolved: true,
  };
}

function uniqueReferenceLinks(references: WikiReferenceLink[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.slug}#${reference.section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tagOutgoingReferenceLinks(tag: TagDetail) {
  return uniqueReferenceLinks([
    ...tag.outgoingObjectReferences
      .map(outgoingReferenceFromObject)
      .filter(
        (reference): reference is WikiReferenceLink => reference !== null,
      ),
    ...tag.outgoingReferences.map(outgoingReferenceFromTag),
  ]);
}

function tagIncomingReferenceLinks(tag: TagDetail) {
  return uniqueReferenceLinks([
    ...tag.incomingObjectReferences
      .map(incomingReferenceFromObject)
      .filter(
        (reference): reference is WikiReferenceLink => reference !== null,
      ),
    ...tag.incomingReferences.map(incomingReferenceFromTag),
  ]);
}

export function TagDetailWikiArticle({
  tag,
  intro,
}: {
  tag: TagDetail;
  intro: string;
}) {
  const { t } = useFeatureTranslation('reader');
  const wikiHtml = useMemo(
    () =>
      sanitizeReaderHtml(
        polishRinBibliographyHtml(
          enhanceWikiTagLinks(
            stripRinDocumentTitle(tag.html || tag.parsedText),
            objectReferenceResolutions(tag.outgoingObjectReferences),
          ),
        ),
        { rendererFinal: tag.rendererFinal },
      ),
    [tag.html, tag.parsedText, tag.outgoingObjectReferences, tag.rendererFinal],
  );
  const clientOutgoingReferences = useMemo(
    () =>
      extractWikiTagReferences(wikiHtml)
        .map(outgoingReferenceFromClient)
        .filter(
          (reference): reference is WikiReferenceLink => reference !== null,
        ),
    [wikiHtml],
  );
  const outgoingReferences = useMemo(
    () =>
      uniqueReferenceLinks([
        ...tagOutgoingReferenceLinks(tag),
        ...clientOutgoingReferences,
      ]),
    [tag, clientOutgoingReferences],
  );
  const incomingReferences = useMemo(
    () => tagIncomingReferenceLinks(tag),
    [tag],
  );

  return (
    <section
      className="tag-detail-wiki-article detail-blog"
      aria-label={t('tagDetail.wikiLabel')}
    >
      <div className="tag-detail-wiki-head">
        <span>Wiki</span>
        <div className="tag-detail-wiki-actions">
          <Link to={tagWikiPath(tag.id, tag.slugName || tagName(tag))}>
            {t('tagDetail.details')}
          </Link>
        </div>
      </div>
      <div className="tag-detail-wiki-body detail-body">
        {wikiHtml ? (
          <div
            className="rin-writer-html tag-detail-wiki-html"
            dangerouslySetInnerHTML={{ __html: wikiHtml }}
          />
        ) : (
          <MathText text={intro} />
        )}
      </div>
      <div className="wiki-entry-footer compact">
        <section>
          <h2>{t('tagDetail.outgoing')}</h2>
          {outgoingReferences.length ? (
            <div className="wiki-reference-row">
              {outgoingReferences.map((reference) => (
                <Link
                  to={reference.href}
                  key={`${reference.kind}:${reference.slug}#${reference.section}`}
                >
                  {reference.label}
                  {!reference.resolved ? t('tagDetail.uncreated') : ""}
                </Link>
              ))}
            </div>
          ) : (
            <p>{t('tagDetail.emptyOutgoing')}</p>
          )}
        </section>
        <section>
          <h2>{t('tagDetail.incoming')}</h2>
          {incomingReferences.length ? (
            <div className="wiki-reference-row">
              {incomingReferences.slice(0, 8).map((reference) => (
                <Link
                  to={reference.href}
                  key={`${reference.kind}:${reference.slug}#${reference.section}`}
                >
                  {reference.label}
                </Link>
              ))}
            </div>
          ) : (
            <p>{t('tagDetail.emptyIncoming')}</p>
          )}
        </section>
      </div>
    </section>
  );
}

export function TagSocialActions({
  isLiked,
  likeCount,
  likeBusy,
  isFollower,
  followCount,
  followBusy,
  repositoryReady,
  onLike,
  onFollow,
}: {
  isLiked: boolean;
  likeCount: number;
  likeBusy: boolean;
  isFollower: boolean;
  followCount: number;
  followBusy: boolean;
  repositoryReady: boolean;
  onLike: () => void;
  onFollow: () => void;
}) {
  const { t } = useFeatureTranslation('reader');
  const resolvedLocale = useResolvedLocale();

  return (
    <div className="tag-detail-follow-row home-card-actions" aria-label={t('tagDetail.interactions')}>
      <CardActionButton
        icon={isLiked ? "heart-fill" : "heart"}
        label={isLiked ? t('tagDetail.liked') : t('tagDetail.like')}
        value={formatNumber(resolvedLocale, likeCount)}
        active={isLiked}
        toggle
        tone="like"
        iconSize="1.25rem"
        disabled={likeBusy || !repositoryReady}
        onClick={onLike}
      />
      <CardActionButton
        icon={isFollower ? "bookmark-check" : "bookmark"}
        label={isFollower ? t('tagDetail.following') : t('tagDetail.follow')}
        value={formatNumber(resolvedLocale, followCount)}
        active={isFollower}
        toggle
        iconSize="1.25rem"
        disabled={followBusy || !repositoryReady}
        onClick={onFollow}
      />
    </div>
  );
}

function TagDetailPage() {
  const { t } = useFeatureTranslation('reader');
  const { resolvedLocale } = useLanguage();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawRouteTagId = decodeURIComponent(params.tagId || "").trim();
  const rawRouteTagName = decodeURIComponent(params.tagName || "").trim();
  const routeTagId =
    rawRouteTagId || (/^\d+$/.test(rawRouteTagName) ? rawRouteTagName : "");
  const routeTagName = routeTagId ? "" : rawRouteTagName;
  const tagLookup = routeTagId || routeTagName;
  const sort = normalizeSort(
    searchParams.get("sort") || searchParams.get("order"),
  );
  const order = questionOrderFromSort(sort);
  const activeTab = contentTabFromParam(searchParams.get("type"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 12;

  const [tag, setTag] = useState<TagDetail | null>(null);
  const [tagState, setTagState] = useState<TagPageItem | null>(null);
  const [tagStats, setTagStats] = useState<TagStats | null>(null);
  const [tagCultivations, setTagCultivations] = useState<TagCultivationUser[]>(
    [],
  );
  const [wikiContributors, setWikiContributors] = useState<WikiContributor[]>(
    [],
  );
  const [tagQuestions, setTagQuestions] = useState<AnswerQuestionInfo[]>([]);
  const [tagContentItems, setTagContentItems] = useState<FeedItem[]>([]);
  const [tagContentCount, setTagContentCount] = useState(0);
  const [loadedQuestionCount, setLoadedQuestionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState("");
  useNoticeToasts({
    error,
    followError,
    likeError,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setFollowError("");
    setLikeError("");
    setTag(null);
    setTagState(null);
    setTagStats(null);
    setTagCultivations([]);
    setWikiContributors([]);
    setTagQuestions([]);
    setTagContentItems([]);
    setTagContentCount(0);
    setLoadedQuestionCount(0);

    if (!tagLookup) {
      setError(messageFromError(null, 'reader.tagLoadFailed'));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const aggregatePageSize = page * pageSize;
    const contentPage = activeTab === "all" ? 1 : page;
    const contentPageSize = activeTab === "all" ? aggregatePageSize : pageSize;
    const questionPage = activeTab === "all" ? 1 : page;
    const questionPageSize = activeTab === "all" ? aggregatePageSize : pageSize;
    const contentType = activeTab === "blog" ? "blog" : undefined;
    const shouldLoadContent = activeTab !== "wiki";
    const shouldLoadQuestions = activeTab === "all";
    void loadTagDetail(
      routeTagId ? { tagId: routeTagId } : { name: routeTagName },
    )
      .then(async (detail) => {
        const detailSlug = detail.slugName;
        const [
          tagPage,
          stats,
          cultivations,
          revisions,
          questions,
          contentResult,
        ] = await Promise.all([
          loadTagPage({ slugName: detailSlug, page: 1, pageSize: 1 }),
          loadTagStats({ tagId: detail.tagId, name: detailSlug }),
          loadTagCultivations({
            tagId: detail.tagId,
            name: detailSlug,
            page: 1,
            pageSize: 6,
          }),
          listRevisions({
            objectType: "tag",
            objectId: detail.id,
            limit: 30,
          }).catch(() => []),
          shouldLoadQuestions
            ? loadAnswerQuestionPage({
                tagId: detail.tagId,
                tag: detailSlug,
                order,
                page: questionPage,
                pageSize: questionPageSize,
              })
            : Promise.resolve({
                count: 0,
                items: [],
                page,
                pageSize,
                generatedAt: "",
              }),
          shouldLoadContent
            ? activeTab === "book"
              ? loadBookFeed({
                  tagId: detail.tagId,
                  tag: detailSlug,
                  page: contentPage,
                  size: contentPageSize,
                })
              : loadContentFeed({
                  type: contentType,
                  tagId: detail.tagId,
                  tag: detailSlug,
                  page: contentPage,
                  size: contentPageSize,
                })
            : Promise.resolve({
                count: 0,
                items: [],
                page,
                pageSize,
                generatedAt: "",
              }),
        ]);
        if (cancelled) return;
        setTag(detail);
        setTagState(tagPage.items[0] || null);
        setTagStats(stats);
        setTagCultivations(cultivations.items);
        setWikiContributors(buildWikiContributors(revisions).slice(0, 6));
        setTagQuestions(questions.items);
        setTagContentItems(
          activeTab === "all"
            ? contentResult.items.filter((item) => !isQuestionFeedItem(item))
            : contentResult.items,
        );
        setTagContentCount(contentResult.count);
        setLoadedQuestionCount(questions.count);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(messageFromError(loadError, 'reader.tagLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, order, page, routeTagId, routeTagName, tagLookup]);

  useEffect(() => {
    if (!tag) return;
    if (!tagMatchesCurrentRoute(tag, routeTagId, routeTagName)) return;
    const canonicalPath = tagReadPath(tag.id, tag.slugName || tagName(tag));
    const canonicalWithSearch = `${canonicalPath}${location.search}${location.hash}`;
    if (location.pathname !== canonicalPath) {
      navigate(canonicalWithSearch, { replace: true });
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    routeTagId,
    routeTagName,
    tag,
  ]);

  const title = useMemo(() => {
    if (tag) return t('tagDetail.tagDocumentTitle', { tag: tagName(tag) });
    return t('tagDetail.documentTitle');
  }, [t, tag]);

  const isFollower = Boolean(tagState?.isFollower);
  const followCount = tagState?.followCount ?? tag?.followCount ?? 0;
  const isLiked = Boolean(tagState?.isLiked);
  const likeCount = tagState?.likeCount ?? 0;
  const questionCount = tagState?.questionCount ?? tag?.questionCount ?? 0;
  const totalQuestions = Math.max(questionCount, loadedQuestionCount);
  const totalTaggedContent = tagStats?.total ?? totalQuestions;
  const activeContentCount = countForTab(
    tagStats,
    activeTab,
    activeTab === "wiki"
      ? 0
      : activeTab === "all"
          ? totalTaggedContent
          : tagContentCount,
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(activeContentCount / pageSize)),
    [activeContentCount],
  );
  const tagTitle = tag ? tagName(tag) : tagLookup || t('tagDetail.tagFallback');
  const tagIntro = tag
    ? wikiPlainTextFromHtml(tag.usageExcerpt) ||
      wikiPlainTextFromHtml(tag.excerpt) ||
      wikiPlainTextFromHtml(tag.parsedText) ||
      t('tagDetail.searchDescription', { tag: tagTitle })
    : tagTitle;
  const displayedContentItems = useMemo(
    () => sortFeedItems(tagContentItems, sort, resolvedLocale),
    [resolvedLocale, sort, tagContentItems],
  );
  const displayedCombinedItems = useMemo(
    () =>
      sortCombinedTagItems(
        [
          ...tagContentItems.map(
            (item): CombinedTagItem => ({ kind: "content", item }),
          ),
          ...tagQuestions.map(
            (item): CombinedTagItem => ({ kind: "question", item }),
          ),
        ],
        sort,
        resolvedLocale,
      ).slice((page - 1) * pageSize, page * pageSize),
    [page, resolvedLocale, sort, tagContentItems, tagQuestions],
  );
  const rinContextSnapshot = useMemo(() => {
    if (!tag) return undefined;
    const visibleItems =
      activeTab === "all"
        ? displayedCombinedItems.map((entry) =>
            entry.kind === "content"
              ? t('tagDetail.context.item', {
                  type: t(`tagDetail.type.${feedItemTypeKey(entry.item)}`),
                  title: entry.item.title,
                  author: entry.item.author,
                  detail: entry.item.excerpt || feedItemMetricSummary(entry.item, resolvedLocale, t),
                })
          : t('tagDetail.context.item', {
                  type: t('tagDetail.type.question'),
                  title: entry.item.title,
                  author: authorLabel(entry.item),
                  detail: entry.item.description || t(`tagDetail.status.${statusKey(entry.item)}`),
                }),
          )
        : displayedContentItems
            .slice(0, pageSize)
            .map(
              (item) =>
                t('tagDetail.context.item', {
                  type: t(`tagDetail.type.${feedItemTypeKey(item)}`),
                  title: item.title,
                  author: item.author,
                  detail: item.excerpt || feedItemMetricSummary(item, resolvedLocale, t),
                }),
            );
    return {
      kind: "tag" as const,
      id: String(tag.id),
      slug: tag.slugName,
      title: t('tagDetail.context.title', { tag: tagTitle }),
      body: tag.originalText || tag.parsedText || tagIntro,
      excerpt: tag.excerpt || tagIntro,
      sections: [
        {
          title: t('tagDetail.context.statistics'),
          body: [
            t('tagDetail.context.totalContent', { displayCount: formatNumber(resolvedLocale, totalTaggedContent) }),
            t('tagDetail.context.questions', { displayCount: formatNumber(resolvedLocale, totalQuestions) }),
            t('tagDetail.context.blogs', { displayCount: formatNumber(resolvedLocale, tagStats?.blogs ?? 0) }),
            t('tagDetail.context.discussions', { displayCount: formatNumber(resolvedLocale, tagStats?.discussions ?? 0) }),
            t('tagDetail.context.dynamics', { displayCount: formatNumber(resolvedLocale, tagStats?.dynamics ?? 0) }),
            t('tagDetail.context.followers', { displayCount: formatNumber(resolvedLocale, followCount) }),
          ].join(t('tagDetail.context.separator')),
        },
        tagCultivations.length
          ? {
              title: t('tagDetail.context.cultivatedUsers'),
              body: tagCultivations
                .slice(0, 6)
                .map(
                  (user, index) =>
                    t('tagDetail.context.rankedUser', {
                      index: formatNumber(resolvedLocale, index + 1),
                      user: user.displayName || user.username,
                      score: formatNumber(resolvedLocale, user.tagScore),
                    }),
                )
                .join("\n"),
            }
          : undefined,
        visibleItems.length
          ? {
              title: t('tagDetail.context.currentList', {
                type: t(`tagDetail.tabs.${activeTab}`),
                page: formatNumber(resolvedLocale, page),
              }),
              body: visibleItems.slice(0, 12).join("\n"),
            }
          : undefined,
      ].filter((section): section is { title: string; body: string } =>
        Boolean(section),
      ),
      updatedAt: tag.updatedAt,
    };
  }, [
    activeTab,
    displayedCombinedItems,
    displayedContentItems,
    followCount,
    page,
    resolvedLocale,
    tag,
    tagCultivations,
    tagIntro,
    tagStats,
    tagTitle,
    totalQuestions,
    totalTaggedContent,
    t,
  ]);
  useRinPageContext(rinContextSnapshot);

  const updateParams = (next: {
    sort?: TagSort;
    page?: number;
    type?: ContentTab;
  }) => {
    const nextSort = next.sort || sort;
    const nextType = next.type || activeTab;
    const nextPage = next.page || 1;
    const nextParams = new URLSearchParams();
    if (nextType !== "wiki") nextParams.set("type", nextType);
    if (nextSort !== "hot") nextParams.set("sort", nextSort);
    if (nextPage > 1) nextParams.set("page", String(nextPage));
    setSearchParams(nextParams);
  };

  const updatePage = (nextPage: number) => {
    updateParams({ page: Math.min(Math.max(1, nextPage), totalPages) });
  };

  const toggleFollow = async () => {
    if (!tag) return;
    const slugName = tag.slugName || tagLookup;
    setFollowError("");
    setFollowBusy(true);
    try {
      const result = await followTarget({
        targetType: "tag",
        slug: slugName,
        targetId: slugName,
        isCancel: isFollower,
      });
      setTagState((current) => ({
        tagId: current?.tagId || tag.tagId,
        slugName,
        displayName: current?.displayName || tag.displayName,
        description: current?.description || tag.excerpt,
        excerpt: current?.excerpt || tag.excerpt,
        originalText: current?.originalText || tag.originalText,
        parsedText: current?.parsedText || tag.parsedText,
        questionCount: current?.questionCount ?? tag.questionCount,
        followCount: result.followerCount,
        likeCount: current?.likeCount ?? likeCount,
        isFollower: result.following,
        isLiked: current?.isLiked ?? isLiked,
        createdAt:
          current?.createdAt ||
          Math.floor(new Date(tag.createdAt).getTime() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        recommend: current?.recommend ?? false,
        reserved: current?.reserved ?? false,
        usageExcerpt: current?.usageExcerpt || tag.usageExcerpt,
      }));
    } catch (followFailure) {
      setFollowError(messageFromError(followFailure, 'reader.tagFollowFailed'));
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleLike = async () => {
    if (!tag || likeBusy) return;
    setLikeError("");
    setLikeBusy(true);
    try {
      const result = await likePost({
        targetType: "tag",
        targetId: tag.tagId,
        slug: tag.slugName || tagLookup,
        bookmark: !isLiked,
        isCancel: isLiked,
      });
      setTagState((current) => ({
        tagId: current?.tagId || tag.tagId,
        slugName: current?.slugName || tag.slugName || tagLookup,
        displayName: current?.displayName || tag.displayName,
        description: current?.description || tag.excerpt,
        excerpt: current?.excerpt || tag.excerpt,
        originalText: current?.originalText || tag.originalText,
        parsedText: current?.parsedText || tag.parsedText,
        questionCount: current?.questionCount ?? tag.questionCount,
        followCount: current?.followCount ?? followCount,
        likeCount: result.likeCount,
        isFollower: current?.isFollower ?? isFollower,
        isLiked: result.liked,
        createdAt:
          current?.createdAt ||
          Math.floor(new Date(tag.createdAt).getTime() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        recommend: current?.recommend ?? false,
        reserved: current?.reserved ?? false,
        usageExcerpt: current?.usageExcerpt || tag.usageExcerpt,
      }));
    } catch (likeFailure) {
      setLikeError(messageFromError(likeFailure, 'reader.tagLikeFailed'));
    } finally {
      setLikeBusy(false);
    }
  };

  const pagination =
    activeContentCount > pageSize ? (
      <div className="linked-page-pagination">
        <AnimateButton unstyled
          type="button"
          disabled={page <= 1}
          onClick={() => updatePage(page - 1)}
        >
          {t('tagDetail.previous')}
        </AnimateButton>
        <span>
          {formatNumber(resolvedLocale, page)} / {formatNumber(resolvedLocale, totalPages)}
        </span>
        <AnimateButton unstyled
          type="button"
          disabled={page >= totalPages}
          onClick={() => updatePage(page + 1)}
        >
          {t('tagDetail.next')}
        </AnimateButton>
      </div>
    ) : null;

  return (
    <>
      <DocumentMetadataController metadata={{
        title,
        description: tag?.usageExcerpt || tag?.excerpt,
        canonicalPath: tag ? tagReadPath(tag.id, tag.slugName || tagName(tag)) : location.pathname,
        robots: tag?.lifecycle && tag.lifecycle !== 'active' ? 'noindex,follow' : 'index,follow',
        openGraphType: 'website',
        jsonLd: tag ? tagSearchGraph(tag, tagContentItems) : undefined,
      }} />
      <SiteTopbar />

      <main
        className="tag-detail-shell"
        data-rin-public-document="tag"
        data-rin-object-id={tag?.tagId}
        data-rin-public-version={tag?.publicVersion}
        data-rin-content-digest={tag?.contentDigest}
      >
        {loading ? <LoadingState variant="panel" /> : null}

        {tag ? (
          <section className="tag-detail-layout">
            <article className="panel tag-related-panel">
              <header className="tag-detail-content-head">
                <div className="tag-detail-meta-row">
                  <span className="meta-category content-type-meta tag-meta-category">
                    <span>
                      <span className="char">t</span>
                      <span className="label">{t('tagDetail.tagFallback')}</span>
                    </span>
                  </span>
                  <TagSocialActions
                    isLiked={isLiked}
                    likeCount={likeCount}
                    likeBusy={likeBusy}
                    isFollower={isFollower}
                    followCount={followCount}
                    followBusy={followBusy}
                    repositoryReady={tag.repositoryState === undefined || tag.repositoryState === "active"}
                    onLike={() => void toggleLike()}
                    onFollow={() => void toggleFollow()}
                  />
                </div>
                <div className="tag-detail-title-row">
                  <h1>
                    <MathInline text={tagTitle} />
                  </h1>
                </div>
                {tagIntro ? (
                  <p className="tag-detail-intro" data-rin-primary-text="description">
                    <MathInline text={tagIntro} />
                  </p>
                ) : null}
                <p className="tag-detail-intro" data-rin-tag-lifecycle="true">
                  {t('tagDetail.lifecycle', { state: tag.lifecycle || "active" })}
                </p>
                {tag.repositoryState === "pending" ||
                tag.repositoryState === "failed" ? (
                  <p className="tag-detail-intro" role="status">
                    {tag.repositoryState === "pending"
                      ? t('tagDetail.repositoryPending')
                      : t('tagDetail.repositoryFailed')}
                  </p>
                ) : null}
                <div className="tag-detail-control-row">
                  <nav
                    className="tag-detail-content-tabs"
                    aria-label={t('tagDetail.contentTypes')}
                  >
                    {contentTabs.map((tab) => (
                      <AnimateButton unstyled
                        key={tab}
                        type="button"
                        className={activeTab === tab ? "active" : ""}
                        onClick={() => updateParams({ type: tab, page: 1 })}
                      >
                        {t(`tagDetail.tabs.${tab}`)}
                      </AnimateButton>
                    ))}
                  </nav>
                  {activeTab !== "wiki" ? (
                    <nav
                      className="tag-detail-sort-tabs"
                      aria-label={t('tagDetail.sortLabel')}
                    >
                      {sortOptions.map((option) => (
                        <AnimateButton unstyled
                          key={option}
                          type="button"
                          className={sort === option ? "active" : ""}
                          onClick={() =>
                            updateParams({ sort: option, page: 1 })
                          }
                        >
                          {t(`tagDetail.sort.${option}`)}
                        </AnimateButton>
                      ))}
                    </nav>
                  ) : null}
                </div>
              </header>
              {activeTab === "wiki" ? (
                <TagDetailWikiArticle
                  tag={tag}
                  intro={tagIntro}
                />
              ) : activeTab === "all" ? (
                displayedCombinedItems.length ? (
                  <div className="tag-question-list">
                    {displayedCombinedItems.map((entry, index) => {
                      const rowKey =
                        entry.kind === "content"
                          ? `content-${entry.item.id}`
                          : `question-${entry.item.id}`;
                      return entry.kind === "content" ? (
                        <article className="tag-question-row" key={rowKey}>
                          <span className="questions-index">
                            {formatNumber(resolvedLocale, (page - 1) * pageSize + index + 1, { minimumIntegerDigits: 2, useGrouping: false })}
                          </span>
                          <div className="tag-question-body">
                            <div className="stream-card-head">
                              <span>{t(`tagDetail.type.${feedItemTypeKey(entry.item)}`)}</span>
                              <strong>{feedItemMetricLabels(entry.item, resolvedLocale, t)[0]}</strong>
                            </div>
                            <h2>
                              <Link to={feedItemPath(entry.item)}>
                                <MathInline text={entry.item.title} />
                              </Link>
                            </h2>
                            <p className="stream-meta">
                              <Link
                                className="identity-link"
                                to={routeProfilePath(
                                  entry.item.authorId ||
                                    entry.item.authorUid ||
                                    entry.item.author,
                                )}
                              >
                                <AvatarName
                                  name={entry.item.author}
                                  imageUrl={entry.item.authorAvatar}
                                  rank={entry.item.authorRank}
                                />
                              </Link>
                              {feedItemDateLabel(entry.item, resolvedLocale) ? (
                                <>
                                  <span className="meta-dot">·</span>
                                  <time>{feedItemDateLabel(entry.item, resolvedLocale)}</time>
                                </>
                              ) : null}
                            </p>
                            {entry.item.excerpt ? (
                              <p className="stream-excerpt">
                                <MathInline text={entry.item.excerpt} />
                              </p>
                            ) : null}
                            <div className="tag-row">
                              {entry.item.tags.slice(0, 4).map((itemTag) => (
                                <Link to={legacyTagPath(itemTag)} key={itemTag}>
                                  {itemTag}
                                </Link>
                              ))}
                              {feedItemMetricSummary(entry.item, resolvedLocale, t) ? (
                                <strong>{feedItemMetricSummary(entry.item, resolvedLocale, t)}</strong>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ) : (
                        <article className="tag-question-row" key={rowKey}>
                          <span className="questions-index">
                            {formatNumber(resolvedLocale, (page - 1) * pageSize + index + 1, { minimumIntegerDigits: 2, useGrouping: false })}
                          </span>
                          <div className="tag-question-body">
                            <div className="stream-card-head">
                              <span>{t('tagDetail.type.question')}</span>
                              <strong>{t('tagDetail.voteCount', { count: entry.item.vote_count, displayCount: formatNumber(resolvedLocale, entry.item.vote_count) })}</strong>
                            </div>
                            <h2>
                              <Link to={questionPath(entry.item)}>
                                <MathInline text={entry.item.title} />
                              </Link>
                            </h2>
                            <p className="stream-meta">
                              <Link
                                className="identity-link"
                                to={profilePath(entry.item)}
                              >
                                <AvatarName
                                  name={authorLabel(entry.item)}
                                  imageUrl={entry.item.user_info?.avatar}
                                  rank={entry.item.user_info?.rank}
                                />
                              </Link>
                              <span className="meta-dot">·</span>
                              {questionDateLabel(
                                resolvedLocale,
                                entry.item.update_time ||
                                  entry.item.create_time,
                              )}
                            </p>
                            {entry.item.description ? (
                              <p className="stream-excerpt">
                                <MathInline text={entry.item.description} />
                              </p>
                            ) : null}
                            <div className="tag-row">
                              {entry.item.tags.slice(0, 4).map((itemTag) => (
                                <Link
                                  to={legacyTagPath(itemTag.slug_name)}
                                  key={itemTag.slug_name}
                                >
                                  {questionTagLabel(itemTag)}
                                </Link>
                              ))}
                              <strong>{t('tagDetail.answerCount', { count: entry.item.answer_count, displayCount: formatNumber(resolvedLocale, entry.item.answer_count) })}</strong>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="state-strip">{t('tagDetail.emptyContent')}</div>
                )
              ) : displayedContentItems.length ? (
                <div className="tag-question-list">
                  {displayedContentItems.map((item, index) => (
                    <article className="tag-question-row" key={item.id}>
                      <span className="questions-index">
                        {formatNumber(resolvedLocale, (page - 1) * pageSize + index + 1, { minimumIntegerDigits: 2, useGrouping: false })}
                      </span>
                      <div className="tag-question-body">
                        <div className="stream-card-head">
                          <span>{t(`tagDetail.type.${feedItemTypeKey(item)}`)}</span>
                          <strong>{feedItemMetricLabels(item, resolvedLocale, t)[0]}</strong>
                        </div>
                        <h2>
                          <Link to={feedItemPath(item)}>
                            <MathInline text={item.title} />
                          </Link>
                        </h2>
                        <p className="stream-meta">
                          <Link
                            className="identity-link"
                            to={routeProfilePath(
                              item.authorId || item.authorUid || item.author,
                            )}
                          >
                            <AvatarName
                              name={item.author}
                              imageUrl={item.authorAvatar}
                              rank={item.authorRank}
                            />
                          </Link>
                          {feedItemDateLabel(item, resolvedLocale) ? (
                            <>
                              <span className="meta-dot">·</span>
                              <time>{feedItemDateLabel(item, resolvedLocale)}</time>
                            </>
                          ) : null}
                        </p>
                        {item.excerpt ? (
                          <p className="stream-excerpt">
                            <MathInline text={item.excerpt} />
                          </p>
                        ) : null}
                        <div className="tag-row">
                          {item.tags.slice(0, 4).map((itemTag) => (
                            <Link to={legacyTagPath(itemTag)} key={itemTag}>
                              {itemTag}
                            </Link>
                          ))}
                          {feedItemMetricSummary(item, resolvedLocale, t) ? (
                            <strong>{feedItemMetricSummary(item, resolvedLocale, t)}</strong>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="state-strip">{t('tagDetail.emptyContent')}</div>
              )}
              {activeTab === "wiki" ? null : pagination}
            </article>

            <aside className="tag-detail-side">
              {Number(tag.tagId || tag.id) > 0 ? (
                <TagKnowledgeConnections
                  tagId={Number(tag.tagId || tag.id)}
                  displayName={tagTitle}
                  parentTags={tag.parentTags}
                  repositoryState={tag.repositoryState}
                />
              ) : null}
              <section className="panel tag-wiki-contributor-panel">
                <div className="panel-heading">
                  <span>{t('tagDetail.wikiContributors')}</span>
                  <strong>
                    {wikiContributors.length
                      ? t('tagDetail.peopleCount', { count: wikiContributors.length, displayCount: formatNumber(resolvedLocale, wikiContributors.length) })
                      : t('tagDetail.noneYet')}
                  </strong>
                </div>
                {wikiContributors.length ? (
                  <ol className="tag-wiki-contributor-list">
                    {wikiContributors.map((contributor) => {
                      const user = (
                        <AvatarName
                          name={contributor.author}
                          imageUrl={contributor.authorAvatar}
                        />
                      );
                      return (
                        <li key={contributor.key}>
                          <span
                            className={
                              contributor.created
                                ? "tag-wiki-contributor-role creator"
                                : "tag-wiki-contributor-role"
                            }
                          >
                            {contributor.created ? t('tagDetail.createdRole') : t('tagDetail.maintainedRole')}
                          </span>
                          <div className="tag-wiki-contributor-main">
                            {contributor.userId &&
                            contributor.userId !== "system" ? (
                              <Link
                                className="tag-wiki-contributor-user"
                                to={routeProfilePath(contributor.userId)}
                              >
                                {user}
                              </Link>
                            ) : (
                              <span className="tag-wiki-contributor-user">
                                {user}
                              </span>
                            )}
                            <span>
                              {contributor.latestReason || t('tagDetail.updatedWiki')}
                            </span>
                          </div>
                          <div className="tag-wiki-contributor-meta">
                            <strong>{formatNumber(resolvedLocale, contributor.editCount)}</strong>
                            <span>
                              {dateLabel(resolvedLocale, contributor.lastEditedAt) || t('tagDetail.recently')}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="state-strip">{t('tagDetail.emptyWikiContributors')}</div>
                )}
              </section>
              <section className="panel tag-cultivation-panel">
                <div className="panel-heading">
                  <span>{t('tagDetail.cultivatedUsers')}</span>
                  <strong>
                    {tagCultivations.length
                      ? t('tagDetail.peopleCount', { count: tagCultivations.length, displayCount: formatNumber(resolvedLocale, tagCultivations.length) })
                      : t('tagDetail.noneYet')}
                  </strong>
                </div>
                {tagCultivations.length ? (
                  <ol className="tag-cultivation-list">
                    {tagCultivations.map((user, index) => (
                      <li key={user.uid || user.userId}>
                        <span className="tag-cultivation-rank">
                          {formatNumber(resolvedLocale, index + 1)}
                        </span>
                        <Link
                          className="tag-cultivation-user"
                          to={routeProfilePath(user.userId || user.uid)}
                        >
                          <AvatarName
                            name={user.displayName || user.username}
                            imageUrl={user.avatar}
                            rank={user.rank}
                          />
                        </Link>
                        <div className="tag-cultivation-score">
                          <strong>{formatNumber(resolvedLocale, user.tagScore)}</strong>
                          <span>{t('tagDetail.tagCultivation')}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="state-strip">{t('tagDetail.emptyCultivations')}</div>
                )}
              </section>
              <SiteIcpLink />
            </aside>
          </section>
        ) : null}
      </main>
    </>
  );
}

export default TagDetailPage;

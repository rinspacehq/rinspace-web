import { AnimateButton } from 'components/ui';
import type { TFunction } from 'i18next';
import { Link, useNavigate } from 'react-router-dom';

import AvatarName from '@/components/AvatarName';
import { MathInline } from '@/components/MathText';
import UserIdentity from '@/components/UserIdentity';
import { formatDate, formatNumber } from '@/i18n/format';
import {
  feedPresentationDate,
  feedPresentationMetrics,
  type FeedPresentationMetric as DirectoryMetric,
} from '@/i18n/feedPresentation';
import { useOptionalLanguage } from '@/i18n/LanguageProvider';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { AnswerQuestionInfo, ContentType, FeedItem, FeedTagItem } from '@/services/contracts';
import {
  contentPath,
  profilePath as routeProfilePath,
  questionPath as routeQuestionPath,
  tagReadOrLegacyPath,
} from '@/utils/routes';
import { contentTypeMetaChar } from '@/utils/contentTypeMeta';

export type DirectoryMode = 'hot' | 'latest' | 'following' | 'saved';

export const directoryModeOptions: readonly DirectoryMode[] = [
  'hot',
  'latest',
  'following',
  'saved',
];

export function normalizeDirectoryMode(value: string | null): DirectoryMode {
  if (value === 'newest') return 'latest';
  if (value === 'collected' || value === 'collection' || value === 'favorite') return 'saved';
  return directoryModeOptions.some((option) => option === value)
    ? (value as DirectoryMode)
    : 'hot';
}

export function DirectoryModeTabs({
  mode,
  onChange,
  ariaLabel,
}: {
  mode: DirectoryMode;
  onChange: (mode: DirectoryMode) => void;
  ariaLabel?: string;
}) {
  const { t } = useFeatureTranslation('discovery');
  return (
    <nav className="feed-tabs directory-mode-tabs" aria-label={ariaLabel || t('directory.sort')}>
      {directoryModeOptions.map((option) => (
        <AnimateButton unstyled
          key={option}
          type="button"
          className={mode === option ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {t(`directory.modes.${option}`)}
        </AnimateButton>
      ))}
    </nav>
  );
}

const interactiveSelector = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
].join(', ');

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return !(target instanceof Element) || Boolean(target.closest(interactiveSelector));
}

function displayTypeClass(type: ContentType) {
  if (type === 'forum') return 'discussion';
  if (type === 'status') return 'dynamic';
  return type;
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

export function DirectoryTypeMetaCategory({
  type,
  label,
}: {
  type: ContentType;
  label?: string;
}) {
  const { t } = useFeatureTranslation('discovery');
  const displayType = displayTypeClass(type);
  const visibleLabel = label || t(`contentTypes.${type}`, {
    defaultValue: t('contentTypes.content'),
  });
  return (
    <span className={`meta-category content-type-meta content-type-meta-${displayType}`} title={visibleLabel}>
      <Link to={itemTypePath(displayType)}>
        <span className="char" aria-hidden="true">
          {contentTypeMetaChar(displayType, visibleLabel.slice(0, 1).toLowerCase())}
        </span>
        <span className="label">{visibleLabel}</span>
      </Link>
    </span>
  );
}

function tagLabelFromItem(tag: FeedTagItem) {
  return tag.displayName || tag.slugName || tag.tagId || 'tag';
}

function tagLinksFor(item: Pick<FeedItem, 'tags' | 'tagItems'>) {
  if (item.tagItems?.length) {
    return item.tagItems.map((tag) => {
      const label = tagLabelFromItem(tag);
      const slugOrTitle = tag.slugName || label;
      const idOrSlug = tag.tagId || slugOrTitle;
      return {
        key: tag.tagId || tag.slugName || label,
        label,
        path: tagReadOrLegacyPath(idOrSlug, slugOrTitle),
      };
    });
  }
  return item.tags.map((tag) => ({
    key: tag,
    label: tag,
    path: tagReadOrLegacyPath(tag, tag),
  }));
}

function itemPath(item: Pick<FeedItem, 'type' | 'id' | 'title'>) {
  return contentPath(item.type, item.id, item.title);
}

function authorProfilePath(item: Pick<FeedItem, 'authorId'>) {
  return item.authorId ? routeProfilePath(item.authorId) : '/users';
}

function metricLabel(
  metric: DirectoryMetric,
  locale: 'zh-CN' | 'en',
  t: TFunction<'discovery'>,
) {
  return t(`directory.metrics.${metric.kind}`, {
    count: metric.value,
    displayCount: formatNumber(locale, metric.value),
  });
}

function metricToneClass(type: ContentType, metric: DirectoryMetric) {
  const displayType = displayTypeClass(type);
  if (displayType === 'blog' && ['read', 'favorite'].includes(metric.kind)) return 'stream-metric-primary';
  if (displayType === 'question' && ['vote', 'answer'].includes(metric.kind)) return 'stream-metric-primary';
  if (displayType === 'discussion' && metric.kind === 'reply') return 'stream-metric-primary';
  if (displayType === 'dynamic' && ['like', 'share'].includes(metric.kind)) return 'stream-metric-primary';
  return '';
}

function discussionImagesFor(item: FeedItem) {
  return item.images?.filter(Boolean).slice(0, 9) || [];
}

function questionStatusLabel(
  question: AnswerQuestionInfo,
  t: TFunction<'discovery'>,
) {
  if (question.accepted_answer_id && question.accepted_answer_id !== '0') {
    return t('directory.questionStatus.accepted');
  }
  if (question.answer_count === 0) return t('directory.questionStatus.waiting');
  if (question.status !== 1) return t('directory.questionStatus.closed');
  return t('directory.questionStatus.open');
}

function questionTagLabel(tag: AnswerQuestionInfo['tags'][number]) {
  return tag.display_name.trim() || tag.slug_name;
}

function questionAuthorLabel(question: AnswerQuestionInfo) {
  return question.user_info?.display_name || question.user_info?.username || 'Rinspace';
}

function questionAuthorProfilePath(question: AnswerQuestionInfo) {
  const author = question.user_info?.username || question.user_info?.id || '';
  return author ? routeProfilePath(author) : '/users';
}

function questionDateLabel(seconds: number, locale: 'zh-CN' | 'en') {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  });
}

export function DirectoryFeedCard({ item }: { item: FeedItem }) {
  const { i18n, t } = useFeatureTranslation('discovery');
  const language = useOptionalLanguage();
  const locale = language?.resolvedLocale
    ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const navigate = useNavigate();
  const displayType = displayTypeClass(item.type);
  const isDynamic = displayType === 'dynamic';
  const path = itemPath(item);
  const date = feedPresentationDate(item);
  const formattedDate = date
    ? formatDate(locale, date, { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '';
  const footerMetrics = feedPresentationMetrics(item);
  const itemTags = tagLinksFor(item).slice(0, 2);
  const discussionImages = displayType === 'discussion' ? discussionImagesFor(item) : [];
  const titleText = isDynamic ? item.excerpt || item.title : item.title;

  return (
    <article
      className={`stream-card stream-card-${displayType}`}
      data-type={displayType}
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) return;
        navigate(path);
      }}
    >
      {isDynamic ? (
        <div className="stream-dynamic-head">
          <div className="stream-dynamic-meta-row">
            <div className="stream-card-topline">
              <DirectoryTypeMetaCategory type={item.type} />
              {itemTags.length ? (
                <div className="stream-topline-tags tag-row" aria-label={t('directory.contentTags')}>
                  {itemTags.map((tag) => (
                    <Link key={tag.key} to={tag.path}>
                      {tag.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            {formattedDate ? <time>{formattedDate}</time> : null}
          </div>
          <div className="stream-dynamic-lead">
            <Link className="stream-author-lead" to={authorProfilePath(item)}>
              <span className="stream-dynamic-avatar" aria-hidden="true">
                {item.authorAvatar ? <img src={item.authorAvatar} alt="" loading="lazy" /> : item.author.slice(0, 1).toUpperCase()}
              </span>
              <span className="stream-dynamic-author-name">
                <span>{item.author}</span>
              </span>
            </Link>
            <span className="stream-dynamic-colon">：</span>
            <Link className="stream-dynamic-title" to={path}>
              <MathInline text={titleText} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="stream-card-head">
          <div className="stream-card-topline">
            <DirectoryTypeMetaCategory type={item.type} />
            {itemTags.length ? (
              <div className="stream-topline-tags tag-row" aria-label={t('directory.contentTags')}>
                {itemTags.map((tag) => (
                  <Link key={tag.key} to={tag.path}>
                    {tag.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          {formattedDate ? <time>{formattedDate}</time> : null}
        </div>
      )}
      {!isDynamic ? (
        <h2>
          <Link to={path}>
            <MathInline text={item.title} />
          </Link>
        </h2>
      ) : null}
      {!isDynamic ? (
        <p className="stream-meta stream-author-meta">
          {item.authorId ? (
            <UserIdentity
              name={item.author}
              userId={item.authorId}
              imageUrl={item.authorAvatar}
              rank={item.authorRank}
            />
          ) : (
            <Link className="identity-link" to={authorProfilePath(item)}>
            <AvatarName
              name={item.author}
              imageUrl={item.authorAvatar}
              rank={item.authorRank}
            />
            </Link>
          )}
        </p>
      ) : null}
      {!isDynamic && item.excerpt ? (
        <p className="stream-excerpt">
          <MathInline text={item.excerpt} />
        </p>
      ) : null}
      {displayType === 'blog' && item.coverUrl ? (
        <figure className="stream-blog-cover">
          <img src={item.coverUrl} alt="" loading="lazy" />
        </figure>
      ) : null}
      {discussionImages.length ? (
        <div className={`stream-discussion-images count-${discussionImages.length}`}>
          {discussionImages.map((image, index) => (
            <Link to={path} className="stream-discussion-image" key={`${image}-${index}`}>
              <img src={image} alt="" loading="lazy" />
            </Link>
          ))}
        </div>
      ) : null}
      <div className={isDynamic ? 'stream-footer stream-dynamic-footer' : 'stream-footer'}>
        <div className={isDynamic ? 'stream-dynamic-metrics' : 'stream-metrics'}>
          {footerMetrics.map((part) => (
            <span className={metricToneClass(item.type, part)} key={part.kind}>
              {metricLabel(part, locale, t)}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function DirectoryQuestionCard({ question }: { question: AnswerQuestionInfo }) {
  const { i18n, t } = useFeatureTranslation('discovery');
  const language = useOptionalLanguage();
  const locale = language?.resolvedLocale
    ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const navigate = useNavigate();
  const path = routeQuestionPath(question.id, question.title);
  const updatedAt = questionDateLabel(question.update_time || question.create_time, locale);
  const status = questionStatusLabel(question, t);
  const author = questionAuthorLabel(question);
  const metrics: DirectoryMetric[] = [
    { kind: 'vote', value: question.vote_count },
    { kind: 'answer', value: question.answer_count },
  ];

  return (
    <article
      className="stream-card stream-card-question"
      data-type="question"
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) return;
        navigate(path);
      }}
    >
      <div className="stream-card-head">
        <div className="stream-card-topline">
          <DirectoryTypeMetaCategory type="question" />
          {question.tags.length ? (
            <div className="stream-topline-tags tag-row" aria-label={t('directory.contentTags')}>
              {question.tags.slice(0, 2).map((tag) => (
                <Link to={`/questions?tag=${encodeURIComponent(tag.slug_name)}`} key={tag.slug_name}>
                  {questionTagLabel(tag)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        {updatedAt ? <time>{updatedAt}</time> : null}
      </div>
      <h2>
        <Link to={path}>
          <MathInline text={question.title} />
        </Link>
      </h2>
      <p className="stream-meta stream-author-meta">
        {question.user_info?.username || question.user_info?.id ? (
          <UserIdentity
            name={author}
            username={question.user_info?.username}
            userId={question.user_info?.id}
            imageUrl={question.user_info?.avatar}
            rank={question.user_info?.rank}
          />
        ) : (
          <Link className="identity-link" to={questionAuthorProfilePath(question)}>
          <AvatarName
            name={author}
            imageUrl={question.user_info?.avatar}
            rank={question.user_info?.rank}
          />
          </Link>
        )}
      </p>
      {question.description ? (
        <p className="stream-excerpt">
          <MathInline text={question.description} />
        </p>
      ) : null}
      <div className="stream-footer">
        <div className="stream-metrics">
          {metrics.map((part) => (
            <span className={metricToneClass('question', part)} key={part.kind}>
              {metricLabel(part, locale, t)}
            </span>
          ))}
          <span className="stream-metric-primary">{status}</span>
        </div>
      </div>
    </article>
  );
}

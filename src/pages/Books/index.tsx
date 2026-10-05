import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';

import {
  DirectoryModeTabs,
  DirectoryTypeMetaCategory,
  normalizeDirectoryMode,
  type DirectoryMode,
} from '@/components/DirectoryStreamCard';
import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import SiteTopbar from '@/components/SiteTopbarShell';
import { formatNumber } from '@/i18n/format';
import { feedPresentationMetrics } from '@/i18n/feedPresentation';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadHomeFeed } from '@/services/domains/activity';
import { loadBookFeed } from '@/services/domains/book';
import { switchCollection } from '@/services/domains/discussion';
import { loadPersonalCollectionPage } from '@/services/domains/identity';
import type { FeedItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';
import { contentPath, profilePath as routeProfilePath } from '@/utils/routes';

type BookMetric = Readonly<{
  kind: 'score' | 'reviews' | 'read' | 'favorite';
  value: number;
  available?: boolean;
}>;

function bookMetricsForItem(item: FeedItem): BookMetric[] {
  const structuredMetrics = feedPresentationMetrics(item);
  const valueFor = (kind: 'read' | 'favorite') => (
    structuredMetrics.find((metric) => metric.kind === kind)?.value ?? 0
  );
  const rating = item.bookRating;
  const reviewCount = rating?.reviewCount ?? 0;
  return [
    { kind: 'score', value: rating?.averageScore ?? 0, available: reviewCount > 0 && Boolean(rating) },
    { kind: 'reviews', value: reviewCount },
    { kind: 'read', value: valueFor('read') },
    { kind: 'favorite', value: valueFor('favorite') },
  ];
}

function formatBookScore(score: number, locale: 'zh-CN' | 'en') {
  const rounded = Math.round(score * 10) / 10;
  return formatNumber(locale, rounded, { maximumFractionDigits: 1 });
}

function bookMetricClass(metric: BookMetric) {
  if (metric.kind === 'score' && metric.available) return 'stream-metric-book-score';
  return 'stream-metric-primary';
}

function isOriginalStyleBook(item: FeedItem) {
  return item.book?.kind === 'original' || item.book?.kind === 'markdown' || item.book?.kind === 'typst';
}

function bookAuthorText(item: FeedItem, missingAuthor: string) {
  const authors = item.book?.authors?.filter(Boolean) || [];
  if (authors.length) return authors.join(' / ');
  return isOriginalStyleBook(item) ? item.author : missingAuthor;
}

function bookAuthorNodes(item: FeedItem, missingAuthor: string) {
  const entities = item.book?.authorEntities || [];
  if (entities.length) {
    return entities.map((author) => (
      <Link to={`/author/${encodeURIComponent(author.id)}`} key={author.id}>
        {author.name}
      </Link>
    ));
  }
  if (isOriginalStyleBook(item) && item.authorId) {
    return <Link to={routeProfilePath(item.authorId)}>{bookAuthorText(item, missingAuthor)}</Link>;
  }
  return bookAuthorText(item, missingAuthor);
}

function hasLinkedBookAuthors(item: FeedItem) {
  return Boolean(
    item.book?.authorEntities?.length ||
      (isOriginalStyleBook(item) && item.authorId),
  );
}

function numericFeedItemId(item: Pick<FeedItem, 'id'>) {
  const value = Number(item.id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function collectionTargetRef(item: Pick<FeedItem, 'id'>) {
  const targetId = numericFeedItemId(item);
  return targetId ? { targetId: String(targetId) } : { slug: item.id };
}

function bookPath(item: FeedItem) {
  return contentPath('book', item.id, item.title);
}

function uniqueBookItems(items: FeedItem[]) {
  const seen = new Set<string>();
  const next: FeedItem[] = [];
  items.forEach((item) => {
    if (item.type !== 'book' || seen.has(item.id)) return;
    seen.add(item.id);
    next.push(item);
  });
  return next;
}

function bookOrderForMode(mode: DirectoryMode) {
  return mode === 'latest' ? 'newest' : 'hot';
}

function withCollectionMetric(item: FeedItem, collectionCount: number): FeedItem {
  return {
    ...item,
    favoriteCount: collectionCount,
  };
}

type BookCardProps = {
  item: FeedItem;
  isCollected: boolean;
  collectionBusy: boolean;
  onCollect: (item: FeedItem) => void;
};

function BookCard({ item, isCollected, collectionBusy, onCollect }: BookCardProps) {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const book = item.book;
  const footerMetrics = bookMetricsForItem(item);
  const metricLabel = (metric: BookMetric) => {
    if (metric.kind === 'score') {
      return metric.available
        ? t('pages.book.score', { score: formatBookScore(metric.value, resolvedLocale) })
        : t('pages.book.noRating');
    }
    if (metric.kind === 'reviews') {
      return t('pages.book.reviewCount', {
        count: metric.value,
        displayCount: formatNumber(resolvedLocale, metric.value),
      });
    }
    return t(`directory.metrics.${metric.kind}`, {
      count: metric.value,
      displayCount: formatNumber(resolvedLocale, metric.value),
    });
  };
  return (
    <article className="home-book-card">
      <Link className="home-book-cover" to={bookPath(item)} aria-label={t('pages.book.view', { title: item.title })}>
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" loading="lazy" />
        ) : (
          <Icon name="book" />
        )}
      </Link>
      <div className="home-book-main">
        <div className="stream-card-topline home-book-topline">
          <DirectoryTypeMetaCategory type="book" />
          <span>
            {book?.kind === 'copyrighted'
              ? t('pages.book.external')
              : book?.kind === 'typst'
                ? t('pages.book.typst')
                : t('pages.book.original')}
          </span>
          {book?.pdfUrl ? (
            <a className="home-book-resource-badge" href={book.pdfUrl} target="_blank" rel="noreferrer">
              PDF
            </a>
          ) : book?.officialUrl ? (
            <a className="home-book-resource-badge" href={book.officialUrl} target="_blank" rel="noreferrer">
              {t('pages.book.officialSite')}
            </a>
          ) : null}
        </div>
        <h2>
          <Link to={bookPath(item)}>
            <MathInline text={book?.bookTitle || item.title} />
          </Link>
        </h2>
        <p className={hasLinkedBookAuthors(item) ? 'book-author-links' : undefined}>
          {bookAuthorNodes(item, t('pages.book.authorMissing'))}
        </p>
        <div className="home-book-meta">
          {book?.seriesTitle ? <span>{book.seriesTitle}</span> : null}
          {book?.publisher ? <span>{book.publisher}</span> : null}
          {book?.numberOfPages ? (
            <span>{t('pages.book.pageCount', {
              count: Number(book.numberOfPages),
              displayCount: formatNumber(resolvedLocale, Number(book.numberOfPages)),
            })}</span>
          ) : null}
        </div>
        {item.excerpt ? (
          <p className="stream-excerpt">
            <MathInline text={item.excerpt} />
          </p>
        ) : null}
        <div className="home-book-footer">
          <div className="stream-metrics home-book-metrics">
            {footerMetrics.map((part) => (
              <span className={bookMetricClass(part)} key={part.kind}>
                {metricLabel(part)}
              </span>
            ))}
          </div>
          <div className="home-book-actions">
            <Link to={`${bookPath(item)}#book-reviews`}>
              <Icon name="star" />
              {t('pages.book.rate')}
            </Link>
            <AnimateButton unstyled
              type="button"
              className={isCollected ? 'active' : ''}
              onClick={() => onCollect(item)}
              disabled={collectionBusy}
            >
              <Icon name={isCollected ? 'bookmark-check' : 'bookmark'} />
              {isCollected ? t('pages.book.removeSave') : t('pages.book.save')}
            </AnimateButton>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function BooksPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = normalizeDirectoryMode(searchParams.get('mode') || searchParams.get('order'));
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collectedItems, setCollectedItems] = useState<Set<string>>(() => new Set());
  const [collectionBusyId, setCollectionBusyId] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const loader =
      mode === 'saved'
        ? loadPersonalCollectionPage({ page: 1, pageSize: 100 })
            .then((page) => uniqueBookItems(page.items))
        : mode === 'following'
          ? Promise.all([
              loadHomeFeed({ mode: 'following', size: 60 }),
              loadBookFeed({ order: 'recommend', size: 36 }),
            ]).then(([feed, books]) => uniqueBookItems([
              ...feed.stream,
              ...books.items.filter((item) => item.isFollowed),
            ]))
          : loadBookFeed({ order: bookOrderForMode(mode), size: 36 })
              .then((response) => response.items);
    void loader
      .then((nextItems) => {
        if (!cancelled) setItems(uniqueBookItems(nextItems));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setItems([]);
          setError(messageFromError(loadError, 'discovery.booksLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    void loadPersonalCollectionPage({ page: 1, pageSize: 100 })
      .then((page) => {
        if (cancelled) return;
        setCollectedItems(new Set(page.items.filter((item) => item.type === 'book').map((item) => item.id)));
      })
      .catch(() => {
        if (!cancelled) setCollectedItems(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useRinPageContext(
    useMemo(() => ({
      kind: 'page' as const,
      title: t('pages.book.contextTitle'),
      excerpt: t('pages.book.contextExcerpt', {
        items: formatNumber(resolvedLocale, items.length),
      }),
      sections: items.length
        ? [
            {
              title: t('pages.book.current'),
              body: items
                .slice(0, 16)
                .map((item, index) => t('pages.book.contextItem', {
                  index: formatNumber(resolvedLocale, index + 1),
                  title: item.book?.bookTitle || item.title,
                  author: item.book?.authors?.join(', ') || item.author,
                  score: formatBookScore(item.bookRating?.averageScore || 0, resolvedLocale),
                }))
                .join('\n'),
            },
          ]
        : [],
    }), [items, resolvedLocale, t]),
  );

  const updateMode = (nextMode: DirectoryMode) => {
    const params = new URLSearchParams();
    if (nextMode !== 'hot') params.set('mode', nextMode);
    setSearchParams(params);
  };

  const collectBook = async (item: FeedItem) => {
    const isCollected = collectedItems.has(item.id);
    setCollectionBusyId(item.id);
    setError('');
    try {
      const result = await switchCollection({
        targetType: 'post',
        ...collectionTargetRef(item),
        bookmark: !isCollected,
        isCancel: isCollected,
      });
      setCollectedItems((current) => {
        const next = new Set(current);
        if (result.bookmarked) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? withCollectionMetric(currentItem, result.collectionCount)
            : currentItem,
        ),
      );
    } catch (collectionError) {
      setError(messageFromError(collectionError, 'discovery.bookCollectionFailed'));
    } finally {
      setCollectionBusyId('');
    }
  };

  return (
    <>
      <Helmet title={t('pages.book.documentTitle')} />
      <SiteTopbar />
      <main className="community-page directory-simple-page books-page">
        <article className="panel community-board directory-stream-board directory-simple-board">
          <div className="panel-heading large directory-simple-heading">
            <h1>{t('pages.book.heading')}</h1>
            <DirectoryModeTabs mode={mode} onChange={updateMode} ariaLabel={t('pages.book.sort')} />
          </div>
          {loading && !items.length ? (
            <LoadingState variant="strip" />
          ) : items.length ? (
          <div className="home-book-grid books-page-grid directory-stream-grid">
            {items.map((item) => (
              <BookCard
                item={item}
                key={item.id}
                isCollected={collectedItems.has(item.id)}
                collectionBusy={collectionBusyId === item.id}
                onCollect={(bookItem) => void collectBook(bookItem)}
              />
            ))}
          </div>
        ) : (
          <div className="community-empty-state">
            <span className="community-empty-mark">
              <Icon name="book" />
            </span>
            <div>
              <h2>{t('pages.book.empty')}</h2>
            </div>
          </div>
        )}
        </article>
      </main>
    </>
  );
}

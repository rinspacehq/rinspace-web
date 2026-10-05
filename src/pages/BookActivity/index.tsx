import { AnimateButton , useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { MathInline } from '@/components/MathText';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import { formatDate, formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadContentDetail } from '@/services/domains/article';
import { loadBookActivity } from '@/services/domains/book';
import type { BookActivityItem, BookActivityKind, BookActivityResponse, PostDetail } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { bookChapterPath, contentPath } from '@/utils/routes';

type ActivityFilter = 'all' | BookActivityKind;

const filters: ActivityFilter[] = ['all', 'discussion', 'question', 'blog', 'errata'];

function normalizeFilter(value: string | null): ActivityFilter {
  return filters.includes(value as ActivityFilter) ? (value as ActivityFilter) : 'all';
}

function dateLabel(locale: 'zh-CN' | 'en', value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function chapterLabel(locale: 'zh-CN' | 'en', item: BookActivityItem) {
  const path = item.chapterPath?.length ? item.chapterPath : [item.chapterTitle];
  const label = path.join(' / ');
  return item.chapterPage ? `${label} · p. ${formatNumber(locale, item.chapterPage)}` : label;
}

function BookActivityRow({ item, book }: { item: BookActivityItem; book: PostDetail | null }) {
  const { t } = useFeatureTranslation('reader');
  const { resolvedLocale } = useLanguage();
  const bookTitle = book?.book?.bookTitle || book?.title || t('bookActivity.bookFallback');
  const chapterHref = bookChapterPath(book?.id, bookTitle, item.chapterKey);
  if (item.kind === 'errata') {
    return (
      <article className="book-activity-row">
        <div className="book-activity-row-type errata">{t(`bookActivity.kind.${item.kind}`)}</div>
        <div className="book-activity-row-main">
          <h2>{item.erratum?.title || t('bookActivity.erratumFallback')}</h2>
          <p>{item.erratum?.location || item.erratum?.note || t('bookActivity.erratumDescriptionFallback')}</p>
          <div>
            <Link to={chapterHref}>{chapterLabel(resolvedLocale, item)}</Link>
            <span>{item.erratum?.reporter || t('bookActivity.readerFallback')}</span>
            <time>{dateLabel(resolvedLocale, item.updatedAt)}</time>
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="book-activity-row">
      <div className="book-activity-row-type">{t(`bookActivity.kind.${item.kind}`)}</div>
      <div className="book-activity-row-main">
        {item.content ? (
          <h2>
            <Link to={contentPath(item.content.type, item.content.id, item.content.title)}>
              <MathInline text={item.content.title} />
            </Link>
          </h2>
        ) : (
          <h2>{t('bookActivity.relatedContent')}</h2>
        )}
        {item.content?.excerpt ? <p><MathInline text={item.content.excerpt} /></p> : null}
        <div>
          <Link to={chapterHref}>{chapterLabel(resolvedLocale, item)}</Link>
          <span>{item.content?.author || 'Rinspace'}</span>
          <time>{dateLabel(resolvedLocale, item.updatedAt)}</time>
        </div>
      </div>
    </article>
  );
}

function BookActivityPage() {
  const { t } = useFeatureTranslation('reader');
  const { resolvedLocale } = useLanguage();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const bookId = params.postId || '';
  const filter = normalizeFilter(searchParams.get('kind'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = 20;

  const [book, setBook] = useState<PostDetail | null>(null);
  const [activity, setActivity] = useState<BookActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void Promise.all([
      loadContentDetail(bookId),
      loadBookActivity(bookId, { kind: filter, page, limit: pageSize }),
    ])
      .then(([bookResult, activityResult]) => {
        if (cancelled) return;
        setBook(bookResult);
        setActivity(activityResult);
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'reader.bookActivityLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, filter, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((activity?.total || 0) / pageSize)),
    [activity?.total],
  );
  const bookTitle = book?.book?.bookTitle || book?.title || t('bookActivity.titleFallback');

  const setFilter = (next: ActivityFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') {
      params.delete('kind');
    } else {
      params.set('kind', next);
    }
    params.delete('page');
    setSearchParams(params);
  };

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
  };

  return (
    <>
      <Helmet title={t('bookActivity.documentTitle', { title: bookTitle })} />
      <SiteTopbar />
      <main className="community-page book-activity-page">
        <section className="panel directory-toolbar community-toolbar">
          <div className="detail-kicker">
            <span>{t('bookActivity.kicker')}</span>
            <strong>{loading ? t('bookActivity.syncing') : t('bookActivity.itemCount', { count: activity?.total || 0, displayCount: formatNumber(resolvedLocale, activity?.total || 0) })}</strong>
          </div>
          <h1><MathInline text={bookTitle} /></h1>
          {book ? (
            <Link className="secondary-button" to={contentPath('book', book.id, bookTitle)}>
              {t('bookActivity.backToBook')}
            </Link>
          ) : null}
        </section>

        <section className="book-activity-layout">
          <aside className="panel book-activity-filter-panel">
            <div className="panel-heading">
              <span>{t('bookActivity.type')}</span>
              <strong>{formatNumber(resolvedLocale, activity?.total || 0)}</strong>
            </div>
            <div className="book-activity-filter-list">
              {filters.map((item) => (
                <AnimateButton unstyled
                  key={item}
                  type="button"
                  className={filter === item ? 'active' : ''}
                  onClick={() => setFilter(item)}
                >
                  {t(`bookActivity.filter.${item}`)}
                </AnimateButton>
              ))}
            </div>
          </aside>
          <section className="book-activity-results">
            {loading ? (
              <LoadingState variant="panel" className="loading-panel" />
            ) : activity?.items.length ? (
              <>
                <div className="book-activity-row-list">
                  {activity.items.map((item) => (
                    <BookActivityRow
                      key={`${item.kind}-${item.content?.id || item.erratum?.id || item.updatedAt}`}
                      item={item}
                      book={book}
                    />
                  ))}
                </div>
                <div className="book-activity-pagination">
                  <AnimateButton unstyled type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    {t('bookActivity.previous')}
                  </AnimateButton>
                  <span>{formatNumber(resolvedLocale, page)} / {formatNumber(resolvedLocale, totalPages)}</span>
                  <AnimateButton unstyled type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    {t('bookActivity.next')}
                  </AnimateButton>
                </div>
              </>
            ) : (
              <div className="panel state-strip">{t('bookActivity.empty')}</div>
            )}
          </section>
        </section>
      </main>
    </>
  );
}

export default BookActivityPage;

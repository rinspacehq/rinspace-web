import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import type { TFunction } from 'i18next';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import { formatDate, formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { searchContent } from '@/services/domains/activity';
import type { SearchOrder, SearchResult, SearchType } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { answerPath, contentPath, profilePath, tagReadOrLegacyPath } from '@/utils/routes';

const searchTabs: readonly SearchType[] = [
  'all', 'blog', 'book', 'question', 'discussion', 'dynamic', 'tag', 'user',
];

const orderOptions: readonly SearchOrder[] = [
  'relevance', 'newest', 'active', 'score',
];

function normalizeType(value: string | null): SearchType {
  return searchTabs.some((option) => option === value) ? (value as SearchType) : 'all';
}

function normalizeOrder(value: string | null): SearchOrder {
  return orderOptions.some((option) => option === value) ? (value as SearchOrder) : 'relevance';
}

function dateLabel(value: string, locale: 'zh-CN' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  });
}

function resultPath(result: SearchResult) {
  const ref = result.id || result.slug;
  switch (result.objectType) {
    case 'question':
      return contentPath('question', ref, result.title);
    case 'answer':
      return answerPath(ref, result.id);
    case 'blog':
      return contentPath('blog', ref, result.title);
    case 'book':
      return contentPath('book', ref, result.title);
    case 'announcement':
      return contentPath('announcement', ref);
    case 'discussion':
    case 'forum':
      return contentPath('discussion', ref, result.title);
    case 'dynamic':
    case 'status':
      return contentPath('dynamic', ref, result.title);
    case 'tag':
      return tagReadOrLegacyPath(result.id, result.slug || result.title || result.id);
    case 'user':
      return profilePath(result.userId || result.author || result.id);
    default:
      return '/';
  }
}

function resultSignal(
  result: SearchResult,
  locale: 'zh-CN' | 'en',
  t: TFunction<'discovery'>,
) {
  if (result.objectType === 'user') return t('pages.search.signals.user');
  if (result.objectType === 'tag') {
    return t('pages.search.signals.related', {
      count: result.voteCount,
      displayCount: formatNumber(locale, result.voteCount),
    });
  }
  if (typeof result.answerCount === 'number' && result.answerCount > 0) {
    return t('pages.search.signals.answer', {
      count: result.answerCount,
      displayCount: formatNumber(locale, result.answerCount),
    });
  }
  return t('pages.search.signals.upvote', {
    count: result.voteCount,
    displayCount: formatNumber(locale, result.voteCount),
  });
}

function SearchPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() || '';
  const type = normalizeType(searchParams.get('type'));
  const order = normalizeOrder(searchParams.get('order'));
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = 10;

  const [draft, setDraft] = useState(query);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!query) {
      setItems([]);
      setCount(0);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void searchContent({ query, type, order, page, size: pageSize })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setCount(response.count);
      })
      .catch((searchError) => {
        if (!cancelled) {
          setItems([]);
          setCount(0);
          setError(messageFromError(searchError, 'discovery.searchFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [order, page, query, type]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count]);

  const updateParams = (next: { query?: string; type?: SearchType; order?: SearchOrder; page?: number }) => {
    const nextQuery = typeof next.query === 'string' ? next.query.trim() : query;
    const nextType = next.type || type;
    const nextOrder = next.order || order;
    const nextPage = next.page || 1;
    const params = new URLSearchParams();
    if (nextQuery) params.set('q', nextQuery);
    if (nextType !== 'all') params.set('type', nextType);
    if (nextOrder !== 'relevance') params.set('order', nextOrder);
    if (nextPage > 1) params.set('page', String(nextPage));
    setSearchParams(params);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ query: draft, page: 1 });
  };

  const updatePage = (nextPage: number) => {
    updateParams({ page: Math.min(Math.max(1, nextPage), totalPages) });
  };

  return (
    <>
      <Helmet title={query
        ? t('pages.search.queryDocumentTitle', { query })
        : t('pages.search.documentTitle')} />
      <SiteTopbar />

      <main className="search-shell">
        <section className="panel directory-toolbar search-toolbar">
          <div className="detail-kicker">
            <span>{t('pages.search.heading')}</span>
            <strong>{query
              ? t('pages.search.resultCount', {
                count,
                displayCount: formatNumber(resolvedLocale, count),
              })
              : t('pages.search.enterKeywords')}</strong>
          </div>
          <h1>{t('pages.search.heading')}</h1>
          <p />
          <form className="directory-search" onSubmit={submitSearch}>
            <input
              value={draft}
              maxLength={60}
              placeholder={t('pages.search.placeholder')}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <AnimateButton unstyled type="submit">
              <Icon name="search" />
              {t('pages.search.submit')}
            </AnimateButton>
          </form>
        </section>

        <section className="search-grid" id="results">
          <article className="panel search-results-panel">
            <div className="panel-heading large">
              <nav className="search-tabs" aria-label={t('pages.search.typesLabel')}>
                {searchTabs.map((option) => (
                  <AnimateButton unstyled
                    key={option}
                    type="button"
                    className={type === option ? 'active' : ''}
                    onClick={() => updateParams({ type: option, page: 1 })}
                  >
                    {t(`pages.search.types.${option}`)}
                  </AnimateButton>
                ))}
              </nav>
              <nav className="feed-tabs" aria-label={t('pages.search.sortLabel')}>
                {orderOptions.map((option) => (
                  <AnimateButton unstyled
                    key={option}
                    type="button"
                    className={order === option ? 'active' : ''}
                    onClick={() => updateParams({ order: option, page: 1 })}
                  >
                    {t(`pages.search.orders.${option}`)}
                  </AnimateButton>
                ))}
              </nav>
            </div>
            <div className="search-result-summary">
              <span>{t('pages.search.results')}</span>
              <strong>{loading
                ? t('pages.search.syncing')
                : t('pages.search.count', {
                  count,
                  displayCount: formatNumber(resolvedLocale, count),
                })}</strong>
            </div>

            {loading ? (
              <LoadingState variant="panel" />
            ) : null}
            {!query ? <div className="state-strip">{t('pages.search.noQuery')}</div> : null}
            {query && !loading && !error && !items.length ? (
              <div className="state-strip">{t('pages.search.noResults')}</div>
            ) : null}

            <div className="search-result-list">
              {items.map((item) => (
                <article className="search-result-card" key={`${item.objectType}-${item.id}`}>
                  <div className="stream-card-head">
                    <span>{t(`contentTypes.${item.objectType}`, { defaultValue: item.objectType })}</span>
                    <strong>{resultSignal(item, resolvedLocale, t)}</strong>
                  </div>
                  <h2><Link to={resultPath(item)}><MathInline text={item.title} /></Link></h2>
                  <p className="stream-meta">
                    {item.author || 'Rinspace'} · {dateLabel(item.updatedAt || item.createdAt, resolvedLocale)}
                  </p>
                  <p className="stream-excerpt"><MathInline text={item.excerpt} /></p>
                  <div className="tag-row">
                    {(item.tags || []).slice(0, 4).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    <strong>{t(`contentTypes.${item.objectType}`, { defaultValue: item.objectType })}</strong>
                  </div>
                </article>
              ))}
            </div>

            {count > pageSize ? (
              <div className="linked-page-pagination">
                <AnimateButton unstyled type="button" disabled={page <= 1} onClick={() => updatePage(page - 1)}>
                  {t('pages.search.previous')}
                </AnimateButton>
                <span>{page} / {totalPages}</span>
                <AnimateButton unstyled type="button" disabled={page >= totalPages} onClick={() => updatePage(page + 1)}>
                  {t('pages.search.next')}
                </AnimateButton>
              </div>
            ) : null}
          </article>
        </section>
      </main>
    </>
  );
}

export default SearchPage;

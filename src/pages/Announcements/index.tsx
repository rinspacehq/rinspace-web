import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';

import { Button, Pagination } from '@/components/ui';
import SiteTopbar from '@/components/SiteTopbarShell';
import LoadingState from '@/components/LoadingState';
import { useAnnouncementAccess } from '@/features/announcements/useAnnouncementAccess';
import { formatDate, formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadAnnouncementFeed } from '@/services/domains/discussion';
import type { FeedItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';
import { contentPath } from '@/utils/routes';

const pageSize = 20;

function AnnouncementCard({ item }: { item: FeedItem }) {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const publication = item.publishedAt || item.createdAt;
  return (
    <article className="panel announcement-list-card">
      <h2><Link to={contentPath('announcement', item.id)}>{item.title}</Link></h2>
      <div className="announcement-card-meta">
        {item.forumPinned ? <span>{t('pages.announcement.pinned')}</span> : null}
        {publication ? (
          <time dateTime={publication}>
            {formatDate(resolvedLocale, publication, { dateStyle: 'medium', timeZone: 'Asia/Shanghai' })}
          </time>
        ) : null}
      </div>
      {item.excerpt ? <p>{item.excerpt}</p> : null}
    </article>
  );
}

export default function AnnouncementsPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const access = useAnnouncementAccess();
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadAnnouncementFeed>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const items = useMemo(() => result?.items ?? [], [result]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadAnnouncementFeed({ page, size: pageSize })
      .then(response => { if (!cancelled) setResult(response); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageFromError(reason, 'discovery.announcementsLoadFailed'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, attempt]);

  useRinPageContext(useMemo(() => ({
    kind: 'page' as const,
    title: t('pages.announcement.contextTitle'),
    excerpt: t('pages.announcement.contextExcerpt', { items: formatNumber(resolvedLocale, result?.count ?? 0) }),
    sections: items.length ? [{
      title: t('pages.announcement.contextSection'),
      body: items.slice(0, 12).map((item, index) => t('pages.announcement.contextItem', {
        index: formatNumber(resolvedLocale, index + 1),
        title: item.title,
        summary: item.excerpt,
      })).join('\n'),
    }] : [],
  }), [items, resolvedLocale, result, t]));

  return (
    <>
      <Helmet title={t('pages.announcement.documentTitle')} />
      <SiteTopbar />
      <main className="community-page announcement-page">
        <header className="panel directory-toolbar community-toolbar announcement-toolbar">
          <h1>{t('pages.announcement.heading')}</h1>
          {access.state === 'allowed' ? (
            <Link className="primary-button" to="/announcements/new">{t('pages.announcement.new')}</Link>
          ) : null}
        </header>
        <section className="announcement-list" aria-busy={loading}>
          {loading ? <LoadingState variant="panel" className="loading-panel" /> : error ? (
            <div className="panel announcement-list-card" role="alert">
              <p>{error}</p>
              <Button onClick={() => setAttempt(value => value + 1)}>{t('pages.announcement.retry')}</Button>
            </div>
          ) : (
            <>
              {items.map(item => <AnnouncementCard key={item.id} item={item} />)}
              {!result?.count ? <div className="state-strip">{t('pages.announcement.empty')}</div> : null}
              {result && (result.count > pageSize || page > 1) ? (
                <Pagination
                  page={page}
                  pageCount={Math.max(1, Math.ceil(result.count / pageSize))}
                  onPageChange={next => setParams(next === 1 ? {} : { page: String(next) })}
                />
              ) : null}
            </>
          )}
        </section>
      </main>
    </>
  );
}

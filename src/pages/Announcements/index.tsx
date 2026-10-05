import { useEffect, useMemo, useState } from 'react';
import { useNoticeToasts } from 'components/ui';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

import SiteTopbar from '@/components/SiteTopbarShell';
import LoadingState from '@/components/LoadingState';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadAnnouncementFeed } from '@/services/domains/discussion';
import type { FeedItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';
import { contentPath } from '@/utils/routes';

function itemPath(item: FeedItem) {
  return contentPath('announcement', item.id);
}

function AnnouncementCard({ item }: { item: FeedItem }) {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const metrics = [
    typeof item.readCount === 'number'
      ? t('directory.metrics.read', {
        count: item.readCount,
        displayCount: formatNumber(resolvedLocale, item.readCount),
      })
      : '',
    typeof item.commentCount === 'number'
      ? t('directory.metrics.comment', {
        count: item.commentCount,
        displayCount: formatNumber(resolvedLocale, item.commentCount),
      })
      : '',
  ].filter(Boolean).join(' · ');
  return (
    <article className="discussion-card announcement-list-card">
      <div className="discussion-card-main">
        <Link to={itemPath(item)}>{item.title}</Link>
        <p>{item.excerpt}</p>
        <div className="discussion-meta">
          <span>{t('pages.announcement.type')}</span>
          <span>{item.author}</span>
          {metrics ? <span>{metrics}</span> : null}
        </div>
      </div>
      <div className="discussion-heat">{t('pages.announcement.type')}</div>
    </article>
  );
}

function AnnouncementsPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadAnnouncementFeed({ size: 30 })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageFromError(err, 'discovery.announcementsLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useRinPageContext(
    useMemo(() => ({
      kind: 'page' as const,
      title: t('pages.announcement.contextTitle'),
      excerpt: t('pages.announcement.contextExcerpt', {
        items: formatNumber(resolvedLocale, items.length),
      }),
      sections: items.length
        ? [
            {
              title: t('pages.announcement.contextSection'),
              body: items
                .slice(0, 12)
                .map((item, index) => t('pages.announcement.contextItem', {
                  index: formatNumber(resolvedLocale, index + 1),
                  title: item.title,
                  summary: item.excerpt,
                }))
                .join('\n'),
            },
          ]
        : [],
    }), [items, resolvedLocale, t]),
  );

  return (
    <>
      <Helmet title={t('pages.announcement.documentTitle')} />
      <SiteTopbar />
      <main className="community-page announcement-page">
        <section className="panel directory-toolbar community-toolbar">
          <div className="detail-kicker">
            <span>{t('pages.announcement.heading')}</span>
            <strong>{loading
              ? t('pages.announcement.syncing')
              : t('pages.announcement.count', {
                count: items.length,
                displayCount: formatNumber(resolvedLocale, items.length),
              })}</strong>
          </div>
          <h1>{t('pages.announcement.heading')}</h1>
          <p />
        </section>

        <section className="community-layout">
          <div className="community-main">
            {loading ? (
              <LoadingState variant="panel" className="loading-panel" />
            ) : (
              <div className="discussion-list">
                {items.map((item) => (
                  <AnnouncementCard key={item.id} item={item} />
                ))}
                {!items.length ? (
                  <div className="state-strip">{t('pages.announcement.empty')}</div>
                ) : null}
              </div>
            )}
          </div>

        </section>
      </main>
    </>
  );
}

export default AnnouncementsPage;

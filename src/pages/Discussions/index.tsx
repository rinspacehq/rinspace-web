import { useEffect, useMemo, useState } from 'react';
import { useNoticeToasts } from 'components/ui';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';

import {
  DirectoryFeedCard,
  DirectoryModeTabs,
  normalizeDirectoryMode,
  type DirectoryMode,
} from '@/components/DirectoryStreamCard';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadHomeFeed } from '@/services/domains/activity';
import { loadDiscussionFeed } from '@/services/domains/discussion';
import { loadPersonalCollectionPage } from '@/services/domains/identity';
import type { FeedItem, LoadDiscussionFeedInput } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';

function discussionOrderForMode(mode: DirectoryMode): NonNullable<LoadDiscussionFeedInput['order']> {
  return mode === 'latest' ? 'newest' : 'hot';
}

function uniqueDiscussionItems(items: FeedItem[]) {
  const seen = new Set<string>();
  const next: FeedItem[] = [];
  items.forEach((item) => {
    const isDiscussion = item.type === 'discussion' || item.type === 'forum';
    if (!isDiscussion || seen.has(item.id)) return;
    seen.add(item.id);
    next.push(item);
  });
  return next;
}

function DiscussionsPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = normalizeDirectoryMode(searchParams.get('mode') || searchParams.get('order'));
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
    const loader =
      mode === 'saved'
        ? loadPersonalCollectionPage({ page: 1, pageSize: 60 })
            .then((page) => uniqueDiscussionItems(page.items))
        : mode === 'following'
          ? loadHomeFeed({ mode: 'following', size: 60 })
              .then((feed) => uniqueDiscussionItems(feed.stream))
          : loadDiscussionFeed({ order: discussionOrderForMode(mode), size: 36 })
              .then((response) => response.items);
    void loader
      .then((nextItems) => {
        if (!cancelled) setItems(uniqueDiscussionItems(nextItems));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setItems([]);
          setError(messageFromError(loadError, 'discovery.discussionsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useRinPageContext(
    useMemo(() => ({
      kind: 'page' as const,
      title: t('pages.discussion.contextTitle'),
      excerpt: t('pages.discussion.contextExcerpt', {
        items: formatNumber(resolvedLocale, items.length),
      }),
      sections: items.length
        ? [
            {
              title: t('pages.discussion.current'),
              body: items
                .slice(0, 12)
                .map((item, index) => t('assistantContext.item', {
                  index: formatNumber(resolvedLocale, index + 1),
                  title: item.title,
                  author: item.author,
                  summary: item.excerpt,
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

  return (
    <>
      <Helmet title={t('pages.discussion.documentTitle')} />
      <SiteTopbar />
      <main className="community-page directory-simple-page">
        <article className="panel community-board directory-stream-board directory-simple-board">
          <div className="panel-heading large directory-simple-heading">
            <h1>{t('pages.discussion.heading')}</h1>
            <DirectoryModeTabs mode={mode} onChange={updateMode} ariaLabel={t('pages.discussion.sort')} />
          </div>

          {loading ? (
            <LoadingState variant="panel" className="loading-panel" />
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="state-strip">{t('directory.noResults')}</div>
          ) : null}
          <div className="community-grid directory-stream-grid">
            {items.map((item) => (
              <DirectoryFeedCard key={item.id} item={item} />
            ))}
          </div>
        </article>
      </main>
    </>
  );
}

export default DiscussionsPage;

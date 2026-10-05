import { useEffect, useMemo, useState } from 'react';
import { useNoticeToasts } from 'components/ui';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import {
  DirectoryFeedCard,
  DirectoryModeTabs,
  normalizeDirectoryMode,
  type DirectoryMode,
} from '@/components/DirectoryStreamCard';
import LoadingState from '@/components/LoadingState';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadHomeFeed } from '@/services/domains/activity';
import { loadContentFeed } from '@/services/domains/article';
import { loadPersonalCollectionPage } from '@/services/domains/identity';
import type { FeedItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';

function uniqueBlogItems(items: FeedItem[]) {
  const seen = new Set<string>();
  const next: FeedItem[] = [];
  items.forEach((item) => {
    if (item.type !== 'blog' || seen.has(item.id)) return;
    seen.add(item.id);
    next.push(item);
  });
  return next;
}

function blogOrderForMode(mode: DirectoryMode) {
  return mode === 'latest' ? 'newest' : 'hot';
}

function BlogPage() {
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
            .then((page) => page.items.filter((item) => item.type === 'blog'))
        : mode === 'following'
          ? loadHomeFeed({ mode: 'following', size: 60 })
              .then((feed) => uniqueBlogItems(feed.stream))
          : loadContentFeed({ type: 'blog', order: blogOrderForMode(mode), size: 36 })
              .then((page) => page.items);
    void loader
      .then((nextItems) => {
        if (!cancelled) setItems(uniqueBlogItems(nextItems));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setItems([]);
          setError(messageFromError(loadError, 'discovery.blogsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const authorCount = useMemo(
    () => new Set(items.map((item) => item.author.trim()).filter(Boolean)).size,
    [items],
  );
  useRinPageContext(
    useMemo(() => ({
      kind: 'page' as const,
      title: t('pages.blog.contextTitle'),
      excerpt: t('pages.blog.contextExcerpt', {
        items: formatNumber(resolvedLocale, items.length),
        authors: formatNumber(resolvedLocale, authorCount),
      }),
      sections: items.length
        ? [
            {
              title: t('pages.blog.current'),
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
    }), [authorCount, items, resolvedLocale, t]),
  );

  const updateMode = (nextMode: DirectoryMode) => {
    const params = new URLSearchParams();
    if (nextMode !== 'hot') params.set('mode', nextMode);
    setSearchParams(params);
  };

  return (
    <>
      <Helmet title={t('pages.blog.documentTitle')} />
      <SiteTopbar />

      <main className="community-page directory-simple-page blog-index-shell">
        <article className="panel blog-index-board blog-community-board community-board directory-stream-board directory-simple-board" id="articles">
          <div className="panel-heading large directory-simple-heading">
            <h1>{t('pages.blog.heading')}</h1>
            <DirectoryModeTabs mode={mode} onChange={updateMode} ariaLabel={t('pages.blog.sort')} />
          </div>

          {loading ? (
            <LoadingState variant="panel" />
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="state-strip">{t('directory.noResults')}</div>
          ) : null}

          <div className="community-grid directory-stream-grid">
            {items.map((item) => (
              <DirectoryFeedCard item={item} key={item.id} />
            ))}
          </div>
        </article>
      </main>
    </>
  );
}

export default BlogPage;

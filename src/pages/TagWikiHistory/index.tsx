import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { MathInline } from '@/components/MathText';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadTagDetail } from '@/services/domains/tag';
import type { TagDetail } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { tagWikiGiteaHistoryPath } from '@/pages/TagWiki/gitea';
import {
  legacyTagPath,
  tagWikiHistoryPath as canonicalTagWikiHistoryPath,
  tagWikiPath,
} from '@/utils/routes';

function tagName(tag: TagDetail) {
  return tag.displayName.trim() || tag.slugName;
}

function legacyTagWikiInfoPath(slug: string) {
  return `${legacyTagPath(slug)}/info`;
}

function TagWikiHistoryPage() {
  const { t } = useFeatureTranslation('reader');
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeTagId = decodeURIComponent(params.tagId || '').trim();
  const routeTagSlug = decodeURIComponent(params.tagSlug || '').trim();
  const routeTagName = decodeURIComponent(params.tagName || '').trim();
  const effectiveRouteTagId = routeTagId || (/^\d+$/.test(routeTagName) ? routeTagName : '');
  const effectiveRouteTagName = effectiveRouteTagId ? '' : routeTagName;
  const tagLookup = effectiveRouteTagId || effectiveRouteTagName;
  const fallbackSlug = routeTagSlug || routeTagName;
  const [tag, setTag] = useState<TagDetail | null>(null);
  const [error, setError] = useState('');
  const displaySlug = tag?.slugName || fallbackSlug || tagLookup;
  const historyPath = tagWikiGiteaHistoryPath(tag || displaySlug);
  const wikiInfoPath = useMemo(() => {
    if (tag) return tagWikiPath(tag.id, tag.slugName || tagName(tag));
    if (effectiveRouteTagId) return tagWikiPath(effectiveRouteTagId, fallbackSlug || effectiveRouteTagId);
    return fallbackSlug ? legacyTagWikiInfoPath(fallbackSlug) : '';
  }, [effectiveRouteTagId, fallbackSlug, tag]);
  const title = displaySlug
    ? t('tagWikiHistory.tagDocumentTitle', { tag: displaySlug })
    : t('tagWikiHistory.documentTitle');

  useEffect(() => {
    if (!tagLookup) return;
    let cancelled = false;
    if (!effectiveRouteTagId) {
      window.location.replace(tagWikiGiteaHistoryPath(effectiveRouteTagName));
      return () => {
        cancelled = true;
      };
    }
    setError('');
    void loadTagDetail({ tagId: effectiveRouteTagId })
      .then((detail) => {
        if (cancelled) return;
        setTag(detail);
        const canonicalPath = canonicalTagWikiHistoryPath(detail.id, detail.slugName || tagName(detail));
        if (location.pathname !== canonicalPath) {
          navigate(`${canonicalPath}${location.search}${location.hash}`, { replace: true });
        }
        window.location.replace(tagWikiGiteaHistoryPath(detail));
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'reader.tagLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveRouteTagId, effectiveRouteTagName, location.hash, location.pathname, location.search, navigate, t, tagLookup]);

  return (
    <>
      <Helmet title={title} />
      <SiteTopbar />
      <main className="tag-wiki-shell detail-blog">
        <section className="tag-wiki-history-page">
          <header className="panel tag-wiki-history-hero">
            <div>
              <p className="wiki-entry-kicker">{t('tagWikiHistory.kicker')}</p>
              <h1><MathInline text={displaySlug || t('tagWikiHistory.tagFallback')} /></h1>
              <p>{t('tagWikiHistory.redirecting')}</p>
            </div>
            <div className="wiki-entry-actions">
              {wikiInfoPath ? <a href={wikiInfoPath}>{t('tagWikiHistory.back')}</a> : null}
              <a href={historyPath}>{t('tagWikiHistory.open')}</a>
            </div>
          </header>
          {error ? <Alert className="notice error">{error}</Alert> : null}
          <SiteIcpLink />
        </section>
      </main>
    </>
  );
}

export default TagWikiHistoryPage;

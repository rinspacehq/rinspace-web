import { AnimateButton, Icon } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { publicEnv } from '@/app/config/env';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import TagCreationFlow from '@/features/tags/TagCreationFlow';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadTagDetail } from '@/services/domains/tag';
import { messageFromError } from '@/services/errors';
import type { TagDetail } from '@/services/contracts';
import { openGiteaPath } from '@/utils/giteaPaths';

export default function TagWikiEditPage() {
  const { t } = useFeatureTranslation('reader');
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const createMode = location.pathname.replace(/\/+$/, '').endsWith('/tags/new');
  const initialName = useMemo(
    () => new URLSearchParams(location.search).get('name')?.trim() || '',
    [location.search],
  );
  const reference = decodeURIComponent(params.tagId || params.tagName || '').trim();
  const [tag, setTag] = useState<TagDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!createMode);

  useEffect(() => {
    if (createMode || !reference) return undefined;
    let active = true;
    void loadTagDetail(/^\d+$/.test(reference) ? { tagId: reference } : { name: reference })
      .then((detail) => {
        if (active) setTag(detail);
      })
      .catch((reason) => {
        if (active) setError(messageFromError(reason, 'reader.tagSourceLoadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [createMode, reference]);

  if (createMode) {
    return (
      <>
        <Helmet title={t('tagWikiEdit.createDocumentTitle')} />
        <SiteTopbar />
        <main className="tag-wiki-shell">
          <TagCreationFlow
            open
            onOpenChange={(open) => {
              if (!open) navigate('/tags');
            }}
            invocation={{ source: 'directory', initialName }}
            onCreated={(createdTag) => {
              openGiteaPath('tags', createdTag.id);
            }}
          />
        </main>
      </>
    );
  }

  const repositoryURL = tag
    ? `${publicEnv.giteaBasePath.replace(/\/$/, '')}/tags/${tag.tagId}`
    : '';
  const tagLabel = tag?.displayName || tag?.slugName || '';
  const documentTitle = tagLabel
    ? t('tagWikiEdit.tagDocumentTitle', { tag: tagLabel })
    : t('tagWikiEdit.documentTitle');

  return (
    <>
      <Helmet title={documentTitle} />
      <SiteTopbar />
      <main className="tag-wiki-shell">
        <section className="panel tag-workspace-card">
          <div className="detail-kicker"><span>Git source</span><strong>Gitea</strong></div>
          <h1>{t('tagWikiEdit.heading')}</h1>
          {loading ? <LoadingState variant="panel" /> : null}
          {error ? <p role="alert">{error}</p> : null}
          {tag ? (
            <>
              <dl>
                <dt>{t('tagWikiEdit.stableId')}</dt><dd>{tag.tagId}</dd>
                <dt>{t('tagWikiEdit.repositoryState')}</dt><dd>{tag.repositoryState || 'pending'}</dd>
                <dt>{t('tagWikiEdit.publicRevision')}</dt><dd>{tag.updatedAt || t('tagWikiEdit.renderPending')}</dd>
              </dl>
              <p>{t('tagWikiEdit.repositoryOnly')}</p>
              <div className="publish-actions">
                <a href={repositoryURL} target="_blank" rel="noreferrer">
                  <AnimateButton unstyled type="button">
                    <Icon name="git" />{t('tagWikiEdit.openGitea')}
                  </AnimateButton>
                </a>
                <a href={repositoryURL} target="_blank" rel="noreferrer">
                  {t('tagWikiEdit.popupFallback')}
                </a>
                <Link to={`/tags/${tag.tagId}`}>{t('tagWikiEdit.back')}</Link>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}

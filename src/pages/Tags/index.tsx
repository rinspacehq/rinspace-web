import { AnimateButton, Icon, useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import {
  DirectoryModeTabs,
  DirectoryTypeMetaCategory,
  normalizeDirectoryMode,
  type DirectoryMode,
} from '@/components/DirectoryStreamCard';
import LoadingState from '@/components/LoadingState';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { followTarget } from '@/services/domains/discussion';
import { loadTagPage } from '@/services/domains/tag';
import type { TagPageInput, TagPageItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { loadTagDirectory, type TagDirectoryItem, type TagDirectoryView } from '@/services/tagV2';
import { tagReadPath } from '@/utils/routes';

const governanceViews: readonly TagDirectoryView[] = [
  'all',
  'unclassified',
  'review',
  'repository',
];

function tagOrderForMode(mode: DirectoryMode): NonNullable<TagPageInput['queryCond']> {
  return mode === 'latest' ? 'newest' : 'popular';
}

function tagName(tag: Pick<TagPageItem, 'displayName' | 'slugName'>) {
  return tag.displayName.trim() || tag.slugName;
}

function tagDetailPath(tag: Pick<TagPageItem, 'tagId' | 'slugName' | 'displayName'>) {
  return tagReadPath(tag.tagId, tag.slugName || tagName(tag));
}

function filterTagsForMode(items: TagPageItem[], mode: DirectoryMode) {
  if (mode === 'following' || mode === 'saved') {
    return items.filter((item) => item.isFollower);
  }
  return items;
}

function TagsPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = normalizeDirectoryMode(searchParams.get('mode') || searchParams.get('order'));
  const [items, setItems] = useState<TagPageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followBusySlug, setFollowBusySlug] = useState('');
  const [followError, setFollowError] = useState('');
  const governanceView = (governanceViews.some((item) => item === searchParams.get('view')) ? searchParams.get('view') : 'all') as TagDirectoryView;
  const parentTagId = Math.max(0, Number(searchParams.get('parent')) || 0);
  const [parentInput, setParentInput] = useState(parentTagId ? String(parentTagId) : '');
  const [governanceItems, setGovernanceItems] = useState<TagDirectoryItem[]>([]);
  const [governanceCursor, setGovernanceCursor] = useState('');
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [governanceError, setGovernanceError] = useState('');

  useNoticeToasts({
    error, followError, governanceError,
  });
  useEffect(() => {
    let cancelled = false;
    setGovernanceLoading(true);
    setGovernanceError('');
    void loadTagDirectory(governanceView, parentTagId)
      .then((page) => {
        if (cancelled) return;
        setGovernanceItems(page.items);
        setGovernanceCursor(page.nextCursor || '');
      })
      .catch((failure) => {
        if (!cancelled) {
          setGovernanceItems([]);
          setGovernanceCursor('');
          setGovernanceError(messageFromError(failure, 'discovery.tagGovernanceLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setGovernanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [governanceView, parentTagId]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    void loadTagPage({
      page: 1,
      pageSize: 36,
      queryCond: tagOrderForMode(mode),
    })
      .then((result) => {
        if (cancelled) return;
        const nextItems = filterTagsForMode(result.items, mode);
        setItems(nextItems);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setItems([]);
          setError(messageFromError(loadError, 'discovery.tagsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const updateMode = (nextMode: DirectoryMode) => {
    const params = new URLSearchParams(searchParams);
    if (nextMode !== 'hot') params.set('mode', nextMode); else params.delete('mode');
    setSearchParams(params);
  };

  const updateGovernanceView = (view: TagDirectoryView) => {
    const params = new URLSearchParams(searchParams);
    if (view === 'all') params.delete('view'); else params.set('view', view);
    setSearchParams(params);
  };

  const browseParent = () => {
    const id = Math.max(0, Number(parentInput) || 0);
    const params = new URLSearchParams(searchParams);
    if (id) params.set('parent', String(id)); else params.delete('parent');
    setSearchParams(params);
  };

  const loadMoreGovernance = async () => {
    if (!governanceCursor) return;
    setGovernanceLoading(true);
    try {
      const page = await loadTagDirectory(governanceView, parentTagId, governanceCursor);
      setGovernanceItems((current) => [...current, ...page.items]);
      setGovernanceCursor(page.nextCursor || '');
    } catch (failure) {
      setGovernanceError(messageFromError(failure, 'discovery.tagGovernanceLoadFailed'));
    } finally {
      setGovernanceLoading(false);
    }
  };

  const toggleTagFollow = async (tag: TagPageItem) => {
    const slugName = tag.slugName.trim();
    if (!slugName) return;
    setFollowError('');
    setFollowBusySlug(slugName);
    try {
      await followTarget({
        targetType: 'tag',
        slug: slugName,
        targetId: slugName,
        isCancel: tag.isFollower,
      });
      setItems((current) => current
        .map((item) => {
          if (item.slugName !== slugName) return item;
          return {
            ...item,
            isFollower: !tag.isFollower,
            followCount: Math.max(0, item.followCount + (tag.isFollower ? -1 : 1)),
          };
        })
        .filter((item) => (mode === 'following' || mode === 'saved') ? item.isFollower : true));
    } catch (followFailure) {
      setFollowError(messageFromError(followFailure, 'discovery.tagFollowFailed'));
    } finally {
      setFollowBusySlug('');
    }
  };

  return (
    <>
      <Helmet title={t('pages.tag.documentTitle')} />
      <SiteTopbar />

      <main className="community-page directory-simple-page tag-directory-shell">
        <section id="tag-governance-directory" className="panel tag-governance-directory" aria-labelledby="tag-governance-directory-title">
          <div className="panel-heading large">
            <div>
              <h1 id="tag-governance-directory-title">{t('pages.tag.governanceTitle')}</h1>
              <p>{t('pages.tag.governanceDescription')}</p>
            </div>
            <Link className="tag-directory-create" to="/tags/new"><Icon name="plus-circle" />{t('pages.tag.create')}</Link>
          </div>
          <div className="tag-governance-toolbar">
            <nav aria-label={t('pages.tag.maintenanceViews')}>
              {governanceViews.map((view) => <AnimateButton unstyled key={view} type="button" className={governanceView === view ? 'active' : ''} aria-pressed={governanceView === view} onClick={() => updateGovernanceView(view)}>{t(`pages.tag.views.${view}`)}</AnimateButton>)}
            </nav>
            <form onSubmit={(event) => { event.preventDefault(); browseParent(); }}>
              <label htmlFor="tag-parent-browse">{t('pages.tag.parentId')}</label>
              <input id="tag-parent-browse" inputMode="numeric" pattern="[0-9]*" value={parentInput} onChange={(event) => setParentInput(event.target.value)} placeholder={t('pages.tag.parentPlaceholder')} />
              <AnimateButton unstyled type="submit"><Icon name="search" />{t('pages.tag.browse')}</AnimateButton>
              {parentTagId ? <AnimateButton unstyled type="button" onClick={() => { setParentInput(''); const params = new URLSearchParams(searchParams); params.delete('parent'); setSearchParams(params); }}>{t('pages.tag.clear')}</AnimateButton> : null}
            </form>
          </div>
          {parentTagId ? <p className="tag-directory-context"><Icon name="link-45deg" />{t('pages.tag.browsingParent', { id: formatNumber(resolvedLocale, parentTagId) })}</p> : null}
          {governanceLoading && !governanceItems.length ? <LoadingState variant="panel" /> : null}
          {!governanceLoading && !governanceItems.length ? <div className="state-strip">{t('pages.tag.emptyView')}</div> : null}
          <div className="tag-governance-grid">
            {governanceItems.map((item) => (
              <article key={item.id} className="tag-governance-card">
                <div className="tag-governance-card-heading">
                  <Link to={tagReadPath(item.id, item.displayName)}>{item.displayName || `Tag #${item.id}`}</Link>
                  <code>#{item.id}</code>
                </div>
                <p>{item.usageScope || t('pages.tag.usageMissing')}</p>
                <div className="tag-governance-status">
                  <span data-state={item.lifecycleState}>{t(`pages.tag.states.${item.lifecycleState}`)}</span>
                  <span data-state={item.reviewState}>{t(`pages.tag.states.${item.reviewState}`)}</span>
                  <span data-state={item.repositoryState}>{t('pages.tag.repository', { state: t(`pages.tag.states.${item.repositoryState}`) })}</span>
                </div>
                <div className="tag-knowledge-chips">
                  {item.parentTagIds.map((id) => <Link key={id} to={`?view=${governanceView}&parent=${id}`}>{t('pages.tag.parent', { id: formatNumber(resolvedLocale, id) })}</Link>)}
                  {!item.parentTagIds.length ? <span>{t('pages.tag.unclassified')}</span> : null}
                </div>
              </article>
            ))}
          </div>
          {governanceCursor ? <div className="tag-directory-more"><AnimateButton unstyled type="button" disabled={governanceLoading} onClick={() => void loadMoreGovernance()}>{governanceLoading ? t('pages.tag.loading') : t('pages.tag.loadMore')}</AnimateButton></div> : null}
        </section>
        <article className="panel tag-directory-board community-board directory-stream-board directory-simple-board">
          <div className="panel-heading large directory-simple-heading">
            <h1>{t('pages.tag.heading')}</h1>
            <DirectoryModeTabs mode={mode} onChange={updateMode} ariaLabel={t('pages.tag.sort')} />
          </div>

          {loading ? (
            <LoadingState variant="panel" />
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="state-strip">{t('directory.noResults')}</div>
          ) : null}

          <div className="community-grid tag-directory-list directory-stream-grid">
            {items.map((tag) => (
              <article className="stream-card stream-card-tag tag-directory-card" key={tag.tagId || tag.slugName}>
                <div className="stream-card-head">
                  <div className="stream-card-topline">
                    <DirectoryTypeMetaCategory type="tag" />
                  </div>
                </div>
                <h2>
                  <Link to={tagDetailPath(tag)}>
                    {tagName(tag)}
                  </Link>
                </h2>
                <p className="stream-excerpt">
                  {tag.usageExcerpt || tag.description || tag.slugName}
                </p>
                <div className="stream-footer">
                  <div className="stream-metrics">
                    <span className="stream-metric-primary">{t('pages.tag.questionCount', {
                      count: tag.questionCount,
                      displayCount: formatNumber(resolvedLocale, tag.questionCount),
                    })}</span>
                    <span>{t('pages.tag.followCount', {
                      count: tag.followCount,
                      displayCount: formatNumber(resolvedLocale, tag.followCount),
                    })}</span>
                  </div>
                  <span className="tag-directory-follow">
                    <AnimateButton unstyled
                      type="button"
                      className={tag.isFollower ? 'active' : ''}
                      disabled={Boolean(followBusySlug)}
                      onClick={() => void toggleTagFollow(tag)}
                    >
                      {followBusySlug === tag.slugName
                        ? t('pages.tag.syncing')
                        : tag.isFollower
                          ? t('pages.tag.unfollow')
                          : t('pages.tag.follow')}
                    </AnimateButton>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </article>
      </main>
    </>
  );
}

export default TagsPage;

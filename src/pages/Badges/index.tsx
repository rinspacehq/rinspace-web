import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName, AnimateButton, useNoticeToasts } from 'components/ui';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';

import AvatarName from '@/components/AvatarName';
import LoadingState from '@/components/LoadingState';
import { identityDateLabel, identityObjectTypeLabel, type IdentityTranslation } from '@/features/identity/labels';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import type { LocaleId } from '@/i18n/types';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadBadgeAwardsPage, loadBadgeInfo, loadBadges } from '@/services/domains/identity';
import type { BadgeAwardItem, BadgeGroup, BadgeInfo, BadgeListItem } from '@/services/contracts';
import { answerPath, contentPath, profilePath, questionPath } from '@/utils/routes';

const badgeIconClass: Record<string, IconName> = {
  answer: 'chat-left-text',
  check: 'check2-circle',
  comment: 'chat-dots',
  question: 'question-square',
  reputation: 'award',
  vote: 'hand-thumbs-up',
};

function flattenBadges(groups: BadgeGroup[]) {
  return groups.flatMap((group) => group.badges.map((badge) => ({ ...badge, groupName: group.group_name })));
}

function badgeIcon(icon: string) {
  return badgeIconClass[icon] || 'patch-check';
}

function levelLabel(t: IdentityTranslation, level: number) {
  if (level >= 3) return t('badges.levels.rare');
  if (level === 2) return t('badges.levels.collaboration');
  return t('badges.levels.start');
}

function awardPath(award: BadgeAwardItem) {
  if (award.object_type === 'question' && (award.url_title || award.question_id || award.object_id)) {
    return questionPath(award.url_title || award.question_id || award.object_id);
  }
  if (award.object_type === 'answer' && (award.url_title || award.question_id)) {
    return award.answer_id ? answerPath(award.url_title || award.question_id, award.answer_id) : questionPath(award.url_title || award.question_id);
  }
  if (award.object_type === 'comment' && (award.url_title || award.question_id)) {
    return questionPath(award.url_title || award.question_id);
  }
  if (award.object_type === 'tag') return `/tags?q=${encodeURIComponent(award.object_id)}`;
  if (award.object_type === 'user') return profilePath(award.author_user_info.username || award.object_id);
  if (award.object_type === 'blog') return contentPath('blog', award.object_id);
  if (award.object_type === 'discussion' || award.object_type === 'forum') return contentPath('discussion', award.object_id);
  if (award.object_type === 'dynamic' || award.object_type === 'status') return contentPath('dynamic', award.object_id);
  return '/';
}

function memberName(award: BadgeAwardItem) {
  return award.author_user_info.display_name || award.author_user_info.username || 'Rinspace';
}

function BadgesPage() {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id') || '';
  const [groups, setGroups] = useState<BadgeGroup[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);
  const [awards, setAwards] = useState<BadgeAwardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');

  const badges = useMemo(() => flattenBadges(groups), [groups]);
  const totalAwards = useMemo(() => badges.reduce((total, badge) => total + badge.award_count, 0), [badges]);
  const activeId = selectedId || badges[0]?.id || '';

  useNoticeToasts({
    detailError, error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    void loadBadges()
      .then((nextGroups) => {
        if (cancelled) return;
        setGroups(nextGroups);
        if (!selectedId) {
          const firstBadge = flattenBadges(nextGroups)[0];
          if (firstBadge) {
            setSearchParams({ id: firstBadge.id }, { replace: true });
          }
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setGroups([]);
          setError(localizedErrorMessage(loadError, 'identity.badgesLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!activeId) {
      setSelectedBadge(null);
      setAwards([]);
      return undefined;
    }

    setDetailLoading(true);
    setDetailError('');
    void Promise.all([
      loadBadgeInfo(activeId),
      loadBadgeAwardsPage({ badgeId: activeId, page: 1, pageSize: 8 }),
    ])
      .then(([info, awardPage]) => {
        if (cancelled) return;
        setSelectedBadge(info);
        setAwards(awardPage.items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSelectedBadge(null);
          setAwards([]);
          setDetailError(localizedErrorMessage(loadError, 'identity.badgeDetailLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const selectBadge = (badge: BadgeListItem) => {
    setSearchParams({ id: badge.id });
  };

  const renderBadge = (badge: BadgeListItem & { groupName: string }) => (
    <AnimateButton unstyled
      type="button"
      className={`badge-tile${badge.id === activeId ? ' active' : ''}`}
      key={badge.id}
      onClick={() => selectBadge(badge)}
    >
      <span className="badge-symbol">
        <Icon name={badgeIcon(badge.icon)} />
      </span>
      <span>
        <strong>{badge.name}</strong>
        <small>{badge.groupName} · {levelLabel(t, badge.level)}</small>
      </span>
      <em>{formatNumber(locale, badge.award_count)}</em>
    </AnimateButton>
  );

  const renderAward = (award: BadgeAwardItem) => (
    <Link className="badge-award-row" to={awardPath(award)} key={`${award.created_at}-${award.author_user_info.username}-${award.object_id}`}>
      <AvatarName
        name={memberName(award)}
        imageUrl={award.author_user_info.avatar}
        rank={award.author_user_info.rank}
      />
      <span>{identityDateLabel(locale, award.created_at)} · {award.object_type ? identityObjectTypeLabel(t, award.object_type) : t('objects.community')}</span>
    </Link>
  );

  return (
    <>
      <Helmet title={`${t('badges.title')} - ${t('navigation:brandName')}`} />
      <SiteTopbar />

      <main className="badge-shell">
        <section className="panel directory-toolbar badge-toolbar">
          <div className="detail-kicker">
            <span>{t('badges.title')}</span>
            <strong>
              {loading
                ? t('shared.syncing')
                : t('badges.badgeCount', { count: badges.length, displayCount: formatNumber(locale, badges.length) })}
            </strong>
          </div>
          <h1>{t('badges.wall')}</h1>
          <p />
          <div className="badge-stats" aria-label={t('badges.statsLabel')}>
            <span><strong>{groups.length ? formatNumber(locale, groups.length) : '—'}</strong> {t('badges.groups')}</span>
            <span><strong>{badges.length ? formatNumber(locale, badges.length) : '—'}</strong> {t('badges.badges')}</span>
            <span><strong>{totalAwards ? formatNumber(locale, totalAwards) : '—'}</strong> {t('badges.awards')}</span>
          </div>
        </section>

        <section className="badge-grid">
          <article className="panel badge-board">
            <div className="panel-heading large">
              <div>
                <span>{t('badges.available')}</span>
                <strong>{formatNumber(locale, badges.length)}</strong>
              </div>
              <Link to="/notifications">{t('badges.notifications')}</Link>
            </div>
            {loading ? (
              <LoadingState variant="panel" />
            ) : null}
            {!loading && !error && !groups.length ? (
              <div className="state-strip">{t('badges.empty')}</div>
            ) : null}
            <div className="badge-group-list">
              {groups.map((group) => (
                <section className="badge-group" key={group.group_name}>
                  <div className="stream-card-head">
                    <span>{group.group_name}</span>
                    <strong>{formatNumber(locale, group.badges.length)}</strong>
                  </div>
                  <div className="badge-tile-grid">
                    {group.badges.map((badge) => renderBadge({ ...badge, groupName: group.group_name }))}
                  </div>
                </section>
              ))}
            </div>
          </article>

          <aside className="badge-side">
            <section className="panel badge-detail-panel">
              <div className="panel-heading">
                <span>{t('badges.current')}</span>
                <strong>{selectedBadge ? levelLabel(t, selectedBadge.level) : t('shared.details')}</strong>
              </div>
              {detailLoading ? (
                <LoadingState variant="panel" />
              ) : null}
              {selectedBadge ? (
                <div className="badge-detail">
                  <span className="badge-symbol large">
                    <Icon name={badgeIcon(selectedBadge.icon)} />
                  </span>
                  <h2>{selectedBadge.name}</h2>
                  <p>{selectedBadge.description}</p>
                  <dl className="detail-stats">
                    <div>
                      <dt>{t('badges.awarded')}</dt>
                      <dd>{formatNumber(locale, selectedBadge.award_count)}</dd>
                    </div>
                    <div>
                      <dt>{t('badges.level')}</dt>
                      <dd>{formatNumber(locale, selectedBadge.level)}</dd>
                    </div>
                    <div>
                      <dt>{t('badges.type')}</dt>
                      <dd>{selectedBadge.is_single ? t('badges.single') : t('badges.repeatable')}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <span>{t('badges.recent')}</span>
                <strong>{formatNumber(locale, awards.length)}</strong>
              </div>
              {awards.length ? (
                <div className="badge-award-list">
                  {awards.map(renderAward)}
                </div>
              ) : (
                <div className="state-strip">{t('badges.noAwards')}</div>
              )}
            </section>
            <SiteIcpLink />
          </aside>
        </section>
      </main>
    </>
  );
}

export default BadgesPage;

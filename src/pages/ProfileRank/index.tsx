import { Icon , useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';

import AvatarImage from '@/components/AvatarImage';
import CultivationBadge from '@/components/CultivationBadge';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import { identityCultivationRealmLabel, type IdentityTranslation } from '@/features/identity/labels';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadPersonalUserInfo } from '@/services/domains/identity';
import type { AnswerUserInfo } from '@/services/contracts';
import { cultivationForRank, cultivationProgressForRank, cultivationThresholds } from '@/utils/cultivation';
import { cleanUserId, profilePath } from '@/utils/routes';

function initialsFor(name: string) {
  const normalized = name.trim();
  if (!normalized) return 'R';
  const letters = Array.from(normalized.replace(/\s+/g, ''));
  return letters.slice(0, 2).join('').toUpperCase();
}

function thresholdLabel(t: IdentityTranslation, threshold: (typeof cultivationThresholds)[number]) {
  const cultivation = cultivationForRank(threshold.minRank);
  return cultivation ? identityCultivationRealmLabel(t, cultivation) : '';
}

export default function ProfileRankPage() {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const { username = '' } = useParams();
  const userId = cleanUserId(username);
  const [user, setUser] = useState<AnswerUserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    if (!userId) {
      setUser(null);
      setError(localizedErrorMessage(null, 'identity.rankMissingUsername'));
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadPersonalUserInfo(userId)
      .then((nextUser) => {
        if (!cancelled) setUser(nextUser);
      })
      .catch((rankError) => {
        if (!cancelled) {
          setUser(null);
          setError(localizedErrorMessage(rankError, 'identity.rankLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const progress = useMemo(() => cultivationProgressForRank(user?.rank), [user?.rank]);
  const currentRealm = progress ? identityCultivationRealmLabel(t, progress.cultivation) : t('rank.noRealm');
  const currentRank = progress ? formatNumber(locale, progress.rank) : '—';
  const nextHint = progress
    ? progress.nextThreshold
      ? t('rank.remaining', { displayCount: formatNumber(locale, progress.remaining || 0) })
      : t('rank.maximum')
    : t('rank.noCultivation');

  return (
    <>
      <Helmet title={`${t('rank.title', { name: user?.display_name || userId || t('rank.userFallback') })} · ${t('navigation:brandName')}`} />
      <SiteTopbar />
      <main className="profile-rank-shell">
        <section className="profile-rank-hero">
          <div className="profile-rank-identity">
            <span className="profile-rank-eyebrow">{t('rank.eyebrow')}</span>
            <h1>{user?.display_name || userId || 'Rinspace'}</h1>
            <p>@{user?.username || userId || 'rinspace'}</p>
          </div>
          <Link className="profile-rank-backlink secondary-link" to={profilePath(userId)}>
            <Icon name="arrow-left" />
            {t('rank.back')}
          </Link>
        </section>

        {loading ? <LoadingState variant="panel" className="profile-rank-loading" /> : null}

        {user ? (
          <section className="profile-rank-summary">
            <div className="profile-rank-avatar">
              <AvatarImage
                className="profile-rank-avatar-image"
                src={user.avatar}
                fallback={
                  <span className="profile-rank-avatar-fallback">
                    {initialsFor(user.display_name || user.username)}
                  </span>
                }
              />
            </div>
            <div className="profile-rank-summary-copy">
              <span>{t('rank.currentRealm')}</span>
              <strong>{currentRealm}</strong>
              <p>{nextHint}</p>
            </div>
            <div className="profile-rank-summary-meta">
              <div>
                <span>{t('rank.currentCultivation')}</span>
                <strong>{currentRank}</strong>
              </div>
              <div>
                <span>{t('rank.realmBadge')}</span>
                <CultivationBadge rank={user.rank} />
              </div>
            </div>
          </section>
        ) : null}

        <section className="profile-rank-section">
          <div className="profile-rank-section-head">
            <div>
              <span>{t('rank.mapping')}</span>
              <strong>{t('rank.startingCultivation')}</strong>
            </div>
          </div>
          <div className="profile-rank-table-wrap">
            <table className="profile-rank-table">
              <thead>
                <tr>
                  <th>{t('rank.realmBadge')}</th>
                  <th>{t('rank.realm')}</th>
                  <th>{t('rank.startingCultivation')}</th>
                </tr>
              </thead>
              <tbody>
                {cultivationThresholds.map((threshold) => {
                  const label = thresholdLabel(t, threshold);
                  const active = progress ? threshold.minRank === progress.nextThreshold?.minRank || label === progress.cultivation.fullName : false;
                  return (
                    <tr key={`${label}-${threshold.minRank}`} className={active ? 'active' : ''}>
                      <td>
                        <CultivationBadge rank={threshold.minRank} />
                      </td>
                      <td>{label}</td>
                      <td>{formatNumber(locale, threshold.minRank)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

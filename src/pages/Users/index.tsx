import { Icon } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';

import AvatarName from '@/components/AvatarName';
import LoadingState from '@/components/LoadingState';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadUserRanking } from '@/services/domains/identity';
import type { UserRankingResponse, UserRankingSimpleInfo } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { profilePath as routeProfilePath } from '@/utils/routes';

type MemberSectionProps = {
  accent: string;
  emptyLabel: string;
  items: UserRankingSimpleInfo[];
  metric: 'rank' | 'vote_count';
  title: string;
};

function profilePath(member: Pick<UserRankingSimpleInfo, 'id' | 'display_name' | 'username'>) {
  return routeProfilePath(member.username || member.id);
}

function memberName(member: Pick<UserRankingSimpleInfo, 'display_name' | 'username'>) {
  return member.display_name.trim() || member.username.trim() || 'Rinspace';
}

function compactNumber(value: number, locale: 'zh-CN' | 'en') {
  return formatNumber(locale, value, {
    notation: 'compact',
    maximumFractionDigits: value >= 10_000 ? 0 : 1,
  });
}

function memberKey(member: Pick<UserRankingSimpleInfo, 'id' | 'display_name' | 'username'>) {
  return (member.id || member.username || member.display_name).trim().toLowerCase();
}

function uniqueMembers(groups: UserRankingSimpleInfo[][]) {
  const seen = new Set<string>();
  const members: UserRankingSimpleInfo[] = [];
  groups.flat().forEach((member) => {
    const key = memberKey(member);
    if (!key || seen.has(key)) return;
    seen.add(key);
    members.push(member);
  });
  return members;
}

function MemberSection({ accent, emptyLabel, items, metric, title }: MemberSectionProps) {
  const { resolvedLocale } = useLanguage();
  return (
    <section className="panel users-section">
      <div className="panel-heading">
        <span>{title}</span>
        <strong>{formatNumber(resolvedLocale, items.length)}</strong>
      </div>
      {items.length ? (
        <div className="users-member-list">
          {items.map((member, index) => (
            <Link className="users-member-row" to={profilePath(member)} key={`${title}-${memberKey(member)}-${index}`}>
              <span className="member-rank">{`#${formatNumber(resolvedLocale, index + 1)}`}</span>
              <AvatarName
                name={memberName(member)}
                imageUrl={member.avatar}
                rank={member.rank}
                size="md"
              />
              <span className="users-member-meta">
                <strong>{compactNumber(member[metric], resolvedLocale)}</strong>
                <small>{accent}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="state-strip">{emptyLabel}</div>
      )}
    </section>
  );
}

function UsersPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [ranking, setRanking] = useState<UserRankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadUserRanking()
      .then((result) => {
        if (!cancelled) setRanking(result);
      })
      .catch((rankingError) => {
        if (!cancelled) {
          setRanking(null);
          setError(messageFromError(rankingError, 'discovery.usersLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleMembers = useMemo(() => {
    if (!ranking) return [];
    return uniqueMembers([
      ranking.users_with_the_most_reputation,
      ranking.users_with_the_most_vote,
      ranking.staffs,
    ]);
  }, [ranking]);

  const totalReputation = useMemo(
    () => visibleMembers.reduce((total, member) => total + member.rank, 0),
    [visibleMembers],
  );
  const totalVotes = useMemo(
    () => visibleMembers.reduce((total, member) => total + member.vote_count, 0),
    [visibleMembers],
  );

  return (
    <>
      <Helmet title={t('pages.users.documentTitle')} />
      <SiteTopbar />

      <main className="users-shell">
        <section className="panel directory-toolbar users-toolbar">
          <div className="section-label">
            <Icon name="people" />
            {t('pages.users.heading')}
          </div>
          <h1>{t('pages.users.heading')}</h1>
          <p />
        </section>

        {loading ? (
          <LoadingState variant="panel" />
        ) : null}
        {error ? <Alert className="notice error">{error}</Alert> : null}

        <section className="users-grid">
          <div className="users-board">
            <MemberSection
              accent={t('pages.users.reputation')}
              emptyLabel={t('pages.users.emptyReputation')}
              items={ranking?.users_with_the_most_reputation ?? []}
              metric="rank"
              title={t('pages.users.reputationMembers')}
            />
            <MemberSection
              accent={t('pages.users.upvotes')}
              emptyLabel={t('pages.users.emptyUpvotes')}
              items={ranking?.users_with_the_most_vote ?? []}
              metric="vote_count"
              title={t('pages.users.upvoteMembers')}
            />
            <MemberSection
              accent={t('pages.users.reputation')}
              emptyLabel={t('pages.users.emptyStaff')}
              items={ranking?.staffs ?? []}
              metric="rank"
              title={t('pages.users.staffMembers')}
            />
          </div>

          <aside className="users-side">
            <section className="panel users-index-panel">
              <div className="panel-heading">
                <span>{t('pages.users.index')}</span>
                <strong>{formatNumber(resolvedLocale, visibleMembers.length)}</strong>
              </div>
              <dl>
                <div>
                  <dt>{t('pages.users.heading')}</dt>
                  <dd>{formatNumber(resolvedLocale, visibleMembers.length)}</dd>
                </div>
                <div>
                  <dt>{t('pages.users.reputation')}</dt>
                  <dd>{compactNumber(totalReputation, resolvedLocale)}</dd>
                </div>
                <div>
                  <dt>{t('pages.users.upvotes')}</dt>
                  <dd>{compactNumber(totalVotes, resolvedLocale)}</dd>
                </div>
              </dl>
            </section>
            <section className="panel users-index-panel">
              <div className="panel-heading">
                <span>{t('pages.users.entries')}</span>
                <strong>{t('pages.users.community')}</strong>
              </div>
              <div className="search-link-list">
                <Link to="/badges">{t('pages.users.badges')}</Link>
                <Link to="/activity">{t('pages.users.activity')}</Link>
                <Link to="/search?type=question">{t('pages.users.questions')}</Link>
                <Link to="/tags">{t('pages.users.tags')}</Link>
              </div>
            </section>
            <SiteIcpLink />
          </aside>
        </section>
      </main>
    </>
  );
}

export default UsersPage;

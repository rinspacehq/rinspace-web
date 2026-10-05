import { Icon , useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import AvatarName from '@/components/AvatarName';
import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import { identityDateLabel, identityObjectTypeLabel, type IdentityTranslation } from '@/features/identity/labels';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatDate, formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import type { LocaleId } from '@/i18n/types';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadCurrentUserInfo, loadPersonalAnswerPage, loadPersonalCommentPage, loadPersonalCollectionPage, loadPersonalFollowPage, loadPersonalQuestionPage, loadPersonalVotePage } from '@/services/domains/identity';
import type { PersonalAnswerSummary, PersonalCommentSummary, CurrentUserInfo, FeedItem, PersonalQuestionSummary, PersonalVoteSummary } from '@/services/contracts';
import { answerPath, contentPath, profilePath, questionPath as routeQuestionPath } from '@/utils/routes';

type MeData = {
  user: CurrentUserInfo | null;
  collections: FeedItem[];
  follows: PersonalQuestionSummary[];
  questions: PersonalQuestionSummary[];
  answers: PersonalAnswerSummary[];
  comments: PersonalCommentSummary[];
  votes: PersonalVoteSummary[];
  collectionCount: number;
  followCount: number;
  questionCount: number;
  answerCount: number;
  commentCount: number;
  voteCount: number;
};

function avatarUrl(user: CurrentUserInfo | null) {
  return user?.avatar.custom || user?.avatar.gravatar || '';
}

function displayName(user: CurrentUserInfo | null, t: IdentityTranslation) {
  return user?.display_name || user?.username || t('shared.member');
}

function questionPath(question: PersonalQuestionSummary) {
  return routeQuestionPath(question.question_id || question.id || question.url_title, question.title);
}

function votePath(vote: PersonalVoteSummary) {
  const questionId = vote.url_title || vote.question_id;
  if (!questionId) return '/';
  return vote.object_type === 'answer' && vote.answer_id
    ? answerPath(questionId, vote.answer_id)
    : routeQuestionPath(questionId);
}

function answerQuestionPath(answer: PersonalAnswerSummary) {
  const questionId = answer.question_info.url_title || answer.question_id;
  return answer.answer_id ? answerPath(questionId, answer.answer_id) : routeQuestionPath(questionId);
}

function commentPath(comment: PersonalCommentSummary) {
  if (comment.url_title) return routeQuestionPath(comment.url_title);
  if (comment.question_id) return routeQuestionPath(comment.question_id);
  return '/';
}

function voteLabel(t: IdentityTranslation, vote: PersonalVoteSummary) {
  const direction = vote.vote_type === 'down_vote' ? 'down' : 'up';
  const objectType = vote.object_type === 'answer' || vote.object_type === 'comment'
    ? vote.object_type
    : 'question';
  return t(`me.vote.${direction}.${objectType}`);
}

function accountValueLabel(
  t: IdentityTranslation,
  category: 'roles' | 'languages' | 'appearances',
  value: string,
) {
  const normalized = category === 'languages'
    ? value.replace('_', '-').replace(/^zh-CN$/i, 'zh-CN').replace(/^en(?:-.+)?$/i, 'en')
    : value.toLocaleLowerCase('en-US');
  const known = category === 'roles'
    ? ['admin', 'moderator', 'member', 'user'].includes(normalized)
    : category === 'languages'
      ? ['system', 'zh-CN', 'en'].includes(normalized)
      : ['system', 'light', 'dark'].includes(normalized);
  return known ? t(`me.${category}.${normalized}`) : value || '—';
}

function feedDateLabel(locale: LocaleId, item: FeedItem) {
  const value = item.updatedAt || item.createdAt;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function QuestionLedgerList({
  items,
  emptyText,
  metricLabel,
  locale,
  t,
}: {
  items: PersonalQuestionSummary[];
  emptyText: string;
  metricLabel: string;
  locale: LocaleId;
  t: IdentityTranslation;
}) {
  if (!items.length) {
    return (
      <div className="state-strip">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="me-ledger-list">
      {items.map((item) => (
        <Link to={questionPath(item)} key={item.id || item.question_id}>
          <span className="me-ledger-meta">
            {t('me.answerCount', { count: item.answer_count, displayCount: formatNumber(locale, item.answer_count) })}
            {' · '}
            {t('me.voteCount', { count: item.vote_count, displayCount: formatNumber(locale, item.vote_count) })}
            {' · '}
            {t('me.bookmarkCount', { count: item.collection_count, displayCount: formatNumber(locale, item.collection_count) })}
            {' · '}
            {identityDateLabel(locale, item.created_at) || t('shared.unknownTime')}
            {' · '}
            {metricLabel}
          </span>
          <strong><MathInline text={item.title} /></strong>
          {item.description ? <p><MathInline text={item.description} /></p> : null}
          <span className="me-ledger-tags">
            {item.tags.map((tag) => tag.displayName || tag.name).filter(Boolean).slice(0, 3).join(' / ') || t('objects.question')}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ContentLedgerList({
  items,
  emptyText,
  locale,
  t,
}: {
  items: FeedItem[];
  emptyText: string;
  locale: LocaleId;
  t: IdentityTranslation;
}) {
  if (!items.length) {
    return <div className="state-strip">{emptyText}</div>;
  }

  return (
    <div className="me-ledger-list">
      {items.map((item) => (
        <Link to={contentPath(item.type, item.id, item.title)} key={`${item.type}-${item.id}`}>
          <span className="me-ledger-meta">
            {identityObjectTypeLabel(t, item.type)}
            {feedDateLabel(locale, item) ? ` · ${feedDateLabel(locale, item)}` : ''}
          </span>
          <strong><MathInline text={item.title} /></strong>
          {item.excerpt ? <p><MathInline text={item.excerpt} /></p> : null}
          <span className="me-ledger-tags">
            {item.tags.slice(0, 3).join(' / ') || identityObjectTypeLabel(t, item.type)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function AnswerList({ items, locale, t }: { items: PersonalAnswerSummary[]; locale: LocaleId; t: IdentityTranslation }) {
  if (!items.length) {
    return <div className="state-strip">{t('me.emptyAnswers')}</div>;
  }

  return (
    <div className="me-ledger-list me-answer-list">
      {items.map((item) => (
        <Link to={answerQuestionPath(item)} key={item.answer_id}>
          <span className="me-ledger-meta">
            {item.accepted === 2 ? `${t('me.accepted')} · ` : ''}
            {t('me.voteCount', { count: item.vote_count, displayCount: formatNumber(locale, item.vote_count) })}
            {' · '}
            {identityDateLabel(locale, item.update_time || item.create_time) || t('shared.unknownTime')}
          </span>
          <strong><MathInline text={item.question_info.title || t('me.answerFallback')} /></strong>
          <span className="me-ledger-tags">
            {item.question_info.tags.map((tag) => tag.displayName || tag.name).filter(Boolean).slice(0, 3).join(' / ') || t('objects.answer')}
          </span>
        </Link>
      ))}
    </div>
  );
}

function CommentList({ items, locale, t }: { items: PersonalCommentSummary[]; locale: LocaleId; t: IdentityTranslation }) {
  if (!items.length) {
    return <div className="state-strip">{t('me.emptyComments')}</div>;
  }

  return (
    <div className="me-ledger-list me-comment-list">
      {items.map((item) => (
        <Link to={commentPath(item)} key={item.comment_id}>
          <span className="me-ledger-meta">
            {identityObjectTypeLabel(t, item.object_type)} · {identityDateLabel(locale, item.created_at) || t('shared.unknownTime')}
          </span>
          <strong><MathInline text={item.title || t('me.commentFallback')} /></strong>
          {item.content ? <p><MathInline text={item.content} /></p> : null}
        </Link>
      ))}
    </div>
  );
}

function VoteList({ items, locale, t }: { items: PersonalVoteSummary[]; locale: LocaleId; t: IdentityTranslation }) {
  if (!items.length) {
    return <div className="state-strip">{t('me.emptyVotes')}</div>;
  }

  return (
    <div className="me-ledger-list vote-ledger-list">
      {items.map((item) => (
        <Link to={votePath(item)} key={`${item.object_type}-${item.object_id}-${item.created_at}`}>
          <span className="me-ledger-meta">
            {voteLabel(t, item)} · {identityDateLabel(locale, item.created_at) || t('shared.unknownTime')}
          </span>
          <strong><MathInline text={item.title || t('me.voteTargetFallback')} /></strong>
          {item.content ? <p><MathInline text={item.content} /></p> : null}
        </Link>
      ))}
    </div>
  );
}

function MePage() {
  const { t } = useFeatureTranslation('identity');
  const { t: tNavigation } = useFeatureTranslation('navigation');
  const locale = useResolvedLocale();
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadCurrentUserInfo()
      .then(async (user) => {
        if (!user) {
          return {
            user: null,
            collections: [],
            follows: [],
            questions: [],
            answers: [],
            comments: [],
            votes: [],
            collectionCount: 0,
            followCount: 0,
            questionCount: 0,
            answerCount: 0,
            commentCount: 0,
            voteCount: 0,
          };
        }
        const [collections, follows, questions, answers, comments, votes] = await Promise.all([
          loadPersonalCollectionPage({ page: 1, pageSize: 8 }),
          loadPersonalFollowPage({ page: 1, pageSize: 8 }),
          loadPersonalQuestionPage({ username: user.username, page: 1, pageSize: 6 }),
          loadPersonalAnswerPage({ username: user.username, page: 1, pageSize: 6 }),
          loadPersonalCommentPage({ username: user.username, page: 1, pageSize: 6 }),
          loadPersonalVotePage({ page: 1, pageSize: 8 }),
        ]);
        return {
          user,
          collections: collections.items,
          follows: follows.items,
          questions: questions.items,
          answers: answers.items,
          comments: comments.items,
          votes: votes.items,
          collectionCount: collections.count,
          followCount: follows.count,
          questionCount: questions.count,
          answerCount: answers.count,
          commentCount: comments.count,
          voteCount: votes.count,
        };
      })
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((meError) => {
        if (!cancelled) setError(localizedErrorMessage(meError, 'identity.meLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => {
    const brandName = tNavigation('brandName');
    if (data?.user) return `${t('me.titleNamed', { name: displayName(data.user, t) })} - ${brandName}`;
    return `${t('me.title')} - ${brandName}`;
  }, [data, t, tNavigation]);

  const user = data?.user ?? null;

  return (
    <>
      <Helmet title={title} />
      <SiteTopbar />

      <main className="me-shell">
        {loading ? (
          <LoadingState variant="panel" />
        ) : null}

        {!loading && !user ? (
          <section className="panel me-empty-panel">
            <div className="section-label">
              <Icon name="person-lock" />
              {t('me.authRequired')}
            </div>
            <h1>{t('me.authRequired')}</h1>
            <p />
            <Link className="primary-button" to="/#login">{t('me.signIn')}</Link>
          </section>
        ) : null}

        {user && data ? (
          <>
            <section className="me-workbench">
              <aside className="panel me-identity-panel">
                <div className="section-label">
                  <Icon name="person-badge" />
                  {t('me.space')}
                </div>
                <AvatarName
                  name={displayName(user, t)}
                  imageUrl={avatarUrl(user)}
                  size="md"
                />
                <p>@{user.username}</p>
                <dl>
                  <div>
                    <dt>{t('me.role')}</dt>
                    <dd>{accountValueLabel(t, 'roles', user.role_name || String(user.role_id))}</dd>
                  </div>
                  <div>
                    <dt>{t('me.language')}</dt>
                    <dd>{accountValueLabel(t, 'languages', user.language || 'system')}</dd>
                  </div>
                  <div>
                    <dt>{t('me.appearance')}</dt>
                    <dd>{accountValueLabel(t, 'appearances', user.color_scheme || 'system')}</dd>
                  </div>
                </dl>
                <div className="me-quick-links">
                  <Link to={profilePath(user.username || user.id)}>{t('me.publicProfile')}</Link>
                  <Link to="/settings">{t('me.settings')}</Link>
                  <Link to="/notifications">{t('me.notifications')}</Link>
                </div>
              </aside>

              <section className="me-ledger">
                <div className="me-ledger-head">
                  <div>
                    <span>{t('me.ledgerEyebrow')}</span>
                    <h1>{t('me.ledgerTitle')}</h1>
                  </div>
                  <dl>
                    <div>
                      <dt>{t('me.collections')}</dt>
                      <dd>{formatNumber(locale, data.collectionCount)}</dd>
                    </div>
                    <div>
                      <dt>{t('me.following')}</dt>
                      <dd>{formatNumber(locale, data.followCount)}</dd>
                    </div>
                    <div>
                      <dt>{t('me.votes')}</dt>
                      <dd>{formatNumber(locale, data.voteCount)}</dd>
                    </div>
                  </dl>
                </div>

                <section className="me-contribution-strip" aria-label={t('me.publicContributions')}>
                  <div>
                    <span>{t('me.questions')}</span>
                    <strong>{formatNumber(locale, data.questionCount)}</strong>
                  </div>
                  <div>
                    <span>{t('me.answers')}</span>
                    <strong>{formatNumber(locale, data.answerCount)}</strong>
                  </div>
                  <div>
                    <span>{t('me.comments')}</span>
                    <strong>{formatNumber(locale, data.commentCount)}</strong>
                  </div>
                </section>

                <article className="panel me-ledger-panel">
                  <div className="panel-heading">
                    <span>{t('me.myQuestions')}</span>
                    <strong>{formatNumber(locale, data.questionCount)}</strong>
                  </div>
                  <QuestionLedgerList
                    items={data.questions}
                    emptyText={t('me.emptyQuestions')}
                    metricLabel={t('me.questions')}
                    locale={locale}
                    t={t}
                  />
                </article>

                <article className="panel me-ledger-panel">
                  <div className="panel-heading">
                    <span>{t('me.myAnswers')}</span>
                    <strong>{formatNumber(locale, data.answerCount)}</strong>
                  </div>
                  <AnswerList items={data.answers} locale={locale} t={t} />
                </article>

                <article className="panel me-ledger-panel">
                  <div className="panel-heading">
                    <span>{t('me.myComments')}</span>
                    <strong>{formatNumber(locale, data.commentCount)}</strong>
                  </div>
                  <CommentList items={data.comments} locale={locale} t={t} />
                </article>

                <article className="panel me-ledger-panel">
                  <div className="panel-heading">
                    <span>{t('me.recentCollections')}</span>
                    <strong>{formatNumber(locale, data.collectionCount)}</strong>
                  </div>
                  <ContentLedgerList
                    items={data.collections}
                    emptyText={t('me.emptyCollections')}
                    locale={locale}
                    t={t}
                  />
                </article>

                <article className="panel me-ledger-panel">
                  <div className="panel-heading">
                    <span>{t('me.followedQuestions')}</span>
                    <strong>{formatNumber(locale, data.followCount)}</strong>
                  </div>
                  <QuestionLedgerList
                    items={data.follows}
                    emptyText={t('me.emptyFollowing')}
                    metricLabel={t('me.following')}
                    locale={locale}
                    t={t}
                  />
                </article>

                <article className="panel me-ledger-panel">
                  <div className="panel-heading">
                    <span>{t('me.recentVotes')}</span>
                    <strong>{formatNumber(locale, data.voteCount)}</strong>
                  </div>
                  <VoteList items={data.votes} locale={locale} t={t} />
                </article>
              </section>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}

export default MePage;

import { AnimateButton , useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';
import { Helmet } from 'react-helmet-async';

import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import { formatDate, formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadAnswerQuestionInfo, loadLinkedAnswerQuestionPage } from '@/services/domains/question';
import type { AnswerQuestionInfo } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { questionPath as routeQuestionPath } from '@/utils/routes';

type LinkOrder = 'newest' | 'active' | 'hot' | 'score' | 'frequent';

const orderOptions: LinkOrder[] = ['newest', 'active', 'hot', 'score', 'frequent'];

function normalizeOrder(value: string | null): LinkOrder {
  return orderOptions.includes(value as LinkOrder) ? (value as LinkOrder) : 'newest';
}

function dateLabel(locale: 'zh-CN' | 'en', seconds: number) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  });
}

function questionPath(question: AnswerQuestionInfo) {
  return routeQuestionPath(question.id, question.title);
}

function LinkedQuestionsPage() {
  const { t } = useFeatureTranslation('reader');
  const { resolvedLocale } = useLanguage();
  const { questionId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const order = normalizeOrder(searchParams.get('order'));
  const [source, setSource] = useState<AnswerQuestionInfo | null>(null);
  const [items, setItems] = useState<AnswerQuestionInfo[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 10;

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    void Promise.all([
      loadAnswerQuestionInfo(questionId),
      loadLinkedAnswerQuestionPage({ questionId, page, pageSize, order }),
    ])
      .then(([questionInfo, linkedPage]) => {
        if (cancelled) return;
        setSource(questionInfo);
        setItems(linkedPage.items);
        setCount(linkedPage.count);
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'reader.linkedQuestionsLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [order, page, questionId]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count]);

  const updateOrder = (nextOrder: LinkOrder) => {
    setSearchParams({ order: nextOrder, page: '1' });
  };

  const updatePage = (nextPage: number) => {
    setSearchParams({ order, page: String(Math.min(Math.max(1, nextPage), totalPages)) });
  };

  return (
    <>
      <Helmet title={t('linkedQuestions.documentTitle')} />
      <SiteTopbar />

      <main className="linked-page-shell">
        <section className="panel directory-toolbar linked-page-toolbar">
          <div className="detail-kicker">
            <span>{t('linkedQuestions.kicker')}</span>
            <strong>{t('linkedQuestions.referenceCount', { count, displayCount: formatNumber(resolvedLocale, count) })}</strong>
          </div>
          <h1>{t('linkedQuestions.heading')}</h1>
          <p>
            {source ? (
              <>
                {t('linkedQuestions.sourcePrefix')} <Link to={questionPath(source)}><MathInline text={source.title} /></Link>{t('linkedQuestions.sourceSuffix')}
              </>
            ) : t('linkedQuestions.fallbackDescription')}
          </p>
        </section>

        <section className="panel linked-page-board">
          <div className="panel-heading large">
            <div>
              <span>{t('linkedQuestions.list')}</span>
              <strong>{loading ? t('linkedQuestions.syncing') : t('linkedQuestions.itemCount', { count, displayCount: formatNumber(resolvedLocale, count) })}</strong>
            </div>
            <nav className="feed-tabs" aria-label={t('linkedQuestions.orderLabel')}>
              {orderOptions.map((option) => (
                <AnimateButton unstyled
                  key={option}
                  type="button"
                  className={order === option ? 'active' : ''}
                  onClick={() => updateOrder(option)}
                >
                  {t(`linkedQuestions.order.${option}`)}
                </AnimateButton>
              ))}
            </nav>
          </div>

          {loading ? (
            <LoadingState variant="panel" />
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="state-strip">{t('linkedQuestions.empty')}</div>
          ) : null}

          <div className="linked-page-list">
            {items.map((item) => (
              <article className="stream-card" key={item.id}>
                <div className="stream-card-head">
                  <span>{t('linkedQuestions.answerCount', { count: item.answer_count, displayCount: formatNumber(resolvedLocale, item.answer_count) })}</span>
                  <strong>{item.accepted_answer_id !== '0' ? t('linkedQuestions.accepted') : t('linkedQuestions.discussing')}</strong>
                </div>
                <h2><Link to={questionPath(item)}><MathInline text={item.title} /></Link></h2>
                <p className="stream-meta">
                  {item.user_info?.display_name || item.user_info?.username || 'Rinspace'} · {dateLabel(resolvedLocale, item.create_time)}
                </p>
                <p className="stream-excerpt"><MathInline text={item.description} /></p>
                <div className="tag-row">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span key={tag.slug_name}>{tag.display_name}</span>
                  ))}
                  <strong>{t('linkedQuestions.voteCount', { count: item.vote_count, displayCount: formatNumber(resolvedLocale, item.vote_count) })}</strong>
                </div>
              </article>
            ))}
          </div>

          {count > pageSize ? (
            <div className="linked-page-pagination">
              <AnimateButton unstyled type="button" disabled={page <= 1} onClick={() => updatePage(page - 1)}>
                {t('linkedQuestions.previous')}
              </AnimateButton>
              <span>{formatNumber(resolvedLocale, page)} / {formatNumber(resolvedLocale, totalPages)}</span>
              <AnimateButton unstyled type="button" disabled={page >= totalPages} onClick={() => updatePage(page + 1)}>
                {t('linkedQuestions.next')}
              </AnimateButton>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

export default LinkedQuestionsPage;

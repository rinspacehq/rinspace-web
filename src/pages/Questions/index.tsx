import { useEffect, useMemo, useState } from 'react';
import { useNoticeToasts } from 'components/ui';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import {
  DirectoryFeedCard,
  DirectoryModeTabs,
  DirectoryQuestionCard,
  normalizeDirectoryMode,
  type DirectoryMode,
} from '@/components/DirectoryStreamCard';
import LoadingState from '@/components/LoadingState';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadHomeFeed } from '@/services/domains/activity';
import { loadPersonalCollectionPage } from '@/services/domains/identity';
import { loadAnswerQuestionPage } from '@/services/domains/question';
import type { AnswerQuestionInfo, AnswerQuestionPageInput, FeedItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';

type QuestionDirectoryItem =
  | { kind: 'question'; question: AnswerQuestionInfo }
  | { kind: 'feed'; item: FeedItem };

function questionOrderForMode(mode: DirectoryMode): NonNullable<AnswerQuestionPageInput['order']> {
  return mode === 'latest' ? 'newest' : 'hot';
}

function questionAuthorLabel(question: AnswerQuestionInfo) {
  return question.user_info?.display_name || question.user_info?.username || 'Rinspace';
}

function uniqueQuestionItems(items: FeedItem[]) {
  const seen = new Set<string>();
  const next: FeedItem[] = [];
  items.forEach((item) => {
    if (item.type !== 'question' || seen.has(item.id)) return;
    seen.add(item.id);
    next.push(item);
  });
  return next;
}

function QuestionsPage() {
  const { t } = useFeatureTranslation('discovery');
  const { resolvedLocale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = normalizeDirectoryMode(searchParams.get('mode') || searchParams.get('order'));
  const [items, setItems] = useState<QuestionDirectoryItem[]>([]);
  const [count, setCount] = useState(0);
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
            .then((page) => {
              const savedItems = uniqueQuestionItems(page.items);
              return { count: savedItems.length, items: savedItems.map((item) => ({ kind: 'feed' as const, item })) };
            })
        : mode === 'following'
          ? loadHomeFeed({ mode: 'following', size: 60 })
              .then((feed) => {
                const followedItems = uniqueQuestionItems(feed.stream);
                return { count: followedItems.length, items: followedItems.map((item) => ({ kind: 'feed' as const, item })) };
              })
          : loadAnswerQuestionPage({
              order: questionOrderForMode(mode),
              page: 1,
              pageSize: 36,
            }).then((page) => ({
              count: page.count,
              items: page.items.map((question) => ({ kind: 'question' as const, question })),
            }));

    void loader
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setCount(result.count);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setItems([]);
          setCount(0);
          setError(messageFromError(loadError, 'discovery.questionsLoadFailed'));
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
      title: t('pages.question.contextTitle'),
      excerpt: t('pages.question.contextExcerpt', {
        items: formatNumber(resolvedLocale, items.length),
        total: formatNumber(resolvedLocale, count),
      }),
      sections: items.length
        ? [
            {
              title: t('pages.question.current'),
              body: items
                .slice(0, 12)
                .map((item, index) => {
                  if (item.kind === 'feed') {
                    return t('assistantContext.item', {
                      index: formatNumber(resolvedLocale, index + 1),
                      title: item.item.title,
                      author: item.item.author,
                      summary: item.item.excerpt,
                    });
                  }
                  return t('assistantContext.item', {
                    index: formatNumber(resolvedLocale, index + 1),
                    title: item.question.title,
                    author: questionAuthorLabel(item.question),
                    summary: item.question.description,
                  });
                })
                .join('\n'),
            },
          ]
        : [],
    }), [count, items, resolvedLocale, t]),
  );

  const updateMode = (nextMode: DirectoryMode) => {
    const params = new URLSearchParams();
    if (nextMode !== 'hot') params.set('mode', nextMode);
    setSearchParams(params);
  };

  return (
    <>
      <Helmet title={t('pages.question.documentTitle')} />
      <SiteTopbar />

      <main className="community-page directory-simple-page questions-shell">
        <article className="panel questions-board community-board directory-stream-board directory-simple-board">
          <div className="panel-heading large directory-simple-heading">
            <h1>{t('pages.question.heading')}</h1>
            <DirectoryModeTabs mode={mode} onChange={updateMode} ariaLabel={t('pages.question.sort')} />
          </div>

          {loading ? (
            <LoadingState variant="panel" />
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="state-strip">{t('directory.noResults')}</div>
          ) : null}

          <div className="community-grid directory-stream-grid">
            {items.map((item) => (
              item.kind === 'feed'
                ? <DirectoryFeedCard item={item.item} key={item.item.id} />
                : <DirectoryQuestionCard question={item.question} key={item.question.id} />
            ))}
          </div>
        </article>
      </main>
    </>
  );
}

export default QuestionsPage;

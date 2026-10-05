import { Icon , useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';

import { MathInline } from '@/components/MathText';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import { formatNumber } from '@/i18n/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadBookAuthor, loadBooksByAuthor } from '@/services/domains/book';
import type { BookAuthor, FeedItem } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';
import { contentPath } from '@/utils/routes';

function AuthorBookCard({ item }: { item: FeedItem }) {
  const { t } = useFeatureTranslation('reader');
  const { resolvedLocale } = useLanguage();
  const book = item.book;
  const title = book?.bookTitle || item.title;
  return (
    <article className="home-book-card">
      <Link className="home-book-cover" to={contentPath('book', item.id, item.title)} aria-label={t('bookAuthor.viewBook', { title })}>
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" loading="lazy" />
        ) : (
          <Icon name="book" />
        )}
      </Link>
      <div className="home-book-main">
        <div className="stream-card-topline">
          <span className="meta-category meta-category-book" title={t('bookAuthor.book')}>B</span>
          <span>
            {book?.kind === 'copyrighted'
              ? t('bookAuthor.externalBook')
              : book?.kind === 'typst'
                ? t('bookAuthor.typstBook')
                : t('bookAuthor.originalBook')}
          </span>
        </div>
        <h2>
          <Link to={contentPath('book', item.id, item.title)}>
            <MathInline text={title} />
          </Link>
        </h2>
        {book?.authors?.length ? <p>{book.authors.join(' / ')}</p> : null}
        <div className="home-book-footer">
          <strong>{item.bookRating?.averageScore ? t('bookAuthor.score', { score: formatNumber(resolvedLocale, item.bookRating.averageScore, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : t('bookAuthor.unrated')}</strong>
          <span>{t('bookAuthor.reviewCount', { count: item.bookRating?.reviewCount || 0, displayCount: formatNumber(resolvedLocale, item.bookRating?.reviewCount || 0) })}</span>
        </div>
      </div>
    </article>
  );
}

export default function BookAuthorPage() {
  const { t } = useFeatureTranslation('reader');
  const { resolvedLocale } = useLanguage();
  const { authorId = '' } = useParams();
  const [author, setAuthor] = useState<BookAuthor | null>(null);
  const [books, setBooks] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([loadBookAuthor(authorId), loadBooksByAuthor(authorId, 48)])
      .then(([loadedAuthor, loadedBooks]) => {
        if (!cancelled) {
          setAuthor(loadedAuthor);
          setBooks(loadedBooks.items);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'reader.bookAuthorLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  useRinPageContext(
    useMemo(() => ({
      kind: 'page' as const,
      title: author ? t('bookAuthor.contextTitle', { author: author.name }) : t('bookAuthor.heading'),
      excerpt: author ? t('bookAuthor.contextExcerpt', { id: author.id, count: books.length, displayCount: formatNumber(resolvedLocale, books.length) }) : '',
      sections: books.length
        ? [{ title: t('bookAuthor.relatedBooks'), body: books.map((book) => book.book?.bookTitle || book.title).join('\n') }]
        : [],
    }), [author, books, resolvedLocale, t]),
  );

  return (
    <>
      <Helmet title={author ? t('bookAuthor.authorDocumentTitle', { author: author.name }) : t('bookAuthor.documentTitle')} />
      <SiteTopbar />
      <main className="community-page book-author-page">
        <section className="community-toolbar">
          <div>
            <h1>{author?.name || t('bookAuthor.heading')}</h1>
            <p>{author ? t('bookAuthor.authorId', { id: author.id }) : t('bookAuthor.loadingAuthor')}</p>
          </div>
          <div className="community-actions">
            <Link to="/books">{t('bookAuthor.backToBooks')}</Link>
          </div>
        </section>
        {author?.bio ? <section className="panel book-author-bio">{author.bio}</section> : null}
        {author?.officialUrl ? (
          <a className="book-author-official" href={author.officialUrl} target="_blank" rel="noreferrer">
            <Icon name="box-arrow-up-right" />
            {t('bookAuthor.officialPage')}
          </a>
        ) : null}
        {loading && !books.length ? (
          <LoadingState variant="strip" />
        ) : books.length ? (
          <div className="home-book-grid books-page-grid">
            {books.map((book) => (
              <AuthorBookCard item={book} key={book.id} />
            ))}
          </div>
        ) : (
          <div className="community-empty-state">
            <span className="community-empty-mark">
              <Icon name="person-lines-fill" />
            </span>
            <div>
              <h2>{t('bookAuthor.empty')}</h2>
              <p>{t('bookAuthor.emptyDescription')}</p>
            </div>
            <Link to="/books/new">{t('bookAuthor.submitBook')}</Link>
          </div>
        )}
      </main>
    </>
  );
}

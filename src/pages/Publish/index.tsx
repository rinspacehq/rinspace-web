import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Spinner } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';

import CodeMirrorEditor from '@/components/CodeMirrorEditor';
import ImageCropDialog from '@/components/ImageCropDialog';
import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import RinMilkdownEditor from '@/components/RinMilkdownEditor';
import TagPicker, { joinTagValues, splitTagValues } from '@/components/TagPicker';
import { formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { searchContent } from '@/services/domains/activity';
import { createContent, isContentModerationSubmission, loadContentDetail, updateContent } from '@/services/domains/article';
import { attachBookChapterLink, createBookAuthor, searchBookAuthors } from '@/services/domains/book';
import { moveWorkItem } from '@/services/domains/identity';
import { uploadAnswerFile } from '@/services/domains/publication';
import { createQuestion, createQuestionByAnswer } from '@/services/domains/question';
import type { BookAuthor, BookKind, BookMetadata, BookTOCItem, CreateContentInput, PostDetail, QuestionTagInput, SearchResult } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { getStoredSession } from '@/services/phoneAuth';
import { typstCreationEnabled } from '@/features/publish/typstFeature';
import { extractPDFTOC, renderPDFCover } from '@/utils/pdfToc';
import { answerPath, bookWorkspacePath, contentPath, questionPath, tagReadOrLegacyPath } from '@/utils/routes';

type PublishMode = 'question' | 'discussion' | 'announcement' | 'dynamic' | 'book';

type PublishPageProps = {
  mode: PublishMode;
};

type PendingBookCoverCrop = {
  imageUrl: string;
  fileName: string;
};

type BookTocStatus =
  | { state: 'loaded' | 'extracted'; count: number }
  | { state: 'extracting' | 'unavailable' }
  | null;

type BookCoverStatus =
  | 'keeping'
  | 'generating'
  | 'generated'
  | 'unavailable'
  | 'uploading'
  | 'uploaded'
  | null;

function splitLines(value: string) {
  return value
    .split(/\n|[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitTags(value: string) {
  return splitTagValues(value).slice(0, 6);
}

function questionTags(value: string): QuestionTagInput[] {
  return splitTags(value).map((tag) => ({
    slugName: tag,
    name: tag,
    displayName: tag,
    originalText: tag,
  }));
}

function searchResultPath(result: SearchResult) {
  const ref = result.id || result.slug;
  switch (result.objectType) {
    case 'question':
      return contentPath('question', ref, result.title);
    case 'answer':
      return answerPath(ref, result.id);
    case 'blog':
      return contentPath('blog', ref, result.title);
    case 'announcement':
      return contentPath('announcement', ref);
    case 'discussion':
    case 'forum':
      return contentPath('discussion', ref, result.title);
    case 'dynamic':
    case 'status':
      return contentPath('dynamic', ref, result.title);
    case 'tag':
      return tagReadOrLegacyPath(result.id, result.slug || result.title || result.id);
    default:
      return '/search';
  }
}

function dynamicTitle(title: string, body: string, fallback: string) {
  const trimmed = title.trim();
  if (trimmed.length >= 4) return trimmed;
  const compact = body.trim().replace(/\s+/g, ' ');
  if (compact.length >= 4) return compact.slice(0, 48);
  return fallback;
}

function hasRinPayload(value: string) {
  return /\[\[RIN_[A-Z_]+\]\]/.test(value);
}

function bookProfileIntro(detail: PostDetail) {
  const excerpt = (detail.excerpt || '').trim();
  if (excerpt) return excerpt;
  const body = detail.body.trim();
  return body && !hasRinPayload(body) ? body : '';
}

export default function PublishPage({ mode }: PublishPageProps) {
  const navigate = useNavigate();
  const { slug: editSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const signedIn = getStoredSession() !== null;
  const editing = Boolean(editSlug && mode !== 'question');
  const worksFolderId = searchParams.get('worksFolderId')?.trim() || '';
  const worksVisibility = searchParams.get('worksVisibility') === 'private' ? 'private' : 'published';
  const chapterContext = useMemo(() => {
    const bookId = searchParams.get('bookId')?.trim() || '';
    const chapterKey = searchParams.get('chapterKey')?.trim() || '';
    if (!bookId || !chapterKey || !['discussion', 'question'].includes(mode)) {
      return null;
    }
    return {
      bookId,
      bookTitle: searchParams.get('bookTitle')?.trim() || t('publishPage.chapterContext.bookFallback'),
      chapterKey,
      chapterTitle: searchParams.get('chapterTitle')?.trim() || t('publishPage.chapterContext.chapterFallback'),
      chapterPage: searchParams.get('chapterPage')?.trim() || '',
    };
  }, [mode, searchParams, t]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [answerBody, setAnswerBody] = useState('');
  const [withAnswer, setWithAnswer] = useState(false);
  const [discussionImages, setDiscussionImages] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editingPost, setEditingPost] = useState<PostDetail | null>(null);
  const [similarItems, setSimilarItems] = useState<SearchResult[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState('');
  const [bookKind, setBookKind] = useState<BookKind>('original');
  const [bookAuthors, setBookAuthors] = useState<BookAuthor[]>([]);
  const [bookAuthorQuery, setBookAuthorQuery] = useState('');
  const [bookAuthorResults, setBookAuthorResults] = useState<BookAuthor[]>([]);
  const [bookAuthorLoading, setBookAuthorLoading] = useState(false);
  const [bookAuthorError, setBookAuthorError] = useState('');
  const [bookAuthorCreating, setBookAuthorCreating] = useState(false);
  const [bookCoverUrl, setBookCoverUrl] = useState('');
  const [bookOfficialUrl, setBookOfficialUrl] = useState('');
  const [bookPdfUrl, setBookPdfUrl] = useState('');
  const [bookPdfFilename, setBookPdfFilename] = useState('');
  const [bookToc, setBookToc] = useState<BookTOCItem[]>([]);
  const [bookTocStatus, setBookTocStatus] = useState<BookTocStatus>(null);
  const [bookCoverStatus, setBookCoverStatus] = useState<BookCoverStatus>(null);
  const [pendingBookCoverCrop, setPendingBookCoverCrop] =
    useState<PendingBookCoverCrop | null>(null);
  const [bookSeriesTitle, setBookSeriesTitle] = useState('');
  const [bookDoi, setBookDoi] = useState('');
  const [bookPublisher, setBookPublisher] = useState('');
  const [bookEbookPackages, setBookEbookPackages] = useState('');
  const [bookCopyright, setBookCopyright] = useState('');
  const [bookHardcoverISBN, setBookHardcoverISBN] = useState('');
  const [bookHardcoverPublished, setBookHardcoverPublished] = useState('');
  const [bookSoftcoverISBN, setBookSoftcoverISBN] = useState('');
  const [bookSoftcoverPublished, setBookSoftcoverPublished] = useState('');
  const [bookEbookISBN, setBookEbookISBN] = useState('');
  const [bookEbookPublished, setBookEbookPublished] = useState('');
  const [bookSeriesISSN, setBookSeriesISSN] = useState('');
  const [bookSeriesEISSN, setBookSeriesEISSN] = useState('');
  const [bookEditionNumber, setBookEditionNumber] = useState('');
  const [bookNumberOfPages, setBookNumberOfPages] = useState('');
  const [bookTopics, setBookTopics] = useState('');
  const [bookKeywords, setBookKeywords] = useState('');
  const [bookUploading, setBookUploading] = useState(false);
  const [bookUploadError, setBookUploadError] = useState('');

  const tagItems = useMemo(() => splitTags(tags), [tags]);
  const trimmedBody = body.trim();
  const explicitBookKind = mode === 'book' && !editing ? searchParams.get('kind') : '';
  const isPdfBookCreate = explicitBookKind === 'pdf';
  const isMarkdownBookCreate = explicitBookKind === 'markdown';
  const isOriginalPdfBook =
    mode === 'book' &&
    bookKind === 'original' &&
    (isPdfBookCreate || Boolean(editingPost?.book?.kind === 'original' && editingPost.book.pdfUrl));
  const isMarkdownBookProfile =
    mode === 'book' &&
    bookKind === 'markdown' &&
    (isMarkdownBookCreate || editingPost?.book?.kind === 'markdown');
  const isLatexBookProfile =
    mode === 'book' &&
    bookKind === 'original' &&
    !isOriginalPdfBook &&
    (explicitBookKind === 'latex' || Boolean(editingPost?.book?.kind === 'original'));
  const isTypstBookProfile =
    mode === 'book' &&
    bookKind === 'typst' &&
    (explicitBookKind === 'typst' || editingPost?.book?.kind === 'typst');
  const shouldShowBookKindToggle = mode === 'book' && !isLatexBookProfile && !isMarkdownBookProfile && !isTypstBookProfile;
  const shouldShowPdfUpload = mode === 'book' && (bookKind === 'copyrighted' || isOriginalPdfBook);
  const bookHeadingVariant = isOriginalPdfBook
    ? 'pdf'
    : isMarkdownBookProfile
      ? 'markdown'
      : isTypstBookProfile
        ? 'typst'
        : bookKind === 'copyrighted'
          ? 'copyrighted'
          : 'latex';
  const bookBodyPlaceholder =
    mode === 'book' && isPdfBookCreate
      ? t('publishPage.bookPlaceholders.pdf')
      : mode === 'book' && isMarkdownBookProfile
        ? t('publishPage.bookPlaceholders.markdown')
        : mode === 'book' && isTypstBookProfile
          ? t('publishPage.bookPlaceholders.typst')
          : t(`publishPage.modes.${mode}.bodyPlaceholder`);
  const pageHeading = mode === 'book'
    ? t(`publishPage.${editing ? 'bookEditHeadings' : 'bookHeadings'}.${bookHeadingVariant}`)
    : t(`publishPage.modes.${mode}.${editing ? 'editHeading' : 'heading'}`);
  const bodyLabel = t(`publishPage.modes.${mode}.bodyLabel`);
  const defaultSubmitLabel = t(`publishPage.modes.${mode}.submit`);
  const displayCount = (count: number) => formatNumber(locale, count);
  const countText = (key: string, count: number) => t(key, {
    count,
    displayCount: displayCount(count),
  });
  const bookTocStatusText = bookTocStatus
    ? bookTocStatus.state === 'loaded'
      ? countText('publishPage.book.tocLoaded', bookTocStatus.count)
      : bookTocStatus.state === 'extracted'
        ? countText('publishDialog.pdf.tocExtracted', bookTocStatus.count)
        : bookTocStatus.state === 'extracting'
          ? t('publishDialog.pdf.extractingToc')
          : t('publishDialog.pdf.tocUnavailable')
    : '';
  const bookCoverStatusText = bookCoverStatus
    ? {
      keeping: t('publishDialog.pdf.keepingCover'),
      generating: t('publishDialog.pdf.generatingCover'),
      generated: t('publishDialog.pdf.coverGenerated'),
      unavailable: t('publishDialog.pdf.coverUnavailable'),
      uploading: t('publishDialog.cover.uploading'),
      uploaded: t('publishDialog.cover.uploaded'),
    }[bookCoverStatus]
    : '';
  const searchResultSignal = (result: SearchResult) => {
    if (result.objectType === 'tag') {
      return countText('publishPage.similar.related', result.voteCount);
    }
    if (typeof result.answerCount === 'number' && result.answerCount > 0) {
      return countText('publishPage.similar.answers', result.answerCount);
    }
    return countText('publishPage.similar.upvotes', result.voteCount);
  };
  const submitDisabled =
    !signedIn ||
    submitting ||
    loadingEdit ||
    (mode !== 'dynamic' && title.trim().length === 0) ||
    (mode === 'book' && !isTypstBookProfile && trimmedBody.length === 0) ||
    (mode === 'question' && tagItems.length === 0) ||
    (mode === 'book' && tagItems.length === 0) ||
    (mode === 'book' && isOriginalPdfBook && !bookPdfUrl.trim()) ||
    (mode === 'book' && bookKind === 'copyrighted' && bookAuthors.length === 0) ||
    (mode === 'book' && bookKind === 'copyrighted' && !bookOfficialUrl.trim());

  useNoticeToasts({
    error, status,
  });
  useEffect(() => {
    if (mode !== 'question') return undefined;
    let cancelled = false;
    const query = title.trim();
    if (query.length < 4) {
      setSimilarItems([]);
      setSimilarLoading(false);
      setSimilarError('');
      return undefined;
    }

    setSimilarLoading(true);
    setSimilarError('');
    const timer = window.setTimeout(() => {
      void searchContent({
        query,
        type: 'question',
        order: 'relevance',
        page: 1,
        size: 4,
      })
        .then((result) => {
          if (!cancelled) setSimilarItems(result.items);
        })
        .catch((searchError) => {
          if (!cancelled) {
            setSimilarItems([]);
            setSimilarError(
              messageFromError(searchError, 'creation.publishSearchFailed'),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setSimilarLoading(false);
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, title]);

  useEffect(() => {
    return () => {
      if (pendingBookCoverCrop) URL.revokeObjectURL(pendingBookCoverCrop.imageUrl);
    };
  }, [pendingBookCoverCrop]);

  useEffect(() => {
    if (mode !== 'book' || bookKind !== 'copyrighted') return undefined;
    const query = bookAuthorQuery.trim();
    if (query.length < 2) {
      setBookAuthorResults([]);
      setBookAuthorLoading(false);
      setBookAuthorError('');
      return undefined;
    }
    let cancelled = false;
    setBookAuthorLoading(true);
    setBookAuthorError('');
    const timer = window.setTimeout(() => {
      void searchBookAuthors(query, 8)
        .then((items) => {
          if (!cancelled) {
            const selected = new Set(bookAuthors.map((author) => author.id));
            setBookAuthorResults(items.filter((item) => !selected.has(item.id)));
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setBookAuthorResults([]);
            setBookAuthorError(
              messageFromError(searchError, 'creation.bookAuthorSearchFailed'),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setBookAuthorLoading(false);
        });
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookAuthorQuery, bookAuthors, bookKind, mode]);

  useEffect(() => {
    if (mode !== 'book' || bookKind !== 'original') return;
    setBookAuthors([]);
    setBookAuthorQuery('');
    setBookAuthorResults([]);
    setBookAuthorError('');
    setBookOfficialUrl('');
    setBookSeriesTitle('');
    setBookDoi('');
    setBookPublisher('');
    setBookEbookPackages('');
    setBookCopyright('');
    setBookHardcoverISBN('');
    setBookHardcoverPublished('');
    setBookSoftcoverISBN('');
    setBookSoftcoverPublished('');
    setBookEbookISBN('');
    setBookEbookPublished('');
    setBookSeriesISSN('');
    setBookSeriesEISSN('');
    setBookEditionNumber('');
    setBookNumberOfPages('');
    setBookTopics('');
    setBookKeywords('');
  }, [bookKind, mode]);

  useEffect(() => {
    if (mode !== 'book' || editing) return;
    const kind = searchParams.get('kind');
    if (kind === 'pdf') {
      setBookKind('original');
    } else if (kind === 'latex') {
      setBookKind('original');
    } else if (kind === 'markdown') {
      setBookKind('markdown');
    } else if (kind === 'typst') {
      if (typstCreationEnabled) {
        setBookKind('typst');
      } else {
        navigate('/books/new', { replace: true });
      }
    }
  }, [editing, mode, navigate, searchParams]);

  useEffect(() => {
    if (!editSlug || mode === 'question') {
      setEditingPost(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingEdit(true);
    setError('');
    void loadContentDetail(editSlug)
      .then((detail) => {
        if (cancelled) return;
        if (
          detail.type !== mode &&
          !(mode === 'discussion' && detail.type === 'forum') &&
          !(mode === 'dynamic' && detail.type === 'status')
        ) {
          setError(messageFromError(null, 'creation.publishTypeMismatch'));
          return;
        }
        setEditingPost(detail);
        setTitle(detail.title);
        setBody(detail.body);
        setTags(detail.tags.join(', '));
        if (mode === 'discussion') {
          setDiscussionImages(detail.images || []);
        }
        if (mode === 'book' && detail.book) {
          setBookKind(detail.book.kind);
          if (detail.book.kind === 'original' || detail.book.kind === 'markdown' || detail.book.kind === 'typst') {
            setBody(bookProfileIntro(detail));
          }
          setBookAuthors(detail.book.authorEntities || []);
          setBookAuthorQuery('');
          setBookAuthorResults([]);
          setBookCoverUrl(detail.coverUrl || '');
          setBookOfficialUrl(detail.book.officialUrl || '');
          setBookPdfUrl(detail.book.pdfUrl || '');
          setBookPdfFilename(detail.book.pdfFilename || '');
          setBookToc(detail.book.toc || []);
          setBookTocStatus(
            detail.book.toc?.length
              ? { state: 'loaded', count: detail.book.toc.length }
              : null,
          );
          setBookSeriesTitle(detail.book.seriesTitle || '');
          setBookDoi(detail.book.doi || '');
          setBookPublisher(detail.book.publisher || '');
          setBookEbookPackages(detail.book.ebookPackages || '');
          setBookCopyright(detail.book.copyrightInformation || '');
          setBookSeriesISSN(detail.book.seriesISSN || '');
          setBookSeriesEISSN(detail.book.seriesEISSN || '');
          setBookEditionNumber(detail.book.editionNumber || '');
          setBookNumberOfPages(detail.book.numberOfPages || '');
          setBookTopics((detail.book.topics || []).join('\n'));
          setBookKeywords((detail.book.keywords || []).join('\n'));
          setBookHardcoverISBN(detail.book.isbn?.find((item) => item.kind === 'hardcover')?.value || '');
          setBookHardcoverPublished(detail.book.isbn?.find((item) => item.kind === 'hardcover')?.publishedAt || '');
          setBookSoftcoverISBN(detail.book.isbn?.find((item) => item.kind === 'softcover')?.value || '');
          setBookSoftcoverPublished(detail.book.isbn?.find((item) => item.kind === 'softcover')?.publishedAt || '');
          setBookEbookISBN(detail.book.isbn?.find((item) => item.kind === 'ebook')?.value || '');
          setBookEbookPublished(detail.book.isbn?.find((item) => item.kind === 'ebook')?.publishedAt || '');
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(messageFromError(loadError, 'creation.publishEditLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editSlug, mode]);

  const attachCreatedToChapter = async (
    targetType: 'discussion' | 'question' | 'blog',
    targetPostId: string,
  ) => {
    if (!chapterContext || editing) return;
    try {
      await attachBookChapterLink(chapterContext.bookId, chapterContext.chapterKey, {
        targetType,
        targetPostId,
      });
    } catch (attachError) {
      console.error('Published content chapter attachment failed', attachError);
      setStatus(t('publishPage.status.chapterLinkFailed'));
    }
  };

  const moveCreatedToWorksFolder = async (postId: string) => {
    if (!worksFolderId || editing) return;
    await moveWorkItem({ postId, folderId: worksFolderId });
  };

  const submitQuestion = async () => {
    const input = {
      title: title.trim(),
      content: body,
      tags: questionTags(tags),
    };
    if (withAnswer) {
      const created = await createQuestionByAnswer({
        ...input,
        answerContent: answerBody,
      });
      await moveCreatedToWorksFolder(created.question.id);
      await attachCreatedToChapter('question', created.question.id);
      navigate(questionPath(created.question.id, created.question.title));
      return;
    }
    const created = await createQuestion(input);
    const createdId = created.question?.id || created.id;
    await moveCreatedToWorksFolder(createdId);
    await attachCreatedToChapter('question', createdId);
    navigate(questionPath(createdId, created.question?.title || input.title));
  };

  const submitContent = async () => {
    const isbn = [
      bookHardcoverISBN.trim()
        ? { kind: 'hardcover' as const, value: bookHardcoverISBN.trim(), publishedAt: bookHardcoverPublished.trim() }
        : null,
      bookSoftcoverISBN.trim()
        ? { kind: 'softcover' as const, value: bookSoftcoverISBN.trim(), publishedAt: bookSoftcoverPublished.trim() }
        : null,
      bookEbookISBN.trim()
        ? { kind: 'ebook' as const, value: bookEbookISBN.trim(), publishedAt: bookEbookPublished.trim() }
        : null,
    ].filter((item): item is NonNullable<typeof item> => item !== null);
    const existingOriginalBook =
      mode === 'book' &&
      (bookKind === 'original' || bookKind === 'markdown' || bookKind === 'typst') &&
      (editingPost?.book?.kind === 'original' || editingPost?.book?.kind === 'markdown' || editingPost?.book?.kind === 'typst')
        ? editingPost.book
        : undefined;
    const book: BookMetadata | undefined =
      mode === 'book'
        ? {
            ...existingOriginalBook,
            kind: bookKind,
            bookTitle: title.trim(),
            authors: bookKind === 'original' || bookKind === 'markdown' || bookKind === 'typst' ? [] : bookAuthors.map((author) => author.name),
            authorIds: bookKind === 'original' || bookKind === 'markdown' || bookKind === 'typst' ? [] : bookAuthors.map((author) => author.id),
            seriesTitle: bookSeriesTitle.trim(),
            doi: bookDoi.trim(),
            officialUrl: bookOfficialUrl.trim(),
            publisher: bookPublisher.trim(),
            ebookPackages: bookEbookPackages.trim(),
            copyrightInformation: bookCopyright.trim(),
            isbn,
            seriesISSN: bookSeriesISSN.trim(),
            seriesEISSN: bookSeriesEISSN.trim(),
            editionNumber: bookEditionNumber.trim(),
            numberOfPages: bookNumberOfPages.trim(),
            topics: splitLines(bookTopics),
            keywords: splitLines(bookKeywords),
            pdfUrl: bookPdfUrl.trim(),
            pdfFilename: bookPdfFilename.trim(),
            toc: bookToc,
          }
        : undefined;
    const input: CreateContentInput = {
      type: mode,
      title: mode === 'dynamic'
        ? dynamicTitle(title, body, t('publishPage.modes.dynamic.fallbackTitle'))
        : title.trim(),
      body: existingOriginalBook && (isLatexBookProfile || isTypstBookProfile) ? editingPost?.body || body : body,
      tags: tagItems,
    };
    if (worksFolderId && worksVisibility === 'private' && !editing) {
      input.status = 'private';
    }
    if (mode === 'announcement') {
      input.forumSection = 'notice';
      input.forumPinned = true;
      input.forumAnnouncement = true;
    }
    if (mode === 'discussion') {
      input.images = discussionImages;
    }
    if (mode === 'book') {
      input.book = book;
      input.coverUrl = bookCoverUrl.trim();
      input.excerpt = body.trim().slice(0, 220);
    }
    const saved =
      editing && editSlug
        ? await updateContent(editSlug, input)
        : await createContent(input);
    if (isContentModerationSubmission(saved)) {
      setStatus(
        t(`publishDialog.create.moderation.${saved.state === 'rejected' ? 'rejected' : saved.state === 'published' ? 'published' : 'pending'}`),
      );
      return;
    }
	if (saved.publicationPending) {
	  setStatus(t('publishPage.status.activationPending'));
	  return;
	}
    await moveCreatedToWorksFolder(saved.id);
    if (mode === 'discussion') {
      await attachCreatedToChapter('discussion', saved.id);
    }
    if (
      mode === 'book' &&
      ((book?.kind === 'original' && isLatexBookProfile) || book?.kind === 'markdown' || book?.kind === 'typst')
    ) {
      navigate(bookWorkspacePath(saved.id));
      return;
    }
    navigate(contentPath(mode, saved.id, saved.title));
  };

  const uploadDiscussionImages = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (!files.length) return;
    if (!signedIn) {
      setImageError(t('publishPage.validation.signInToUploadImage'));
      return;
    }
    const remaining = 9 - discussionImages.length;
    if (remaining <= 0) {
      setImageError(t('publishPage.validation.imageLimit'));
      return;
    }
    const selected = files.slice(0, remaining);
    const invalid = selected.find((file) => !file.type.startsWith('image/'));
    if (invalid) {
      setImageError(t('publishPage.validation.imageOnly'));
      return;
    }
    const oversized = selected.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setImageError(t('publishPage.validation.imageTooLarge'));
      return;
    }
    setImageUploading(true);
    setImageError('');
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        uploaded.push(await uploadAnswerFile('post', file));
      }
      setDiscussionImages((current) => [...current, ...uploaded].slice(0, 9));
    } catch (uploadError) {
      setImageError(
        messageFromError(uploadError, 'creation.discussionImageUploadFailed'),
      );
    } finally {
      setImageUploading(false);
    }
  };

  const removeDiscussionImage = (image: string) => {
    setDiscussionImages((current) => current.filter((item) => item !== image));
  };

  const selectBookAuthor = (author: BookAuthor) => {
    setBookAuthors((current) =>
      current.some((item) => item.id === author.id) ? current : [...current, author].slice(0, 12),
    );
    setBookAuthorQuery('');
    setBookAuthorResults([]);
    setBookAuthorError('');
  };

  const removeBookAuthor = (authorId: string) => {
    setBookAuthors((current) => current.filter((author) => author.id !== authorId));
  };

  const createAndSelectBookAuthor = async () => {
    const name = bookAuthorQuery.trim();
    if (name.length < 2) {
      setBookAuthorError(t('publishPage.validation.authorNameLength'));
      return;
    }
    setBookAuthorCreating(true);
    setBookAuthorError('');
    try {
      const created = await createBookAuthor({ name });
      selectBookAuthor(created);
    } catch (createError) {
      setBookAuthorError(
        messageFromError(createError, 'creation.bookAuthorCreateFailed'),
      );
    } finally {
      setBookAuthorCreating(false);
    }
  };

  const uploadBookPDF = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!signedIn) {
      setBookUploadError(t('publishPage.validation.signInToUploadPdf'));
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setBookUploadError(t('publishDialog.pdf.fileOnly'));
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      setBookUploadError(t('publishDialog.pdf.tooLarge'));
      return;
    }
    setBookUploading(true);
    setBookUploadError('');
    setBookTocStatus({ state: 'extracting' });
    setBookCoverStatus(bookCoverUrl.trim() ? 'keeping' : 'generating');
    setBookToc([]);
    try {
      try {
        const toc = await extractPDFTOC(file);
        setBookToc(toc);
        setBookTocStatus(
          toc.length
            ? { state: 'extracted', count: toc.length }
            : { state: 'unavailable' },
        );
      } catch {
        setBookToc([]);
        setBookTocStatus({ state: 'unavailable' });
      }
      if (!bookCoverUrl.trim()) {
        try {
          const coverFile = await renderPDFCover(file);
          const coverUrl = await uploadAnswerFile('post', coverFile);
          setBookCoverUrl(coverUrl);
          setBookCoverStatus('generated');
        } catch {
          setBookCoverStatus('unavailable');
        }
      }
      const url = await uploadAnswerFile('post_attachment', file);
      setBookPdfUrl(url);
      setBookPdfFilename(file.name);
    } catch (uploadError) {
      setBookUploadError(messageFromError(uploadError, 'creation.pdfUploadFailed'));
      setBookTocStatus(null);
      setBookCoverStatus(null);
    } finally {
      setBookUploading(false);
    }
  };

  const uploadBookCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!signedIn) {
      setBookUploadError(t('publishPage.validation.signInToUploadCover'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setBookUploadError(t('publishPage.validation.coverImageOnly'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setBookUploadError(t('publishPage.validation.coverTooLarge'));
      return;
    }
    if (pendingBookCoverCrop) URL.revokeObjectURL(pendingBookCoverCrop.imageUrl);
    setBookUploadError('');
    setBookCoverStatus(null);
    setPendingBookCoverCrop({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || 'book-cover.jpg',
    });
  };

  const closeBookCoverCrop = () => {
    if (bookUploading) return;
    if (pendingBookCoverCrop) URL.revokeObjectURL(pendingBookCoverCrop.imageUrl);
    setPendingBookCoverCrop(null);
  };

  const uploadCroppedBookCover = async (file: File) => {
    if (!pendingBookCoverCrop) return;
    setBookUploading(true);
    setBookUploadError('');
    setBookCoverStatus('uploading');
    try {
      const coverUrl = await uploadAnswerFile('post', file);
      setBookCoverUrl(coverUrl);
      setBookCoverStatus('uploaded');
      URL.revokeObjectURL(pendingBookCoverCrop.imageUrl);
      setPendingBookCoverCrop(null);
    } catch (uploadError) {
      setBookUploadError(
        messageFromError(uploadError, 'creation.coverUploadFailed'),
      );
      setBookCoverStatus(null);
    } finally {
      setBookUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signedIn) {
      setError(t('publishPage.validation.signInToPublish'));
      return;
    }
    setSubmitting(true);
    setStatus('');
    setError('');
    try {
      if (mode === 'question') {
        await submitQuestion();
      } else {
        await submitContent();
      }
    } catch (submitError) {
      setError(messageFromError(submitError, 'creation.publishSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet title={t('publishPage.documentTitle', { heading: pageHeading })} />
      <SiteTopbar />

      <main className={`publish-shell publish-${mode}`}>
        <section className="panel directory-toolbar publish-toolbar">
          <div>
            <span className="eyebrow">{t(`publishPage.modes.${mode}.eyebrow`)}</span>
            <h1>{pageHeading}</h1>
            {editingPost ? <p>{editingPost.title}</p> : null}
          </div>
        </section>

        <section className="publish-layout">
          <article className="panel publish-editor-panel">
            {!signedIn ? (
              <Alert className="notice danger">
                <Link to="/#login">{t('publishPage.signIn')}</Link>
              </Alert>
            ) : null}
            {loadingEdit ? (
              <LoadingState variant="strip" className="notice" />
            ) : null}
            {chapterContext ? (
              <div className="publish-source-context">
                <span>{t('publishPage.chapterContext.source')}</span>
                <strong>
                  <MathInline text={chapterContext.bookTitle} />
                </strong>
                <em>
                  <MathInline text={chapterContext.chapterTitle} />
                  {chapterContext.chapterPage ? ` · p. ${chapterContext.chapterPage}` : ''}
                </em>
              </div>
            ) : null}

            <Form className="publish-form" onSubmit={handleSubmit}>
              {mode !== 'dynamic' ? (
                <Form.Group controlId="publish-title">
                  <Form.Label>{t('publishPage.fields.title')}</Form.Label>
                      <Form.Control
                        value={title}
                        maxLength={120}
                        placeholder={t('publishPage.fields.titlePlaceholder')}
                    disabled={!signedIn || submitting || loadingEdit}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    required
                  />
                </Form.Group>
              ) : null}

              {mode === 'question' ? (
                <div className="similar-question-strip" aria-live="polite">
                  <div className="similar-question-strip-head">
                    <span>{t('publishPage.similar.title')}</span>
                    <strong>
                      {similarLoading
                        ? t('publishPage.similar.searching')
                        : countText('publishPage.similar.resultCount', similarItems.length)}
                    </strong>
                  </div>
                  {similarError ? <p>{similarError}</p> : null}
                  {!similarError && similarLoading && !similarItems.length ? (
                    <LoadingState variant="compact" />
                  ) : null}
                  {!similarError &&
                  !similarLoading &&
                  title.trim().length > 0 &&
                  !similarItems.length ? (
                    <p>{t('publishPage.similar.noResults')}</p>
                  ) : null}
                  {similarItems.map((item) => (
                    <Link
                      className="similar-question-row"
                      to={searchResultPath(item)}
                      key={`${item.objectType}-${item.id}`}
                    >
                      <span>{searchResultSignal(item)}</span>
                      <strong>
                        <MathInline text={item.title} />
                      </strong>
                    </Link>
                  ))}
                </div>
              ) : null}

              {mode === 'book' ? (
                <section className="book-publish-fields">
                  {shouldShowBookKindToggle ? (
                    <div
                      className="book-kind-toggle"
                      role="group"
                      aria-label={t('publishPage.book.kindLabel')}
                    >
                      <AnimateButton unstyled
                        type="button"
                        className={bookKind === 'original' ? 'active' : ''}
                        onClick={() => setBookKind('original')}
                      >
                        {isPdfBookCreate
                          ? t('publishPage.book.originalPdf')
                          : t('publishPage.book.original')}
                      </AnimateButton>
                      <AnimateButton unstyled
                        type="button"
                        className={bookKind === 'copyrighted' ? 'active' : ''}
                        onClick={() => setBookKind('copyrighted')}
                      >
                        {isPdfBookCreate
                          ? t('publishPage.book.externalPdf')
                          : t('publishPage.book.external')}
                      </AnimateButton>
                    </div>
                  ) : null}
                  {bookKind === 'copyrighted' ? (
                    <div className="book-publish-grid book-publish-identity">
                      <Form.Group controlId="book-authors">
                        <Form.Label>{t('publishPage.book.authors')}</Form.Label>
                        <div className="book-author-picker">
                          {bookAuthors.length ? (
                            <div className="book-author-selected">
                              {bookAuthors.map((author) => (
                                <span key={author.id}>
                                  <strong>{author.name}</strong>
                                  <em>#{author.id}</em>
                                  <AnimateButton unstyled
                                    type="button"
                                    disabled={!signedIn || submitting || loadingEdit}
                                    onClick={() => removeBookAuthor(author.id)}
                                    aria-label={t('publishPage.book.removeAuthor', {
                                      name: author.name,
                                    })}
                                  >
                                    <Icon name="x" />
                                  </AnimateButton>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <Form.Control
                            value={bookAuthorQuery}
                            placeholder={t('publishPage.book.authorPlaceholder')}
                            disabled={!signedIn || submitting || loadingEdit || bookAuthorCreating}
                            onChange={(event) => setBookAuthorQuery(event.currentTarget.value)}
                          />
                          {bookAuthorQuery.trim().length >= 2 ? (
                            <div className="book-author-results">
                              {bookAuthorLoading ? (
                                <span>{t('publishPage.book.authorSearching')}</span>
                              ) : null}
                              {bookAuthorResults.map((author) => (
                                <AnimateButton unstyled
                                  type="button"
                                  key={author.id}
                                  disabled={!signedIn || submitting || loadingEdit}
                                  onClick={() => selectBookAuthor(author)}
                                >
                                  <strong>{author.name}</strong>
                                  <em>
                                    #{author.id}
                                    {author.bookCount
                                      ? ` · ${countText('publishPage.book.authorBookCount', author.bookCount)}`
                                      : ''}
                                  </em>
                                </AnimateButton>
                              ))}
                              {!bookAuthorLoading && bookAuthorResults.length === 0 ? (
                                <AnimateButton unstyled
                                  type="button"
                                  disabled={!signedIn || submitting || loadingEdit || bookAuthorCreating}
                                  onClick={() => void createAndSelectBookAuthor()}
                                >
                                  <strong>
                                    {bookAuthorCreating
                                      ? t('publishPage.book.authorCreating')
                                      : t('publishPage.book.createAuthor', {
                                        name: bookAuthorQuery.trim(),
                                      })}
                                  </strong>
                                  <em>{t('publishPage.book.duplicateAuthors')}</em>
                                </AnimateButton>
                              ) : null}
                            </div>
                          ) : null}
                          {bookAuthorError ? <span className="book-upload-error">{bookAuthorError}</span> : null}
                        </div>
                      </Form.Group>
                      <Form.Group controlId="book-official-url">
                        <Form.Label>{t('publishPage.book.officialUrl')}</Form.Label>
                        <Form.Control
                          value={bookOfficialUrl}
                          placeholder="https://www.jmilne.org/math/CourseNotes/ANT.pdf"
                          disabled={!signedIn || submitting || loadingEdit}
                          onChange={(event) => setBookOfficialUrl(event.currentTarget.value)}
                          required
                        />
                      </Form.Group>
                    </div>
                  ) : null}
                  <div className="book-asset-upload">
                    <div className="book-cover-upload">
                      <Form.Label htmlFor="book-cover-file">
                        {t('publishPage.book.cover')}
                      </Form.Label>
                      <label className={bookUploading ? 'secondary-button disabled' : 'secondary-button'} htmlFor="book-cover-file">
                        <Icon name="image" />
                        {bookUploading
                          ? t('publishPage.images.uploading')
                          : bookCoverUrl
                            ? t('publishDialog.cover.replace')
                            : t('publishDialog.cover.upload')}
                      </label>
                      <input id="book-cover-file" type="file" accept="image/*" disabled={!signedIn || submitting || loadingEdit || bookUploading} onChange={uploadBookCover} />
                      {bookCoverUrl ? (
                        <>
                          <img className="book-cover-preview" src={bookCoverUrl} alt="" />
                          <AnimateButton unstyled type="button" className="secondary-button" disabled={bookUploading || submitting} onClick={() => {
                            setBookCoverUrl('');
                            setBookCoverStatus(null);
                          }}>
                            {t('publishDialog.cover.remove')}
                          </AnimateButton>
                        </>
                      ) : (
                        <div className="book-cover-title-preview">
                          <span>{title.trim() || t('publishPage.book.bookTitleFallback')}</span>
                        </div>
                      )}
                      {bookCoverStatusText ? <span>{bookCoverStatusText}</span> : null}
                    </div>
                    {shouldShowPdfUpload ? (
                      <div className="book-pdf-upload">
                        <Form.Label htmlFor="book-pdf">PDF</Form.Label>
                        <label className={bookUploading ? 'secondary-button disabled' : 'secondary-button'} htmlFor="book-pdf">
                          <Icon name="filetype-pdf" />
                          {bookUploading
                            ? t('publishPage.images.uploading')
                            : bookPdfUrl
                              ? t('publishDialog.pdf.replace')
                              : t('publishDialog.pdf.upload')}
                        </label>
                        <input id="book-pdf" type="file" accept="application/pdf,.pdf" disabled={!signedIn || submitting || loadingEdit || bookUploading} onChange={(event) => void uploadBookPDF(event)} />
                        {bookPdfUrl ? <a href={bookPdfUrl} target="_blank" rel="noreferrer">{bookPdfFilename || t('publishPage.book.viewPdf')}</a> : null}
                        {bookTocStatusText ? <span>{bookTocStatusText}</span> : null}
                        {bookToc.length ? (
                          <ol className="book-toc-preview">
                            {bookToc.slice(0, 12).map((item, index) => (
                              <li key={`${item.title}-${index}`} style={{ paddingLeft: `${Math.max(0, (item.level || 1) - 1) * 12}px` }}>
                                {item.title}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </div>
                    ) : null}
                    {bookUploadError ? <span className="book-upload-error">{bookUploadError}</span> : null}
                  </div>
                </section>
              ) : null}

              <Form.Group controlId="publish-body">
                <Form.Label>{bodyLabel}</Form.Label>
                {mode === 'question' ? (
                  <RinMilkdownEditor
                    id="publish-body"
                    value={body}
                    minHeight="280px"
                    placeholder={bookBodyPlaceholder}
                    ariaLabel={bodyLabel}
                    readOnly={!signedIn || submitting || loadingEdit}
                    onChange={setBody}
                    onError={setError}
                  />
                ) : (
                  <CodeMirrorEditor
                    value={body}
                    minHeight={mode === 'dynamic' ? '180px' : '280px'}
                    placeholder={bookBodyPlaceholder}
                    ariaLabel={bodyLabel}
                    readOnly={!signedIn || submitting || loadingEdit}
                    onChange={setBody}
                  />
                )}
              </Form.Group>

              {mode === 'discussion' ? (
                <div className="discussion-image-uploader">
                  <div className="discussion-image-uploader-head">
                    <div>
                      <Form.Label htmlFor="discussion-images">
                        {t('publishPage.images.label')}
                      </Form.Label>
                      <p>{t('publishPage.images.hint')}</p>
                    </div>
                    <label
                      className={
                        discussionImages.length >= 9 || imageUploading
                          ? 'secondary-button disabled'
                          : 'secondary-button'
                      }
                      htmlFor="discussion-images"
                    >
                      <Icon name="image" />
                      {imageUploading
                        ? t('publishPage.images.uploading')
                        : t('publishPage.images.upload')}
                    </label>
                    <input
                      id="discussion-images"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={
                        !signedIn ||
                        submitting ||
                        loadingEdit ||
                        imageUploading ||
                        discussionImages.length >= 9
                      }
                      onChange={(event) => void uploadDiscussionImages(event)}
                    />
                  </div>
                  {imageError ? (
                    <div className="discussion-image-error">{imageError}</div>
                  ) : null}
                  {discussionImages.length ? (
                    <div className="discussion-image-grid editable">
                      {discussionImages.map((image) => (
                        <figure key={image}>
                          <img src={image} alt={t('publishPage.images.preview')} />
                          <AnimateButton unstyled
                            type="button"
                            onClick={() => removeDiscussionImage(image)}
                            disabled={submitting || imageUploading}
                            aria-label={t('publishPage.images.remove')}
                          >
                            <Icon name="x-lg" />
                          </AnimateButton>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Form.Group controlId="publish-tags">
                <Form.Label>{t('publishPage.fields.tags')}</Form.Label>
                <TagPicker
                  value={tagItems}
                  onChange={(next) => setTags(joinTagValues(next))}
                  disabled={!signedIn || submitting || loadingEdit}
                  ariaLabel={t('publishPage.fields.contentTags')}
                />
                <Form.Text>
                  {mode === 'question'
                    ? t('publishPage.tagHints.question')
                    : mode === 'book'
                      ? t('publishPage.tagHints.book')
                      : t('publishPage.tagHints.default')}
                </Form.Text>
              </Form.Group>

              {mode === 'book' && bookKind === 'copyrighted' ? (
                <section className="book-publish-fields book-publish-details">
                  <div className="book-publish-grid">
                    <Form.Group controlId="book-series">
                      <Form.Label>{t('publishPage.book.metadata.seriesTitle')}</Form.Label>
                      <Form.Control value={bookSeriesTitle} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookSeriesTitle(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-doi">
                      <Form.Label>{t('publishPage.book.metadata.doi')}</Form.Label>
                      <Form.Control value={bookDoi} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookDoi(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-publisher">
                      <Form.Label>{t('publishPage.book.metadata.publisher')}</Form.Label>
                      <Form.Control value={bookPublisher} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookPublisher(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-ebook-packages">
                      <Form.Label>{t('publishPage.book.metadata.ebookPackages')}</Form.Label>
                      <Form.Control value={bookEbookPackages} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookEbookPackages(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-copyright">
                      <Form.Label>{t('publishPage.book.metadata.copyright')}</Form.Label>
                      <Form.Control value={bookCopyright} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookCopyright(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-hardcover-isbn">
                      <Form.Label>{t('publishPage.book.metadata.hardcoverIsbn')}</Form.Label>
                      <Form.Control value={bookHardcoverISBN} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookHardcoverISBN(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-hardcover-published">
                      <Form.Label>{t('publishPage.book.metadata.hardcoverPublished')}</Form.Label>
                      <Form.Control value={bookHardcoverPublished} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookHardcoverPublished(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-softcover-isbn">
                      <Form.Label>{t('publishPage.book.metadata.softcoverIsbn')}</Form.Label>
                      <Form.Control value={bookSoftcoverISBN} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookSoftcoverISBN(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-softcover-published">
                      <Form.Label>{t('publishPage.book.metadata.softcoverPublished')}</Form.Label>
                      <Form.Control value={bookSoftcoverPublished} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookSoftcoverPublished(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-ebook-isbn">
                      <Form.Label>{t('publishPage.book.metadata.ebookIsbn')}</Form.Label>
                      <Form.Control value={bookEbookISBN} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookEbookISBN(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-ebook-published">
                      <Form.Label>{t('publishPage.book.metadata.ebookPublished')}</Form.Label>
                      <Form.Control value={bookEbookPublished} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookEbookPublished(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-series-issn">
                      <Form.Label>{t('publishPage.book.metadata.seriesIssn')}</Form.Label>
                      <Form.Control value={bookSeriesISSN} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookSeriesISSN(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-series-eissn">
                      <Form.Label>{t('publishPage.book.metadata.seriesEissn')}</Form.Label>
                      <Form.Control value={bookSeriesEISSN} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookSeriesEISSN(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-edition">
                      <Form.Label>{t('publishPage.book.metadata.edition')}</Form.Label>
                      <Form.Control value={bookEditionNumber} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookEditionNumber(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-pages">
                      <Form.Label>{t('publishPage.book.metadata.pages')}</Form.Label>
                      <Form.Control value={bookNumberOfPages} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookNumberOfPages(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-topics">
                      <Form.Label>{t('publishPage.book.metadata.topics')}</Form.Label>
                      <Form.Control as="textarea" rows={3} value={bookTopics} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookTopics(event.currentTarget.value)} />
                    </Form.Group>
                    <Form.Group controlId="book-keywords">
                      <Form.Label>{t('publishPage.book.metadata.keywords')}</Form.Label>
                      <Form.Control as="textarea" rows={3} value={bookKeywords} disabled={!signedIn || submitting || loadingEdit} onChange={(event) => setBookKeywords(event.currentTarget.value)} />
                    </Form.Group>
                  </div>
                </section>
              ) : null}

              {mode === 'question' ? (
                <>
                  <Form.Check
                    id="publish-answer-toggle"
                    type="switch"
                    label={t('publishPage.answer.toggle')}
                    checked={withAnswer}
                    disabled={!signedIn || submitting || loadingEdit}
                    onChange={(event) => setWithAnswer(event.currentTarget.checked)}
                  />
                  {withAnswer ? (
                    <Form.Group controlId="publish-answer">
                      <Form.Label>{t('publishPage.answer.label')}</Form.Label>
                      <RinMilkdownEditor
                        id="publish-answer"
                        value={answerBody}
                        minHeight="220px"
                        placeholder={t('publishPage.answer.placeholder')}
                        ariaLabel={t('publishPage.answer.label')}
                        readOnly={!signedIn || submitting || loadingEdit}
                        onChange={setAnswerBody}
                        onError={setError}
                      />
                    </Form.Group>
                  ) : null}
                </>
              ) : null}

              <div className="publish-actions">
                <Button
                  className="secondary-button"
                  type="button"
                  disabled={submitting || loadingEdit}
                  onClick={() => navigate(-1)}
                >
                  {t('publishPage.actions.cancel')}
                </Button>
                <Button className="primary-button" type="submit" disabled={submitDisabled}>
                  {submitting ? (
                    <>
                      <Spinner animation="border" size="sm" />
                      {editing
                        ? t('publishPage.actions.saving')
                        : t('publishPage.actions.publishing')}
                    </>
                  ) : (
                    editing
                      ? mode === 'book' && (bookKind === 'original' || bookKind === 'markdown' || bookKind === 'typst')
                        ? t('publishPage.actions.save')
                        : t('publishPage.actions.saveChanges')
                      : explicitBookKind === 'latex' || explicitBookKind === 'markdown' || explicitBookKind === 'typst'
                        ? t('publishPage.actions.create')
                        : isPdfBookCreate && bookKind === 'original'
                          ? t('publishPage.actions.uploadOriginalPdf')
                          : isPdfBookCreate && bookKind === 'copyrighted'
                            ? t('publishPage.actions.uploadExternalPdf')
                        : mode === 'book' && bookKind === 'copyrighted'
                          ? t('publishPage.actions.submitBook')
                          : defaultSubmitLabel
                  )}
                </Button>
              </div>
            </Form>
          </article>

          <aside className="publish-side">
            <section className="panel publish-side-panel">
              <div className="panel-heading">
                <span>{t('publishPage.check.title')}</span>
                <strong>
                  {signedIn
                    ? t('publishPage.check.signedIn')
                    : t('publishPage.check.signInRequired')}
                </strong>
              </div>
              <dl>
                <div>
                  <dt>
                    {mode === 'dynamic'
                      ? t('publishPage.fields.tags')
                      : t('publishPage.fields.title')}
                  </dt>
                  <dd>
                    {mode === 'dynamic'
                      ? `${displayCount(tagItems.length)}/${displayCount(6)}`
                      : displayCount(title.trim().length)}
                  </dd>
                </div>
                <div>
                  <dt>{t('publishPage.check.body')}</dt>
                  <dd>{displayCount(trimmedBody.length)}</dd>
                </div>
                {mode === 'question' ? (
                  <div>
                    <dt>{t('publishPage.fields.tags')}</dt>
                    <dd>{displayCount(tagItems.length)}/{displayCount(1)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
            <SiteIcpLink />
          </aside>
        </section>
        {pendingBookCoverCrop ? (
          <ImageCropDialog
            open
            imageUrl={pendingBookCoverCrop.imageUrl}
            title={t('publishDialog.cover.cropBook')}
            aspect={2 / 3}
            cropShape="rect"
            outputWidth={900}
            outputHeight={1350}
            outputFileName={pendingBookCoverCrop.fileName}
            busy={bookUploading}
            error={bookUploadError}
            onCancel={closeBookCoverCrop}
            onConfirm={uploadCroppedBookCover}
          />
        ) : null}
      </main>
    </>
  );
}

import type { ContentType } from '@/services/contracts';
import type { PublicationPdfReference } from '@/services/feed';

export function publicationPdfPath(
  kind: 'article' | 'book' | 'tag',
  id: string | number,
  edition?: PublicationPdfReference,
) {
  if (!edition || !/^[1-9][0-9]{0,18}$/.test(String(id))) return undefined;
  const query = new URLSearchParams({ version: edition.version, sha256: edition.sha256 });
  return `/reader/pdf/publication/${kind}/${id}?${query}`;
}

export function cleanUserId(value: string | undefined | null) {
  return (value || '').trim().replace(/^@+/, '');
}

export function profilePath(userId: string | undefined | null) {
  return `/@${encodeURIComponent(cleanUserId(userId) || 'rinspace')}`;
}

export function profileRankPath(userId: string | undefined | null) {
  return `${profilePath(userId)}/rank`;
}

export function contentTitleSlug(value: string | undefined | null) {
  const normalized = (value || '')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return normalized || 'post';
}

function tagIdSegment(id: string | number | undefined | null) {
  return encodeURIComponent(String(id || '').trim() || 'tag');
}

function tagSlugSegment(slugOrTitle: string | undefined | null) {
  return encodeURIComponent(contentTitleSlug(slugOrTitle || 'tag'));
}

export function tagReadPath(
  id: string | number | undefined | null,
  slugOrTitle?: string | undefined | null,
) {
  return `/tags/${tagIdSegment(id)}/${tagSlugSegment(slugOrTitle)}`;
}

export function tagPath(
  id: string | number | undefined | null,
  slugOrTitle?: string | undefined | null,
) {
  return tagReadPath(id, slugOrTitle);
}

export function tagReadOrLegacyPath(
  idOrSlug: string | number | undefined | null,
  slugOrTitle?: string | undefined | null,
) {
  const idText = String(idOrSlug || '').trim();
  if (/^\d+$/.test(idText)) {
    return tagReadPath(idText, slugOrTitle || idText);
  }
  return legacyTagPath(slugOrTitle || idText);
}

export function tagWikiPath(
  id: string | number | undefined | null,
  slugOrTitle?: string | undefined | null,
) {
  return `/tags/${tagIdSegment(id)}/info/${tagSlugSegment(slugOrTitle)}`;
}

export function tagWikiHistoryPath(
  id: string | number | undefined | null,
  slugOrTitle?: string | undefined | null,
) {
  return `/tags/${tagIdSegment(id)}/info/history/${tagSlugSegment(slugOrTitle)}`;
}

export function tagEditPath(
  id: string | number | undefined | null,
  slugOrTitle?: string | undefined | null,
) {
  return `/tags/${tagIdSegment(id)}/edit/${tagSlugSegment(slugOrTitle)}`;
}

export function legacyTagPath(slug: string | undefined | null) {
  return `/tags/${encodeURIComponent((slug || '').trim() || 'tag')}`;
}

export function contentPath(
  type: ContentType | string | undefined | null,
  id: string | number | undefined | null,
  title?: string | undefined | null,
) {
  const slug = encodeURIComponent(String(id || '').trim() || 'post');
  const titlePart = title ? `/${encodeURIComponent(contentTitleSlug(title))}` : '';
  switch (type) {
    case 'blog':
      return `/a/${slug}${titlePart}`;
    case 'question':
      return `/q/${slug}${titlePart}`;
    case 'discussion':
    case 'forum':
      return `/d/${slug}${titlePart}`;
    case 'announcement':
      return `/announcements/${slug}`;
    case 'dynamic':
    case 'status':
      return `/s/${slug}${titlePart}`;
    case 'book':
      return `/books/${slug}${titlePart}`;
    case 'answer':
      return `/q/${slug}${titlePart}`;
    default:
      return `/q/${slug}${titlePart}`;
  }
}

export function questionPath(
  id: string | number | undefined | null,
  title?: string | undefined | null,
) {
  return contentPath('question', id, title);
}

export function bookChapterPath(
  id: string | number | undefined | null,
  title: string | undefined | null,
  chapterKey: string | undefined | null,
) {
  const base = contentPath('book', id, title);
  const key = (chapterKey || '').trim();
  return key ? `${base}?chapter=${encodeURIComponent(key)}` : base;
}

export function bookReadingPath(
  id: string | number | undefined | null,
  title?: string | undefined | null,
) {
  const slug = encodeURIComponent(String(id || '').trim() || 'book');
  const titlePart = title ? `/${encodeURIComponent(contentTitleSlug(title))}` : '';
  return `/books/${slug}/read${titlePart}`;
}

export function bookWorkspacePath(
  id: string | number | undefined | null,
) {
  const slug = encodeURIComponent(String(id || '').trim() || 'book');
  return `/books/${slug}/workspace`;
}

export function answerPath(questionId: string | number | undefined | null, answerId: string | number) {
  return `${questionPath(questionId)}#answer-${encodeURIComponent(String(answerId))}`;
}

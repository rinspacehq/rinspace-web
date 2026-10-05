import type { BookMetadata, FeedItem } from '@/services/feed';
import { blogEditorKind } from '@/utils/blogBody';

export type ContentEditDestination =
  | 'quick-edit'
  | 'markdown-article'
  | 'book-workspace'
  | 'legacy-book-editor';

export function contentEditDestination(
  item: Pick<FeedItem, 'type' | 'editor'> & {
    body?: string;
    book?: Pick<BookMetadata, 'kind' | 'pdfUrl'>;
  },
): ContentEditDestination {
  if (item.type === 'blog') {
    return blogEditorKind(item) === 'markdown'
      ? 'markdown-article'
      : 'quick-edit';
  }

  if (item.type === 'book') {
    if (item.book?.pdfUrl) return 'quick-edit';
    if (
      item.book?.kind === 'original' ||
      item.book?.kind === 'markdown' ||
      item.book?.kind === 'typst'
    ) {
      return 'book-workspace';
    }
    return 'legacy-book-editor';
  }

  return 'quick-edit';
}

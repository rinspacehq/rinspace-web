import { act, fireEvent, render, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { createContent, updateContent } from '@/services/domains/article';
import type { PostDetail } from '@/services/feed';
import { openGiteaPath } from '@/utils/giteaPaths';

import BookProfileDialog from './BookProfileDialog';
import PublishCreateDialog from './PublishCreateDialog';

vi.mock('@/components/TagPicker', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <input aria-label="tag-picker" placeholder={placeholder} />
  ),
}));

vi.mock('@/components/ImageCropDialog', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/services/domains/article', () => ({
  createContent: vi.fn(),
  updateContent: vi.fn(),
  isContentModerationSubmission: (value: object) => 'submissionId' in value,
}));

vi.mock('@/services/domains/publication', () => ({
  openArticleCodeWorkspace: vi.fn(),
  uploadAnswerFile: vi.fn(),
}));

vi.mock('@/services/profile', () => ({ uploadCoverFile: vi.fn() }));

vi.mock('@/utils/pdfToc', () => ({
  extractPDFTOC: vi.fn(),
  renderPDFCover: vi.fn(),
}));
vi.mock('@/utils/giteaPaths', async () => {
  const actual = await vi.importActual<typeof import('@/utils/giteaPaths')>('@/utils/giteaPaths');
  return {
    ...actual,
    openGiteaPath: vi.fn(),
  };
});

const authoredBook = {
  id: 'book-42',
  slug: 'algebraic-geometry',
  type: 'book',
  title: '代数几何讲义',
  excerpt: '作者写下的中文简介',
  body: '',
  tags: ['algebraic-geometry'],
  coverUrl: '',
  book: {
    kind: 'original',
    bookTitle: '代数几何讲义',
    authors: [],
  },
} as unknown as PostDetail;

const typstArticle = {
  ...authoredBook,
  id: 'article-42',
  slug: 'typst-article',
  type: 'blog',
  title: 'Typst 文章',
  excerpt: '文章简介',
  editor: 'typst',
  book: undefined,
} as unknown as PostDetail;

beforeEach(() => {
  vi.mocked(createContent).mockReset();
  vi.mocked(updateContent).mockReset();
  vi.mocked(openGiteaPath).mockReset();
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('renders the English book profile UI while preserving authored Chinese values', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <BookProfileDialog
      open
      post={authoredBook}
      user={{ id: 'author-1' }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );

  expect(await view.findByRole('heading', { name: 'Edit profile' })).toBeTruthy();
  expect(view.getByDisplayValue('代数几何讲义')).toBeTruthy();
  expect(view.getByDisplayValue('作者写下的中文简介')).toBeTruthy();
  expect(view.getByPlaceholderText('Search or enter a new tag')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Save profile' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Close book profile editor' })).toBeTruthy();
});

test('keeps the active book profile visible while a repository commit awaits activation', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(updateContent).mockResolvedValue({
    ...authoredBook,
    publicationPending: true,
    pendingCommit: 'a'.repeat(40),
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <BookProfileDialog
      open
      post={authoredBook}
      user={{ id: 'author-1' }}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  fireEvent.click(await view.findByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(view.getByRole('status').textContent).toContain('awaiting validation and activation'));
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(view.getByRole('heading', { name: 'Edit profile' })).toBeTruthy();
});

test('quick-edits a Typst article without sending it to a code workspace', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(updateContent).mockResolvedValue(typstArticle);
  const view = render(
    <BookProfileDialog
      open
      variant="article"
      post={typstArticle}
      user={{ id: 'author-1' }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );

  expect(await view.findByRole('heading', { name: 'Edit article' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateContent).toHaveBeenCalledWith(
    'typst-article',
    expect.objectContaining({ type: 'blog', editor: 'typst', book: undefined }),
  ));
});

test('uses a localized moderation state instead of the backend message', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(createContent).mockResolvedValue({
    submissionId: 'submission-42',
    state: 'manual_review_pending',
    message: '内容已进入人工审核。',
  });

  const view = render(
    <MemoryRouter>
      <PublishCreateDialog
        open
        mode="blog"
        user={{ id: 'author-1' }}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

  expect(await view.findByRole('heading', { name: 'Create LaTeX article' })).toBeTruthy();
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'A derived category' } });
  fireEvent.change(view.getByLabelText('Summary'), { target: { value: 'An introduction' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));

  await waitFor(() => expect(view.getByRole('status').textContent).toBe('Content submitted for review.'));
  expect(view.baseElement.textContent).not.toContain('内容已进入人工审核');
});

test('localizes PDF creation controls and validation', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <MemoryRouter>
      <PublishCreateDialog
        open
        mode="pdf-book"
        user={{ id: 'author-1' }}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

  expect(await view.findByRole('heading', { name: 'Upload PDF book' })).toBeTruthy();
  expect(view.getByText('Upload PDF (≤80 MB)')).toBeTruthy();
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Algebraic geometry' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));
  expect(await view.findByText('Upload a PDF file first.')).toBeTruthy();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

test('opens the LaTeX blog repository even while activation is pending', async () => {
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
  vi.mocked(createContent).mockResolvedValue({
    id: 'article-17',
    title: 'Derived categories',
    publicationPending: true,
  } as unknown as PostDetail);

  const view = render(
    <MemoryRouter>
      <LocationProbe />
      <PublishCreateDialog
        open
        mode="blog"
        user={{ id: 'author-1' }}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

  fireEvent.change(await view.findByLabelText('标题'), { target: { value: 'Derived categories' } });
  fireEvent.change(view.getByLabelText('简介'), { target: { value: 'An introduction' } });
  fireEvent.click(view.getByRole('button', { name: '创建并编辑' }));

  await waitFor(() => expect(openGiteaPath).toHaveBeenCalledWith('a', 'article-17'));
});

test('starts a new LaTeX article with the canonical theorem environments', async () => {
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
  vi.mocked(createContent).mockResolvedValue({
    id: 'article-18',
    title: 'Derived categories',
  } as unknown as PostDetail);

  const view = render(
    <MemoryRouter>
      <PublishCreateDialog
        open
        mode="blog"
        user={{ id: 'author-1' }}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

  fireEvent.change(await view.findByLabelText('标题'), { target: { value: 'Derived categories' } });
  fireEvent.change(view.getByLabelText('简介'), { target: { value: 'An introduction' } });
  fireEvent.click(view.getByRole('button', { name: '创建并编辑' }));

  await waitFor(() => expect(createContent).toHaveBeenCalled());
  const submitted = vi.mocked(createContent).mock.calls.at(-1)?.[0] as { body: string };
  const template = fs
    .readFileSync(path.resolve(process.cwd(), 'contracts/templates/latex-article.tex'), 'utf8')
    .trimEnd();
  const source = submitted.body
    .slice(submitted.body.indexOf('[[RIN_SOURCE]]') + '[[RIN_SOURCE]]'.length)
    .split('[[/RIN_SOURCE]]')[0]
    .trim();
  expect(source).toBe(template);
});

test.each(['latex-book', 'markdown-book'] as const)('closes the persistent %s dialog when opening its workspace before activation', async (mode) => {
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
  vi.mocked(createContent).mockResolvedValue({
    id: 'book-17',
    title: 'Derived categories',
    publicationPending: true,
  } as unknown as PostDetail);

  function PersistentCreationDialog() {
    const [open, setOpen] = useState(true);
    return <PublishCreateDialog open={open} mode={mode} user={{ id: 'author-1' }} onClose={() => setOpen(false)} />;
  }

  const view = render(
    <MemoryRouter>
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <LocationProbe />
              <PersistentCreationDialog />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.change(await view.findByLabelText('标题'), { target: { value: 'Derived categories' } });
  fireEvent.click(view.getByRole('button', { name: '创建并编辑' }));

  await waitFor(() => expect(view.getByTestId('location').textContent).toBe('/books/book-17/workspace'));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

import { act, fireEvent, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { loadContentDetail } from '@/services/domains/article';
import type { PostDetail } from '@/services/feed';
import { getCurrentUser } from '@/services/profile';
import type { PublicationProgress } from '@/services/publicationProgress';

const progressDriver = vi.hoisted(() => ({
  initial: null as PublicationProgress | null,
  emit: null as ((value: PublicationProgress | null) => void) | null,
}));

import BookWorkspacePage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/features/publish/BookProfileDialog', () => ({ default: () => null }));

vi.mock('@/services/domains/article', () => ({
  loadContentDetail: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock('@/services/domains/book', () => ({
  loadBookImportJob: vi.fn(),
  startBookImportJob: vi.fn(),
}));

vi.mock('@/services/profile', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/services/publicationProgress', () => ({
  PublicationProgressPoller: class {
    constructor(_ref: string, private callback: (value: PublicationProgress | null) => void) {
      progressDriver.emit = callback;
    }
    start() { this.callback(progressDriver.initial); }
    stop() { progressDriver.emit = null; }
  },
}));

const markdownProject = {
  version: '0.1',
  title: '代数几何讲义',
  files: [
    {
      id: 'chapter-1',
      path: '01-schemes.md',
      title: '概形',
      body: '# 概形\n\n作者正文',
      level: 2,
    },
  ],
  toc: [{ id: 'chapter-1', text: '概形', level: 2 }],
  pages: [{ id: 'chapter-1', text: '概形', level: 2, html: '<h1>概形</h1>' }],
};

const authoredBook = {
  id: 'book-42',
  slug: 'algebraic-geometry',
  type: 'book',
  title: '代数几何讲义',
  excerpt: '作者写下的中文简介',
  body: `[[RIN_MARKDOWN_BOOK]]\n${JSON.stringify(markdownProject)}\n[[/RIN_MARKDOWN_BOOK]]`,
  publishStatus: 'published',
  author: 'Author',
  authorId: 'author-1',
  authorUid: 'author-1',
  tags: ['algebraic-geometry'],
  coverUrl: '',
  book: {
    kind: 'markdown',
    bookTitle: '代数几何讲义',
    authors: [],
  },
} as unknown as PostDetail;

function renderWorkspace() {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-42/workspace']}>
          <Routes>
            <Route path="/books/:postId/workspace" element={<BookWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  progressDriver.initial = null;
  progressDriver.emit = null;
  vi.mocked(loadContentDetail).mockReset();
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(loadContentDetail).mockResolvedValue(authoredBook);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'author-1' });
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('switches workspace controls without losing authored or unsaved values', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = renderWorkspace();

  expect(await view.findByText('Markdown book workspace')).toBeTruthy();
  expect(view.getByText('作者写下的中文简介')).toBeTruthy();
  expect(await view.findByText('概形')).toBeTruthy();
  expect(await view.findByText('1 page')).toBeTruthy();
  expect(view.getByText('1 file')).toBeTruthy();
  expect(document.title).toBe('代数几何讲义 workspace · Rinspace');

  const chapterInput = view.getByLabelText('New chapter title');
  fireEvent.change(chapterInput, { target: { value: '未保存的新章节' } });

  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  expect(await view.findByText('Markdown 书籍工作台')).toBeTruthy();
  expect((view.getByLabelText('新章节标题') as HTMLInputElement).value).toBe(
    '未保存的新章节',
  );
  expect(view.getByText('作者写下的中文简介')).toBeTruthy();
  expect(loadContentDetail).toHaveBeenCalledTimes(1);
});

test('does not expose a raw Chinese load failure in the English workspace', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(loadContentDetail).mockRejectedValue(new Error('数据库暂时不可用。'));

  const view = renderWorkspace();

  expect(await view.findByText('The book workspace could not be loaded.')).toBeTruthy();
  expect(view.baseElement.textContent).not.toContain('数据库暂时不可用');
});

test('does not display LaTeX source and reader JSON as the book summary', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
  vi.mocked(loadContentDetail).mockResolvedValue({
    ...authoredBook,
    excerpt: '',
    book: { ...authoredBook.book!, kind: 'original' },
    body: '[[RIN_SOURCE]]\\documentclass{book}[[/RIN_SOURCE]]\n[[RIN_READER]]{"toc":[],"pages":[]}[[/RIN_READER]]',
  });
  const view = renderWorkspace();
  expect(await view.findByText('LaTeX book workspace')).toBeTruthy();
  expect(view.baseElement.textContent).not.toContain('RIN_SOURCE');
  expect(view.baseElement.textContent).not.toContain('documentclass');
  expect(view.baseElement.textContent).not.toContain('RIN_READER');
});

test('builds a complete LaTeX source outline when no reader table of contents exists', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
  vi.mocked(loadContentDetail).mockResolvedValue({
    ...authoredBook,
    excerpt: '',
    book: { ...authoredBook.book!, kind: 'original' },
    body: String.raw`[[RIN_SOURCE]]
\documentclass{book}
\begin{document}
\chapter{Schemes}
\section{Affine schemes}
\subsection{Prime spectra}
\chapter{Cohomology}
\end{document}
[[/RIN_SOURCE]]`,
  });
  const view = renderWorkspace();
  expect(await view.findByText('LaTeX book workspace')).toBeTruthy();
  expect(view.getByText('Schemes')).toBeTruthy();
  expect(view.getByText('Affine schemes')).toBeTruthy();
  expect(view.getByText('Prime spectra')).toBeTruthy();
  expect(view.getByText('Cohomology')).toBeTruthy();
  expect(view.getAllByText('\\chapter')).toHaveLength(2);
  expect(view.getByText('\\section')).toBeTruthy();
  expect(view.queryByRole('link', { name: 'Online editor' })).toBeNull();
});

test('uses the Typst source wording without empty matter prompts or editor entry', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
  vi.mocked(loadContentDetail).mockResolvedValue({
    ...authoredBook,
    editor: 'typst',
    excerpt: '',
    book: { ...authoredBook.book!, kind: 'original' },
    body: `[[RIN_READER]]${JSON.stringify({
      toc: [{ id: 'chapter-one', text: 'Typst chapter', level: 1 }],
      pages: [{ id: 'chapter-one', text: 'Typst chapter', html: '<h1>Typst chapter</h1>' }],
    })}[[/RIN_READER]]`,
  });
  const view = renderWorkspace();
  expect(await view.findByText('Typst book workspace')).toBeTruthy();
  expect(view.getByText('Web book contents')).toBeTruthy();
  expect(view.queryByText('No chapters yet')).toBeNull();
  expect(view.queryByRole('link', { name: 'Online editor' })).toBeNull();
});

test('recognizes a repository-rendered Markdown book and retains its complete outline', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
  vi.mocked(loadContentDetail).mockResolvedValue({
    ...authoredBook,
    body: `[[RIN_READER]]${JSON.stringify({ version: 'rin-renderer-binding/v2',
      toc: [{ id: 'intro', text: 'Introduction', level: 1 }, { id: 'formula', text: 'Formula', level: 2 }],
      pages: [{ id: 'intro', text: 'Introduction', html: '<p>Rendered source</p>' }],
    })}[[/RIN_READER]]`,
  });
  const view = renderWorkspace();
  expect(await view.findByRole('link', { name: 'Introduction' })).toBeTruthy();
  expect(view.getByRole('link', { name: 'Formula' })).toBeTruthy();
  expect(view.getByRole('link', { name: 'Reading page' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Open repository' })).toBeTruthy();
  expect(view.queryByRole('link', { name: 'Online editor' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Create chapter' })).toBeNull();
});

test('shows author diagnostics for a failed first publication', async () => {
  await ensureLocaleNamespaces('en', ['creation', 'common']);
  await act(async () => { await i18n.changeLanguage('en'); });
  progressDriver.initial = {
    schemaVersion: 'rin-publication-progress/v1', view: 'author', projectId: 'book:344',
    state: 'failed', displayingPreviousVersion: false, updatedAt: '2026-09-12T08:49:10Z',
    failure: { code: 'render_failed', message: 'Compilation failed' },
    author: { diagnostics: [{ code: 'render_failed', severity: 'error', message: 'Compilation failed' }] },
  };
  vi.mocked(loadContentDetail).mockResolvedValue({ ...authoredBook, publicationPending: true, body: '' });
  const view = renderWorkspace();
  expect(await view.findByRole('heading', { name: 'Update incomplete' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Open repository' })).toBeTruthy();
  expect(view.queryByRole('link', { name: 'Online editor' })).toBeNull();
  expect(view.queryByText('The book workspace could not be loaded.')).toBeNull();
});

test('refreshes the workspace when its first publication becomes active', async () => {
  await ensureLocaleNamespaces('en', ['creation', 'common']);
  await act(async () => { await i18n.changeLanguage('en'); });
  const progress: PublicationProgress = {
    schemaVersion: 'rin-publication-progress/v1', view: 'author', projectId: 'book:344',
    state: 'validating', displayingPreviousVersion: false, updatedAt: '2026-09-12T08:49:10Z',
  };
  progressDriver.initial = progress;
  vi.mocked(loadContentDetail)
    .mockResolvedValueOnce({ ...authoredBook, publicationPending: true, body: '' })
    .mockResolvedValue(authoredBook);
  const view = renderWorkspace();
  expect(await view.findByRole('heading', { name: 'Checking the project' })).toBeTruthy();
  await act(async () => { progressDriver.emit?.({ ...progress, state: 'published' }); });
  expect(await view.findByRole('link', { name: 'Reading page' })).toBeTruthy();
  expect(loadContentDetail).toHaveBeenCalledTimes(2);
});

test('renders the Typst workspace without obsolete editor prompts', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
  vi.mocked(loadContentDetail).mockResolvedValue({
    ...authoredBook,
    excerpt: '',
    book: { ...authoredBook.book!, kind: 'typst' },
    body: `[[RIN_READER]]${JSON.stringify({ version: 'rin-renderer-binding/v2',
      toc: [{ id: 'intro', text: 'Introduction', level: 1 }],
      pages: [{ id: 'intro', text: 'Introduction', html: '<p>Typst source</p>' }],
    })}[[/RIN_READER]]`,
  });
  const view = renderWorkspace();
  expect(await view.findByText('Typst book workspace')).toBeTruthy();
  expect(view.getByRole('link', { name: 'Introduction' })).toBeTruthy();
  expect(view.getByRole('link', { name: 'Reading page' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Open repository' })).toBeTruthy();
  expect(view.queryByRole('link', { name: 'Online editor' })).toBeNull();
  expect(view.queryByRole('link', { name: 'PDF preview / export' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Create chapter' })).toBeNull();
  expect(view.baseElement.textContent).not.toContain('Manage external and PDF books');
  expect(view.baseElement.textContent).not.toContain('online editor');
  expect(view.baseElement.textContent).not.toContain('RIN_READER');
});

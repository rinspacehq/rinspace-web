import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { createContent } from '@/services/domains/article';
import type { PostDetail } from '@/services/contracts';
import { openGiteaPath } from '@/utils/giteaPaths';
import { openOnlineEditorProject } from '@/utils/onlineEditor';

import { articleEditorPreferenceKey } from './articleEditorPreference';
import PublishCreateDialog from './PublishCreateDialog';

vi.mock('./typstFeature', () => ({ typstCreationEnabled: true }));
vi.mock('@/components/TagPicker', () => ({ default: () => <input aria-label="tag-picker" /> }));
vi.mock('@/components/ImageCropDialog', () => ({ default: () => null }));
vi.mock('@/services/domains/article', () => ({ createContent: vi.fn(), isContentModerationSubmission: (value: object) => 'submissionId' in value }));
vi.mock('@/services/domains/publication', () => ({ uploadAnswerFile: vi.fn() }));
vi.mock('@/services/profile', () => ({ uploadCoverFile: vi.fn() }));
vi.mock('@/utils/pdfToc', () => ({ extractPDFTOC: vi.fn(), renderPDFCover: vi.fn() }));
vi.mock('@/utils/giteaPaths', () => ({ openGiteaPath: vi.fn() }));
vi.mock('@/utils/onlineEditor', () => ({ openOnlineEditorProject: vi.fn() }));

// Creation routing consumes only the returned stable ID, not a published reader payload.
const saved = { id: '622', title: 'Test article', publicationPending: true } as PostDetail;

function dialog(mode: 'blog' | 'typst-blog', onClose = vi.fn()) {
  return <MemoryRouter><PublishCreateDialog open mode={mode} user={{ id: 'author-1' }} onClose={onClose} /></MemoryRouter>;
}

function create(view: ReturnType<typeof render>) {
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Test article' } });
  fireEvent.change(view.getByLabelText('Summary'), { target: { value: 'A summary' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.removeItem(articleEditorPreferenceKey);
  vi.mocked(createContent).mockResolvedValue(saved);
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
});
afterEach(() => { vi.restoreAllMocks(); });

test.each(['blog', 'typst-blog'] as const)('%s defaults to Online and opens the new exact project before publication activation', async (mode) => {
  const close = vi.fn();
  const view = render(dialog(mode, close));
  expect((view.getByRole('combobox', { name: 'Editor' }) as HTMLSelectElement).value).toBe('online');
  create(view);
  await waitFor(() => expect(openOnlineEditorProject).toHaveBeenCalledWith('a', '622'));
  expect(openGiteaPath).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

test.each(['blog', 'typst-blog'] as const)('%s can choose Git without changing its creation payload', async (mode) => {
  const view = render(dialog(mode));
  fireEvent.change(view.getByRole('combobox', { name: 'Editor' }), { target: { value: 'git' } });
  create(view);
  await waitFor(() => expect(openGiteaPath).toHaveBeenCalledWith('a', '622'));
  expect(openOnlineEditorProject).not.toHaveBeenCalled();
  expect(createContent).toHaveBeenCalledWith(expect.objectContaining({ type: 'blog', editor: mode === 'blog' ? 'rin' : 'typst' }));
});

test('shares and remembers the last choice across article formats and dialog remounts', () => {
  const first = render(dialog('blog'));
  fireEvent.change(first.getByRole('combobox', { name: 'Editor' }), { target: { value: 'git' } });
  first.unmount();
  const second = render(dialog('typst-blog'));
  expect((second.getByRole('combobox', { name: 'Editor' }) as HTMLSelectElement).value).toBe('git');
  fireEvent.change(second.getByRole('combobox', { name: 'Editor' }), { target: { value: 'online' } });
  second.unmount();
  const third = render(dialog('blog'));
  expect((third.getByRole('combobox', { name: 'Editor' }) as HTMLSelectElement).value).toBe('online');
});

test('does not add the article preference selector to book creation', () => {
  const view = render(<MemoryRouter><PublishCreateDialog open mode="latex-book" user={{ id: 'author-1' }} onClose={vi.fn()} /></MemoryRouter>);
  expect(view.queryByRole('combobox', { name: 'Editor' })).toBeNull();
});

test('moderation never opens an editor or repository', async () => {
  vi.mocked(createContent).mockResolvedValue({ submissionId: 'review-1', state: 'manual_review_pending', message: '' });
  const view = render(dialog('blog'));
  create(view);
  await waitFor(() => expect(view.getByRole('status').textContent).toBe('Content submitted for review.'));
  expect(openOnlineEditorProject).not.toHaveBeenCalled();
  expect(openGiteaPath).not.toHaveBeenCalled();
});

test('failed creation keeps the dialog and preference without navigating', async () => {
  vi.mocked(createContent).mockRejectedValue(new Error('Unavailable'));
  const close = vi.fn(), view = render(dialog('blog', close));
  fireEvent.change(view.getByRole('combobox', { name: 'Editor' }), { target: { value: 'git' } });
  create(view);
  await view.findByRole('alert');
  expect(close).not.toHaveBeenCalled();
  expect(openOnlineEditorProject).not.toHaveBeenCalled();
  expect(openGiteaPath).not.toHaveBeenCalled();
  expect(localStorage.getItem(articleEditorPreferenceKey)).toBe('git');
});

test('disables changing the destination while creation is in progress', async () => {
  let complete: ((value: PostDetail) => void) | undefined;
  vi.mocked(createContent).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const view = render(dialog('blog'));
  create(view);
  expect((view.getByRole('combobox', { name: 'Editor' }) as HTMLSelectElement).disabled).toBe(true);
  await act(async () => { complete?.(saved); });
});

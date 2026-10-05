import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { createContent } from '@/services/domains/article';
import { openGiteaPath } from '@/utils/giteaPaths';

import PublishCreateDialog from './PublishCreateDialog';

vi.mock('./typstFeature', () => ({ typstCreationEnabled: true }));
vi.mock('@/components/TagPicker', () => ({ default: () => <input aria-label="tag-picker" /> }));
vi.mock('@/components/ImageCropDialog', () => ({ default: () => null }));
vi.mock('@/services/domains/article', () => ({ createContent: vi.fn(), isContentModerationSubmission: () => false }));
vi.mock('@/services/domains/publication', () => ({ uploadAnswerFile: vi.fn() }));
vi.mock('@/services/profile', () => ({ uploadCoverFile: vi.fn() }));
vi.mock('@/utils/pdfToc', () => ({ extractPDFTOC: vi.fn(), renderPDFCover: vi.fn() }));
vi.mock('@/utils/giteaPaths', () => ({ openGiteaPath: vi.fn() }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

beforeEach(async () => {
  vi.mocked(createContent).mockReset();
  vi.mocked(openGiteaPath).mockReset();
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => { await i18n.changeLanguage('en'); });
});

test('Typst blog creation selects the Typst source format and opens its repository', async () => {
  vi.mocked(createContent).mockResolvedValue({ id: '71', title: 'A Typst article' } as never);
  const view = render(<MemoryRouter><PublishCreateDialog open mode="typst-blog" user={{ id: 'author-1' }} onClose={() => {}} /></MemoryRouter>);
  expect(await view.findByRole('heading', { name: 'Create Typst article' })).toBeTruthy();
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'A Typst article' } });
  fireEvent.change(view.getByLabelText('Summary'), { target: { value: 'The summary' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));
  await waitFor(() => expect(createContent).toHaveBeenCalledWith(expect.objectContaining({ editor: 'typst', body: '', type: 'blog' })));
  await waitFor(() => expect(openGiteaPath).toHaveBeenCalledWith('a', '71'));
});

test('Typst book creation selects the Typst template and opens the book workspace', async () => {
  vi.mocked(createContent).mockResolvedValue({ id: '72', title: 'A Typst book' } as never);
  const view = render(<MemoryRouter><LocationProbe /><PublishCreateDialog open mode="typst-book" user={{ id: 'author-1' }} onClose={() => {}} /></MemoryRouter>);
  expect(await view.findByRole('heading', { name: 'Create Typst book' })).toBeTruthy();
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'A Typst book' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));
  await waitFor(() => expect(createContent).toHaveBeenCalledWith(expect.objectContaining({ type: 'book', book: expect.objectContaining({ kind: 'typst' }) })));
  await waitFor(() => expect(view.getByTestId('location').textContent).toBe('/books/72/workspace'));
});

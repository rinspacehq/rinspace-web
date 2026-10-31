import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n';
import ReaderPdfPage from './index';

vi.mock('@/features/reader/storage', () => ({
  getReaderDocument: vi.fn(async () => ({ id: 'local-document', title: 'Sample.pdf', contentVersion: 'sample' })),
  getReaderThumbnail: vi.fn(), markReaderOpened: vi.fn(), registerReaderDocument: vi.fn(),
  saveReaderProgress: vi.fn(), saveReaderThumbnail: vi.fn(),
}));
vi.mock('@/features/reader/files', () => ({
  resolveReaderFile: vi.fn(async () => undefined), chooseReaderPdf: vi.fn(), identifyReaderFile: vi.fn(),
}));
vi.mock('@/features/reader/agentHost', () => ({ createReaderAgentHost: vi.fn() }));

afterEach(cleanup);

it('loads the Reader namespace on a fresh direct PDF visit without a previous library page', async () => {
  i18n.removeResourceBundle('zh-CN', 'reader');
  i18n.removeResourceBundle('en', 'reader');
  await i18n.changeLanguage('zh-CN');
  render(<MemoryRouter><ReaderPdfPage /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: '重新选择 PDF' })).toBeTruthy();
  expect(screen.getByText('请重新选择这份 PDF 继续阅读')).toBeTruthy();
  expect(screen.queryByText('library.reselect')).toBeNull();
});

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { FeedItem } from '@/services/contracts';

const adminApi = vi.hoisted(() => ({
  adminDeleteContent: vi.fn(),
  adminUpdateAnswerStatus: vi.fn(),
  adminUpdateContentStatus: vi.fn(),
  adminUpdateContentTags: vi.fn(),
  adminUpdateQuestionStatus: vi.fn(),
  adminUpdateUserStatus: vi.fn(),
  loadAdminAnswerPage: vi.fn(),
  loadAdminContentPage: vi.fn(),
  loadAdminQuestionPage: vi.fn(),
  loadAdminUserPage: vi.fn(),
}));
const groupApi = vi.hoisted(() => ({ loadCultivationPermissions: vi.fn(), updateCultivationPermissions: vi.fn() }));
const questionApi = vi.hoisted(() => ({ operateQuestion: vi.fn(), reopenQuestion: vi.fn() }));
const tagApi = vi.hoisted(() => ({ deleteTag: vi.fn(), loadTagPage: vi.fn() }));

vi.mock('@/services/domains/admin', () => adminApi);
vi.mock('@/services/domains/group', () => groupApi);
vi.mock('@/services/domains/question', () => questionApi);
vi.mock('@/services/domains/tag', () => tagApi);

import { AdminContentManagement } from './index';

const blog: FeedItem = {
  id: 'blog-7',
  type: 'blog',
  title: '待删除文章',
  author: 'Rin Author',
  authorId: 'author-1',
  createdAt: '2026-09-20T08:00:00Z',
  updatedAt: '2026-09-20T08:00:00Z',
  meta: '文章',
  excerpt: '待删除正文摘要',
  tags: ['analysis'],
  interactions: '12 阅读',
  heat: '',
  publishStatus: 'published',
  repositoryStatus: 'published',
  sourceVisibility: 'open',
};

async function switchLanguage(language: 'en' | 'zh-CN') {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

beforeAll(async () => {
  await ensureLocaleNamespaces('en', ['admin', 'identity']);
  await ensureLocaleNamespaces('zh-CN', ['admin', 'identity']);
});

beforeEach(async () => {
  await switchLanguage('zh-CN');
  adminApi.loadAdminContentPage.mockReset();
  adminApi.loadAdminContentPage.mockResolvedValue({ count: 1, items: [blog] });
});

afterEach(async () => {
  vi.clearAllMocks();
  await switchLanguage('zh-CN');
});

describe('AdminContentManagement localization', () => {
  it('keeps active content and retires legacy tabs across a live language switch', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminContentManagement isAdmin section="blogs" onSectionChange={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '待删除文章' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: '问答' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '回答' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '讨论' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '动态' })).toBeNull();

    await switchLanguage('en');

    expect(screen.getByRole('tab', { name: 'Articles' }).getAttribute('data-state')).toBe('active');
    expect(screen.getByRole('heading', { name: '待删除文章' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Q&A' })).toBeNull();
  });

  it('deletes managed content after confirmation without opening step-up verification', async () => {
    const user = userEvent.setup();
    adminApi.loadAdminContentPage.mockResolvedValue({ count: 1, items: [blog] });
    adminApi.adminDeleteContent.mockResolvedValue({
      id: blog.id,
      status: 'deleted',
      repositoryStatus: 'deleted',
      sourceVisibility: 'private',
      item: blog,
    });
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminContentManagement isAdmin section="blogs" onSectionChange={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '待删除文章' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '删除' }));
    await user.click(await screen.findByRole('button', { name: '确认删除' }));

    expect(adminApi.adminDeleteContent).toHaveBeenCalledWith({ id: 'blog-7', type: 'blog' });
    expect(screen.queryByRole('heading', { name: '待删除文章' })).toBeNull();
  });
});

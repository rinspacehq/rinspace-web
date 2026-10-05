import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { AdminQuestionInfo, FeedItem } from '@/services/contracts';

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

const question: AdminQuestionInfo = {
  id: 'question-1',
  title: '作者保留题目标题',
  vote_count: 1234,
  show: 1,
  pin: 0,
  answer_count: 2,
  accepted_answer_id: '',
  create_time: Date.parse('2026-08-28T08:00:00Z') / 1000,
  update_time: Date.parse('2026-08-28T08:10:00Z') / 1000,
  edit_time: 0,
  status: 'available',
  tags: ['projective morphism'],
};

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
  adminApi.loadAdminQuestionPage.mockReset();
  adminApi.loadAdminQuestionPage.mockResolvedValue({ count: 1, items: [question] });
});

afterEach(async () => {
  vi.clearAllMocks();
  await switchLanguage('zh-CN');
});

describe('AdminContentManagement localization', () => {
  it('keeps the active section, filter draft, and authored values across a live language switch', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminContentManagement isAdmin={false} section="questions" onSectionChange={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '作者保留题目标题' })).toBeTruthy();
    const search = screen.getByRole('textbox', { name: '搜索题目' }) as HTMLInputElement;
    await user.type(search, '保留筛选条件');
    expect(screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent?.includes('1,234 个赞') === true)).toBeTruthy();

    await switchLanguage('en');

    expect(screen.getByRole('tab', { name: 'Q&A' }).getAttribute('data-state')).toBe('active');
    expect((screen.getByRole('textbox', { name: 'Search questions' }) as HTMLInputElement).value).toBe('保留筛选条件');
    expect(screen.getByRole('heading', { name: '作者保留题目标题' })).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent?.includes('1,234 votes') === true)).toBeTruthy();
    expect(screen.getByText('projective morphism')).toBeTruthy();
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

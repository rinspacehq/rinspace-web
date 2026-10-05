import { act, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { CurrentUserInfo, FeedItem } from '@/services/contracts';
import { deleteContent, loadContentDetail, loadContentFeed } from '@/services/domains/article';
import { loadCreatorContributions } from '@/services/domains/creator';
import { loadCurrentUserInfo, loadPersonalQuestionPage } from '@/services/domains/identity';
import { loadCreatorAnalytics } from '@/features/content-analytics/api';
import ContentAnalyticsDashboard from '@/features/content-analytics/ContentAnalyticsDashboard';
import CreatorContributionHeatmap from './CreatorContributionHeatmap';
import CreatorPage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/UserIdentity', () => ({ default: () => null }));
vi.mock('@/components/TagPicker', () => ({
  default: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
  splitTagValues: (value: string) => value.split(/[,\s]+/).filter(Boolean),
  joinTagValues: (values: string[]) => values.join(', '),
}));
vi.mock('@/services/domains/article', () => ({
  deleteContent: vi.fn(),
  loadContentDetail: vi.fn(),
  loadContentFeed: vi.fn(),
  updateContent: vi.fn(),
}));
vi.mock('@/services/domains/book', () => ({ openBookCodeWorkspace: vi.fn() }));
vi.mock('@/services/domains/creator', () => ({
  cachedCreatorContributions: vi.fn(() => null),
  loadCreatorContributions: vi.fn(),
}));
vi.mock('@/services/domains/identity', () => ({
  loadCurrentUserInfo: vi.fn(),
  loadPersonalQuestionPage: vi.fn(),
}));
vi.mock('@/services/domains/publication', () => ({ openArticleCodeWorkspace: vi.fn() }));
vi.mock('@/services/domains/question', () => ({
  deleteQuestion: vi.fn(),
  loadQuestionDetail: vi.fn(),
  updateQuestion: vi.fn(),
}));
vi.mock('@/features/content-analytics/api', () => ({
  cachedCreatorAnalytics: vi.fn(() => null),
  loadCreatorAnalytics: vi.fn(),
}));

const currentUser: CurrentUserInfo = {
  id: 'creator-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: 1,
  username: 'rin-creator',
  display_name: 'Rin Creator',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  about_html: '',
  language: 'en',
  color_scheme: 'light',
  access_token: '',
  role_id: 1,
  role_name: 'member',
  rank: 12,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const discussion: FeedItem = {
  id: 'discussion-1',
  type: 'discussion',
  title: '保留作者标题',
  author: 'Rin Creator',
  authorId: 'creator-1',
  createdAt: '2026-08-27T08:00:00Z',
  updatedAt: '2026-08-28T08:30:00Z',
  meta: '讨论 · 昨天',
  excerpt: 'Author-written excerpt',
  tags: ['geometry'],
  interactions: '12 阅读',
  heat: '',
  publishStatus: 'published',
  repositoryStatus: 'published',
  sourceVisibility: 'open',
};

const analytics = {
  granularity: 'week' as const,
  period: '2026-W35',
  start: '2026-08-24',
  end: '2026-08-31',
  cumulativeReads: 12_345,
  periodReads: 18,
  readHistoryStart: '2026-08-24',
  topWorks: [{
    id: 'blog-1',
    slug: 'authored-work',
    title: '作者作品',
    contentType: 'blog',
    reads: 18,
  }],
  points: [{
    key: '2026-08-24',
    label: '服务端中文标签',
    reads: 18,
    likes: 3,
    favorites: 2,
    newFollowers: 1,
  }],
};

function shell(children: ReactNode, path = '/creator') {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(loadCurrentUserInfo).mockResolvedValue(currentUser);
  vi.mocked(loadContentFeed).mockImplementation(async (input) => ({
    items: input?.type === 'forum' ? [discussion] : [],
    count: input?.type === 'forum' ? 1 : 0,
    page: 1,
    pageSize: 50,
    generatedAt: '2026-08-28T09:00:00Z',
  }));
  vi.mocked(loadPersonalQuestionPage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadContentDetail).mockResolvedValue({
    ...discussion,
    slug: 'authored-discussion',
    body: '尚未保存的讨论正文',
    readCount: 12,
    collected: false,
    createdAt: '2026-08-27T08:00:00Z',
    updatedAt: '2026-08-28T08:30:00Z',
  });
  vi.mocked(loadCreatorAnalytics).mockResolvedValue(analytics);
  vi.mocked(loadCreatorContributions).mockResolvedValue([
    {
      timestamp: Date.parse('2026-08-24T00:00:00Z') / 1000,
      contributions: 4,
    },
  ]);
});

afterEach(async () => {
  vi.clearAllMocks();
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

describe('Creator Center localization', () => {
  it('keeps an inline edit draft while translating content management in place', async () => {
    await ensureLocaleNamespaces('en', ['creator']);
    await ensureLocaleNamespaces('zh-CN', ['creator']);
    await act(async () => {
      await i18n.changeLanguage('en');
    });

    const view = shell(<CreatorPage />, '/creator?view=content&type=discussion');
    expect(await view.findByRole('tab', { name: /Discussions/ })).toBeTruthy();
    expect(view.getByText('保留作者标题')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Edit' }));
    const title = await view.findByLabelText('Title');
    fireEvent.change(title, { target: { value: '未保存的新标题' } });

    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });

    expect(view.getByText('内容管理')).toBeTruthy();
    expect((view.getByLabelText('标题') as HTMLInputElement).value).toBe('未保存的新标题');
    expect(document.title).toBe('内容管理 - 芥子环');
  });

  it('formats analytics from structured keys and retains metric visibility', async () => {
    await ensureLocaleNamespaces('en', ['creator']);
    await ensureLocaleNamespaces('zh-CN', ['creator']);
    await act(async () => {
      await i18n.changeLanguage('en');
    });

    const view = shell(
      <ContentAnalyticsDashboard
        userId="creator-1"
        granularity="week"
        period="2026-W35"
        createdAt={currentUser.created_at}
        onGranularityChange={() => undefined}
        onPeriodChange={() => undefined}
      />,
    );
    expect(await view.findByText('Total reads')).toBeTruthy();
    expect(await view.findByText('12,345', {}, { timeout: 5_000 })).toBeTruthy();
    expect(await view.findByText('Mon', {}, { timeout: 5_000 })).toBeTruthy();
    expect(view.queryByText('服务端中文标签')).toBeNull();
    const likes = view.getByRole('button', { name: /Likes 3/ });
    fireEvent.click(likes);
    expect(likes.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });

    expect(await view.findByText('累计阅读')).toBeTruthy();
    expect(view.getByRole('button', { name: /点赞数 3/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('localizes contribution counts and calendar labels', async () => {
    await ensureLocaleNamespaces('en', ['creator']);
    await ensureLocaleNamespaces('zh-CN', ['creator']);
    await act(async () => {
      await i18n.changeLanguage('en');
    });

    const view = shell(<CreatorContributionHeatmap username="rin-creator" />);
    expect(await view.findByRole('img', { name: '4 contributions in the past year' })).toBeTruthy();
    expect(view.getByText('Less')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });

    expect(await view.findByRole('img', { name: '一年内 4 次贡献' })).toBeTruthy();
    expect(view.getByText('少')).toBeTruthy();
  });

  it('deletes creator content after the confirmation dialog without a verification step', async () => {
    const view = shell(<CreatorPage />, '/creator?view=content&type=discussion');
    expect(await view.findByText('保留作者标题')).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: '删除' }));
    fireEvent.click(await view.findByRole('button', { name: '确认删除' }));

    await act(async () => undefined);
    expect(deleteContent).toHaveBeenCalledWith('discussion-1');
    expect(view.queryByText('保留作者标题')).toBeNull();
  });
});

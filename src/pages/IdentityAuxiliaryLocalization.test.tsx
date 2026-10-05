import { act, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { CurrentUserInfo } from '@/services/contracts';
import {
  loadBadgeAwardsPage,
  loadBadgeInfo,
  loadBadges,
  loadCurrentUserInfo,
  loadPersonalAnswerPage,
  loadPersonalCollectionPage,
  loadPersonalCommentPage,
  loadPersonalFollowPage,
  loadPersonalQuestionPage,
  loadPersonalUserInfo,
  loadPersonalVotePage,
} from '@/services/domains/identity';
import {
  loadNotificationPage,
  loadNotificationStatus,
} from '@/services/domains/notification';
import { loadActivityTimeline } from '@/services/domains/activity';
import ActivityTimelinePage from './ActivityTimeline';
import BadgesPage from './Badges';
import MePage from './Me';
import NotificationsPage from './Notifications';
import ProfileRankPage from './ProfileRank';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/SiteIcpLink', () => ({ default: () => null }));
vi.mock('@/components/AvatarName', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock('@/services/domains/identity', () => ({
  loadBadgeAwardsPage: vi.fn(),
  loadBadgeInfo: vi.fn(),
  loadBadges: vi.fn(),
  loadCurrentUserInfo: vi.fn(),
  loadPersonalAnswerPage: vi.fn(),
  loadPersonalCollectionPage: vi.fn(),
  loadPersonalCommentPage: vi.fn(),
  loadPersonalFollowPage: vi.fn(),
  loadPersonalQuestionPage: vi.fn(),
  loadPersonalUserInfo: vi.fn(),
  loadPersonalVotePage: vi.fn(),
}));
vi.mock('@/services/domains/notification', () => ({
  loadNotificationPage: vi.fn(),
  loadNotificationStatus: vi.fn(),
  markAllNotificationReadState: vi.fn(),
  markNotificationReadState: vi.fn(),
  notifyNotificationStateChanged: vi.fn(),
}));
vi.mock('@/services/domains/activity', () => ({
  loadActivityTimeline: vi.fn(),
  loadActivityTimelineDetail: vi.fn(),
}));

const currentUser: CurrentUserInfo = {
  id: 'identity-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'identity-user',
  display_name: '作者保留姓名',
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
  rank: 125,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

function shell(children: ReactNode, path: string, routePattern = '*') {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path={routePattern} element={children} /></Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

async function switchLanguage(language: 'en' | 'zh-CN') {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

beforeEach(() => {
  vi.mocked(loadCurrentUserInfo).mockResolvedValue(currentUser);
  vi.mocked(loadPersonalCollectionPage).mockResolvedValue({
    items: [],
    count: 0,
    page: 1,
    pageSize: 8,
    generatedAt: '2026-08-28T09:00:00Z',
  });
  vi.mocked(loadPersonalFollowPage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadPersonalQuestionPage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadPersonalAnswerPage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadPersonalCommentPage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadPersonalVotePage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadBadges).mockResolvedValue([{
    group_name: '作者定义分组',
    badges: [{
      id: 'badge-1',
      name: '作者定义徽章名',
      icon: 'answer',
      award_count: 2,
      earned: false,
      level: 2,
    }],
  }]);
  vi.mocked(loadBadgeInfo).mockResolvedValue({
    id: 'badge-1',
    name: '作者定义徽章名',
    description: '作者定义徽章说明',
    icon: 'answer',
    award_count: 2,
    earned: false,
    level: 2,
    is_single: false,
  });
  vi.mocked(loadBadgeAwardsPage).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(loadPersonalUserInfo).mockResolvedValue({
    id: 'identity-1',
    created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
    last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
    username: 'identity-user',
    follow_count: 0,
    following_count: 0,
    answer_count: 0,
    question_count: 0,
    rank: 125,
    display_name: '作者保留姓名',
    avatar: '',
    cover_url: '',
    mobile: '',
    bio: '',
    bio_html: '',
    website: '',
    location: '',
    about_html: '',
    status: 'available',
    suspended_until: 0,
    is_follower: false,
  });
  vi.mocked(loadNotificationPage).mockResolvedValue({
    count: 1,
    page: 1,
    pageSize: 12,
    items: [{
      id: 'notification-1',
      userInfo: {
        id: 'author-1',
        username: 'author-one',
        displayName: 'Author One',
        avatar: '',
      },
      objectInfo: {
        title: '作者保留题目',
        objectId: 'question-1',
        objectMap: { question: 'question-1' },
        objectType: 'question',
      },
      rank: 1,
      actorKind: 'user',
      notificationAction: 'comment',
      isRead: false,
      updateTime: Date.parse('2026-08-28T08:00:00Z') / 1000,
      type: 'comment',
      targetType: 'question',
      targetId: 'question-1',
      message: '不应显示的后端中文消息',
    }],
  });
  vi.mocked(loadNotificationStatus).mockResolvedValue({
    inbox: 1,
    system: 0,
    achievement: 0,
    revision: 0,
    canRevision: false,
  });
  vi.mocked(loadActivityTimeline).mockResolvedValue({
    objectInfo: null,
    timeline: [],
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  await switchLanguage('zh-CN');
});

describe('identity auxiliary localization', () => {
  it('switches My Space without translating the account name or adding prompt copy', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = shell(<MePage />, '/me');
    expect(await view.findByText('Bookmarks, follows, and votes')).toBeTruthy();
    expect(view.getByText('作者保留姓名')).toBeTruthy();
    expect(view.getByText('No public questions yet.')).toBeTruthy();

    await switchLanguage('zh-CN');

    expect(view.getByText('收藏、关注与投票')).toBeTruthy();
    expect(view.getByText('作者保留姓名')).toBeTruthy();
    expect(view.queryByText(/首页编辑器/)).toBeNull();
  });

  it('keeps the notification filter while rebuilding product sentences from structured fields', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = shell(<NotificationsPage />, '/notifications');
    expect(await view.findByText('Author One commented on your Question')).toBeTruthy();
    expect(view.queryByText('不应显示的后端中文消息')).toBeNull();
    const contentFilter = view.getByRole('button', { name: 'Content' });
    fireEvent.click(contentFilter);
    expect(contentFilter.classList.contains('active')).toBe(true);

    await switchLanguage('zh-CN');

    expect(view.getByText('Author One 评论了你的题目')).toBeTruthy();
    expect(view.getByRole('button', { name: '内容' }).classList.contains('active')).toBe(true);
  });

  it('uses structured report outcomes instead of localized server messages', async () => {
    vi.mocked(loadNotificationPage).mockResolvedValue({
      count: 1,
      page: 1,
      pageSize: 12,
      items: [{
        id: 'notification-report-1',
        objectInfo: {
          title: '作者保留举报对象',
          objectId: 'comment-1',
          objectMap: { comment: 'comment-1' },
          objectType: 'comment',
        },
        rank: 0,
        actorKind: 'system',
        notificationAction: 'report_resolved',
        isRead: true,
        updateTime: Date.parse('2026-08-28T08:00:00Z') / 1000,
        type: 'report',
        targetType: 'comment',
        targetId: 'comment-1',
        message: '你举报的内容已处理。',
        reportResult: {
          outcome: 'action_taken',
          reportId: '73',
          targetType: 'comment',
          targetSummary: '作者保留举报对象',
          targetAvailable: false,
        },
      }],
    });
    await ensureLocaleNamespaces('en', ['identity']);
    await switchLanguage('en');

    const view = shell(<NotificationsPage />, '/notifications');
    fireEvent.click(await view.findByRole('button', { name: /System notifications/ }));
    expect(await view.findByText('The content you reported has been handled.')).toBeTruthy();
    expect(view.queryByText('你举报的内容已处理。')).toBeNull();
    expect(view.getByText('作者保留举报对象')).toBeTruthy();
  });

  it('localizes wallet delivery notifications without exposing server copy or fiat amounts', async () => {
    vi.mocked(loadNotificationPage).mockResolvedValue({
      count: 2,
      page: 1,
      pageSize: 12,
      items: [{
        id: 'notification-wallet-tip',
        userInfo: {
          id: 'reader-1',
          username: 'reader-one',
          displayName: 'Reader One',
          avatar: '',
        },
        objectInfo: {
          title: '作者保留作品名',
          objectId: '73',
          objectMap: { blog: '73' },
          objectType: 'blog',
        },
        rank: 0,
        actorKind: 'user',
        notificationAction: 'wallet_tip_received',
        isRead: false,
        updateTime: Date.parse('2026-08-28T08:00:00Z') / 1000,
        type: 'wallet_tip_received',
        targetType: 'blog',
        targetId: '73',
        message: '服务端金额 ¥7.00',
      }, {
        id: 'notification-wallet-recharge',
        objectInfo: {
          title: 'wallet',
          objectId: '11111111-1111-4111-8111-111111111111',
          objectMap: { wallet: '11111111-1111-4111-8111-111111111111' },
          objectType: 'wallet',
        },
        rank: 0,
        actorKind: 'system',
        notificationAction: 'wallet_recharge_completed',
        isRead: false,
        updateTime: Date.parse('2026-08-28T08:00:00Z') / 1000,
        type: 'wallet_recharge_completed',
        targetType: 'wallet',
        targetId: '11111111-1111-4111-8111-111111111111',
        href: '/wallet?view=statements',
      }],
    });
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = shell(<NotificationsPage />, '/notifications');
    expect(await view.findByText('Reader One tipped your work.')).toBeTruthy();
    expect(view.getByText('Your top-up is available.')).toBeTruthy();
    expect(view.getByText('Shangong wallet')).toBeTruthy();
    expect(view.queryByText(/¥7\.00/)).toBeNull();
    expect(view.getByRole('link', { name: 'Shangong wallet' }).getAttribute('href')).toBe('/wallet?view=statements');

    await switchLanguage('zh-CN');

    expect(view.getByText('Reader One 打赏了你的作品。')).toBeTruthy();
    expect(view.getByText('充值已到账。')).toBeTruthy();
    expect(view.getByText('善功钱包')).toBeTruthy();
    expect(view.queryByText(/人民币|¥/)).toBeNull();
  });

  it('retains an unsent activity lookup across a live language switch', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = shell(<ActivityTimelinePage />, '/activity?object_type=question&object_id=3');
    const input = await view.findByLabelText('Object ID');
    fireEvent.change(input, { target: { value: '987' } });

    await switchLanguage('zh-CN');

    expect((view.getByLabelText('对象 ID') as HTMLInputElement).value).toBe('987');
    expect(view.getByRole('button', { name: /查看历史/ })).toBeTruthy();
  });

  it('translates the badge directory while preserving administrator-authored badge text', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = shell(<BadgesPage />, '/badges');
    expect(await view.findByText('Hall of honor')).toBeTruthy();
    expect((await view.findAllByText('作者定义徽章名')).length).toBeGreaterThan(0);

    await switchLanguage('zh-CN');

    expect(view.getByText('荣誉墙')).toBeTruthy();
    expect(view.getAllByText('作者定义徽章名').length).toBeGreaterThan(0);
  });

  it('renders cultivation names and values in the resolved locale', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = shell(<ProfileRankPage />, '/identity-user/rank', '/:username/rank');
    expect(await view.findByRole('img', { name: /Qi Refining — Layer 3 · 125 reputation/ })).toBeTruthy();
    expect(view.getAllByText('Qi Refining — Layer 3').length).toBeGreaterThan(0);

    await switchLanguage('zh-CN');

    expect(await view.findByRole('img', { name: /炼气期三层 · 125 修为/ })).toBeTruthy();
    expect(view.getAllByText('炼气期三层').length).toBeGreaterThan(0);
  });
});

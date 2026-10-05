import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { CurrentUserInfo, FeedItem } from '@/services/contracts';
import { loadKnowledgeGraph } from '@/services/domains/activity';
import { loadContentFeed } from '@/services/domains/article';
import {
  loadCollectionFolderPage,
  loadCurrentUserInfo,
  loadPersonalAnswerPage,
  loadPersonalCollectionPage,
  loadPersonalCommentPage,
  loadPersonalQATop,
  loadPersonalQuestionPage,
  loadPersonalUserInfo,
  loadUserBadgeAwards,
} from '@/services/domains/identity';
import { loadMastodonAccountStatuses } from '@/services/mastodonSocial';
import { getCurrentUser, loadProfile } from '@/services/profile';
import ProfilePage from './index';

let resolvedTheme: 'light' | 'dark' = 'light';

vi.mock('@/app/providers/ThemeProvider', () => ({
  useTheme: () => ({ resolved: resolvedTheme }),
}));
vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/CodeMirrorEditor', () => ({
  default: ({ ariaLabel, id, onChange, value }: {
    ariaLabel: string;
    id: string;
    onChange: (value: string) => void;
    value: string;
  }) => <textarea aria-label={ariaLabel} id={id} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock('@/services/domains/activity', () => ({ loadKnowledgeGraph: vi.fn() }));
vi.mock('@/services/domains/article', () => ({ loadContentFeed: vi.fn() }));
vi.mock('@/services/domains/discussion', () => ({
  followTarget: vi.fn(),
  switchCollection: vi.fn(),
}));
vi.mock('@/services/domains/identity', () => ({
  createCollectionFolder: vi.fn(),
  deleteCollectionFolder: vi.fn(),
  loadCollectionFolderPage: vi.fn(),
  loadCurrentUserInfo: vi.fn(),
  loadPersonalAnswerPage: vi.fn(),
  loadPersonalCollectionPage: vi.fn(),
  loadPersonalCommentPage: vi.fn(),
  loadPersonalQATop: vi.fn(),
  loadPersonalQuestionPage: vi.fn(),
  loadPersonalUserInfo: vi.fn(),
  loadUserBadgeAwards: vi.fn(),
  loadUserRelations: vi.fn(),
  moveCollectionItem: vi.fn(),
  moveWorkItem: vi.fn(),
  updateCollectionFolder: vi.fn(),
  updateCurrentUserInfo: vi.fn(),
}));
vi.mock('@/services/profile', () => ({
  getCurrentUser: vi.fn(),
  loadProfile: vi.fn(),
  saveProfile: vi.fn(),
  uploadAvatarFile: vi.fn(),
  uploadCoverFile: vi.fn(),
}));
const typstFeatureState = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/features/publish/typstFeature', () => ({
  get typstCreationEnabled() {
    return typstFeatureState.enabled;
  },
}));

vi.mock('@/services/mastodonSocial', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/mastodonSocial')>();
  return {
    ...original,
    loadMastodonAccountStatuses: vi.fn(),
  };
});

const currentUser: CurrentUserInfo = {
  id: 'profile-user-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'profile-user',
  display_name: '作者保留姓名',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '作者保留简介',
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

const authoredBlog: FeedItem = {
  id: 'blog-1',
  type: 'blog',
  title: '作者保留文章标题',
  author: '作者保留姓名',
  createdAt: '2026-08-28T08:00:00Z',
  meta: '不应显示的服务端中文元数据',
  excerpt: '作者保留摘要',
  tags: [],
  interactions: '不应显示的服务端中文交互',
  heat: '',
  readCount: 1234,
  likeCount: 2,
  favoriteCount: 1,
};

async function switchLanguage(language: 'en' | 'zh-CN') {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

const publicProfile = {
  id: 'profile-user-1',
  created_at: currentUser.created_at,
  last_login_date: currentUser.last_login_date,
  username: 'profile-user',
  follow_count: 8,
  following_count: 5,
  answer_count: 0,
  question_count: 0,
  rank: 125,
  display_name: '作者保留姓名',
  avatar: '',
  cover_url: '',
  mobile: '',
  bio: '作者保留简介',
  bio_html: '',
  website: 'https://orbit-reader.example/notes',
  location: '',
  about_html: '',
  status: 'available',
  suspended_until: 0,
  is_follower: false,
};

beforeEach(() => {
  vi.mocked(loadPersonalUserInfo).mockResolvedValue(publicProfile);
  vi.mocked(loadPersonalQATop).mockResolvedValue({ answer: [], question: [] });
  vi.mocked(loadPersonalQuestionPage).mockResolvedValue({ count: 0, items: [] });
  vi.mocked(loadPersonalAnswerPage).mockResolvedValue({ count: 0, items: [] });
  vi.mocked(loadPersonalCommentPage).mockResolvedValue({ count: 0, items: [] });
  vi.mocked(loadUserBadgeAwards).mockResolvedValue({ count: 0, items: [] });
  vi.mocked(loadPersonalCollectionPage).mockResolvedValue({
    count: 0,
    page: 1,
    pageSize: 6,
    generatedAt: '2026-08-28T09:00:00Z',
    items: [],
  });
  vi.mocked(loadContentFeed).mockImplementation(async (input) => ({
    count: input?.type === 'blog' ? 1 : 0,
    page: 1,
    pageSize: 20,
    generatedAt: '2026-08-28T09:00:00Z',
    items: input?.type === 'blog' ? [authoredBlog] : [],
  }));
  vi.mocked(loadKnowledgeGraph).mockResolvedValue({ nodes: [], edges: [], generatedAt: '' });
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'profile-user-1', username: 'profile-user' });
  vi.mocked(loadCurrentUserInfo).mockResolvedValue(currentUser);
  vi.mocked(loadProfile).mockResolvedValue({
    nickname: '作者保留姓名',
    avatarDataUrl: '',
    coverUrl: '',
    aboutHtml: '',
  });
  vi.mocked(loadMastodonAccountStatuses).mockResolvedValue({
    accountId: 'mastodon-account-1',
    nextMaxId: null,
    items: [{
      id: '7001',
      url: '/p/7001',
      content: '<p>真实里世界推文</p>',
      spoilerText: '',
      visibility: 'public',
      language: 'zh-CN',
      createdAt: '2026-09-07T10:00:00Z',
      repliesCount: 2,
      reblogsCount: 3,
      favouritesCount: 4,
      media: [],
    }],
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  resolvedTheme = 'light';
  typstFeatureState.enabled = false;
  await switchLanguage('zh-CN');
});

describe('Profile localization', () => {
  it('injects dark theme styles after non-empty about document styles', async () => {
    resolvedTheme = 'dark';
    vi.mocked(loadPersonalUserInfo).mockResolvedValue({
      id: 'profile-user-1',
      created_at: currentUser.created_at,
      last_login_date: currentUser.last_login_date,
      username: 'profile-user',
      follow_count: 8,
      following_count: 5,
      answer_count: 0,
      question_count: 0,
      rank: 125,
      display_name: '作者保留姓名',
      avatar: '',
      cover_url: '',
      mobile: '',
      bio: '作者保留简介',
      bio_html: '',
      website: '',
      location: '',
      about_html: [
        '<!doctype html><html><head><style>body{background:#fff}</style></head>',
        '<body><p>把复杂问题拆成可以验证的小步骤</p></body></html>',
      ].join(''),
      status: 'available',
      suspended_until: 0,
      is_follower: false,
    });

    const view = render(
      <HelmetProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/users/profile-user']}>
            <Routes>
              <Route path="/users/:username" element={<ProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </HelmetProvider>,
    );

    expect(await view.findByText('作者保留姓名')).toBeTruthy();
    const aboutSrcDoc = view.container
      .querySelector<HTMLIFrameElement>('.profile-about-frame')?.srcdoc || '';
    expect(aboutSrcDoc).toContain('data-rin-profile-theme="dark"');
    expect(aboutSrcDoc).toContain('background:#0b1218!important');
    expect(aboutSrcDoc.indexOf('body{background:#fff}')).toBeLessThan(
      aboutSrcDoc.indexOf('data-rin-profile-theme="dark"'),
    );
  });

  it('removes the Q&A and discussion tabs and projects real Mastodon tweets', async () => {
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    const view = render(
      <HelmetProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/users/profile-user?tab=tweet']}>
            <Routes>
              <Route path="/users/:username" element={<ProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </HelmetProvider>,
    );

    expect(await view.findByText('真实里世界推文')).toBeTruthy();
    expect(view.queryByRole('tab', { name: /问答/ })).toBeNull();
    expect(view.queryByRole('tab', { name: /讨论/ })).toBeNull();
    expect(view.getByRole('tab', { name: /推文/ }).getAttribute('aria-selected')).toBe('true');
    expect(loadMastodonAccountStatuses).toHaveBeenCalledWith(
      'profile-user-1',
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('rebuilds structured metadata and keeps active and unsaved state across a live switch', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = render(
      <HelmetProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/users/profile-user']}>
            <Routes>
              <Route path="/users/:username" element={<ProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </HelmetProvider>,
    );

    expect(await view.findByText('作者保留姓名')).toBeTruthy();
    expect(view.getByText('作者保留简介')).toBeTruthy();
    const website = view.getByRole('link', { name: 'orbit-reader.example' });
    expect(website.getAttribute('href')).toBe('https://orbit-reader.example/notes');
    expect(website.getAttribute('target')).toBe('_blank');
    expect(website.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
    fireEvent.click(view.getByRole('tab', { name: /Overview/ }));
    expect(await view.findByRole('link', { name: /作者保留文章标题/ })).toBeTruthy();
    expect(view.getByText('1,234 reads · 2 likes · 1 bookmark')).toBeTruthy();
    expect(view.queryByText('不应显示的服务端中文元数据')).toBeNull();
    expect(view.queryByText('不应显示的服务端中文交互')).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Edit profile' }));
    const displayName = view.getByLabelText('Display name') as HTMLInputElement;
    fireEvent.change(displayName, { target: { value: 'Unsaved profile draft' } });

    await switchLanguage('zh-CN');

    expect((view.getByLabelText('昵称') as HTMLInputElement).value).toBe('Unsaved profile draft');
    expect(view.getByRole('button', { name: '取消编辑' })).toBeTruthy();
    expect(view.getByRole('tab', { name: /综合/ }).getAttribute('aria-selected')).toBe('true');
    expect(view.getByRole('link', { name: /作者保留文章标题/ })).toBeTruthy();
    expect(view.queryByText('不应显示的服务端中文元数据')).toBeNull();
  });
  it.each([
    'javascript:alert(document.domain)',
    'data:text/html,<p>synthetic</p>',
    'https://user:pass@orbit-reader.example/notes',
    'invalid-url',
  ])('does not render unsafe profile website protocols or credentials: %s', async (website) => {
    vi.mocked(loadPersonalUserInfo).mockResolvedValueOnce({ ...publicProfile, website });
    await ensureLocaleNamespaces('zh-CN', ['identity']);

    const view = render(
      <HelmetProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/users/profile-user']}>
            <Routes>
              <Route path="/users/:username" element={<ProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>,
      </HelmetProvider>,
    );

    expect(await view.findByText('作者保留姓名')).toBeTruthy();
    expect(view.container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(view.container.querySelector('.profile-meta-row a')).toBeNull();
  });

  it('gates Typst creation entries in the works folder menu', async () => {
    typstFeatureState.enabled = true;
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    const worksFolder = {
      id: 'works-1',
      name: '作者保留作品夹',
      scope: 'works',
      position: 0,
      itemCount: 0,
      childCount: 0,
      isDefault: true,
      systemKind: 'works',
      children: [],
      createdAt: '2026-08-28T09:00:00Z',
      updatedAt: '2026-08-28T09:00:00Z',
    };
    vi.mocked(loadCollectionFolderPage).mockResolvedValue({
      ownerUserId: 'profile-user-1',
      ownerUid: 'uid-profile-user-1',
      canManage: true,
      defaultId: worksFolder.id,
      currentId: worksFolder.id,
      folders: [worksFolder],
      tree: [worksFolder],
      breadcrumbs: [worksFolder],
      children: [worksFolder],
      items: [],
      count: 0,
    });

    const view = render(
      <HelmetProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/users/profile-user?tab=collection']}>
            <Routes>
              <Route path="/users/:username" element={<ProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </HelmetProvider>,
    );

    await waitFor(() => {
      expect(view.container.querySelector('.collection-folder-icon-card-folder')).not.toBeNull();
    });
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.contextMenu(view.container.querySelector('.collection-folder-icon-card-folder') as Element);
    await waitFor(() => {
      expect(view.getByRole('menuitem', { name: '新建文章' })).toBeTruthy();
    });
    fireEvent.click(view.getByRole('menuitem', { name: '新建文章' }));
    expect(
      view.getByRole('menuitem', { name: 'Typst' }).getAttribute('href'),
    ).toBe('/write?kind=typst&worksFolderId=works-1');
    fireEvent.click(view.getByRole('menuitem', { name: '新建书籍' }));
    expect(
      view.getByRole('menuitem', { name: 'Typst' }).getAttribute('href'),
    ).toBe('/books/new?kind=typst&worksFolderId=works-1');

    typstFeatureState.enabled = false;
  });
});

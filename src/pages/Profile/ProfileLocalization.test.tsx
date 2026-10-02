import fs from 'node:fs';
import path from 'node:path';

import { act, fireEvent, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { BootstrapProvider } from '@/app/bootstrap/context';
import { demoPersonaStorageKey } from '@/app/bootstrap/demoRuntime';
import type { BootstrapModeRuntime } from '@/app/bootstrap/types';
import { parseRuntimeConfig } from '@/app/config/runtime';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { AuthProvider } from '@/platform/auth/context';
import { assembleRuntimePorts } from '@/platform/runtime';
import type { CurrentUserInfo, FeedItem } from '@/services/contracts';
import { loadKnowledgeGraph } from '@/services/domains/activity';
import { loadContentFeed } from '@/services/domains/article';
import {
  loadCurrentUserInfo,
  loadPersonalAnswerPage,
  loadPersonalCollectionPage,
  loadPersonalCommentPage,
  loadPersonalQATop,
  loadPersonalQuestionPage,
  loadPersonalUserInfo,
  loadUserBadgeAwards,
} from '@/services/domains/identity';
import { getCurrentUser, loadProfile } from '@/services/profile';
import ProfilePage from './index';

const demoConfig = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8'),
) as unknown);
const demoRuntime: BootstrapModeRuntime = {
  mode: 'demo',
  persona: 'member',
  demoRepositoryReady: true,
  demoWorkerReady: true,
  adapters: { auth: 'demo', http: 'msw' },
  demoMemberIdentity: {
    id: 'profile-user-1',
    username: 'profile-user',
    publicUserId: 'profile-user',
    displayName: '作者保留姓名',
  },
};
const demoPorts = assembleRuntimePorts(demoConfig, demoRuntime);
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
  website: 'https://orbit-reader.example/notes',
  location: '',
  about_html: '<p>把复杂问题拆成可以验证的小步骤</p>',
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
  title: '作者保留博客标题',
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

async function switchLanguage(language: 'en' | 'zh-CN') {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

beforeEach(() => {
  resolvedTheme = 'dark';
  window.localStorage.setItem(demoPersonaStorageKey, 'member');
  demoPorts.auth.setDemoPersona?.('member');
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
});

afterEach(async () => {
  vi.clearAllMocks();
  resolvedTheme = 'light';
  await switchLanguage('zh-CN');
});

describe('Profile localization', () => {
  it('rebuilds structured metadata and keeps active and unsaved state across a live switch', async () => {
    await ensureLocaleNamespaces('en', ['identity']);
    await ensureLocaleNamespaces('zh-CN', ['identity']);
    await switchLanguage('en');

    const view = render(
      <BootstrapProvider value={{ config: demoConfig, modeRuntime: demoRuntime, ports: demoPorts }}>
        <AuthProvider adapter={demoPorts.auth}>
          <HelmetProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/users/profile-user']}>
                <Routes>
                  <Route path="/users/:username" element={<ProfilePage />} />
                </Routes>
              </MemoryRouter>
            </ToastProvider>
          </HelmetProvider>
        </AuthProvider>
      </BootstrapProvider>,
    );

    expect(await view.findByText('作者保留姓名')).toBeTruthy();
    expect(view.getByText('作者保留简介')).toBeTruthy();
    const website = view.getByRole('link', { name: 'orbit-reader.example' });
    expect(website.getAttribute('href')).toBe('https://orbit-reader.example/notes');
    expect(website.getAttribute('target')).toBe('_blank');
    expect(website.querySelector('img')).toBeNull();
    expect(view.container.querySelector<HTMLIFrameElement>('.profile-about-frame')?.srcdoc).toContain('background:#0b1218');
    fireEvent.click(view.getByRole('tab', { name: /Overview/ }));
    expect(await view.findByRole('link', { name: /作者保留博客标题/ })).toBeTruthy();
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
    expect(view.getByRole('link', { name: /作者保留博客标题/ })).toBeTruthy();
    expect(view.queryByText('不应显示的服务端中文元数据')).toBeNull();
  });

});

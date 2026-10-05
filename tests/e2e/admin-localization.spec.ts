import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const currentUser = {
  id: 'admin-browser-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'admin-browser',
  display_name: 'Admin Browser',
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
  access_token: 'admin-browser-token',
  role_id: 2,
  role_name: 'admin',
  rank: 250,
  status: 'normal',
  have_password: true,
  visit_token: '',
  suspended_until: 0,
};

const capabilities = {
  capabilities: {
    'operations.control.view': true,
    'operations.audit.view': true,
  },
  views: { home: true, content: true, review: true, system: true },
  systemSections: { overview: true, events: true, publishing: true, consistency: true, records: true },
  features: { moderationCasesV2: true, reportFeedback: true, systemOperations: true, controlCommands: false },
};

const moderationCase = {
  id: 41,
  source: 'report',
  status: 'pending',
  targetScope: 'content',
  targetType: 'blog',
  targetId: 'blog-41',
  contentKind: 'blog',
  actorUid: '',
  actorName: '',
  reportedUid: 'reported',
  reportedName: '被举报用户',
  title: '作者保留的案件标题',
  excerpt: '作者保留的案件摘要',
  provider: 'provider',
  bizType: 'text',
  decision: 'review',
  label: 'abuse',
  subLabel: '',
  score: 82,
  requestId: 'request-41',
  error: '',
  payloadSha256: 'sha-41',
  raw: '',
  moderationEventId: 41,
  reportCount: 1,
  reportType: 2,
  reportContent: '举报者保留内容',
  operation: '',
  reviewNote: '',
  reviewedBy: '',
  createdAt: '2026-08-27T01:00:00Z',
  updatedAt: '2026-08-27T01:05:00Z',
  reports: [{
    id: 41,
    reporter: '',
    reportedUser: '',
    reportType: 2,
    reasonKey: 'harassment',
    reasonLabel: '举报者保留原因',
    reasonVersion: 1,
    content: '举报者保留证据',
    status: 0,
    publicOutcome: '',
    version: 1,
    createdAt: '2026-08-27T01:00:00Z',
  }],
  version: 3,
  allowedActions: ['defer', 'ignore_report', 'hide_post'],
};

const moderationDetail = {
  case: moderationCase,
  decisionOptions: [
    {
      key: 'no_violation',
      label: '不应显示的服务端中文判定',
      actions: [{ operation: 'ignore_report', label: '不应显示的服务端中文动作', tone: 'neutral', requiresNote: false, requiresDuration: false, impact: '' }],
    },
    {
      key: 'violation',
      label: '不应显示的服务端中文违规判定',
      actions: [{ operation: 'hide_post', label: '不应显示的服务端中文隐藏动作', tone: 'destructive', requiresNote: true, requiresDuration: false, impact: '不应显示的服务端中文影响' }],
    },
    {
      key: 'defer',
      label: '不应显示的服务端中文暂缓判定',
      actions: [{ operation: 'defer', label: '不应显示的服务端中文暂缓动作', tone: 'warning', requiresNote: true, requiresDuration: false, impact: '' }],
    },
  ],
  snapshot: { title: '作者保留的审核快照', body: '作者保留的正文' },
  machineEvidence: [],
  reasonDistribution: [{ reasonKey: 'harassment', reasonLabel: '举报者保留原因', count: 1 }],
  timeline: [{ id: 'case:41', kind: 'case', action: 'created', actorUid: '', summary: '', payload: {}, createdAt: '2026-08-27T01:00:00Z' }],
  generatedAt: '2026-08-27T01:06:00Z',
};

const moderationQueue = {
  count: 1,
  page: 1,
  pageSize: 20,
  items: [moderationCase],
  counts: { active: 1, pending: 1, deferred: 0, machine: 0, report: 1, hybrid: 0, closed: 0 },
  generatedAt: '2026-08-27T01:06:00Z',
};

const question = {
  id: 'question-1',
  title: '作者保留的管理题目',
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'admin-browser-1' }));
    if (!localStorage.getItem('rinspace-language-preference-v1')) {
      localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'en' }));
    }
  });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('admin-browser-1', 'admin-browser', 'admin') });
      return;
    }
    if (pathname === '/auth/v1/user/me') {
      await route.fulfill({ json: { sub: 'admin-browser-1', username: 'admin-browser', nickname: 'Admin Browser', user_metadata: { username: 'admin-browser', rank: 250 } } });
      return;
    }
    if (pathname === '/api/user/info') {
      const preference = await page.evaluate(() => {
        const raw = localStorage.getItem('rinspace-language-preference-v1');
        if (!raw) return 'en';
        return (JSON.parse(raw) as { preference?: string }).preference === 'zh-CN' ? 'zh-CN' : 'en';
      });
      await route.fulfill({ json: { ...currentUser, language: preference } });
      return;
    }
    if (pathname === '/admin/api/workspace/capabilities') {
      await route.fulfill({ json: capabilities });
      return;
    }
    if (pathname === '/api/moderation/cases/41') {
      await route.fulfill({ json: moderationDetail });
      return;
    }
    if (pathname === '/api/moderation/cases') {
      await route.fulfill({ json: moderationQueue });
      return;
    }
    if (pathname === '/admin/api/question/page') {
      await route.fulfill({ json: { count: 1, items: [question] } });
      return;
    }
    if (pathname === '/api/notifications') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/profile' || pathname === '/api/gitea/sso') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname.startsWith('/api/') || pathname.startsWith('/admin/api/')) {
      await route.fulfill({ json: {} });
      return;
    }
    await route.continue();
  });
});

test('production Admin keeps authored data and semantic operations across both locales', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name),
    'The Admin localization matrix covers desktop and mobile in both themes.',
  );

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.goto('/admin?view=review', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /作者保留的案件标题/ }).click({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: '作者保留的案件标题', level: 1 })).toBeVisible();
  await expect(page.getByText('作者保留的审核快照')).toBeVisible();
  await expect(page.getByRole('button', { name: 'No violation' })).toBeVisible();
  await expect(page.getByText(/不应显示的服务端中文/)).toHaveCount(0);
  await expect(page).toHaveTitle('Review workbench - Rinspace');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

  await page.evaluate(() => {
    localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '作者保留的案件标题', level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: '未违规' })).toBeVisible();
  await expect(page.getByText('作者保留的审核快照')).toBeVisible();
  await expect(page.getByText(/不应显示的服务端中文/)).toHaveCount(0);
  await expect(page).toHaveTitle('审核台 - 芥子环');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);

  await page.goto('/admin?view=content&section=questions', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '作者保留的管理题目' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: '搜索题目' })).toBeVisible();
  await expect(page.getByText('projective morphism')).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'en' }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '作者保留的管理题目' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'Search questions' })).toBeVisible();
  await expect(page.getByText('projective morphism')).toBeVisible();
  await expect(page).toHaveTitle('Content management - Rinspace');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  expect(browserErrors).toEqual([]);
});

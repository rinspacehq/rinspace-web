import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const user = {
  id: 'tweet-browser-subject',
  username: 'tweet_browser',
  display_name: '推文测试用户',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  access_token: 'tweet-browser-token',
  role_id: 1,
  role_name: 'member',
  status: 'available',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'tweet-browser-subject' }));
    localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
    localStorage.setItem('rinspace-topbar-session-cache', JSON.stringify({
      user: { id: 'tweet-browser-subject', username: 'tweet_browser' },
      profile: { nickname: '推文测试用户', avatarDataUrl: '' },
      nickname: '推文测试用户',
      avatarDataUrl: '',
      publicUserId: '73',
      isAdmin: false,
      isModerator: false,
      cachedAt: Date.now(),
    }));
  });

  await page.route('**/auth/v1/user/me*', (route) => route.fulfill({
    json: {
      sub: 'tweet-browser-subject',
      username: 'tweet_browser',
      nickname: '推文测试用户',
      user_metadata: { username: 'tweet_browser' },
    },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('tweet-browser-subject', 'tweet_browser') });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({ json: user });
      return;
    }
    if (pathname === '/api/notifications' || pathname === '/api/notification/status') {
      await route.fulfill({ json: pathname.endsWith('/status') ? { inbox: 0, achievement: 0, revision: 0, can_revision: false } : { items: [] } });
      return;
    }
    if (pathname === '/api/profile' || pathname === '/api/gitea/sso') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === '/api/social/tweet-composer/config') {
      await route.fulfill({
        json: {
          maxCharacters: 500,
          maxMediaAttachments: 4,
          maxMediaBytes: 10_000_000,
          acceptedMediaTypes: ['image/*', 'video/*'],
          pollMinOptions: 2,
          pollMaxOptions: 4,
          pollMaxOptionCharacters: 50,
          pollDurations: [300, 3600, 86400],
          languages: [{ code: 'zh-CN', label: '简体中文' }, { code: 'en', label: 'English' }],
          defaultLanguage: 'zh-CN',
          defaultVisibility: 'public',
        },
      });
      return;
    }
    if (pathname === '/api/social/tweet-composer/emojis') {
      await route.fulfill({ json: [] });
      return;
    }
    if (pathname === '/api/social/tweet-composer/statuses') {
      await route.fulfill({
        json: {
          id: '9001',
          url: 'https://rinspace.com/p/9001?world=inner',
          createdAt: '2026-09-07T09:00:00.000Z',
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { message: `not mocked: ${pathname}` } });
  });
});

test('keeps the established topbar and publishes through the full shared tweet dialog', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'mobile-light'].includes(testInfo.project.name),
    'One desktop and one mobile browser cover this shared interaction.',
  );

  let publishedBody: Record<string, unknown> | null = null;
  let idempotencyKey = '';
  page.on('request', (request) => {
    if (!request.url().includes('/api/social/tweet-composer/statuses')) return;
    publishedBody = request.postDataJSON() as Record<string, unknown>;
    idempotencyKey = request.headers()['idempotency-key'] ?? '';
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: '频道与账户' });
  if (testInfo.project.name === 'mobile-light') {
    await navigation.getByRole('button', { name: '更多' }).click();
    await page.getByRole('menuitem', { name: '创作', exact: true }).click();
  } else {
    await navigation.getByRole('button', { name: '创作' }).click();
  }

  const menu = page.getByRole('menu').filter({ hasText: '推文' }).last();
  await expect(menu).toBeVisible();
  await expect(menu.getByText('文章', { exact: true })).toBeVisible();
  await expect(menu.getByText('书籍', { exact: true })).toBeVisible();
  await expect(menu.getByText('标签', { exact: true })).toBeVisible();
  await expect(menu.getByText('推文', { exact: true })).toBeVisible();
  await expect(menu.getByText('问题', { exact: true })).toHaveCount(0);
  await expect(menu.getByText('讨论', { exact: true })).toHaveCount(0);
  await menu.getByText('推文', { exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '发布推文' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: '可见范围' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: '语言' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '添加媒体' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '添加投票' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '添加表情' })).toBeVisible();

  await dialog.locator('textarea').fill('来自表世界共享编辑器的真实推文');
  await dialog.getByRole('button', { name: '发布', exact: true }).click();

  await expect(dialog.getByText('推文已发布')).toBeVisible();
  await expect(dialog.getByRole('link', { name: '打开推文' })).toHaveAttribute('href', 'https://rinspace.com/p/9001?world=inner');
  expect(publishedBody).toMatchObject({
    text: '来自表世界共享编辑器的真实推文',
    visibility: 'public',
    language: 'zh-CN',
  });
  expect(idempotencyKey).toMatch(/^tweet-/);
  expect(publishedBody?.idempotencyKey).toBe(idempotencyKey);
});

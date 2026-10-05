import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const currentUser = {
  id: 'creator-browser-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'creator-browser',
  display_name: 'Creator Browser',
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
  access_token: 'creator-browser-token',
  role_id: 1,
  role_name: 'member',
  rank: 18,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const analyticsFixture = {
  granularity: 'week',
  period: '2026-W35',
  start: '2026-08-24',
  end: '2026-08-31',
  cumulativeReads: 12_345,
  periodReads: 18,
  readHistoryStart: '2026-08-24',
  topWorks: [{
    id: 'browser-work-1',
    slug: 'browser-work',
    title: '作者保留的作品标题',
    contentType: 'blog',
    reads: 18,
  }],
  points: [{
    key: '2026-08-24',
    label: '不应渲染的服务端中文坐标',
    reads: 18,
    likes: 3,
    favorites: 2,
    newFollowers: 1,
  }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'creator-browser-1' }));
    if (!localStorage.getItem('rinspace-language-preference-v1')) {
      localStorage.setItem(
        'rinspace-language-preference-v1',
        JSON.stringify({ preference: 'en' }),
      );
    }
  });

  await page.route('**/auth/v1/user/me*', (route) => route.fulfill({
    json: {
      sub: 'creator-browser-1',
      username: 'creator-browser',
      nickname: 'Creator Browser',
      user_metadata: { username: 'creator-browser', rank: 18 },
    },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('creator-browser-1', 'creator-browser') });
      return;
    }
    if (pathname === '/repos/api/v1/users/creator-browser/heatmap') {
      await route.fulfill({
        json: [{
          timestamp: Date.parse('2026-08-24T00:00:00Z') / 1000,
          contributions: 4,
        }],
      });
      return;
    }
    if (pathname === '/api/user/info') {
      const preference = await page.evaluate(() => {
        const raw = localStorage.getItem('rinspace-language-preference-v1');
        if (!raw) return 'en';
        const parsed = JSON.parse(raw) as { preference?: string };
        return parsed.preference === 'zh-CN' ? 'zh-CN' : 'en';
      });
      await route.fulfill({ json: { ...currentUser, language: preference } });
      return;
    }
    if (pathname === '/api/notifications') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/profile') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === '/api/gitea/sso') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === '/api/creator/analytics') {
      await route.fulfill({ json: analyticsFixture });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });
});

test('production Creator analytics renders both locales without server labels or overflow', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name),
    'The Creator localization matrix covers desktop and mobile in both themes.',
  );

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.goto('/creator?view=analytics&granularity=week&period=2026-W35', {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByText('Total reads')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('12,345')).toBeVisible();
  await expect(page.locator('.creator-line-chart')).toContainText('Mon');
  await expect(page.getByText('不应渲染的服务端中文坐标')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '作者保留的作品标题' })).toBeVisible();
  await expect(page).toHaveTitle('Analytics - Rinspace');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);

  await page.evaluate(() => {
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText('累计阅读')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.creator-line-chart')).toContainText('周一');
  await expect(page.getByText('不应渲染的服务端中文坐标')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '作者保留的作品标题' })).toBeVisible();
  await expect(page).toHaveTitle('数据分析 - 芥子环');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);
  expect(browserErrors).toEqual([]);
});

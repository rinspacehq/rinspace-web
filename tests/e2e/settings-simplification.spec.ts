import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

test('Settings is a single-column page without hero or notification preferences', async ({ page }) => {
  const browserErrors: string[] = [];
  let notificationConfigRequests = 0;

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'settings-user' }));
  });
  await page.route('**/*', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/auth/v1/user/me') {
      await route.fulfill({
        json: {
          sub: 'settings-user',
          username: 'settings-user',
          nickname: 'Settings User',
          user_metadata: { username: 'settings-user' },
        },
      });
      return;
    }
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('settings-user', 'settings-user') });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({
        json: {
          id: 'settings-user',
          created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
          last_login_date: Date.parse('2026-09-21T00:00:00Z') / 1000,
          username: 'settings-user',
          display_name: 'Settings User',
          avatar: { type: 'custom', gravatar: '', custom: '' },
          cover_url: '', mobile: '', bio: '', bio_html: '', website: '', location: '', about_html: '',
          language: 'zh-CN', color_scheme: 'system', access_token: '', role_id: 1,
          role_name: 'member', rank: 1, status: 'available', have_password: false,
          visit_token: '', suspended_until: 0,
        },
      });
      return;
    }
    if (pathname === '/api/user/notification/config') {
      notificationConfigRequests += 1;
      await route.fulfill({ json: {} });
      return;
    }
    if (pathname === '/api/identity/v1/sessions' || pathname === '/api/identity/v1/credentials') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/code/recoveries') {
      await route.fulfill({ json: { recoveries: [] } });
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
    if (pathname.startsWith('/api/')) {
      await route.fulfill({ json: {} });
      return;
    }
    await route.continue();
  });

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  await expect(page.getByLabel('语言')).toBeVisible();
  await expect(page.locator('.settings-toolbar')).toHaveCount(0);
  await expect(page.locator('main.settings-shell aside')).toHaveCount(0);
  await expect(page.getByText('通知偏好')).toHaveCount(0);
  await expect(page.getByText('设备与应用凭据')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(notificationConfigRequests).toBe(0);
  expect(browserErrors).toEqual([]);
});

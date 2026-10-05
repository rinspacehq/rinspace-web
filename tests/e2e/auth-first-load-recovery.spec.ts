import { expect, test } from '@playwright/test';

import { identitySessionMock } from './identity-session-mock';

const currentUser = {
  id: 'recovery-browser-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-09-20T00:00:00Z') / 1000,
  username: 'recovery-browser',
  display_name: '恢复测试用户',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  about_html: '',
  language: 'zh-CN',
  color_scheme: 'light',
  access_token: '',
  role_id: 1,
  role_name: 'member',
  rank: 0,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const notification = {
  id: 'recovery-notification-1',
  object_info: {
    title: '首次加载恢复通知',
    object_id: 'comment-1',
    object_map: { comment: 'comment-1' },
    object_type: 'comment',
  },
  rank: 0,
  notification_action: 'report_resolved',
  is_read: true,
  update_time: Date.parse('2026-09-20T00:00:00Z') / 1000,
  type: 'report',
  target_type: 'comment',
  target_id: 'comment-1',
  report_result: {
    outcome: 'action_taken',
    reportId: '1',
    targetType: 'comment',
    targetSummary: '首次加载恢复通知',
    targetAvailable: false,
  },
};

test('a protected page recovers from the first session 401 without a reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');

  let sessionReads = 0;
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem(
      'rinspace-auth-hint',
      JSON.stringify({ sub: 'recovery-browser-1' }),
    );
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(
      /^\/rinspace(?=\/)/,
      '',
    );
    if (pathname === '/api/identity/v1/session') {
      sessionReads += 1;
      if (sessionReads === 1) {
        await route.fulfill({ status: 401, json: { status: 'anonymous' } });
        return;
      }
      await route.fulfill({
        json: identitySessionMock('recovery-browser-1', 'recovery-browser'),
      });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({ json: currentUser });
      return;
    }
    if (pathname === '/api/notification/page') {
      await route.fulfill({
        json: { count: 1, page: 1, page_size: 12, items: [notification] },
      });
      return;
    }
    if (pathname === '/api/notification/status') {
      await route.fulfill({
        json: { inbox: 0, achievement: 0, revision: 0, can_revision: false },
      });
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
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });

  await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('你举报的内容已处理。')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: '账户菜单' })).toBeVisible();
  expect(sessionReads).toBe(2);
  expect(
    browserErrors.filter(
      (message) =>
        !message.includes(
          'Failed to load resource: the server responded with a status of 401',
        ),
    ),
  ).toEqual([]);
});

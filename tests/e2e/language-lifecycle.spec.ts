import { expect, test, type BrowserContext } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const startupCases = [
  { name: 'Simplified Chinese system locale', languages: ['zh-SG'], locale: 'zh-CN', title: '用户协议 · 芥子环' },
  { name: 'US English system locale', languages: ['en-US'], locale: 'en', title: 'Terms of Service · Rinspace' },
  { name: 'British English system locale', languages: ['en-GB'], locale: 'en', title: 'Terms of Service · Rinspace' },
  { name: 'unmatched system locale', languages: ['fr-FR'], locale: 'en', title: 'Terms of Service · Rinspace' },
] as const;

for (const startupCase of startupCases) {
  test(`anonymous startup resolves ${startupCase.name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light');
    await page.addInitScript(({ languages }) => {
      localStorage.setItem(
        'rinspace-language-preference-v1',
        JSON.stringify({ preference: 'system' }),
      );
      Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        get: () => languages,
      });
      Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        get: () => languages[0],
      });
    }, { languages: [...startupCase.languages] });

    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', startupCase.locale);
    await expect(page).toHaveTitle(startupCase.title);
  });
}

test('a signed-in device restores the account locale over its local system bootstrap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'locale-restoration-user' }));
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'system' }),
    );
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      get: () => ['en-US'],
    });
  });
  await page.route('**/auth/v1/user/me*', (route) => route.fulfill({
    json: {
      sub: 'locale-restoration-user',
      username: 'locale-restoration-user',
      nickname: 'Locale Restoration',
      user_metadata: { username: 'locale-restoration-user' },
    },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('locale-restoration-user', 'locale-restoration-user') });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({
        json: {
          id: 'locale-restoration-user',
          created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
          last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
          username: 'locale-restoration-user',
          display_name: 'Locale Restoration',
          avatar: { type: 'custom', gravatar: '', custom: '' },
          cover_url: '',
          mobile: '',
          bio: '',
          bio_html: '',
          website: '',
          location: '',
          about_html: '',
          language: 'zh-CN',
          color_scheme: 'system',
          access_token: '',
          role_id: 1,
          role_name: 'member',
          rank: 1,
          status: 'available',
          have_password: false,
          visit_token: '',
          suspended_until: 0,
        },
      });
      return;
    }
    if (pathname === '/api/notifications') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });

  await page.goto('/terms', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN', { timeout: 20_000 });
  await expect(page).toHaveTitle('用户协议 · 芥子环');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rinspace-language-preference-v1')))
    .toBe(JSON.stringify({ preference: 'zh-CN' }));
});

test('a Settings language change follows the account onto a second device', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  test.setTimeout(60_000);

  const baseURL = process.env.RINSPACE_PREVIEW_URL || `http://127.0.0.1:${process.env.PORT || '4173'}/rinspace`;
  const siteOrigin = new URL(baseURL).origin;
  let accountLanguage: 'zh-CN' | 'en' = 'zh-CN';
  const notificationConfig = {
    inbox: { key: 'email', enable: false },
    all_new_question: { key: 'email', enable: false },
    all_new_question_for_following_tags: { key: 'email', enable: false },
  };

  const installDevice = async (context: BrowserContext, languages: readonly string[]) => {
    await context.addInitScript(({ deviceLanguages }) => {
      localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'locale-second-device-user' }));
      localStorage.setItem(
        'rinspace-language-preference-v1',
        JSON.stringify({ preference: 'system' }),
      );
      Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        get: () => deviceLanguages,
      });
      Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        get: () => deviceLanguages[0],
      });
    }, { deviceLanguages: [...languages] });

    await context.route('**/*', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname.replace(/^\/rinspace(?=\/)/, '');
      if (pathname === '/api/identity/v1/session') {
        await route.fulfill({ json: identitySessionMock('locale-second-device-user', 'locale-second-device-user') });
        return;
      }
      if (pathname === '/auth/v1/user/me') {
        await route.fulfill({
          json: {
            sub: 'locale-second-device-user',
            username: 'locale-second-device-user',
            nickname: 'Locale Second Device',
            user_metadata: { username: 'locale-second-device-user' },
          },
        });
        return;
      }
      if (pathname === '/api/user/info') {
        await route.fulfill({
          json: {
            id: 'locale-second-device-user',
            created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
            last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
            username: 'locale-second-device-user',
            display_name: 'Locale Second Device',
            avatar: { type: 'custom', gravatar: '', custom: '' },
            cover_url: '',
            mobile: '',
            bio: '',
            bio_html: '',
            website: '',
            location: '',
            about_html: '',
            language: accountLanguage,
            color_scheme: 'system',
            access_token: '',
            role_id: 1,
            role_name: 'member',
            rank: 1,
            status: 'available',
            have_password: false,
            visit_token: '',
            suspended_until: 0,
          },
        });
        return;
      }
      if (pathname === '/api/user/interface' && request.method() === 'PUT') {
        const body: unknown = request.postDataJSON();
        if (
          typeof body === 'object'
          && body !== null
          && 'language' in body
          && (body.language === 'zh-CN' || body.language === 'en')
        ) {
          accountLanguage = body.language;
        }
        await route.fulfill({
          json: { language: accountLanguage, color_scheme: 'system' },
        });
        return;
      }
      if (pathname === '/api/user/notification/config') {
        await route.fulfill({ json: notificationConfig });
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
  };

  const firstDevice = await browser.newContext();
  await installDevice(firstDevice, ['zh-CN']);
  const firstPage = await firstDevice.newPage();
  await firstPage.goto(`${siteOrigin}/settings`, { waitUntil: 'domcontentloaded' });
  await firstPage.getByLabel('语言').selectOption('en', { timeout: 20_000 });
  await firstPage.getByRole('button', { name: '保存偏好' }).click();
  await expect(firstPage.locator('html')).toHaveAttribute('lang', 'en');
  await expect(firstPage.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect.poll(() => firstPage.evaluate(() => localStorage.getItem('rinspace-language-preference-v1')))
    .toBe(JSON.stringify({ preference: 'en' }));
  expect(accountLanguage).toBe('en');
  await firstDevice.close();

  const secondDevice = await browser.newContext();
  await installDevice(secondDevice, ['zh-CN']);
  const secondPage = await secondDevice.newPage();
  await secondPage.goto(`${siteOrigin}/terms`, { waitUntil: 'domcontentloaded' });
  await expect(secondPage.locator('html')).toHaveAttribute('lang', 'en', { timeout: 20_000 });
  await expect(secondPage).toHaveTitle('Terms of Service · Rinspace');
  await expect.poll(() => secondPage.evaluate(() => localStorage.getItem('rinspace-language-preference-v1')))
    .toBe(JSON.stringify({ preference: 'en' }));
  await secondDevice.close();
});

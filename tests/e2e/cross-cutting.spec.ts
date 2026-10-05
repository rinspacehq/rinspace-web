import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const representatives = ['/', '/a/254/fixture', '/users/fixture', '/creator', '/admin'];

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'anonymous acceptance fixture' },
  }));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/identity/v1/session', (route) => route.fulfill({ json: { status: 'anonymous' } }));
});

test('route families fit exact reference widths and 200% zoom equivalent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'The six-project matrix already covers theme, device and motion variants.');
  test.setTimeout(120_000);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of representatives) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `${route} overflows at ${width}px`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 720, height: 900 });
  for (const route of representatives) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${route} overflows at 200% zoom equivalent`).toBe(false);
  }
});

test('keyboard navigation reaches content, search and route announcement', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const skip = page.locator('a.rin-skip-link');
  await expect(skip).toBeAttached();
  await expect(skip).not.toHaveAccessibleName('');
  for (let index = 0; index < 30 && !(await skip.evaluate((element) => element === document.activeElement)); index += 1) await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rin-main-content')).toBeFocused();
  await page.getByRole('search').getByRole('textbox').focus();
  await page.keyboard.type('Calabi Yau');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=Calabi%20Yau$/);
  await expect(page.locator('#rin-route-announcer')).not.toHaveText('');
});

test('mobile search opens below the topbar without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-light');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const search = page.getByRole('search');
  const textbox = search.getByRole('textbox');
  // The shell keeps #root hidden until the target fonts are ready, so wait for
  // the first painted topbar instead of sampling an unrendered layout.
  await expect(search).toBeVisible();
  const collapsedSearchBox = await search.boundingBox();
  const moreButtonBox = await page.getByRole('button', { name: '更多' }).boundingBox();
  if (!collapsedSearchBox || !moreButtonBox) {
    throw new Error('Expected the collapsed search and more controls to be visible');
  }
  const compactControlGap = moreButtonBox.x
    - (collapsedSearchBox.x + collapsedSearchBox.width);
  expect(compactControlGap).toBeGreaterThanOrEqual(6);
  expect(compactControlGap).toBeLessThanOrEqual(10);

  await search.locator('button[type="submit"]').click();

  await expect(search).toHaveClass(/mobile-search-open/);
  await expect(textbox).toBeFocused();

  const geometry = await search.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(9);
  expect(geometry.left).toBeLessThanOrEqual(11);
  expect(geometry.right).toBeGreaterThanOrEqual(geometry.viewportWidth - 11);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 9);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
});

test('standard mobile pages share the near-full-width gutter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const routes = [
    { path: '/', selector: '.home-shell' },
    { path: '/a/254/fixture', selector: '.detail-shell' },
    { path: '/users/fixture', selector: '.profile-shell' },
  ];

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const shell = page.locator(route.selector);
      await expect(shell).toBeAttached();
      const geometry = await shell.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          paddingLeft: Number.parseFloat(style.paddingLeft),
          paddingRight: Number.parseFloat(style.paddingRight),
          viewportWidth: window.innerWidth,
        };
      });
      expect(geometry.paddingLeft, `${route.path} left gutter at ${width}px`).toBe(8);
      expect(geometry.paddingRight, `${route.path} right gutter at ${width}px`).toBe(8);
      expect(geometry.left, `${route.path} left edge at ${width}px`).toBe(0);
      expect(geometry.right, `${route.path} right edge at ${width}px`).toBe(width);
      expect(geometry.viewportWidth).toBe(width);
    }
  }
});

test('signed-in compact avatar matches the adjacent navigation control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.route('**/api/identity/v1/session', (route) => route.fulfill({
    json: identitySessionMock('user-1', 'reader'),
  }));
  await page.addInitScript(() => {
    window.localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'user-1' }));
    window.localStorage.setItem('rinspace-topbar-session-cache', JSON.stringify({
      user: { id: 'user-1', username: 'reader' },
      profile: { nickname: '读者', avatarDataUrl: '' },
      nickname: '读者',
      avatarDataUrl: '',
      publicUserId: 'reader',
      isAdmin: false,
      isModerator: false,
      cachedAt: Date.now(),
    }));
  });

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const more = page.getByRole('button', { name: '更多' });
    const account = page.getByRole('button', { name: '账户菜单' });
    await expect(account).toBeVisible();
    const moreBox = await more.boundingBox();
    const accountBox = await account.boundingBox();
    const avatarBox = await account.locator('.avatar-name-mark').boundingBox();
    expect(moreBox).not.toBeNull();
    expect(accountBox).not.toBeNull();
    expect(avatarBox).not.toBeNull();
    expect(moreBox?.width).toBe(34);
    expect(moreBox?.height).toBe(34);
    expect(accountBox?.width).toBe(34);
    expect(accountBox?.height).toBe(34);
    expect(avatarBox?.width).toBe(34);
    expect(avatarBox?.height).toBe(34);
  }
});

test('topbar brand keeps fixed geometry while a stored session restores', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.route('**/api/identity/v1/session', async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    await route.fulfill({
      json: identitySessionMock('user-1', 'reader'),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'user-1' }));
    window.localStorage.removeItem('rinspace-topbar-session-cache');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const header = page.locator('header.topbar');
  const brandWord = page.locator('.brand-word');
  await expect(header).toHaveAttribute('data-session-state', 'restoring');
  const before = await brandWord.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      transform: getComputedStyle(element).transform,
    };
  });

  await expect(page.getByRole('button', { name: '账户菜单' })).toBeVisible();
  await expect(header).toHaveAttribute('data-session-state', 'authenticated');
  const after = await brandWord.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      transform: getComputedStyle(element).transform,
    };
  });

  expect(before.transform).toBe('none');
  expect(after).toEqual(before);
});

test('topbar does not paint fallback text while core fonts load', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.route('**/fonts/library/**', async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('html')).toHaveClass(/rin-fonts-loading/);
  await expect(page.locator('#root')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.brand-word')).toBeAttached();

  await expect(page.locator('html')).not.toHaveClass(/rin-fonts-loading/, { timeout: 20_000 });
  await expect(page.locator('#root')).toHaveCSS('visibility', 'visible');
  await expect(page.locator('.brand-word')).toHaveCSS(
    'font-family',
    /Rinspace Newsreader/,
  );
});

test('system theme resolves before representative content renders', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-dark');
  await page.addInitScript(() => localStorage.setItem('rinspace-theme-v2', 'system'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const currentUser = {
  id: 'profile-browser-viewer',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'profile-browser-viewer',
  display_name: 'Browser Viewer',
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
  access_token: 'profile-browser-token',
  role_id: 1,
  role_name: 'member',
  rank: 18,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const profileUser = {
  id: 'profile-browser-author',
  created_at: Date.parse('2025-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-27T00:00:00Z') / 1000,
  username: 'profile-author',
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
  about_html: '',
  status: 'available',
  suspended_until: 0,
  is_follower: false,
};

const ownProfileUser = {
  ...profileUser,
  id: currentUser.id,
  username: currentUser.username,
  display_name: currentUser.display_name,
  follow_count: 12,
  following_count: 7,
  rank: currentUser.rank,
  bio: '本人资料简介',
};

const authoredBlog = {
  id: 'profile-browser-blog',
  type: 'blog',
  title: '作者保留文章标题',
  author: '作者保留姓名',
  authorId: 'profile-author',
  createdAt: '2026-08-28T08:00:00Z',
  meta: '不应显示的服务端中文元数据',
  excerpt: '作者保留摘要',
  interactions: '不应显示的服务端中文交互',
  heat: '',
  readCount: 1234,
  likeCount: 2,
  favoriteCount: 1,
};

const relationItems = Array.from({ length: 20 }, (_, index) => ({
  id: `profile-relation-${index + 1}`,
  username: `relation-user-${index + 1}`,
  display_name: `Relation User ${index + 1}`,
  avatar: '',
  rank: index + 1,
  bio: `Relation biography ${index + 1}`,
  followed_at: Date.parse('2026-08-20T00:00:00Z') / 1000 + index,
  is_following: index % 2 === 0,
}));

let mockedLanguage: 'en' | 'zh-CN' = 'en';
let mockedAboutHtml = '';

test.beforeEach(async ({ page }) => {
  mockedLanguage = 'en';
  mockedAboutHtml = '';
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'profile-browser-viewer' }));
    if (!localStorage.getItem('rinspace-language-preference-v1')) {
      localStorage.setItem(
        'rinspace-language-preference-v1',
        JSON.stringify({ preference: 'en' }),
      );
    }
  });

  await page.route('**/auth/v1/user/me*', (route) => route.fulfill({
    json: {
      sub: 'profile-browser-viewer',
      username: 'profile-browser-viewer',
      nickname: 'Browser Viewer',
      user_metadata: { username: 'profile-browser-viewer', rank: 18 },
    },
  }));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('profile-browser-viewer', 'profile-browser-viewer') });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({ json: { ...currentUser, language: mockedLanguage } });
      return;
    }
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({
        json: url.searchParams.get('username') === currentUser.username
          ? ownProfileUser
          : { ...profileUser, about_html: mockedAboutHtml },
      });
      return;
    }
    if (pathname === '/api/personal/qa/top') {
      await route.fulfill({ json: { answer: [], question: [] } });
      return;
    }
    if (
      pathname === '/api/personal/question/page'
      || pathname === '/api/personal/answer/page'
      || pathname === '/api/personal/comment/page'
      || pathname === '/api/badge/user/awards'
    ) {
      await route.fulfill({ json: { count: 0, items: [] } });
      return;
    }
    if (pathname === '/api/personal/collection/page') {
      await route.fulfill({
        json: { count: 0, page: 1, pageSize: 6, generatedAt: '2026-08-28T09:00:00Z', items: [] },
      });
      return;
    }
    if (pathname === '/api/user/relations') {
      await route.fulfill({
        json: {
          count: 40,
          page: Number(url.searchParams.get('page') || 1),
          page_size: 20,
          items: relationItems,
        },
      });
      return;
    }
    if (pathname === '/api/content') {
      const items = url.searchParams.get('type') === 'blog' ? [authoredBlog] : [];
      await route.fulfill({
        json: { count: items.length, page: 1, pageSize: 50, generatedAt: '2026-08-28T09:00:00Z', items },
      });
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
    if (
      pathname === '/api/social/accounts/profile-browser-author/statuses'
      || pathname === '/api/social/accounts/profile-browser-viewer/statuses'
    ) {
      await route.fulfill({
        json: { accountId: 'mastodon-profile-author', items: [], nextMaxId: null },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });
});

test('production Profile localizes structured metadata and preserves authored content without overflow', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name),
    'The Profile localization matrix covers desktop and mobile in both themes.',
  );

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.goto('/users/profile-author?tab=overview', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: /作者保留文章标题/ })).toBeVisible();
  await expect(page.getByText('作者保留简介')).toBeVisible();
  await expect(page.getByText('1,234 reads · 2 likes · 1 bookmark')).toBeVisible();
  await expect(page.getByText('不应显示的服务端中文元数据')).toHaveCount(0);
  await expect(page.getByText('不应显示的服务端中文交互')).toHaveCount(0);
  await expect(page).toHaveTitle('作者保留姓名 · Rinspace');
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
  mockedLanguage = 'zh-CN';
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('tab', { name: /综合/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: /作者保留文章标题/ })).toBeVisible();
  await expect(page.getByText('作者保留简介')).toBeVisible();
  await expect(page.getByText('1,234 次阅读 · 2 个喜欢 · 1 次收藏')).toBeVisible();
  await expect(page.getByText('不应显示的服务端中文元数据')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);
  expect(browserErrors).toEqual([]);
});

test('dark Profile applies its theme inside a non-empty About iframe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-dark');
  mockedAboutHtml = [
    '<!doctype html><html><head><style>body{background:#fff}</style></head>',
    '<body><p>把复杂问题拆成可以验证的小步骤</p></body></html>',
  ].join('');

  await page.goto('/users/profile-author', { waitUntil: 'domcontentloaded' });

  const aboutBody = page.frameLocator('.profile-about-frame').locator('body');
  await expect(aboutBody.getByText('把复杂问题拆成可以验证的小步骤')).toBeVisible();
  await expect.poll(() => aboutBody.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(11, 18, 24)');
});

test('mobile Profile keeps all tabs compact and horizontally accessible without a visible scrollbar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  mockedLanguage = 'zh-CN';
  await page.evaluate(() => {
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/users/profile-author?tab=overview', { waitUntil: 'domcontentloaded' });
    const tabs = page.locator('.profile-tabs');
    await expect(tabs.getByRole('tab')).toHaveCount(7);
    await expect(tabs.getByRole('tab', { name: /综合/ })).toHaveAttribute('aria-selected', 'true');

    const geometry = await tabs.evaluate((element) => {
      const buttons = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const style = getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollbarWidth: style.scrollbarWidth,
        buttonWidths: buttons.map((button) => button.getBoundingClientRect().width),
        buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
      };
    });

    expect(geometry.scrollbarWidth).toBe('none');
    expect(geometry.scrollWidth).toBeLessThan(560);
    expect(geometry.buttonWidths.every((buttonWidth) => buttonWidth < 80)).toBe(true);
    expect(geometry.buttonHeights.every((buttonHeight) => buttonHeight >= 42)).toBe(true);
    expect(geometry.scrollWidth).toBeGreaterThanOrEqual(geometry.clientWidth);

    const lastTab = tabs.getByRole('tab', { name: /图谱/ });
    await lastTab.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    await expect(lastTab).toBeInViewport();
  }
});

test('Profile relation dialog keeps long following and follower lists scrollable', async ({ page }, testInfo) => {
  test.skip(!['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name));
  await page.setViewportSize({
    width: testInfo.project.name.startsWith('mobile-') ? 390 : 960,
    height: 600,
  });
  await page.goto('/users/profile-author?tab=overview', { waitUntil: 'domcontentloaded' });

  const relationButtons = page.locator('.profile-relation-stat');
  await expect(relationButtons).toHaveCount(2);
  for (const relationButton of await relationButtons.all()) {
    await relationButton.click();
    const dialog = page.getByRole('dialog');
    const list = dialog.locator('.profile-relation-list');
    await expect(dialog).toBeVisible();
    await expect(list.locator('.profile-relation-item')).toHaveCount(20);
    await expect(dialog.locator('.profile-relation-pagination')).toBeVisible();

    const before = await list.evaluate((element) => ({
      clientHeight: element.clientHeight,
      dialogHeight: element.parentElement?.getBoundingClientRect().height || 0,
      scrollbarColor: getComputedStyle(element).scrollbarColor,
      scrollbarGutter: getComputedStyle(element).scrollbarGutter,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    expect(before.overflowY).toBe('auto');
    expect(before.scrollbarColor).not.toBe('auto');
    expect(before.scrollbarGutter).toContain('stable');
    expect(before.scrollbarWidth).toBe('thin');
    expect(before.clientHeight).toBeLessThan(before.dialogHeight);
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await list.hover();
    await page.mouse.wheel(0, 420);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(before.scrollTop);
    await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(list.locator('.profile-relation-item').last()).toBeInViewport();

    const dialogBounds = await dialog.boundingBox();
    const paginationBounds = await dialog.locator('.profile-relation-pagination').boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(paginationBounds).not.toBeNull();
    expect(paginationBounds!.y + paginationBounds!.height).toBeLessThanOrEqual(
      dialogBounds!.y + dialogBounds!.height,
    );

    await dialog.getByRole('button', { name: /close/i }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test('mobile Profile follows the inner-world account header order and spacing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  mockedLanguage = 'zh-CN';
  await page.evaluate(() => {
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });

  const readCardGeometry = async (actionSelector: string) => page.locator('.profile-cover-card').evaluate(
    (element, selector) => {
      const boxFrom = (target: Element) => {
        const box = target.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
          centerY: box.top + (box.height / 2),
        };
      };
      const boxFor = (targetSelector: string) => {
        const target = element.querySelector<HTMLElement>(targetSelector);
        if (!target) throw new Error(`Missing profile element: ${targetSelector}`);
        return boxFrom(target);
      };
      const actionStack = element.querySelector<HTMLElement>('.profile-action-stack');
      if (!actionStack) throw new Error('Missing profile action stack');
      return {
        card: boxFrom(element),
        cover: boxFor('.profile-cover-art'),
        avatar: boxFor('.profile-avatar'),
        primaryIdentity: boxFor('.profile-primary-identity'),
        biography: boxFor('.profile-biography'),
        action: boxFor(selector),
        actionStack: boxFor('.profile-action-stack'),
        relationStats: boxFor('.profile-relation-stats'),
        actionStackDisplay: getComputedStyle(actionStack).display,
      };
    },
    actionSelector,
  );

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/users/profile-author?tab=overview', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.profile-follow-button')).toBeVisible();

    const geometry = await readCardGeometry('.profile-follow-button');
    expect(geometry.card.height).toBeLessThan(500);
    expect(geometry.cover.height).toBeGreaterThanOrEqual(119);
    expect(geometry.cover.height).toBeLessThanOrEqual(121);
    expect(geometry.avatar.width).toBeGreaterThanOrEqual(79);
    expect(geometry.avatar.width).toBeLessThanOrEqual(81);
    expect(geometry.avatar.top).toBeLessThan(geometry.cover.bottom);
    expect(geometry.primaryIdentity.top).toBeGreaterThanOrEqual(geometry.avatar.bottom);
    expect(geometry.relationStats.top).toBeGreaterThan(geometry.primaryIdentity.bottom);
    expect(geometry.biography.top).toBeGreaterThan(geometry.relationStats.bottom);
    expect(geometry.action.top).toBeGreaterThan(geometry.biography.bottom);
    expect(geometry.action.width).toBeGreaterThanOrEqual(geometry.biography.width - 1);
    expect(geometry.actionStackDisplay).toBe('contents');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/users/profile-browser-viewer?tab=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /编辑资料/ })).toBeVisible();

  const ownerGeometry = await readCardGeometry('.profile-edit-toggle');
  expect(ownerGeometry.card.height).toBeLessThan(500);
  expect(ownerGeometry.relationStats.top).toBeGreaterThan(ownerGeometry.primaryIdentity.bottom);
  expect(ownerGeometry.biography.top).toBeGreaterThan(ownerGeometry.relationStats.bottom);
  expect(ownerGeometry.action.top).toBeGreaterThan(ownerGeometry.biography.bottom);
  expect(ownerGeometry.action.width).toBeGreaterThanOrEqual(ownerGeometry.biography.width - 1);
});

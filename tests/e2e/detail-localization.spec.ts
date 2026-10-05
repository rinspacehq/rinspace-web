import { expect, test } from '@playwright/test';

const now = '2026-08-28T03:00:00Z';
const repeatedParagraphs = Array.from(
  { length: 36 },
  (_, index) => `<p>第 ${index + 1} 段 authored content remains unchanged in every interface language.</p>`,
).join('');

const blogFixture = {
  id: '401',
  slug: 'reader-localization',
  type: 'blog',
  title: '双语阅读页验收',
  author: 'Rin Reader',
  authorId: 'rin-reader',
  authorUid: 'reader-401',
  authorAvatar: '',
  authorRank: 88,
  meta: '',
  excerpt: '验证阅读页界面语言不会改写作者正文。',
  interactions: '18 阅读 · 4 收藏 · 2 评论',
  heat: '18',
  tags: ['i18n'],
  images: [],
  coverUrl: '',
  editor: 'rin',
  body: `[[RIN_WRITER]]<h2 id="chapter-one">章节一</h2><h3 id="section-one">Section one</h3>${repeatedParagraphs}<h2 id="chapter-two">章节二</h2><p>结尾。</p>[[/RIN_WRITER]]`,
  readCount: 18,
  favoriteCount: 4,
  commentCount: 2,
  collected: false,
  liked: false,
  likeCount: 3,
  createdAt: now,
  updatedAt: now,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/content/401') {
      await route.fulfill({ json: blogFixture });
      return;
    }
    if (pathname === '/api/content/reader-localization/read') {
      await route.fulfill({ json: { counted: true, readCount: 19 } });
      return;
    }
    if (pathname === '/api/content/401/book-context') {
      await route.fulfill({ json: { items: [], generatedAt: now } });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/revisions') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
});

test('production reader renders both locales without changing authored content or overflowing', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name),
    'The localization matrix covers desktop and mobile in both themes.',
  );

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.addInitScript(() => {
    const languageState = window as typeof window & { __rinspaceTestLanguages?: string[] };
    languageState.__rinspaceTestLanguages = ['en-US'];
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      get: () => languageState.__rinspaceTestLanguages,
    });
    if (!localStorage.getItem('rinspace-language-preference-v1')) {
      localStorage.setItem(
        'rinspace-language-preference-v1',
        JSON.stringify({ preference: 'system' }),
      );
    }
  });
  await page.goto('/a/401/reader-localization', { waitUntil: 'domcontentloaded' });

  const toc = page.locator('nav.blog-toc[aria-label="Article table of contents"]');
  if (testInfo.project.name.startsWith('desktop-')) {
    await expect(toc).toBeVisible({ timeout: 20_000 });
    await expect(toc).toContainText('Contents');
  } else {
    await expect(toc).toBeAttached({ timeout: 20_000 });
  }
  await expect(page.getByRole('heading', { name: '章节一' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('main')).toContainText('19 reads');

  const scrollTarget = page.getByRole('heading', { name: '章节二' });
  await scrollTarget.scrollIntoViewIfNeeded();
  const scrollBeforeLanguageChange = await page.evaluate(() => window.scrollY);
  expect(scrollBeforeLanguageChange).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);

  await page.evaluate(() => {
    const languageState = window as typeof window & { __rinspaceTestLanguages?: string[] };
    languageState.__rinspaceTestLanguages = ['zh-CN'];
    window.dispatchEvent(new Event('languagechange'));
  });

  const chineseToc = page.locator('nav.blog-toc[aria-label="文章目录"]');
  if (testInfo.project.name.startsWith('desktop-')) {
    await expect(chineseToc).toBeVisible({ timeout: 20_000 });
    await expect(chineseToc).toContainText('目录');
  } else {
    await expect(chineseToc).toBeAttached({ timeout: 20_000 });
  }
  await expect(page.getByRole('heading', { name: '章节一' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('main')).toContainText('19 次阅读');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeLanguageChange);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 720, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
    await page.evaluate(() => {
      const languageState = window as typeof window & { __rinspaceTestLanguages?: string[] };
      languageState.__rinspaceTestLanguages = ['en-GB'];
      window.dispatchEvent(new Event('languagechange'));
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('main')).toContainText('19 reads');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
  }
  expect(browserErrors).toEqual([]);
});

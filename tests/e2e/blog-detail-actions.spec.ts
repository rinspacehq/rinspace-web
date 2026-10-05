import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const now = new Date().toISOString();

const blogFixture = {
  id: '101',
  slug: 'contextual-preview',
  type: 'blog',
  title: '文章详情操作验收',
  author: 'Lunifans',
  authorId: 'lunifans',
  authorUid: 'user-42',
  authorAvatar: '/avatar.jpg',
  authorRank: 1403,
  meta: '浏览器验收',
  excerpt: '用于验证文章详情页操作。',
  interactions: '20 阅读 · 7 收藏',
  heat: '20',
  tags: [],
  images: [],
  coverUrl: '',
  editor: 'rin',
  body: '[[RIN_WRITER]]<p>文章正文。</p>[[/RIN_WRITER]]',
  readCount: 20,
  favoriteCount: 7,
  collected: false,
  liked: true,
  likeCount: 12,
  reportCount: 4,
  createdAt: now,
  updatedAt: now,
};

const profileFixture = {
  id: 'user-42',
  created_at: 1,
  last_login_date: 1,
  username: 'lunifans',
  follow_count: 13,
  following_count: 14,
  answer_count: 2,
  question_count: 3,
  rank: 1403,
  display_name: 'Lunifans',
  avatar: '/avatar.jpg',
  cover_url: '/cover.jpg',
  mobile: '',
  bio: '最高权限管理员。',
  bio_html: '',
  website: 'lunifans.com',
  location: '代数几何',
  about_html: '',
  status: 'active',
  suspended_until: 0,
  is_follower: false,
};

const bookFixture = {
  ...blogFixture,
  id: '202',
  slug: 'book-actions',
  type: 'book',
  title: '书籍详情操作验收',
  excerpt: '用于验证书籍详情页喜欢和收藏数量。',
  interactions: '30 阅读 · 9 收藏',
  body: '[[RIN_WRITER]]<p>书籍简介。</p>[[/RIN_WRITER]]',
  readCount: 30,
  favoriteCount: 9,
  collected: false,
  liked: false,
  likeCount: 6,
  tags: ['书籍标签'],
  book: {
    kind: 'markdown',
    bookTitle: '书籍详情操作验收',
    authors: ['Lunifans'],
    officialUrl: 'https://example.com/retired-book-site',
  },
};

const pdfBookFixture = {
  ...bookFixture,
  id: '203',
  slug: 'pdf-book-actions',
  title: 'PDF 书籍详情操作验收',
  tags: ['PDF 标签'],
  book: {
    kind: 'original',
    bookTitle: 'PDF 书籍详情操作验收',
    authors: ['Lunifans'],
    pdfUrl: '/fixtures/original-book.pdf',
  },
};

test('blog detail uses Heart while preserving collection counts and report', async ({ page }) => {
  const consoleErrors: string[] = [];
  let releaseTipCount: () => void = () => {};
  const tipCountGate = new Promise<void>((resolve) => {
    releaseTipCount = resolve;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'reader-7' }));
  });
  await page.route('**/auth/v1/user/me**', (route) => route.fulfill({
    json: { sub: 'reader-7', username: 'reader' },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('reader-7', 'reader') });
      return;
    }
    if (pathname === '/api/wallet/v1/tips/count') {
      await tipCountGate;
      await route.fulfill({ json: { count: 128 } });
      return;
    }
    if (pathname === '/api/content/101') {
      await route.fulfill({ json: blogFixture });
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
    if (pathname === '/api/content/101/book-context') {
      await route.fulfill({ json: { items: [], generatedAt: now } });
      return;
    }
    if (pathname === '/api/report-reasons') {
      await route.fulfill({
        json: {
          version: 1,
          targetType: 'blog',
          reasons: [
            { key: 'other', label: '其他', requiresDetail: false },
          ],
        },
      });
      return;
    }
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({ json: profileFixture });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto('/a/101/contextual-preview', { waitUntil: 'domcontentloaded' });

  const articleActions = page.locator('.blog-like-section:not(.side)');
  const sideActions = page.locator('.blog-like-section.side');
  await expect(articleActions).toBeVisible({ timeout: 20_000 });
  const loadingArticleTip = articleActions.getByRole('button', { name: '打赏', exact: true });
  const loadingCompactTip = sideActions.getByRole('button', { name: '打赏', exact: true });
  await expect(loadingArticleTip).toBeVisible();
  await expect(loadingCompactTip).toBeVisible();
  const [articleTipBeforeCount, compactTipBeforeCount] = await Promise.all([
    loadingArticleTip.boundingBox(),
    loadingCompactTip.boundingBox(),
  ]);
  releaseTipCount();
  const articleHeart = articleActions.getByRole('button', { name: /已喜欢，12 次/ });
  const articleCollection = articleActions.getByRole('button', { name: /收藏，7 次/ });
  const articleTip = articleActions.getByRole('button', { name: /打赏，128 人/ });
  const articleReport = articleActions.getByRole('button', { name: /举报，4 人/ });
  await expect(articleHeart).toContainText('12');
  await expect(articleHeart.locator('.rin-icon--heart-fill')).toHaveAttribute('fill', 'currentColor');
  await expect(articleCollection).toContainText('7');
  await expect(articleCollection).toContainText('收藏');
  await expect(articleTip.locator('.rin-icon--gift')).toBeVisible();
  await expect(articleTip).toContainText('128');
  const articleTipAfterCount = await articleTip.boundingBox();
  expect({ width: articleTipAfterCount?.width, height: articleTipAfterCount?.height }).toEqual({
    width: articleTipBeforeCount?.width,
    height: articleTipBeforeCount?.height,
  });
  await expect(articleReport).toContainText('4');
  await expect(articleHeart.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  await expect(articleCollection.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  await expect(articleTip.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  await expect(articleReport.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  const articleIconSizes = await Promise.all([
    articleCollection.locator('.rin-icon').boundingBox(),
    articleTip.locator('.rin-icon').boundingBox(),
    articleReport.locator('.rin-icon').boundingBox(),
  ]);
  expect(articleIconSizes.map((box) => [box?.width, box?.height])).toEqual([
    [20, 20],
    [20, 20],
    [20, 20],
  ]);

  const articleOrder = await articleActions.locator('.blog-like-row').evaluate((row) =>
    Array.from(row.children).map((item) => item.getAttribute('aria-label') || item.textContent?.trim() || ''),
  );
  expect(articleOrder.findIndex((label) => label.includes('收藏'))).toBeLessThan(articleOrder.findIndex((label) => label.includes('打赏')));
  expect(articleOrder.findIndex((label) => label.includes('打赏'))).toBeLessThan(articleOrder.findIndex((label) => label.includes('举报')));

  for (const action of [articleHeart, articleCollection, articleTip, articleReport]) {
    await expect(action).toHaveCSS('border-top-width', '0px');
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(action).toHaveCSS('box-shadow', 'none');
    expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await articleReport.hover();
  await expect(articleReport).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const compactCollection = sideActions.getByRole('button', { name: /收藏，7 次/ });
  const compactHeart = sideActions.getByRole('button', { name: /已喜欢，12 次/ });
  const compactTip = sideActions.getByRole('button', { name: /打赏，128 人/ });
  const compactReport = sideActions.getByRole('button', { name: /举报，4 人/ });
  await expect(compactHeart).toHaveText('12');
  await expect(compactCollection).toHaveText('7');
  await expect(compactTip.locator('.rin-icon--gift')).toBeVisible();
  await expect(compactTip).toHaveText('128');
  const compactTipAfterCount = await compactTip.boundingBox();
  expect({ width: compactTipAfterCount?.width, height: compactTipAfterCount?.height }).toEqual({
    width: compactTipBeforeCount?.width,
    height: compactTipBeforeCount?.height,
  });
  await expect(compactReport).toHaveText('4');
  await expect(compactHeart.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  await expect(compactCollection.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  await expect(compactTip.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  await expect(compactReport.locator('.rin-icon-motion')).toHaveCSS('font-size', '20px');
  const compactIconSizes = await Promise.all([
    compactCollection.locator('.rin-icon').boundingBox(),
    compactTip.locator('.rin-icon').boundingBox(),
    compactReport.locator('.rin-icon').boundingBox(),
  ]);
  expect(compactIconSizes.map((box) => [box?.width, box?.height])).toEqual([
    [20, 20],
    [20, 20],
    [20, 20],
  ]);
  for (const action of [compactHeart, compactCollection, compactTip, compactReport]) {
    await expect(action).toHaveCSS('border-top-width', '0px');
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.blog-side-author')).not.toContainText('查看作者主页');

  await compactReport.click();
  await expect(page.getByRole('dialog', { name: '举报' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('book detail keeps header operations while compacting their mobile labels', async ({ page }) => {
  let likePayload: Record<string, unknown> | null = null;
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'reader-7' }));
  });
  await page.route('**/auth/v1/user/me**', (route) => route.fulfill({
    json: { sub: 'reader-7', username: 'reader' },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('reader-7', 'reader') });
      return;
    }
    if (pathname === '/api/wallet/v1/tips/count') {
      await route.fulfill({ json: { count: 8 } });
      return;
    }
    if (route.request().method() === 'POST' && pathname === '/api/like') {
      likePayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          targetType: 'book',
          targetId: '202',
          liked: true,
          likeCount: 7,
        },
      });
      return;
    }
    if (pathname === '/api/content/202') {
      await route.fulfill({ json: bookFixture });
      return;
    }
    if (pathname === '/api/report-reasons') {
      await route.fulfill({
        json: {
          version: 1,
          targetType: 'book',
          reasons: [
            { key: 'other', label: '其他', requiresDetail: false },
          ],
        },
      });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({ json: profileFixture });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto('/books/202/book-actions', { waitUntil: 'domcontentloaded' });

  const actions = page.locator('.book-detail-header .blog-header-actions');
  await expect(actions).toBeVisible({ timeout: 20_000 });
  const heart = actions.getByRole('button', { name: /喜欢，6 次/ });
  const collection = actions.getByRole('button', { name: /收藏，9 次/ });
  const tip = actions.getByRole('button', { name: /打赏，8 人/ });
  const report = actions.getByRole('button', { name: /举报，4 人/ });
  const readAction = page.locator('.book-detail-hero .book-detail-read-action');
  const bookTag = page.locator('.book-detail-header .blog-header-tags a', { hasText: '书籍标签' });
  await expect(actions.getByRole('link', { name: '开始阅读' })).toHaveCount(0);
  await expect(actions.locator('a[href="https://example.com/retired-book-site"]')).toHaveCount(0);
  await expect(readAction).toHaveText('开始阅读');
  await expect(readAction).toHaveAttribute('href', /\/books\/202\/read\//);
  await expect(bookTag).toHaveCSS('border-top-left-radius', '3px');
  await expect(heart).toContainText('6');
  await expect(heart.locator('.rin-icon--heart')).toBeVisible();
  await expect(collection).toContainText('9');
  await expect(collection).toContainText('收藏');
  await expect(tip.locator('.rin-icon--gift')).toBeVisible();
  await expect(tip).toContainText('8');
  await expect(report.locator('.rin-icon--flag')).toBeVisible();
  await expect(report).toContainText('4');
  const actionLabels = actions.locator('.detail-action-label, .wallet-tip-label');
  await expect(actionLabels).toHaveCount(4);
  if ((page.viewportSize()?.width ?? 0) <= 720) {
    for (let index = 0; index < await actionLabels.count(); index += 1) {
      await expect(actionLabels.nth(index)).toBeHidden();
    }
    await expect(readAction).toHaveCSS('min-height', '44px');
    expect((await readAction.boundingBox())?.width).toBeGreaterThan(250);
  } else {
    await expect(actionLabels.first()).toBeVisible();
  }
  const bookIconSizes = await Promise.all([
    collection.locator('.rin-icon').boundingBox(),
    tip.locator('.rin-icon').boundingBox(),
    report.locator('.rin-icon').boundingBox(),
  ]);
  expect(bookIconSizes.map((box) => [box?.width, box?.height])).toEqual([
    [16, 16],
    [16, 16],
    [16, 16],
  ]);
  const heartBeforeCollection = await heart.evaluate((element) => {
    const collectionElement = element.parentElement?.querySelector(
      'button[aria-label*="收藏"]',
    );
    return Boolean(
      collectionElement &&
      (element.compareDocumentPosition(collectionElement) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
  });
  expect(heartBeforeCollection).toBe(true);
  const bookOrder = await actions.evaluate((row) =>
    Array.from(row.children).map((item) => item.getAttribute('aria-label') || item.textContent?.trim() || ''),
  );
  expect(bookOrder.findIndex((label) => label.includes('收藏'))).toBeLessThan(bookOrder.findIndex((label) => label.includes('打赏')));
  expect(bookOrder.findIndex((label) => label.includes('打赏'))).toBeLessThan(bookOrder.findIndex((label) => label.includes('举报')));

  const topRightActions = actions.locator(':scope > a, :scope > button');
  for (let index = 0; index < await topRightActions.count(); index += 1) {
    const action = topRightActions.nth(index);
    await expect(action).toHaveCSS('border-top-width', '0px');
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(action).toHaveCSS('box-shadow', 'none');
  }
  await report.hover();
  await expect(report).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(report).toHaveCSS('opacity', '1');
  expect(await report.evaluate((element) => getComputedStyle(element).color)).not.toBe('rgba(0, 0, 0, 0)');

  await heart.click();
  const activeHeart = actions.getByRole('button', { name: /已喜欢，7 次/ });
  await expect(activeHeart).toContainText('7');
  await expect(activeHeart.locator('.rin-icon--heart-fill')).toHaveAttribute('fill', 'currentColor');
  expect(likePayload).toMatchObject({
    targetType: 'post',
    slug: 'book-actions',
    bookmark: true,
    isCancel: false,
  });
  await report.click();
  await expect(page.getByRole('dialog', { name: '举报' })).toBeVisible();
});

test('PDF book uses the primary reading action instead of header PDF links', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'reader-7' }));
  });
  await page.route('**/auth/v1/user/me**', (route) => route.fulfill({
    json: { sub: 'reader-7', username: 'reader' },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('reader-7', 'reader') });
      return;
    }
    if (pathname === '/api/content/203') {
      await route.fulfill({ json: pdfBookFixture });
      return;
    }
    if (pathname === '/api/revisions') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/books/203/related') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/books/203/reviews') {
      await route.fulfill({
        json: {
          items: [],
          rating: { averageScore: 0, reviewCount: 0, breakdown: [] },
        },
      });
      return;
    }
    if (pathname === '/api/books/203/activity') {
      await route.fulfill({
        json: {
          bookId: '203',
          items: [],
          counts: {
            discussion: 0,
            question: 0,
            blog: 0,
            errata: 0,
            openErrata: 0,
          },
          total: 0,
        },
      });
      return;
    }
    if (pathname === '/api/meta/reaction') {
      await route.fulfill({ json: { reaction_summary: [] } });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({ json: profileFixture });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto('/books/203/pdf-book-actions', { waitUntil: 'domcontentloaded' });

  const actions = page.locator('.book-detail-header .blog-header-actions');
  const readAction = page.locator('.book-detail-hero .book-detail-read-action');
  await expect(actions).toBeVisible({ timeout: 20_000 });
  await expect(actions.getByText('View PDF', { exact: true })).toHaveCount(0);
  await expect(actions.getByRole('link', { name: '开始阅读' })).toHaveCount(0);
  await expect(readAction).toHaveText('开始阅读');
  await expect(readAction).toHaveAttribute('href', '/fixtures/original-book.pdf');
  await expect(readAction).toHaveAttribute('target', '_blank');
  expect(await readAction.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('.book-detail-header .blog-header-tags a', { hasText: 'PDF 标签' }))
    .toHaveCSS('border-top-left-radius', '3px');
  expect(consoleErrors).toEqual([]);
});

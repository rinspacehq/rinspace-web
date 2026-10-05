import { expect, test, type Locator } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

// Typst candidate acceptance for the browser layer (T25).
//
// The reader renders whatever the Typst adapter stored: the web pages the
// reader paginates, the outline nodes of the TOC, and the physical PDF page
// count recorded in book metadata are three independent numbers. A reference
// that lives on another reader page carries `data-rin-page`, and the reader
// must open the declared page instead of re-scanning the book.
//
// The creation entries are compiled into the artifact from
// `VITE_RINSPACE_TYPST_CREATE_ENABLED`, so this spec reads
// `RINSPACE_UI_TYPST_CREATE_ENABLED=1` to learn how the served build was made:
// when it is off the Typst entries must be absent, when it is on they must open
// the Typst dialogs. See specs/typst-publishing-and-attribution/evidence/
// typst-acceptance-matrix-t25-20260917.md for the exact build command.

const typstCreateEnabled =
  process.env.RINSPACE_UI_TYPST_CREATE_ENABLED === '1';

const commit = 'c'.repeat(40);
const now = new Date().toISOString();
const chapterOneBlock = `rb_${'3'.repeat(32)}`;
const chapterTwoBlock = `rb_${'4'.repeat(32)}`;

const typstBook = {
  id: '303',
  slug: 'typst-reader',
  type: 'book',
  title: 'Typst 书籍阅读验收',
  author: 'Lunifans',
  authorId: 'lunifans',
  authorUid: 'user-42',
  authorAvatar: '',
  authorRank: 1403,
  meta: '浏览器验收',
  excerpt: 'Typst 书籍阅读页验收夹具。',
  interactions: '12 阅读',
  heat: '12',
  tags: [],
  images: [],
  coverUrl: '',
  editor: 'typst',
  body: '',
  book: {
    kind: 'typst',
    bookTitle: 'Typst 书籍阅读验收',
    numberOfPages: '9',
  },
  readCount: 12,
  collected: false,
  liked: false,
  likeCount: 0,
  createdAt: now,
  updatedAt: now,
};

const typstArticle = {
  ...typstBook,
  id: '304',
  slug: 'typst-article',
  type: 'blog',
  title: 'Typst 文章渲染验收',
  excerpt: 'Typst 文章渲染验收夹具。',
  editor: 'typst',
  book: undefined,
  body: '[[RIN_WRITER]]<h2 id="intro">引言</h2><p>Typst 文章由服务端渲染为 HTML。</p><h2 id="method">方法</h2><p>表世界只负责呈现最终 HTML。</p>[[/RIN_WRITER]]',
};

const toc = [
  { id: 'chapter-1', text: '第一章', level: 2 },
  { id: 'chapter-2', text: '第二章', level: 2 },
  { id: 'appendix-note', text: '附录说明', level: 4 },
];

function readerPage(pageId: string, pageIndex: number, html: string) {
  return {
    post: typstBook,
    toc,
    page: { id: pageId, text: '第一章', level: 2, html },
    pageIndex,
    pageCount: 2,
    source: 'stored',
    anchorVersion: 'rin-document-bundle/v2',
    publicationCommit: commit,
    capabilities: {
      annotationsRead: false,
      annotationsWrite: false,
      annotationsWriteAvailable: false,
      erratumSync: false,
      erratumSyncAvailable: false,
    },
  };
}

const readerPages: Record<string, ReturnType<typeof readerPage>> = {
  'chapter-1': readerPage(
    'chapter-1',
    0,
    `<h2 id="chapter-1" data-rin-block-id="${chapterOneBlock}" data-rin-block-kind="heading">第一章</h2>`
      + '<p>正文见 <a class="rin-reader-ref" href="#chapter-2" data-rin-page="chapter-2">第二章</a>。</p>'
      + '<p>这一页只包含第一章的内容。</p>',
  ),
  'chapter-2': readerPage(
    'chapter-2',
    1,
    `<h2 id="chapter-2" data-rin-block-id="${chapterTwoBlock}" data-rin-block-kind="heading">第二章</h2>`
      + '<p>这一页是第二章，由跨页引用打开。</p>',
  ),
};

async function installFixture(
  page: import('@playwright/test').Page,
  requestedSections: string[] = [],
) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'rinspace-auth-hint',
      JSON.stringify({ sub: 'reader-9' }),
    );
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });
  await page.route('**/auth/v1/user/me', (route) =>
    route.fulfill({ json: { sub: 'reader-9', username: 'reader' } }),
  );
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('reader-9', 'reader') });
      return;
    }
    if (pathname === '/api/books/303/read') {
      const section = url.searchParams.get('section') || 'chapter-1';
      requestedSections.push(section);
      await route.fulfill({ json: readerPages[section] || readerPages['chapter-1'] });
      return;
    }
    if (pathname === '/api/content/303') {
      await route.fulfill({ json: typstBook });
      return;
    }
    if (pathname === '/api/content/304') {
      await route.fulfill({ json: typstArticle });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function openPublishMenu(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: '频道与账户' });
  if (isMobileProject(testInfo)) {
    // On touch widths the publish entries are nested inside the compact «更多»
    // menu. Tap instead of click: a mouse pointer parked over the trigger makes
    // Radix close the freshly opened submenu again, while a finger is faithful
    // to how the entries are reached on a phone.
    await navigation.getByRole('button', { name: '更多' }).tap();
    await page.getByRole('menuitem', { name: '创作', exact: true }).tap();
  } else {
    await navigation.getByRole('button', { name: '创作' }).click();
  }
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  return menu;
}

function isMobileProject(testInfo: import('@playwright/test').TestInfo) {
  return testInfo.project.name.startsWith('mobile-');
}

async function activate(locator: Locator, testInfo: import('@playwright/test').TestInfo) {
  if (isMobileProject(testInfo)) {
    await locator.tap();
    return;
  }
  await locator.click();
}

test('Typst reader keeps web pages, outline nodes, and PDF pages apart', async ({
  page,
}, testInfo) => {
  await installFixture(page);
  await page.goto('/books/303/read/typst-reader', { waitUntil: 'domcontentloaded' });

  const webPages = page.locator('[data-rin-reader-web-pages]');
  const nodes = page.locator('[data-rin-reader-toc-nodes]');
  const pdfPages = page.locator('[data-rin-reader-pdf-pages]');
  await expect(webPages).toHaveAttribute('data-rin-reader-web-pages', '2', {
    timeout: 20_000,
  });
  await expect(nodes).toHaveAttribute('data-rin-reader-toc-nodes', '3');
  await expect(pdfPages).toHaveAttribute('data-rin-reader-pdf-pages', '9');

  const tocNav = page.locator('nav.book-reader-toc');
  if (testInfo.project.name.startsWith('desktop-')) {
    await expect(tocNav).toBeVisible();
    await expect(tocNav).toContainText('2 网页页');
    await expect(tocNav).toContainText('3 目录项');
    await expect(tocNav).toContainText('PDF 9 页');
  } else {
    await expect(tocNav).toBeAttached();
    await expect(tocNav).toContainText('2 网页页');
  }

  await expect(
    page.locator(`[data-rin-block-id="${chapterOneBlock}"]`),
  ).toBeVisible();
  // T22 closed the annotation layer for the Typst candidate: capabilities are
  // false, so no annotation affordance may be offered on a typed page.
  await expect(page.locator('.book-annotation-cross-trigger')).toHaveCount(0);
});

test('Typst cross-page reference opens the page declared by data-rin-page', async ({
  page,
}, testInfo) => {
  test.skip(
    !['desktop-light', 'mobile-light'].includes(testInfo.project.name),
    'One desktop and one mobile browser cover the reader navigation.',
  );
  const requestedSections: string[] = [];
  await installFixture(page, requestedSections);
  await page.goto('/books/303/read/typst-reader', { waitUntil: 'domcontentloaded' });

  const reference = page.locator('a.rin-reader-ref[data-rin-page="chapter-2"]');
  await expect(reference).toBeVisible({ timeout: 20_000 });
  await expect(reference).toHaveAttribute('href', '#chapter-2');
  await reference.click();

  await expect(
    page.locator(`[data-rin-block-id="${chapterTwoBlock}"]`),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/#chapter-2$/);
  expect(requestedSections).toContain('chapter-2');
  // The reader must fetch the declared owner page, not rescan the book.
  expect(requestedSections.filter((section) => section === 'chapter-2')).toHaveLength(1);
});

test('Typst table of contents navigates to its page', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-light',
    'The reader TOC is a desktop rail; one browser covers it.',
  );
  const requestedSections: string[] = [];
  await installFixture(page, requestedSections);
  await page.goto('/books/303/read/typst-reader', { waitUntil: 'domcontentloaded' });

  const tocNav = page.locator('nav.book-reader-toc');
  await expect(tocNav).toBeVisible({ timeout: 20_000 });
  await tocNav.getByRole('button', { name: '第二章' }).click();
  await expect(
    page.locator(`[data-rin-block-id="${chapterTwoBlock}"]`),
  ).toBeVisible({ timeout: 20_000 });
  expect(requestedSections).toContain('chapter-2');
});

test('Typst article renders the stored HTML without exposing markers', async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name.startsWith('desktop-');
  if (desktop) {
    // The reader TOC rail is a wide-viewport reading aid: the stylesheet hides
    // `.blog-toc-side` below 1360px and Desktop Chrome defaults to 1280px, so
    // widen the window before asserting on the rail a desktop reader sees.
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await installFixture(page);
  await page.goto('/a/304/typst-article', { waitUntil: 'domcontentloaded' });

  const article = page.locator('.rin-writer-article');
  await expect(article).toBeVisible({ timeout: 20_000 });
  await expect(
    article.getByRole('heading', { name: '引言', exact: true }),
  ).toBeVisible();
  await expect(
    article.getByRole('heading', { name: '方法', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('[[RIN_WRITER]]')).toHaveCount(0);
  await expect(page.getByText('[[/RIN_WRITER]]')).toHaveCount(0);

  const tocNav = page.locator('nav.blog-toc');
  if (!desktop) {
    // Below the reading-rail breakpoint the outline stays out of the layout
    // and out of the accessibility tree.
    await expect(tocNav).toBeHidden();
    return;
  }

  await expect(tocNav).toBeVisible();
  await expect(tocNav).toHaveAttribute('aria-label', '文章目录');
  const introLink = tocNav.getByRole('link', { name: '引言' });
  await expect(introLink).toBeAttached();
  await introLink.click();
  await expect(page).toHaveURL(/#intro$/);
});

test('Typst creation entries follow the artifact feature flag', async ({
  page,
}, testInfo) => {
  test.skip(
    !['desktop-light', 'mobile-light'].includes(testInfo.project.name),
    'One desktop and one mobile browser cover the publish menu.',
  );
  await installFixture(page);
  await openPublishMenu(page, testInfo);

  const articleMenu = page.getByRole('menuitem', { name: /文章/ }).first();
  const bookMenu = page.getByRole('menuitem', { name: /书籍/ }).first();
  await expect(articleMenu).toBeVisible();
  await expect(bookMenu).toBeVisible();

  // The Typst entries live inside Radix submenus, which mount their content on
  // demand: each entry is asserted only while its own submenu is open.
  const typstMark = page.locator('.typst-menu-mark');
  const typstItem = page.getByRole('menuitem', { name: 'Typst' });

  await activate(articleMenu, testInfo);
  await expect(articleMenu).toHaveAttribute('aria-expanded', 'true');
  if (!typstCreateEnabled) {
    // The artifact was built without VITE_RINSPACE_TYPST_CREATE_ENABLED: the
    // Typst entries must not exist, and no Typst mark may leak into the menu.
    await expect(typstItem).toHaveCount(0);
    await expect(typstMark).toHaveCount(0);
  } else {
    await expect(typstMark).toHaveCount(1);
    await activate(typstItem, testInfo);
    const dialog = page
      .locator('.publish-create-dialog, .latex-blog-dialog')
      .last();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.locator('.auth-dialog-title')).toHaveText(
      '创建 Typst 文章',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Selecting the item closed the publish menu; reopen it for the book entry.
    await openPublishMenu(page, testInfo);
  }

  await activate(bookMenu, testInfo);
  await expect(bookMenu).toHaveAttribute('aria-expanded', 'true');
  if (!typstCreateEnabled) {
    await expect(typstItem).toHaveCount(0);
    await expect(typstMark).toHaveCount(0);
    return;
  }

  await expect(typstMark).toHaveCount(1);
  await activate(typstItem, testInfo);
  const bookDialog = page
    .locator('.publish-create-dialog, .latex-blog-dialog')
    .last();
  await expect(bookDialog).toBeVisible({ timeout: 10_000 });
  await expect(bookDialog.locator('.auth-dialog-title')).toHaveText(
    '创建 Typst 书籍',
  );
});

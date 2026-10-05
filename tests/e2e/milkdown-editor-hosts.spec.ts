import { expect, test } from '@playwright/test';

import { identitySessionMock } from './identity-session-mock';

const now = new Date().toISOString();
const markdownProject = {
  version: '0.1',
  title: '代数几何讲义',
  files: [
    {
      id: 'chapter-1',
      path: '01-schemes.md',
      title: '概形',
      body: '# 概形\n\n作者正文',
      level: 2,
    },
  ],
  toc: [{ id: 'chapter-1', text: '概形', level: 2 }],
  pages: [{ id: 'chapter-1', text: '概形', level: 2, html: '<h1>概形</h1><p>作者正文</p>' }],
};

const markdownBook = {
  id: 'book-42',
  slug: 'algebraic-geometry',
  type: 'book',
  title: '代数几何讲义',
  author: 'Author',
  authorId: 'author-1',
  authorUid: 'author-1',
  authorAvatar: '',
  authorRank: 1,
  meta: '浏览器验收',
  excerpt: 'Markdown 书籍章节编辑器验收夹具。',
  interactions: '',
  heat: '0',
  tags: ['algebraic-geometry'],
  images: [],
  coverUrl: '',
  editor: 'markdown',
  body: `[[RIN_MARKDOWN_BOOK]]\n${JSON.stringify(markdownProject)}\n[[/RIN_MARKDOWN_BOOK]]`,
  book: {
    kind: 'markdown',
    bookTitle: '代数几何讲义',
    authors: ['Author'],
  },
  readCount: 0,
  collected: false,
  liked: false,
  likeCount: 0,
  createdAt: now,
  updatedAt: now,
};

async function installMilkdownHostFixture(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    });
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'author-1' }));
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });
  await page.route('**/auth/v1/user/me**', (route) => route.fulfill({
    json: { sub: 'author-1', username: 'author' },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('author-1', 'author') });
      return;
    }
    if (pathname === '/api/content/book-42') {
      await route.fulfill({ json: markdownBook });
      return;
    }
    if (pathname === '/api/rin-writer/draft') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

test('Markdown book sections use the shared Milkdown behavior on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(
    !['desktop-light', 'mobile-light'].includes(testInfo.project.name),
    'The shared editor needs one desktop and one touch viewport acceptance run.',
  );

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installMilkdownHostFixture(page);
  await page.goto('/books/book-42/workspace/markdown/chapter-1', {
    waitUntil: 'domcontentloaded',
  });

  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await expect(editor.locator('h1')).toHaveText('概形');
  await expect(page.getByRole('button', { name: '插入公式' })).toBeAttached();
  const quiverButton = page.getByRole('button', { name: '插入交换图' });
  await expect(quiverButton).toBeAttached();
  await quiverButton.click();
  await expect(page.getByRole('region', { name: 'Quiver 交换图编辑器' })).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('region', { name: 'Quiver 交换图编辑器' })).toHaveCount(0);

  const lastParagraph = editor.locator('p').last();
  await lastParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# 余切复形');

  const secondHeading = editor.locator('h2', { hasText: '余切复形' });
  await expect(secondHeading).toBeVisible();
  await expect(editor.locator('h1')).toHaveCount(1);

  // A mobile tap may place the caret inside the heading, so choose its end
  // explicitly before checking the Markdown math input rule.
  await secondHeading.evaluate((heading) => {
    heading.closest<HTMLElement>('[contenteditable="true"]')?.focus();
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$x^2+y^2$$');

  const latexBlock = editor.locator('.rin-latex-block');
  await expect(latexBlock).toHaveCount(1);
  await expect(latexBlock.locator('.cm-content')).toHaveText('x^2+y^2');
  await latexBlock.click();
  const latexPanel = page.locator('.rin-latex-editor-panel');
  await expect(latexPanel).toBeVisible();
  await latexPanel.getByRole('button', { name: '完成' }).click();
  await expect(latexPanel).toHaveCount(0);
  await expect(editor.locator('span[data-type="math_inline"]')).toHaveCount(0);
  await expect(editor.locator('p').filter({ hasText: '$$' })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('Markdown articles use the shared formula and Quiver dialogs', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(
    !['desktop-light', 'mobile-light'].includes(testInfo.project.name),
    'The shared editor needs one desktop and one touch viewport acceptance run.',
  );

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installMilkdownHostFixture(page);
  await page.goto('/write/markdown', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '数学' }).click();
  const latexPanel = page.locator('.rin-latex-editor-panel');
  await expect(latexPanel).toBeVisible();
  await latexPanel.getByRole('button', { name: '完成' }).click();
  await expect(latexPanel).toHaveCount(0);

  await page.getByRole('button', { name: 'Quiver' }).click();
  const quiverDialog = page.getByRole('region', { name: 'Quiver 交换图编辑器' });
  await expect(quiverDialog).toBeVisible();
  await quiverDialog.getByRole('button', { name: '取消' }).click();
  await expect(quiverDialog).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

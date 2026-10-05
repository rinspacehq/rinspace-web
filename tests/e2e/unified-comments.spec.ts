import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const createdAt = (minute: number) =>
  `2026-08-25T00:${String(minute).padStart(2, '0')}:00Z`;

const comment = (
  id: number,
  body: string,
  minute: number,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  targetType: 'post',
  targetId: 77,
  author: `用户 ${id}`,
  authorId: `user-${id}`,
  authorUid: `uid-${id}`,
  authorAvatar: '',
  authorRank: 64 + id,
  body,
  voteCount: 0,
  upVoteCount: 0,
  downVoteCount: 0,
  viewerVoteStatus: 'none',
  createdAt: createdAt(minute),
  updatedAt: createdAt(minute),
  ...overrides,
});

const root = comment(100, '**热门评论**\n\n- 观点一\n- 观点二', 1, {
  upVoteCount: 20,
  downVoteCount: 1,
});
const replies = Array.from({ length: 5 }, (_, index) =>
  comment(
    101 + index,
    index === 0
      ? '@[琳](user:rin) 回复内容 :rin_confused:'
      : `回复内容 ${index + 1}`,
    2 + index,
    {
    parentId: index ? 100 + index : 100,
    replyToCommentId: index ? 100 + index : 100,
    replyToAuthor: index ? `用户 ${100 + index}` : '用户 100',
    replyToAuthorId: index ? `user-${100 + index}` : 'user-100',
    replyToAuthorUid: index ? `uid-${100 + index}` : 'uid-100',
    },
  ),
);
const moreRoots = Array.from({ length: 8 }, (_, index) =>
  comment(
    200 + index,
    `用于长评论区验收的评论 ${index + 1}`,
    10 + index,
    { upVoteCount: 8 - index, downVoteCount: index % 2 },
  ),
);

const post = {
  id: '77',
  slug: '77',
  type: 'blog',
  status: 'published',
  repositoryStatus: 'published',
  sourceVisibility: 'open',
  title: '统一评论区浏览器验收',
  author: '作者',
  authorId: 'author',
  authorUid: 'author-uid',
  meta: '文章 · 作者',
  excerpt: '评论区验收正文',
  tags: [],
  interactions: '0 阅读 · 14 评论',
  heat: '已发布',
  body: '[[RIN_WRITER]]<p>用于评论区验收的正文。</p>[[/RIN_WRITER]]',
  createdAt: createdAt(0),
  updatedAt: createdAt(0),
};

const currentUser = {
  id: 'browser-user',
  created_at: 0,
  last_login_date: 0,
  username: 'browser-user',
  display_name: '验收用户',
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
  access_token: 'browser-test',
  role_id: 1,
  role_name: 'user',
  rank: 96,
  status: 'normal',
  have_password: true,
  visit_token: '',
  suspended_until: 0,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'browser-user' }));
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('browser-user', 'browser-user') });
      return;
    }
    if (
      route.request().method() === 'POST' &&
      pathname === '/api/file'
    ) {
      await route.fulfill({ json: 'https://cdn.example.test/comments/proof.png' });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.abort();
      return;
    }
    if (pathname === '/api/content/77') {
      await route.fulfill({ json: post });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [root, ...replies, ...moreRoots] } });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({ json: currentUser });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });
});

test('blog comments share Markdown, reply, vote and floating composer behavior', async ({ page }, testInfo) => {
  test.skip(!['desktop-light', 'mobile-light'].includes(testInfo.project.name));
  const routePrefix = process.env.RINSPACE_TEST_ROUTE_PREFIX || '';
  await page.goto(`${routePrefix}/a/77`);
  await expect(page.locator('#comment-207')).toBeVisible({ timeout: 20_000 });

  await expect(page.locator('.content-comment-heading h2')).toContainText('评论 14');
  await expect(page.locator('.content-comment-floating')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '热门' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.content-comment-primary-composer .cm-gutters')).toHaveCount(0);
  await expect(page.locator('#content-comment-composer .rin-ui-field > label')).toHaveCount(0);
  await expect(page.locator('.content-comment-primary-composer .cm-content')).toHaveAttribute('aria-label', '评论');
  await expect(page.locator('#comment-101 .cultivation-badge')).toBeVisible();
  await expect(page.locator('#comment-101 .mention-link')).toHaveAttribute('href', /\/@rin$/);
  await expect(page.locator('#comment-101 img.rin-sticker-inline')).toHaveAttribute('alt', '困惑');
  const primaryEditor = page.locator('.content-comment-primary-composer .cm-content');
  await page
    .locator('.content-comment-primary-composer input[type="file"]')
    .setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from('comment-image'),
    });
  await expect(primaryEditor).toContainText(
    '![proof](https://cdn.example.test/comments/proof.png)',
  );
  await primaryEditor.click();
  await primaryEditor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await primaryEditor.press('Backspace');
  await expect(page.locator('#comment-100').getByRole('button', { name: '点赞 20' })).toBeVisible();
  await expect(page.locator('#comment-100').getByRole('button', { name: '点踩 1' })).toBeVisible();
  await expect(page.locator('#comment-100 .content-comment-item.is-reply')).toHaveCount(3);

  await page.getByRole('button', { name: '共 5 条回复，展开' }).click();
  await expect(page.locator('#comment-100 .content-comment-item.is-reply')).toHaveCount(5);

  await page.getByRole('tab', { name: '最新' }).click();
  await expect(page.locator('.content-comment-list > .content-comment-item').first()).toHaveAttribute('id', 'comment-207');

  await page.locator('#comment-204').scrollIntoViewIfNeeded();
  await expect(page.locator('.content-comment-floating')).toBeVisible();
  await page.getByRole('button', { name: '展开评论编辑器' }).click();
  const editor = page.locator('.content-comment-floating .cm-content');
  await editor.click();
  await page.evaluate(
    ({ plain, html }) => {
      const target = document.querySelector('.content-comment-floating .cm-content');
      const data = new DataTransfer();
      data.setData('text/plain', plain);
      data.setData('text/html', html);
      target?.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    },
    {
      plain: '# 评论标题\n\n- 一项\n- 二项',
      html: '<pre style="font-family: monospace"># 评论标题</pre>',
    },
  );
  await expect(editor).toContainText('# 评论标题');
  await expect(editor).toContainText('- 一项');

  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await editor.press('Backspace');
  await expect(editor).toHaveText('');
});

import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const publishedAt = '2026-08-19T05:30:00Z';
const contentUpdatedAt = '2026-08-23T12:04:00Z';

const baseItem = {
  status: 'published',
  repositoryStatus: 'published',
  sourceVisibility: 'open',
  author: 'Lunifans',
  authorId: 'lunifans',
  authorUid: 'uid-lunifans',
  authorAvatar: '',
  authorRank: 96,
  meta: '编辑精选',
  tags: ['Hodge 理论'],
  interactions: '4200 阅读 · 8 收藏 · 5 评论',
  heat: '精选',
  readCount: 4200,
  favoriteCount: 8,
  commentCount: 5,
  shareCount: 3,
  publishedAt,
  contentUpdatedAt,
  createdAt: publishedAt,
  updatedAt: contentUpdatedAt,
  reaction_summary: [
    { emoji: 'heart', count: 12, tooltip: '', is_active: true },
    { emoji: 'smile', count: 0, tooltip: '', is_active: false },
    { emoji: 'frown', count: 0, tooltip: '', is_active: false },
  ],
};

const blog = {
  ...baseItem,
  id: '77',
  type: 'blog',
  title: 'Existence and density of Hodge structures',
  excerpt: '这是一篇关于 Hodge 理论的论文阅读笔记。',
};

const dynamic = {
  ...baseItem,
  id: '78',
  type: 'dynamic',
  title: '关于社区卡片的一条动态',
  excerpt: '今天重新整理了社区流的卡片层级。',
};

const discussion = {
  ...baseItem,
  id: '79',
  type: 'discussion',
  title: '如何统一社区卡片的视觉语言',
  excerpt: '讨论深色模式下的信息层级和操作密度。',
  readCount: 860,
  replyCount: 9,
  commentCount: 9,
  favoriteCount: 4,
  lastReplyAt: contentUpdatedAt,
};

const question = {
  ...baseItem,
  id: '80',
  type: 'question',
  title: '深色卡片的对比度应该如何处理？',
  excerpt: '希望卡片背景、正文和次要信息能有稳定的对比。',
  readCount: 640,
  voteScore: 6,
  answerCount: 3,
  favoriteCount: 5,
};

const book = {
  ...baseItem,
  id: '88',
  type: 'book',
  title: '面向物理系的线性代数',
  excerpt: '从物理学问题出发介绍线性代数中的主要概念。',
  readCount: 1900,
  favoriteCount: 18,
  commentCount: 7,
  shareCount: 3,
  book: {
    kind: 'original',
    bookTitle: '面向物理系的线性代数',
    authors: ['Elysium'],
    publisher: '科学出版社',
    numberOfPages: '356',
  },
  bookRating: {
    averageScore: 9.6,
    reviewCount: 28,
    breakdown: [],
  },
};

const pdfBook = {
  ...book,
  id: '89',
  title: '原创 PDF 数学讲义',
  book: {
    ...book.book,
    bookTitle: '原创 PDF 数学讲义',
    pdfUrl: '/fixtures/original-book.pdf',
  },
};

const markdownBook = {
  ...book,
  id: '90',
  title: 'Markdown 代数笔记',
  editor: 'markdown',
  book: {
    ...book.book,
    kind: 'markdown',
    bookTitle: 'Markdown 代数笔记',
  },
};

const publishedBook = {
  ...book,
  id: '91',
  title: '不应出现的出版书籍',
  book: {
    ...book.book,
    kind: 'copyrighted',
    bookTitle: '不应出现的出版书籍',
    pdfUrl: '/fixtures/published-book.pdf',
  },
};

const tagActivity = {
  id: '5815',
  revisionId: '701',
  type: 'tag',
  title: '更新了标签：Weil Pairings',
  author: 'Lunifans',
  authorId: 'lunifans',
  authorUid: 'uid-lunifans',
  authorAvatar: '',
  authorRank: 96,
  meta: '标签 · 更新',
  excerpt: 'A pairing on torsion points.',
  tags: ['weil-pairings'],
  tagItems: [{ tagId: '5815', slugName: 'weil-pairings', displayName: 'Weil Pairings' }],
  interactions: '2 内容 · 11 关注',
  heat: '更新',
  readCount: 128,
  likeCount: 7,
  liked: false,
  followCount: 11,
  isFollowed: true,
  shareCount: 4,
  publishedAt,
  contentUpdatedAt: publishedAt,
  createdAt: publishedAt,
};

const comments = [
  {
    id: 1,
    targetType: 'post',
    targetId: 77,
    author: 'Lunifans',
    authorId: 'lunifans',
    authorUid: 'uid-lunifans',
    authorAvatar: '',
    authorRank: 40,
    body: '第一条根评论',
    voteCount: 12,
    upVoteCount: 12,
    downVoteCount: 0,
    viewerVoteStatus: 'none',
    createdAt: '2026-08-25T13:32:00Z',
    updatedAt: '2026-08-25T13:32:00Z',
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    id: index + 2,
    targetType: 'post',
    targetId: 77,
    parentId: 1,
    replyToCommentId: 1,
    replyToAuthor: '第一位用户',
    author: `回复用户 ${index + 1}`,
    authorAvatar: '',
    authorRank: 20,
    body: `第 ${index + 1} 条回复`,
    voteCount: index,
    upVoteCount: index,
    downVoteCount: 0,
    viewerVoteStatus: 'none',
    createdAt: `2026-08-25T13:${String(33 + index).padStart(2, '0')}:00Z`,
    updatedAt: `2026-08-25T13:${String(33 + index).padStart(2, '0')}:00Z`,
  })),
];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.includes('tcloudbasegateway.com')) {
      await route.fulfill({ status: 401, json: { message: 'anonymous' } });
      return;
    }
    if (url.hostname === 'api.github.com' && url.pathname === '/orgs/rinspacehq/repos') {
      await route.fulfill({
        json: [
          { name: 'markdown-writer', fork: false, archived: false, disabled: false, stargazers_count: 42 },
          { name: 'rinspace-web', fork: false, archived: false, disabled: false, stargazers_count: 99 },
          { name: 'mastodon', fork: true, archived: false, disabled: false, stargazers_count: 88 },
        ],
      });
      return;
    }
    if (!url.pathname.includes('/api/')) {
      await route.continue();
      return;
    }
    if (url.pathname.endsWith('/api/feed')) {
      await route.fulfill({
        json: {
          featuredBlog: blog,
          stream: [blog, dynamic, discussion, question, book, pdfBook, markdownBook, publishedBook],
          questionHotlist: [],
          community: [],
          announcements: [],
          tasks: [],
          followedTags: [],
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/books') && request.method() === 'GET') {
      await route.fulfill({
        json: {
          items: [book, pdfBook, markdownBook],
          count: 3,
          page: 1,
          pageSize: 24,
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/home/sidebar')) {
      await route.fulfill({
        json: {
          metrics: { todayReads: 0, todayNewFans: 0 },
          hotDiscussions: [],
          recommendedUsers: [],
          source: 'test',
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/tags/activity')) {
      await route.fulfill({
        json: { items: [tagActivity] },
      });
      return;
    }
    if (url.pathname.endsWith('/api/comments')) {
      await route.fulfill({ json: { items: comments } });
      return;
    }
    if (url.pathname.endsWith('/api/books/88/reviews')) {
      await route.fulfill({
        json: {
          items: [{
            id: '9',
            bookId: '88',
            score: 9,
            stars: 4.5,
            body: '适合作为入门材料。',
            author: 'Elysium',
            voteCount: 12,
            voteStatus: 'none',
            createdAt: '2026-08-21T06:26:00Z',
            updatedAt: '2026-08-21T06:26:00Z',
          }],
          rating: { averageScore: 9.6, reviewCount: 28, breakdown: [] },
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
});

test('right rail shows the aggregate GitHub stars card below sponsor', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  const sponsor = page.getByRole('link', { name: '赞助我们' });
  const stars = page.getByRole('link', { name: 'Rinspace 开源项目 GitHub Stars' });
  await expect(stars).toBeVisible();
  await expect(stars.getByText('GITHUB', { exact: true })).toBeVisible();
  await expect(stars.locator('.rin-animate-github-stars__number')).toHaveText('229');
  await expect(stars).toHaveCSS('justify-items', 'start');
  await expect(sponsor.evaluate((element) => {
    const starsCard = document.querySelector('.github-stars-rail-link');
    return starsCard
      ? element.compareDocumentPosition(starsCard) & Node.DOCUMENT_POSITION_FOLLOWING
      : 0;
  })).resolves.toBeTruthy();
  expect(pageErrors).toEqual([]);
});

test('desktop cards preserve original icon metrics and a centered comment dialog', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'));
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
  const dynamicCard = page.locator('.stream-card-dynamic').filter({ hasText: dynamic.excerpt }).first();
  const discussionCard = page.locator('.stream-card-discussion').filter({ hasText: discussion.title }).first();
  const questionCard = page.locator('.stream-card-question').filter({ hasText: question.title }).first();
  const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  const pdfBookCard = page.locator('.home-book-card').filter({ hasText: pdfBook.title }).first();
  const markdownBookCard = page.locator('.home-book-card').filter({ hasText: markdownBook.title }).first();
  const blogTitle = blogCard.locator('h2');
  const bookTitle = bookCard.locator('h2');
  const [blogTitleStyle, bookTitleStyle] = await Promise.all([blogTitle, bookTitle].map((title) => title.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  })));
  expect(bookTitleStyle).toEqual(blogTitleStyle);
  const blogTitleLink = blogTitle.locator('a');
  const bookTitleLink = bookTitle.locator('a');
  await expect(blogTitleLink).toHaveCSS('text-decoration-line', 'none');
  await expect(bookTitleLink).toHaveCSS('text-decoration-line', 'none');
  await blogTitleLink.hover();
  await expect(blogTitleLink).toHaveCSS('text-decoration-line', 'none');
  await bookTitleLink.hover();
  await expect(bookTitleLink).toHaveCSS('text-decoration-line', 'none');
  await expect(blogCard.locator('.content-type-meta-blog .char')).toHaveText('a');
  await expect(blogCard.getByText('2026/08/23 20:04')).toBeVisible();
  await expect(blogCard.getByLabel('发布于 2026/08/19 13:30；更新于 2026/08/23 20:04')).toBeVisible();
  const likeButton = blogCard.getByRole('button', { name: '喜欢，12' });
  await expect(likeButton).toBeVisible();
  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(likeButton.locator('.rin-community-action-icon--heart-fill')).toBeVisible();
  await expect(likeButton.locator('.home-card-action-label')).toHaveCount(0);
  await expect(likeButton.locator('.home-card-action-value')).toHaveText('12');
  await expect(blogCard.getByRole('button', { name: '分享，3' })).toBeVisible();
  await expect(blogCard.getByRole('button', { name: '评论，5' }).locator('.rin-community-action-icon--chat-dots')).toBeVisible();
  await expect(blogCard.getByRole('button', { name: '分享，3' }).locator('.rin-community-action-icon--share')).toBeVisible();
  await expect(blogCard.locator('.home-card-action')).toHaveCount(4);
  await expect(blogCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')?.split('，')[0]),
  )).resolves.toEqual(['喜欢', '收藏', '评论', '分享']);
  await expect(blogCard.locator('.home-card-action-label')).toHaveCount(0);
  await expect(dynamicCard.locator('.stream-dynamic-action-buttons')).toHaveCount(0);
  await expect(dynamicCard.locator('.home-card-action')).toHaveCount(4);
  await expect(dynamicCard.locator('.stream-metrics span')).toHaveText(['4,200 阅读']);
  await expect(discussionCard.locator('.stream-metrics span').allTextContents())
    .resolves.not.toContain('9 回复');
  await expect(discussionCard.locator('.stream-metrics span').allTextContents())
    .resolves.not.toContain('4 收藏');
  await expect(discussionCard.locator('.stream-metrics')).toContainText('860 阅读');
  await expect(discussionCard.locator('.stream-metrics')).toContainText('最后回复');
  await expect(questionCard.locator('.stream-metrics')).not.toContainText('5 收藏');
  await expect(questionCard.locator('.stream-metrics')).toContainText('6 赞同');
  await expect(questionCard.locator('.stream-metrics')).toContainText('3 回答');
  if (testInfo.project.name === 'desktop-dark') {
    await expect(dynamicCard).toHaveCSS('background-color', 'rgb(17, 28, 37)');
    await expect(dynamicCard.locator('.stream-dynamic-lead')).toHaveCSS('color', 'rgb(232, 240, 245)');
    await expect(dynamicCard.locator('.home-card-action').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(bookCard).toHaveAttribute('data-book-format', 'latex');
  await expect(bookCard.locator('.content-type-meta-book .char')).toHaveText('b');
  await expect.poll(async () => Promise.all([
    blogCard.locator('.content-type-meta-blog .label').evaluate((element) => getComputedStyle(element).fontSize),
    bookCard.locator('.content-type-meta-book .label').evaluate((element) => getComputedStyle(element).fontSize),
  ])).toEqual(['11.04px', '11.04px']);
  await expect(pdfBookCard).toHaveAttribute('data-book-format', 'pdf');
  await expect(markdownBookCard).toHaveAttribute('data-book-format', 'markdown');
  await expect(page.locator('.home-book-card').filter({ hasText: publishedBook.title })).toHaveCount(0);
  await bookCard.locator('[data-user-identity="lunifans"]').hover();
  await expect(page.getByLabel('Lunifans 的个人资料预览')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByLabel('Lunifans 的个人资料预览')).toBeHidden();
  if (testInfo.project.name === 'desktop-light') {
    await testInfo.attach('home-blog-card-desktop', {
      body: await blogCard.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach('home-original-book-card-desktop', {
      body: await bookCard.screenshot(),
      contentType: 'image/png',
    });
  }
  if (testInfo.project.name === 'desktop-dark') {
    await testInfo.attach('home-dynamic-card-dark', {
      body: await dynamicCard.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach('home-discussion-card-dark', {
      body: await discussionCard.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach('home-question-card-dark', {
      body: await questionCard.screenshot(),
      contentType: 'image/png',
    });
  }
  await blogCard.getByRole('button', { name: '评论，5' }).click();
  await expect(page.locator('.home-community-dialog')).toBeVisible();
  await expect(page.getByText('第一条根评论')).toBeVisible();
  await expect(page.getByRole('button', { name: '共 5 条回复，展开' })).toBeVisible();
  await expect(page.getByText('作者', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '登录后评论' })).toBeVisible();
  await expect(page.locator('.home-overlay-composer')).toHaveCount(0);
  if (testInfo.project.name === 'desktop-light') {
    await testInfo.attach('home-comment-dialog-desktop', {
      body: await page.locator('.home-community-dialog').screenshot(),
      contentType: 'image/png',
    });
  }
  expect(pageErrors).toEqual([]);
});

test('mobile uses a bottom sheet and book rating keeps Animate UI actions', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'));
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
  const [bookTitleSize, blogTitleSize] = await Promise.all([
    bookCard.locator('h2').evaluate((node) => getComputedStyle(node).fontSize),
    blogCard.locator('h2').evaluate((node) => getComputedStyle(node).fontSize),
  ]);
  expect(bookTitleSize).toBe(blogTitleSize);
  await expect(bookCard.locator('h2 a')).toHaveCSS('text-decoration-line', 'none');
  await expect(blogCard.locator('h2 a')).toHaveCSS('text-decoration-line', 'none');
  await expect(bookCard).toHaveAttribute('data-book-format', 'latex');
  await expect(bookCard.getByText('9.6 分', { exact: true })).toBeVisible();
  await expect(bookCard.getByRole('button', { name: '评分，28' })).toBeVisible();
  await expect(bookCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')?.split('，')[0]),
  )).resolves.toEqual(['评分', '喜欢', '收藏', '评论', '分享']);
  await expect(bookCard.locator('.home-card-action-label')).toHaveCount(0);
  await expect(bookCard.getByRole('button', { name: '评论，7' }).locator('.rin-community-action-icon--chat-dots')).toBeVisible();
  await expect(bookCard.getByRole('button', { name: '分享，3' }).locator('.rin-community-action-icon--share')).toBeVisible();
  await expect(bookCard.locator('[data-user-identity="lunifans"]')).toBeVisible();
  await expect(bookCard.getByText('科学出版社')).toHaveCount(0);
  await expect(bookCard.getByText('原创书籍', { exact: true })).toHaveCount(0);
  if (testInfo.project.name === 'mobile-light') {
    await testInfo.attach('home-original-book-card-mobile', {
      body: await bookCard.screenshot(),
      contentType: 'image/png',
    });
  }
  await bookCard.getByRole('button', { name: '评分，28' }).click();
  await expect(page.locator('.home-community-sheet')).toBeVisible();
  await expect(page.getByText('评分与书评', { exact: true })).toBeVisible();
  await expect(page.getByText('适合作为入门材料。')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.locator('.home-community-sheet')).toHaveCount(0);
  await bookCard.getByRole('button', { name: '评论，7' }).click();
  await expect(page.locator('.home-community-sheet')).toBeVisible();
  await expect(page.getByText('第一条根评论')).toBeVisible();
  await expect(page.getByRole('button', { name: '共 5 条回复，展开' })).toBeVisible();
  await expect(page.getByRole('link', { name: '登录后评论' })).toBeVisible();
  if (testInfo.project.name === 'mobile-light') {
    await testInfo.attach('home-comment-sheet-mobile', {
      body: await page.locator('.home-community-sheet').screenshot(),
      contentType: 'image/png',
    });
  }
  expect(pageErrors).toEqual([]);
});

test('mobile home toolbar and cards use the compact responsive layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');

    const board = page.locator('.community-board');
    const toolbar = page.locator('.home-community-toolbar');
    const viewScroller = page.locator('.community-view-tabs-scroll');
    const modeSelect = page.locator('.home-mobile-mode-select');
    const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
    const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();

    await expect(board).toBeVisible();
    await expect(modeSelect).toBeVisible();
    await expect(page.locator('.home-desktop-mode-tabs')).toBeHidden();
    await expect(page.locator('.community-view-head > strong')).toHaveCount(0);
    await expect(modeSelect).toHaveValue('hot');
    await expect(modeSelect).toHaveCSS('min-height', '34px');
    await expect(viewScroller).toHaveCSS('overflow-x', 'auto');
    await expect(viewScroller).toHaveCSS('scrollbar-width', 'none');

    const boardBox = await board.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    const scrollerBox = await viewScroller.boundingBox();
    const selectBox = await modeSelect.boundingBox();
    expect(boardBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(scrollerBox).not.toBeNull();
    expect(selectBox).not.toBeNull();
    expect(boardBox?.x).toBe(8);
    expect(Math.abs((boardBox?.x || 0) + (boardBox?.width || 0) - (width - 8))).toBeLessThanOrEqual(1);
    expect(Math.abs((scrollerBox?.y || 0) - (toolbarBox?.y || 0))).toBeLessThanOrEqual(1);
    expect((selectBox?.x || 0) + (selectBox?.width || 0)).toBeLessThanOrEqual(width - 8 + 1);

    const viewScrollMetrics = await viewScroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    if (width <= 360) {
      expect(viewScrollMetrics.scrollWidth).toBeGreaterThan(viewScrollMetrics.clientWidth);
      await viewScroller.evaluate((element) => {
        element.scrollLeft = 48;
      });
      expect(await viewScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }

    await page.getByRole('tab', { name: /^(书库|Books)$/ }).click();
    await expect(bookCard).toBeVisible();
    const bookLayout = await bookCard.evaluate((element) => {
      const cover = element.querySelector<HTMLElement>('.home-book-cover');
      const main = element.querySelector<HTMLElement>('.home-book-main');
      const topline = element.querySelector<HTMLElement>('.home-book-topline');
      const type = element.querySelector<HTMLElement>('.content-type-meta');
      const tags = element.querySelector<HTMLElement>('.home-book-topline-tags');
      const time = element.querySelector<HTMLElement>('.home-card-exact-time');
      const footer = element.querySelector<HTMLElement>('.home-book-footer');
      const actions = element.querySelector<HTMLElement>('.home-book-actions');
      const author = element.querySelector<HTMLElement>('.home-book-author .avatar-name');
      const authorName = element.querySelector<HTMLElement>('.home-book-author .avatar-name-text');
      const cultivation = element.querySelector<HTMLElement>('.home-book-author .cultivation-badge');
      if (
        !cover
        || !main
        || !topline
        || !type
        || !tags
        || !time
        || !footer
        || !actions
        || !author
        || !authorName
        || !cultivation
      ) {
        return null;
      }
      const coverBox = cover.getBoundingClientRect();
      const mainBox = main.getBoundingClientRect();
      const toplineBox = topline.getBoundingClientRect();
      const typeBox = type.getBoundingClientRect();
      const tagsBox = tags.getBoundingClientRect();
      const timeBox = time.getBoundingClientRect();
      const footerBox = footer.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      const authorNameBox = authorName.getBoundingClientRect();
      const cultivationBox = cultivation.getBoundingClientRect();
      const descendantBoxes = Array.from(
        element.querySelectorAll<HTMLElement>('.home-book-main *, .home-book-footer *'),
        (child) => child.getBoundingClientRect(),
      );
      return {
        cardRight: element.getBoundingClientRect().right,
        coverRight: coverBox.right,
        coverTop: coverBox.top,
        mainLeft: mainBox.left,
        mainTop: mainBox.top,
        mainRight: mainBox.right,
        toplineRight: toplineBox.right,
        typeBottom: typeBox.bottom,
        tagsBottom: tagsBox.bottom,
        timeTop: timeBox.top,
        footerDirection: getComputedStyle(footer).flexDirection,
        footerWrap: getComputedStyle(footer).flexWrap,
        footerRight: footerBox.right,
        actionsRight: actionsBox.right,
        descendantRight: Math.max(...descendantBoxes.map((box) => box.right)),
        authorDisplay: getComputedStyle(author).display,
        authorWrap: getComputedStyle(author).flexWrap,
        authorNameTop: authorNameBox.top,
        cultivationTop: cultivationBox.top,
        cultivationGridColumn: getComputedStyle(cultivation).gridColumn,
      };
    });
    expect(bookLayout).not.toBeNull();
    expect(bookLayout?.coverRight).toBeLessThan(bookLayout?.mainLeft || 0);
    expect(Math.abs((bookLayout?.coverTop || 0) - (bookLayout?.mainTop || 0))).toBeLessThanOrEqual(1);
    expect(bookLayout?.toplineRight).toBeLessThanOrEqual((bookLayout?.mainRight || 0) + 1);
    expect(bookLayout?.timeTop).toBeGreaterThanOrEqual(
      Math.max(bookLayout?.typeBottom || 0, bookLayout?.tagsBottom || 0) - 1,
    );
    expect(bookLayout?.footerDirection).toBe('row');
    expect(bookLayout?.footerWrap).toBe('wrap');
    expect(Math.abs((bookLayout?.footerRight || 0) - (bookLayout?.actionsRight || 0))).toBeLessThanOrEqual(1);
    expect(bookLayout?.descendantRight).toBeLessThanOrEqual((bookLayout?.cardRight || 0) + 1);
    expect(bookLayout?.authorDisplay).toBe('flex');
    expect(bookLayout?.authorWrap).toBe('wrap');
    expect(bookLayout?.cultivationGridColumn).toBe('auto');
    if (width === 390) {
      expect(Math.abs(
        (bookLayout?.authorNameTop || 0) - (bookLayout?.cultivationTop || 0),
      )).toBeLessThanOrEqual(1);
    }

    await page.getByRole('tab', { name: /^(社区流|Community)$/ }).click();
    await expect(blogCard).toBeVisible();
    const blogFooterLayout = await blogCard.locator('.stream-footer').evaluate((element) => {
      const actions = element.querySelector<HTMLElement>('.home-card-actions');
      if (!actions) return null;
      const footerBox = element.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      return {
        direction: getComputedStyle(element).flexDirection,
        wrap: getComputedStyle(element).flexWrap,
        footerRight: footerBox.right,
        actionsRight: actionsBox.right,
      };
    });
    expect(blogFooterLayout).not.toBeNull();
    expect(blogFooterLayout?.direction).toBe('row');
    expect(blogFooterLayout?.wrap).toBe('wrap');
    expect(Math.abs((blogFooterLayout?.footerRight || 0) - (blogFooterLayout?.actionsRight || 0))).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }

  expect(pageErrors).toEqual([]);
});

test('comment overlay fits narrow desktop and compact mobile widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const viewports = [
    { width: 1024, height: 768, overlay: '.home-community-dialog' },
    { width: 390, height: 844, overlay: '.home-community-sheet' },
    { width: 360, height: 800, overlay: '.home-community-sheet' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
    await expect(blogCard).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await blogCard.getByRole('button', { name: '评论，5' }).click();
    await expect(page.locator(viewport.overlay)).toBeVisible();
    await expect(page.getByRole('link', { name: '登录后评论' })).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
  }
});

test('tag cards use exact time, read metric, and transparent Like Follow Share actions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: '标签' }).click();
  await expect(page.getByText('1 条标签动态', { exact: true })).toBeVisible();

  const tagCard = page.locator('.stream-card-tag').filter({ hasText: tagActivity.title });
  await expect(tagCard).toBeVisible();
  await expect(tagCard.locator('.content-type-meta-tag .char')).toHaveText('t');
  await expect(tagCard.getByText('2026/08/19 13:30')).toBeVisible();
  await expect(tagCard.locator('.stream-metrics')).toHaveText('128 阅读');
  await expect(tagCard.locator('.home-card-action')).toHaveCount(3);
  await expect(tagCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  )).resolves.toEqual(['喜欢，7', '关注，11', '分享，4']);
  await expect(tagCard.getByRole('button', { name: '喜欢，7' })).toHaveAttribute('aria-pressed', 'false');
  await expect(tagCard.getByRole('button', { name: '关注，11' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tagCard.getByRole('button', { name: '分享，4' })
    .locator('.rin-community-action-icon--share')).toBeVisible();
  await expect(tagCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'),
  )).resolves.toBe(true);

  await tagCard.getByRole('button', { name: '喜欢，7' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await tagCard.getByRole('button', { name: '关注，11' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();

  const shareRequest = page.waitForRequest((request) =>
    request.url().includes('/api/content/share') && request.method() === 'POST');
  await tagCard.getByRole('button', { name: '分享，4' }).click();
  const request = await shareRequest;
  expect(request.postDataJSON()).toMatchObject({ targetType: 'tag', targetId: '5815' });
});

test('signed-in tag actions update every visible revision from confirmed responses', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
    window.localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'viewer' }));
  });
  await page.route(/\.api\.tcloudbasegateway\.com\/auth\/v1\//, async (route) => {
    await route.fulfill({ json: { sub: 'viewer', username: 'viewer', nickname: '测试用户' } });
  });
  await page.route('**/api/identity/v1/session', async (route) => {
    await route.fulfill({ json: identitySessionMock('viewer', 'viewer') });
  });
  await page.route('**/api/tags/activity**', async (route) => {
    await route.fulfill({
      json: {
        items: [
          tagActivity,
          {
            ...tagActivity,
            revisionId: '700',
            title: '创建了标签：Weil Pairings',
            publishedAt: '2026-08-18T05:30:00Z',
            contentUpdatedAt: '2026-08-18T05:30:00Z',
            createdAt: '2026-08-18T05:30:00Z',
          },
        ],
      },
    });
  });
  await page.route('**/api/like', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ targetType: 'tag', targetId: '5815' });
    await route.fulfill({
      json: { targetType: 'tag', targetId: '5815', liked: true, likeCount: 8 },
    });
  });
  await page.route('**/api/follows', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      targetType: 'tag',
      targetId: 'weil-pairings',
      isCancel: true,
    });
    await route.fulfill({
      json: { targetType: 'tag', targetId: '5815', following: false, followerCount: 10 },
    });
  });
  await page.route('**/api/content/share', async (route) => {
    await route.fulfill({
      json: { targetType: 'tag', targetId: '5815', shareCount: 5 },
    });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: '标签' }).click();
  const tagCards = page.locator('.stream-card-tag');
  await expect(tagCards).toHaveCount(2);

  await tagCards.first().getByRole('button', { name: '喜欢，7' }).click();
  await expect(tagCards.getByRole('button', { name: '喜欢，8' })).toHaveCount(2);
  await expect(tagCards.getByRole('button', { name: '喜欢，8' }).first()).toHaveAttribute('aria-pressed', 'true');

  await tagCards.last().getByRole('button', { name: '关注，11' }).click();
  await expect(tagCards.getByRole('button', { name: '关注，10' })).toHaveCount(2);
  await expect(tagCards.getByRole('button', { name: '关注，10' }).first()).toHaveAttribute('aria-pressed', 'false');

  await tagCards.first().getByRole('button', { name: '分享，4' }).click();
  await expect(tagCards.getByRole('button', { name: '分享，5' })).toHaveCount(2);
});

test('signed-in card actions keep authoritative counts across success and failure', async ({ page }, testInfo) => {
  test.skip(!['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name));
  const darkTheme = testInfo.project.name.endsWith('-dark');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let reaction = { count: 12, isActive: true };
  let favoriteCount = 8;
  let collected = true;
  let shareCount = 3;
  let reviewCount = 28;
  let failRepositoryLike = true;
  let failCollection = true;
  let failShare = false;
  let failRating = true;
  let feedRequestCount = 0;

  const currentRating = () => ({
    averageScore: reviewCount === 28 ? 9.6 : 9.8,
    reviewCount,
    breakdown: [],
    ...(reviewCount > 28
      ? {
          myReview: {
            id: 'viewer-review',
            bookId: book.id,
            score: 10,
            stars: 5,
            body: '',
            author: '测试用户',
            voteCount: 0,
            voteStatus: 'none',
            createdAt: contentUpdatedAt,
            updatedAt: contentUpdatedAt,
          },
        }
      : {}),
  });
  const currentBlog = () => ({
    ...blog,
    favoriteCount,
    collectionActive: collected,
    shareCount,
    likeSource: 'repository',
    likeCount: reaction.count,
    liked: reaction.isActive,
    reaction_summary: [
      {
        emoji: 'heart',
        count: reaction.count,
        tooltip: '',
        is_active: reaction.isActive,
      },
    ],
  });
  const currentBook = () => ({
    ...book,
    bookRating: currentRating(),
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
    window.localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'viewer' }));
  });

  await page.route(/\.api\.tcloudbasegateway\.com\/auth\/v1\//, async (route) => {
    await route.fulfill({
      json: {
        sub: 'viewer',
        username: 'viewer',
        nickname: '测试用户',
        user_metadata: { username: 'viewer', rank: 30 },
      },
    });
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/identity/v1/session')) {
      await route.fulfill({ json: identitySessionMock('viewer', 'viewer') });
      return;
    }
    if (url.pathname.endsWith('/api/feed')) {
      feedRequestCount += 1;
      await route.fulfill({
        json: {
          featuredBlog: currentBlog(),
          stream: [currentBlog(), currentBook(), pdfBook, markdownBook],
          questionHotlist: [],
          community: [],
          announcements: [],
          tasks: [],
          followedTags: [],
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/books') && request.method() === 'GET') {
      await route.fulfill({
        json: {
          items: [currentBook(), pdfBook, markdownBook],
          count: 3,
          page: 1,
          pageSize: 24,
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/personal/collection/page')) {
      await route.fulfill({
        json: {
          items: [],
          count: 0,
          page: 1,
          pageSize: 100,
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/like') && request.method() === 'POST') {
      if (failRepositoryLike) {
        await route.fulfill({ status: 503, json: { message: '喜欢暂时失败。' } });
        return;
      }
      reaction = { count: 11, isActive: false };
      await route.fulfill({
        json: {
          targetType: 'blog',
          targetId: blog.id,
          liked: reaction.isActive,
          likeCount: reaction.count,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/collections') && request.method() === 'POST') {
      if (failCollection) {
        await route.fulfill({ status: 503, json: { message: '收藏暂时失败。' } });
        return;
      }
      favoriteCount = 7;
      collected = false;
      await route.fulfill({
        json: {
          targetType: 'post',
          targetId: blog.id,
          bookmarked: false,
          collectionCount: favoriteCount,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/content/share') && request.method() === 'POST') {
      if (failShare) {
        await route.fulfill({ status: 503, json: { message: '分享计数暂时失败。' } });
        return;
      }
      shareCount = 4;
      await route.fulfill({
        json: {
          targetType: 'blog',
          targetId: blog.id,
          shareCount,
        },
      });
      return;
    }
    if (url.pathname.endsWith(`/api/books/${book.id}/reviews`)) {
      if (request.method() === 'POST') {
        if (failRating) {
          await route.fulfill({ status: 503, json: { message: '评分暂时失败。' } });
          return;
        }
        reviewCount = 29;
        await route.fulfill({ json: { rating: currentRating() } });
        return;
      }
      await route.fulfill({
        json: {
          items: [],
          rating: currentRating(),
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/');
  await expect.poll(() => feedRequestCount).toBeGreaterThan(0);
  const initialFeedRequestCount = feedRequestCount;
  const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
  const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  const likeButton = blogCard.getByRole('button', { name: '喜欢，12' });
  const collectButton = blogCard.getByRole('button', { name: '收藏，8' });
  const shareButton = blogCard.getByRole('button', { name: '分享，3' });

  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(collectButton).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(likeButton).toHaveCSS('color', darkTheme ? 'rgb(255, 122, 155)' : 'rgb(224, 36, 94)');
  await expect(collectButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(collectButton).toHaveCSS('color', darkTheme ? 'rgb(96, 165, 250)' : 'rgb(37, 99, 235)');
  await expect(blogCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'),
  )).resolves.toBe(true);
  await expect(bookCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'),
  )).resolves.toBe(true);
  await expect(bookCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).boxShadow === 'none'),
  )).resolves.toBe(true);
  await shareButton.hover();
  await expect(shareButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await shareButton.focus();
  await expect(shareButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const failedReactionResponse = page.waitForResponse((response) =>
    response.url().includes('/api/like') && response.request().method() === 'POST');
  await likeButton.click();
  await failedReactionResponse;
  await expect(likeButton).toBeEnabled();
  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton).toHaveAccessibleName('喜欢，12');

  failRepositoryLike = false;
  await likeButton.scrollIntoViewIfNeeded();
  const likeScrollY = await page.evaluate(() => window.scrollY);
  await likeButton.click();
  await expect(blogCard.getByRole('button', { name: '喜欢，11' })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(100);
  expect(feedRequestCount).toBe(initialFeedRequestCount);
  expect(await page.evaluate(() => window.scrollY)).toBe(likeScrollY);

  const failedCollectionResponse = page.waitForResponse((response) =>
    response.url().includes('/api/collections') && response.request().method() === 'POST');
  await collectButton.click();
  await failedCollectionResponse;
  await expect(collectButton).toBeEnabled();
  await expect(collectButton).toHaveAttribute('aria-pressed', 'true');
  await expect(collectButton).toHaveAccessibleName('收藏，8');

  failCollection = false;
  await collectButton.scrollIntoViewIfNeeded();
  const collectionScrollY = await page.evaluate(() => window.scrollY);
  await collectButton.click();
  await expect(blogCard.getByRole('button', { name: '收藏，7' })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(100);
  expect(feedRequestCount).toBe(initialFeedRequestCount);
  expect(await page.evaluate(() => window.scrollY)).toBe(collectionScrollY);
  await expect(
    page.locator('.rin-ui-toast').filter({ hasText: `已取消收藏：${blog.title}` }).last(),
  ).toBeVisible();
  await expect(page.locator('.rin-ui-toast-region')).toHaveCSS('pointer-events', 'none');

  await shareButton.click();
  await expect(blogCard.getByRole('button', { name: '分享，4' })).toBeVisible();
  failShare = true;
  await blogCard.getByRole('button', { name: '分享，4' }).click();
  await expect(blogCard.getByRole('button', { name: '分享，4' })).toBeVisible();

  const ratingButton = bookCard.getByRole('button', { name: '评分，28' });
  await ratingButton.scrollIntoViewIfNeeded();
  const ratingScrollY = await page.evaluate(() => window.scrollY);
  await ratingButton.click();
  const failedRatingResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/books/${book.id}/reviews`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: '提交评价' }).click();
  await failedRatingResponse;
  await expect(page.getByRole('button', { name: '提交评价' })).toBeEnabled();
  await expect(bookCard.locator('.home-card-action[aria-label="评分，28"]')).toHaveCount(1);

  failRating = false;
  await page.getByRole('button', { name: '提交评价' }).click();
  await expect(page.getByText('29 人评价', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - ratingScrollY)).toBeLessThanOrEqual(8);
  const ratedButton = bookCard.getByRole('button', { name: '评分，29' });
  await expect(ratedButton).toBeVisible();
  await expect(ratedButton).toHaveClass(/active/);
  await expect(ratedButton).toHaveAttribute('data-tone', 'rating');
  await expect(ratedButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(ratedButton).toHaveCSS('color', darkTheme ? 'rgb(241, 199, 91)' : 'rgb(138, 90, 0)');
  await expect(ratedButton.locator('.rin-community-action-icon--star-fill')).toBeVisible();
  await page.waitForTimeout(100);
  expect(feedRequestCount).toBe(initialFeedRequestCount);

  await page.reload();
  const reloadedBookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  await expect(reloadedBookCard.getByRole('button', { name: '评分，29' })
    .locator('.rin-community-action-icon--star-fill')).toBeVisible();

  await page.getByRole('tab', { name: '书库' }).click();
  const libraryBookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  await expect(libraryBookCard.getByRole('button', { name: '评分，29' })
    .locator('.rin-community-action-icon--star-fill')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

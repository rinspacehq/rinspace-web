import { expect, test } from '@playwright/test';
import { identitySessionMock } from './identity-session-mock';

const now = new Date().toISOString();

const tagDetailFixture = {
  id: 5815,
  tag_id: '5815',
  slug: 'weil-pairings',
  slug_name: 'weil-pairings',
  name: 'Weil Pairings',
  displayName: 'Weil Pairings',
  excerpt: 'Weil 配对的标签说明。',
  originalText: '# Weil Pairings',
  parsedText: '<h1>Weil Pairings</h1><h2>基本概念</h2><p>Weil 配对的标签说明。</p>',
  html: '<h1>Weil Pairings</h1><h2>基本概念</h2><p>Weil 配对的标签说明。</p>',
  tex_source: '',
  rendererFinal: true,
  followCount: 11,
  questionCount: 2,
  status: 1,
  createdAt: now,
  updatedAt: now,
  usage_excerpt: '',
  repository_state: 'active',
  repository_id: 12,
  parent_tags: [],
  outgoing_references: [],
  incoming_references: [],
  outgoing_object_references: [],
  incoming_object_references: [],
};

const tagPageFixture = {
  tag_id: '5815',
  slug_name: 'weil-pairings',
  display_name: 'Weil Pairings',
  description: 'Weil 配对的标签说明。',
  excerpt: 'Weil 配对的标签说明。',
  original_text: '# Weil Pairings',
  parsed_text: '<h1>Weil Pairings</h1>',
  follow_count: 11,
  like_count: 7,
  question_count: 2,
  is_follower: false,
  is_liked: false,
  created_at: 1,
  updated_at: 2,
  recommend: false,
  reserved: false,
  usage_excerpt: '',
};

test('tag detail keeps repository Star and Watch as independent icon counters', async ({ page }) => {
  let likePayload: Record<string, unknown> | null = null;
  let followPayload: Record<string, unknown> | null = null;

  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'reader-7' }));
  });
  await page.route('**/auth/v1/user/me', (route) => route.fulfill({
    json: { sub: 'reader-7', username: 'reader' },
  }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/^\/rinspace(?=\/)/, '');

    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: identitySessionMock('reader-7', 'reader') });
      return;
    }
    if (request.method() === 'POST' && pathname === '/api/like') {
      likePayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          targetType: 'tag',
          targetId: '5815',
          liked: true,
          likeCount: 8,
        },
      });
      return;
    }
    if (request.method() === 'POST' && pathname === '/api/follows') {
      followPayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          targetType: 'tag',
          targetId: '5815',
          following: true,
          followerCount: 12,
        },
      });
      return;
    }
    if (pathname === '/api/tag') {
      await route.fulfill({ json: tagDetailFixture });
      return;
    }
    if (pathname === '/api/tags/page') {
      await route.fulfill({
        json: { count: 1, page: 1, page_size: 1, items: [tagPageFixture] },
      });
      return;
    }
    if (pathname === '/api/tag/stats') {
      await route.fulfill({
        json: {
          tag_id: '5815',
          slug_name: 'weil-pairings',
          total: 2,
          questions: 2,
          blogs: 0,
          discussions: 0,
          dynamics: 0,
          announcements: 0,
        },
      });
      return;
    }
    if (pathname === '/api/tag/cultivations') {
      await route.fulfill({
        json: {
          tag_id: '5815',
          slug_name: 'weil-pairings',
          count: 0,
          page: 1,
          page_size: 6,
          items: [],
        },
      });
      return;
    }
    if (pathname === '/api/v2/tags/5815/connections') {
      const view = new URL(request.url()).searchParams.get('view') || 'outgoing';
      await route.fulfill({
        json: {
          tag: { id: 5815, slugName: 'weil-pairings', displayName: 'Weil Pairings', normalizedName: 'weil-pairings', usageScope: '', parentTagIds: [], version: 2 },
          parentTagIds: [],
          childTagIds: [6100],
          parentTags: [],
          childTags: [{ id: 6100, displayName: 'Algebraic Geometry', normalizedName: 'algebraic-geometry' }],
          knowledgeUnavailable: false,
          knowledge: { view, items: [] },
        },
      });
      return;
    }
    if (pathname === '/api/v2/tags/5815/citation') {
      await route.fulfill({
        json: {
          projectId: 'tag-wiki:5815',
          tagId: 5815,
          activeCommit: 'a'.repeat(40),
          current: 'https://rinspace.com/tags/5815/weil-pairings',
          revision: `https://rinspace.com/tags/5815/weil-pairings?commit=${'a'.repeat(40)}`,
        },
      });
      return;
    }
    if (pathname === '/api/v2/tags/5815/requires') {
      await route.fulfill({
        json: {
          items: [{
            id: 'statement-91',
            subjectTagId: 5815,
            subjectTagDisplayName: 'Weil Pairings',
            predicateTagId: 1,
            objectTagId: 6200,
            objectTagDisplayName: 'Elliptic Curves',
            evidence: {},
            reviewState: 'approved',
            rank: 0,
            reason: 'Browser fixture prerequisite',
            version: 1,
            createdAt: now,
          }],
        },
      });
      return;
    }
    if (pathname === '/api/v2/tags/5815/required-by') {
      await route.fulfill({
        json: {
          items: [{
            id: 'statement-92',
            subjectTagId: 6300,
            subjectTagDisplayName: 'Abelian Varieties',
            predicateTagId: 1,
            objectTagId: 5815,
            objectTagDisplayName: 'Weil Pairings',
            evidence: {},
            reviewState: 'approved',
            rank: 0,
            reason: 'Browser fixture dependant',
            version: 1,
            createdAt: now,
          }],
        },
      });
      return;
    }
    if (pathname === '/api/v2/tags/5815/aliases' || pathname === '/api/v2/tags/5815/history') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/v2/tags/5815/impact') {
      await route.fulfill({
        json: {
          tagId: 5815,
          version: 2,
          directChildren: 0,
          descendants: 0,
          associations: 0,
          aliases: 0,
          pendingParentReviews: 0,
          dependencies: 0,
          dependants: 0,
          references: 0,
          backlinks: 0,
          redirects: 0,
        },
      });
      return;
    }
    if (pathname === '/api/revisions') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/notifications') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });

  await page.goto('/tags/5815/weil-pairings', { waitUntil: 'domcontentloaded' });

  const contentTabs = page.locator('.tag-detail-content-tabs');
  await expect(contentTabs.getByRole('button')).toHaveText(['百科', '文章', '书籍'], { timeout: 20_000 });
  await expect(contentTabs.getByRole('button', { name: '问答' })).toHaveCount(0);
  await expect(contentTabs.getByRole('button', { name: '讨论' })).toHaveCount(0);
  await expect(contentTabs.getByRole('button', { name: '动态' })).toHaveCount(0);

  await expect(page.locator('.tag-detail-meta-row').getByRole('link', { name: '编辑' })).toBeVisible();
  await expect(page.locator('[data-rin-primary-text="description"]')).toHaveCount(0);
  await expect(page.locator('[data-rin-tag-lifecycle="true"]')).toHaveCount(0);
  await expect(page.locator('.tag-detail-toc').getByRole('link', { name: '基本概念' })).toBeVisible();

  const informationPanel = page.locator('.tag-information-panel');
  await expect(informationPanel).toBeVisible();
  await expect(informationPanel).toContainText('标签信息');
  await expect(informationPanel).toContainText('标签 ID');
  await expect(informationPanel).toContainText('ID 5,815');
  const actions = informationPanel.locator('.tag-detail-follow-row');
  await expect(actions).toBeVisible({ timeout: 20_000 });
  const like = actions.getByRole('button', { name: '喜欢，7' });
  const follow = actions.getByRole('button', { name: '收藏，11' });
  await expect(like.locator('.rin-community-action-icon--heart')).toBeVisible();
  await expect(follow.locator('.rin-community-action-icon--bookmark')).toBeVisible();
  await expect(like.locator('.rin-community-action-icon--heart')).toHaveCSS('font-size', '20px');
  await expect(follow.locator('.rin-community-action-icon--bookmark')).toHaveCSS('font-size', '20px');
  await expect(like.locator('.home-card-action-value')).toHaveText('7');
  await expect(follow.locator('.home-card-action-value')).toHaveText('11');
  expect((await like.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await follow.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await expect(page.locator('.tag-detail-wiki-head')).toHaveCount(0);
  await expect(page.locator('.tag-knowledge-maintenance-panel')).toHaveCount(0);
  await expect(informationPanel).toContainText('父标签');
  await expect(informationPanel).toContainText('子标签');
  await expect(informationPanel).toContainText('Algebraic Geometry');
  await expect(informationPanel).toContainText('ID 6,100');
  await expect(informationPanel).toContainText('Elliptic Curves');
  await expect(informationPanel).toContainText('ID 6,200');
  await expect(informationPanel).toContainText('Abelian Varieties');
  await expect(informationPanel).toContainText('ID 6,300');
  await expect(informationPanel.locator('.tag-knowledge-chips > a')).toHaveCount(3);
  const relationActions = informationPanel.locator('.tag-knowledge-actions');
  const iconActions = [
    relationActions.getByRole('button', { name: '维护标签' }),
    relationActions.getByRole('link', { name: '报告问题' }),
    relationActions.getByRole('button', { name: '复制当前引用' }),
    relationActions.getByRole('button', { name: '复制固定引用' }),
  ];
  for (const action of iconActions) {
    await expect(action).toBeVisible();
    const visual = await action.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
      };
    });
    expect(visual).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderTopWidth: '0px',
      borderRightWidth: '0px',
      borderBottomWidth: '0px',
      borderLeftWidth: '0px',
    });
  }
  await expect(iconActions[0].locator('[data-tag-knowledge-icon="maintain"]')).toBeVisible();
  await expect(iconActions[1].locator('[data-tag-knowledge-icon="report"]')).toBeVisible();
  await expect(iconActions[2].locator('[data-tag-knowledge-icon="copy-current"]')).toBeVisible();
  await expect(iconActions[3].locator('[data-tag-knowledge-icon="copy-revision"]')).toBeVisible();
  const sourceLink = informationPanel.getByRole('link', { name: 'Gitea 源码' });
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink.locator('.rin-icon--git')).toBeVisible();

  await like.click();
  const activeLike = actions.getByRole('button', { name: '已喜欢，8' });
  await expect(activeLike.locator('.rin-community-action-icon--heart-fill')).toBeVisible();
  await expect(activeLike).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  expect(likePayload).toMatchObject({
    targetType: 'tag',
    targetId: '5815',
    slug: 'weil-pairings',
    bookmark: true,
    isCancel: false,
  });

  await follow.click();
  const activeFollow = actions.getByRole('button', { name: '已收藏，12' });
  await expect(activeFollow.locator('.rin-community-action-icon--bookmark-check')).toBeVisible();
  await expect(activeFollow).toHaveAttribute('aria-pressed', 'true');
  await expect(activeLike).toHaveAttribute('aria-pressed', 'true');
  expect(followPayload).toMatchObject({
    targetType: 'tag',
    slug: 'weil-pairings',
    targetId: 'weil-pairings',
    isCancel: false,
  });
});

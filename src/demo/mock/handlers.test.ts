import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';

import { parseRuntimeConfig } from '@/app/config/runtime';
import { createMemoryDemoRepository, type DemoRepository } from '@/demo/repository';
import { createRinspaceDemoSeed } from '@/demo/fixtures/v1';
import type { ApiSchemas } from '@/generated/api-contract';
import { markdownStoredArticleRender } from '@/utils/blogBody';
import { createDemoRequestHandlers } from './handlers';
import type { DemoScenarioName } from './scenarios';

const config = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8'),
) as unknown);
const origin = 'http://localhost';
let currentScenario: DemoScenarioName = 'normal';
let repository: DemoRepository;
let server: ReturnType<typeof setupServer>;

beforeAll(async () => {
  repository = createMemoryDemoRepository();
  await repository.ensureSeed(await createRinspaceDemoSeed());
  server = setupServer(...createDemoRequestHandlers(config, repository, {
    origin,
    scenario: { current: () => currentScenario },
  }));
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
  repository.close();
});

beforeEach(async () => {
  currentScenario = 'normal';
  await repository.reset(await createRinspaceDemoSeed());
});

describe('repository-backed demo handlers', () => {
  it('returns contract-shaped site metadata from runtime config and repository metadata', async () => {
    const response = await fetch(`${origin}/api/siteinfo`);
    expect(response.status).toBe(200);
    const payload = await response.json() as ApiSchemas['SiteInfo'];
    expect(payload).toMatchObject({
      general: { name: 'Rinspace Web Demo' },
      interface: { language: 'zh-CN', time_zone: 'Asia/Shanghai' },
      version: 'v1',
    });
    expect(payload.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('filters, stably sorts, and paginates repository content', async () => {
    const response = await fetch(`${origin}/api/content?type=blog&page=2&size=1`);
    expect(response.status).toBe(200);
    const payload = await response.json() as ApiSchemas['ContentPage'];
    expect(payload).toMatchObject({ count: 3, page: 2, pageSize: 1, generatedAt: '2026-06-01T12:00:00.000Z' });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: '1020',
      type: 'blog',
      author: 'North Window',
    });
  });

  it('returns structured validation and unregistered first-party errors', async () => {
    const invalid = await fetch(`${origin}/api/content?page=0`);
    expect(invalid.status).toBe(422);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: 'demo.invalid_pagination' } });

    const unregistered = await fetch(`${origin}/api/not-registered`);
    expect(unregistered.status).toBe(501);
    await expect(unregistered.json()).resolves.toEqual({
      error: {
        code: 'demo.handler_not_registered',
        message: 'This first-party demo endpoint has no registered handler.',
        details: { method: 'GET', path: '/api/not-registered' },
      },
    });
  });

  it('applies each reproducible error scenario before repository work', async () => {
    currentScenario = 'rate-limited';
    const response = await fetch(`${origin}/api/content`);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'demo.scenario.rate_limited' } });
    currentScenario = 'normal';
  });

  it('turns every external request into a network error instead of passthrough', async () => {
    await expect(fetch('https://rinspace.com/api/siteinfo')).rejects.toThrow();
    await expect(fetch('https://example.tcloudbasegateway.com/auth/v1/user')).rejects.toThrow();
    await expect(fetch('https://cdn.example.invalid/avatar.png')).rejects.toThrow();
  });

  it('serves repository-backed home, search, tag, user, question, and book reading views', async () => {
    const feed = await fetch(`${origin}/api/feed?mode=hot&page=1&size=12`);
    expect(feed.status).toBe(200);
    await expect(feed.json()).resolves.toMatchObject({
      featuredBlog: { id: '1010', type: 'blog', meta: '合成演示内容' },
      questionHotlist: [{ id: '1030', type: 'question' }],
      announcements: [],
      generatedAt: '2026-06-01T12:00:00.000Z',
    });

    const search = await fetch(`${origin}/api/search?q=reproducibility&type=all`);
    expect(search.status).toBe(200);
    const searchPayload = await search.json() as { count: number; items: Array<{ objectType: string }> };
    expect(searchPayload.count).toBeGreaterThan(0);
    expect(new Set(searchPayload.items.map((item) => item.objectType))).toContain('tag');

    const noResults = await fetch(`${origin}/api/search?q=definitely-no-demo-result`);
    await expect(noResults.json()).resolves.toEqual({ count: 0, items: [] });

    const tags = await fetch(`${origin}/api/tags/page?page=1&page_size=36`);
    await expect(tags.json()).resolves.toMatchObject({ count: 6, page: 1, page_size: 36 });
    const directory = await fetch(`${origin}/api/v2/tags/directory?view=all&limit=36`);
    await expect(directory.json()).resolves.toMatchObject({ view: 'all', parentTagId: 0 });

    const users = await fetch(`${origin}/api/user/ranking`);
    const usersPayload = await users.json() as {
      users_with_the_most_reputation: Array<{ username: string }>;
      staffs: unknown[];
    };
    expect(usersPayload.users_with_the_most_reputation[0]?.username).toBe('demo-orbit-reader');
    expect(usersPayload.staffs).toEqual([]);

    const question = await fetch(`${origin}/api/questions/iterator-boundary-last-example`);
    await expect(question.json()).resolves.toMatchObject({
      question: { id: '1030', type: 'question', answerCount: 1 },
      answers: [{ questionId: 1030 }],
    });
    const answerComments = await fetch(`${origin}/api/comments?targetType=answer&targetId=3001&limit=12`);
    await expect(answerComments.json()).resolves.toMatchObject({ count: 0, items: [] });

    const article = await fetch(`${origin}/api/content/1010`);
    const articlePayload = await article.json() as { body: string };
    expect(markdownStoredArticleRender(articlePayload.body)?.html).toContain('const observation');

    const book = await fetch(`${origin}/api/books/1040/read`);
    await expect(book.json()).resolves.toMatchObject({
      post: { id: '1040', type: 'book' },
      pageCount: 1,
      source: 'demo-repository',
    });
  });

  it('persists member comments and rejects the same write for a guest', async () => {
    const guest = await fetch(`${origin}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'blog', slug: 'local-error-atlas', body: '本地评论不会发送到服务端。' }),
    });
    expect(guest.status).toBe(401);
    await expect(guest.json()).resolves.toMatchObject({ error: { code: 'authentication.required' } });

    const created = await fetch(`${origin}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' },
      body: JSON.stringify({ targetType: 'blog', slug: 'local-error-atlas', body: '本地评论不会发送到服务端。' }),
    });
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toMatchObject({ author: '轨道读者', targetId: 1010 });

    const comments = await fetch(`${origin}/api/comments?targetType=blog&slug=local-error-atlas&limit=24`);
    const payload = await comments.json() as { count: number; items: Array<{ body: string }> };
    expect(payload.count).toBe(3);
    expect(payload.items.at(-1)?.body).toBe('本地评论不会发送到服务端。');
  });

  it('persists like, collection, and tag-follow toggles in repository relations', async () => {
    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const folders = await fetch(`${origin}/api/collection/folders`, { headers: memberHeaders });
    await expect(folders.json()).resolves.toMatchObject({
      defaultId: 'demo-folder-default',
      folders: [{ id: 'demo-folder-default', isDefault: true }],
    });
    const createdFolder = await fetch(`${origin}/api/collection/folders`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ parentId: 'demo-folder-default', name: '浏览器验收' }),
    });
    await expect(createdFolder.json()).resolves.toMatchObject({
      id: 'demo-folder-local-1',
      parentId: 'demo-folder-default',
      name: '浏览器验收',
    });
    const reaction = await fetch(`${origin}/api/meta/reaction`, {
      method: 'PUT',
      headers: memberHeaders,
      body: JSON.stringify({ object_id: '1010', object_type: 'blog', emoji: 'heart', reaction: 'activate' }),
    });
    const reactionPayload = await reaction.json() as {
      reaction_summary: Array<{ emoji: string; count: number; is_active: boolean }>;
    };
    expect(reactionPayload.reaction_summary[0]).toMatchObject({ emoji: 'heart', count: 2, is_active: true });

    const follow = await fetch(`${origin}/api/follows`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ targetType: 'tag', targetId: 'reproducibility', isCancel: false }),
    });
    await expect(follow.json()).resolves.toMatchObject({ following: true, followerCount: 1 });
    const followingTags = await fetch(`${origin}/api/tags/following`, {
      headers: { 'X-Rinspace-Demo-Persona': 'member' },
    });
    await expect(followingTags.json()).resolves.toMatchObject({
      items: [{ slug_name: 'reproducibility' }],
    });

    const removeCollection = await fetch(`${origin}/api/collections`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ targetType: 'book', targetId: '1040', isCancel: true }),
    });
    await expect(removeCollection.json()).resolves.toMatchObject({ bookmarked: false, collectionCount: 0 });
    const addCollection = await fetch(`${origin}/api/collections`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ targetType: 'book', targetId: '1040', isCancel: false }),
    });
    await expect(addCollection.json()).resolves.toMatchObject({ bookmarked: true, collectionCount: 1 });

    const shelf = await fetch(`${origin}/api/personal/collection/page?page=1&page_size=100`, {
      headers: { 'X-Rinspace-Demo-Persona': 'member' },
    });
    await expect(shelf.json()).resolves.toMatchObject({ count: 1, items: [{ id: '1040' }] });
  });

  it('serves revision, invitation, book-context, chapter-activity, and idempotent read support', async () => {
    const revisions = await fetch(`${origin}/api/revisions?objectType=blog&objectId=1010&limit=4`);
    await expect(revisions.json()).resolves.toMatchObject({
      items: [{ objectType: 'blog', objectId: 1010, title: '把局部误差折成一张可读的地图' }],
    });

    const invites = await fetch(`${origin}/api/question/invite?id=1030`, {
      headers: { 'X-Rinspace-Demo-Persona': 'member' },
    });
    const invitePayload = await invites.json() as Array<{ id: string; display_name: string }>;
    expect(invitePayload.length).toBeGreaterThan(0);
    expect(invitePayload[0]).toEqual(expect.objectContaining({ id: expect.any(String), display_name: expect.any(String) }));

    const context = await fetch(`${origin}/api/content/1010/book-context`);
    await expect(context.json()).resolves.toMatchObject({
      items: [{ bookId: '1040', chapterKey: 'state-vector', kind: 'blog' }],
      generatedAt: '2026-06-01T12:00:00.000Z',
    });

    const activity = await fetch(`${origin}/api/books/1040/chapters/activity?chapterKey=state-vector`);
    const activityPayload = await activity.json() as {
      bookId: string;
      chapters: Array<{ key: string; level: number }>;
      selected?: { key: string; links: { discussions: unknown[]; questions: unknown[]; blogs: unknown[] } };
    };
    expect(activityPayload).toMatchObject({
      bookId: '1040',
      selected: { key: 'state-vector', links: { discussions: [], questions: [], blogs: [] } },
    });
    expect(activityPayload.chapters).toHaveLength(3);
    expect(activityPayload.chapters[0]).toMatchObject({ key: 'state-vector', level: 2 });

    const requestBody = JSON.stringify({ requestId: 'read:task-17-idempotency' });
    const firstRead = await fetch(`${origin}/api/content/local-error-atlas/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    await expect(firstRead.json()).resolves.toMatchObject({ counted: true, readCount: expect.any(Number) });
    const repeatedRead = await fetch(`${origin}/api/content/local-error-atlas/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    await expect(repeatedRead.json()).resolves.toMatchObject({ counted: false, readCount: expect.any(Number) });
  });

  it('serves public profiles and repository-backed member profile updates', async () => {
    const publicProfile = await fetch(`${origin}/api/personal/user/info?username=demo-orbit-reader`);
    await expect(publicProfile.json()).resolves.toMatchObject({
      username: 'demo-orbit-reader',
      display_name: '轨道读者',
      website: 'https://orbit-reader.example/notes',
      mobile: '',
      is_follower: false,
    });

    const guest = await fetch(`${origin}/api/user/info`);
    expect(guest.status).toBe(200);
    await expect(guest.json()).resolves.toBeNull();

    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const saved = await fetch(`${origin}/api/profile`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({
        username: 'demo-updated-reader',
        nickname: '更新后的轨道读者',
        avatarDataUrl: 'data:image/svg+xml,%3Csvg%2F%3E',
        bio: '只保存在本地演示仓储。',
      }),
    });
    await expect(saved.json()).resolves.toMatchObject({
      username: 'demo-updated-reader',
      nickname: '更新后的轨道读者',
    });

    const current = await fetch(`${origin}/api/user/info`, { headers: memberHeaders });
    await expect(current.json()).resolves.toMatchObject({
      id: 'demo-user-member',
      username: 'demo-updated-reader',
      display_name: '更新后的轨道读者',
      access_token: '',
      role_name: 'member',
    });
    const refreshedPublic = await fetch(`${origin}/api/personal/user/info?username=demo-updated-reader`);
    await expect(refreshedPublic.json()).resolves.toMatchObject({
      username: 'demo-updated-reader',
      display_name: '更新后的轨道读者',
      bio: '只保存在本地演示仓储。',
    });
    const guestCollections = await fetch(`${origin}/api/personal/collection/page?username=demo-updated-reader`);
    expect(guestCollections.status).toBe(200);
    await expect(guestCollections.json()).resolves.toMatchObject({ count: 1, items: [{ id: '1040' }] });
  });

  it('persists notification read state and member settings while rejecting guests', async () => {
    const guest = await fetch(`${origin}/api/notification/status`);
    expect(guest.status).toBe(401);

    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const initialStatus = await fetch(`${origin}/api/notification/status`, { headers: memberHeaders });
    await expect(initialStatus.json()).resolves.toMatchObject({ inbox: 1, achievement: 0, can_revision: false });

    const inbox = await fetch(`${origin}/api/notification/page?type=inbox&page=1&page_size=12`, { headers: memberHeaders });
    const inboxPayload = await inbox.json() as { items: Array<{ id: string; is_read: boolean }> };
    expect(inboxPayload.items).toHaveLength(2);
    expect(inboxPayload.items.some((item) => !item.is_read)).toBe(true);

    const unread = inboxPayload.items.find((item) => !item.is_read);
    const marked = await fetch(`${origin}/api/notification/read/state`, {
      method: 'PUT',
      headers: memberHeaders,
      body: JSON.stringify({ id: unread?.id }),
    });
    await expect(marked.json()).resolves.toMatchObject({ unread_count: 0 });

    const savedInterface = await fetch(`${origin}/api/user/interface`, {
      method: 'PUT',
      headers: memberHeaders,
      body: JSON.stringify({ language: 'en', color_scheme: 'dark' }),
    });
    await expect(savedInterface.json()).resolves.toEqual({ language: 'en', color_scheme: 'dark' });
    const savedNotifications = await fetch(`${origin}/api/user/notification/config`, {
      method: 'PUT',
      headers: memberHeaders,
      body: JSON.stringify({ inbox: { key: 'site', enable: false } }),
    });
    await expect(savedNotifications.json()).resolves.toMatchObject({ inbox: { key: 'site', enable: false } });
    const reloadedNotifications = await fetch(`${origin}/api/user/notification/config`, {
      method: 'POST',
      headers: memberHeaders,
    });
    await expect(reloadedNotifications.json()).resolves.toMatchObject({ inbox: { key: 'site', enable: false } });
  });

  it('serves profile relation, personal activity, badge, and revision timeline shapes', async () => {
    const memberHeaders = { 'X-Rinspace-Demo-Persona': 'member' };
    const relations = await fetch(`${origin}/api/user/relations?username=demo-orbit-reader&relation=following&page=1&page_size=20`);
    await expect(relations.json()).resolves.toMatchObject({
      count: 1,
      page: 1,
      page_size: 20,
      items: [{ username: 'demo-paper-boat', is_following: true }],
    });
    const questions = await fetch(`${origin}/api/personal/question/page?username=demo-paper-boat`);
    await expect(questions.json()).resolves.toMatchObject({ count: 1, items: [{ question_id: '1030' }] });
    const follows = await fetch(`${origin}/api/personal/follow/page?page=1&page_size=8`, { headers: memberHeaders });
    await expect(follows.json()).resolves.toMatchObject({ count: 1, items: [{ question_id: '1030' }] });
    const votes = await fetch(`${origin}/api/personal/vote/page?page=1&page_size=8`, { headers: memberHeaders });
    await expect(votes.json()).resolves.toMatchObject({ count: 1, items: [{ question_id: '1030', vote_type: 'up_vote' }] });
    const badgeGroups = await fetch(`${origin}/api/badges`);
    await expect(badgeGroups.json()).resolves.toMatchObject([{ badges: [{ id: 'demo-badge-reproducible-reader' }] }]);
    const badgeInfo = await fetch(`${origin}/api/badge?id=demo-badge-reproducible-reader`);
    await expect(badgeInfo.json()).resolves.toMatchObject({ id: 'demo-badge-reproducible-reader', is_single: true });
    const badgeAwards = await fetch(`${origin}/api/badge/awards/page?badge_id=demo-badge-reproducible-reader`);
    await expect(badgeAwards.json()).resolves.toMatchObject({ count: 1, items: [{ object_type: 'question' }] });
    const badges = await fetch(`${origin}/api/badge/user/awards?username=demo-orbit-reader`);
    await expect(badges.json()).resolves.toMatchObject({ count: 1, items: [{ id: 'demo-badge-reproducible-reader' }] });

    const timeline = await fetch(`${origin}/api/activity/timeline?object_id=1010&object_type=blog`);
    await expect(timeline.json()).resolves.toMatchObject({
      object_info: { object_type: 'blog', title: '把局部误差折成一张可读的地图' },
      timeline: [{ revision_id: '1010-revision-2' }, { revision_id: '1010-revision-1' }],
    });
    const detail = await fetch(`${origin}/api/activity/timeline/detail?new_revision_id=1010-revision-2`);
    await expect(detail.json()).resolves.toMatchObject({
      new_revision: { id: '1010-revision-2' },
      old_revision: { id: '1010-revision-1' },
    });
  });

  it('publishes deterministic Markdown and LaTeX content locally, notifies the member, and resets cleanly', async () => {
    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const markdownBody = [
      '[[RIN_MARKDOWN_SOURCE]]',
      '# 本地发布的公式与代码',
      '',
      '$$E = mc^2$$',
      '',
      '```ts',
      'const localOnly = true;',
      '```',
      '[[/RIN_MARKDOWN_SOURCE]]',
    ].join('\n');
    const input = {
      type: 'blog',
      status: 'published',
      editor: 'markdown',
      title: '本地发布的公式与代码',
      body: markdownBody,
      excerpt: '确定性的本地发布。',
      tags: ['reproducibility', '本地创作'],
    };

    const guest = await fetch(`${origin}/api/content`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    expect(guest.status).toBe(401);

    const first = await fetch(`${origin}/api/content`, {
      method: 'POST', headers: memberHeaders, body: JSON.stringify(input),
    });
    expect(first.status).toBe(200);
    const created = await first.json() as { id: string; slug: string; title: string; editor: string };
    expect(created).toMatchObject({ title: input.title, editor: 'markdown' });
    expect(created.id).toMatch(/^\d+$/);

    const replay = await fetch(`${origin}/api/content`, {
      method: 'POST', headers: memberHeaders, body: JSON.stringify({ ...input, idempotencyKey: 'ignored-local-key' }),
    });
    await expect(replay.json()).resolves.toMatchObject({ id: created.id, slug: created.slug });

    const refreshed = await fetch(`${origin}/api/content/${created.id}`);
    const refreshedBody = await refreshed.json() as { id: string; title: string; body: string };
    expect(refreshedBody).toMatchObject({
      id: created.id,
      title: input.title,
      body: expect.stringContaining('const localOnly = true'),
    });
    expect(refreshedBody.body).toContain('[[RIN_MARKDOWN_SOURCE]]');
    expect(refreshedBody.body).toContain('[[RIN_MARKDOWN_RENDER]]');
    const notifications = await fetch(`${origin}/api/notifications`, { headers: memberHeaders });
    await expect(notifications.json()).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ excerpt: input.title })]),
    });

    const latex = await fetch(`${origin}/api/books`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({
        type: 'book', status: 'draft', editor: 'rin', title: '局部 LaTeX 书稿',
        body: '[[RIN_SOURCE]]\\section{局部变化} $\\Delta x$[[/RIN_SOURCE]]', tags: ['math'],
      }),
    });
    expect(latex.status).toBe(200);
    await expect(latex.json()).resolves.toMatchObject({ type: 'book', status: 'draft', editor: 'rin' });

    await repository.reset(await createRinspaceDemoSeed());
    const removed = await fetch(`${origin}/api/content/${created.id}`);
    expect(removed.status).toBe(404);
  });

  it('preserves the Markdown editor contract across partial updates and removes local content cleanly', async () => {
    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const body = [
      '[[RIN_MARKDOWN_SOURCE]]',
      '# 可继续编辑的本地文章',
      '',
      '正文与 $x^2$。',
      '[[/RIN_MARKDOWN_SOURCE]]',
    ].join('\n');
    const createdResponse = await fetch(`${origin}/api/content`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ type: 'blog', status: 'published', editor: 'markdown', title: '更新前', body, tags: ['before'] }),
    });
    const created = await createdResponse.json() as { id: string };

    const updatedResponse = await fetch(`${origin}/api/content/${created.id}`, {
      method: 'PUT',
      headers: memberHeaders,
      body: JSON.stringify({ title: '更新后', status: 'private', tags: ['after'] }),
    });
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      id: created.id,
      title: '更新后',
      status: 'private',
      editor: 'markdown',
      tags: ['after'],
      body: expect.stringContaining('[[RIN_MARKDOWN_RENDER]]'),
    });

    const memberFeed = await fetch(`${origin}/api/content?type=blog&include_drafts=true`, { headers: memberHeaders });
    await expect(memberFeed.json()).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: created.id, title: '更新后', editor: 'markdown' })]),
    });
    const removed = await fetch(`${origin}/api/content/${created.id}`, { method: 'DELETE', headers: memberHeaders });
    expect(removed.status).toBe(200);
    expect((await fetch(`${origin}/api/content/${created.id}`, { headers: memberHeaders })).status).toBe(404);
  });

  it('stores one repository-backed autosave record and reports stale revision conflicts', async () => {
    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const key = 'demo-user-member:milkdown:blog-markdown:new';
    const draft = {
      version: 1,
      key,
      kind: 'blog-markdown',
      title: '自动保存草稿',
      markdown: '# 自动保存草稿\n\n$\\alpha + \\beta$',
      savedAt: Date.parse('2026-06-01T12:30:00.000Z'),
    };
    const saved = await fetch(`${origin}/api/rin-writer/draft?key=${encodeURIComponent(key)}`, {
      method: 'PUT', headers: memberHeaders, body: JSON.stringify({ draft, sourceId: 'tab-a', revision: 0 }),
    });
    await expect(saved.json()).resolves.toMatchObject({ draft, revision: 1, sourceId: 'tab-a' });
    const storedRecords = await repository.transaction(['drafts'], 'readonly', (transaction) => transaction.getAll('drafts'));
    expect(storedRecords.filter((record) => record.key.startsWith('demo-autosave:'))).toHaveLength(1);

    const restored = await fetch(`${origin}/api/rin-writer/draft?key=${encodeURIComponent(key)}`, { headers: memberHeaders });
    await expect(restored.json()).resolves.toMatchObject({ draft, revision: 1 });

    const advanced = await fetch(`${origin}/api/rin-writer/draft?key=${encodeURIComponent(key)}`, {
      method: 'PUT', headers: memberHeaders, body: JSON.stringify({ draft: { ...draft, savedAt: draft.savedAt + 1 }, sourceId: 'tab-a', revision: 1 }),
    });
    expect(advanced.status).toBe(200);
    const conflict = await fetch(`${origin}/api/rin-writer/draft?key=${encodeURIComponent(key)}`, {
      method: 'PUT', headers: memberHeaders, body: JSON.stringify({ draft, sourceId: 'tab-b', revision: 1 }),
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: 'demo.draft.conflict', details: { revision: 2 } } });

    const removed = await fetch(`${origin}/api/rin-writer/draft?key=${encodeURIComponent(key)}`, {
      method: 'DELETE', headers: memberHeaders,
    });
    expect(removed.status).toBe(204);
  });

  it('enforces content and draft size limits and serves repository-backed creator insights', async () => {
    const memberHeaders = { 'Content-Type': 'application/json', 'X-Rinspace-Demo-Persona': 'member' };
    const oversizedContent = await fetch(`${origin}/api/content`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ type: 'blog', title: '过长正文', body: 'x'.repeat(512 * 1024 + 1), tags: [] }),
    });
    expect(oversizedContent.status).toBe(422);
    await expect(oversizedContent.json()).resolves.toMatchObject({ error: { code: 'demo.creation.body_too_large' } });

    const oversizedDraft = await fetch(`${origin}/api/rin-writer/draft?key=large`, {
      method: 'PUT',
      headers: memberHeaders,
      body: JSON.stringify({ draft: { key: 'large', body: 'x'.repeat(1024 * 1024 + 1) }, sourceId: 'tab-a' }),
    });
    expect(oversizedDraft.status).toBe(422);
    await expect(oversizedDraft.json()).resolves.toMatchObject({ error: { code: 'demo.draft.too_large' } });

    const analytics = await fetch(`${origin}/api/creator/analytics?granularity=month&period=2026-06`, { headers: memberHeaders });
    await expect(analytics.json()).resolves.toMatchObject({
      granularity: 'month', period: '2026-06', points: expect.any(Array), topWorks: expect.any(Array),
    });
    const contributions = await fetch(`${origin}/api/creator/contributions`, { headers: memberHeaders });
    const contributionPayload = await contributions.json() as unknown[];
    expect(contributionPayload).toHaveLength(91);
  });
});

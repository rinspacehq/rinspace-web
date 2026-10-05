#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.RINSPACE_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const chromiumPath = process.env.CHROMIUM_BIN;
const now = new Date().toISOString();
const mutations = [];
const requestCounts = { currentUser: 0, giteaSession: 0, heatmap: 0 };
const stepUpRequests = [];
let heatmapCookieHeader = '';
const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%232b577a"/%3E%3C/svg%3E';

function appPathname(value) {
  return value.replace(/^\/rinspace(?=\/)/, '');
}

function content(status = 'private', repositoryStatus = 'published', sourceVisibility = 'private') {
  return {
    id: '42', type: 'blog', status, repositoryStatus, sourceVisibility,
    title: '创作中心状态测试', author: 'Creator', authorId: 'creator', authorUid: 'creator-uid',
    meta: '刚刚更新', excerpt: '状态测试', interactions: '0 阅读', heat: status, tags: [], images: [],
    slug: 'creator-status-test', body: '用于验证创作中心状态。', readCount: 0, collected: false,
    createdAt: now, updatedAt: now,
  };
}

const user = {
  id: 'creator-uid', created_at: Math.floor(Date.parse('2025-06-03T00:00:00.000Z') / 1000), last_login_date: 1, username: 'creator', display_name: 'Creator',
  avatar: { type: 'custom', gravatar: '', custom: avatar }, cover_url: '', mobile: '', bio: '', bio_html: '',
  website: '', location: '', language: 'zh-CN', color_scheme: 'system', access_token: '', role_id: 1,
  role_name: 'member', rank: 0, status: 'active', have_password: true, visit_token: '', suspended_until: 0,
};

function analytics(url) {
  const granularity = url.searchParams.get('granularity') || 'month';
  const period = url.searchParams.get('period') || '2026-08';
  const size = granularity === 'week' ? 7 : granularity === 'year' ? 12 : 5;
  const points = Array.from({ length: size }, (_, index) => ({
    key: granularity === 'year' ? `${period}-${String(index + 1).padStart(2, '0')}` : `${period}-${String(index + 1).padStart(2, '0')}`,
    label: granularity === 'week' ? `周${'一二三四五六日'[index]}` : granularity === 'year' ? `${index + 1}月` : String(index + 1),
    reads: (index + 1) * 12,
    likes: index + 2,
    favorites: index + 1,
    newFollowers: index === 1 ? -1 : index,
  }));
  return { granularity, period, start: '2025-01-01', end: '2027-01-01', points };
}

async function handle(route) {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = appPathname(url.pathname);
  if (pathname === '/api/identity/v1/session') {
    return route.fulfill({ json: {
      status: 'authenticated',
      csrfToken: 'creator-browser-csrf',
      user: { id: 'creator-uid', username: 'creator', role: 'member' },
      currentSession: { sid: 'creator-browser-session', version: 1 },
    } });
  }
  if (pathname === '/api/identity/v1/step-up' && request.method() === 'POST') {
    const body = request.postDataJSON();
    stepUpRequests.push(body);
    if (body.challengeId) {
      return route.fulfill({ json: { stepUpProof: 'rin_su_creator_delete_proof' } });
    }
    return route.fulfill({ status: 202, json: { challengeId: 'creator-delete-challenge', retryAfter: 60 } });
  }
  if (pathname === '/api/gitea/sso') {
    requestCounts.giteaSession += 1;
    return route.fulfill({ status: 204, body: '' });
  }
  if (pathname === '/repos/api/v1/users/creator/heatmap') {
    requestCounts.heatmap += 1;
    heatmapCookieHeader = request.headers().cookie || '';
    return route.fulfill({ json: [
      { timestamp: Math.floor(Date.now() / 1000) - 86_400, contributions: 4 },
      { timestamp: Math.floor(Date.now() / 1000) - (3 * 86_400), contributions: 2 },
    ] });
  }
  if (pathname === '/api/user/info') {
    requestCounts.currentUser += 1;
    return route.fulfill({ json: user });
  }
  if (pathname === '/api/creator/analytics') return route.fulfill({ json: analytics(url) });
  if (pathname === '/api/personal/question/page') return route.fulfill({ json: { count: 0, items: [] } });
  if (pathname === '/api/content' && request.method() === 'GET') {
    const items = url.searchParams.get('type') === 'blog' ? [content()] : [];
    return route.fulfill({ json: { items, count: items.length, page: 1, pageSize: 50, generatedAt: now } });
  }
  if (pathname === '/api/content/42' && request.method() === 'GET') return route.fulfill({ json: content() });
  if (pathname === '/api/content/42' && request.method() === 'PUT') {
    const body = request.postDataJSON();
    mutations.push(body);
    return route.fulfill({ json: content(body.status, body.repositoryStatus, body.sourceVisibility) });
  }
  if (pathname === '/api/content/42' && request.method() === 'DELETE') {
    mutations.push({
      deletion: request.postDataJSON(),
      contentType: request.headers()['content-type'],
      stepUpProof: request.headers()['x-rinspace-step-up'],
    });
    return route.fulfill({ json: content('draft', 'draft', 'private') });
  }
  return route.fulfill({ json: {} });
}

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  const browserBaseURL = new URL(baseURL);
  await page.context().addCookies([{
    name: 'i_like_gitea',
    value: 'expired-managed-session',
    domain: browserBaseURL.hostname,
    path: '/repos',
    secure: browserBaseURL.protocol === 'https:',
    sameSite: 'Lax',
  }]);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'creator-uid' }));
  });
  await page.route('**/api/**', handle);
  await page.goto(`${baseURL}/creator?view=content`, { waitUntil: 'domcontentloaded' });
  const creatorSidebar = page.getByRole('complementary', { name: '创作中心导航' });
  await creatorSidebar.waitFor();
  await creatorSidebar.getByRole('list').getByRole('link', { name: '创作主页' }).waitFor();
  assert.equal(await creatorSidebar.getByText('创作中心', { exact: true }).count(), 1);
  const avatarImage = creatorSidebar.locator('.creator-sidebar-user .avatar-name-mark img');
  await avatarImage.waitFor({ state: 'visible' });
  assert.match(await avatarImage.getAttribute('src'), /^data:image\/svg\+xml/);
  assert.equal(await page.locator('.creator-head').count(), 0);
  assert.equal(await page.getByRole('tab', { name: /文章/ }).getAttribute('aria-selected'), 'true');
  if (process.env.RINSPACE_CREATOR_SCREENSHOT) {
    await page.screenshot({ path: process.env.RINSPACE_CREATOR_SCREENSHOT, fullPage: true });
  }
  const row = page.locator('.creator-row').first();
  await row.waitFor({ state: 'visible' });
  const pageStateSelect = row.getByLabel('页面状态');
  const sourceVisibilitySelect = row.getByLabel('源码可见性');
  const editButton = row.getByRole('button', { name: '编辑' });
  assert.equal(await editButton.evaluate((element) => getComputedStyle(element).borderRadius), '2px');
  assert.equal(await pageStateSelect.evaluate((element) => getComputedStyle(element).borderRadius), '2px');
  await editButton.click();
  const quickEditDialog = page.getByRole('dialog', { name: '编辑文章' });
  await quickEditDialog.waitFor();
  assert.equal(appPathname(new URL(page.url()).pathname), '/creator');
  await quickEditDialog.getByRole('button', { name: '关闭' }).click();
  await quickEditDialog.waitFor({ state: 'hidden' });
  const selectPublishingOption = async (locator, value) => {
    const response = page.waitForResponse((candidate) => (
      appPathname(new URL(candidate.url()).pathname) === '/api/content/42'
      && candidate.request().method() === 'PUT'
    ));
    await locator.selectOption(value);
    await response;
  };

  await selectPublishingOption(pageStateSelect, 'draft');
  await selectPublishingOption(sourceVisibilitySelect, 'open');
  await selectPublishingOption(pageStateSelect, 'published');
  await selectPublishingOption(sourceVisibilitySelect, 'private');

  assert.deepEqual(mutations.slice(0, 4).map(({ status, repositoryStatus, sourceVisibility }) => ({ status, repositoryStatus, sourceVisibility })), [
    { status: 'draft', repositoryStatus: 'draft', sourceVisibility: 'private' },
    { status: 'draft', repositoryStatus: 'draft', sourceVisibility: 'open' },
    { status: 'published', repositoryStatus: 'published', sourceVisibility: 'open' },
    { status: 'private', repositoryStatus: 'published', sourceVisibility: 'private' },
  ]);

  await row.getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await page.getByText('内容已删除。').waitFor();
  const deletion = mutations.at(-1);
  assert.match(deletion.contentType, /^application\/json/);
  assert.equal(deletion.deletion.confirmation, 'DELETE 42');
  assert.ok(deletion.deletion.idempotencyKey);
  assert.equal(deletion.stepUpProof, undefined);
  assert.deepEqual(stepUpRequests, []);

  await page.getByRole('link', { name: '数据分析' }).click();
  await page.locator('.creator-analytics').waitFor();
  assert.match(page.url(), /view=analytics/);
  await page.locator('.creator-chart-line').first().waitFor();
  assert.equal(await page.getByRole('button', { name: /阅读量/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByText('趋势记录', { exact: true }).count(), 0);
  assert.equal(await page.getByText(/逐日阅读自/).count(), 0);
  assert.equal(await page.getByText('这个周期还没有新增阅读。', { exact: true }).count(), 0);
  assert.equal(await page.locator('.creator-read-sources').count(), 0);
  if (process.env.RINSPACE_CREATOR_ANALYTICS_SCREENSHOT) {
    await page.screenshot({ path: process.env.RINSPACE_CREATOR_ANALYTICS_SCREENSHOT, fullPage: true });
  }
  await page.getByRole('tab', { name: '周', exact: true }).click();
  await page.waitForURL(/granularity=week/);
  await page.locator('.creator-chart-line').first().waitFor();
  assert.match(page.url(), /period=\d{4}-W\d{2}/);
  const currentWeek = new URL(page.url()).searchParams.get('period');
  await page.getByRole('button', { name: '上一个周期' }).click();
  await page.waitForFunction((period) => new URL(window.location.href).searchParams.get('period') !== period, currentWeek);
  await page.waitForFunction(() => {
    const picker = document.querySelector('[aria-label="选择统计周期"]');
    return picker instanceof HTMLSelectElement
      && picker.value === new URL(window.location.href).searchParams.get('period');
  });
  assert.equal(await page.getByLabel('选择统计周期').inputValue(), new URL(page.url()).searchParams.get('period'));
  await page.getByRole('link', { name: '创作主页', exact: true }).click();
  await page.locator('.creator-overview').waitFor();
  assert.equal(appPathname(new URL(page.url()).pathname), '/creator');
  assert.equal(new URL(page.url()).search, '');
  await page.getByRole('region', { name: '创作热力图' }).waitFor();
  assert.equal(await page.getByText('创作活跃', { exact: true }).count(), 0);
  assert.equal(await page.locator('.creator-heatmap-cell[data-level="4"]').count() > 0, true);
  await page.getByText('一年内 6 次贡献', { exact: true }).waitFor();
  const activeHeatmapCell = page.locator('.creator-heatmap-cell[data-level="4"]').first();
  assert.equal(await activeHeatmapCell.evaluate((element) => getComputedStyle(element).fill), 'rgb(49, 105, 159)');
  await activeHeatmapCell.hover();
  assert.equal(await activeHeatmapCell.evaluate((element) => getComputedStyle(element).outlineStyle), 'solid');
  assert.equal(await page.locator('.creator-heatmap').evaluate((element) => getComputedStyle(element).color), 'rgb(24, 28, 33)');
  const heatmapSectionBox = await page.locator('.creator-heatmap-section').boundingBox();
  const heatmapSVGBox = await page.locator('.creator-heatmap-svg').boundingBox();
  assert.ok(heatmapSectionBox && heatmapSVGBox);
  assert.ok(heatmapSVGBox.width >= heatmapSectionBox.width * 0.9);
  assert.equal(requestCounts.currentUser, 1);
  assert.ok(requestCounts.giteaSession <= 1);
  assert.equal(requestCounts.heatmap, 1);
  assert.equal(heatmapCookieHeader.includes('expired-managed-session'), false);
  assert.equal(await page.locator('.creator-quick-actions, .creator-overview-metrics').count(), 0);
  await page.getByRole('heading', { name: '最近更新' }).waitFor();
  if (process.env.RINSPACE_CREATOR_HOME_SCREENSHOT) {
    await page.screenshot({ path: process.env.RINSPACE_CREATOR_HOME_SCREENSHOT, fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/creator?view=content`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '打开创作导航' }).click();
  const mobileSidebar = page.getByRole('complementary', { name: '创作中心导航' });
  await mobileSidebar.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const element = document.querySelector('[aria-label="创作中心导航"]');
    if (!(element instanceof HTMLElement)) return false;
    const box = element.getBoundingClientRect();
    return box.left >= -1 && box.width >= 280;
  });
  if (process.env.RINSPACE_CREATOR_MOBILE_SCREENSHOT) {
    await page.screenshot({ path: process.env.RINSPACE_CREATOR_MOBILE_SCREENSHOT, fullPage: true });
  }
  await mobileSidebar.getByRole('link', { name: '数据分析' }).click();
  await page.locator('.creator-analytics').waitFor();
  await mobileSidebar.waitFor({ state: 'hidden' });
  const applicationConsoleErrors = consoleErrors.filter(({ url }) => !url.includes('api.tcloudbasegateway.com/auth/v1/user/me'));
  assert.deepEqual(applicationConsoleErrors, []);
} finally {
  await browser.close();
}

console.log('creator controls browser acceptance passed');

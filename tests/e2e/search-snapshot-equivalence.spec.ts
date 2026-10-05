import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const now = '2026-09-24T04:05:06Z';
const digest = 'a'.repeat(64);
const version = 'active:browser-fixture-v1';
const builtIndex = fs.readFileSync(path.resolve(__dirname, '../../build/index.html'), 'utf8');

const article = {
  id: '41', slug: 'semantic-search', type: 'blog', status: 'published',
  title: 'Semantic Search', author: 'Alice', authorId: 'alice', authorUid: 'user-41',
  meta: '', excerpt: 'Article public description.', interactions: '0 阅读', heat: '0',
  tags: ['topology'], tag_items: [{ tag_id: '61', slug_name: 'topology', display_name: 'Topology' }],
  images: [], coverUrl: '', editor: 'rin', body: '[[RIN_WRITER]]<p>Article primary text.</p>[[/RIN_WRITER]]',
  readCount: 0, favoriteCount: 0, collected: false, liked: false, likeCount: 0,
  createdAt: now, updatedAt: now, publishedAt: now, contentUpdatedAt: now,
  publicVersion: version, contentDigest: digest,
};

const book = {
  ...article,
  id: '51', slug: 'a-book', type: 'book', title: 'A Book', excerpt: 'Book public description.',
  tags: ['books'], tag_items: [{ tag_id: '22', slug_name: 'books', display_name: 'Books' }],
  body: '[[RIN_WRITER]]<p>Full book must not appear on the overview.</p>[[/RIN_WRITER]]',
  book: {
    kind: 'markdown', bookTitle: 'A Book', authors: ['Writer'], publisher: 'Rin Press',
    doi: '10.1000/book', isbn: [{ kind: 'ISBN-13', value: '9780000000001' }],
    toc: [{ title: 'Chapter One', page: 1, level: 1 }],
  },
};

const tag = {
  id: 61, tag_id: '61', slug: 'topology', slug_name: 'topology', name: 'Topology',
  displayName: 'Topology', excerpt: 'Spaces and continuity.', usage_excerpt: 'Spaces and continuity.',
  originalText: '# Topology', parsedText: '<h2>Definition</h2><p>Distinct Wiki body.</p>',
  html: '<h2>Definition</h2><p>Distinct Wiki body.</p>', tex_source: '', rendererFinal: true,
  followCount: 0, readCount: 0, questionCount: 0, status: 1, lifecycle_state: 'active',
  createdAt: now, updatedAt: now, repository_state: 'active', repository_id: 61,
  parent_tags: [{ tag_id: '7', slug_name: 'mathematics', display_name: 'Mathematics' }],
  outgoing_references: [], incoming_references: [], outgoing_object_references: [], incoming_object_references: [],
  publicVersion: version, contentDigest: digest,
};

const tagPage = {
  tag_id: '61', slug_name: 'topology', display_name: 'Topology', description: 'Spaces and continuity.',
  excerpt: 'Spaces and continuity.', original_text: '# Topology', parsed_text: '<p>Distinct Wiki body.</p>',
  follow_count: 0, like_count: 0, question_count: 0, is_follower: false, is_liked: false,
  created_at: 1, updated_at: 2, recommend: false, reserved: false, usage_excerpt: 'Spaces and continuity.',
};

type Fixture = {
  path: string;
  kind: 'article' | 'book' | 'tag';
  id: string;
  title: string;
  primary: string;
  primaryMarker: string;
  canonicalTagPath?: string;
  snapshot: string;
};

const fixtures: Fixture[] = [
  {
    path: '/a/41/semantic-search', kind: 'article', id: '41', title: 'Semantic Search',
    primary: 'Article primary text.', primaryMarker: 'article', canonicalTagPath: '/tags/61/topology',
    snapshot: `<main data-rin-search-main="true" data-rin-public-document="article" data-rin-object-id="41" data-rin-public-version="${version}" data-rin-content-digest="${digest}"><article><h1>Semantic Search</h1><p>Article public description.</p><section data-rin-primary-text="article"><p>Article primary text.</p></section><nav><a href="/tags/61/topology">Topology</a></nav></article></main>`,
  },
  {
    path: '/books/51/a-book', kind: 'book', id: '51', title: 'A Book',
    primary: 'Book public description.', primaryMarker: 'description', canonicalTagPath: '/tags/22/books',
    snapshot: `<main data-rin-search-main="true" data-rin-public-document="book" data-rin-object-id="51" data-rin-public-version="${version}" data-rin-content-digest="${digest}"><article><h1>A Book</h1><p data-rin-primary-text="description">Book public description.</p><dl><dt>出版社</dt><dd>Rin Press</dd></dl><nav><a href="/tags/22/books">Books</a></nav><a href="/books/51/read/a-book">进入阅读</a></article></main>`,
  },
  {
    path: '/tags/61/topology', kind: 'tag', id: '61', title: 'Topology',
    primary: 'Spaces and continuity.', primaryMarker: 'description',
    snapshot: `<main data-rin-search-main="true" data-rin-public-document="tag" data-rin-object-id="61" data-rin-public-version="${version}" data-rin-content-digest="${digest}"><article><h1>Topology</h1><p data-rin-primary-text="description">Spaces and continuity.</p><p>生命周期：active</p><nav><a href="/tags/7/mathematics">Mathematics</a></nav><nav><a href="/a/41/semantic-search">Semantic Search</a></nav><nav><a href="/books/51/a-book">A Book</a></nav><a href="/tags/61/info/topology">阅读 Tag Wiki</a></article></main>`,
  },
];

function documentWithSnapshot(fixture: Fixture) {
  const start = builtIndex.indexOf('<div id="root"');
  const end = builtIndex.lastIndexOf('</div>');
  if (start < 0 || end < start) throw new Error('built index root was not found');
  const root = `<div id="root" data-rin-ui="v2" data-rin-search-snapshot="true" data-rin-object-kind="${fixture.kind}" data-rin-object-id="${fixture.id}" data-rin-public-version="${version}" data-rin-content-digest="${digest}">${fixture.snapshot}</div>`;
  const document = builtIndex.slice(0, start) + root + builtIndex.slice(end + '</div>'.length);
  const metadata = `<link data-rin-metadata="canonical" rel="canonical" href="https://rinspace.com${fixture.path}" />
    <meta data-rin-metadata="robots" name="robots" content="index,follow" />`;
  return document.replace('</head>', `${metadata}</head>`);
}

async function routeDocuments(context: BrowserContext) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document') return route.continue();
    const fixture = fixtures.find((item) => new URL(request.url()).pathname === item.path);
    if (!fixture) return route.continue();
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: documentWithSnapshot(fixture) });
  });
}

async function handleAPI(route: Route) {
  const request = route.request();
  const pathname = new URL(request.url()).pathname.replace(/^\/rinspace(?=\/)/, '');
  if (pathname === '/api/identity/v1/session') return route.fulfill({ json: { status: 'anonymous' } });
  if (pathname === '/api/content/41') return route.fulfill({ json: article });
  if (pathname === '/api/content/51') return route.fulfill({ json: book });
  if (pathname === '/api/books') return route.fulfill({ json: { items: [book], count: 1, page: 1, pageSize: 36, generatedAt: now } });
  if (/^\/api\/content\/(41|51)\/read$/.test(pathname)) return route.fulfill({ json: { counted: true, readCount: 1 } });
  if (/^\/api\/content\/(41|51)\/book-context$/.test(pathname)) return route.fulfill({ json: { items: [], generatedAt: now } });
  if (pathname === '/api/tag') return route.fulfill({ json: tag });
  if (pathname === '/api/tags/page') return route.fulfill({ json: { count: 1, page: 1, page_size: 1, items: [tagPage] } });
  if (pathname === '/api/tag/stats') return route.fulfill({ json: { tag_id: '61', slug_name: 'topology', total: 0, questions: 0, blogs: 0, discussions: 0, dynamics: 0, announcements: 0 } });
  if (pathname === '/api/tag/cultivations') return route.fulfill({ json: { tag_id: '61', slug_name: 'topology', count: 0, page: 1, page_size: 6, items: [] } });
  if (pathname === '/api/revisions') return route.fulfill({ json: { items: [] } });
  if (pathname === '/api/content') return route.fulfill({ json: { items: [], count: 0, page: 1, pageSize: 12, generatedAt: now } });
  if (pathname.includes('/question/page')) return route.fulfill({ json: { items: [], count: 0, page: 1, pageSize: 12, generatedAt: now } });
  if (pathname === '/api/comments') return route.fulfill({ json: { items: [] } });
  return route.fulfill({ status: 404, json: { message: 'optional fixture endpoint unavailable' } });
}

function normalizedDigest(value: string) {
  return createHash('sha256').update(value.replace(/\s+/g, ' ').trim()).digest('hex');
}

async function snapshotState(page: Page, fixture: Fixture) {
  const main = page.locator('main[data-rin-public-document]');
  const primary = page.locator(`[data-rin-primary-text="${fixture.primaryMarker}"]`).first();
  return {
    title: (await main.getByRole('heading', { level: 1 }).first().textContent())?.trim(),
    kind: await main.getAttribute('data-rin-public-document'),
    id: await main.getAttribute('data-rin-object-id'),
    version: await main.getAttribute('data-rin-public-version'),
    digest: await main.getAttribute('data-rin-content-digest'),
    primaryDigest: normalizedDigest((await primary.textContent()) || ''),
    tagPath: fixture.canonicalTagPath
      ? new URL((await main.locator(`a[href$="${fixture.canonicalTagPath}"]`).first().getAttribute('href')) || '', 'https://rinspace.com').pathname
      : undefined,
  };
}

test('raw snapshots and hydrated core pages keep one equivalent public document', async ({ browser, page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One deterministic Chromium project covers the equivalence contract.');
  const origin = new URL(baseURL || 'http://127.0.0.1:4173').origin;
  await routeDocuments(page.context());
  await page.route('**/api/**', handleAPI);

  for (const fixture of fixtures) {
    const noScript = await browser.newContext({ javaScriptEnabled: false, baseURL: origin });
    await routeDocuments(noScript);
    const rawPage = await noScript.newPage();
    await rawPage.goto(`${origin}${fixture.path}`, { waitUntil: 'domcontentloaded' });
    const rawMain = rawPage.locator('main[data-rin-search-main="true"]');
    await expect(rawMain).toBeVisible();
    await expect(rawPage.locator('main')).toHaveCount(1);
    const raw = await snapshotState(rawPage, fixture);
    await expect(rawPage.locator('head title')).toHaveCount(1);
    await expect(rawPage.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(new URL((await rawPage.locator('link[rel="canonical"]').getAttribute('href')) || '').pathname).toBe(fixture.path);
    await noScript.close();

    await page.goto(`${origin}${fixture.path}`, { waitUntil: 'domcontentloaded' });
    const interactive = page.locator(`main[data-rin-public-document="${fixture.kind}"][data-rin-object-id="${fixture.id}"]`);
    await expect(interactive).toHaveAttribute('data-rin-public-version', version, { timeout: 20_000 });
    await expect(page.locator('#root')).toHaveAttribute('data-rin-interactive', 'true');
    await expect(page.locator('#root')).not.toHaveAttribute('data-rin-search-snapshot', 'true');
    await expect(page.locator('[data-rin-search-main]')).toHaveCount(0);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('head title')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href')) || '').pathname).toBe(fixture.path);
    const hydrated = await snapshotState(page, fixture);

    expect(raw).toEqual(hydrated);
    expect(raw.title).toBe(fixture.title);
    expect(raw.primaryDigest).toBe(normalizedDigest(fixture.primary));
    if (fixture.canonicalTagPath) expect(raw.tagPath).toBe(fixture.canonicalTagPath);
  }
});

test('client navigation between public content and Tag keeps one React-owned head', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One deterministic Chromium project covers the navigation contract.');
  const origin = new URL(baseURL || 'http://127.0.0.1:4173').origin;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await routeDocuments(page.context());
  await page.route('**/api/**', handleAPI);

  await page.goto(`${origin}/a/41/semantic-search`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main[data-rin-public-document="article"][data-rin-object-id="41"]'))
    .toHaveAttribute('data-rin-public-version', version);
  await page.locator('main a[href="/tags/61/topology"]').first().click();
  await expect(page).toHaveURL(`${origin}/tags/61/topology`);
  await expect(page.locator('main[data-rin-public-document="tag"][data-rin-object-id="61"]'))
    .toHaveAttribute('data-rin-public-version', version);
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  await page.goBack();
  await expect(page.locator('main[data-rin-public-document="article"][data-rin-object-id="41"]'))
    .toHaveAttribute('data-rin-public-version', version);
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test('book directory opens a Book without a refresh or duplicate metadata', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'One deterministic Chromium project covers the navigation contract.');
  const origin = new URL(baseURL || 'http://127.0.0.1:4173').origin;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/**', handleAPI);

  await page.goto(`${origin}/books`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/books/51/a-book"]').first().click();
  await expect(page).toHaveURL(`${origin}/books/51/a-book`);
  await expect(page.locator('main[data-rin-public-document="book"][data-rin-object-id="51"]'))
    .toHaveAttribute('data-rin-public-version', version);
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL(`${origin}/books`);
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

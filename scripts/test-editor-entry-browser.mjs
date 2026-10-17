#!/usr/bin/env node
// Compiled UI contract test with local fixtures. No production content writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const site = fs.realpathSync(process.argv[2] || 'build');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-editor-entry-browser-'));
const profile = path.join(output, 'profile');
const preferenceKey = 'rinspace-article-editor-preference-v1';
const now = new Date().toISOString();
const user = {
  id: 'creator-uid', username: 'creator', display_name: 'Creator',
  created_at: 1, last_login_date: 1, avatar: { type: 'custom', custom: '', gravatar: '' },
  cover_url: '', mobile: '', bio: '', bio_html: '', website: '', location: '',
  language: 'zh-CN', color_scheme: 'system', access_token: '', role_id: 1,
  role_name: 'member', rank: 0, status: 'active', have_password: true,
  visit_token: '', suspended_until: 0,
};
let bookKind = 'original', bookEditor = 'rin', ownBook = true, pdf = false;
let articleEditor = 'rin', ownArticle = true;
let creationResult = 'success';
const creations = [], navigations = [], runtimeErrors = [], consoleErrors = [], checks = [];
function content(overrides = {}) {
  return {
    id: '942', type: 'blog', editor: 'rin', status: 'draft', repositoryStatus: 'published',
    sourceVisibility: 'open', title: 'Editor entry fixture', author: 'Creator',
    authorId: 'creator', authorUid: 'creator-uid', meta: '', excerpt: 'Fixture summary',
    interactions: '0', heat: '', tags: [], images: [], slug: 'editor-entry-fixture',
    body: '[[RIN_SOURCE]]\\documentclass{book}\\begin{document}Fixture\\end{document}[[/RIN_SOURCE]]',
    readCount: 0, collected: false, createdAt: now, updatedAt: now, ...overrides,
  };
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(site, '.' + decodeURIComponent(url.pathname.replace(/^\/rinspace\//, '/')));
  const target = file.startsWith(site + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
    ? file : path.join(site, 'index.html');
  response.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(target).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  await context.addInitScript(() => localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'creator-uid' })));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') return route.fulfill({ json: {
      status: 'authenticated', csrfToken: 'fixture-csrf',
      user: { id: 'creator-uid', username: 'creator', role: 'member' },
      currentSession: { sid: 'fixture-session', version: 1 },
    } });
    if (pathname === '/api/user/info') return route.fulfill({ json: user });
    if (pathname === '/api/gitea/sso') return route.fulfill({ status: 204 });
    if (pathname === '/api/content' && request.method() === 'POST') {
      const input = request.postDataJSON(); creations.push(input);
      if (creationResult === 'error') return route.fulfill({ status: 503, json: { message: 'Fixture creation unavailable' } });
      if (creationResult === 'moderation') return route.fulfill({ json: {
        submissionId: 'fixture-review', state: 'manual_review_pending', message: 'Fixture review pending',
      } });
      return route.fulfill({ json: content({ editor: input.editor, publicationPending: true }) });
    }
    if (pathname === '/api/content/942') return route.fulfill({ json: content({
      type: 'book', editor: bookEditor, authorUid: ownBook ? 'creator-uid' : 'someone-else',
      book: { kind: bookKind, bookTitle: 'Editor entry fixture', authors: [], ...(pdf ? { pdfUrl: '/fixture.pdf' } : {}) },
    }) });
    if (pathname === '/api/content/941') return route.fulfill({ json: content({
      id: '941', editor: articleEditor, authorUid: ownArticle ? 'creator-uid' : 'someone-else',
      body: '[[RIN_WRITER]]<p>Editor entry fixture body.</p>[[/RIN_WRITER]]',
    }) });
    if (pathname === '/editor/' || /^\/repos\/[ab]\/942\/?$/.test(pathname)) {
      navigations.push(url.pathname + url.search);
      return route.fulfill({ contentType: 'text/html', body: '<h1>Navigation target only — not an editor functionality test</h1>' });
    }
    if (pathname.includes('/api/')) return route.fulfill({ json: { items: [], count: 0 } });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return page;
}
async function openArticle(page, format) {
  await page.goto(`${base}/about`);
  await page.getByRole('button', { name: /^(创作|Create)$/ }).click();
  const article = page.getByRole('menuitem', { name: /^(文章|Article|Articles)$/ });
  await article.hover(); await article.press('ArrowRight');
  await page.getByRole('menuitem', { name: format, exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  return dialog;
}
const selector = dialog => dialog.getByRole('combobox', { name: /^(编辑器|Editor)$/ });
async function submit(page, dialog) {
  await dialog.getByLabel(/^(标题|Title)$/).fill('Editor entry fixture');
  await dialog.getByLabel(/^(简介|摘要|Summary)$/).fill('Fixture summary');
  await dialog.getByRole('button', { name: /^(创建并编辑|Create and edit)$/ }).click();
}
try {
  let page = await launch(), dialog = await openArticle(page, 'LaTeX');
  assert.equal(await selector(dialog).inputValue(), 'online');
  assert.equal(await selector(dialog).evaluate(element => getComputedStyle(element).borderRadius), '0px');
  const choice = await selector(dialog).boundingBox(), actions = await dialog.locator('.publish-dialog-footer-actions').boundingBox();
  assert.ok(choice && actions && choice.x + choice.width < actions.x, 'Editor select must be left of action group');
  await dialog.screenshot({ path: path.join(output, 'desktop-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await dialog.screenshot({ path: path.join(output, 'desktop-dark.png') });
  await selector(dialog).selectOption('git');
  checks.push('Default Online; square corners; desktop footer ordering; light/dark');
  await page.keyboard.press('Escape');
  dialog = await openArticle(page, 'Typst');
  assert.equal(await selector(dialog).inputValue(), 'git');
  await page.reload(); dialog = await openArticle(page, 'LaTeX');
  assert.equal(await selector(dialog).inputValue(), 'git');
  await context.close(); context = undefined;
  page = await launch(); dialog = await openArticle(page, 'Typst');
  assert.equal(await selector(dialog).inputValue(), 'git');
  checks.push('Shared preference survives reopening, reload and full browser restart');
  await page.setViewportSize({ width: 390, height: 844 });
  await selector(dialog).scrollIntoViewIfNeeded();
  for (const control of [selector(dialog), dialog.getByRole('button', { name: /^(取消|Cancel)$/ }), dialog.getByRole('button', { name: /^(创建并编辑|Create and edit)$/ })]) {
    const bounds = await control.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Narrow-screen control clipped');
  }
  await page.screenshot({ path: path.join(output, 'mobile.png') });
  checks.push('390px mobile selector and both action buttons remain usable');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const format of ['LaTeX', 'Typst']) for (const destination of ['online', 'git']) {
    dialog = await openArticle(page, format);
    await selector(dialog).selectOption(destination);
    const expected = destination === 'online' ? '/editor/?mode=managed&owner=a&repository=942' : '/repos/a/942';
    await submit(page, dialog);
    await page.waitForURL(base + expected);
    assert.equal(creations.at(-1).editor, format === 'LaTeX' ? 'rin' : 'typst');
    assert.equal(creations.at(-1).type, 'blog');
    assert.equal(creations.at(-1).repositoryStatus, 'published');
  }
  checks.push('Both article formats navigate to their exact new Online/Git project with unchanged format payload');
  for (const result of ['error', 'moderation']) {
    creationResult = result; dialog = await openArticle(page, 'LaTeX');
    const previous = navigations.length; await submit(page, dialog);
    if (result === 'error') await dialog.getByRole('alert').waitFor();
    else await dialog.getByRole('status').filter({ hasText: /内容已提交审核|Content submitted for review/ }).waitFor();
    assert.equal(await selector(dialog).isEnabled(), true, 'Creation must have completed, not just displayed its loading status');
    assert.equal(navigations.length, previous);
    assert.equal(await dialog.isVisible(), true);
  }
  creationResult = 'success';
  checks.push('Failure and moderation keep the dialog without navigating');
  for (const editor of ['rin', 'latex', 'typst']) {
    articleEditor = editor;
    await page.goto(`${base}/a/941/editor-entry-fixture`);
    // Let the fixture's detail/comments/revision requests finish before a
    // full-document navigation, rather than aborting an unrelated GET mid-flight.
    await page.waitForLoadState('networkidle');
    const edit = page.locator('.blog-header-actions').getByRole('button', { name: /^(编辑|Edit)$/ });
    await edit.click(); await page.waitForURL(`${base}/editor/?mode=managed&owner=a&repository=941`);
  }
  articleEditor = 'markdown';
  await page.goto(`${base}/a/941/editor-entry-fixture`);
  await page.waitForLoadState('networkidle');
  const markdownEdit = page.locator('.blog-header-actions').getByRole('link', { name: /^(编辑|Edit)$/ });
  await markdownEdit.waitFor();
  assert.equal(await markdownEdit.getAttribute('href'), '/write/markdown?edit=editor-entry-fixture');
  ownArticle = false; articleEditor = 'rin';
  await page.goto(`${base}/a/941/editor-entry-fixture`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Editor entry fixture', exact: true }).first().waitFor();
  assert.equal(await page.locator('.blog-header-actions').getByRole('button', { name: /^(编辑|Edit)$/ }).count(), 0);
  checks.push('LaTeX/Typst detail Edit always opens exact Online project; Markdown and author permissions unchanged');
  for (const [kind, editor] of [['original', 'rin'], ['typst', 'typst'], ['original', 'typst']]) {
    bookKind = kind; bookEditor = editor;
    await page.goto(`${base}/books/942/workspace`);
    const git = page.getByRole('button', { name: /^(打开仓库|Open repository)$/ });
    const online = page.getByRole('button', { name: /^(在编辑器中打开|Open in editor)$/ });
    await online.waitFor();
    assert.equal(await git.evaluate(element => /在编辑器中打开|Open in editor/.test(element.nextElementSibling?.textContent || '')), true);
    await online.click(); await page.waitForURL(`${base}/editor/?mode=managed&owner=b&repository=942`);
  }
  checks.push('LaTeX, Typst and legacy Typst book buttons are adjacent and open exact b/<id>');
  ownBook = false; await page.goto(`${base}/books/942/workspace`);
  await page.locator('.book-workspace-hero').waitFor();
  assert.equal(await page.getByRole('button', { name: /^(在编辑器中打开|Open in editor)$/ }).count(), 0);
  ownBook = true; pdf = true; bookKind = 'original'; bookEditor = 'rin';
  await page.goto(`${base}/books/942/workspace`);
  await page.getByRole('button', { name: /^(打开仓库|Open repository)$/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(在编辑器中打开|Open in editor)$/ }).count(), 0);
  checks.push('Non-author and PDF actions do not gain an editor entry');
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(consoleErrors.filter(message => !/Fixture creation unavailable|503 \(Service Unavailable\)/.test(message)), [], 'Unexpected browser console errors');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, fixtureOnly: true,
    site, checks, navigations, creations: creations.map(({ type, editor }) => ({ type, editor })),
    runtimeErrors, consoleErrors, limitations: ['Navigation targets are placeholders. Actual managed-editor integration is checked separately.'],
  }, null, 2));
  console.log(JSON.stringify({ passed: true, output, checks }));
} catch (error) {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, checks, runtimeErrors, consoleErrors }, null, 2));
  const page = context?.pages().at(-1);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') });
  console.error(`Browser evidence: ${output}`); throw error;
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
}

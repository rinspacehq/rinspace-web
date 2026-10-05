import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';

import { localOrigin } from './gateway.mjs';

// Explicit opt-in: reads real public data only, in a fresh browser context.
// Never load stored browser profiles, credentials or production test accounts.
const args = process.argv.slice(2);
if (!args.includes('--live-read-only')) throw new Error('Pass --live-read-only to acknowledge anonymous production reads.');
const portIndex = args.indexOf('--port');
const origin = localOrigin(portIndex === -1 ? 5173 : Number(args[portIndex + 1]));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  const statusByPath = new Map();
  let hmrConnected = false;
  page.on('pageerror', (error) => errors.push(error.name));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.startsWith('/api/')) statusByPath.set(url.pathname, response.status());
  });
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      try { if (JSON.parse(String(payload)).type === 'connected') hmrConnected = true; } catch { /* Not an HMR message. */ }
    });
  });
  await Promise.all([
    ...['/api/feed', '/api/home/sidebar', '/api/sponsor/supporters'].map((pathname) =>
      page.waitForResponse((response) => new URL(response.url()).origin === origin && new URL(response.url()).pathname === pathname && response.status() === 200, { timeout: 60_000 })),
    page.goto(origin, { waitUntil: 'domcontentloaded' }),
  ]);
  await page.locator('main').first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('#root')?.getAttribute('data-rin-interactive') === 'true');
  const feed = await context.request.get(`${origin}/api/feed?limit=2`);
  assert.equal(feed.status(), 200);
  assert.ok(Array.isArray((await feed.json()).stream));
  const session = await context.request.get(`${origin}/api/identity/v1/session`);
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).status, 'anonymous');
  // The managed launcher may issue a LOCAL HttpOnly preauth identifier. Never
  // accept a copied website access/refresh/preauth cookie.
  assert.doesNotMatch(session.headers()['set-cookie'] || '', /__Host-rin_|rin_at_|rin_rf_/);
  const status = await context.request.get(`${origin}/__rinspace_local/status`);
  assert.equal((await status.json()).authorizationReady, false);
  for (const pathname of ['/repos/', '/?world=inner']) {
    const response = await context.request.get(`${origin}${pathname}`, {
      headers: { 'sec-fetch-mode': 'navigate' }, maxRedirects: 0,
    });
    assert.equal(response.status(), 302);
    assert.equal(response.headers().location, `https://rinspace.com${pathname}`);
  }
  const invalidOrigin = await context.request.get(`${origin}/api/feed`, { headers: { origin: 'https://untrusted.example' } });
  assert.equal(invalidOrigin.status(), 403);
  const write = await context.request.post(`${origin}/api/like`, { data: {} });
  assert.equal(write.status(), 503);
  assert.equal((await write.json()).code, 'local.authorization_not_ready');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.doesNotMatch(storage, /rin_at_|rin_rf_|access_token|refresh_token/);
  assert.equal(errors.length, 0);
  assert.equal(hmrConnected, true);
  console.log(JSON.stringify({ browser: 'chromium', mode: 'anonymous-production-reads', mainRendered: true, hmrConnected, api: Object.fromEntries(statusByPath), noProductionBrowserCredentials: true, officialLinks: true, unauthenticatedWritesBlocked: true }));

  // Maintainer test: apply temporary CSS edits with apply_patch externally.
  // This script NEVER edits product source itself. A hot style update must retain
  // the same document, URL and real-data UI; remove the probe after verification.
  if (args.includes('--hmr-probe')) {
    const documentTime = await page.evaluate(() => performance.timeOrigin);
    const initialURL = page.url();
    console.log('HMR probe ready. Apply --rin-local-hmr-probe to styles/index.css, then send v1, v2, or close on stdin.');
    const input = createInterface({ input: process.stdin });
    try {
      for await (const value of input) {
        if (value === 'close') break;
        assert.ok(value === 'v1' || value === 'v2');
        await page.waitForFunction((expected) => getComputedStyle(document.documentElement).getPropertyValue('--rin-local-hmr-probe').trim() === expected, value);
        assert.equal(await page.evaluate(() => performance.timeOrigin), documentTime);
        assert.equal(page.url(), initialURL);
        console.log(`HMR ${value} passed without a document reload.`);
      }
    } finally {
      input.close();
      process.stdin.pause();
    }
  }
} finally {
  await browser.close();
}

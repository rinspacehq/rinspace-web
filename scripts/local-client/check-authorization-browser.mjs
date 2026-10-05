// Clean-room browser flow. No production credentials, network writes or local
// business DB. These fixtures are test inputs, never a user startup backend.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { localPublicConfigPlugin } from './config.mjs';
import { localOrigin, loopbackGuardPlugin } from './gateway.mjs';
import { createLocalSession, issuer } from './session.mjs';
import { createIdentityFixture } from './fixture.mjs';
import { checkResourceFlow } from './check-resource-flow.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const local = localOrigin(5177); const officialAssets = localOrigin(5178);
let fixtureTime = Date.now();
const fixture = createIdentityFixture({ now: () => fixtureTime });
const session = createLocalSession({ origin: local, fetchImpl: fixture.transport, now: () => fixtureTime });
// Different public defines require separate optimizer caches. Sharing the
// default .vite cache makes the two instances invalidate each other's modules.
const server = await createServer({ root, cacheDir: path.join(root, 'node_modules/.vite-local-authorization-fixture'), configFile: path.join(root, 'vite.config.ts'), plugins: [localPublicConfigPlugin(root, 5177), loopbackGuardPlugin(local, fixture.transport, session)] });
const official = await createServer({ root, cacheDir: path.join(root, 'node_modules/.vite-official-authorization-fixture'), configFile: path.join(root, 'vite.config.ts'), plugins: [localPublicConfigPlugin(root, 5178), {
  name: 'synthetic-official-page-config', enforce: 'post', config(config) {
    const env = JSON.parse(config.define.__RINSPACE_PUBLIC_ENV__); env.localRealClient = false;
    config.define.__RINSPACE_PUBLIC_ENV__ = JSON.stringify(env); config.server.hmr = false;
  },
}] });
let browser;
let currentPage;
const errors = []; const resourceErrors = [];
let websiteUser = true;
try {
  await server.listen(); await official.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  currentPage = page;
  const credentialLeaks = [];
  page.on('pageerror', error => { errors.push(error.message); });
  page.on('response', response => { if (response.status() >= 400) resourceErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  page.on('requestfailed', request => { resourceErrors.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }); });
  page.on('request', request => {
    const target = new URL(request.url());
    if (/rin_at_|rin_rf_|codeVerifier|access_token|refresh_token/.test(target.href)) credentialLeaks.push('credential-bearing browser URL');
    if (target.origin === local && request.headers().authorization) credentialLeaks.push('browser bearer');
  });
  // Intercept the ENTIRE virtual official site. Never send a browser login or
  // request to production. Only local Vite assets and local callback are real.
  await context.route('**/*', async route => {
    const request = route.request(); const target = new URL(request.url());
    if (target.origin === local || target.hostname === '127.0.0.1') { await route.continue(); return; }
    if (target.origin !== issuer) { await route.abort(); return; }
    if (target.pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: websiteUser ? { status: 'authenticated', csrfToken: 'synthetic-official-csrf',
        user: { id: 'synthetic-local-user', username: 'Synthetic account', role: 'member' },
        currentSession: { sid: 'synthetic-website-sid', version: 1 } } : { status: 'anonymous', csrfToken: 'synthetic-official-csrf' } }); return;
    }
    if (target.pathname === '/api/identity/v1/native/authorize') {
      assert.equal(request.method(), 'POST'); assert.equal(request.headers()['x-rinspace-csrf'], 'synthetic-official-csrf');
      const input = request.postDataJSON(); assert.equal(input.confirm, true); delete input.confirm;
      await route.fulfill({ json: fixture.grant(new URLSearchParams(input)) }); return;
    }
    if (target.pathname.startsWith('/api/')) { await route.fulfill({ json: { items: [] } }); return; }
    // Frontend assets are reviewed local source, not the public retired tree.
    const response = await fetch(officialAssets + target.pathname + target.search);
    const headers = { 'content-type': response.headers.get('content-type') || 'application/octet-stream' };
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  console.log('Browser fixture: checking unchanged home and local login entry.');
  await page.goto(local, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('textbox', { name: '手机号', exact: true }).count(), 0);
  assert.match(await page.getByRole('dialog').innerText(), /真实账号|真实数据/);
  await page.getByRole('button', { name: '前往官网授权', exact: true }).click();
  await page.getByRole('heading', { name: '授权本地 Rinspace 客户端', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: '允许并返回本地', exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(new URL(page.url()).origin, issuer);
  assert.equal(new URL(page.url()).search, '');
  assert.match(await page.locator('main').innerText(), /synthetic-local-user/);
  assert.match(await page.locator('main').innerText(), /正式数据/);
  assert.equal(fixture.calls.filter(call => call.path.endsWith('/token')).length, 0);
  console.log('Browser fixture: explicit official consent, then one-shot loopback callback.');
  await page.getByRole('button', { name: '允许并返回本地', exact: true }).click();
  await page.waitForURL(local + '/', { timeout: 30_000 });
  if (!process.argv.includes('--resource-baseline')) await page.locator('.rin-topbar-shell').waitFor({ timeout: 30_000 });
  const confirmed = await page.evaluate(async () => (await fetch('/api/identity/v1/session', { cache: 'no-store' })).json());
  assert.equal(confirmed.status, 'authenticated'); assert.equal(confirmed.user.id, 'synthetic-local-user');
  assert.doesNotMatch(JSON.stringify(confirmed), /rin_at_|rin_rf_|codeVerifier/);
  assert.equal(fixture.calls.filter(call => call.path.endsWith('/token')).length, 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await page.evaluate(async () => (await fetch('/api/identity/v1/session')).json());
  assert.equal(afterReload.currentSession.sid, confirmed.currentSession.sid);
  // Enter the real application document before importing its service modules.
  // The callback's separate port is same-site, not same-origin; check that
  // return navigation separately rather than hiding it behind an API-only test.
  await page.goto(local + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('.rin-topbar-shell').waitFor({ timeout: 30_000 });
  await checkResourceFlow({ page, fixture, baseline: process.argv.includes('--resource-baseline') });
  console.log('Browser fixture: unchanged Settings security center, purpose-bound phone verification and device/credential revocation.');
  await page.goto(local + '/settings', { waitUntil: 'domcontentloaded' });
  const security = page.locator('.identity-security-center');
  await security.getByRole('button', { name: '退出此设备', exact: true }).waitFor({ timeout: 30_000 });
  await security.getByRole('button', { name: '退出此设备', exact: true }).click();
  const verification = page.getByRole('dialog', { name: '退出此设备', exact: true });
  await verification.getByRole('textbox', { name: '手机号', exact: true }).fill('13900009999');
  await verification.getByRole('button', { name: '发送验证码', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#identity-step-up-phone')?.disabled === true);
  await verification.getByRole('textbox', { name: '验证码', exact: true }).fill('000000');
  await verification.getByRole('button', { name: '确认操作', exact: true }).click();
  await security.getByRole('alert').waitFor();
  assert.equal(fixture.state.websiteRevoked, false); assert.equal(session.hasSession(), true);
  await verification.getByRole('textbox', { name: '验证码', exact: true }).fill('123456');
  await verification.getByRole('button', { name: '确认操作', exact: true }).click();
  await verification.waitFor({ state: 'hidden' });
  assert.equal(fixture.state.websiteRevoked, true); assert.equal(fixture.state.active, true);
  assert.match(await security.innerText(), /仍在清理/);
  fixtureTime += 60_001; // Test clock only, never waits or sends production SMS.
  await security.getByRole('button', { name: '撤销此凭据', exact: true }).click();
  const credentialDialog = page.getByRole('dialog', { name: '撤销此凭据', exact: true });
  await credentialDialog.getByRole('textbox', { name: '手机号', exact: true }).fill('13900009999');
  await credentialDialog.getByRole('button', { name: '发送验证码', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#identity-step-up-phone')?.disabled === true);
  await credentialDialog.getByRole('textbox', { name: '验证码', exact: true }).fill('123456');
  await credentialDialog.getByRole('button', { name: '确认操作', exact: true }).click();
  await credentialDialog.waitFor({ state: 'hidden' });
  assert.equal(fixture.state.credentialRevoked, true); assert.equal(fixture.state.active, true);
  await security.getByRole('button', { name: '退出当前设备', exact: true }).waitFor();
  const metadata = await page.evaluate(async () => JSON.stringify(await (await fetch('/api/identity/v1/credentials')).json()));
  assert.doesNotMatch(metadata, /must-not-reach-browser|secret|rin_su_/);
  console.log('Browser fixture: wrong code preserved session; website device revoked independently; credential accepted with honest pending cleanup.');
  await page.goto(local + '/', { waitUntil: 'domcontentloaded' });
  const writes = await page.evaluate(async () => {
    const envelope = await (await fetch('/api/identity/v1/session')).json();
    const statuses = [];
    for (const url of ['/api/like', '/api/collection']) statuses.push((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rinspace-csrf': envelope.csrfToken }, body: JSON.stringify({ post_id: 279 }) })).status);
    return statuses;
  });
  assert.deepEqual(writes, [200, 200]); assert.equal(fixture.state.likes, 1); assert.equal(fixture.state.bookmarks, 1);
  const cookies = await context.cookies(local);
  assert.ok(cookies.some(cookie => cookie.name.startsWith('rin_local_') && cookie.httpOnly && cookie.sameSite === 'Lax'));
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.doesNotMatch(storage, /rin_at_|rin_rf_|rin_nc_|rin_su_|codeVerifier|synthetic-verification|synthetic-provider/);
  const logout = await page.evaluate(async () => {
    const envelope = await (await fetch('/api/identity/v1/session')).json();
    return (await fetch('/api/identity/v1/session/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rinspace-csrf': envelope.csrfToken }, body: '{"requestId":"synthetic-browser-logout"}' })).status;
  });
  assert.equal(logout, 200); assert.equal(session.hasSession(), false);
  console.log('Browser fixture: reload, guarded fixture likes/bookmarks and independent logout passed.');
  // New clean contexts prevent account hints from becoming synthetic login.
  websiteUser = false;
  await page.goto(local); await page.getByRole('button', { name: '登录 / 注册', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: '前往官网授权', exact: true }).click();
  await page.getByRole('button', { name: '先登录自己的账号', exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await page.getByRole('button', { name: '允许并返回本地', exact: true }).count(), 0);
  await page.getByRole('button', { name: '先登录自己的账号', exact: true }).click();
  await page.getByRole('textbox', { name: '手机号', exact: true }).waitFor({ timeout: 30_000 });
  // No SMS or authentication submit. Verify existing official login, then cancel.
  await page.getByRole('button', { name: '关闭登录窗口', exact: true }).click();
  await page.getByRole('button', { name: '取消授权', exact: true }).click();
  await page.waitForURL(/127\.0\.0\.1:[0-9]+\/$/, { timeout: 15_000 });
  assert.equal(session.hasSession(), false);
  assert.equal(fixture.calls.filter(call => call.path.endsWith('/token')).length, 1);
  assert.deepEqual(credentialLeaks, []); assert.deepEqual(errors, []);
  console.log('Browser fixture passed: official anonymous login entry, cancellation, no capability in browser URLs/storage and no page errors. No production login/write occurred.');
} catch (error) {
  console.error(JSON.stringify({ fixtureFailure: true, path: currentPage ? new URL(currentPage.url()).pathname : '',
    visibleCopy: currentPage ? (await currentPage.locator('body').innerText()).slice(0, 350) : '', errors, resourceErrors: resourceErrors.slice(0, 12) }));
  throw error;
} finally {
  await browser?.close(); await session.close(); await Promise.all([server.close(), official.close()]);
}

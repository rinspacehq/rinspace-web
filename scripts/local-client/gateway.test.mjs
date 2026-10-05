import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';

import { createReadOnlyMiddleware, localOrigin, loopbackGuardPlugin, validLocalRequest } from './gateway.mjs';

const origin = localOrigin(5173);
const json = (body, options = {}) => new Response(JSON.stringify(body), {
  ...options, headers: { 'content-type': 'application/json', ...options.headers },
});

async function invoke({ url = '/rinspace/api/feed', method = 'GET', headers = {}, transport = async () => json({ items: [] }) } = {}) {
  let status = 200;
  let body = '';
  let nextCalled = false;
  const responseHeaders = new Map();
  const response = {
    setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value); },
    writeHead(code, entries = {}) { status = code; for (const [k, v] of Object.entries(entries)) this.setHeader(k, v); },
    end(chunk = '') { body += chunk; },
  };
  // Use bodyless responses here; the real HTTP test below exercises streaming.
  await createReadOnlyMiddleware({ origin, fetchImpl: transport })(
    { url, method, headers: { host: '127.0.0.1:5173', ...headers } },
    response, () => { nextCalled = true; },
  );
  return { status, body, headers: responseHeaders, nextCalled };
}

test('ports and origins cannot become LAN or arbitrary proxy targets', () => {
  for (const port of [0, 80, 1023, 65536, NaN, 5173.1, '5173']) assert.throws(() => localOrigin(port));
  for (const value of ['http://localhost:5173', 'http://0.0.0.0:5173', 'http://evil.test:5173', 'https://127.0.0.1:5173', `${origin}/`, 'http://127.0.0.1:05173']) {
    assert.throws(() => createReadOnlyMiddleware({ origin: value }));
  }
});

test('Host, Origin and Fetch Metadata are checked for all requests', async () => {
  for (const headers of [
    { host: 'evil.test:5173' }, { host: 'localhost:5173' }, { host: '127.0.0.1:9999' },
    { origin: 'https://evil.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
  ]) {
    const result = await invoke({ url: '/rinspace/src/App.tsx', headers });
    assert.equal(result.status, 403);
    assert.equal(result.nextCalled, false);
  }
  assert.equal((await invoke({ url: '/', headers: { origin, 'sec-fetch-site': 'same-origin' } })).nextCalled, true);
});

test('all writes, identity lifecycle and other runtimes fail before upstream', async () => {
  let calls = 0;
  const transport = async () => { calls += 1; throw new Error('Must not reach upstream'); };
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    const result = await invoke({ method, transport });
    assert.equal(result.status, 503);
    assert.match(result.body, /local.authorization_not_ready/);
  }
  for (const url of ['/api/identity/v1/sessions', '/api/identity/v1/native/token', '/rinspace/api/identity/v1/credentials']) {
    assert.equal((await invoke({ url, transport })).status, 503);
  }
  for (const url of ['/internal/v1/identity/introspect', '/api/v1/accounts', '/rinspace/api/v1/accounts', '/api/rinspace/admin', '/api/web/settings', '/admin/api/users', '/rinspace/admin/api/users', '/auth/sign_in', '/oauth/token', '/rin/api/save', '/quiver/', '/code/s/example/', '/rinspace/api/gitea/sso']) {
    const result = await invoke({ url, transport });
    assert.equal(result.status, 403);
    assert.equal(result.nextCalled, false);
  }
  assert.equal(calls, 0);
});

test('official Gitea and inner world are navigation redirects, not service proxies', async () => {
  for (const url of ['/repos/', '/repos/a/42', '/git/a/42', '/git-auth?next=%2Frepos%2Fa%2F42', '/?world=inner']) {
    const result = await invoke({ url, headers: { 'sec-fetch-mode': 'navigate' } });
    assert.equal(result.status, 302);
    assert.equal(result.headers.get('location'), `https://rinspace.com${url}`);
    assert.equal(result.nextCalled, false);
    assert.equal((await invoke({ url, headers: { 'sec-fetch-mode': 'cors' } })).status, 403);
    assert.equal((await invoke({ url, method: 'POST' })).status, 403);
  }
});

test('malformed, traversal and credential-bearing URLs never reach upstream', async () => {
  for (const url of ['//evil.test/', '/rinspace/api/../admin', '/rinspace/api/%2e%2e/admin', '/rinspace/api/%252e%252e/admin', '/rinspace/api/a%2fb', '/rinspace/api/a%255cb', '/rinspace/api/%zz', '/rinspace/api/%00', '/rinspace/api/feed?access_token=secret', '/rinspace/api/feed?REFRESH_TOKEN=secret']) {
    const result = await invoke({ url, transport: async () => { throw new Error('Must not forward'); } });
    assert.equal(result.status, 400, url);
  }
});

test('redirects and HTML fallback cannot masquerade as a successful API response', async () => {
  const redirect = await invoke({ transport: async () => new Response(null, { status: 302, headers: { location: 'https://evil.test', 'set-cookie': 'secret=1' } }) });
  assert.equal(redirect.status, 502);
  assert.equal(redirect.headers.has('location'), false);
  assert.equal(redirect.headers.has('set-cookie'), false);
  const html = await invoke({ transport: async () => new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal(html.status, 502);
  assert.match(html.body, /upstream_contract_rejected/);
});

test('upstream errors do not echo tokens, headers, URLs or exception text', async () => {
  const result = await invoke({ transport: async () => { throw new Error('Bearer PRIVATE_TOKEN at sensitive?query'); } });
  assert.equal(result.status, 502);
  assert.doesNotMatch(result.body, /PRIVATE_TOKEN|sensitive|Bearer/);
});

test('the launcher is explicitly read-only; local pages and assets fall through to Vite', async () => {
  const status = await invoke({ url: '/__rinspace_local/status' });
  assert.deepEqual(JSON.parse(status.body), { mode: 'anonymous-read-only', officialOrigin: 'https://rinspace.com', authorizationReady: false });
  for (const url of ['/', '/a/42/example', '/rinspace/', '/rinspace/src/App.tsx', '/rinspace/@vite/client', '/rinspace/assets/brand/rinspace-mark-128.png']) {
    assert.equal((await invoke({ url })).nextCalled, true);
  }
});

test('WebSocket guard rejects cross-origin HMR before its listener runs', () => {
  const rejected = [{ host: 'evil.test', origin }, { host: '127.0.0.1:5173' }, { host: '127.0.0.1:5173', origin: 'https://evil.test' }];
  assert.equal(validLocalRequest({ headers: { host: '127.0.0.1:5173', origin } }, origin, true), true);
  let upgrade;
  loopbackGuardPlugin(origin).configureServer({ middlewares: { use() {} }, httpServer: { prependListener(event, fn) { assert.equal(event, 'upgrade'); upgrade = fn; } } });
  for (const headers of rejected) {
    let destroyed = false;
    upgrade({ headers }, { destroy() { destroyed = true; } });
    assert.equal(destroyed, true);
  }
});

test('callback-port return permits only a same-site top-level home navigation, not API/iframe/HMR access', async () => {
  const navigation = { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  assert.equal((await invoke({ url: '/', headers: navigation })).nextCalled, true);
  for (const candidate of [
    { url: '/api/file', headers: navigation }, { url: '/src/app/config/env.ts', headers: navigation },
    { url: '/', method: 'POST', headers: navigation }, { url: '/', headers: { ...navigation, 'sec-fetch-mode': 'cors' } },
    { url: '/', headers: { ...navigation, 'sec-fetch-dest': 'iframe' } }, { url: '/', headers: { ...navigation, origin: 'http://127.0.0.1:9999' } },
    { url: '/', headers: { ...navigation, 'sec-fetch-site': 'cross-site' } },
  ]) assert.equal((await invoke(candidate)).status, 403);
  assert.equal(validLocalRequest({ url: '/', method: 'GET', headers: { host: '127.0.0.1:5173', ...navigation } }, origin, true), false);
});

test('real HTTP streaming preserves upstream status, ranges and anonymous truth, strips all credentials', async (t) => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/session')) return json({ status: 'anonymous', csrfToken: 'anonymous-only' }, { headers: { 'set-cookie': '__Host-rin_preauth=never-forward' } });
    if (url.includes('/failed')) return json({ code: 'real.error' }, { status: 503 });
    return new Response('data', { status: 206, headers: {
      'content-type': 'application/octet-stream', 'content-range': 'bytes 0-3/100', 'accept-ranges': 'bytes',
      'set-cookie': '__Host-rin_access=never-forward', 'www-authenticate': 'Bearer token', 'access-control-allow-origin': '*',
    } });
  };
  const httpServer = createServer();
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => { httpServer.closeAllConnections(); return new Promise((resolve) => httpServer.close(resolve)); });
  const address = httpServer.address();
  const realOrigin = localOrigin(address.port);
  httpServer.on('request', createReadOnlyMiddleware({ origin: realOrigin, fetchImpl: transport }));
  const response = await fetch(`${realOrigin}/rinspace/api/file?offset=0`, { headers: {
    Cookie: '__Host-rin_access=do-not-forward', Authorization: 'Bearer do-not-forward',
    'x-rinspace-csrf': 'do-not-forward', 'x-rin-service-signature': 'do-not-forward',
    'x-device-id': 'do-not-forward', 'x-forwarded-host': 'evil.test', range: 'bytes=0-3',
  } });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'data');
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/100');
  for (const name of ['set-cookie', 'www-authenticate', 'access-control-allow-origin']) assert.equal(response.headers.has(name), false);
  assert.equal(calls[0].url, 'https://rinspace.com/api/file?offset=0');
  assert.deepEqual([...calls[0].options.headers.keys()].sort(), ['accept', 'accept-language', 'range']);
  assert.equal(calls[0].options.redirect, 'manual');
  const session = await fetch(`${realOrigin}/rinspace/api/identity/v1/session`);
  assert.deepEqual(await session.json(), { status: 'anonymous', csrfToken: 'anonymous-only' });
  assert.equal(session.headers.has('set-cookie'), false);
  assert.equal(calls[1].url, 'https://rinspace.com/api/identity/v1/session');
  const failed = await fetch(`${realOrigin}/api/content/failed`);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { code: 'real.error' });
  const head = await fetch(`${realOrigin}/rinspace/api/file`, { method: 'HEAD' });
  assert.equal(await head.text(), '');
  // Raw HTTP avoids fetch normalizing the path before the middleware sees it.
  await new Promise((resolve, reject) => {
    const request = httpRequest(`${realOrigin}/`, { path: '/rinspace/api/../admin' }, (result) => {
      assert.equal(result.statusCode, 400);
      result.resume();
      result.once('end', resolve);
    });
    request.once('error', reject);
    request.end();
  });
});

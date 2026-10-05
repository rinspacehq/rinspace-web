import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createReadOnlyMiddleware, localOrigin } from './gateway.mjs';
import { LocalProblem } from './session.mjs';
import { businessPayloadLimit, filePayloadLimit } from './payload.mjs';

const credential = `rin_at_${'a'.repeat(43)}`; // Synthetic, not a formal secret.
const sha = body => createHash('sha256').update(body).digest('hex');
async function serve(t, transport) {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = localOrigin(server.address().port); const errors = [];
  const session = { hasSession: () => true, authorize: async (request, mutation) => {
    if (request.headers.cookie !== 'synthetic=owner') throw new LocalProblem(401, 'session.revoked', 'Synthetic owner required.');
    if (mutation && (request.headers.origin !== origin || request.headers['x-rinspace-csrf'] !== 'synthetic-csrf'))
      throw new LocalProblem(403, 'local.csrf_rejected', 'Synthetic CSRF required.');
    return credential;
  } };
  const middleware = createReadOnlyMiddleware({ origin, fetchImpl: transport, session });
  server.on('request', (request, response) => {
    middleware(request, response, () => { response.writeHead(404); response.end(); }).catch(error => { errors.push(error); response.destroy(); });
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.deepEqual(errors, []); });
  const headers = { Cookie: 'synthetic=owner', Origin: origin, 'X-Rinspace-CSRF': 'synthetic-csrf' };
  return { origin, headers, session };
}

const rawPost = (origin, path, headers, body) => new Promise((resolve, reject) => {
  const request = httpRequest(origin + path, { method: 'POST', headers }, response => {
    const chunks = []; response.on('data', chunk => chunks.push(chunk));
    response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
  });
  request.once('error', reject); request.end(body);
});

test('a real HTTP 80 MiB multipart upload keeps boundary, filename, bytes and source; only the broker bearer reaches the fixed service', async t => {
  const boundary = 'rinspace-synthetic-boundary'; const size = 80 * 1024 * 1024;
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\npost_attachment\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="论文.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.alloc(prefix.length + size + suffix.length, 1);
  prefix.copy(body); body.write('%PDF-1.7\n', prefix.length); body.write('\n%%EOF\n', prefix.length + size - 7); suffix.copy(body, prefix.length + size);
  const expectedHash = sha(body); let calls = 0;
  const { origin, headers } = await serve(t, async (url, options) => {
    calls += 1; assert.equal(url, 'https://rinspace.com/api/file'); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.get('authorization'), `Bearer ${credential}`);
    assert.equal(options.headers.get('content-type'), `multipart/form-data; boundary=${boundary}`);
    assert.deepEqual([...options.headers.keys()].sort(), ['authorization', 'content-type']);
    assert.equal(options.body.length, body.length); assert.equal(sha(options.body), expectedHash);
    return new Response(JSON.stringify('https://rinspace.com/assets/synthetic.pdf'), { headers: { 'content-type': 'application/json', 'set-cookie': 'secret=never-forward' } });
  });
  const result = await rawPost(origin, '/rinspace/api/file', { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': body.length,
    Authorization: 'Bearer never-forward', 'X-Device-ID': 'never-forward', 'X-Forwarded-Host': 'never-forward', 'X-Rin-Service-Signature': 'never-forward' }, body);
  assert.equal(result.status, 200); assert.equal(result.headers['set-cookie'], undefined); assert.equal(calls, 1);
});

test('declared/chunked oversize, encoding and CSRF failures never forward and leave the next upload usable', async t => {
  let calls = 0;
  const { origin, headers } = await serve(t, async () => { calls += 1; return new Response('"uploaded"', { headers: { 'content-type': 'application/json' } }); });
  for (const [path, length] of [['/api/file', filePayloadLimit + 1], ['/api/content', businessPayloadLimit + 1], ['/api/file/other', businessPayloadLimit + 1]]) {
    assert.equal((await rawPost(origin, path, { ...headers, 'content-length': length }, 'small')).status, 413);
  }
  assert.equal((await rawPost(origin, '/api/file', { ...headers, 'content-encoding': 'gzip' }, 'small')).status, 415);
  assert.equal((await rawPost(origin, '/api/file', { ...headers, 'X-Rinspace-CSRF': 'wrong' }, 'small')).status, 403);
  // No Content-Length, so the actual received bytes are the bound.
  const chunked = await rawPost(origin, '/api/content', headers, Buffer.alloc(businessPayloadLimit + 1));
  assert.equal(chunked.status, 413); assert.equal(calls, 0);
  assert.equal((await rawPost(origin, '/api/file', headers, 'complete')).status, 200); assert.equal(calls, 1);
});

test('an interrupted local request is not sent upstream and cannot crash or occupy the upload slot', async t => {
  let calls = 0;
  const { origin, headers } = await serve(t, async () => { calls += 1; return new Response('"uploaded"', { headers: { 'content-type': 'application/json' } }); });
  const request = httpRequest(origin + '/api/file', { method: 'POST', headers: { ...headers, 'content-length': 1000 } });
  request.on('error', () => { /* Expected client-side socket cancellation. */ });
  request.write('partial');
  // events.once(close) also rejects on the expected client error. Observe the
  // terminal close itself; the server error list must independently stay empty.
  const closed = new Promise(resolve => request.once('close', resolve));
  await new Promise(resolve => setTimeout(resolve, 20)); request.destroy(); await closed;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 0);
  assert.equal((await rawPost(origin, '/api/file', headers, 'complete')).status, 200); assert.equal(calls, 1);
});

test('concurrent uploads are bounded through the whole upstream response and failed writes are never retried', async t => {
  let calls = 0; let started; let finish;
  const entered = new Promise(resolve => { started = resolve; }); const blocked = new Promise(resolve => { finish = resolve; });
  const { origin, headers } = await serve(t, async () => {
    calls += 1;
    if (calls === 1) { started(); await blocked; }
    if (calls === 3) throw new Error('PRIVATE_TOKEN uncertain network');
    return new Response('{"code":"synthetic.rejected"}', { status: 401, headers: { 'content-type': 'application/json' } });
  });
  const first = rawPost(origin, '/api/file', headers, 'first'); await entered;
  const second = await rawPost(origin, '/api/file', headers, 'second'); assert.equal(second.status, 429); assert.equal(second.headers['retry-after'], '1'); assert.equal(calls, 1);
  finish(); assert.equal((await first).status, 401); assert.equal(calls, 1);
  assert.equal((await rawPost(origin, '/api/file', headers, 'manual-next')).status, 401); assert.equal(calls, 2);
  const uncertain = await rawPost(origin, '/api/file', headers, 'manual-third'); assert.equal(uncertain.status, 502); assert.doesNotMatch(uncertain.body, /PRIVATE_TOKEN/); assert.equal(calls, 3);
});

test('a session invalidated between buffering and forwarding rejects the buffered upload, then frees the slot', async t => {
  let calls = 0; let checks = 0;
  const { origin, headers, session } = await serve(t, async () => { calls += 1; return new Response('"uploaded"', { headers: { 'content-type': 'application/json' } }); });
  const authorize = session.authorize;
  session.authorize = async (...input) => {
    checks += 1;
    if (checks === 2) throw new LocalProblem(401, 'session.revoked', 'Synthetic session changed during upload.');
    return authorize(...input);
  };
  const rejected = await rawPost(origin, '/api/file', headers, 'buffered-before-logout');
  assert.equal(rejected.status, 401); assert.equal(calls, 0); assert.equal(checks, 2);
  assert.equal((await rawPost(origin, '/api/file', headers, 'new-manual-attempt')).status, 200); assert.equal(calls, 1);
});

test('downloads preserve bytes, international disposition, conditional/Range status and strip supplier/security headers', async t => {
  const disposition = "attachment; filename=paper.pdf; filename*=UTF-8''%E8%AE%BA%E6%96%87.pdf";
  const { origin, headers } = await serve(t, async (url, options) => {
    assert.equal(url, 'https://rinspace.com/api/file/synthetic'); assert.equal(options.redirect, 'manual');
    if (options.headers.has('if-none-match')) return new Response(null, { status: 304, headers: { etag: '"sha256-synthetic"' } });
    const outside = options.headers.get('range') === 'bytes=999-1000';
    return new Response(outside || options.method === 'HEAD' ? null : Buffer.from([0, 255, 13, 10]), { status: outside ? 416 : 206, headers: {
      'content-type': 'application/pdf', 'content-disposition': disposition, 'content-range': outside ? 'bytes */10' : 'bytes 0-3/10', 'accept-ranges': 'bytes',
      etag: '"sha256-synthetic"', 'last-modified': 'Sun, 04 Oct 2026 00:00:00 GMT',
      'set-cookie': 'never-forward=1', 'www-authenticate': 'Bearer secret', 'access-control-allow-origin': '*', 'content-security-policy': "script-src 'unsafe-inline'",
    } });
  });
  const response = await fetch(origin + '/api/file/synthetic', { headers: { ...headers, Range: 'bytes=0-3', 'If-Range': '"sha256-synthetic"' } });
  assert.equal(response.status, 206); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 255, 13, 10]));
  assert.equal(response.headers.get('content-disposition'), disposition); assert.equal(response.headers.get('content-range'), 'bytes 0-3/10');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  for (const name of ['set-cookie', 'www-authenticate', 'access-control-allow-origin', 'content-encoding']) assert.equal(response.headers.has(name), false);
  const head = await fetch(origin + '/api/file/synthetic', { method: 'HEAD', headers }); assert.equal(head.status, 206); assert.equal(await head.text(), '');
  const unchanged = await fetch(origin + '/api/file/synthetic', { headers: { ...headers, 'If-None-Match': '"sha256-synthetic"' } }); assert.equal(unchanged.status, 304);
  const outside = await fetch(origin + '/api/file/synthetic', { headers: { ...headers, Range: 'bytes=999-1000' } }); assert.equal(outside.status, 416); assert.equal(outside.headers.get('content-range'), 'bytes */10');
});

test('PDF/blob redirects, HTML/XHTML fallbacks and invalid disposition still fail closed without another-host fetch', async t => {
  let calls = 0;
  const { origin, headers } = await serve(t, async url => {
    calls += 1; assert.equal(new URL(url).origin, 'https://rinspace.com');
    if (url.includes('invalid-header')) return { status: 200, body: null, headers: { get: name => name === 'content-disposition' ? 'attachment; filename="\u0100"' : null } };
    if (url.includes('xhtml')) return new Response('<html/>', { headers: { 'content-type': 'Application/XHTML+XML' } });
    if (url.includes('html')) return new Response('<html/>', { headers: { 'content-type': 'Text/HTML; charset=utf-8' } });
    return new Response(null, { status: url.includes('/pdf/') ? 307 : 302, headers: { location: 'https://files.invalid/synthetic?secret=never-forward' } });
  });
  for (const path of ['/api/pdf/42/download?ticket=synthetic', '/api/file/blob/synthetic/file.pdf', '/api/file/html', '/api/file/xhtml', '/api/file/invalid-header']) {
    const response = await fetch(origin + path, { headers, redirect: 'manual' }); assert.equal(response.status, 502); assert.equal(response.headers.get('location'), null);
    assert.doesNotMatch(await response.text(), /secret|files.invalid|\u0100/);
  }
  assert.equal(calls, 5);
});

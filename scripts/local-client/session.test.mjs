import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createReadOnlyMiddleware, localOrigin } from './gateway.mjs';
import { createLocalSession, issuer } from './session.mjs';
import { createIdentityFixture } from './fixture.mjs';

async function harness(t, options = {}) {
  const fixture = createIdentityFixture(options);
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = localOrigin(server.address().port);
  const session = createLocalSession({ origin, fetchImpl: fixture.transport, ...options });
  server.on('request', createReadOnlyMiddleware({ origin, fetchImpl: fixture.transport, session }));
  t.after(async () => { await session.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  let cookie = ''; let csrf = '';
  async function browser(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(origin + path, { method, redirect: 'manual', headers: { cookie, origin, ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-rinspace-csrf': csrf }), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    const value = response.headers.get('set-cookie'); if (value) cookie = value.split(';')[0];
    return response;
  }
  async function status() {
    const response = await browser('/api/identity/v1/session'); const value = await response.json();
    if (value.csrfToken) csrf = value.csrfToken;
    return { response, value };
  }
  async function begin() {
    await status(); const response = await browser('/__rinspace_local/login', { method: 'POST', body: {} });
    return { response, value: await response.json() };
  }
  async function callback(consent, overrides = {}, headers = {}) {
    const params = new URL(consent).searchParams; const grant = fixture.grant(params);
    const target = new URL(params.get('redirectUri'));
    for (const [key, value] of Object.entries({ code: grant.code, state: grant.state, iss: issuer, ...overrides })) target.searchParams.set(key, value);
    // Node fetch overwrites Sec-Fetch-Mode with "cors". Raw HTTP models the
    // browser's top-level callback navigation without weakening the guard.
    return new Promise((resolve, reject) => {
      const incoming = httpRequest(target, { headers: { cookie, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', ...headers } }, response => {
        let body = '';
        response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
        response.on('end', () => {
          const value = response.headers['set-cookie']?.[0]; if (value) cookie = value.split(';')[0];
          resolve({ response: { status: response.statusCode, headers: new Headers(Object.entries(response.headers).filter(([, entry]) => typeof entry === 'string')) }, body });
        });
      });
      incoming.on('error', reject); incoming.end();
    });
  }
  return { fixture, origin, session, browser, status, begin, callback, getCookie: () => cookie };
}

test('same frontend protocol: consent, callback, server truth, real-format business bearer and independent logout', async t => {
  const h = await harness(t);
  const anonymous = await h.status(); assert.equal(anonymous.value.status, 'anonymous');
  assert.match(anonymous.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const begin = await h.begin(); assert.equal(begin.response.status, 200);
  const result = await h.callback(begin.value.authorizationUrl);
  assert.match(result.body, /授权完成/); assert.match(result.body, /history.replaceState/);
  assert.doesNotMatch(result.body, /rin_at_|rin_rf_|rin_nc_|codeVerifier|<link|<img/);
  assert.match(result.response.headers.get('content-security-policy'), /default-src 'none'/);
  const verified = await h.status(); assert.equal(verified.value.user.id, 'synthetic-local-user');
  assert.doesNotMatch(JSON.stringify(verified.value), /rin_at_|rin_rf_|tokenType|codeVerifier/);
  for (const path of ['/api/like', '/api/collection']) {
    const written = await h.browser(path, { method: 'POST', body: { post_id: 279 }, headers: { Authorization: 'Bearer foreign-token', 'x-rin-service-signature': 'foreign' } });
    assert.equal(written.status, 200);
  }
  assert.equal(h.fixture.state.likes, 1); assert.equal(h.fixture.state.bookmarks, 1);
  assert.equal((await h.browser('/api/identity/v1/session/logout', { method: 'POST', body: { requestId: 'browser-logout' } })).status, 200);
  assert.equal(h.fixture.state.active, false); assert.equal((await h.status()).value.status, 'anonymous');
  assert.equal((await h.browser('/api/like', { method: 'POST', body: {} })).status, 503);
});

test('bad state, issuer, host, missing cookie and mixed parameters do not exchange; legitimate callback still works once', async t => {
  const h = await harness(t); const begin = await h.begin();
  for (const [overrides, headers] of [
    [{ state: 'invalid' }, {}], [{ iss: 'https://invalid.test' }, {}], [{ extra: 'field' }, {}],
    [{}, { cookie: '' }], [{}, { host: 'invalid.test' }], [{}, { origin: 'https://invalid.test' }],
    [{ state: '中'.repeat(43) }, {}],
  ]) assert.equal((await h.callback(begin.value.authorizationUrl, overrides, headers)).response.status, 400);
  assert.equal(h.fixture.calls.filter(c => c.path.endsWith('/token')).length, 0);
  const correct = await h.callback(begin.value.authorizationUrl); assert.match(correct.body, /授权完成/);
  assert.equal(h.fixture.calls.filter(c => c.path.endsWith('/token')).length, 1);
  await assert.rejects(h.callback(begin.value.authorizationUrl)); // listener retired
});

test('unavailable/mismatched official config fails closed, without token exchange or business write', async t => {
  for (const config of ['off', 'wrong-issuer']) {
    const h = await harness(t); h.fixture.state.config = config;
    assert.equal((await h.begin()).response.status, 503);
    assert.equal(h.session.authorizationAvailable(), false);
    assert.equal(h.fixture.calls.some(c => c.path.endsWith('/token')), false);
    assert.equal((await h.browser('/api/like', { method: 'POST', body: {} })).status, 503);
  }
});

test('cancel and deadline retire callback, without creating an authenticated hint', async t => {
  const h = await harness(t); const begin = await h.begin();
  assert.equal((await h.browser('/__rinspace_local/cancel', { method: 'POST', body: {} })).status, 200);
  await assert.rejects(h.callback(begin.value.authorizationUrl)); assert.equal((await h.status()).value.status, 'anonymous');
  const deadline = await harness(t, { callbackTTL: 15 }); const timed = await deadline.begin();
  await new Promise(resolve => setTimeout(resolve, 30)); await assert.rejects(deadline.callback(timed.value.authorizationUrl));
});

test('session reads require official confirmation; network failure preserves credentials and revocation clears them', async t => {
  const h = await harness(t); const begin = await h.begin(); await h.callback(begin.value.authorizationUrl); await h.status();
  h.fixture.state.sessionFailure = 503;
  assert.equal((await h.status()).response.status, 503); assert.equal(h.session.hasSession(), true);
  assert.equal((await h.browser('/api/like', { method: 'POST', body: {} })).status, 503);
  assert.equal(h.fixture.state.likes, 0);
  h.fixture.state.sessionFailure = 0; assert.equal((await h.status()).value.status, 'authenticated');
  h.fixture.state.active = false; assert.equal((await h.status()).response.status, 401); assert.equal(h.session.hasSession(), false);
});

test('local CSRF, exact Origin and browser session block mutations before the official service', async t => {
  const h = await harness(t); const begin = await h.begin(); await h.callback(begin.value.authorizationUrl); await h.status();
  for (const headers of [{ 'x-rinspace-csrf': '' }, { 'x-rinspace-csrf': 'foreign' }, { cookie: '' }, { origin: 'https://invalid.test' }, { 'sec-fetch-site': 'same-site' }]) {
    const before = h.fixture.calls.length;
    assert.ok([401, 403].includes((await h.browser('/api/like', { method: 'POST', body: {}, headers })).status));
    assert.equal(h.fixture.calls.length, before);
  }
  const denied = await h.browser('/api/identity/v1/native/token', { method: 'POST', body: {} }); assert.equal(denied.status, 503);
  assert.equal((await h.browser('/api/identity/v1/session/refresh', { method: 'POST', body: '{"requestId":"a","requestId":"b"}' })).status, 400);
});

test('refresh is serialized across requests and retries preserve the request ID on uncertain transport', async t => {
  let time = Date.now(); const h = await harness(t, { now: () => time });
  const begin = await h.begin(); await h.callback(begin.value.authorizationUrl); await h.status();
  time += 59_000; h.fixture.state.refreshFailures = 1;
  assert.equal((await h.status()).response.status, 503); assert.equal(h.session.hasSession(), true);
  const results = await Promise.all(Array.from({ length: 8 }, () => h.status()));
  assert.ok(results.every(result => result.value.status === 'authenticated'));
  assert.equal(h.fixture.state.generation, 1);
  const attempts = h.fixture.calls.filter(c => c.path.endsWith('/refresh')).map(c => JSON.parse(c.body));
  assert.equal(attempts.length, 2); assert.equal(attempts[0].requestId, attempts[1].requestId);
});

test('issued credentials are not adopted before introspection, and an abandoned known SID is revoked', async t => {
  const h = await harness(t); h.fixture.state.sessionFailure = 503;
  const begin = await h.begin(); const callback = await h.callback(begin.value.authorizationUrl);
  assert.match(callback.body, /授权未完成/); assert.equal(h.session.hasSession(), false);
  assert.equal(h.fixture.calls.filter(c => c.path.endsWith('/logout')).length, 1);
});

test('a response lost AFTER official refresh rotation recovers the same credentials, never a second generation', async t => {
  let time = Date.now(); const h = await harness(t, { now: () => time });
  const begin = await h.begin(); await h.callback(begin.value.authorizationUrl); await h.status();
  time += 59_000; h.fixture.state.refreshFailuresAfterRotation = 1;
  assert.equal((await h.status()).response.status, 503); assert.equal(h.fixture.state.generation, 1);
  const recovered = await h.status(); assert.equal(recovered.value.status, 'authenticated');
  assert.equal(h.fixture.state.generation, 1);
  const attempts = h.fixture.calls.filter(c => c.path.endsWith('/refresh')).map(c => JSON.parse(c.body));
  assert.equal(attempts.length, 2); assert.equal(attempts[0].requestId, attempts[1].requestId);
  assert.equal(attempts[0].refreshToken, attempts[1].refreshToken);
});

test('cancelling while config is in flight does not open a callback afterward', async t => {
  const h = await harness(t);
  const entered = new Promise(resolve => { h.fixture.state.onConfig = resolve; });
  let release;
  h.fixture.state.waitConfig = new Promise(resolve => { release = resolve; });
  const starting = h.begin(); await entered;
  assert.equal((await h.browser('/__rinspace_local/cancel', { method: 'POST', body: {} })).status, 200);
  release(); const cancelled = await starting;
  assert.equal(cancelled.response.status, 409); assert.equal(h.session.hasSession(), false);
  assert.equal(h.fixture.calls.filter(c => c.path.endsWith('/token')).length, 0);
  assert.equal((await h.begin()).response.status, 200);
});

async function authorized(t, options) {
  const h = await harness(t, options); const begin = await h.begin();
  await h.callback(begin.value.authorizationUrl); await h.status(); return h;
}
async function stepUp(h, purpose, target) {
  const challenge = await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose, target, phone: '13900009999' } });
  assert.equal(challenge.status, 200); const value = await challenge.json();
  assert.doesNotMatch(JSON.stringify(value), /synthetic-provider|verification_token|rin_su_/);
  const verify = await h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body: { purpose, target, phone: value.phoneNumber, verificationId: value.verificationId, code: '123456' } });
  assert.equal(verify.status, 200); const result = await verify.json();
  assert.doesNotMatch(JSON.stringify(result), /rin_su_|synthetic-verification/); return result.stepUpProof;
}

test('security lists are formal metadata; missing CSRF, unknown fields and anonymous reads never reach providers', async t => {
  const h = await authorized(t);
  for (const path of ['/sessions', '/credentials']) {
    const response = await h.browser('/api/identity/v1' + path); assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /must-not-reach-browser|accessToken|secret/);
  }
  const devices = await (await h.browser('/api/identity/v1/sessions')).json();
  assert.equal(devices.items.filter(item => item.current).length, 1);
  const target = devices.items[0].sid;
  const before = h.fixture.calls.length;
  for (const headers of [{ 'x-rinspace-csrf': '' }, { cookie: '' }, { origin: 'https://evil.test' }])
    assert.equal((await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose: 'session_revoke', target, phone: '13900009999' }, headers })).status, headers.cookie === '' ? 401 : 403);
  assert.equal((await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose: 'session_revoke', target, phone: '13900009999', upstream: 'https://evil.test' } })).status, 400);
  assert.equal((await h.browser('/api/identity/v1/sessions', { headers: { cookie: '' } })).status, 401);
  assert.equal(h.fixture.calls.length, before);
});

test('CloudBase verification binds SID/purpose/target/phone, preserves login after wrong code and uses each formal proof once', async t => {
  const h = await authorized(t); const devices = await (await h.browser('/api/identity/v1/sessions')).json(); const target = devices.items[0].sid;
  const start = await (await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose: 'session_revoke', target, phone: '13900009999' } })).json();
  const input = { purpose: 'session_revoke', target, phone: start.phoneNumber, verificationId: start.verificationId, code: '123456' };
  const before = h.fixture.calls.length;
  for (const override of [{ target: devices.items[1].sid }, { purpose: 'credential_revoke' }, { phone: '+8613900009998' }, { verificationId: 'foreign' }])
    assert.equal((await h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body: { ...input, ...override } })).status, 403);
  // Current-session inspection is allowed; no provider verification for mismatches.
  assert.equal(h.fixture.calls.slice(before).filter(call => call.path === '/auth/v1/verification/verify').length, 0);
  const wrong = await h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body: { ...input, code: '000000' } });
  assert.equal(wrong.status, 403); assert.equal((await wrong.json()).sessionAction, 'preserve');
  assert.equal((await h.status()).value.status, 'authenticated');
  const proof = (await (await h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body: input })).json()).stepUpProof;
  assert.equal((await h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body: input })).status, 403);
  assert.equal((await h.browser('/api/identity/v1/sessions/' + devices.items[1].sid, { method: 'DELETE', body: { stepUpProof: proof } })).status, 403);
  assert.equal((await h.browser('/api/identity/v1/sessions/' + target, { method: 'DELETE', body: { stepUpProof: proof } })).status, 200);
  assert.equal(h.fixture.state.websiteRevoked, true); assert.equal(h.fixture.state.active, true);
  assert.equal((await h.browser('/api/identity/v1/sessions/' + target, { method: 'DELETE', body: { stepUpProof: proof } })).status, 403);
  assert.equal((await h.status()).value.status, 'authenticated');
});

test('verification errors and temporary provider failures are not session revocation or successful cleanup', async t => {
  const h = await authorized(t);
  const target = (await h.status()).value.currentSession.sid;
  h.fixture.state.providerError = 'captcha_required';
  const denied = await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose: 'session_revoke', target, phone: '13900009999' } });
  assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'local.verification_captcha_required');
  assert.equal(h.fixture.calls.filter(c => c.path.endsWith('/step-up/cloudbase')).length, 0);
  h.fixture.state.managementFailure = 503;
  assert.equal((await h.browser('/api/identity/v1/credentials')).status, 503); assert.equal(h.session.hasSession(), true);
  h.fixture.state.managementFailure = 0;
  const begin = await (await h.browser('/api/identity/v1/step-up', { method: 'POST', body: { purpose: 'session_revoke', target } })).json();
  const wrong = await h.browser('/api/identity/v1/step-up', { method: 'POST', body: { purpose: 'session_revoke', target, challengeId: begin.challengeId, code: '000000' } });
  assert.equal(wrong.status, 401); assert.equal((await wrong.json()).code, 'session.reauthentication_required');
  assert.equal((await h.status()).value.status, 'authenticated');
});

test('credential revocation, current-device logout and all-account revocation preserve remote cleanup truth', async t => {
  for (const operation of ['credential', 'current', 'devices', 'security']) {
    const h = await authorized(t); const sid = (await h.status()).value.currentSession.sid;
    const [purpose, target, path, method] = operation === 'credential' ? ['credential_revoke', 'gitea:synthetic-credential', '/credentials/gitea%3Asynthetic-credential', 'DELETE'] :
      operation === 'current' ? ['session_revoke', sid, '/sessions/' + sid, 'DELETE'] : operation === 'devices' ? ['sessions_revoke_all', 'all_sessions', '/sessions/revoke-all', 'POST'] :
      ['security_revoke_all', 'all_personal_access', '/security/revoke-all', 'POST'];
    const proof = await stepUp(h, purpose, target); h.fixture.state.remoteCleanupPending = true;
    if (method === 'POST') assert.equal((await h.browser('/api/identity/v1' + path, { method, body: { confirm: false, stepUpProof: proof } })).status, 403);
    const response = await h.browser('/api/identity/v1' + path, { method, body: { ...(method === 'POST' ? { confirm: true } : {}), stepUpProof: proof } });
    assert.equal(response.status, 200); const result = await response.json();
    assert.doesNotMatch(JSON.stringify(result), /must-not-reach-browser|secret|rin_su_/);
    if (operation === 'credential' || operation === 'security') assert.equal(result.state, 'remote_cleanup_pending');
    if (operation === 'credential') { assert.equal(h.fixture.state.credentialRevoked, true); assert.equal((await h.status()).value.status, 'authenticated'); }
    else { assert.equal(h.session.hasSession(), false); assert.equal((await h.status()).value.status, 'anonymous'); }
  }
});

test('provider client configuration cannot select an arbitrary upstream, and proof expiry blocks destructive calls', async t => {
  let time = Date.now(); const h = await authorized(t, { now: () => time }); const sid = (await h.status()).value.currentSession.sid;
  h.fixture.state.phoneClient = 'evil.test/path';
  const denied = await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose: 'session_revoke', target: sid, phone: '13900009999' } });
  assert.equal(denied.status, 503); assert.equal(h.fixture.calls.filter(c => c.path.startsWith('/auth/v1/')).length, 0);
  h.fixture.state.phoneClient = 'synthetic-env'; time += 60_001;
  const proof = await stepUp(h, 'session_revoke', sid); time += 120_001;
  assert.equal((await h.browser('/api/identity/v1/sessions/' + sid, { method: 'DELETE', body: { stepUpProof: proof } })).status, 403);
  assert.equal(h.fixture.calls.filter(c => c.method === 'DELETE').length, 0);
});

test('concurrent verification consumes the provider challenge only once; logout during verification cannot recreate authority', async t => {
  for (const logout of [false, true]) {
    const h = await authorized(t); const sid = (await h.status()).value.currentSession.sid;
    const start = await (await h.browser('/api/identity/v1/step-up/cloudbase/challenge', { method: 'POST', body: { purpose: 'session_revoke', target: sid, phone: '13900009999' } })).json();
    const body = { purpose: 'session_revoke', target: sid, phone: start.phoneNumber, verificationId: start.verificationId, code: '123456' };
    let release;
    h.fixture.state.waitProviderVerify = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { h.fixture.state.onProviderVerify = resolve; });
    const first = h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body }); await entered;
    if (logout) assert.equal((await h.browser('/api/identity/v1/session/logout', { method: 'POST', body: {} })).status, 200);
    else assert.equal((await h.browser('/api/identity/v1/step-up/cloudbase', { method: 'POST', body })).status, 403);
    release(); assert.equal((await first).status, logout ? 401 : 200);
    assert.equal(h.fixture.calls.filter(call => call.path === '/auth/v1/verification/verify').length, 1);
    assert.equal(h.fixture.calls.filter(call => call.path.endsWith('/step-up/cloudbase')).length, logout ? 0 : 1);
    if (logout) assert.equal(h.session.hasSession(), false);
  }
});

test('a JSON success missing formal revocation fields is rejected, not fabricated as complete', async t => {
  const h = await authorized(t); const sid = (await h.status()).value.currentSession.sid;
  const proof = await stepUp(h, 'session_revoke', sid); h.fixture.state.malformedManagement = true;
  const response = await h.browser('/api/identity/v1/sessions/' + sid, { method: 'DELETE', body: { stepUpProof: proof } });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'local.identity_contract_rejected');
  assert.equal(h.session.hasSession(), true); assert.equal(h.fixture.state.active, true);
});

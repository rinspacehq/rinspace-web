// Synthetic test transport only. Never imported by the user launcher.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { issuer, clientId, scope, consentPath } from './session.mjs';

export const fixtureJSON = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
export function createIdentityFixture({ now = Date.now } = {}) {
  const calls = []; const codes = new Map(); const verifications = new Map(); const proofs = new Map();
  const state = { active: false, refreshFailures: 0, refreshFailuresAfterRotation: 0, sessionFailure: 0, config: 'ready', malformedToken: false, generation: 0, likes: 0, bookmarks: 0 };
  const refreshReplies = new Map();
  let credentials;
  const websiteSID = randomUUID();
  const credential = { ref: 'gitea:synthetic-credential', provider: 'gitea', kind: 'personal_access_token', label: 'Synthetic key', scopes: ['repo'],
    createdAt: new Date(now()).toISOString(), state: 'active' };
  state.websiteRevoked = false; state.credentialRevoked = false; state.phoneClient = 'synthetic-env';
  state.managementFailure = 0; state.providerError = ''; state.remoteCleanupPending = false;
  state.uploads = []; state.uncertainWrites = 0;
  const mint = () => ({ issuer, clientId, scope, credentialKind: 'local_frontend', tokenType: 'Bearer',
    sid: credentials?.sid || randomUUID(), accessToken: `rin_at_${randomBytes(32).toString('base64url')}`, refreshToken: `rin_rf_${randomBytes(32).toString('base64url')}`,
    accessExpiresAt: new Date(now() + 60_000).toISOString(), refreshExpiresAt: new Date(now() + 3600_000).toISOString(), generation: state.generation, version: state.generation + 1 });
  const envelope = () => ({ status: 'authenticated', expiresAt: credentials.accessExpiresAt,
    user: { id: 'synthetic-local-user', role: 'member', sessionEpoch: 1, identityVersion: 3 },
    currentSession: { sid: credentials.sid, version: credentials.version, clientKind: 'local_frontend', authTime: new Date(now() - 86400_000).toISOString(), authMethod: 'phone_otp' } });
  function grant(params) {
    const code = `rin_nc_${randomBytes(32).toString('base64url')}`;
    codes.set(code, { redirect: params.get('redirectUri'), challenge: params.get('codeChallenge') });
    return { code, state: params.get('state'), issuer, redirectUri: params.get('redirectUri'), expiresAt: new Date(now() + 60_000).toISOString() };
  }
  const transport = async (url, options = {}) => {
    const target = new URL(url);
    const headers = new Headers(options.headers);
    calls.push({ path: target.pathname, method: options.method || 'GET', headers, body: options.body });
    assert.equal(options.redirect, 'manual');
    if (target.origin === 'https://synthetic-env.api.tcloudbasegateway.com') {
      for (const name of ['cookie', 'origin', 'authorization', 'x-rinspace-csrf', 'x-device-id']) assert.equal(headers.has(name), false);
      assert.equal(target.searchParams.get('client_id'), 'synthetic-env');
      if (state.providerError) return fixtureJSON({ error: state.providerError }, 400);
      const input = JSON.parse(options.body);
      if (target.pathname === '/auth/v1/verification') {
        assert.equal(input.target, 'USER'); assert.match(input.phone_number, /^\+86 1[0-9]{10}$/);
        const id = `synthetic-provider-${randomUUID()}`; verifications.set(id, input.phone_number.replace(' ', ''));
        return fixtureJSON({ verification_id: id, is_user: true, expires_in: 600 });
      }
      assert.equal(target.pathname, '/auth/v1/verification/verify');
      state.onProviderVerify?.();
      if (state.waitProviderVerify) await state.waitProviderVerify;
      if (input.verification_code !== '123456' || !verifications.has(input.verification_id)) return fixtureJSON({ error: 'invalid_verification_code' }, 400);
      const phone = verifications.get(input.verification_id); verifications.delete(input.verification_id);
      const token = `synthetic-verification-${randomUUID()}`; verifications.set(token, phone);
      return fixtureJSON({ verification_token: token, expires_in: 600 });
    }
    assert.equal(target.origin, issuer);
    const path = target.pathname.replace('/api/identity/v1/native', '');
    if (!['/config', '/authorize'].includes(path)) {
      for (const name of ['cookie', 'origin', 'x-rinspace-csrf', 'x-device-id', 'x-forwarded-host', 'x-rin-service-signature']) assert.equal(headers.has(name), false, `stripped ${name}`);
    }
    if (path === '/config') {
      state.onConfig?.();
      if (state.waitConfig) await state.waitConfig;
      if (state.config === 'off') return new Response('<html>Not available</html>', { headers: { 'content-type': 'text/html' } });
      return fixtureJSON({ issuer: state.config === 'wrong-issuer' ? 'https://invalid.test' : issuer,
        clientId, scope, credentialKind: 'local_frontend', protocolVersion: '2026-10-04', codeChallengeMethod: 'S256',
        consentEndpoint: issuer + consentPath, tokenEndpoint: issuer + '/api/identity/v1/native/token', phoneVerificationClientId: state.phoneClient });
    }
    if (path === '/token') {
      const body = JSON.parse(options.body); const binding = codes.get(body.code);
      assert.equal(body.clientId, clientId); assert.equal(body.grantType, 'authorization_code');
      assert.ok(binding); assert.equal(body.redirectUri, binding.redirect);
      assert.equal(createHash('sha256').update(body.codeVerifier).digest('base64url'), binding.challenge);
      codes.delete(body.code); state.active = true; credentials = mint();
      return fixtureJSON(state.malformedToken ? { ...credentials, issuer: 'https://invalid.test' } : credentials);
    }
    if (path === '/refresh') {
      if (state.refreshFailures > 0) { state.refreshFailures -= 1; throw new Error('Synthetic uncertain network response'); }
      const body = JSON.parse(options.body);
      const replay = refreshReplies.get(body.requestId);
      if (replay) {
        assert.equal(body.refreshToken, replay.previous); return fixtureJSON(replay.result);
      }
      assert.equal(body.refreshToken, credentials.refreshToken); assert.equal(body.sid, credentials.sid);
      if (!state.active) return fixtureJSON({ code: 'session.revoked' }, 401);
      state.generation += 1; credentials = mint(); refreshReplies.set(body.requestId, { previous: body.refreshToken, result: credentials });
      if (state.refreshFailuresAfterRotation > 0) { state.refreshFailuresAfterRotation -= 1; throw new Error('Synthetic response lost after rotation'); }
      return fixtureJSON(credentials);
    }
    if (path === '/logout') { state.active = false; return new Response(null, { status: 204 }); }
    if (path === '/session') {
      assert.equal(headers.get('authorization'), `Bearer ${credentials.accessToken}`);
      if (state.sessionFailure) return fixtureJSON({ code: 'synthetic.failure' }, state.sessionFailure);
      return state.active ? fixtureJSON(envelope()) : fixtureJSON({ code: 'session.revoked' }, 401);
    }
    if (['/sessions', '/credentials', '/step-up/cloudbase', '/step-up', '/sessions/revoke-all', '/security/revoke-all'].includes(path) || path.startsWith('/sessions/') || path.startsWith('/credentials/')) {
      assert.equal(headers.get('authorization'), `Bearer ${credentials.accessToken}`);
      if (!state.active) return fixtureJSON({ code: 'session.revoked', sessionAction: 'clear_current' }, 401);
      if (state.managementFailure) return fixtureJSON({ code: 'synthetic.unavailable', sessionAction: 'preserve' }, state.managementFailure);
      if (path === '/sessions') return fixtureJSON({ items: [
        { sid: websiteSID, clientLabel: 'Website', current: false, revoked: state.websiteRevoked, cleanupComplete: false, runtimes: { gitea_web: 'active' }, createdAt: new Date(now()).toISOString() },
        { sid: credentials.sid, clientLabel: 'Local Rinspace', current: true, revoked: false, cleanupComplete: true, runtimes: {}, createdAt: new Date(now()).toISOString(), accessToken: 'must-not-reach-browser' },
      ] });
      if (path === '/credentials') return fixtureJSON({ items: [{ ...credential, state: state.credentialRevoked ? 'revoked' : 'active', secret: 'must-not-reach-browser' }] });
      const input = JSON.parse(options.body);
      const rejected = () => fixtureJSON({ code: 'session.reauthentication_required', sessionAction: 'preserve', message: 'must-not-reach-browser' }, 401);
      if (state.malformedManagement) return fixtureJSON({});
      if (path === '/step-up/cloudbase' || path === '/step-up') {
        if (path === '/step-up/cloudbase') {
          if (verifications.get(input.verificationToken) !== input.phone) return rejected();
          verifications.delete(input.verificationToken);
        } else {
          if (!input.challengeId && !input.code) return fixtureJSON({ challengeId: websiteSID, retryAfter: 60 });
          if (input.code !== '123456') return rejected();
        }
        const proof = `rin_su_${randomBytes(32).toString('base64url')}`;
        proofs.set(proof, { purpose: input.purpose, target: input.target, sid: credentials.sid });
        return fixtureJSON({ stepUpProof: proof });
      }
      const purpose = path === '/sessions/revoke-all' ? 'sessions_revoke_all' : path === '/security/revoke-all' ? 'security_revoke_all' : path.startsWith('/sessions/') ? 'session_revoke' : 'credential_revoke';
      const actionTarget = purpose === 'sessions_revoke_all' ? 'all_sessions' : purpose === 'security_revoke_all' ? 'all_personal_access' : decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
      const proof = proofs.get(input.stepUpProof);
      if (!proof || proof.purpose !== purpose || proof.target !== actionTarget || proof.sid !== credentials.sid) return rejected();
      proofs.delete(input.stepUpProof);
      if (purpose === 'credential_revoke') { state.credentialRevoked = true; return fixtureJSON({ operationId: 'synthetic-operation', state: 'remote_cleanup_pending' }, 202); }
      if (purpose === 'session_revoke') {
        if (actionTarget === credentials.sid) state.active = false; else state.websiteRevoked = true;
        return fixtureJSON({ sid: actionTarget, version: 2, cleanupComplete: false });
      }
      state.active = false; state.websiteRevoked = true;
      if (purpose === 'security_revoke_all') state.credentialRevoked = true;
      return fixtureJSON({ sessionEpoch: 2, credentialEpoch: 2, revokedCount: 2, revokedSessions: 2, cleanupComplete: false,
        state: state.remoteCleanupPending ? 'remote_cleanup_pending' : 'complete', operations: [{ operationId: 'synthetic-operation', state: 'remote_cleanup_pending', secret: 'must-not-reach-browser' }] });
    }
    if (target.pathname === '/api/user/info') return fixtureJSON({ id: 'synthetic-local-user', username: 'Synthetic account', display_name: 'Synthetic account', role_name: 'member', role_id: 1,
      created_at: 1, last_login_date: 1, avatar: { type: 'custom', gravatar: '', custom: '' }, cover_url: '', mobile: '', bio: '', bio_html: '', website: '', location: '',
      language: 'zh-CN', color_scheme: 'light', access_token: '', visit_token: '', rank: 0, status: 'active', have_password: false, suspended_until: 0 });
    if (target.pathname === '/api/file' && options.method === 'POST') {
      assert.equal(headers.get('authorization'), `Bearer ${credentials.accessToken}`);
      const form = await new Request(url, { method: 'POST', headers, body: options.body }).formData();
      const file = form.get('file'); assert.ok(file instanceof File);
      const bytes = Buffer.from(await file.arrayBuffer());
      state.uploads.push({ source: form.get('source'), filename: file.name, type: file.type, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      return fixtureJSON('https://rinspace.com/assets/synthetic-upload.png');
    }
    if (target.pathname === '/api/profile') return fixtureJSON({ uid: 'synthetic-local-user', nickname: 'Synthetic account' });
    if (target.pathname === '/api/file/synthetic-direct-download') return new Response(new Uint8Array([0, 255, 13, 10]), { status: 206, headers: {
      'content-type': 'application/octet-stream', 'content-range': 'bytes 0-3/10', 'accept-ranges': 'bytes',
      'content-disposition': "attachment; filename=paper.bin; filename*=UTF-8''%E8%AE%BA%E6%96%87.bin", 'etag': '"synthetic-file"',
      'set-cookie': '__Host-rin_access=must-not-reach-browser', 'access-control-allow-origin': '*',
    } });
    if (target.pathname === '/api/content/synthetic-uncertain-write') {
      state.uncertainWrites += 1;
      return fixtureJSON({ code: 'synthetic.uncertain_write', sessionAction: 'preserve' }, 401);
    }
    if (target.pathname === '/api/like' || target.pathname === '/api/collection') {
      if (!state.active || headers.get('authorization') !== `Bearer ${credentials.accessToken}`) return fixtureJSON({ code: 'authentication.required' }, 401);
      if (options.method === 'POST') { if (target.pathname === '/api/like') state.likes += 1; else state.bookmarks += 1; }
      return fixtureJSON({ ok: true });
    }
    return fixtureJSON({ items: [] });
  };
  return { transport, grant, calls, state, envelope };
}

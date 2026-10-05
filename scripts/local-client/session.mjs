import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLocalSecurity } from './security.mjs';

// Fixed public protocol, not a configurable upstream or a client secret.
export const issuer = 'https://rinspace.com';
export const clientId = 'rinspace-local-web';
export const scope = 'outer-world';
export const consentPath = '/local-client/authorize';
const nativeBase = `${issuer}/api/identity/v1/native`;
const opaque = () => randomBytes(32).toString('base64url');
const capability = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`).test(value);
const sidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class LocalProblem extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function sendJSON(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
export function sendProblem(response, error) {
  const known = error instanceof LocalProblem;
  sendJSON(response, known ? error.status : 503, {
    code: known ? error.code : 'local.identity_unavailable',
    message: known ? error.message : 'Rinspace identity is temporarily unavailable.',
    sessionAction: known && error.code === 'session.revoked' ? 'clear_current' : 'preserve',
  });
}

export async function readJSON(request, allowed = []) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || ''))
    throw new LocalProblem(400, 'local.invalid_request', 'A JSON request is required.');
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new LocalProblem(413, 'local.invalid_request', 'Request is too large.');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  let value;
  try { value = JSON.parse(body); } catch { throw new LocalProblem(400, 'local.invalid_request', 'Invalid JSON request.'); }
  // Identity adapter inputs are flat scalar records; reject duplicate keys,
  // casing aliases and nested credential containers before forwarding.
  const keys = [...body.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map((match) => JSON.parse(`"${match[1]}"`));
  if (!record(value) || keys.length !== Object.keys(value).length || new Set(keys.map((key) => key.toLowerCase())).size !== keys.length ||
      Object.entries(value).some(([key, entry]) => !allowed.includes(key) || !['string', 'number', 'boolean'].includes(typeof entry)))
    throw new LocalProblem(400, 'local.invalid_request', 'Unexpected JSON fields.');
  return value;
}

function cookieValue(request, name) {
  const values = (request.headers.cookie || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}

function validCredentials(value, now, previous) {
  return record(value) && value.issuer === issuer && value.clientId === clientId && value.scope === scope &&
    value.credentialKind === 'local_frontend' && value.tokenType === 'Bearer' && sidPattern.test(value.sid) &&
    capability(value.accessToken, 'rin_at_') && capability(value.refreshToken, 'rin_rf_') &&
    Number.isSafeInteger(value.generation) && value.generation >= 0 && Number.isSafeInteger(value.version) && value.version > 0 &&
    Date.parse(value.accessExpiresAt) > now && Date.parse(value.refreshExpiresAt) > now &&
    (!previous || (value.sid === previous.sid && value.generation === previous.generation + 1 && value.version > previous.version));
}

// One explicitly authorized account per launcher. Tokens exist only in this
// process. Restarting deliberately requires consent again, not a local DB.
export function createLocalSession({ origin, fetchImpl = fetch, now = Date.now, callbackTTL = 180_000 }) {
  const url = new URL(origin);
  if (url.origin !== origin || url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || !url.port)
    throw new Error('A literal loopback origin is required.');
  const cookieName = `rin_local_${url.port}`; // Cookies are NOT isolated by port.
  let browserID = opaque(); let csrf = opaque();
  let credentials = null; let pending = null; let refreshing = null;
  let refreshID = null; let closing = false; let loginStarting = false; let authorizationAvailable = false;
  let cancellationVersion = 0;

  const owns = (request) => same(cookieValue(request, cookieName), browserID);
  const setCookie = (response) => response.setHeader('Set-Cookie', `${cookieName}=${browserID}; Path=/; HttpOnly; SameSite=Lax`);
  const mutation = (request) => {
    if (!owns(request) || request.headers.origin !== origin || !same(request.headers['x-rinspace-csrf'], csrf))
      throw new LocalProblem(403, 'local.csrf_rejected', 'Local session and CSRF confirmation are required.');
  };
  const requireOwner = (request) => {
    if (!owns(request)) throw new LocalProblem(401, 'session.revoked', 'This local session is not available.');
  };

  async function native(path, { body, access, method } = {}) {
    const headers = new Headers({ accept: 'application/json' });
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (access) headers.set('authorization', `Bearer ${access}`);
    let response;
    try {
      response = await fetchImpl(`${nativeBase}${path}`, {
        method: method || (body === undefined ? 'GET' : 'POST'), headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(8000),
      });
    } catch { throw new LocalProblem(503, 'local.identity_unavailable', 'The official identity service could not be reached.'); }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new LocalProblem(503, 'local.identity_contract_rejected', 'Identity redirects are not permitted.');
    }
    if (response.status === 204) return {};
    if (!response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      throw new LocalProblem(503, 'local.authorization_not_ready', 'The official native-client protocol is not available yet.');
    }
    const chunks = []; let size = 0;
    if (response.body) for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 65536) throw new LocalProblem(503, 'local.identity_contract_rejected', 'Identity response is too large.');
      chunks.push(Buffer.from(chunk));
    }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LocalProblem(503, 'local.identity_contract_rejected', 'Invalid identity response.'); }
    if (!response.ok) {
      // No raw response/error text, capabilities or request fields reach UI/logs.
      const reauthentication = response.status === 401 && result.code === 'session.reauthentication_required' && result.sessionAction === 'preserve';
      const code = reauthentication ? 'session.reauthentication_required' : response.status === 401 ? 'session.revoked' : response.status === 409 ? 'session.refresh_conflict' :
        response.status === 429 ? 'identity.rate_limited' : response.status === 403 ? 'identity.permission_denied' : 'local.identity_unavailable';
      throw new LocalProblem([401, 403, 409, 429].includes(response.status) ? response.status : 503, code, 'The official identity service rejected or could not complete this request.');
    }
    if (!record(result)) throw new LocalProblem(503, 'local.identity_contract_rejected', 'Unexpected identity response.');
    return result;
  }

  const security = createLocalSecurity({ native, fetchImpl, now,
    fail: (status, code, message) => { throw new LocalProblem(status, code, message); } });

  async function inspect(candidate = credentials) {
    const envelope = await native('/session', { access: candidate.accessToken });
    if (envelope.status !== 'authenticated' || !record(envelope.user) || typeof envelope.user.id !== 'string' || !envelope.user.id ||
        !record(envelope.currentSession) || envelope.currentSession.sid !== candidate.sid ||
        envelope.currentSession.clientKind !== 'local_frontend' || envelope.currentSession.version !== candidate.version ||
        !Number.isFinite(Date.parse(envelope.expiresAt)))
      throw new LocalProblem(503, 'local.identity_contract_rejected', 'Identity did not confirm this local session.');
    // Project the reviewed envelope; never pass arbitrary credential fields.
    return { status: 'authenticated', expiresAt: envelope.expiresAt,
      user: { id: envelope.user.id, role: envelope.user.role, sessionEpoch: envelope.user.sessionEpoch, identityVersion: envelope.user.identityVersion },
      currentSession: { sid: candidate.sid, authTime: envelope.currentSession.authTime, authMethod: envelope.currentSession.authMethod, version: envelope.currentSession.version } };
  }

  async function refresh() {
    if (refreshing) return refreshing;
    if (!credentials) throw new LocalProblem(401, 'session.revoked', 'No authorized local session.');
    const before = credentials;
    refreshID ||= `local-refresh-${randomUUID()}`;
    const requestId = refreshID;
    refreshing = (async () => {
      try {
        const next = await native('/refresh', { body: { clientId, sid: before.sid, refreshToken: before.refreshToken, requestId } });
        if (!validCredentials(next, now(), before)) throw new LocalProblem(503, 'local.identity_contract_rejected', 'Invalid refreshed session.');
        if (credentials !== before || closing) throw new LocalProblem(409, 'session.refresh_conflict', 'The local session changed.');
        credentials = next; refreshID = null;
        return next;
      } catch (error) {
        if (error instanceof LocalProblem && error.status === 401 && credentials === before) credentials = null;
        // Keep the SAME request ID and old refresh on uncertain transport failure.
        throw error;
      }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function active() {
    if (closing || !credentials) throw new LocalProblem(401, 'session.revoked', 'No authorized local session.');
    if (Date.parse(credentials.accessExpiresAt) <= now() + 5000) await refresh();
    const candidate = credentials;
    try {
      const envelope = await inspect(candidate);
      if (credentials !== candidate || closing) throw new LocalProblem(409, 'session.refresh_conflict', 'The local session changed.');
      return { envelope, accessToken: candidate.accessToken };
    } catch (error) {
      if (error instanceof LocalProblem && error.status === 401 && credentials === candidate) credentials = null;
      throw error;
    }
  }

  function closePending() {
    cancellationVersion += 1;
    const previous = pending; pending = null;
    if (!previous) return;
    clearTimeout(previous.timer);
    previous.server.close(); previous.server.closeIdleConnections();
  }

  function callbackPage(response, message, success = false, status = 200) {
    const nonce = opaque();
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
    response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Rinspace</title><p>${message}</p><a href="${origin}/">返回本地 Rinspace</a><script nonce="${nonce}">history.replaceState(null,'','/');${success ? `location.replace(${JSON.stringify(`${origin}/`)});` : ''}</script></html>`);
  }

  async function begin(request) {
    mutation(request);
    if (closing || loginStarting || pending || credentials) throw new LocalProblem(409, 'local.authorization_pending', 'An authorization or session is already active.');
    loginStarting = true;
    const startingVersion = cancellationVersion;
    try {
      authorizationAvailable = false;
      const config = await native('/config');
      if (config.issuer !== issuer || config.clientId !== clientId || config.scope !== scope || config.credentialKind !== 'local_frontend' ||
          config.protocolVersion !== '2026-10-04' || config.codeChallengeMethod !== 'S256' || config.consentEndpoint !== issuer + consentPath ||
          config.tokenEndpoint !== nativeBase + '/token')
        throw new LocalProblem(503, 'local.authorization_not_ready', 'The official consent page and native-client protocol are not ready.');
      authorizationAvailable = true;
      if (closing || cancellationVersion !== startingVersion)
        throw new LocalProblem(409, 'local.authorization_cancelled', 'Authorization was cancelled.');
      const verifier = opaque(); const state = opaque();
      const listener = createServer();
      listener.requestTimeout = 10_000; listener.headersTimeout = 5000; listener.maxHeadersCount = 32;
      listener.listen(0, '127.0.0.1');
      try { await once(listener, 'listening'); } catch { listener.close(); throw new LocalProblem(503, 'local.callback_unavailable', 'Could not listen for authorization.'); }
      if (closing || cancellationVersion !== startingVersion) {
        listener.close(); listener.closeIdleConnections();
        throw new LocalProblem(409, 'local.authorization_cancelled', 'Authorization was cancelled.');
      }
      const callbackOrigin = `http://127.0.0.1:${listener.address().port}`;
      const redirectUri = `${callbackOrigin}/rinspace/callback`;
      const attempt = { server: listener, state, used: false, expires: now() + callbackTTL, timer: null };
      pending = attempt;
      attempt.timer = setTimeout(() => { if (pending === attempt) closePending(); }, callbackTTL).unref();
      listener.on('request', (incoming, response) => {
        // Do not retain a keep-alive socket after the one-shot listener retires.
        response.setHeader('Connection', 'close');
        void (async () => {
          const raw = incoming.url || '';
          const callback = new URL(raw, callbackOrigin);
          const keys = [...callback.searchParams.keys()];
          const code = callback.searchParams.get('code'); const cancelled = callback.searchParams.get('error') === 'access_denied';
          if (pending !== attempt || attempt.used || now() >= attempt.expires || incoming.method !== 'GET' ||
              incoming.headers.host !== new URL(callbackOrigin).host || !owns(incoming) ||
              (incoming.headers.origin !== undefined && incoming.headers.origin !== issuer) ||
              (incoming.headers['sec-fetch-mode'] !== undefined && incoming.headers['sec-fetch-mode'] !== 'navigate') ||
              !raw.startsWith('/rinspace/callback?') || callback.pathname !== '/rinspace/callback' || callback.hash ||
              keys.length !== 3 || new Set(keys).size !== 3 || keys.some((key) => !['state', 'iss', cancelled ? 'error' : 'code'].includes(key)) ||
              !same(callback.searchParams.get('state'), state) || callback.searchParams.get('iss') !== issuer || (!cancelled && !capability(code, 'rin_nc_'))) {
            callbackPage(response, '无效的授权回调。请回到本地页面重新开始。', false, 400); return;
          }
          attempt.used = true;
          if (cancelled) { closePending(); callbackPage(response, '已取消授权，正在返回本地。', true); return; }
          let candidate;
          try {
            candidate = await native('/token', { body: { grantType: 'authorization_code', clientId, code, redirectUri, codeVerifier: verifier, requestId: `local-code-${randomUUID()}` } });
            if (!validCredentials(candidate, now()) || closing || pending !== attempt)
              throw new LocalProblem(503, 'local.identity_contract_rejected', 'Invalid authorization result.');
            await inspect(candidate); // Issuing tokens alone is not proof of login.
            if (closing || pending !== attempt) throw new LocalProblem(503, 'local.identity_unavailable', 'Authorization expired.');
            credentials = candidate; browserID = opaque(); csrf = opaque(); refreshID = null;
            setCookie(response); closePending(); callbackPage(response, '授权完成，正在返回本地 Rinspace。', true);
          } catch {
            if (validCredentials(candidate, 0)) {
              // A known issued SID that could not be adopted is best-effort
              // revoked. Uncertain token exchange is never repeated.
              await native('/logout', { body: { clientId, sid: candidate.sid, refreshToken: candidate.refreshToken, requestId: `local-abandon-${randomUUID()}` } }).catch(() => undefined);
            }
            closePending(); callbackPage(response, '授权未完成。请回到本地页面重试，不要复制凭据。');
          }
        })().catch(() => { if (!response.headersSent) { response.writeHead(400); response.end('Invalid callback.'); } else response.destroy(); });
      });
      const consent = new URL(issuer + consentPath);
      for (const [key, value] of Object.entries({ clientId, responseType: 'code', redirectUri, scope, state, codeChallenge: createHash('sha256').update(verifier).digest('base64url'), codeChallengeMethod: 'S256' })) consent.searchParams.set(key, value);
      return { authorizationUrl: consent.href };
    } finally { loginStarting = false; }
  }

  return {
    async handle(request, response, path, search) {
      try {
        if (search) throw new LocalProblem(400, 'local.invalid_request', 'Identity queries are not accepted.');
        if (path === '/__rinspace_local/login' && request.method === 'POST') {
          await readJSON(request, []); sendJSON(response, 200, await begin(request)); return;
        }
        if (path === '/__rinspace_local/cancel' && request.method === 'POST') {
          mutation(request); await readJSON(request, []); closePending(); sendJSON(response, 200, {}); return;
        }
        if (path === '/session' && request.method === 'GET') {
          if (!owns(request)) {
            if (!credentials && !pending) setCookie(response);
            sendJSON(response, 200, { status: 'anonymous', canRefresh: false, ...(!credentials && !pending ? { csrfToken: csrf } : {}) }); return;
          }
          if (!credentials) { sendJSON(response, 200, { status: 'anonymous', canRefresh: false, csrfToken: csrf }); return; }
          const { envelope } = await active(); sendJSON(response, 200, { ...envelope, csrfToken: csrf }); return;
        }
        if (path === '/session/refresh' && request.method === 'POST') {
          mutation(request); await readJSON(request, ['requestId']); await refresh();
          const { envelope } = await active(); sendJSON(response, 200, { ...envelope, csrfToken: csrf }); return;
        }
        if (path === '/session/logout' && request.method === 'POST') {
          mutation(request); await readJSON(request, ['requestId']); closePending();
          if (refreshing) await refreshing;
          if (credentials) {
            const before = credentials;
            try { await native('/logout', { body: { clientId, sid: before.sid, refreshToken: before.refreshToken, requestId: `local-logout-${randomUUID()}` } }); }
            catch (error) { if (!(error instanceof LocalProblem && error.status === 401)) throw error; }
            credentials = null; refreshID = null;
          }
          security.clear(); browserID = opaque(); csrf = opaque(); setCookie(response);
          sendJSON(response, 200, { status: 'anonymous', csrfToken: csrf }); return;
        }
        // Remaining security/OTP adapters are intentionally not blanket proxies.
        const fields = security.routes(path, request.method);
        if (fields !== null) {
          requireOwner(request);
          if (request.method !== 'GET') mutation(request);
          const input = request.method === 'GET' ? {} : await readJSON(request, fields);
          const current = await active();
          const actor = { sid: current.envelope.currentSession.sid, accessToken: current.accessToken,
            ensureCurrent: async () => {
              const latest = await active();
              if (latest.envelope.currentSession.sid !== actor.sid)
                throw new LocalProblem(409, 'session.refresh_conflict', 'The local account changed during verification.');
              actor.accessToken = latest.accessToken;
            } };
          const result = await security.handle(path, request.method, input, actor);
          if (result.signsOut && credentials?.sid === actor.sid) {
            credentials = null; refreshID = null; security.clear(); browserID = opaque(); csrf = opaque(); setCookie(response);
          }
          sendJSON(response, 200, result.body); return;
        }
        throw new LocalProblem(503, 'local.identity_route_not_ready', 'This local identity action is not connected yet.');
      } catch (error) {
        if (error instanceof LocalProblem && error.code === 'session.revoked' && owns(request)) { credentials = null; security.clear(); }
        sendProblem(response, error);
      }
    },
    async authorize(request, write) {
      requireOwner(request); if (write) mutation(request);
      return (await active()).accessToken;
    },
    hasSession() { return credentials !== null; },
    authorizationAvailable() { return authorizationAvailable; },
    async close() { closing = true; closePending(); if (refreshing) await refreshing.catch(() => undefined); credentials = null; security.clear(); browserID = opaque(); csrf = opaque(); },
  };
}

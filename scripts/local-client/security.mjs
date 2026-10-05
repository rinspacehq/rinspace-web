import { randomBytes } from 'node:crypto';

const sidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const clientPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const credentialRef = value => typeof value === 'string' && value.length <= 256 && /^[a-z][a-z0-9_-]{0,39}:[^\s/\\?#\x00-\x1f\x7f]+$/.test(value);
const select = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

// Action handles are local, single-use and never identity capabilities. The
// provider challenge/token and formal Rinspace proof stay in process memory.
export function createLocalSecurity({ native, fetchImpl, now, fail }) {
  const challenges = new Map(); const proofs = new Map();
  let nextSend = 0; let sending = false;
  const reject = () => fail(403, 'session.reauthentication_required', 'Fresh verification for this exact action is required.');
  const contract = () => fail(503, 'local.identity_contract_rejected', 'Unexpected security response.');
  const prune = map => { for (const [key, value] of map) if (value.expires <= now()) map.delete(key); };
  const handle = () => randomBytes(32).toString('base64url');
  const action = (purpose, target) => {
    if (purpose === 'session_revoke') return sidPattern.test(target);
    if (purpose === 'sessions_revoke_all') return target === 'all_sessions';
    if (purpose === 'credential_revoke') return credentialRef(target);
    return purpose === 'security_revoke_all' && target === 'all_personal_access';
  };
  const stashProof = (proof, actor, purpose, target) => {
    if (typeof proof !== 'string' || !/^rin_su_[A-Za-z0-9_-]{43}$/.test(proof)) contract();
    prune(proofs); if (proofs.size >= 8) reject();
    const id = handle(); proofs.set(id, { proof, sid: actor.sid, purpose, target, expires: now() + 120_000 });
    return { stepUpProof: id };
  };
  const takeProof = (id, actor, purpose, target) => {
    const entry = proofs.get(id);
    if (!entry || entry.expires <= now() || entry.sid !== actor.sid || entry.purpose !== purpose || entry.target !== target) reject();
    // Do not repeat a destructive operation after an uncertain reply.
    proofs.delete(id); return entry.proof;
  };
  async function provider(client, path, body) {
    if (typeof client !== 'string' || !clientPattern.test(client))
      fail(503, 'local.verification_not_ready', 'The official phone verification configuration is unavailable.');
    let response;
    try {
      response = await fetchImpl(`https://${client}.api.tcloudbasegateway.com/auth/v1${path}?client_id=${encodeURIComponent(client)}`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body),
        redirect: 'manual', signal: AbortSignal.timeout(8000),
      });
    } catch { fail(503, 'local.verification_unavailable', 'Phone verification could not be reached.'); }
    if ((response.status >= 300 && response.status < 400) || !response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel(); contract();
    }
    const chunks = []; let size = 0;
    if (response.body) for await (const chunk of response.body) {
      size += chunk.length; if (size > 16384) contract(); chunks.push(Buffer.from(chunk));
    }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { contract(); }
    if (!record(result)) contract();
    if (!response.ok || typeof result.error === 'string') {
      if (response.status === 429 || result.error === 'rate_limit_exceeded') fail(429, 'identity.rate_limited', 'Phone verification is rate limited.');
      if (result.error === 'captcha_required') fail(403, 'local.verification_captcha_required', 'The phone provider requires a captcha; this flow has not completed verification.');
      if (response.status >= 500) fail(503, 'local.verification_unavailable', 'Phone verification is temporarily unavailable.');
      reject();
    }
    return result;
  }
  return {
    clear() { challenges.clear(); proofs.clear(); },
    routes(path, method) {
      if (method === 'GET' && ['/sessions', '/credentials'].includes(path)) return [];
      if (method === 'POST' && path === '/step-up/cloudbase/challenge') return ['purpose', 'target', 'phone'];
      if (method === 'POST' && path === '/step-up/cloudbase') return ['purpose', 'target', 'phone', 'verificationId', 'code'];
      if (method === 'POST' && path === '/step-up') return ['purpose', 'target', 'challengeId', 'code'];
      if (method === 'DELETE' && /^\/(sessions|credentials)\/[^/]+$/.test(path)) return ['stepUpProof'];
      if (method === 'POST' && ['/sessions/revoke-all', '/security/revoke-all'].includes(path)) return ['confirm', 'stepUpProof'];
      return null;
    },
    async handle(path, method, input, actor) {
      const call = (endpoint, body, verb) => native(endpoint, { access: actor.accessToken, ...(body === undefined ? {} : { body }), ...(verb ? { method: verb } : {}) });
      if (method === 'GET') {
        const result = await call(path);
        if (!Array.isArray(result.items) || result.items.length > 500) contract();
        const items = result.items.map(item => {
          if (!record(item)) contract();
          if (path === '/sessions') {
            if (!sidPattern.test(item.sid) || typeof item.clientLabel !== 'string' || typeof item.current !== 'boolean' ||
                typeof item.revoked !== 'boolean' || typeof item.cleanupComplete !== 'boolean' || !record(item.runtimes) ||
                Object.values(item.runtimes).some(value => typeof value !== 'string')) contract();
            for (const key of ['authMethod', 'createdAt', 'lastActiveAt', 'idleExpiresAt', 'absoluteExpiresAt'])
              if (item[key] !== undefined && typeof item[key] !== 'string') contract();
            return { ...select(item, ['sid', 'clientLabel', 'authMethod', 'createdAt', 'lastActiveAt', 'idleExpiresAt', 'absoluteExpiresAt', 'current', 'revoked', 'cleanupComplete']),
              runtimes: select(item.runtimes, ['mastodon', 'gitea_web', 'editor']) };
          }
          if (!credentialRef(item.ref) || typeof item.provider !== 'string' || typeof item.kind !== 'string' || typeof item.label !== 'string' ||
              typeof item.state !== 'string' || !Array.isArray(item.scopes) || item.scopes.some(value => typeof value !== 'string')) contract();
          for (const key of ['createdAt', 'lastUsedAt']) if (item[key] !== undefined && typeof item[key] !== 'string') contract();
          return select(item, ['ref', 'provider', 'kind', 'label', 'scopes', 'state', 'createdAt', 'lastUsedAt']);
        });
        await actor.ensureCurrent(); return { body: { items } };
      }
      if (path === '/step-up' || path.startsWith('/step-up/cloudbase')) {
        const { purpose, target } = input;
        if (!action(purpose, target)) reject();
        if (path === '/step-up/cloudbase/challenge') {
          if (typeof input.phone !== 'string' || !/^1[0-9]{10}$/.test(input.phone)) reject();
          prune(challenges);
          if (sending || now() < nextSend || challenges.size >= 4) fail(429, 'identity.rate_limited', 'Wait before requesting another verification code.');
          sending = true; nextSend = now() + 60_000;
          try {
            const config = await native('/config');
            const client = config.phoneVerificationClientId;
            const result = await provider(client, '/verification', { phone_number: `+86 ${input.phone}`, target: 'USER' });
            await actor.ensureCurrent();
            if (typeof result.verification_id !== 'string' || !result.verification_id || result.verification_id.length > 4096 || result.is_user === false) contract();
            const id = handle(); const phone = `+86${input.phone}`;
            challenges.set(id, { id: result.verification_id, client, phone, purpose, target, sid: actor.sid, expires: now() + 600_000, attempts: 0, busy: false });
            return { body: { verificationId: id, phoneNumber: phone, isUser: true, retryAfter: 60 } };
          } finally { sending = false; }
        }
        if (path === '/step-up/cloudbase') {
          const entry = challenges.get(input.verificationId);
          if (!entry || entry.busy || entry.expires <= now() || entry.attempts >= 5 || entry.sid !== actor.sid ||
              entry.purpose !== purpose || entry.target !== target || entry.phone !== input.phone || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) reject();
          entry.busy = true; entry.attempts += 1;
          let verified;
          try { verified = await provider(entry.client, '/verification/verify', { verification_id: entry.id, verification_code: input.code }); }
          finally { entry.busy = false; }
          challenges.delete(input.verificationId); // A redeemed provider proof is never replayed.
          if (typeof verified.verification_token !== 'string' || !verified.verification_token || verified.verification_token.length > 16384) contract();
          await actor.ensureCurrent();
          const result = await call('/step-up/cloudbase', { purpose, target, phone: entry.phone, verificationToken: verified.verification_token });
          await actor.ensureCurrent(); return { body: stashProof(result.stepUpProof, actor, purpose, target) };
        }
        const result = await call('/step-up', input);
        await actor.ensureCurrent();
        if (input.challengeId !== undefined || input.code !== undefined) return { body: stashProof(result.stepUpProof, actor, purpose, target) };
        if (!sidPattern.test(result.challengeId) || !Number.isSafeInteger(result.retryAfter)) contract();
        return { body: select(result, ['challengeId', 'retryAfter']) };
      }
      let target; let purpose;
      if (method === 'DELETE') {
        try { target = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)); } catch { reject(); }
        purpose = path.startsWith('/sessions/') ? 'session_revoke' : 'credential_revoke';
      } else {
        if (input.confirm !== true) reject();
        [purpose, target] = path === '/sessions/revoke-all' ? ['sessions_revoke_all', 'all_sessions'] : ['security_revoke_all', 'all_personal_access'];
      }
      if (!action(purpose, target)) reject();
      const proof = takeProof(input.stepUpProof, actor, purpose, target);
      const result = await call(path, { ...(method === 'POST' ? { confirm: true } : {}), stepUpProof: proof }, method);
      const signsOut = method === 'POST' || (purpose === 'session_revoke' && target === actor.sid);
      if (purpose === 'session_revoke' && (result.sid !== target || !Number.isSafeInteger(result.version) || result.version < 1 || typeof result.cleanupComplete !== 'boolean')) contract();
      if (purpose === 'credential_revoke' && (typeof result.operationId !== 'string' || !result.operationId || typeof result.state !== 'string')) contract();
      if (method === 'POST' && (!Number.isSafeInteger(result.sessionEpoch) || result.sessionEpoch < 1 ||
          !Number.isSafeInteger(purpose === 'security_revoke_all' ? result.revokedSessions : result.revokedCount))) contract();
      if (purpose === 'security_revoke_all' && (!Number.isSafeInteger(result.credentialEpoch) || result.credentialEpoch < 1 ||
          !['complete', 'remote_cleanup_pending'].includes(result.state))) contract();
      if (purpose === 'sessions_revoke_all' && typeof result.cleanupComplete !== 'boolean') contract();
      // Project metadata only, including honest asynchronous remote cleanup.
      const keys = purpose === 'session_revoke' ? ['sid', 'version', 'cleanupComplete'] : purpose === 'credential_revoke' ? ['operationId', 'state'] :
        purpose === 'sessions_revoke_all' ? ['sessionEpoch', 'revokedCount', 'cleanupComplete'] : ['sessionEpoch', 'credentialEpoch', 'revokedSessions', 'state'];
      if (purpose === 'security_revoke_all' && (!Array.isArray(result.operations) || !result.operations.every(item => record(item) &&
          typeof item.operationId === 'string' && typeof item.state === 'string'))) contract();
      return { signsOut, body: { ...select(result, keys), ...(purpose === 'security_revoke_all' ? {
        operations: result.operations.map(item => select(item, ['operationId', 'state'])),
      } : {}) } };
    },
  };
}

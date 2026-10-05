import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mode = vi.hoisted(() => ({ local: true }));
vi.mock('@/app/config/env', () => ({ publicEnv: {
  publicBasePath: '', cloudbaseEnvId: 'synthetic-env',
  get localRealClient() { return mode.local; },
} }));

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.resetModules(); mode.local = true; localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('BroadcastChannel', undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('local security uses the same-origin broker without a CloudBase environment or browser proof token', async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); calls.push({ path, init });
    if (path.endsWith('/session')) return json({ status: 'authenticated', csrfToken: 'synthetic-local-csrf', user: { id: 'synthetic-owner' } });
    if (path.endsWith('/step-up/cloudbase/challenge')) return json({ verificationId: 'local-opaque-handle', phoneNumber: '+8613900009999', isUser: true, retryAfter: 60 });
    if (path.endsWith('/step-up/cloudbase')) return json({ stepUpProof: 'local-proof-handle' });
    return json({ operationId: 'synthetic-operation', state: 'remote_cleanup_pending' });
  }));
  const auth = await import('./phoneAuth');
  const challenge = await auth.sendIdentityStepUpOtp('credential_revoke', 'gitea:synthetic', '13900009999');
  const proof = await auth.completeCloudBaseStepUp('credential_revoke', 'gitea:synthetic', challenge, '123456');
  await expect(auth.revokeIdentityCredential('gitea:synthetic', proof)).resolves.toMatchObject({ state: 'remote_cleanup_pending' });
  expect(calls.every(call => call.path.startsWith('/api/identity/v1/'))).toBe(true);
  const verify = calls.find(call => call.path.endsWith('/step-up/cloudbase'));
  expect(JSON.parse(String(verify?.init?.body))).toEqual({ purpose: 'credential_revoke', target: 'gitea:synthetic', phone: '+8613900009999', verificationId: 'local-opaque-handle', code: '123456' });
  for (const call of calls.filter(call => call.init?.method)) expect(new Headers(call.init?.headers).get('x-rinspace-csrf')).toBe('synthetic-local-csrf');
  expect(JSON.stringify({ ...localStorage })).not.toMatch(/123456|verificationId|stepUpProof|local-proof-handle/);
});

test('normal website still sends and verifies through its existing CloudBase gateway and cookie identity adapter', async () => {
  mode.local = false;
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); calls.push({ path, init });
    if (path.includes('/verification/verify')) return json({ verification_token: 'synthetic-formal-proof' });
    if (path.includes('/verification?')) return json({ verification_id: 'synthetic-provider-id', is_user: true });
    if (path.endsWith('/session')) return json({ status: 'authenticated', csrfToken: 'website-csrf', user: { id: 'synthetic-owner' } });
    return json({ stepUpProof: 'synthetic-step-up-proof' });
  }));
  const auth = await import('./phoneAuth');
  const challenge = await auth.sendIdentityStepUpOtp('session_revoke', 'synthetic-sid', '13900009999');
  await expect(auth.completeCloudBaseStepUp('session_revoke', 'synthetic-sid', challenge, '123456')).resolves.toBe('synthetic-step-up-proof');
  expect(calls[0]?.path).toBe('https://synthetic-env.api.tcloudbasegateway.com/auth/v1/verification?client_id=synthetic-env');
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ phone_number: '+86 13900009999', target: 'ANY' });
  const verify = calls.find(call => call.path.endsWith('/step-up/cloudbase'));
  expect(JSON.parse(String(verify?.init?.body))).toMatchObject({ verificationToken: 'synthetic-formal-proof', phone: '+8613900009999' });
  expect(new Headers(verify?.init?.headers).get('authorization')).toBeNull();
  expect(new Headers(verify?.init?.headers).get('x-rinspace-csrf')).toBe('website-csrf');
});

test('local malformed challenges and verification rejection never fabricate a proof or sign out the user', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith('/session')) return json({ status: 'authenticated', csrfToken: 'local-csrf', user: { id: 'synthetic-owner' } });
    if (path.endsWith('/challenge')) return json({ verificationId: '', phoneNumber: 'invalid', isUser: true });
    return json({ code: 'session.reauthentication_required', sessionAction: 'preserve', message: 'Fresh verification required.' }, 401);
  });
  vi.stubGlobal('fetch', fetcher);
  const auth = await import('./phoneAuth');
  await expect(auth.sendIdentityStepUpOtp('session_revoke', 'synthetic-sid', '13900009999')).rejects.toThrow('返回格式异常');
  await expect(auth.completeCloudBaseStepUp('session_revoke', 'synthetic-sid', { verificationId: 'local-handle', phoneNumber: '+8613900009999', isUser: true, retryAfter: 60 }, '000000')).rejects.toMatchObject({ code: 'session.reauthentication_required' });
  await expect(auth.getCurrentAuthUser()).resolves.toMatchObject({ id: 'synthetic-owner' });
});

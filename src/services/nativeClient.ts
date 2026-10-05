import { authHeaders, getCurrentAuthUser } from './phoneAuth';

export const nativeIssuer = 'https://rinspace.com';
export const nativeConsentPath = '/local-client/authorize';
export type NativeAuthorizationRequest = Readonly<{
  clientId: string; responseType: string; redirectUri: string; scope: string;
  state: string; codeChallenge: string; codeChallengeMethod: string;
}>;
const requestKeys = ['clientId', 'responseType', 'redirectUri', 'scope', 'state', 'codeChallenge', 'codeChallengeMethod'] as const;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseNativeAuthorization(search: string): NativeAuthorizationRequest | null {
  const params = new URLSearchParams(search);
  if ([...params.keys()].length !== requestKeys.length || requestKeys.some(key => params.getAll(key).length !== 1)) return null;
  const input = Object.fromEntries(requestKeys.map(key => [key, params.get(key) || ''])) as Record<typeof requestKeys[number], string>;
  const redirect = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/rinspace\/callback$/.exec(input.redirectUri);
  if (input.clientId !== 'rinspace-local-web' || input.responseType !== 'code' || input.scope !== 'outer-world' ||
      !redirect || Number(redirect[1]) > 65535 || !/^[A-Za-z0-9_-]{43,128}$/.test(input.state) ||
      input.codeChallengeMethod !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) return null;
  const encoded = input.codeChallenge.replace(/-/g, '+').replace(/_/g, '/');
  if (btoa(atob(`${encoded}=`)).replace(/=/g, '') !== encoded) return null;
  return Object.freeze(input);
}

export function nativeCallback(input: NativeAuthorizationRequest, grant: unknown): string {
  if (!record(grant) || grant.issuer !== nativeIssuer || grant.redirectUri !== input.redirectUri || grant.state !== input.state ||
      typeof grant.code !== 'string' || !/^rin_nc_[A-Za-z0-9_-]{43}$/.test(grant.code) ||
      typeof grant.expiresAt !== 'string' || Date.parse(grant.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(grant.expiresAt)))
    throw new Error('Invalid authorization result.');
  const callback = new URL(input.redirectUri);
  callback.searchParams.set('code', grant.code);
  callback.searchParams.set('state', input.state);
  callback.searchParams.set('iss', nativeIssuer);
  return callback.href;
}

export function cancelledNativeCallback(input: NativeAuthorizationRequest) {
  const callback = new URL(input.redirectUri);
  callback.searchParams.set('error', 'access_denied');
  callback.searchParams.set('state', input.state);
  callback.searchParams.set('iss', nativeIssuer);
  return callback.href;
}

export async function confirmNativeAuthorization(input: NativeAuthorizationRequest) {
  if (window.location.origin !== nativeIssuer) throw new Error('Consent is only available on rinspace.com.');
  if (!parseNativeAuthorization(new URLSearchParams(input).toString()) || !await getCurrentAuthUser()) throw new Error('A current account is required.');
  const headers = authHeaders();
  if (!headers['X-Rinspace-CSRF']) throw new Error('Current account confirmation is unavailable.');
  const response = await fetch('/api/identity/v1/native/authorize', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, confirm: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Authorization could not be completed.');
  const result: unknown = await response.json();
  return nativeCallback(input, result);
}

export async function beginLocalAuthorization() {
  const session = await fetch('/api/identity/v1/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const envelope: unknown = await session.json();
  if (!session.ok || !record(envelope) || typeof envelope.csrfToken !== 'string') throw new Error('Local confirmation is unavailable.');
  const response = await fetch('/__rinspace_local/login', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': envelope.csrfToken }, body: '{}', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('The official native-client service is not ready or could not be reached.');
  const result: unknown = await response.json();
  if (!record(result) || typeof result.authorizationUrl !== 'string') throw new Error('Invalid authorization URL.');
  const target = new URL(result.authorizationUrl);
  if (target.origin !== nativeIssuer || target.pathname !== nativeConsentPath || target.hash || !parseNativeAuthorization(target.search)) throw new Error('Invalid authorization URL.');
  return target.href;
}

export async function cancelLocalAuthorization() {
  const response = await fetch('/api/identity/v1/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const envelope: unknown = await response.json();
  if (!response.ok || !record(envelope) || typeof envelope.csrfToken !== 'string') throw new Error('Local confirmation is unavailable.');
  const cancelled = await fetch('/__rinspace_local/cancel', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': envelope.csrfToken },
    body: '{}', signal: AbortSignal.timeout(8000),
  });
  if (!cancelled.ok) throw new Error('Could not cancel authorization.');
}

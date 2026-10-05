import { describe, expect, it } from 'vitest';
import { cancelledNativeCallback, nativeCallback, parseNativeAuthorization } from './nativeClient';

const fields = { clientId: 'rinspace-local-web', responseType: 'code', redirectUri: 'http://127.0.0.1:5177/rinspace/callback', scope: 'outer-world', state: 'a'.repeat(43), codeChallenge: 'A'.repeat(43), codeChallengeMethod: 'S256' };
const query = (overrides: Record<string, string> = {}) => new URLSearchParams({ ...fields, ...overrides }).toString();
describe('official native consent boundary', () => {
  it('accepts only the exact public client, S256, canonical loopback and unique fields', () => {
    expect(parseNativeAuthorization(query())).toEqual(fields);
    expect(parseNativeAuthorization(query({ redirectUri: 'http://[::1]:53213/rinspace/callback' }))).not.toBeNull();
    for (const redirectUri of ['http://localhost:5177/rinspace/callback', 'http://127.0.0.2:5177/rinspace/callback', 'http://127.0.0.1:05177/rinspace/callback', 'http://127.0.0.1:65536/rinspace/callback', 'http://127.0.0.1:5177/rinspace/callback?next=x', 'https://evil.test/rinspace/callback', 'http://127.0.0.1:5177/rinspace/%63allback']) expect(parseNativeAuthorization(query({ redirectUri }))).toBeNull();
    const invalidInputs: Record<string, string>[] = [{ clientId: 'other' }, { scope: 'inner-world' }, { state: 'short' }, { codeChallengeMethod: 'plain' }, { codeChallenge: 'B'.repeat(43) }];
    for (const override of invalidInputs) expect(parseNativeAuthorization(query(override))).toBeNull();
    expect(parseNativeAuthorization(`${query()}&state=duplicate`)).toBeNull();
    expect(parseNativeAuthorization(`${query()}&unexpected=field`)).toBeNull();
  });
  it('pins the returned grant issuer/state/redirect/expiry and never puts capabilities in navigation', () => {
    const input = parseNativeAuthorization(query())!;
    const grant = { code: `rin_nc_${'a'.repeat(43)}`, state: fields.state, issuer: 'https://rinspace.com', redirectUri: fields.redirectUri, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    const target = new URL(nativeCallback(input, grant));
    expect([...target.searchParams.keys()]).toEqual(['code', 'state', 'iss']);
    for (const override of [{ issuer: 'https://evil.test' }, { state: 'foreign' }, { redirectUri: 'http://127.0.0.1:5178/rinspace/callback' }, { expiresAt: 'not-a-date' }, { expiresAt: '2000-01-01T00:00:00Z' }, { code: 'rin_at_no' }]) expect(() => nativeCallback(input, { ...grant, ...override })).toThrow();
    const cancel = new URL(cancelledNativeCallback(input)); expect(cancel.searchParams.get('error')).toBe('access_denied');
    expect(cancel.searchParams.has('code')).toBe(false);
  });
});

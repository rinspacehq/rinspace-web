import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const fixtureURL = process.env.IDENTITY_BROWSER_FIXTURE_URL;
test.skip(!fixtureURL, 'IDENTITY_BROWSER_FIXTURE_URL is required');

async function api<T>(page: Page, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }, { path, init });
}

async function login(context: BrowserContext, phone: string, label: string) {
  const page = await context.newPage();
  await page.goto(fixtureURL!);
  const bootstrap = await api<{ csrfToken: string }>(page, '/api/identity/v1/session');
  expect(bootstrap.status).toBe(200);
  const challenge = await api<{ challengeId: string }>(page, '/api/identity/v1/challenges', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': bootstrap.body.csrfToken },
    body: JSON.stringify({ phone, purpose: 'login', safeReturnPath: '/' }),
  });
  expect(challenge.status).toBe(202);
  const otp = await api<{ code: string }>(page, `/__test/otp/${challenge.body.challengeId}`);
  const verified = await api<{ currentSession: { sid: string } }>(page, `/api/identity/v1/challenges/${challenge.body.challengeId}/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': bootstrap.body.csrfToken },
    body: JSON.stringify({ code: otp.body.code, requestId: crypto.randomUUID(), clientLabel: label }),
  });
  expect(verified.status).toBe(200);
  return { page, sid: verified.body.currentSession.sid };
}

async function stepUp(page: Page, purpose: string, target: string) {
  const session = await api<{ csrfToken: string }>(page, '/api/identity/v1/session');
  const challenge = await api<{ challengeId: string }>(page, '/api/identity/v1/step-up', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': session.body.csrfToken },
    body: JSON.stringify({ purpose, target }),
  });
  expect(challenge.status).toBe(202);
  const otp = await api<{ code: string }>(page, `/__test/otp/${challenge.body.challengeId}`);
  const proof = await api<{ stepUpProof: string }>(page, '/api/identity/v1/step-up', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': session.body.csrfToken },
    body: JSON.stringify({ purpose, target, challengeId: challenge.body.challengeId, code: otp.body.code }),
  });
  expect(proof.status).toBe(200);
  return { csrf: session.body.csrfToken, proof: proof.body.stepUpProof };
}

test('two isolated browsers keep independent sessions and enforce exact ownership', async ({ browser }) => {
  const desktop = await browser.newContext();
  const phone = await browser.newContext();
  const otherUser = await browser.newContext();
  try {
    const a = await login(desktop, '+8613800000001', 'Desktop Chromium');
    const b = await login(phone, '+8613800000001', 'Phone Chromium');
    const c = await login(otherUser, '+8613800000002', 'Other user Chromium');

    expect((await api<{ status: string }>(a.page, '/api/identity/v1/session')).body.status).toBe('authenticated');
    expect((await api<{ status: string }>(b.page, '/api/identity/v1/session')).body.status).toBe('authenticated');
    const devices = await api<{ items: Array<{ sid: string }> }>(a.page, '/api/identity/v1/sessions');
    expect(devices.body.items.map(({ sid }) => sid).sort()).toEqual([a.sid, b.sid].sort());

    const ownProof = await stepUp(a.page, 'session_revoke', b.sid);
    const revoked = await api<{ cleanupComplete: boolean }>(a.page, `/api/identity/v1/sessions/${b.sid}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': ownProof.csrf },
      body: JSON.stringify({ stepUpProof: ownProof.proof }),
    });
    expect(revoked.status).toBe(200);
    expect((await api<{ status: string }>(b.page, '/api/identity/v1/session')).body.status).toBe('anonymous');
    expect((await api<{ status: string }>(a.page, '/api/identity/v1/session')).body.status).toBe('authenticated');

    const crossProof = await stepUp(c.page, 'session_revoke', a.sid);
    const cross = await api<unknown>(c.page, `/api/identity/v1/sessions/${a.sid}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Rinspace-CSRF': crossProof.csrf },
      body: JSON.stringify({ stepUpProof: crossProof.proof }),
    });
    expect(cross.status).toBe(403);
    expect((await api<{ status: string }>(a.page, '/api/identity/v1/session')).body.status).toBe('authenticated');
  } finally {
    await Promise.all([desktop.close(), phone.close(), otherUser.close()]);
  }
});

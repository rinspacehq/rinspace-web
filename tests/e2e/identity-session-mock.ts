export function identitySessionMock(id: string, username: string, role = 'member') {
  return {
    status: 'authenticated',
    csrfToken: 'playwright-csrf',
    user: { id, username, role, sessionEpoch: 1, identityVersion: 1 },
    currentSession: { sid: `playwright-${id}`, authMethod: 'sms', version: 1 },
  };
}

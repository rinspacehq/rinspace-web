import { beforeEach, expect, it, vi } from 'vitest';
import { requestAdminJson } from '../httpClient';
import { loadLearningAccess, loadLearningAdminConfig, saveLearningAccess } from './readerLearningAdmin';
vi.mock('../httpClient', () => ({ requestAdminJson: vi.fn() }));
const row = { actor_uid: 'account/a', version: 2, enabled: true, valid_until: '2026-11-20T00:00:00Z',
  updated_by: 'operator', reason: 'Synthetic acceptance', updated_at: '2026-11-12T00:00:00Z' };
beforeEach(() => vi.resetAllMocks());
it('binds Native admin requests and rejects a forged update response', async () => {
  vi.mocked(requestAdminJson).mockResolvedValue(row);
  await expect(saveLearningAccess('account/a', { expectedVersion: 1, enabled: true, expiresAt: row.valid_until, reason: row.reason })).resolves.toEqual(row);
  expect(requestAdminJson).toHaveBeenCalledWith('wallet/reader-learning/accounts/account%2Fa', expect.objectContaining({ auth: 'required', method: 'PUT' }));
  vi.mocked(requestAdminJson).mockResolvedValue({ ...row, actor_uid: 'other-account' });
  await expect(saveLearningAccess('account/a', { expectedVersion: 1, enabled: true, reason: row.reason })).rejects.toThrow();
});
it('rejects duplicate access rows and invalid cursors', async () => {
  for (const response of [{ items: [row, row], nextAfter: null }, { items: [row], nextAfter: 'other-account' }, { items: [{ ...row, enabled: true, valid_until: null }], nextAfter: null }]) {
    vi.mocked(requestAdminJson).mockResolvedValue(response);
    await expect(loadLearningAccess()).rejects.toThrow();
  }
});
it('keeps explicit disabled settings and refuses false readiness', async () => {
  const value = { schema: 'reader-learning-admin/v1', enabled: false, version: 1, budget: { inputTokens: 131072, outputTokens: 32768 }, ready: false, updatedBy: '', updatedAt: row.updated_at };
  vi.mocked(requestAdminJson).mockResolvedValue(value);
  await expect(loadLearningAdminConfig()).resolves.toEqual(value);
  vi.mocked(requestAdminJson).mockResolvedValue({ ...value, ready: 'yes' });
  await expect(loadLearningAdminConfig()).rejects.toThrow();
});

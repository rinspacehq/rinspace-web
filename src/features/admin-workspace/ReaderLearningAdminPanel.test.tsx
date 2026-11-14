import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReaderLearningAdminPanel } from './ReaderLearningAdminPanel';
import { ServiceError } from '@/services/httpClient';
import {
  loadLearningAccess, loadLearningAdminConfig, saveLearningAccess, saveLearningAdminConfig,
  type LearningAdminConfig,
} from '@/services/domains/readerLearningAdmin';

vi.mock('@/services/domains/readerLearningAdmin', () => ({
  loadLearningAccess: vi.fn(), loadLearningAdminConfig: vi.fn(), saveLearningAccess: vi.fn(), saveLearningAdminConfig: vi.fn(),
}));
const configuration: LearningAdminConfig = { schema: 'reader-learning-admin/v1', enabled: true, version: 7,
  budget: { inputTokens: 131072, outputTokens: 32768 }, ready: true, updatedBy: 'operator', updatedAt: '2026-11-12T01:00:00Z' };
const account = { actor_uid: 'existing-account', version: 3, enabled: true, valid_until: '2090-01-01T00:00:00Z', updated_by: 'operator', reason: 'Synthetic reviewed account', updated_at: configuration.updatedAt };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.mocked(loadLearningAdminConfig).mockResolvedValue(structuredClone(configuration));
  vi.mocked(loadLearningAccess).mockResolvedValue({ items: [structuredClone(account)], nextAfter: null });
});
afterEach(cleanup);

it('keeps settings read-only for an operator without configuration permission', async () => {
  render(<ReaderLearningAdminPanel uid="operator" canConfigure={false} />);
  await screen.findByText('existing-account');
  expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
  expect(screen.queryByRole('button', { name: '保存授权' })).toBeNull();
  const toggle = screen.getByRole('switch');
  expect(toggle.hasAttribute('disabled')).toBe(true);
  fireEvent.click(toggle);
  expect(saveLearningAdminConfig).not.toHaveBeenCalled();
  expect(saveLearningAccess).not.toHaveBeenCalled();
});

it('saves the original configuration version and revokes an existing account without an expiry', async () => {
  vi.mocked(saveLearningAdminConfig).mockResolvedValue({ ...configuration, version: 8, enabled: false });
  vi.mocked(saveLearningAccess).mockResolvedValue({ ...account, version: 4, enabled: false, valid_until: null });
  render(<ReaderLearningAdminPanel uid="operator" canConfigure />);
  await screen.findByText('existing-account');
  fireEvent.click(screen.getByRole('switch'));
  const reasons = screen.getAllByLabelText('变更理由');
  fireEvent.change(reasons[0], { target: { value: ' End acceptance run ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(saveLearningAdminConfig).toHaveBeenCalledWith({ expectedVersion: 7, enabled: false,
    budget: configuration.budget, reason: 'End acceptance run' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  fireEvent.change(reasons[1], { target: { value: 'Revoke synthetic access' } });
  fireEvent.click(screen.getByRole('button', { name: '撤销授权' }));
  await waitFor(() => expect(saveLearningAccess).toHaveBeenCalledWith('existing-account', {
    expectedVersion: 3, enabled: false, reason: 'Revoke synthetic access' }));
  await waitFor(() => expect(within(screen.getByRole('table')).getByText('未启用或已过期')).toBeTruthy());
});

it('does not silently retry a stale write or report it as saved', async () => {
  vi.mocked(saveLearningAdminConfig).mockRejectedValue(new ServiceError('conflict', 409, null, 'VERSION_CONFLICT'));
  render(<ReaderLearningAdminPanel uid="operator" canConfigure />);
  await screen.findByText('existing-account');
  fireEvent.change(screen.getAllByLabelText('变更理由')[0], { target: { value: 'Synthetic update' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('设置已变化');
  expect(screen.queryByText('已保存')).toBeNull();
  expect(saveLearningAdminConfig).toHaveBeenCalledTimes(1);
});

it('ignores a late account response after the signed-in identity changes', async () => {
  let resolveOld!: (value: LearningAdminConfig) => void;
  vi.mocked(loadLearningAdminConfig).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const view = render(<ReaderLearningAdminPanel uid="old-operator" canConfigure />);
  view.rerender(<ReaderLearningAdminPanel uid="new-operator" canConfigure={false} />);
  await screen.findByText('existing-account');
  resolveOld({ ...configuration, budget: { inputTokens: 999999, outputTokens: 65536 } });
  await waitFor(() => expect((screen.getByLabelText('输入 token 上限') as HTMLInputElement).value).toBe('131072'));
});

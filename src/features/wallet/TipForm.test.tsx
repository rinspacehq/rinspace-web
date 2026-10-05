import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { loadWalletPolicy, previewWalletTip, createWalletTip, WalletCommandError } from './api';
import { readPendingTip, savePendingTip } from './pendingTip';
import { parseWalletPublicPolicy } from './publicPolicy';
import type { WalletOperation } from './response';
import TipForm, { type TipTarget } from './TipForm';

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), loadWalletPolicy: vi.fn(), previewWalletTip: vi.fn(), createWalletTip: vi.fn() }));
const id = '12345678-1234-4234-8234-123456789abc';
const policy = parseWalletPublicPolicy({ policy_version: '2', recharge: { enabled: false, fen_per_shangong: '10', daily_limit_fen: '100000' }, tip: { enabled: true, single_limit: '100', daily_limit: '1000' }, conversion: { enabled: false, bound_group: '10', ordinary_group: '7' } });
const target: TipTarget = { contentType: 'book', postID: '42' };
const preview = { preview_id: id, expires_at: '2099-01-01T00:00:00Z', content: { content_type: 'book' as const, post_id: '42', title: 'An original Typst book' }, recipient: { uid: 'author', display_name: 'Author from server' }, quantity: '7', policy_version: '2', eligibility_version: '1' };
type TipOperation = Extract<WalletOperation, { kind: 'tip' }>;
const operation: TipOperation = { operation_id: id, kind: 'tip', state: 'COMPLETED', version: '2', created_at: '2026-09-19T16:00:00Z' };
beforeEach(async () => {
  vi.resetAllMocks(); sessionStorage.clear(); await ensureLocaleNamespaces('en', ['wallet']); await i18n.changeLanguage('en');
  vi.mocked(loadWalletPolicy).mockResolvedValue(policy); vi.mocked(previewWalletTip).mockResolvedValue(preview); vi.mocked(createWalletTip).mockResolvedValue(operation);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (uid = 'user-a', work: TipTarget | undefined = target) => render(<MemoryRouter><TipForm uid={uid} target={work} /></MemoryRouter>);
async function confirm() {
  fireEvent.change(await screen.findByLabelText('Shangong to tip'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview tip' }));
  await screen.findByRole('button', { name: 'Confirm tip' });
}
describe('tip confirmation and original-request recovery', () => {
  it('confirms the server work, author and integer quantity without yuan or identity forms', async () => {
    mount(); await confirm(); expect(createWalletTip).not.toHaveBeenCalled();
    expect(screen.getByText(preview.content.title)).toBeTruthy(); expect(screen.getByText('Recipient: Author from server')).toBeTruthy(); expect(screen.getByText('7 Shangong')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm tip' })); await screen.findByText('Tip completed');
    expect(createWalletTip).toHaveBeenCalledOnce(); expect(readPendingTip('user-a')).toBeNull(); expect(screen.queryByText(/CNY|RMB|phone number|real name/i)).toBeNull();
  });
  it('recovers a lost response from the wallet, without automatic posting or a new target', async () => {
    vi.mocked(createWalletTip).mockRejectedValueOnce(new WalletCommandError('RESULT_UNKNOWN'));
    const first = mount(); await confirm(); fireEvent.click(screen.getByRole('button', { name: 'Confirm tip' }));
    await screen.findByText(/Result pending/); const pending = readPendingTip('user-a'); expect(pending?.preview).toBe(id); expect(readPendingTip('user-b')).toBeNull();
    first.unmount(); render(<MemoryRouter><TipForm uid="user-a" /></MemoryRouter>);
    await screen.findByText('Tip pending'); expect(createWalletTip).toHaveBeenCalledOnce(); expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verify original request' })); await screen.findByText('Tip completed');
    expect(vi.mocked(createWalletTip).mock.calls[1].slice(0, 3)).toEqual(['user-a', pending?.key, id]);
  });
  it('serializes double clicks and ignores responses after account unmount', async () => {
    let finish: (value: TipOperation) => void = () => {};
    vi.mocked(createWalletTip).mockReturnValue(new Promise<TipOperation>(resolve => { finish = resolve; }));
    const first = mount(); await confirm(); const button = screen.getByRole('button', { name: 'Confirm tip' }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(createWalletTip).toHaveBeenCalledOnce()); first.unmount(); mount('user-b'); await screen.findByLabelText('Shangong to tip');
    await act(async () => finish(operation)); expect(screen.queryByText('Tip completed')).toBeNull(); expect(readPendingTip('user-a')).not.toBeNull();
  });
  it.each(['0', '1.1', '1e1', '01', '-1', '101', '9223372036854775808'])('rejects invalid input %s without a preview', async quantity => {
    mount(); fireEvent.change(await screen.findByLabelText('Shangong to tip'), { target: { value: quantity } }); fireEvent.click(screen.getByRole('button', { name: 'Preview tip' }));
    await screen.findByText(/Enter a positive integer/); expect(previewWalletTip).not.toHaveBeenCalled();
  });
  it('blocks storage failures and another unresolved original before submitting', async () => {
    mount(); await confirm(); savePendingTip('user-a', { key: '12345678-1234-4234-8234-123456789abd', preview: id });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm tip' })); await screen.findByText(/Cannot save the original request/); expect(createWalletTip).not.toHaveBeenCalled();
  });
  it('keeps unresolved commands across CSRF denial and only resets definitive business rejection', async () => {
    vi.mocked(createWalletTip).mockRejectedValueOnce(new WalletCommandError('PERMISSION_DENIED')).mockRejectedValueOnce(new WalletCommandError('CONFIRMATION_STALE'));
    mount(); await confirm(); fireEvent.click(screen.getByRole('button', { name: 'Confirm tip' })); await screen.findByText(/Result pending/);
    expect(screen.queryByRole('button', { name: 'Return to preview' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Verify original request' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Return to preview' })); await screen.findByLabelText('Shangong to tip'); expect(readPendingTip('user-a')).toBeNull();
  });
  it('blocks expired confirmation and a disabled policy', async () => {
    vi.mocked(previewWalletTip).mockResolvedValue({ ...preview, expires_at: '2020-01-01T00:00:00Z' });
    const first = mount(); await confirm(); fireEvent.click(screen.getByRole('button', { name: 'Confirm tip' })); await screen.findByText(/Preview expired/); expect(createWalletTip).not.toHaveBeenCalled();
    first.unmount(); vi.mocked(loadWalletPolicy).mockResolvedValue({ ...policy, tip: { enabled: false } }); mount(); await screen.findByText('Not available yet'); expect(screen.queryByRole('textbox')).toBeNull();
  });
});

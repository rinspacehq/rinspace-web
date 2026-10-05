import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { loadWalletPolicy, previewWalletConversion, createWalletConversion, WalletCommandError } from '@/features/wallet/api';
import { readPendingConversion } from '@/features/wallet/pendingConversion';
import { parseWalletPublicPolicy } from '@/features/wallet/publicPolicy';
import type { WalletOperation } from '@/features/wallet/response';
import WalletConversion from './Conversion';

vi.mock('@/features/wallet/api', async original => ({ ...await original<typeof import('@/features/wallet/api')>(), loadWalletPolicy: vi.fn(), previewWalletConversion: vi.fn(), createWalletConversion: vi.fn() }));
const id = '12345678-1234-4234-8234-123456789abc';
const policy = parseWalletPublicPolicy({ policy_version: '2', recharge: { enabled: false, fen_per_shangong: '10', daily_limit_fen: '100000' }, tip: { enabled: false }, conversion: { enabled: true, bound_group: '10', ordinary_group: '7', single_limit: '10000', daily_limit: '10000' } });
const preview = { preview_id: id, expires_at: '2099-01-01T00:00:00Z', bound_quantity: '20', ordinary_quantity: '14', remaining_bound: '3', policy_version: '2' };
type ConversionOperation = Extract<WalletOperation, { kind: 'conversion' }>;
const operation: ConversionOperation = { operation_id: id, kind: 'conversion', state: 'COMPLETED', version: '2', created_at: '2026-09-19T16:00:00Z' };
beforeEach(async () => {
  vi.resetAllMocks(); sessionStorage.clear(); await ensureLocaleNamespaces('en', ['wallet']); await i18n.changeLanguage('en');
  vi.mocked(loadWalletPolicy).mockResolvedValue(policy); vi.mocked(previewWalletConversion).mockResolvedValue(preview); vi.mocked(createWalletConversion).mockResolvedValue(operation);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (uid = 'user-a') => render(<MemoryRouter><WalletConversion uid={uid} /></MemoryRouter>);
async function confirm() {
  fireEvent.change(await screen.findByLabelText('Bound Shangong to convert'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview conversion' }));
  await screen.findByRole('button', { name: 'Confirm conversion' });
}
describe('conversion confirmation and durable retry', () => {
  it('previews exact integers before posting, then displays only confirmed completion', async () => {
    mount(); await confirm(); expect(createWalletConversion).not.toHaveBeenCalled();
    expect(screen.getByText('20 Shangong (bound) → 14 Shangong')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm conversion' }));
    await screen.findByText('Conversion completed'); expect(createWalletConversion).toHaveBeenCalledOnce(); expect(readPendingConversion('user-a')).toBeNull();
    expect(screen.queryByText(/CNY|RMB/)).toBeNull();
  });
  it('keeps the original identity across a lost response and reload, even when new conversions pause', async () => {
    vi.mocked(createWalletConversion).mockRejectedValueOnce(new WalletCommandError('RESULT_UNKNOWN'));
    const first = mount(); await confirm(); fireEvent.click(screen.getByRole('button', { name: 'Confirm conversion' }));
    await screen.findByText(/Result pending/);
    const pending = readPendingConversion('user-a'); expect(pending?.preview).toBe(id); expect(readPendingConversion('user-b')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to preview' })).toBeNull();
    first.unmount(); vi.mocked(loadWalletPolicy).mockResolvedValue({ ...policy, conversion: { ...policy.conversion, enabled: false } });
    mount(); await screen.findByText('Conversion pending'); expect(createWalletConversion).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Verify original request' })); await screen.findByText('Conversion completed');
    expect(vi.mocked(createWalletConversion).mock.calls[1].slice(0, 3)).toEqual(['user-a', pending?.key, id]);
  });
  it('serializes double clicks and discards a response after leaving the account', async () => {
    let finish: (value: ConversionOperation) => void = () => {};
    vi.mocked(createWalletConversion).mockReturnValue(new Promise<ConversionOperation>(resolve => { finish = resolve; }));
    const first = mount(); await confirm(); const button = screen.getByRole('button', { name: 'Confirm conversion' });
    fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(createWalletConversion).toHaveBeenCalledOnce());
    first.unmount(); mount('user-b'); await screen.findByLabelText('Bound Shangong to convert');
    await act(async () => finish(operation)); expect(screen.queryByText('Conversion completed')).toBeNull(); expect(readPendingConversion('user-a')).not.toBeNull();
  });
  it('blocks non-integer groups and storage failure before a money POST', async () => {
    mount(); fireEvent.change(await screen.findByLabelText('Bound Shangong to convert'), { target: { value: '23' } }); fireEvent.click(screen.getByRole('button', { name: 'Preview conversion' }));
    await screen.findByText(/positive multiple of 10/); expect(previewWalletConversion).not.toHaveBeenCalled();
    await confirm(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm conversion' })); await screen.findByText(/Cannot save the original request/); expect(createWalletConversion).not.toHaveBeenCalled();
  });
  it('only permits a new preview after an explicit definitive rejection', async () => {
    vi.mocked(createWalletConversion).mockRejectedValueOnce(new WalletCommandError('CONFIRMATION_STALE'));
    mount(); await confirm(); fireEvent.click(screen.getByRole('button', { name: 'Confirm conversion' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Return to preview' }));
    await screen.findByLabelText('Bound Shangong to convert'); expect(readPendingConversion('user-a')).toBeNull();
  });
  it('does not advertise conversion without an effective enabled policy', async () => {
    vi.mocked(loadWalletPolicy).mockResolvedValue({ ...policy, conversion: { ...policy.conversion, enabled: false } });
    mount(); await screen.findByText('Not available yet'); expect(screen.queryByRole('textbox')).toBeNull(); expect(previewWalletConversion).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import {
  loadWalletAdminRefundDetail,
  loadWalletAdminRefunds,
  reviewWalletAdminRefund,
} from '@/services/domains/walletAdmin';

import { WalletRefundsView } from './WalletRefundsView';

vi.mock('@/services/domains/walletAdmin', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/domains/walletAdmin')>(),
  loadWalletAdminRefundDetail: vi.fn(), loadWalletAdminRefunds: vi.fn(), reviewWalletAdminRefund: vi.fn(),
}));

const operationId='12345678-1234-4234-8234-123456789abc';
const refund={operationId,applicantUid:'reader',paymentOperationId:'22345678-1234-4234-8234-123456789abc',amountFen:'1000',state:'REQUESTED_RESERVED',version:'2',createdAt:'2026-09-20T08:00:00Z',submittedAt:'',outTradeNo:'wallet-order-1',paidAt:'2026-09-20T07:00:00Z',reservedQuantity:'100',requestReason:'duplicate purchase'};

beforeEach(async()=>{
  vi.clearAllMocks();await ensureLocaleNamespaces('en',['admin']);await i18n.changeLanguage('en');
  vi.mocked(loadWalletAdminRefunds).mockResolvedValue({items:[refund],nextCursor:''});
  vi.mocked(loadWalletAdminRefundDetail).mockResolvedValue({...refund,firstResponseAt:'',paymentAmountFen:'1000',reviews:[]});
  vi.mocked(reviewWalletAdminRefund).mockResolvedValue({});
});
afterEach(cleanup);

it('shows refund evidence and reviews the selected request',async()=>{
  render(<WalletRefundsView uid="admin" canReview canRevoke/>);
  expect(await screen.findByText('¥10.00')).toBeTruthy();
  expect(screen.queryByText('Recharge limit')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/¥10\.00/}));
  expect(await screen.findByText('Refund detail')).toBeTruthy();
  expect(loadWalletAdminRefundDetail).toHaveBeenCalledWith(operationId);
  fireEvent.change(screen.getByLabelText('Review or revocation reason'),{target:{value:'source and amount verified'}});fireEvent.click(screen.getByRole('button',{name:'Approve refund'}));
  await waitFor(()=>expect(reviewWalletAdminRefund).toHaveBeenCalledWith('admin',operationId,expect.stringMatching(/^[0-9a-f-]{36}$/),'approve','2','source and amount verified'));
});

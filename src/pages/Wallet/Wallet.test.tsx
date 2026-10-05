import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { getCurrentAuthUser } from '@/services/phoneAuth';
import { appealWalletCase, createWalletPaymentSession, createWalletRecharge, exportWalletStatementArchive, exportWalletStatements, loadWalletCases, loadWalletOperation, loadWalletPolicy, loadWalletStatements, loadWalletSummary, WalletCommandError, WalletReadError } from '@/features/wallet/api';
import type { WalletSummary } from '@/features/wallet/response';
import WalletPage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/services/phoneAuth', () => ({ getCurrentAuthUser: vi.fn() }));
vi.mock('@/features/wallet/api', async importOriginal => ({ ...await importOriginal<typeof import('@/features/wallet/api')>(), loadWalletSummary: vi.fn(), loadWalletPolicy:vi.fn(), loadWalletStatements: vi.fn(), exportWalletStatements: vi.fn(), exportWalletStatementArchive: vi.fn(), loadWalletOperation: vi.fn(), loadWalletCases:vi.fn(), appealWalletCase:vi.fn(), createWalletRecharge:vi.fn(),createWalletPaymentSession:vi.fn() }));
const summary: WalletSummary = {
 ordinary: {total:'9007199254740993',available:'9007199254740993',reserved:'0',restricted:'0'},
 bound:{total:'23',available:'23',reserved:'0',restricted:'0'},
 quota:{date:'2026-09-20',limit_fen:'100000',confirmed_fen:'0',unresolved_fen:'0',remaining_fen:'100000'},policy_version:'1',watermark:'1',
};
beforeEach(async () => {
 vi.clearAllMocks();window.sessionStorage.clear();await ensureLocaleNamespaces('en',['wallet']);await i18n.changeLanguage('en');
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:wallet-export')});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
 vi.mocked(getCurrentAuthUser).mockResolvedValue({id:'user-a'});
 vi.mocked(loadWalletSummary).mockResolvedValue(summary);
 vi.mocked(loadWalletPolicy).mockResolvedValue({policy_version:'1',recharge:{enabled:false,fen_per_shangong:'10',daily_limit_fen:'100000'},tip:{enabled:false},conversion:{enabled:false,bound_group:'10',ordinary_group:'7'}});
 vi.mocked(loadWalletStatements).mockResolvedValue({items:[],watermark:'0'});
 vi.mocked(exportWalletStatements).mockResolvedValue({filename:'rinspace-wallet-transactions.json',blob:new Blob(['{}'],{type:'application/json'}),page:{items:[],watermark:'0'}});
 vi.mocked(exportWalletStatementArchive).mockResolvedValue({filename:'rinspace-wallet-transactions-archive.json',blob:new Blob(['{}'],{type:'application/json'}),archive:{pages:[{items:[],watermark:'0'}],exported_pages:1,exported_items:0,truncated:false,watermark:'0'}});
 vi.mocked(loadWalletCases).mockResolvedValue({items:[]});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const mount = (path='/wallet') => render(<MemoryRouter initialEntries={[path]}><WalletPage /></MemoryRouter>);
describe('private wallet page', () => {
 it('has no serious axe violations in the overview reader path', async () => {
  mount();
  expect(await screen.findAllByText('9007199254740993')).toHaveLength(2);
  expect(screen.getByRole('complementary', { name: 'Wallet navigation' })).toBeTruthy();
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
 });
 it('renders exact integers and keeps unavailable money controls disabled', async () => {
  mount();expect(await screen.findAllByText('9007199254740993')).toHaveLength(2);expect(screen.getAllByText('23')).toHaveLength(2);
  expect(document.querySelector('.wallet-heading')).toBeNull();
  expect(screen.queryByText('Available balance')).toBeNull();
  expect(screen.queryByText('Quick actions')).toBeNull();
  expect(screen.queryByRole('button',{name:'Refresh'})).toBeNull();
  expect(screen.getByRole('button',{name:'Withdraw'}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getAllByRole('link',{name:'Top up'})[0]);await screen.findByText('Not available yet');
  expect(screen.getByRole('button',{name:'Top up'}).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/CNY 1 = 10 Shangong/)).toBeNull();
 });
 it('uses the current policy and managed account to create one Alipay handoff',async()=>{
  const operation={operation_id:'12345678-1234-4234-8234-123456789abc',kind:'recharge' as const,state:'RESERVED' as const,version:'1',created_at:'2026-09-20T08:00:00Z'};
  vi.mocked(loadWalletPolicy).mockResolvedValue({policy_version:'7',recharge:{enabled:true,fen_per_shangong:'10',daily_limit_fen:'100000',minimum_fen:'100',step_fen:'100',agreement_version:'3'},tip:{enabled:false},conversion:{enabled:false,bound_group:'10',ordinary_group:'7'}});
  vi.mocked(createWalletRecharge).mockResolvedValue(operation);vi.mocked(createWalletPaymentSession).mockResolvedValue({operation:{...operation,state:'PAYABLE',version:'2'},payment_deadline:'2026-09-20T08:15:00Z',pay_html:'<!doctype html><form id="alipay-page-pay"></form>'});
  const target={open:vi.fn(),write:vi.fn(),close:vi.fn()};vi.spyOn(window,'open').mockReturnValue({document:target} as unknown as Window);
  mount('/wallet?view=recharge');await screen.findByText('Top up with Alipay');const input=screen.getByRole('textbox') as HTMLInputElement;expect(input.value).toBe('');fireEvent.change(input,{target:{value:'25'}});fireEvent.click(screen.getByRole('button',{name:'Continue to Alipay'}));
  await waitFor(()=>expect(createWalletRecharge).toHaveBeenCalledWith('user-a',expect.any(String),'2500','7','3',expect.any(AbortSignal)));
 await waitFor(()=>expect(createWalletPaymentSession).toHaveBeenCalledWith('user-a',expect.any(String),operation.operation_id,expect.any(AbortSignal)));expect(target.write).toHaveBeenCalledWith(expect.stringContaining('alipay-page-pay'));
 });
 it('reuses the exact recharge and payment-session identities after a reload',async()=>{
  const operation={operation_id:'12345678-1234-4234-8234-123456789abc',kind:'recharge' as const,state:'RESERVED' as const,version:'1',created_at:'2026-09-20T08:00:00Z'};
  const payable={operation:{...operation,state:'PAYABLE' as const,version:'2'},payment_deadline:'2026-09-20T08:15:00Z',pay_html:'<!doctype html><form id="alipay-page-pay"></form>'};
  vi.mocked(loadWalletPolicy).mockResolvedValue({policy_version:'7',recharge:{enabled:true,fen_per_shangong:'10',daily_limit_fen:'100000',minimum_fen:'100',step_fen:'100',agreement_version:'3'},tip:{enabled:false},conversion:{enabled:false,bound_group:'10',ordinary_group:'7'}});
  vi.mocked(createWalletRecharge).mockResolvedValue(operation);vi.mocked(createWalletPaymentSession).mockRejectedValueOnce(new WalletCommandError('RESULT_UNKNOWN')).mockResolvedValueOnce(payable);
  vi.spyOn(window,'open').mockReturnValue({document:{open:vi.fn(),write:vi.fn(),close:vi.fn()}} as unknown as Window);
  mount('/wallet?view=recharge');await screen.findByText('Top up with Alipay');fireEvent.change(screen.getByRole('textbox'),{target:{value:'25'}});fireEvent.click(screen.getByRole('button',{name:'Continue to Alipay'}));
  await screen.findByText(/result pending/i);const firstSessionKey=vi.mocked(createWalletPaymentSession).mock.calls[0][1];cleanup();
  mount('/wallet?view=recharge');await screen.findByText('Top up with Alipay');expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('25');fireEvent.click(screen.getByRole('button',{name:'Continue to Alipay'}));
  await waitFor(()=>expect(createWalletPaymentSession).toHaveBeenCalledTimes(2));expect(createWalletRecharge).toHaveBeenCalledTimes(1);expect(vi.mocked(createWalletPaymentSession).mock.calls[1][1]).toBe(firstSessionKey);
 });
 it('requires the existing session and does not request financial data anonymously', async () => {
  vi.mocked(getCurrentAuthUser).mockResolvedValue(null);mount();await screen.findByText('Sign in to continue');expect(loadWalletSummary).not.toHaveBeenCalled();
  const listener=vi.fn();window.addEventListener('rinspace:auth-dialog-request',listener);
  fireEvent.click(screen.getByRole('button',{name:'Sign in'}));expect(listener).toHaveBeenCalledOnce();window.removeEventListener('rinspace:auth-dialog-request',listener);
 });
 it('does not display zero balances when reads fail', async () => {
  vi.mocked(loadWalletSummary).mockRejectedValue(new WalletReadError('unavailable'));mount();await screen.findByText('Wallet temporarily unavailable');expect(screen.queryByText('0')).toBeNull();
  vi.mocked(loadWalletSummary).mockResolvedValue(summary);fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(await screen.findAllByText('9007199254740993')).toHaveLength(2);
 });
 it('clears the former account immediately and discards its late response', async () => {
  let resolve!: (value:WalletSummary)=>void;
  vi.mocked(loadWalletSummary).mockReturnValueOnce(new Promise<WalletSummary>(r=>{resolve=r;}));mount();await waitFor(()=>expect(loadWalletSummary).toHaveBeenCalledOnce());
  vi.mocked(getCurrentAuthUser).mockResolvedValue(null);
  await act(async()=>{window.dispatchEvent(new Event('rinspace-session-changed'));});await screen.findByText('Sign in to continue');
  await act(async()=>{resolve(summary);});expect(screen.queryByText('9007199254740993')).toBeNull();
 });
 it('filters statements, distinguishes empty results and never converts tips to CNY', async () => {
  mount('/wallet?view=statements');await screen.findByText('No transactions in this range.');
  fireEvent.change(screen.getByLabelText('Transaction type'),{target:{value:'received'}});
  await waitFor(()=>expect(loadWalletStatements).toHaveBeenLastCalledWith('received','','','',expect.any(AbortSignal)));
  expect(screen.queryByText(/CNY/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Start date'),{target:{value:'2026-09-21'}});
  fireEvent.change(screen.getByLabelText('End date'),{target:{value:'2026-09-20'}});
 await screen.findByText('The start date cannot be after the end date.');
 });
 it('does not offer another refund when the recharge has no refundable source left', async () => {
  const recharge={sequence:'2',operation:{operation_id:'12345678-1234-4234-8234-123456789abc',kind:'recharge' as const,state:'CREDIT_POSTED' as const,version:'2',created_at:'2026-09-20T08:00:00Z'},perspective:'recharge' as const,unit:'SG' as const,quantity:'100',amount_fen:'1000',refundable_fen:'0'};
  const refund={sequence:'1',operation:{operation_id:'22345678-1234-4234-8234-123456789abc',kind:'refund' as const,state:'COMPLETED' as const,version:'4',created_at:'2026-09-20T09:00:00Z'},perspective:'refund' as const,unit:'SG' as const,quantity:'100',amount_fen:'1000',original_operation_id:recharge.operation.operation_id};
  vi.mocked(loadWalletStatements).mockResolvedValue({items:[recharge,refund],watermark:'2'});
  mount('/wallet?view=statements');await screen.findByText('Completed');
  expect(screen.queryByRole('button',{name:'Request refund'})).toBeNull();
 });
 it('downloads only the current statement page through the export endpoint', async () => {
  const user=userEvent.setup();
  const receipt={sequence:'4',operation:{operation_id:'12345678-1234-4234-8234-123456789abc',kind:'recharge' as const,state:'CREDIT_POSTED' as const,version:'2',created_at:'2026-09-20T08:00:00Z'},perspective:'recharge' as const,unit:'SG' as const,quantity:'100',amount_fen:'1000',refundable_fen:'1000'};
  vi.mocked(loadWalletStatements).mockResolvedValue({items:[receipt],watermark:'4'});
  vi.mocked(exportWalletStatements).mockResolvedValue({filename:'rinspace-wallet-transactions.json',blob:new Blob(['{"items":[]}'],{type:'application/json'}),page:{items:[receipt],watermark:'4'}});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined);
  mount('/wallet?view=statements');const exportButton=await screen.findByRole('button',{name:'Export'});
  await waitFor(()=>expect(exportButton.hasAttribute('disabled')).toBe(false));await user.click(exportButton);
  await user.click(await screen.findByRole('menuitem',{name:'Download current page'}));
  await waitFor(()=>expect(exportWalletStatements).toHaveBeenCalledWith('all','','','',expect.any(AbortSignal)));
 expect(click).toHaveBeenCalledOnce();expect(URL.createObjectURL).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:wallet-export');
  expect(await screen.findByText('Downloaded 1 records.')).toBeTruthy();
 });
 it('downloads bounded archive segments through the archive endpoint service', async () => {
  const user=userEvent.setup();
  const receipt={sequence:'4',operation:{operation_id:'12345678-1234-4234-8234-123456789abc',kind:'recharge' as const,state:'CREDIT_POSTED' as const,version:'2',created_at:'2026-09-20T08:00:00Z'},perspective:'recharge' as const,unit:'SG' as const,quantity:'100',amount_fen:'1000',refundable_fen:'1000'};
  const nextReceipt={...receipt,sequence:'3',operation:{...receipt.operation,operation_id:'12345678-1234-4234-8234-123456789abd'}};
  vi.mocked(loadWalletStatements).mockResolvedValue({items:[receipt],watermark:'4',next_cursor:'synthetic_cursor_12345678'});
  vi.mocked(exportWalletStatementArchive)
   .mockResolvedValueOnce({filename:'rinspace-wallet-transactions-archive.json',blob:new Blob(['{"pages":[]}'],{type:'application/json'}),archive:{pages:[{items:[receipt],watermark:'4',next_cursor:'synthetic_cursor_12345678'}],exported_pages:1,exported_items:1,truncated:true,next_cursor:'synthetic_cursor_12345678',watermark:'4'}})
   .mockResolvedValueOnce({filename:'rinspace-wallet-transactions-archive.json',blob:new Blob(['{"pages":[]}'],{type:'application/json'}),archive:{pages:[{items:[nextReceipt],watermark:'4'}],exported_pages:1,exported_items:1,truncated:false,watermark:'4'}});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined);
  mount('/wallet?view=statements');const exportButton=await screen.findByRole('button',{name:'Export'});
  await waitFor(()=>expect(exportButton.hasAttribute('disabled')).toBe(false));await user.click(exportButton);
  await user.click(await screen.findByRole('menuitem',{name:'Archive segment'}));
  await waitFor(()=>expect(exportWalletStatementArchive).toHaveBeenCalledWith('all','','','',expect.any(AbortSignal)));
  expect(click).toHaveBeenCalledOnce();expect(URL.createObjectURL).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:wallet-export');
  expect(await screen.findByText('Downloaded 1 records.')).toBeTruthy();
  await waitFor(()=>expect(screen.queryByRole('menuitem',{name:'Archive segment'})).toBeNull());
  await user.click(exportButton);await user.click(await screen.findByRole('menuitem',{name:'Archive segment'}));
  await waitFor(()=>expect(exportWalletStatementArchive).toHaveBeenLastCalledWith('all','','','synthetic_cursor_12345678',expect.any(AbortSignal)));
  expect(click).toHaveBeenCalledTimes(2);expect(URL.createObjectURL).toHaveBeenCalledTimes(2);await waitFor(()=>expect(screen.queryByRole('menuitem',{name:'Archive segment'})).toBeNull());await user.click(exportButton);
  expect(screen.getByRole('menuitem',{name:'Archive segment'})).toBeTruthy();
  await user.click(screen.getByRole('menuitem',{name:'Bundle'}));
  expect(click).toHaveBeenCalledTimes(3);expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  expect(await screen.findByText('Downloaded 2 records.')).toBeTruthy();
 });
 it('loads an account-scoped immutable receipt only when requested', async () => {
  const receipt={sequence:'4',operation:{operation_id:'12345678-1234-4234-8234-123456789abc',kind:'recharge' as const,state:'CREDIT_POSTED' as const,version:'2',created_at:'2026-09-20T08:00:00Z'},perspective:'recharge' as const,unit:'SG' as const,quantity:'100',amount_fen:'1000',refundable_fen:'1000'};
  vi.mocked(loadWalletStatements).mockResolvedValue({items:[receipt],watermark:'4'});vi.mocked(loadWalletOperation).mockResolvedValue(receipt);
  mount('/wallet?view=statements');const open=await screen.findByRole('button',{name:'View receipt'});expect(loadWalletOperation).not.toHaveBeenCalled();fireEvent.click(open);
  expect(await screen.findByText('Account sequence')).toBeTruthy();expect(screen.getByText('4')).toBeTruthy();expect(loadWalletOperation).toHaveBeenCalledWith(receipt.operation.operation_id,expect.any(AbortSignal));
 });
 it('shows only restricted Shangong and submits a versioned appeal',async()=>{
  const caseID='12345678-1234-4234-8234-123456789abc';vi.mocked(loadWalletCases).mockResolvedValue({items:[{case_id:caseID,state:'UNDER_REVIEW',version:'3',ordinary_restricted:'7',bound_restricted:'11',created_at:'2026-09-20T08:00:00Z'}]});
  vi.mocked(appealWalletCase).mockResolvedValue({case_id:caseID,appeal_id:'22345678-1234-4234-8234-123456789abc',state:'UNDER_REVIEW',version:'4',created_at:'2026-09-20T08:01:00Z'});
  mount('/wallet?view=appeals');await screen.findByText('Under review');expect(screen.getByText('7')).toBeTruthy();expect(screen.getByText('11')).toBeTruthy();expect(screen.queryByText(/CNY|¥/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Appeal'}));fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Please review'}});fireEvent.click(screen.getByRole('button',{name:'Submit appeal'}));
  await waitFor(()=>expect(appealWalletCase).toHaveBeenCalledWith('user-a',expect.any(String),caseID,'3','Please review',expect.any(AbortSignal)));
 });
});

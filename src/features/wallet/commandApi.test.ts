import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authHeaders, getCurrentAuthUser } from '@/services/phoneAuth';
import { cancelWalletRefund, createWalletConversion, createWalletPaymentSession, createWalletRecharge, createWalletTip, previewWalletTip, requestWalletRefund, WalletCommandError } from './api';
vi.mock('@/services/phoneAuth', () => ({ authHeaders: vi.fn(), getCurrentAuthUser: vi.fn() }));
const id = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => { vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: 'user-a' }); vi.mocked(authHeaders).mockReturnValue({ 'X-Rinspace-CSRF': 'synthetic-csrf', Authorization: 'DO-NOT-FORWARD' }); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('sends only the managed CSRF and original key; no UID, amount or bearer in conversion confirmation', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ operation_id: id, kind: 'conversion', state: 'COMPLETED', version: '2', created_at: '2026-09-19T16:00:00Z' }), { status: 201 })); vi.stubGlobal('fetch', fetcher);
  await createWalletConversion('user-a', id, id, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/wallet/v1/conversions'), expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ preview_id: id }), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Rinspace-CSRF': 'synthetic-csrf', 'Idempotency-Key': id } }));
});
it('blocks a changed account and treats lost or invalid success responses as unresolved', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('lost response')); vi.stubGlobal('fetch', fetcher);
  await expect(createWalletConversion('user-b', id, id, new AbortController().signal)).rejects.toEqual(new WalletCommandError('UNAUTHENTICATED')); expect(fetcher).not.toHaveBeenCalled();
  await expect(createWalletConversion('user-a', id, id, new AbortController().signal)).rejects.toEqual(new WalletCommandError('RESULT_UNKNOWN'));
});
const tipPreview = { preview_id: id, expires_at: '2099-01-01T00:00:00Z', content: { content_type: 'book', post_id: '42', title: 'Original book' }, recipient: { uid: 'author', display_name: 'Author' }, quantity: '7', policy_version: '2', eligibility_version: '1' };
it('binds the tip preview to the requested work and quantity without accepting a client recipient', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(tipPreview), { status: 201 })); vi.stubGlobal('fetch', fetcher);
  await expect(previewWalletTip('user-a', id, 'book', '42', '7', new AbortController().signal)).resolves.toEqual(tipPreview);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/wallet/v1/tip-previews'), expect.objectContaining({ body: JSON.stringify({ content_type: 'book', post_id: '42', quantity: '7' }) }));
});
it.each([
  { ...tipPreview, quantity: '8' },
  { ...tipPreview, content: { ...tipPreview.content, post_id: '43' } },
  { ...tipPreview, content: { ...tipPreview.content, content_type: 'blog' } },
  { ...tipPreview, recipient: { uid: 'user-a', display_name: 'Self' } },
])('rejects mismatched tip preview %j', async raw => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(raw), { status: 200 })));
  await expect(previewWalletTip('user-a', id, 'book', '42', '7', new AbortController().signal)).rejects.toEqual(new WalletCommandError('RESULT_UNKNOWN'));
});
it('posts only the preview ID, preserves the original key and accepts only completed tips', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ operation_id: id, kind: 'tip', state: 'COMPLETED', version: '2', created_at: '2026-09-19T16:00:00Z' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ operation_id: id, kind: 'conversion', state: 'COMPLETED', version: '2', created_at: '2026-09-19T16:00:00Z' }), { status: 200 })); vi.stubGlobal('fetch', fetcher);
  await createWalletTip('user-a', id, id, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/wallet/v1/tips'), expect.objectContaining({ body: JSON.stringify({ preview_id: id }), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Rinspace-CSRF': 'synthetic-csrf', 'Idempotency-Key': id } }));
  await expect(createWalletTip('user-a', id, id, new AbortController().signal)).rejects.toEqual(new WalletCommandError('RESULT_UNKNOWN'));
});

it('binds refund request and cancellation to the current managed account without forwarding a phone or bearer', async () => {
  const recharge = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const refund = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ operation_id: refund, kind: 'refund', state: 'REQUESTED_RESERVED', version: '1', created_at: '2026-09-20T04:00:00Z' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ operation_id: refund, kind: 'refund', state: 'CANCELLED', version: '2', created_at: '2026-09-20T04:00:00Z' }), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await requestWalletRefund('user-a', id, recharge, '100', 'duplicate purchase', '7', new AbortController().signal);
  expect(fetcher).toHaveBeenNthCalledWith(1, expect.stringContaining(`/wallet/v1/recharges/${recharge}/refunds`), expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Rinspace-CSRF': 'synthetic-csrf', 'Idempotency-Key': id },
    body: JSON.stringify({ amount_fen: '100', reason: 'duplicate purchase', policy_version: '7' }),
  }));
  await cancelWalletRefund('user-a', id, refund, '1', 'request withdrawn', new AbortController().signal);
  expect(fetcher).toHaveBeenNthCalledWith(2, expect.stringContaining(`/wallet/v1/refunds/${refund}/cancel`), expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Rinspace-CSRF': 'synthetic-csrf', 'Idempotency-Key': id },
    body: JSON.stringify({ expected_version: '1', reason: 'request withdrawn' }),
  }));
});

it('keeps a refund key reusable when the response is lost and rejects a changed account before fetch', async () => {
  const recharge = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const fetcher = vi.fn().mockRejectedValue(new Error('synthetic response loss'));
  vi.stubGlobal('fetch', fetcher);
  await expect(requestWalletRefund('user-a', id, recharge, '100', 'duplicate purchase', '7', new AbortController().signal)).rejects.toEqual(new WalletCommandError('RESULT_UNKNOWN'));
  await expect(cancelWalletRefund('user-b', id, id, '1', 'request withdrawn', new AbortController().signal)).rejects.toEqual(new WalletCommandError('UNAUTHENTICATED'));
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('creates a recharge then requests its isolated payment session without identity fields',async()=>{
  const recharge='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const sessionKey='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const operation={operation_id:recharge,kind:'recharge',state:'RESERVED',version:'1',created_at:'2026-09-20T05:00:00Z'};
  const payable={...operation,state:'PAYABLE',version:'2'};
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(operation),{status:201})).mockResolvedValueOnce(new Response(JSON.stringify({operation:payable,payment_deadline:'2026-09-20T05:15:00Z',pay_html:'<!doctype html><form id="alipay-page-pay"></form>'}),{status:200}));vi.stubGlobal('fetch',fetcher);
  await createWalletRecharge('user-a',id,'100','7','3',new AbortController().signal);
  await createWalletPaymentSession('user-a',sessionKey,recharge,new AbortController().signal);
  expect(fetcher).toHaveBeenNthCalledWith(1,expect.stringContaining('/wallet/v1/recharges'),expect.objectContaining({body:JSON.stringify({amount_fen:'100',policy_version:'7',agreement_version:'3'})}));
  expect(fetcher).toHaveBeenNthCalledWith(2,expect.stringContaining(`/wallet/v1/recharges/${recharge}/payment-session`),expect.objectContaining({body:'{}',headers:expect.not.objectContaining({Authorization:expect.anything()})}));
});

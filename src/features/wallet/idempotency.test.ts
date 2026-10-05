import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { walletFingerprint, walletStepUpBinding } from './idempotency';

const id = '12345678-1234-4234-8234-123456789abc';
const review = { decision: 'approve', expected_version: '2', reason: '通过' };

describe('wallet semantic and high-risk bindings', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());

  it('matches independently fixed Go/Node golden fingerprints including escaping', async () => {
    expect(await walletFingerprint('recharge.create', { amount_fen: '9223372036854775800', policy_version: '1', agreement_version: '1' }, 'trusted-uid'))
      .toBe('a34a7a0e145da5e08359d64fd94dd376c708592c09a0c921b19ce4bb61d65c29');
    expect(await walletFingerprint('refund.review', review, 'trusted-uid', id))
      .toBe('d0d8e3be144853463e3227f5f1020d49423847924fbb2304aa8bf810131962a5');
    expect(await walletFingerprint('refund.review', { ...review, decision: 'reject', reason: '请核对 <原单> & 金额' }, 'trusted-uid', id))
      .toBe('6ac53d1c03873420398da5cc408ac7a6455d96953103e3b2bda2f729ce8ab3bd');
    expect(await walletFingerprint('recharge.payment_session', {}, 'trusted-uid', id))
      .toBe('21c55adb13f1ac0fa1436dcee8d6833f1bb8fab09fd340abab8fe50458bf1c15');
    expect(await walletFingerprint('policy.update', { expected_version: '1', patch: { daily_recharge_limit_fen: '100000', recharge_enabled: false }, reason: '调整' }, 'trusted-uid'))
      .toBe('63042894a6e8ec5c6a2da57d0c73873ea3309829eb81d223e3956ee5ddf2a270');
    expect(await walletFingerprint('policy.update', { expected_version: '1', patch: { convert_enabled: false, tip_enabled: true, recharge_enabled: false, daily_recharge_limit_fen: '9007199254741000' }, reason: '调整' }, 'trusted-uid'))
      .toBe('3960d794791067dcc23fade25d50c1c09454e6a6f1ac26bb4d3d6d3e6ff43e32');
    expect(await walletFingerprint('case.restrict', { lot_id: '22345678-1234-4234-8234-123456789abc', quantity: '7', expected_version: '2', reason: '限制' }, 'trusted-uid', id))
      .toBe('ad87daff0cb4edd436fbf336fd0d9424f5f047a2db64109c8a2fb960c8c43ed0');
    expect(await walletFingerprint('case.release', { expected_version: '3', reason: '解除' }, 'trusted-uid', '32345678-1234-4234-8234-123456789abc'))
      .toBe('51b1a6d85a11f070087af1d9953d476732ee9a3e09666db38c59c503e9e6ffd3');
    expect(await walletFingerprint('case.appeal', { expected_version: '3', reason: '申诉' }, 'trusted-uid', id))
      .toBe('f724289e3f13c12fd3cf77fd396c3170ea29f82fd38f114c56b7db0d6decc63b');
    expect(await walletFingerprint('reconciliation.assign', { expected_version: '1', assignee_uid: 'reviewer-2', reason: '指派' }, 'trusted-uid', id))
      .toBe('039975166e2dc47ddec777ad8cf6c72ef20fd1dc189bdcefbdc5f09026f0f9ab');
    expect(await walletFingerprint('reconciliation.resolve', { expected_version: '2', resolution: 'EVIDENCE_ACCEPTED', evidence_reference: 'controlled://evidence/1', reason: '复核' }, 'trusted-uid', id))
      .toBe('f02b722aef2f73fe625c8a6291595ca9a29a9b966ef8e3cc69c9427d17318161');
  });
  it('binds step-up to decision/version/reason/actor/path without granting permission', async () => {
    const binding = await walletStepUpBinding('refund.review', review, 'trusted-uid', id);
    expect(binding).toEqual({ purpose: 'wallet_refund_review', target: 'wallet:v1:d0d8e3be144853463e3227f5f1020d49423847924fbb2304aa8bf810131962a5' });
    expect(Object.isFrozen(binding)).toBe(true);
    for (const change of [{ decision: 'reject' }, { expected_version: '3' }, { reason: '重新确认' }]) {
      expect((await walletStepUpBinding('refund.review', { ...review, ...change }, 'trusted-uid', id)).target).not.toBe(binding.target);
    }
    expect((await walletStepUpBinding('refund.review', review, 'other-uid', id)).target).not.toBe(binding.target);
    expect((await walletStepUpBinding('refund.review', review, 'trusted-uid', '22345678-1234-4234-8234-123456789abc')).target).not.toBe(binding.target);
    await expect(walletStepUpBinding('recharge.create', { amount_fen: '100', policy_version: '1', agreement_version: '1' }, 'trusted-uid')).rejects.toThrow();
  });
  it.each(['', ' uid', 'uid ', 'uid\n', '\ud800', '善'.repeat(100)])('rejects invalid actor %#', async (uid) => {
    await expect(walletFingerprint('refund.review', review, uid, id)).rejects.toThrow();
  });
  it('fails closed without secure hashing and rejects incorrect target scope', async () => {
    await expect(walletFingerprint('refund.review', review, 'uid')).rejects.toThrow();
    await expect(walletFingerprint('conversion.preview', { bound_quantity: '10' }, 'uid', id)).rejects.toThrow();
    vi.stubGlobal('crypto', undefined);
    await expect(walletFingerprint('refund.review', review, 'uid', id)).rejects.toThrow('Secure wallet hashing unavailable');
  });
});

import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Surface } from 'components/ui';

import { formatFenAsYuan, parseYuanToFen } from '@/features/wallet/amount';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadWalletAdminPolicy, updateWalletAdminPolicy, type WalletAdminPolicy } from '@/services/domains/walletAdmin';

export function WalletPolicyPanel({ uid, canConfigure }: { uid: string; canConfigure: boolean }) {
  const { t } = useFeatureTranslation('admin');
  const [policy, setPolicy] = useState<WalletAdminPolicy | null>(null);
  const [limit, setLimit] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const value = await loadWalletAdminPolicy();
      setPolicy(value);
      setLimit(formatFenAsYuan(BigInt(value.dailyRechargeLimitFen)));
    } catch { setError(t('policy.loadFailed')); }
    finally { setBusy(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  const start = async () => {
    if (!policy || !reason.trim() || busy) return;
    setError('');
    let fen: bigint;
    try {
      fen = parseYuanToFen(limit);
      if (fen <= 0n || fen % 10n !== 0n) throw new Error();
    } catch { setError(t('policy.invalidLimit')); return; }
    setBusy(true);
    try {
      const value = await updateWalletAdminPolicy(uid, crypto.randomUUID(), policy.version, fen.toString(), reason);
      setPolicy(value);
      setLimit(formatFenAsYuan(BigInt(value.dailyRechargeLimitFen)));
      setReason('');
    } catch { setError(t('policy.updateUnknown')); await load(); }
    finally { setBusy(false); }
  };
  return <Surface className="admin-wallet-policy admin-risk-section" id="wallet-risk-policy">
    <div className="admin-risk-section-heading"><h2>{t('policy.title')}</h2></div>
    {error ? <p role="alert" className="admin-refunds-error">{error}</p> : null}
    {policy ? <>
      <dl>
        <div><dt>{t('policy.currentLimit')}</dt><dd>¥{formatFenAsYuan(BigInt(policy.dailyRechargeLimitFen))}</dd></div>
        <div><dt>{t('policy.rechargeState')}</dt><dd>{t(policy.rechargeEnabled ? 'policy.enabled' : 'policy.disabled')}</dd></div>
        <div><dt>{t('policy.version')}</dt><dd>{policy.version}</dd></div>
        <div><dt>{t('policy.lastReason')}</dt><dd>{policy.reason}</dd></div>
      </dl>
      {canConfigure ? <form className="admin-risk-policy-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <label>{t('policy.newLimit')}<Input inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
        <label>{t('policy.changeReason')}<Input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
        <Button type="submit" disabled={busy || !reason.trim()}>{t('policy.change')}</Button>
      </form> : null}
    </> : busy ? <p role="status">{t('shared.loading')}</p> : null}
  </Surface>;
}

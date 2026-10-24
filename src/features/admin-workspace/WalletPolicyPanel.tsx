import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Surface } from 'components/ui';

import { formatFenAsYuan, parseYuanToFen } from '@/features/wallet/amount';
import { parseWalletInteger } from '@/features/wallet/amount';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadWalletAdminAIPrice, loadWalletAdminDeepSeekPrice, loadWalletAdminPolicy, updateWalletAdminAIPrice,
  updateWalletAdminPolicy, type WalletAdminAIPrice, type WalletAdminDeepSeekPrice, type WalletAdminPolicy } from '@/services/domains/walletAdmin';

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
  return <><Surface className="admin-wallet-policy admin-risk-section" id="wallet-risk-policy">
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
  </Surface><RinAIPricePanel uid={uid} canConfigure={canConfigure} /></>;
}

function RinAIPricePanel({ uid, canConfigure }: { uid: string; canConfigure: boolean }) {
  const { t } = useFeatureTranslation('admin');
  const [policy, setPolicy] = useState<WalletAdminAIPrice | null>(null);
  const [provider, setProvider] = useState<WalletAdminDeepSeekPrice | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState('0');
  const [single, setSingle] = useState('0');
  const [daily, setDaily] = useState('0');
  const [calls, setCalls] = useState('10');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const value = await loadWalletAdminAIPrice();
      setPolicy(value);
      setEnabled(value.enabled);
      setPrice(value.priceSg);
      setSingle(value.singleLimitSg ?? '0');
      setDaily(value.dailyLimitSg ?? '0');
      setCalls(String(value.dailyCallsLimit ?? 10));
    } catch { setError(t('rinPrice.loadFailed')); }
    finally { setBusy(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadWalletAdminDeepSeekPrice().then(setProvider).catch(() => setProvider(null)); }, []);
  const save = async () => {
    if (!policy || !reason.trim() || busy) return;
    let parsedCalls: number;
    try {
      const amount = parseWalletInteger(price);
      const singleLimit = parseWalletInteger(single);
      const dailyLimit = parseWalletInteger(daily);
      parsedCalls = Number(calls);
      if (!Number.isSafeInteger(parsedCalls) || parsedCalls <= 0 || parsedCalls > 2147483647 ||
          amount > singleLimit || singleLimit > dailyLimit) throw new Error();
    } catch { setError(t('rinPrice.invalid')); return; }
    setBusy(true);
    setError('');
    try {
      const value = await updateWalletAdminAIPrice(uid, crypto.randomUUID(), {
        expectedVersion: policy.version, enabled, priceSg: price,
        singleLimitSg: single, dailyLimitSg: daily, dailyCallsLimit: parsedCalls,
        reason: reason.trim(),
      });
      setPolicy(value);
      setReason('');
    } catch { await load(); setError(t('rinPrice.updateUnknown')); }
    finally { setBusy(false); }
  };
  return <Surface className="admin-wallet-policy admin-risk-section" id="wallet-risk-ai-price">
    <div className="admin-risk-section-heading"><h2>{t('rinPrice.title')}</h2></div>
    {error ? <p role="alert" className="admin-refunds-error">{error}</p> : null}
    {policy ? <>
      <dl>
        <div><dt>{t('rinPrice.current')}</dt><dd>{policy.priceSg} SG</dd></div>
        <div><dt>{t('rinPrice.state')}</dt><dd>{t(policy.enabled ? 'rinPrice.enabled' : 'rinPrice.disabled')}</dd></div>
        <div><dt>{t('rinPrice.version')}</dt><dd>{policy.version}</dd></div>
        <div><dt>{t('rinPrice.reason')}</dt><dd>{policy.reason}</dd></div>
      </dl>
      <div className="admin-risk-section-heading"><h3>{t('rinPrice.providerTitle')}</h3></div>
      {provider?.latestPrices ? <>
        <p>{provider.stale || provider.status === 'error' ? t('rinPrice.providerStale') :
          provider.changedAt ? t('rinPrice.providerChanged') : t('rinPrice.providerCurrent')}</p>
        <div className="admin-rin-provider-table"><table><thead><tr><th>{t('rinPrice.providerMetric')}</th><th>{t('rinPrice.offPeak')}</th><th>{t('rinPrice.peak')}</th>
          {provider.previousPrices ? <><th>{t('rinPrice.previousOffPeak')}</th><th>{t('rinPrice.previousPeak')}</th></> : null}</tr></thead><tbody>
          {([
            ['input_cache_hit', 'rinPrice.inputCacheHit'],
            ['input_cache_miss', 'rinPrice.inputCacheMiss'],
            ['output', 'rinPrice.output'],
          ] as const).map(([metric, label]) => <tr key={metric}><th scope="row">{t(label)}</th>
            <td>${provider.latestPrices?.[`${metric}_off_peak`]}</td>
            <td>${provider.latestPrices?.[`${metric}_peak`]}</td>
            {provider.previousPrices ? <><td>${provider.previousPrices[`${metric}_off_peak`]}</td>
              <td>${provider.previousPrices[`${metric}_peak`]}</td></> : null}</tr>)}
        </tbody></table></div>
        <p>{t('rinPrice.providerUnit')} · {new Date(provider.checkedAt ?? provider.lastAttemptAt).toLocaleString()}</p>
      </> : <p>{t('rinPrice.providerUnavailable')}</p>}
      {canConfigure ? <form className="admin-risk-policy-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>{t('rinPrice.enable')}<input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></label>
        <label>{t('rinPrice.price')}<Input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label>{t('rinPrice.singleLimit')}<Input inputMode="numeric" value={single} onChange={(event) => setSingle(event.target.value)} /></label>
        <label>{t('rinPrice.dailyLimit')}<Input inputMode="numeric" value={daily} onChange={(event) => setDaily(event.target.value)} /></label>
        <label>{t('rinPrice.dailyCalls')}<Input inputMode="numeric" value={calls} onChange={(event) => setCalls(event.target.value)} /></label>
        <label>{t('rinPrice.changeReason')}<Input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
        <Button type="submit" disabled={busy || !reason.trim()}>{t('rinPrice.save')}</Button>
      </form> : null}
    </> : busy ? <p role="status">{t('shared.loading')}</p> : null}
  </Surface>;
}

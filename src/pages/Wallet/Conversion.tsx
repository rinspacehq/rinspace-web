import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'components/ui';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadWalletPolicy, previewWalletConversion, createWalletConversion, WalletCommandError } from '@/features/wallet/api';
import { convertBoundShangong, parsePositiveWalletInteger } from '@/features/wallet/amount';
import { readPendingConversion, savePendingConversion, clearPendingConversion, type PendingConversion } from '@/features/wallet/pendingConversion';
import type { WalletPublicPolicy } from '@/features/wallet/publicPolicy';
import type { WalletConversionPreview, WalletOperation } from '@/features/wallet/response';

type PolicyState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: WalletPublicPolicy };
const definiteRejections = new Set(['CONFIRMATION_STALE', 'INSUFFICIENT_AVAILABLE', 'DAILY_LIMIT', 'BALANCE_LIMIT', 'INVALID_AMOUNT', 'RATE_LIMITED']);

export default function WalletConversion({ uid }: { uid: string }) {
  const { t } = useFeatureTranslation('wallet');
  const [policy, setPolicy] = useState<PolicyState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [preview, setPreview] = useState<WalletConversionPreview | null>(null);
  const [pending, setPending] = useState<PendingConversion | null>(null);
  const [result, setResult] = useState<WalletOperation | null>(null);
  const [message, setMessage] = useState<'invalidConversion' | 'previewUnavailable' | 'conversionUnknown' | 'conversionRejected' | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    try { setPending(readPendingConversion(uid)); } catch { setStorageFailed(true); }
    return () => { active.current = false; controller.current?.abort(); };
  }, [uid]);
  useEffect(() => {
    let alive = true;
    const request = new AbortController();
    const timeout = window.setTimeout(() => request.abort(), 15000);
    setPolicy({ status: 'loading' });
    void loadWalletPolicy(request.signal).then(value => { if (alive) setPolicy({ status: 'ready', value }); })
      .catch(() => { if (alive) setPolicy({ status: 'error' }); });
    return () => { alive = false; clearTimeout(timeout); request.abort(); };
  }, [uid, revision]);

  async function showPreview() {
    if (lock.current || pending || storageFailed || policy.status !== 'ready' || !policy.value.conversion.enabled) return;
    try {
      const value = parsePositiveWalletInteger(quantity); convertBoundShangong(value);
      const maximum = policy.value.conversion.single_limit;
      if (!maximum || value > BigInt(maximum)) throw new Error('Amount exceeds limit');
    } catch { setMessage('invalidConversion'); return; }
    lock.current = true; setBusy(true); setMessage(null); setResult(null);
    const request = new AbortController(); controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 15000);
    try {
      const value = await previewWalletConversion(uid, crypto.randomUUID(), quantity, request.signal);
      if (active.current) setPreview(value);
    } catch { if (active.current) setMessage('previewUnavailable'); }
    finally { clearTimeout(timeout); lock.current = false; if (active.current) setBusy(false); }
  }
  async function submit(original?: PendingConversion) {
    if (lock.current || storageFailed || (!original && !preview)) return;
    if (!original && preview && Date.parse(preview.expires_at) <= Date.now()) { setPreview(null); setMessage('previewUnavailable'); return; }
    let identity: PendingConversion;
    try {
      if (original) identity = original;
      else if (preview) identity = { key: crypto.randomUUID(), preview: preview.preview_id };
      else return;
      // Persist BEFORE any money POST; storage failure blocks submission.
      savePendingConversion(uid, identity);
    } catch { setStorageFailed(true); return; }
    setPending(identity); setMessage(null); lock.current = true; setBusy(true);
    const request = new AbortController(); controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 15000);
    try {
      const value = await createWalletConversion(uid, identity.key, identity.preview, request.signal);
      if (!active.current) return;
      clearPendingConversion(uid, identity);
      setResult(value); setPending(null); setPreview(null); setQuantity('');
    } catch (error: unknown) {
      if (active.current) setMessage(error instanceof WalletCommandError && definiteRejections.has(error.code) ? 'conversionRejected' : 'conversionUnknown');
    } finally { clearTimeout(timeout); lock.current = false; if (active.current) setBusy(false); }
  }
  function resetRejected() {
    if (message !== 'conversionRejected' || !pending || busy) return;
    try { clearPendingConversion(uid, pending); setPending(null); setPreview(null); setMessage(null); setRevision(v => v + 1); }
    catch { setStorageFailed(true); }
  }

  return <section className="wallet-conversion">
    {storageFailed ? <p role="alert">{t('conversionStorageError')}</p> : <>
      {result && <section role="status" className="wallet-notice"><h2>{t('conversionCompleted')}</h2><code>{result.operation_id}</code><Link to="/wallet?view=statements">{t('views.statements')}</Link></section>}
      {message && <p role="alert">{t(message)}</p>}
      {pending ? <section className="wallet-notice"><h2>{t('conversionPending')}</h2><p>{t('conversionPendingHelp')}</p><code>{pending.key}</code>
        <Button disabled={busy} onClick={() => void submit(pending)}>{t(busy ? 'conversionSubmitting' : 'conversionRetryOriginal')}</Button>
        {message === 'conversionRejected' && <Button disabled={busy} onClick={resetRejected}>{t('conversionNewPreview')}</Button>}
      </section> : policy.status === 'loading' ? <p role="status">{t('loading')}</p> : policy.status === 'error' ? <section role="alert"><p>{t('unavailable')}</p><Button onClick={() => setRevision(v => v + 1)}>{t('retry')}</Button></section> : !policy.value.conversion.enabled ? <section className="wallet-notice"><h2>{t('notOpen')}</h2><Button disabled>{t('views.conversion')}</Button></section> : preview ? <section className="wallet-notice">
        <h2>{t('conversionConfirm')}</h2><p className="wallet-amount">{preview.bound_quantity} {t('bound')} → {preview.ordinary_quantity} {t('ordinary')}</p>
        <p>{t('conversionRemaining', { quantity: preview.remaining_bound })}</p>
        <Button disabled={busy} onClick={() => void submit()}>{t('conversionConfirm')}</Button>
        <Button disabled={busy} onClick={() => { setPreview(null); setMessage(null); }}>{t('conversionEdit')}</Button>
      </section> : <form className="wallet-filters" onSubmit={event => { event.preventDefault(); void showPreview(); }}>
        <label>{t('conversionQuantity')}<input inputMode="numeric" autoComplete="off" maxLength={19} value={quantity} disabled={busy} onChange={event => { setQuantity(event.target.value); setMessage(null); }} /></label>
        <Button type="submit" disabled={busy}>{t('conversionPreview')}</Button>
        <p>{t('conversionMaximum', { quantity: policy.value.conversion.single_limit })}</p>
      </form>}
    </>}
  </section>;
}

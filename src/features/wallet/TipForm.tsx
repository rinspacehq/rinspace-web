import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadWalletPolicy, previewWalletTip, createWalletTip, WalletCommandError } from './api';
import { parsePositiveWalletInteger } from './amount';
import { readPendingTip, savePendingTip, clearPendingTip, type PendingTip } from './pendingTip';
import type { WalletPublicPolicy } from './publicPolicy';
import type { WalletTipPreview, WalletOperation } from './response';
import './tip.css';

export interface TipTarget { readonly contentType: 'blog' | 'book'; readonly postID: string }
type PolicyState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: WalletPublicPolicy };
// Authentication/CSRF denial can happen BEFORE a previously committed command
// is looked up. It must not permit abandoning an unresolved original request.
const definiteRejections = new Set(['CONFIRMATION_STALE', 'INSUFFICIENT_AVAILABLE', 'DAILY_LIMIT', 'BALANCE_LIMIT', 'INVALID_AMOUNT', 'RATE_LIMITED', 'CONTENT_UNAVAILABLE', 'RECIPIENT_RESTRICTED']);

// Callers key by UID and content identity. No target means recovery only.
export default function TipForm({ uid, target, onCompleted }: { uid: string; target?: TipTarget; onCompleted?: () => void }) {
  const { t } = useFeatureTranslation('wallet');
  const [policy, setPolicy] = useState<PolicyState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [preview, setPreview] = useState<WalletTipPreview | null>(null);
  const [pending, setPending] = useState<PendingTip | null>(null);
  const [result, setResult] = useState<WalletOperation | null>(null);
  const [message, setMessage] = useState<'invalidTip' | 'previewUnavailable' | 'tipUnknown' | 'tipRejected' | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const contentType = target?.contentType, postID = target?.postID;
  useEffect(() => {
    active.current = true;
    try { setPending(readPendingTip(uid)); } catch { setStorageFailed(true); }
    return () => { active.current = false; controller.current?.abort(); };
  }, [uid]);
  useEffect(() => {
    if (!postID) return;
    let alive = true;
    const request = new AbortController();
    const timeout = window.setTimeout(() => request.abort(), 15000);
    setPolicy({ status: 'loading' });
    void loadWalletPolicy(request.signal).then(value => { if (alive) setPolicy({ status: 'ready', value }); })
      .catch(() => { if (alive) setPolicy({ status: 'error' }); });
    return () => { alive = false; clearTimeout(timeout); request.abort(); };
  }, [uid, postID, contentType, revision]);

  async function showPreview() {
    if (lock.current || pending || storageFailed || !target || policy.status !== 'ready' || !policy.value.tip.enabled) return;
    try {
      const value = parsePositiveWalletInteger(quantity);
      if (!policy.value.tip.single_limit || value > BigInt(policy.value.tip.single_limit)) throw new Error('Amount exceeds limit');
    } catch { setMessage('invalidTip'); return; }
    lock.current = true; setBusy(true); setMessage(null); setResult(null);
    const request = new AbortController(); controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 15000);
    try {
      const value = await previewWalletTip(uid, crypto.randomUUID(), target.contentType, target.postID, quantity, request.signal);
      if (active.current) setPreview(value);
    } catch { if (active.current) setMessage('previewUnavailable'); }
    finally { clearTimeout(timeout); lock.current = false; if (active.current) setBusy(false); }
  }
  async function submit(original?: PendingTip) {
    if (lock.current || storageFailed || (!original && !preview)) return;
    if (!original && preview && Date.parse(preview.expires_at) <= Date.now()) { setPreview(null); setMessage('previewUnavailable'); return; }
    let identity: PendingTip;
    try {
      if (original) identity = original;
      else if (preview) identity = { key: crypto.randomUUID(), preview: preview.preview_id };
      else return;
      savePendingTip(uid, identity); // Persist before the money POST.
    } catch { setStorageFailed(true); return; }
    setPending(identity); setMessage(null); lock.current = true; setBusy(true);
    const request = new AbortController(); controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 15000);
    try {
      const value = await createWalletTip(uid, identity.key, identity.preview, request.signal);
      if (!active.current) return;
      clearPendingTip(uid, identity);
      setResult(value); setPending(null); setPreview(null); setQuantity('');
	  onCompleted?.();
    } catch (error: unknown) {
      if (active.current) setMessage(error instanceof WalletCommandError && definiteRejections.has(error.code) ? 'tipRejected' : 'tipUnknown');
    } finally { clearTimeout(timeout); lock.current = false; if (active.current) setBusy(false); }
  }
  function resetRejected() {
    if (message !== 'tipRejected' || !pending || busy) return;
    try { clearPendingTip(uid, pending); setPending(null); setPreview(null); setMessage(null); setRevision(v => v + 1); }
    catch { setStorageFailed(true); }
  }
  if (!target && !pending && !result && !storageFailed) return null;
  return <section className="wallet-tip-form">
    {storageFailed ? <p role="alert">{t('conversionStorageError')}</p> : <>
      {result && <section role="status"><h2>{t('tipCompleted')}</h2><code>{result.operation_id}</code><Link to="/wallet?view=statements">{t('views.statements')}</Link></section>}
      {message && <p role="alert">{t(message)}</p>}
      {pending ? <section><h2>{t('tipPending')}</h2><p>{t('tipPendingHelp')}</p><code>{pending.key}</code>
        <Button disabled={busy} onClick={() => void submit(pending)}>{t(busy ? 'conversionSubmitting' : 'conversionRetryOriginal')}</Button>
        {message === 'tipRejected' && <Button disabled={busy} onClick={resetRejected}>{t('conversionNewPreview')}</Button>}
      </section> : !target || result ? null : policy.status === 'loading' ? <p role="status">{t('loading')}</p> : policy.status === 'error' ? <section role="alert"><p>{t('unavailable')}</p><Button onClick={() => setRevision(v => v + 1)}>{t('retry')}</Button></section> : !policy.value.tip.enabled ? <p>{t('notOpen')}</p> : preview ? <section>
        <h2>{t('tipConfirm')}</h2><p>{preview.content.title}</p><p>{t('tipRecipient', { name: preview.recipient.display_name })}</p><strong>{preview.quantity} {t('ordinary')}</strong>
        <p>{t('tipRule')}</p><div className="wallet-tip-actions"><Button disabled={busy} onClick={() => void submit()}>{t('tipConfirm')}</Button>
          <Button disabled={busy} onClick={() => { setPreview(null); setMessage(null); }}>{t('conversionEdit')}</Button></div>
      </section> : <form onSubmit={event => { event.preventDefault(); void showPreview(); }}>
        <label>{t('tipQuantity')}<input inputMode="numeric" autoComplete="off" maxLength={19} value={quantity} disabled={busy} onChange={event => { setQuantity(event.target.value); setMessage(null); }} /></label>
        <p>{t('tipMaximum', { quantity: policy.value.tip.single_limit })}</p><Button type="submit" disabled={busy}>{t('tipPreview')}</Button>
      </form>}
    </>}
  </section>;
}

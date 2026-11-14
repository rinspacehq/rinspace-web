import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, Switch } from 'components/ui';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { ServiceError } from '@/services/httpClient';
import {
  loadLearningAccess, loadLearningAdminConfig, saveLearningAccess, saveLearningAdminConfig,
  type LearningAccessPage, type LearningAdminConfig,
} from '@/services/domains/readerLearningAdmin';

/** Operator controls within the existing model administration page. Learners
 * keep their ordinary account and never configure their own budgets. */
export function ReaderLearningAdminPanel({ uid, canConfigure }: { uid: string; canConfigure: boolean }) {
  const { t } = useFeatureTranslation('admin');
  const [config, setConfig] = useState<LearningAdminConfig>();
  const [page, setPage] = useState<LearningAccessPage>({ items: [], nextAfter: null });
  const [enabled, setEnabled] = useState(false);
  const [inputTokens, setInputTokens] = useState('131072');
  const [outputTokens, setOutputTokens] = useState('32768');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    setConfig(undefined); setPage({ items: [], nextAfter: null }); setError(''); setSuccess('');
    setTarget(''); setExpiresAt(''); setAccessReason(''); setReason('');
    busyRef.current = false; setBusy(false);
    void Promise.all([loadLearningAdminConfig(abort.signal), loadLearningAccess(undefined, abort.signal)]).then(([value, accounts]) => {
      if (generation.current !== current) return;
      setConfig(value); setEnabled(value.enabled); setInputTokens(String(value.budget.inputTokens));
      setOutputTokens(String(value.budget.outputTokens)); setPage(accounts);
    }).catch(() => {
      if (generation.current !== current || abort.signal.aborted) return;
      setError(t('learningAdmin.loadFailed'));
    });
    return () => { generation.current = current + 1; abort.abort(); };
  }, [uid, reload, t]);

  async function mutate(action: () => Promise<void>) {
    if (!canConfigure || busyRef.current) return;
    const current = generation.current;
    busyRef.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      await action();
      if (generation.current === current) setSuccess(t('learningAdmin.saved'));
    } catch (cause) {
      if (generation.current === current) setError(t(cause instanceof ServiceError && cause.status === 409 ? 'learningAdmin.conflict' : 'learningAdmin.saveFailed'));
    } finally {
      if (generation.current === current) { busyRef.current = false; setBusy(false); }
    }
  }
  function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (!config) return;
    const current = generation.current;
    void mutate(async () => {
      const value = await saveLearningAdminConfig({ expectedVersion: config.version, enabled,
        budget: { inputTokens: Number(inputTokens), outputTokens: Number(outputTokens) }, reason: reason.trim() });
      if (generation.current !== current) return;
      setConfig(value); setEnabled(value.enabled); setInputTokens(String(value.budget.inputTokens));
      setOutputTokens(String(value.budget.outputTokens)); setReason('');
    });
  }
  function updateAccount(event: FormEvent) {
    event.preventDefault();
    const account = page.items.find(item => item.actor_uid === target.trim());
    const current = generation.current;
    void mutate(async () => {
      const item = await saveLearningAccess(target.trim(), { expectedVersion: account?.version || 0, enabled: true,
        expiresAt: new Date(expiresAt).toISOString(), reason: accessReason.trim() });
      if (generation.current !== current) return;
      // A newly added UID may sort outside this cursor page. Reload the server
      // page rather than constructing an invalid pagination boundary locally.
      const accounts = await loadLearningAccess();
      if (generation.current === current) { setPage(accounts); setTarget(item.actor_uid); setAccessReason(''); }
    });
  }
  const disabled = !canConfigure || busy;
  return <section aria-labelledby="reader-learning-admin-title">
    <div className="admin-agent-audit-heading">
      <h3 id="reader-learning-admin-title">{t('learningAdmin.title')}</h3>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>{t('shared.refresh')}</Button>
    </div>
    {error ? <p role="alert" className="admin-refunds-error">{error}</p> : null}
    {success ? <p role="status">{success}</p> : null}
    {config ? <>
      <form className="admin-risk-policy-form admin-agent-policy-form" onSubmit={saveConfiguration}>
        <Switch label={t('learningAdmin.enable')} checked={enabled} disabled={disabled} onCheckedChange={setEnabled} />
        <span role="status">{t(config.ready ? 'learningAdmin.ready' : 'learningAdmin.unavailable')}</span>
        <details><summary>{t('learningAdmin.advanced')}</summary>
          <div className="admin-risk-policy-form">
            <label>{t('learningAdmin.inputTokens')}<Input type="number" min={131072} max={1014784} step={1} value={inputTokens} disabled={disabled || !enabled} onChange={event => setInputTokens(event.currentTarget.value)} /></label>
            <label>{t('learningAdmin.outputTokens')}<Input type="number" min={32768} max={65536} step={1} value={outputTokens} disabled={disabled || !enabled} onChange={event => setOutputTokens(event.currentTarget.value)} /></label>
          </div>
        </details>
        <label>{t('learningAdmin.reason')}<Input value={reason} required maxLength={1000} disabled={disabled} onChange={event => setReason(event.currentTarget.value)} /></label>
        {canConfigure ? <Button type="submit" variant="primary" disabled={busy || !reason.trim()}>{t('shared.save')}</Button> : null}
      </form>
      <div className="admin-agent-audit-heading"><h4>{t('learningAdmin.accounts')}</h4></div>
      {page.items.length ? <div className="admin-rin-provider-table admin-agent-audit-table"><table aria-label={t('learningAdmin.accounts')}>
        <thead><tr><th>{t('learningAdmin.account')}</th><th>{t('learningAdmin.expires')}</th><th>{t('learningAdmin.state')}</th>{canConfigure ? <th>{t('shared.actions')}</th> : null}</tr></thead>
        <tbody>{page.items.map(item => <tr key={item.actor_uid}>
          <td>{item.actor_uid}</td><td>{item.valid_until ? new Date(item.valid_until).toLocaleString() : '—'}</td>
          <td>{t(item.enabled && Date.parse(item.valid_until || '') > Date.now() ? 'learningAdmin.active' : 'learningAdmin.inactive')}</td>
          {canConfigure ? <td><Button type="button" variant="secondary" disabled={busy} onClick={() => {
            setTarget(item.actor_uid); setExpiresAt(''); setAccessReason(''); setSuccess('');
          }}>{t('shared.edit')}</Button></td> : null}
        </tr>)}</tbody>
      </table></div> : null}
      {page.nextAfter ? <Button type="button" variant="secondary" disabled={busy} onClick={() => {
        const after = page.nextAfter!; const current = generation.current;
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError('');
        void loadLearningAccess(after).then(next => { if (generation.current === current) setPage(value => ({ items: [...value.items, ...next.items], nextAfter: next.nextAfter })); })
          .catch(() => { if (generation.current === current) setError(t('learningAdmin.loadFailed')); })
          .finally(() => { if (generation.current === current) { busyRef.current = false; setBusy(false); } });
      }}>{t('shared.loadMore')}</Button> : null}
      {canConfigure ? <form className="admin-risk-policy-form admin-agent-policy-form" onSubmit={updateAccount}>
        <label>{t('learningAdmin.account')}<Input value={target} required maxLength={256} disabled={busy} onChange={event => setTarget(event.currentTarget.value)} /></label>
        <label>{t('learningAdmin.expires')}<Input type="datetime-local" value={expiresAt} required disabled={busy} onChange={event => setExpiresAt(event.currentTarget.value)} /></label>
        <label>{t('learningAdmin.reason')}<Input value={accessReason} required maxLength={1000} disabled={busy} onChange={event => setAccessReason(event.currentTarget.value)} /></label>
        <Button type="submit" variant="primary" disabled={busy || !target.trim() || !accessReason.trim() || !expiresAt}>{t('learningAdmin.grant')}</Button>
        {page.items.find(item => item.actor_uid === target.trim())?.enabled ? <Button type="button" variant="secondary" disabled={busy || !accessReason.trim()} onClick={() => {
          const account = page.items.find(item => item.actor_uid === target.trim())!; const current = generation.current;
          void mutate(async () => {
            const item = await saveLearningAccess(account.actor_uid, { expectedVersion: account.version, enabled: false, reason: accessReason.trim() });
            if (generation.current === current) { setPage(value => ({ ...value, items: value.items.map(row => row.actor_uid === item.actor_uid ? item : row) })); setAccessReason(''); }
          });
        }}>{t('learningAdmin.revoke')}</Button> : null}
      </form> : null}
    </> : null}
  </section>;
}

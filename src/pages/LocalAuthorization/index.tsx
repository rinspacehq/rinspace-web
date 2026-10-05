import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button, Notice } from 'components/ui';
import SiteTopbar from '@/components/SiteTopbarShell';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { getCurrentAuthUser, type RinspaceUser } from '@/services/phoneAuth';
import { cancelledNativeCallback, confirmNativeAuthorization, nativeIssuer, parseNativeAuthorization } from '@/services/nativeClient';
import { requestAuthDialog } from '@/utils/authDialog';
import './authorization.css';

export default function LocalAuthorizationPage() {
  const { t, ready } = useFeatureTranslation('auth');
  const [request] = useState(() => window.location.origin === nativeIssuer ? parseNativeAuthorization(window.location.search) : null);
  const [user, setUser] = useState<RinspaceUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    try { setUser(await getCurrentAuthUser()); setError(false); }
    catch { setError(true); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    // The request remains in memory only. Refreshing asks the user to restart
    // from local, rather than persisting an authorization request in storage.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (request) void reload(); else setChecking(false);
    window.addEventListener('rinspace-session-changed', reload);
    return () => window.removeEventListener('rinspace-session-changed', reload);
  }, [request, reload]);
  const confirm = async () => {
    if (!request || busy) return;
    setBusy(true); setError(false);
    try { window.location.replace(await confirmNativeAuthorization(request)); }
    catch { setError(true); setBusy(false); }
  };
  return <><Helmet title={t('consent.title')}><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet><SiteTopbar onSessionChange={reload} />
    <main className="rin-local-authorization" aria-busy={checking || busy}>
      <h1>{t('consent.title')}</h1>
      {!ready || checking ? <p>{t('consent.checking')}</p> : !request ? <Notice tone="destructive">{t('consent.invalid')}</Notice> : <>
        <p>{t('consent.description')}</p>
        <Notice tone="warning" title={t('consent.realTitle')}>{t('consent.realData')}</Notice>
        <dl><dt>{t('consent.account')}</dt><dd>{user ? `${user.username || user.id} (${user.id})` : t('consent.anonymous')}</dd>
          <dt>{t('consent.client')}</dt><dd>rinspace-local-web</dd>
          <dt>{t('consent.callback')}</dt><dd><code>{request.redirectUri}</code></dd>
          <dt>{t('consent.scope')}</dt><dd>{t('consent.scopeDescription')}</dd></dl>
        <p>{t('consent.trust')}</p>
        {error ? <Notice tone="destructive">{t('consent.failed')}</Notice> : null}
        <div className="rin-local-authorization-actions">
          {user ? <Button type="button" variant="primary" pending={busy} onClick={() => { void confirm(); }}>{t('consent.allow')}</Button> : <Button type="button" onClick={requestAuthDialog}>{t('consent.login')}</Button>}
          <Button type="button" disabled={busy} onClick={() => window.location.replace(cancelledNativeCallback(request))}>{t('consent.cancel')}</Button>
          {error ? <Button type="button" onClick={() => { void reload(); }}>{t('consent.retry')}</Button> : null}
        </div>
      </>}
    </main></>;
}

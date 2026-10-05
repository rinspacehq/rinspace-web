import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form } from '@/components/ui/compat';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import {
  sendIdentityStepUpOtp,
  completeCloudBaseStepUp,
  listIdentityCredentials,
  listIdentityDevices,
  revokeAllIdentityDevices,
  revokeAllIdentityPersonalAccess,
  revokeIdentityCredential,
  revokeIdentityDevice,
  type IdentityDeviceSession,
  type IdentityPersonalCredential,
  type OtpChallenge,
} from '@/services/phoneAuth';
import './IdentitySecurityCenter.css';

type PendingAction = {
  purpose: string;
  target: string;
  challenge: OtpChallenge | null;
  label: string;
  run: (proof: string) => Promise<unknown>;
};

function validDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function IdentitySecurityCenter() {
  const { t } = useFeatureTranslation('settings');
  const [devices, setDevices] = useState<IdentityDeviceSession[]>([]);
  const [credentials, setCredentials] = useState<IdentityPersonalCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }), []);
  const formatDate = (value: string | undefined) => {
    const parsed = validDate(value);
    return parsed ? dateFormatter.format(parsed) : t('security.unknownTime');
  };

  const reload = useCallback(async () => {
    setError('');
    const [nextDevices, nextCredentials] = await Promise.all([
      listIdentityDevices(),
      listIdentityCredentials(),
    ]);
    setDevices(nextDevices);
    setCredentials(nextCredentials);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void reload().catch(() => {
      if (!cancelled) setError(t('security.loadFailed'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [reload, t]);

  const start = (purpose: string, target: string, label: string, run: PendingAction['run']) => {
    setError('');
    setNotice('');
    setCode('');
    setPhone('');
    setPending({ purpose, target, challenge: null, label, run });
  };

  const sendCode = async () => {
    if (!pending) return;
    setBusy('send-code');
    setError('');
    try {
      const challenge = await sendIdentityStepUpOtp(pending.purpose, pending.target, phone);
      setPending({ ...pending, challenge });
    } catch {
      setError(t('security.verificationStartFailed'));
    } finally {
      setBusy('');
    }
  };

  const finish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending?.challenge || !/^\d{6}$/.test(code)) return;
    setBusy('verification');
    setError('');
    try {
      const proof = await completeCloudBaseStepUp(pending.purpose, pending.target, pending.challenge, code);
      await pending.run(proof);
      const signsOut = pending.purpose === 'sessions_revoke_all' || pending.purpose === 'security_revoke_all' ||
        (pending.purpose === 'session_revoke' && devices.find((item) => item.sid === pending.target)?.current);
      setPending(null);
      setCode('');
      setNotice(t(signsOut ? 'security.signedOutComplete' : 'security.operationAccepted'));
      if (!signsOut) await reload();
    } catch {
      setError(t('security.operationFailed'));
    } finally {
      setBusy('');
    }
  };

  const activeDevices = devices.filter((item) => !item.revoked);
  const activeCredentials = credentials.filter((item) => item.state === 'active');

  return (
    <section className="panel settings-form identity-security-center" aria-labelledby="identity-security-heading">
      <div className="panel-heading large">
        <div>
          <span id="identity-security-heading">{t('security.heading')}</span>
          <strong>{t('security.caption')}</strong>
        </div>
        <Button type="button" disabled={loading || Boolean(busy)} onClick={() => void reload().catch(() => setError(t('security.loadFailed')))}>
          {t('security.refresh')}
        </Button>
      </div>

      {error ? <p className="identity-security-error" role="alert">{error}</p> : null}
      {notice ? <p className="identity-security-notice" role="status">{notice}</p> : null}
      {loading ? <p>{t('security.loading')}</p> : (
        <>
          <div className="identity-security-section">
            <div className="identity-security-title">
              <h3>{t('security.devices.heading')}</h3>
              <p>{t('security.devices.detail')}</p>
            </div>
            <ul className="identity-security-list" aria-label={t('security.devices.listLabel')}>
              {devices.map((device) => (
                <li key={device.sid} className="identity-security-row">
                  <div>
                    <strong>{device.clientLabel || t('security.devices.unknown')}</strong>
                    {device.current ? <span className="identity-security-current">{t('security.devices.current')}</span> : null}
                    <p>{t('security.createdAt', { value: formatDate(device.createdAt) })}</p>
                    <p>{t('security.lastActiveAt', { value: formatDate(device.lastActiveAt) })}</p>
                    <p>{device.cleanupComplete ? t('security.cleanupComplete') : t('security.cleanupPending')}</p>
                  </div>
                  {!device.revoked ? (
                    <Button type="button" disabled={Boolean(busy)} onClick={() => void start(
                      'session_revoke', device.sid,
                      device.current ? t('security.devices.revokeCurrent') : t('security.devices.revokeOne'),
                      (proof) => revokeIdentityDevice(device.sid, proof),
                    )}>
                      {device.current ? t('security.devices.revokeCurrent') : t('security.devices.revokeOne')}
                    </Button>
                  ) : <span>{t('security.revoked')}</span>}
                </li>
              ))}
            </ul>
            {activeDevices.length ? (
              <Button className="identity-security-danger" type="button" disabled={Boolean(busy)} onClick={() => void start(
                'sessions_revoke_all', 'all_sessions', t('security.devices.revokeAll'), revokeAllIdentityDevices,
              )}>{t('security.devices.revokeAll')}</Button>
            ) : null}
          </div>

          <div className="identity-security-section">
            <div className="identity-security-title">
              <h3>{t('security.credentials.heading')}</h3>
              <p>{t('security.credentials.detail')}</p>
            </div>
            {credentials.length ? (
              <ul className="identity-security-list" aria-label={t('security.credentials.listLabel')}>
                {credentials.map((credential) => (
                  <li key={credential.ref} className="identity-security-row">
                    <div>
                      <strong>{credential.label || `${credential.provider} ${credential.kind}`}</strong>
                      <span>{credential.provider} · {credential.kind}</span>
                      <p>{t('security.createdAt', { value: formatDate(credential.createdAt) })}</p>
                      <p>{t('security.lastUsedAt', { value: formatDate(credential.lastUsedAt) })}</p>
                      <p>{credential.scopes.length ? credential.scopes.join(', ') : t('security.credentials.unknownScope')}</p>
                    </div>
                    {credential.state === 'active' ? (
                      <Button type="button" disabled={Boolean(busy)} onClick={() => void start(
                        'credential_revoke', credential.ref, t('security.credentials.revokeOne'),
                        (proof) => revokeIdentityCredential(credential.ref, proof),
                      )}>{t('security.credentials.revokeOne')}</Button>
                    ) : <span>{t('security.revoked')}</span>}
                  </li>
                ))}
              </ul>
            ) : <p>{t('security.credentials.empty')}</p>}
            {activeCredentials.length ? (
              <Button className="identity-security-danger" type="button" disabled={Boolean(busy)} onClick={() => void start(
                'security_revoke_all', 'all_personal_access', t('security.credentials.revokeAll'), revokeAllIdentityPersonalAccess,
              )}>{t('security.credentials.revokeAll')}</Button>
            ) : null}
            <p className="settings-scope-note">{t('security.credentials.revokeAllImpact')}</p>
          </div>
        </>
      )}

      {pending ? (
        <div className="auth-dialog-backdrop" role="presentation">
          <Form className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="identity-step-up-title" onSubmit={finish}>
            <div className="auth-dialog-head">
              <div><span>{t('security.verification.caption')}</span><h2 id="identity-step-up-title">{pending.label}</h2></div>
            </div>
            <p>{t('security.verification.detail')}</p>
            <Form.Group controlId="identity-step-up-phone">
              <Form.Label>{t('security.verification.phone')}</Form.Label>
              <Form.Control id="identity-step-up-phone" inputMode="tel" autoComplete="tel-national" maxLength={11} value={phone} onChange={(event) => setPhone(event.currentTarget.value.replace(/\D/g, '').slice(0, 11))} disabled={Boolean(pending.challenge)} />
            </Form.Group>
            {!pending.challenge ? <Button type="button" disabled={Boolean(busy) || !/^1[0-9]{10}$/.test(phone)} onClick={() => void sendCode()}>{busy === 'send-code' ? t('security.verification.sending') : t('security.verification.send')}</Button> : null}
            <Form.Group controlId="identity-step-up-code">
              <Form.Label>{t('security.verification.code')}</Form.Label>
              <Form.Control id="identity-step-up-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
            </Form.Group>
            <div className="auth-dialog-actions">
              <Button className="auth-dialog-link" type="button" disabled={Boolean(busy)} onClick={() => setPending(null)}>{t('security.verification.cancel')}</Button>
              <Button type="submit" disabled={busy === 'verification' || !pending.challenge || code.length !== 6}>{busy === 'verification' ? t('security.verification.working') : t('security.verification.confirm')}</Button>
            </div>
          </Form>
        </div>
      ) : null}
    </section>
  );
}

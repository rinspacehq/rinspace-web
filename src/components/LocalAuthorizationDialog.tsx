import { useEffect, useState } from 'react';
import { Button, Dialog, DialogContent, Notice } from 'components/ui';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { beginLocalAuthorization, cancelLocalAuthorization } from '@/services/nativeClient';

export default function LocalAuthorizationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useFeatureTranslation('auth');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (!open) { setBusy(false); setError(false); } }, [open]);
  const start = async () => {
    setBusy(true); setError(false);
    try {
      // Same-tab navigation avoids popup permission requirements. The callback
      // returns to this local app; HMR and ordinary reloads preserve the SID.
      window.location.assign(await beginLocalAuthorization());
    } catch { setError(true); setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    void cancelLocalAuthorization().then(onClose).catch(() => { setError(true); });
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}><DialogContent
    title={t('local.title')} description={t('local.description')} showCloseButton={!busy}>
    <Notice tone="warning">{t('local.realData')}</Notice>
    {error ? <Notice tone="destructive">{t('local.unavailable')}</Notice> : null}
    <p><Button type="button" variant="primary" pending={busy} onClick={() => { void start(); }}>{t('local.openOfficial')}</Button></p>
  </DialogContent></Dialog>;
}

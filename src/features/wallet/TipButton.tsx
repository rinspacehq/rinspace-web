import { useCallback, useEffect, useState } from 'react';
import { AnimateButton, Button, Dialog, DialogContent, DialogTrigger, Icon } from '@/components/ui';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { requestAuthDialog } from '@/utils/authDialog';
import { loadWalletTipperCount } from './api';
import { useWalletSession } from './useWalletSession';
import TipForm, { type TipTarget } from './TipForm';

function SessionTip({ target, onCompleted }: { target: TipTarget; onCompleted(): void }) {
  const { t } = useFeatureTranslation('wallet');
  const { session, retry } = useWalletSession();
  if (session.status === 'loading') return <p role="status">{t('loading')}</p>;
  if (session.status === 'anonymous') return <Button onClick={requestAuthDialog}>{t('signIn')}</Button>;
  if (session.status === 'error') return <section role="alert"><p>{t('unavailable')}</p><Button onClick={retry}>{t('retry')}</Button></section>;
  return <TipForm key={`${session.uid}:${target.contentType}:${target.postID}`} uid={session.uid} target={target} onCompleted={onCompleted} />;
}
export default function TipButton({ target, showLabel = true }: { target: TipTarget; showLabel?: boolean }) {
  const { t, ready } = useFeatureTranslation('wallet');
  const locale = useResolvedLocale();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const loadCount = useCallback(() => {
    const request = new AbortController();
    void loadWalletTipperCount(target.contentType, target.postID, request.signal)
      .then(setCount)
      .catch(() => undefined);
    return request;
  }, [target.contentType, target.postID]);
  useEffect(() => {
    const request = loadCount();
    return () => request.abort();
  }, [loadCount]);
  if (!/^[1-9][0-9]*$/.test(target.postID)) return null;
  if (!ready) {
    return <span className="wallet-tip-trigger wallet-tip-trigger-placeholder" aria-hidden="true">
      <Icon name="gift" />
      <strong className="detail-action-count wallet-tip-count" />
      {showLabel ? <span className="wallet-tip-label" /> : null}
    </span>;
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><AnimateButton unstyled className="wallet-tip-trigger" aria-label={count === null ? t('tipAction') : t('tipActionCount', { count, displayCount: formatNumber(locale, count) })}><Icon name="gift" /><strong className="detail-action-count wallet-tip-count" data-loading={count === null ? 'true' : undefined}>{count === null ? '\u00a0' : formatNumber(locale, count)}</strong>{showLabel ? <span className="wallet-tip-label">{t('tipAction')}</span> : null}</AnimateButton></DialogTrigger>
    <DialogContent title={t('tipAction')} className="wallet-tip-dialog">
      {open && <SessionTip target={target} onCompleted={() => { loadCount(); }} />}
    </DialogContent>
  </Dialog>;
}

import { AnimateButton, SplittingText } from 'components/ui';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

import {
  clearCapturedPwaInstallPrompt,
  getCapturedPwaInstallPrompt,
  startPwaInstallPromptCapture,
  subscribeToPwaInstallPrompt,
} from '@/services/pwaInstallPrompt';

type InstallState = 'preparing' | 'ready' | 'installing' | 'accepted' | 'installed' | 'dismissed' | 'unsupported' | 'unavailable';

startPwaInstallPromptCapture();

function isStandaloneDisplay() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true;
}

function isSupportedAndroidBrowser(userAgent = navigator.userAgent) {
  if (!/Android/i.test(userAgent)) return false;
  if (/(?:\bwv\b|MQQBrowser\/|QQ\/|MicroMessenger\/)/i.test(userAgent)) return false;
  if (/EdgA\//i.test(userAgent)) return true;
  return /Chrome\//i.test(userAgent) && !/(?:EdgA|OPR|Opera|SamsungBrowser)\//i.test(userAgent);
}

function AndroidIcon() {
  return (
    <svg aria-hidden="true" className="download-android-icon" viewBox="0 0 152 89" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#34A853"
        d="M151.025 85.224q-.071-.464-.147-.92a75.665 75.665 0 0 0-7.546-22.597 76.5 76.5 0 0 0-5.511-8.995 76 76 0 0 0-8.322-9.808 76.034 76.034 0 0 0-13.398-10.626q.042-.074.085-.148 2.286-3.948 4.572-7.897l4.47-7.712a3946 3946 0 0 0 3.208-5.54q.38-.658.604-1.355a6.97 6.97 0 0 0-.652-5.702 6.9 6.9 0 0 0-2.406-2.398 7 7 0 0 0-2.954-.95 7 7 0 0 0-2.376.206 6.93 6.93 0 0 0-4.22 3.227q-1.606 2.77-3.208 5.54l-4.47 7.712c-1.523 2.634-3.05 5.263-4.573 7.897q-.25.43-.5.865c-.232-.092-.46-.184-.692-.272-8.398-3.205-17.511-4.958-27.036-4.958q-.39-.001-.78.004A75.7 75.7 0 0 0 50.977 25q-1.317.46-2.608.968-.234-.404-.467-.806-2.286-3.95-4.573-7.897l-4.47-7.713a4385 4385 0 0 1-3.208-5.54A6.93 6.93 0 0 0 29.055.58a6.9 6.9 0 0 0-2.954.95 6.92 6.92 0 0 0-3.157 4.185 6.96 6.96 0 0 0 .703 5.27l3.208 5.54 4.47 7.713c1.523 2.634 3.05 5.263 4.573 7.897.01.022.025.044.036.066a76.3 76.3 0 0 0-13.527 10.711 76.5 76.5 0 0 0-8.322 9.808 75.4 75.4 0 0 0-5.51 8.995 75.7 75.7 0 0 0-7.546 22.597 76.038 76.038 0 0 0-.581 4.247h151a77 77 0 0 0-.434-3.327z"
      />
      <path
        fill="#202124"
        d="M115.225 67.663c3.022-2.012 3.461-6.668.981-10.4-2.48-3.73-6.939-5.123-9.96-3.11-3.021 2.012-3.46 6.668-.98 10.4 2.479 3.73 6.938 5.123 9.959 3.11M46.762 64.564c2.48-3.73 2.04-8.387-.98-10.4-3.022-2.012-7.481-.619-9.96 3.112s-2.041 8.387.98 10.4 7.48.62 9.96-3.112"
      />
    </svg>
  );
}

function ExplorePreview() {
  const { t } = useTranslation('common');
  return (
    <div className="download-device" aria-label={t('download.previewLabel')}>
      <div className="download-device-sensor" aria-hidden="true" />
      <div className="download-device-screen">
        <img alt={t('download.previewAlt')} className="download-explore-screenshot" src="/assets/download/rinspace-inner-explore-mobile.png" />
      </div>
    </div>
  );
}

export default function DownloadPage() {
  const { t } = useTranslation('common');
  const reducedMotion = useReducedMotion();
  const installPrompt = useSyncExternalStore(subscribeToPwaInstallPrompt, getCapturedPwaInstallPrompt, () => null);
  const supportedBrowser = isSupportedAndroidBrowser();
  const [installState, setInstallState] = useState<InstallState>(() => {
    if (isStandaloneDisplay()) return 'installed';
    if (!supportedBrowser) return 'unsupported';
    return installPrompt ? 'ready' : 'preparing';
  });

  useEffect(() => {
    if (!supportedBrowser || !installPrompt) return;
    setInstallState((current) => (current === 'installed' || current === 'accepted' || current === 'installing' ? current : 'ready'));
  }, [installPrompt, supportedBrowser]);

  useEffect(() => {
    const handleInstalled = () => {
      if (!supportedBrowser) return;
      clearCapturedPwaInstallPrompt();
      setInstallState((current) => (current === 'installed' ? current : 'accepted'));
    };
    window.addEventListener('appinstalled', handleInstalled);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'module' }).catch(() => {
        setInstallState((current) => (current === 'installed' || current === 'accepted' || current === 'unsupported' || current === 'ready' || current === 'installing' ? current : 'unavailable'));
      });
    }
    return () => {
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [supportedBrowser]);

  const install = useCallback(async () => {
    if (installState === 'installed') {
      window.location.assign('/explore?world=inner');
      return;
    }
    const prompt = installPrompt;
    if (!prompt) {
      setInstallState('preparing');
      return;
    }
    setInstallState('installing');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      clearCapturedPwaInstallPrompt(prompt);
      setInstallState((current) => {
        if (current === 'installed' || current === 'accepted') return current;
        return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      });
    } catch (error: unknown) {
      console.error('Rinspace installation prompt failed', error);
      setInstallState('unavailable');
    }
  }, [installPrompt, installState]);

  const buttonLabel =
    installState === 'installed'
      ? t('download.openRinspace')
      : installState === 'accepted'
        ? t('download.checkHomeScreen')
        : installState === 'installing'
          ? t('download.installing')
          : t('download.installRinspace');
  const statusMessage =
    installState === 'unsupported'
      ? t('download.unsupported')
      : installState === 'unavailable'
        ? t('download.unavailable')
        : installState === 'dismissed'
          ? t('download.dismissed')
          : installState === 'accepted'
            ? t('download.accepted')
            : installState === 'installed'
              ? t('download.installed')
              : installState === 'ready'
                ? t('download.ready')
                : t('download.permissionHint');
  const installDisabled = installState === 'preparing' || installState === 'installing' || installState === 'accepted' || installState === 'unsupported' || installState === 'dismissed' || installState === 'unavailable';

  return (
    <main className="download-page">
      <Helmet title={t('routes.download')} />
      <section className="download-hero">
        <motion.div
          className="download-copy"
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reducedMotion ? 0 : 0.32,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <p className="download-eyebrow">RINSPACE · ANDROID</p>
          <h1>
            <SplittingText
              text={t('download.title')}
              type="words"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              stagger={reducedMotion ? 0 : 0.08}
              disableAnimation={Boolean(reducedMotion)}
            />
          </h1>
          <p className="download-description">{t('download.description')}</p>
          <AnimateButton className="download-install-button" disabled={installDisabled} leadingIcon={<AndroidIcon />} onClick={() => void install()} size="lg" variant="primary">
            {buttonLabel}
          </AnimateButton>
          <p className="download-install-status" aria-live="polite">
            {statusMessage}
          </p>
        </motion.div>
        <motion.div
          className="download-preview"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.96, x: 18 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{
            delay: reducedMotion ? 0 : 0.08,
            duration: reducedMotion ? 0 : 0.38,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <ExplorePreview />
        </motion.div>
      </section>
      <footer className="download-android-attribution">
        <a href="https://developer.android.com/distribute/marketing-tools/brand-guidelines" rel="noreferrer" target="_blank">
          {t('download.androidAttribution')}
        </a>
      </footer>
    </main>
  );
}

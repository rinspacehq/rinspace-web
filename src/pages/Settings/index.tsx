import { useNoticeToasts } from 'components/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import LoadingState from '@/components/LoadingState';
import CodeRecoveryCenter from '@/components/CodeRecoveryCenter';
import IdentitySecurityCenter from '@/components/IdentitySecurityCenter';
import { i18n, normalizeLanguagePreference } from '@/i18n';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { PersistedLanguagePreference } from '@/i18n/types';
import { loadCurrentUserInfo, updateUserInterfaceConfig } from '@/services/domains/identity';
import type { CurrentUserInfo } from '@/services/contracts';
import './settings.css';

function SettingsPage() {
  const { t, ready } = useFeatureTranslation('settings');
  const {
    preference,
    preparePreference,
    commitPreparedPreference,
    syncAccountPreference,
  } = useLanguage();
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo | null>(null);
  const [language, setLanguage] = useState<PersistedLanguagePreference>(preference);
  const [colorScheme, setColorScheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [savingInterface, setSavingInterface] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const info = await loadCurrentUserInfo();
    setCurrentUser(info);
    if (!info) {
      setCurrentUser(null);
      return;
    }

    const accountPreference = normalizeLanguagePreference(info.language);
    setLanguage(accountPreference);
    await syncAccountPreference(info.language);
    setColorScheme(info.color_scheme || 'light');
  }, [syncAccountPreference]);

  useNoticeToasts({
    error, notice,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotice('');
    void reload()
      .catch((loadError) => {
        console.error('Failed to load Settings', loadError);
        if (!cancelled) setError(i18n.t('errors:interface.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const saveInterface = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingInterface(true);
    setError('');
    setNotice('');
    try {
      const prepared = await preparePreference(language, ['settings']);
      const nextConfig = await updateUserInterfaceConfig({
        language: prepared.preference,
        colorScheme,
      });
      const accountPreference = normalizeLanguagePreference(nextConfig.language);
      setLanguage(accountPreference);
      setColorScheme(nextConfig.colorScheme);
      await commitPreparedPreference({ ...prepared, preference: accountPreference });
      setNotice(t('interface.saved'));
    } catch (interfaceError) {
      console.error('Failed to save interface settings', interfaceError);
      setError(t('errors:interface.saveFailed'));
    } finally {
      setSavingInterface(false);
    }
  };

  return (
    <>
      <Helmet title={t('pageTitle')} />
      <SiteTopbar />

      <main className="settings-shell">
        <h1 className="rin-visually-hidden">{t('title')}</h1>

        {loading || !ready ? (
          <LoadingState variant="panel" />
        ) : !currentUser ? (
          <section className="panel settings-login-panel">
            <div className="panel-heading">
              <span>{t('signedOut')}</span>
              <strong>{t('visitor')}</strong>
            </div>
            <p />
            <Link className="primary-link-button" to="/#login">{t('signIn')}</Link>
          </section>
        ) : (
          <section className="settings-main">
            <Form className="panel settings-form" onSubmit={saveInterface}>
              <div className="panel-heading large">
                <div>
                  <span>{t('interface.heading')}</span>
                  <strong>{t('interface.caption')}</strong>
                </div>
              </div>
              <div className="settings-two-column">
                <Form.Group controlId="settings-language">
                  <Form.Label>{t('interface.language')}</Form.Label>
                  <Form.Select id="settings-language" value={language} onChange={(event) => setLanguage(normalizeLanguagePreference(event.currentTarget.value))}>
                    {(['system', 'zh-CN', 'en'] as const).map((option) => (
                      <option value={option} key={option}>{t(`language.${option}`)}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Form.Group controlId="settings-color-scheme">
                  <Form.Label>{t('interface.displayMode')}</Form.Label>
                  <Form.Select id="settings-color-scheme" value={colorScheme} onChange={(event) => setColorScheme(event.currentTarget.value)}>
                    {(['light', 'dark', 'system'] as const).map((option) => (
                      <option value={option} key={option}>{t(`colorScheme.${option}`)}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="composer-actions">
                <Button className="primary-button" type="submit" disabled={savingInterface}>
                  {savingInterface ? t('interface.saving') : t('interface.save')}
                </Button>
              </div>
            </Form>

            <IdentitySecurityCenter />

            <CodeRecoveryCenter />
          </section>
        )}
      </main>
    </>
  );
}

export default SettingsPage;

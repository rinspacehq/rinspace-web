import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ensureLocaleNamespaces, hasLocaleNamespace } from './index';
import { useOptionalLanguage } from './LanguageProvider';
import { resolveLocale } from './resolveLocale';
import type { TranslationNamespace } from './types';

export function useFeatureTranslation(namespace: TranslationNamespace) {
  const language = useOptionalLanguage();
  const translation = useTranslation(namespace);
  const resolvedLocale = language?.resolvedLocale
    ?? resolveLocale(translation.i18n.resolvedLanguage || translation.i18n.language, []);
  const [ready, setReady] = useState(() => hasLocaleNamespace(resolvedLocale, namespace));

  useEffect(() => {
    let active = true;
    if (hasLocaleNamespace(resolvedLocale, namespace)) {
      setReady(true);
      return undefined;
    }
    setReady(false);
    void ensureLocaleNamespaces(resolvedLocale, [namespace])
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error: unknown) => {
        console.error(`Failed to load ${namespace} translations`, error);
      });
    return () => {
      active = false;
    };
  }, [namespace, resolvedLocale]);

  return { ...translation, ready };
}

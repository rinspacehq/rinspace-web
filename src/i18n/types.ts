export const localeIds = ['zh-CN', 'en'] as const;

export type LocaleId = (typeof localeIds)[number];

export const translationNamespaces = [
  'common',
  'navigation',
  'auth',
  'discovery',
  'reader',
  'creation',
  'creator',
  'identity',
  'admin',
  'settings',
  'wallet',
  'legal',
  'errors',
] as const;

export type TranslationNamespace = (typeof translationNamespaces)[number];

export type LanguagePreference = 'system' | LocaleId;
export type PersistedLanguagePreference = 'system' | string;

export const coreTranslationNamespaces = [
  'common',
  'navigation',
  'auth',
  'errors',
] as const satisfies readonly TranslationNamespace[];

import type { LocaleId, TranslationNamespace } from './types';
import enAuth from './resources/en/auth.json';
import enCommon from './resources/en/common.json';
import enErrors from './resources/en/errors.json';
import enNavigation from './resources/en/navigation.json';
import zhAuth from './resources/zh-CN/auth.json';
import zhCommon from './resources/zh-CN/common.json';
import zhErrors from './resources/zh-CN/errors.json';
import zhNavigation from './resources/zh-CN/navigation.json';

type TranslationResource = Record<string, unknown>;
type TranslationResourceModule = { default: TranslationResource };
type ResourceLoader = () => Promise<TranslationResourceModule>;

export type LocaleMetadata = Readonly<{
  id: LocaleId;
  nativeName: string;
  fallbackLocale: LocaleId;
}>;

export const localeRegistry: Readonly<Record<LocaleId, LocaleMetadata>> = {
  'zh-CN': { id: 'zh-CN', nativeName: '简体中文', fallbackLocale: 'en' },
  en: { id: 'en', nativeName: 'English', fallbackLocale: 'en' },
};

export const bundledCoreResources = {
  'zh-CN': {
    common: zhCommon,
    navigation: zhNavigation,
    auth: zhAuth,
    errors: zhErrors,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    auth: enAuth,
    errors: enErrors,
  },
} as const;

const resourceLoaders: Record<LocaleId, Record<TranslationNamespace, ResourceLoader>> = {
  'zh-CN': {
    common: async () => ({ default: zhCommon }),
    navigation: async () => ({ default: zhNavigation }),
    auth: async () => ({ default: zhAuth }),
    discovery: () => import('./resources/zh-CN/discovery.json'),
    reader: () => import('./resources/zh-CN/reader.json'),
    creation: () => import('./resources/zh-CN/creation.json'),
    creator: () => import('./resources/zh-CN/creator.json'),
    identity: () => import('./resources/zh-CN/identity.json'),
    admin: () => import('./resources/zh-CN/admin.json'),
    settings: () => import('./resources/zh-CN/settings.json'),
    wallet: () => import('./resources/zh-CN/wallet.json'),
    legal: () => import('./resources/zh-CN/legal.json'),
    errors: async () => ({ default: zhErrors }),
  },
  en: {
    common: async () => ({ default: enCommon }),
    navigation: async () => ({ default: enNavigation }),
    auth: async () => ({ default: enAuth }),
    discovery: () => import('./resources/en/discovery.json'),
    reader: () => import('./resources/en/reader.json'),
    creation: () => import('./resources/en/creation.json'),
    creator: () => import('./resources/en/creator.json'),
    identity: () => import('./resources/en/identity.json'),
    admin: () => import('./resources/en/admin.json'),
    settings: () => import('./resources/en/settings.json'),
    wallet: () => import('./resources/en/wallet.json'),
    legal: () => import('./resources/en/legal.json'),
    errors: async () => ({ default: enErrors }),
  },
};

export async function loadLocaleResource(
  locale: LocaleId,
  namespace: TranslationNamespace,
): Promise<TranslationResource> {
  return (await resourceLoaders[locale][namespace]()).default;
}

/**
 * Server-side i18next instance.
 *
 * `i18n/config` installs `react-i18next`, which imports `createContext` — not
 * available in the React Server Components bundle, so a server component that
 * merely needs `getFixedT` must not import that module. This instance shares
 * the same bundled dictionaries and options but has no React plugin.
 *
 * Each language is served by its own immutable translator, so concurrent
 * requests cannot leak a language into one another.
 */

import i18next, { type i18n as I18nInstance } from 'i18next';

import { DEFAULT_LANGUAGE } from 'i18n/languages';
import { NAMESPACE_LIST, resources } from 'i18n/resources';

const serverInstances = new Map<string, I18nInstance>();

export function getServerI18n(language: string = DEFAULT_LANGUAGE): I18nInstance {
  const cached = serverInstances.get(language);
  if (cached) return cached;

  const instance = i18next.createInstance();
  instance.init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: [...NAMESPACE_LIST],
    defaultNS: 'common',
    resources,
    interpolation: { escapeValue: false },
    initImmediate: false,
    returnEmptyString: false,
  });

  serverInstances.set(language, instance);
  return instance;
}

export function getServerTranslator(language: string, namespace = 'common') {
  return getServerI18n(language).getFixedT(language, namespace);
}

/**
 * i18next bootstrap.
 *
 * Two rules keep this portal safe:
 *   1. It always boots in English. Every page is prerendered with English copy,
 *      so the first client render must match it — Sinhala is applied in an
 *      effect after mount instead (see LanguageProvider), which is what lets
 *      the language persist across refresh without a hydration mismatch.
 *   2. The dictionaries are bundled, so `t()` is synchronously correct from the
 *      very first call; nothing is fetched at runtime.
 */

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, LOCALE_TAGS, SUPPORTED_LANGUAGES, type AppLanguage } from 'i18n/languages';
import { NAMESPACE_LIST, resources } from 'i18n/resources';

const options = {
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: [...NAMESPACE_LIST],
  defaultNS: 'common',
  resources,
  // React already escapes rendered text; double-escaping would show &amp; in labels.
  interpolation: { escapeValue: false },
  // Bundled dictionaries: resolve keys synchronously so the first paint has copy.
  initImmediate: false,
  // An empty string is a valid translation, but never render the raw key.
  returnEmptyString: false,
};

// Next re-evaluates modules on hot reload; a second init would re-emit events.
if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init(options);
}

export const i18n = i18next;

/** The language as i18next currently knows it, normalised to 'en' | 'si'. */
export function currentLanguage(): AppLanguage {
  const raw = i18next.language || DEFAULT_LANGUAGE;
  const base = String(raw).toLowerCase().split(/[-_]/)[0];
  return base === 'si' ? 'si' : DEFAULT_LANGUAGE;
}

/** BCP 47 tag for Intl: 'en-LK' or 'si-LK'. Never changes the stored values. */
export function currentLocaleTag(): string {
  return LOCALE_TAGS[currentLanguage()];
}

export default i18next;

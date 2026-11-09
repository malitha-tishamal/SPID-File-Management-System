/**
 * The two languages the portal speaks, and where the choice is remembered.
 *
 * English is the default everywhere: the build, the first render, and any value
 * that cannot be read. Sinhala is stored per browser, so it survives a refresh,
 * a navigation, and a sign-out, and a signed-in officer who returns finds the
 * portal in the language they left it in.
 */

export const SUPPORTED_LANGUAGES = ['en', 'si'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

/** One key for the whole app; the switcher and the provider both use it. */
export const LANGUAGE_STORAGE_KEY = 'spid.ui.language';

/**
 * Same choice in a cookie, so the server can render the first paint in the
 * officer's language instead of English. localStorage alone is invisible to
 * the server, which is what used to cause the flash on refresh.
 */
export const LANGUAGE_COOKIE_KEY = 'spid.ui.language';

const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Language names are always shown in their own language — that is what lets an
 * officer who cannot read English find "සිංහල" in the switcher.
 */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  si: 'සිංහල',
};

/** Short codes for the compact switcher. */
export const LANGUAGE_CODES: Record<AppLanguage, string> = {
  en: 'EN',
  si: 'සිං',
};

/** BCP 47 tags for Intl, document lang, and date/number formatting. */
export const LOCALE_TAGS: Record<AppLanguage, string> = {
  en: 'en-LK',
  si: 'si-LK',
};

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Normalises anything the browser may hold ('si-LK', 'en_US', null). */
export function resolveLanguage(value: string | null | undefined): AppLanguage {
  if (!value) return DEFAULT_LANGUAGE;
  const base = String(value).trim().toLowerCase().split(/[-_]/)[0];
  return base === 'si' ? 'si' : DEFAULT_LANGUAGE;
}

/** Safe on the server and in private mode: both fall back to English. */
export function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const fromStorage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (fromStorage) return resolveLanguage(fromStorage);
    return resolveLanguage(readLanguageCookie());
  } catch {
    return resolveLanguage(readLanguageCookie());
  }
}

/** Reads the language cookie; '' on the server or when it is absent. */
export function readLanguageCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE_KEY}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : '';
}

export function storeLanguage(language: AppLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // A full or blocked storage should not stop the language from switching.
  }
  try {
    document.cookie = `${LANGUAGE_COOKIE_KEY}=${encodeURIComponent(language)}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Cookies can be blocked too; the choice still applies for this session.
  }
}

/** Keeps <html lang> truthful for screen readers and browser spell-check. */
export function applyDocumentLanguage(language: AppLanguage): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LOCALE_TAGS[language];
}

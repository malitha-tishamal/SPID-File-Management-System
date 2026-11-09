'use client';

/**
 * Owns the runtime language choice.
 *
 * The dictionaries boot in English so the prerendered HTML and the first client
 * render agree; this provider then applies the remembered language before the
 * browser paints (layout effect), so an officer who chose සිංහල never sees a
 * flash of English and no route reloads. Switching calls `changeLanguage`, which
 * re-renders the tree in place — state, scroll position and open modals survive.
 */

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { setUiDisplayLanguage } from 'lib/datetime';
import { i18n } from 'i18n/config';
import {
  DEFAULT_LANGUAGE,
  applyDocumentLanguage,
  isSupportedLanguage,
  readStoredLanguage,
  storeLanguage,
  type AppLanguage,
} from 'i18n/languages';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => undefined,
});

// Effects are inert during SSR; picking the passive variant there keeps React quiet.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** Read from the cookie on the server so the first paint is already correct. */
  initialLanguage?: AppLanguage;
}) {
  // i18next boots in English so hydration matches the server HTML. The saved
  // language is applied in the layout effect below, which runs after commit but
  // before the browser paints — changing it during render would update already
  // mounted consumers while this component is still rendering.
  const bootLanguage =
    initialLanguage ?? (isSupportedLanguage(i18n.language) ? (i18n.language as AppLanguage) : DEFAULT_LANGUAGE);

  // Mirrors i18next's own language so consumers re-render on a switch.
  const [language, setLanguageState] = useState<AppLanguage>(bootLanguage);

  const apply = useCallback((next: AppLanguage) => {
    storeLanguage(next);
    applyDocumentLanguage(next);
    setUiDisplayLanguage(next);
    setLanguageState(next);
    // i18next fires its own change event; react-i18next does the re-render.
    void i18n.changeLanguage(next);
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage: apply }), [language, apply]);

  useIsoLayoutEffect(() => {
    // The server cookie wins on first load; otherwise the remembered choice.
    const stored = initialLanguage ?? readStoredLanguage();
    if (stored !== i18n.language) apply(stored);
    else {
      storeLanguage(stored);
      applyDocumentLanguage(stored);
      setUiDisplayLanguage(stored);
    }

    const onLanguageChanged = (nextLang: string) => {
      setLanguageState(isSupportedLanguage(nextLang) ? nextLang : DEFAULT_LANGUAGE);
    };
    i18n.on('languageChanged', onLanguageChanged);
    return () => {
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, [apply, initialLanguage]);

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}

/** The switcher and any component that needs the active language itself. */
export function useAppLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export default LanguageProvider;

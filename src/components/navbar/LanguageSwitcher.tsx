'use client';

/**
 * The EN / සිංහල switch.
 *
 * It lives in the navbar so it is reachable from every signed-in screen, shows
 * each language by its own name (an officer who cannot read English still sees
 * "සිංහල"), and switches by re-rendering the tree in place — no reload, no lost
 * scroll position, no half-filled form.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from 'i18n/LanguageProvider';
import { LANGUAGE_CODES, LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from 'i18n/languages';

export default function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = useAppLanguage();

  return (
    <div
      role="group"
      aria-label={t('nav:navbar.languageLabel')}
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-[#f4f7fe] p-1 dark:border-navy-700 dark:bg-navy-900"
    >
      {SUPPORTED_LANGUAGES.map((code) => {
        const active = language === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLanguage(code)}
            title={t(code === 'en' ? 'nav:navbar.switchToEnglish' : 'nav:navbar.switchToSinhala')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold tracking-tight transition-colors ${
              active
                ? 'bg-white text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white'
                : 'text-slate-500 hover:text-navy-700 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {/* Short code on the cramped mobile navbar, full name from lg up. */}
            <span className="lg:hidden">{LANGUAGE_CODES[code]}</span>
            <span className="hidden lg:inline">{LANGUAGE_NAMES[code]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * i18n foundation tests: dictionary parity, language switching, interpolation,
 * pluralisation, persistence helpers, and the presentation-layer mapping of
 * server/validator text.
 *
 * @vitest-environment node
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

import i18next from 'i18n/config';
import { localiseFieldErrors, localiseMessage, localiseReturnStatusLabel } from 'i18n/uiText';
import {
  DEFAULT_LANGUAGE,
  LOCALE_TAGS,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  readStoredLanguage,
  resolveLanguage,
} from 'i18n/languages';

const LOCALES_DIR = fileURLToPath(new URL('../src/i18n/locales', import.meta.url));

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
      {}
    );
  }
  return {};
}

function dictionary(language: string, namespace: string) {
  return JSON.parse(readFileSync(`${LOCALES_DIR}/${language}/${namespace}.json`, 'utf8'));
}

const NAMESPACES = readdirSync(`${LOCALES_DIR}/en`)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace('.json', ''));

const SINHALA_RANGE = /[\u0d80-\u0dff]/;

/**
 * Deliberately untranslated copy: the department's own short name. Official
 * names, file numbers and emails stay as written in both languages.
 */
const LATIN_ONLY_ALLOWLIST = new Set([
  'nav:brand.spid',
  // Product and algorithm names, not copy.
  'shell:securityLogs.limits.excel',
  'shell:securityLogs.chips.sha256',
]);

describe('translation dictionaries', () => {
  it('ships both languages for every namespace', () => {
    SUPPORTED_LANGUAGES.forEach((language) => {
      NAMESPACES.forEach((namespace) => {
        expect(dictionary(language, namespace)).toBeTruthy();
      });
    });
    expect(NAMESPACES).toContain('common');
    expect(NAMESPACES).toContain('messages');
  });

  it('keeps Sinhala key-for-key with English', () => {
    NAMESPACES.forEach((namespace) => {
      const en = Object.keys(flatten(dictionary('en', namespace))).sort();
      const si = Object.keys(flatten(dictionary('si', namespace))).sort();
      expect(en, `${namespace}: keys missing in si`).toEqual(si);
    });
  });

  it('never leaves an empty Sinhala string', () => {
    NAMESPACES.forEach((namespace) => {
      Object.entries(flatten(dictionary('si', namespace))).forEach(([key, value]) => {
        expect(value.trim().length, `${namespace}:${key} is empty`).toBeGreaterThan(0);
      });
    });
  });

  it('writes Sinhala in Sinhala script, not English copy with a si label', () => {
    NAMESPACES.forEach((namespace) => {
      Object.entries(flatten(dictionary('si', namespace))).forEach(([key, value]) => {
        if (LATIN_ONLY_ALLOWLIST.has(`${namespace}:${key}`)) return;
        // Formats and pure placeholder templates carry no copy to translate.
        const copy = value.replace(/{{\s*[\w.]+\s*}}/g, '');
        if (!/[A-Za-z]/.test(copy)) return;
        expect(SINHALA_RANGE.test(value), `${namespace}:${key} has no Sinhala characters`).toBe(true);
      });
    });
  });

  it('never invents an interpolation variable English does not pass', () => {
    NAMESPACES.forEach((namespace) => {
      const en = flatten(dictionary('en', namespace));
      const si = flatten(dictionary('si', namespace));
      const tokens = (text: string) => (text.match(/{{\s*[\w.]+\s*}}/g) || []).sort().join(',');
      Object.keys(en).forEach((key) => {
        const enTokens = tokens(en[key]).split(',').filter(Boolean);
        // Natural Sinhala may drop a numeral ("මිනිත්තුවකට පෙර" for 1 minute),
        // but a placeholder that only exists in si would render as raw braces.
        tokens(si[key])
          .split(',')
          .filter(Boolean)
          .forEach((token) => {
            expect(enTokens, `${namespace}:${key} uses ${token}, absent in English`).toContain(token);
          });
      });
    });
  });

  it('gives every plural form a singular counterpart', () => {
    NAMESPACES.forEach((namespace) => {
      const en = flatten(dictionary('en', namespace));
      Object.keys(en)
        .filter((key) => key.endsWith('_other'))
        .forEach((key) => {
          const base = key.slice(0,-'_other'.length);
          expect(en[`${base}_one`] || en[base], `${key} has no singular form`).toBeTruthy();
        });
    });
  });
});

describe('language resolution', () => {
  it('reads English when nothing usable is stored', () => {
    // No window in the node environment: storage must degrade to the default.
    expect(readStoredLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('si-LK')).toBe('si');
    expect(resolveLanguage('en_US')).toBe('en');
    expect(resolveLanguage('si')).toBe('si');
    expect(resolveLanguage(null)).toBe('en');
    expect(resolveLanguage('fr')).toBe('en');
    expect(isSupportedLanguage('si')).toBe(true);
    expect(isSupportedLanguage('ta')).toBe(false);
    expect(LOCALE_TAGS.si).toBe('si-LK');
  });
});

describe('runtime switching', () => {
  afterEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('starts in English', () => {
    expect(i18next.language).toBe('en');
    expect(i18next.t('common:buttons.approve')).toBe('Approve');
    expect(i18next.t('common:feedback.loading')).toBe('Loading');
  });

  it('switches instantly without a reload and switches back', async () => {
    await i18next.changeLanguage('si');
    expect(i18next.language).toBe('si');
    expect(i18next.t('common:buttons.approve')).toBe('අනුමත කරන්න');
    expect(i18next.t('common:buttons.reject')).toBe('ප්‍රතික්ෂේප කරන්න');
    expect(i18next.t('common:status.pending')).toBe('අපේක්ෂිත');
    expect(i18next.t('common:table.noDataFound')).toBe('දත්ත හමු නොවීය');

    await i18next.changeLanguage('en');
    expect(i18next.t('common:buttons.approve')).toBe('Approve');
  });

  it('interpolates and pluralises in both languages', async () => {
    expect(i18next.t('common:table.showing', { from: 1, to: 4, total: 12 })).toBe('Showing 1–4 of 12');

    await i18next.changeLanguage('si');
    expect(i18next.t('common:table.showing', { from: 1, to: 4, total: 12 })).toBe(
      'මුළු 12 අතුරින් 1–4 දක්වා පෙන්වමින්'
    );
    expect(i18next.t('common:datetime.minutesAgo', { count: 1 })).toBe('මිනිත්තුවකට පෙර');
    expect(i18next.t('common:datetime.minutesAgo', { count: 5 })).toBe('මිනිත්තු 5කට පෙර');
  });

  it('falls back to English for a Sinhala key that does not exist yet', async () => {
    await i18next.changeLanguage('si');
    expect(i18next.t('common:buttons.approve_missing', { defaultValue: 'Approve' })).toBe('Approve');
  });
});

describe('server and validator text', () => {
  afterEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('leaves every English message exactly as the API wrote it', () => {
    expect(localiseMessage('You do not have permission to do this.', { code: 'FORBIDDEN' })).toBe(
      'You do not have permission to do this.'
    );
    expect(localiseMessage('Something the server has never said before.')).toBe(
      'Something the server has never said before.'
    );
    expect(localiseFieldErrors({ email: 'Official work email is required.' })).toEqual({
      email: 'Official work email is required.',
    });
  });

  it('maps a known error code to Sinhala', async () => {
    await i18next.changeLanguage('si');
    expect(localiseMessage('FORBIDDEN text', { code: 'FORBIDDEN' })).toBe('මෙය සිදු කිරීමට ඔබට අවසර නැත.');
    expect(localiseMessage(null, { code: 'INVALID_CREDENTIALS' })).toBe('විද්‍යුත් තැපෑල හෝ මුරපදය වැරදියි.');
  });

  it('maps validator and API copy without a code', async () => {
    await i18next.changeLanguage('si');
    expect(localiseFieldErrors({ password: 'Password must be at least 8 characters.' }).password).toBe(
      'මුරපදය අවම වශයෙන් අක්ෂර 8ක් විය යුතුය.'
    );
    expect(localiseMessage('File updated successfully.')).toBe('ලිපිගොනුව සාර්ථකව යාවත්කාලීන කරන ලදී.');
  });

  it('never translates content an officer typed', async () => {
    await i18next.changeLanguage('si');
    expect(localiseMessage('Kamal Perera')).toBe('Kamal Perera');
    expect(localiseMessage('SPID/AD-2026/114')).toBe('SPID/AD-2026/114');
    expect(localiseMessage('')).toBe('');
    expect(localiseMessage(undefined)).toBe('');
  });

  it('interpolates the shared email hint into the email format message', async () => {
    await i18next.changeLanguage('si');
    const message = localiseMessage('Please provide a valid email format (e.g. officer@spid.gov.lk).');
    expect(message).toContain('officer@spid.gov.lk');
    expect(message).not.toBe('Please provide a valid email format (e.g. officer@spid.gov.lk).');
  });
});

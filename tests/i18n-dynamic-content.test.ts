/**
 * Database content must read in Sinhala without ever mangling identifiers.
 * These tests cover the two deterministic pieces that run before any machine
 * provider: the glossary/hash layer and notification key rendering.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { i18n } from 'i18n/config';
import { resolveNotificationMessage } from 'lib/notificationMessage';
import { isTranslatable, translateWithGlossary, translationHash } from 'services/TranslationService';

const LOCALES = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'i18n', 'locales');

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
      {},
    );
  }
  return {};
}

describe('translation cache keys', () => {
  it('hashes the target language with the source text', () => {
    expect(translationHash('Kandy')).toBe(translationHash('Kandy'));
    expect(translationHash('Kandy')).not.toBe(translationHash('Kandy', 'ta'));
    expect(translationHash('Kandy')).not.toBe(translationHash('Galle'));
    expect(translationHash('Kandy')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isTranslatable', () => {
  it('skips identifiers that must stay exactly as entered', () => {
    expect(isTranslatable('PDI/SPIDF/26/Estimates')).toBe(false);
    expect(isTranslatable('SPID-L-102')).toBe(false);
    expect(isTranslatable('officer@spid.gov.lk')).toBe(false);
    expect(isTranslatable('6f1c2b3a-1111-2222-3333-444455556666')).toBe(false);
    expect(isTranslatable('මධ්‍යම ලේඛනාගාරය')).toBe(false);
    expect(isTranslatable('')).toBe(false);
    expect(isTranslatable('a')).toBe(false);
    expect(isTranslatable('x'.repeat(501))).toBe(false);
  });

  it('accepts officer-typed English wording', () => {
    expect(isTranslatable('Estimates for Computer Maintainance')).toBe(true);
    expect(isTranslatable('Establishment Section')).toBe(true);
  });
});

describe('glossary translation', () => {
  it('translates seeded section names', () => {
    expect(translateWithGlossary('Establishment Section')).toBe('ස්ථාපන අංශය');
    expect(translateWithGlossary('Accounts Section')).toBe('ගිණුම් අංශය');
    expect(translateWithGlossary('Development Section')).toBe('සංවර්ධන අංශය');
  });

  it('translates composed storage locations but keeps locker codes', () => {
    const stored =
      'Central Record Room (B-02) — Locker L 1 — Shelf Development — Front position';
    expect(translateWithGlossary(stored)).toBe(
      'මධ්‍යම ලේඛනාගාරය (B-02) — ලොකරය L 1 — සංවර්ධන රාක්කය — ඉදිරිපස ස්ථානය',
    );
  });

  it('returns null for names and free text it does not know', () => {
    expect(translateWithGlossary('Kasuni Perera')).toBeNull();
    expect(translateWithGlossary('Estimates for Computer Maintainance')).toBeNull();
  });
});

describe('notification rendering', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('si');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  const requestRow = {
    title: 'New staff file request',
    body: 'Kasuni Perera requested PDI/SPIDF/26/Estimates — Estimates for Computer Maintainance for 3 days.',
    title_key: 'content.newRequestTitle',
    body_key: 'content.newRequestBody',
    params: {
      staffName: 'Kasuni Perera',
      fileNo: 'PDI/SPIDF/26/Estimates',
      fileName: 'Estimates for Computer Maintainance',
      days: 3,
    },
  };

  it('renders a stored key in the active language', () => {
    expect(resolveNotificationMessage(requestRow, 'title')).toBe('නව කාර්ය මණ්ඩල ලිපිගොනු ඉල්ලීමක්');

    const body = resolveNotificationMessage(requestRow, 'body');
    expect(body).toContain('Kasuni Perera');
    expect(body).toContain('PDI/SPIDF/26/Estimates');
    expect(body).toContain('3');
    expect(body).not.toContain('requested');
  });

  it('localizes only the parameters the caller opts into', () => {
    const body = resolveNotificationMessage(requestRow, 'body', (value) =>
      translateWithGlossary(value) ?? value,
    );
    expect(body).toContain('Kasuni Perera');
    expect(body).toContain('PDI/SPIDF/26/Estimates');
    expect(body).toContain('Estimates for Computer Maintainance');
  });

  it('falls back to the stored English for rows written before the migration', () => {
    const legacy = { title: 'New staff file request', body: 'Kasuni Perera requested a file.', params: null };
    expect(resolveNotificationMessage(legacy, 'title')).toBe('New staff file request');
    expect(resolveNotificationMessage(legacy, 'body')).toBe('Kasuni Perera requested a file.');
  });

  it('falls back when a stored key was removed from the dictionaries', () => {
    const stale = { ...requestRow, title: 'New staff file request', title_key: 'content.removedTitle' };
    expect(resolveNotificationMessage(stale, 'title')).toBe('New staff file request');
  });

  it('has a Sinhala string for every notification content key', () => {
    const en = flatten(JSON.parse(readFileSync(join(LOCALES, 'en', 'notifications.json'), 'utf8')));
    const si = flatten(JSON.parse(readFileSync(join(LOCALES, 'si', 'notifications.json'), 'utf8')));
    const missing = Object.keys(en)
      .filter((key) => key.startsWith('content.'))
      .filter((key) => !(key in si) || !si[key].trim());
    expect(missing).toEqual([]);
  });
});

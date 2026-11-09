/**
 * Missing-key guard: every literal translation key referenced in the app must
 * exist in both dictionaries, so a Sinhala screen can never fall back to a raw
 * key or to English copy.
 *
 * Dynamic keys (`t(`status.${value}`)`) are skipped here — they are covered by
 * the per-value tests around enums and DB fields.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(PROJECT_ROOT, 'src');
const LOCALES_DIR = join(SRC_DIR, 'i18n', 'locales');

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

const NAMESPACES = readdirSync(join(LOCALES_DIR, 'en'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace('.json', ''));

const DICTIONARIES = Object.fromEntries(
  NAMESPACES.map((namespace) => [
    namespace,
    {
      en: flatten(JSON.parse(readFileSync(join(LOCALES_DIR, 'en', `${namespace}.json`), 'utf8'))),
      si: flatten(JSON.parse(readFileSync(join(LOCALES_DIR, 'si', `${namespace}.json`), 'utf8'))),
    },
  ])
);

function hasKey(language: 'en' | 'si', namespace: string, key: string): boolean {
  const dictionary = DICTIONARIES[namespace]?.[language];
  if (!dictionary) return false;
  // i18next resolves plural calls through the suffixed entries.
  return key in dictionary || `${key}_one` in dictionary || `${key}_other` in dictionary;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

interface Usage {
  file: string;
  line: number;
  namespace?: string;
  key: string;
}

function usages(): Usage[] {
  const found: Usage[] = [];
  const callPattern = /\bt\(\s*(['"])([^'"]+)\1/g;
  const transPattern = /i18nKey\s*=\s*(['"])([^'"]+)\1/g;

  for (const file of sourceFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf8');
    const declared = source.match(/useTranslation\(\s*(\[[^\]]*\]|['"][^'"]+['"])/);
    const namespaces = declared
      ? (declared[1].match(/['"][^'"]+['"]/g) || []).map((value) => value.slice(1, -1))
      : [];

    source.split(/\r?\n/).forEach((text, index) => {
      for (const pattern of [callPattern, transPattern]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text))) {
          const raw = match[2];
          if (raw.includes(':')) {
            const [namespace, ...rest] = raw.split(':');
            found.push({ file, line: index + 1, namespace, key: rest.join(':') });
          } else {
            found.push({
              file,
              line: index + 1,
              namespace: namespaces.length === 1 ? namespaces[0] : undefined,
              key: raw,
            });
          }
        }
      }
    });
  }
  return found;
}

function describeUsage(usage: Usage): string {
  return `${relative(PROJECT_ROOT, usage.file)}:${usage.line} → ${usage.key}`;
}

describe('translation key coverage', () => {
  const all = usages();

  it('finds the translation calls it is meant to guard', () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it('never references a key that is missing from English or Sinhala', () => {
    const missing = all.filter((usage) => {
      const candidates = usage.namespace ? [usage.namespace] : NAMESPACES;
      return !candidates.some(
        (namespace) =>
          hasKey('en', namespace, usage.key) && hasKey('si', namespace, usage.key)
      );
    });

    expect(
      missing.map(describeUsage),
      'Add the missing keys to both src/i18n/locales/en and /si'
    ).toEqual([]);
  });

  it('keeps explicit namespace prefixes real', () => {
    const unknown = all.filter(
      (usage) => usage.namespace && !NAMESPACES.includes(usage.namespace!)
    );
    expect(unknown.map(describeUsage)).toEqual([]);
  });
});

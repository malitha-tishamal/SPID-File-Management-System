import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import glossary from 'i18n/contentGlossary.json';

/**
 * Translates officer-typed database content into Sinhala.
 *
 * Three layers, cheapest first:
 *   1. the domain glossary — values the system seeds or composes itself
 *      (section names, "Central Record Room", "Locker 4 — Shelf A");
 *   2. the `content_translations` cache — sha256(target:source) keyed, so the
 *      same wording is never sent to a provider twice;
 *   3. an optional machine provider (OpenAI-compatible), configured only by
 *      server-side env vars.
 *
 * Nothing here is allowed to break a page. Any failure — no provider, no
 * network, provider error, unapplied migration — returns the original text,
 * which is exactly what the English view shows. Source text is never logged;
 * failures are reported as counts only.
 */

export const TRANSLATION_TARGET = 'si';
export const TRANSLATION_SOURCE = 'en';

/** Longer values are free-text notes; translating them is out of scope. */
const MAX_SOURCE_LENGTH = 500;
const PROVIDER_BATCH_SIZE = 25;
const PROVIDER_TIMEOUT_MS = 8_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:|www\.)\S+$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** File numbers, codes and all-caps identifiers are never translated. */
const IDENTIFIER_RE = /^[A-Z0-9][A-Z0-9._\-/ ]*$/;
/** Reference codes such as PDI/SPIDF/26/Estimates never contain spaces. */
const CODE_WITHOUT_SPACE_RE = /^[^\s]*[/\\_#][^\s]*$/;
const SINHALA_RE = /[\u0D80-\u0DFF]/;
const LATIN_RE = /[A-Za-z]/;

interface GlossaryFile {
  phrases: Record<string, string>;
  prefixes: Record<string, string>;
  suffixes: Record<string, string>;
  separators: string[];
}

const CONTENT_GLOSSARY = glossary as GlossaryFile;

/**
 * True when a value carries words worth translating. Identifiers, addresses,
 * numbers and values already in Sinhala are returned untouched by callers.
 */
export function isTranslatable(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 2 || text.length > MAX_SOURCE_LENGTH) return false;
  if (EMAIL_RE.test(text) || URL_RE.test(text) || UUID_RE.test(text)) return false;
  if (!LATIN_RE.test(text)) return false;
  if (SINHALA_RE.test(text)) return false;
  if (IDENTIFIER_RE.test(text) || CODE_WITHOUT_SPACE_RE.test(text)) return false;
  return true;
}

/** sha256("<target>:<source>") — the cache key shared by service and backfill. */
export function translationHash(sourceText: string, targetLang = TRANSLATION_TARGET): string {
  return createHash('sha256').update(`${targetLang}:${sourceText}`).digest('hex');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic translation for seeded/composed values. Returns null when the
 * glossary has nothing to say, so the provider (or the original text) wins.
 */
export function translateWithGlossary(value: string, depth = 0): string | null {
  const text = value.trim();
  if (!text) return null;

  const exact = CONTENT_GLOSSARY.phrases[text];
  if (exact) return exact;

  // Case-insensitive exact match; the stored value keeps its own casing.
  const lower = text.toLowerCase();
  for (const [source, target] of Object.entries(CONTENT_GLOSSARY.phrases)) {
    if (source.toLowerCase() === lower) return target;
  }

  // Storage locations are composed at write time ("Central Record Room — Locker 4").
  if (depth < 2) {
    for (const separator of CONTENT_GLOSSARY.separators) {
      if (!text.includes(separator)) continue;
      const parts = text.split(separator);
      if (parts.length < 2) continue;
      const translatedParts = parts.map((part) => {
        const trimmed = part.trim();
        return translateWithGlossary(trimmed, depth + 1) ?? trimmed;
      });
      return translatedParts.join(separator);
    }

    for (const [prefix, target] of Object.entries(CONTENT_GLOSSARY.prefixes)) {
      const match = text.match(new RegExp(`^${escapeRegExp(prefix)}\\s+(.+)$`, 'i'));
      if (match) {
        const rest = match[1].trim();
        const restTranslated = translateWithGlossary(rest, depth + 1) ?? rest;
        return `${target} ${restTranslated}`;
      }
    }

    for (const [suffix, target] of Object.entries(CONTENT_GLOSSARY.suffixes)) {
      const match = text.match(new RegExp(`^(.+?)\\s+${escapeRegExp(suffix)}$`, 'i'));
      if (match) {
        const rest = match[1].trim();
        const restTranslated = translateWithGlossary(rest, depth + 1) ?? rest;
        return `${target} ${restTranslated}`;
      }
    }
  }

  return null;
}

function providerConfig(): { url: string; key: string; model: string } | null {
  const url = process.env.TRANSLATION_API_URL?.trim();
  const key = process.env.TRANSLATION_API_KEY?.trim();
  if (!url || !key) return null;
  return {
    url,
    key,
    model: process.env.TRANSLATION_MODEL?.trim() || 'gpt-4o-mini',
  };
}

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .*content_translations.* does not exist|Could not find the table/i.test(
      error.message ?? '',
    )
  );
}

export class TranslationService {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** One value; never throws, never returns empty for valid input. */
  async translate(text: string, targetLang = TRANSLATION_TARGET): Promise<string> {
    const result = await this.translateMany([text], targetLang);
    return result[text] ?? text;
  }

  /**
   * Batch entry point for both the API route and the backfill. Result maps the
   * exact input string to its rendering; skipped values are simply absent.
   */
  async translateMany(
    texts: string[],
    targetLang = TRANSLATION_TARGET,
  ): Promise<Record<string, string>> {
    const unique = Array.from(
      new Set(texts.filter((text) => isTranslatable(text)).map((text) => text.trim())),
    );
    if (unique.length === 0) return {};

    const result: Record<string, string> = {};
    const pending: string[] = [];

    for (const text of unique) {
      const fromGlossary = translateWithGlossary(text);
      if (fromGlossary) {
        result[text] = fromGlossary;
        void this.cache(text, fromGlossary, targetLang, 'glossary');
      } else {
        pending.push(text);
      }
    }

    if (pending.length === 0) return result;

    const hashToText = new Map<string, string>();
    for (const text of pending) hashToText.set(translationHash(text, targetLang), text);

    const cached = await this.readCache(Array.from(hashToText.keys()), targetLang);
    const missing: string[] = [];
    for (const text of pending) {
      const hit = cached.get(translationHash(text, targetLang));
      if (hit) result[text] = hit;
      else missing.push(text);
    }

    if (missing.length === 0) return result;

    const fromProvider = await this.callProvider(missing);
    for (const text of missing) {
      const translated = fromProvider[text];
      if (!translated) continue;
      result[text] = translated;
      void this.cache(text, translated, targetLang, 'provider');
    }

    return result;
  }

  /**
   * Fire-and-forget warm-up after a create/update, so a record saved in English
   * already has its Sinhala rendering when someone switches language.
   */
  async warm(texts: Array<string | null | undefined>, targetLang = TRANSLATION_TARGET): Promise<void> {
    const candidates = texts.filter((text): text is string => isTranslatable(text));
    if (candidates.length === 0) return;
    try {
      await this.translateMany(candidates, targetLang);
    } catch (err) {
      console.warn('[translation] warm-up skipped');
    }
  }

  private async readCache(
    hashes: string[],
    targetLang: string,
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    if (hashes.length === 0) return found;

    try {
      const { data, error } = await this.client
        .from('content_translations')
        .select('source_hash, translated_text')
        .eq('target_lang', targetLang)
        .in('source_hash', hashes);

      if (error) {
        // Migration not applied yet: behave as a cold cache, not a failure.
        if (!isMissingTableError(error)) {
          console.warn('[translation] cache read skipped:', error.code ?? 'unknown');
        }
        return found;
      }

      for (const row of (data ?? []) as { source_hash: string; translated_text: string }[]) {
        found.set(row.source_hash, row.translated_text);
      }
    } catch {
      // Network/cache problems must never block rendering.
    }
    return found;
  }

  private async cache(
    sourceText: string,
    translatedText: string,
    targetLang: string,
    provider: string,
  ): Promise<void> {
    try {
      // ignoreDuplicates keeps an officer's manual correction in place.
      const { error } = await this.client.from('content_translations').upsert(
        {
          source_hash: translationHash(sourceText, targetLang),
          source_lang: TRANSLATION_SOURCE,
          target_lang: targetLang,
          source_text: sourceText,
          translated_text: translatedText,
          provider,
          is_manual: false,
        },
        { onConflict: 'source_hash,target_lang', ignoreDuplicates: true },
      );
      if (error && !isMissingTableError(error)) {
        console.warn('[translation] cache write skipped:', error.code ?? 'unknown');
      }
    } catch {
      // Best effort only.
    }
  }

  private async callProvider(texts: string[]): Promise<Record<string, string>> {
    const config = providerConfig();
    if (!config) return {};

    const result: Record<string, string> = {};
    for (let i = 0; i < texts.length; i += PROVIDER_BATCH_SIZE) {
      const batch = texts.slice(i, i + PROVIDER_BATCH_SIZE);
      const translated = await this.requestBatch(config, batch);
      for (let j = 0; j < batch.length; j += 1) {
        if (typeof translated[j] === 'string' && translated[j].trim()) {
          result[batch[j]] = translated[j];
        }
      }
    }
    return result;
  }

  private async requestBatch(
    config: { url: string; key: string; model: string },
    batch: string[],
  ): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'You translate Sri Lankan government file-registry text from English to Sinhala (si-LK). ' +
                'Reply with a JSON array of strings only, same order and length as the input. ' +
                'Leave file numbers, reference codes, email addresses, personal names and IDs unchanged. ' +
                'Do not add commentary.',
            },
            { role: 'user', content: JSON.stringify(batch) },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn('[translation] provider returned', response.status);
        return [];
      }

      const payload: any = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return [];

      const jsonText = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const parsed = JSON.parse(jsonText);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Timeout, network error or malformed provider output: fall back to English.
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Shared server-side entry point; each call reuses the same service config. */
export function createTranslationService(client: SupabaseClient): TranslationService {
  return new TranslationService(client);
}

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { translateWithGlossary } from 'i18n/glossary';

export { translateWithGlossary };

/**
 * Translates officer-typed database content into Sinhala.
 *
 * Three layers, cheapest first:
 *   1. the domain glossary - values the system seeds or composes itself
 *      (section names, "Central Record Room", "Locker 4 - Shelf A");
 *   2. the `content_translations` cache - sha256(target:source) keyed, so the
 *      same wording is never sent to a provider twice;
 *   3. an optional machine provider (OpenAI-compatible), configured only by
 *      server-side env vars.
 *
 * Nothing here is allowed to break a page. Any failure - no provider, no
 * network, provider error, unapplied migration - returns the original text,
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
const IDENTIFIER_RE = /^[A-Z0-9][A-Z0-9._\-\/ ]*$/;
/** Reference codes such as PDI/SPIDF/26/Estimates never contain spaces. */
const CODE_WITHOUT_SPACE_RE = /^[^\s]*[\/\\_#][^\s]*$/;
const SINHALA_RE = /[\u0D80-\u0DFF]/;
const LATIN_RE = /[A-Za-z]/;

/**
 * True when a value carries words worth translating. Identifiers, addresses,
 * numbers and values already in Sinhala are returned untouched by callers.
 */
export function isTranslatable(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 2 || text.length > MAX_SOURCE_LENGTH) return false;
  if (EMAIL_RE.test(text) || URL_RE.test(text) || UUID_RE.test(text)) return false;
  if (translateWithGlossary(text) !== null) return true;
  if (!LATIN_RE.test(text)) return false;
  if (SINHALA_RE.test(text)) return false;
  if (IDENTIFIER_RE.test(text) || CODE_WITHOUT_SPACE_RE.test(text)) return false;
  return true;
}

/** sha256("<target>:<source>") - the cache key shared by service and backfill. */
export function translationHash(sourceText: string, targetLang = TRANSLATION_TARGET): string {
  return createHash('sha256').update(`${targetLang}:${sourceText}`).digest('hex');
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

    const cfg = providerConfig();
    if (!cfg) return result;

    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += PROVIDER_BATCH_SIZE) {
      batches.push(missing.slice(i, i + PROVIDER_BATCH_SIZE));
    }

    for (const batch of batches) {
      try {
        const translations = await this.callProvider(batch, cfg, targetLang);
        for (const [source, translation] of Object.entries(translations)) {
          if (!translation || translation === source) continue;
          result[source] = translation;
          void this.cache(source, translation, targetLang, cfg.model);
        }
      } catch (err) {
        console.warn(`[translation] provider batch failed (${batch.length} items):`, err);
      }
    }

    return result;
  }

  private async readCache(
    hashes: string[],
    targetLang: string,
  ): Promise<Map<string, string>> {
    const hits = new Map<string, string>();
    if (hashes.length === 0) return hits;

    try {
      const { data, error } = await this.client
        .from('content_translations')
        .select('source_hash, translation')
        .eq('target_lang', targetLang)
        .in('source_hash', hashes);

      if (error) {
        if (!isMissingTableError(error)) {
          console.warn('[translation] cache read error:', error.message);
        }
        return hits;
      }

      for (const row of (data ?? []) as Array<{ source_hash: string; translation: string }>) {
        if (row?.source_hash && row?.translation) {
          hits.set(row.source_hash, row.translation);
        }
      }
    } catch (err) {
      console.warn('[translation] cache read threw:', err);
    }

    return hits;
  }

  private async cache(
    sourceText: string,
    translation: string,
    targetLang: string,
    provider: string,
  ): Promise<void> {
    try {
      const hash = translationHash(sourceText, targetLang);
      const { error } = await this.client.from('content_translations').upsert(
        {
          source_hash: hash,
          source_text: sourceText,
          target_lang: targetLang,
          translation,
          provider,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_hash' },
      );
      if (error && !isMissingTableError(error)) {
        console.warn('[translation] cache write error:', error.message);
      }
    } catch {
      // Fire-and-forget; never fail a render because a cache write was rejected.
    }
  }

  /**
   * Pre-populates the Sinhala translation cache for the given values so the
   * next read-side request is instant. Never throws: any failure is silently
   * swallowed so callers can fire-and-forget with \u000boid.
   */
  async warm(values: (string | null | undefined)[], targetLang = TRANSLATION_TARGET): Promise<void> {
    try {
      const texts = values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (texts.length > 0) await this.translateMany(texts, targetLang);
    } catch {
      // intentionally swallowed ? warming is best-effort
    }
  }

  private async callProvider(
    texts: string[],
    cfg: { url: string; key: string; model: string },
    targetLang: string,
  ): Promise<Record<string, string>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const systemPrompt =
        `You are a translator for the Sri Lanka Southern Provincial Irrigation Department (SPID) portal.\n` +
        `Translate each input string from English to Sinhala (${targetLang}).\n` +
        `Preserve acronyms (SPID, GIS, GPS, NIC, IT), file codes, room numbers and punctuation.\n` +
        `Keep translations concise and official.\n` +
        `Return ONLY valid JSON matching: {\"translations\": {\"<source text>\": \"<sinhala text>\"}}`;

      const userPayload = JSON.stringify({ texts });

      const response = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.key}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayload },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`provider HTTP ${response.status}`);
      }

      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('empty provider response');
      }

      const parsed = JSON.parse(content);
      const map = parsed?.translations;
      if (!map || typeof map !== 'object') return {};

      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) {
        if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
      }
      return clean;
    } finally {
      clearTimeout(timer);
    }
  }
}

'use client';

/**
 * Display-side translation for officer-typed database content.
 *
 * The server owns the provider key and the cache table; the browser only asks
 * for the values it is about to draw, once each. Three properties matter:
 *
 *   - English mode never calls the API and returns the stored value verbatim.
 *   - Until a translation arrives the original English is shown, so a cell is
 *     never blank and a failed lookup is invisible.
 *   - Requests from every row mounted in the same tick are batched into one
 *     POST, so a 50-row table costs one round trip, not fifty.
 */

import React, { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useAppLanguage } from 'i18n/LanguageProvider';

const MAX_BATCH = 200;
const BATCH_DELAY_MS = 20;
const RETRY_AFTER_MS = 5 * 60 * 1000;

const cache = new Map<string, string>();
const failedAt = new Map<string, number>();
const listeners = new Set<() => void>();
const queued = new Set<string>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isCandidate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 2) return false;
  // Server-side guard applies the same rules; this only avoids pointless calls.
  if (/[\u0D80-\u0DFF]/.test(text)) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return false;
  if (/^https?:/i.test(text)) return false;
  return true;
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (queued.size === 0) return;

  const now = Date.now();
  const batch = Array.from(queued)
    .filter((text) => {
      const attempted = failedAt.get(text);
      return !attempted || now - attempted > RETRY_AFTER_MS;
    })
    .slice(0, MAX_BATCH);
  queued.clear();

  if (batch.length === 0) return;

  try {
    const response = await fetch('/api/i18n/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch, language: 'si' }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) throw new Error('translation request failed');

    const translations: Record<string, string> = json.data?.translations ?? {};

    let changed = false;
    for (const text of batch) {
      const translated = translations[text];
      if (typeof translated === 'string' && translated.trim() && translated !== text) {
        cache.set(text, translated);
        changed = true;
      } else {
        failedAt.set(text, now);
      }
    }
    if (changed) notify();
  } catch {
    for (const text of batch) failedAt.set(text, now);
  }
}

function requestTranslations(texts: string[]): void {
  let added = false;
  for (const text of texts) {
    if (cache.has(text) || queued.has(text)) continue;
    const attempted = failedAt.get(text);
    if (attempted && Date.now() - attempted <= RETRY_AFTER_MS) continue;
    queued.add(text);
    added = true;
  }
  if (!added || flushTimer) return;
  flushTimer = setTimeout(() => void flush(), BATCH_DELAY_MS);
}

/** Synchronous cache read; falls back to the stored value. */
export function localizeField(value: string | null | undefined): string {
  if (typeof value !== 'string') return value ?? '';
  return cache.get(value) ?? value;
}

/**
 * Translate a list of values (table rows, dropdown options) with one hook call.
 * Order and empty values are preserved.
 */
export function useLocalizedFields(values: Array<string | null | undefined>): Array<string> {
  const { language } = useAppLanguage();
  const currentVersion = useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );

  const key = useMemo(
    () => values.map((value) => (typeof value === 'string' ? value : '')).join('\u0000'),
    [values],
  );

  useEffect(() => {
    if (language !== 'si') return;
    const candidates = key.split('\u0000').filter(isCandidate);
    if (candidates.length > 0) requestTranslations(candidates);
  }, [language, key]);

  return useMemo(
    () =>
      values.map((value) => {
        if (typeof value !== 'string') return '';
        if (language !== 'si') return value;
        return cache.get(value) ?? value;
      }),
    // currentVersion is the change signal for the module-level cache.
    [values, language, currentVersion],
  );
}

/** Translate a single value; the component re-renders when it arrives. */
export function useLocalizedField(value: string | null | undefined): string {
  const [translated] = useLocalizedFields([value ?? '']);
  return translated ?? '';
}

/**
 * Drop-in replacement for a text node holding database content. Each cell is a
 * component, so hooks stay legal inside table maps.
 */
export function LocalizedText({
  value,
  fallback = '',
}: {
  value: string | null | undefined;
  fallback?: string;
}) {
  const translated = useLocalizedField(value);
  return <>{translated || fallback}</>;
}

export default LocalizedText;

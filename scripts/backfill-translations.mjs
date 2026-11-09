#!/usr/bin/env node
/**
 * Backfill Sinhala renderings for content already in the database.
 *
 *   node scripts/backfill-translations.mjs [--dry-run] [--limit=500]
 *
 * Requires SUPABASE_URL + service-role key (read from .env.local).
 * Optional machine provider: TRANSLATION_API_URL, TRANSLATION_API_KEY,
 * TRANSLATION_MODEL. Without it, only glossary values are stored — the rest
 * stay English until a provider is configured. Nothing is logged except counts.
 *
 * The script is safe to re-run: rows are keyed by sha256("si:<source>") and
 * inserted with ignoreDuplicates, so manual corrections are never overwritten.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const TARGET = 'si';
const BATCH = 25;
const MAX_SOURCE_LENGTH = 500;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = process.argv.slice(2).find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) || 500 : 500;

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const glossary = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/i18n/contentGlossary.json'), 'utf8'),
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:|www\.)\S+$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_RE = /^[A-Z0-9][A-Z0-9._\-/ ]*$/;
const CODE_WITHOUT_SPACE_RE = /^[^\s]*[/\\_#][^\s]*$/;
const SINHALA_RE = /[\u0D80-\u0DFF]/;
const LATIN_RE = /[A-Za-z]/;
const DATEISH_RE = /^\d{4}-\d{2}-\d{2}/;

function isTranslatable(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 2 || text.length > MAX_SOURCE_LENGTH) return false;
  if (EMAIL_RE.test(text) || URL_RE.test(text) || UUID_RE.test(text)) return false;
  if (!LATIN_RE.test(text) || SINHALA_RE.test(text)) return false;
  if (IDENTIFIER_RE.test(text) || CODE_WITHOUT_SPACE_RE.test(text)) return false;
  if (DATEISH_RE.test(text)) return false;
  return true;
}

const hash = (text) =>
  createHash('sha256').update(`${TARGET}:${text}`).digest('hex');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fromGlossary(value, depth = 0) {
  const text = value.trim();
  if (!text) return null;
  if (glossary.phrases[text]) return glossary.phrases[text];
  const lower = text.toLowerCase();
  for (const [source, target] of Object.entries(glossary.phrases)) {
    if (source.toLowerCase() === lower) return target;
  }
  if (depth >= 2) return null;

  for (const separator of glossary.separators ?? []) {
    if (!text.includes(separator)) continue;
    const parts = text.split(separator);
    if (parts.length < 2) continue;
    return parts
      .map((part) => fromGlossary(part.trim(), depth + 1) ?? part.trim())
      .join(separator);
  }
  for (const [prefix, target] of Object.entries(glossary.prefixes ?? {})) {
    const match = text.match(new RegExp(`^${escapeRegExp(prefix)}\\s+(.+)$`, 'i'));
    if (match) {
      const rest = match[1].trim();
      return `${target} ${fromGlossary(rest, depth + 1) ?? rest}`;
    }
  }
  for (const [suffix, target] of Object.entries(glossary.suffixes ?? {})) {
    const match = text.match(new RegExp(`^(.+?)\\s+${escapeRegExp(suffix)}$`, 'i'));
    if (match) {
      const rest = match[1].trim();
      return `${target} ${fromGlossary(rest, depth + 1) ?? rest}`;
    }
  }
  return null;
}

async function requestProvider(batch) {
  const url = process.env.TRANSLATION_API_URL?.trim();
  const key = process.env.TRANSLATION_API_KEY?.trim();
  if (!url || !key) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.TRANSLATION_MODEL?.trim() || 'gpt-4o-mini',
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
    if (!response.ok) return [];
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return [];
    const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a table column in pages; a missing table/column is skipped, not fatal. */
async function collect(table, columns) {
  const values = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns.join(','))
      .range(from, from + 999);
    if (error) {
      console.warn(`[backfill] skipped ${table}: ${error.code ?? 'error'}`);
      return values;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      for (const column of columns) {
        if (isTranslatable(row[column])) values.push(String(row[column]).trim());
      }
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return values;
}

async function existingHashes(hashes) {
  const found = new Map();
  for (let i = 0; i < hashes.length; i += 200) {
    const chunk = hashes.slice(i, i + 200);
    const { data, error } = await supabase
      .from('content_translations')
      .select('source_hash')
      .eq('target_lang', TARGET)
      .in('source_hash', chunk);
    if (error) {
      console.error(
        `[backfill] cannot read content_translations (${error.code ?? 'error'}). ` +
          'Apply supabase/migrations/0025_content_translations.sql first.',
      );
      process.exit(1);
    }
    for (const row of data ?? []) found.set(row.source_hash, true);
  }
  return found;
}

async function main() {
  const sources = [
    ...(await collect('files', [
      'file_name',
      'section_name',
      'archive_repository',
      'reject_reason',
    ])),
    ...(await collect('staff_file_requests', [
      'file_name',
      'section_name',
      'storage_location',
      'admin_notes',
    ])),
    ...(await collect('sections', ['name'])),
    ...(await collect('file_request_extensions', ['reason', 'review_note'])),
  ];

  const unique = Array.from(new Set(sources)).slice(0, limit);
  console.log(`[backfill] ${unique.length} distinct values to consider`);

  const rows = [];
  const pending = [];

  for (const text of unique) {
    const translated = fromGlossary(text);
    if (translated) {
      rows.push({ sourceText: text, translatedText: translated, provider: 'glossary' });
    } else {
      pending.push(text);
    }
  }

  const known = await existingHashes(pending.map(hash));
  const toTranslate = pending.filter((text) => !known.has(hash(text)));
  console.log(
    `[backfill] ${rows.length} glossary, ${pending.length - toTranslate.length} cached, ` +
      `${toTranslate.length} need a provider`,
  );

  for (let i = 0; i < toTranslate.length; i += BATCH) {
    const batch = toTranslate.slice(i, i + BATCH);
    const translated = await requestProvider(batch);
    batch.forEach((text, index) => {
      const value = translated[index];
      if (typeof value === 'string' && value.trim() && value !== text) {
        rows.push({ sourceText: text, translatedText: value, provider: 'provider' });
      }
    });
  }

  console.log(`[backfill] ${rows.length} rows ready${dryRun ? ' (dry run)' : ''}`);
  if (dryRun || rows.length === 0) return;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((row) => ({
      source_hash: hash(row.sourceText),
      source_lang: 'en',
      target_lang: TARGET,
      source_text: row.sourceText,
      translated_text: row.translatedText,
      provider: row.provider,
      is_manual: false,
    }));
    const { error } = await supabase
      .from('content_translations')
      .upsert(chunk, { onConflict: 'source_hash,target_lang', ignoreDuplicates: true });
    if (error) {
      console.error(`[backfill] write failed: ${error.code ?? 'error'}`);
      process.exit(1);
    }
    inserted += chunk.length;
  }
  console.log(`[backfill] done — ${inserted} rows written`);
}

main().catch((err) => {
  console.error('[backfill] failed:', err?.message ?? err);
  process.exit(1);
});

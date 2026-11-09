/**
 * Notification wording is stored as a translation key plus parameters, so one
 * row reads correctly in both languages and a language switch re-words the
 * whole panel without touching the database.
 *
 * Rows written before migration 0025 (or by an older deployment) have no key;
 * they fall back to the English title/body that was stored at dispatch time.
 */

import { i18n } from 'i18n/config';
import { formatSriLankaDate } from 'lib/datetime';

export interface NotificationMessageRow {
  title: string;
  body: string | null;
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, unknown> | null;
}

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}/;

function formatParams(
  params: Record<string, unknown> | null | undefined,
  localize?: (value: string) => string,
): Record<string, string> {
  const formatted: Record<string, string> = {};
  if (!params) return formatted;

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && /Date$/.test(key) && DATE_PARAM_RE.test(value)) {
      formatted[key] = formatSriLankaDate(`${value.slice(0, 10)}T00:00:00Z`);
    } else if (typeof value === 'string') {
      formatted[key] = localize ? localize(value) : value;
    } else {
      formatted[key] = String(value);
    }
  }
  return formatted;
}

/**
 * Translated title or body, with the stored English as the fallback.
 * `localizeParam` lets the caller translate database values embedded in the
 * message (file names, notes) without ever touching names or identifiers.
 */
export function resolveNotificationMessage(
  item: NotificationMessageRow,
  part: 'title' | 'body',
  localizeParam?: (value: string) => string,
): string {
  const key = part === 'title' ? item.title_key : item.body_key;
  const fallback = part === 'title' ? item.title : item.body;

  if (key && i18n.exists(`notifications:${key}`)) {
    return i18n.t(key, {
      ns: 'notifications',
      ...formatParams(item.params, localizeParam),
    });
  }

  return fallback ?? '';
}

/**
 * Every user-facing date/time in the portal renders in Sri Lanka time
 * (Asia/Colombo — Sri Jayawardenepura Kotte), regardless of the device,
 * browser or server timezone. Storage stays in UTC ISO; only display
 * and "today" boundaries are converted here.
 */

export const SRI_LANKA_TIME_ZONE = 'Asia/Colombo';

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: SRI_LANKA_TIME_ZONE,
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: SRI_LANKA_TIME_ZONE,
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** "23 Oct 2026" — falls back to '—' for missing/invalid values. */
export function formatSriLankaDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-GB', DATE_OPTS) : '—';
}

/** "06:15 PM" — falls back to an empty string for missing/invalid values. */
export function formatSriLankaTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString('en-US', TIME_OPTS) : '';
}

/** "23 Oct 2026 • 06:15 PM" */
export function formatSriLankaDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const time = formatSriLankaTime(d);
  return time ? `${formatSriLankaDate(d)} • ${time}` : formatSriLankaDate(d);
}

/** "2026-10-23 06:15 PM" — compact variant for ledgers, dashboards and CSV. */
export function formatSriLankaDateTimeCompact(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: SRI_LANKA_TIME_ZONE,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const time = formatSriLankaTime(d);
  return `${get('year')}-${get('month')}-${get('day')} ${time}`.trim();
}

/** "2026-10-23" — today's date in Sri Lanka, for <input type="date"> and filenames. */
export function sriLankaTodayInput(): string {
  return formatSriLankaDateTimeCompact(new Date()).slice(0, 10);
}

/** Start of today (midnight) in Sri Lanka, as a Date — for server-side "today" queries. */
export function sriLankaTodayStart(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: SRI_LANKA_TIME_ZONE,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00${sriLankaOffset(now)}`);
}

/** SL is UTC+5:30 with no DST — offset is constant, but derive it anyway. */
function sriLankaOffset(forDate: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SRI_LANKA_TIME_ZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(forDate);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+5:30';
  return offset.replace('GMT', '');
}

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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string | null | undefined): boolean {
  return Boolean(value && YMD_RE.test(value.trim()));
}

/** Inclusive UTC ISO start for a calendar day in Sri Lanka (Asia/Colombo, UTC+05:30). */
export function sriLankaDayStartIso(dateYmd: string): string {
  return new Date(`${dateYmd.trim()}T00:00:00+05:30`).toISOString();
}

/** Inclusive UTC ISO end for a calendar day in Sri Lanka (Asia/Colombo, UTC+05:30). */
export function sriLankaDayEndIso(dateYmd: string): string {
  return new Date(`${dateYmd.trim()}T23:59:59.999+05:30`).toISOString();
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

/** Start of this month (1st of month at midnight) in Sri Lanka, as a Date — for server-side "this month" queries. */
export function sriLankaMonthStart(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: SRI_LANKA_TIME_ZONE,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return new Date(`${get('year')}-${get('month')}-01T00:00:00${sriLankaOffset(now)}`);
}

/** SL is UTC+5:30 with no DST — offset is constant, but derive it anyway. */
function sriLankaOffset(forDate: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SRI_LANKA_TIME_ZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(forDate);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+05:30';
  const match = offset.match(/^GMT([+-])(\d{1,2}):(\d{2})$/);
  if (!match) return '+05:30';
  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, '0')}:${minutes}`;
}

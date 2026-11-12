/**
 * Every user-facing date/time in the portal renders in Sri Lanka time
 * (Asia/Colombo — Sri Jayawardenepura Kotte), regardless of the device,
 * browser or server timezone. Storage stays in UTC ISO; only display
 * and "today" boundaries are converted here.
 */

export const SRI_LANKA_TIME_ZONE = 'Asia/Colombo';

export const SINHALA_MONTHS_SHORT = [
  'ජන', 'පෙබ', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි',
  'ජූලි', 'අගෝ', 'සැප්', 'ඔක්', 'නොවැ', 'දෙසැ'
] as const;

export const SINHALA_MONTHS_FULL = [
  'ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි',
  'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'
] as const;

export const SINHALA_WEEKDAYS_SHORT = [
  'ඉරි', 'සඳු', 'අඟ', 'බදා', 'බ්‍රහස්', 'සිකු', 'සෙන'
] as const;

export const SINHALA_WEEKDAYS_NARROW = [
  'ඉ', 'ස', 'අ', 'බ', 'බ්‍ර', 'සි', 'සෙ'
] as const;

export const SINHALA_WEEKDAYS_FULL = [
  'ඉරිදා', 'සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා'
] as const;

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

type DisplayLanguage = 'en' | 'si';

const DISPLAY_LOCALE: Record<DisplayLanguage, { date: string; time: string }> = {
  en: { date: 'en-GB', time: 'en-US' },
  si: { date: 'si-LK', time: 'si-LK' },
};

let displayLanguage: DisplayLanguage = 'en';

export function getEffectiveLanguage(): DisplayLanguage {
  if (displayLanguage === 'si') return 'si';
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('spid.ui.language');
      if (stored === 'si') return 'si';
      if (document.cookie.includes('spid.ui.language=si')) return 'si';
    } catch {
      // ignore
    }
  }
  return displayLanguage;
}

const cachedDisplayFormatters = new Map<DisplayLanguage, { date: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>();

function displayFormatters() {
  const existing = cachedDisplayFormatters.get(displayLanguage);
  if (existing) return existing;
  const built = {
    date: new Intl.DateTimeFormat(DISPLAY_LOCALE[displayLanguage].date, DATE_OPTS),
    time: new Intl.DateTimeFormat(DISPLAY_LOCALE[displayLanguage].time, TIME_OPTS),
  };
  cachedDisplayFormatters.set(displayLanguage, built);
  return built;
}

/** Called by the client LanguageProvider when the officer switches language. */
export function setUiDisplayLanguage(language: DisplayLanguage): void {
  displayLanguage = language;
}

/**
 * Staff-facing Sinhala dates use Gregorian transliterations (සැප්තැම්බර්,
 * නොවැම්බර්, …) instead of the traditional Sinhala calendar names that
 * si-LK emits. English output is unchanged.
 */
const SINHALA_GREGORIAN_MONTHS = [
  'ජනවාරි',
  'පෙබරවාරි',
  'මාර්තු',
  'අප්‍රේල්',
  'මැයි',
  'ජූනි',
  'ජූලි',
  'අගෝස්තු',
  'සැප්තැම්බර්',
  'ඔක්තෝබර්',
  'නොවැම්බර්',
  'දෙසැම්බර්',
] as const;

const staffSiDateFormatter = new Intl.DateTimeFormat('si-LK', DATE_OPTS);
const staffSiMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  timeZone: SRI_LANKA_TIME_ZONE,
});

function sriLankaMonthIndex(value: Date): number {
  const month = staffSiMonthFormatter
    .formatToParts(value)
    .find((part) => part.type === 'month')?.value;
  const parsed = month ? Number(month) : NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(11, Math.max(0, parsed - 1));
}

function formatStaffSriLankaDateValue(value: Date): string {
  const monthIndex = sriLankaMonthIndex(value);
  return staffSiDateFormatter
    .formatToParts(value)
    .map((part) =>
      part.type === 'month' ? SINHALA_GREGORIAN_MONTHS[monthIndex] : part.value,
    )
    .join('');
}

/** "2026 සැප්තැම්බර් 15" in Sinhala UI; English keeps the existing format. */
export function formatStaffSriLankaDate(
  value: string | Date | null | undefined,
): string {
  const d = toDate(value);
  if (!d) return '—';
  if (displayLanguage !== 'si') return formatSriLankaDate(value);
  return formatStaffSriLankaDateValue(d);
}

/** Staff display variant of formatSriLankaDateTime with Gregorian Sinhala months. */
export function formatStaffSriLankaDateTime(
  value: string | Date | null | undefined,
): string {
  const d = toDate(value);
  if (!d) return '—';
  if (displayLanguage !== 'si') return formatSriLankaDateTime(value);
  const time = formatSriLankaTime(d);
  const date = formatStaffSriLankaDateValue(d);
  return time ? `${date} • ${time}` : date;
}

// Machine-readable formats stay locale-fixed: they feed <input type="date">,
// filenames, CSV columns and day-boundary queries, never a label.
const compactDateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: SRI_LANKA_TIME_ZONE,
});

const slPartsFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false,
  timeZone: SRI_LANKA_TIME_ZONE,
});

function getSriLankaParts(d: Date) {
  const parts = slPartsFormatter.formatToParts(d);
  const get = (type: string) => {
    const found = parts.find((p) => p.type === type);
    return found ? parseInt(found.value, 10) : 0;
  };
  return {
    year: get('year'),
    month: get('month'), // 1 - 12
    day: get('day'),     // 1 - 31
    hour24: get('hour') === 24 ? 0 : get('hour'), // 0 - 23
    minute: get('minute'), // 0 - 59
    second: get('second'), // 0 - 59
  };
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** "23 Oct 2026" / "2026 ඔක් 23" — falls back to '—' for missing/invalid values. */
export function formatSriLankaDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  if (getEffectiveLanguage() === 'si') {
    const p = getSriLankaParts(d);
    const monthName = SINHALA_MONTHS_SHORT[p.month - 1] ?? '';
    const dayStr = String(p.day).padStart(2, '0');
    return `${p.year} ${monthName} ${dayStr}`;
  }
  return displayFormatters().date.format(d);
}

/** "06:15 PM" / "ප.ව. 06:15" — falls back to an empty string for missing/invalid values. */
export function formatSriLankaTime(value: string | Date | null | undefined, includeSeconds = false): string {
  const d = toDate(value);
  if (!d) return '';
  if (getEffectiveLanguage() === 'si') {
    const p = getSriLankaParts(d);
    const period = p.hour24 < 12 ? 'පෙ.ව.' : 'ප.ව.';
    const h12 = p.hour24 % 12 || 12;
    const hStr = String(h12).padStart(2, '0');
    const mStr = String(p.minute).padStart(2, '0');
    if (includeSeconds) {
      const sStr = String(p.second).padStart(2, '0');
      return `${period} ${hStr}:${mStr}:${sStr}`;
    }
    return `${period} ${hStr}:${mStr}`;
  }
  if (includeSeconds) {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: SRI_LANKA_TIME_ZONE,
    }).format(d);
  }
  return displayFormatters().time.format(d);
}

/** "23 Oct 2026 • 06:15 PM" / "2026 ඔක් 23 • ප.ව. 06:15" */
export function formatSriLankaDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const date = formatSriLankaDate(d);
  const time = formatSriLankaTime(d);
  return time ? `${date} • ${time}` : date;
}

/** "2026-10-23 06:15 PM" — compact variant for ledgers, dashboards and CSV. */
export function formatSriLankaDateTimeCompact(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const parts = compactDateFormatter.formatToParts(d);
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
  const parts = compactDateFormatter.formatToParts(now);
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

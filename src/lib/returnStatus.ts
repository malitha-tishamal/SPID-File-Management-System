/**
 * Return-date status for issued files. Both the admin Issued Files page and the
 * staff "Your Requests" page need the same wording, so the calculation lives in
 * one place instead of being re-derived in each component.
 *
 * Due-date boundaries use the Sri Lanka calendar day, matching every other
 * user-facing date in the portal.
 */

import { formatSriLankaDateTimeCompact } from 'lib/datetime';

export type ReturnStatus = 'returned' | 'overdue' | 'due_today' | 'due_soon' | 'active';

export interface ReturnStatusResult {
  status: ReturnStatus;
  /** Whole calendar days until the due date; negative when overdue. */
  daysRemaining: number | null;
  /** "7 days remaining" / "Overdue by 3 days" / "Due today" / "Returned". */
  label: string;
  /** Tailwind classes for the badge, distinct per status. */
  badgeClass: string;
  isOverdue: boolean;
}

/** Calendar-day difference between a YYYY-MM-DD date and Sri Lanka "today". */
function utcMidnight(dateStr: string): number {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime();
}

function daysUntil(dateStr: string, now: Date): number {
  const due = utcMidnight(dateStr);
  if (isNaN(due)) return NaN;
  // Both sides are anchored to UTC midnight, so the difference is a whole
  // number of calendar days regardless of the host timezone.
  const today = utcMidnight(formatSriLankaDateTimeCompact(now).slice(0, 10));
  if (isNaN(today)) return NaN;
  return Math.round((due - today) / 86_400_000);
}

const TONE: Record<ReturnStatus, string> = {
  returned:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-50',
  overdue:
    'bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-50',
  due_today:
    'bg-amber-100 text-amber-900 dark:bg-amber-800 dark:text-amber-50',
  due_soon:
    'bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-50',
  active:
    'bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900 dark:text-brand-100',
};

/**
 * `expectedReturnDate` is the official (possibly extended) due date in
 * YYYY-MM-DD form; `returnedAt` is the recorded physical return timestamp.
 */
export function getReturnStatus(
  expectedReturnDate: string | null | undefined,
  returnedAt?: string | null,
  now: Date = new Date(),
): ReturnStatusResult {
  if (returnedAt) {
    return {
      status: 'returned',
      daysRemaining: null,
      label: 'Returned',
      badgeClass: TONE.returned,
      isOverdue: false,
    };
  }

  if (!expectedReturnDate) {
    return {
      status: 'active',
      daysRemaining: null,
      label: 'No return date set',
      badgeClass: TONE.active,
      isOverdue: false,
    };
  }

  const days = daysUntil(expectedReturnDate, now);

  if (isNaN(days)) {
    return {
      status: 'active',
      daysRemaining: null,
      label: 'No return date set',
      badgeClass: TONE.active,
      isOverdue: false,
    };
  }

  if (days < 0) {
    const n = Math.abs(days);
    return {
      status: 'overdue',
      daysRemaining: days,
      label: `Overdue by ${n} day${n === 1 ? '' : 's'}`,
      badgeClass: TONE.overdue,
      isOverdue: true,
    };
  }

  if (days === 0) {
    return {
      status: 'due_today',
      daysRemaining: 0,
      label: 'Due today',
      badgeClass: TONE.due_today,
      isOverdue: false,
    };
  }

  const soon = days <= 2 ? TONE.due_soon : TONE.active;
  return {
    status: days <= 2 ? 'due_soon' : 'active',
    daysRemaining: days,
    label: `${days} day${days === 1 ? '' : 's'} remaining`,
    badgeClass: soon,
    isOverdue: false,
  };
}

/** Add N days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDaysToDate(dateStr: string, days: number): string {
  const base = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (isNaN(base.getTime())) return dateStr;
  base.setUTCDate(base.getUTCDate() + Math.trunc(days));
  return base.toISOString().slice(0, 10);
}

/** True when the official due date differs from the original contractual one. */
export function isReturnDateExtended(
  originalReturnDate: string | null | undefined,
  expectedReturnDate: string | null | undefined,
): boolean {
  if (!originalReturnDate || !expectedReturnDate) return false;
  return expectedReturnDate.slice(0, 10) !== originalReturnDate.slice(0, 10);
}

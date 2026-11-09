/**
 * Shared vocabulary for a staff member's file-request history.
 *
 * The four "Your Requests" tabs are a presentation grouping on top of the
 * statuses the database actually stores (PENDING / APPROVED / REJECTED /
 * CANCELLED plus the issued/returned timestamps). Nothing here rewrites a
 * stored status — the tabs only decide which bucket a row belongs to, so the
 * admin ledger and audit trail keep their original values.
 */

import { isValidYmd } from 'lib/datetime';

export type StaffRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type StaffRequestTab = 'ongoing' | 'pending' | 'closed' | 'cancelled';

export type StaffRequestPriority = 'HIGH' | 'NORMAL' | 'LOW';

export type StaffRequestPriorityFilter = 'ALL' | StaffRequestPriority;

export interface StaffRequestTabMeta {
  id: StaffRequestTab;
  label: string;
  /** Shown inside the empty state when the tab has nothing to list. */
  emptyTitle: string;
  emptyBody: string;
}

export const STAFF_REQUEST_TABS: readonly StaffRequestTabMeta[] = [
  {
    id: 'ongoing',
    label: 'Ongoing',
    emptyTitle: 'No ongoing requests',
    emptyBody:
      'Approved files that are issued to you and not yet returned will appear here.',
  },
  {
    id: 'pending',
    label: 'Waiting for Approval',
    emptyTitle: 'Nothing waiting for approval',
    emptyBody:
      'Requests you submit from the Request a File page stay here until an administrator reviews them.',
  },
  {
    id: 'closed',
    label: 'Successfully Closed',
    emptyTitle: 'No closed requests yet',
    emptyBody:
      'Requests are closed once the physical file is returned to the record room.',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    emptyTitle: 'No cancelled requests',
    emptyBody:
      'Requests you cancel — and requests an administrator rejects — are kept here with their original status.',
  },
] as const;

export const STAFF_REQUEST_TAB_IDS = STAFF_REQUEST_TABS.map((tab) => tab.id);

export function isStaffRequestTab(
  value: string | null | undefined,
): value is StaffRequestTab {
  return (
    value === 'ongoing' ||
    value === 'pending' ||
    value === 'closed' ||
    value === 'cancelled'
  );
}

export function getStaffRequestTabMeta(tab: StaffRequestTab): StaffRequestTabMeta {
  return STAFF_REQUEST_TABS.find((item) => item.id === tab) ?? STAFF_REQUEST_TABS[0];
}

/**
 * Ongoing = approved and still out with the staff member.
 * Closed   = approved and physically returned.
 * Cancelled keeps rejected rows too, but the row itself still shows its
 * original REJECTED badge so staff can tell the two apart.
 */
export function requestTabOf(
  status: StaffRequestStatus | string,
  returnedAt?: string | null,
): StaffRequestTab {
  if (status === 'PENDING') return 'pending';
  if (status === 'APPROVED') return returnedAt ? 'closed' : 'ongoing';
  return 'cancelled';
}

export function isStaffRequestPriority(
  value: string | null | undefined,
): value is StaffRequestPriority {
  return value === 'HIGH' || value === 'NORMAL' || value === 'LOW';
}

export function parsePriorityFilter(
  value: string | null | undefined,
): StaffRequestPriorityFilter {
  const upper = String(value ?? 'ALL').toUpperCase();
  return isStaffRequestPriority(upper) ? upper : 'ALL';
}

/**
 * Search text is interpolated into a PostgREST `or(...)` filter, so the
 * grammar characters (comma, parentheses, `*`) and LIKE wildcards are removed
 * rather than escaped. Everything a file number or section name realistically
 * contains survives.
 */
export function sanitizeRequestSearch(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[,()*%_\\'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export interface RequestSearchableRow {
  id: number;
  file_no?: string | null;
  file_name?: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
}

function includesTerm(
  value: string | null | undefined,
  needle: string,
): boolean {
  return String(value ?? '').toLowerCase().includes(needle);
}

/**
 * Case-insensitive partial match over the fields an operator reads on a request
 * row: file number, file title, requester name, requester email, and the request
 * id. The id works with or without its '#' prefix, so '81', '#81' and 'de-12' all
 * narrow the same way. An empty term matches everything.
 */
export function matchesRequestSearch(
  row: RequestSearchableRow,
  term: string,
): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  const idDigits = needle.replace(/^#/, '');
  return (
    `#${row.id}`.includes(needle) ||
    (idDigits.length > 0 && String(row.id).includes(idDigits)) ||
    includesTerm(row.file_no, needle) ||
    includesTerm(row.file_name, needle) ||
    includesTerm(row.requester_name, needle) ||
    includesTerm(row.requester_email, needle)
  );
}

/** Trims a date input to a plain YYYY-MM-DD string, or '' when unusable. */
export function normalizeRequestDate(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim().slice(0, 10);
  if (!isValidYmd(trimmed)) return '';
  // Reject calendar-impossible values such as 2026-13-01 or 2026-02-30; they
  // would otherwise become Invalid Date when the day bounds are computed.
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return '';
  }
  return trimmed;
}

/** Returns an operator-facing error message, or '' when the range is usable. */
export function validateRequestDateRange(
  dateFrom: string,
  dateTo: string,
): string {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return 'The start date cannot be later than the end date.';
  }
  return '';
}

export interface StaffRequestsQueryInput {
  tab: StaffRequestTab;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  priority?: StaffRequestPriorityFilter;
  page?: number;
  limit?: number;
}

/**
 * Canonical query string for the list endpoint. Used both for the fetch URL
 * and as the per-tab cache key, so identical filter states always line up.
 */
export function buildStaffRequestsQuery(input: StaffRequestsQueryInput): string {
  const params = new URLSearchParams();
  params.set('tab', input.tab);
  const search = sanitizeRequestSearch(input.search);
  if (search) params.set('search', search);
  if (input.dateFrom) params.set('date_from', input.dateFrom);
  if (input.dateTo) params.set('date_to', input.dateTo);
  if (input.priority && input.priority !== 'ALL') {
    params.set('priority', input.priority);
  }
  params.set('page', String(input.page && input.page > 0 ? input.page : 1));
  params.set('limit', String(input.limit && input.limit > 0 ? input.limit : 10));
  return params.toString();
}

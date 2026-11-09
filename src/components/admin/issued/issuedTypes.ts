/**
 * Client-side shapes for the admin Issued Files page.
 *
 * The endpoints (`GET /api/admin/issued-files`,
 * `GET /api/admin/file-request-extensions`) decorate approved
 * `staff_file_requests` rows with the return-status fields, so the page only
 * needs the payload contract — never a server model import.
 */

export type IssuedView = 'active' | 'overdue' | 'returned';

export type ReturnStatusCode =
  | 'returned'
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'active';

export interface IssuedFileRow {
  id: number;
  file_id: number | null;
  file_no: string;
  file_name: string;
  section_name: string;
  storage_location: string;
  requester_id: string;
  /** Snapshot name captured at request time; display sites handle nulls. */
  requester_name: string | null;
  requester_email: string | null;
  requester_section: string | null;
  /** Soft-delete markers from migration 0027; undefined on older deployments. */
  requester_is_deleted?: boolean;
  reviewer_is_deleted?: boolean;
  return_recorded_by_is_deleted?: boolean;
  request_date: string | null;
  duration_days: number | null;
  priority: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  original_return_date: string | null;
  expected_return_date: string | null;
  issued_at: string | null;
  returned_at: string | null;
  returned_by: string | null;
  created_at: string | null;
  /** Computed by the server via lib/returnStatus. */
  return_status: ReturnStatusCode;
  /** "7 days remaining" / "Due today" / "Overdue by 3 days" / "Returned". */
  return_label: string;
  days_remaining: number | null;
  is_overdue: boolean;
  is_extended: boolean;
}

export interface IssuedFilesCounts {
  active: number;
  overdue: number;
  returned: number;
  extended: number;
}

export interface FileExtensionRow {
  id: number;
  request_id: number;
  file_no: string;
  file_name: string;
  previous_return_date: string | null;
  new_return_date: string | null;
  reason: string | null;
  status: string;
  requested_by: string | null;
  requested_by_name: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  /** Soft-delete markers from migration 0027; undefined on older deployments. */
  requester_is_deleted?: boolean;
  reviewer_is_deleted?: boolean;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
  requester_name: string | null;
  requester_section: string | null;
  current_return_date: string | null;
}

/**
 * Badge tones for the return-status column. Mirrors `TONE` in
 * `lib/returnStatus.ts` but adds the pill borders used by the Record Room
 * tables, so "extended" (a brand pill on the date cell) is never mistaken
 * for "overdue" (a rose pill here).
 */
export const RETURN_BADGE_CLASS: Record<ReturnStatusCode, string> = {
  returned:
    'bg-[#E6F9F0] text-[#05CD99] border border-[#C6F6D5] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  overdue:
    'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  due_today:
    'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  due_soon:
    'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
  active:
    'bg-[#F4F2FF] text-[#4318FF] border border-[#E0E5F2] dark:bg-brand-900/40 dark:text-brand-300 dark:border-navy-700',
};

export const EXTENSION_STATUS_BADGE_CLASS: Record<string, string> = {
  APPROVED:
    'bg-[#E6F9F0] text-[#05CD99] border border-[#C6F6D5] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  PENDING:
    'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  REJECTED:
    'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
};

/** Section pill colours, identical to the Record Room file tables. */
export function getSectionBadge(section?: string | null): string {
  const s = (section || '').toLowerCase();
  if (s.includes('legal') || s.includes('contract')) {
    return 'bg-[#FAF5FF] text-[#A855F7] border-[#F3E8FF] dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
  }
  if (s.includes('land') || s.includes('hydrology') || s.includes('water')) {
    return 'bg-[#ECFDF5] text-[#05CD99] border-[#A7F3D0] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (s.includes('engineering') || s.includes('irrigation')) {
    return 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE] dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (s.includes('finance') || s.includes('account') || s.includes('audit')) {
    return 'bg-[#F0F9FF] text-[#0284C7] border-[#BAE6FD] dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  }
  if (s.includes('hr') || s.includes('admin')) {
    return 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  return 'bg-[#F4F7FE] text-[#4318FF] border-[#E0E5F2] dark:bg-navy-900 dark:text-brand-300 dark:border-navy-700';
}

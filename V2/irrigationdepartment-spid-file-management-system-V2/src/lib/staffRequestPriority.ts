/**
 * Priority vocabulary shared by the staff request form, the API controller and
 * the database function `staff_submit_file_request`.
 *
 * The database stays the source of truth: it re-checks every rule inside the
 * submission transaction. These helpers exist so the form can explain the
 * outcome before calling the API and render the same wording as the server.
 */

import type { StaffRequestPriority } from 'lib/staffRequests';

export const STAFF_REQUEST_PRIORITY_WEIGHT: Record<StaffRequestPriority, number> = {
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

/** Positive when `left` outranks `right`, negative when it does not. */
export function compareStaffRequestPriority(
  left: StaffRequestPriority,
  right: StaffRequestPriority,
): number {
  return STAFF_REQUEST_PRIORITY_WEIGHT[left] - STAFF_REQUEST_PRIORITY_WEIGHT[right];
}

export type PendingPriorityVerdict = 'duplicate' | 'upgrade' | 'blocked';

/**
 * What submitting `requested` means while `existing` is still pending:
 * - duplicate: same priority, refuse the submission
 * - upgrade: higher priority, cancel the old request and replace it
 * - blocked: lower priority, refuse without touching the existing request
 */
export function classifyPendingPriority(
  existing: StaffRequestPriority,
  requested: StaffRequestPriority,
): PendingPriorityVerdict {
  const comparison = compareStaffRequestPriority(requested, existing);
  if (comparison === 0) return 'duplicate';
  return comparison > 0 ? 'upgrade' : 'blocked';
}

export function isPriorityUpgrade(
  existing: StaffRequestPriority,
  requested: StaffRequestPriority,
): boolean {
  return compareStaffRequestPriority(requested, existing) > 0;
}

export const PRIORITY_REPLACEMENT_REASON = 'Replaced by higher-priority request';

export const REQUEST_CONFLICT_MESSAGES = {
  duplicate:
    'You have already submitted a pending request for this file with the same priority. Please wait for administrator approval or review your existing request.',
  lowerPriority:
    'You already have a pending request for this file with a higher priority. You cannot submit another request with a lower priority while the existing request is active.',
  upgrade:
    'You already have a pending request for this file with a lower priority. Submitting this new request with a higher priority will automatically cancel your previous pending request and replace it with the new request.',
  upgraded:
    'Your previous request has been cancelled, and a new request with higher priority has been submitted successfully.',
  upgradeRequired:
    'A pending request for this file already exists. Confirm the priority upgrade before submitting again.',
  upgradeStale:
    'Your existing pending request changed while you were confirming. Review your requests and try again.',
} as const;

/** Row shape of the caller's own pending request for one file. */
export interface OwnPendingRequest {
  id: number;
  file_id?: number;
  file_no: string;
  file_name: string;
  request_date: string;
  duration_days: number;
  priority: StaffRequestPriority;
  status?: string;
  created_at: string;
}

export type RequestConflictKind =
  | 'duplicate'
  | 'lower_priority'
  | 'upgrade_required'
  | 'upgrade_stale'
  | 'already_issued';

export interface RequestConflictPayload {
  kind: RequestConflictKind;
  request: OwnPendingRequest | null;
}

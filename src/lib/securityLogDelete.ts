import type { SecurityLogCategory } from 'models/SecurityLogRepository';

/**
 * Shared rules for security-log deletion. Used by the API routes (authoritative)
 * and mirrored by the page UI (preview/confirm).
 */

/** Action recorded for every deletion — protected from deletion itself. */
export const SECURITY_LOG_DELETED_ACTION = 'SECURITY_LOG_DELETED';
export const SECURITY_LOG_RESTORED_ACTION = 'SECURITY_LOG_RESTORED';

/** Malware evidence is only removed when explicitly requested. */
export const MALWARE_ACTION = 'security.malware_detected';

export const DELETE_AGE_OPTIONS = [30, 90, 365] as const;
export type DeleteAgeDays = (typeof DELETE_AGE_OPTIONS)[number];

export const MAX_DELETE_IDS = 500;

const CATEGORY_ACTIONS: Record<Exclude<SecurityLogCategory, 'all' | 'deleted'>, string[]> = {
  uploads: [
    'security.upload_initiated',
    'security.file_validation_failed',
    'security.upload_clean',
  ],
  scans: ['security.scan_started', 'security.scan_failed'],
  malware: [MALWARE_ACTION],
  imports: ['security.import_completed', 'security.import_validation_failed'],
};

/** Deletion-record rows can never be deleted or restored through the API. */
export function isProtectedLogAction(action: string | null | undefined): boolean {
  return action === SECURITY_LOG_DELETED_ACTION;
}

/** Maps a UI tab to the action whitelist; 'all' => every security.* action. */
export function categoryToActions(
  category: SecurityLogCategory | string,
): string[] | null {
  if (category === 'all' || category === 'deleted') return null;
  return CATEGORY_ACTIONS[category as Exclude<SecurityLogCategory, 'all' | 'deleted'>] ?? null;
}

export interface DeleteLogsRequest {
  /** Explicit ids (single or bulk). Mutually exclusive with clear mode. */
  ids?: number[];
  /** Clear mode: tab filter. */
  category?: string;
  /** Clear mode: 30 | 90 | 365 days, or 0/null for "everything matching". */
  olderThanDays?: number | null;
  includeMalware?: boolean;
  includeRecent?: boolean;
  reason?: string;
}

export type ParsedDeleteRequest =
  | { mode: 'ids'; ids: number[] }
  | {
      mode: 'clear';
      actions: string[] | null;
      olderThan: string | null; // Postgres interval literal
      includeMalware: boolean;
      includeRecent: boolean;
    }
  | { mode: 'error'; message: string };

function toInterval(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  if (!Number.isInteger(days) || days < 0) return 'INVALID';
  if (days === 0) return '0 seconds';
  if (![...DELETE_AGE_OPTIONS].includes(days as DeleteAgeDays)) return 'INVALID';
  return `${days} days`;
}

/**
 * Validates a delete request body. Returns either explicit ids or a clear
 * filter; anything else is an error the route turns into a 400.
 */
export function parseDeleteLogsRequest(body: unknown): ParsedDeleteRequest {
  const input = (body ?? {}) as DeleteLogsRequest;

  if (Array.isArray(input.ids)) {
    const ids = input.ids
      .map((v) => Number(v))
      .filter((v) => Number.isSafeInteger(v) && v > 0);
    if (ids.length === 0) return { mode: 'error', message: 'No valid ids supplied.' };
    if (ids.length > MAX_DELETE_IDS)
      return { mode: 'error', message: `At most ${MAX_DELETE_IDS} ids per request.` };
    return { mode: 'ids', ids: Array.from(new Set(ids)) };
  }

  // Clear mode requires an explicit age choice (or 0 = everything matching).
  const olderThan = toInterval(input.olderThanDays);
  if (olderThan === 'INVALID')
    return { mode: 'error', message: 'Invalid olderThanDays value.' };
  if (olderThan === null)
    return { mode: 'error', message: 'Clear mode requires olderThanDays (0, 30, 90 or 365).' };

  return {
    mode: 'clear',
    actions: categoryToActions(String(input.category ?? 'all')),
    olderThan,
    includeMalware: input.includeMalware === true,
    includeRecent: input.includeRecent === true,
  };
}

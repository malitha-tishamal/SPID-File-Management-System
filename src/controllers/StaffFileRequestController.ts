import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { isUniqueViolation } from 'models/FileRepository';
import {
  notifyAdminsForRequest,
  notifyRequestOutcome,
  resolveRequestNotifications,
} from 'lib/notifications';
import { addDaysToDate } from 'lib/returnStatus';
import { sriLankaDayEndIso, sriLankaDayStartIso } from 'lib/datetime';
import {
  isStaffRequestTab,
  normalizeRequestDate,
  parsePriorityFilter,
  sanitizeRequestSearch,
  validateRequestDateRange,
  type StaffRequestTab,
} from 'lib/staffRequests';
import {
  REQUEST_CONFLICT_MESSAGES,
  STAFF_REQUEST_PRIORITY_WEIGHT,
  type RequestConflictKind,
} from 'lib/staffRequestPriority';
import {
  isDeletedAuthor,
  visibleAuthorEmail,
  type AttributionProfile,
} from 'lib/userAttribution';
import {
  getCompetingInfo,
  sortByCompetingRank,
  type CompetingInfo,
  type CompetingRequestInput,
} from 'lib/competing-requests';

/**
 * A pending row `checkCompeting` ranks. The ranking only needs the base fields;
 * the requester columns ride along because the staff notice separates "my
 * request is in line" from "someone else is waiting".
 */
interface CompetingCheckRow extends CompetingRequestInput {
  requester_id: string | null;
  requester_name: string;
  requester_section: string | null;
}

const REQUEST_SELECT =
  'id, file_id, file_no, file_name, section_name, storage_location, requester_id, requester_name, requester_email, requester_role, requester_section, request_date, duration_days, priority, status, admin_notes, cancellation_reason, reviewed_by, reviewed_at, original_return_date, expected_return_date, issued_at, returned_at, returned_by, created_at';

/**
 * Second admin action on an already-reviewed request: 409 with who handled it
 * and when, so the UI can show "Already approved by …" instead of a generic
 * error. The status check inside the update (`.eq('status','PENDING')`) keeps
 * this race-safe — only one reviewer can win.
 */
async function throwAlreadyHandled(
  admin: SupabaseClient,
  row: {
    id: number;
    status: string;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
  },
): Promise<never> {
  let handledBy: string | null = null;
  if (row.reviewed_by) {
    const { data: reviewer } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', row.reviewed_by)
      .maybeSingle();
    handledBy = reviewer?.full_name || reviewer?.email || null;
  }
  throw new ApiError(
    409,
    'REQUEST_ALREADY_HANDLED',
    `This file request was already ${String(row.status).toLowerCase()}.`,
    {
      handledBy,
      handledAt: row.reviewed_at ?? null,
      status: row.status,
    },
  );
}

/**
 * Migrations 0017 and 0021 add columns this module selects. PostgREST answers
 * with a clear cache/column error when they are missing, so surface the exact
 * remediation instead of a generic failure.
 */
function throwIfRequestColumnsMissing(error: { code?: string; message?: string }): void {
  const message = String(error.message || '');
  const isMissingColumn =
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /could not find the column|column .* does not exist/i.test(message);
  if (!isMissingColumn) return;

  if (
    /expected_return_date|returned_at|issued_at|original_return_date|returned_by/.test(message)
  ) {
    throw new ApiError(
      503,
      'CONFIG_ERROR',
      'Issuance tracking columns are missing. Apply Supabase migration 0017_issuance_return_extensions_notifications.sql, then try again.',
    );
  }
  if (/cancellation_reason/.test(message)) {
    throw new ApiError(
      503,
      'CONFIG_ERROR',
      'Request cancellation tracking is missing. Apply Supabase migration 0021_staff_request_priority_upgrade.sql, then try again.',
    );
  }
}

/**
 * The submission RPC is what enforces the duplicate and priority rules
 * atomically. Without it a plain insert would bypass them, so refuse instead.
 */
function throwIfSubmitFunctionMissing(error: { code?: string; message?: string }): void {
  const message = String(error.message || '');
  if (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|function .* does not exist/i.test(message)
  ) {
    throw new ApiError(
      503,
      'CONFIG_ERROR',
      'Priority-aware file requests are not configured. Apply Supabase migration 0021_staff_request_priority_upgrade.sql, then try again.',
    );
  }
}

/** Contractual return date: the approved request date plus the agreed duration. */
function computeReturnDate(requestDate: string, durationDays: number): string {
  return addDaysToDate(String(requestDate).slice(0, 10), Number(durationDays) || 0);
}

/** Who physically holds the file right now, read from the live issuance row. */
export interface ActiveIssuance {
  request_id: number;
  file_no: string;
  file_name: string;
  holder_id: string;
  holder_name: string;
  issued_at: string | null;
  expected_return_date: string | null;
}

const ISSUANCE_SELECT =
  'id, file_no, file_name, requester_id, requester_name, issued_at, reviewed_at, expected_return_date';

/**
 * An approved request that has not been returned is the file's active
 * issuance. `excludeRequestId` keeps re-reviewing the same row from counting
 * as a conflict with itself.
 */
async function findActiveIssuance(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  target: { file_id?: number | null; file_no?: string | null } | number,
  excludeRequestId?: number,
): Promise<ActiveIssuance | null> {
  const fileId = typeof target === 'number' ? target : Number(target?.file_id);
  const fileNo = typeof target === 'object' && target?.file_no ? String(target.file_no).trim() : null;

  let query = admin
    .from('staff_file_requests')
    .select(ISSUANCE_SELECT)
    .eq('status', 'APPROVED')
    .is('returned_at', null)
    .order('issued_at', { ascending: false, nullsFirst: false })
    .limit(5);

  if (Number.isSafeInteger(fileId) && fileId > 0) {
    query = query.eq('file_id', fileId);
  } else if (fileNo) {
    query = query.eq('file_no', fileNo);
  } else {
    return null;
  }

  const { data, error } = await query;

  if (error) {
    throwIfRequestsTableMissing(error);
    throwIfRequestColumnsMissing(error);
    throw error;
  }

  const row = (data ?? []).find((item: any) => item.id !== excludeRequestId);
  if (!row) return null;

  return {
    request_id: row.id,
    file_no: row.file_no,
    file_name: row.file_name,
    holder_id: row.requester_id,
    holder_name: row.requester_name,
    issued_at: row.issued_at || row.reviewed_at || null,
    expected_return_date: row.expected_return_date || null,
  };
}

/** 409 payload the Admin "File Currently Issued" modal renders from. */
function fileIssuedConflict(holder: ActiveIssuance) {
  return new ApiError(
    409,
    'REQUEST_CONFLICT',
    'This file is currently issued to another staff member and cannot be approved until it is returned.',
    { reason: 'file_currently_issued', issuance: holder },
  );
}

/** Enough fields for the shared ranking plus the words a refusal needs. */
const GROUP_SELECT =
  'id, file_id, file_no, priority, status, created_at, request_date, requester_id, requester_name';

/**
 * Every pending request competing for the same file as `target`. The whole
 * group is read from the table rather than taken from a page of results, so a
 * filtered or paginated list can never rank against an incomplete set.
 */
async function findPendingGroup(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  target: { file_id?: number | null; file_no?: string | null },
): Promise<Record<string, any>[]> {
  const fileId = Number(target.file_id);
  const query = admin
    .from('staff_file_requests')
    .select(GROUP_SELECT)
    .eq('status', 'PENDING');

  if (Number.isSafeInteger(fileId) && fileId > 0) {
    const { data, error } = await query.eq('file_id', fileId);
    if (error) throw error;
    return (data ?? []) as Record<string, any>[];
  }

  const fileNo = String(target.file_no ?? '').trim();
  if (!fileNo) return [];
  const { data, error } = await query.eq('file_no', fileNo);
  if (error) throw error;
  return (data ?? []) as Record<string, any>[];
}

/** Rank 0 of a group, i.e. the request the approve API accepts. */
function leaderOf(
  group: readonly CompetingRequestInput[],
  info: Map<number, CompetingInfo>,
): Record<string, any> | null {
  const leader = group.find(
    (row) => info.get(Number(row.id))?.rank === 0,
  ) as Record<string, any> | undefined;
  return leader ?? null;
}

const REQUEST_PRIORITIES = ['HIGH', 'NORMAL', 'LOW'] as const;
type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

function isRequestPriority(value: string): value is RequestPriority {
  return REQUEST_PRIORITIES.some((priority) => priority === value);
}

/** HIGH first, then NORMAL, then LOW. An unreadable value ranks last. */
function priorityWeightOf(priority: unknown): number {
  return STAFF_REQUEST_PRIORITY_WEIGHT[priority as RequestPriority] ?? -1;
}

type SubmitOutcome =
  | 'created'
  | 'upgraded'
  | 'duplicate_same_priority'
  | 'blocked_lower_priority'
  | 'upgrade_required'
  | 'upgrade_conflict'
  | 'already_issued'
  | 'file_not_found'
  | 'file_unavailable'
  | 'invalid_priority'
  | 'invalid_duration'
  | 'invalid_date'
  | 'forbidden';

interface SubmitResult {
  outcome: SubmitOutcome;
  request?: Record<string, any> | null;
  cancelled_request_id?: number | null;
}

function throwIfRequestsTableMissing(error: {
  code?: string;
  message?: string;
}): void {
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message?.includes('staff_file_requests') &&
      error.message.toLowerCase().includes('schema cache'))
  ) {
    console.error('Staff file requests table is unavailable:', error);
    throw new ApiError(
      503,
      'CONFIG_ERROR',
      'Staff file requests are not configured. Apply Supabase migrations 0011_staff_file_requests.sql, 0012_unlimited_file_request_duration.sql, 0013_file_request_priority.sql, 0014_files_composite_identity.sql, and 0015_cancel_staff_file_requests.sql, then try again.',
    );
  }
}

const STAFF_REQUEST_PAGE_DEFAULT = 10;
const STAFF_REQUEST_PAGE_MAX = 50;

interface StaffRequestListFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  priority: '' | 'HIGH' | 'NORMAL' | 'LOW';
}

/**
 * The four staff tabs are filters over the stored statuses; they never change
 * the value written to the database. Rejected requests stay REJECTED so the
 * row can still show its original badge inside the Cancelled tab.
 */
function applyTabFilter(builder: any, tab: StaffRequestTab): any {
  switch (tab) {
    case 'pending':
      return builder.eq('status', 'PENDING');
    case 'closed':
      return builder.eq('status', 'APPROVED').not('returned_at', 'is', null);
    case 'cancelled':
      return builder.in('status', ['CANCELLED', 'REJECTED']);
    case 'ongoing':
    default:
      return builder.eq('status', 'APPROVED').is('returned_at', null);
  }
}

/** Search, submission-date range and priority are shared by every tab. */
function applyListFilters(builder: any, filters: StaffRequestListFilters): any {
  let query = builder;
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(
      `file_no.ilike.${term},file_name.ilike.${term},section_name.ilike.${term}`,
    );
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', sriLankaDayStartIso(filters.dateFrom));
  }
  if (filters.dateTo) {
    query = query.lte('created_at', sriLankaDayEndIso(filters.dateTo));
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }
  return query;
}

/** Ongoing rows closest to their due date surface first. */
function applyTabOrder(builder: any, tab: StaffRequestTab): any {
  switch (tab) {
    case 'ongoing':
      return builder
        .order('expected_return_date', { ascending: true })
        .order('created_at', { ascending: false });
    case 'closed':
      return builder.order('returned_at', { ascending: false });
    default:
      return builder.order('created_at', { ascending: false });
  }
}

export class StaffFileRequestController {
  /** Owner-scoped attach of reviewer names and extension history for a page of rows. */
  private static async enrichRequests(
    admin: ReturnType<typeof getSupabaseAdminClient>,
    rows: Record<string, any>[],
  ): Promise<Record<string, any>[]> {
    if (rows.length === 0) return [];

    // Soft-deleted accounts stay joinable so history keeps its attribution; the
    // flags tell the UI to mark the name instead of hiding the row.
    const profileIds = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.reviewed_by, row.requester_id])
          .filter((id) => Boolean(id)),
      ),
    );
    const requestIds = rows
      .map((row) => row.id)
      .filter((id) => typeof id === 'number');

    const fileIds = Array.from(
      new Set(
        rows
          .map((row) => Number(row.file_id))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    );

    const [reviewersRes, extensionsRes, groupRes] = await Promise.all([
      profileIds.length > 0
        ? admin.from('profiles').select('id, full_name, email, is_deleted').in('id', profileIds)
        : Promise.resolve({ data: [] as Record<string, any>[], error: null }),
      requestIds.length > 0
        ? admin
            .from('file_request_extensions')
            .select(
              'id, request_id, previous_return_date, new_return_date, reason, status, reviewed_by_name, reviewed_at, review_note, created_at',
            )
            .in('request_id', requestIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as Record<string, any>[], error: null }),
      // The full competing group, so a paged list still ranks every row that
      // shares a file with a request off this page.
      fileIds.length > 0
        ? admin
            .from('staff_file_requests')
            .select(GROUP_SELECT)
            .in('file_id', fileIds)
            .eq('status', 'PENDING')
        : Promise.resolve({ data: [] as Record<string, any>[], error: null }),
    ]);

    const profileMap = new Map<string, AttributionProfile>();
    for (const reviewer of (reviewersRes as { data?: AttributionProfile[] }).data ?? []) {
      profileMap.set(reviewer.id, reviewer);
    }
    const extensionRows = ((extensionsRes as { data?: Record<string, any>[] }).data ??
      []) as Record<string, any>[];

    const competingById = getCompetingInfo([
      ...(((groupRes as { data?: Record<string, any>[] }).data ??
        []) as CompetingRequestInput[]),
      // Rows that carry no file id can only be grouped by their file number.
      ...rows.filter(
        (row) => !Number.isSafeInteger(Number(row.file_id)) || Number(row.file_id) <= 0,
      ) as CompetingRequestInput[],
    ]);

    return rows.map((req) => {
      const own = extensionRows.filter((row) => row.request_id === req.id);
      return {
        ...req,
        competing: competingById.get(Number(req.id)) ?? null,
        reviewer_name: req.reviewed_by
          ? profileMap.get(req.reviewed_by)?.full_name || 'Administrator'
          : null,
        reviewer_email: visibleAuthorEmail(profileMap, req.reviewed_by),
        reviewer_is_deleted: isDeletedAuthor(profileMap, req.reviewed_by),
        requester_is_deleted: isDeletedAuthor(profileMap, req.requester_id),
        pending_extension: own.find((row) => row.status === 'PENDING') || null,
        extension_history: own.filter((row) => row.status !== 'PENDING'),
        extension_count: own.filter((row) => row.status === 'APPROVED').length,
      };
    });
  }

  static async create(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    if (profile.role !== 'Staff') {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Only staff members can request archive files.',
      );
    }

    const body = await req.json().catch(() => null);
    if (!body)
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const fileId = Number(body.file_id);
    const requestDate = String(body.request_date ?? '');
    const durationDays = Number(body.duration_days);
    const priority =
      typeof body.priority === 'string'
        ? body.priority.toUpperCase()
        : 'NORMAL';
    const customFileName =
      typeof body.file_name === 'string' ? body.file_name.trim() : '';
    const replaceRequestId =
      body.replace_request_id === undefined ||
      body.replace_request_id === null ||
      body.replace_request_id === ''
        ? null
        : Number(body.replace_request_id);
    if (!Number.isSafeInteger(fileId) || fileId < 1) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Select a registered file.');
    }
    if (
      replaceRequestId !== null &&
      (!Number.isSafeInteger(replaceRequestId) || replaceRequestId < 1)
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Invalid request to replace.',
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Choose a valid request date.',
      );
    }
    const parsedDate = new Date(`${requestDate}T00:00:00Z`);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== requestDate
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Choose a valid request date.',
      );
    }
    if (requestDate < new Date().toISOString().slice(0, 10)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The request date cannot be in the past.',
      );
    }
    if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Requested duration must be a positive whole number of days.',
      );
    }
    if (!isRequestPriority(priority)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Choose a valid request priority.',
      );
    }

    const admin = getSupabaseAdminClient();

    // One transaction in the database decides between create, replace and
    // refuse, so a duplicate or a failed replacement can never leave the
    // previous request incorrectly cancelled.
    const { data: submitData, error: submitError } = await admin.rpc(
      'staff_submit_file_request',
      {
        p_requester_id: profile.id,
        p_file_id: fileId,
        p_request_date: requestDate,
        p_duration_days: durationDays,
        p_priority: priority,
        p_file_name: customFileName || null,
        p_replace_request_id: replaceRequestId,
      },
    );
    if (submitError) {
      throwIfSubmitFunctionMissing(submitError);
      throw submitError;
    }

    const result = (submitData ?? {}) as SubmitResult;
    const conflictRequest = result.request ?? null;
    const conflict = (kind: RequestConflictKind) => ({
      conflict: { kind, request: conflictRequest },
    });

    switch (result.outcome) {
      case 'created':
      case 'upgraded': {
        const request = result.request;
        if (!request) {
          throw new ApiError(
            500,
            'INTERNAL_ERROR',
            'The request was saved but could not be returned. Refresh your requests.',
          );
        }
        const upgraded = result.outcome === 'upgraded';

        try {
          await new AuditLogRepository(admin).log({
            actorId: profile.id,
            action: upgraded
              ? 'file.checkout_request_priority_upgraded'
              : 'file.checkout_requested',
            details: {
              request_id: request.id,
              replaced_request_id: result.cancelled_request_id ?? null,
              file_id: request.file_id,
              file_no: request.file_no,
              duration_days: durationDays,
              priority,
            },
          });
        } catch (auditError) {
          console.warn(
            'Failed to record file checkout request audit log:',
            auditError,
          );
        }

        await notifyAdminsForRequest(admin, {
          kind: 'FILE_ISSUE_REQUESTED',
          refType: 'staff_file_request',
          refId: Number(request.id),
          title: upgraded
            ? 'Staff file request priority upgraded'
            : 'New staff file request',
          body: upgraded
            ? `${profile.full_name} upgraded ${request.file_no} — ${request.file_name} to ${priority} priority. The previous pending request was cancelled.`
            : `${profile.full_name} requested ${request.file_no} — ${request.file_name} for ${durationDays} day${durationDays === 1 ? '' : 's'}.`,
          titleKey: upgraded
            ? 'content.priorityUpgradedTitle'
            : 'content.newRequestTitle',
          bodyKey: upgraded
            ? 'content.priorityUpgradedBody'
            : 'content.newRequestBody',
          params: upgraded
            ? {
                staffName: profile.full_name,
                fileNo: request.file_no,
                fileName: request.file_name,
                priority,
              }
            : {
                staffName: profile.full_name,
                fileNo: request.file_no,
                fileName: request.file_name,
                days: durationDays,
              },
          type: 'info',
          link: `/admin/staff-file-request?tab=pending&request=${request.id}`,
          dedupeKey: `file-request:${request.id}:submitted`,
        });

        // A priority upgrade cancels the member's earlier pending request —
        // its admin notifications resolve as CANCELLED so they do not linger.
        if (result.cancelled_request_id) {
          await resolveRequestNotifications(admin, {
            refType: 'staff_file_request',
            refId: Number(result.cancelled_request_id),
            resolution: 'CANCELLED',
            resolvedById: profile.id,
            resolvedByName: profile.full_name || profile.email || null,
          });
        }

        return jsonOk(
          {
            request,
            upgraded,
            cancelled_request_id: result.cancelled_request_id ?? null,
            message: upgraded
              ? REQUEST_CONFLICT_MESSAGES.upgraded
              : 'Your file request has been sent to all administrators for review.',
          },
          201,
        );
      }
      case 'duplicate_same_priority':
        throw new ApiError(
          409,
          'DUPLICATE_REQUEST',
          REQUEST_CONFLICT_MESSAGES.duplicate,
          conflict('duplicate'),
        );
      case 'blocked_lower_priority':
        throw new ApiError(
          409,
          'REQUEST_CONFLICT',
          REQUEST_CONFLICT_MESSAGES.lowerPriority,
          conflict('lower_priority'),
        );
      case 'upgrade_required':
        throw new ApiError(
          409,
          'REQUEST_CONFLICT',
          REQUEST_CONFLICT_MESSAGES.upgradeRequired,
          conflict('upgrade_required'),
        );
      case 'upgrade_conflict':
        throw new ApiError(
          409,
          'REQUEST_CONFLICT',
          REQUEST_CONFLICT_MESSAGES.upgradeStale,
          conflict('upgrade_stale'),
        );
      case 'already_issued':
        throw new ApiError(
          409,
          'DUPLICATE_REQUEST',
          `File ${conflictRequest?.file_no ?? 'this file'} is already approved and issued to you.`,
          conflict('already_issued'),
        );
      case 'file_not_found':
      case 'file_unavailable':
        throw new ApiError(
          404,
          'NOT_FOUND',
          'That file is not currently available to request.',
        );
      case 'forbidden':
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Only staff members can request archive files.',
        );
      case 'invalid_priority':
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Choose a valid request priority.',
        );
      case 'invalid_duration':
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Requested duration must be a positive whole number of days.',
        );
      case 'invalid_date':
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Choose a valid request date.',
        );
      default:
        throw new ApiError(
          500,
          'INTERNAL_ERROR',
          'The request could not be processed. Please try again.',
        );
    }
  }

  /**
   * GET /api/staff/file-requests
   *
   * Returns only the signed-in staff member's own requests, one tab at a time.
   * `?request=<id>` is the notification deep-link lookup and returns exactly
   * that record (still owner-scoped) so a link never depends on which tab or
   * page happens to be open.
   */
  static async listMine(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    const admin = getSupabaseAdminClient();
    const url = new URL(req.url);

    const focusId = Number(url.searchParams.get('request'));
    if (Number.isSafeInteger(focusId) && focusId > 0) {
      const { data, error } = await admin
        .from('staff_file_requests')
        .select(REQUEST_SELECT)
        .eq('requester_id', profile.id)
        .eq('id', focusId)
        .maybeSingle();
      if (error) {
        throwIfRequestsTableMissing(error);
        throwIfRequestColumnsMissing(error);
        throw error;
      }
      const [request] = data
        ? await StaffFileRequestController.enrichRequests(admin, [data])
        : [];
      return jsonOk({
        requests: request ? [request] : [],
        counts: null,
        total: request ? 1 : 0,
        page: 1,
        limit: 1,
        totalPages: request ? 1 : 0,
      });
    }

    const rawTab = url.searchParams.get('tab');
    const tab: StaffRequestTab = isStaffRequestTab(rawTab) ? rawTab : 'ongoing';
    const search = sanitizeRequestSearch(url.searchParams.get('search'));
    const dateFrom = normalizeRequestDate(url.searchParams.get('date_from'));
    const dateTo = normalizeRequestDate(url.searchParams.get('date_to'));
    const rangeError = validateRequestDateRange(dateFrom, dateTo);
    if (rangeError) {
      throw new ApiError(400, 'VALIDATION_ERROR', rangeError);
    }
    const priority = parsePriorityFilter(url.searchParams.get('priority'));
    const filters: StaffRequestListFilters = {
      search,
      dateFrom,
      dateTo,
      priority: priority === 'ALL' ? '' : priority,
    };

    const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
    const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, STAFF_REQUEST_PAGE_MAX)
        : STAFF_REQUEST_PAGE_DEFAULT;
    const from = (page - 1) * limit;

    const countFor = (countTab: StaffRequestTab) =>
      applyTabFilter(
        applyListFilters(
          admin
            .from('staff_file_requests')
            .select('id', { count: 'exact', head: true })
            .eq('requester_id', profile.id),
          filters,
        ),
        countTab,
      );

    // Page slice and the four tab badges go out together, so the whole request
    // costs one round trip. Badges respect the active filters but never the
    // active tab — that's what makes switching tabs informative.
    const [listResult, ongoing, pending, closed, cancelled] = await Promise.all([
      applyTabOrder(
        applyTabFilter(
          applyListFilters(
            admin
              .from('staff_file_requests')
              .select(REQUEST_SELECT, { count: 'exact' })
              .eq('requester_id', profile.id),
            filters,
          ),
          tab,
        ),
        tab,
      ).range(from, from + limit - 1),
      countFor('ongoing'),
      countFor('pending'),
      countFor('closed'),
      countFor('cancelled'),
    ]);

    const listError = (listResult as { error?: { code?: string; message?: string } }).error;
    if (listError) {
      throwIfRequestsTableMissing(listError);
      throwIfRequestColumnsMissing(listError);
      throw listError;
    }
    const rows = ((listResult as { data?: Record<string, any>[] }).data ?? []) as Record<
      string,
      any
    >[];
    const requests = await StaffFileRequestController.enrichRequests(admin, rows);
    const total = (listResult as { count?: number | null }).count ?? rows.length;

    return jsonOk({
      requests,
      counts: {
        ongoing: (ongoing as { count?: number | null }).count ?? 0,
        pending: (pending as { count?: number | null }).count ?? 0,
        closed: (closed as { count?: number | null }).count ?? 0,
        cancelled: (cancelled as { count?: number | null }).count ?? 0,
      },
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  static async checkCompeting(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    const url = new URL(req.url);
    const fileId = Number(url.searchParams.get('file_id'));
    if (!Number.isSafeInteger(fileId) || fileId < 1) {
      return jsonOk({
        has_competing: false,
        count: 0,
        requests: [],
        own_pending: null,
        issuance: null,
      });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('staff_file_requests')
      .select(
        'id, file_id, file_no, file_name, requester_id, requester_name, requester_section, request_date, duration_days, priority, created_at',
      )
      .eq('file_id', fileId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (error) {
      throwIfRequestsTableMissing(error);
      throw error;
    }

    // The caller's own request drives the duplicate/upgrade decision; the
    // notice on the form is about other staff members competing for the file.
    // Both are ranked by the shared helper, so the order shown here is the order
    // the approve API enforces.
    const pendingRequests = (data ?? []) as CompetingCheckRow[];
    const competingInfo = getCompetingInfo(pendingRequests);
    const ranked = sortByCompetingRank(pendingRequests, competingInfo).map((row) => ({
      ...row,
      competing: competingInfo.get(Number(row.id)) ?? null,
    }));

    const ownPending =
      ranked.find((request) => request.requester_id === profile.id) ?? null;
    const competingRequests = ranked.filter(
      (request) => request.requester_id !== profile.id,
    );

    // The warning is advisory — approval is what enforces availability.
    let issuance: ActiveIssuance | null = null;
    try {
      const live = await findActiveIssuance(admin, fileId);
      // Holding the file yourself is not "issued to another staff member".
      issuance = live && live.holder_id !== profile.id ? live : null;
    } catch (issuanceError) {
      console.warn('Could not read current issuance:', issuanceError);
    }

    return jsonOk({
      has_competing: competingRequests.length > 0,
      count: competingRequests.length,
      requests: competingRequests,
      own_pending: ownPending,
      issuance,
    });
  }

  static async cancelMine(idValue: string) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    if (profile.role !== 'Staff') {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Only staff members can cancel their file requests.',
      );
    }

    const id = Number(idValue);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request ID.');
    }

    const admin = getSupabaseAdminClient();
    const { data: request, error } = await admin
      .from('staff_file_requests')
      .update({
        status: 'CANCELLED',
        cancellation_reason: 'Cancelled by staff member',
      })
      .eq('id', id)
      .eq('requester_id', profile.id)
      .eq('status', 'PENDING')
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (error) {
      throwIfRequestsTableMissing(error);
      throwIfRequestColumnsMissing(error);
      throw error;
    }
    if (!request) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This request can no longer be cancelled because it is not pending.',
      );
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: profile.id,
        action: 'file.checkout_request_cancelled',
        details: {
          request_id: id,
          file_no: request.file_no,
          file_name: request.file_name,
        },
      });
    } catch (auditError) {
      console.warn(
        'Failed to record file checkout request cancellation audit log:',
        auditError,
      );
    }

    // The request is no longer pending: every admin's open notification for
    // it resolves as CANCELLED.
    await resolveRequestNotifications(admin, {
      refType: 'staff_file_request',
      refId: id,
      resolution: 'CANCELLED',
      resolvedById: profile.id,
      resolvedByName: profile.full_name || profile.email || null,
    });

    return jsonOk({ request, message: 'Your file request was cancelled.' });
  }

  static async listForAdmin() {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('staff_file_requests')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false });
    if (error) {
      throwIfRequestsTableMissing(error);
      throwIfRequestColumnsMissing(error);
      throw error;
    }
    // This endpoint returns every request, so the pending rows it already holds
    // are the complete competing set — no extra query.
    const competingById = getCompetingInfo(
      (data ?? []) as CompetingRequestInput[],
    );
    const profileIds = Array.from(
      new Set(
        (data ?? [])
          .flatMap((item) => [item.reviewed_by, item.requester_id])
          .filter((id) => Boolean(id)),
      ),
    );
    const profileMap = new Map<string, AttributionProfile>();
    if (profileIds.length > 0) {
      const { data: reviewers } = await admin
        .from('profiles')
        .select('id, full_name, email, is_deleted')
        .in('id', profileIds);
      if (reviewers) {
        reviewers.forEach((rev) => profileMap.set(rev.id, rev));
      }
    }

    const requests = (data ?? []).map((req) => ({
      ...req,
      competing: competingById.get(Number(req.id)) ?? null,
      reviewer_name: req.reviewed_by
        ? profileMap.get(req.reviewed_by)?.full_name || 'Administrator'
        : null,
      reviewer_email: visibleAuthorEmail(profileMap, req.reviewed_by),
      reviewer_is_deleted: isDeletedAuthor(profileMap, req.reviewed_by),
      requester_is_deleted: isDeletedAuthor(profileMap, req.requester_id),
    })).sort((left, right) => {
      const statusDifference =
        Number(left.status !== 'PENDING') - Number(right.status !== 'PENDING');
      return (
        statusDifference ||
        priorityWeightOf(right.priority) - priorityWeightOf(left.priority) ||
        new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime()
      );
    });
    return jsonOk({ requests });
  }

  static async review(req: Request, idValue: string) {
    requireServerEnv();
    const adminProfile = await AuthorizationService.requireAdminProfile();
    const id = Number(idValue);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request ID.');
    }
    const body = await req.json().catch(() => null);
    if (!body || !['APPROVED', 'REJECTED'].includes(body.status)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Choose whether to approve or reject this request.',
      );
    }
    const adminNotes =
      typeof body.admin_notes === 'string'
        ? body.admin_notes.trim().slice(0, 500)
        : null;
    if (body.status === 'REJECTED' && !adminNotes) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Provide a reason when rejecting a file request.',
      );
    }
    const admin = getSupabaseAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from('staff_file_requests')
      .select(
        'id, status, file_id, file_no, file_name, requester_id, requester_name, priority, request_date, duration_days, reviewed_by, reviewed_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (lookupError) {
      throwIfRequestsTableMissing(lookupError);
      throw lookupError;
    }
    if (!existing)
      throw new ApiError(404, 'NOT_FOUND', 'File request not found.');
    if (existing.status !== 'PENDING') {
      await throwAlreadyHandled(admin, existing);
    }

    // Availability beats priority: an approved-but-unreturned request for the
    // same file means the physical folder is still in someone's hands.
    if (body.status === 'APPROVED') {
      const holder = await findActiveIssuance(admin, existing, id);
      if (holder) throw fileIssuedConflict(holder);
    }

    /**
     * Only the highest-ranked pending request for a file may be approved, using
     * the same ranking the queue and the staff views render. Read fresh from the
     * table so two admins working on different tabs cannot disagree, and so a
     * bypassed button still cannot promote a lower-ranked request.
     */
    if (body.status === 'APPROVED') {
      let group: Record<string, any>[] = [];
      try {
        group = await findPendingGroup(admin, existing);
      } catch (groupError) {
        // Ranking unavailable: fall through to the availability guard above and
        // let the update proceed, rather than rejecting a valid approval.
        console.warn('Could not read the competing group for approval:', groupError);
      }
      const groupInfo = getCompetingInfo(group as CompetingRequestInput[]);
      const rank = groupInfo.get(id)?.rank ?? 0;
      if (rank > 0) {
        const leader = leaderOf(
          group as CompetingRequestInput[],
          groupInfo,
        );
        throw new ApiError(
          409,
          'REQUEST_CONFLICT',
          `This request is not first in line for ${existing.file_no}. ${
            leader?.requester_name || 'Another staff member'
          }'s ${leader?.priority || 'higher'} priority request (#${
            leader?.id ?? '?'
          }) must be approved or rejected first.`,
          {
            reason: 'not_highest_priority',
            rank,
            leader: leader
              ? {
                  id: leader.id,
                  requester_name: leader.requester_name,
                  priority: leader.priority,
                }
              : null,
          },
        );
      }
    }

    const reviewedAt = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: body.status,
      admin_notes: adminNotes,
      reviewed_by: adminProfile.id,
      reviewed_at: reviewedAt,
    };

    if (body.status === 'APPROVED') {
      // Accepting a request is the issuance event: the file leaves the
      // repository, so the contractual return date is fixed now.
      const returnDate = computeReturnDate(existing.request_date, existing.duration_days);
      patch.issued_at = reviewedAt;
      patch.original_return_date = returnDate;
      patch.expected_return_date = returnDate;
    }

    const { data: request, error } = await admin
      .from('staff_file_requests')
      .update(patch)
      .eq('id', id)
      .eq('status', 'PENDING')
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (error) {
      throwIfRequestsTableMissing(error);
      throwIfRequestColumnsMissing(error);
      // Two admins approving different requests for one file: the partial
      // unique index lets exactly one of them through.
      if (isUniqueViolation(error)) {
        const holder = await findActiveIssuance(admin, existing, id);
        if (holder) throw fileIssuedConflict(holder);
        throw new ApiError(
          409,
          'REQUEST_CONFLICT',
          'This file was issued to another request while you were reviewing it.',
          { reason: 'file_currently_issued', issuance: null },
        );
      }
      throw error;
    }
    if (!request) {
      // Lost the race: another admin reviewed it between our read and update.
      const { data: current } = await admin
        .from('staff_file_requests')
        .select('id, status, reviewed_by, reviewed_at')
        .eq('id', id)
        .maybeSingle();
      if (current) await throwAlreadyHandled(admin, current);
      throw new ApiError(
        409,
        'REQUEST_ALREADY_HANDLED',
        'This file request has already been reviewed.',
        { handledBy: null, handledAt: null },
      );
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: adminProfile.id,
        action: `file.checkout_request_${String(body.status).toLowerCase()}`,
        details: {
          request_id: id,
          file_no: existing.file_no,
          admin_notes: adminNotes,
        },
      });
    } catch (auditError) {
      console.warn(
        'Failed to record file checkout review audit log:',
        auditError,
      );
    }
    const returnedRequest = {
      ...request,
      reviewer_name: adminProfile.full_name,
      reviewer_email: adminProfile.email,
    };

    const approved = body.status === 'APPROVED';
    if (approved) {
      try {
        const fileId = Number(existing.file_id);
        const fileNo = String(existing.file_no ?? '').trim();
        let compQuery = admin
          .from('staff_file_requests')
          .select('id, requester_id, file_no, file_name')
          .eq('status', 'PENDING')
          .neq('id', id);

        if (Number.isSafeInteger(fileId) && fileId > 0) {
          compQuery = compQuery.eq('file_id', fileId);
        } else if (fileNo) {
          compQuery = compQuery.eq('file_no', fileNo);
        } else {
          compQuery = null;
        }

        if (compQuery) {
          const { data: competingRows } = await compQuery;
          if (competingRows && competingRows.length > 0) {
            const allocationNote = `Physical file allocated to competing request from ${existing.requester_name || 'another staff member'} (${existing.priority || 'HIGH'} Priority).`;
            const compIds = competingRows.map((r) => r.id);

            await admin
              .from('staff_file_requests')
              .update({
                status: 'REJECTED',
                admin_notes: allocationNote,
                reviewed_by: adminProfile.id,
                reviewed_at: reviewedAt,
              })
              .in('id', compIds)
              .eq('status', 'PENDING');

            const auditRepo = new AuditLogRepository(admin);

            for (const comp of competingRows) {
              try {
                await auditRepo.log({
                  actorId: adminProfile.id,
                  action: 'file.checkout_request_rejected',
                  details: {
                    request_id: comp.id,
                    file_no: comp.file_no,
                    admin_notes: allocationNote,
                    auto_rejected_by_allocation: true,
                    allocated_to_request_id: id,
                  },
                });
              } catch (auditErr) {
                console.warn('Audit log failed for auto-rejected request:', auditErr);
              }

              try {
                // Their open admin notifications resolve as REJECTED before
                // the staff member's own rejection notice is written.
                await resolveRequestNotifications(admin, {
                  refType: 'staff_file_request',
                  refId: Number(comp.id),
                  resolution: 'REJECTED',
                  resolvedById: adminProfile.id,
                  resolvedByName:
                    adminProfile.full_name || adminProfile.email || null,
                });
                await notifyRequestOutcome(admin, {
                  userId: comp.requester_id,
                  kind: 'FILE_ISSUE_REJECTED',
                  refType: 'staff_file_request',
                  refId: Number(comp.id),
                  title: 'Your file request was not allocated',
                  body: `${comp.file_no} — ${comp.file_name}. Reason: ${allocationNote}`,
                  titleKey: 'content.requestNotAllocatedTitle',
                  bodyKey: 'content.requestNotAllocatedBody',
                  params: {
                    fileNo: comp.file_no,
                    fileName: comp.file_name,
                    reason: allocationNote,
                    adminName:
                      adminProfile.full_name || adminProfile.email || 'Administrator',
                  },
                  type: 'error',
                  link: `/staff/your-requests?request=${comp.id}`,
                  dedupeKey: `file-request:${comp.id}:rejected`,
                });
              } catch (notifErr) {
                console.warn('Notification failed for auto-rejected request:', notifErr);
              }
            }
          }
        }
      } catch (autoRejectErr) {
        console.warn('Failed to auto-reject competing requests on approval:', autoRejectErr);
      }
    }
    const adminDisplayName =
      adminProfile.full_name || adminProfile.email || 'Administrator';

    // Every admin's open notification for this request resolves together, then
    // the requesting staff member gets their own outcome notice.
    await resolveRequestNotifications(admin, {
      refType: 'staff_file_request',
      refId: id,
      resolution: approved ? 'APPROVED' : 'REJECTED',
      resolvedById: adminProfile.id,
      resolvedByName: adminDisplayName,
    });
    await notifyRequestOutcome(admin, {
      userId: existing.requester_id,
      kind: approved ? 'FILE_ISSUE_APPROVED' : 'FILE_ISSUE_REJECTED',
      refType: 'staff_file_request',
      refId: id,
      title: approved
        ? 'Your file request was approved'
        : 'Your file request was rejected',
      body: approved
        ? `${existing.file_no} — ${existing.file_name} is issued to you by ${adminDisplayName}. Collect it from the repository and return it by ${returnedRequest.expected_return_date || computeReturnDate(existing.request_date, existing.duration_days)}.`
        : `${existing.file_no} — ${existing.file_name}. Reason: ${adminNotes || 'No reason recorded.'}`,
      titleKey: approved
        ? 'content.fileIssueApprovedTitle'
        : 'content.fileIssueRejectedTitle',
      bodyKey: approved
        ? 'content.fileIssueApprovedBody'
        : 'content.fileIssueRejectedBody',
      params: approved
        ? {
            fileNo: existing.file_no,
            fileName: existing.file_name,
            adminName: adminDisplayName,
            dueDate:
              returnedRequest.expected_return_date ||
              computeReturnDate(existing.request_date, existing.duration_days),
          }
        : {
            fileNo: existing.file_no,
            fileName: existing.file_name,
            adminName: adminDisplayName,
            reason: adminNotes || 'No reason recorded.',
          },
      type: approved ? 'success' : 'error',
      link: `/staff/your-requests?request=${id}`,
      dedupeKey: `file-request:${id}:${approved ? 'approved' : 'rejected'}`,
    });

    return jsonOk({
      request: returnedRequest,
      message: `File request ${String(body.status).toLowerCase()}.`,
    });
  }
}

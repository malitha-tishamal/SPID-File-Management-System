import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { NotificationService } from 'services/NotificationService';
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
  type RequestConflictKind,
} from 'lib/staffRequestPriority';

const REQUEST_SELECT =
  'id, file_id, file_no, file_name, section_name, storage_location, requester_id, requester_name, requester_email, requester_role, requester_section, request_date, duration_days, priority, status, admin_notes, cancellation_reason, reviewed_by, reviewed_at, original_return_date, expected_return_date, issued_at, returned_at, returned_by, created_at';

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
const REQUEST_PRIORITIES = ['HIGH', 'NORMAL', 'LOW'] as const;
type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

function isRequestPriority(value: string): value is RequestPriority {
  return REQUEST_PRIORITIES.some((priority) => priority === value);
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

    const reviewerIds = Array.from(
      new Set(rows.map((row) => row.reviewed_by).filter((id) => Boolean(id))),
    );
    const requestIds = rows
      .map((row) => row.id)
      .filter((id) => typeof id === 'number');

    const [reviewersRes, extensionsRes] = await Promise.all([
      reviewerIds.length > 0
        ? admin.from('profiles').select('id, full_name, email').in('id', reviewerIds)
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
    ]);

    const reviewerMap = new Map<string, Record<string, any>>();
    for (const reviewer of (reviewersRes as { data?: Record<string, any>[] }).data ?? []) {
      reviewerMap.set(reviewer.id, reviewer);
    }
    const extensionRows = ((extensionsRes as { data?: Record<string, any>[] }).data ??
      []) as Record<string, any>[];

    return rows.map((req) => {
      const own = extensionRows.filter((row) => row.request_id === req.id);
      return {
        ...req,
        reviewer_name: req.reviewed_by
          ? reviewerMap.get(req.reviewed_by)?.full_name || 'Administrator'
          : null,
        reviewer_email: req.reviewed_by
          ? reviewerMap.get(req.reviewed_by)?.email || null
          : null,
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

        await new NotificationService(admin).notifyAdmins({
          title: upgraded
            ? 'Staff file request priority upgraded'
            : 'New staff file request',
          body: upgraded
            ? `${profile.full_name} upgraded ${request.file_no} — ${request.file_name} to ${priority} priority. The previous pending request was cancelled.`
            : `${profile.full_name} requested ${request.file_no} — ${request.file_name} for ${durationDays} day${durationDays === 1 ? '' : 's'}.`,
          type: 'info',
          link: `/admin/staff-file-request?tab=pending&request=${request.id}`,
          dedupeKey: `file-request:${request.id}:submitted`,
        });

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
    const pendingRequests = data ?? [];
    const ownPending =
      pendingRequests.find((request) => request.requester_id === profile.id) ?? null;
    const competingRequests = pendingRequests.filter(
      (request) => request.requester_id !== profile.id,
    );

    return jsonOk({
      has_competing: competingRequests.length > 0,
      count: competingRequests.length,
      requests: competingRequests,
      own_pending: ownPending,
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
    const priorityOrder: Record<RequestPriority, number> = {
      HIGH: 0,
      NORMAL: 1,
      LOW: 2,
    };
    const reviewerIds = Array.from(
      new Set(
        (data ?? [])
          .map((item) => item.reviewed_by)
          .filter((id) => Boolean(id)),
      ),
    );
    const reviewerMap = new Map();
    if (reviewerIds.length > 0) {
      const { data: reviewers } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', reviewerIds);
      if (reviewers) {
        reviewers.forEach((rev) => reviewerMap.set(rev.id, rev));
      }
    }

    const requests = (data ?? []).map((req) => ({
      ...req,
      reviewer_name: req.reviewed_by
        ? reviewerMap.get(req.reviewed_by)?.full_name || 'Administrator'
        : null,
      reviewer_email: req.reviewed_by
        ? reviewerMap.get(req.reviewed_by)?.email || null
        : null,
    })).sort((left, right) => {
      const statusDifference =
        Number(left.status !== 'PENDING') - Number(right.status !== 'PENDING');
      const priorityDifference =
        priorityOrder[left.priority as RequestPriority] -
        priorityOrder[right.priority as RequestPriority];
      return (
        statusDifference ||
        priorityDifference ||
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
        'id, status, file_no, file_name, requester_id, request_date, duration_days',
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
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This file request has already been reviewed.',
      );
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
      throw error;
    }
    if (!request)
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This file request has already been reviewed.',
      );

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
    await new NotificationService(admin).notifyUser(
      existing.requester_id,
      approved
        ? {
            title: 'Your file request was approved',
            body: `${existing.file_no} — ${existing.file_name} is issued to you. Collect it from the repository and return it by ${returnedRequest.expected_return_date || computeReturnDate(existing.request_date, existing.duration_days)}.`,
            type: 'success',
            link: `/staff/your-requests?request=${id}`,
            dedupeKey: `file-request:${id}:approved`,
          }
        : {
            title: 'Your file request was rejected',
            body: `${existing.file_no} — ${existing.file_name}. Reason: ${adminNotes || 'No reason recorded.'}`,
            type: 'error',
            link: `/staff/your-requests?request=${id}`,
            dedupeKey: `file-request:${id}:rejected`,
          },
    );

    return jsonOk({
      request: returnedRequest,
      message: `File request ${String(body.status).toLowerCase()}.`,
    });
  }
}

import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { NotificationService } from 'services/NotificationService';
import { getReturnStatus, isReturnDateExtended } from 'lib/returnStatus';
import { annotateDeletedAuthors } from 'lib/userAttribution';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ISSUED_SELECT =
  'id, file_id, file_no, file_name, section_name, storage_location, requester_id, requester_name, requester_email, requester_section, request_date, duration_days, priority, status, admin_notes, reviewed_by, reviewed_at, original_return_date, expected_return_date, issued_at, returned_at, returned_by, created_at';

const EXTENSION_SELECT =
  'id, request_id, file_no, file_name, previous_return_date, new_return_date, reason, status, requested_by, requested_by_name, reviewed_by, reviewed_by_name, reviewed_at, review_note, created_at';

function parseIsoDate(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!ISO_DATE.test(text)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} is not a valid date.`);
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} is not a valid date.`);
  }
  return text;
}

function parseReason(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new ApiError(400, 'VALIDATION_ERROR', label);
  }
  return text.slice(0, 1000);
}

function parseRequestId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request ID.');
  }
  return id;
}

function throwIfIssuanceSchemaMissing(error: { code?: string; message?: string }): void {
  const message = String(error.message || '');
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (message.toLowerCase().includes('file_request_extensions') &&
      message.toLowerCase().includes('schema cache'))
  ) {
    throw new ApiError(
      503,
      'CONFIG_ERROR',
      'Issuance and extension tables are unavailable. Apply Supabase migration 0017_issuance_return_extensions_notifications.sql, then try again.',
    );
  }
  if (
    error.code === '42703' &&
    /expected_return_date|returned_at|issued_at|original_return_date|returned_by/.test(message)
  ) {
    throw new ApiError(
      503,
      'CONFIG_ERROR',
      'Issuance tracking columns are missing. Apply Supabase migration 0017_issuance_return_extensions_notifications.sql, then try again.',
    );
  }
}

/**
 * Tell every staff member still waiting on this file that it is back in the
 * repository. The dedupe key is tied to the returned issuance, so the same
 * event never produces a second copy of the notice.
 */
async function notifyWaitingRequesters(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  fileId: number,
  info: { file_no: string; file_name: string; returnedRequestId: number },
): Promise<void> {
  if (!Number.isSafeInteger(fileId) || fileId < 1) return;
  try {
    const { data, error } = await admin
      .from('staff_file_requests')
      .select('id, requester_id')
      .eq('file_id', fileId)
      .eq('status', 'PENDING');
    if (error) {
      console.warn('Could not read pending requests for the returned file:', error);
      return;
    }
    const service = new NotificationService(admin);
    for (const row of (data ?? []) as { id: number; requester_id: string }[]) {
      await service.notifyUser(row.requester_id, {
        title: 'A requested file is available',
        body: `${info.file_no} — ${info.file_name} has been returned to the repository. The administrator can now approve your request.`,
        titleKey: 'content.fileAvailableTitle',
        bodyKey: 'content.fileAvailableBody',
        params: { fileNo: info.file_no, fileName: info.file_name },
        type: 'info',
        link: `/staff/your-requests?request=${row.id}`,
        dedupeKey: `file-request:${row.id}:available:${info.returnedRequestId}`,
      });
    }
  } catch (err) {
    console.warn('Could not send file-availability notices:', err);
  }
}

/** Shape the Issued Files page renders; one helper keeps admin and staff views identical. */
function decorateIssuedRow(row: Record<string, any>): Record<string, any> {
  const returnInfo = getReturnStatus(row.expected_return_date, row.returned_at);
  return {
    ...row,
    return_status: returnInfo.status,
    return_label: returnInfo.label,
    days_remaining: returnInfo.daysRemaining,
    is_overdue: returnInfo.isOverdue,
    is_extended: isReturnDateExtended(row.original_return_date, row.expected_return_date),
  };
}

/**
 * Lifecycle of an approved staff request: issuance is already recorded by
 * StaffFileRequestController.review; this class covers physical return and the
 * return-date extension workflow (admin-applied and staff-requested).
 */
export class FileIssuanceController {
  /** GET /api/admin/issued-files — every approved issuance with its return status. */
  static async listIssued(req: Request) {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const url = new URL(req.url);
    const view = url.searchParams.get('view') || 'active';

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('staff_file_requests')
      .select(ISSUED_SELECT)
      .eq('status', 'APPROVED');

    if (error) {
      throwIfIssuanceSchemaMissing(error);
      throw error;
    }

    const all = await annotateDeletedAuthors(
      admin,
      (data ?? []).map(decorateIssuedRow),
      [
        { idFields: ['requester_id'], flagField: 'requester_is_deleted' },
        { idFields: ['reviewed_by'], flagField: 'reviewer_is_deleted' },
        { idFields: ['returned_by'], flagField: 'return_recorded_by_is_deleted' },
      ]
    );

    // Apply view-specific sorting
    let sorted = all;
    if (view === 'returned') {
      // Returned: newest return date first
      sorted = all
        .filter((row) => row.returned_at)
        .sort((a, b) => {
          const dateA = new Date(a.returned_at || 0).getTime();
          const dateB = new Date(b.returned_at || 0).getTime();
          return dateB - dateA; // Descending
        });
    } else if (view === 'overdue') {
      // Overdue: most recently overdue first (by expected return date)
      sorted = all
        .filter((row) => row.is_overdue)
        .sort((a, b) => {
          const dateA = new Date(a.expected_return_date || 0).getTime();
          const dateB = new Date(b.expected_return_date || 0).getTime();
          return dateB - dateA; // Descending
        });
    } else {
      // Active: newest issue date first
      sorted = all
        .filter((row) => !row.returned_at)
        .sort((a, b) => {
          const dateA = new Date(a.issued_at || a.request_date || 0).getTime();
          const dateB = new Date(b.issued_at || b.request_date || 0).getTime();
          return dateB - dateA; // Descending
        });
    }

    return jsonOk({
      files: sorted,
      total: sorted.length,
      counts: {
        active: all.filter((row) => !row.returned_at).length,
        overdue: all.filter((row) => row.is_overdue).length,
        returned: all.filter((row) => row.returned_at).length,
        extended: all.filter((row) => row.is_extended && !row.returned_at).length,
      },
    });
  }

  /** POST /api/admin/issued-files/[id]/return — record the physical return. */
  static async markReturned(req: Request, idValue: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const id = parseRequestId(idValue);

    const admin = getSupabaseAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from('staff_file_requests')
      .select('id, status, file_no, file_name, requester_id, returned_at, expected_return_date')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) {
      throwIfIssuanceSchemaMissing(lookupError);
      throw lookupError;
    }
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Issued file not found.');
    if (existing.status !== 'APPROVED') {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'Only approved issues can be marked as returned.',
      );
    }
    if (existing.returned_at) {
      // Idempotent refusal: a repeated click must not create a second event.
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This file is already recorded as returned.',
      );
    }

    const returnedAt = new Date().toISOString();
    const { data: updated, error } = await admin
      .from('staff_file_requests')
      .update({ returned_at: returnedAt, returned_by: actor.id })
      .eq('id', id)
      .is('returned_at', null)
      .eq('status', 'APPROVED')
      .select(ISSUED_SELECT)
      .maybeSingle();

    if (error) {
      throwIfIssuanceSchemaMissing(error);
      throw error;
    }
    if (!updated) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This file is already recorded as returned.',
      );
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        targetUserId: existing.requester_id,
        action: 'file.checkout_returned',
        details: {
          request_id: id,
          file_no: existing.file_no,
          file_name: existing.file_name,
          returned_at: returnedAt,
        },
      });
    } catch (auditError) {
      console.warn('Failed to record file return audit log:', auditError);
    }

    await new NotificationService(admin).notifyUser(existing.requester_id, {
      title: 'File return recorded',
      body: `${existing.file_no} — ${existing.file_name} has been received back in the repository. Thank you.`,
      titleKey: 'content.returnRecordedTitle',
      bodyKey: 'content.returnRecordedBody',
      params: { fileNo: existing.file_no, fileName: existing.file_name },
      type: 'success',
      link: `/staff/your-requests?request=${id}`,
      dedupeKey: `file-request:${id}:returned`,
    });

    // The folder is back on the shelf: anyone still waiting on it can now be
    // approved, so their pending request becomes actionable.
    await notifyWaitingRequesters(admin, Number(updated.file_id), {
      file_no: existing.file_no,
      file_name: existing.file_name,
      returnedRequestId: id,
    });

    return jsonOk({
      file: decorateIssuedRow(updated),
      message: `${existing.file_no} was marked as received back.`,
    });
  }

  /** POST /api/admin/issued-files/[id]/extend — administrator moves the official due date. */
  static async extendReturnDate(req: Request, idValue: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const id = parseRequestId(idValue);

    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const newDate = parseIsoDate(body.new_return_date, 'New return date');
    const reason = parseReason(body.reason, 'Provide a reason for the extension.');

    const admin = getSupabaseAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from('staff_file_requests')
      .select('id, status, file_no, file_name, requester_id, expected_return_date, returned_at')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) {
      throwIfIssuanceSchemaMissing(lookupError);
      throw lookupError;
    }
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Issued file not found.');
    if (existing.status !== 'APPROVED') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Only an issued file can have its return date extended.',
      );
    }
    if (existing.returned_at) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This file has already been returned, so its return date cannot be extended.',
      );
    }

    const current = String(existing.expected_return_date || '').slice(0, 10);
    if (!current) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This issue has no expected return date yet, so it cannot be extended.',
      );
    }
    if (newDate <= current) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The new return date must be later than the current expected return date.',
      );
    }

    // Move the official date first: if the history row fails the transaction
    // is rolled back to nothing visible, but the row-level update alone would
    // still be an authorised admin decision, so history is written next.
    const { data: updated, error } = await admin
      .from('staff_file_requests')
      .update({ expected_return_date: newDate })
      .eq('id', id)
      .is('returned_at', null)
      .eq('status', 'APPROVED')
      .select(ISSUED_SELECT)
      .maybeSingle();

    if (error) {
      throwIfIssuanceSchemaMissing(error);
      throw error;
    }
    if (!updated) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This file was returned or closed before the extension could be saved.',
      );
    }

    const nowIso = new Date().toISOString();
    const { error: historyError } = await admin.from('file_request_extensions').insert({
      request_id: id,
      file_no: existing.file_no,
      file_name: existing.file_name,
      previous_return_date: current,
      new_return_date: newDate,
      reason,
      status: 'APPROVED',
      requested_by: actor.id,
      requested_by_name: actor.full_name,
      reviewed_by: actor.id,
      reviewed_by_name: actor.full_name,
      reviewed_at: nowIso,
    });
    if (historyError) {
      throwIfIssuanceSchemaMissing(historyError);
      throw historyError;
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        targetUserId: existing.requester_id,
        action: 'file.checkout_extended',
        details: {
          request_id: id,
          file_no: existing.file_no,
          previous_return_date: current,
          new_return_date: newDate,
          reason,
        },
      });
    } catch (auditError) {
      console.warn('Failed to record extension audit log:', auditError);
    }

    await new NotificationService(admin).notifyUser(existing.requester_id, {
      title: 'Your return date was extended',
      body: `${existing.file_no} — ${existing.file_name} is now due on ${newDate} (previously ${current}).`,
      titleKey: 'content.dateExtendedTitle',
      bodyKey: 'content.dateExtendedBody',
      params: {
        fileNo: existing.file_no,
        fileName: existing.file_name,
        dueDate: newDate,
        previousDate: current,
      },
      type: 'info',
      link: `/staff/your-requests?request=${id}`,
      dedupeKey: `file-request:${id}:extended:${newDate}`,
    });

    return jsonOk({
      file: decorateIssuedRow(updated),
      message: `Return date extended to ${newDate}.`,
    });
  }

  /** POST /api/staff/file-request-extensions — staff asks for more time. */
  static async requestExtension(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    if (profile.role !== 'Staff') {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Administrators extend return dates directly from the Issued Files page.',
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const requestId = parseRequestId(String(body.request_id));
    const newDate = parseIsoDate(body.new_return_date, 'Requested return date');
    const reason = parseReason(body.reason, 'Provide a reason for the extension.');

    const admin = getSupabaseAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from('staff_file_requests')
      .select('id, status, file_no, file_name, requester_id, expected_return_date, returned_at')
      .eq('id', requestId)
      .eq('requester_id', profile.id)
      .maybeSingle();

    if (lookupError) {
      throwIfIssuanceSchemaMissing(lookupError);
      throw lookupError;
    }
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'You have no issued file with that reference.');
    }
    if (existing.status !== 'APPROVED' || existing.returned_at) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'Only a currently issued file can have its return date extended.',
      );
    }

    const current = String(existing.expected_return_date || '').slice(0, 10);
    if (!current) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This issue has no expected return date yet.',
      );
    }
    if (newDate <= current) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The requested date must be later than your current return date.',
      );
    }

    const { data, error } = await admin
      .from('file_request_extensions')
      .insert({
        request_id: requestId,
        file_no: existing.file_no,
        file_name: existing.file_name,
        previous_return_date: current,
        new_return_date: newDate,
        reason,
        status: 'PENDING',
        requested_by: profile.id,
        requested_by_name: profile.full_name,
      })
      .select(EXTENSION_SELECT)
      .maybeSingle();

    if (error) {
      throwIfIssuanceSchemaMissing(error);
      if (error.code === '23505') {
        throw new ApiError(
          409,
          'VALIDATION_ERROR',
          'This file already has an extension request awaiting a decision.',
        );
      }
      throw error;
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: profile.id,
        action: 'file.checkout_extension_requested',
        details: {
          request_id: requestId,
          extension_id: data?.id,
          file_no: existing.file_no,
          previous_return_date: current,
          new_return_date: newDate,
        },
      });
    } catch (auditError) {
      console.warn('Failed to record extension request audit log:', auditError);
    }

    await new NotificationService(admin).notifyAdmins({
      title: 'Return-date extension requested',
      body: `${profile.full_name} asked to keep ${existing.file_no} until ${newDate} (currently due ${current}). Reason: ${reason}`,
      titleKey: 'content.extensionRequestedTitle',
      bodyKey: 'content.extensionRequestedBody',
      params: {
        staffName: profile.full_name,
        fileNo: existing.file_no,
        dueDate: newDate,
        previousDate: current,
        reason,
      },
      type: 'warning',
      link: `/admin/staff-file-request?tab=extensions&extension=${data?.id}`,
      dedupeKey: `extension:${data?.id}:submitted`,
    });

    return jsonOk(
      {
        extension: data,
        message: 'Your extension request was sent for administrator approval.',
      },
      201,
    );
  }

  /** GET /api/admin/file-request-extensions — extension requests for the admin tab. */
  static async listExtensions(req: Request) {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get('status') || 'PENDING').toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(statusParam)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a valid extension status.');
    }

    const admin = getSupabaseAdminClient();
    let query = admin
      .from('file_request_extensions')
      .select(`${EXTENSION_SELECT}, staff_file_requests!inner(requester_name, requester_section, request_date, duration_days, expected_return_date, returned_at)`);

    if (statusParam !== 'ALL') {
      query = query.eq('status', statusParam);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      throwIfIssuanceSchemaMissing(error);
      throw error;
    }

    const extensionRows = (data ?? []).map((row: Record<string, any>) => {
      const parent = Array.isArray(row.staff_file_requests)
        ? row.staff_file_requests[0]
        : row.staff_file_requests;
      return {
        ...row,
        requester_name: parent?.requester_name || row.requested_by_name || 'Staff',
        requester_section: parent?.requester_section || null,
        request_date: parent?.request_date || null,
        duration_days: parent?.duration_days ?? null,
        current_return_date: row.previous_return_date,
      };
    });

    const extensions = await annotateDeletedAuthors(admin, extensionRows, [
      { idFields: ['requested_by'], flagField: 'requester_is_deleted' },
      { idFields: ['reviewed_by'], flagField: 'reviewer_is_deleted' },
    ]);

    return jsonOk({ extensions, total: extensions.length });
  }

  /** POST /api/admin/file-request-extensions/[id]/review — approve or reject. */
  static async reviewExtension(req: Request, idValue: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const id = parseRequestId(idValue);

    const body = await req.json().catch(() => null);
    if (!body || !['APPROVED', 'REJECTED'].includes(body.status)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Choose whether to approve or reject this extension request.',
      );
    }
    const approved = body.status === 'APPROVED';
    const reviewNote = approved
      ? typeof body.review_note === 'string'
        ? body.review_note.trim().slice(0, 1000) || null
        : null
      : parseReason(
          body.review_note,
          'Provide a reason when rejecting an extension request.',
        );

    const admin = getSupabaseAdminClient();
    const { data: extension, error: lookupError } = await admin
      .from('file_request_extensions')
      .select(`${EXTENSION_SELECT}, staff_file_requests!inner(id, status, requester_id, returned_at, expected_return_date)`)
      .eq('id', id)
      .maybeSingle();

    if (lookupError) {
      throwIfIssuanceSchemaMissing(lookupError);
      throw lookupError;
    }
    if (!extension) throw new ApiError(404, 'NOT_FOUND', 'Extension request not found.');
    if (extension.status !== 'PENDING') {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This extension request has already been decided.',
      );
    }

    const parent = Array.isArray(extension.staff_file_requests)
      ? extension.staff_file_requests[0]
      : extension.staff_file_requests;

    if (!approved) {
      // Rejection never touches the official date.
      const { error } = await admin
        .from('file_request_extensions')
        .update({
          status: 'REJECTED',
          reviewed_by: actor.id,
          reviewed_by_name: actor.full_name,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote,
        })
        .eq('id', id)
        .eq('status', 'PENDING');
      if (error) {
        throwIfIssuanceSchemaMissing(error);
        throw error;
      }

      await new NotificationService(admin).notifyUser(parent?.requester_id, {
        title: 'Your extension request was rejected',
        body: `${extension.file_no} stays due on ${extension.previous_return_date}. Reason: ${reviewNote || 'No reason recorded.'}`,
        titleKey: 'content.extensionRejectedTitle',
        bodyKey: 'content.extensionRejectedBody',
        params: {
          fileNo: extension.file_no,
          dueDate: extension.previous_return_date,
          reason: reviewNote || 'No reason recorded.',
        },
        type: 'error',
        link: `/staff/your-requests?request=${extension.request_id}`,
        dedupeKey: `extension:${id}:rejected`,
      });

      try {
        await new AuditLogRepository(admin).log({
          actorId: actor.id,
          targetUserId: parent?.requester_id,
          action: 'file.checkout_extension_rejected',
          details: {
            extension_id: id,
            request_id: extension.request_id,
            file_no: extension.file_no,
            review_note: reviewNote,
          },
        });
      } catch (auditError) {
        console.warn('Failed to record extension rejection audit log:', auditError);
      }

      return jsonOk({
        extension: { ...extension, status: 'REJECTED', review_note: reviewNote },
        message: 'Extension request rejected. The return date is unchanged.',
      });
    }

    const targetDate = String(extension.new_return_date).slice(0, 10);
    const { data: updatedFile, error: dateError } = await admin
      .from('staff_file_requests')
      .update({ expected_return_date: targetDate })
      .eq('id', extension.request_id)
      .eq('status', 'APPROVED')
      .is('returned_at', null)
      .select('id, file_no, expected_return_date')
      .maybeSingle();

    if (dateError) {
      throwIfIssuanceSchemaMissing(dateError);
      throw dateError;
    }
    if (!updatedFile) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'That file has already been returned, so the extension cannot be approved.',
      );
    }

    const { error: reviewError } = await admin
      .from('file_request_extensions')
      .update({
        status: 'APPROVED',
        reviewed_by: actor.id,
        reviewed_by_name: actor.full_name,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq('id', id)
      .eq('status', 'PENDING');
    if (reviewError) {
      throwIfIssuanceSchemaMissing(reviewError);
      throw reviewError;
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        targetUserId: parent?.requester_id,
        action: 'file.checkout_extension_approved',
        details: {
          extension_id: id,
          request_id: extension.request_id,
          file_no: extension.file_no,
          previous_return_date: extension.previous_return_date,
          new_return_date: targetDate,
        },
      });
    } catch (auditError) {
      console.warn('Failed to record extension approval audit log:', auditError);
    }

    await new NotificationService(admin).notifyUser(parent?.requester_id, {
      title: 'Your extension request was approved',
      body: `${extension.file_no} is now due on ${targetDate} (previously ${extension.previous_return_date}).`,
      titleKey: 'content.extensionApprovedTitle',
      bodyKey: 'content.extensionApprovedBody',
      params: {
        fileNo: extension.file_no,
        dueDate: targetDate,
        previousDate: extension.previous_return_date,
      },
      type: 'success',
      link: `/staff/your-requests?request=${extension.request_id}`,
      dedupeKey: `extension:${id}:approved`,
    });

    return jsonOk({
      extension: { ...extension, status: 'APPROVED', review_note: reviewNote },
      file: updatedFile,
      message: `Extension approved. The file is now due on ${targetDate}.`,
    });
  }
}

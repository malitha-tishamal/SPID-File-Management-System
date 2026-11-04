import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { FileRepository, FileRecordRow, isUniqueViolation } from 'models/FileRepository';
import { SectionRepository, isActiveSection } from 'models/SectionRepository';
import { SettingsRepository } from 'models/SettingsRepository';
import { parseAndValidateImportBuffer } from 'utils/fileImport';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { isValidYmd } from 'lib/datetime';

/**
 * A section picked for a new file or a changed assignment must exist and be
 * Active (approved) — disabled/pending sections must never be selected.
 */
async function assertSectionSelectable(
  repo: SectionRepository,
  sectionName: string,
): Promise<void> {
  const section = await repo.findByName(sectionName);
  if (!section || isActiveSection(section)) return;
  throw new ApiError(
    400,
    'VALIDATION_ERROR',
    section.status === 'disabled'
      ? 'Selected section is disabled.'
      : 'Selected section is not active yet.',
  );
}

/**
 * Approving a PENDING row whose File No is already held by another live record
 * violates uq_files_file_no_live. Surface that as a 409 instead of a 500.
 */
async function approveGuardingFileNo(
  approve: () => Promise<FileRecordRow>,
  fileNo: string,
): Promise<FileRecordRow> {
  try {
    return await approve();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        `File No "${fileNo}" is already used by another live record. Reject this request or remove the conflicting record first.`,
      );
    }
    throw err;
  }
}

export class FileController {
  static async searchRequestableFiles(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    if (profile.role !== 'Staff') {
      throw new ApiError(403, 'FORBIDDEN', 'Staff privileges required.');
    }

    const search = new URL(req.url).searchParams.get('search')?.trim() ?? '';
    if (!search) return jsonOk({ files: [] });

    const files = await new FileRepository(
      getSupabaseAdminClient(),
    ).searchRequestableFiles(search);
    return jsonOk({ files });
  }

  /**
   * GET /api/admin/files — list files with filters, pagination, summary counts,
   * and the current approval setting.
   */
  static async listFiles(req: Request) {
    requireServerEnv();
    await AuthorizationService.requireApprovedProfile();

    const url = new URL(req.url);
    const tab =
      (url.searchParams.get('tab') as 'requests' | 'all' | 'rejected' | 'recent') || 'requests';
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const section = url.searchParams.get('section') || undefined;
    const storage = url.searchParams.get('storage') || undefined;
    const officer = url.searchParams.get('officer') || undefined;
    const registered_by = url.searchParams.get('registered_by') || undefined;
    const date = url.searchParams.get('date') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;
    const sort =
      (url.searchParams.get('sort') as
        | 'newest'
        | 'oldest'
        | 'file_no'
        | 'file_name') || 'newest';
    const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
    const limitRaw = parseInt(url.searchParams.get('limit') || '15', 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 10000)
        : 15;
    const metaOnly = url.searchParams.get('metaOnly') === 'true';
    const includeMeta = url.searchParams.get('includeMeta') !== 'false';
    const includeCounts = includeMeta && url.searchParams.get('includeCounts') !== 'false';
    const includeSettings = includeMeta && url.searchParams.get('includeSettings') !== 'false';
    const includePageTotal = url.searchParams.get('includePageTotal') === 'true';

    const admin = getSupabaseAdminClient();
    const fileRepo = new FileRepository(admin);
    const settingsRepo = new SettingsRepository(admin);

    if (metaOnly) {
      const [counts, requireApproval, totalPageNumbers] = await Promise.all([
        fileRepo.getSummaryCounts(),
        settingsRepo.getRequireFileApproval(),
        includePageTotal
          ? fileRepo.getTotalPageNumbers()
          : Promise.resolve(null),
      ]);
      return jsonOk({
        counts,
        requireApproval,
        auto_approval: !requireApproval,
        ...(totalPageNumbers !== null ? { totalPageNumbers } : {}),
      });
    }

    if (
      dateFrom &&
      dateTo &&
      isValidYmd(dateFrom) &&
      isValidYmd(dateTo) &&
      dateFrom.trim() > dateTo.trim()
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Start date must be on or before end date.',
      );
    }

    const [filteredResult, counts, requireApproval] = await Promise.all([
      fileRepo.listFiltered({
        tab,
        status,
        search,
        section,
        storage,
        officer,
        registered_by,
        date,
        dateFrom,
        dateTo,
        sort,
        page,
        limit,
      }),
      includeCounts ? fileRepo.getSummaryCounts() : Promise.resolve(null),
      includeSettings ? settingsRepo.getRequireFileApproval() : Promise.resolve(null),
    ]);

    let totalPageNumbers: number | null = null;
    if (includePageTotal) {
      if (counts?.totalPageNumbers !== undefined && counts.totalPageNumbers !== null) {
        totalPageNumbers = counts.totalPageNumbers;
      } else {
        totalPageNumbers = await fileRepo.getTotalPageNumbers();
      }
    }

    return jsonOk({
      files: filteredResult.files,
      total: filteredResult.total,
      page: filteredResult.page,
      limit: filteredResult.limit,
      totalPages: filteredResult.totalPages,
      ...(counts ? { counts } : {}),
      ...(totalPageNumbers !== null ? { totalPageNumbers } : {}),
      ...(requireApproval !== null
        ? { requireApproval, auto_approval: !requireApproval }
        : {}),
    });
  }

  /**
   * POST /api/admin/files — create a new file record or submit for approval.
   * Enforces server-side setting: staff submissions become PENDING if approval is enabled,
   * or APPROVED if disabled. Admin submissions are always APPROVED.
   */
  static async createFile(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();
    const body = await req.json().catch(() => null);
    if (!body)
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const fileNo = String(body.file_no ?? '').trim();
    const fileName = String(body.file_name ?? '').trim();
    const sectionName = String(body.section ?? body.section_name ?? '').trim();

    // Date fields (YYYY-MM-DD)
    const startDate = String(body.start_date ?? '').trim();
    const endDate = String(body.end_date ?? '').trim();

    // Required field validation
    if (!fileNo) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'File No is required.');
    }
    if (!fileName) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'File Name is required.');
    }
    if (!sectionName) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Section is required.');
    }

    const admin = getSupabaseAdminClient();
    await assertSectionSelectable(new SectionRepository(admin), sectionName);

    // Date validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !dateRegex.test(startDate)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'A valid Start Date (YYYY-MM-DD) is required.',
      );
    }
    if (!endDate || !dateRegex.test(endDate)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'A valid End Date (YYYY-MM-DD) is required.',
      );
    }
    if (endDate < startDate) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'End date must be on or after the start date.',
      );
    }

    // Storage location & details
    const lockerNo = body.locker_no ? String(body.locker_no).trim() : null;
    const shelfName = body.shelf_name ? String(body.shelf_name).trim() : null;
    const shelfPos = body.shelf_position
      ? String(body.shelf_position).trim()
      : null;
    const validPositions = ['Front', 'Middle', 'Back'];
    const shelfPosition = validPositions.includes(shelfPos || '')
      ? (shelfPos as 'Front' | 'Middle' | 'Back')
      : null;

    const pageNumbers = Math.max(
      0,
      parseInt(String(body.page_numbers ?? '0'), 10) || 0,
    );
    const minuteSheetsCount = Math.max(
      0,
      parseInt(String(body.minute_sheets_count ?? '0'), 10) || 0,
    );

    const repo = new FileRepository(admin);
    const settingsRepo = new SettingsRepository(admin);

    const existingFileNo = await repo.findLiveByFileNo(fileNo);
    if (existingFileNo) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        `File No "${existingFileNo.file_no}" already exists. Enter a unique File No.`,
      );
    }

    const registrarName = actor.full_name || actor.email || 'System Officer';
    const registrarRole = actor.role || 'Staff';

    // ── Enforce Approval Workflow based on Role & System Setting ──────────────
    const isAdmin = actor.role === 'Administrator';
    let fileStatus: 'APPROVED' | 'PENDING' = 'APPROVED';
    let approvedBy: string | null = null;
    let approvedAt: string | null = null;
    let message = '';

    let approvedByName: string | null = null;
    if (isAdmin) {
      // Administrators bypass approval workflow
      fileStatus = 'APPROVED';
      approvedBy = actor.id;
      approvedByName = actor.full_name || actor.email || 'Administrator';
      approvedAt = new Date().toISOString();
      message = 'File added successfully and approved.';
    } else {
      // Staff submissions check the authoritative persistent setting
      const requireApproval = await settingsRepo.getRequireFileApproval();
      if (requireApproval) {
        fileStatus = 'PENDING';
        approvedBy = null;
        approvedByName = null;
        approvedAt = null;
        message =
          'Your file submission has been sent to the administrator for review. It will be added to the file repository after approval.';
      } else {
        fileStatus = 'APPROVED';
        approvedBy = null;
        approvedByName = 'Auto approval on';
        approvedAt = new Date().toISOString();
        message =
          'Your file has been added to the file repository successfully (Auto approved).';
      }
    }

    const payload: Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'> = {
      file_no: fileNo,
      file_name: fileName,
      section_name: sectionName,
      start_date: startDate,
      end_date: endDate,
      locker_no: lockerNo,
      shelf_name: shelfName,
      shelf_position: shelfPosition,
      page_numbers: pageNumbers,
      minute_sheets_count: minuteSheetsCount,
      registrar_name: registrarName,
      registrar_role: registrarRole,
      registered_by: actor.id,
      created_by: actor.id,
      approved_by: approvedBy,
      approved_by_name: approvedByName,
      approved_at: approvedAt,
      archive_repository: 'Central Record Room (B-02)',
      status: fileStatus,
    };

    let file: FileRecordRow;
    try {
      file = await repo.create(payload);
    } catch (err) {
      // Unique index uq_files_file_no_live: another request claimed this File No
      if (isUniqueViolation(err)) {
        throw new ApiError(
          409,
          'VALIDATION_ERROR',
          `File No "${fileNo}" already exists. Enter a unique File No.`,
        );
      }
      throw err;
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action:
          fileStatus === 'PENDING'
            ? 'file.submitted_for_approval'
            : 'file.created',
        details: {
          file_id: file.id,
          file_no: file.file_no,
          file_name: file.file_name,
          section: file.section_name,
          status: file.status,
          auto_approved: fileStatus === 'APPROVED',
        },
      });
    } catch (auditErr) {
      console.warn('Failed to record audit log for file creation:', auditErr);
    }

    return jsonOk(
      {
        file,
        message,
        pending: fileStatus === 'PENDING',
      },
      201,
    );
  }

  /** GET /api/admin/files/[id] — get a single file's complete details */
  static async getFile(id: number) {
    requireServerEnv();
    await AuthorizationService.requireApprovedProfile();

    const admin = getSupabaseAdminClient();
    const file = await new FileRepository(admin).findById(id);
    if (!file) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }
    return jsonOk({ file });
  }

  /** PUT /api/admin/files/[id] — admin edit of an existing file record */
  static async updateFile(id: number, req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => null);
    if (!body)
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findById(id);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }

    const patch: Partial<FileRecordRow> = {};

    if (body.file_name !== undefined) {
      const fileName = String(body.file_name).trim();
      if (!fileName)
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'File name cannot be empty.',
        );
      patch.file_name = fileName;
    }

    if (body.section !== undefined || body.section_name !== undefined) {
      const s = String(body.section ?? body.section_name).trim();
      if (s) {
        // Reassigning is gated on Active status; keeping the current section
        // (even a disabled one) stays allowed so legacy records remain editable.
        if (s.toLowerCase() !== (existing.section_name || '').toLowerCase()) {
          await assertSectionSelectable(new SectionRepository(admin), s);
        }
        patch.section_name = s;
      }
    }

    if (body.start_date !== undefined)
      patch.start_date = String(body.start_date).trim();
    if (body.end_date !== undefined)
      patch.end_date = String(body.end_date).trim();

    if (
      patch.start_date &&
      patch.end_date &&
      patch.end_date < patch.start_date
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'End date must be on or after the start date.',
      );
    }

    if (body.locker_no !== undefined)
      patch.locker_no = body.locker_no ? String(body.locker_no).trim() : null;
    if (body.shelf_name !== undefined)
      patch.shelf_name = body.shelf_name
        ? String(body.shelf_name).trim()
        : null;
    if (body.shelf_position !== undefined)
      patch.shelf_position = body.shelf_position || null;
    if (body.page_numbers !== undefined)
      patch.page_numbers = Math.max(
        0,
        parseInt(String(body.page_numbers), 10) || 0,
      );
    if (body.minute_sheets_count !== undefined)
      patch.minute_sheets_count = Math.max(
        0,
        parseInt(String(body.minute_sheets_count), 10) || 0,
      );

    const updated = await repo.update(id, patch);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.updated',
        details: { file_id: id, patch },
      });
    } catch {}

    return jsonOk({ file: updated, message: 'File updated successfully.' });
  }

  /** DELETE /api/admin/files/[id] — admin delete of a file record */
  static async deleteFile(id: number) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findById(id);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }

    await repo.delete(id);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.deleted',
        details: {
          file_id: id,
          file_no: existing.file_no,
          file_name: existing.file_name,
        },
      });
    } catch {}

    return jsonOk({ message: 'File deleted successfully.' });
  }

  /** POST /api/admin/files/[id]/approve — approve pending submission */
  static async approveFile(id: number) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findById(id);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File request not found.');
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `File request is already ${existing.status.toLowerCase()} and cannot be approved again.`,
      );
    }

    const adminDisplayName = actor.full_name || actor.email || 'Administrator';
    const approved = await approveGuardingFileNo(
      () => repo.approve(id, actor.id, adminDisplayName),
      existing.file_no,
    );

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.approved',
        details: {
          file_id: id,
          file_no: existing.file_no,
          file_name: existing.file_name,
          approver_name: adminDisplayName,
        },
      });
    } catch {}

    return jsonOk({
      file: approved,
      message: `File "${existing.file_name}" has been approved and added to the repository.`,
    });
  }

  /** POST /api/admin/files/[id]/reject — reject pending submission */
  static async rejectFile(id: number, req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason ? String(body.reason).trim() : undefined;

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findById(id);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File request not found.');
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `File request is already ${existing.status.toLowerCase()} and cannot be rejected.`,
      );
    }

    const adminDisplayName = actor.full_name || actor.email || 'Administrator';
    const rejected = await repo.reject(id, actor.id, reason, adminDisplayName);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.rejected',
        details: {
          file_id: id,
          file_no: existing.file_no,
          file_name: existing.file_name,
          reason,
        },
      });
    } catch {}

    return jsonOk({
      file: rejected,
      message: `File submission "${existing.file_name}" has been rejected.`,
    });
  }

  /** GET /api/admin/files/settings — get current approval toggle value */
  static async getApprovalSetting() {
    requireServerEnv();
    await AuthorizationService.requireApprovedProfile();

    const admin = getSupabaseAdminClient();
    const requireApproval = await new SettingsRepository(
      admin,
    ).getRequireFileApproval();
    return jsonOk({
      require_approval: requireApproval,
      auto_approval: !requireApproval,
    });
  }

  /** POST /api/admin/files/settings — toggle approval setting (admin only) */
  static async updateApprovalSetting(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => null);

    let requireApprovalValue: boolean;
    if (body && typeof body.auto_approval === 'boolean') {
      requireApprovalValue = !body.auto_approval;
    } else if (body && typeof body.require_approval === 'boolean') {
      requireApprovalValue = body.require_approval;
    } else {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'require_approval or auto_approval boolean is required.',
      );
    }

    const admin = getSupabaseAdminClient();
    let updated: boolean;
    try {
      updated = await new SettingsRepository(admin).setRequireFileApproval(
        requireApprovalValue,
        actor.id,
      );
    } catch (err) {
      throw new ApiError(
        500,
        'INTERNAL_ERROR',
        err instanceof Error
          ? err.message
          : 'Failed to persist the file approval setting.',
      );
    }

    return jsonOk({
      require_approval: updated,
      auto_approval: !updated,
      message: !updated
        ? 'Auto approval enabled. Staff file submissions will be approved automatically.'
        : 'Auto approval disabled. Staff file submissions now require administrator review.',
    });
  }

  /** POST /api/admin/files/bulk-import — bulk import file records (admin or approved staff).
   * Staff imports honour the approval setting: PENDING when approval is required, else APPROVED. */
  static async bulkImportFiles(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();
    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const isStaffActor = actor.role !== 'Administrator';
    let staffBulkStatus: 'APPROVED' | 'PENDING' = 'APPROVED';
    if (isStaffActor) {
      const requireApproval = await new SettingsRepository(
        admin,
      ).getRequireFileApproval();
      if (requireApproval) staffBulkStatus = 'PENDING';
    }

    let rawRecords: any[] = [];

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.records)) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'A valid JSON body with a "records" array is required.',
        );
      }
      rawRecords = body.records;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData().catch(() => null);
      if (!formData)
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid form data.');
      const file = formData.get('file') as File | null;
      if (!file)
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'No file was uploaded in the "file" field.',
        );

      // 1. File size check (max 10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'The uploaded file exceeds the 10MB size limit.',
        );
      }

      // 2. Extension check
      const fileName = (file.name || '').toLowerCase();
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Invalid file type. Only .csv, .xlsx, and .xls files are supported.',
        );
      }

      const buffer = await file.arrayBuffer();
      const parsed = await parseAndValidateImportBuffer(buffer);
      if (!parsed.isValid && parsed.validRows.length === 0) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          parsed.errors[0]?.reason || 'The uploaded file is invalid.',
        );
      }
      rawRecords = parsed.validRows;
    } else {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Unsupported Content-Type. Use application/json or multipart/form-data.',
      );
    }

    if (rawRecords.length === 0) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'No records found to import.',
      );
    }

    // 1. Fetch sections to resolve names and block inactive assignments
    const sectionRepo = new SectionRepository(admin);
    const existingSections = await sectionRepo.list();
    const sectionMap = new Map<string, string>();
    const blockedSections = new Map<string, string>();
    existingSections.forEach((s) => {
      const key = s.name.toLowerCase().trim();
      sectionMap.set(key, s.name);
      if (!isActiveSection(s)) {
        blockedSections.set(
          key,
          s.status === 'disabled'
            ? 'Selected section is disabled.'
            : 'Selected section is not active yet.',
        );
      }
    });

    // 2. Fetch existing file numbers for duplicate checking
    const candidateFileNos = rawRecords
      .map((r) => String(r.file_no ?? '').trim())
      .filter(Boolean);
    const existingDbFileNos = await repo.findExistingLiveFileNos(
      candidateFileNos,
    );

    const validPayloads: Array<
      Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'>
    > = [];
    // Row numbers aligned with validPayloads, for per-row error reporting
    const payloadRows: number[] = [];
    const errors: Array<{ row: number; file_name?: string; reason: string }> =
      [];
    const seenBatchFileNos = new Set<string>();

    const registrarName = actor.full_name || actor.email || 'System Officer';
    const registrarRole = actor.role || 'Staff';
    const nowIso = new Date().toISOString();
    const bulkApprovedBy = isStaffActor ? null : actor.id;
    const bulkApprovedByName = !isStaffActor
      ? actor.full_name || actor.email || 'Administrator'
      : (staffBulkStatus === 'APPROVED' ? 'Auto approval on' : null);
    const bulkApprovedAt = staffBulkStatus === 'PENDING' ? null : nowIso;

    rawRecords.forEach((record, index) => {
      const rowNum = record.rowIndex ?? index + 1;
      const fileNo = String(record.file_no ?? '').trim();
      const fileName = String(record.file_name ?? '').trim();
      const rawSection = String(
        record.section ?? record.section_name ?? '',
      ).trim();
      const startDate = String(record.start_date ?? '').trim();
      const endDate = String(record.end_date ?? '').trim();

      if (!fileNo) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: 'File No is required.',
        });
        return;
      }
      if (!fileName) {
        errors.push({
          row: rowNum,
          file_name: '',
          reason: 'File Name is required.',
        });
        return;
      }
      if (!rawSection) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: 'Section is required.',
        });
        return;
      }

      // Resolve section name case-insensitively
      const resolvedSection =
        sectionMap.get(rawSection.toLowerCase()) || rawSection;

      const blockedReason = blockedSections.get(
        resolvedSection.toLowerCase().trim(),
      );
      if (blockedReason) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: blockedReason,
        });
        return;
      }

      // Dates
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!startDate || !dateRegex.test(startDate)) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: 'Valid Start Date (YYYY-MM-DD) is required.',
        });
        return;
      }
      if (!endDate || !dateRegex.test(endDate)) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: 'Valid End Date (YYYY-MM-DD) is required.',
        });
        return;
      }
      if (endDate < startDate) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: `End Date (${endDate}) must be on or after Start Date (${startDate}).`,
        });
        return;
      }

      const fileNoKey = fileNo.toLowerCase();
      if (existingDbFileNos.has(fileNoKey)) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: `File No "${fileNo}" already exists in the archive database.`,
        });
        return;
      }

      if (seenBatchFileNos.has(fileNoKey)) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: `Duplicate File No "${fileNo}" in batch.`,
        });
        return;
      }
      seenBatchFileNos.add(fileNoKey);

      // Shelf position
      let shelfPosition: 'Front' | 'Middle' | 'Back' | null = null;
      if (record.shelf_position) {
        const p = String(record.shelf_position).trim().toLowerCase();
        if (p === 'front') shelfPosition = 'Front';
        else if (p === 'middle') shelfPosition = 'Middle';
        else if (p === 'back') shelfPosition = 'Back';
        else {
          errors.push({
            row: rowNum,
            file_name: fileName,
            reason: `Invalid Shelf Position "${record.shelf_position}". Must be Front, Middle, or Back.`,
          });
          return;
        }
      } else {
        shelfPosition = 'Front';
      }

      const pageNumbers = Math.max(
        0,
        parseInt(String(record.page_numbers ?? '0'), 10) || 0,
      );
      const minuteSheetsCount = Math.max(
        0,
        parseInt(String(record.minute_sheets_count ?? '0'), 10) || 0,
      );

      validPayloads.push({
        file_no: fileNo,
        file_name: fileName,
        section_name: resolvedSection,
        start_date: startDate,
        end_date: endDate,
        locker_no: record.locker_no ? String(record.locker_no).trim() : null,
        shelf_name: record.shelf_name ? String(record.shelf_name).trim() : null,
        shelf_position: shelfPosition,
        page_numbers: pageNumbers,
        minute_sheets_count: minuteSheetsCount,
        registrar_name: registrarName,
        registrar_role: registrarRole,
        registered_by: actor.id,
        created_by: actor.id,
        approved_by: bulkApprovedBy,
        approved_by_name: bulkApprovedByName,
        approved_at: bulkApprovedAt,
        archive_repository: 'Central Record Room (B-02)',
        status: staffBulkStatus,
      });
      payloadRows.push(rowNum);
    });

    // Batch insert valid records (chunks of 25). A chunk containing a file
    // number that slipped past the pre-check (e.g. a case variant or a
    // concurrent submission) fails as a whole, so retry it row by row to
    // report exactly which rows collided.
    const BATCH_SIZE = 25;
    const importedRecords: FileRecordRow[] = [];
    for (let i = 0; i < validPayloads.length; i += BATCH_SIZE) {
      const chunk = validPayloads.slice(i, i + BATCH_SIZE);
      try {
        importedRecords.push(...(await repo.createMany(chunk)));
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        for (let j = 0; j < chunk.length; j += 1) {
          try {
            importedRecords.push(...(await repo.createMany([chunk[j]])));
          } catch (rowErr) {
            if (!isUniqueViolation(rowErr)) throw rowErr;
            errors.push({
              row: payloadRows[i + j],
              file_name: chunk[j].file_name,
              reason: `File No "${chunk[j].file_no}" already exists in the archive database.`,
            });
          }
        }
      }
    }

    // Log audit
    if (importedRecords.length > 0) {
      try {
        await new AuditLogRepository(admin).log({
          actorId: actor.id,
          action: 'file.bulk_imported',
          details: {
            total_rows: rawRecords.length,
            imported_count: importedRecords.length,
            failed_count: errors.length,
          },
        });
      } catch (auditErr) {
        console.warn('Audit log failed:', auditErr);
      }
    }

    return jsonOk({
      totalRows: rawRecords.length,
      importedCount: importedRecords.length,
      failedCount: errors.length,
      errors,
      records: importedRecords,
      pending: staffBulkStatus === 'PENDING',
      message:
        staffBulkStatus === 'PENDING'
          ? `Bulk import processed: ${importedRecords.length} records submitted for admin approval, ${errors.length} failed.`
          : `Bulk import processed: ${importedRecords.length} records imported successfully, ${errors.length} failed.`,
    });
  }
  // ── File-No-based methods (File No. as the public-facing primary key) ──────

  /** GET /api/admin/files/[file_no] — get a single file by file_no */
  static async getFileByFileNo(fileNo: string) {
    requireServerEnv();
    await AuthorizationService.requireApprovedProfile();

    const admin = getSupabaseAdminClient();
    const file = await new FileRepository(admin).findByFileNo(fileNo);
    if (!file) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }
    return jsonOk({ file });
  }

  /** PUT /api/admin/files/[file_no] — admin edit of an existing file record by file_no */
  static async updateFileByFileNo(fileNo: string, req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => null);
    if (!body)
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findByFileNo(fileNo);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }
    if (existing.id === undefined) {
      throw new ApiError(500, 'AUTH_ERROR', 'File record has no internal ID.');
    }

    const patch: Partial<FileRecordRow> = {};

    if (body.file_name !== undefined) {
      const fileName = String(body.file_name).trim();
      if (!fileName)
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'File name cannot be empty.',
        );
      patch.file_name = fileName;
    }

    if (body.section !== undefined || body.section_name !== undefined) {
      const s = String(body.section ?? body.section_name).trim();
      if (s) {
        // Reassigning is gated on Active status; keeping the current section
        // (even a disabled one) stays allowed so legacy records remain editable.
        if (s.toLowerCase() !== (existing.section_name || '').toLowerCase()) {
          await assertSectionSelectable(new SectionRepository(admin), s);
        }
        patch.section_name = s;
      }
    }

    if (body.start_date !== undefined)
      patch.start_date = String(body.start_date).trim();
    if (body.end_date !== undefined)
      patch.end_date = String(body.end_date).trim();

    if (
      patch.start_date &&
      patch.end_date &&
      patch.end_date < patch.start_date
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'End date must be on or after the start date.',
      );
    }

    if (body.locker_no !== undefined)
      patch.locker_no = body.locker_no ? String(body.locker_no).trim() : null;
    if (body.shelf_name !== undefined)
      patch.shelf_name = body.shelf_name
        ? String(body.shelf_name).trim()
        : null;
    if (body.shelf_position !== undefined)
      patch.shelf_position = body.shelf_position || null;
    if (body.page_numbers !== undefined)
      patch.page_numbers = Math.max(
        0,
        parseInt(String(body.page_numbers), 10) || 0,
      );
    if (body.minute_sheets_count !== undefined)
      patch.minute_sheets_count = Math.max(
        0,
        parseInt(String(body.minute_sheets_count), 10) || 0,
      );

    const updated = await repo.update(existing.id, patch);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.updated',
        details: { file_no: fileNo, patch },
      });
    } catch {}

    return jsonOk({ file: updated, message: 'File updated successfully.' });
  }

  /** DELETE /api/admin/files/[file_no] — admin delete of a file record by file_no */
  static async deleteFileByFileNo(fileNo: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findByFileNo(fileNo);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }
    if (existing.id === undefined) {
      throw new ApiError(500, 'AUTH_ERROR', 'File record has no internal ID.');
    }

    await repo.delete(existing.id);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.deleted',
        details: { file_no: existing.file_no, file_name: existing.file_name },
      });
    } catch {}

    return jsonOk({ message: 'File deleted successfully.' });
  }

  /** POST /api/admin/files/[file_no]/approve — approve pending submission by file_no */
  static async approveFileByFileNo(fileNo: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findByFileNo(fileNo);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File request not found.');
    }
    if (existing.id === undefined) {
      throw new ApiError(500, 'AUTH_ERROR', 'File record has no internal ID.');
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `File request is already ${(
          existing.status ?? ''
        ).toLowerCase()} and cannot be approved again.`,
      );
    }

    const adminDisplayName = actor.full_name || actor.email || 'Administrator';
    const approved = await approveGuardingFileNo(
      () => repo.approve(existing.id as number, actor.id, adminDisplayName),
      existing.file_no,
    );

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.approved',
        details: {
          file_no: existing.file_no,
          file_name: existing.file_name,
          approver_name: adminDisplayName,
        },
      });
    } catch {}

    return jsonOk({
      file: approved,
      message: `File "${existing.file_name}" has been approved and added to the repository.`,
    });
  }

  /** POST /api/admin/files/[file_no]/reject — reject pending submission by file_no */
  static async rejectFileByFileNo(fileNo: string, req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason ? String(body.reason).trim() : undefined;

    // Validate that a rejection reason is provided
    if (!reason || reason.length === 0) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Rejection reason is required. Please provide a reason before rejecting this file.',
      );
    }

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findByFileNo(fileNo);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File request not found.');
    }
    if (existing.id === undefined) {
      throw new ApiError(500, 'AUTH_ERROR', 'File record has no internal ID.');
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `File request is already ${(
          existing.status ?? ''
        ).toLowerCase()} and cannot be rejected.`,
      );
    }

    const adminDisplayName = actor.full_name || actor.email || 'Administrator';
    const rejected = await repo.reject(
      existing.id,
      actor.id,
      reason,
      adminDisplayName,
    );

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: 'file.rejected',
        details: {
          file_no: existing.file_no,
          file_name: existing.file_name,
          reason,
        },
      });
    } catch {}

    return jsonOk({
      file: rejected,
      message: `File submission "${existing.file_name}" has been rejected.`,
    });
  }
}

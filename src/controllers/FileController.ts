import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { FileRepository, FileRecordRow } from 'models/FileRepository';
import { SettingsRepository } from 'models/SettingsRepository';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';

export class FileController {
  /**
   * GET /api/admin/files — list files with filters, pagination, summary counts,
   * and the current approval setting.
   */
  static async listFiles(req: Request) {
    requireServerEnv();
    await AuthorizationService.requireApprovedProfile();

    const url = new URL(req.url);
    const tab = (url.searchParams.get('tab') as 'requests' | 'all') || 'requests';
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const section = url.searchParams.get('section') || undefined;
    const storage = url.searchParams.get('storage') || undefined;
    const officer = url.searchParams.get('officer') || undefined;
    const date = url.searchParams.get('date') || undefined;
    const sort = (url.searchParams.get('sort') as 'newest' | 'oldest' | 'file_no' | 'file_name') || 'newest';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '15', 10);

    const admin = getSupabaseAdminClient();
    const fileRepo = new FileRepository(admin);
    const settingsRepo = new SettingsRepository(admin);

    const [filteredResult, counts, requireApproval] = await Promise.all([
      fileRepo.listFiltered({
        tab,
        status,
        search,
        section,
        storage,
        officer,
        date,
        sort,
        page,
        limit,
      }),
      fileRepo.getSummaryCounts(),
      settingsRepo.getRequireFileApproval(),
    ]);

    return jsonOk({
      files: filteredResult.files,
      total: filteredResult.total,
      page: filteredResult.page,
      limit: filteredResult.limit,
      totalPages: filteredResult.totalPages,
      counts,
      requireApproval,
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
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

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

    // Date validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !dateRegex.test(startDate)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid Start Date (YYYY-MM-DD) is required.');
    }
    if (!endDate || !dateRegex.test(endDate)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid End Date (YYYY-MM-DD) is required.');
    }
    if (endDate < startDate) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'End date must be on or after the start date.');
    }

    // Storage location & details
    const lockerNo = body.locker_no ? String(body.locker_no).trim() : null;
    const shelfName = body.shelf_name ? String(body.shelf_name).trim() : null;
    const shelfPos = body.shelf_position ? String(body.shelf_position).trim() : null;
    const validPositions = ['Front', 'Middle', 'Back'];
    const shelfPosition = validPositions.includes(shelfPos || '')
      ? (shelfPos as 'Front' | 'Middle' | 'Back')
      : null;

    const pageNumbers = Math.max(0, parseInt(String(body.page_numbers ?? '0'), 10) || 0);
    const minuteSheetsCount = Math.max(
      0,
      parseInt(String(body.minute_sheets_count ?? '0'), 10) || 0,
    );

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);
    const settingsRepo = new SettingsRepository(admin);

    // Uniqueness checks
    const existingByNo = await repo.findByFileNo(fileNo);
    if (existingByNo) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'File number already exists. Please enter a unique file number.',
      );
    }

    const existingByName = await repo.findByFileName(fileName);
    if (existingByName) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'File name already exists. Please enter a unique file name.',
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

    if (isAdmin) {
      // Administrators bypass approval workflow
      fileStatus = 'APPROVED';
      approvedBy = actor.id;
      approvedAt = new Date().toISOString();
      message = 'File added successfully and approved.';
    } else {
      // Staff submissions check the authoritative persistent setting
      const requireApproval = await settingsRepo.getRequireFileApproval();
      if (requireApproval) {
        fileStatus = 'PENDING';
        approvedBy = null;
        approvedAt = null;
        message = 'File submitted successfully and is awaiting administrator approval.';
      } else {
        fileStatus = 'APPROVED';
        approvedBy = null;
        approvedAt = new Date().toISOString();
        message = 'File added successfully to the repository.';
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
      approved_at: approvedAt,
      archive_repository: 'Central Record Room (B-02)',
      status: fileStatus,
    };

    const file = await repo.create(payload);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        action: fileStatus === 'PENDING' ? 'file.submitted_for_approval' : 'file.created',
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

    return jsonOk({ file, message }, 201);
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
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    const existing = await repo.findById(id);
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'File record not found.');
    }

    const patch: Partial<FileRecordRow> = {};

    if (body.file_name !== undefined) {
      const fileName = String(body.file_name).trim();
      if (!fileName) throw new ApiError(400, 'VALIDATION_ERROR', 'File name cannot be empty.');
      if (fileName.toLowerCase() !== existing.file_name.toLowerCase()) {
        const dup = await repo.findByFileName(fileName);
        if (dup && dup.id !== id) {
          throw new ApiError(409, 'VALIDATION_ERROR', 'File name already exists.');
        }
      }
      patch.file_name = fileName;
    }

    if (body.section !== undefined || body.section_name !== undefined) {
      const s = String(body.section ?? body.section_name).trim();
      if (s) patch.section_name = s;
    }

    if (body.start_date !== undefined) patch.start_date = String(body.start_date).trim();
    if (body.end_date !== undefined) patch.end_date = String(body.end_date).trim();

    if (patch.start_date && patch.end_date && patch.end_date < patch.start_date) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'End date must be on or after the start date.');
    }

    if (body.locker_no !== undefined) patch.locker_no = body.locker_no ? String(body.locker_no).trim() : null;
    if (body.shelf_name !== undefined) patch.shelf_name = body.shelf_name ? String(body.shelf_name).trim() : null;
    if (body.shelf_position !== undefined) patch.shelf_position = body.shelf_position || null;
    if (body.page_numbers !== undefined) patch.page_numbers = Math.max(0, parseInt(String(body.page_numbers), 10) || 0);
    if (body.minute_sheets_count !== undefined) patch.minute_sheets_count = Math.max(0, parseInt(String(body.minute_sheets_count), 10) || 0);

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
        details: { file_id: id, file_no: existing.file_no, file_name: existing.file_name },
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
    const approved = await repo.approve(id, actor.id, adminDisplayName);

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

    const rejected = await repo.reject(id, actor.id, reason);

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
    const requireApproval = await new SettingsRepository(admin).getRequireFileApproval();
    return jsonOk({ require_approval: requireApproval });
  }

  /** POST /api/admin/files/settings — toggle approval setting (admin only) */
  static async updateApprovalSetting(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => null);

    if (!body || typeof body.require_approval !== 'boolean') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'require_approval must be a boolean (true or false).',
      );
    }

    const admin = getSupabaseAdminClient();
    const updated = await new SettingsRepository(admin).setRequireFileApproval(
      body.require_approval,
      actor.id,
    );

    return jsonOk({
      require_approval: updated,
      message: `Admin approval requirement has been ${updated ? 'enabled' : 'disabled'}.`,
    });
  }
}

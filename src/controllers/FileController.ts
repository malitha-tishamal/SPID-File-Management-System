import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { FileRepository, FileRecordRow } from 'models/FileRepository';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';

export class FileController {
  /** GET /api/admin/files — list files */
  static async listFiles() {
    requireServerEnv();
    await AuthorizationService.requireApprovedProfile();
    const admin = getSupabaseAdminClient();
    const files = await new FileRepository(admin).list();
    return jsonOk({ files });
  }

  /** POST /api/admin/files — create a new file record */
  static async createFile(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const fileNo = String(body.file_no ?? '').trim();
    const fileName = String(body.file_name ?? '').trim();
    const sectionName = String(body.section ?? body.section_name ?? '').trim();

    // ── date fields (replaces year) ──────────────────────────────────────────
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

    // Optional fields — shelf_name (previously shelf_no)
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

    // ── Uniqueness check on file_name ────────────────────────────────────────
    const existingByName = await repo.findByFileName(fileName);
    if (existingByName) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'File name already exists. Please enter a unique file name.',
      );
    }

    const registrarName = actor.full_name || actor.email || 'System Officer';
    const registrarRole = actor.role || 'Administrator';

    // ── Auto-approve Admin-created files ─────────────────────────────────────
    const isAdmin = actor.role === 'Administrator';
    const fileStatus = isAdmin ? 'APPROVED' : 'PENDING';
    const approvedBy = isAdmin ? actor.id : null;
    const approvedAt = isAdmin ? new Date().toISOString() : null;

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
        action: 'file.created',
        details: {
          file_id: file.id,
          file_no: file.file_no,
          file_name: file.file_name,
          section: file.section_name,
          status: file.status,
          auto_approved: isAdmin,
        },
      });
    } catch (auditErr) {
      console.warn('Failed to record audit log for file creation:', auditErr);
    }

    const message = isAdmin
      ? 'File added successfully and approved.'
      : 'File submitted successfully and is pending approval.';

    return jsonOk({ file, message });
  }
}

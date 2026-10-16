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
    const rawYear = body.year;
    const year = typeof rawYear === 'number' ? rawYear : parseInt(String(rawYear ?? '').trim(), 10);

    // Validation
    if (!fileNo) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'File No is required.');
    }
    if (!fileName) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'File Name is required.');
    }
    if (!sectionName) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Section is required.');
    }
    if (!year || isNaN(year) || year < 1900 || year > 2100) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid Year must be selected.');
    }

    // Optional fields
    const lockerNo = body.locker_no ? String(body.locker_no).trim() : null;
    const shelfNo = body.shelf_no ? String(body.shelf_no).trim() : null;
    const shelfPos = body.shelf_position ? String(body.shelf_position).trim() : null;
    const validPositions = ['Front', 'Middle', 'Back'];
    const shelfPosition = validPositions.includes(shelfPos || '') ? (shelfPos as 'Front' | 'Middle' | 'Back') : null;

    const pageNumbers = Math.max(0, parseInt(String(body.page_numbers ?? '0'), 10) || 0);
    const minuteSheetsCount = Math.max(0, parseInt(String(body.minute_sheets_count ?? '0'), 10) || 0);

    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    // Duplicate check
    const existing = await repo.findByFileNo(fileNo);
    if (existing) {
      throw new ApiError(409, 'VALIDATION_ERROR', `File No "${fileNo}" already exists in the system.`);
    }

    const registrarName = actor.full_name || actor.email || 'System Officer';
    const registrarRole = actor.role || 'Administrator';

    const payload: Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'> = {
      file_no: fileNo,
      file_name: fileName,
      section_name: sectionName,
      year,
      locker_no: lockerNo,
      shelf_no: shelfNo,
      shelf_position: shelfPosition,
      page_numbers: pageNumbers,
      minute_sheets_count: minuteSheetsCount,
      registrar_name: registrarName,
      registrar_role: registrarRole,
      registered_by: actor.id,
      archive_repository: 'Central Record Room (B-02)',
      status: 'active',
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
        },
      });
    } catch (auditErr) {
      console.warn('Failed to record audit log for file creation:', auditErr);
    }

    return jsonOk({
      file,
      message: 'The file has been successfully added to the system.',
    });
  }
}

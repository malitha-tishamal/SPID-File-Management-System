import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { FileRepository, FileRecordRow } from 'models/FileRepository';
import { SectionRepository } from 'models/SectionRepository';
import { parseAndValidateImportBuffer } from 'utils/fileImport';
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

  /** POST /api/admin/files/bulk-import — bulk import file records */
  static async bulkImportFiles(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const admin = getSupabaseAdminClient();
    const repo = new FileRepository(admin);

    let rawRecords: any[] = [];

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.records)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'A valid JSON body with a "records" array is required.');
      }
      rawRecords = body.records;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData().catch(() => null);
      if (!formData) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid form data.');
      const file = formData.get('file') as File | null;
      if (!file) throw new ApiError(400, 'VALIDATION_ERROR', 'No file was uploaded in the "file" field.');
      const buffer = await file.arrayBuffer();
      const parsed = await parseAndValidateImportBuffer(buffer);
      if (!parsed.isValid && parsed.validRows.length === 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', parsed.errors[0]?.reason || 'The uploaded file is invalid.');
      }
      rawRecords = parsed.validRows;
    } else {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported Content-Type. Use application/json or multipart/form-data.');
    }

    if (rawRecords.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No records found to import.');
    }

    // 1. Fetch existing active sections to resolve/verify section names
    const sectionRepo = new SectionRepository(admin);
    const existingSections = await sectionRepo.list();
    const sectionMap = new Map<string, string>();
    existingSections.forEach((s) => {
      sectionMap.set(s.name.toLowerCase().trim(), s.name);
    });

    // 2. Fetch existing file names for duplicate check
    const candidateNames = rawRecords.map((r) => String(r.file_name ?? '').trim()).filter(Boolean);
    const existingDbNames = await repo.findExistingFileNames(candidateNames);

    const validPayloads: Array<Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'>> = [];
    const errors: Array<{ row: number; file_name?: string; reason: string }> = [];
    const seenBatchNames = new Set<string>();

    const registrarName = actor.full_name || actor.email || 'System Officer';
    const registrarRole = actor.role || 'Administrator';
    const nowIso = new Date().toISOString();

    rawRecords.forEach((record, index) => {
      const rowNum = record.rowIndex ?? (index + 1);
      const fileNo = String(record.file_no ?? '').trim();
      const fileName = String(record.file_name ?? '').trim();
      const rawSection = String(record.section ?? record.section_name ?? '').trim();
      const startDate = String(record.start_date ?? '').trim();
      const endDate = String(record.end_date ?? '').trim();

      if (!fileNo) {
        errors.push({ row: rowNum, file_name: fileName, reason: 'File No is required.' });
        return;
      }
      if (!fileName) {
        errors.push({ row: rowNum, file_name: '', reason: 'File Name is required.' });
        return;
      }
      if (!rawSection) {
        errors.push({ row: rowNum, file_name: fileName, reason: 'Section is required.' });
        return;
      }

      // Resolve section name case-insensitively
      const resolvedSection = sectionMap.get(rawSection.toLowerCase()) || rawSection;

      // Dates
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!startDate || !dateRegex.test(startDate)) {
        errors.push({ row: rowNum, file_name: fileName, reason: 'Valid Start Date (YYYY-MM-DD) is required.' });
        return;
      }
      if (!endDate || !dateRegex.test(endDate)) {
        errors.push({ row: rowNum, file_name: fileName, reason: 'Valid End Date (YYYY-MM-DD) is required.' });
        return;
      }
      if (endDate < startDate) {
        errors.push({ row: rowNum, file_name: fileName, reason: `End Date (${endDate}) must be on or after Start Date (${startDate}).` });
        return;
      }

      // Check DB duplicate
      const lowerName = fileName.toLowerCase();
      if (existingDbNames.has(lowerName)) {
        errors.push({ row: rowNum, file_name: fileName, reason: `File name "${fileName}" already exists in the archive database.` });
        return;
      }

      // Check batch duplicate
      if (seenBatchNames.has(lowerName)) {
        errors.push({ row: rowNum, file_name: fileName, reason: `Duplicate file name "${fileName}" in batch.` });
        return;
      }
      seenBatchNames.add(lowerName);

      // Shelf position
      let shelfPosition: 'Front' | 'Middle' | 'Back' | null = null;
      if (record.shelf_position) {
        const p = String(record.shelf_position).trim().toLowerCase();
        if (p === 'front') shelfPosition = 'Front';
        else if (p === 'middle') shelfPosition = 'Middle';
        else if (p === 'back') shelfPosition = 'Back';
        else {
          errors.push({ row: rowNum, file_name: fileName, reason: `Invalid Shelf Position "${record.shelf_position}". Must be Front, Middle, or Back.` });
          return;
        }
      } else {
        shelfPosition = 'Front';
      }

      const pageNumbers = Math.max(0, parseInt(String(record.page_numbers ?? '0'), 10) || 0);
      const minuteSheetsCount = Math.max(0, parseInt(String(record.minute_sheets_count ?? '0'), 10) || 0);

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
        approved_by: actor.id,
        approved_at: nowIso,
        archive_repository: 'Central Record Room (B-02)',
        status: 'APPROVED',
      });
    });

    // Batch insert valid records (chunks of 25)
    const BATCH_SIZE = 25;
    const importedRecords: FileRecordRow[] = [];
    for (let i = 0; i < validPayloads.length; i += BATCH_SIZE) {
      const chunk = validPayloads.slice(i, i + BATCH_SIZE);
      const inserted = await repo.createMany(chunk);
      importedRecords.push(...inserted);
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
      message: `Bulk import processed: ${importedRecords.length} records imported successfully, ${errors.length} failed.`,
    });
  }
}

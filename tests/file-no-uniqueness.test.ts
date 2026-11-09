import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// A small Supabase stub that enforces the uq_files_file_no_live rule the way
// Postgres does: one live (non-REJECTED) row per lower(btrim(file_no)).
// ---------------------------------------------------------------------------

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: 'http://localhost:3000',
}));

vi.mock('services/MalwareScanner', () => ({
  MalwareScanService: {
    scanFile: vi.fn(async () => ({ status: 'clean', engine: 'clamscan', durationMs: 3 })),
    getStatus: vi.fn(async () => ({
      requested: 'auto',
      engine: 'clamscan',
      available: true,
      detail: 'test scanner',
      timeoutMs: 1000,
    })),
  },
}));

interface FileRow {
  id: number;
  file_no: string;
  file_name: string;
  section_name: string;
  start_date: string;
  end_date: string;
  locker_no: string | null;
  shelf_name: string | null;
  shelf_position: 'Front' | 'Middle' | 'Back' | null;
  page_numbers: number;
  minute_sheets_count: number;
  registrar_name: string | null;
  registrar_role: string | null;
  registered_by: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  rejected_at: string | null;
  rejected_by_name: string | null;
  archive_repository: string;
  status: string;
  created_at: string;
  updated_at: string;
}

let files: FileRow[] = [];
let nextId = 100;

const normalize = (fileNo: string) => fileNo.trim().toLowerCase();

const uniqueViolation = () => ({
  code: '23505',
  message:
    'duplicate key value violates unique constraint "uq_files_file_no_live"',
  details: null,
});

/** The live row this candidate would collide with, if any. */
function findLiveConflict(
  candidate: { file_no: string; status?: string },
  ignoreId?: number,
): FileRow | null {
  if (candidate.status === 'REJECTED') return null;
  return (
    files.find(
      (row) =>
        row.id !== ignoreId &&
        row.status !== 'REJECTED' &&
        normalize(row.file_no) === normalize(candidate.file_no),
    ) ?? null
  );
}

function selectChain(rows: any[]) {
  let filtered = [...rows];
  const chain: any = {
    eq: (col: string, val: any) => {
      filtered = filtered.filter((row) => row[col] === val);
      return chain;
    },
    in: (col: string, vals: any[]) => {
      filtered = filtered.filter((row) => vals.includes(row[col]));
      return chain;
    },
    ilike: (col: string, val: string) => {
      const needle = val.replace(/%/g, '').trim().toLowerCase();
      filtered = filtered.filter(
        (row) => String(row[col] ?? '').trim().toLowerCase() === needle,
      );
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    range: (from: number, to: number) =>
      Promise.resolve({
        data: filtered.slice(from, to + 1),
        count: filtered.length,
        error: null,
      }),
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    single: () =>
      Promise.resolve(
        filtered[0]
          ? { data: filtered[0], error: null }
          : { data: null, error: { message: 'Not found' } },
      ),
    then: (resolve: any, reject: any) =>
      Promise.resolve({
        data: filtered,
        count: filtered.length,
        error: null,
      }).then(resolve, reject),
  };
  return chain;
}

function storeRow(input: any): FileRow {
  const now = new Date().toISOString();
  const row: FileRow = {
    id: nextId++,
    file_no: input.file_no,
    file_name: input.file_name,
    section_name: input.section_name,
    start_date: input.start_date,
    end_date: input.end_date,
    locker_no: input.locker_no ?? null,
    shelf_name: input.shelf_name ?? null,
    shelf_position: input.shelf_position ?? null,
    page_numbers: input.page_numbers ?? 0,
    minute_sheets_count: input.minute_sheets_count ?? 0,
    registrar_name: input.registrar_name ?? null,
    registrar_role: input.registrar_role ?? null,
    registered_by: input.registered_by ?? null,
    created_by: input.created_by ?? null,
    approved_by: input.approved_by ?? null,
    approved_by_name: input.approved_by_name ?? null,
    approved_at: input.approved_at ?? null,
    reject_reason: input.reject_reason ?? null,
    rejected_at: input.rejected_at ?? null,
    rejected_by_name: input.rejected_by_name ?? null,
    archive_repository: input.archive_repository ?? 'Central Record Room (B-02)',
    status: input.status ?? 'PENDING',
    created_at: now,
    updated_at: now,
  };
  files.push(row);
  return row;
}

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'files') {
        return {
          select: () => selectChain(files),
          insert: (rows: any[]) => ({
            select: () => ({
              single: () => {
                const conflict = findLiveConflict(rows[0]);
                if (conflict) {
                  return Promise.resolve({ data: null, error: uniqueViolation() });
                }
                return Promise.resolve({ data: storeRow(rows[0]), error: null });
              },
              // createMany: a chunk is atomic, so one conflict fails the batch
              then: (resolve: any, reject: any) => {
                const conflict = rows.find((row) => findLiveConflict(row));
                if (conflict) {
                  return Promise.resolve({
                    data: null,
                    error: uniqueViolation(),
                  }).then(resolve, reject);
                }
                return Promise.resolve({
                  data: rows.map((row) => storeRow(row)),
                  error: null,
                }).then(resolve, reject);
              },
            }),
          }),
          update: (patch: any) => ({
            eq: (col: string, val: any) => ({
              select: () => ({
                single: () => {
                  const target = files.find((row: any) => row[col] === val);
                  if (!target) {
                    return Promise.resolve({
                      data: null,
                      error: { message: 'Not found' },
                    });
                  }
                  if (findLiveConflict({ ...target, ...patch }, target.id)) {
                    return Promise.resolve({
                      data: null,
                      error: uniqueViolation(),
                    });
                  }
                  Object.assign(target, patch, {
                    updated_at: new Date().toISOString(),
                  });
                  return Promise.resolve({ data: target, error: null });
                },
              }),
            }),
          }),
          delete: () => ({
            eq: (col: string, val: any) => {
              files = files.filter((row: any) => row[col] !== val);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === 'sections') {
        return {
          select: () =>
            selectChain([{ id: 1, name: 'Administration' }]),
        };
      }

      if (table === 'system_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { value: { enabled: false }, updated_at: null },
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === 'audit_logs') {
        return {
          insert: () => Promise.resolve({ error: null }),
          select: () => selectChain([]),
        };
      }

      return { select: () => selectChain([]) };
    },
  }),
}));

const mockRequireApprovedProfile = vi.fn();
const mockRequireAdminProfile = vi.fn();

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireApprovedProfile: () => mockRequireApprovedProfile(),
    requireAdminProfile: () => mockRequireAdminProfile(),
  },
}));

import { FileController } from 'controllers/FileController';
import { isUniqueViolation } from 'models/FileRepository';

const admin = {
  id: 'admin-1',
  role: 'Administrator',
  email: 'admin@spid.gov.lk',
  full_name: 'System Admin',
  account_status: 'approved',
};

function seed(overrides: Partial<FileRow>): FileRow {
  return storeRow({
    file_name: 'Seeded File',
    section_name: 'Administration',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    ...overrides,
  });
}

function filePayload(fileNo: string, fileName = 'New Dossier') {
  return {
    file_no: fileNo,
    file_name: fileName,
    section: 'Administration',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  };
}

function postJson(body: unknown) {
  return new Request('http://localhost:3000/api/admin/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Bulk import now requires a scanned spreadsheet upload, not JSON rows. */
function postCsv(rows: Array<{ file_no: string; file_name: string }>): Request {
  const header = 'File No,File Name,Section,Start Date,End Date';
  const body = rows
    .map((row) =>
      [row.file_no, row.file_name, 'Administration', '2026-01-01', '2026-12-31'].join(','),
    )
    .join('\n');
  const formData = new FormData();
  formData.append(
    'file',
    new File([`${header}\n${body}\n`], 'bulk-import.csv', { type: 'text/csv' }),
  );
  return new Request('http://localhost:3000/api/admin/files/bulk-import', {
    method: 'POST',
    body: formData,
  });
}

describe('File No. uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files = [];
    nextId = 100;
    mockRequireApprovedProfile.mockResolvedValue(admin);
    mockRequireAdminProfile.mockResolvedValue(admin);
  });

  it('rejects a duplicate File No regardless of casing', async () => {
    seed({ file_no: 'FL-2026-0001', status: 'APPROVED' });

    await expect(
      FileController.createFile(postJson(filePayload('fl-2026-0001'))),
    ).rejects.toThrow('File No "FL-2026-0001" already exists');
    expect(files).toHaveLength(1);
  });

  it('still rejects a duplicate File No when only the file name differs', async () => {
    seed({ file_no: 'FL-2026-0002', status: 'APPROVED' });

    await expect(
      FileController.createFile(
        postJson(filePayload('FL-2026-0002', 'Completely Different Name')),
      ),
    ).rejects.toThrow('File No "FL-2026-0002" already exists');
  });

  it('allows a rejected file number to be reused', async () => {
    seed({
      file_no: 'FL-2026-0003',
      status: 'REJECTED',
      reject_reason: 'Wrong section',
    });

    const res = await FileController.createFile(
      postJson(filePayload('FL-2026-0003')),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.file.file_no).toBe('FL-2026-0003');
    expect(json.data.file.status).toBe('APPROVED');
    expect(files).toHaveLength(2);
  });

  it('allows the same file name under a different file number', async () => {
    seed({ file_no: 'FL-2026-0004', file_name: 'Shared Name', status: 'APPROVED' });

    const res = await FileController.createFile(
      postJson(filePayload('FL-2026-0005', 'Shared Name')),
    );

    expect(res.status).toBe(201);
  });

  it('reports duplicates found in a bulk import and imports the rest', async () => {
    seed({ file_no: 'FL-2026-0010', status: 'APPROVED' });

    const res = await FileController.bulkImportFiles(
      postCsv([
        { file_no: 'FL-2026-0010', file_name: 'Dup' },
        { file_no: 'FL-2026-0011', file_name: 'Fresh' },
      ]),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.importedCount).toBe(1);
    expect(json.data.failedCount).toBe(1);
    expect(json.data.errors[0].reason).toContain(
      'File No "FL-2026-0010" already exists in the archive database',
    );
  });

  it('rejects repeated file numbers within the same upload', async () => {
    const res = await FileController.bulkImportFiles(
      postCsv([
        { file_no: 'FL-2026-0012', file_name: 'First' },
        { file_no: 'FL-2026-0012', file_name: 'Second' },
      ]),
    );
    const json = await res.json();

    expect(json.data.importedCount).toBe(1);
    expect(json.data.failedCount).toBe(1);
    expect(json.data.errors[0].reason).toContain('Duplicate File No "FL-2026-0012"');
  });

  it('catches a case-variant duplicate that the pre-check misses', async () => {
    seed({ file_no: 'fl-2026-0013', status: 'APPROVED' });

    const res = await FileController.bulkImportFiles(
      postCsv([{ file_no: 'FL-2026-0013', file_name: 'Case Variant' }]),
    );
    const json = await res.json();

    expect(json.data.importedCount).toBe(0);
    expect(json.data.failedCount).toBe(1);
    expect(json.data.errors[0].reason).toContain(
      'File No "FL-2026-0013" already exists in the archive database',
    );
  });

  it('blocks approving a request whose File No is already live', async () => {
    // Legacy state: two live rows sharing one file number
    const pending = seed({ file_no: 'FL-2026-0014', status: 'PENDING' });
    seed({ file_no: 'FL-2026-0014', status: 'APPROVED' });

    await expect(FileController.approveFile(pending.id)).rejects.toThrow(
      'already used by another live record',
    );
  });

  it('recognises unique violations from Postgres and wrapped repository errors', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(
      isUniqueViolation({
        message:
          'FileRepository.approve error: duplicate key value violates unique constraint "uq_files_file_no_live"',
      }),
    ).toBe(true);
    expect(isUniqueViolation({ message: 'Not found' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

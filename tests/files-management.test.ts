import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
const mockRequireApprovedProfile = vi.fn();
const mockRequireAdminProfile = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: 'http://localhost:3000',
}));

// In-memory data store for file tests
interface MockFile {
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
  registrar_name: string;
  registrar_role: string;
  registered_by: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'active';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

let mockFilesStore: MockFile[] = [];
let mockSettingsStore: { require_approval: boolean } = { require_approval: true };
let nextId = 100;

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'files') {
        return {
          select: (cols: string, opts?: { count?: string; head?: boolean }) => {
            let filtered = [...mockFilesStore];

            const chain: any = {
              eq: (col: string, val: any) => {
                filtered = filtered.filter((r: any) => r[col] === val);
                return chain;
              },
              in: (col: string, vals: any[]) => {
                filtered = filtered.filter((r: any) => vals.includes(r[col]));
                return chain;
              },
              or: (orClause: string) => {
                // simple search simulation
                return chain;
              },
              ilike: (col: string, val: string) => {
                const search = val.replace(/%/g, '').toLowerCase();
                filtered = filtered.filter((r: any) =>
                  String(r[col] || '').toLowerCase().includes(search)
                );
                return chain;
              },
              gte: (col: string, val: string) => {
                filtered = filtered.filter((r: any) => r[col] >= val);
                return chain;
              },
              lte: (col: string, val: string) => {
                filtered = filtered.filter((r: any) => r[col] <= val);
                return chain;
              },
              order: (col: string, orderOpts?: { ascending?: boolean }) => {
                const asc = orderOpts?.ascending ?? true;
                filtered.sort((a: any, b: any) => {
                  if (a[col] < b[col]) return asc ? -1 : 1;
                  if (a[col] > b[col]) return asc ? 1 : -1;
                  return 0;
                });
                return chain;
              },
              range: (from: number, to: number) => {
                const sliced = filtered.slice(from, to + 1);
                return Promise.resolve({ data: sliced, count: filtered.length, error: null });
              },
              maybeSingle: () => {
                return Promise.resolve({ data: filtered[0] || null, error: null });
              },
              single: () => {
                if (filtered.length === 0) return Promise.resolve({ data: null, error: { message: 'Not found' } });
                return Promise.resolve({ data: filtered[0], error: null });
              },
              then: (resolve: any) => {
                if (opts?.head) {
                  return Promise.resolve({ count: filtered.length, error: null }).then(resolve);
                }
                return Promise.resolve({ data: filtered, count: filtered.length, error: null }).then(resolve);
              },
            };
            return chain;
          },
          insert: (rows: any[]) => ({
            select: () => ({
              single: () => {
                const row = rows[0];
                const newRow: MockFile = {
                  id: nextId++,
                  file_no: row.file_no,
                  file_name: row.file_name,
                  section_name: row.section_name,
                  start_date: row.start_date,
                  end_date: row.end_date,
                  locker_no: row.locker_no ?? null,
                  shelf_name: row.shelf_name ?? null,
                  shelf_position: row.shelf_position ?? null,
                  page_numbers: row.page_numbers ?? 0,
                  minute_sheets_count: row.minute_sheets_count ?? 0,
                  registrar_name: row.registrar_name ?? 'Test User',
                  registrar_role: row.registrar_role ?? 'Staff',
                  registered_by: row.registered_by ?? 'user-id',
                  status: row.status ?? 'PENDING',
                  approved_by: row.approved_by ?? null,
                  approved_at: row.approved_at ?? null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                mockFilesStore.push(newRow);
                return Promise.resolve({ data: newRow, error: null });
              },
            }),
          }),
          update: (patch: any) => ({
            eq: (col: string, val: any) => ({
              select: () => ({
                single: () => {
                  const item = mockFilesStore.find((r: any) => r[col] === val);
                  if (item) {
                    Object.assign(item, patch, { updated_at: new Date().toISOString() });
                    return Promise.resolve({ data: item, error: null });
                  }
                  return Promise.resolve({ data: null, error: { message: 'Not found' } });
                },
              }),
            }),
          }),
          delete: () => ({
            eq: (col: string, val: any) => {
              mockFilesStore = mockFilesStore.filter((r: any) => r[col] !== val);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === 'system_settings') {
        return {
          select: () => ({
            eq: (_keyCol: string, _keyVal: string) => ({
              maybeSingle: () => {
                return Promise.resolve({
                  data: { value: { enabled: mockSettingsStore.require_approval } },
                  error: null,
                });
              },
            }),
          }),
          upsert: (payload: any) => {
            if (payload?.value?.enabled !== undefined) {
              mockSettingsStore.require_approval = payload.value.enabled;
            }
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'audit_logs') {
        return {
          insert: (entry: any) => {
            mockAuditLog(entry);
            if (entry?.action === 'system_setting.file_approval' && entry?.details?.require_approval !== undefined) {
              mockSettingsStore.require_approval = entry.details.require_approval;
            }
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => {
                    return Promise.resolve({
                      data: { details: { require_approval: mockSettingsStore.require_approval } },
                      error: null,
                    });
                  },
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    },
  }),
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireApprovedProfile: () => mockRequireApprovedProfile(),
    requireAdminProfile: () => mockRequireAdminProfile(),
  },
}));

import { FileController } from 'controllers/FileController';
import { ApiError } from 'lib/apiResponse';

describe('Manage System Files — Full Workflow Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilesStore = [
      {
        id: 1,
        file_no: 'FL-2026-0001',
        file_name: 'Existing Finalized File 1',
        section_name: 'Legal & Contracts',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        locker_no: 'Rack A-04',
        shelf_name: 'Shelf 2',
        shelf_position: 'Front',
        page_numbers: 10,
        minute_sheets_count: 2,
        registrar_name: 'System Admin',
        registrar_role: 'Administrator',
        registered_by: 'admin-1',
        status: 'APPROVED',
        approved_by: 'admin-1',
        approved_at: '2026-10-01T10:00:00.000Z',
        created_at: '2026-10-01T10:00:00.000Z',
        updated_at: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 2,
        file_no: 'FL-2026-0002',
        file_name: 'Pending Staff Request 1',
        section_name: 'Land & Hydrology',
        start_date: '2026-02-01',
        end_date: '2026-12-31',
        locker_no: 'Wing C',
        shelf_name: 'Compactor 09',
        shelf_position: 'Middle',
        page_numbers: 25,
        minute_sheets_count: 5,
        registrar_name: 'Elena Rostova',
        registrar_role: 'Staff',
        registered_by: 'staff-1',
        status: 'PENDING',
        approved_by: null,
        approved_at: null,
        created_at: '2026-10-09T10:00:00.000Z',
        updated_at: '2026-10-09T10:00:00.000Z',
      },
    ];
    mockSettingsStore = { require_approval: true };
    nextId = 10;

    mockRequireApprovedProfile.mockResolvedValue({
      id: 'admin-1',
      role: 'Administrator',
      email: 'admin@spid.gov.lk',
      full_name: 'Malitha Tishamal',
      account_status: 'approved',
    });
    mockRequireAdminProfile.mockResolvedValue({
      id: 'admin-1',
      role: 'Administrator',
      email: 'admin@spid.gov.lk',
      full_name: 'Malitha Tishamal',
      account_status: 'approved',
    });
  });

  // 1 & 2. File Requests tab loads pending requests by default
  it('1 & 2: loads pending staff requests when tab=requests', async () => {
    const req = new Request('http://localhost:3000/api/admin/files?tab=requests');
    const res = await FileController.listFiles(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.files).toHaveLength(1);
    expect(json.data.files[0].status).toBe('PENDING');
    expect(json.data.files[0].file_no).toBe('FL-2026-0002');
    expect(json.data.counts.pendingCount).toBe(1);
  });

  // 3. All Files tab loads finalized file records (APPROVED / active)
  it('3: loads finalized file records when tab=all and excludes pending submissions', async () => {
    const req = new Request('http://localhost:3000/api/admin/files?tab=all');
    const res = await FileController.listFiles(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.files).toHaveLength(1);
    expect(json.data.files[0].status).toBe('APPROVED');
    expect(json.data.files[0].file_no).toBe('FL-2026-0001');
    expect(json.data.counts.allFilesCount).toBe(1);
  });

  // 4. Approving a request finalizes file into active repository
  it('4: approving a pending request updates status to APPROVED and records approver metadata', async () => {
    const res = await FileController.approveFile(2);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.file.status).toBe('APPROVED');
    expect(json.data.file.approved_by).toBe('admin-1');
    expect(json.data.file.approved_at).toBeDefined();

    // Verify file now appears in All Files
    const allReq = new Request('http://localhost:3000/api/admin/files?tab=all');
    const allRes = await FileController.listFiles(allReq);
    const allJson = await allRes.json();
    expect(allJson.data.files.map((f: any) => f.id)).toContain(2);
  });

  // 5. Rejecting a request sets status to REJECTED and does NOT add to All Files
  it('5: rejecting a request sets REJECTED status and does not add file to All Files', async () => {
    const req = new Request('http://localhost:3000/api/admin/files/2/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Invalid survey documentation' }),
    });
    const res = await FileController.rejectFile(2, req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.file.status).toBe('REJECTED');

    // Confirm it does NOT appear in All Files tab
    const allReq = new Request('http://localhost:3000/api/admin/files?tab=all');
    const allRes = await FileController.listFiles(allReq);
    const allJson = await allRes.json();
    expect(allJson.data.files.map((f: any) => f.id)).not.toContain(2);

    // Confirm it left the pending queue
    const reqsReq = new Request('http://localhost:3000/api/admin/files?tab=requests');
    const reqsRes = await FileController.listFiles(reqsReq);
    const reqsJson = await reqsRes.json();
    expect(reqsJson.data.files.map((f: any) => f.id)).not.toContain(2);
  });

  // 6. A pending request cannot be approved twice
  it('6: prevents double-approval of an already approved request', async () => {
    // First approval
    await FileController.approveFile(2);

    // Second approval attempt
    await expect(FileController.approveFile(2)).rejects.toThrow(
      new ApiError(400, 'VALIDATION_ERROR', 'File request is already approved and cannot be approved again.')
    );
  });

  // 7. Staff submission with approval enabled creates a PENDING request
  it('7: staff submission with approval enabled creates a PENDING request', async () => {
    mockSettingsStore.require_approval = true;
    mockRequireApprovedProfile.mockResolvedValue({
      id: 'staff-user-99',
      role: 'Staff',
      email: 'staff@spid.gov.lk',
      full_name: 'Marcus Grohs',
      account_status: 'approved',
    });

    const req = new Request('http://localhost:3000/api/admin/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_no: 'FL-2026-0005',
        file_name: 'Hydrology Basin Report 2026',
        section_name: 'Land & Hydrology',
        start_date: '2026-01-01',
        end_date: '2026-06-30',
        locker_no: 'Wing C',
        shelf_name: 'Compactor 09',
        shelf_position: 'Front',
        page_numbers: 30,
        minute_sheets_count: 5,
      }),
    });

    const res = await FileController.createFile(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.file.status).toBe('PENDING');
    expect(json.data.message).toContain('awaiting administrator approval');
  });

  // 8. Staff submission with approval disabled creates an APPROVED file directly
  it('8: staff submission with approval disabled creates an APPROVED file directly', async () => {
    mockSettingsStore.require_approval = false;
    mockRequireApprovedProfile.mockResolvedValue({
      id: 'staff-user-99',
      role: 'Staff',
      email: 'staff@spid.gov.lk',
      full_name: 'Marcus Grohs',
      account_status: 'approved',
    });

    const req = new Request('http://localhost:3000/api/admin/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_no: 'FL-2026-0006',
        file_name: 'Direct Ingest Soil Analysis',
        section_name: 'Land & Hydrology',
        start_date: '2026-01-01',
        end_date: '2026-06-30',
        locker_no: 'Wing C',
        shelf_name: 'Compactor 09',
        shelf_position: 'Front',
      }),
    });

    const res = await FileController.createFile(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.file.status).toBe('APPROVED');
    expect(json.data.message).toContain('File added successfully to the repository.');
  });

  // 9. Changing approval setting persists
  it('9: changing approval setting persists across calls', async () => {
    const updateReq = new Request('http://localhost:3000/api/admin/files/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ require_approval: false }),
    });

    const updateRes = await FileController.updateApprovalSetting(updateReq);
    const updateJson = await updateRes.json();

    expect(updateRes.status).toBe(200);
    expect(updateJson.data.require_approval).toBe(false);

    // Verify reading setting returns false
    const getRes = await FileController.getApprovalSetting();
    const getJson = await getRes.json();
    expect(getJson.data.require_approval).toBe(false);
  });

  // 10. Unauthorized users cannot change the setting
  it('10: unauthorized users cannot modify approval setting', async () => {
    mockRequireAdminProfile.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );

    const req = new Request('http://localhost:3000/api/admin/files/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ require_approval: false }),
    });

    await expect(FileController.updateApprovalSetting(req)).rejects.toThrow(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );
  });

  // 11. Unauthorized users cannot approve or reject requests
  it('11: unauthorized users cannot approve or reject requests', async () => {
    mockRequireAdminProfile.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );

    await expect(FileController.approveFile(2)).rejects.toThrow(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );

    const rejectReq = new Request('http://localhost:3000/api/admin/files/2/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Unauthorized attempt' }),
    });

    await expect(FileController.rejectFile(2, rejectReq)).rejects.toThrow(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );
  });

  // 12. Existing pending requests remain pending when setting switched OFF
  it('12: turning approval setting OFF does not retroactively change existing pending requests', async () => {
    // Turn setting OFF
    const updateReq = new Request('http://localhost:3000/api/admin/files/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ require_approval: false }),
    });
    await FileController.updateApprovalSetting(updateReq);

    // Verify file #2 is still PENDING
    const checkReq = new Request('http://localhost:3000/api/admin/files?tab=requests');
    const checkRes = await FileController.listFiles(checkReq);
    const checkJson = await checkRes.json();

    expect(checkJson.data.files.map((f: any) => f.id)).toContain(2);
    expect(checkJson.data.files.find((f: any) => f.id === 2)?.status).toBe('PENDING');
  });

  // 13. Search and filtering works
  it('13: search and filter parameters filter records accurately', async () => {
    const req = new Request('http://localhost:3000/api/admin/files?tab=all&section=Legal');
    const res = await FileController.listFiles(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.files).toHaveLength(1);
    expect(json.data.files[0].section_name).toBe('Legal & Contracts');
  });

  // 14. View, edit, and delete functionality works
  it('14: view, edit, and delete functionality works as expected', async () => {
    // 1. View file
    const viewRes = await FileController.getFile(1);
    const viewJson = await viewRes.json();
    expect(viewJson.data.file.file_no).toBe('FL-2026-0001');

    // 2. Edit file
    const editReq = new Request('http://localhost:3000/api/admin/files/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: 'Updated Finalized File Name' }),
    });
    const editRes = await FileController.updateFile(1, editReq);
    const editJson = await editRes.json();
    expect(editJson.data.file.file_name).toBe('Updated Finalized File Name');

    // 3. Delete file
    const delRes = await FileController.deleteFile(1);
    const delJson = await delRes.json();
    expect(delJson.ok).toBe(true);

    // Verify deleted
    await expect(FileController.getFile(1)).rejects.toThrow(
      new ApiError(404, 'NOT_FOUND', 'File record not found.')
    );
  });

  // 15. Validation errors
  it('15: validates required fields, unique constraints, and dates', async () => {
    // Missing required file_no
    const req1 = new Request('http://localhost:3000/api/admin/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: 'Test' }),
    });
    await expect(FileController.createFile(req1)).rejects.toThrow('File No is required.');

    // End date before start date
    const req2 = new Request('http://localhost:3000/api/admin/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_no: 'FL-2026-9999',
        file_name: 'Bad Dates File',
        section_name: 'Legal & Contracts',
        start_date: '2026-12-31',
        end_date: '2026-01-01',
      }),
    });
    await expect(FileController.createFile(req2)).rejects.toThrow('End date must be on or after the start date.');
  });
});

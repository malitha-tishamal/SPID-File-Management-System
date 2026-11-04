import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  sections: [] as any[],
  files: [] as any[],
  missingStatusColumn: false,
};

const { mockRequireApprovedProfile, mockRequireAdminProfile } = vi.hoisted(() => ({
  mockRequireApprovedProfile: vi.fn(),
  mockRequireAdminProfile: vi.fn(),
}));

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: 'http://localhost:3000',
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireApprovedProfile: () => mockRequireApprovedProfile(),
    requireAdminProfile: () => mockRequireAdminProfile(),
  },
}));

function project(row: any, columns: string) {
  const wanted = columns.split(',').map((c) => c.trim());
  const out: Record<string, unknown> = {};
  wanted.forEach((col) => {
    if (col in row) out[col] = row[col];
  });
  return out;
}

function sectionsBuilder() {
  let rows = [...state.sections];
  let selected = '';
  const missingColumn = () => ({
    code: '42703',
    message: 'column "status" does not exist',
  });

  const chain: any = {
    select: (columns: string) => {
      selected = columns;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      rows = rows.filter((row) => row[col] === val);
      return chain;
    },
    ilike: (col: string, val: string) => {
      rows = rows.filter(
        (row) => String(row[col]).toLowerCase() === String(val).toLowerCase(),
      );
      return chain;
    },
    order: (col: string) => {
      if (state.missingStatusColumn && selected.includes('status')) {
        return Promise.resolve({ data: null, error: missingColumn() });
      }
      rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])));
      return Promise.resolve({ data: rows.map((row) => project(row, selected)), error: null });
    },
    maybeSingle: () => {
      if (state.missingStatusColumn && selected.includes('status')) {
        return Promise.resolve({ data: null, error: missingColumn() });
      }
      return Promise.resolve({
        data: rows[0] ? project(rows[0], selected) : null,
        error: null,
      });
    },
  };
  return chain;
}

function filesBuilder() {
  let rows = [...state.files];
  const chain: any = {
    select: () => chain,
    ilike: () => chain,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((row) => row[col] === val);
      return chain;
    },
    in: (col: string, vals: unknown[]) =>
      Promise.resolve({ data: rows.filter((row) => vals.includes(row[col])), error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () =>
      Promise.resolve(
        rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'Not found' } },
      ),
    insert: (payloads: any[]) => ({
      select: () => ({
        single: () => {
          const row = { id: 900 + state.files.length, ...payloads[0] };
          state.files.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      }),
    }),
    update: (patch: any) => ({
      eq: (col: string, val: unknown) => ({
        select: () => ({
          single: () => {
            const item = state.files.find((row) => row[col] === val);
            if (!item) return Promise.resolve({ data: null, error: { message: 'Not found' } });
            Object.assign(item, patch);
            return Promise.resolve({ data: item, error: null });
          },
        }),
      }),
    }),
  };
  return chain;
}

vi.mock('config/supabase/server', () => {
  const client = {
    from: (table: string) => {
      if (table === 'sections') return sectionsBuilder();
      if (table === 'files') return filesBuilder();
      if (table === 'audit_logs') return { insert: () => Promise.resolve({ error: null }) };
      if (table === 'system_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { value: { enabled: true } }, error: null }),
            }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
  };
  return {
    getSupabaseAdminClient: () => client,
    getSupabaseServerClient: async () => client,
  };
});

import { SectionRepository, isActiveSection } from 'models/SectionRepository';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { invalidatePublicSectionsCache } from 'lib/sectionsCacheStore';
import { GET as getSections } from '../src/app/api/sections/route';
import { FileController } from 'controllers/FileController';

const SECTIONS_URL = 'http://localhost:3000/api/sections';

function sectionNames(json: any): string[] {
  return json.data.sections.map((s: any) => s.name);
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Active section filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePublicSectionsCache();
    state.missingStatusColumn = false;
    state.sections = [
      { id: 1, name: 'Accounting', status: 'approved', section_lead: null },
      { id: 2, name: 'Agree', status: 'disabled', section_lead: null },
      { id: 3, name: 'Information Technology', status: 'approved', section_lead: null },
      { id: 4, name: 'Pending Division', status: 'pending', section_lead: null },
    ];
    state.files = [
      {
        id: 1,
        file_no: 'FL-2026-0001',
        file_name: 'Legacy File',
        section_name: 'Agree',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      },
    ];
    mockRequireApprovedProfile.mockResolvedValue({
      id: 'admin-1',
      role: 'Administrator',
      email: 'admin@spid.gov.lk',
      full_name: 'Admin User',
    });
    mockRequireAdminProfile.mockResolvedValue({
      id: 'admin-1',
      role: 'Administrator',
      email: 'admin@spid.gov.lk',
      full_name: 'Admin User',
    });
  });

  it('listActive returns only approved sections in name order', async () => {
    const rows = await new SectionRepository(getSupabaseAdminClient() as any).listActive();
    expect(rows.map((s) => s.name)).toEqual(['Accounting', 'Information Technology']);
    expect(rows.every((s) => s.status === 'approved')).toBe(true);
  });

  it('listActive falls back to every section when the status column is missing', async () => {
    state.missingStatusColumn = true;
    const rows = await new SectionRepository(getSupabaseAdminClient() as any).listActive();
    expect(rows).toHaveLength(4);
    expect(rows.every((s) => s.status === 'approved')).toBe(true);
  });

  it('treats a missing status as active', () => {
    expect(isActiveSection({ status: 'approved' })).toBe(true);
    expect(isActiveSection({})).toBe(true);
    expect(isActiveSection({ status: 'disabled' })).toBe(false);
    expect(isActiveSection({ status: 'pending' })).toBe(false);
    expect(isActiveSection(null)).toBe(false);
  });

  it('default GET returns all sections, including disabled ones', async () => {
    const res = await getSections(new Request(SECTIONS_URL), undefined);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(sectionNames(json)).toEqual([
      'Accounting',
      'Agree',
      'Information Technology',
      'Pending Division',
    ]);
  });

  it('activeOnly GET returns only Active sections', async () => {
    const res = await getSections(new Request(`${SECTIONS_URL}?activeOnly=true`), undefined);
    const json = await res.json();

    expect(sectionNames(json)).toEqual(['Accounting', 'Information Technology']);
  });

  it('activeOnly GET appends the include section exactly once', async () => {
    const withDisabled = await getSections(
      new Request(`${SECTIONS_URL}?activeOnly=true&include=Agree`),
      undefined,
    );
    const disabledJson = await withDisabled.json();
    expect(sectionNames(disabledJson)).toEqual([
      'Accounting',
      'Information Technology',
      'Agree',
    ]);

    const withActive = await getSections(
      new Request(`${SECTIONS_URL}?activeOnly=true&include=accounting`),
      undefined,
    );
    const activeJson = await withActive.json();
    expect(sectionNames(activeJson)).toEqual(['Accounting', 'Information Technology']);
  });

  it('reflects a section being disabled and re-enabled without a manual reload', async () => {
    // Warm the unfiltered cache first, like a management page would.
    await getSections(new Request(SECTIONS_URL), undefined);

    state.sections = state.sections.map((row) =>
      row.id === 1 ? { ...row, status: 'disabled' } : row,
    );
    const afterDisable = await getSections(
      new Request(`${SECTIONS_URL}?activeOnly=true`),
      undefined,
    );
    expect(sectionNames(await afterDisable.json())).toEqual(['Information Technology']);

    state.sections = state.sections.map((row) =>
      row.id === 1 ? { ...row, status: 'approved' } : row,
    );
    const afterEnable = await getSections(
      new Request(`${SECTIONS_URL}?activeOnly=true`),
      undefined,
    );
    expect(sectionNames(await afterEnable.json())).toEqual([
      'Accounting',
      'Information Technology',
    ]);
  });

  it('createFile rejects a disabled section with a clear message', async () => {
    const req = jsonRequest('http://localhost:3000/api/admin/files', 'POST', {
      file_no: 'FL-2026-0100',
      file_name: 'Blocked File',
      section_name: 'agree',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    });

    await expect(FileController.createFile(req)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Selected section is disabled.',
    });
    expect(state.files).toHaveLength(1);
  });

  it('createFile rejects a section that is still pending', async () => {
    const req = jsonRequest('http://localhost:3000/api/admin/files', 'POST', {
      file_no: 'FL-2026-0101',
      file_name: 'Pending Section File',
      section_name: 'Pending Division',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    });

    await expect(FileController.createFile(req)).rejects.toMatchObject({
      status: 400,
      message: 'Selected section is not active yet.',
    });
  });

  it('createFile still allows legacy free-text sections that are not registered', async () => {
    const req = jsonRequest('http://localhost:3000/api/admin/files', 'POST', {
      file_no: 'FL-2026-0102',
      file_name: 'Legacy Label File',
      section_name: 'Unregistered Legacy Label',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    });

    const res = await FileController.createFile(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data.file.section_name).toBe('Unregistered Legacy Label');
  });

  it('updateFile allows keeping the current disabled section but blocks reassignment to another disabled one', async () => {
    state.sections.push({ id: 5, name: 'Archival', status: 'disabled', section_lead: null });

    const keep = await FileController.updateFile(
      1,
      jsonRequest('http://localhost:3000/api/admin/files/1', 'PUT', {
        file_name: 'Legacy File Renamed',
        section_name: 'Agree',
      }),
    );
    const keepJson = await keep.json();
    expect(keep.status).toBe(200);
    expect(keepJson.data.file.section_name).toBe('Agree');

    await expect(
      FileController.updateFile(
        1,
        jsonRequest('http://localhost:3000/api/admin/files/1', 'PUT', {
          section_name: 'Archival',
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Selected section is disabled.',
    });
  });

  it('bulk import reports a row-level error for a disabled section', async () => {
    const req = jsonRequest('http://localhost:3000/api/admin/files/bulk-import', 'POST', {
      records: [
        {
          rowIndex: 2,
          file_no: 'FL-2026-0200',
          file_name: 'Disabled Section Import',
          section: 'Agree',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        },
      ],
    });

    const res = await FileController.bulkImportFiles(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.importedCount).toBe(0);
    expect(json.data.failedCount).toBe(1);
    expect(json.data.errors[0]).toMatchObject({
      row: 2,
      reason: 'Selected section is disabled.',
    });
  });
});

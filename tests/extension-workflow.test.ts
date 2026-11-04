/**
 * Extension workflow: staff request -> administrator decision.
 *
 * The API routes themselves need a signed-in session, which this environment
 * does not have, so the workflow is exercised by calling the exact controller
 * methods the routes call, against an in-memory stand-in for the PostgREST
 * client. Every rule under test (eligibility, date only moves on approval,
 * decided requests cannot be decided twice, notification recipients and
 * destinations) is the production logic in FileIssuanceController.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  admin: null as unknown,
  staff: null as unknown,
}));

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: (missing: string[]) => `missing ${missing.join(', ')}`,
  SITE_URL: 'http://localhost:3000',
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireAdminProfile: async () => auth.admin,
    requireApprovedProfile: async () => auth.staff,
  },
}));

vi.mock('models/AuditLogRepository', () => ({
  AuditLogRepository: class {
    async log(): Promise<void> {
      return undefined;
    }
  },
}));

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, seq: 500 }));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => createFakeClient(),
}));

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

interface QueryState {
  filters: Filter[];
  limit: number | null;
  patch: Row | null;
  payload: Row | null;
  returning: boolean;
  deleteMode: boolean;
  embedParent: boolean;
}

function matching(rows: Row[], stateOf: QueryState): Row[] {
  return rows.filter((row) => stateOf.filters.every((f) => f(row)));
}

function createFakeClient() {
  const table = (name: string): Row[] => {
    if (!state.tables[name]) state.tables[name] = [];
    return state.tables[name];
  };

  const build = (name: string) => {
    const q: QueryState = {
      filters: [],
      limit: null,
      patch: null,
      payload: null,
      returning: false,
      deleteMode: false,
      embedParent: false,
    };

    const run = (): { data: Row[] | null; error: null } => {
      const rows = table(name);

      if (q.payload) {
        const id = ++state.seq;
        const created = { id, created_at: new Date().toISOString(), ...q.payload };
        rows.push(created);
        return { data: [created], error: null };
      }

      if (q.deleteMode) {
        const doomed = matching(rows, q).map((r) => r.id);
        state.tables[name] = rows.filter((r) => !doomed.includes(r.id));
        return { data: doomed.map((id) => ({ id })), error: null };
      }

      let found = matching(table(name), q);
      if (q.patch) {
        found.forEach((row) => Object.assign(row, q.patch));
      }
      if (q.limit !== null) found = found.slice(0, q.limit);
      if (!q.patch && q.filters.length === 0 && q.returning) {
        found = [...found];
      }

      if (q.embedParent) {
        found = found.map((row) => ({
          ...row,
          staff_file_requests: [
            table('staff_file_requests').find((r) => r.id === row.request_id) ?? null,
          ].filter(Boolean),
        }));
      }

      return { data: q.returning ? found : found, error: null };
    };

    const api: Record<string, any> = {
      select(cols?: string) {
        q.returning = true;
        if (cols && cols.includes('staff_file_requests')) q.embedParent = true;
        return api;
      },
      insert(payload: Row) {
        q.payload = payload;
        return api;
      },
      update(patch: Row) {
        q.patch = patch;
        return api;
      },
      delete() {
        q.deleteMode = true;
        return api;
      },
      eq: (col: string, val: any) => tap(q, (r) => r[col] === val, api),
      neq: (col: string, val: any) => tap(q, (r) => r[col] !== val, api),
      is: (col: string, val: any) => tap(q, (r) => (val === 'null' ? r[col] == null : r[col] === val), api),
      not: (col: string, val: any) => tap(q, (r) => !(val === 'null' ? r[col] == null : r[col] === val), api),
      in: (col: string, vals: any[]) => tap(q, (r) => vals.includes(r[col]), api),
      lte: (col: string, val: any) => tap(q, (r) => String(r[col] ?? '') <= String(val), api),
      gte: (col: string, val: any) => tap(q, (r) => String(r[col] ?? '') >= String(val), api),
      order: () => api,
      limit: (n: number) => {
        q.limit = n;
        return api;
      },
      maybeSingle: async () => {
        const { data, error } = run();
        return { data: data && data.length ? data[0] : null, error };
      },
      single: async () => {
        const { data, error } = run();
        if (!data || data.length === 0) return { data: null, error: { message: 'no rows' } };
        return { data: data[0], error };
      },
      then: (onOk: (value: any) => any) => Promise.resolve(run()).then(onOk),
    };

    return api;
  };

  return {
    from: (name: string) => build(name),
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    }),
  } as any;
}

function tap(q: QueryState, filter: Filter, api: Record<string, any>) {
  q.filters.push(filter);
  return api;
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const ADMIN = {
  id: 'admin-1',
  full_name: 'Administrator Nethma',
  role: 'Administrator',
  account_status: 'approved',
};
const STAFF = {
  id: 'staff-1',
  full_name: 'Chilly',
  email: 'ureshanchilly28@gmail.com',
  role: 'Staff',
  account_status: 'approved',
};

function seedIssuedFile(overrides: Row = {}): Row {
  const row = {
    id: 11,
    file_no: 'TEST-RETURN-01',
    file_name: '[TEST] Annual Audit Minutes 2025 — overdue case',
    status: 'APPROVED',
    requester_id: STAFF.id,
    requester_name: STAFF.full_name,
    request_date: '2026-10-08',
    duration_days: 10,
    original_return_date: '2026-10-18',
    expected_return_date: '2026-10-18',
    issued_at: '2026-10-08T09:00:00+05:30',
    returned_at: null,
    ...overrides,
  };
  state.tables.staff_file_requests.push(row);
  return row;
}

async function bodyOf(response: Response): Promise<any> {
  return response.json();
}

describe('return-date extension workflow', () => {
  beforeEach(() => {
    state.tables = {
      staff_file_requests: [],
      file_request_extensions: [],
      notifications: [],
      profiles: [
        { id: ADMIN.id, role: 'Administrator', account_status: 'approved' },
        { id: STAFF.id, role: 'Staff', account_status: 'approved' },
      ],
    };
    state.seq = 500;
    auth.admin = ADMIN;
    auth.staff = STAFF;
  });

  it('a staff request is stored as PENDING and leaves the official date untouched', async () => {
    const { FileIssuanceController } = await import('controllers/FileIssuanceController');
    const file = seedIssuedFile();

    const response = await FileIssuanceController.requestExtension(
      jsonRequest({ request_id: file.id, new_return_date: '2026-11-02', reason: 'Audit still in progress' }),
    );
    const json = await bodyOf(response);

    expect(json.ok).toBe(true);
    const extension = state.tables.file_request_extensions[0];
    expect(extension.status).toBe('PENDING');
    expect(extension.previous_return_date).toBe('2026-10-18');
    expect(extension.new_return_date).toBe('2026-11-02');
    expect(extension.requested_by).toBe(STAFF.id);
    // Point 6 of the staff workflow: the official date cannot move before approval.
    expect(state.tables.staff_file_requests[0].expected_return_date).toBe('2026-10-18');

    const adminAlert = state.tables.notifications.find((n) => n.user_id === ADMIN.id);
    expect(adminAlert.title).toBe('Return-date extension requested');
    expect(adminAlert.link).toBe(
      `/admin/staff-file-request?tab=extensions&extension=${extension.id}`,
    );
  });

  it('rejects an extension on a file that is not currently issued', async () => {
    const { FileIssuanceController } = await import('controllers/FileIssuanceController');
    const file = seedIssuedFile({ id: 12, returned_at: '2026-10-19T10:00:00+05:30' });

    await expect(
      FileIssuanceController.requestExtension(
        jsonRequest({ request_id: file.id, new_return_date: '2026-11-02', reason: 'later' }),
      ),
    ).rejects.toThrow(/Only a currently issued file/);

    // A separate currently-issued file, so the date rule is reached instead of
    // the eligibility rule above.
    const active = seedIssuedFile({ id: 13 });

    await expect(
      FileIssuanceController.requestExtension(
        jsonRequest({ request_id: active.id, new_return_date: '2026-10-01', reason: 'earlier' }),
      ),
    ).rejects.toThrow(/later than (?:your current|the current)/);
  });

  it('approval moves the official date, records history and notifies the staff member', async () => {
    const { FileIssuanceController } = await import('controllers/FileIssuanceController');
    const file = seedIssuedFile();
    await FileIssuanceController.requestExtension(
      jsonRequest({ request_id: file.id, new_return_date: '2026-11-02', reason: 'Audit still in progress' }),
    );
    const extension = state.tables.file_request_extensions[0];

    const response = await FileIssuanceController.reviewExtension(
      jsonRequest({ status: 'APPROVED', review_note: 'Granted until the audit closes' }),
      String(extension.id),
    );
    const json = await bodyOf(response);

    expect(json.data.file.expected_return_date).toBe('2026-11-02');
    expect(state.tables.staff_file_requests[0].expected_return_date).toBe('2026-11-02');
    expect(extension.status).toBe('APPROVED');
    expect(extension.reviewed_by).toBe(ADMIN.id);

    const staffAlert = state.tables.notifications.find((n) => n.user_id === STAFF.id);
    expect(staffAlert.title).toBe('Your extension request was approved');
    expect(staffAlert.type).toBe('success');
    expect(staffAlert.link).toBe(`/staff/your-requests?request=${file.id}`);

    // Recalculation: the issue is no longer overdue and reads as extended.
    const { getReturnStatus, isReturnDateExtended } = await import('lib/returnStatus');
    const status = getReturnStatus('2026-11-02', null, new Date('2026-10-28T06:00:00+05:30'));
    expect(status.status).toBe('active');
    expect(status.isOverdue).toBe(false);
    expect(isReturnDateExtended(file.original_return_date, '2026-11-02')).toBe(true);
  });

  it('rejection keeps the original date, stores the reason and can be decided only once', async () => {
    const { FileIssuanceController } = await import('controllers/FileIssuanceController');
    const file = seedIssuedFile({ id: 14, expected_return_date: '2026-10-29' });
    await FileIssuanceController.requestExtension(
      jsonRequest({ request_id: file.id, new_return_date: '2026-11-20', reason: 'Need more time' }),
    );
    const extension = state.tables.file_request_extensions[0];

    await expect(
      FileIssuanceController.reviewExtension(jsonRequest({ status: 'REJECTED' }), String(extension.id)),
    ).rejects.toThrow(/reason when rejecting/);

    const response = await FileIssuanceController.reviewExtension(
      jsonRequest({ status: 'REJECTED', review_note: 'The file is booked for another section' }),
      String(extension.id),
    );
    await bodyOf(response);

    expect(state.tables.staff_file_requests[0].expected_return_date).toBe('2026-10-29');
    expect(extension.status).toBe('REJECTED');
    expect(extension.review_note).toBe('The file is booked for another section');

    const staffAlert = state.tables.notifications.find((n) => n.user_id === STAFF.id);
    expect(staffAlert.title).toBe('Your extension request was rejected');
    expect(staffAlert.body).toContain('booked for another section');
    expect(staffAlert.link).toBe(`/staff/your-requests?request=${file.id}`);

    await expect(
      FileIssuanceController.reviewExtension(
        jsonRequest({ status: 'APPROVED' }),
        String(extension.id),
      ),
    ).rejects.toThrow(/already been decided/);
  });

  it('an extension cannot be approved after the file was already returned', async () => {
    const { FileIssuanceController } = await import('controllers/FileIssuanceController');
    const file = seedIssuedFile({ id: 15 });
    await FileIssuanceController.requestExtension(
      jsonRequest({ request_id: file.id, new_return_date: '2026-11-05', reason: 'More time' }),
    );
    const extension = state.tables.file_request_extensions[0];
    file.returned_at = '2026-10-20T10:00:00+05:30';

    await expect(
      FileIssuanceController.reviewExtension(jsonRequest({ status: 'APPROVED' }), String(extension.id)),
    ).rejects.toThrow(/already been returned/);
  });
});

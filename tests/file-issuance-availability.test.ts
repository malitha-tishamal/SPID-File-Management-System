/**
 * File availability is enforced where the file actually changes hands.
 *
 * There is no separate checkout table: an issuance IS an approved request that
 * has not been returned yet. So a second request for the same physical folder
 * must stay pending until the holder gives it back, and that rule has to hold
 * in the controller — not only in a disabled button.
 *
 * The API routes need a signed-in session this environment does not have, so
 * the workflow runs against the exact controller methods the routes call, using
 * an in-memory stand-in for the PostgREST client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

interface QueryState {
  filters: Filter[];
  limit: number | null;
  patch: Row | null;
  payload: Row | null;
  returning: boolean;
}

function matching(rows: Row[], q: QueryState): Row[] {
  return rows.filter((row) => q.filters.every((f) => f(row)));
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
    };

    const run = (): { data: Row[] | null; error: null } => {
      const rows = table(name);

      if (q.payload) {
        const id = ++state.seq;
        const created = { id, created_at: new Date().toISOString(), ...q.payload };
        rows.push(created);
        return { data: [created], error: null };
      }

      let found = matching(table(name), q);
      if (q.patch) found.forEach((row) => Object.assign(row, q.patch));
      if (q.limit !== null) found = found.slice(0, q.limit);
      return { data: found, error: null };
    };

    const api: Record<string, any> = {
      select() {
        q.returning = true;
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
      eq: (col: string, val: any) => tap(q, (r) => r[col] === val, api),
      neq: (col: string, val: any) => tap(q, (r) => r[col] !== val, api),
      is: (col: string, val: any) =>
        tap(q, (r) => (val === null ? r[col] == null : r[col] === val), api),
      not: (col: string, val: any) =>
        tap(q, (r) => !(val === null ? r[col] == null : r[col] === val), api),
      in: (col: string, vals: any[]) => tap(q, (r) => vals.includes(r[col]), api),
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
        if (!data || data.length === 0)
          return { data: null, error: { message: 'no rows' } };
        return { data: data[0], error };
      },
      then: (onOk: (value: any) => any) => Promise.resolve(run()).then(onOk),
    };

    return api;
  };

  return {
    from: (name: string) => build(name),
    rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
  } as any;
}

function tap(q: QueryState, filter: Filter, api: Record<string, any>) {
  q.filters.push(filter);
  return api;
}

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => createFakeClient(),
}));

function jsonRequest(body: unknown, path = '/api/test'): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const ADMIN = {
  id: 'admin-1',
  full_name: 'Administrator Nethma',
  email: 'admin@example.com',
  role: 'Administrator',
  account_status: 'approved',
};
const HOLDER = {
  id: 'staff-1',
  full_name: 'Kaweesha Kiwi',
  email: 'kaweesha@example.com',
  role: 'Staff',
  account_status: 'approved',
};
const WAITER = {
  id: 'staff-2',
  full_name: 'Ashen Rashmika',
  email: 'ashen@example.com',
  role: 'Staff',
  account_status: 'approved',
};

/** The approved request that currently holds the physical folder. */
function seedIssuance(overrides: Row = {}): Row {
  const row = {
    id: 11,
    file_id: 100,
    file_no: 'DE-12',
    file_name: 'Annual Expenditure 2022',
    requester_id: HOLDER.id,
    requester_name: HOLDER.full_name,
    status: 'APPROVED',
    priority: 'HIGH',
    request_date: '2026-10-08',
    duration_days: 10,
    issued_at: '2026-10-08T09:00:00+05:30',
    original_return_date: '2026-10-18',
    expected_return_date: '2026-10-18',
    returned_at: null,
    created_at: '2026-10-07T08:00:00Z',
    ...overrides,
  };
  state.tables.staff_file_requests.push(row);
  return row;
}

/** A pending request for the same file, waiting for it to come back. */
function seedPending(overrides: Row = {}): Row {
  const row = {
    id: 12,
    file_id: 100,
    file_no: 'DE-12',
    file_name: 'Annual Expenditure 2022',
    requester_id: WAITER.id,
    requester_name: WAITER.full_name,
    status: 'PENDING',
    priority: 'NORMAL',
    request_date: '2026-10-20',
    duration_days: 5,
    issued_at: null,
    original_return_date: null,
    expected_return_date: null,
    returned_at: null,
    admin_notes: null,
    created_at: '2026-10-09T08:00:00Z',
    ...overrides,
  };
  state.tables.staff_file_requests.push(row);
  return row;
}

function rowById(id: number): Row {
  return state.tables.staff_file_requests.find((r) => r.id === id) as Row;
}

async function rejectWith(promise: Promise<unknown>): Promise<any> {
  return promise.then(
    (value) => {
      throw new Error(`Expected a failure but got: ${JSON.stringify(value)}`);
    },
    (error) => error,
  );
}

describe('File availability blocks approval', () => {
  beforeEach(() => {
    state.tables = {
      staff_file_requests: [],
      file_request_extensions: [],
      notifications: [],
      profiles: [
        { id: ADMIN.id, role: 'Administrator', account_status: 'approved' },
        { id: HOLDER.id, role: 'Staff', account_status: 'approved' },
        { id: WAITER.id, role: 'Staff', account_status: 'approved' },
      ],
    };
    state.seq = 500;
    auth.admin = ADMIN;
    auth.staff = HOLDER;
  });

  it('refuses to approve a request while the file is issued to someone else', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance();
    seedPending();

    const error = await rejectWith(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '12'),
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe('REQUEST_CONFLICT');
    expect(error.message).toMatch(/cannot be approved until it is returned/);
    // The client renders from this payload, and it is read from the live row.
    expect(error.extra.reason).toBe('file_currently_issued');
    expect(error.extra.issuance).toMatchObject({
      request_id: 11,
      file_no: 'DE-12',
      holder_name: 'Kaweesha Kiwi',
      expected_return_date: '2026-10-18',
    });

    // Blocked approval changes nothing: still pending, still unissued.
    expect(rowById(12).status).toBe('PENDING');
    expect(rowById(12).issued_at).toBeNull();
  });

  it('never invents a return date when the issuance has none recorded', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance({ expected_return_date: null, original_return_date: null });
    seedPending();

    const error = await rejectWith(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '12'),
    );

    expect(error.extra.issuance.expected_return_date).toBeNull();
  });

  it('still rejects a pending request for an issued file (only approval is blocked)', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance();
    seedPending();

    const response = await StaffFileRequestController.review(
      jsonRequest({ status: 'REJECTED', admin_notes: 'Needed by the current holder' }),
      '12',
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(rowById(12).status).toBe('REJECTED');
  });

  it('approves a free file and records the return date from the request terms', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    // Different file_id: nothing is holding DE-13.
    seedPending({ id: 13, file_id: 200, file_no: 'DE-13' });

    const response = await StaffFileRequestController.review(
      jsonRequest({ status: 'APPROVED' }),
      '13',
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    const approved = rowById(13);
    expect(approved.status).toBe('APPROVED');
    expect(approved.issued_at).toBeTruthy();
    // 2026-10-20 + 5 days, straight from the stored request terms.
    expect(approved.expected_return_date).toBe('2026-10-25');
    expect(approved.original_return_date).toBe('2026-10-25');
  });

  it('does not treat the request being approved as its own blocker', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    // One issuance, and the admin is approving a *different* request (12).
    seedIssuance({ id: 11 });
    seedPending({ id: 12 });
    // Sanity: the same guard would allow a request for an untouched file.
    seedPending({ id: 14, file_id: 300, file_no: 'AUD-07' });

    const blocked = await rejectWith(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '12'),
    );
    expect(blocked.status).toBe(409);

    const allowed = await StaffFileRequestController.review(
      jsonRequest({ status: 'APPROVED' }),
      '14',
    );
    expect((await allowed.json()).ok).toBe(true);
  });
});

describe('Only the first request in line can be approved', () => {
  beforeEach(() => {
    state.tables = {
      staff_file_requests: [],
      file_request_extensions: [],
      notifications: [],
      profiles: [
        { id: ADMIN.id, role: 'Administrator', account_status: 'approved' },
        { id: HOLDER.id, role: 'Staff', account_status: 'approved' },
        { id: WAITER.id, role: 'Staff', account_status: 'approved' },
      ],
    };
    state.seq = 500;
    auth.admin = ADMIN;
    // No issuance seeded in these scenarios: the folder is on the shelf, so the
    // only question is who in the queue is allowed to take it.
    auth.staff = HOLDER;
  });

  it('refuses to approve a request another pending request outranks', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    // 12 asked first, but 13 carries HIGH priority, so 13 is first in line.
    seedPending({ id: 12, priority: 'NORMAL', created_at: '2026-10-09T08:00:00Z' });
    seedPending({
      id: 13,
      priority: 'HIGH',
      requester_id: HOLDER.id,
      requester_name: HOLDER.full_name,
      created_at: '2026-10-10T08:00:00Z',
    });

    const error = await rejectWith(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '12'),
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe('REQUEST_CONFLICT');
    expect(error.extra.reason).toBe('not_highest_priority');
    expect(error.extra.rank).toBe(1);
    expect(error.extra.leader).toMatchObject({ id: 13, priority: 'HIGH' });
    expect(error.message).toContain('not first in line for DE-12');

    expect(rowById(12).status).toBe('PENDING');
    expect(rowById(12).issued_at).toBeNull();
  });

  it('breaks a same-priority tie by the earlier submission', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedPending({ id: 12, priority: 'NORMAL', created_at: '2026-10-08T08:00:00Z' });
    seedPending({ id: 13, priority: 'NORMAL', created_at: '2026-10-09T08:00:00Z' });

    const error = await rejectWith(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '13'),
    );

    expect(error.extra).toMatchObject({
      reason: 'not_highest_priority',
      rank: 1,
      leader: { id: 12 },
    });
  });

  it('moves the next request to the front once the leader is rejected', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedPending({ id: 12, priority: 'NORMAL', created_at: '2026-10-09T08:00:00Z' });
    seedPending({ id: 13, priority: 'HIGH', created_at: '2026-10-10T08:00:00Z' });

    await expect(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '12'),
    ).rejects.toMatchObject({ status: 409 });

    const rejected = await StaffFileRequestController.review(
      jsonRequest({ status: 'REJECTED', admin_notes: 'Holder needs it this week' }),
      '13',
    );
    expect((await rejected.json()).ok).toBe(true);

    // 13 no longer competes, so 12 is alone and can be approved.
    const approved = await StaffFileRequestController.review(
      jsonRequest({ status: 'APPROVED' }),
      '12',
    );
    expect((await approved.json()).ok).toBe(true);
    expect(rowById(12).status).toBe('APPROVED');
  });

  it('still blocks the leader while another staff member physically holds the file', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance();
    seedPending({ id: 12, priority: 'LOW', created_at: '2026-10-09T08:00:00Z' });
    seedPending({ id: 13, priority: 'HIGH', created_at: '2026-10-10T08:00:00Z' });

    const error = await rejectWith(
      StaffFileRequestController.review(jsonRequest({ status: 'APPROVED' }), '13'),
    );

    // Availability is checked first, so even the queue leader cannot take an
    // issued folder — and the reason says so.
    expect(error.extra.reason).toBe('file_currently_issued');
  });

  it('automatically rejects competing pending requests when leader is approved', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedPending({ id: 12, priority: 'LOW', created_at: '2026-10-09T08:00:00Z', file_id: 10, file_no: 'DE-10' });
    seedPending({ id: 13, priority: 'HIGH', created_at: '2026-10-10T08:00:00Z', file_id: 10, file_no: 'DE-10' });
    seedPending({ id: 14, priority: 'HIGH', created_at: '2026-10-10T09:00:00Z', file_id: 20, file_no: 'DE-20' });

    // Approve leader of file 10 (id 13)
    const approved = await StaffFileRequestController.review(
      jsonRequest({ status: 'APPROVED' }),
      '13',
    );
    expect((await approved.json()).ok).toBe(true);
    expect(rowById(13).status).toBe('APPROVED');

    // Competing request for file 10 is automatically rejected with allocation note
    expect(rowById(12).status).toBe('REJECTED');
    expect(rowById(12).admin_notes).toContain('Physical file allocated to competing request');

    // Unrelated request for file 20 remains pending
    expect(rowById(14).status).toBe('PENDING');
  });
});

describe('Competing notice reports the live issuance', () => {
  beforeEach(() => {
    state.tables = {
      staff_file_requests: [],
      file_request_extensions: [],
      notifications: [],
      profiles: [],
    };
    state.seq = 500;
    auth.admin = ADMIN;
    auth.staff = WAITER;
  });

  it('includes who holds the file and when it is due back', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance();
    seedPending();

    const response = await StaffFileRequestController.checkCompeting(
      jsonRequest({}, '/api/staff/file-requests?file_id=100'),
    );
    const json = await response.json();

    expect(json.data.issuance).toMatchObject({
      request_id: 11,
      holder_name: 'Kaweesha Kiwi',
      issued_at: '2026-10-08T09:00:00+05:30',
      expected_return_date: '2026-10-18',
    });
    // The caller only waits; their own pending request is not a competitor.
    expect(json.data.has_competing).toBe(false);
    expect(json.data.own_pending.id).toBe(12);
  });

  it('shows no warning when the signed-in staff member is the current holder', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance();
    auth.staff = HOLDER;

    const response = await StaffFileRequestController.checkCompeting(
      jsonRequest({}, '/api/staff/file-requests?file_id=100'),
    );
    const json = await response.json();

    expect(json.data.issuance).toBeNull();
  });

  it('returns no issuance once the file has been returned', async () => {
    const { StaffFileRequestController } = await import(
      'controllers/StaffFileRequestController'
    );
    seedIssuance({ returned_at: '2026-10-15T10:00:00+05:30' });

    const response = await StaffFileRequestController.checkCompeting(
      jsonRequest({}, '/api/staff/file-requests?file_id=100'),
    );
    const json = await response.json();

    expect(json.data.issuance).toBeNull();
  });
});

describe('A returned file unlocks the requests waiting for it', () => {
  beforeEach(() => {
    state.tables = {
      staff_file_requests: [],
      file_request_extensions: [],
      notifications: [],
      profiles: [
        { id: ADMIN.id, role: 'Administrator', account_status: 'approved' },
        { id: HOLDER.id, role: 'Staff', account_status: 'approved' },
        { id: WAITER.id, role: 'Staff', account_status: 'approved' },
      ],
    };
    state.seq = 500;
    auth.admin = ADMIN;
    auth.staff = HOLDER;
  });

  it('notifies each pending requester and clears the issuance lock', async () => {
    const { FileIssuanceController } = await import(
      'controllers/FileIssuanceController'
    );
    seedIssuance();
    seedPending();
    seedPending({ id: 21, requester_id: 'staff-3' });

    const response = await FileIssuanceController.markReturned(
      jsonRequest({}),
      '11',
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(rowById(11).returned_at).toBeTruthy();

    const availability = state.tables.notifications.filter(
      (n) => n.title === 'A requested file is available',
    );
    expect(availability.map((n) => n.user_id).sort()).toEqual(
      ['staff-2', 'staff-3'].sort(),
    );
    expect(availability[0].dedupe_key).toContain(':available:11');
    // The holder is told about their own return, not that the file is free.
    expect(
      state.tables.notifications.some(
        (n) => n.user_id === HOLDER.id && n.title === 'File return recorded',
      ),
    ).toBe(true);
  });

  it('a second return attempt cannot repeat the availability notices', async () => {
    const { FileIssuanceController } = await import(
      'controllers/FileIssuanceController'
    );
    seedIssuance();
    seedPending();

    await FileIssuanceController.markReturned(jsonRequest({}), '11');
    const error = await rejectWith(
      FileIssuanceController.markReturned(jsonRequest({}), '11'),
    );

    expect(error.status).toBe(409);
    expect(
      state.tables.notifications.filter(
        (n) => n.title === 'A requested file is available',
      ),
    ).toHaveLength(1);
  });
});

describe('Database guard for one active issuance per file', () => {
  it('migration 0024 creates the partial unique index without deleting rows', () => {
    const sql = readFileSync(
      join(
        'supabase',
        'migrations',
        '0024_single_active_issuance_per_file.sql',
      ),
      'utf8',
    ).replace(/\\/g, '/');

    expect(sql).toMatch(
      /create unique index if not exists uq_staff_file_requests_active_issuance/i,
    );
    expect(sql).toMatch(/where[\s\S]*status\s*=\s*'APPROVED'/i);
    expect(sql).toMatch(/returned_at is null/i);
    // Existing overlaps are reported, never silently rejected.
    expect(sql).not.toMatch(/delete from public\.staff_file_requests/i);
  });
});

describe('Availability UI wiring', () => {
  function readSource(...relative: string[]): string {
    return readFileSync(join(...relative), 'utf8').replace(/\\/g, '/');
  }

  it('the admin queue warns about an issued file and dropped Approve This Only', () => {
    const source = readSource(
      'src',
      'app',
      'admin',
      'staff-file-request',
      'page.tsx',
    );

    expect(source).not.toContain('Approve This Only');
    expect(source).toContain("t('modals.issuedBlock.title')");
    expect(source).toContain('file_currently_issued');
    expect(source).toContain("t('modals.issuedBlock.missingExpectedReturn')");
    // Realtime uses the browser (anon) client and unsubscribes on unmount.
    expect(source).toContain("from 'config/supabase/client'");
    expect(source).toContain("table: 'staff_file_requests'");
    expect(source).toContain('removeChannel');
  });

  it('the staff form warns but still allows the request', () => {
    const source = readSource('src', 'app', 'staff', 'request-file', 'page.tsx');

    expect(source).toContain("t('page.unavailableTitle')");
    expect(source).toContain("t('page.expectedReturnLabel')");
    expect(source).toContain('competingData?.issuance');
    expect(source).toContain("t('page.expectedReturnMissing')");
  });
});

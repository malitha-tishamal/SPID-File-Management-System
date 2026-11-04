import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireApprovedProfile = vi.fn();

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: 'http://localhost:3000',
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireApprovedProfile: (...args: any[]) => mockRequireApprovedProfile(...args),
  },
}));

type Row = Record<string, any>;
type SelectOpts = { count?: string; head?: boolean };

let requests: Row[] = [];
let profiles: Row[] = [];
let extensions: Row[] = [];

function tableRows(table: string): Row[] {
  if (table === 'staff_file_requests') return requests;
  if (table === 'profiles') return profiles;
  if (table === 'file_request_extensions') return extensions;
  throw new Error(`Unexpected table in staff-request test: ${table}`);
}

/**
 * Minimal PostgREST-shaped builder: records the filters the controller applies
 * and evaluates them against the in-memory rows, so the test exercises the
 * real query wiring (tab filters, search, date bounds, pagination) rather than
 * a hand-written stand-in.
 */
function createQuery(table: string, opts: SelectOpts = {}) {
  const predicates: ((row: Row) => boolean)[] = [];
  const sorts: { column: string; ascending: boolean }[] = [];
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  let single = false;

  const resolveRows = () => {
    let data = tableRows(table).filter((row) => predicates.every((predicate) => predicate(row)));
    for (const sort of [...sorts].reverse()) {
      data = [...data].sort((left, right) => {
        const a = left[sort.column];
        const b = right[sort.column];
        if (a === b) return 0;
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        return (a > b ? 1 : -1) * (sort.ascending ? 1 : -1);
      });
    }
    const total = data.length;
    if (rangeFrom !== null && rangeTo !== null) {
      data = data.slice(rangeFrom, rangeTo + 1);
    }
    return { data, total };
  };

  const execute = () => {
    const { data, total } = resolveRows();
    if (opts.head) return { data: null, count: total, error: null };
    return {
      data: single ? data[0] ?? null : data,
      count: total,
      error: null,
    };
  };

  const chain: any = {
    select: (_columns: string, selectOpts?: SelectOpts) =>
      createQuery(table, selectOpts ?? opts),
    eq: (column: string, value: any) => {
      predicates.push((row) => row[column] === value);
      return chain;
    },
    in: (column: string, values: any[]) => {
      predicates.push((row) => values.includes(row[column]));
      return chain;
    },
    is: (column: string, value: any) => {
      predicates.push((row) =>
        value === null
          ? row[column] === null || row[column] === undefined
          : row[column] === value,
      );
      return chain;
    },
    not: (column: string, operator: string, value: any) => {
      if (operator === 'is' && value === null) {
        predicates.push((row) => row[column] !== null && row[column] !== undefined);
      }
      return chain;
    },
    or: (clause: string) => {
      const terms = clause.split(',');
      predicates.push((row) =>
        terms.some((term) => {
          const [column, operator, ...rest] = term.split('.');
          if (operator !== 'ilike') return false;
          const needle = rest.join('.').replace(/%/g, '').toLowerCase();
          return String(row[column] ?? '').toLowerCase().includes(needle);
        }),
      );
      return chain;
    },
    gte: (column: string, value: string) => {
      predicates.push(
        (row) => new Date(row[column]).getTime() >= new Date(value).getTime(),
      );
      return chain;
    },
    lte: (column: string, value: string) => {
      predicates.push(
        (row) => new Date(row[column]).getTime() <= new Date(value).getTime(),
      );
      return chain;
    },
    order: (column: string, orderOpts?: { ascending?: boolean }) => {
      sorts.push({ column, ascending: orderOpts?.ascending ?? true });
      return chain;
    },
    range: (from: number, to: number) => {
      rangeFrom = from;
      rangeTo = to;
      return chain;
    },
    maybeSingle: () => {
      single = true;
      return chain;
    },
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(execute()).then(onFulfilled, onRejected),
  };

  return chain;
}

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => createQuery(table) }),
}));

import { GET } from '../src/app/api/staff/file-requests/route';

const STAFF = {
  id: 'staff-1',
  role: 'Staff',
  full_name: 'Nimal Perera',
  email: 'nimal@spid.lk',
  section_name: 'Engineering',
};

function baseRequest(overrides: Row): Row {
  return {
    requester_id: STAFF.id,
    requester_name: STAFF.full_name,
    requester_email: STAFF.email,
    requester_role: 'Staff',
    requester_section: 'Engineering',
    file_id: 1,
    storage_location: 'Central Record Room — Locker L-01 — Shelf A — Middle position',
    duration_days: 3,
    admin_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    original_return_date: null,
    expected_return_date: null,
    issued_at: null,
    returned_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireApprovedProfile.mockResolvedValue(STAFF);
  profiles = [
    { id: 'admin-1', full_name: 'Malitha Tishamal', email: 'admin@spid.lk' },
  ];
  extensions = [
    {
      id: 90,
      request_id: 2,
      previous_return_date: '2026-11-02',
      new_return_date: '2026-11-09',
      reason: 'Still in use',
      status: 'PENDING',
      reviewed_by_name: null,
      reviewed_at: null,
      review_note: null,
      created_at: '2026-10-25T04:00:00Z',
    },
  ];
  requests = [
    baseRequest({
      id: 1,
      file_no: 'FL-2026-0001',
      file_name: 'Annual Progress Report',
      section_name: 'Engineering',
      status: 'PENDING',
      priority: 'HIGH',
      request_date: '2026-10-25',
      created_at: '2026-10-20T03:00:00Z',
    }),
    baseRequest({
      id: 2,
      file_no: 'FL-2026-0002',
      file_name: 'Budget Ledger',
      section_name: 'Accounts',
      status: 'APPROVED',
      priority: 'NORMAL',
      request_date: '2026-10-21',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-10-21T06:00:00Z',
      original_return_date: '2026-11-02',
      expected_return_date: '2026-11-02',
      created_at: '2026-10-21T03:00:00Z',
    }),
    baseRequest({
      id: 3,
      file_no: 'FL-2026-0003',
      file_name: 'Audit File',
      section_name: 'Audit',
      status: 'APPROVED',
      priority: 'NORMAL',
      request_date: '2026-10-22',
      original_return_date: '2026-10-25',
      expected_return_date: '2026-10-25',
      returned_at: '2026-10-24T05:00:00Z',
      created_at: '2026-10-22T03:00:00Z',
    }),
    baseRequest({
      id: 4,
      file_no: 'FL-2026-0004',
      file_name: 'Land Deed',
      section_name: 'Legal',
      status: 'REJECTED',
      priority: 'LOW',
      admin_notes: 'File is under audit.',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-10-23T06:00:00Z',
      request_date: '2026-10-26',
      created_at: '2026-10-23T03:00:00Z',
    }),
    baseRequest({
      id: 5,
      file_no: 'FL-2026-0005',
      file_name: 'Supply Orders',
      section_name: 'Procurement',
      status: 'CANCELLED',
      priority: 'NORMAL',
      request_date: '2026-10-27',
      created_at: '2026-10-24T03:00:00Z',
    }),
    baseRequest({
      id: 6,
      file_no: 'FL-2026-0006',
      file_name: 'Someone Else Report',
      section_name: 'Engineering',
      status: 'PENDING',
      priority: 'HIGH',
      requester_id: 'staff-2',
      requester_name: 'Other Officer',
      request_date: '2026-10-25',
      created_at: '2026-10-25T03:00:00Z',
    }),
  ];
});

async function list(query = '') {
  // Through the route, so ApiErrors are converted exactly as in production.
  const response: Response = await GET(
    new Request(`http://localhost:3000/api/staff/file-requests${query}`),
    {},
  );
  return { status: response.status, body: await response.json() };
}

function ids(body: any): number[] {
  return body.data.requests.map((request: Row) => request.id);
}

describe('GET /api/staff/file-requests — tabs', () => {
  it('defaults to the Ongoing tab (approved and not yet returned)', async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(ids(body)).toEqual([2]);
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(10);
  });

  it('returns per-tab counts for the signed-in staff member only', async () => {
    const { body } = await list();
    expect(body.data.counts).toEqual({
      ongoing: 1,
      pending: 1,
      closed: 1,
      cancelled: 2,
    });
  });

  it('Waiting for Approval lists pending rows without leaking other requesters', async () => {
    const { body } = await list('?tab=pending');
    expect(ids(body)).toEqual([1]);
    expect(ids(body)).not.toContain(6);
  });

  it('Successfully Closed lists only returned files', async () => {
    const { body } = await list('?tab=closed');
    expect(ids(body)).toEqual([3]);
  });

  it('Cancelled keeps rejected rows with their original status', async () => {
    const { body } = await list('?tab=cancelled');
    expect(ids(body)).toEqual([5, 4]);
    const rejected = body.data.requests.find((request: Row) => request.id === 4);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.admin_notes).toBe('File is under audit.');
  });

  it('never lists an approved-returned file as ongoing', async () => {
    const { body } = await list('?tab=ongoing');
    expect(ids(body)).not.toContain(3);
  });

  it('falls back to Ongoing for an unknown tab value', async () => {
    const { body } = await list('?tab=APPROVED');
    expect(ids(body)).toEqual([2]);
  });
});

describe('GET /api/staff/file-requests — filters', () => {
  it('searches file number, name and section case-insensitively', async () => {
    expect(ids((await list('?tab=ongoing&search=BUDGET')).body)).toEqual([2]);
    expect(ids((await list('?tab=ongoing&search=accounts')).body)).toEqual([2]);
    expect(ids((await list('?tab=ongoing&search=FL-2026-0002')).body)).toEqual([2]);
  });

  it('applies the priority filter', async () => {
    expect(ids((await list('?tab=pending&priority=HIGH')).body)).toEqual([1]);
    expect(ids((await list('?tab=pending&priority=NORMAL')).body)).toEqual([]);
    expect(ids((await list('?tab=cancelled&priority=LOW')).body)).toEqual([4]);
  });

  it('counts respect the active filters but not the active tab', async () => {
    const { body } = await list('?tab=pending&priority=HIGH');
    expect(body.data.counts).toEqual({
      ongoing: 0,
      pending: 1,
      closed: 0,
      cancelled: 0,
    });
  });

  it('filters by inclusive submission-date boundaries', async () => {
    const { body } = await list(
      '?tab=cancelled&date_from=2026-10-23&date_to=2026-10-23',
    );
    expect(ids(body)).toEqual([4]);
  });

  it('combines search, date range and priority', async () => {
    const { body } = await list(
      '?tab=cancelled&search=deed&priority=LOW&date_from=2026-10-22&date_to=2026-10-24',
    );
    expect(ids(body)).toEqual([4]);
  });

  it('rejects a start date later than the end date', async () => {
    const { status, body } = await list('?date_from=2026-10-30&date_to=2026-10-01');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.message).toBe('The start date cannot be later than the end date.');
  });
});

describe('GET /api/staff/file-requests — pagination and enrichment', () => {
  it('pages through results and reports the real total', async () => {
    const first = await list('?tab=cancelled&limit=1&page=1');
    expect(ids(first.body)).toEqual([5]);
    expect(first.body.data.total).toBe(2);
    expect(first.body.data.totalPages).toBe(2);

    const second = await list('?tab=cancelled&limit=1&page=2');
    expect(ids(second.body)).toEqual([4]);
  });

  it('caps the page size and defaults invalid paging values', async () => {
    const { body } = await list('?limit=1000&page=-4');
    expect(body.data.limit).toBe(50);
    expect(body.data.page).toBe(1);
  });

  it('attaches reviewer details and the pending extension', async () => {
    const { body } = await list('?tab=ongoing');
    const row = body.data.requests[0];
    expect(row.reviewer_name).toBe('Malitha Tishamal');
    expect(row.pending_extension?.status).toBe('PENDING');
    expect(row.extension_history).toEqual([]);
  });

  it('returns a single owner-scoped record for a notification deep link', async () => {
    const found = await list('?request=3');
    expect(ids(found.body)).toEqual([3]);

    const foreign = await list('?request=6');
    expect(foreign.body.data.requests).toEqual([]);
    expect(foreign.body.data.total).toBe(0);
  });
});

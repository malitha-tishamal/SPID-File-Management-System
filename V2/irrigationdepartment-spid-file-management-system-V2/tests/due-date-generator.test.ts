/**
 * Application-side due-date generator.
 *
 * Mirrors migration 0018 bucket for bucket, so the wording, recipients,
 * destinations and dedupe keys asserted here are the ones the database-side
 * function uses too. This is the path taken while 0018 is unapplied; the live
 * variant of the same check is tests/live-due-date-generator.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationRepository } from 'models/NotificationRepository';

type Row = Record<string, any>;

const TODAY = '2026-10-28';
const ADMIN = 'admin-1';

function createFakeClient(tables: Record<string, Row[]>) {
  const matching = (rows: Row[], filters: ((r: Row) => boolean)[]) =>
    rows.filter((row) => filters.every((f) => f(row)));

  const build = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let limit: number | null = null;
    let payload: Row | null = null;

    const run = () => {
      if (payload) {
        const rows = tables[name];
        const duplicate =
          payload.dedupe_key != null &&
          rows.some(
            (r) => r.user_id === payload.user_id && r.dedupe_key === payload.dedupe_key,
          );
        if (duplicate) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        const created = { id: rows.length + 1, created_at: new Date().toISOString(), ...payload };
        rows.push(created);
        return { data: [created], error: null };
      }
      const found = matching(tables[name], filters);
      return { data: limit === null ? found : found.slice(0, limit), error: null };
    };

    const api: Record<string, any> = {
      select: () => api,
      insert(p: Row) {
        payload = p;
        return api;
      },
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      is: (col: string, val: any) => {
        filters.push((r) => (val === 'null' ? r[col] == null : r[col] === val));
        return api;
      },
      not: (col: string, val: any) => {
        filters.push((r) => !(val === 'null' ? r[col] == null : r[col] === val));
        return api;
      },
      lte: (col: string, val: any) => {
        filters.push((r) => String(r[col] ?? '') <= String(val));
        return api;
      },
      order: () => api,
      limit: (n: number) => {
        limit = n;
        return api;
      },
      maybeSingle: async () => {
        const { data, error } = run();
        return { data: data && data.length ? data[0] : null, error };
      },
      then: (onOk: (value: any) => any) => Promise.resolve(run()).then(onOk),
    };
    return api;
  };

  return {
    from: (name: string) => build(name),
    // 0018 not applied: the RPC is missing, so the repository must fall through.
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    }),
  } as any;
}

function issuedFile(id: number, due: string, overrides: Row = {}): Row {
  return {
    id,
    requester_id: 'staff-1',
    file_no: `TEST-RETURN-${id}`,
    file_name: `[TEST] Annual Audit Minutes ${id}`,
    status: 'APPROVED',
    returned_at: null,
    expected_return_date: due,
    ...overrides,
  };
}

let tables: Record<string, Row[]>;

function repo() {
  return new NotificationRepository(createFakeClient(tables));
}

describe('due-date notification generator', () => {
  beforeEach(() => {
    tables = {
      notifications: [],
      profiles: [{ id: ADMIN, role: 'Administrator', account_status: 'approved' }],
      staff_file_requests: [
        issuedFile(11, '2026-10-18'), // overdue by 10 days
        issuedFile(12, '2026-10-28'), // due today
        issuedFile(13, '2026-10-31'), // due soon (+3, inside the window)
        issuedFile(14, '2026-11-15'), // far in the future: no notification
        issuedFile(15, '2026-10-20', { returned_at: '2026-10-20T10:00:00+05:30' }), // returned
        issuedFile(16, '2026-10-25', { status: 'PENDING' }), // not issued
        issuedFile(17, '2026-10-20', { requester_id: null }), // no staff to tell
      ],
    };
  });

  it('writes one correctly-worded notification per due bucket', async () => {
    const inserted = await repo().generateReturnDueNotifications(TODAY);

    const staffRows = tables.notifications.filter((n) => n.user_id === 'staff-1');
    expect(staffRows.map((n) => n.title).sort()).toEqual([
      'File due soon: TEST-RETURN-13',
      'File due today: TEST-RETURN-12',
      'File overdue: TEST-RETURN-11',
    ]);
    // 3 staff warnings + 2 administrator overdue alerts (11 and 17).
    expect(inserted).toBe(5);

    const overdue = staffRows.find((n) => n.title.startsWith('File overdue'))!;
    expect(overdue.type).toBe('error');
    expect(overdue.body).toContain('10 day(s) overdue');
    expect(overdue.link).toBe('/staff/your-requests?request=11');
    expect(overdue.dedupe_key).toBe('return-due:11:2026-10-18:overdue');

    const dueToday = staffRows.find((n) => n.title.startsWith('File due today'))!;
    expect(dueToday.type).toBe('warning');
    expect(dueToday.dedupe_key).toBe('return-due:12:2026-10-28:due-today');

    const dueSoon = staffRows.find((n) => n.title.startsWith('File due soon'))!;
    expect(dueSoon.type).toBe('info');
    expect(dueSoon.body).toContain('3 day(s) remaining');
    expect(dueSoon.dedupe_key).toBe('return-due:13:2026-10-31:due-soon');
  });

  it('alerts administrators about overdue files only', async () => {
    await repo().generateReturnDueNotifications(TODAY);

    const adminRows = tables.notifications.filter((n) => n.user_id === ADMIN);
    // Both overdue issues, including the one with no staff requester.
    expect(adminRows.map((n) => n.title).sort()).toEqual([
      'Overdue issued file: TEST-RETURN-11',
      'Overdue issued file: TEST-RETURN-17',
    ]);
    expect(adminRows.every((n) => n.type === 'warning')).toBe(true);

    const alert = adminRows.find((n) => n.title.endsWith('TEST-RETURN-11'))!;
    expect(alert.link).toBe('/admin/issued-files?file=11');
    expect(alert.dedupe_key).toBe('admin-overdue:11:2026-10-18');
  });

  it('never repeats a notification for the same due date', async () => {
    const first = await repo().generateReturnDueNotifications(TODAY);
    const countAfterFirst = tables.notifications.length;
    const second = await repo().generateReturnDueNotifications(TODAY);

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    expect(tables.notifications).toHaveLength(countAfterFirst);
  });

  it('skips returned, pending, unassigned and not-yet-due issues', async () => {
    await repo().generateReturnDueNotifications(TODAY);
    const titles = tables.notifications.map((n) => n.title);
    expect(titles.some((t) => t.includes('TEST-RETURN-14'))).toBe(false);
    expect(titles.some((t) => t.includes('TEST-RETURN-15'))).toBe(false);
    expect(titles.some((t) => t.includes('TEST-RETURN-16'))).toBe(false);

    // 17 is overdue but has no requester, so only the administrator copy is
    // written for it — nobody gets a notification addressed to an empty seat.
    const orphan = tables.notifications.filter((n) => n.title.includes('TEST-RETURN-17'));
    expect(orphan).toHaveLength(1);
    expect(orphan[0].user_id).toBe(ADMIN);
  });
});

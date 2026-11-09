/**
 * Deleting an account must never take departmental history with it.
 *
 * Covers the soft-delete service end to end: the account is retired (email
 * anonymised, sessions revoked, hidden from active lists) while every file,
 * request, checkout, approval, notification and audit row it touched stays
 * exactly where it was, so the UI can still print the author's name.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserDeletionService } from 'services/UserDeletionService';
import { ApiError } from 'lib/apiResponse';

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: { revokeAllSessions: vi.fn().mockResolvedValue(undefined) },
  invalidateSessionProfileCache: vi.fn(),
  invalidateLockStateCache: vi.fn(),
}));

const mockAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('models/AuditLogRepository', () => ({
  AuditLogRepository: class {
    log(entry: any) {
      return mockAuditLog(entry);
    }
  },
}));

const mockFindById = vi.fn();
const mockCountActiveAdmins = vi.fn().mockResolvedValue(3);
vi.mock('models/ProfileRepository', () => ({
  ProfileRepository: class {
    findById(id: string) {
      return mockFindById(id);
    }
    countActiveAdmins() {
      return mockCountActiveAdmins();
    }
  },
}));

type Row = Record<string, any>;

/** Minimal service-role client: equality / or-filters, counts and updates. */
function createFakeDb(tables: Record<string, Row[]>) {
  const updates: Array<{ table: string; patch: Row }> = [];

  const matches = (rows: Row[], predicates: Array<Row | null>) =>
    rows.filter((row) =>
      predicates.every((predicate) => {
        if (!predicate) return true;
        // `or(field.eq.value,field2.eq.value2)` — the only shape the service uses.
        if (predicate.__or) {
          return (predicate.__or as Array<[string, string]>).some(
            ([field, value]) => row[field] === value
          );
        }
        return Object.entries(predicate).every(([field, value]) => row[field] === value);
      })
    );

  const makeQuery = (table: string) => {
    const predicates: Array<Row | null> = [];
    let headCount = false;
    let pendingPatch: Row | null = null;

    const builder: any = {
      select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
        headCount = options?.head === true;
        return builder;
      },
      eq: (field: string, value: any) => {
        predicates.push({ [field]: value });
        return builder;
      },
      in: (field: string, values: any[]) => {
        predicates.push({ [field]: values });
        return builder;
      },
      or: (expression: string) => {
        predicates.push({
          __or: expression.split(',').map((part) => {
            const [field, , value] = part.split('.');
            return [field, value] as [string, string];
          }),
        });
        return builder;
      },
      order: () => builder,
      update: (patch: Row) => {
        pendingPatch = patch;
        return builder;
      },
      then: (resolve: (value: any) => void) => {
        const rows = tables[table] ?? [];
        // `in` filters by membership; every other predicate is an equality.
        const selected = rows.filter((row) =>
          predicates.every((predicate) =>
            !predicate
              ? true
              : Object.entries(predicate).every(([field, value]) =>
                  field === '__or'
                    ? (predicate.__or as Array<[string, string]>).some(
                        ([target, expected]) => row[target] === expected
                      )
                    : Array.isArray(value)
                      ? value.includes(row[field])
                      : row[field] === value
                )
          )
        );

        if (pendingPatch) {
          for (const row of selected) Object.assign(row, pendingPatch);
          updates.push({ table, patch: pendingPatch });
          return resolve({ data: null, error: null });
        }
        if (headCount) return resolve({ count: selected.length, data: null, error: null });
        return resolve({ data: selected.map((row) => ({ ...row })), error: null });
      },
    };

    return builder;
  };

  return {
    from: makeQuery,
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    updates,
  };
}

const ACTOR = {
  id: 'admin-1',
  full_name: 'Senior Officer',
  email: 'officer@spid.gov.lk',
  role: 'Administrator',
  account_status: 'approved',
  is_deleted: false,
} as any;

function staffProfile(overrides: Row = {}) {
  return {
    id: 'staff-1',
    full_name: 'Kumari Perera',
    email: 'kumari@spid.gov.lk',
    role: 'Staff',
    requested_role: 'Staff',
    section_id: 4,
    section_name: 'Legal',
    account_status: 'approved',
    is_deleted: false,
    original_email: null,
    deleted_at: null,
    deletion_reason: null,
    ...overrides,
  } as any;
}

function seededDb() {
  const target = 'staff-1';
  return createFakeDb({
    files: [
      { id: 1, registered_by: target, created_by: target, approved_by: 'admin-1' },
      { id: 2, registered_by: target, created_by: target, approved_by: null },
      { id: 3, registered_by: 'admin-1', created_by: 'admin-1', approved_by: target },
    ],
    staff_file_requests: [
      { id: 10, requester_id: target, status: 'APPROVED', returned_at: '2026-01-10T00:00:00Z', reviewed_by: 'admin-1', file_no: 'L-1', file_name: 'Land grant', request_date: '2026-01-01' },
      { id: 11, requester_id: target, status: 'PENDING', returned_at: null, reviewed_by: null, file_no: 'L-2', file_name: 'Water board minute', request_date: '2026-02-02' },
      { id: 12, requester_id: 'admin-1', status: 'APPROVED', returned_at: null, reviewed_by: target, file_no: 'L-3', file_name: 'Audit report', request_date: '2026-02-03' },
    ],
    notifications: [
      { id: 20, user_id: target, title: 'File approved' },
      { id: 21, user_id: 'admin-1', title: 'New request' },
    ],
    audit_logs: [
      { id: 30, actor_id: target, target_user_id: null, action: 'file_registered' },
      { id: 31, actor_id: 'admin-1', target_user_id: target, action: 'account_approved' },
    ],
    login_attempts: [{ id: 40, user_id: target, email: 'kumari@spid.gov.lk' }],
    profiles: [],
  });
}

describe('user soft deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountActiveAdmins.mockResolvedValue(3);
  });

  it('retires the account while every record it touched survives', async () => {
    const db = seededDb();
    mockFindById.mockResolvedValue(staffProfile());

    const result = await new UserDeletionService(db as any).softDelete(ACTOR, 'staff-1', {
      pendingAction: 'reject',
      reason: 'Transferred out of the department',
    });

    // The profile row is flagged, not removed, and keeps its identity.
    const patch = db.updates.find((entry) => entry.table === 'profiles')?.patch;
    expect(patch).toMatchObject({
      is_deleted: true,
      account_status: 'disabled',
      deleted_by: 'admin-1',
      deletion_reason: 'Transferred out of the department',
      original_email: 'kumari@spid.gov.lk',
      email: 'deleted+staff-1@deleted.invalid',
    });

    // Every dependent record is still there, attributed to the same account.
    expect(db.from('files').then ? undefined : undefined).toBeUndefined();
    expect((await (db.from('files') as any).select('id')) .data).toHaveLength(3);
    expect((await (db.from('notifications') as any).select('id')).data).toHaveLength(2);
    expect((await (db.from('audit_logs') as any).select('id')).data).toHaveLength(2);
    expect((await (db.from('login_attempts') as any).select('id')).data).toHaveLength(1);
    const requests = (await (db.from('staff_file_requests') as any).select('id')).data;
    expect(requests).toHaveLength(3);
    expect(requests.find((row: Row) => row.id === 10)).toMatchObject({
      requester_id: 'staff-1',
      returned_at: '2026-01-10T00:00:00Z',
    });

    // Sign-in is retired immediately: sessions revoked, address banned.
    expect(vi.mocked((await import('services/AuthorizationService')).AuthorizationService.revokeAllSessions)).toHaveBeenCalledWith('staff-1');
    expect(db.auth.admin.updateUserById).toHaveBeenCalledWith(
      'staff-1',
      expect.objectContaining({ email: 'deleted+staff-1@deleted.invalid', ban_duration: '876000h' })
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account_soft_deleted' })
    );
    expect(result.message).toContain('were kept');
  });

  it('refuses to delete an account that still holds issued files, and changes nothing', async () => {
    const db = createFakeDb({
      files: [{ id: 1, registered_by: 'staff-1', created_by: 'staff-1', approved_by: null }],
      staff_file_requests: [
        { id: 10, requester_id: 'staff-1', status: 'APPROVED', returned_at: null, file_no: 'L-9', file_name: 'Irrigation deed', request_date: '2026-03-01', expected_return_date: '2026-04-01' },
      ],
      notifications: [],
      audit_logs: [],
      login_attempts: [],
      profiles: [],
    });
    mockFindById.mockResolvedValue(staffProfile());

    const service = new UserDeletionService(db as any);
    const error = await service
      .softDelete(ACTOR, 'staff-1', { pendingAction: 'reject' })
      .catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('USER_HAS_ACTIVE_CHECKOUTS');
    expect(error.extra.checkouts).toEqual([
      expect.objectContaining({ file_no: 'L-9' }),
    ]);
    // Nothing was written: the account is untouched.
    expect(db.updates).toEqual([]);
    expect(db.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('asks for a decision on pending requests instead of stranding them', async () => {
    const db = seededDb();
    mockFindById.mockResolvedValue(staffProfile());
    const service = new UserDeletionService(db as any);

    const error = await service
      .softDelete(ACTOR, 'staff-1')
      .catch((err) => err);

    expect(error.code).toBe('USER_HAS_PENDING_REQUESTS');
    expect(error.extra.count).toBe(1);
    expect(db.updates).toEqual([]);
  });

  it('reassigns pending requests to an active staff member and keeps the rest', async () => {
    const db = seededDb();
    mockFindById
      .mockResolvedValueOnce(staffProfile())
      .mockResolvedValueOnce({ ...staffProfile(), id: 'staff-2', full_name: 'Nuwan Silva', email: 'nuwan@spid.gov.lk', section_name: 'Engineering' });

    await new UserDeletionService(db as any).softDelete(ACTOR, 'staff-1', {
      pendingAction: 'reassign',
      reassignToUserId: 'staff-2',
    });

    const pending = (await (db.from('staff_file_requests') as any).select('*').eq('id', 11)).data[0];
    expect(pending).toMatchObject({
      requester_id: 'staff-2',
      requester_name: 'Nuwan Silva',
      requester_email: 'nuwan@spid.gov.lk',
      status: 'PENDING',
    });
    // The closed request keeps the deleted account as its author.
    const returned = (await (db.from('staff_file_requests') as any).select('*').eq('id', 10)).data[0];
    expect(returned.requester_id).toBe('staff-1');
  });

  it('will not delete itself, or the last active administrator', async () => {
    const db = seededDb();
    mockFindById.mockResolvedValue(staffProfile());
    const service = new UserDeletionService(db as any);

    const self = await service.softDelete(ACTOR, ACTOR.id).catch((err) => err);
    expect(self.status).toBe(403);

    mockFindById.mockResolvedValue(
      staffProfile({ id: 'admin-9', role: 'Administrator', account_status: 'approved' })
    );
    mockCountActiveAdmins.mockResolvedValue(1);
    const lastAdmin = await service.softDelete(ACTOR, 'admin-9').catch((err) => err);
    expect(lastAdmin.code).toBe('LAST_ACTIVE_ADMIN');
    expect(db.updates).toEqual([]);
  });

  it('restores the account with its records still linked', async () => {
    const db = seededDb();
    mockFindById.mockResolvedValue(
      staffProfile({
        is_deleted: true,
        email: 'deleted+staff-1@deleted.invalid',
        original_email: 'kumari@spid.gov.lk',
        deleted_at: '2026-04-01T00:00:00Z',
      })
    );

    const result = await new UserDeletionService(db as any).restore(ACTOR, 'staff-1');

    const patch = db.updates.find((entry) => entry.table === 'profiles')?.patch;
    expect(patch).toMatchObject({
      is_deleted: false,
      email: 'kumari@spid.gov.lk',
      account_status: 'pending',
    });
    expect(result.message).toContain('awaiting administrator approval');
    expect((await (db.from('files') as any).select('id')).data).toHaveLength(3);
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'account_restored' }));
  });
});

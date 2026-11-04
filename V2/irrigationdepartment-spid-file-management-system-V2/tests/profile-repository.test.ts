import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileRepository } from 'models/ProfileRepository';

const adminState = vi.hoisted(() => ({ client: null as any }));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => adminState.client,
}));

type Row = Record<string, any>;

function createMockSupabase(options: {
  row: Row;
  metadata?: Record<string, any>;
  supportsAvatarColumn?: boolean;
  supportsLastLoginColumn?: boolean;
}) {
  const supportsAvatar = options.supportsAvatarColumn !== false;
  const supportsLastLogin = options.supportsLastLoginColumn !== false;
  const profiles = new Map<string, Row>([[options.row.id, { ...options.row }]]);
  const metadata = new Map<string, Record<string, any>>([
    [options.row.id, { ...(options.metadata ?? {}) }],
  ]);

  const select = (projection: string) => {
    const error =
      (projection.includes('avatar_url') && !supportsAvatar) ||
      (projection.includes('last_login_at') && !supportsLastLogin)
        ? { message: 'column does not exist' }
        : null;

    const findRow = (column: 'id' | 'email', value: string): Row | null => {
      const row = [...profiles.values()].find((r) =>
        column === 'id' ? r.id === value : r.email === value
      );
      return row ? { ...row, sections: row.sections ?? null } : null;
    };

    return {
      eq: (_column: string, value: string) => ({
        single: async () => {
          if (error) return { data: null, error };
          const row = findRow('id', value);
          return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
        },
      }),
      ilike: (_column: string, value: string) => ({
        maybeSingle: async () => {
          if (error) return { data: null, error };
          return { data: findRow('email', value), error: null };
        },
      }),
      order: async () => ({
        data: error ? null : [...profiles.values()].map((r) => ({ ...r })),
        error,
      }),
    };
  };

  const profilesTable = {
    select,
    update: (patch: Row) => ({
      eq: async (_column: string, id: string) => {
        const row = profiles.get(id);
        if (row) Object.assign(row, patch);
        return { data: row ?? null, error: null };
      },
    }),
  };

  const authAdmin = {
    getUserById: async (id: string) => ({
      data: { user: { id, user_metadata: metadata.get(id) ?? {} } },
      error: null,
    }),
    updateUserById: async (id: string, attributes: { user_metadata: Record<string, any> }) => {
      // The real Supabase admin API replaces the metadata object.
      metadata.set(id, { ...attributes.user_metadata });
      return { data: { user: { id, user_metadata: metadata.get(id) } }, error: null };
    },
    listUsers: async () => ({
      data: {
        users: [...metadata.entries()].map(([id, user_metadata]) => ({
          id,
          user_metadata,
          last_sign_in_at: null,
        })),
      },
      error: null,
    }),
  };

  const client = {
    from: (table: string) => (table === 'profiles' ? profilesTable : {}),
    auth: { admin: authAdmin },
  };

  return { client, profiles, metadata };
}

const baseRow = {
  id: 'admin-1',
  full_name: 'Eng. K. L. Perera',
  email: 'officer@spid.gov.lk',
  role: 'Administrator',
  requested_role: 'Administrator',
  section_id: 1,
  nic: null,
  mobile_phone: null,
  account_status: 'approved',
  approved_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('ProfileRepository avatar persistence', () => {
  beforeEach(() => {
    adminState.client = null;
  });

  it('reads avatar_url from the profiles table instead of stale auth metadata', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, avatar_url: 'https://cdn/db-avatar.jpg', last_login_at: null },
      metadata: { avatar_url: 'https://cdn/stale-metadata.jpg' },
    });
    adminState.client = mock.client;

    const profile = await new ProfileRepository(mock.client as any).findById(baseRow.id);

    expect(profile?.avatar_url).toBe('https://cdn/db-avatar.jpg');
  });

  it('does not replace a saved DB avatar with an empty metadata value', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, avatar_url: 'https://cdn/db-avatar.jpg', last_login_at: '2026-10-01T00:00:00Z' },
      metadata: { avatar_url: null },
    });
    adminState.client = mock.client;

    const profile = await new ProfileRepository(mock.client as any).findById(baseRow.id);

    expect(profile?.avatar_url).toBe('https://cdn/db-avatar.jpg');
  });

  it('falls back to legacy auth metadata when the avatar column is unavailable', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, last_login_at: '2026-10-01T00:00:00Z' },
      metadata: { avatar_url: 'https://cdn/legacy-avatar.jpg' },
      supportsAvatarColumn: false,
    });
    adminState.client = mock.client;

    const profile = await new ProfileRepository(mock.client as any).findById(baseRow.id);

    expect(profile?.avatar_url).toBe('https://cdn/legacy-avatar.jpg');
  });

  it('merges auth metadata on upload so unrelated keys are not wiped', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, last_login_at: '2026-10-01T00:00:00Z' },
      metadata: {
        full_name: 'Eng. K. L. Perera',
        avatar_url: 'https://cdn/old.jpg',
        last_login_at: '2026-10-01T00:00:00Z',
      },
    });
    adminState.client = mock.client;

    const updated = await new ProfileRepository(mock.client as any).updateAvatar(
      baseRow.id,
      'https://cdn/new.jpg?t=123'
    );

    expect(updated?.avatar_url).toBe('https://cdn/new.jpg?t=123');
    expect(mock.profiles.get(baseRow.id)?.avatar_url).toBe('https://cdn/new.jpg?t=123');
    expect(mock.metadata.get(baseRow.id)).toEqual({
      full_name: 'Eng. K. L. Perera',
      avatar_url: 'https://cdn/new.jpg?t=123',
      last_login_at: '2026-10-01T00:00:00Z',
    });
  });

  it('stamps last login without erasing the saved avatar metadata', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, avatar_url: 'https://cdn/avatar.jpg', last_login_at: null },
      metadata: { avatar_url: 'https://cdn/avatar.jpg', full_name: 'Eng. K. L. Perera' },
    });
    adminState.client = mock.client;

    await new ProfileRepository(mock.client as any).touchLastLogin(baseRow.id);

    expect(mock.metadata.get(baseRow.id)?.avatar_url).toBe('https://cdn/avatar.jpg');
    expect(mock.metadata.get(baseRow.id)?.full_name).toBe('Eng. K. L. Perera');
    expect(mock.metadata.get(baseRow.id)?.last_login_at).toBeTruthy();
    expect(mock.profiles.get(baseRow.id)?.last_login_at).toBeTruthy();
  });

  it('preserves the avatar when other profile details are updated', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, avatar_url: 'https://cdn/avatar.jpg', last_login_at: '2026-10-01T00:00:00Z' },
      metadata: { avatar_url: 'https://cdn/avatar.jpg' },
    });
    adminState.client = mock.client;

    const updated = await new ProfileRepository(mock.client as any).updateOwn(baseRow.id, {
      full_name: 'Eng. K. L. Perera Updated',
      mobile_phone: '+94 77 123 4567',
    });

    expect(updated?.full_name).toBe('Eng. K. L. Perera Updated');
    expect(updated?.avatar_url).toBe('https://cdn/avatar.jpg');
  });

  it('clears both DB and metadata avatar on deletion, keeping other metadata', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, avatar_url: 'https://cdn/avatar.jpg', last_login_at: '2026-10-01T00:00:00Z' },
      metadata: { avatar_url: 'https://cdn/avatar.jpg', full_name: 'Eng. K. L. Perera' },
    });
    adminState.client = mock.client;

    const updated = await new ProfileRepository(mock.client as any).updateAvatar(baseRow.id, null);

    expect(updated?.avatar_url).toBeNull();
    expect(mock.profiles.get(baseRow.id)?.avatar_url).toBeNull();
    expect(mock.metadata.get(baseRow.id)?.avatar_url).toBeNull();
    expect(mock.metadata.get(baseRow.id)?.full_name).toBe('Eng. K. L. Perera');
  });

  it('keeps Admin and Staff avatars isolated by user id', async () => {
    const mock = createMockSupabase({
      row: { ...baseRow, avatar_url: 'https://cdn/admin.jpg', last_login_at: '2026-10-01T00:00:00Z' },
      metadata: {},
    });
    mock.profiles.set('staff-2', {
      ...baseRow,
      id: 'staff-2',
      email: 'saman@spid.gov.lk',
      role: 'Staff',
      avatar_url: 'https://cdn/staff.jpg',
      last_login_at: '2026-10-01T00:00:00Z',
    });
    adminState.client = mock.client;

    const repo = new ProfileRepository(mock.client as any);
    const admin = await repo.findById('admin-1');
    const staff = await repo.findById('staff-2');

    expect(admin?.avatar_url).toBe('https://cdn/admin.jpg');
    expect(staff?.avatar_url).toBe('https://cdn/staff.jpg');
  });
});

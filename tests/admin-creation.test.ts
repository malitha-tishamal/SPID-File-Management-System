import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
const mockAdminAuthCreateUser = vi.fn();
const mockAdminProfilesUpsert = vi.fn();
const mockAdminProfilesFindByEmail = vi.fn();
const mockAuditLog = vi.fn();
const mockRequireAdminProfile = vi.fn();
const mockRequireApprovedProfile = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: 'http://localhost:3000',
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: mockAdminAuthCreateUser,
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          upsert: mockAdminProfilesUpsert,
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  }),
  getSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      signUp: vi.fn(),
    },
  }),
}));

vi.mock('models/ProfileRepository', () => {
  return {
    ProfileRepository: class {
      findByEmail(email: string) {
        return mockAdminProfilesFindByEmail(email);
      }
      findById(id: string) {
        return Promise.resolve(null);
      }
      updateStatus() {
        return Promise.resolve();
      }
      updateRole() {
        return Promise.resolve();
      }
      touchLastLogin() {
        return Promise.resolve();
      }
    },
  };
});

vi.mock('models/AuditLogRepository', () => {
  return {
    AuditLogRepository: class {
      log(entry: any) {
        return mockAuditLog(entry);
      }
    },
  };
});

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireAdminProfile: () => mockRequireAdminProfile(),
    requireApprovedProfile: () => mockRequireApprovedProfile(),
  },
}));

vi.mock('services/LockoutService', () => ({
  LockoutService: {
    check: vi.fn().mockResolvedValue({ locked: false }),
    recordFailedAttempt: vi.fn().mockResolvedValue({ locked: false }),
    resetOnSuccess: vi.fn().mockResolvedValue(undefined),
  },
}));

import { AdminController } from 'controllers/AdminController';
import { AuthService } from 'services/AuthService';
import { ApiError } from 'lib/apiResponse';

describe('Admin Creation and Email Verification Bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminProfilesUpsert.mockResolvedValue({ error: null });
    mockAuditLog.mockResolvedValue({ id: 1 });
  });

  it('allows an authenticated administrator to create an admin with bypassed email verification (email_confirm: true)', async () => {
    mockRequireAdminProfile.mockResolvedValue({
      id: 'admin-uuid-1',
      role: 'Administrator',
      email: 'chief@spid.gov.lk',
      account_status: 'approved',
    });

    mockAdminProfilesFindByEmail.mockResolvedValue(null);

    mockAdminAuthCreateUser.mockResolvedValue({
      data: {
        user: {
          id: 'new-admin-uuid',
          email: 'newadmin@spid.gov.lk',
        },
      },
      error: null,
    });

    const req = new Request('http://localhost:3000/api/admin/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Deputy Director Perera',
        email: 'newadmin@spid.gov.lk',
        password: 'SecureAdminPass!99',
        role: 'Administrator',
      }),
    });

    const res = await AdminController.createUser(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.user.role).toBe('Administrator');
    expect(json.data.user.account_status).toBe('approved');

    // 1. Verify Supabase admin createUser was called with email_confirm: true (bypassing verification)
    expect(mockAdminAuthCreateUser).toHaveBeenCalledWith({
      email: 'newadmin@spid.gov.lk',
      password: 'SecureAdminPass!99',
      email_confirm: true,
      user_metadata: {
        full_name: 'Deputy Director Perera',
        requested_role: 'Administrator',
        section_id: null,
        mobile_phone: null,
      },
    });

    // 2. Verify profile was upserted with approved status and Administrator role
    expect(mockAdminProfilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-admin-uuid',
        email: 'newadmin@spid.gov.lk',
        role: 'Administrator',
        account_status: 'approved',
        approved_by: 'admin-uuid-1',
      }),
      { onConflict: 'id' }
    );

    // 3. Verify audit log entry was created
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-uuid-1',
        targetUserId: 'new-admin-uuid',
        action: 'account_created_by_admin',
      })
    );
  });

  it('allows the newly created administrator to log in immediately without completing email verification', async () => {
    // Mock the existing profile in DB for the created admin
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'new-admin-uuid',
      email: 'newadmin@spid.gov.lk',
      full_name: 'Deputy Director Perera',
      role: 'Administrator',
      account_status: 'approved',
    });

    // Supabase auth signInWithPassword succeeds because email_confirm was true
    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'valid-jwt' }, user: { id: 'new-admin-uuid' } },
      error: null,
    });

    const profile = await AuthService.login('newadmin@spid.gov.lk', 'SecureAdminPass!99');

    expect(profile).toBeDefined();
    expect(profile.role).toBe('Administrator');
    expect(profile.account_status).toBe('approved');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'newadmin@spid.gov.lk',
      password: 'SecureAdminPass!99',
    });
  });

  it('rejects duplicate email addresses when creating an administrator', async () => {
    mockRequireAdminProfile.mockResolvedValue({
      id: 'admin-uuid-1',
      role: 'Administrator',
      account_status: 'approved',
    });

    // Existing user found
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'existing-id',
      email: 'existing@spid.gov.lk',
    });

    const req = new Request('http://localhost:3000/api/admin/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Duplicate Admin',
        email: 'existing@spid.gov.lk',
        password: 'Password123!',
      }),
    });

    await expect(AdminController.createUser(req)).rejects.toThrow(
      new ApiError(409, 'USER_EXISTS', 'An account with this email address already exists.')
    );

    expect(mockAdminAuthCreateUser).not.toHaveBeenCalled();
  });

  it('rejects administrator creation when caller is not an administrator', async () => {
    mockRequireAdminProfile.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );

    const req = new Request('http://localhost:3000/api/admin/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Sneaky User',
        email: 'sneaky@spid.gov.lk',
        password: 'Password123!',
      }),
    });

    await expect(AdminController.createUser(req)).rejects.toThrow(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );

    expect(mockAdminAuthCreateUser).not.toHaveBeenCalled();
  });

  it('rejects invalid inputs (short password, invalid email, short name)', async () => {
    mockRequireAdminProfile.mockResolvedValue({
      id: 'admin-uuid-1',
      role: 'Administrator',
      account_status: 'approved',
    });

    // Short password
    const req1 = new Request('http://localhost:3000/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify({
        full_name: 'Valid Name',
        email: 'valid@spid.gov.lk',
        password: 'short',
      }),
    });
    await expect(AdminController.createUser(req1)).rejects.toThrow('Password must be at least 8 characters.');

    // Short name
    const req2 = new Request('http://localhost:3000/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify({
        full_name: 'A',
        email: 'valid@spid.gov.lk',
        password: 'ValidPassword123',
      }),
    });
    await expect(AdminController.createUser(req2)).rejects.toThrow('Full name must be at least 3 characters.');

    // Invalid email
    const req3 = new Request('http://localhost:3000/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify({
        full_name: 'Valid Name',
        email: 'not-an-email',
        password: 'ValidPassword123',
      }),
    });
    await expect(AdminController.createUser(req3)).rejects.toThrow('A valid email address is required.');
  });

  it('enforces email confirmation on normal public users when unconfirmed', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'self-user-id',
      email: 'public@spid.gov.lk',
      full_name: 'Public Officer',
      role: 'Staff',
      account_status: 'pending',
    });

    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email not confirmed', status: 400 },
    });

    await expect(AuthService.login('public@spid.gov.lk', 'PublicPass123!')).rejects.toThrow(
      new ApiError(
        403,
        'EMAIL_NOT_CONFIRMED',
        'Please verify your email address before signing in. Check your inbox for the verification link.'
      )
    );
  });

  it('enforces administrator approval on verified self-registered users', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'self-user-id',
      email: 'public@spid.gov.lk',
      full_name: 'Public Officer',
      role: 'Staff',
      account_status: 'pending',
    });

    // Supabase auth passes because user clicked verification link
    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'jwt' }, user: { id: 'self-user-id' } },
      error: null,
    });

    await expect(AuthService.login('public@spid.gov.lk', 'PublicPass123!')).rejects.toThrow(
      new ApiError(
        403,
        'ACCOUNT_PENDING',
        'Your account is awaiting administrator approval. Please contact the system administrator.'
      )
    );

    // Session destroyed immediately
    expect(mockSignOut).toHaveBeenCalled();
  });
});

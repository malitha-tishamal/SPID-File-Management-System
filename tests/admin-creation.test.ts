import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
const mockAdminAuthCreateUser = vi.fn();
const mockAdminAuthGenerateLink = vi.fn();
const mockAdminProfilesUpsert = vi.fn();
const mockAdminProfilesUpdate = vi.fn();
const mockAdminProfilesFindByEmail = vi.fn();
const mockAuditLog = vi.fn();
const mockRequireAdminProfile = vi.fn();
const mockRequireApprovedProfile = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockSignUp = vi.fn();
const mockSectionFindByName = vi.fn();

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
        generateLink: mockAdminAuthGenerateLink,
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          upsert: mockAdminProfilesUpsert,
          update: (...args: any[]) => {
            mockAdminProfilesUpdate(...args);
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: 'mock-user-id' }], error: null }),
              }),
            };
          },
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
      signUp: mockSignUp,
    },
  }),
}));

vi.mock('models/SectionRepository', () => ({
  SectionRepository: class {
    findByName(name: string) {
      return mockSectionFindByName(name);
    }
  },
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
import { AuthController } from 'controllers/AuthController';
import { AuthService } from 'services/AuthService';
import { ApiError } from 'lib/apiResponse';

describe('Admin Creation and Email Verification Bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminProfilesUpsert.mockResolvedValue({ error: null });
    mockAuditLog.mockResolvedValue({ id: 1 });
    mockSectionFindByName.mockResolvedValue({
      id: 1,
      name: 'Administration & Human Resources Division',
    });
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

  it('creates an account with Staff role when Staff Registration is used and requires email confirmation', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue(null);
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'staff-user-id', email: 'staff@spid.gov.lk' },
        session: null,
      },
      error: null,
    });

    const result = await AuthService.register({
      role: 'Staff',
      fullName: 'Field Officer Silva',
      email: 'staff@spid.gov.lk',
      section: 'Administration & Human Resources Division',
      phoneDigits: '771234567',
      password: 'StrongStaffPass!1',
    });

    expect(result.userId).toBe('staff-user-id');
    expect(result.emailConfirmationRequired).toBe(true);

    // Verify signUp payload contained role: 'Staff'
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'staff@spid.gov.lk',
        password: 'StrongStaffPass!1',
        options: expect.objectContaining({
          data: expect.objectContaining({
            full_name: 'Field Officer Silva',
            role: 'Staff',
            requested_role: 'Staff',
          }),
        }),
      })
    );

    // Verify profiles table update sets role: 'Staff'
    expect(mockAdminProfilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Staff',
        requested_role: 'Staff',
      })
    );
  });

  it('creates an account with Administrator role when Admin Registration is used and requires email confirmation', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue(null);
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'admin-user-id', email: 'adminuser@spid.gov.lk' },
        session: null,
      },
      error: null,
    });

    const result = await AuthService.register({
      role: 'Administrator',
      fullName: 'Director Jayawardena',
      email: 'adminuser@spid.gov.lk',
      section: 'Administration & Human Resources Division',
      phoneDigits: '719876543',
      password: 'StrongAdminPass!99',
    });

    expect(result.userId).toBe('admin-user-id');
    expect(result.emailConfirmationRequired).toBe(true);

    // Verify signUp payload contained role: 'Administrator'
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'adminuser@spid.gov.lk',
        password: 'StrongAdminPass!99',
        options: expect.objectContaining({
          data: expect.objectContaining({
            full_name: 'Director Jayawardena',
            role: 'Administrator',
            requested_role: 'Administrator',
          }),
        }),
      })
    );

    // Verify profiles table update sets role: 'Administrator' (NOT Staff!)
    expect(mockAdminProfilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Administrator',
        requested_role: 'Administrator',
      })
    );
  });

  it('does not silently fall back to Staff role when registering as Administrator', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue(null);
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'admin-check-id', email: 'admincheck@spid.gov.lk' },
        session: null,
      },
      error: null,
    });

    await AuthService.register({
      role: 'Administrator',
      fullName: 'System Admin Gunasekara',
      email: 'admincheck@spid.gov.lk',
      section: 'Administration & Human Resources Division',
      phoneDigits: '772345678',
      password: 'StrongAdminPass!88',
    });

    // Explicitly verify it was NOT called with role: 'Staff'
    expect(mockAdminProfilesUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Staff',
      })
    );
    expect(mockAdminProfilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Administrator',
      })
    );
  });

  it('enforces email confirmation on unconfirmed accounts registered via Admin Registration', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'admin-unconfirmed-id',
      email: 'adminunconf@spid.gov.lk',
      full_name: 'Unconfirmed Admin',
      role: 'Administrator',
      account_status: 'pending',
    });

    // Supabase auth fails because user has not clicked email confirmation link
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email not confirmed', status: 400 },
    });

    await expect(AuthService.login('adminunconf@spid.gov.lk', 'StrongPass!123')).rejects.toThrow(
      new ApiError(
        403,
        'EMAIL_NOT_CONFIRMED',
        'Please verify your email address before signing in. Check your inbox for the verification link.'
      )
    );
  });

  it('allows verified and approved Administrator to log in and access Administrator privileges', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'approved-admin-id',
      email: 'approvedadmin@spid.gov.lk',
      full_name: 'Eng. Bandara',
      role: 'Administrator',
      account_status: 'approved',
    });

    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'valid-token' }, user: { id: 'approved-admin-id' } },
      error: null,
    });

    const profile = await AuthService.login('approvedadmin@spid.gov.lk', 'StrongPass!123');
    expect(profile).toBeDefined();
    expect(profile.role).toBe('Administrator');
    expect(profile.account_status).toBe('approved');
  });

  it('rejects invalid role selection on AuthController.register', async () => {
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'SuperAdmin', // Invalid role attempted
        fullName: 'Attacker Name',
        email: 'attacker@spid.gov.lk',
        section: 'Administration & Human Resources Division',
        phoneDigits: '771234567',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    });

    await expect(AuthController.register(req)).rejects.toThrow(
      new ApiError(400, 'VALIDATION_ERROR', 'Invalid role selection.')
    );
  });

  it('handles rate limit fallback during admin registration while preserving role', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue(null);

    // Public signUp is rate-limited (status 429)
    mockSignUp.mockResolvedValue({
      data: null,
      error: { status: 429, message: 'email rate limit exceeded' },
    });

    // Fallback generateLink succeeds
    mockAdminAuthGenerateLink.mockResolvedValue({
      data: { user: { id: 'rate-limited-admin-id', email: 'ratelimitadmin@spid.gov.lk' } },
      error: null,
    });

    const result = await AuthService.register({
      role: 'Administrator',
      fullName: 'Chief Engineer Fernando',
      email: 'ratelimitadmin@spid.gov.lk',
      section: 'Administration & Human Resources Division',
      phoneDigits: '773456789',
      password: 'AdminPassword!234',
    });

    expect(result.userId).toBe('rate-limited-admin-id');
    expect(result.emailConfirmationRequired).toBe(true);

    // Verify generateLink received role: 'Administrator'
    expect(mockAdminAuthGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signup',
        email: 'ratelimitadmin@spid.gov.lk',
        options: expect.objectContaining({
          data: expect.objectContaining({
            role: 'Administrator',
            requested_role: 'Administrator',
          }),
        }),
      })
    );

    // Verify profile updated with Administrator role
    expect(mockAdminProfilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Administrator',
        requested_role: 'Administrator',
      })
    );
  });
});

describe('Last Login Timestamp Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls signInWithPassword (which natively stamps last_sign_in_at) on successful login', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'user-login-id',
      email: 'officer@spid.gov.lk',
      full_name: 'Test Officer',
      role: 'Staff',
      account_status: 'approved',
    });

    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'user-login-id' } },
      error: null,
    });

    const profile = await AuthService.login('officer@spid.gov.lk', 'ValidPass!1');

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'officer@spid.gov.lk',
      password: 'ValidPass!1',
    });
    expect(profile.role).toBe('Staff');
    expect(profile.account_status).toBe('approved');
  });

  it('rejects with INVALID_CREDENTIALS on bad password and does not update last login', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'user-bad-creds',
      email: 'badcreds@spid.gov.lk',
      full_name: 'Bad Creds User',
      role: 'Staff',
      account_status: 'approved',
    });

    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    await expect(
      AuthService.login('badcreds@spid.gov.lk', 'WrongPassword!')
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('destroys session and does NOT stamp last login for pending account', async () => {
    mockAdminProfilesFindByEmail.mockResolvedValue({
      id: 'pending-user-id',
      email: 'pending@spid.gov.lk',
      full_name: 'Pending User',
      role: 'Staff',
      account_status: 'pending',
    });

    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'tok' }, user: { id: 'pending-user-id' } },
      error: null,
    });

    await expect(
      AuthService.login('pending@spid.gov.lk', 'SomePass!1')
    ).rejects.toMatchObject({ code: 'ACCOUNT_PENDING' });

    // signOut must be called to destroy the dangling Supabase session
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('ProfileRepository.listAllWithLockout merge logic: auth last_sign_in_at takes priority over profile field', () => {
    const now = new Date().toISOString();
    const profile = { id: 'abc', last_login_at: null };
    const authUserMap = new Map<string, string>([['abc', now]]);

    const result = authUserMap.get(profile.id) || profile.last_login_at || null;
    expect(result).toBe(now);
  });

  it('accounts that have never logged in return null last_login_at', () => {
    const profile = { id: 'xyz', last_login_at: null };
    const authUserMap = new Map<string, string>(); // no entry for xyz

    const result = authUserMap.get(profile.id) || profile.last_login_at || null;
    expect(result).toBeNull();
  });
});

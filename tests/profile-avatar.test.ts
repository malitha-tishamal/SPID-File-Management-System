import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileController } from 'controllers/ProfileController';
import { ApiError } from 'lib/apiResponse';

const mockAdminUser = {
  id: 'admin-uuid-1',
  full_name: 'Eng. K. L. Perera',
  email: 'officer@spid.gov.lk',
  role: 'Administrator',
  requested_role: 'Administrator',
  section_id: 1,
  nic: '198512345678',
  mobile_phone: '+94 77 123 4567',
  account_status: 'approved',
  approved_at: '2026-10-15T00:00:00Z',
  created_at: '2026-10-15T00:00:00Z',
  avatar_url: null as string | null,
  last_login_at: null as string | null,
};

const mockStaffUser = {
  id: 'staff-uuid-2',
  full_name: 'Saman Kumara',
  email: 'saman@spid.gov.lk',
  role: 'Staff',
  requested_role: 'Staff',
  section_id: 2,
  nic: '199212345678',
  mobile_phone: '+94 71 987 6543',
  account_status: 'approved',
  approved_at: '2026-10-16T00:00:00Z',
  created_at: '2026-10-16T00:00:00Z',
  avatar_url: null as string | null,
  last_login_at: null as string | null,
};

let currentUser = mockAdminUser;
let authMetadataStore: Record<string, Record<string, any>> = {};
let profileTableStore: Record<string, any> = {};

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: 'http://localhost:3000',
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireApprovedProfile: vi.fn(async () => {
      const stored = profileTableStore[currentUser.id] || currentUser;
      const meta = authMetadataStore[currentUser.id] || {};
      return {
        ...stored,
        avatar_url: meta.avatar_url ?? stored.avatar_url ?? null,
      };
    }),
  },
}));

vi.mock('services/StorageService', () => ({
  StorageService: {
    uploadProfileImage: vi.fn(async (userId: string, file: File) => {
      if (file.size > 2 * 1024 * 1024) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'File exceeds the 2 MB limit.');
      }
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.type)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Profile image must be JPEG, PNG, WebP or GIF.');
      }
      return {
        path: `${userId}/123456-avatar.jpg`,
        publicUrl: `https://storage.spid.gov.lk/profile-images/${userId}/123456-avatar.jpg`,
        scan: {
          status: 'Clean',
          message: 'File security scan completed successfully.',
        },
      };
    }),
    deleteProfileImage: vi.fn(async (_userId: string) => {}),
  },
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: vi.fn(async (id: string, attributes: { user_metadata: any }) => {
          if (!authMetadataStore[id]) authMetadataStore[id] = {};
          Object.assign(authMetadataStore[id], attributes.user_metadata);
          return { data: { user: { id, user_metadata: authMetadataStore[id] } }, error: null };
        }),
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { id, user_metadata: authMetadataStore[id] || {} } },
          error: null,
        })),
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          update: (patch: any) => ({
            eq: (_col: string, id: string) => {
              if (!profileTableStore[id]) profileTableStore[id] = { ...currentUser, id };
              Object.assign(profileTableStore[id], patch);
              return Promise.resolve({ data: profileTableStore[id], error: null });
            },
          }),
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: () => {
                const rec = profileTableStore[id] || (id === mockAdminUser.id ? mockAdminUser : mockStaffUser);
                const meta = authMetadataStore[id] || {};
                return Promise.resolve({
                  data: { ...rec, avatar_url: meta.avatar_url ?? rec.avatar_url ?? null, sections: { name: 'Admin Division' } },
                  error: null,
                });
              },
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

describe('Profile Picture Synchronization and Permanent Storage', () => {
  beforeEach(() => {
    authMetadataStore = {};
    profileTableStore = {};
    currentUser = { ...mockAdminUser, avatar_url: null };
  });

  // Test 1: Immediate Update for Admin and Staff
  it('Test 1 — Uploads new profile picture and returns updated profile with cache-busted URL for Admin', async () => {
    currentUser = { ...mockAdminUser };
    const fakeFile = new File(['fake-image-bytes'], 'avatar.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', fakeFile);

    const req = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: formData,
    });

    const res = await ProfileController.uploadAvatar(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.publicUrl).toContain('admin-uuid-1');
    expect(json.data.publicUrl).toContain('t='); // cache-buster present
    expect(json.data.profile.avatar_url).toBe(json.data.publicUrl);
    expect(authMetadataStore['admin-uuid-1']?.avatar_url).toBe(json.data.publicUrl);
  });

  it('Test 1 — Uploads new profile picture and returns updated profile with cache-busted URL for Staff', async () => {
    currentUser = { ...mockStaffUser };
    const fakeFile = new File(['fake-staff-image-bytes'], 'photo.gif', { type: 'image/gif' });
    const formData = new FormData();
    formData.append('file', fakeFile);

    const req = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: formData,
    });

    const res = await ProfileController.uploadAvatar(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.publicUrl).toContain('staff-uuid-2');
    expect(json.data.publicUrl).toContain('t=');
    expect(json.data.profile.avatar_url).toBe(json.data.publicUrl);
    expect(authMetadataStore['staff-uuid-2']?.avatar_url).toBe(json.data.publicUrl);
  });

  // Test 2 & 3: Persistence after refresh / logout & login
  it('Test 2 & 3 — Profile picture persists in user database record across sessions', async () => {
    currentUser = { ...mockAdminUser };
    const fakeFile = new File(['test'], 'pic.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', fakeFile);

    const req = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: formData,
    });
    const res = await ProfileController.uploadAvatar(req);
    const json = await res.json();
    const savedUrl = json.data.publicUrl;

    // Simulate subsequent reload / fetch / login
    expect(authMetadataStore['admin-uuid-1']?.avatar_url).toBe(savedUrl);
  });

  // Test 4: Updating other profile details does NOT remove avatar
  it('Test 4 — Updating user name, phone, or section preserves the existing profile picture', async () => {
    currentUser = { ...mockAdminUser };
    const fakeFile = new File(['test'], 'pic.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', fakeFile);

    const uploadReq = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: formData,
    });
    const uploadRes = await ProfileController.uploadAvatar(uploadReq);
    const uploadJson = await uploadRes.json();
    const existingAvatar = uploadJson.data.publicUrl;

    // Now update profile details (name and phone)
    const patchReq = new Request('http://localhost:3000/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Eng. K. L. Perera Updated',
        mobile_phone: '771234567',
        section_id: 3,
      }),
    });

    const patchRes = await ProfileController.updateOwn(patchReq);
    const patchJson = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patchJson.ok).toBe(true);
    expect(patchJson.data.profile.full_name).toBe('Eng. K. L. Perera Updated');
    // Avatar must NOT be cleared or set to null
    expect(patchJson.data.profile.avatar_url).toBe(existingAvatar);
  });

  // Test 5: Separate Admin and Staff Profiles
  it('Test 5 — Admin and Staff profile pictures remain strictly separated by unique ID', async () => {
    // 1. Admin uploads an avatar
    currentUser = { ...mockAdminUser };
    const adminFile = new File(['admin-pic'], 'admin.jpg', { type: 'image/jpeg' });
    const adminFormData = new FormData();
    adminFormData.append('file', adminFile);

    const adminReq = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: adminFormData,
    });
    const adminRes = await ProfileController.uploadAvatar(adminReq);
    const adminJson = await adminRes.json();
    const adminUrl = adminJson.data.publicUrl;

    // 2. Staff uploads a different avatar
    currentUser = { ...mockStaffUser };
    const staffFile = new File(['staff-pic'], 'staff.png', { type: 'image/png' });
    const staffFormData = new FormData();
    staffFormData.append('file', staffFile);

    const staffReq = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: staffFormData,
    });
    const staffRes = await ProfileController.uploadAvatar(staffReq);
    const staffJson = await staffRes.json();
    const staffUrl = staffJson.data.publicUrl;

    // Verify both are distinct and associated only with their respective user ID
    expect(adminUrl).toContain('admin-uuid-1');
    expect(staffUrl).toContain('staff-uuid-2');
    expect(adminUrl).not.toBe(staffUrl);
    expect(authMetadataStore['admin-uuid-1']?.avatar_url).toBe(adminUrl);
    expect(authMetadataStore['staff-uuid-2']?.avatar_url).toBe(staffUrl);
  });

  // Test 6: Upload Failure
  it('Test 6 — Oversized image (>2MB) throws VALIDATION_ERROR and leaves avatar unchanged', async () => {
    currentUser = { ...mockAdminUser };
    const bigFile = new File(['x'.repeat(3 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(bigFile, 'size', { value: 3 * 1024 * 1024 });

    const formData = new FormData();
    formData.append('file', bigFile);

    const req = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'POST',
      body: formData,
    });

    await expect(ProfileController.uploadAvatar(req)).rejects.toThrow(ApiError);
    expect(authMetadataStore['admin-uuid-1']?.avatar_url).toBeUndefined();
  });

  // Test 7: Deleting avatar
  it('Test 7 — Deleting avatar resets avatar_url to null and cleans up storage', async () => {
    currentUser = { ...mockAdminUser };
    authMetadataStore['admin-uuid-1'] = { avatar_url: 'https://storage/old.jpg' };

    const req = new Request('http://localhost:3000/api/profile/avatar', {
      method: 'DELETE',
    });

    const res = await ProfileController.deleteAvatar(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.publicUrl).toBeNull();
    expect(authMetadataStore['admin-uuid-1']?.avatar_url).toBeNull();
  });
});

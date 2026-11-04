import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectionController } from '../src/controllers/SectionController';
import { ApiError } from '../src/lib/apiResponse';

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: '',
}));

const mockRequireAdminProfile = vi.fn();
const mockRequireApprovedProfile = vi.fn();

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireAdminProfile: () => mockRequireAdminProfile(),
    requireApprovedProfile: () => mockRequireApprovedProfile(),
  },
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: [], error: null }),
        ilike: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: { id: 1, name: 'Hydrology Division', section_lead: null, status: 'active' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

describe('Section Authorization Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects Staff user attempting to create a section with 403 FORBIDDEN', async () => {
    mockRequireAdminProfile.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.'),
    );

    const req = new Request('http://localhost:3000/api/admin/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hydrology Division' }),
    });

    await expect(SectionController.createSection(req)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Administrator privileges required.',
    });
  });

  it('allows Administrator to create a section', async () => {
    mockRequireAdminProfile.mockResolvedValue({
      id: 'admin-id',
      email: 'admin@spid.gov.lk',
      full_name: 'Admin User',
      role: 'Administrator',
      account_status: 'approved',
    });

    const req = new Request('http://localhost:3000/api/admin/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hydrology Division' }),
    });

    const res = await SectionController.createSection(req);
    expect(res.status).toBe(201);
  });
});

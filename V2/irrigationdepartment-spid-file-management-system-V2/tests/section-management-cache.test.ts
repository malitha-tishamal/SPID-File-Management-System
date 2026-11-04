import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../src/lib/apiResponse';

const { mockListAll, mockRequireAdminProfile } = vi.hoisted(() => ({
  mockListAll: vi.fn(),
  mockRequireAdminProfile: vi.fn(),
}));

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: '',
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireAdminProfile: () => mockRequireAdminProfile(),
  },
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({}),
}));

vi.mock('models/SectionRepository', () => ({
  SectionRepository: class {
    listAll = mockListAll;
  },
}));

import { SectionController, invalidateSectionsCache } from '../src/controllers/SectionController';

const SECTIONS_URL = 'http://localhost:3000/api/admin/sections';
const SAMPLE_SECTIONS = [
  { id: 1, name: 'Finance', status: 'approved' as const, section_lead: null },
  { id: 2, name: 'Hydrology', status: 'pending' as const, section_lead: 'K. Perera' },
];

describe('SectionController list cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSectionsCache();
    mockRequireAdminProfile.mockResolvedValue({ id: 'admin-id', role: 'Administrator' });
    mockListAll.mockResolvedValue(SAMPLE_SECTIONS);
  });

  it('serves repeated list requests from cache without another query', async () => {
    const first = await SectionController.listSections(new Request(SECTIONS_URL));
    const second = await SectionController.listSections(new Request(SECTIONS_URL));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('Cache-Control')).toContain('no-store');
    expect(mockListAll).toHaveBeenCalledTimes(1);

    const json = await second.json();
    expect(json.data.sections).toEqual(SAMPLE_SECTIONS);
  });

  it('bypasses the cache when refresh=true is requested', async () => {
    await SectionController.listSections(new Request(SECTIONS_URL));
    const refreshed = await SectionController.listSections(
      new Request(`${SECTIONS_URL}?refresh=true`)
    );

    expect(mockListAll).toHaveBeenCalledTimes(2);
    const json = await refreshed.json();
    expect(json.data.sections).toEqual(SAMPLE_SECTIONS);
  });

  it('re-queries after the cache is explicitly invalidated', async () => {
    await SectionController.listSections(new Request(SECTIONS_URL));
    invalidateSectionsCache();
    await SectionController.listSections(new Request(SECTIONS_URL));

    expect(mockListAll).toHaveBeenCalledTimes(2);
  });

  it('still enforces administrator authorization before serving cached data', async () => {
    await SectionController.listSections(new Request(SECTIONS_URL));

    mockRequireAdminProfile.mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.')
    );

    await expect(SectionController.listSections(new Request(SECTIONS_URL))).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(mockListAll).toHaveBeenCalledTimes(1);
  });
});

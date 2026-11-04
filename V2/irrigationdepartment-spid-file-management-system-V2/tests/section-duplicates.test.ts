import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../src/lib/apiResponse';

const { mockList, mockFindByName, mockCreate, mockAdmin, mockLog } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockFindByName: vi.fn(),
  mockCreate: vi.fn(),
  mockAdmin: {},
  mockLog: vi.fn(),
}));

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SITE_URL: '',
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireAdminProfile: async () => ({ id: 'admin-1', role: 'Administrator' }),
  },
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => mockAdmin,
}));

vi.mock('models/SectionRepository', () => ({
  SectionRepository: class {
    list = mockList;
    findByName = mockFindByName;
    create = mockCreate;
  },
}));

vi.mock('models/AuditLogRepository', () => ({
  AuditLogRepository: class {
    log = mockLog;
  },
}));

import { SectionController } from '../src/controllers/SectionController';

function postBody(payload: unknown): Request {
  return new Request('http://localhost:3000/api/admin/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('SectionController.createSection duplicate protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByName.mockResolvedValue(null);
    mockCreate.mockImplementation(async (name: string) => ({ id: 99, name, status: 'approved' }));
  });

  it('rejects a case/whitespace duplicate with 409 and the standard message', async () => {
    mockList.mockResolvedValue([{ id: 1, name: 'Accounting', status: 'approved' }]);

    await expect(
      SectionController.createSection(postBody({ name: '  accounting  ' })),
    ).rejects.toMatchObject({
      status: 409,
      message: "Section 'Accounting' already exists.",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('explains when the duplicate section is disabled', async () => {
    mockList.mockResolvedValue([{ id: 2, name: 'Agree', status: 'disabled' }]);

    await expect(
      SectionController.createSection(postBody({ name: 'agree' })),
    ).rejects.toMatchObject({
      status: 409,
      message: 'This section already exists but is disabled. Enable it from Section Management.',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('detects duplicates that differ only by internal whitespace', async () => {
    mockList.mockResolvedValue([
      { id: 3, name: 'Information Technology', status: 'approved' },
    ]);

    await expect(
      SectionController.createSection(postBody({ name: 'information    technology' })),
    ).rejects.toMatchObject({
      status: 409,
      message: "Section 'Information Technology' already exists.",
    });
  });

  it('falls back to findByName when the section list is unavailable', async () => {
    mockList.mockResolvedValue([]);
    mockFindByName.mockResolvedValue({ id: 2, name: 'Agree', status: 'disabled' });

    await expect(
      SectionController.createSection(postBody({ name: 'Agree' })),
    ).rejects.toMatchObject({
      status: 409,
      message: 'This section already exists but is disabled. Enable it from Section Management.',
    });
  });

  it('creates the section with a normalized, title-cased name', async () => {
    mockList.mockResolvedValue([{ id: 1, name: 'Accounting', status: 'approved' }]);

    const res = await SectionController.createSection(
      postBody({ name: '  information   technology ', section_lead: ' Dr. J. Philips ' }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith('Information Technology', 'Dr. J. Philips');
    expect(json.data.section.name).toBe('Information Technology');
  });

  it('still rejects names that are too short', async () => {
    await expect(
      SectionController.createSection(postBody({ name: ' ab ' })),
    ).rejects.toThrow(new ApiError(400, 'VALIDATION_ERROR', 'Section name must be at least 3 characters.'));
    expect(mockList).not.toHaveBeenCalled();
  });
});

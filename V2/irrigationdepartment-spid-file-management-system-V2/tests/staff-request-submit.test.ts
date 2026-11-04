import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireApprovedProfile = vi.fn();
const mockRpc = vi.fn();
const mockNotifyAdmins = vi.fn();
const mockAuditLog = vi.fn();

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

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ rpc: (...args: any[]) => mockRpc(...args) }),
}));

vi.mock('services/NotificationService', () => ({
  NotificationService: class {
    notifyAdmins = (...args: any[]) => mockNotifyAdmins(...args);
  },
}));

vi.mock('models/AuditLogRepository', () => ({
  AuditLogRepository: class {
    log = (...args: any[]) => mockAuditLog(...args);
  },
}));

import { POST } from '../src/app/api/staff/file-requests/route';

const STAFF = {
  id: 'staff-1',
  role: 'Staff',
  full_name: 'Nimal Perera',
  email: 'nimal@spid.lk',
  section_name: 'Engineering',
};

const tomorrow = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

function pendingRequest(overrides: Record<string, any> = {}) {
  return {
    id: 77,
    file_id: 39,
    file_no: '00345',
    file_name: 'Land Acquisition File',
    section_name: 'Land',
    storage_location: 'Central Record Room — Locker L-01',
    requester_id: STAFF.id,
    requester_name: STAFF.full_name,
    requester_email: STAFF.email,
    requester_role: 'Staff',
    requester_section: 'Engineering',
    request_date: tomorrow(),
    duration_days: 3,
    priority: 'NORMAL',
    status: 'PENDING',
    created_at: '2026-10-30T05:00:00Z',
    ...overrides,
  };
}

function submit(body: Record<string, any> = {}) {
  return POST(
    new Request('http://localhost:3000/api/staff/file-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: 39,
        request_date: tomorrow(),
        duration_days: 3,
        priority: 'NORMAL',
        ...body,
      }),
    }),
    {},
  );
}

async function submitJson(body: Record<string, any> = {}) {
  const response: Response = await submit(body);
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireApprovedProfile.mockResolvedValue(STAFF);
  mockAuditLog.mockResolvedValue(undefined);
  mockNotifyAdmins.mockResolvedValue(1);
});

describe('POST /api/staff/file-requests — duplicate and priority rules', () => {
  it('creates a request when nothing is pending for the file', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'created', request: pendingRequest(), cancelled_request_id: null },
      error: null,
    });

    const { status, body } = await submitJson({ priority: 'HIGH' });

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.upgraded).toBe(false);
    expect(body.data.request.id).toBe(77);
    expect(body.data.message).toBe(
      'Your file request has been sent to all administrators for review.',
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'staff_submit_file_request',
      expect.objectContaining({ p_priority: 'HIGH', p_replace_request_id: null }),
    );
  });

  it('refuses an identical pending request with the documented warning', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'duplicate_same_priority', request: pendingRequest() },
      error: null,
    });

    const { status, body } = await submitJson();

    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('DUPLICATE_REQUEST');
    expect(body.message).toBe(
      'You have already submitted a pending request for this file with the same priority. Please wait for administrator approval or review your existing request.',
    );
    expect(body.conflict).toEqual({
      kind: 'duplicate',
      request: expect.objectContaining({ id: 77, priority: 'NORMAL' }),
    });
    expect(mockNotifyAdmins).not.toHaveBeenCalled();
  });

  it('refuses a lower priority without cancelling the existing request', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'blocked_lower_priority', request: pendingRequest({ priority: 'HIGH' }) },
      error: null,
    });

    const { status, body } = await submitJson({ priority: 'NORMAL' });

    expect(status).toBe(409);
    expect(body.code).toBe('REQUEST_CONFLICT');
    expect(body.message).toBe(
      'You already have a pending request for this file with a higher priority. You cannot submit another request with a lower priority while the existing request is active.',
    );
    expect(body.conflict.kind).toBe('lower_priority');
    expect(mockNotifyAdmins).not.toHaveBeenCalled();
  });

  it('asks for confirmation when a higher priority was submitted without replacing', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'upgrade_required', request: pendingRequest({ priority: 'LOW' }) },
      error: null,
    });

    const { status, body } = await submitJson({ priority: 'HIGH' });

    expect(status).toBe(409);
    expect(body.code).toBe('REQUEST_CONFLICT');
    expect(body.conflict.kind).toBe('upgrade_required');
    expect(body.conflict.request.priority).toBe('LOW');
  });

  it('passes the confirmed replacement id to the database and reports the upgrade', async () => {
    mockRpc.mockResolvedValue({
      data: {
        outcome: 'upgraded',
        request: pendingRequest({ id: 78, priority: 'HIGH' }),
        cancelled_request_id: 77,
      },
      error: null,
    });

    const { status, body } = await submitJson({ priority: 'HIGH', replace_request_id: 77 });

    expect(status).toBe(201);
    expect(body.data.upgraded).toBe(true);
    expect(body.data.cancelled_request_id).toBe(77);
    expect(body.data.message).toBe(
      'Your previous request has been cancelled, and a new request with higher priority has been submitted successfully.',
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'staff_submit_file_request',
      expect.objectContaining({ p_replace_request_id: 77, p_priority: 'HIGH' }),
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('reports an already-issued request instead of replacing it', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'already_issued', request: pendingRequest({ status: 'APPROVED' }) },
      error: null,
    });

    const { status, body } = await submitJson();

    expect(status).toBe(409);
    expect(body.conflict.kind).toBe('already_issued');
    expect(body.message).toContain('already approved and issued to you');
  });

  it('takes the requester identity from the session, never from the body', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'created', request: pendingRequest(), cancelled_request_id: null },
      error: null,
    });

    await submitJson({ requester_id: 'someone-else', id: 'other-staff' });

    expect(mockRpc).toHaveBeenCalledWith(
      'staff_submit_file_request',
      expect.objectContaining({ p_requester_id: STAFF.id }),
    );
  });

  it('rejects an invalid replacement id', async () => {
    const { status, body } = await submitJson({ replace_request_id: 0 });

    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('explains the missing migration when the RPC is unavailable', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.staff_submit_file_request',
      },
    });

    const { status, body } = await submitJson();

    expect(status).toBe(503);
    expect(body.code).toBe('CONFIG_ERROR');
    expect(body.message).toContain('0021_staff_request_priority_upgrade.sql');
  });
});

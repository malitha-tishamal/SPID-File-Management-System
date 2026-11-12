/**
 * Permanent file deletion must remove the nested staff-request rows in one
 * transaction and report a friendly error when the database still refuses.
 *
 * The database side of this contract lives in migration 0035 (one PL/pgSQL
 * function). These tests pin the API contract around it: RPC arguments,
 * dependent counts, not-found handling, 23503 mapping, admin-only access and
 * the audit id returned by the function.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('config/env', () => ({
  validateServerEnv: () => ({ valid: true, missing: [] }),
  validatePublicEnv: () => ({ valid: true, missing: [] }),
  missingEnvMessage: () => '',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SITE_URL: 'http://localhost:3000',
}));

const { mockRequireAdmin, state } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  state: {
    file: null as Record<string, unknown> | null,
    requestCount: 0,
    extensionCount: 0,
    rpcResult: null as Record<string, unknown> | null,
    rpcError: null as Record<string, unknown> | null,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  },
}));

vi.mock('services/AuthorizationService', () => ({
  AuthorizationService: {
    requireAdminProfile: (...args: unknown[]) => mockRequireAdmin(...args),
    requireApprovedProfile: vi.fn(),
  },
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    from(table: string) {
      if (table === 'files') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.ilike = () =>
          Promise.resolve({
            data: state.file ? [state.file] : [],
            error: null,
          });
        return chain;
      }
      if (
        table === 'staff_file_requests' ||
        table === 'file_request_extensions' ||
        table === 'audit_logs'
      ) {
        const makeChain = (defaultCount: number) => {
          const c: any = {
            select: () => c,
            eq: () => c,
            not: () => c,
            is: () => c,
            or: () => c,
            contains: () => c,
            then: (resolve: (val: any) => any, reject?: (err: any) => any) =>
              Promise.resolve({ data: null, error: null, count: defaultCount }).then(resolve, reject),
          };
          return c;
        };
        if (table === 'staff_file_requests') return makeChain(state.requestCount);
        if (table === 'file_request_extensions') return makeChain(state.extensionCount);
        return makeChain(0);
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
    },
  }),
  getSupabaseServerClient: vi.fn(),
}));

import { FileController } from 'controllers/FileController';
import { ApiError } from 'lib/apiResponse';

const FILE = {
  id: 7,
  file_no: 'PDI/TEST/01',
  file_name: 'Test file',
  section_name: 'Test Section',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  status: 'APPROVED',
};

async function bodyOf(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe('FileController permanent delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.file = { ...FILE };
    state.requestCount = 0;
    state.extensionCount = 0;
    state.rpcCalls = [];
    state.rpcError = null;
    state.rpcResult = {
      outcome: 'deleted',
      file_id: FILE.id,
      file_no: FILE.file_no,
      file_name: FILE.file_name,
      deleted_file_requests: 0,
      deleted_file_request_extensions: 0,
      audit_id: 501,
    };
    mockRequireAdmin.mockResolvedValue({
      id: 'admin-1',
      full_name: 'System Admin',
      email: 'admin@spid.gov.lk',
      role: 'Administrator',
    });
  });

  it('deletes the file and its linked requests in one RPC call', async () => {
    state.requestCount = 2;
    state.extensionCount = 1;
    state.rpcResult = {
      ...state.rpcResult,
      deleted_file_requests: 2,
      deleted_file_request_extensions: 1,
    };

    const res = await FileController.permanentDeleteFile(FILE.file_no);
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.deleted).toEqual({
      file_requests: 2,
      file_request_extensions: 1,
      audit_id: 501,
    });
    expect(body.data.message).toContain('2 file request(s)');
    expect(state.rpcCalls).toEqual([
      {
        name: 'delete_file_with_dependents',
        args: {
          p_file_id: FILE.id,
          p_actor_id: 'admin-1',
          p_actor_name: 'System Admin',
        },
      },
    ]);
  });

  it('deletes a file with no linked requests without extra child counts', async () => {
    const res = await FileController.permanentDeleteFile(FILE.file_no);
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(body.data.message).toBe('File permanently deleted.');
    expect(body.data.deleted).toEqual({
      file_requests: 0,
      file_request_extensions: 0,
      audit_id: 501,
    });
  });

  it('returns 404 when the function reports a missing file', async () => {
    state.rpcResult = { outcome: 'not_found' };

    await expect(
      FileController.permanentDeleteFile(FILE.file_no),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('maps Postgres 23503 to a clear 409 instead of leaking SQL', async () => {
    state.rpcError = {
      code: '23503',
      message:
        'update or delete on table "files" violates foreign key constraint "staff_file_requests_file_id_fkey" on table "staff_file_requests"',
      details: null,
    };

    const error = await FileController.permanentDeleteFile(FILE.file_no).catch(
      (err) => err,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('REQUEST_CONFLICT');
    expect(error.message).not.toMatch(/violates foreign key|staff_file_requests_file_id_fkey/i);
    expect(error.extra).toEqual({ reason: 'FOREIGN_KEY_VIOLATION' });
  });

  it('rejects a non-admin before any delete runs', async () => {
    mockRequireAdmin.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.'),
    );

    await expect(
      FileController.permanentDeleteFile(FILE.file_no),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('reports dependent counts before the modal asks for confirmation', async () => {
    state.requestCount = 4;
    state.extensionCount = 2;

    const res = await FileController.getFileDependents(FILE.file_no);
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      file_id: FILE.id,
      file_no: FILE.file_no,
      file_requests: 4,
      file_request_extensions: 2,
    });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { NotificationRepository } from 'models/NotificationRepository';
import { resolveRequestNotifications } from 'lib/notifications';

interface Recorded {
  table?: string;
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
  in: [string, unknown[]][];
}

/** Chainable PostgREST mock: every filter is recorded, select() resolves. */
function mockClient(result: { data?: unknown[] | null; count?: number | null; error?: { message: string; code?: string } | null }) {
  const recorded: Recorded = { eq: [], in: [] };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.eq = (col: string, val: unknown) => {
    recorded.eq.push([col, val]);
    return self();
  };
  chain.in = (col: string, val: unknown[]) => {
    recorded.in.push([col, val]);
    return self();
  };
  chain.is = () => self();
  chain.select = () => Promise.resolve(result);
  chain.order = () => self();
  chain.limit = () => Promise.resolve(result);

  const client = {
    from: (table: string) => {
      recorded.table = table;
      return {
        update: (payload: Record<string, unknown>) => {
          recorded.payload = payload;
          return chain;
        },
        select: (..._args: unknown[]) => chain,
      };
    },
  } as never;

  return { client, recorded };
}

describe('NotificationRepository.resolveForRequest', () => {
  it('marks every ACTIVE request notification RESOLVED and read', async () => {
    const { client, recorded } = mockClient({ data: [{ id: 1 }, { id: 2 }] });
    const repo = new NotificationRepository(client);

    const resolved = await repo.resolveForRequest({
      refType: 'staff_file_request',
      refId: 42,
      kinds: ['FILE_ADD_REQUESTED', 'FILE_ISSUE_REQUESTED'],
      resolution: 'APPROVED',
      resolvedById: 'admin-1',
      resolvedByName: 'Admin One',
    });

    expect(resolved).toBe(2);
    expect(recorded.table).toBe('notifications');
    expect(recorded.payload).toMatchObject({
      status: 'RESOLVED',
      resolution: 'APPROVED',
      resolved_by: 'admin-1',
      resolved_by_name: 'Admin One',
    });
    expect(recorded.payload?.read_at).toBeTruthy();
    expect(recorded.eq).toEqual(
      expect.arrayContaining([
        ['ref_type', 'staff_file_request'],
        ['ref_id', 42],
        ['status', 'ACTIVE'],
      ]),
    );
    expect(recorded.in[0]).toEqual([
      'kind',
      ['FILE_ADD_REQUESTED', 'FILE_ISSUE_REQUESTED'],
    ]);
  });

  it('is idempotent — only ACTIVE rows are touched', async () => {
    const { client, recorded } = mockClient({ data: [] });
    const repo = new NotificationRepository(client);

    const resolved = await repo.resolveForRequest({
      refType: 'file',
      refId: 7,
      kinds: ['FILE_ADD_REQUESTED', 'FILE_ISSUE_REQUESTED'],
      resolution: 'REJECTED',
    });

    expect(resolved).toBe(0);
    expect(recorded.eq).toContainEqual(['status', 'ACTIVE']);
  });
});

describe('resolveRequestNotifications', () => {
  it('delegates to the repository and returns the resolved count', async () => {
    const { client } = mockClient({ data: [{ id: 9 }] });
    const count = await resolveRequestNotifications(client, {
      refType: 'staff_file_request',
      refId: 5,
      resolution: 'CANCELLED',
      resolvedById: 'staff-1',
      resolvedByName: 'Staff One',
    });
    expect(count).toBe(1);
  });

  it('never throws — a storage failure resolves to 0', async () => {
    const { client } = mockClient({
      error: { message: 'connection reset', code: 'XX000' },
    });
    const count = await resolveRequestNotifications(client, {
      refType: 'file',
      refId: 1,
      resolution: 'APPROVED',
    });
    expect(count).toBe(0);
  });
});

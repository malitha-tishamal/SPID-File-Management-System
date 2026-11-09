import { describe, expect, it, vi } from 'vitest';
import { SecurityLogRepository } from 'models/SecurityLogRepository';

interface Captured {
  like?: [string, string];
  in?: [string, unknown[]];
  range?: [number, number];
}

function createClient(rows: any[], profiles: any[] = []) {
  const captured: Captured = {};

  const auditChain: any = {
    select: () => auditChain,
    like: (column: string, value: string) => {
      captured.like = [column, value];
      return auditChain;
    },
    in: (column: string, values: unknown[]) => {
      captured.in = [column, values];
      return auditChain;
    },
    is: () => auditChain,
    not: () => auditChain,
    order: () => auditChain,
    range: (from: number, to: number) => {
      captured.range = [from, to];
      return Promise.resolve({ data: rows, count: rows.length, error: null });
    },
  };

  return {
    captured,
    client: {
      from: (table: string) => {
        if (table === 'audit_logs') return auditChain;
        if (table === 'profiles') {
          return {
            select: () => ({
              in: (_column: string, ids: string[]) =>
                Promise.resolve({
                  data: profiles.filter((profile) => ids.includes(profile.id)),
                  error: null,
                }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as any,
  };
}

const rows = [
  {
    id: 2,
    actor_id: 'admin-1',
    action: 'security.malware_detected',
    details: { file_name: 'payload.xlsx', signature: 'Eicar-Test-Signature' },
    created_at: '2026-11-06T10:00:00.000Z',
  },
  {
    id: 1,
    actor_id: null,
    action: 'security.scan_failed',
    details: { file_name: 'broken.xlsx', reason: 'scanner_error' },
    created_at: '2026-11-06T09:00:00.000Z',
  },
];

describe('SecurityLogRepository', () => {
  it('reads security.* events and hydrates actor names', async () => {
    const { client, captured } = createClient(rows, [
      { id: 'admin-1', full_name: 'System Admin', email: 'admin@spid.gov.lk', role: 'Administrator' },
    ]);

    const result = await new SecurityLogRepository(client).list({ limit: 25, offset: 0 });

    expect(captured.like).toEqual(['action', 'security.%']);
    expect(captured.range).toEqual([0, 24]);
    expect(result.total).toBe(2);
    expect(result.logs[0]).toMatchObject({
      action: 'security.malware_detected',
      actor_name: 'System Admin',
      actor_role: 'Administrator',
    });
    expect(result.logs[1].actor_name).toBeNull();
  });

  it('filters malware events with an explicit action list', async () => {
    const { client, captured } = createClient(rows);

    const result = await new SecurityLogRepository(client).list({ category: 'malware' });

    expect(captured.like).toBeUndefined();
    expect(captured.in).toEqual(['action', ['security.malware_detected']]);
    expect(result.logs).toHaveLength(2);
  });

  it('clamps paging values to safe bounds', async () => {
    const { client, captured } = createClient([]);

    await new SecurityLogRepository(client).list({ limit: 5000, offset: -10 });

    expect(captured.range).toEqual([0, 99]);
  });

  it('surfaces read errors instead of returning empty data', async () => {
    const client = {
      from: () => ({
        select: () => ({
          like: () => ({
            is: () => ({
              order: () => ({
                range: () => Promise.resolve({ data: null, count: null, error: { message: 'denied' } }),
              }),
            }),
          }),
        }),
      }),
    } as any;

    await expect(new SecurityLogRepository(client).list()).rejects.toThrow(/denied/);
  });
});

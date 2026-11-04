import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationRepository } from 'models/NotificationRepository';

const state = vi.hoisted(() => ({ rows: [] as Record<string, any>[] }));

/** PostgREST only returns the columns it was asked for, so `select('*')` matters. */
function createMockClient() {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          order: () => ({
            limit: () => ({
              data: state.rows.filter((row) => row.user_id === value),
              error: null,
            }),
          }),
        }),
      }),
    }),
  } as any;
}

describe('NotificationRepository.listFor', () => {
  beforeEach(() => {
    state.rows = [];
  });

  it('gives every row its record destination, rebuilding the older generic ones', async () => {
    state.rows = [
      {
        id: 1,
        user_id: 'staff-1',
        link: '/staff/your-requests',
        dedupe_key: 'file-request:8:approved',
      },
      {
        id: 2,
        user_id: 'staff-1',
        link: '/staff/your-requests?request=11',
        dedupe_key: 'return-due:11:2026-11-02:due_soon',
      },
      {
        id: 3,
        user_id: 'staff-1',
        link: '/staff/your-requests',
        dedupe_key: null,
      },
    ];

    const repo = new NotificationRepository(createMockClient());
    const rows = await repo.listFor('staff-1');

    expect(rows.map((row) => row.link)).toEqual([
      '/staff/your-requests?request=8',
      '/staff/your-requests?request=11',
      '/staff/your-requests',
    ]);
  });

  it('only ever returns rows belonging to the requested user', async () => {
    state.rows = [
      { id: 1, user_id: 'staff-1', link: '/a', dedupe_key: null },
      { id: 2, user_id: 'staff-2', link: '/b', dedupe_key: null },
    ];

    const repo = new NotificationRepository(createMockClient());
    const rows = await repo.listFor('staff-1');

    expect(rows.map((row) => row.id)).toEqual([1]);
  });
});

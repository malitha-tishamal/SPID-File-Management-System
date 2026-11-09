/** @vitest-environment jsdom */
/**
 * The staff member's own request list, rendered without a login.
 *
 * Requirement: an admin decision on a request must reach the staff page without
 * a manual reload. These assert the subscription is scoped to the signed-in
 * staff id through the anon browser client, that a burst of events collapses
 * into one re-read of the owner-scoped API, and that the channel is released on
 * unmount.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const act = (
  React as unknown as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
  }
).act;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  profile: null as Record<string, any> | null,
}));

vi.mock('contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: auth.profile }),
}));

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const realtime = vi.hoisted(() => ({
  channels: [] as any[],
  removed: [] as any[],
}));

vi.mock('config/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    channel(name: string) {
      const ch: any = {
        name,
        configs: [] as { event: string; config: any }[],
        handlers: [] as ((payload: any) => void)[],
        statusHandler: null as ((status: string) => void) | null,
        on(event: string, config: any, handler: (payload: any) => void) {
          ch.configs.push({ event, config });
          ch.handlers.push(handler);
          return ch;
        },
        subscribe(statusHandler?: (status: string) => void) {
          ch.statusHandler = statusHandler ?? null;
          realtime.channels.push(ch);
          return ch;
        },
      };
      return ch;
    },
    removeChannel(channel: any) {
      realtime.removed.push(channel);
    },
  }),
}));

import StaffYourRequestsPage from '../src/app/staff/your-requests/page';

const calls: string[] = [];
let container: HTMLDivElement;
let root: Root;
let isMounted = false;

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  calls.length = 0;
  realtime.channels.length = 0;
  realtime.removed.length = 0;
  auth.profile = {
    id: 'staff-2',
    full_name: 'Ashen Rashmika',
    email: 'ashen@example.com',
    role: 'Staff',
    section_name: 'Land',
    account_status: 'approved',
  };

  window.history.replaceState({}, '', '/staff/your-requests');
  container = document.createElement('div');
  document.body.appendChild(container);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            requests: [],
            counts: { ongoing: 0, pending: 0, closed: 0, cancelled: 0 },
            total: 0,
            totalPages: 1,
          },
        }),
      } as Response;
    }),
  );
});

afterEach(async () => {
  if (isMounted) await act(async () => root.unmount());
  isMounted = false;
  container.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function render() {
  root = createRoot(container);
  isMounted = true;
  await act(async () => {
    root.render(React.createElement(StaffYourRequestsPage));
  });
  await flush();
}

describe('Realtime on the staff request list', () => {
  it('subscribes only for the signed-in staff member, through the anon client', async () => {
    await render();

    expect(realtime.channels).toHaveLength(1);
    const config = realtime.channels[0].configs[0];
    expect(config.event).toBe('postgres_changes');
    expect(config.config).toEqual({
      event: '*',
      schema: 'public',
      table: 'staff_file_requests',
      filter: 'requester_id=eq.staff-2',
    });
  });

  it('waits for the profile instead of subscribing to an unscoped table', async () => {
    auth.profile = null;
    await render();
    expect(realtime.channels).toHaveLength(0);
  });

  it('re-reads the owner-scoped API once per burst of events', async () => {
    await render();
    const handler = realtime.channels[0].handlers[0];
    const before = calls.length;

    await act(async () => {
      handler({ eventType: 'UPDATE', new: { id: 5, status: 'APPROVED' } });
      handler({ eventType: 'UPDATE', new: { id: 6, status: 'REJECTED' } });
      handler({ eventType: 'DELETE', old: { id: 7 } });
    });
    await flush(1300);

    expect(calls.length - before).toBe(1);
    expect(calls[calls.length - 1]).toContain('/api/staff/file-requests?');
  });

  it('catches up on reconnect but not on the first handshake', async () => {
    await render();
    const ch = realtime.channels[0];
    const afterMount = calls.length;

    // The mount fetch already covered the initial handshake.
    await act(async () => ch.statusHandler?.('SUBSCRIBED'));
    await flush();
    expect(calls.length).toBe(afterMount);

    // Anything that changed while the socket was down must be re-read.
    await act(async () => ch.statusHandler?.('CHANNEL_ERROR'));
    await act(async () => ch.statusHandler?.('SUBSCRIBED'));
    await flush();
    expect(calls.length).toBeGreaterThan(afterMount);
  });

  it('releases the channel when the page unmounts', async () => {
    await render();
    const ch = realtime.channels[0];

    await act(async () => root.unmount());
    isMounted = false;
    expect(realtime.removed).toEqual([ch]);
  });
});

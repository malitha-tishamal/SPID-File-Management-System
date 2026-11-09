/** @vitest-environment jsdom */
/**
 * The administrator's queue, rendered without a login.
 *
 * Three behaviours matter for availability: a file that is still issued can
 * never be approved (the server says so and the page shows the red notice),
 * a competing group stays readable with priority shading, and the queue keeps
 * itself current over Realtime using the anon browser client only.
 *
 * These run against the real page component with the network and the Supabase
 * browser client replaced, which is as close to the browser as this environment
 * allows — no admin session exists for a live check.
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

const toasts = vi.hoisted(() => [] as { type?: string; title?: string; message?: string }[]);

/** Stable identity, exactly like the real provider's memoized callback. */
const showToast = vi.hoisted(() => (toast: { type?: string; title?: string; message?: string }) => {
  toasts.push(toast);
});

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

/** Every channel the page creates, so tests can push events into it. */
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

import StaffFileRequestPage from '../src/app/admin/staff-file-request/page';

type Row = Record<string, any>;

function pendingRequest(overrides: Row = {}): Row {
  return {
    id: 21,
    file_id: 2,
    file_no: 'SPID/AD/2026/CLEARANCE-REGISTER',
    file_name: 'Land Clearance Register',
    section_name: 'Land',
    storage_location: 'Record Room A — Bay 3',
    requester_id: 'staff-2',
    requester_name: 'Ashen Rashmika',
    requester_email: 'ashen@example.com',
    requester_section: 'Land',
    request_date: '2026-11-20',
    duration_days: 7,
    priority: 'NORMAL',
    status: 'PENDING',
    admin_notes: null,
    created_at: '2026-11-18T09:00:00+05:30',
    ...overrides,
  };
}

const ISSUANCE = {
  request_id: 11,
  file_no: 'SPID/AD/2026/CLEARANCE-REGISTER',
  file_name: 'Land Clearance Register',
  holder_id: 'staff-1',
  holder_name: 'Kaweesha Kiwi',
  issued_at: '2026-11-08T09:00:00+05:30',
  expected_return_date: '2026-11-18',
};

/** The in-memory stand-in for the admin API. */
const server: {
  requests: Row[];
  patches: { id: number; body: any }[];
  listRequests: number;
  approveReply: { status: number; json: Row };
} = {
  requests: [],
  patches: [],
  listRequests: 0,
  approveReply: { status: 200, json: { ok: true, data: { request: {}, message: 'ok' } } },
};

let container: HTMLDivElement;
let root: Root;
let isMounted = false;

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  toasts.length = 0;
  realtime.channels.length = 0;
  realtime.removed.length = 0;
  server.requests = [pendingRequest()];
  server.patches = [];
  server.listRequests = 0;
  server.approveReply = {
    status: 200,
    json: { ok: true, data: { request: {}, message: 'File request approved.' } },
  };

  container = document.createElement('div');
  document.body.appendChild(container);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || 'GET').toUpperCase();

      const patch = url.match(/\/api\/admin\/file-requests\/(\d+)$/);
      if (method === 'PATCH' && patch) {
        const id = Number(patch[1]);
        server.patches.push({ id, body: JSON.parse(String(init?.body)) });
        // A blocked approval leaves the row pending, so the queue still shows it.
        if (server.approveReply.status !== 200) {
          return {
            ok: false,
            status: server.approveReply.status,
            json: async () => server.approveReply.json,
          } as Response;
        }
        server.requests = server.requests.map((row) =>
          row.id === id ? { ...row, status: 'APPROVED' } : row,
        );
        return {
          ok: true,
          status: 200,
          json: async () => server.approveReply.json,
        } as Response;
      }

      if (url.includes('/api/admin/file-request-extensions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { extensions: [] } }),
        } as Response;
      }

      if (url.includes('/api/admin/file-requests')) {
        server.listRequests += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: { requests: server.requests, counts: { pending: server.requests.length } },
          }),
        } as Response;
      }

      throw new Error(`unstubbed request: ${method} ${url}`);
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
    root.render(React.createElement(StaffFileRequestPage));
  });
  await flush();
}

function rowClasses(): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    (tr) => tr.getAttribute('class') ?? '',
  );
}

function dialogText(): string {
  const dialog = document.querySelector('[role="alertdialog"][aria-modal="true"]');
  return dialog ? (dialog.textContent ?? '') : '';
}

function clickButton(label: string, scope: ParentNode = container) {
  const button = Array.from(scope.querySelectorAll('button')).find((el) =>
    (el.textContent ?? '').trim().startsWith(label),
  );
  if (!button) throw new Error(`no button starting with "${label}"`);
  return act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Let the click's fetch settle inside the act scope, the way it does in a browser.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Priority shading inside a competing group', () => {
  beforeEach(() => {
    server.requests = [
      pendingRequest({ id: 31, priority: 'LOW', created_at: '2026-11-18T07:00:00+05:30' }),
      pendingRequest({ id: 32, priority: 'NORMAL', created_at: '2026-11-18T08:00:00+05:30' }),
      pendingRequest({ id: 33, priority: 'HIGH', created_at: '2026-11-18T09:00:00+05:30' }),
    ];
  });

  it('tints the highest priority red and steps down through orange without hiding a row', async () => {
    await render();
    const classes = rowClasses();
    expect(classes).toHaveLength(3);

    const byId = (id: number) =>
      classes[Array.from(container.querySelectorAll('tbody tr')).findIndex((tr) =>
        (tr.textContent ?? '').includes(`#${id}`),
      )] ?? '';

    // HIGH wins the group, NORMAL is second, LOW third — progressively subtler.
    expect(byId(33)).toContain('border-l-4 border-red-500');
    expect(byId(33)).toContain('bg-red-50');
    expect(byId(32)).toContain('border-l-4 border-orange-300');
    expect(byId(32)).toContain('bg-orange-50');
    expect(byId(31)).toContain('border-l-4 border-amber-200');
    expect(byId(31)).toContain('bg-amber-50');

    // Requirement: every row stays readable — no faded-out competitors.
    expect(classes.join(' ')).not.toContain('opacity');
    expect(byId(33)).not.toContain('opacity');
  });

  it('leaves a lone request unshaded', async () => {
    server.requests = [pendingRequest()];
    await render();
    expect(rowClasses()[0]).not.toContain('border-l-rose-600');
    expect(rowClasses()[0]).not.toContain('border-l-orange');
  });
});

describe('Approval is blocked while the file is issued', () => {
  it('shows the server-side refusal as a red notice and keeps the request pending', async () => {
    server.approveReply = {
      status: 409,
      json: {
        ok: false,
        code: 'REQUEST_CONFLICT',
        message:
          'This file is currently issued to another staff member and cannot be approved until it is returned.',
        reason: 'file_currently_issued',
        issuance: ISSUANCE,
      },
    };
    await render();

    await clickButton('Approve');
    // Single request: the confirmation dialog comes first.
    expect(document.body.textContent ?? '').toContain('Accept File Request');
    await clickButton('Confirm Acceptance', document.body);
    await flush();

    const notice = dialogText();
    expect(notice).toContain('File Currently Issued');
    expect(notice).toContain('SPID/AD/2026/CLEARANCE-REGISTER');
    expect(notice).toContain('Kaweesha Kiwi');
    expect(notice).toContain('Expected Return Date');
    expect(notice).toContain('18 Nov 2026');
    expect(notice).toContain('returned and its availability has been confirmed');

    // Nothing was written: only the approval attempt, no rejection of the row.
    expect(server.patches.map((p) => [p.id, p.body.status])).toEqual([[21, 'APPROVED']]);
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent ?? '').toContain('Ashen Rashmika');
  });

  it('says so when the issuance has no expected return date', async () => {
    server.approveReply = {
      status: 409,
      json: {
        ok: false,
        message: 'issued',
        reason: 'file_currently_issued',
        issuance: { ...ISSUANCE, expected_return_date: null },
      },
    };
    await render();
    await clickButton('Approve');
    await clickButton('Confirm Acceptance', document.body);
    await flush();

    expect(dialogText()).toContain('Expected return date has not been specified.');
  });

  it('closes on the Close button', async () => {
    server.approveReply = {
      status: 409,
      json: { ok: false, message: 'issued', reason: 'file_currently_issued', issuance: ISSUANCE },
    };
    await render();
    await clickButton('Approve');
    await clickButton('Confirm Acceptance', document.body);
    await flush();
    expect(dialogText()).toContain('File Currently Issued');

    await clickButton('Close', document.body);
    await flush();
    expect(document.querySelector('[role="alertdialog"][aria-modal="true"]')).toBeNull();
  });
});

describe('Competing allocation notice', () => {
  beforeEach(() => {
    server.requests = [
      pendingRequest({ id: 41, priority: 'HIGH', created_at: '2026-11-18T08:00:00+05:30' }),
      pendingRequest({
        id: 42,
        requester_id: 'staff-3',
        requester_name: 'Nethma Officer',
        priority: 'NORMAL',
        created_at: '2026-11-18T09:30:00+05:30',
      }),
    ];
  });

  it('offers one approve action only', async () => {
    await render();
    await clickButton('Approve');

    const dialog = Array.from(
      document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
    ).find((el) => (el.textContent ?? '').includes('Competing Request Allocation Notice'));
    expect(dialog).toBeDefined();

    const labels = Array.from(dialog!.querySelectorAll('button')).map((el) =>
      (el.textContent ?? '').trim(),
    );
    expect(labels).toEqual(['Cancel', 'Approve & Auto-Reject Competing']);
    expect(dialog!.textContent ?? '').not.toContain('Approve This Only');
  });

  it('does not reject the competitor when the file is still issued', async () => {
    server.approveReply = {
      status: 409,
      json: { ok: false, message: 'issued', reason: 'file_currently_issued', issuance: ISSUANCE },
    };
    await render();
    // The HIGH row is first in the fixture, so its Approve button comes first.
    await clickButton('Approve');
    await clickButton('Approve & Auto-Reject Competing', document.body);
    await flush();

    // Availability outranks allocation: nothing is rejected, both stay pending.
    expect(server.patches).toEqual([{ id: 41, body: { status: 'APPROVED', admin_notes: undefined } }]);
    expect(Array.from(container.querySelectorAll('tbody tr'))).toHaveLength(2);
    expect(dialogText()).toContain('File Currently Issued');
  });

  it('allocates the file by rejecting competitors once approval succeeds', async () => {
    await render();
    await clickButton('Approve');
    await clickButton('Approve & Auto-Reject Competing', document.body);
    await flush(30);

    expect(server.patches.map((p) => p.id)).toEqual([41, 42]);
    expect(server.patches[1].body.status).toBe('REJECTED');
    expect(server.patches[1].body.admin_notes).toContain('Physical file allocated');
  });
});

describe('Realtime queue updates', () => {
  it('subscribes with the anon browser client for both request tables', async () => {
    await render();

    expect(realtime.channels).toHaveLength(1);
    const ch = realtime.channels[0];
    expect(ch.configs.map((c: any) => c.config.table)).toEqual([
      'staff_file_requests',
      'file_request_extensions',
    ]);
    expect(ch.configs.every((c: any) => c.event === 'postgres_changes' && c.config.schema === 'public' && c.config.event === '*')).toBe(
      true,
    );
  });

  it('removes its channel when the page unmounts', async () => {
    await render();
    const ch = realtime.channels[0];

    await act(async () => root.unmount());
    isMounted = false;
    expect(realtime.removed).toEqual([ch]);
  });

  it('announces a new request once, then again only for a different request', async () => {
    await render();
    const handler = realtime.channels[0].handlers[0];
    const before = server.listRequests;

    await act(async () => {
      handler({
        eventType: 'INSERT',
        new: {
          id: 99,
          file_no: 'AUD-2026-07',
          requester_name: 'Sunil Perera',
          priority: 'HIGH',
          status: 'PENDING',
        },
      });
    });
    expect(toasts.map((t) => t.title)).toEqual(['New file request']);
    expect(toasts[0].message).toContain('Sunil Perera');
    expect(toasts[0].message).toContain('AUD-2026-07');

    // Replayed event for the same request (a reconnect) must stay silent.
    await act(async () => {
      handler({
        eventType: 'INSERT',
        new: { id: 99, file_no: 'AUD-2026-07', requester_name: 'Sunil Perera', status: 'PENDING' },
      });
    });
    expect(toasts).toHaveLength(1);

    // The debounced reload fires once per burst and pulls fresh rows.
    await flush(1200);
    expect(server.listRequests).toBeGreaterThan(before);
  });

  it('refreshes on another admin decision without a toast, and refetches on reconnect', async () => {
    await render();
    const ch = realtime.channels[0];
    const before = server.listRequests;

    await act(async () => {
      ch.handlers[0]({ eventType: 'UPDATE', new: { id: 21, status: 'APPROVED' } });
    });
    expect(toasts).toHaveLength(0);
    await flush(1200);
    expect(server.listRequests).toBeGreaterThan(before);

    // The socket handshake itself does not reload — the mount fetch already did.
    const beforeHandshake = server.listRequests;
    await act(async () => ch.statusHandler?.('SUBSCRIBED'));
    await flush();
    expect(server.listRequests).toBe(beforeHandshake);

    // Reconnect after a drop: whatever changed while offline must be re-read.
    const afterReconnect = server.listRequests;
    await act(async () => ch.statusHandler?.('CHANNEL_ERROR'));
    await act(async () => ch.statusHandler?.('SUBSCRIBED'));
    await flush();
    expect(server.listRequests).toBeGreaterThan(afterReconnect);
  });
});

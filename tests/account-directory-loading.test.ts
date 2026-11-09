// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

const realtime = vi.hoisted(() => {
  const handlers: Array<{ table?: string; cb: () => void }> = [];
  const channel: any = {
    on: (_event: string, filter: { table?: string }, cb: () => void) => {
      handlers.push({ table: filter?.table, cb });
      return channel;
    },
    subscribe: (cb?: (status: string) => void) => {
      cb?.('SUBSCRIBED');
      return {};
    },
  };
  return {
    channel,
    emit(table: string) {
      for (const handler of handlers) {
        if (handler.table === table) handler.cb();
      }
    },
    reset() {
      handlers.length = 0;
    },
  };
});

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: { id: 'admin-1', role: 'Administrator', full_name: 'Root Admin' },
  }),
}));

vi.mock('config/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ channel: () => realtime.channel, removeChannel: () => {} }),
}));

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections: () => Promise.resolve([]),
}));

import AccountDirectoryPage, {
  invalidateAccountDirectoryCache,
} from '../src/components/admin/AccountDirectoryPage';

const ACCOUNTS = [
  {
    id: 'admin-2',
    full_name: 'Alice Admin',
    email: 'alice@spid.gov.lk',
    role: 'Administrator',
    requested_role: null,
    section_id: 1,
    section_name: 'Colombo',
    nic: '900000001V',
    mobile_phone: '0770000001',
    account_status: 'approved',
    approved_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
    avatar_url: null,
    last_login_at: '2026-10-01T04:00:00.000Z',
    failed_attempts: 0,
    locked_until: null,
  },
  {
    id: 'staff-1',
    full_name: 'Bob Staff',
    email: 'bob@spid.gov.lk',
    role: 'Staff',
    requested_role: null,
    section_id: 1,
    section_name: 'Galle',
    nic: '900000002V',
    mobile_phone: '0770000002',
    account_status: 'approved',
    approved_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
    avatar_url: null,
    last_login_at: null,
    failed_attempts: 0,
    locked_until: null,
  },
];

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe('Account directory loading states', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showToast.mockReset();
    realtime.reset();
    invalidateAccountDirectoryCache();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops waiting after 30 seconds and offers a retry', async () => {
    vi.useFakeTimers();
    fetchMock = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(AccountDirectoryPage, { variant: 'admin' }));

    expect(screen.getByText(/Loading the administrator management directory/i)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/did not respond within 30 seconds/i)).toBeTruthy();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Loading Timed Out' })
    );

    // Background polling must not have fired while the first load was pending.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders the directory with labelled controls and announces completion', async () => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { users: ACCOUNTS } }));
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(AccountDirectoryPage, { variant: 'staff' }));

    await waitFor(() => expect(screen.getByText('Bob Staff')).toBeTruthy());

    expect(screen.queryByText(/LOADING REGISTRY/)).toBeNull();
    expect(screen.getByLabelText('Search staff accounts')).toBeTruthy();
    expect(screen.getByLabelText('Filter by department')).toBeTruthy();
    expect(screen.getByLabelText('Filter by account status')).toBeTruthy();
    expect(screen.getByRole('table', { name: /Staff & User Accounts/i })).toBeTruthy();
    expect(screen.getByText(/Directory loaded with 1 account/i)).toBeTruthy();

    const refresh = screen.getByRole('button', { name: 'Refresh directory' });
    expect(refresh.getAttribute('aria-busy')).toBe('false');
  });

  it('reuses the in-memory directory instead of refetching on remount', async () => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { users: ACCOUNTS } }));
    vi.stubGlobal('fetch', fetchMock);

    const first = render(React.createElement(AccountDirectoryPage, { variant: 'admin' }));
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeTruthy());
    first.unmount();

    render(React.createElement(AccountDirectoryPage, { variant: 'admin' }));
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of realtime changes into one refresh request', async () => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { users: ACCOUNTS } }));
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(AccountDirectoryPage, { variant: 'admin' }));
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      realtime.emit('profiles');
      realtime.emit('profiles');
      realtime.emit('sections');
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

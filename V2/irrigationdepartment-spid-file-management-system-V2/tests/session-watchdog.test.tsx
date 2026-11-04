// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionWatchdog from 'components/auth/SessionWatchdog';
import {
  AUTH_EVENT_KEY,
  INACTIVITY_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
} from 'lib/sessionPolicy';

const T0 = new Date('2026-11-02T10:00:00.000Z').getTime();
const EXPIRED_COPY = /Your session has expired due to 2 hours of inactivity/i;

let meStatus = 200;

function mockResponse(status: number, body: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    clone() {
      return this;
    },
  } as unknown as Response;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.includes('/api/auth/me')) {
    return meStatus === 200
      ? mockResponse(200, { ok: true, data: { profile: { account_status: 'approved' } } })
      : mockResponse(401, { ok: false, code: 'UNAUTHORIZED' });
  }
  return mockResponse(200, { ok: true });
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SessionWatchdog inactivity policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    localStorage.clear();
    meStatus = 200;
    fetchMock.mockClear();
    window.fetch = fetchMock as typeof window.fetch;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('logs out immediately when the restored activity anchor is already older than 2 hours', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0 - INACTIVITY_TIMEOUT_MS - 60_000));

    render(<SessionWatchdog />);

    expect(screen.getByText(EXPIRED_COPY)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('keeps an active user signed in and only expires 2 hours after the last real interaction', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0));
    render(<SessionWatchdog />);

    await advance(60 * 60 * 1000); // one hour of background heartbeats
    expect(screen.queryByText(EXPIRED_COPY)).toBeNull();

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });

    await advance(INACTIVITY_TIMEOUT_MS - 60_000); // 1h59m after the interaction
    expect(screen.queryByText(EXPIRED_COPY)).toBeNull();

    await advance(2 * 60 * 1000); // crosses the 2h idle boundary
    expect(screen.getByText(EXPIRED_COPY)).toBeTruthy();
  });

  it('does not treat focus or visibility changes as activity', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0));
    render(<SessionWatchdog />);

    await advance(INACTIVITY_TIMEOUT_MS - 60_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(screen.queryByText(EXPIRED_COPY)).toBeNull();

    await advance(2 * 60 * 1000);
    expect(screen.getByText(EXPIRED_COPY)).toBeTruthy();
  });

  it('tolerates one transient 401 but signs out after two consecutive auth failures', async () => {
    meStatus = 401;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0));
    render(<SessionWatchdog />);

    await advance(61_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(EXPIRED_COPY)).toBeNull();

    await advance(61_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(EXPIRED_COPY)).toBeTruthy();
  });

  it('extends the deadline when another tab records genuine activity', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0));
    render(<SessionWatchdog />);

    await advance(INACTIVITY_TIMEOUT_MS - 60_000);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LAST_ACTIVITY_KEY,
          newValue: String(Date.now()),
        })
      );
      await Promise.resolve();
    });

    await advance(INACTIVITY_TIMEOUT_MS - 60_000);
    expect(screen.queryByText(EXPIRED_COPY)).toBeNull();

    await advance(2 * 60 * 1000);
    expect(screen.getByText(EXPIRED_COPY)).toBeTruthy();
  });

  it('drops the local activity anchor when another tab broadcasts a logout', async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(T0));
    localStorage.setItem('spid_user', '{"id":"u1"}');
    render(<SessionWatchdog />);

    await advance(60_000);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_EVENT_KEY,
          newValue: JSON.stringify({ type: 'LOGOUT', ts: Date.now() }),
        })
      );
      await Promise.resolve();
    });

    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull();
  });
});

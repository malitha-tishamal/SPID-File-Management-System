// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

const { showToast, broadcastAdminSync, invalidateClientSectionsCache } = vi.hoisted(() => ({
  showToast: vi.fn(),
  broadcastAdminSync: vi.fn(),
  invalidateClientSectionsCache: vi.fn(),
}));

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('config/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  }),
}));

vi.mock('components/admin/AccountDirectoryPage', () => ({
  broadcastAdminSync,
}));

vi.mock('lib/sectionsClient', () => ({
  invalidateClientSectionsCache,
}));

import SectionManagementPage from '../src/app/admin/section-management/page';

const SECTIONS = [
  {
    id: 1,
    name: 'Hydrology Division',
    status: 'approved' as const,
    section_lead: 'K. Perera',
    created_at: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Finance Division',
    status: 'pending' as const,
    section_lead: null,
    created_at: '2026-01-16T00:00:00.000Z',
  },
];

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('Section Management loading states', () => {
  let releaseInitialLoad: () => void;
  let initialLoadGate: Promise<void>;
  let releaseRefreshLoad: () => void;
  let refreshLoadGate: Promise<void>;

  beforeEach(() => {
    showToast.mockReset();
    broadcastAdminSync.mockReset();
    invalidateClientSectionsCache.mockReset();

    initialLoadGate = new Promise<void>((resolve) => {
      releaseInitialLoad = resolve;
    });
    refreshLoadGate = new Promise<void>((resolve) => {
      releaseRefreshLoad = resolve;
    });

    let getCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        getCount += 1;
        if (getCount === 1) await initialLoadGate;
        if (getCount === 2) await refreshLoadGate;
        return jsonResponse({ ok: true, data: { sections: SECTIONS } });
      }
      return jsonResponse({ ok: true, data: { section: SECTIONS[0] } });
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows shimmer skeletons and aria-busy states while sections load and refresh', async () => {
    render(React.createElement(SectionManagementPage));

    const table = screen.getByRole('table', { name: 'Sections' });
    const tableRegion = table.parentElement as HTMLElement;

    expect(tableRegion.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading sections…')).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton]').length).toBeGreaterThanOrEqual(10);
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(5);

    await act(async () => {
      releaseInitialLoad();
      await initialLoadGate;
    });

    await screen.findByText('Hydrology Division');
    await waitFor(() => {
      expect(tableRegion.getAttribute('aria-busy')).not.toBe('true');
    });
    expect(document.querySelectorAll('[data-skeleton]').length).toBe(0);
    expect(screen.queryByText('Loading sections…')).toBeNull();

    const refreshButton = screen.getByLabelText('Refresh sections');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(refreshButton.getAttribute('aria-busy')).toBe('true');
    });
    expect(refreshButton.querySelector('.animate-spin')).toBeTruthy();

    await act(async () => {
      releaseRefreshLoad();
      await refreshLoadGate;
    });

    await waitFor(() => {
      expect(refreshButton.getAttribute('aria-busy')).not.toBe('true');
    });
    expect(refreshButton.querySelector('.animate-spin')).toBeNull();
  });
});

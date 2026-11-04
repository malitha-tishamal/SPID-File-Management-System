// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections: async () => [],
}));

vi.mock('config/supabase/client', () => ({
  getSupabaseBrowserClient: () => {
    const channel: any = {
      on: () => channel,
      subscribe: () => channel,
    };
    return { channel: () => channel, removeChannel: () => {} };
  },
}));

import AdminDashboardView from '../src/components/admin/dashboard/AdminDashboardView';

const FILE = {
  id: 1,
  file_no: 'FL-001',
  file_name: 'Irrigation Contract',
  section_name: 'Land & Hydrology',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  locker_no: 'Rack A-04',
  shelf_name: 'Shelf 2',
  shelf_position: 'Front',
  page_numbers: 12,
  status: 'APPROVED',
  registrar_name: 'Admin',
  registrar_role: 'Administrator',
  created_at: '2026-10-20T04:30:00.000Z',
  updated_at: '2026-10-20T04:30:00.000Z',
};

function jsonResponse(payload: unknown) {
  return { ok: true, json: async () => payload } as Response;
}

describe('Admin dashboard — location modal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('metaOnly=true')) {
          return jsonResponse({
            ok: true,
            data: {
              counts: { totalArchives: 1, todayCount: 1, allFilesCount: 1, pendingCount: 0 },
              totalPageNumbers: 12,
            },
          });
        }
        return jsonResponse({ ok: true, data: { files: [FILE], total: 1, totalPages: 1 } });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens the storage location dialog when the location is clicked', async () => {
    render(<AdminDashboardView />);

    await screen.findByText('FL-001');

    const locationButton = screen.getByRole('button', {
      name: /View detailed storage location for FL-001/i,
    });
    fireEvent.click(locationButton);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Storage location')).toBeTruthy();
    expect(screen.getByText('Shelf 2')).toBeTruthy();

    // The dialog must escape the animated table: a retained CSS transform on an
    // ancestor would turn it into the containing block for this fixed overlay
    // and misplace it while the body stays scroll-locked.
    expect(dialog.closest('table')).toBeNull();
    expect(dialog.closest('.animate-fadeIn')).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);

    // Scroll lock is applied while open and released after closing.
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: /Close dialog/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

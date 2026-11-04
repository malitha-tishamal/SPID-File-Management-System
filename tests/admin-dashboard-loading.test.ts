// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from '@testing-library/react';

const { showToast, fetchClientSections } = vi.hoisted(() => ({
  showToast: vi.fn(),
  fetchClientSections: vi.fn(),
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

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections,
}));

import AdminDashboardView from '../src/components/admin/dashboard/AdminDashboardView';

const FILE = {
  id: 1,
  file_no: 'FIL-001',
  file_name: 'Hydrology Survey Report',
  section_name: 'Hydrology Division',
  locker_no: 'L-3',
  shelf_name: 'S-2',
  shelf_position: 'A1',
  archive_repository: null,
  registrar_name: 'Kasun Perera',
  registrar_role: 'Staff',
  status: 'APPROVED',
  created_at: '2026-10-20T04:30:00.000Z',
  approved_by_name: 'System',
  approved_at: '2026-10-20T05:00:00.000Z',
  approved_by: 'system',
  reject_reason: null,
  rejected_at: null,
  rejected_by_name: null,
};

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}

function isMetaRequest(url: string) {
  return url.includes('metaOnly=true');
}

describe('Admin dashboard circular loading states', () => {
  beforeEach(() => {
    showToast.mockReset();
    fetchClientSections.mockReset();
    fetchClientSections.mockResolvedValue([
      { id: 1, name: 'Hydrology Division' },
      { id: 2, name: 'Engineering Registry' },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows brand spinners for overview and recent files, then swaps to real data', async () => {
    let releaseList!: () => void;
    let releaseMeta!: () => void;
    const listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    const metaGate = new Promise<void>((resolve) => {
      releaseMeta = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (isMetaRequest(url)) {
        await metaGate;
        return jsonResponse({
          ok: true,
          data: {
            counts: { allFilesCount: 1280, todayCount: 4 },
            totalPageNumbers: 15340,
          },
        });
      }
      await listGate;
      return jsonResponse({ ok: true, data: { files: [FILE] } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(AdminDashboardView));

    // Both sections start in their independent loading states.
    const overviewStatus = screen.getByText('Loading record room overview...')
      .parentElement as HTMLElement;
    expect(overviewStatus.getAttribute('role')).toBe('status');
    expect(overviewStatus.parentElement?.getAttribute('aria-busy')).toBe('true');
    expect(
      overviewStatus.querySelector('span')?.className,
    ).toContain('border-t-[#4F20FF]');
    expect(
      overviewStatus.querySelector('span')?.className,
    ).toContain('border-[#EDE9FF]');

    const filesStatus = screen.getByText('Loading recent files...')
      .parentElement as HTMLElement;
    expect(filesStatus.getAttribute('role')).toBe('status');

    const tableRegion = screen
      .getByText('FILE NUMBER')
      .closest('table')?.parentElement as HTMLElement;
    expect(tableRegion.getAttribute('aria-busy')).toBe('true');

    // No placeholder stats while loading.
    expect(screen.queryByText('Total Active Files')).toBeNull();
    expect(screen.queryByText('1,280')).toBeNull();
    expect(screen.queryByText('FIL-001')).toBeNull();
    expect(screen.queryByText('15,340')).toBeNull();

    await act(async () => {
      releaseMeta();
      await metaGate;
    });

    // Overview resolves independently of the still-loading file list.
    await waitFor(() => {
      expect(screen.getByText('1,280')).toBeTruthy();
      expect(screen.getByText('15,340')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('+4 today')).toBeTruthy();
    });
    expect(screen.queryByText('Loading record room overview...')).toBeNull();
    expect(screen.getByText('Loading recent files...')).toBeTruthy();

    await act(async () => {
      releaseList();
      await listGate;
    });

    await waitFor(() => {
      expect(screen.getByText('FIL-001')).toBeTruthy();
      expect(screen.getByText('Hydrology Survey Report')).toBeTruthy();
    });
    expect(screen.queryByText('Loading recent files...')).toBeNull();
    expect(tableRegion.getAttribute('aria-busy')).toBeNull();
  });

  it('shows error states with retry, and retry shows the spinners again', async () => {
    let attempt = 0;
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      attempt += 1;
      if (attempt <= 2) {
        return jsonResponse({ ok: false, error: { message: 'Server error' } }, false);
      }
      if (isMetaRequest(url)) {
        return jsonResponse({
          ok: true,
          data: {
            counts: { allFilesCount: 7, todayCount: 1 },
            totalPageNumbers: 99,
          },
        });
      }
      await retryGate;
      return jsonResponse({ ok: true, data: { files: [FILE] } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(AdminDashboardView));

    await waitFor(() => {
      expect(screen.getByText('Dashboard data unavailable')).toBeTruthy();
      expect(screen.getByText('Record room overview unavailable')).toBeTruthy();
    });
    expect(screen.queryByText('Loading record room overview...')).toBeNull();

    const retryButtons = screen.getAllByRole('button', { name: 'Retry' });
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Loading record room overview...')).toBeTruthy();
      expect(screen.getByText('Loading recent files...')).toBeTruthy();
    });

    await act(async () => {
      releaseRetry();
      await retryGate;
    });

    await waitFor(() => {
      expect(screen.getByText('7')).toBeTruthy();
      expect(screen.getByText('FIL-001')).toBeTruthy();
    });
    expect(screen.queryByText('Dashboard data unavailable')).toBeNull();
    expect(screen.queryByText('Record room overview unavailable')).toBeNull();
  });
});

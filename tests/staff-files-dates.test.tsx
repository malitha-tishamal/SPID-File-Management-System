// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'test-user', full_name: 'Test Staff', role: 'Staff' } }),
}));

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections: async () => [],
}));

vi.mock('components/admin/files/ViewFileModal', () => ({
  default: () => null,
}));

import StaffFilesPage from '../src/app/staff/files/page';

const FILE = {
  id: 1,
  file_no: 'FL-2026-0001',
  file_name: 'Irrigation Contract',
  section_name: 'Land & Hydrology',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  locker_no: 'Rack A-04',
  shelf_name: 'Shelf 2',
  shelf_position: 'Front',
  page_numbers: 12,
  status: 'APPROVED',
  created_at: '2026-10-20T04:30:00.000Z',
  updated_at: '2026-10-20T04:30:00.000Z',
};

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as Response;
}

describe('Staff View & Search Files — file period column', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ok: true,
          data: { files: [FILE], total: 1, totalPages: 1 },
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the start and end date of each file', async () => {
    render(<StaffFilesPage />);

    await screen.findByText('FL-2026-0001');

    expect(screen.getByRole('columnheader', { name: 'START / END DATE' })).toBeTruthy();
    expect(screen.getByText('01 Jan 2026')).toBeTruthy();
    expect(screen.getByText('to 31 Dec 2026')).toBeTruthy();
  });

  it('renders the new column between section and file location', async () => {
    render(<StaffFilesPage />);

    await screen.findByText('FL-2026-0001');

    const headers = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim());

    expect(headers).toEqual([
      'NO',
      'FILE NUMBER',
      'FILE NAME',
      'SECTION',
      'START / END DATE',
      'FILE LOCATION',
      'LAST UPDATED',
      'ACTION',
    ]);
  });
});

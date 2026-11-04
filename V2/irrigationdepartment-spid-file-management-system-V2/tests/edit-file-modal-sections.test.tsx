// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const { mockFetchClientSections } = vi.hoisted(() => ({
  mockFetchClientSections: vi.fn(),
}));

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections: (...args: unknown[]) => mockFetchClientSections(...args),
}));

import EditFileModal from '../src/components/admin/files/EditFileModal';
import type { FileRecordRow } from '../src/models/FileRepository';

const FILE = {
  id: 1,
  file_no: 'FL-2026-0001',
  file_name: 'Legacy File',
  section_name: 'Agree',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  locker_no: null,
  shelf_name: null,
  shelf_position: 'Front',
  page_numbers: 0,
  minute_sheets_count: 0,
} as unknown as FileRecordRow;

describe('EditFileModal section options', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockFetchClientSections.mockResolvedValue([
      { id: 1, name: 'Accounting', status: 'approved' },
      { id: 2, name: 'Agree', status: 'disabled' },
    ]);
  });

  it('requests active sections plus the current one, and labels it as disabled', async () => {
    render(
      <EditFileModal file={FILE} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(await screen.findByText('Agree (Disabled)')).toBeTruthy();
    expect(screen.getByText('Accounting')).toBeTruthy();
    expect(mockFetchClientSections).toHaveBeenCalledWith(false, {
      activeOnly: true,
      include: 'Agree',
    });
  });
});

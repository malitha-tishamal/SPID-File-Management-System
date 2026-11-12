/**
 * Soft-delete confirmation modal tests:
 * Shows preserved record counts ("THESE RECORDS ARE KEPT"),
 * blocks delete when active checkouts > 0, and allows soft delete.
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ConfirmDeleteModal from '../src/components/admin/files/ConfirmDeleteModal';
import type { FileRecordRow } from '../src/models/FileRepository';

const FILE = {
  id: 7,
  file_no: 'PDI/TEST/01',
  file_name: 'Test file',
  section_name: 'Test Section',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
} as unknown as FileRecordRow;

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ConfirmDeleteModal>> = {},
) {
  return render(
    <ConfirmDeleteModal
      file={FILE}
      dependents={{
        fileRequests: 0,
        fileRequestExtensions: 0,
        activeCheckouts: 0,
        returnedCheckouts: 0,
        auditLogs: 0,
      }}
      reason=""
      onReasonChange={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ConfirmDeleteModal soft-delete confirmation', () => {
  beforeEach(() => cleanup());

  it('shows preserved record counts and allows soft delete', async () => {
    const onConfirm = vi.fn();
    renderModal({
      dependents: {
        fileRequests: 3,
        fileRequestExtensions: 1,
        activeCheckouts: 0,
        returnedCheckouts: 2,
        auditLogs: 5,
      },
      onConfirm,
    });

    expect(await screen.findByText('Delete this file record?')).toBeTruthy();
    expect(screen.getByText('THESE RECORDS ARE KEPT')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    const deleteBtn = screen.getByRole('button', { name: /Delete file/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks deletion when file has active checkouts', async () => {
    const onConfirm = vi.fn();
    renderModal({
      dependents: {
        fileRequests: 2,
        fileRequestExtensions: 1,
        activeCheckouts: 1,
        returnedCheckouts: 1,
        auditLogs: 3,
      },
      onConfirm,
    });

    expect(
      await screen.findByText(/This file is currently issued/i),
    ).toBeTruthy();

    const deleteBtn = screen.getByRole('button', { name: /Delete file/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(deleteBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables delete button while dependent counts are still loading', async () => {
    renderModal({ dependents: null, loadingDependents: true });

    expect(
      await screen.findByText('Checking linked departmental records…'),
    ).toBeTruthy();
    const deleteBtn = screen.getByRole('button', { name: /Delete file/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

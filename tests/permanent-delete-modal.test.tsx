/**
 * Permanent delete confirmation modal tests:
 * Requires typing file_no before full permanent erase.
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PermanentDeleteModal from '../src/components/admin/files/PermanentDeleteModal';
import type { FileRecordRow } from '../src/models/FileRepository';

const FILE = {
  id: 7,
  file_no: 'PDI/TEST/01',
  file_name: 'Test file',
  section_name: 'Test Section',
} as unknown as FileRecordRow;

describe('PermanentDeleteModal', () => {
  beforeEach(() => cleanup());

  it('blocks permanent delete until exact file_no is typed', async () => {
    const onConfirm = vi.fn();
    render(
      <PermanentDeleteModal
        file={FILE}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText('Permanently Delete File?')).toBeTruthy();
    const deleteBtn = screen.getByRole('button', { name: /Permanently Delete/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByLabelText(/Type the File No to confirm/i);
    fireEvent.change(input, { target: { value: 'wrong-file-no' } });
    expect(screen.getByText('The File No does not match.')).toBeTruthy();
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: FILE.file_no } });
    expect(screen.queryByText('The File No does not match.')).toBeNull();
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

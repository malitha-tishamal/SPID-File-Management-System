import { describe, it, expect } from 'vitest';

export interface FileValidationInput {
  file_no?: string;
  file_name?: string;
  section?: string;
  /** ISO date YYYY-MM-DD */
  start_date?: string;
  /** ISO date YYYY-MM-DD */
  end_date?: string;
  shelf_position?: string;
  page_numbers?: number | string;
  minute_sheets_count?: number | string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateFileRecord(input: FileValidationInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.file_no || !String(input.file_no).trim()) {
    errors.file_no = 'File No is required.';
  }

  if (!input.file_name || !String(input.file_name).trim()) {
    errors.file_name = 'File Name is required.';
  }

  if (!input.section || !String(input.section).trim()) {
    errors.section = 'Section is required.';
  }

  // Start Date validation
  const startDate = String(input.start_date ?? '').trim();
  if (!startDate || !DATE_REGEX.test(startDate)) {
    errors.start_date = 'A valid Start Date (YYYY-MM-DD) is required.';
  }

  // End Date validation
  const endDate = String(input.end_date ?? '').trim();
  if (!endDate || !DATE_REGEX.test(endDate)) {
    errors.end_date = 'A valid End Date (YYYY-MM-DD) is required.';
  }

  // Date range check
  if (startDate && endDate && DATE_REGEX.test(startDate) && DATE_REGEX.test(endDate)) {
    if (endDate < startDate) {
      errors.end_date = 'End date must be on or after the start date.';
    }
  }

  if (input.shelf_position && !['Front', 'Middle', 'Back'].includes(input.shelf_position)) {
    errors.shelf_position = 'Shelf position must be Front, Middle, or Back.';
  }

  if (input.page_numbers !== undefined && input.page_numbers !== '') {
    const pages = Number(input.page_numbers);
    if (isNaN(pages) || pages < 0) {
      errors.page_numbers = 'Total pages must be a non-negative number.';
    }
  }

  if (input.minute_sheets_count !== undefined && input.minute_sheets_count !== '') {
    const sheets = Number(input.minute_sheets_count);
    if (isNaN(sheets) || sheets < 0) {
      errors.minute_sheets_count = 'Minute sheets count must be a non-negative number.';
    }
  }

  return errors;
}

describe('File record validation tests', () => {
  it('validates a complete valid record submission', () => {
    const valid: FileValidationInput = {
      file_no: 'PDI/26/102',
      file_name: 'Irrigation Scheme Proposal',
      section: 'Irrigation Planning, Design & Feasibility',
      start_date: '2024-01-01',
      end_date: '2026-12-31',
      shelf_position: 'Front',
      page_numbers: 45,
      minute_sheets_count: 8,
    };
    expect(validateFileRecord(valid)).toEqual({});
  });

  it('rejects missing file_no, file_name, and section', () => {
    const invalid: FileValidationInput = {
      file_no: '  ',
      file_name: '',
      section: '',
      start_date: '2024-01-01',
      end_date: '2026-12-31',
    };
    const errors = validateFileRecord(invalid);
    expect(errors.file_no).toBe('File No is required.');
    expect(errors.file_name).toBe('File Name is required.');
    expect(errors.section).toBe('Section is required.');
  });

  it('rejects missing or invalid start_date', () => {
    const noStart: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '',
      end_date: '2026-12-31',
    };
    expect(validateFileRecord(noStart).start_date).toBe(
      'A valid Start Date (YYYY-MM-DD) is required.',
    );

    const badFormat: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '01-01-2024',
      end_date: '2026-12-31',
    };
    expect(validateFileRecord(badFormat).start_date).toBe(
      'A valid Start Date (YYYY-MM-DD) is required.',
    );
  });

  it('rejects end_date earlier than start_date', () => {
    const invalid: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '2026-06-01',
      end_date: '2024-01-01',
    };
    const errors = validateFileRecord(invalid);
    expect(errors.end_date).toBe('End date must be on or after the start date.');
  });

  it('accepts end_date equal to start_date', () => {
    const valid: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '2026-06-01',
      end_date: '2026-06-01',
    };
    expect(validateFileRecord(valid)).toEqual({});
  });

  it('rejects negative numbers for page numbers and minute sheets', () => {
    const invalid: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '2024-01-01',
      end_date: '2026-12-31',
      page_numbers: -5,
      minute_sheets_count: -1,
    };
    const errors = validateFileRecord(invalid);
    expect(errors.page_numbers).toBe('Total pages must be a non-negative number.');
    expect(errors.minute_sheets_count).toBe('Minute sheets count must be a non-negative number.');
  });

  it('accepts zero page numbers and minute sheets', () => {
    const valid: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '2024-01-01',
      end_date: '2026-12-31',
      page_numbers: 0,
      minute_sheets_count: 0,
    };
    expect(validateFileRecord(valid)).toEqual({});
  });

  it('rejects invalid shelf position', () => {
    const invalid: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      start_date: '2024-01-01',
      end_date: '2026-12-31',
      shelf_position: 'Top',
    };
    expect(validateFileRecord(invalid).shelf_position).toBe(
      'Shelf position must be Front, Middle, or Back.',
    );
  });

  it('accepts all valid shelf positions', () => {
    const positions = ['Front', 'Middle', 'Back'] as const;
    for (const pos of positions) {
      const valid: FileValidationInput = {
        file_no: 'A',
        file_name: 'B',
        section: 'C',
        start_date: '2024-01-01',
        end_date: '2026-12-31',
        shelf_position: pos,
      };
      expect(validateFileRecord(valid)).toEqual({});
    }
  });
});

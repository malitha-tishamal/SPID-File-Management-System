import { describe, it, expect } from 'vitest';

export interface FileValidationInput {
  file_no?: string;
  file_name?: string;
  section?: string;
  year?: number | string;
  shelf_position?: string;
  page_numbers?: number | string;
  minute_sheets_count?: number | string;
}

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

  const rawYear = input.year;
  const year = typeof rawYear === 'number' ? rawYear : parseInt(String(rawYear ?? '').trim(), 10);
  if (!year || isNaN(year) || year < 1900 || year > 2100) {
    errors.year = 'A valid Year must be selected.';
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
      year: 2026,
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
      year: 2026,
    };
    const errors = validateFileRecord(invalid);
    expect(errors.file_no).toBe('File No is required.');
    expect(errors.file_name).toBe('File Name is required.');
    expect(errors.section).toBe('Section is required.');
  });

  it('rejects invalid or missing year', () => {
    expect(validateFileRecord({ file_no: 'A', file_name: 'B', section: 'C', year: '' }).year).toBe(
      'A valid Year must be selected.'
    );
    expect(validateFileRecord({ file_no: 'A', file_name: 'B', section: 'C', year: 1850 }).year).toBe(
      'A valid Year must be selected.'
    );
  });

  it('rejects negative numbers for page numbers and minute sheets', () => {
    const invalid: FileValidationInput = {
      file_no: 'A',
      file_name: 'B',
      section: 'C',
      year: 2024,
      page_numbers: -5,
      minute_sheets_count: -1,
    };
    const errors = validateFileRecord(invalid);
    expect(errors.page_numbers).toBe('Total pages must be a non-negative number.');
    expect(errors.minute_sheets_count).toBe('Minute sheets count must be a non-negative number.');
  });
});

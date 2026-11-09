import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  capitalizeFirstLetter,
  normalizeSearchQuery,
  filterSectionsByQuery,
  generateBulkImportTemplate,
  parseAndValidateImportBuffer,
  mapHeadersToFields,
} from '../src/utils/fileImport';

describe('Capitalization utility', () => {
  it('capitalizes only the first letter of lower case words', () => {
    expect(capitalizeFirstLetter('finance')).toBe('Finance');
    expect(capitalizeFirstLetter('human resources')).toBe('Human resources');
    expect(capitalizeFirstLetter('records management')).toBe('Records management');
  });

  it('preserves casing of remaining letters', () => {
    expect(capitalizeFirstLetter('pH scale')).toBe('PH scale');
    expect(capitalizeFirstLetter('eCommerce')).toBe('ECommerce');
    expect(capitalizeFirstLetter('already Capitalized')).toBe('Already Capitalized');
  });

  it('trims leading and trailing whitespace', () => {
    expect(capitalizeFirstLetter('  finance  ')).toBe('Finance');
    expect(capitalizeFirstLetter('   central archive registry   ')).toBe(
      'Central archive registry',
    );
  });

  it('handles empty or non-alphabetical inputs safely', () => {
    expect(capitalizeFirstLetter('')).toBe('');
    expect(capitalizeFirstLetter('   ')).toBe('');
    expect(capitalizeFirstLetter('123 section')).toBe('123 section');
  });

  it('handles Unicode and accented characters safely', () => {
    expect(capitalizeFirstLetter('über department')).toBe('Über department');
    expect(capitalizeFirstLetter('élan division')).toBe('Élan division');
  });
});

describe('Universal Section Search', () => {
  const sections = [
    { id: 1, name: 'Administration & Human Resources Division' },
    { id: 2, name: 'Irrigation Planning, Design & Feasibility' },
    { id: 3, name: 'Water Management, Operations & Hydrology' },
    { id: 4, name: 'Engineering Central Registry & Archive Records' },
    { id: 5, name: 'Finance, Accounts & Procurement' },
    { id: 6, name: 'Galle Regional Engineering Office' },
    { id: 7, name: 'Matara Regional Engineering Office' },
  ];

  it('performs case-insensitive searches (lowercase, UPPERCASE, MixedCase)', () => {
    const resLower = filterSectionsByQuery(sections, 'finance');
    const resUpper = filterSectionsByQuery(sections, 'FINANCE');
    const resMixed = filterSectionsByQuery(sections, 'FiNaNcE');

    expect(resLower.length).toBe(1);
    expect(resUpper.length).toBe(1);
    expect(resMixed.length).toBe(1);
    expect(resLower[0].name).toBe('Finance, Accounts & Procurement');
    expect(resUpper[0].name).toBe('Finance, Accounts & Procurement');
    expect(resMixed[0].name).toBe('Finance, Accounts & Procurement');
  });

  it('ignores leading and trailing whitespace in query', () => {
    const res = filterSectionsByQuery(sections, '   irrigation   ');
    expect(res.length).toBe(1);
    expect(res[0].name).toBe('Irrigation Planning, Design & Feasibility');
  });

  it('returns all sections when search query is empty or blank', () => {
    expect(filterSectionsByQuery(sections, '').length).toBe(sections.length);
    expect(filterSectionsByQuery(sections, '   ').length).toBe(sections.length);
  });

  it('returns empty array when no matches are found', () => {
    const res = filterSectionsByQuery(sections, 'Nonexistent Section');
    expect(res.length).toBe(0);
  });
});

describe('Excel Template Generation (SPID_Bulk_Import_Sample.xlsx)', () => {
  it('generates a genuine Excel workbook with the required sheets and headers', () => {
    const buffer = generateBulkImportTemplate([
      'Irrigation Planning, Design & Feasibility',
      'Finance, Accounts & Procurement',
    ]);

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.byteLength).toBeGreaterThan(100);

    // Read back using XLSX
    const wb = XLSX.read(buffer, { type: 'array' });
    expect(wb.SheetNames).toContain('File Import Template');
    expect(wb.SheetNames).toContain('Instructions');

    const ws = wb.Sheets['File Import Template'];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const headers = rows[0];
    expect(headers).toContain('File No *');
    expect(headers).toContain('File Name *');
    expect(headers).toContain('Section *');
    expect(headers).toContain('Start Date (YYYY-MM-DD) *');
    expect(headers).toContain('End Date (YYYY-MM-DD) *');
    expect(headers).toContain('Locker No');
    expect(headers).toContain('Shelf Name');
    expect(headers).toContain('Shelf Position');
    expect(headers).toContain('Total Pages');
    expect(headers).toContain('Minute Sheets Count');

    // Has sample data rows
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1][0]).toBe('PDI/26/101');
  });

  it('keeps the Admin template columns in their original order', () => {
    const wb = XLSX.read(generateBulkImportTemplate(undefined, true), {
      type: 'array',
    });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['File Import Template'], {
      header: 1,
      defval: '',
    });

    expect(rows[0]).toEqual([
      'File No *',
      'File Name *',
      'Section *',
      'Start Date (YYYY-MM-DD) *',
      'End Date (YYYY-MM-DD) *',
      'Locker No',
      'Shelf Name',
      'Shelf Position',
      'Total Pages',
      'Minute Sheets Count',
    ]);
    // Admin sample rows still carry location data
    expect(rows[1].slice(5, 8)).toEqual(['L-101', 'Shelf A', 'Front']);
  });

  it('omits Locker No, Shelf Name and Shelf Position from the Staff template', () => {
    const wb = XLSX.read(generateBulkImportTemplate(undefined, false), {
      type: 'array',
    });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['File Import Template'], {
      header: 1,
      defval: '',
    });

    expect(rows[0]).toEqual([
      'File No *',
      'File Name *',
      'Section *',
      'Start Date (YYYY-MM-DD) *',
      'End Date (YYYY-MM-DD) *',
      'Total Pages',
      'Minute Sheets Count',
    ]);
    expect(rows[0]).not.toContain('Locker No');
    expect(rows[0]).not.toContain('Shelf Name');
    expect(rows[0]).not.toContain('Shelf Position');

    // Sample rows shift left by the three removed columns
    expect(rows[1]).toEqual([
      'PDI/26/101',
      'Kalu Ganga River Basin Survey',
      'Irrigation Planning, Design & Feasibility',
      '2024-01-01',
      '2026-12-31',
      45,
      8,
    ]);

    // Instructions sheet must not document the location fields either
    const instructions: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Instructions'], {
      header: 1,
      defval: '',
    });
    const flat = instructions.map((r) => r.join(' | ')).join('\n');
    expect(flat).not.toContain('Locker No');
    expect(flat).not.toContain('Shelf Name');
    expect(flat).not.toContain('Shelf Position');
    expect(flat).toContain('Total Pages');
  });
});

describe('File Parser & Import Validation', () => {
  it('parses and validates a valid template workbook', async () => {
    const buffer = generateBulkImportTemplate();
    const result = await parseAndValidateImportBuffer(buffer.buffer);

    expect(result.missingRequiredHeaders.length).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(result.validRows.length).toBe(3);
    expect(result.isValid).toBe(true);

    const first = result.validRows[0];
    expect(first.file_no).toBe('PDI/26/101');
    expect(first.file_name).toBe('Kalu Ganga River Basin Survey');
    expect(first.start_date).toBe('2024-01-01');
    expect(first.end_date).toBe('2026-12-31');
    expect(first.shelf_position).toBe('Front');
  });

  it('imports the Staff template without location columns as unset storage', async () => {
    const sections = [
      'Administration & Human Resources Division',
      'Irrigation Planning, Design & Feasibility',
      'Water Management, Operations & Hydrology',
      'Engineering Central Registry & Archive Records',
      'Finance, Accounts & Procurement',
    ];

    const buffer = generateBulkImportTemplate(sections, false);

    const result = await parseAndValidateImportBuffer(buffer.buffer as ArrayBuffer, sections);

    expect(result.missingRequiredHeaders).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.isValid).toBe(true);
    expect(result.validRows).toHaveLength(3);

    // No locker/shelf values are invented for Staff rows
    expect(result.validRows[0].locker_no).toBeNull();
    expect(result.validRows[0].shelf_name).toBeNull();
    expect(result.validRows[0].shelf_position).toBeNull();
    // Remaining columns still resolve to the right fields
    expect(result.validRows[0].page_numbers).toBe(45);
    expect(result.validRows[0].minute_sheets_count).toBe(8);
    expect(result.validRows[2].file_no).toBe('PDI/26/103');
  });

  it('rejects files missing required headers', async () => {
    const wb = XLSX.utils.book_new();
    const badWs = XLSX.utils.aoa_to_sheet([
      ['File No', 'Something Else', 'Notes'],
      ['PDI/26/101', 'Data', 'Note'],
    ]);
    XLSX.utils.book_append_sheet(wb, badWs, 'Sheet1');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const result = await parseAndValidateImportBuffer(buf);
    expect(result.isValid).toBe(false);
    expect(result.missingRequiredHeaders.length).toBeGreaterThan(0);
    expect(result.errors[0].reason).toContain('Missing required column headers');
  });

  it('validates dates, date ranges, and duplicate records in batch', async () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      [
        'File No *',
        'File Name *',
        'Section *',
        'Start Date (YYYY-MM-DD) *',
        'End Date (YYYY-MM-DD) *',
        'Locker No',
        'Shelf Name',
        'Shelf Position',
        'Total Pages',
        'Minute Sheets Count',
      ],
      // Row 2: invalid date range (end before start)
      [
        'PDI/01',
        'File Alpha',
        'Administration',
        '2026-01-01',
        '2024-01-01',
        'L-1',
        'S-1',
        'Front',
        10,
        2,
      ],
      // Same file name with a different file number is allowed.
      [
        'PDI/02',
        'Duplicate Title',
        'Administration',
        '2024-01-01',
        '2025-01-01',
        'L-1',
        'S-1',
        'Front',
        10,
        2,
      ],
      // Row 4: repeated file number with a different file name is rejected
      [
        'PDI/02',
        'Different Title',
        'Administration',
        '2024-01-01',
        '2025-01-01',
        'L-1',
        'S-1',
        'Front',
        10,
        2,
      ],
      // Row 5: invalid shelf position
      [
        'PDI/04',
        'File Beta',
        'Administration',
        '2024-01-01',
        '2025-01-01',
        'L-1',
        'S-1',
        'Bottom',
        10,
        2,
      ],
      // Row 6: negative page numbers
      [
        'PDI/05',
        'File Gamma',
        'Administration',
        '2024-01-01',
        '2025-01-01',
        'L-1',
        'S-1',
        'Front',
        -5,
        2,
      ],
      // Row 7: repeated file number
      [
        'PDI/02',
        'Duplicate Title',
        'Administration',
        '2024-01-01',
        '2025-01-01',
        'L-1',
        'S-1',
        'Front',
        10,
        2,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'File Import Template');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const result = await parseAndValidateImportBuffer(buf);
    expect(result.isValid).toBe(false);

    const reasons = result.errors.map((e) => e.reason);
    expect(reasons.some((r) => r.includes('must be on or after Start Date'))).toBe(true);
    expect(
      reasons.filter((r) => r.includes('Duplicate File No "PDI/02"')).length,
    ).toBe(2);
    expect(reasons.some((r) => r.includes('Invalid Shelf Position'))).toBe(true);
    expect(reasons.some((r) => r.includes('Total Pages must be a non-negative number'))).toBe(
      true,
    );
  });

  it('allows the same file name under different file numbers', async () => {
    const rows = [
      ['File No', 'File Name', 'Section', 'Start Date', 'End Date'],
      ['PDI/01', 'Shared Name', 'Administration', '2024-01-01', '2025-01-01'],
      ['PDI/02', 'Shared Name', 'Administration', '2024-01-01', '2025-01-01'],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      'File Import Template',
    );
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    const result = await parseAndValidateImportBuffer(buffer);
    expect(result.isValid).toBe(true);
    expect(result.validRows).toHaveLength(2);
  });

  it('rejects a repeated file number even when the file name differs', async () => {
    const rows = [
      ['File No', 'File Name', 'Section', 'Start Date', 'End Date'],
      ['PDI/01', 'Shared Name', 'Administration', '2024-01-01', '2025-01-01'],
      ['pdi/01', 'Different Name', 'Administration', '2024-01-01', '2025-01-01'],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      'File Import Template',
    );
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    const result = await parseAndValidateImportBuffer(buffer);
    expect(result.isValid).toBe(false);
    expect(result.validRows).toHaveLength(1);
    expect(result.errors[0].reason).toContain('Duplicate File No "pdi/01"');
  });

  it('parses valid CSV text buffer correctly', async () => {
    const csvContent =
      'File No *,File Name *,Section *,Start Date *,End Date *,Locker No,Shelf Name,Shelf Position,Total Pages,Minute Sheets Count\n' +
      'PDI/99/01,Southern River Survey,Irrigation Planning,2024-01-01,2026-12-31,L-5,S-1,Middle,50,5\n' +
      'PDI/99/02,Baddegama Reservoir Dossier,Water Management,2024-02-01,2025-02-01,L-6,S-2,Back,15,0\n';

    const enc = new TextEncoder();
    const buf = enc.encode(csvContent).buffer;

    const result = await parseAndValidateImportBuffer(buf);
    expect(result.isValid).toBe(true);
    expect(result.validRows.length).toBe(2);
    expect(result.validRows[0].file_no).toBe('PDI/99/01');
    expect(result.validRows[0].shelf_position).toBe('Middle');
    expect(result.validRows[1].file_name).toBe('Baddegama Reservoir Dossier');
    expect(result.validRows[1].shelf_position).toBe('Back');
  });

  it('supports Year column fallback if start_date and end_date are omitted', async () => {
    const csvContent =
      'File No,File Name,Section,Year,Locker No,Shelf Name,Shelf Position,Total Pages,Minute Sheets Count\n' +
      'PDI/88/01,Nilwala Study,Administration,2025,L-1,Shelf A,Front,20,2\n';

    const enc = new TextEncoder();
    const buf = enc.encode(csvContent).buffer;

    const result = await parseAndValidateImportBuffer(buf);
    expect(result.isValid).toBe(true);
    expect(result.validRows.length).toBe(1);
    expect(result.validRows[0].start_date).toBe('2025-01-01');
    expect(result.validRows[0].end_date).toBe('2025-12-31');
  });

  it('rejects rows when section is not in active sections list', async () => {
    const csvContent =
      'File No,File Name,Section,Start Date,End Date\n' +
      'PDI/77/01,Unknown Section File,Nonexistent Department,2024-01-01,2025-01-01\n';

    const enc = new TextEncoder();
    const buf = enc.encode(csvContent).buffer;

    const result = await parseAndValidateImportBuffer(buf, ['Finance', 'Administration']);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].reason).toContain('is not an active section in the SPID system');
  });

  it('safely catches corrupted or binary data via try/catch without crashing', async () => {
    // Random binary invalid buffer
    const badBuf = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]).buffer;
    const result = await parseAndValidateImportBuffer(badBuf);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects spreadsheets exceeding MAX_IMPORT_ROWS (5000 rows)', async () => {
    const header = 'File No,File Name,Section,Start Date,End Date\n';
    const rows = Array.from({ length: 5001 }, (_, i) => `F-${i},Name-${i},Finance,2024-01-01,2024-12-31\n`).join('');
    const enc = new TextEncoder();
    const buf = enc.encode(header + rows).buffer;

    const result = await parseAndValidateImportBuffer(buf, ['Finance']);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].reason).toContain('exceeds the maximum limit of 5000 rows');
  });
});

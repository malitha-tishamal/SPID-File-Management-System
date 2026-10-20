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
      // Row 3: duplicate file name with Row 4
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
      // Row 4: duplicate title
      [
        'PDI/03',
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
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'File Import Template');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const result = await parseAndValidateImportBuffer(buf);
    expect(result.isValid).toBe(false);

    const reasons = result.errors.map((e) => e.reason);
    expect(reasons.some((r) => r.includes('must be on or after Start Date'))).toBe(true);
    expect(reasons.some((r) => r.includes('Duplicate File Name'))).toBe(true);
    expect(reasons.some((r) => r.includes('Invalid Shelf Position'))).toBe(true);
    expect(reasons.some((r) => r.includes('Total Pages must be a non-negative number'))).toBe(
      true,
    );
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
});

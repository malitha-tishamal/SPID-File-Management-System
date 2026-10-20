import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeCsvField,
  buildCsvBlob,
  formatDateTimeForCsv,
} from 'lib/csvExport';
import { FileRepository, FileRecordRow } from 'models/FileRepository';

describe('CSV Export Utilities & Formula Injection Guards', () => {
  it('correctly formats basic strings, numbers, and null/undefined', () => {
    expect(escapeCsvField('Hello')).toBe('Hello');
    expect(escapeCsvField(123)).toBe('123');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('escapes fields containing commas, double quotes, and newlines per RFC 4180', () => {
    // Commas
    expect(escapeCsvField('Colombo, Sri Lanka')).toBe('"Colombo, Sri Lanka"');
    // Quotes (must be doubled)
    expect(escapeCsvField('File "Confidential" Report')).toBe(
      '"File ""Confidential"" Report"'
    );
    // Newlines
    expect(escapeCsvField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(escapeCsvField("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
  });

  it('protects against spreadsheet formula injection (=, +, -, @, \\t, \\r)', () => {
    // Formula starting with =
    expect(escapeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    // Formula starting with +
    expect(escapeCsvField('+cmd|')).toBe("'+cmd|");
    // Formula starting with -
    expect(escapeCsvField('-2+3+cmd')).toBe("'-2+3+cmd");
    // Formula starting with @
    expect(escapeCsvField('@SUM(1+1)')).toBe("'@SUM(1+1)");
    // Formula starting with tab
    expect(escapeCsvField('\tcalc')).toBe("'\tcalc");

    // But ordinary text should not be prefixed
    expect(escapeCsvField('Land & Water File')).toBe('Land & Water File');
    expect(escapeCsvField('FL-2026-001')).toBe('FL-2026-001');
  });

  it('prepends UTF-8 BOM (\\uFEFF) for Excel compatibility in buildCsvBlob', async () => {
    const headers = ['File Number', 'File Name'];
    const rows = [
      ['FL-2026-001', 'Test File 1'],
      ['FL-2026-002', 'Test File 2'],
    ];

    const blob = buildCsvBlob(headers, rows);
    expect(blob.type).toBe('text/csv;charset=utf-8;');

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // UTF-8 BOM in binary is 0xEF, 0xBB, 0xBF
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);

    const text = await blob.text();
    // Headers and rows are present in the decoded text
    expect(text).toContain('File Number,File Name');
    expect(text).toContain('FL-2026-001,Test File 1');
    expect(text).toContain('FL-2026-002,Test File 2');
  });

  it('formats dates cleanly for CSV without React/HTML', () => {
    expect(formatDateTimeForCsv(null)).toBe('');
    expect(formatDateTimeForCsv(undefined)).toBe('');

    const formatted = formatDateTimeForCsv('2026-10-09T14:30:00.000Z');
    expect(formatted).toMatch(/^2026-10-09 \d{2}:\d{2} (AM|PM)$/);
  });
});

describe('FileRepository Pagination & Filtering Logic', () => {
  // Mock Supabase client to test listFiltered
  const sampleRecords: FileRecordRow[] = Array.from({ length: 42 }, (_, i) => ({
    id: i + 1,
    file_no: `FL-2026-${String(i + 1).padStart(4, '0')}`,
    file_name: `Record File ${i + 1} ${i % 2 === 0 ? 'Engineering' : 'Legal'}`,
    section_name: i % 2 === 0 ? 'Engineering' : 'Legal & Contracts',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    locker_no: i % 3 === 0 ? 'Rack A-04' : 'Wing C',
    shelf_name: 'Shelf 1',
    shelf_position: 'Front',
    registrar_name: i % 2 === 0 ? 'Marcus Grohs' : 'Elena Rostova',
    registrar_role: i % 5 === 0 ? 'Administrator' : 'Staff',
    status: i < 10 ? 'PENDING' : 'APPROVED',
    created_at: `2026-10-${String((i % 20) + 1).padStart(2, '0')}T10:00:00.000Z`,
  }));

  function createMockClient(records: FileRecordRow[]) {
    return {
      from: (_table: string) => ({
        select: (_cols: string, _opts?: { count?: string; head?: boolean }) => {
          let current = [...records];
          const chain: any = {
            eq: (col: string, val: any) => {
              current = current.filter((r: any) => r[col] === val);
              return chain;
            },
            in: (col: string, vals: any[]) => {
              current = current.filter((r: any) => vals.includes(r[col]));
              return chain;
            },
            ilike: (col: string, val: string) => {
              const term = val.replace(/%/g, '').toLowerCase();
              current = current.filter((r: any) =>
                String(r[col] || '').toLowerCase().includes(term)
              );
              return chain;
            },
            or: (clause: string) => {
              // Parse simple OR clauses for search or storage
              const terms = clause.split(',').map((part) => {
                const match = part.match(/([a-zA-Z_]+)\.ilike\.%(.*)%/);
                return match ? { col: match[1], term: match[2].toLowerCase() } : null;
              }).filter(Boolean);

              current = current.filter((r: any) =>
                terms.some((t: any) =>
                  String(r[t.col] || '').toLowerCase().includes(t.term)
                )
              );
              return chain;
            },
            gte: (col: string, val: string) => {
              current = current.filter((r: any) => (r[col] || '') >= val);
              return chain;
            },
            lte: (col: string, val: string) => {
              current = current.filter((r: any) => (r[col] || '') <= val);
              return chain;
            },
            order: (_col: string, _opts?: { ascending?: boolean }) => chain,
            range: (from: number, to: number) => {
              const sliced = current.slice(from, to + 1);
              return Promise.resolve({
                data: sliced,
                count: current.length,
                error: null,
              });
            },
          };
          return chain;
        },
      }),
    } as any;
  }

  it('defaults to limit=15 records per page when no filters are active', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({ tab: 'all' });
    expect(result.limit).toBe(15);
    expect(result.page).toBe(1);
    // 32 APPROVED records total / 15 per page = 3 pages
    expect(result.files.length).toBeLessThanOrEqual(15);
    expect(result.totalPages).toBe(Math.ceil(result.total / 15));
  });

  it('calculates page counts correctly for various dataset sizes', () => {
    // 142 records -> 10 pages at 15/page
    expect(Math.ceil(142 / 15)).toBe(10);
    // 30 records -> 2 pages
    expect(Math.ceil(30 / 15)).toBe(2);
    // 15 records -> 1 page
    expect(Math.ceil(15 / 15)).toBe(1);
    // 8 records -> 1 page
    expect(Math.ceil(8 / 15)).toBe(1);
  });

  it('supports fetching all matching records when limit is large (e.g. 10000) for search/filter and CSV export', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({
      tab: 'all',
      limit: 10000,
      page: 1,
    });

    // All approved records returned in one page
    expect(result.files.length).toBe(result.total);
    expect(result.totalPages).toBe(1);
  });

  it('filters by search term accurately', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({
      tab: 'all',
      search: 'Engineering',
      limit: 10000,
    });

    expect(result.files.every((f) => f.file_name.includes('Engineering'))).toBe(true);
  });

  it('filters by section accurately', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({
      tab: 'all',
      section: 'Legal',
      limit: 10000,
    });

    expect(result.files.every((f) => f.section_name.includes('Legal'))).toBe(true);
  });

  it('filters by storage unit accurately', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({
      tab: 'all',
      storage: 'Rack A-04',
      limit: 10000,
    });

    expect(result.files.every((f) => f.locker_no === 'Rack A-04')).toBe(true);
  });

  it('filters by officer accurately', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({
      tab: 'all',
      officer: 'Marcus Grohs',
      limit: 10000,
    });

    expect(result.files.every((f) => f.registrar_name === 'Marcus Grohs')).toBe(true);
  });

  it('combines multiple active filters accurately', async () => {
    const mockClient = createMockClient(sampleRecords);
    const repo = new FileRepository(mockClient);

    const result = await repo.listFiltered({
      tab: 'all',
      section: 'Engineering',
      officer: 'Marcus Grohs',
      limit: 10000,
    });

    expect(
      result.files.every(
        (f) =>
          f.section_name === 'Engineering' && f.registrar_name === 'Marcus Grohs'
      )
    ).toBe(true);
  });

  it('generates appropriate CSV content structure for File Requests without UI actions/buttons', async () => {
    const pendingFiles = sampleRecords.filter((r) => r.status === 'PENDING');
    const headers = [
      'File Number',
      'File Name',
      'Section',
      'File Location',
      'Submitted By',
      'Role',
      'Submitted Date & Time',
      'Request Status',
    ];
    const rows = pendingFiles.map((f) => [
      f.file_no,
      f.file_name,
      f.section_name,
      `${f.locker_no} / ${f.shelf_name}`,
      f.registrar_name,
      f.registrar_role,
      formatDateTimeForCsv(f.created_at),
      f.status,
    ]);

    const blob = buildCsvBlob(headers, rows);
    const text = await blob.text();

    // Verify correct columns and clean data
    expect(text).toContain('File Number,File Name,Section,File Location,Submitted By,Role,Submitted Date & Time,Request Status');
    // Ensure no UI action buttons or HTML tags leaked in
    expect(text).not.toContain('Approve');
    expect(text).not.toContain('Reject');
    expect(text).not.toContain('<button');
    expect(text).not.toContain('<svg');
  });

  it('generates appropriate CSV content structure for All Files without UI actions/buttons', async () => {
    const approvedFiles = sampleRecords.filter((r) => r.status === 'APPROVED');
    const headers = [
      'File Number',
      'File Name',
      'Section',
      'File Location',
      'Added By',
      'Role',
      'Added Date & Time',
      'File Status',
      'Admin Action',
    ];
    const rows = approvedFiles.map((f) => [
      f.file_no,
      f.file_name,
      f.section_name,
      `${f.locker_no} / ${f.shelf_name}`,
      f.registrar_name,
      f.registrar_role,
      formatDateTimeForCsv(f.created_at),
      f.status,
      'System Verified',
    ]);

    const blob = buildCsvBlob(headers, rows);
    const text = await blob.text();

    // Verify correct columns and clean data
    expect(text).toContain('File Number,File Name,Section,File Location,Added By,Role,Added Date & Time,File Status,Admin Action');
    // Ensure no UI action buttons or icons leaked in
    expect(text).not.toContain('View');
    expect(text).not.toContain('Edit');
    expect(text).not.toContain('Delete');
    expect(text).not.toContain('<button');
    expect(text).not.toContain('<svg');
  });

  it('exports complete available file location including locker, shelf, and position without truncation', async () => {
    const fileWithFullLocation = {
      file_no: 'FL-2026-0042',
      file_name: 'Hydro Basin Survey',
      section_name: 'Land & Hydrology',
      locker_no: 'Rack A-04',
      shelf_name: 'Shelf 02',
      shelf_position: 'Front',
      created_at: '2026-10-09T10:00:00.000Z',
    };

    const location = [
      fileWithFullLocation.locker_no,
      fileWithFullLocation.shelf_name,
      `Position: ${fileWithFullLocation.shelf_position}`,
    ].join(' / ');

    const headers = ['File Number', 'File Location'];
    const rows = [[fileWithFullLocation.file_no, location]];

    const blob = buildCsvBlob(headers, rows);
    const text = await blob.text();

    expect(text).toContain('Rack A-04 / Shelf 02 / Position: Front');
    expect(text).not.toContain('...');
  });

  it('exports administrator attribution accurately in Admin Action column', async () => {
    const rows = [
      ['FL-2026-0001', 'Approved by Malitha Tishamal'],
      ['FL-2026-0002', 'Approved (Auto-Logged)'],
      ['FL-2026-0003', 'Disabled by Malitha Tishamal'],
      ['FL-2026-0004', 'Pending Review'],
    ];
    const headers = ['File Number', 'Admin Action'];

    const blob = buildCsvBlob(headers, rows);
    const text = await blob.text();

    expect(text).toContain('Approved by Malitha Tishamal');
    expect(text).toContain('Approved (Auto-Logged)');
    expect(text).toContain('Disabled by Malitha Tishamal');
    expect(text).toContain('Pending Review');
  });
});


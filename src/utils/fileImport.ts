import * as XLSX from 'xlsx';

export interface SectionOption {
  id?: number | string;
  name: string;
}

export interface ValidatedRecord {
  rowIndex: number;
  file_no: string;
  file_name: string;
  section: string;
  start_date: string;
  end_date: string;
  locker_no: string | null;
  shelf_name: string | null;
  shelf_position: 'Front' | 'Middle' | 'Back' | null;
  page_numbers: number;
  minute_sheets_count: number;
}

export interface RowError {
  row: number;
  file_name?: string;
  reason: string;
}

export interface ImportValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: ValidatedRecord[];
  errors: RowError[];
  headersFound: string[];
  missingRequiredHeaders: string[];
}

/**
 * Capitalizes only the first letter of the entire string, preserving the rest,
 * and trimming leading and trailing whitespace. Unicode safe.
 * Examples:
 *   'finance' -> 'Finance'
 *   'human resources' -> 'Human resources'
 *   'records management' -> 'Records management'
 */
export function capitalizeFirstLetter(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  const chars = Array.from(trimmed);
  chars[0] = chars[0].toUpperCase();
  return chars.join('');
}

/**
 * Trims query and converts to lower case for universal search.
 */
export function normalizeSearchQuery(str: string): string {
  return (str || '').trim().toLowerCase();
}

/**
 * Filters sections by universal case-insensitive search ignoring leading/trailing spaces.
 */
export function filterSectionsByQuery<T extends { name: string }>(
  sections: T[],
  query: string,
): T[] {
  const q = normalizeSearchQuery(query);
  if (!q) return sections;
  return sections.filter((s) => (s.name || '').toLowerCase().includes(q));
}

export const REQUIRED_CANONICAL_FIELDS = [
  'file_no',
  'file_name',
  'section',
  'start_date',
  'end_date',
] as const;

export const FIELD_HEADER_ALIASES: Record<string, string[]> = {
  file_no: [
    'file no',
    'file_no',
    'file no *',
    'fileno',
    'file number',
    'file_number',
    'file id',
    'file_id',
  ],
  file_name: [
    'file name',
    'file_name',
    'file name *',
    'filename',
    'title',
    'file title',
    'file_title',
    'record name',
  ],
  section: [
    'section',
    'section_name',
    'section *',
    'section name',
    'department',
    'division',
    'section / division',
  ],
  start_date: [
    'start date',
    'start_date',
    'start date *',
    'start date (yyyy-mm-dd) *',
    'start date (yyyy-mm-dd)',
    'startdate',
    'from date',
    'from_date',
    'commencement date',
  ],
  end_date: [
    'end date',
    'end_date',
    'end date *',
    'end date (yyyy-mm-dd) *',
    'end date (yyyy-mm-dd)',
    'enddate',
    'to date',
    'to_date',
    'archival date',
  ],
  locker_no: ['locker no', 'locker_no', 'lockerno', 'locker', 'locker number'],
  shelf_name: [
    'shelf name',
    'shelf_name',
    'shelfname',
    'shelf no',
    'shelf_no',
    'shelf',
    'shelf number',
  ],
  shelf_position: [
    'shelf position',
    'shelf_position',
    'shelfposition',
    'position',
    'shelf pos',
  ],
  page_numbers: [
    'total pages',
    'page_numbers',
    'page numbers / total pages',
    'page numbers',
    'page_count',
    'pages',
    'total page numbers',
  ],
  minute_sheets_count: [
    'minute sheets count',
    'number of minutes sheets',
    'minute_sheets_count',
    'minute sheets',
    'minutes sheets',
    'minutes count',
    'minute sheets count (optional)',
  ],
  year: ['year', 'file year', 'record year'],
};

/** Normalize a single header string */
function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Map raw header list to canonical fields */
export function mapHeadersToFields(headers: string[]): {
  mapping: Record<number, string>;
  foundFields: Set<string>;
  missingRequired: string[];
} {
  const mapping: Record<number, string> = {};
  const foundFields = new Set<string>();

  headers.forEach((h, colIndex) => {
    const norm = normalizeHeaderKey(String(h || ''));
    if (!norm) return;

    for (const [canonical, aliases] of Object.entries(FIELD_HEADER_ALIASES)) {
      if (aliases.some((alias) => normalizeHeaderKey(alias) === norm)) {
        mapping[colIndex] = canonical;
        foundFields.add(canonical);
        break;
      }
    }
  });

  const missingRequired = REQUIRED_CANONICAL_FIELDS.filter((f) => {
    if (foundFields.has(f)) return false;
    // If year is present, start_date and end_date can be derived as fallback
    if ((f === 'start_date' || f === 'end_date') && foundFields.has('year')) {
      return false;
    }
    return true;
  });

  return { mapping, foundFields, missingRequired };
}

/** Format a cell date or string into ISO YYYY-MM-DD */
export function formatToISODate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(value).trim();
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // Handle MM/DD/YYYY
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

/**
 * Generate genuine Excel workbook (.xlsx) matching SPID requirements.
 * Contains:
 *   - Worksheet 1: 'File Import Template'
 *   - Worksheet 2: 'Instructions'
 */
export function generateBulkImportTemplate(availableSections?: string[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: File Import Template ──────────────────────────────────────────
  const headers = [
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
  ];

  const sampleSections = availableSections && availableSections.length > 0
    ? availableSections
    : [
        'Administration & Human Resources Division',
        'Irrigation Planning, Design & Feasibility',
        'Water Management, Operations & Hydrology',
        'Engineering Central Registry & Archive Records',
        'Finance, Accounts & Procurement',
      ];

  const sampleRows = [
    [
      'PDI/26/101',
      'Kalu Ganga River Basin Survey',
      sampleSections[1] || 'Irrigation Planning, Design & Feasibility',
      '2024-01-01',
      '2026-12-31',
      'L-101',
      'Shelf A',
      'Front',
      45,
      8,
    ],
    [
      'PDI/26/102',
      'Nilwala Ganga Canal Rehabilitation',
      sampleSections[2] || 'Water Management, Operations & Hydrology',
      '2023-06-15',
      '2025-06-14',
      'L-102',
      'Shelf B',
      'Middle',
      120,
      14,
    ],
    [
      'PDI/26/103',
      'Matara Regional Office Procurement Dossier',
      sampleSections[4] || 'Finance, Accounts & Procurement',
      '2025-01-01',
      '2025-12-31',
      'L-204',
      'Shelf C',
      'Back',
      32,
      4,
    ],
  ];

  const templateData = [headers, ...sampleRows];
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateData);

  // Auto column widths
  wsTemplate['!cols'] = [
    { wch: 16 }, // File No
    { wch: 42 }, // File Name
    { wch: 44 }, // Section
    { wch: 26 }, // Start Date
    { wch: 24 }, // End Date
    { wch: 14 }, // Locker No
    { wch: 16 }, // Shelf Name
    { wch: 16 }, // Shelf Position
    { wch: 14 }, // Total Pages
    { wch: 20 }, // Minute Sheets Count
  ];

  XLSX.utils.book_append_sheet(wb, wsTemplate, 'File Import Template');

  // ── Sheet 2: Instructions ──────────────────────────────────────────────────
  const instructionsData: (string | number)[][] = [
    ['SPID FILE MANAGEMENT SYSTEM — BULK IMPORT GUIDELINES & INSTRUCTIONS'],
    [''],
    ['1. OVERVIEW'],
    [
      'This Excel template is used to bulk register physical files into the SPID Central Archive Repository.',
    ],
    [
      'Complete the data in the "File Import Template" sheet, save as .xlsx or .csv, and upload in the Bulk Import dialog.',
    ],
    [''],
    ['2. FIELD SPECIFICATIONS'],
    ['Column Name', 'Required?', 'Allowed Values / Format', 'Example', 'Description'],
    [
      'File No *',
      'Yes',
      'Text (max 50 chars)',
      'PDI/26/101',
      'Official departmental file identifier code.',
    ],
    [
      'File Name *',
      'Yes',
      'Text (unique, max 255 chars)',
      'Kalu Ganga Basin Survey',
      'Unique official title for the file dossier.',
    ],
    [
      'Section *',
      'Yes',
      'Must match an active SPID section',
      sampleSections[0],
      'Departmental section or division responsible for the file.',
    ],
    [
      'Start Date (YYYY-MM-DD) *',
      'Yes',
      'YYYY-MM-DD date format',
      '2024-01-01',
      'Initial dossier creation or record inception date.',
    ],
    [
      'End Date (YYYY-MM-DD) *',
      'Yes',
      'YYYY-MM-DD date format',
      '2026-12-31',
      'Archival or closure date. Must be on or after Start Date.',
    ],
    [
      'Locker No',
      'No (Optional)',
      'Text (max 50 chars)',
      'L-101',
      'Physical locker number where file is secured.',
    ],
    [
      'Shelf Name',
      'No (Optional)',
      'Text (max 50 chars)',
      'Shelf A',
      'Shelf designation or number within the locker.',
    ],
    [
      'Shelf Position',
      'No (Optional)',
      'Front | Middle | Back',
      'Front',
      'Position on shelf. Defaults to "Front" if left blank.',
    ],
    [
      'Total Pages',
      'No (Optional)',
      'Non-negative integer',
      '45',
      'Total number of document pages inside the file folder.',
    ],
    [
      'Minute Sheets Count',
      'No (Optional)',
      'Non-negative integer',
      '8',
      'Number of minutes sheets attached inside the file.',
    ],
    [''],
    ['3. ACTIVE SECTIONS IN SPID ARCHIVE'],
    ['Section ID', 'Section Name'],
    ...sampleSections.map((s, idx) => [idx + 1, s]),
    [''],
    ['4. IMPORTANT RULES & CONSTRAINTS'],
    ['- Each "File Name" must be globally unique. Duplicate file names will be rejected.'],
    ['- Dates must be in YYYY-MM-DD format (e.g. 2024-05-15). End Date cannot precede Start Date.'],
    ['- "Shelf Position" must strictly be one of: Front, Middle, Back.'],
    ['- Both Excel (.xlsx, .xls) and CSV (.csv) file formats are fully supported for upload.'],
    ['- The header names in the first row must not be removed.'],
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [
    { wch: 28 },
    { wch: 16 },
    { wch: 34 },
    { wch: 28 },
    { wch: 60 },
  ];

  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  // Write workbook to Uint8Array binary buffer
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Triggers browser download of genuine SPID_Bulk_Import_Sample.xlsx file.
 */
export function downloadBulkImportSample(availableSections?: string[]): void {
  const bytes = generateBulkImportTemplate(availableSections);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'SPID_Bulk_Import_Sample.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses raw ArrayBuffer or File (CSV or XLSX/XLS) and validates rows.
 */
export async function parseAndValidateImportBuffer(
  buffer: ArrayBuffer,
  activeSections?: string[],
): Promise<ImportValidationResult> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Prefer 'File Import Template' sheet, else first sheet
  const sheetName = wb.SheetNames.includes('File Import Template')
    ? 'File Import Template'
    : wb.SheetNames[0];

  if (!sheetName) {
    return {
      isValid: false,
      totalRows: 0,
      validRows: [],
      errors: [{ row: 0, reason: 'The uploaded file does not contain any worksheets.' }],
      headersFound: [],
      missingRequiredHeaders: [...REQUIRED_CANONICAL_FIELDS],
    };
  }

  const ws = wb.Sheets[sheetName];
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawMatrix || rawMatrix.length === 0) {
    return {
      isValid: false,
      totalRows: 0,
      validRows: [],
      errors: [{ row: 0, reason: 'The uploaded worksheet is completely empty.' }],
      headersFound: [],
      missingRequiredHeaders: [...REQUIRED_CANONICAL_FIELDS],
    };
  }

  // Row 0 is headers
  const headerRow = (rawMatrix[0] || []).map((h) => String(h || '').trim());
  const { mapping, foundFields, missingRequired } = mapHeadersToFields(headerRow);

  if (missingRequired.length > 0) {
    const friendlyMissing = missingRequired
      .map((f) => f.replace(/_/g, ' ').toUpperCase())
      .join(', ');
    return {
      isValid: false,
      totalRows: Math.max(0, rawMatrix.length - 1),
      validRows: [],
      errors: [
        {
          row: 1,
          reason: `Missing required column headers: ${friendlyMissing}. Please ensure your file includes: File No, File Name, Section, Start Date, End Date.`,
        },
      ],
      headersFound: Array.from(foundFields),
      missingRequiredHeaders: missingRequired,
    };
  }

  const dataRows = rawMatrix.slice(1);
  const validRows: ValidatedRecord[] = [];
  const errors: RowError[] = [];

  const seenFileNamesInBatch = new Set<string>();
  const seenFileNosInBatch = new Set<string>();

  const activeSectionSet = activeSections && activeSections.length > 0
    ? new Set(activeSections.map((s) => s.trim().toLowerCase()))
    : null;

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed for user viewing (row 1 was header)

    // Check if entire row is empty
    const isRowEmpty = row.every((c) => String(c ?? '').trim() === '');
    if (isRowEmpty) return;

    const rowObj: Record<string, any> = {};
    Object.entries(mapping).forEach(([colIdx, field]) => {
      rowObj[field] = row[Number(colIdx)];
    });

    const fileNo = String(rowObj.file_no ?? '').trim();
    const fileName = String(rowObj.file_name ?? '').trim();
    const section = String(rowObj.section ?? '').trim();

    // Dates
    let startDate = formatToISODate(rowObj.start_date);
    let endDate = formatToISODate(rowObj.end_date);

    // If year was provided instead of dates
    if ((!startDate || !endDate) && rowObj.year) {
      const yr = parseInt(String(rowObj.year).trim(), 10);
      if (!isNaN(yr) && yr >= 1900 && yr <= 2100) {
        if (!startDate) startDate = `${yr}-01-01`;
        if (!endDate) endDate = `${yr}-12-31`;
      }
    }

    // Required fields check
    if (!fileNo) {
      errors.push({ row: rowNum, file_name: fileName, reason: 'File No is required.' });
      return;
    }

    if (!fileName) {
      errors.push({ row: rowNum, file_name: '', reason: 'File Name is required.' });
      return;
    }

    if (!section) {
      errors.push({ row: rowNum, file_name: fileName, reason: 'Section is required.' });
      return;
    }

    // Date regex check
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !dateRegex.test(startDate)) {
      errors.push({
        row: rowNum,
        file_name: fileName,
        reason: 'Start Date must be a valid date in YYYY-MM-DD format.',
      });
      return;
    }

    if (!endDate || !dateRegex.test(endDate)) {
      errors.push({
        row: rowNum,
        file_name: fileName,
        reason: 'End Date must be a valid date in YYYY-MM-DD format.',
      });
      return;
    }

    if (endDate < startDate) {
      errors.push({
        row: rowNum,
        file_name: fileName,
        reason: `End Date (${endDate}) must be on or after Start Date (${startDate}).`,
      });
      return;
    }

    // Optional active sections check
    if (activeSectionSet && !activeSectionSet.has(section.toLowerCase())) {
      errors.push({
        row: rowNum,
        file_name: fileName,
        reason: `Section "${section}" is not an active section in the SPID system.`,
      });
      return;
    }

    // Duplicate check in batch
    const lowerName = fileName.toLowerCase();
    if (seenFileNamesInBatch.has(lowerName)) {
      errors.push({
        row: rowNum,
        file_name: fileName,
        reason: `Duplicate File Name "${fileName}" found within the upload file.`,
      });
      return;
    }
    seenFileNamesInBatch.add(lowerName);

    // Optional fields
    const lockerNo = rowObj.locker_no ? String(rowObj.locker_no).trim() : null;
    const shelfName = rowObj.shelf_name ? String(rowObj.shelf_name).trim() : null;

    let shelfPosition: 'Front' | 'Middle' | 'Back' | null = null;
    if (rowObj.shelf_position) {
      const posRaw = String(rowObj.shelf_position).trim().toLowerCase();
      if (posRaw === 'front') shelfPosition = 'Front';
      else if (posRaw === 'middle') shelfPosition = 'Middle';
      else if (posRaw === 'back') shelfPosition = 'Back';
      else {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: `Invalid Shelf Position "${rowObj.shelf_position}". Must be Front, Middle, or Back.`,
        });
        return;
      }
    } else {
      shelfPosition = 'Front';
    }

    let pageNumbers = 0;
    if (rowObj.page_numbers !== undefined && rowObj.page_numbers !== '') {
      const p = Number(rowObj.page_numbers);
      if (isNaN(p) || p < 0) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: 'Total Pages must be a non-negative number.',
        });
        return;
      }
      pageNumbers = Math.floor(p);
    }

    let minuteSheetsCount = 0;
    if (rowObj.minute_sheets_count !== undefined && rowObj.minute_sheets_count !== '') {
      const m = Number(rowObj.minute_sheets_count);
      if (isNaN(m) || m < 0) {
        errors.push({
          row: rowNum,
          file_name: fileName,
          reason: 'Minute Sheets Count must be a non-negative number.',
        });
        return;
      }
      minuteSheetsCount = Math.floor(m);
    }

    validRows.push({
      rowIndex: rowNum,
      file_no: fileNo,
      file_name: fileName,
      section,
      start_date: startDate,
      end_date: endDate,
      locker_no: lockerNo,
      shelf_name: shelfName,
      shelf_position: shelfPosition,
      page_numbers: pageNumbers,
      minute_sheets_count: minuteSheetsCount,
    });
  });

  return {
    isValid: errors.length === 0 && validRows.length > 0,
    totalRows: validRows.length + errors.length,
    validRows,
    errors,
    headersFound: Array.from(foundFields),
    missingRequiredHeaders: [],
  };
}

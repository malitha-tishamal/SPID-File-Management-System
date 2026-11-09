import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scanner = vi.hoisted(() => ({
  result: {
    status: 'clean',
    engine: 'clamscan',
    durationMs: 4,
  } as {
    status: 'clean' | 'infected' | 'error';
    engine: string | null;
    signature?: string;
    detail?: string;
    durationMs: number;
  },
  calls: 0,
}));

vi.mock('services/MalwareScanner', () => ({
  MalwareScanService: {
    scanFile: vi.fn(async () => {
      scanner.calls += 1;
      return scanner.result;
    }),
    getStatus: vi.fn(async () => ({
      requested: 'auto',
      engine: 'clamscan',
      available: true,
      detail: 'test scanner',
      timeoutMs: 1000,
    })),
  },
}));

vi.mock('config/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

import { UploadSecurityService, UPLOAD_POLICIES } from 'services/UploadSecurityService';
import { parseAndValidateImportBuffer } from 'utils/fileImport';
import {
  assertZipSafe,
  inspectZip,
  sanitizeDisplayFileName,
} from 'lib/fileSignatures';

const CSV_HEADER = 'File No,File Name,Section,Start Date,End Date\n';
const VALID_ROW = 'FL-2026-9001,Clean Record,Administration,2026-01-01,2026-12-31\n';

let quarantineDir: string;

beforeAll(async () => {
  quarantineDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spid-security-test-'));
  process.env.UPLOAD_QUARANTINE_DIR = quarantineDir;
});

afterAll(async () => {
  delete process.env.UPLOAD_QUARANTINE_DIR;
  await fs.rm(quarantineDir, { recursive: true, force: true });
});

beforeEach(() => {
  scanner.calls = 0;
  scanner.result = { status: 'clean', engine: 'clamscan', durationMs: 4 };
});

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fileOf(name: string, bytes: Uint8Array, type = 'application/octet-stream'): File {
  return new File([bytes], name, { type });
}

function cleanCsvFile(name = 'bulk-import.csv'): File {
  return fileOf(name, bytesOf(CSV_HEADER + VALID_ROW), 'text/csv');
}

function buildWorkbookBuffer(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['File No', 'File Name', 'Section', 'Start Date', 'End Date'],
    ['FL-2026-9002', 'Workbook Record', 'Administration', '2026-01-01', '2026-12-31'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'File Import Template');
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

/** Rename an existing 17-character ZIP entry to an XLSX macro part. */
function injectVbaProjectEntry(bytes: Uint8Array): Uint8Array {
  const replacement = 'xl/vbaProject.bin';
  const names = inspectZip(bytes).names;
  const target = names.find((name) => name.length === replacement.length);
  if (!target) {
    throw new Error('No ZIP entry with a compatible name length to test macro injection.');
  }
  const out = new Uint8Array(bytes);
  const needle = bytesOf(target);
  const insert = bytesOf(replacement);
  for (let i = 0; i <= out.length - needle.length; i += 1) {
    let match = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (out[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) out.set(insert, i);
  }
  return out;
}

/** Inflate the declared uncompressed size of the first ZIP entry (ZIP bomb). */
function patchCentralDirectorySize(bytes: Uint8Array, declaredSize: number): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (let i = 0; i <= out.length - 46; i += 1) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, declaredSize, true);
      return out;
    }
  }
  throw new Error('No ZIP central directory entry found.');
}

describe('Upload signature and structure validation', () => {
  it('rejects a text file disguised as an .xlsx workbook', () => {
    expect(() =>
      UploadSecurityService.validateUpload(
        'payroll.xlsx',
        bytesOf(CSV_HEADER + VALID_ROW),
        UPLOAD_POLICIES.excel,
      ),
    ).toThrow(/content does not match its extension/i);
  });

  it('rejects unsupported executable uploads', () => {
    expect(() =>
      UploadSecurityService.validateUpload(
        'installer.exe',
        new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
        UPLOAD_POLICIES.excel,
      ),
    ).toThrow(/Unsupported file type/i);
  });

  it('rejects macro-enabled extensions before reading the bytes', () => {
    expect(() =>
      UploadSecurityService.validateUpload(
        'ledger.xlsm',
        buildWorkbookBuffer(),
        UPLOAD_POLICIES.excel,
      ),
    ).toThrow(/Macro-enabled documents are not accepted/i);
  });

  it('rejects an XLSX archive that contains a VBA project part', () => {
    const macroWorkbook = injectVbaProjectEntry(buildWorkbookBuffer());
    expect(() =>
      UploadSecurityService.validateUpload('ledger.xlsx', macroWorkbook, UPLOAD_POLICIES.excel),
    ).toThrow(/contains macros/i);
  });

  it('rejects a workbook with an unsafe declared decompression size', () => {
    const bomb = patchCentralDirectorySize(buildWorkbookBuffer(), 2 * 1024 * 1024 * 1024);
    const inspection = inspectZip(bomb);
    expect(() => assertZipSafe(inspection)).toThrow(/decompression limit|ZIP bomb/i);
  });

  it('accepts a genuine .xlsx workbook with the expected template parts', () => {
    const result = UploadSecurityService.validateUpload(
      'clean.xlsx',
      buildWorkbookBuffer(),
      UPLOAD_POLICIES.excel,
    );
    expect(result.detected.format).toBe('xlsx');
    expect(result.detected.category).toBe('excel');
  });

  it('sanitises path traversal out of uploaded file names', () => {
    expect(sanitizeDisplayFileName('..\\..\\windows\\evil.xlsx')).toBe('evil.xlsx');
    expect(sanitizeDisplayFileName('../../etc/passwd')).toBe('passwd');
  });
});

describe('Document and image validation', () => {
  const validPdf = bytesOf(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      'trailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n',
  );

  it('accepts a structurally complete PDF', () => {
    const result = UploadSecurityService.validateUpload(
      'report.pdf',
      validPdf,
      UPLOAD_POLICIES.document,
    );
    expect(result.detected.format).toBe('pdf');
  });

  it('rejects a corrupted or truncated PDF', () => {
    expect(() =>
      UploadSecurityService.validateUpload(
        'report.pdf',
        bytesOf('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>'),
        UPLOAD_POLICIES.document,
      ),
    ).toThrow(/corrupted or incomplete/i);
  });

  it('rejects a PDF with active JavaScript content', () => {
    const active = bytesOf(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n' +
        'endobj\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n',
    );
    expect(() =>
      UploadSecurityService.validateUpload('active.pdf', active, UPLOAD_POLICIES.document),
    ).toThrow(/active or embedded content/i);
  });

  it('rejects an incomplete JPEG image', () => {
    const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(() =>
      UploadSecurityService.validateUpload('avatar.jpg', truncated, UPLOAD_POLICIES.image),
    ).toThrow(/corrupted or incomplete/i);
  });
});

describe('Scan lifecycle', () => {
  it('scans before returning bytes and removes the clean quarantine copy on release', async () => {
    const secured = await UploadSecurityService.ingest(
      'bulk.csv',
      cleanCsvFile(),
      UPLOAD_POLICIES.excel,
      { actorId: 'admin-1', actorRole: 'Administrator', source: 'admin_bulk_import' },
    );

    expect(scanner.calls).toBe(1);
    expect(secured.scan.status).toBe('clean');
    expect(secured.sha256).toHaveLength(64);
    expect(secured.bytes.byteLength).toBeGreaterThan(0);

    await expect(fs.access(secured.quarantine.path)).resolves.toBeUndefined();
    await UploadSecurityService.release(secured);
    await expect(fs.access(secured.quarantine.path)).rejects.toBeTruthy();
  });

  it('blocks an infected file with MALWARE_DETECTED and never returns its bytes', async () => {
    scanner.result = {
      status: 'infected',
      engine: 'defender',
      signature: 'Test.Signature',
      durationMs: 8,
    };

    await expect(
      UploadSecurityService.ingest('payload.csv', cleanCsvFile('payload.csv'), UPLOAD_POLICIES.excel, {
        actorId: 'admin-1',
        source: 'admin_bulk_import',
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'MALWARE_DETECTED',
    });

    const retained = (await fs.readdir(quarantineDir)).filter((name) =>
      name.endsWith('.infected'),
    );
    expect(retained.length).toBeGreaterThan(0);
  });

  it('fails closed when the scanner errors', async () => {
    scanner.result = {
      status: 'error',
      engine: null,
      detail: 'No malware scanning engine is available.',
      durationMs: 1,
    };

    await expect(
      UploadSecurityService.ingest('bulk.csv', cleanCsvFile(), UPLOAD_POLICIES.excel, {
        actorId: 'admin-1',
        source: 'admin_bulk_import',
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: 'SCANNER_UNAVAILABLE',
    });

    const retained = (await fs.readdir(quarantineDir)).filter((name) =>
      name.endsWith('.scan-failed'),
    );
    expect(retained.length).toBeGreaterThan(0);
  });

  it('rejects oversized files before any scan is attempted', async () => {
    const tooLarge = new Uint8Array(UPLOAD_POLICIES.excel.maxBytes + 1);
    await expect(
      UploadSecurityService.ingest(
        'huge.xlsx',
        fileOf('huge.xlsx', tooLarge),
        UPLOAD_POLICIES.excel,
        { source: 'admin_bulk_import' },
      ),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(scanner.calls).toBe(0);
  });
});

describe('Spreadsheet content validation', () => {
  it('rejects CSV cells that look like formulas', async () => {
    // SheetJS turns "=..." CSV cells into formula cells.
    const equalsCsv =
      CSV_HEADER +
      'FL-2026-9003,=HYPERLINK(1),Administration,2026-01-01,2026-12-31\n';
    const equalsResult = await parseAndValidateImportBuffer(
      bytesOf(equalsCsv).buffer as ArrayBuffer,
      ['Administration'],
    );
    expect(equalsResult.isValid).toBe(false);
    expect(equalsResult.errors[0].reason).toMatch(/contains formulas/i);

    // Text that keeps its prefix is caught by the cell-content guard.
    const plusCsv =
      CSV_HEADER + 'FL-2026-9004,+SUM(1),Administration,2026-01-01,2026-12-31\n';
    const plusResult = await parseAndValidateImportBuffer(
      bytesOf(plusCsv).buffer as ArrayBuffer,
      ['Administration'],
    );
    expect(plusResult.isValid).toBe(false);
    expect(plusResult.errors.some((e) => /formula injection risk/i.test(e.reason))).toBe(true);
  });

  it('rejects worksheets that contain formula cells', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['File No', 'File Name', 'Section', 'Start Date', 'End Date'],
      ['FL-2026-9004', 'Formula Row', 'Administration', '2026-01-01', '2026-12-31'],
    ]);
    (sheet as any).A2 = { t: 'n', f: '1+1', v: 2 };
    XLSX.utils.book_append_sheet(workbook, sheet, 'File Import Template');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    const result = await parseAndValidateImportBuffer(buffer as ArrayBuffer);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].reason).toMatch(/contains formulas/i);
  });

  it('rejects macro-bearing workbooks during parsing', async () => {
    const macroWorkbook = injectVbaProjectEntry(buildWorkbookBuffer());
    const result = await parseAndValidateImportBuffer(macroWorkbook.buffer as ArrayBuffer);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].reason).toMatch(/contains macros/i);
  });

  it('rejects archive-bomb metadata during parsing', async () => {
    const bomb = patchCentralDirectorySize(buildWorkbookBuffer(), 2 * 1024 * 1024 * 1024);
    const result = await parseAndValidateImportBuffer(bomb.buffer as ArrayBuffer);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].reason).toMatch(/decompression limit|ZIP bomb/i);
  });

  it('still accepts a clean CSV import', async () => {
    const result = await parseAndValidateImportBuffer(
      bytesOf(CSV_HEADER + VALID_ROW).buffer as ArrayBuffer,
      ['Administration'],
    );
    expect(result.isValid).toBe(true);
    expect(result.validRows).toHaveLength(1);
  });
});

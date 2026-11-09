import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  FILE_FIELD_MAX_LENGTH,
  FILE_FIELD_COUNTER_WARN_AT,
  countFileFieldCharacters,
  truncateFileField,
  validateFileFieldLength,
} from '../src/lib/constants';
import {
  generateBulkImportTemplate,
  parseAndValidateImportBuffer,
} from '../src/utils/fileImport';

describe('File identity field limits — shared constant', () => {
  it('uses a single 256-character limit with a 90% warning threshold', () => {
    expect(FILE_FIELD_MAX_LENGTH).toBe(256);
    expect(FILE_FIELD_COUNTER_WARN_AT).toBe(230);
  });

  it('counts Sinhala characters as one character each', () => {
    const sinhala = 'ල'.repeat(256);
    expect(sinhala.length).toBe(256);
    expect(countFileFieldCharacters(sinhala)).toBe(256);
  });

  it('counts emoji by code point rather than UTF-16 units', () => {
    const emoji = '😀'.repeat(256);
    expect(emoji.length).toBe(512);
    expect(countFileFieldCharacters(emoji)).toBe(256);
  });

  it('truncates by code point without splitting surrogate pairs', () => {
    const input = '😀'.repeat(300);
    const result = truncateFileField(input);

    expect(countFileFieldCharacters(result)).toBe(256);
    expect(result.length).toBe(512);
    expect(result).not.toContain('\uFFFD');
  });

  it('leaves values at or under the limit untouched', () => {
    const exact = 'A'.repeat(256);
    expect(truncateFileField(exact)).toBe(exact);
    expect(truncateFileField('short')).toBe('short');
  });

  it('accepts exactly 256 characters for both fields', () => {
    expect(validateFileFieldLength('fileNo', 'A'.repeat(256))).toBeNull();
    expect(validateFileFieldLength('fileName', 'ල'.repeat(256))).toBeNull();
  });

  it('rejects 257 characters with the FIELD_TOO_LONG payload', () => {
    const error = validateFileFieldLength('fileName', 'A'.repeat(257));
    expect(error).toEqual({
      code: 'FIELD_TOO_LONG',
      field: 'fileName',
      max: 256,
      length: 257,
      message: 'File Name has 257 characters, max 256.',
    });
  });

  it('rejects 257 Sinhala characters', () => {
    const error = validateFileFieldLength('fileNo', 'ල'.repeat(257));
    expect(error?.code).toBe('FIELD_TOO_LONG');
    expect(error?.field).toBe('fileNo');
    expect(error?.length).toBe(257);
  });

  it('ignores leading and trailing spaces when validating', () => {
    const padded = `   ${'A'.repeat(256)}   `;
    expect(validateFileFieldLength('fileNo', padded)).toBeNull();
  });
});

describe('Bulk import — per-row identity field limits', () => {
  const buildCsv = (rows: string[]) =>
    new TextEncoder().encode(
      [
        'File No *,File Name *,Section *,Start Date *,End Date *',
        ...rows,
      ].join('\n') + '\n',
    ).buffer;

  it('reports only the overlong row while the other rows import', async () => {
    const result = await parseAndValidateImportBuffer(
      buildCsv([
        'PDI/90/01,Valid First Row,Irrigation Planning,2024-01-01,2025-01-01',
        `PDI/90/02,${'A'.repeat(257)},Irrigation Planning,2024-01-01,2025-01-01`,
        'PDI/90/03,Valid Third Row,Irrigation Planning,2024-01-01,2025-01-01',
      ]),
    );

    expect(result.isValid).toBe(false);
    expect(result.validRows).toHaveLength(2);
    expect(result.validRows.map((row) => row.file_no)).toEqual([
      'PDI/90/01',
      'PDI/90/03',
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].reason).toBe(
      'File Name has 257 characters, max 256.',
    );
  });

  it('reports an overlong File No with its row number', async () => {
    const result = await parseAndValidateImportBuffer(
      buildCsv([
        `${'F'.repeat(257)},Overlong File No,Irrigation Planning,2024-01-01,2025-01-01`,
      ]),
    );

    expect(result.validRows).toHaveLength(0);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].reason).toBe('File No has 257 characters, max 256.');
  });

  it('accepts a 256-character Sinhala File Name', async () => {
    const result = await parseAndValidateImportBuffer(
      buildCsv([
        `PDI/91/01,${'ල'.repeat(256)},Irrigation Planning,2024-01-01,2025-01-01`,
      ]),
    );

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.validRows).toHaveLength(1);
    expect(countFileFieldCharacters(result.validRows[0].file_name)).toBe(256);
  });

  it('documents the 256-character limit in the generated template', () => {
    const wb = XLSX.read(generateBulkImportTemplate(['Irrigation Planning']), {
      type: 'array',
    });
    const instructions: any[][] = XLSX.utils.sheet_to_json(
      wb.Sheets['Instructions'],
      { header: 1, defval: '' },
    );

    const fileNoRow = instructions.find((row) => row[0] === 'File No *');
    const fileNameRow = instructions.find((row) => row[0] === 'File Name *');

    expect(fileNoRow?.[2]).toBe('Text (max 256 characters)');
    expect(fileNameRow?.[2]).toBe('Text (max 256 characters)');
  });
});

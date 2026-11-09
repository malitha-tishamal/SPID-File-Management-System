/**
 * Pure file-signature and archive-safety helpers.
 *
 * This module must stay free of Node-only APIs so the same checks can run in
 * the browser (fast client-side feedback) and on the server (authoritative
 * validation). Client results are never trusted; the server re-runs them.
 */

export type FileFormat =
  | 'xlsx'
  | 'xls'
  | 'csv'
  | 'pdf'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'zip'
  | 'ole2'
  | 'unknown';

export type FileCategory = 'excel' | 'document' | 'image' | 'unsupported';

export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
}

export interface ZipInspection {
  entries: ZipEntryInfo[];
  totalCompressed: number;
  totalUncompressed: number;
  names: string[];
}

export interface ZipLimits {
  maxEntries: number;
  maxTotalUncompressed: number;
  maxEntryUncompressed: number;
  maxRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 1000,
  maxTotalUncompressed: 200 * 1024 * 1024,
  maxEntryUncompressed: 100 * 1024 * 1024,
  maxRatio: 120,
};

export const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;
export const MACRO_EXTENSIONS = [
  '.xlsm',
  '.xltm',
  '.xlam',
  '.xlsb',
  '.docm',
  '.dotm',
  '.pptm',
  '.potm',
] as const;
export const DOCUMENT_IMAGE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

export class FileSignatureError extends Error {
  code:
    | 'UNSUPPORTED_TYPE'
    | 'SIGNATURE_MISMATCH'
    | 'MACRO_DETECTED'
    | 'ARCHIVE_UNSAFE'
    | 'CORRUPT_FILE'
    | 'SUSPICIOUS_CONTENT';

  constructor(code: FileSignatureError['code'], message: string) {
    super(message);
    this.name = 'FileSignatureError';
    this.code = code;
  }
}

const SIG = {
  zip: [0x50, 0x4b, 0x03, 0x04],
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  ole2: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

export function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function bytesEqualAt(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (offset < 0 || offset + signature.length > bytes.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, text: string, offset = 0): boolean {
  if (offset < 0 || offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** UTF-16LE byte search, used for OLE stream names such as `_VBA_PROJECT`. */
function containsWideText(bytes: Uint8Array, text: string): boolean {
  const needle: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    needle.push(text.charCodeAt(i) & 0xff, 0);
  }
  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function containsAsciiText(bytes: Uint8Array, text: string): boolean {
  outer: for (let i = 0; i <= bytes.length - text.length; i += 1) {
    for (let j = 0; j < text.length; j += 1) {
      if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
    }
    return true;
  }
  return false;
}

export function isZipContainer(bytes: Uint8Array): boolean {
  return bytesEqualAt(bytes, SIG.zip) || bytesEqualAt(bytes, SIG.zipEmpty);
}

export function isOle2Container(bytes: Uint8Array): boolean {
  return bytesEqualAt(bytes, SIG.ole2);
}

export function extensionOf(filename: string): string {
  const base = String(filename || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

export function sanitizeDisplayFileName(filename: string): string {
  const base = String(filename || '').split(/[\\/]/).pop() || 'file';
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(-180) || 'file';
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(view: DataView, bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/**
 * Parse the ZIP central directory without inflating anything. Used to block
 * ZIP bombs before any library allocates the decompressed payload.
 */
export function inspectZip(bytes: Uint8Array): ZipInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view, bytes);
  if (eocd < 0) {
    throw new FileSignatureError('CORRUPT_FILE', 'The workbook archive is corrupted or incomplete.');
  }

  const entryCount = readUint16(view, eocd + 10);
  const directorySize = readUint32(view, eocd + 12);
  const directoryOffset = readUint32(view, eocd + 16);

  if (
    directoryOffset === 0xffffffff ||
    directorySize === 0xffffffff ||
    entryCount === 0xffff
  ) {
    throw new FileSignatureError(
      'ARCHIVE_UNSAFE',
      'The workbook uses an unsupported ZIP64 archive layout.',
    );
  }

  if (directoryOffset + directorySize > bytes.length) {
    throw new FileSignatureError('CORRUPT_FILE', 'The workbook archive directory is invalid.');
  }

  let offset = directoryOffset;
  const entries: ZipEntryInfo[] = [];
  let totalCompressed = 0;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > bytes.length || readUint32(view, offset) !== CENTRAL_SIGNATURE) {
      throw new FileSignatureError('CORRUPT_FILE', 'The workbook archive directory is malformed.');
    }

    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);

    if (offset + 46 + nameLength > bytes.length) {
      throw new FileSignatureError('CORRUPT_FILE', 'The workbook archive entry name is invalid.');
    }

    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    let name = '';
    try {
      name = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
    } catch {
      name = '';
    }

    if (!name || name.includes('\u0000')) {
      throw new FileSignatureError('ARCHIVE_UNSAFE', 'The workbook archive contains an invalid entry name.');
    }
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some((seg) => seg === '..')) {
      throw new FileSignatureError(
        'ARCHIVE_UNSAFE',
        'The workbook archive contains unsafe file paths.',
      );
    }

    entries.push({ name, compressedSize, uncompressedSize, method });
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    entries,
    totalCompressed,
    totalUncompressed,
    names: entries.map((entry) => entry.name),
  };
}

export function assertZipSafe(zip: ZipInspection, limits: ZipLimits = DEFAULT_ZIP_LIMITS): void {
  if (zip.entries.length === 0) {
    throw new FileSignatureError('CORRUPT_FILE', 'The workbook archive is empty.');
  }
  if (zip.entries.length > limits.maxEntries) {
    throw new FileSignatureError(
      'ARCHIVE_UNSAFE',
      `The workbook contains too many internal parts (${zip.entries.length}).`,
    );
  }
  if (zip.totalUncompressed > limits.maxTotalUncompressed) {
    throw new FileSignatureError(
      'ARCHIVE_UNSAFE',
      'The workbook expands beyond the safe decompression limit (possible ZIP bomb).',
    );
  }
  for (const entry of zip.entries) {
    if (entry.uncompressedSize > limits.maxEntryUncompressed) {
      throw new FileSignatureError(
        'ARCHIVE_UNSAFE',
        'A workbook part expands beyond the safe decompression limit (possible ZIP bomb).',
      );
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > limits.maxRatio &&
      entry.uncompressedSize > 1024 * 1024
    ) {
      throw new FileSignatureError(
        'ARCHIVE_UNSAFE',
        'A workbook part has an unsafe compression ratio (possible ZIP bomb).',
      );
    }
  }
}

export function zipHasMacros(zip: ZipInspection): boolean {
  return zip.names.some((name) => {
    const lower = name.toLowerCase();
    return (
      lower.endsWith('vbaproject.bin') ||
      lower.includes('/vbaproject') ||
      lower.includes('macrosheets/') ||
      lower.includes('/activex/')
    );
  });
}

export function oleHasMacros(bytes: Uint8Array): boolean {
  return (
    containsWideText(bytes, '_VBA_PROJECT') ||
    containsWideText(bytes, 'VBA') ||
    containsAsciiText(bytes, '_VBA_PROJECT')
  );
}

export function looksLikeText(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, 64 * 1024);
  if (sampleLength === 0) return true;

  let suspiciousControls = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    const byte = bytes[i];
    if (byte === 0) return false;
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspiciousControls += 1;
  }
  if (suspiciousControls > Math.max(2, Math.floor(sampleLength * 0.01))) return false;

  const sample = bytes.subarray(0, sampleLength);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return true;
  } catch {
    // Legacy ANSI CSV exports are still common; accept them when they contain
    // printable text and no binary control bytes.
    let printable = 0;
    for (let i = 0; i < sample.length; i += 1) {
      if ((sample[i] >= 0x20 && sample[i] <= 0x7e) || sample[i] >= 0xa0) printable += 1;
    }
    return printable / sample.length > 0.6;
  }
}

export function hasPdfSuspiciousContent(bytes: Uint8Array): boolean {
  const markers = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile'];
  return markers.some((marker) => containsAsciiText(bytes, marker));
}

export function hasPdfEndMarker(bytes: Uint8Array): boolean {
  const tailStart = Math.max(0, bytes.length - 2048);
  const tail = bytes.subarray(tailStart);
  return containsAsciiText(tail, '%%EOF') && containsAsciiText(tail, 'startxref');
}

export interface DetectedFile {
  format: FileFormat;
  category: FileCategory;
  extension: string;
  mime: string;
  macroEnabled: boolean;
}

const FORMATS: Record<FileFormat, { category: FileCategory; mime: string }> = {
  xlsx: {
    category: 'excel',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  xls: { category: 'excel', mime: 'application/vnd.ms-excel' },
  csv: { category: 'excel', mime: 'text/csv' },
  pdf: { category: 'document', mime: 'application/pdf' },
  jpeg: { category: 'image', mime: 'image/jpeg' },
  png: { category: 'image', mime: 'image/png' },
  webp: { category: 'image', mime: 'image/webp' },
  gif: { category: 'image', mime: 'image/gif' },
  zip: { category: 'unsupported', mime: 'application/zip' },
  ole2: { category: 'unsupported', mime: 'application/x-ole-storage' },
  unknown: { category: 'unsupported', mime: 'application/octet-stream' },
};

export function mimeForFormat(format: FileFormat): string {
  return FORMATS[format]?.mime || 'application/octet-stream';
}

export function formatMatchesExtension(format: FileFormat, extension: string): boolean {
  switch (extension) {
    case '.xlsx':
      return format === 'xlsx';
    case '.xls':
      return format === 'xls';
    case '.csv':
      return format === 'csv';
    case '.pdf':
      return format === 'pdf';
    case '.jpg':
    case '.jpeg':
      return format === 'jpeg';
    case '.png':
      return format === 'png';
    case '.webp':
      return format === 'webp';
    case '.gif':
      return format === 'gif';
    default:
      return false;
  }
}

/**
 * Detect the real file format from its content. The extension is only used to
 * disambiguate formats that share a container (ZIP/OLE2), never trusted alone.
 */
export function detectFileFormat(bytes: Uint8Array, filename = ''): DetectedFile {
  const extension = extensionOf(filename);

  if (bytesEqualAt(bytes, SIG.pdf, 0) || (bytes.length > 3 && asciiAt(bytes, '%PDF-', 0))) {
    return buildDetected('pdf', extension, false);
  }
  if (bytesEqualAt(bytes, SIG.jpeg)) return buildDetected('jpeg', extension, false);
  if (bytesEqualAt(bytes, SIG.png)) return buildDetected('png', extension, false);
  if (asciiAt(bytes, 'GIF87a') || asciiAt(bytes, 'GIF89a')) {
    return buildDetected('gif', extension, false);
  }
  if (asciiAt(bytes, 'RIFF') && asciiAt(bytes, 'WEBP', 8)) {
    return buildDetected('webp', extension, false);
  }
  if (isZipContainer(bytes)) {
    const zip = inspectZip(bytes);
    const hasWorkbook =
      zip.names.some((name) => name.toLowerCase() === 'xl/workbook.xml') ||
      zip.names.some((name) => name.toLowerCase() === 'xl/workbook.bin');
    const macroEnabled = zipHasMacros(zip);
    if (hasWorkbook) {
      return buildDetected('xlsx', extension, macroEnabled);
    }
    return buildDetected('zip', extension, macroEnabled);
  }
  if (isOle2Container(bytes)) {
    if (containsWideText(bytes, 'Workbook') || containsWideText(bytes, 'Book')) {
      return buildDetected('xls', extension, oleHasMacros(bytes));
    }
    return buildDetected('ole2', extension, oleHasMacros(bytes));
  }
  if (looksLikeText(bytes)) {
    return buildDetected('csv', extension, false);
  }
  return buildDetected('unknown', extension, false);
}

function buildDetected(
  format: FileFormat,
  extension: string,
  macroEnabled: boolean,
): DetectedFile {
  return {
    format,
    extension,
    macroEnabled,
    category: FORMATS[format].category,
    mime: FORMATS[format].mime,
  };
}

/**
 * Enforce the extension whitelist and cross-check it against the real bytes.
 * Throws FileSignatureError with a safe, user-facing message.
 */
export function assertSignatureMatchesExtension(
  bytes: Uint8Array,
  filename: string,
  allowedExtensions: readonly string[],
): DetectedFile {
  const extension = extensionOf(filename);

  if ((MACRO_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new FileSignatureError(
      'MACRO_DETECTED',
      'Macro-enabled documents are not accepted by this system.',
    );
  }
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new FileSignatureError(
      'UNSUPPORTED_TYPE',
      `Unsupported file type. Allowed types: ${allowedExtensions.join(', ')}.`,
    );
  }

  const detected = detectFileFormat(bytes, filename);

  if (detected.macroEnabled) {
    throw new FileSignatureError(
      'MACRO_DETECTED',
      'The file contains macros. Macro-enabled documents are not accepted.',
    );
  }

  if (!formatMatchesExtension(detected.format, extension)) {
    throw new FileSignatureError(
      'SIGNATURE_MISMATCH',
      'The file content does not match its extension. The upload was blocked.',
    );
  }

  if (detected.format === 'xlsx') {
    // Extra guard: XLSX must carry a workbook part and content types.
    const zip = inspectZip(bytes);
    if (!zip.names.some((n) => n.toLowerCase() === '[content_types].xml')) {
      throw new FileSignatureError('CORRUPT_FILE', 'The Excel workbook is missing its content types.');
    }
  }

  if (detected.format === 'pdf') {
    if (bytes.length < 64 || !hasPdfEndMarker(bytes)) {
      throw new FileSignatureError('CORRUPT_FILE', 'The PDF document is corrupted or incomplete.');
    }
    if (hasPdfSuspiciousContent(bytes)) {
      throw new FileSignatureError(
        'SUSPICIOUS_CONTENT',
        'The PDF contains active or embedded content and was blocked by security policy.',
      );
    }
  }

  return detected;
}

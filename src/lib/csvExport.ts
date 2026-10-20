/**
 * csvExport.ts
 *
 * Reusable CSV generation and download utilities for the SPID Record Room
 * File Management System.
 *
 * - Generates RFC 4180-compliant CSV with UTF-8 BOM for Excel compatibility.
 * - Escapes commas, double quotes, and line breaks inside field values.
 * - Guards against CSV formula injection in untrusted text fields.
 * - Does NOT corrupt ordinary values (numbers, dates, names without leading
 *   formula characters are passed through unchanged).
 */

/** Characters that trigger spreadsheet formula execution if in cell position 1 */
const CSV_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitise a single cell value for safe CSV embedding.
 *
 * Rules applied (in order):
 * 1. Coerce the value to a string; replace `null` / `undefined` with empty string.
 * 2. If the first character is a known formula-injection prefix, prepend a
 *    single apostrophe (`'`) so spreadsheet apps treat the cell as plain text.
 *    Ordinary text (A–Z, digits, spaces …) is never modified.
 * 3. If the value contains a double-quote (`"`), comma (`,`), or newline, wrap
 *    the whole value in double-quotes and escape every embedded `"` as `""`.
 */
export function escapeCsvField(value: unknown): string {
  // Step 1 – coerce
  let str: string;
  if (value === null || value === undefined) {
    str = '';
  } else {
    str = String(value);
  }

  // Step 2 – injection guard
  if (str.length > 0 && CSV_INJECTION_PREFIXES.includes(str[0])) {
    str = `'${str}`;
  }

  // Step 3 – RFC 4180 quoting
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert a 2-D dataset into a UTF-8 BOM–prefixed CSV Blob.
 *
 * @param headers - Column header strings (first row of the file).
 * @param rows    - Array of row objects; each object is a map of column index
 *                  → cell value (any type).  Rows must align with `headers`.
 */
export function buildCsvBlob(headers: string[], rows: unknown[][]): Blob {
  const BOM = '\uFEFF'; // UTF-8 BOM — makes Excel auto-detect UTF-8

  const headerLine = headers.map(escapeCsvField).join(',');
  const bodyLines = rows.map((row) =>
    row.map((cell) => escapeCsvField(cell)).join(',')
  );

  const csv = [BOM + headerLine, ...bodyLines].join('\r\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Trigger a browser file-download for a CSV Blob.
 *
 * @param blob     - The CSV blob produced by `buildCsvBlob`.
 * @param filename - Suggested file name (e.g. `all-files-2026-10-20.csv`).
 */
export function downloadCsvBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Convenience: build and immediately download a CSV file.
 *
 * @param headers  - Column header strings.
 * @param rows     - 2-D array of cell values.
 * @param filename - Download filename.
 */
export function exportToCsv(headers: string[], rows: unknown[][], filename: string): void {
  const blob = buildCsvBlob(headers, rows);
  downloadCsvBlob(blob, filename);
}

/**
 * Format an ISO date-time string into a human-readable "YYYY-MM-DD HH:MM AM/PM"
 * value suitable for CSV cells (no HTML, no React, no icons).
 */
export function formatDateTimeForCsv(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const date = d.toISOString().split('T')[0];
    const time = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

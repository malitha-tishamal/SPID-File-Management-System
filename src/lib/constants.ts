/**
 * Shared limits for the file identity fields. The Add/Edit forms, the bulk
 * import parser and the API controllers all validate against this one value so
 * the client and the server can never disagree about what "too long" means.
 */
export const FILE_FIELD_MAX_LENGTH = 256;

/** Kept below the 90% counter threshold so the colour change is predictable. */
export const FILE_FIELD_COUNTER_WARN_AT = Math.floor(FILE_FIELD_MAX_LENGTH * 0.9);

export type FileIdentityField = 'fileNo' | 'fileName';

export interface FileFieldLengthError {
  code: 'FIELD_TOO_LONG';
  field: FileIdentityField;
  max: number;
  length: number;
  message: string;
}

const FIELD_LABELS: Record<FileIdentityField, string> = {
  fileNo: 'File No',
  fileName: 'File Name',
};

/**
 * Counts Unicode code points rather than UTF-16 units, so Sinhala text and
 * emoji are measured the same way in every environment that runs this module.
 */
export function countFileFieldCharacters(value: string | null | undefined): number {
  return Array.from(String(value ?? '')).length;
}

/** Truncates by code point without splitting a surrogate pair. */
export function truncateFileField(
  value: string,
  max = FILE_FIELD_MAX_LENGTH,
): string {
  const characters = Array.from(String(value ?? ''));
  return characters.length > max ? characters.slice(0, max).join('') : value;
}

/**
 * The shared length rule. Leading/trailing whitespace is ignored, matching the
 * value that actually gets stored by the create/update controllers.
 */
export function validateFileFieldLength(
  field: FileIdentityField,
  value: string | null | undefined,
): FileFieldLengthError | null {
  const trimmed = String(value ?? '').trim();
  const length = countFileFieldCharacters(trimmed);
  if (length <= FILE_FIELD_MAX_LENGTH) return null;
  return {
    code: 'FIELD_TOO_LONG',
    field,
    max: FILE_FIELD_MAX_LENGTH,
    length,
    message: `${FIELD_LABELS[field]} has ${length} characters, max ${FILE_FIELD_MAX_LENGTH}.`,
  };
}

/**
 * Shared section-name rules used by both the create-section UI and the API so
 * duplicate detection can never drift between client and server.
 */

export const SECTION_NAME_MIN_LENGTH = 3;
export const SECTION_NAME_MAX_LENGTH = 120;

/** Domain terms that must never be flagged by the spell checker. */
export const SECTION_DOMAIN_WORDS = [
  'SPID',
  'IT',
  'HR',
  'Registry',
  'Admin',
  'Accounts',
  'Irrigation',
  'Archival',
  'Kotte',
  'Division',
  'Engineering',
  'Hydrology',
  'Procurement',
  'Secretariat',
];

export interface SectionNameLike {
  id?: number | string;
  name: string;
  status?: string;
}

/**
 * Canonical storage form: trimmed, internal whitespace collapsed, and each
 * all-lowercase word title-cased. Words that already contain uppercase
 * characters (acronyms such as "IT" or "SPID", or deliberate mixed case) are
 * preserved so acronyms are never mangled.
 */
export function normalizeSectionName(value: string): string {
  const collapsed = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  return collapsed.replace(/[\p{L}\p{N}][\p{L}\p{N}'’&.-]*/gu, (word) => {
    if (word !== word.toLowerCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** Case-insensitive comparison key (normalization + lowercase). */
export function sectionNameKey(value: string): string {
  return normalizeSectionName(value).toLowerCase();
}

export interface SectionDuplicate {
  section: SectionNameLike;
  disabled: boolean;
}

/** Finds a duplicate among ALL sections (active, pending, and disabled). */
export function findSectionDuplicate(
  sections: readonly SectionNameLike[],
  value: string,
  ignoreId?: number | string | null,
): SectionDuplicate | null {
  const key = sectionNameKey(value);
  if (!key) return null;

  for (const section of sections) {
    if (ignoreId !== undefined && ignoreId !== null) {
      if (section.id !== undefined && section.id !== null && String(section.id) === String(ignoreId)) {
        continue;
      }
    }
    if (sectionNameKey(section.name) === key) {
      return { section, disabled: section.status === 'disabled' };
    }
  }
  return null;
}

export function sectionDuplicateMessage(value: string, duplicate: SectionDuplicate): string {
  if (duplicate.disabled) {
    return 'This section already exists but is disabled. Enable it from Section Management.';
  }
  return `Section '${normalizeSectionName(value) || value.trim()}' already exists.`;
}

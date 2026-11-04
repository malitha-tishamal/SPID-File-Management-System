import { describe, it, expect } from 'vitest';
import {
  findSectionDuplicate,
  normalizeSectionName,
  sectionDuplicateMessage,
  sectionNameKey,
} from '../src/lib/sectionName';

const SECTIONS = [
  { id: 1, name: 'Accounting', status: 'approved' },
  { id: 2, name: 'Agree', status: 'disabled' },
  { id: 3, name: 'Information Technology', status: 'approved' },
  { id: 4, name: 'IT Support', status: 'approved' },
];

describe('section name normalization', () => {
  it('trims, collapses whitespace, and title-cases lowercase words', () => {
    expect(normalizeSectionName('  information   technology ')).toBe('Information Technology');
    expect(normalizeSectionName('finance\n\t accounts')).toBe('Finance Accounts');
  });

  it('preserves acronyms and deliberate mixed case', () => {
    expect(normalizeSectionName('IT support')).toBe('IT Support');
    expect(normalizeSectionName('SPID Registry')).toBe('SPID Registry');
  });

  it('produces a case- and whitespace-insensitive comparison key', () => {
    expect(sectionNameKey('  ACCOUNTING ')).toBe(sectionNameKey('accounting'));
    expect(sectionNameKey('Information   Technology')).toBe(sectionNameKey('information technology'));
  });
});

describe('duplicate section detection', () => {
  it('matches case-insensitively and after whitespace normalization', () => {
    expect(findSectionDuplicate(SECTIONS, ' accounting ')?.section.id).toBe(1);
    expect(findSectionDuplicate(SECTIONS, 'INFORMATION    TECHNOLOGY')?.section.id).toBe(3);
  });

  it('includes disabled sections and reports their status', () => {
    const duplicate = findSectionDuplicate(SECTIONS, 'agree');
    expect(duplicate?.section.id).toBe(2);
    expect(duplicate?.disabled).toBe(true);
    expect(sectionDuplicateMessage('agree', duplicate!)).toBe(
      'This section already exists but is disabled. Enable it from Section Management.',
    );
  });

  it('ignores the section being edited', () => {
    expect(findSectionDuplicate(SECTIONS, 'Accounting', 1)).toBeNull();
    expect(findSectionDuplicate(SECTIONS, 'Accounting', 2)?.section.id).toBe(1);
  });

  it('returns the standard message for active duplicates', () => {
    const duplicate = findSectionDuplicate(SECTIONS, 'accounting');
    expect(sectionDuplicateMessage('accounting', duplicate!)).toBe("Section 'Accounting' already exists.");
  });

  it('does not flag a genuinely new name', () => {
    expect(findSectionDuplicate(SECTIONS, 'Engineering Central Registry')).toBeNull();
  });
});

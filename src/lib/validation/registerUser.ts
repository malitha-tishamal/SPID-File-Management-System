/**
 * ONE shared registration schema used by the admin modal, the staff modal,
 * the create-user API routes AND the public registration flow.
 *
 * `validateRegisterUserInput` is pure (no I/O): it sanitises and validates
 * the payload and returns a field -> error-code map plus the normalised
 * values the server should persist. Uniqueness/permission checks that need
 * the database stay in the controllers.
 */

import {
  ALLOWED_EMAIL_DOMAINS,
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_NAME_MIN_LENGTH,
  isDepartmentRequiredForRole,
} from './constants';
import { isValidLkMobile, normalizeLkMobile } from './lkPhone';
import { passwordIssueCode, type PasswordIssue } from './password';
import type { UserRole } from 'types/auth';

export type RegisterUserRole = UserRole;

export interface RegisterUserInput {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  /** Department/section id (number or numeric string). */
  sectionId?: unknown;
  /** Sri Lankan mobile in any accepted format (required). */
  mobilePhone?: unknown;
}

export interface RegisterUserValues {
  fullName: string;
  email: string;
  password: string;
  role: RegisterUserRole | null;
  sectionId: number | null;
  /** Normalised E.164 "+947XXXXXXXX". */
  mobilePhone: string | null;
}

export type RegisterUserErrorCode =
  | 'required'
  | 'nameInvalid'
  | 'nameTooLong'
  | 'emailInvalid'
  | 'emailTooLong'
  | 'emailDomain'
  | PasswordIssue
  | 'roleInvalid'
  | 'departmentRequired'
  | 'departmentInvalid'
  | 'phoneRequired'
  | 'phoneInvalid';

export type RegisterUserErrors = Partial<
  Record<keyof RegisterUserValues, RegisterUserErrorCode>
>;

export interface RegisterUserValidationResult {
  values: RegisterUserValues;
  errors: RegisterUserErrors;
  ok: boolean;
}

const NAME_ALLOWED = /^[\p{L} .''-]+$/u;

/** Trim, collapse repeated spaces and strip control characters. */
export function sanitizeFullName(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[-]/g, '').trim().toLowerCase();
}

function sanitizeRole(value: unknown): RegisterUserRole | null {
  return value === 'Administrator' || value === 'Staff' ? value : null;
}

function sanitizeSectionId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Validates a registration payload. `options.pinnedRole` forces the role
 * (staff/admin endpoints); when set, a conflicting `role` in the payload is
 * reported as `roleInvalid` so callers can answer ROLE_NOT_ALLOWED.
 */
export function validateRegisterUserInput(
  input: RegisterUserInput,
  options: { pinnedRole?: RegisterUserRole; requireDepartment?: boolean } = {}
): RegisterUserValidationResult {
  const errors: RegisterUserErrors = {};

  // ── Full legal name ──────────────────────────────────────────────────
  const fullName = sanitizeFullName(input.fullName);
  const nameLength = Array.from(fullName).length;
  if (!fullName) {
    errors.fullName = 'required';
  } else if (nameLength < USER_NAME_MIN_LENGTH) {
    errors.fullName = 'nameInvalid';
  } else if (nameLength > USER_NAME_MAX_LENGTH) {
    errors.fullName = 'nameTooLong';
  } else if (!NAME_ALLOWED.test(fullName)) {
    errors.fullName = 'nameInvalid';
  }

  // ── Official work email ──────────────────────────────────────────────
  const email = sanitizeEmail(input.email);
  if (!email) {
    errors.email = 'required';
  } else if (email.length > USER_EMAIL_MAX_LENGTH) {
    errors.email = 'emailTooLong';
  } else if (/\s/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'emailInvalid';
  } else if (ALLOWED_EMAIL_DOMAINS.length > 0) {
    const domain = email.split('@')[1] ?? '';
    if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) errors.email = 'emailDomain';
  }

  // ── Password ─────────────────────────────────────────────────────────
  const password = typeof input.password === 'string' ? input.password : '';
  const passwordIssue = passwordIssueCode(password, { email, fullName });
  if (passwordIssue) errors.password = passwordIssue;

  // ── Role ─────────────────────────────────────────────────────────────
  let role: RegisterUserRole | null = null;
  if (options.pinnedRole) {
    const requested =
      input.role === undefined || input.role === null || input.role === ''
        ? null
        : sanitizeRole(input.role);
    if (requested && requested !== options.pinnedRole) {
      errors.role = 'roleInvalid';
    }
    role = options.pinnedRole;
  } else {
    role = sanitizeRole(input.role);
    if (!role) errors.role = 'roleInvalid';
  }

  // ── Department / section ─────────────────────────────────────────────
  const sectionId = sanitizeSectionId(input.sectionId);
  const departmentRequired =
    options.requireDepartment ?? (role ? isDepartmentRequiredForRole(role) : true);
  if (departmentRequired && sectionId === null) {
    errors.sectionId = 'departmentRequired';
  }

  // ── Mobile contact (required for every role) ─────────────────────────
  const rawPhone =
    typeof input.mobilePhone === 'string' ? input.mobilePhone.trim() : '';
  let mobilePhone: string | null = null;
  if (!rawPhone) {
    errors.mobilePhone = 'phoneRequired';
  } else if (!isValidLkMobile(rawPhone)) {
    errors.mobilePhone = 'phoneInvalid';
  } else {
    mobilePhone = normalizeLkMobile(rawPhone);
  }

  return {
    values: { fullName, email, password, role, sectionId, mobilePhone },
    errors,
    ok: Object.keys(errors).length === 0,
  };
}

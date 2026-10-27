/**
 * Shared validation rules + lockout schedule math.
 * Pure functions — used by client forms AND server controllers/tests.
 */

import type { UserRole } from 'types/auth';

export const GOV_EMAIL_HINT = 'officer@spid.gov.lk';

export interface RegistrationInput {
  role: UserRole;
  fullName: string;
  email: string;
  section: string;
  phoneDigits: string; // 9 digits after +94
  password: string;
  confirmPassword: string;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidNicFormat(nic: string): boolean {
  return /^(\d{9}[vVxX]|\d{12})$/.test(nic.trim());
}

export function isValidSriLankaMobileDigits(digits: string): boolean {
  return /^\d{9}$/.test(digits) && digits.startsWith('7');
}

/** Formats 9 digits as the stored canonical form: "+94 7X XXX XXXX". */
export function formatSriLankaMobile(digits: string): string {
  const clean = digits.replace(/\D/g, '').replace(/^0/, '').slice(0, 9);
  if (clean.length !== 9) return digits;
  return `+94 ${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 9)}`;
}

/** Client+server shared registration validation. Returns field->message map. */
export function validateRegistration(input: RegistrationInput): Record<string, string> {
  const errs: Record<string, string> = {};

  if (!input.role) {
    errs.role = 'User role must be specified.';
  }
  if (!input.fullName.trim()) {
    errs.fullName = 'Full legal name is required.';
  } else if (input.fullName.trim().length < 3) {
    errs.fullName = 'Full name must have at least 3 characters.';
  }

  if (!input.email.trim()) {
    errs.email = 'Official work email is required.';
  } else if (!isValidEmailFormat(input.email)) {
    errs.email = `Please provide a valid email format (e.g. ${GOV_EMAIL_HINT}).`;
  }

  if (!input.section) {
    errs.section = 'Please select a section.';
  }

  if (!input.phoneDigits) {
    errs.phone = 'Mobile phone number is required.';
  } else if (!isValidSriLankaMobileDigits(input.phoneDigits)) {
    errs.phone = 'Please enter a valid mobile number (7XXXXXXXX, 9 digits after +94).';
  }

  if (!input.password) {
    errs.password = 'Password is required.';
  } else if (input.password.length < 8) {
    errs.password = 'Password must be at least 8 characters.';
  }

  if (!input.confirmPassword) {
    errs.confirmPassword = 'Confirmation password is required.';
  } else if (input.password !== input.confirmPassword) {
    errs.confirmPassword = 'Passwords do not match.';
  }

  return errs;
}

/** Server+client shared password pair check. Returns an error message or null. */
export function validatePasswordPair(password: string, confirmPassword: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!confirmPassword) return 'Confirmation password is required.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
}

export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  text: string;
  width: string;
}

export const PASSWORD_SPECIAL_CHARS = /[!@#$%^&*(),.?":{}|<>]/;

/** Real-time strength rating shown on the registration and reset forms. */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: 'Not entered', color: 'bg-slate-200', text: 'text-slate-400', width: '0%' };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (PASSWORD_SPECIAL_CHARS.test(password)) score += 1;

  if (password.length < 8) {
    return { score: 1, label: 'Weak (min 8 characters)', color: 'bg-rose-500', text: 'text-rose-500', width: '25%' };
  }
  if (score <= 2) {
    return {
      score: 2,
      label: 'Fair (add numbers or special characters)',
      color: 'bg-amber-500',
      text: 'text-amber-500',
      width: '50%',
    };
  }
  if (score === 3) {
    return {
      score: 3,
      label: 'Good (meets basic requirements)',
      color: 'bg-sky-500',
      text: 'text-sky-500',
      width: '75%',
    };
  }
  return {
    score: 4,
    label: 'Strong (Archival Standard)',
    color: 'bg-emerald-500',
    text: 'text-emerald-500',
    width: '100%',
  };
}

/** Password pair check that also requires the highest ("Strong") rating. */
export function validateStrongPasswordPair(
  password: string,
  confirmPassword: string
): string | null {
  const baseError = validatePasswordPair(password, confirmPassword);
  if (baseError) return baseError;
  if (getPasswordStrength(password).score < 4) {
    return 'Password is not strong enough. Use 8+ characters with uppercase, lowercase, a number and a special character.';
  }
  return null;
}

/**
 * Progressive lockout schedule (server-enforced; mirrored here for tests):
 *   attempt 3  -> level 1, 60 seconds
 *   attempt 6  -> level 2, 120 seconds
 *   attempt 9+ -> level 3+, 600 seconds each
 * Returns null when the attempt should not trigger a lock.
 */
export function computeLockoutForAttempt(
  failedAttemptsAfterIncrement: number,
  previousLevel: number
): { level: number; durationSeconds: number } | null {
  if (failedAttemptsAfterIncrement % 3 !== 0) return null;
  const level = previousLevel + 1;
  const durationSeconds = level === 1 ? 60 : level === 2 ? 120 : 600;
  return { level, durationSeconds };
}

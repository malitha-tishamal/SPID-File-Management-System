/**
 * ONE shared password policy for every place a new password is set
 * (admin/staff registration, public registration, reset flow).
 * Base complexity matches the existing change-password/reset rule:
 * 8+ chars with upper, lower, digit and special char.
 */

import {
  COMMON_PASSWORDS,
  USER_PASSWORD_MAX_LENGTH,
  USER_PASSWORD_MIN_LENGTH,
} from './constants';

export const PASSWORD_SPECIAL_CHARS = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\|;'/`~]/;

export type PasswordIssue =
  | 'required'
  | 'tooShort'
  | 'tooLong'
  | 'edgeWhitespace'
  | 'missingUpper'
  | 'missingLower'
  | 'missingDigit'
  | 'missingSpecial'
  | 'common'
  | 'matchesIdentity';

export interface PasswordPolicyContext {
  email?: string | null;
  fullName?: string | null;
}

/** Every unmet requirement, in display order. Empty array = allowed. */
export function getPasswordIssues(
  password: string,
  context: PasswordPolicyContext = {}
): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const value = typeof password === 'string' ? password : '';

  if (!value) {
    issues.push('required');
    return issues;
  }
  if (value.length < USER_PASSWORD_MIN_LENGTH) issues.push('tooShort');
  if (value.length > USER_PASSWORD_MAX_LENGTH) issues.push('tooLong');
  if (value !== value.trim()) issues.push('edgeWhitespace');
  if (!/[A-Z]/.test(value) && !/[À-Þ]/.test(value)) issues.push('missingUpper');
  if (!/[a-z]/.test(value) && !/[à-ÿ]/.test(value)) issues.push('missingLower');
  if (!/\d/.test(value)) issues.push('missingDigit');
  if (!PASSWORD_SPECIAL_CHARS.test(value)) issues.push('missingSpecial');

  const lowered = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered)) issues.push('common');

  const emailLocal = (context.email ?? '').split('@')[0]?.toLowerCase();
  const nameCompact = (context.fullName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    (emailLocal && lowered === emailLocal) ||
    (nameCompact && lowered.replace(/[^a-z0-9]/g, '') === nameCompact)
  ) {
    issues.push('matchesIdentity');
  }

  return issues;
}

export function isPasswordAllowed(
  password: string,
  context: PasswordPolicyContext = {}
): boolean {
  return getPasswordIssues(password, context).length === 0;
}

/** First failing rule as a stable code, or null when allowed. */
export function passwordIssueCode(
  password: string,
  context: PasswordPolicyContext = {}
): PasswordIssue | null {
  return getPasswordIssues(password, context)[0] ?? null;
}

/**
 * Shared field limits for account registration / profile editing.
 * Single source of truth used by BOTH the client forms and the API
 * controllers — never duplicate these numbers in a component.
 */

export const USER_NAME_MIN_LENGTH = 2;
export const USER_NAME_MAX_LENGTH = 100;

export const USER_EMAIL_MAX_LENGTH = 254;

export const USER_PASSWORD_MIN_LENGTH = 8;
export const USER_PASSWORD_MAX_LENGTH = 128;

/** Sri Lankan mobile input: digits plus one optional leading "+". */
export const MOBILE_INPUT_MAX_LENGTH = 13;

/** Allowed Sri Lankan mobile prefixes after the leading 7 (07X, 7X). */
export const LK_MOBILE_PREFIX_PATTERN = /^7[0-8]\d{7}$/;

/**
 * Optional allow-list of email domains for work accounts.
 * Comma separated, e.g. "spid.gov.lk". Empty = every domain allowed.
 * Configured via NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS so client and server agree.
 */
export const ALLOWED_EMAIL_DOMAINS: string[] = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/**
 * When true, administrators must also pick a department/section during
 * registration. Staff always require one. Configure with
 * NEXT_PUBLIC_REQUIRE_DEPARTMENT_FOR_ADMIN=true.
 */
export const REQUIRE_DEPARTMENT_FOR_ADMIN =
  process.env.NEXT_PUBLIC_REQUIRE_DEPARTMENT_FOR_ADMIN === 'true';

/** Small deny-list of trivially guessable passwords. */
export const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password12',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'admin1234',
  'administrator',
  'spid2024!!',
  'spid2025!!',
  'spid2026!!',
  'changeme1!',
  'iloveyou1',
]);

export function isDepartmentRequiredForRole(role: string): boolean {
  return role === 'Staff' || (role === 'Administrator' && REQUIRE_DEPARTMENT_FOR_ADMIN);
}

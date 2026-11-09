/**
 * Sri Lankan mobile number parsing, validation, normalisation and display.
 *
 * Accepted input formats (all normalised to E.164 "+947XXXXXXXX"):
 *   07XXXXXXXX   (10 digits, local format with trunk prefix)
 *   7XXXXXXXX    (9 digits, national significant number)
 *   +947XXXXXXXX (E.164)
 *   947XXXXXXXX  (country code without plus)
 *
 * Valid mobile prefixes: 070, 071, 072, 074, 075, 076, 077, 078
 * (i.e. subscriber numbers starting 7[0-8]).
 *
 * Pure functions — safe to import from client components AND server code.
 */

import { LK_MOBILE_PREFIX_PATTERN } from './constants';

/** Canonical E.164 storage form: "+947XXXXXXXX". */
export function normalizeLkMobile(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  // Digits only; a leading "+" is allowed but irrelevant after stripping.
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let subscriber: string | null = null;
  if (digits.startsWith('94') && digits.length === 11) {
    subscriber = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 10) {
    subscriber = digits.slice(1);
  } else if (digits.length === 9) {
    subscriber = digits;
  }

  if (!subscriber || !LK_MOBILE_PREFIX_PATTERN.test(subscriber)) return null;
  return `+94${subscriber}`;
}

/** True when the input parses to a valid Sri Lankan mobile in any accepted format. */
export function isValidLkMobile(input: string | null | undefined): boolean {
  return normalizeLkMobile(input) !== null;
}

/**
 * Digits-only variant used by older forms that collect the 9-digit
 * national significant number (e.g. the public registration page).
 */
export function isValidLkMobileDigits(digits: string | null | undefined): boolean {
  return typeof digits === 'string' && LK_MOBILE_PREFIX_PATTERN.test(digits.trim());
}

/** Display form: "+94 77 123 4567". Returns the input unchanged when invalid. */
export function formatLkMobileDisplay(input: string | null | undefined): string {
  if (input == null) return '';
  const e164 = normalizeLkMobile(input);
  if (!e164) return String(input);
  const subscriber = e164.slice(3); // 9 digits
  return `+94 ${subscriber.slice(0, 2)} ${subscriber.slice(2, 5)} ${subscriber.slice(5, 9)}`;
}

/**
 * Sanitises raw typing/pasting for a tel input: keeps digits and at most
 * one leading "+". Everything else (spaces, hyphens, brackets, letters)
 * is removed. The result is capped at MOBILE_INPUT_MAX_LENGTH chars.
 */
export function sanitizeLkMobileInput(value: string, maxLength = 13): string {
  let out = '';
  let plusUsed = false;
  for (const ch of String(value)) {
    if (ch === '+') {
      if (!plusUsed && out.length === 0) {
        out += ch;
        plusUsed = true;
      }
      continue;
    }
    if (ch >= '0' && ch <= '9') out += ch;
  }
  return out.slice(0, maxLength);
}

/**
 * Comparison key for uniqueness checks: two numbers count as identical
 * when they normalise to the same subscriber digits, regardless of the
 * format they were entered in.
 */
export function lkMobileIdentity(input: string | null | undefined): string | null {
  const e164 = normalizeLkMobile(input);
  return e164 ? e164.slice(3) : null; // 9-digit subscriber number
}

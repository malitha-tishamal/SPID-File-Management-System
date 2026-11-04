import { describe, it, expect } from 'vitest';
import { computeLockoutForAttempt, validatePasswordPair } from 'validators/authValidators';

/**
 * Progressive lockout schedule (migration 0011):
 *   attempts 1-3 -> no lock
 *   attempt  4   -> 30 seconds (level 1)
 *   attempt  5   -> 60 seconds (level 2)
 *   attempt  6   -> 90 seconds (level 3)
 *   attempt  7+  -> PERMANENT lock (level 4) until an administrator clears it
 */
describe('progressive lockout schedule', () => {
  it('does not lock during the first 3 consecutive failures', () => {
    expect(computeLockoutForAttempt(1, 0)).toBeNull();
    expect(computeLockoutForAttempt(2, 0)).toBeNull();
    expect(computeLockoutForAttempt(3, 0)).toBeNull();
  });

  it('locks 30 seconds on the 4th failure (level 1)', () => {
    expect(computeLockoutForAttempt(4, 0)).toEqual({ level: 1, durationSeconds: 30 });
  });

  it('locks 60 seconds on the 5th failure (level 2)', () => {
    expect(computeLockoutForAttempt(5, 1)).toEqual({ level: 2, durationSeconds: 60 });
  });

  it('locks 90 seconds on the 6th failure (level 3)', () => {
    expect(computeLockoutForAttempt(6, 2)).toEqual({ level: 3, durationSeconds: 90 });
  });

  it('permanently locks from the 7th failure onwards (level 4)', () => {
    expect(computeLockoutForAttempt(7, 3)).toEqual({ level: 4, durationSeconds: 0, permanent: true });
    expect(computeLockoutForAttempt(12, 4)).toEqual({ level: 4, durationSeconds: 0, permanent: true });
    expect(computeLockoutForAttempt(30, 4)).toEqual({ level: 4, durationSeconds: 0, permanent: true });
  });
});

describe('password pair validation', () => {
  it('rejects missing/short passwords', () => {
    expect(validatePasswordPair('', '')).toBe('Password is required.');
    expect(validatePasswordPair('short', 'short')).toBe('Password must be at least 8 characters.');
  });

  it('rejects mismatched confirmation', () => {
    expect(validatePasswordPair('longenough1', 'different12')).toBe('Passwords do not match.');
    expect(validatePasswordPair('longenough1', '')).toBe('Confirmation password is required.');
  });

  it('accepts a matching pair', () => {
    expect(validatePasswordPair('longenough1', 'longenough1')).toBeNull();
  });
});

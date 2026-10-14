import { describe, it, expect } from 'vitest';
import { computeLockoutForAttempt, validatePasswordPair } from 'validators/authValidators';

/**
 * Progressive lockout schedule (spec section 6):
 *   attempts 1-2 -> no lock
 *   attempt 3    -> 60 seconds (level 1)
 *   attempts 4-5 -> no lock
 *   attempt 6    -> 120 seconds (level 2)
 *   attempts 7-8 -> no lock
 *   attempt 9+   -> 600 seconds (level 3, every 3rd attempt thereafter)
 */
describe('progressive lockout schedule', () => {
  it('does not lock before the 3rd consecutive failure', () => {
    expect(computeLockoutForAttempt(1, 0)).toBeNull();
    expect(computeLockoutForAttempt(2, 0)).toBeNull();
  });

  it('locks 60 seconds on the 3rd failure (level 1)', () => {
    expect(computeLockoutForAttempt(3, 0)).toEqual({ level: 1, durationSeconds: 60 });
  });

  it('locks 2 minutes on the 6th failure (level 2)', () => {
    expect(computeLockoutForAttempt(4, 1)).toBeNull();
    expect(computeLockoutForAttempt(5, 1)).toBeNull();
    expect(computeLockoutForAttempt(6, 1)).toEqual({ level: 2, durationSeconds: 120 });
  });

  it('locks 10 minutes from the 9th failure onwards (level 3+)', () => {
    expect(computeLockoutForAttempt(7, 2)).toBeNull();
    expect(computeLockoutForAttempt(8, 2)).toBeNull();
    expect(computeLockoutForAttempt(9, 2)).toEqual({ level: 3, durationSeconds: 600 });
    expect(computeLockoutForAttempt(12, 3)).toEqual({ level: 4, durationSeconds: 600 });
    expect(computeLockoutForAttempt(30, 9)).toEqual({ level: 10, durationSeconds: 600 });
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

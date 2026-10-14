import { describe, it, expect } from 'vitest';
import {
  isValidEmailFormat,
  isValidNicFormat,
  isValidSriLankaMobileDigits,
  formatSriLankaMobile,
  validateRegistration,
} from 'validators/authValidators';

describe('email validation', () => {
  it('accepts valid formats', () => {
    expect(isValidEmailFormat('officer@spid.gov.lk')).toBe(true);
    expect(isValidEmailFormat('name@example.com')).toBe(true);
  });
  it('rejects invalid formats', () => {
    expect(isValidEmailFormat('not-an-email')).toBe(false);
    expect(isValidEmailFormat('a@b')).toBe(false);
    expect(isValidEmailFormat('')).toBe(false);
  });
});

describe('NIC validation (Sri Lankan formats)', () => {
  it('accepts old 9-digit + V/X format', () => {
    expect(isValidNicFormat('852410342V')).toBe(true);
    expect(isValidNicFormat('852410342x')).toBe(true);
  });
  it('accepts modern 12-digit format', () => {
    expect(isValidNicFormat('198524103421')).toBe(true);
  });
  it('rejects malformed NICs', () => {
    expect(isValidNicFormat('12345')).toBe(false);
    expect(isValidNicFormat('852410342VV')).toBe(false);
    expect(isValidNicFormat('19852410342')).toBe(false);
  });
});

describe('Sri Lankan mobile validation', () => {
  it('accepts 9 digits starting with 7', () => {
    expect(isValidSriLankaMobileDigits('771234567')).toBe(true);
  });
  it('rejects wrong length or prefix', () => {
    expect(isValidSriLankaMobileDigits('77123456')).toBe(false);
    expect(isValidSriLankaMobileDigits('0771234567')).toBe(false);
    expect(isValidSriLankaMobileDigits('971234567')).toBe(false);
  });
  it('formats to canonical +94 layout', () => {
    expect(formatSriLankaMobile('771234567')).toBe('+94 77 123 4567');
    expect(formatSriLankaMobile('0771234567')).toBe('+94 77 123 4567');
  });
});

describe('registration validation', () => {
  const valid = {
    role: 'Staff' as const,
    fullName: 'A. B. Perera',
    email: 'a@spid.gov.lk',
    section: 'Record Room',
    phoneDigits: '771234567',
    password: 'longenough1',
    confirmPassword: 'longenough1',
  };

  it('accepts a complete valid submission', () => {
    expect(validateRegistration(valid)).toEqual({});
  });

  it('flags each missing field with the expected message key', () => {
    const errs = validateRegistration({ ...valid, fullName: '', section: '', confirmPassword: 'other' });
    expect(errs.fullName).toBe('Full legal name is required.');
    expect(errs.section).toBe('Please select a section.');
    expect(errs.confirmPassword).toBe('Passwords do not match.');
  });

  it('flags an invalid mobile number', () => {
    const errs = validateRegistration({ ...valid, phoneDigits: '123' });
    expect(errs.phone).toContain('valid mobile number');
  });
});

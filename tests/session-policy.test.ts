import { describe, expect, it } from 'vitest';
import {
  INACTIVITY_TIMEOUT_MS,
  REMEMBER_LIFETIME_SECONDS,
  isSessionExpired,
  parseSessionMeta,
  sessionCookieOptions,
} from 'lib/sessionPolicy';

describe('session policy', () => {
  it('treats exactly one hour of inactivity as expired', () => {
    expect(INACTIVITY_TIMEOUT_MS).toBe(60 * 60 * 1000);
    const t = 1_700_000_000_000;
    expect(isSessionExpired({ t }, t + INACTIVITY_TIMEOUT_MS - 1)).toBe(false);
    expect(isSessionExpired({ t }, t + INACTIVITY_TIMEOUT_MS)).toBe(true);
    expect(isSessionExpired({ t }, t + INACTIVITY_TIMEOUT_MS + 1)).toBe(true);
  });

  it('parses valid session metadata and rejects malformed values', () => {
    expect(
      parseSessionMeta(JSON.stringify({ id: 'u1', role: 'Staff', status: 'approved', t: 10, remember: true }))
    ).toEqual({ id: 'u1', role: 'Staff', status: 'approved', t: 10, remember: true });

    expect(parseSessionMeta(null)).toBeNull();
    expect(parseSessionMeta('not-json')).toBeNull();
    expect(parseSessionMeta(JSON.stringify({ id: 'u1', role: 'Staff' }))).toBeNull();
    expect(parseSessionMeta(JSON.stringify({ id: 'u1', role: 'Staff', status: 'approved', t: 'x' }))).toBeNull();
  });

  it('makes Remember Me a 30-day cookie and leaves the other case session-scoped', () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      path: '/',
      httpOnly: true,
      maxAge: REMEMBER_LIFETIME_SECONDS,
    });
    expect(sessionCookieOptions(false)).not.toHaveProperty('maxAge');
  });
});

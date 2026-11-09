/**
 * Progressive login lockout — schedule, race behaviour and UI-facing helpers.
 *
 * The database owns the real counters (migration 0026). These tests pin the
 * shared schedule and the pure mirror used by the login page / admin panel, so
 * a config change cannot silently skip a level.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import {
  LOGIN_LOCKOUT,
  computeLockoutForAttempt,
  emptyLockoutSnapshot,
  formatLockoutCountdown,
  isLockoutActive,
  normaliseRemainingSeconds,
  secondsUntilUnlock,
  simulateFailedAttempt,
  type LockoutSnapshot,
} from 'lib/auth/lockout';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

function locale(language: 'en' | 'si', namespace: string): any {
  return JSON.parse(
    readFileSync(join(PROJECT_ROOT, 'src', 'i18n', 'locales', language, `${namespace}.json`), 'utf8')
  );
}

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

describe('LOGIN_LOCKOUT configuration', () => {
  it('keeps the whole schedule in one object', () => {
    expect(LOGIN_LOCKOUT.freeAttempts).toBe(3);
    expect(LOGIN_LOCKOUT.lockDurationsSec).toEqual([30, 60, 90]);
    expect(LOGIN_LOCKOUT.permanentAfterLastLock).toBe(true);
    expect(LOGIN_LOCKOUT.ipWindowMinutes).toBe(15);
    expect(LOGIN_LOCKOUT.ipMaxFailedAttempts).toBe(20);
  });
});

describe('attempt schedule', () => {
  it('does not lock for attempts 1-3', () => {
    expect(computeLockoutForAttempt(1)).toBeNull();
    expect(computeLockoutForAttempt(2)).toBeNull();
    expect(computeLockoutForAttempt(3)).toBeNull();
  });

  it('locks 30s / 60s / 90s on attempts 4 / 5 / 6', () => {
    expect(computeLockoutForAttempt(4)).toEqual({ level: 1, durationSeconds: 30 });
    expect(computeLockoutForAttempt(5)).toEqual({ level: 2, durationSeconds: 60 });
    expect(computeLockoutForAttempt(6)).toEqual({ level: 3, durationSeconds: 90 });
  });

  it('locks permanently from attempt 7 until an administrator unlocks', () => {
    expect(computeLockoutForAttempt(7)).toEqual({
      level: 4,
      durationSeconds: 0,
      permanent: true,
    });
    expect(computeLockoutForAttempt(50)?.permanent).toBe(true);
  });

  it('honours an overridden schedule without touching call sites', () => {
    expect(
      computeLockoutForAttempt(4, 0, { freeAttempts: 4, lockDurationsSec: [5] })
    ).toBeNull();
    expect(
      computeLockoutForAttempt(5, 0, { freeAttempts: 4, lockDurationsSec: [5] })
    ).toEqual({ level: 1, durationSeconds: 5 });
  });
});

describe('sequential + concurrent failures', () => {
  it('walks every level from a clean account, using the shared clock', () => {
    let now = T0;
    let state: LockoutSnapshot = emptyLockoutSnapshot();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      state = simulateFailedAttempt(state, now);
      expect(state).toMatchObject({
        failedAttempts: attempt,
        level: 0,
        lockedUntilMs: null,
        permanent: false,
      });
    }

    state = simulateFailedAttempt(state, now);
    expect(state).toMatchObject({ failedAttempts: 4, level: 1, permanent: false });
    expect(state.lockedUntilMs).toBe(now + 30_000);

    // The 5th failure happens while the 30s lock is still running: the lock
    // must not be extended or escalated.
    expect(simulateFailedAttempt(state, now + 5_000)).toEqual(state);

    now += 31_000;
    state = simulateFailedAttempt(state, now);
    expect(state).toMatchObject({ failedAttempts: 5, level: 2, permanent: false });
    expect(state.lockedUntilMs).toBe(now + 60_000);

    now += 61_000;
    state = simulateFailedAttempt(state, now);
    expect(state).toMatchObject({ failedAttempts: 6, level: 3, permanent: false });

    now += 91_000;
    state = simulateFailedAttempt(state, now);
    expect(state).toMatchObject({ failedAttempts: 7, level: 4, permanent: true });
    expect(state.lockedUntilMs).toBeNull();

    // A permanent lock ignores further failures.
    expect(simulateFailedAttempt(state, now + 1_000_000)).toEqual(state);
  });

  it('a burst of 10 parallel wrong passwords cannot skip a level', () => {
    let state = emptyLockoutSnapshot();
    // The database serialises record_failed_login with SELECT ... FOR UPDATE,
    // so this is the worst-case ordering for a simultaneous burst.
    for (let request = 0; request < 10; request += 1) {
      state = simulateFailedAttempt(state, T0);
    }
    expect(state).toMatchObject({
      failedAttempts: 4,
      level: 1,
      permanent: false,
    });
    expect(state.lockedUntilMs).toBe(T0 + 30_000);
  });

  it('keeps counting after a timed lock expires instead of resetting', () => {
    let now = T0;
    let state = emptyLockoutSnapshot();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      state = simulateFailedAttempt(state, now);
    }
    expect(state.level).toBe(1);
    now += 31_000;
    state = simulateFailedAttempt(state, now);
    expect(state).toMatchObject({ failedAttempts: 5, level: 2, permanent: false });
  });
});

describe('lock state helpers', () => {
  it('treats permanent and unexpired locks as active', () => {
    expect(isLockoutActive({ permanent: true }, T0)).toBe(true);
    expect(
      isLockoutActive(
        { locked_until: new Date(T0 + 30_000).toISOString(), permanent: false },
        T0
      )
    ).toBe(true);
    expect(
      isLockoutActive(
        { locked_until: new Date(T0 - 1_000).toISOString(), permanent: false },
        T0
      )
    ).toBe(false);
    expect(isLockoutActive(null, T0)).toBe(false);
  });

  it('computes remaining seconds from server time', () => {
    expect(secondsUntilUnlock(new Date(T0 + 30_000).toISOString(), T0)).toBe(30);
    expect(secondsUntilUnlock(new Date(T0 + 1_500).toISOString(), T0)).toBe(2);
    expect(secondsUntilUnlock(new Date(T0 - 10_000).toISOString(), T0)).toBe(0);
    expect(secondsUntilUnlock(null, T0)).toBe(0);
    expect(normaliseRemainingSeconds(30, T0 + 5_000, T0)).toBe(25);
    expect(normaliseRemainingSeconds(undefined, T0)).toBe(0);
  });

  it('formats the login-page countdown as mm:ss', () => {
    expect(formatLockoutCountdown(90)).toBe('01:30');
    expect(formatLockoutCountdown(30)).toBe('00:30');
    expect(formatLockoutCountdown(5)).toBe('00:05');
    expect(formatLockoutCountdown(0)).toBe('00:00');
    expect(formatLockoutCountdown(3600)).toBe('60:00');
  });
});

describe('lockout translations', () => {
  it('has the required auth keys in English and Sinhala', () => {
    for (const language of ['en', 'si'] as const) {
      const auth = locale(language, 'auth');
      expect(auth.lockedTemp, `${language} auth.lockedTemp`).toContain('{{time}}');
      expect(auth.lockedPermanent, `${language} auth.lockedPermanent`).toBeTruthy();
      expect(auth.invalidCredentials, `${language} auth.invalidCredentials`).toBeTruthy();
      expect(auth.signIn.lockedRetry).toContain('{{time}}');
      expect(auth.banners.lockedPermanentTitle).toBeTruthy();
    }
    expect(locale('si', 'auth').lockedTemp).not.toBe(locale('en', 'auth').lockedTemp);
  });

  it('has API-code messages and admin locked-panel keys in both languages', () => {
    for (const language of ['en', 'si'] as const) {
      const messages = locale(language, 'messages');
      expect(messages.codes.ACCOUNT_LOCKED_TEMP).toContain('{{time}}');
      expect(messages.codes.ACCOUNT_LOCKED_PERMANENT).toBeTruthy();

      const accounts = locale(language, 'accounts');
      expect(accounts.lockedPanel.title).toBeTruthy();
      expect(accounts.lockedPanel.columns).toMatchObject({
        user: expect.any(String),
        email: expect.any(String),
        role: expect.any(String),
        lockedAt: expect.any(String),
        lastIp: expect.any(String),
        attempts: expect.any(String),
      });
      expect(accounts.modals.confirm.keepLockedTitle).toBeTruthy();

      const notifications = locale(language, 'notifications');
      expect(notifications.content.loginLockoutPermanentTitle).toBeTruthy();
      expect(notifications.content.loginLockoutPermanentBody).toContain('{{attempts}}');
      expect(notifications.content.accountUnlockedTitle).toBeTruthy();
    }
  });
});

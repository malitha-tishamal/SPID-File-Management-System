/**
 * Progressive sign-in lockout — the single place the schedule is defined.
 *
 * The server passes these values to the database RPCs, so the SQL escalation
 * cannot drift from the UI, admin screens or tests. Nothing in this module is
 * trusted on its own: the database still owns the counters, the clock and the
 * atomic row lock.
 */

export const LOGIN_LOCKOUT = {
  /** Consecutive wrong passwords allowed before the first timed lock. */
  freeAttempts: 3,
  /** Durations for each lock level, in order: 4th failure -> 30s, 5th -> 60s, 6th -> 90s. */
  lockDurationsSec: [30, 60, 90],
  /** After the last timed lock, the next failure locks until an administrator unlocks. */
  permanentAfterLastLock: true,
  /** Basic per-IP guard: at most N failed attempts inside the rolling window. */
  ipWindowMinutes: 15,
  ipMaxFailedAttempts: 20,
} as const;

export type LockoutSchedule = typeof LOGIN_LOCKOUT;

/** Test/override shape — durations stay plain numbers instead of literal tuples. */
export interface LockoutScheduleOverride {
  freeAttempts?: number;
  lockDurationsSec?: readonly number[];
  permanentAfterLastLock?: boolean;
  ipWindowMinutes?: number;
  ipMaxFailedAttempts?: number;
}

export interface LockoutDecision {
  level: number;
  durationSeconds: number;
  permanent?: boolean;
}

export interface LockoutSnapshot {
  failedAttempts: number;
  level: number;
  /** Epoch milliseconds; null when unlocked. Permanent locks use `permanent: true`. */
  lockedUntilMs: number | null;
  permanent: boolean;
}

export interface LockoutLike {
  locked?: boolean;
  failed_attempts?: number;
  lockout_level?: number;
  locked_until?: string | null;
  remaining_seconds?: number;
  permanent?: boolean;
  is_permanently_locked?: boolean;
}

function scheduleOf(schedule?: LockoutScheduleOverride): Required<Pick<LockoutScheduleOverride, 'freeAttempts' | 'lockDurationsSec' | 'permanentAfterLastLock'>> {
  return {
    freeAttempts: schedule?.freeAttempts ?? LOGIN_LOCKOUT.freeAttempts,
    lockDurationsSec: schedule?.lockDurationsSec ?? LOGIN_LOCKOUT.lockDurationsSec,
    permanentAfterLastLock:
      schedule?.permanentAfterLastLock ?? LOGIN_LOCKOUT.permanentAfterLastLock,
  };
}

/**
 * Returns the lock a failure should trigger, or null when the attempt stays
 * lock-free. `previousLevel` is accepted for call-site compatibility; the
 * attempt count alone determines the level, which keeps retries idempotent.
 */
export function computeLockoutForAttempt(
  failedAttemptsAfterIncrement: number,
  _previousLevel = 0,
  schedule?: LockoutScheduleOverride
): LockoutDecision | null {
  const config = scheduleOf(schedule);
  const attempts = Math.max(0, Math.floor(Number(failedAttemptsAfterIncrement) || 0));
  if (attempts <= config.freeAttempts) return null;

  const level = attempts - config.freeAttempts;
  if (level <= config.lockDurationsSec.length) {
    return { level, durationSeconds: config.lockDurationsSec[level - 1] };
  }
  if (config.permanentAfterLastLock) {
    return { level: config.lockDurationsSec.length + 1, durationSeconds: 0, permanent: true };
  }
  return null;
}

/** True while a snapshotted lock is still in force. */
export function isLockoutActive(state: LockoutLike | null | undefined, nowMs = Date.now()): boolean {
  if (!state) return false;
  if (state.is_permanently_locked || state.permanent) {
    return state.locked !== false;
  }
  if (!state.locked_until) return false;
  const until = Date.parse(state.locked_until);
  return Number.isFinite(until) && until > nowMs;
}

/** Whole seconds until a lock expires, rounded up. Permanent locks return 0. */
export function secondsUntilUnlock(lockedUntilIso: string | null | undefined, nowMs = Date.now()): number {
  if (!lockedUntilIso) return 0;
  const until = Date.parse(lockedUntilIso);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil((until - nowMs) / 1000));
}

/** Remaining seconds from a server-provided `remaining_seconds` value. */
export function normaliseRemainingSeconds(value: unknown, nowMs = Date.now(), receivedAtMs = nowMs): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0;
  const elapsed = Math.max(0, Math.floor((nowMs - receivedAtMs) / 1000));
  return Math.max(0, Math.ceil(seconds) - elapsed);
}

/** `mm:ss` for the login-page countdown (90 -> "01:30"). */
export function formatLockoutCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function emptyLockoutSnapshot(): LockoutSnapshot {
  return { failedAttempts: 0, level: 0, lockedUntilMs: null, permanent: false };
}

/**
 * Pure mirror of the database rule, used by unit tests to prove that a burst
 * of parallel failures walks the levels one at a time instead of skipping.
 */
export function simulateFailedAttempt(
  current: LockoutSnapshot,
  nowMs = Date.now(),
  schedule?: LockoutScheduleOverride
): LockoutSnapshot {
  if (isLockoutActive(
    {
      locked: true,
      locked_until: current.lockedUntilMs ? new Date(current.lockedUntilMs).toISOString() : null,
      is_permanently_locked: current.permanent,
      permanent: current.permanent,
    },
    nowMs
  )) {
    return current;
  }

  const failedAttempts = current.failedAttempts + 1;
  const decision = computeLockoutForAttempt(failedAttempts, current.level, schedule);
  if (!decision) {
    return { failedAttempts, level: 0, lockedUntilMs: null, permanent: false };
  }
  return {
    failedAttempts,
    level: decision.level,
    lockedUntilMs: decision.permanent ? null : nowMs + decision.durationSeconds * 1000,
    permanent: decision.permanent === true,
  };
}

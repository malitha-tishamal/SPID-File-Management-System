import type { LockoutState, LoginAttemptReason } from 'types/auth';
import { getSupabaseAdminClient } from 'config/supabase/server';
import {
  LoginSecurityRepository,
  type IpRateLimitState,
  type LoginAttemptInput,
} from 'models/LoginSecurityRepository';

/**
 * Application service layer: progressive login lockout for every entry point
 * that verifies a password. All state lives in the database (database clock,
 * atomic row locks); nothing is stored in the browser.
 */
export class LockoutService {
  private static repo(): LoginSecurityRepository {
    return new LoginSecurityRepository(getSupabaseAdminClient());
  }

  static async check(userId: string): Promise<LockoutState | null> {
    try {
      return await this.repo().checkLockout(userId);
    } catch (err) {
      console.warn('[lockout] state check failed:', err);
      return null;
    }
  }

  static async recordFailedAttempt(
    userId: string,
    meta?: { ip?: string | null; userAgent?: string | null }
  ): Promise<LockoutState | null> {
    try {
      return await this.repo().recordFailedLogin(userId, meta);
    } catch (err) {
      console.warn('[lockout] could not record failed attempt:', err);
      return null;
    }
  }

  static async resetOnSuccess(userId: string): Promise<void> {
    try {
      await this.repo().resetFailedLogin(userId);
    } catch (err) {
      console.warn('[lockout] could not reset counters:', err);
    }
  }

  static async adminClear(userId: string): Promise<void> {
    await this.repo().adminClearLockout(userId);
  }

  static async checkIpRateLimit(ip: string | null): Promise<IpRateLimitState> {
    try {
      return await this.repo().checkIpRateLimit(ip);
    } catch (err) {
      console.warn('[lockout] IP rate limit check failed:', err);
      return { limited: false, failed_in_window: 0, retry_after_seconds: 0 };
    }
  }

  /** Audit every attempt (success, wrong password, or a rejected locked attempt). */
  static async logAttempt(input: LoginAttemptInput): Promise<number> {
    try {
      return await this.repo().recordLoginAttempt(input);
    } catch (err) {
      console.warn('[lockout] could not audit login attempt:', err);
      return 0;
    }
  }

  static isLocked(state: LockoutState | null | undefined): boolean {
    return state?.locked === true;
  }

  static isPermanent(state: LockoutState | null | undefined): boolean {
    return state?.permanent === true || state?.is_permanently_locked === true;
  }

  static reasonForState(state: LockoutState | null | undefined): LoginAttemptReason {
    return this.isPermanent(state) ? 'LOCKED_PERMANENT' : 'LOCKED_TEMP';
  }
}

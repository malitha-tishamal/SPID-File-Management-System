import type { LockoutState } from 'types/auth';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { LoginSecurityRepository } from 'models/LoginSecurityRepository';

/**
 * Application service layer: progressive login lockout.
 * All state lives in the database (database clock, atomic row locks);
 * nothing is stored in the browser.
 */
export class LockoutService {
  private static repo(): LoginSecurityRepository {
    return new LoginSecurityRepository(getSupabaseAdminClient());
  }

  static async check(userId: string): Promise<LockoutState | null> {
    return this.repo().checkLockout(userId);
  }

  static async recordFailedAttempt(userId: string): Promise<LockoutState | null> {
    return this.repo().recordFailedLogin(userId);
  }

  static async resetOnSuccess(userId: string): Promise<void> {
    await this.repo().resetFailedLogin(userId);
  }

  static async adminClear(userId: string): Promise<void> {
    await this.repo().adminClearLockout(userId);
  }
}

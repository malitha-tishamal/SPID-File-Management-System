import type { SupabaseClient } from '@supabase/supabase-js';
import type { LockoutState } from 'types/auth';

/**
 * Model layer: login_security access via SECURITY DEFINER RPCs.
 * Uses database time and atomic row locks — never client-side counters.
 */
export class LoginSecurityRepository {
  constructor(private adminClient: SupabaseClient) {}

  async checkLockout(userId: string): Promise<LockoutState | null> {
    const { data, error } = await this.adminClient.rpc('check_lockout', { p_user_id: userId });
    if (error || !data) return null;
    return data as LockoutState;
  }

  async recordFailedLogin(userId: string): Promise<LockoutState | null> {
    const { data, error } = await this.adminClient.rpc('record_failed_login', {
      p_user_id: userId,
    });
    if (error || !data) return null;
    return data as LockoutState;
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.adminClient.rpc('reset_failed_login', { p_user_id: userId });
  }

  async adminClearLockout(userId: string): Promise<void> {
    await this.adminClient.rpc('admin_clear_lockout', { p_user_id: userId });
  }
}

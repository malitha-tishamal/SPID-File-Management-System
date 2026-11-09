import type { SupabaseClient } from '@supabase/supabase-js';
import type { LockoutState, LoginAttemptReason } from 'types/auth';
import { LOGIN_LOCKOUT } from 'lib/auth/lockout';

export interface IpRateLimitState {
  limited: boolean;
  failed_in_window: number;
  retry_after_seconds: number;
}

export interface LoginAttemptInput {
  userId: string | null;
  email: string;
  ip?: string | null;
  userAgent?: string | null;
  success: boolean;
  reason: LoginAttemptReason;
}

/** PostgREST reports a not-yet-applied migration in a few different ways. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /does not exist|not found in the schema cache|could not find the function/i.test(
      error.message ?? ''
    )
  );
}

/**
 * Model layer: login_security + login_attempts access via SECURITY DEFINER
 * RPCs. Uses database time and atomic row locks — never client-side counters.
 */
export class LoginSecurityRepository {
  constructor(private adminClient: SupabaseClient) {}

  async checkLockout(userId: string): Promise<LockoutState | null> {
    const { data, error } = await this.adminClient.rpc('check_lockout', { p_user_id: userId });
    if (error || !data) return null;
    return data as LockoutState;
  }

  /**
   * Records one failed password attempt atomically. The schedule values come
   * from LOGIN_LOCKOUT so the SQL never owns a second copy of the numbers.
   */
  async recordFailedLogin(
    userId: string,
    meta?: { ip?: string | null; userAgent?: string | null }
  ): Promise<LockoutState | null> {
    const { data, error } = await this.adminClient.rpc('record_failed_login', {
      p_user_id: userId,
      p_free_attempts: LOGIN_LOCKOUT.freeAttempts,
      p_lock_durations: [...LOGIN_LOCKOUT.lockDurationsSec],
      p_permanent_after: LOGIN_LOCKOUT.permanentAfterLastLock,
    });

    const state = await this.resolveRecordResult(userId, data, error);

    // Evidence for the admin "Last failed IP" column. Informational only, so a
    // failure here must never undo the atomic counter update above; it is
    // skipped entirely on databases that predate migration 0026.
    if (meta && (meta.ip || meta.userAgent)) {
      try {
        await this.adminClient
          .from('login_security')
          .update({
            last_failed_login_ip: meta.ip ?? null,
            last_failed_login_user_agent: meta.userAgent ?? null,
          })
          .eq('user_id', userId);
      } catch {}
    }

    return state;
  }

  private async resolveRecordResult(
    userId: string,
    data: unknown,
    error: { code?: string; message?: string } | null
  ): Promise<LockoutState | null> {
    if (error) {
      if (!isMissingFunction(error)) {
        throw new Error(`LoginSecurityRepository.recordFailedLogin error: ${error.message}`);
      }
      // Migration 0026 not applied yet: keep the legacy atomic RPC working.
      const legacy = await this.adminClient.rpc('record_failed_login', { p_user_id: userId });
      if (legacy.error || !legacy.data) return null;
      return legacy.data as LockoutState;
    }

    return (data as LockoutState) ?? null;
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.adminClient.rpc('reset_failed_login', { p_user_id: userId });
  }

  async adminClearLockout(userId: string): Promise<void> {
    await this.adminClient.rpc('admin_clear_lockout', { p_user_id: userId });
  }

  /** Per-IP guard: N failed attempts inside the rolling window. */
  async checkIpRateLimit(ip: string | null): Promise<IpRateLimitState> {
    const empty: IpRateLimitState = {
      limited: false,
      failed_in_window: 0,
      retry_after_seconds: 0,
    };
    if (!ip) return empty;

    const { data, error } = await this.adminClient.rpc('check_ip_rate_limit', {
      p_ip: ip,
      p_window_minutes: LOGIN_LOCKOUT.ipWindowMinutes,
      p_max_failed: LOGIN_LOCKOUT.ipMaxFailedAttempts,
    });

    if (error) {
      if (!isMissingFunction(error)) {
        console.warn('[lockout] IP rate limit check failed:', error.message);
      }
      return empty;
    }

    const state = (data ?? empty) as IpRateLimitState;
    return {
      limited: state.limited === true,
      failed_in_window: Number(state.failed_in_window) || 0,
      retry_after_seconds: Math.max(0, Number(state.retry_after_seconds) || 0),
    };
  }

  /** Audit one attempt. Never receives the password. */
  async recordLoginAttempt(input: LoginAttemptInput): Promise<number> {
    const { data, error } = await this.adminClient.rpc('record_login_attempt', {
      p_user_id: input.userId,
      p_email: input.email,
      p_ip: input.ip ?? null,
      p_user_agent: input.userAgent ?? null,
      p_success: input.success,
      p_reason: input.reason,
      p_window_minutes: LOGIN_LOCKOUT.ipWindowMinutes,
    });

    if (error) {
      if (!isMissingFunction(error)) {
        console.warn('[lockout] could not record login attempt:', error.message);
      }
      return 0;
    }

    return Number((data as { failed_in_window?: number } | null)?.failed_in_window) || 0;
  }
}

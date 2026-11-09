// In-memory 15s session profile cache to avoid redundant DB round-trips for admin checks
const sessionProfileCache = new Map<string, { profile: ProfileDTO; expiresAt: number }>();

// Short-lived lockout cache: API traffic must not hit the lockout RPC on every
// request, but a permanent lock has to take effect almost immediately.
const lockStateCache = new Map<string, { state: LockoutState | null; expiresAt: number }>();
const LOCK_STATE_TTL_MS = 10_000;

export function invalidateSessionProfileCache(userId?: string) {
  if (userId) {
    sessionProfileCache.delete(userId);
  } else {
    sessionProfileCache.clear();
  }
}

export function invalidateLockStateCache(userId?: string) {
  if (userId) {
    lockStateCache.delete(userId);
  } else {
    lockStateCache.clear();
  }
}

import type { LockoutState, ProfileDTO } from 'types/auth';
import { ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { LockoutService } from 'services/LockoutService';
import { cookies } from 'next/headers';
import {
  SESSION_EXPIRED_INACTIVITY_CODE,
  SESSION_META_COOKIE,
  isSessionExpired,
  parseSessionMeta,
  type SessionMeta,
} from 'lib/sessionPolicy';

const STATUS_DENIALS: Record<
  string,
  { code: 'ACCOUNT_PENDING' | 'ACCOUNT_DISABLED' | 'ACCOUNT_LOCKED' | 'ACCOUNT_REJECTED'; message: string }
> = {
  pending: {
    code: 'ACCOUNT_PENDING',
    message: 'Your account is awaiting administrator approval. Please contact the system administrator.',
  },
  disabled: {
    code: 'ACCOUNT_DISABLED',
    message: 'Your account has been disabled. Please contact the system administrator.',
  },
  locked: {
    code: 'ACCOUNT_LOCKED',
    message: 'Your account is temporarily locked due to security restrictions. Please try again later or contact the administrator.',
  },
  rejected: {
    code: 'ACCOUNT_REJECTED',
    message: 'Your account registration was declined. Please contact the system administrator.',
  },
};

/** 423 for a session that hits a locked account (refresh/API access). */
function lockDeniedError(state: LockoutState): ApiError {
  if (LockoutService.isPermanent(state)) {
    return new ApiError(
      423,
      'ACCOUNT_LOCKED_PERMANENT',
      'This account is locked until an administrator unlocks it.',
      { permanent: true }
    );
  }
  const retryAfterSec = Math.max(1, Math.ceil(Number(state.remaining_seconds) || 0));
  return new ApiError(
    423,
    'ACCOUNT_LOCKED_TEMP',
    `Too many failed sign-in attempts. Please try again in ${retryAfterSec} seconds.`,
    { retryAfterSec, permanent: false },
    { 'Retry-After': String(retryAfterSec) }
  );
}

/**
 * Application service layer: session/profile lookups and
 * server-side authorization gates used by API routes.
 */
export class AuthorizationService {
  /** Lockout state with a 10s cache (permanent locks revoke sessions). */
  private static async getCachedLockState(userId: string): Promise<LockoutState | null> {
    const now = Date.now();
    const cached = lockStateCache.get(userId);
    if (cached && now < cached.expiresAt) return cached.state;

    const state = await LockoutService.check(userId);
    lockStateCache.set(userId, { state, expiresAt: now + LOCK_STATE_TTL_MS });
    return state;
  }

  /** True when this user's sessions must no longer be honoured. */
  private static async isSessionLocked(userId: string): Promise<boolean> {
    const state = await this.getCachedLockState(userId);
    if (!state?.locked) return false;
    if (LockoutService.isPermanent(state)) {
      // Backstop for a refresh token that survived the escalation path.
      void this.revokeAllSessions(userId);
    }
    return true;
  }

  /** The raw activity anchor from the httpOnly cookie, or null. */
  static async getSessionMeta(): Promise<SessionMeta | null> {
    try {
      const cookieStore = await cookies();
      return parseSessionMeta(cookieStore.get(SESSION_META_COOKIE)?.value);
    } catch {
      return null;
    }
  }

  /** Returns the signed-in user's profile, or null when unauthenticated. */
  static async getSessionProfile(): Promise<ProfileDTO | null> {
    const meta = await this.getSessionMeta();

    // No activity anchor, or an anchor older than the inactivity window,
    // means the session is over — even if the Supabase refresh token is still
    // technically valid.
    if (!meta || isSessionExpired(meta)) return null;

    let userId: string | null = null;
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (!error && user?.id) userId = user.id;
    } catch {}

    if (userId && userId !== meta.id) {
      // The cookie jar now belongs to a different identity; the anchor is stale.
      return null;
    }

    // Supabase token temporarily unavailable (refresh race) — trust the meta
    // cookie only while its inactivity deadline is still valid.
    if (!userId) userId = meta.id;

    const now = Date.now();
    const cached = sessionProfileCache.get(userId);
    if (cached && now < cached.expiresAt) {
      if (cached.profile.is_deleted) return null;
      if (await this.isSessionLocked(userId)) return null;
      return cached.profile;
    }

    try {
      const admin = getSupabaseAdminClient();
      const profile = await new ProfileRepository(admin).findActiveById(userId);
      if (!profile) return null;
      // A lock must invalidate every existing session and refresh token path,
      // not just the next sign-in attempt.
      if (await this.isSessionLocked(userId)) return null;
      sessionProfileCache.set(userId, { profile, expiresAt: now + 15_000 });
      return profile;
    } catch {
      return null;
    }
  }

  /** Enforces: authenticated + approved account. */
  static async requireApprovedProfile(): Promise<ProfileDTO> {
    const profile = await this.getSessionProfile();
    if (!profile) {
      const meta = await this.getSessionMeta();
      if (meta) {
        const lockState = await this.getCachedLockState(meta.id);
        if (lockState?.locked) throw lockDeniedError(lockState);
      }
      if (meta && isSessionExpired(meta)) {
        throw new ApiError(
          401,
          SESSION_EXPIRED_INACTIVITY_CODE,
          'Your session expired after a period of inactivity. Please sign in again.'
        );
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (profile.account_status !== 'approved') {
      const denial = STATUS_DENIALS[profile.account_status] ?? STATUS_DENIALS.pending;
      throw new ApiError(403, denial.code, denial.message);
    }
    return profile;
  }

  /** Enforces: authenticated + approved + Administrator role. */
  static async requireAdminProfile(): Promise<ProfileDTO> {
    const profile = await this.requireApprovedProfile();
    if (profile.role !== 'Administrator') {
      throw new ApiError(403, 'FORBIDDEN', 'Administrator privileges required.');
    }
    return profile;
  }

  /** Revokes every refresh/session token for a user (disable/reject flows). */
  static async revokeAllSessions(userId: string): Promise<void> {
    const admin = getSupabaseAdminClient();
    await admin.auth.admin.signOut(userId);
    invalidateSessionProfileCache(userId);
    invalidateLockStateCache(userId);
  }
}

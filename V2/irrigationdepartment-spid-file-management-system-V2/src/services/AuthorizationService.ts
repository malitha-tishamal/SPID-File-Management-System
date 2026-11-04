// In-memory 15s session profile cache to avoid redundant DB round-trips for admin checks
const sessionProfileCache = new Map<string, { profile: ProfileDTO; expiresAt: number }>();

export function invalidateSessionProfileCache(userId?: string) {
  if (userId) {
    sessionProfileCache.delete(userId);
  } else {
    sessionProfileCache.clear();
  }
}

import type { ProfileDTO } from 'types/auth';
import { ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { cookies } from 'next/headers';
import {
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

/**
 * Application service layer: session/profile lookups and
 * server-side authorization gates used by API routes.
 */
export class AuthorizationService {
  /** Returns the signed-in user's profile, or null when unauthenticated. */
  static async getSessionProfile(): Promise<ProfileDTO | null> {
    let meta: SessionMeta | null = null;
    try {
      const cookieStore = await cookies();
      meta = parseSessionMeta(cookieStore.get(SESSION_META_COOKIE)?.value);
    } catch {}

    // No activity anchor, or an anchor older than 2 hours, means the session
    // is over — even if the Supabase refresh token is still technically valid.
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
      return cached.profile;
    }

    try {
      const admin = getSupabaseAdminClient();
      const profile = await new ProfileRepository(admin).findById(userId);
      if (profile) {
        sessionProfileCache.set(userId, { profile, expiresAt: now + 15_000 });
      }
      return profile;
    } catch {
      return null;
    }
  }

  /** Enforces: authenticated + approved account. */
  static async requireApprovedProfile(): Promise<ProfileDTO> {
    const profile = await this.getSessionProfile();
    if (!profile) {
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
  }
}

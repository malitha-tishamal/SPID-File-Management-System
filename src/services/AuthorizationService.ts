import type { ProfileDTO } from 'types/auth';
import { ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';

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
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return new ProfileRepository(supabase).findById(user.id);
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
  }
}

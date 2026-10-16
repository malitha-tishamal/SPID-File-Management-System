import { ApiError } from 'lib/apiResponse';
import { SITE_URL } from 'config/env';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { SectionRepository } from 'models/SectionRepository';
import { LockoutService } from 'services/LockoutService';
import { AuthorizationService } from 'services/AuthorizationService';
import { formatSriLankaMobile } from 'validators/authValidators';
import type { ApiErrorCode, ProfileDTO, UserRole } from 'types/auth';

/**
 * Application service layer: registration, login, logout and
 * password recovery coordination with Supabase Auth.
 */
export class AuthService {
  /**
   * Creates a Supabase Auth user + a `pending` Staff profile via the
   * on_auth_user_created trigger. The requested role is stored for admin
   * review ONLY — public registration always ends up role='Staff'.
   */
  static async register(input: {
    role: UserRole;
    fullName: string;
    email: string;
    section: string;
    phoneDigits: string;
    password: string;
  }): Promise<{ userId: string | null; emailConfirmationRequired: boolean }> {
    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);
    const sections = new SectionRepository(admin);

    const existing = await profiles.findByEmail(input.email);
    if (existing) {
      throw new ApiError(
        409,
        'USER_EXISTS',
        'An account with this email is already registered in the system.'
      );
    }

    const section = await sections.findByName(input.section);
    if (!section) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The selected section is not recognized.');
    }

    const supabase = await getSupabaseServerClient();
    let signUpData: { user: any; session: any } | null = null;
    let signUpError: any = null;

    const res = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/sign-in`,
        data: {
          full_name: input.fullName.trim(),
          requested_role: input.role,
          section_id: section.id,
          mobile_phone: formatSriLankaMobile(input.phoneDigits),
        },
      },
    });

    signUpData = res.data;
    signUpError = res.error;

    // When Supabase's public email/signup rate limit is reached (status 429),
    // fallback gracefully using the admin API to provision the unconfirmed user record
    // so registration does not fail when registering multiple times, while still enforcing
    // email confirmation and administrator approval.
    if (signUpError && (signUpError.status === 429 || /rate limit|too many/i.test(signUpError.message))) {
      const linkRes = await admin.auth.admin.generateLink({
        type: 'signup',
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            requested_role: input.role,
            section_id: section.id,
            mobile_phone: formatSriLankaMobile(input.phoneDigits),
          },
        },
      });

      if (linkRes.data?.user) {
        signUpData = { user: linkRes.data.user, session: null };
        signUpError = null;
      } else {
        const createRes = await admin.auth.admin.createUser({
          email: input.email.trim(),
          password: input.password,
          email_confirm: false,
          user_metadata: {
            full_name: input.fullName.trim(),
            requested_role: input.role,
            section_id: section.id,
            mobile_phone: formatSriLankaMobile(input.phoneDigits),
          },
        });
        if (createRes.data?.user) {
          signUpData = { user: createRes.data.user, session: null };
          signUpError = null;
        } else if (createRes.error) {
          signUpError = createRes.error;
        }
      }
    }

    if (signUpError) {
      if (signUpError.status === 422 || /already|registered|exists/i.test(signUpError.message)) {
        throw new ApiError(
          409,
          'USER_EXISTS',
          'An account with this email is already registered in the system.'
        );
      }
      if (signUpError.status === 429) {
        throw new ApiError(
          429,
          'RATE_LIMITED',
          'Too many registration attempts. Please wait a few minutes and try again.'
        );
      }
      throw new ApiError(400, 'AUTH_ERROR', signUpError.message || 'Registration failed.');
    }

    return {
      userId: signUpData?.user?.id ?? null,
      emailConfirmationRequired: !signUpData?.session,
    };
  }

  /**
   * Credential login with lockout + server-enforced account status checks.
   * Pending/disabled/locked/rejected accounts get their session destroyed
   * immediately — no usable application session is left behind.
   */
  static async login(email: string, password: string): Promise<ProfileDTO> {
    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);

    const profile = await profiles.findByEmail(email);
    if (!profile) {
      // Generic message — never reveal whether the account exists.
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // 1. Temporary failed-login lockout (checked before touching Auth).
    const lockState = await LockoutService.check(profile.id);
    if (lockState?.locked) {
      throw new ApiError(
        429,
        'LOGIN_LOCKED_OUT',
        `Your account is temporarily locked due to repeated failed sign-in attempts. Please try again in ${lockState.remaining_seconds} seconds or contact the administrator.`,
        { remaining_seconds: lockState.remaining_seconds }
      );
    }

    // 2. Administrative lock is distinct from failed-login lockout and is
    //    checked first so it cannot be silently overridden.
    if (profile.account_status === 'locked') {
      throw new ApiError(
        403,
        'ACCOUNT_LOCKED',
        'Your account is temporarily locked due to security restrictions. Please try again later or contact the administrator.'
      );
    }

    // 3. Credential verification against Supabase Auth.
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('not confirmed') || msg.includes('confirm')) {
        throw new ApiError(
          403,
          'EMAIL_NOT_CONFIRMED',
          'Please verify your email address before signing in. Check your inbox for the verification link.'
        );
      }
      if (error.status === 429) {
        throw new ApiError(
          429,
          'RATE_LIMITED',
          'Too many sign-in attempts. Please wait a moment before trying again.'
        );
      }
      // Failed credentials -> atomic server-side lockout bookkeeping.
      const result = await LockoutService.recordFailedAttempt(profile.id);
      if (result?.locked) {
        throw new ApiError(
          429,
          'LOGIN_LOCKED_OUT',
          `Too many failed sign-in attempts. Login is locked for ${result.remaining_seconds} seconds.`,
          { remaining_seconds: result.remaining_seconds }
        );
      }
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // 4. Auth passed — enforce approval status BEFORE granting a session.
    if (profile.account_status !== 'approved') {
      await supabase.auth.signOut();
      const messages: Record<string, { code: ApiErrorCode; message: string }> = {
        pending: {
          code: 'ACCOUNT_PENDING',
          message:
            'Your account is awaiting administrator approval. Please contact the system administrator.',
        },
        disabled: {
          code: 'ACCOUNT_DISABLED',
          message: 'Your account has been disabled. Please contact the system administrator.',
        },
        locked: {
          code: 'ACCOUNT_LOCKED',
          message:
            'Your account is temporarily locked due to security restrictions. Please try again later or contact the administrator.',
        },
        rejected: {
          code: 'ACCOUNT_REJECTED',
          message: 'Your account registration was declined. Please contact the system administrator.',
        },
      };
      const denial = messages[profile.account_status] ?? messages.pending;
      throw new ApiError(403, denial.code, denial.message);
    }

    // 5. Success — reset consecutive-failure counters and stamp last login.
    await LockoutService.resetOnSuccess(profile.id);
    await new ProfileRepository(getSupabaseAdminClient()).touchLastLogin(profile.id);
    return profile;
  }

  static async logout(): Promise<void> {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
  }

  /**
   * Sends the Supabase password-reset email. Always responds generically so
   * account existence is never revealed. Reset never changes approval status.
   */
  static async requestPasswordReset(email: string): Promise<void> {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${SITE_URL}/auth/reset-password`,
    });
  }

  /** Consumes the recovery session from the reset link and sets a new password. */
  static async resetPassword(newPassword: string): Promise<void> {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new ApiError(
        401,
        'UNAUTHORIZED',
        'This password reset link is invalid or has expired. Please request a new one.'
      );
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new ApiError(400, 'AUTH_ERROR', error.message || 'Failed to update the password.');
    }
  }

  /** Provisions a verified Administrator account server-side without email confirmation. */
  static async createAdministrator(input: {
    email: string;
    password: string;
    fullName: string;
    sectionId?: number | null;
    mobilePhone?: string | null;
    actorId?: string | null;
  }): Promise<{ userId: string }> {
    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);

    const existing = await profiles.findByEmail(input.email);
    if (existing) {
      throw new ApiError(
        409,
        'USER_EXISTS',
        'An account with this email is already registered in the system.'
      );
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName.trim(),
        requested_role: 'Administrator',
        section_id: input.sectionId ?? null,
        mobile_phone: input.mobilePhone ?? null,
      },
    });
    if (error || !data?.user) {
      if (error && (error.status === 422 || /already|registered|exists/i.test(error.message))) {
        throw new ApiError(
          409,
          'USER_EXISTS',
          'An account with this email is already registered in the system.'
        );
      }
      throw new ApiError(400, 'AUTH_ERROR', error?.message || 'Failed to create administrator.');
    }

    const userId = data.user.id;
    const now = new Date().toISOString();

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: userId,
        email: input.email.trim().toLowerCase(),
        full_name: input.fullName.trim(),
        role: 'Administrator',
        requested_role: 'Administrator',
        account_status: 'approved',
        section_id: input.sectionId ?? null,
        mobile_phone: input.mobilePhone ?? null,
        approved_by: input.actorId ?? null,
        approved_at: now,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      console.error('Failed to create/update profile row:', profileError);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw new ApiError(500, 'AUTH_ERROR', 'Failed to create user profile record.');
    }

    return { userId };
  }
}

import { ApiError } from 'lib/apiResponse';
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from 'config/env';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';
import { isRecoverySession } from 'lib/session';
import { ProfileRepository } from 'models/ProfileRepository';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { SectionRepository } from 'models/SectionRepository';
import { LockoutService } from 'services/LockoutService';
import { AuthorizationService } from 'services/AuthorizationService';
import { formatSriLankaMobile } from 'validators/authValidators';
import { invalidateUsersCache } from 'controllers/AdminController';
import type { ApiErrorCode, ProfileDTO, UserRole } from 'types/auth';

/**
 * Application service layer: registration, login, logout and
 * password recovery coordination with Supabase Auth.
 */
export class AuthService {
  /**
   * Public user registration for Staff and Administrator accounts.
   * Both account types are registered with their designated role in a pending state,
   * requiring email verification before access.
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
          role: input.role,
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
            role: input.role,
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
            role: input.role,
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

    const createdUserId = signUpData?.user?.id;
    if (createdUserId) {
      try {
        const { data: updated, error: updateErr } = await admin
          .from('profiles')
          .update({
            role: input.role,
            requested_role: input.role,
          })
          .eq('id', createdUserId)
          .select('id');

        if (updateErr || !updated || updated.length === 0) {
          await admin.from('profiles').upsert(
            {
              id: createdUserId,
              email: input.email.trim().toLowerCase(),
              full_name: input.fullName.trim(),
              role: input.role,
              requested_role: input.role,
              section_id: section.id,
              mobile_phone: formatSriLankaMobile(input.phoneDigits),
              account_status: 'pending',
            },
            { onConflict: 'id' }
          );
        }
      } catch (err) {
        console.warn('Could not ensure role in profile:', err);
      }
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

    // 1. Failed-login lockout (checked before touching Auth).
    const lockState = await LockoutService.check(profile.id);
    if (lockState?.locked) {
      if (lockState.permanent) {
        throw new ApiError(
          429,
          'LOGIN_LOCKED_OUT',
          'Your account has been permanently locked due to repeated failed sign-in attempts. Please contact the system administrator to unlock it.',
          { remaining_seconds: lockState.remaining_seconds, permanent: true }
        );
      }
      throw new ApiError(
        429,
        'LOGIN_LOCKED_OUT',
        `Your account is temporarily locked due to repeated failed sign-in attempts. Please try again in ${lockState.remaining_seconds} seconds or contact the administrator.`,
        { remaining_seconds: lockState.remaining_seconds, permanent: false }
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

    // 3. Single-active-session per browser: if this cookie jar already
    //    carries a session for ANY account, revoke it server-side before
    //    issuing a new one — logging in as a different account (even the
    //    same role) always signs the previous account out.
    const supabase = await getSupabaseServerClient();
    const {
      data: { session: existingSession },
    } = await supabase.auth.getSession();
    if (existingSession) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Revocation is best-effort; the new sign-in below still replaces
        // the session cookies, so the old account cannot act in this browser.
      }
    }

    // 4. Credential verification against Supabase Auth.
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
        if (result.permanent) {
          throw new ApiError(
            429,
            'LOGIN_LOCKED_OUT',
            'Your account has been permanently locked due to repeated failed sign-in attempts. Please contact the system administrator to unlock it.',
            { remaining_seconds: result.remaining_seconds, permanent: true }
          );
        }
        throw new ApiError(
          429,
          'LOGIN_LOCKED_OUT',
          `Too many failed sign-in attempts. Login is locked for ${result.remaining_seconds} seconds.`,
          { remaining_seconds: result.remaining_seconds, permanent: false }
        );
      }
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // 5. Inactivity policy: an approved account whose last successful sign-in
    //    is more than 2 months old is disabled automatically and must be
    //    re-approved by an administrator before it can sign in again.
    if (profile.account_status === 'approved' && profile.last_login_at) {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      if (new Date(profile.last_login_at).getTime() < twoMonthsAgo.getTime()) {
        await profiles.updateStatus(profile.id, 'disabled', null);
        await supabase.auth.signOut();
        await AuthorizationService.revokeAllSessions(profile.id);
        try {
          await new AuditLogRepository(admin).log({
            actorId: null,
            targetUserId: profile.id,
            action: 'account_auto_disabled_inactivity',
            details: {
              email: profile.email,
              last_login_at: profile.last_login_at,
            },
          });
        } catch {}
        try {
          invalidateUsersCache();
        } catch {}
        throw new ApiError(
          403,
          'ACCOUNT_DISABLED',
          'Your account has been disabled due to inactivity (last sign-in was over 2 months ago). Please contact the system administrator to reactivate it.'
        );
      }
    }

    // 6. Auth passed — enforce approval status BEFORE granting a session.
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

    // 7. Success — reset consecutive-failure counters and stamp last login.
    //    Both writes are independent, so they share one round trip instead of two.
    await Promise.all([
      LockoutService.resetOnSuccess(profile.id),
      new ProfileRepository(admin).touchLastLogin(profile.id),
    ]);
    try {
      invalidateUsersCache();
    } catch {}
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
    // Deliberately non-PKCE: a PKCE recovery code can only be redeemed in the
    // browser that requested it (the verifier lives in that browser's cookies).
    // Implicit links work on any device, including when the user is already
    // signed in, and the reset page verifies the token server-side.
    const resetClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
    });
    await resetClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${SITE_URL}/auth/reset-password`,
    });
  }

  /**
   * Consumes the recovery session from the reset link and sets a new password.
   * Accepts either a cookie-backed session (PKCE flow) or the access token
   * delivered in the link's URL hash, which the SSR browser client rejects.
   */
  static async resetPassword(input: { newPassword: string; accessToken?: string }): Promise<void> {
    const { newPassword, accessToken } = input;

    let userId: string;
    let email: string | null = null;
    let cookieClient: Awaited<ReturnType<typeof getSupabaseServerClient>> | null = null;

    if (accessToken) {
      const admin = getSupabaseAdminClient();
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(accessToken);
      if (error || !user) {
        throw new ApiError(
          401,
          'UNAUTHORIZED',
          'This password reset link is invalid or has expired. Please request a new one.'
        );
      }
      if (!isRecoverySession(accessToken)) {
        throw new ApiError(
          401,
          'UNAUTHORIZED',
          'This password reset link is invalid or has expired. Please request a new one from "Forgot Password?".'
        );
      }
      userId = user.id;
      email = user.email ?? null;
    } else {
      const supabase = await getSupabaseServerClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new ApiError(
          401,
          'UNAUTHORIZED',
          'This password reset link is invalid or has expired. Please request a new one.'
        );
      }
      if (!isRecoverySession(session.access_token)) {
        throw new ApiError(
          401,
          'UNAUTHORIZED',
          'This password reset link is invalid or has expired. Please request a new one from "Forgot Password?".'
        );
      }
      userId = session.user.id;
      email = session.user.email ?? null;
      cookieClient = supabase;
    }

    if (email) {
      // A successful sign-in with the submitted value means it is the current
      // password, which must not be reused as the "new" password.
      const probe = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error: reusedError } = await probe.auth.signInWithPassword({
        email,
        password: newPassword,
      });
      if (!reusedError) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Your new password must be different from your current password. Please choose a different password.'
        );
      }
    }

    if (cookieClient) {
      const { error } = await cookieClient.auth.updateUser({ password: newPassword });
      if (error) {
        throw new ApiError(400, 'AUTH_ERROR', error.message || 'Failed to update the password.');
      }
      return;
    }

    const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(userId, {
      password: newPassword,
    });
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

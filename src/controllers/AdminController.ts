import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { AuditLogRepository } from 'models/AuditLogRepository';
import {
  AuthorizationService,
  invalidateLockStateCache,
  invalidateSessionProfileCache,
} from 'services/AuthorizationService';
import { LockoutService } from 'services/LockoutService';
import { NotificationService } from 'services/NotificationService';
import { UserDeletionService, type DeletionOptions } from 'services/UserDeletionService';
import { isValidEmailFormat } from 'validators/authValidators';
import {
  validateRegisterUserInput,
  type RegisterUserErrorCode,
} from 'lib/validation/registerUser';
import { checkRateLimit } from 'lib/rateLimit';
import { SectionRepository, isActiveSection } from 'models/SectionRepository';
import type { AccountStatus, UserRole, AdminUserRow } from 'types/auth';

let cachedUsers: AdminUserRow[] | null = null;
let cachedUsersTimestamp = 0;
const USERS_CACHE_TTL_MS = 60_000;

export function invalidateUsersCache() {
  cachedUsers = null;
  cachedUsersTimestamp = 0;
}

type UserAction =
  | 'approve'
  | 'reject'
  | 'disable'
  | 'enable'
  | 'set_role'
  | 'clear_lockout'
  | 'approve_unlock'
  | 'restore'
  | 'update_profile';

/**
 * Controller layer: administrator account management.
 * Every operation verifies the caller's Administrator role on the server.
 */
export class AdminController {
  /** GET /api/admin/users */
  static async listUsers(req?: Request) {
    requireServerEnv();
    const adminProfile = await AuthorizationService.requireAdminProfile();

    const isForce = req ? new URL(req.url).searchParams.get('refresh') === 'true' : false;

    const now = Date.now();
    if (!isForce && cachedUsers && now - cachedUsersTimestamp < USERS_CACHE_TTL_MS) {
      const cachedRes = jsonOk({ users: cachedUsers, actor: adminProfile.id });
      cachedRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return cachedRes;
    }

    const admin = getSupabaseAdminClient();
    const users = await new ProfileRepository(admin).listAllWithLockout();
    cachedUsers = users;
    cachedUsersTimestamp = now;
    const res = jsonOk({ users, actor: adminProfile.id });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  }

  /** PATCH /api/admin/users/[id]  body: { action, role? } */
  static async updateUser(req: Request, targetUserId: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const body = await req.json().catch(() => null);
    const action = body?.action as UserAction;
    if (!action) throw new ApiError(400, 'VALIDATION_ERROR', 'An action is required.');

    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);
    const audit = new AuditLogRepository(admin);

    const target = await profiles.findById(targetUserId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

    // A deleted account is retired from every active workflow: the only
    // permitted change is bringing it back through the restore action.
    if (target.is_deleted && action !== 'restore') {
      throw new ApiError(
        409,
        'ACCOUNT_ALREADY_DELETED',
        'This account is deleted. Restore it before making any other change.'
      );
    }

    const protectedAdmin =
      target.email.toLowerCase() === 'officer@spid.gov.lk' && target.role === 'Administrator';
    // The primary administrator may still have their own name/section edited,
    // but never their role or status (handled inside update_profile).
    if (
      protectedAdmin &&
      action !== 'clear_lockout' &&
      action !== 'approve_unlock' &&
      action !== 'update_profile'
    ) {
      throw new ApiError(403, 'FORBIDDEN', 'The primary administrator account is protected.');
    }

    invalidateUsersCache();
    invalidateSessionProfileCache(targetUserId);
    invalidateLockStateCache(targetUserId);

    switch (action) {
      case 'approve': {
        await profiles.updateStatus(targetUserId, 'approved', actor.id);
        const approvedRole: UserRole =
          target.role === 'Administrator' || target.requested_role === 'Administrator'
            ? 'Administrator'
            : target.role === 'Staff'
            ? 'Staff'
            : (target.requested_role as UserRole) || 'Staff';

        if (approvedRole !== target.role) {
          await profiles.updateRole(targetUserId, approvedRole);
        }
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'account_approved',
          details: { email: target.email, role: approvedRole },
        });
        return jsonOk({ message: `${target.full_name}'s account has been approved as ${approvedRole}.` });
      }

      case 'reject': {
        await profiles.updateStatus(targetUserId, 'rejected', actor.id);
        await AuthorizationService.revokeAllSessions(targetUserId);
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'account_rejected',
          details: { email: target.email },
        });
        return jsonOk({ message: `${target.full_name}'s account registration has been rejected.` });
      }

      case 'disable': {
        await profiles.updateStatus(targetUserId, 'disabled', actor.id);
        // Enforce immediately: revoke existing sessions/refresh tokens.
        await AuthorizationService.revokeAllSessions(targetUserId);
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'account_disabled',
          details: { email: target.email },
        });
        return jsonOk({ message: `${target.full_name}'s account has been disabled.` });
      }

      case 'enable': {
        await profiles.updateStatus(targetUserId, 'approved', actor.id);
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'account_enabled',
          details: { email: target.email },
        });
        return jsonOk({ message: `${target.full_name}'s account has been re-enabled.` });
      }

      case 'set_role': {
        const role = body?.role as UserRole;
        if (role !== 'Staff' && role !== 'Administrator') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid role value.');
        }
        if (targetUserId === actor.id) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'You cannot change your own role.');
        }
        await profiles.updateRole(targetUserId, role);
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'role_changed',
          details: { from: target.role, to: role },
        });
        return jsonOk({ message: `${target.full_name}'s role is now ${role}.` });
      }

      case 'clear_lockout': {
        await LockoutService.adminClear(targetUserId);
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'lockout_cleared',
          details: { by: actor.email },
        });
        return jsonOk({ message: `Lockout cleared for ${target.full_name}.` });
      }

      case 'approve_unlock': {
        // Only an Administrator reaches this switch (requireAdminProfile), so
        // no lower role can unlock an account — including another admin.
        const lockBefore = await LockoutService.check(targetUserId);

        await LockoutService.adminClear(targetUserId);
        if (target.account_status !== 'approved') {
          await profiles.updateStatus(targetUserId, 'approved', actor.id);
        }
        // Drop any session/refresh token that survived the lock escalation.
        await AuthorizationService.revokeAllSessions(targetUserId);
        invalidateUsersCache();

        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'account_unlocked',
          details: {
            email: target.email,
            by: actor.email,
            admin_id: actor.id,
            unlocked_at: new Date().toISOString(),
            was_permanent: LockoutService.isPermanent(lockBefore),
            failed_attempts: lockBefore?.failed_attempts ?? 0,
            locked_at: lockBefore?.locked_at ?? null,
            last_failed_login_ip: lockBefore?.last_failed_login_ip ?? null,
          },
        });

        try {
          await new NotificationService(admin).notifyUser(targetUserId, {
            title: 'Your account has been unlocked',
            body: `An administrator unlocked your account. You can sign in again with your existing password.`,
            type: 'success',
            titleKey: 'content.accountUnlockedTitle',
            bodyKey: 'content.accountUnlockedBody',
            params: { name: target.full_name },
            dedupeKey: `account-unlocked:${targetUserId}:${Date.now()}`,
          });
        } catch {}

        return jsonOk({
          message: `${target.full_name}'s account has been unlocked and can sign in again.`,
        });
      }

      case 'update_profile': {
        const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : null;
        const sectionId =
          body?.section_id === null
            ? null
            : Number.isInteger(body?.section_id)
              ? (body.section_id as number)
              : undefined;
        const role = body?.role as UserRole | undefined;
        const status = body?.status as AccountStatus | undefined;
        const rawMobile = body?.mobile_phone ?? body?.mobilePhone;

        let formattedMobile: string | null | undefined = undefined;
        if (typeof rawMobile === 'string') {
          const trimmed = rawMobile.trim();
          if (trimmed === '') {
            formattedMobile = null;
          } else {
            const digits = trimmed.replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
            if (!/^\d{9}$/.test(digits)) {
              throw new ApiError(400, 'VALIDATION_ERROR', 'A valid 9-digit mobile number is required.');
            }
            formattedMobile = `+94 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
          }
        } else if (rawMobile === null) {
          formattedMobile = null;
        }

        if (fullName !== null && fullName.length < 3) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Full name must be at least 3 characters.');
        }
        if (role !== undefined && role !== 'Staff' && role !== 'Administrator') {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid role value.');
        }
        if (
          status !== undefined &&
          status !== 'approved' &&
          status !== 'disabled' &&
          status !== 'pending'
        ) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid account status value.');
        }

        const isSelf = targetUserId === actor.id;

        // Privileged fields: never on the protected admin, never on yourself.
        if ((role !== undefined && role !== target.role) || (status !== undefined && status !== target.account_status)) {
          if (protectedAdmin) {
            throw new ApiError(
              403,
              'FORBIDDEN',
              'The primary administrator role and status cannot be changed.'
            );
          }
          if (isSelf) {
            throw new ApiError(403, 'FORBIDDEN', 'You cannot change your own role or status.');
          }
        }

        if (role !== undefined && role !== target.role) {
          await profiles.updateRole(targetUserId, role);
          await audit.log({
            actorId: actor.id,
            targetUserId,
            action: 'role_changed',
            details: { from: target.role, to: role },
          });
        }

        if (status !== undefined && status !== target.account_status) {
          await profiles.updateStatus(targetUserId, status, actor.id);
          if (status === 'disabled') {
            await AuthorizationService.revokeAllSessions(targetUserId);
          }
          await audit.log({
            actorId: actor.id,
            targetUserId,
            action: status === 'approved' ? 'account_approved' : 'account_disabled',
            details: { email: target.email, via: 'update_profile' },
          });
        }

        if (fullName !== null || sectionId !== undefined || formattedMobile !== undefined) {
          const patch: { full_name?: string; section_id?: number | null; mobile_phone?: string | null } = {};
          if (fullName !== null) patch.full_name = fullName;
          if (sectionId !== undefined) patch.section_id = sectionId;
          if (formattedMobile !== undefined) patch.mobile_phone = formattedMobile;
          await profiles.updateDetails(targetUserId, patch);

          try {
            if (admin.auth?.admin) {
              const meta: Record<string, any> = {};
              if (fullName !== null) meta.full_name = fullName;
              if (formattedMobile !== undefined) meta.mobile_phone = formattedMobile;
              if (Object.keys(meta).length > 0) {
                await admin.auth.admin.updateUserById(targetUserId, {
                  user_metadata: meta,
                });
              }
            }
          } catch (e) {
            console.warn('Could not sync user_metadata in update_profile:', e);
          }
        }

        invalidateUsersCache();

        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'profile_updated_by_admin',
          details: { by: actor.email },
        });
        return jsonOk({
          message: `${fullName || target.full_name}'s profile has been updated.`,
        });
      }

      case 'restore': {
        const result = await new UserDeletionService(admin).restore(actor, targetUserId);
        invalidateUsersCache();
        return jsonOk({ message: result.message, user: result.user });
      }

      default:
        throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown action.');
    }
  }

  /**
   * DELETE /api/admin/users/[id]
   * body: { pendingAction?: 'reject' | 'reassign', reassignToUserId?, reason? }
   *
   * Soft delete only — the shared service never removes a file, request,
   * checkout, notification, approval or audit row.
   */
  static async deleteUser(req: Request, targetUserId: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const body = (await req.json().catch(() => null)) as
      | (DeletionOptions & { pendingAction?: string })
      | null;
    const pendingAction =
      body?.pendingAction === 'reject' || body?.pendingAction === 'reassign'
        ? body.pendingAction
        : undefined;

    const admin = getSupabaseAdminClient();
    const result = await new UserDeletionService(admin).softDelete(actor, targetUserId, {
      pendingAction,
      reassignToUserId:
        typeof body?.reassignToUserId === 'string' ? body.reassignToUserId : undefined,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
    });

    invalidateUsersCache();
    return jsonOk({
      message: result.message,
      kept: result.impact.counts,
      pendingRequests: result.impact.pendingRequests.length,
    });
  }

  /** GET /api/admin/users/[id] — deletion preview for the confirmation dialog. */
  static async getDeletionImpact(_req: Request, targetUserId: string) {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const impact = await new UserDeletionService(getSupabaseAdminClient()).getImpact(targetUserId);
    return jsonOk({ impact });
  }

  /**
   * GET /api/admin/users/availability?email=&phone=
   * Debounced blur-time check for the registration modals. Admin-only.
   */
  static async checkAvailability(req: Request) {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const rl = checkRateLimit('user-availability', 60, 60_000);
    if (rl.limited) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many checks. Please wait a moment.', undefined, {
        'Retry-After': String(rl.retryAfterSec),
      });
    }

    const url = new URL(req.url);
    const email = String(url.searchParams.get('email') ?? '').trim().toLowerCase();
    const phone = String(url.searchParams.get('phone') ?? '').trim();

    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);

    const [emailTaken, phoneOwner] = await Promise.all([
      email ? profiles.emailExistsIncludingDeleted(email) : Promise.resolve(false),
      phone ? profiles.findActiveByMobilePhone(phone) : Promise.resolve(null),
    ]);

    return jsonOk({
      email: email ? { available: !emailTaken } : null,
      phone: phone ? { available: !phoneOwner } : null,
    });
  }

  /**
   * POST /api/admin/users/create[/admin|/staff]
   * `pinnedRole` forces the created role: the staff endpoint always creates
   * Staff (an explicit non-staff role is rejected) and the admin endpoint
   * always creates Administrator. The legacy unpinned route still accepts an
   * explicit valid role for backwards compatibility.
   */
  /** Legacy unpinned endpoint: role must be sent explicitly and valid. */
  static async createUser(req: Request) {
    return this.createUserAs(req);
  }

  static async createUserAs(req: Request, pinnedRole?: UserRole) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const rl = checkRateLimit(`user-create:${actor.id}`, 20, 10 * 60_000);
    if (rl.limited) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many account creations. Please try again later.', undefined, {
        'Retry-After': String(rl.retryAfterSec),
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const checked = validateRegisterUserInput(
      {
        fullName: body.full_name ?? body.fullName,
        email: body.email ?? body.emailAddress,
        password: body.password,
        role: body.role ?? body.requested_role ?? body.requestedRole,
        sectionId: body.section_id ?? body.sectionId,
        mobilePhone: body.mobile_phone ?? body.mobilePhone,
      },
      { pinnedRole }
    );

    if (pinnedRole && checked.errors.role === 'roleInvalid') {
      throw new ApiError(
        403,
        'ROLE_NOT_ALLOWED',
        `This endpoint can only create ${pinnedRole} accounts.`
      );
    }
    if (!checked.ok || !checked.values.role) {
      const errors = checked.errors as Record<string, string>;
      throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
        errors,
      });
    }

    const { fullName, email, password, sectionId, mobilePhone } = checked.values;
    const role = checked.values.role as UserRole;

    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);
    const audit = new AuditLogRepository(admin);
    const sections = new SectionRepository(admin);

    // Department must reference a real, active section — never trust the dropdown.
    if (sectionId !== null) {
      const section = await sections.findById(sectionId);
      if (!section || !isActiveSection(section)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Please select a valid department.', {
          errors: { sectionId: 'departmentInvalid' },
        });
      }
    }

    // Email uniqueness includes soft-deleted accounts (address stays reserved).
    if (await profiles.emailExistsIncludingDeleted(email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'This email is already registered.', {
        field: 'email',
      });
    }

    // Phone uniqueness across active users, compared on normalised digits.
    if (mobilePhone && (await profiles.findActiveByMobilePhone(mobilePhone))) {
      throw new ApiError(409, 'PHONE_TAKEN', 'This mobile number is already registered.', {
        field: 'mobilePhone',
      });
    }

    // Provision user via Supabase Auth Admin API (auto-confirmed without sending verification email)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        requested_role: role,
        section_id: sectionId,
        mobile_phone: mobilePhone,
      },
    });

    if (authError || !authData?.user) {
      if (
        authError &&
        (authError.status === 422 || /already|registered|exists/i.test(authError.message))
      ) {
        throw new ApiError(
          409,
          'USER_EXISTS',
          'An account with this email address already exists.'
        );
      }
      throw new ApiError(
        400,
        'AUTH_ERROR',
        authError?.message || 'Failed to create user authentication record.'
      );
    }

    const userId = authData.user.id;
    const now = new Date().toISOString();

    // Upsert the public.profiles record with the specified role and approved status
    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        role,
        requested_role: role,
        account_status: 'approved',
        section_id: sectionId,
        mobile_phone: mobilePhone,
        approved_by: actor.id,
        approved_at: now,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      console.error('Failed to create/update profile row:', profileError);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw new ApiError(500, 'AUTH_ERROR', 'Failed to create user profile record.');
    }

    try {
      await profiles.updateRole(userId, role);
    } catch {}

    // Write audit log
    try {
      await audit.log({
        actorId: actor.id,
        targetUserId: userId,
        action: 'account_created_by_admin',
        details: { email, role, full_name: fullName },
      });
    } catch {}

    invalidateUsersCache();

    return jsonOk(
      {
        message: `${fullName} has been successfully registered as ${role}.`,
        user: {
          id: userId,
          full_name: fullName,
          email,
          role,
          account_status: 'approved',
        },
      },
      201
    );
  }
}

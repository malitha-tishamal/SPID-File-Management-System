import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { AuthorizationService } from 'services/AuthorizationService';
import { LockoutService } from 'services/LockoutService';
import { isValidEmailFormat } from 'validators/authValidators';
import type { AccountStatus, UserRole, AdminUserRow } from 'types/auth';

let cachedUsers: AdminUserRow[] | null = null;
let cachedUsersTimestamp = 0;
const USERS_CACHE_TTL_MS = 4_000;

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
      return jsonOk({ users: cachedUsers, actor: adminProfile.id });
    }

    const admin = getSupabaseAdminClient();
    const users = await new ProfileRepository(admin).listAllWithLockout();
    cachedUsers = users;
    cachedUsersTimestamp = now;
    return jsonOk({ users, actor: adminProfile.id });
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

    const protectedAdmin =
      target.email.toLowerCase() === 'officer@spid.gov.lk' && target.role === 'Administrator';
    // The primary administrator may still have their own name/section edited,
    // but never their role or status (handled inside update_profile).
    if (protectedAdmin && action !== 'clear_lockout' && action !== 'update_profile') {
      throw new ApiError(403, 'FORBIDDEN', 'The primary administrator account is protected.');
    }

    invalidateUsersCache();

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

        if (fullName !== null || sectionId !== undefined) {
          const patch: { full_name?: string; section_id?: number | null } = {};
          if (fullName !== null) patch.full_name = fullName;
          if (sectionId !== undefined) patch.section_id = sectionId;
          await profiles.updateDetails(targetUserId, patch);
        }

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

      default:
        throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown action.');
    }
  }

  /** DELETE /api/admin/users/[id] — permanent account deletion. */
  static async deleteUser(_req: Request, targetUserId: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);
    const audit = new AuditLogRepository(admin);

    const target = await profiles.findById(targetUserId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

    if (targetUserId === actor.id) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'You cannot delete your own account while signed in.'
      );
    }
    const protectedAdmin =
      target.email.toLowerCase() === 'officer@spid.gov.lk' && target.role === 'Administrator';
    if (protectedAdmin) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'The primary administrator account is protected and cannot be deleted.'
      );
    }

    await AuthorizationService.revokeAllSessions(targetUserId);

    // Historical audit rows reference this user — write the log BEFORE the
    // auth user disappears.
    try {
      await audit.log({
        actorId: actor.id,
        targetUserId,
        action: 'account_deleted',
        details: { email: target.email },
      });
    } catch {}

    // Unlink any foreign key references from audit logs and profiles so FK constraints never block deletion
    try {
      await admin.from('audit_logs').update({ target_user_id: null }).eq('target_user_id', targetUserId);
      await admin.from('audit_logs').update({ actor_id: null }).eq('actor_id', targetUserId);
      await admin.from('profiles').update({ approved_by: null }).eq('approved_by', targetUserId);
      await admin.from('login_security').delete().eq('user_id', targetUserId);
    } catch (err) {
      console.warn('Could not unlink foreign references before user deletion:', err);
    }

    // Delete from public.profiles
    const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', targetUserId);
    if (profileDeleteError) {
      console.error('Failed to delete profile row:', profileDeleteError);
    }

    // Delete from auth.users (if exists in auth)
    try {
      const { error: authError } = await admin.auth.admin.deleteUser(targetUserId);
      if (authError && !authError.message.toLowerCase().includes('not found')) {
        console.warn('Auth user deletion warning:', authError);
      }
    } catch (err) {
      console.warn('admin.auth.admin.deleteUser warning:', err);
    }

    invalidateUsersCache();

    return jsonOk({
      message: `${target.full_name}'s account has been permanently deleted.`,
    });
  }

  /** POST /api/admin/users/create — directly provision and activate a new Admin or Staff user */
  static async createUser(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const fullName = String(body.full_name ?? body.fullName ?? '').trim();
    const email = String(body.email ?? body.emailAddress ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const rawRole = body.role ?? body.requested_role ?? body.requestedRole;
    if (rawRole && rawRole !== 'Administrator' && rawRole !== 'Staff') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid role selection.');
    }
    const role: UserRole = rawRole === 'Staff' ? 'Staff' : 'Administrator';
    const rawSectionId = body.section_id ?? body.sectionId;
    const sectionId =
      rawSectionId !== undefined && rawSectionId !== '' && rawSectionId !== null
        ? Number(rawSectionId)
        : null;
    const rawMobile = body.mobile_phone ?? body.mobilePhone;
    const mobilePhone = rawMobile ? String(rawMobile).trim() : null;

    if (!fullName || fullName.length < 3) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Full name must be at least 3 characters.');
    }
    if (!email || !isValidEmailFormat(email)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
    }
    if (!password || password.length < 8) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.');
    }

    const admin = getSupabaseAdminClient();
    const profiles = new ProfileRepository(admin);
    const audit = new AuditLogRepository(admin);

    const existing = await profiles.findByEmail(email);
    if (existing) {
      throw new ApiError(409, 'USER_EXISTS', 'An account with this email address already exists.');
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

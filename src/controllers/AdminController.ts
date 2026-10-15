import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { AuthorizationService } from 'services/AuthorizationService';
import { LockoutService } from 'services/LockoutService';
import type { AccountStatus, UserRole } from 'types/auth';

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
  static async listUsers() {
    requireServerEnv();
    const adminProfile = await AuthorizationService.requireAdminProfile();

    const admin = getSupabaseAdminClient();
    const users = await new ProfileRepository(admin).listAllWithLockout();
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

    switch (action) {
      case 'approve': {
        await profiles.updateStatus(targetUserId, 'approved', actor.id);
        await audit.log({
          actorId: actor.id,
          targetUserId,
          action: 'account_approved',
          details: { email: target.email },
        });
        return jsonOk({ message: `${target.full_name}'s account has been approved.` });
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
    // auth user disappears (FK cascades wipe the profile + login_security).
    await audit.log({
      actorId: actor.id,
      targetUserId,
      action: 'account_deleted',
      details: { email: target.email },
    });

    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) {
      throw new ApiError(
        409,
        'AUTH_ERROR',
        'The deletion request has been blocked because the account is still linked to existing departmental records.'
      );
    }
    return jsonOk({
      message: `${target.full_name}'s account has been permanently deleted.`,
    });
  }
}

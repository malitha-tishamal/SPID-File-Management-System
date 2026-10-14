import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { ProfileRepository } from 'models/ProfileRepository';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { AuthorizationService } from 'services/AuthorizationService';
import { LockoutService } from 'services/LockoutService';
import type { UserRole } from 'types/auth';

type UserAction = 'approve' | 'reject' | 'disable' | 'enable' | 'set_role' | 'clear_lockout';

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
    if (protectedAdmin && action !== 'clear_lockout') {
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

      default:
        throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown action.');
    }
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileDTO } from 'types/auth';
import { ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { ProfileRepository } from 'models/ProfileRepository';
import {
  AuthorizationService,
  invalidateSessionProfileCache,
  invalidateLockStateCache,
} from 'services/AuthorizationService';

export type PendingRequestAction = 'reject' | 'reassign';

export interface DeletionOptions {
  pendingAction?: PendingRequestAction;
  reassignToUserId?: string;
  reason?: string;
}

export interface CheckoutSummary {
  id: number;
  file_no: string;
  file_name: string;
  expected_return_date: string | null;
}

export interface PendingRequestSummary {
  id: number;
  file_no: string;
  file_name: string;
  request_date: string | null;
}

export interface DeletionImpact {
  user: ProfileDTO;
  counts: {
    files: number;
    requests: number;
    approvals: number;
    notifications: number;
    auditLogs: number;
    checkouts: number;
  };
  activeCheckouts: CheckoutSummary[];
  pendingRequests: PendingRequestSummary[];
  activeAdminCount: number | null;
  isLastActiveAdmin: boolean;
  canDelete: boolean;
}

const ANONYMISED_DOMAIN = 'deleted.invalid';
const AUTH_BAN_DURATION = '876000h'; // ~100 years; the profile gate is the primary block
const MAX_REASON = 500;

function anonymisedEmail(userId: string): string {
  return `deleted+${userId}@${ANONYMISED_DOMAIN}`;
}

/**
 * Application service layer: the single soft-delete / restore path for every
 * role. Deleting an account never removes a row that references it — files,
 * requests, checkouts, approvals, notifications and audit logs are kept and
 * continue to show the author's name with a "Deleted user" marker.
 *
 * Only the sign-in identity is retired: the profile is flagged, its email is
 * anonymised (the original is kept in original_email), the auth user is banned
 * and every session is revoked.
 */
export class UserDeletionService {
  constructor(private admin: SupabaseClient = getSupabaseAdminClient()) {}

  private profiles(): ProfileRepository {
    return new ProfileRepository(this.admin);
  }

  private async countRows(table: string, build: (query: any) => any): Promise<number> {
    const { count, error } = await build(
      this.admin.from(table).select('id', { count: 'exact', head: true })
    );
    if (error) throw new Error(`Could not count ${table}: ${error.message}`);
    return count ?? 0;
  }

  /** Everything the confirmation dialog and the server guards need. */
  async getImpact(userId: string): Promise<DeletionImpact> {
    const user = await this.profiles().findById(userId);
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

    const [files, approvals, notifications, auditLogs, activeAdminCount] = await Promise.all([
      this.countRows('files', (q) =>
        q.or(`registered_by.eq.${userId},created_by.eq.${userId}`)
      ),
      this.countRows('files', (q) => q.eq('approved_by', userId)),
      this.countRows('notifications', (q) => q.eq('user_id', userId)),
      this.countRows('audit_logs', (q) =>
        q.or(`actor_id.eq.${userId},target_user_id.eq.${userId}`)
      ),
      this.profiles().countActiveAdmins(),
    ]);

    const { data: requests, error } = await this.admin
      .from('staff_file_requests')
      .select(
        'id, file_no, file_name, request_date, expected_return_date, status, returned_at'
      )
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Could not read file requests: ${error.message}`);

    const rows = (requests ?? []) as Array<{
      id: number;
      file_no: string;
      file_name: string;
      request_date: string | null;
      expected_return_date: string | null;
      status: string;
      returned_at: string | null;
    }>;

    const pendingRequests: PendingRequestSummary[] = rows
      .filter((row) => row.status === 'PENDING')
      .map((row) => ({
        id: row.id,
        file_no: row.file_no,
        file_name: row.file_name,
        request_date: row.request_date,
      }));

    const activeCheckouts: CheckoutSummary[] = rows
      .filter((row) => row.status === 'APPROVED' && !row.returned_at)
      .map((row) => ({
        id: row.id,
        file_no: row.file_no,
        file_name: row.file_name,
        expected_return_date: row.expected_return_date,
      }));

    const isLastActiveAdmin =
      user.role === 'Administrator' &&
      user.account_status === 'approved' &&
      activeAdminCount !== null &&
      activeAdminCount <= 1;

    const counts = {
      files,
      requests: rows.length,
      approvals,
      notifications,
      auditLogs,
      checkouts: rows.filter((row) => row.status === 'APPROVED' && row.returned_at).length,
    };

    return {
      user,
      counts,
      activeCheckouts,
      pendingRequests,
      activeAdminCount,
      isLastActiveAdmin,
      canDelete: !user.is_deleted && !isLastActiveAdmin && activeCheckouts.length === 0,
    };
  }

  private async ensureReassignTarget(targetId: string, deletedUserId: string): Promise<ProfileDTO> {
    if (targetId === deletedUserId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a different staff member.');
    }
    const target = await this.profiles().findById(targetId);
    if (!target || target.is_deleted) {
      throw new ApiError(404, 'NOT_FOUND', 'The staff member selected for reassignment was not found.');
    }
    if (target.account_status !== 'approved') {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'Pending requests can only be reassigned to an approved, active staff member.'
      );
    }
    return target;
  }

  /**
   * Resolves the pending-request choice before the account is touched. Pending
   * rows can never stay attached to a deleted account, so the caller must
   * explicitly reject them (with a reason) or reassign them.
   */
  private async settlePendingRequests(
    userId: string,
    actorId: string,
    impact: DeletionImpact,
    options: DeletionOptions
  ): Promise<void> {
    if (impact.pendingRequests.length === 0) return;

    const action = options.pendingAction;
    if (action !== 'reject' && action !== 'reassign') {
      throw new ApiError(
        409,
        'USER_HAS_PENDING_REQUESTS',
        `This user has ${impact.pendingRequests.length} pending file request(s). Choose whether to reject them with a reason or reassign them first.`,
        { count: impact.pendingRequests.length, requests: impact.pendingRequests }
      );
    }

    const ids = impact.pendingRequests.map((request) => request.id);
    const now = new Date().toISOString();

    if (action === 'reject') {
      const reason =
        (options.reason ?? '').trim().slice(0, MAX_REASON) ||
        'Rejected automatically because the requesting account was deleted.';
      const { error } = await this.admin
        .from('staff_file_requests')
        .update({
          status: 'REJECTED',
          admin_notes: reason,
          reviewed_by: actorId,
          reviewed_at: now,
        })
        .in('id', ids)
        .eq('status', 'PENDING');
      if (error) throw new Error(`Could not reject pending requests: ${error.message}`);
      return;
    }

    const reassignToId = options.reassignToUserId;
    if (!reassignToId) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Choose the staff member who should take over the pending requests.'
      );
    }
    const target = await this.ensureReassignTarget(reassignToId, userId);

    const { error } = await this.admin
      .from('staff_file_requests')
      .update({
        requester_id: target.id,
        requester_name: target.full_name,
        requester_email: target.email,
        requester_role: target.role,
        requester_section: target.section_name ?? null,
      })
      .in('id', ids)
      .eq('status', 'PENDING');
    if (error) throw new Error(`Could not reassign pending requests: ${error.message}`);
  }

  /**
   * Soft-deletes the account. Throws before any write when a business rule
   * forbids it, so a failed request leaves the account untouched.
   */
  async softDelete(
    actor: ProfileDTO,
    userId: string,
    options: DeletionOptions = {}
  ): Promise<{ message: string; impact: DeletionImpact }> {
    if (actor.id === userId) {
      throw new ApiError(403, 'FORBIDDEN', 'You cannot delete your own account while signed in.');
    }

    const impact = await this.getImpact(userId);
    if (impact.user.is_deleted) {
      throw new ApiError(409, 'ACCOUNT_ALREADY_DELETED', 'This account is already deleted.');
    }
    const isProtectedAdmin =
      impact.user.email.toLowerCase() === 'officer@spid.gov.lk' &&
      impact.user.role === 'Administrator';
    if (isProtectedAdmin) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'The primary administrator account is protected and cannot be deleted.'
      );
    }
    if (impact.isLastActiveAdmin) {
      throw new ApiError(
        409,
        'LAST_ACTIVE_ADMIN',
        'This is the last active administrator. Promote another administrator before deleting this account.'
      );
    }
    if (impact.activeCheckouts.length > 0) {
      throw new ApiError(
        409,
        'USER_HAS_ACTIVE_CHECKOUTS',
        `This user still holds ${impact.activeCheckouts.length} issued file(s). Mark them as returned or reassign them before deleting the account.`,
        { checkouts: impact.activeCheckouts }
      );
    }

    await this.settlePendingRequests(userId, actor.id, impact, options);

    const originalEmail = impact.user.original_email ?? impact.user.email;
    const anonymised = anonymisedEmail(userId);
    const reason = (options.reason ?? '').trim().slice(0, MAX_REASON) || null;
    const now = new Date().toISOString();

    // 1. Retire the identity in the app database. Nothing is deleted.
    const { error: profileError } = await this.admin
      .from('profiles')
      .update({
        is_deleted: true,
        deleted_at: now,
        deleted_by: actor.id,
        deletion_reason: reason,
        original_email: originalEmail,
        email: anonymised,
        account_status: 'disabled',
        updated_at: now,
      })
      .eq('id', userId);
    if (profileError) {
      throw new ApiError(500, 'INTERNAL_ERROR', `Could not delete the account: ${profileError.message}`);
    }

    // 2. Retire the auth identity: revoke sessions, change the address and ban.
    await AuthorizationService.revokeAllSessions(userId).catch(() => {});
    try {
      const { error: authError } = await this.admin.auth.admin.updateUserById(userId, {
        email: anonymised,
        email_confirm: true,
        ban_duration: AUTH_BAN_DURATION,
      });
      if (authError) {
        console.warn('[users] auth identity could not be fully retired:', authError.message);
        await this.admin.auth.admin
          .updateUserById(userId, { ban_duration: AUTH_BAN_DURATION })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('[users] auth identity could not be fully retired:', err);
    }

    // 3. Audit who deleted whom and what was preserved.
    try {
      await new AuditLogRepository(this.admin).log({
        actorId: actor.id,
        targetUserId: userId,
        action: 'account_soft_deleted',
        details: {
          email: originalEmail,
          by: actor.email,
          reason,
          pending_action: impact.pendingRequests.length > 0 ? options.pendingAction : null,
          reassigned_to: options.pendingAction === 'reassign' ? options.reassignToUserId : null,
          pending_requests: impact.pendingRequests.length,
          kept: impact.counts,
        },
      });
    } catch (err) {
      console.warn('[users] could not write the deletion audit entry:', err);
    }

    invalidateSessionProfileCache(userId);
    invalidateLockStateCache(userId);

    return {
      message: `${impact.user.full_name}'s account has been deleted. All files, requests and history were kept.`,
      impact,
    };
  }

  /**
   * Restores a soft-deleted account. The original email is restored when it is
   * still free; a new registration may have taken it in the meantime.
   */
  async restore(actor: ProfileDTO, userId: string): Promise<{ message: string; user: ProfileDTO }> {
    const user = await this.profiles().findById(userId);
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    if (!user.is_deleted) {
      throw new ApiError(409, 'ACCOUNT_NOT_DELETED', 'This account is not deleted.');
    }

    const originalEmail = (user.original_email ?? user.email).trim().toLowerCase();
    const restoredEmail =
      originalEmail.endsWith(`@${ANONYMISED_DOMAIN}`) ? null : originalEmail;

    try {
      const { error: authError } = await this.admin.auth.admin.updateUserById(userId, {
        ...(restoredEmail ? { email: restoredEmail, email_confirm: true } : {}),
        ban_duration: 'none',
      });
      if (authError) {
        const message = authError.message.toLowerCase();
        if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
          throw new ApiError(
            409,
            'EMAIL_TAKEN',
            'The original email address is now used by another account. Update that account first, then restore this one.'
          );
        }
        throw new ApiError(500, 'AUTH_ERROR', `Could not restore the sign-in identity: ${authError.message}`);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, 'AUTH_ERROR', 'Could not restore the sign-in identity.');
    }

    const { error } = await this.admin
      .from('profiles')
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        original_email: null,
        email: restoredEmail ?? user.email,
        // Restored accounts must be re-approved by an administrator.
        account_status: 'pending',
        approved_at: null,
        approved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      throw new ApiError(500, 'INTERNAL_ERROR', `Could not restore the account: ${error.message}`);
    }

    try {
      await new AuditLogRepository(this.admin).log({
        actorId: actor.id,
        targetUserId: userId,
        action: 'account_restored',
        details: { email: restoredEmail ?? user.email, by: actor.email },
      });
    } catch (err) {
      console.warn('[users] could not write the restore audit entry:', err);
    }

    invalidateSessionProfileCache(userId);
    invalidateLockStateCache(userId);

    const restored = await this.profiles().findById(userId);
    return {
      message: `${user.full_name}'s account has been restored and is awaiting administrator approval.`,
      user: restored ?? { ...user, is_deleted: false, account_status: 'pending' },
    };
  }
}

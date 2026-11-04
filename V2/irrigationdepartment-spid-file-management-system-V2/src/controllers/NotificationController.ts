let lastDueCheckAt = 0;
const DUE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { sriLankaTodayInput } from 'lib/datetime';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';
import { NotificationRepository } from 'models/NotificationRepository';

/**
 * Notifications are always scoped to the signed-in user: every read and write
 * filters on the session profile id, so one user can never observe or mark
 * another user's messages.
 */
export class NotificationController {
  /** GET /api/notifications — recent notifications plus the unread count. */
  static async listMine(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();
    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(limitParam) ? limitParam : 20;

    const repo = new NotificationRepository(getSupabaseAdminClient());

    // Due-date warnings are time-triggered. Throttled in memory to once every 5 minutes
    // to prevent redundant generation on every 30-second client notification poll.
    const now = Date.now();
    if (now - lastDueCheckAt > DUE_CHECK_INTERVAL_MS) {
      lastDueCheckAt = now;
      try {
        await repo.generateReturnDueNotifications(sriLankaTodayInput());
      } catch (err) {
        console.warn('[notifications] due-date generator skipped:', err);
      }
    }

    const [notifications, unreadCount] = await Promise.all([
      repo.listFor(actor.id, limit),
      repo.unreadCount(actor.id),
    ]);

    return jsonOk({ notifications, unreadCount });
  }

  /** POST /api/notifications/[id]/read — mark a single own notification read. */
  static async markRead(req: Request, idValue: number) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();
    if (!Number.isInteger(idValue) || idValue <= 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Notification id is required.');
    }

    const repo = new NotificationRepository(getSupabaseAdminClient());
    const updated = await repo.markRead(idValue, actor.id);

    return jsonOk({
      updated,
      unreadCount: await repo.unreadCount(actor.id),
    });
  }

  /** POST /api/notifications/[id]/unread — put one own notification back to unread. */
  static async markUnread(req: Request, idValue: number) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();
    if (!Number.isInteger(idValue) || idValue <= 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Notification id is required.');
    }

    const repo = new NotificationRepository(getSupabaseAdminClient());
    const updated = await repo.markUnread(idValue, actor.id);

    return jsonOk({
      updated,
      unreadCount: await repo.unreadCount(actor.id),
    });
  }

  /** POST /api/notifications/read-all — mark every own notification read. */
  static async markAllRead(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireApprovedProfile();

    const repo = new NotificationRepository(getSupabaseAdminClient());
    const updated = await repo.markAllRead(actor.id);

    return jsonOk({ updated, unreadCount: 0 });
  }
}

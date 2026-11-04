import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NotificationRepository,
  type NotificationType,
} from 'models/NotificationRepository';

export interface DispatchInput {
  title: string;
  body?: string | null;
  type?: NotificationType;
  link?: string | null;
  dedupeKey?: string | null;
}

/**
 * Thin wrapper over NotificationRepository used by the workflow controllers.
 *
 * Notification delivery is deliberately non-fatal: a message that cannot be
 * stored must never roll back or fail the underlying approval, return or
 * extension action. It is logged instead, and the caller never claims delivery.
 */
export class NotificationService {
  private repo: NotificationRepository;

  constructor(adminClient: SupabaseClient) {
    this.repo = new NotificationRepository(adminClient);
  }

  /** Returns true only when the notification was actually persisted. */
  async notifyUser(
    userId: string | null | undefined,
    payload: DispatchInput,
  ): Promise<boolean> {
    if (!userId) return false;
    try {
      return await this.repo.create({ userId, ...payload });
    } catch (err) {
      console.warn('[notifications] could not store message:', err);
      return false;
    }
  }

  /** Fan out to every approved administrator. */
  async notifyAdmins(payload: DispatchInput): Promise<number> {
    try {
      const adminIds = await this.repo.listAdminUserIds();
      if (adminIds.length === 0) return 0;
      let delivered = 0;
      for (const userId of adminIds) {
        const created = await this.notifyUser(userId, {
          ...payload,
          // Per-recipient key so the partial unique index can dedupe retries.
          dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${userId}` : null,
        });
        if (created) delivered += 1;
      }
      return delivered;
    } catch (err) {
      console.warn('[notifications] could not notify administrators:', err);
      return 0;
    }
  }

  async listAdminUserIds(): Promise<string[]> {
    try {
      return await this.repo.listAdminUserIds();
    } catch (err) {
      console.warn('[notifications] administrator lookup failed:', err);
      return [];
    }
  }
}

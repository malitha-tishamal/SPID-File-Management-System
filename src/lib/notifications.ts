import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NotificationRepository,
  type NotificationType,
} from 'models/NotificationRepository';
import { NotificationService, type DispatchInput } from 'services/NotificationService';

/**
 * Single entry point for file-request notifications. Every API that creates
 * or resolves a file / file-issue request calls these helpers — no controller
 * inserts notification rows inline.
 *
 * Delivery stays non-fatal (NotificationService swallows storage errors), so
 * a notification failure can never roll back the underlying approval.
 */

/** Semantic event kinds stored in notifications.kind (migration 0029). */
export type FileRequestNotificationKind =
  | 'FILE_ADD_REQUESTED'
  | 'FILE_ISSUE_REQUESTED'
  | 'FILE_ADD_APPROVED'
  | 'FILE_ADD_REJECTED'
  | 'FILE_ISSUE_APPROVED'
  | 'FILE_ISSUE_REJECTED';

/** What the notification is about: a pending file row or a staff request row. */
export type NotificationRefType = 'file' | 'staff_file_request';

export type RequestResolution = 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Kinds that represent an open request admins must act on. */
const OPEN_REQUEST_KINDS: FileRequestNotificationKind[] = [
  'FILE_ADD_REQUESTED',
  'FILE_ISSUE_REQUESTED',
];

export interface RequestNotificationTarget {
  refType: NotificationRefType;
  refId: number;
}

export interface NotifyAdminsForRequest extends RequestNotificationTarget {
  kind: 'FILE_ADD_REQUESTED' | 'FILE_ISSUE_REQUESTED';
  title: string;
  body?: string | null;
  titleKey?: string | null;
  bodyKey?: string | null;
  params?: Record<string, unknown> | null;
  type?: NotificationType;
  link?: string | null;
  dedupeKey?: string | null;
}

/**
 * One notification per active admin for a newly submitted request. The
 * (user_id, kind, ref_type, ref_id) unique index plus the dedupe key make
 * retries idempotent — an admin never sees the same request twice.
 */
export async function notifyAdminsForRequest(
  admin: SupabaseClient,
  event: NotifyAdminsForRequest,
): Promise<number> {
  const service = new NotificationService(admin);
  const payload: DispatchInput = {
    title: event.title,
    body: event.body ?? null,
    type: event.type ?? 'info',
    link: event.link ?? null,
    dedupeKey: event.dedupeKey ?? `request:${event.kind}:${event.refType}:${event.refId}`,
    titleKey: event.titleKey ?? null,
    bodyKey: event.bodyKey ?? null,
    params: event.params ?? null,
    kind: event.kind,
    refType: event.refType,
    refId: event.refId,
  };
  return service.notifyAdmins(payload);
}

export interface NotifyRequestOutcome extends RequestNotificationTarget {
  /** The staff member who submitted the request. */
  userId: string | null | undefined;
  kind: 'FILE_ADD_APPROVED' | 'FILE_ADD_REJECTED' | 'FILE_ISSUE_APPROVED' | 'FILE_ISSUE_REJECTED';
  title: string;
  body?: string | null;
  titleKey?: string | null;
  bodyKey?: string | null;
  params?: Record<string, unknown> | null;
  type?: NotificationType;
  link?: string | null;
  dedupeKey?: string | null;
}

/** Notifies the requesting staff member of the admin's decision. */
export async function notifyRequestOutcome(
  admin: SupabaseClient,
  event: NotifyRequestOutcome,
): Promise<boolean> {
  const service = new NotificationService(admin);
  return service.notifyUser(event.userId, {
    title: event.title,
    body: event.body ?? null,
    type: event.type ?? 'info',
    link: event.link ?? null,
    dedupeKey:
      event.dedupeKey ?? `request:${event.kind}:${event.refType}:${event.refId}`,
    titleKey: event.titleKey ?? null,
    bodyKey: event.bodyKey ?? null,
    params: event.params ?? null,
    kind: event.kind,
    refType: event.refType,
    refId: event.refId,
  });
}

export interface ResolveRequestNotificationsInput extends RequestNotificationTarget {
  resolution: RequestResolution;
  resolvedById?: string | null;
  resolvedByName?: string | null;
}

/**
 * Marks every open (ACTIVE) admin notification for a request as RESOLVED and
 * read, so it disappears from all admins' Active lists and unread counts at
 * once. Idempotent: already-resolved rows are untouched.
 */
export async function resolveRequestNotifications(
  admin: SupabaseClient,
  input: ResolveRequestNotificationsInput,
): Promise<number> {
  try {
    const repo = new NotificationRepository(admin);
    return await repo.resolveForRequest({
      refType: input.refType,
      refId: input.refId,
      kinds: OPEN_REQUEST_KINDS,
      resolution: input.resolution,
      resolvedById: input.resolvedById ?? null,
      resolvedByName: input.resolvedByName ?? null,
    });
  } catch (err) {
    console.warn('[notifications] could not resolve request notifications:', err);
    return 0;
  }
}

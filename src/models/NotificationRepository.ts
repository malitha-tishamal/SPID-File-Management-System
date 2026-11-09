import type { SupabaseClient } from '@supabase/supabase-js';
import { withRecordTarget } from 'lib/notification-link';
import { formatSriLankaDate } from 'lib/datetime';
import { addDaysToDate } from 'lib/returnStatus';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationRow {
  id: number;
  user_id: string;
  title: string;
  body: string | null;
  type: NotificationType;
  link: string | null;
  dedupe_key: string | null;
  /** Translation keys resolved at read time; null for pre-0025 rows. */
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, unknown> | null;
  /** Semantic event kind (FILE_ADD_REQUESTED, ...) — migration 0029. */
  kind?: string | null;
  /** Request the notification refers to: 'file' | 'staff_file_request'. */
  ref_type?: string | null;
  ref_id?: number | null;
  /** ACTIVE rows are actionable; RESOLVED rows live in History. */
  status?: 'ACTIVE' | 'RESOLVED' | string | null;
  resolution?: 'APPROVED' | 'REJECTED' | 'CANCELLED' | string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInput {
  userId: string;
  title: string;
  body?: string | null;
  type?: NotificationType;
  link?: string | null;
  /**
   * Stable identifier for the triggering event. A retried action reuses the
   * same key, so the recipient never sees the same message twice.
   */
  dedupeKey?: string | null;
  /** i18n key (notifications namespace) for the title, rendered at read time. */
  titleKey?: string | null;
  /** i18n key (notifications namespace) for the body, rendered at read time. */
  bodyKey?: string | null;
  /** Interpolation values for the keys; keys ending in "Date" are formatted. */
  params?: Record<string, unknown> | null;
  /** Semantic event kind; pairs with refType/refId for request resolution. */
  kind?: string | null;
  refType?: string | null;
  refId?: number | null;
}

/** PostgREST/Postgres responses when migration 0025 has not been applied. */
function isMissingNotificationColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /title_key|body_key|params|column .* does not exist/i.test(error.message ?? '')
  );
}

/** An issued file close enough to its deadline to deserve a warning. */
interface DueFileRow {
  id: number;
  requester_id: string | null;
  file_no: string;
  file_name: string;
  expected_return_date: string;
}

const UNIQUE_VIOLATION = '23505';

/** How far ahead a return date counts as "due soon" — mirrors migration 0018. */
const DUE_SOON_WINDOW_DAYS = 3;

/** Whole calendar days from `from` to `to`; positive means `to` is in the future. */
function dayDifference(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** PostgREST reports an uninstalled database function in a few different ways. */
function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /does not exist|not found in the schema cache/i.test(error.message ?? '')
  );
}

/** Model layer: persistent per-user notifications. */
export class NotificationRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /**
   * Persists one notification. Returns true only when the row is actually in
   * the database, so callers never report a delivery that failed.
   */
  async create(input: NotificationInput): Promise<boolean> {
    const dedupeKey = input.dedupeKey?.trim() || null;

    if (dedupeKey) {
      const { data: existing } = await this.client
        .from('notifications')
        .select('id')
        .eq('user_id', input.userId)
        .eq('dedupe_key', dedupeKey)
        .limit(1);

      if (existing && existing.length > 0) return false;
    }

    const baseRow = {
      user_id: input.userId,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? 'info',
      link: input.link ?? null,
      dedupe_key: dedupeKey,
    };
    const withKeys = {
      ...baseRow,
      title_key: input.titleKey ?? null,
      body_key: input.bodyKey ?? null,
      params: input.params ?? null,
      kind: input.kind ?? null,
      ref_type: input.refType ?? null,
      ref_id: input.refId ?? null,
    };

    let { error } = await this.client.from('notifications').insert(withKeys);
    if (error && isMissingNotificationColumn(error)) {
      // Older database: still deliver the English message.
      ({ error } = await this.client.from('notifications').insert(baseRow));
    }

    if (error) {
      // Concurrent retry of the same event — the row already exists.
      if (error.code === UNIQUE_VIOLATION) return false;
      throw new Error(
        `NotificationRepository.create error: ${error.message}`,
      );
    }

    return true;
  }

  /**
   * Runs the database-side generator for overdue / due-today / due-soon
   * warnings. Time triggers these, not a user action, so the rule lives in
   * migration 0018 and is deduplicated by the notifications unique index.
   *
   * Projects where 0018 has not been applied yet fall through to the
   * application-side copy of the same rule below, which writes through
   * `create()` and therefore the same dedupe key — so the two can never
   * produce a second copy of a message the other already delivered.
   */
  async generateReturnDueNotifications(today: string): Promise<number> {
    const { data, error } = await this.client.rpc(
      'generate_return_due_notifications',
      { p_today: today },
    );

    if (error) {
      if (isMissingFunctionError(error)) {
        return this.generateReturnDueNotificationsInApplication(today);
      }
      throw new Error(
        `NotificationRepository.generateReturnDueNotifications error: ${error.message}`,
      );
    }

    return Number(data ?? 0);
  }

  /**
   * Same rule, same wording and same dedupe keys as migration 0018, expressed
   * against the tables the model layer already reads. Kept deliberately
   * literal so the two implementations can be compared line by line.
   */
  private async generateReturnDueNotificationsInApplication(
    today: string,
  ): Promise<number> {
    const { data, error } = await this.client
      .from('staff_file_requests')
      .select('id, requester_id, file_no, file_name, expected_return_date')
      .eq('status', 'APPROVED')
      .is('returned_at', null)
      .not('expected_return_date', 'is', null)
      .lte('expected_return_date', addDaysToDate(today, DUE_SOON_WINDOW_DAYS));

    if (error) {
      throw new Error(
        `NotificationRepository due-date scan error: ${error.message}`,
      );
    }

    const overdueFiles: { id: number; fileNo: string; fileName: string; due: string }[] = [];
    let inserted = 0;

    for (const row of (data as DueFileRow[]) ?? []) {
      const due = String(row.expected_return_date).slice(0, 10);
      const days = dayDifference(today, due);
      const pretty = formatSriLankaDate(`${due}T00:00:00Z`);
      const bucket = days < 0 ? 'overdue' : days === 0 ? 'due-today' : 'due-soon';

      const message =
        bucket === 'overdue'
          ? {
              title: `File overdue: ${row.file_no}`,
              body: `${row.file_name} was due back on ${pretty} and is ${Math.abs(
                days,
              )} day(s) overdue. Return it to the Record Room or request a return-date extension.`,
              type: 'error' as NotificationType,
              titleKey: 'content.returnDue.staffOverdueTitle',
              bodyKey: 'content.returnDue.staffOverdueBody',
            }
          : bucket === 'due-today'
            ? {
                title: `File due today: ${row.file_no}`,
                body: `${row.file_name} must be returned today (${pretty}).`,
                type: 'warning' as NotificationType,
                titleKey: 'content.returnDue.staffDueTodayTitle',
                bodyKey: 'content.returnDue.staffDueTodayBody',
              }
            : {
                title: `File due soon: ${row.file_no}`,
                body: `${row.file_name} is due back on ${pretty} (${days} day(s) remaining).`,
                type: 'info' as NotificationType,
                titleKey: 'content.returnDue.staffDueSoonTitle',
                bodyKey: 'content.returnDue.staffDueSoonBody',
              };

      if (row.requester_id) {
        const created = await this.create({
          userId: row.requester_id,
          ...message,
          params: {
            fileNo: row.file_no,
            fileName: row.file_name,
            dueDate: due,
            days: Math.abs(days),
          },
          link: `/staff/your-requests?request=${row.id}`,
          dedupeKey: `return-due:${row.id}:${due}:${bucket}`,
        });
        if (created) inserted += 1;
      }

      if (bucket === 'overdue') {
        overdueFiles.push({
          id: row.id,
          fileNo: row.file_no,
          fileName: row.file_name,
          due,
        });
      }
    }

    if (overdueFiles.length > 0) {
      const adminIds = await this.listAdminUserIds();
      for (const file of overdueFiles) {
        inserted += await this.createForMany(adminIds, () => ({
          title: `Overdue issued file: ${file.fileNo}`,
          body: `${file.fileName} (issued to staff) was due on ${formatSriLankaDate(
            `${file.due}T00:00:00Z`,
          )} and has not been returned. Record the return or extend the due date.`,
          type: 'warning',
          titleKey: 'content.returnDue.adminOverdueTitle',
          bodyKey: 'content.returnDue.adminOverdueBody',
          params: { fileNo: file.fileNo, fileName: file.fileName, dueDate: file.due },
          link: `/admin/issued-files?file=${file.id}`,
          dedupeKey: `admin-overdue:${file.id}:${file.due}`,
        }));
      }
    }

    return inserted;
  }

  /** Fan a notification out to several recipients; individual failures are skipped. */
  async createForMany(
    userIds: string[],
    build: (userId: string) => Omit<NotificationInput, 'userId'>,
  ): Promise<number> {
    let delivered = 0;
    for (const userId of userIds) {
      try {
        const created = await this.create({ userId, ...build(userId) });
        if (created) delivered += 1;
      } catch (err) {
        console.warn('[notifications] delivery skipped for user:', err);
      }
    }
    return delivered;
  }

  /** Every approved administrator — the audience for admin-side alerts. */
  async listAdminUserIds(): Promise<string[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('role', 'Administrator')
      .eq('account_status', 'approved');

    if (error) {
      throw new Error(
        `NotificationRepository.listAdminUserIds error: ${error.message}`,
      );
    }
    return (data ?? [])
      .filter((row: { id: string; is_deleted?: boolean }) => row.is_deleted !== true)
      .map((row: { id: string }) => row.id);
  }

  async listFor(userId: string, limit = 20): Promise<NotificationRow[]> {
    // `*` keeps this working whether or not migration 0025 has added the key
    // columns: older rows simply arrive without them and render their text.
    const { data, error } = await this.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));

    if (error) {
      throw new Error(`NotificationRepository.listFor error: ${error.message}`);
    }
    // Rows written before links carried a record id get their destination back
    // from their own dedupe key, so nobody lands on a generic page.
    return ((data as NotificationRow[]) ?? []).map((row) => ({
      ...row,
      link: withRecordTarget(row.link, row.dedupe_key),
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    // Resolved (handled) notifications never count toward the badge. The
    // status column arrives with migration 0029; older databases fall back to
    // counting every unread row.
    const run = (withStatus: boolean) => {
      let query = this.client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      if (withStatus) query = query.eq('status', 'ACTIVE');
      return query;
    };

    let { count, error } = await run(true);
    if (error && isMissingNotificationColumn(error)) {
      ({ count, error } = await run(false));
    }

    if (error) {
      throw new Error(
        `NotificationRepository.unreadCount error: ${error.message}`,
      );
    }
    return count ?? 0;
  }

  /**
   * Marks every ACTIVE notification for one request as RESOLVED and read.
   * Runs against the service client right after the request row itself is
   * updated, so all recipients' lists and badges settle together. Returns the
   * number of rows resolved; a pre-0029 database resolves nothing.
   */
  async resolveForRequest(input: {
    refType: string;
    refId: number;
    kinds: string[];
    resolution: 'APPROVED' | 'REJECTED' | 'CANCELLED';
    resolvedById?: string | null;
    resolvedByName?: string | null;
  }): Promise<number> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('notifications')
      .update({
        status: 'RESOLVED',
        resolution: input.resolution,
        resolved_at: now,
        resolved_by: input.resolvedById ?? null,
        resolved_by_name: input.resolvedByName ?? null,
        read_at: now,
      })
      .eq('ref_type', input.refType)
      .eq('ref_id', input.refId)
      .eq('status', 'ACTIVE')
      .in('kind', input.kinds)
      .select('id');

    if (error) {
      if (isMissingNotificationColumn(error)) return 0;
      throw new Error(
        `NotificationRepository.resolveForRequest error: ${error.message}`,
      );
    }
    return data?.length ?? 0;
  }

  /** Ownership is enforced by the user_id filter — a foreign id updates nothing. */
  async markRead(id: number, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id');

    if (error) {
      throw new Error(`NotificationRepository.markRead error: ${error.message}`);
    }
    return (data?.length ?? 0) > 0;
  }

  /** Reverse of markRead; the same ownership filter makes other users' rows unreachable. */
  async markUnread(id: number, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('notifications')
      .update({ read_at: null })
      .eq('id', id)
      .eq('user_id', userId)
      .not('read_at', 'is', null)
      .select('id');

    if (error) {
      throw new Error(`NotificationRepository.markUnread error: ${error.message}`);
    }
    return (data?.length ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const { data, error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id');

    if (error) {
      throw new Error(
        `NotificationRepository.markAllRead error: ${error.message}`,
      );
    }
    return data?.length ?? 0;
  }
}

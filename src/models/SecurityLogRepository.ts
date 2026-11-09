import type { SupabaseClient } from '@supabase/supabase-js';

export type SecurityLogCategory = 'all' | 'uploads' | 'scans' | 'malware' | 'imports' | 'deleted';

export interface SecurityLogEntry {
  id: number;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  /** The acting account was soft-deleted; the name is history, not an active user. */
  actor_is_deleted: boolean;
  /** Soft-delete markers (migration 0030); null while the row is live. */
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface SecurityLogQuery {
  category?: SecurityLogCategory;
  limit?: number;
  offset?: number;
  /** 'deleted' lists soft-deleted rows (Recently deleted tab) instead. */
  view?: 'active' | 'deleted';
}

const CATEGORY_ACTIONS: Record<
  Exclude<SecurityLogCategory, 'all' | 'deleted'>,
  string[]
> = {
  uploads: [
    'security.upload_initiated',
    'security.file_validation_failed',
    'security.upload_clean',
  ],
  scans: ['security.scan_started', 'security.scan_failed'],
  malware: ['security.malware_detected'],
  imports: ['security.import_completed', 'security.import_validation_failed'],
};

const LOG_COLUMNS = 'id,actor_id,action,details,created_at,deleted_at,deleted_by';
const MAX_LIMIT = 100;

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_LIMIT);
}

/**
 * Model layer: read-only view over the security.* entries stored in the
 * existing admin-only `audit_logs` table. No file contents are stored or
 * returned here — only metadata recorded at scan/import time.
 */
export class SecurityLogRepository {
  constructor(private adminClient: SupabaseClient) {}

  async list(query: SecurityLogQuery = {}): Promise<{ logs: SecurityLogEntry[]; total: number }> {
    const limit = clampLimit(query.limit);
    const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
    const category: SecurityLogCategory = query.category ?? 'all';

    const deletedView = query.view === 'deleted';
    const effectiveCategory: SecurityLogCategory =
      category === 'deleted' ? 'all' : category;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let request: any = this.adminClient
      .from('audit_logs')
      .select(LOG_COLUMNS, { count: 'exact' });

    // The page lists security.* events only; deletion audit records
    // (SECURITY_LOG_*) live in audit_logs but are never queried here.
    request =
      effectiveCategory === 'all'
        ? request.like('action', 'security.%')
        : request.in('action', CATEGORY_ACTIONS[effectiveCategory as Exclude<SecurityLogCategory, 'all' | 'deleted'>]);

    request = deletedView
      ? request.not('deleted_at', 'is', null)
      : request.is('deleted_at', null);

    const { data, error, count } = await request
      .order(deletedView ? 'deleted_at' : 'created_at', {
        ascending: false,
      })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`SecurityLogRepository.list error: ${error.message}`);
    }

    const rows = (data ?? []) as Array<
      Omit<SecurityLogEntry, 'actor_name' | 'actor_email' | 'actor_role' | 'actor_is_deleted'>
    >;
    const actorIds = Array.from(
      new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
    );

    const actors = new Map<string, { full_name: string | null; email: string | null; role: string | null; is_deleted: boolean }>();
    if (actorIds.length > 0) {
      const { data: profiles } = await this.adminClient
        .from('profiles')
        .select('id,full_name,email,role,is_deleted')
        .in('id', actorIds);
      (profiles ?? []).forEach((profile: any) => {
        actors.set(profile.id, {
          full_name: profile.full_name ?? null,
          email: profile.email ?? null,
          role: profile.role ?? null,
          is_deleted: profile.is_deleted === true,
        });
      });
    }

    const logs = rows.map((row) => {
      const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
      return {
        ...row,
        actor_name: actor?.full_name ?? null,
        // A deleted account's address is retired to a reserved placeholder; the
        // audit entry keeps the name but must not publish that address.
        actor_email: actor?.is_deleted ? null : actor?.email ?? null,
        actor_role: actor?.role ?? null,
        actor_is_deleted: actor?.is_deleted === true,
      };
    });

    return { logs, total: count ?? logs.length };
  }
}

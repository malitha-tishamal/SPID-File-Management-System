import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditLogEntry {
  id: number;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/** Model layer: audit trail for administrative/security events. */
export class AuditLogRepository {
  constructor(private adminClient: SupabaseClient) {}

  async log(entry: {
    actorId?: string | null;
    targetUserId?: string | null;
    action: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.adminClient.from('audit_logs').insert({
      actor_id: entry.actorId ?? null,
      target_user_id: entry.targetUserId ?? null,
      action: entry.action,
      details: entry.details ?? {},
    });
  }

  async listForUser(targetUserId: string, limit = 20): Promise<AuditLogEntry[]> {
    const { data, error } = await this.adminClient
      .from('audit_logs')
      .select('*')
      .eq('target_user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data as AuditLogEntry[]) ?? [];
  }
}

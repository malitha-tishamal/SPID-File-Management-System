import type { SupabaseClient } from '@supabase/supabase-js';

const SETTING_KEY = 'require_staff_file_approval';
const AUDIT_ACTION = 'system_setting.file_approval';

function parseEnabledFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && typeof (value as { enabled?: unknown }).enabled === 'boolean') {
    return (value as { enabled: boolean }).enabled;
  }
  return null;
}

function laterTimestamp(a?: string | null, b?: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

export class SettingsRepository {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /**
   * Retrieves the current persistent setting:
   * "Require Admin Approval for Staff File Submissions".
   * Defaults to true (Enabled) if not configured.
   */
  async getRequireFileApproval(): Promise<boolean> {
    let fromSettings: { enabled: boolean; updatedAt?: string | null } | null = null;
    let fromAudit: { enabled: boolean; updatedAt?: string | null } | null = null;

    try {
      const { data, error } = await this.client
        .from('system_settings')
        .select('value, updated_at')
        .eq('key', SETTING_KEY)
        .maybeSingle();

      if (!error && data) {
        const enabled = parseEnabledFlag(data.value);
        if (enabled !== null) {
          fromSettings = { enabled, updatedAt: data.updated_at ?? null };
        }
      }
    } catch {
      // Fall through to audit_logs check
    }

    try {
      const { data, error } = await this.client
        .from('audit_logs')
        .select('details, created_at')
        .eq('action', AUDIT_ACTION)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const details = data.details as { require_approval?: unknown; updated_at?: string } | null;
        const enabled = parseEnabledFlag(details?.require_approval);
        if (enabled !== null) {
          fromAudit = {
            enabled,
            updatedAt: details?.updated_at || data.created_at || null,
          };
        }
      }
    } catch (err) {
      console.warn('Could not read file approval setting from audit_logs:', err);
    }

    if (fromSettings && fromAudit) {
      return laterTimestamp(fromAudit.updatedAt, fromSettings.updatedAt)
        ? fromAudit.enabled
        : fromSettings.enabled;
    }
    if (fromSettings) return fromSettings.enabled;
    if (fromAudit) return fromAudit.enabled;

    return true;
  }

  /**
   * Updates the persistent setting with author attribution.
   * Persists to both system_settings table (if present) and audit_logs.
   */
  async setRequireFileApproval(enabled: boolean, actorId: string | null): Promise<boolean> {
    const now = new Date().toISOString();
    let persisted = false;

    const { error: upsertError } = await this.client.from('system_settings').upsert(
      {
        key: SETTING_KEY,
        value: { enabled },
        updated_by: actorId,
        updated_at: now,
      },
      { onConflict: 'key' },
    );

    if (upsertError) {
      console.warn('Could not persist file approval setting to system_settings:', upsertError.message);
    } else {
      persisted = true;
    }

    const { error: auditError } = await this.client.from('audit_logs').insert({
      actor_id: actorId,
      action: AUDIT_ACTION,
      details: { require_approval: enabled, updated_at: now },
    });

    if (auditError) {
      console.error('Failed to log system setting update in audit_logs:', auditError.message);
    } else {
      persisted = true;
    }

    if (!persisted) {
      throw new Error('Failed to persist the file approval setting. Please try again.');
    }

    return enabled;
  }
}

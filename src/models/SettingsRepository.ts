import type { SupabaseClient } from '@supabase/supabase-js';

const SETTING_KEY = 'require_staff_file_approval';
const AUDIT_ACTION = 'system_setting.file_approval';

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
    // 1. Try public.system_settings table
    try {
      const { data, error } = await this.client
        .from('system_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();

      if (!error && data && data.value && typeof data.value.enabled === 'boolean') {
        return data.value.enabled;
      }
    } catch {
      // Fall through to audit_logs check
    }

    // 2. Fallback to audit_logs persistent record
    try {
      const { data, error } = await this.client
        .from('audit_logs')
        .select('details')
        .eq('action', AUDIT_ACTION)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data && data.details && typeof (data.details as any).require_approval === 'boolean') {
        return (data.details as any).require_approval;
      }
    } catch (err) {
      console.warn('Could not read file approval setting from audit_logs:', err);
    }

    // Default to true (approval required) as shown in system specification
    return true;
  }

  /**
   * Updates the persistent setting with author attribution.
   * Persists to both system_settings table (if present) and audit_logs.
   */
  async setRequireFileApproval(enabled: boolean, actorId: string | null): Promise<boolean> {
    const now = new Date().toISOString();

    // 1. Attempt upsert into system_settings
    try {
      await this.client
        .from('system_settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: { enabled },
            updated_by: actorId,
            updated_at: now,
          },
          { onConflict: 'key' }
        );
    } catch {
      // If table does not exist, audit_logs serves as persistent storage
    }

    // 2. Persist to audit_logs (authoritative fallback & security trail)
    try {
      await this.client.from('audit_logs').insert({
        actor_id: actorId,
        action: AUDIT_ACTION,
        details: { require_approval: enabled, updated_at: now },
      });
    } catch (err) {
      console.error('Failed to log system setting update in audit_logs:', err);
    }

    return enabled;
  }
}

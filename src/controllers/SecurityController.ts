import { AuthorizationService } from 'services/AuthorizationService';
import { MalwareScanService } from 'services/MalwareScanner';
import {
  SecurityLogRepository,
  type SecurityLogCategory,
} from 'models/SecurityLogRepository';
import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { UPLOAD_POLICIES } from 'services/UploadSecurityService';
import { checkRateLimit } from 'lib/rateLimit';
import {
  parseDeleteLogsRequest,
  categoryToActions,
  SECURITY_LOG_DELETED_ACTION,
  MAX_DELETE_IDS,
} from 'lib/securityLogDelete';

const CATEGORIES: SecurityLogCategory[] = [
  'all',
  'uploads',
  'scans',
  'malware',
  'imports',
  'deleted',
];

export class SecurityController {
  /** GET /api/admin/security/logs — Administrator-only security event trail. */
  static async listLogs(req: Request) {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const url = new URL(req.url);
    const rawCategory = url.searchParams.get('category') || 'all';
    const category = CATEGORIES.includes(rawCategory as SecurityLogCategory)
      ? (rawCategory as SecurityLogCategory)
      : 'all';
    const rawView = url.searchParams.get('view') || 'active';
    const view = rawView === 'deleted' ? 'deleted' : 'active';
    const limit = Number(url.searchParams.get('limit') || 25);
    const offset = Number(url.searchParams.get('offset') || 0);

    const repo = new SecurityLogRepository(getSupabaseAdminClient());
    const { logs, total } = await repo.list({ category, limit, offset, view });

    return jsonOk({ logs, total, category, limit, offset, view });
  }

  /** Active admin + rate limit for destructive/expensive log actions. */
  private static async requireLogAdmin(scope: string) {
    const actor = await AuthorizationService.requireAdminProfile();
    const rl = checkRateLimit(
      `security-log-${scope}:${actor.id}`,
      30,
      10 * 60 * 1000,
    );
    if (rl.limited) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        `Too many attempts. Try again in ${rl.retryAfterSec}s.`,
      );
    }
    return actor;
  }

  /**
   * POST /api/admin/security/logs — delete by explicit ids or by filter/age.
   * The RPC performs the soft-delete and the SECURITY_LOG_DELETED audit record
   * in one transaction; protected rows are skipped, never deleted.
   */
  static async deleteLogs(req: Request) {
    requireServerEnv();
    const actor = await this.requireLogAdmin('delete');
    const body = await req.json().catch(() => null);
    const parsed = parseDeleteLogsRequest(body);
    if (parsed.mode === 'error') {
      throw new ApiError(400, 'VALIDATION_ERROR', parsed.message);
    }

    // Dry run: the dialog asks for the exact deletable count before confirming.
    if ((body as { preview?: unknown })?.preview === true) {
      const count = await this.countDeletable(getSupabaseAdminClient(), parsed);
      return jsonOk({ count });
    }

    const admin = getSupabaseAdminClient();
    const reason =
      typeof (body as { reason?: unknown })?.reason === 'string'
        ? String((body as { reason: string }).reason).trim().slice(0, 500)
        : null;

    const { data, error } = await admin.rpc('delete_security_logs', {
      p_ids: parsed.mode === 'ids' ? parsed.ids : null,
      p_actions: parsed.mode === 'clear' ? parsed.actions : null,
      p_older_than: parsed.mode === 'clear' ? parsed.olderThan : null,
      p_include_malware: parsed.mode === 'clear' ? parsed.includeMalware : false,
      p_include_recent: parsed.mode === 'clear' ? parsed.includeRecent : false,
      p_actor_id: actor.id,
      p_actor_name: actor.full_name || actor.email || null,
      p_reason: reason,
    });
    if (error) {
      if (/TOO_MANY_IDS/.test(error.message)) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          `At most ${MAX_DELETE_IDS} ids per request.`,
        );
      }
      throw error;
    }

    const result = (data ?? {}) as Record<string, unknown>;
    const deleted = Number(result.deleted ?? 0);
    const skippedMalware = Number(result.skippedMalware ?? 0);
    return jsonOk({
      deleted,
      skipped: skippedMalware,
      skippedMalware,
      auditId: result.auditId ?? null,
      message: `${deleted} security event(s) deleted.`,
    });
  }

  /** DELETE /api/admin/security/logs/[id] — single event. */
  static async deleteOne(idValue: string) {
    requireServerEnv();
    const actor = await this.requireLogAdmin('delete');
    const id = Number(idValue);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid log id.');
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('delete_security_logs', {
      p_ids: [id],
      p_actions: null,
      p_older_than: null,
      p_include_malware: false,
      p_include_recent: false,
      p_actor_id: actor.id,
      p_actor_name: actor.full_name || actor.email || null,
      p_reason: null,
    });
    if (error) throw error;
    const result = (data ?? {}) as Record<string, unknown>;
    const deleted = Number(result.deleted ?? 0);
    if (deleted === 0) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'This event cannot be deleted (protected or already removed).',
      );
    }
    return jsonOk({ deleted, auditId: result.auditId ?? null });
  }

  /** POST /api/admin/security/logs/restore — undo soft deletes. */
  static async restoreLogs(req: Request) {
    requireServerEnv();
    const actor = await this.requireLogAdmin('restore');
    const body = await req.json().catch(() => null);
    const rawIds = (body as { ids?: unknown })?.ids;
    const ids = Array.isArray(rawIds)
      ? rawIds
          .map((v) => Number(v))
          .filter((v) => Number.isSafeInteger(v) && v > 0)
      : [];
    const restoreAll = (body as { all?: unknown })?.all === true;
    if (ids.length === 0 && !restoreAll) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No valid ids supplied.');
    }
    if (ids.length > MAX_DELETE_IDS) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `At most ${MAX_DELETE_IDS} ids per request.`,
      );
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('restore_security_logs', {
      p_ids: ids.length > 0 ? Array.from(new Set(ids)) : null,
      p_actions: restoreAll
        ? categoryToActions(String((body as { category?: unknown })?.category ?? 'all'))
        : null,
      p_actor_id: actor.id,
      p_actor_name: actor.full_name || actor.email || null,
    });
    if (error) throw error;
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.error === 'TOO_MANY_IDS') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `At most ${MAX_DELETE_IDS} ids per request.`,
      );
    }
    const restored = Number(result.restored ?? 0);
    return jsonOk({
      restored,
      message: `${restored} security event(s) restored.`,
    });
  }

  /**
   * POST /api/admin/security/logs/purge — permanently remove soft-deleted
   * rows only. Active events are rejected with 409 by the RPC.
   */
  static async purgeLogs(req: Request) {
    requireServerEnv();
    const actor = await this.requireLogAdmin('purge');
    const body = await req.json().catch(() => null);
    const rawIds = (body as { ids?: unknown })?.ids;
    const ids = Array.isArray(rawIds)
      ? rawIds
          .map((v) => Number(v))
          .filter((v) => Number.isSafeInteger(v) && v > 0)
      : [];
    const purgeAll = (body as { all?: unknown })?.all === true;
    if (ids.length === 0 && !purgeAll) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No valid ids supplied.');
    }
    if (ids.length > MAX_DELETE_IDS) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `At most ${MAX_DELETE_IDS} ids per request.`,
      );
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('purge_security_logs', {
      p_ids: ids.length > 0 ? Array.from(new Set(ids)) : null,
      p_actions: purgeAll
        ? categoryToActions(String((body as { category?: unknown })?.category ?? 'all'))
        : null,
      p_actor_id: actor.id,
      p_actor_name: actor.full_name || actor.email || null,
    });
    if (error) throw error;
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.error === 'ACTIVE_OR_MISSING') {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        'Permanent delete is only allowed for already-deleted events.',
      );
    }
    if (result.error === 'TOO_MANY_IDS') {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `At most ${MAX_DELETE_IDS} ids per request.`,
      );
    }
    const deleted = Number(result.deleted ?? 0);
    return jsonOk({ deleted, message: `${deleted} security event(s) permanently deleted.` });
  }

  /**
   * POST /api/admin/security/logs/export — CSV of the events a delete would
   * touch, so nothing is lost before confirming. Same filters as delete.
   */
  static async exportLogs(req: Request) {
    requireServerEnv();
    await this.requireLogAdmin('export');
    const body = await req.json().catch(() => null);
    const parsed = parseDeleteLogsRequest(body);
    if (parsed.mode === 'error') {
      throw new ApiError(400, 'VALIDATION_ERROR', parsed.message);
    }

    const admin = getSupabaseAdminClient();
    let query = admin
      .from('audit_logs')
      .select('id,actor_id,action,details,created_at')
      .is('deleted_at', null)
      .neq('action', SECURITY_LOG_DELETED_ACTION)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (parsed.mode === 'ids') {
      query = query.in('id', parsed.ids);
    } else {
      if (parsed.actions) query = query.in('action', parsed.actions);
      else query = query.like('action', 'security.%');
      if (parsed.olderThan !== '0 seconds') {
        const days = Number(String(parsed.olderThan).split(' ')[0]);
        const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
        query = query.lt('created_at', cutoff);
      }
      if (!parsed.includeMalware) {
        query = query.neq('action', 'security.malware_detected');
      }
      if (!parsed.includeRecent) {
        const dayAgo = new Date(Date.now() - 86400_000).toISOString();
        query = query.lt('created_at', dayAgo);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const csv = [
      'id,created_at,action,actor_id,details',
      ...rows.map((r) =>
        [r.id, r.created_at, r.action, r.actor_id, JSON.stringify(r.details ?? {})]
          .map(esc)
          .join(','),
      ),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="security-logs-export.csv"',
      },
    });
  }

  /** Count of rows a delete request would soft-delete (preview for the UI). */
  private static async countDeletable(
    admin: ReturnType<typeof getSupabaseAdminClient>,
    parsed: ReturnType<typeof parseDeleteLogsRequest>,
  ): Promise<number> {
    if (parsed.mode === 'error') return 0;
    let query = admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .neq('action', SECURITY_LOG_DELETED_ACTION);

    if (parsed.mode === 'ids') {
      query = query.in('id', parsed.ids);
    } else {
      if (parsed.actions) query = query.in('action', parsed.actions);
      else query = query.like('action', 'security.%');
      if (parsed.olderThan !== '0 seconds') {
        const days = Number(String(parsed.olderThan).split(' ')[0]);
        const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
        query = query.lt('created_at', cutoff);
      }
      if (!parsed.includeMalware) {
        query = query.neq('action', 'security.malware_detected');
      }
      if (!parsed.includeRecent) {
        const dayAgo = new Date(Date.now() - 86400_000).toISOString();
        query = query.lt('created_at', dayAgo);
      }
    }
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  /** GET /api/admin/security/scanner-health — live malware scanner status. */
  static async scannerHealth() {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const scanner = await MalwareScanService.getStatus();

    return jsonOk({
      scanner,
      limits: {
        excelBytes: UPLOAD_POLICIES.excel.maxBytes,
        documentBytes: UPLOAD_POLICIES.document.maxBytes,
        imageBytes: UPLOAD_POLICIES.image.maxBytes,
      },
      checkedAt: new Date().toISOString(),
    });
  }
}

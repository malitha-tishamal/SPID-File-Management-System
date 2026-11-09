'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiShield,
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiUser,
  FiFileText,
  FiChevronLeft,
  FiChevronRight,
  FiActivity,
  FiLock,
  FiTrash2,
  FiRotateCcw,
  FiMoreVertical,
  FiDownload,
} from 'react-icons/fi';
import PageHeader from 'components/admin/PageHeader';
import { formatSriLankaDateTime } from 'lib/datetime';
import AttributedUser from 'components/ui/AttributedUser';
import { isReservedDeletedEmail } from 'utils/userDisplay';
import SecurityLogDeleteDialog, {
  type SecurityLogDeleteRequest,
} from 'components/admin/security/SecurityLogDeleteDialog';
import { triggerGlobalToast } from 'components/toast/ToastContext';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import type {
  SecurityLogCategory,
  SecurityLogEntry,
} from 'models/SecurityLogRepository';

interface ScannerHealth {
  requested: 'auto' | 'clamd' | 'clamscan' | 'defender';
  engine: 'clamd' | 'clamscan' | 'defender' | null;
  available: boolean;
  detail: string;
  timeoutMs: number;
}

interface HealthPayload {
  scanner: ScannerHealth;
  limits: { excelBytes: number; documentBytes: number; imageBytes: number };
  checkedAt: string;
}

const CATEGORY_TABS: Array<{ id: SecurityLogCategory; labelKey: string }> = [
  { id: 'all', labelKey: 'securityLogs.tabs.all' },
  { id: 'uploads', labelKey: 'securityLogs.tabs.uploads' },
  { id: 'scans', labelKey: 'securityLogs.tabs.scans' },
  { id: 'malware', labelKey: 'securityLogs.tabs.malware' },
  { id: 'imports', labelKey: 'securityLogs.tabs.imports' },
  { id: 'deleted', labelKey: 'securityLogs.tabs.deleted' },
];

const PAGE_SIZES = [25, 50, 100] as const;

const EVENT_META: Record<string, { labelKey: string; tone: 'emerald' | 'red' | 'amber' | 'blue' }> = {
  'security.upload_initiated': { labelKey: 'securityLogs.events.uploadQuarantined', tone: 'blue' },
  'security.scan_started': { labelKey: 'securityLogs.events.scanStarted', tone: 'blue' },
  'security.upload_clean': { labelKey: 'securityLogs.events.scanClean', tone: 'emerald' },
  'security.malware_detected': { labelKey: 'securityLogs.events.malwareDetected', tone: 'red' },
  'security.scan_failed': { labelKey: 'securityLogs.events.scanFailed', tone: 'amber' },
  'security.file_validation_failed': { labelKey: 'securityLogs.events.fileValidationFailed', tone: 'amber' },
  'security.import_completed': { labelKey: 'securityLogs.events.importCompleted', tone: 'emerald' },
  'security.import_validation_failed': { labelKey: 'securityLogs.events.importValidationFailed', tone: 'amber' },
};

const TONE_CLASS: Record<string, string> = {
  emerald:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50',
  red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50',
  amber:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50',
  blue: 'bg-[#F4F2FF] text-[#4318FF] border-[#4318FF]/20 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-900/50',
};

interface DetailChip {
  label: string;
  value: string;
  tone?: 'red' | 'amber';
}

function detailChips(entry: SecurityLogEntry): DetailChip[] {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  const chips: DetailChip[] = [];
  const str = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : null);
  const num = (key: string) => (typeof d[key] === 'number' ? (d[key] as number) : null);

  const fileName = str('file_name');
  if (fileName) chips.push({ label: 'securityLogs.chips.file', value: fileName });

  const engine = str('scan_engine');
  if (engine) chips.push({ label: 'securityLogs.chips.engine', value: engine });

  const duration = num('scan_duration_ms');
  if (duration !== null) chips.push({ label: 'securityLogs.chips.scan', value: `${duration} ms` });

  const signature = str('signature');
  if (signature) chips.push({ label: 'securityLogs.chips.signature', value: signature, tone: 'red' });

  const totalRows = num('total_rows');
  if (totalRows !== null) chips.push({ label: 'securityLogs.chips.rows', value: String(totalRows) });

  const imported = num('imported_count');
  if (imported !== null) chips.push({ label: 'securityLogs.chips.imported', value: String(imported) });

  const failed = num('failed_count');
  if (failed !== null) chips.push({ label: 'securityLogs.chips.failed', value: String(failed) });

  const duplicates = num('duplicate_count');
  if (duplicates !== null) chips.push({ label: 'securityLogs.chips.duplicates', value: String(duplicates) });

  const sha = str('sha256');
  if (sha) chips.push({ label: 'securityLogs.chips.sha256', value: `${sha.slice(0, 16)}…` });

  const reason = str('reason');
  if (reason) chips.push({ label: 'securityLogs.chips.reason', value: reason, tone: 'amber' });

  return chips;
}

function EventBadge({ action }: { action: string }) {
  const { t } = useTranslation('shell');
  const meta = EVENT_META[action];
  const tone = meta?.tone ?? 'blue';
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-bold ${TONE_CLASS[tone]}`}
    >
      {meta ? t(meta.labelKey) : action}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export default function SecurityLogsPage() {
  const { t } = useTranslation('shell');
  const [category, setCategory] = useState<SecurityLogCategory>('all');
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState<SecurityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Deletion UI state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<{
    request: SecurityLogDeleteRequest;
    count: number;
    mayIncludeMalware: boolean;
    permanent?: boolean;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);

  const isDeletedView = category === 'deleted';
  const offset = page * limit;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          category: isDeletedView ? 'all' : category,
          view: isDeletedView ? 'deleted' : 'active',
          limit: String(limit),
          offset: String(offset),
        });
        const res = await fetch(`/api/admin/security/logs?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || t('securityLogs.errors.loadFailed'));
        }
        if (cancelled) return;
        setLogs(Array.isArray(json.data?.logs) ? json.data.logs : []);
        setTotal(Number(json.data?.total) || 0);
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        setError(err?.message || t('securityLogs.errors.loadFailed'));
        setLogs([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [category, isDeletedView, limit, offset, reloadKey, t]);

  // Realtime: other admins' deletions/restores refresh this page in place.
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
    let channel: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('security-logs-page')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'audit_logs' },
          () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => setReloadKey((k) => k + 1), 400);
          },
        )
        .subscribe();
    } catch {
      // Realtime unavailable — manual refresh still works.
    }
    return () => {
      if (timer) clearTimeout(timer);
      try {
        if (channel && supabase) void supabase.removeChannel(channel as never);
      } catch {
        // best-effort cleanup
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadHealth = async () => {
      setHealthLoading(true);
      setHealthError(null);
      try {
        const res = await fetch('/api/admin/security/scanner-health', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || t('securityLogs.errors.scannerUnreachable'));
        }
        if (!cancelled) setHealth(json.data as HealthPayload);
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        setHealth(null);
        setHealthError(err?.message || t('securityLogs.errors.scannerUnreachable'));
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    };

    loadHealth();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey, t]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const selectCategory = useCallback((next: SecurityLogCategory) => {
    setCategory(next);
    setPage(0);
  }, []);

  const changeLimit = useCallback((next: number) => {
    setLimit(next);
    setPage(0);
  }, []);

  // ── Deletion handlers ──────────────────────────────────────────────────
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pageIds = useMemo(() => logs.map((l) => l.id), [logs]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleSelectPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allPageSelected, pageIds]);

  const openIdsDialog = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setDialog({ request: { mode: 'ids', ids }, count: ids.length, mayIncludeMalware: false });
  }, []);

  const openClearDialog = useCallback(
    async (olderThanDays: number) => {
      const key = `clear-${olderThanDays}`;
      setPreviewBusy(key);
      setClearMenuOpen(false);
      try {
        const res = await fetch('/api/admin/security/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preview: true,
            category: isDeletedView ? 'all' : category,
            olderThanDays,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.message || 'preview failed');
        const count = Number(json.data?.count ?? 0);
        setDialog({
          request: { mode: 'clear', category: isDeletedView ? 'all' : category, olderThanDays },
          count,
          mayIncludeMalware: category === 'malware' || category === 'all',
        });
      } catch {
        triggerGlobalToast({ type: 'error', title: t('securityLogs.delete.previewFailed') });
      } finally {
        setPreviewBusy(null);
      }
    },
    [category, isDeletedView, t],
  );

  const runDelete = useCallback(
    async (payload: SecurityLogDeleteRequest & { reason?: string }) => {
      setDeleteBusy(true);
      try {
        const res = await fetch('/api/admin/security/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.message || 'delete failed');
        const d = json.data ?? {};
        triggerGlobalToast({
          type: 'success',
          title: t('securityLogs.delete.doneTitle'),
          message:
            d.skipped > 0
              ? t('securityLogs.delete.doneSkipped', { deleted: d.deleted, skipped: d.skipped })
              : t('securityLogs.delete.done', { count: d.deleted }),
        });
        setSelectedIds(new Set());
        setDialog(null);
        // If this emptied the current page, step back one page.
        const remaining = logs.length - (payload.mode === 'ids' ? (payload.ids?.length ?? 0) : 0);
        if (payload.mode === 'clear' || remaining <= 0) {
          if (page > 0) setPage((p) => Math.max(p - 1, 0));
        }
        refresh();
      } catch (err: any) {
        triggerGlobalToast({
          type: 'error',
          title: t('securityLogs.delete.failedTitle'),
          message: err?.message,
        });
      } finally {
        setDeleteBusy(false);
      }
    },
    [logs.length, page, refresh, t],
  );

  const runRestore = useCallback(async (idsOverride?: number[]) => {
    // idsOverride avoids the stale-closure bug: setSelectedIds + runRestore in
    // the same tick would otherwise read the previous (empty) selection.
    const ids = idsOverride ?? Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleteBusy(true);
    try {
      const res = await fetch('/api/admin/security/logs/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'restore failed');
      triggerGlobalToast({
        type: 'success',
        title: t('securityLogs.restore.done', { count: json.data?.restored ?? ids.length }),
      });
      setSelectedIds(new Set());
      refresh();
    } catch (err: any) {
      triggerGlobalToast({ type: 'error', title: t('securityLogs.restore.failed'), message: err?.message });
    } finally {
      setDeleteBusy(false);
    }
  }, [selectedIds, refresh, t]);

  const runPurge = useCallback(
    async (payload: SecurityLogDeleteRequest) => {
      setDeleteBusy(true);
      try {
        const res = await fetch('/api/admin/security/logs/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            payload.all
              ? { all: true, category: isDeletedView ? 'all' : category }
              : { ids: payload.ids ?? [] },
          ),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.message || 'purge failed');
        triggerGlobalToast({
          type: 'success',
          title: t('securityLogs.purge.doneTitle'),
          message: t('securityLogs.purge.done', { count: json.data?.deleted ?? 0 }),
        });
        setSelectedIds(new Set());
        setDialog(null);
        if (page > 0) setPage((p) => Math.max(p - 1, 0));
        refresh();
      } catch (err: any) {
        triggerGlobalToast({
          type: 'error',
          title: t('securityLogs.purge.failedTitle'),
          message: err?.message,
        });
      } finally {
        setDeleteBusy(false);
      }
    },
    [category, isDeletedView, page, refresh, t],
  );

  const openPurgeDialog = useCallback(
    (request: SecurityLogDeleteRequest, count: number) => {
      setDialog({ request, count, mayIncludeMalware: false, permanent: true });
    },
    [],
  );

  const exportRows = useCallback(
    async (request: SecurityLogDeleteRequest) => {
      try {
        const res = await fetch('/api/admin/security/logs/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (!res.ok) throw new Error('export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'security-logs-export.csv';
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        triggerGlobalToast({ type: 'error', title: t('securityLogs.delete.exportFailed') });
      }
    },
    [t],
  );

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);
  const canPrev = page > 0 && !loading;
  const canNext = offset + limit < total && !loading;

  const healthTone = useMemo(() => {
    if (healthLoading) return 'loading';
    if (health?.scanner.available) return 'ok';
    return 'bad';
  }, [health, healthLoading]);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <PageHeader
        crumbs={[t('common:roles.ADMIN'), t('securityLogs.title')]}
        title={t('securityLogs.title')}
        subtitle={t('securityLogs.subtitle')}
        right={
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 cursor-pointer"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading || healthLoading ? 'animate-spin' : ''}`} />
            {t('common:buttons.refresh')}
          </button>
        }
      />

      {/* Scanner health */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-navy-700 dark:bg-navy-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                healthTone === 'ok'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : healthTone === 'bad'
                  ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-navy-700 dark:text-slate-300'
              }`}
            >
              {healthTone === 'bad' ? (
                <FiAlertTriangle className="h-5 w-5" />
              ) : (
                <FiShield className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('securityLogs.scanner.title')}
                </p>
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    healthTone === 'ok'
                      ? TONE_CLASS.emerald
                      : healthTone === 'bad'
                      ? TONE_CLASS.red
                      : TONE_CLASS.blue
                  }`}
                >
                  {healthTone === 'ok'
                    ? t('securityLogs.scanner.operational')
                    : healthTone === 'bad'
                    ? t('common:misc.unavailable')
                    : t('securityLogs.scanner.checking')}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 break-words">
                {healthLoading
                  ? t('securityLogs.scanner.probing')
                  : healthError
                  ? healthError
                  : health
                  ? t('securityLogs.scanner.detailTimeout', {
                      detail: health.scanner.detail,
                      seconds: Math.round(health.scanner.timeoutMs / 1000),
                    })
                  : t('securityLogs.scanner.noStatus')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:shrink-0">
            {[
              { label: t('securityLogs.limits.excel'), value: health?.limits.excelBytes },
              { label: t('securityLogs.limits.documents'), value: health?.limits.documentBytes },
              { label: t('securityLogs.limits.images'), value: health?.limits.imageBytes },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-center dark:border-navy-700 dark:bg-navy-900/60"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {item.label}
                </p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {formatBytes(item.value ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-navy-700 dark:bg-navy-800 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_TABS.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectCategory(tab.id)}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#4318FF] text-white shadow-sm shadow-[#4318FF]/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-navy-700 dark:text-slate-300 dark:hover:bg-navy-600'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {!isDeletedView && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setClearMenuOpen((v) => !v)}
                disabled={previewBusy !== null}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
              >
                <FiMoreVertical className="h-3.5 w-3.5" />
                {t('securityLogs.clearLogs.button')}
              </button>
              {clearMenuOpen && (
                <div className="absolute right-0 top-9 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-navy-600 dark:bg-navy-800">
                  {[30, 90, 365, 0].map((days) => (
                    <button
                      key={days}
                      type="button"
                      disabled={previewBusy !== null}
                      onClick={() => void openClearDialog(days)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
                    >
                      {days === 0
                        ? t('securityLogs.clearLogs.allMatching')
                        : t('securityLogs.clearLogs.olderThan', { days })}
                      {previewBusy === `clear-${days}` && (
                        <span className="text-[10px] text-slate-400">…</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <label
            htmlFor="security-log-page-size"
            className="text-[11px] font-semibold text-slate-500 dark:text-slate-400"
          >
            {t('securityLogs.rowsPerPage')}
          </label>
          <select
            id="security-log-page-size"
            value={limit}
            onChange={(e) => changeLimit(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-[#4318FF] dark:border-navy-600 dark:bg-navy-900 dark:text-slate-200"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#4318FF]/20 bg-[#F4F2FF] px-4 py-2.5 dark:border-brand-900/50 dark:bg-brand-900/20">
          <p className="text-[11px] font-bold text-[#4318FF] dark:text-brand-300">
            {t('securityLogs.delete.selectedCount', { count: selectedIds.size })}
            <span className="ml-2 font-medium text-slate-500 dark:text-slate-400">
              {t('securityLogs.delete.protectedSkippedNote')}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {isDeletedView ? (
              <>
                <button
                  type="button"
                  onClick={() => void runRestore()}
                  disabled={deleteBusy}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  <FiRotateCcw className="h-3.5 w-3.5" />
                  {t('securityLogs.restore.selected', { count: selectedIds.size })}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openPurgeDialog(
                      { mode: 'ids', ids: Array.from(selectedIds) },
                      selectedIds.size,
                    )
                  }
                  disabled={deleteBusy}
                  className="flex items-center gap-1.5 rounded-xl bg-red-700 px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  <FiTrash2 className="h-3.5 w-3.5" />
                  {t('securityLogs.purge.selected', { count: selectedIds.size })}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openPurgeDialog({ mode: 'ids', all: true }, total)
                  }
                  disabled={deleteBusy}
                  className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-navy-800 dark:text-red-300 cursor-pointer"
                >
                  <FiTrash2 className="h-3.5 w-3.5" />
                  {t('securityLogs.purge.emptyAll')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openIdsDialog(Array.from(selectedIds))}
                disabled={deleteBusy}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                <FiTrash2 className="h-3.5 w-3.5" />
                {t('securityLogs.delete.selected', { count: selectedIds.size })}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 cursor-pointer"
            >
              {t('common:buttons.clear')}
            </button>
          </div>
        </div>
      )}

      {/* Logs table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-navy-700 dark:bg-navy-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-navy-700 dark:bg-navy-900/60">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectPage}
                    aria-label={t('securityLogs.delete.selectPage')}
                    className="h-4 w-4 accent-[#4318FF]"
                  />
                </th>
                {['securityLogs.columns.time', 'securityLogs.columns.event', 'securityLogs.columns.actor', 'securityLogs.columns.metadata'].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    {t(heading)}
                  </th>
                ))}
                <th className="w-16 px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('securityLogs.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="border-b border-slate-50 dark:border-navy-700/60">
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-4">
                        <div className="h-3 w-full max-w-[180px] animate-pulse rounded bg-slate-100 dark:bg-navy-700" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                      <FiAlertTriangle className="h-6 w-6 text-red-500" />
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {t('securityLogs.errors.loadTitle')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
                      <button
                        type="button"
                        onClick={refresh}
                        className="mt-1 rounded-xl bg-[#4318FF] px-3.5 py-2 text-[11px] font-bold text-white cursor-pointer hover:bg-[#3311CC]"
                      >
                        {t('common:buttons.retry')}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                      <FiLock className="h-6 w-6 text-slate-400" />
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {t('securityLogs.empty.title')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('securityLogs.empty.hint')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((entry) => {
                  const chips = detailChips(entry);
                  // Older cached payloads can still carry the retired placeholder
                  // address; never render it even though the repository nulls it.
                  const actorEmail =
                    entry.actor_email && !isReservedDeletedEmail(entry.actor_email)
                      ? entry.actor_email
                      : null;
                  const actorLabel =
                    entry.actor_name ||
                    actorEmail ||
                    (entry.actor_id ? t('securityLogs.actor.unknownUser') : t('securityLogs.actor.system'));
                  const isMalware = entry.action === 'security.malware_detected';
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-slate-50 last:border-0 dark:border-navy-700/60 ${
                        isMalware ? 'bg-red-50/40 dark:bg-red-950/10' : ''
                      }`}
                    >
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                          aria-label={t('securityLogs.delete.selectRow')}
                          className="mt-1 h-4 w-4 accent-[#4318FF]"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <FiClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="whitespace-nowrap">
                            {formatSriLankaDateTime(entry.created_at)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <EventBadge action={entry.action} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-1.5">
                          <FiUser className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200" title={actorLabel}>
                              {actorLabel}
                              {entry.actor_is_deleted && <AttributedUser suffixOnly deleted />}
                            </p>
                            {entry.actor_role && (
                              <p className="text-[10px] font-medium text-muted">
                                {entry.actor_role}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {chips.length === 0 ? (
                          <span className="text-[11px] text-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {chips.map((chip, idx) => (
                              <span
                                key={`${entry.id}-${chip.label}-${idx}`}
                                className={`inline-flex max-w-[280px] items-center gap-1 truncate rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                                  chip.tone === 'red'
                                    ? TONE_CLASS.red
                                    : chip.tone === 'amber'
                                    ? TONE_CLASS.amber
                                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-navy-700 dark:bg-navy-900/60 dark:text-slate-300'
                                }`}
                                title={t('securityLogs.chipTitle', {
                                  label: t(chip.label),
                                  value: chip.value,
                                })}
                              >
                                <span className="text-slate-400 dark:text-slate-500">{t(chip.label)}:</span>
                                <span className="truncate">{chip.value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        {isDeletedView ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void runRestore([entry.id])}
                              disabled={deleteBusy}
                              title={t('securityLogs.restore.single')}
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40 cursor-pointer"
                            >
                              <FiRotateCcw className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openPurgeDialog({ mode: 'ids', ids: [entry.id] }, 1)
                              }
                              disabled={deleteBusy}
                              title={t('securityLogs.purge.single')}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-300 cursor-pointer"
                            >
                              <FiTrash2 className="h-4 w-4" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openIdsDialog([entry.id])}
                            disabled={deleteBusy}
                            title={t('securityLogs.delete.single')}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-300 cursor-pointer"
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 dark:border-navy-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <FiActivity className="h-3.5 w-3.5" />
            {total === 0
              ? t('securityLogs.footer.noEvents')
              : t('securityLogs.footer.showing', {
                  from: pageStart,
                  to: pageEnd,
                  count: total,
                })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
            >
              <FiChevronLeft className="h-3.5 w-3.5" />
              {t('common:buttons.previous')}
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
            >
              {t('common:buttons.next')}
              <FiChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <SecurityLogDeleteDialog
        open={dialog !== null}
        count={dialog?.count ?? 0}
        request={dialog?.request ?? null}
        mayIncludeMalware={dialog?.mayIncludeMalware ?? false}
        permanent={dialog?.permanent ?? false}
        busy={deleteBusy}
        onConfirm={(payload) =>
          void (dialog?.permanent ? runPurge(payload) : runDelete(payload))
        }
        onExport={(req) => void exportRows(req)}
        onCancel={() => setDialog(null)}
      />

      <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-[11px] text-slate-500 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-400">
        <FiFileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4318FF] dark:text-brand-300" />
        <span>
          {t('securityLogs.auditNote')}
        </span>
      </div>
    </div>
  );
}

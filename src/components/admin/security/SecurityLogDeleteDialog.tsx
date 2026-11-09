'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiTrash2 } from 'react-icons/fi';

export interface SecurityLogDeleteRequest {
  /** 'ids' = explicit rows, 'clear' = filter/age clear. */
  mode: 'ids' | 'clear';
  ids?: number[];
  category?: string;
  olderThanDays?: number;
  includeMalware?: boolean;
  includeRecent?: boolean;
  /** Permanent delete of already-soft-deleted rows (purge). */
  all?: boolean;
  reason?: string;
}

interface Props {
  open: boolean;
  /** Exact number of events the server counted as deletable. */
  count: number;
  request: SecurityLogDeleteRequest | null;
  /** True when the clear filter could touch malware events. */
  mayIncludeMalware?: boolean;
  busy?: boolean;
  onConfirm: (payload: SecurityLogDeleteRequest & { reason?: string }) => void;
  onExport: (request: SecurityLogDeleteRequest) => void;
  onCancel: () => void;
  /** True for permanent purge of already-deleted rows. */
  permanent?: boolean;
}

/**
 * Confirmation dialog for every security-log deletion. Bulk/clear actions
 * require typing DELETE; a reason field is recorded on the audit entry.
 */
export default function SecurityLogDeleteDialog({
  open,
  count,
  request,
  mayIncludeMalware = false,
  busy = false,
  onConfirm,
  onExport,
  onCancel,
  permanent = false,
}: Props) {
  const { t } = useTranslation('shell');
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [includeMalware, setIncludeMalware] = useState(false);
  const [includeRecent, setIncludeRecent] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const isBulk = request?.mode === 'clear' || (request?.ids?.length ?? 0) > 1 || request?.all === true;
  // Permanent delete: phrase required for "empty all" or more than 10 rows.
  const needsPhrase = permanent
    ? request?.all === true || count > 10 || isBulk
    : isBulk;
  const phraseOk = !needsPhrase || confirmText.trim().toUpperCase() === 'DELETE';

  useEffect(() => {
    if (open) {
      setReason('');
      setConfirmText('');
      setIncludeMalware(false);
      setIncludeRecent(false);
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open || !request) return null;

  const submit = () => {
    if (!phraseOk || busy) return;
    onConfirm({
      ...request,
      includeMalware: request.mode === 'clear' ? includeMalware : request.includeMalware,
      includeRecent: request.mode === 'clear' ? includeRecent : request.includeRecent,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sec-log-delete-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-navy-700 dark:bg-navy-800">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <FiTrash2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3
              id="sec-log-delete-title"
              className="text-sm font-extrabold text-slate-900 dark:text-white"
            >
              {permanent ? t('securityLogs.purge.title') : t('securityLogs.delete.title')}
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {permanent
                ? t('securityLogs.purge.countWarning', { count })
                : t('securityLogs.delete.countWarning', { count })}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-300">
              {permanent
                ? t('securityLogs.purge.irreversible')
                : t('securityLogs.delete.irreversible')}
            </p>
          </div>
        </div>

        {request.mode === 'clear' && mayIncludeMalware && (
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <input
              type="checkbox"
              checked={includeMalware}
              onChange={(e) => setIncludeMalware(e.target.checked)}
              className="mt-0.5"
            />
            {t('securityLogs.delete.includeMalware')}
          </label>
        )}

        {request.mode === 'clear' && (
          <label className="mt-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-600 dark:border-navy-700 dark:bg-navy-900/50 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeRecent}
              onChange={(e) => setIncludeRecent(e.target.checked)}
              className="mt-0.5"
            />
            {t('securityLogs.delete.includeRecent')}
          </label>
        )}

        <label className="mt-3 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
          {t('securityLogs.delete.reasonLabel')}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#4318FF] dark:border-navy-600 dark:bg-navy-900 dark:text-slate-200"
          />
        </label>

        {needsPhrase && (
          <label className="mt-3 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {t('securityLogs.delete.typeToConfirm', { word: 'DELETE' })}
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 outline-none focus:border-red-400 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-200"
            />
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onExport(request)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
          >
            <FiDownload className="h-3.5 w-3.5" />
            {t('securityLogs.delete.exportCsv')}
          </button>
          <div className="flex gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
            >
              {t('common:buttons.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !phraseOk || count <= 0}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              {busy
                ? t('securityLogs.delete.deleting')
                : permanent
                  ? t('securityLogs.purge.confirm', { count })
                  : t('securityLogs.delete.confirm', { count })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

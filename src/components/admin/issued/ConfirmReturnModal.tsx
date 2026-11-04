'use client';

import React from 'react';
import { FiCheckCircle, FiRotateCcw, FiX } from 'react-icons/fi';
import { formatSriLankaDate } from 'lib/datetime';
import { useDialogBehavior } from 'lib/dialogBehavior';
import type { IssuedFileRow } from './issuedTypes';

/**
 * Glassmorphism confirmation for "Mark as Received Back". Nothing mutates
 * until the backend confirms the return, so the ledger can never drift from
 * the physical repository.
 */
export default function ConfirmReturnModal({
  file,
  loading = false,
  onConfirm,
  onCancel,
}: {
  file: IssuedFileRow | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Escape is ignored while the return is in flight, so a half-finished
  // write can never be dismissed out of view.
  const panelRef = useDialogBehavior<HTMLDivElement>(file !== null, () => {
    if (!loading) onCancel();
  });

  if (!file) return null;

  const isLate = file.is_overdue;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px]"
      onClick={() => !loading && onCancel()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-return-title"
        className="animate-in fade-in zoom-in-95 duration-150 w-full max-w-md rounded-3xl border border-slate-100/80 bg-white/85 p-6 shadow-2xl backdrop-blur-xl dark:border-navy-700/80 dark:bg-navy-800/85"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-navy-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E6F9F0] text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-300">
              <FiCheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="confirm-return-title"
                className="text-base font-bold text-navy-800 dark:text-white"
              >
                Confirm File Return
              </h3>
              <p className="text-xs text-slate-400">Record the physical handover</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="cursor-pointer rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-navy-700 dark:hover:text-white"
            aria-label="Cancel"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs dark:border-navy-700 dark:bg-navy-900/50">
          <p className="leading-relaxed text-slate-600 dark:text-slate-300">
            Confirm that this physical file is back in the repository and ready to
            be re-shelved. The staff member is notified once you continue.
          </p>

          <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200/60 pt-2.5 dark:border-navy-700">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">File Number:</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {file.file_no}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">File Name:</span>
              <span className="max-w-[240px] truncate text-right font-bold text-slate-800 dark:text-white">
                {file.file_name}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">Staff Member:</span>
              <span className="text-right font-bold text-slate-800 dark:text-white">
                {file.requester_name}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">Due On:</span>
              <span
                className={`text-right font-bold ${
                  isLate
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-800 dark:text-white'
                }`}
              >
                {formatSriLankaDate(file.expected_return_date)}
              </span>
            </div>
          </div>

          {isLate && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              This issue is {file.return_label.toLowerCase()} — the return will be
              logged as late.
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 cursor-pointer rounded-xl border border-slate-200 bg-white/80 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#05CD99] py-2.5 text-xs font-bold text-white shadow-md shadow-[#05CD99]/25 transition-all hover:bg-[#04B787] active:scale-95 disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <FiRotateCcw className="h-4 w-4" />
                <span>Confirm Return</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

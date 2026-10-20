'use client';

import React, { useEffect } from 'react';
import { FiCheckCircle, FiX } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';

export default function ConfirmApproveModal({
  file,
  loading = false,
  onConfirm,
  onCancel,
}: {
  file: FileRecordRow | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onCancel]);

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-navy-700 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <FiCheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-800 dark:text-white">
                Approve File Request
              </h3>
              <p className="text-xs text-slate-400">Confirmation required</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-4 border border-slate-100 dark:border-navy-700 text-xs">
          <p className="text-slate-500 dark:text-slate-300">
            Are you sure you want to approve this staff file submission and finalize it into the active archive repository?
          </p>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200/60 dark:border-navy-700 pt-2.5">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-400">File Number:</span>
              <span className="font-mono font-bold text-[#4318FF] dark:text-brand-300">
                {file.file_no}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-400">File Name:</span>
              <span className="font-bold text-slate-800 dark:text-white text-right max-w-[240px] truncate">
                {file.file_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-400">Submitted By:</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {file.registrar_name} ({file.registrar_role || 'Staff'})
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-[#05CD99] hover:bg-[#04B787] py-2.5 text-xs font-bold text-white shadow-md shadow-[#05CD99]/25 hover:shadow-lg active:scale-95 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Approving...</span>
              </>
            ) : (
              <>
                <FiCheckCircle className="h-4 w-4" />
                <span>Approve File</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

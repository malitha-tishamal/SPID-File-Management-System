'use client';

import React from 'react';
import { FiCheckCircle } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';
import FileModalShell from './FileModalShell';
import Button from 'components/ui/Button';

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
  if (!file) return null;

  return (
    <FileModalShell
      title="Approve File Request"
      subtitle="Confirmation required"
      icon={<FiCheckCircle className="h-5 w-5" />}
      iconTone="emerald"
      size="sm"
      onClose={onCancel}
      closeDisabled={loading}
      footer={
        <>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#05CD99] py-2.5 text-xs font-bold text-white shadow-md shadow-[#05CD99]/25 transition-all hover:bg-[#04B787] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05CD99] focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
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
        </>
      }
    >
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs dark:border-navy-700 dark:bg-navy-900/50">
        <p className="leading-relaxed text-slate-500 dark:text-slate-300">
          Are you sure you want to approve this staff file submission and
          finalize it into the active archive repository?
        </p>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200/60 pt-2.5 dark:border-navy-700">
          <div className="flex justify-between gap-3">
            <span className="font-semibold text-slate-400">File Number:</span>
            <span className="font-mono font-bold text-[#4318FF] dark:text-brand-300">
              {file.file_no}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="shrink-0 font-semibold text-slate-400">File Name:</span>
            <span
              className="max-w-[240px] truncate text-right font-bold text-slate-800 dark:text-white"
              title={file.file_name}
            >
              {file.file_name}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="font-semibold text-slate-400">Submitted By:</span>
            <span className="text-right font-bold text-slate-700 dark:text-slate-300">
              {file.registrar_name || 'Staff Member'} ({file.registrar_role || 'Staff'})
            </span>
          </div>
        </div>
      </div>
    </FileModalShell>
  );
}

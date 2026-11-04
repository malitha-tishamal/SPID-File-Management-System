'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FiXCircle } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';
import FileModalShell from './FileModalShell';
import Button from 'components/ui/Button';

export default function ConfirmRejectModal({
  file,
  loading = false,
  onConfirm,
  onCancel,
}: {
  file: FileRecordRow | null;
  loading?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [file?.id]);

  const syncReasonFromDom = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const dom = e.currentTarget.value;
    if (dom !== reason) {
      setReason(dom);
      if (error) setError(null);
    }
  };

  const confirm = () => {
    const dom = reasonRef.current?.value ?? reason;
    const trimmed = dom.trim();

    if (!trimmed) {
      setError('Rejection reason is required. Please provide a reason before rejecting this file.');
      reasonRef.current?.focus();
      return;
    }

    onConfirm(trimmed);
  };

  if (!file) return null;

  return (
    <FileModalShell
      title="Reject File Submission"
      subtitle="Decline file request"
      icon={<FiXCircle className="h-5 w-5" />}
      iconTone="rose"
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
            onClick={confirm}
            disabled={loading}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/25 transition-all hover:bg-rose-700 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Rejecting...</span>
              </>
            ) : (
              <>
                <FiXCircle className="h-4 w-4" />
                <span>Reject Request</span>
              </>
            )}
          </button>
        </>
      }
    >
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs dark:border-navy-700 dark:bg-navy-900/50">
        <p className="leading-relaxed text-slate-500 dark:text-slate-300">
          Are you sure you want to decline this submission? Rejected requests
          will not enter the active file repository.
        </p>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200/60 pt-2.5 dark:border-navy-700">
          <div className="flex justify-between gap-3">
            <span className="font-semibold text-slate-400">File Number:</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
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
        </div>

        <div className="mt-3.5">
          <label
            htmlFor="rejection-reason"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
          >
            Rejection Reason <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="rejection-reason"
            ref={reasonRef}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={syncReasonFromDom}
            onKeyUp={syncReasonFromDom}
            placeholder="Ex: Missing section documentation, invalid date range..."
            className={`w-full resize-none rounded-xl border bg-white p-2.5 text-xs leading-relaxed text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:ring-2 dark:border-navy-700 dark:bg-navy-900 dark:text-white ${
              error
                ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/20'
                : 'border-slate-200 focus:border-rose-400 focus:ring-rose-400/20'
            }`}
          />
          {error && (
            <p
              role="alert"
              className="mt-1.5 flex items-start gap-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
            >
              <span className="mt-0.5 shrink-0">•</span>
              <span>{error}</span>
            </p>
          )}
        </div>
      </div>
    </FileModalShell>
  );
}

'use client';

import React from 'react';
import { FiTrash2 } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';
import FileModalShell from './FileModalShell';
import Button from 'components/ui/Button';

export default function ConfirmDeleteModal({
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
      title="Delete File Record"
      subtitle={
        <span className="font-semibold text-rose-500">Irreversible action</span>
      }
      icon={<FiTrash2 className="h-5 w-5" />}
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
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/25 transition-all hover:bg-rose-700 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <FiTrash2 className="h-4 w-4" />
                <span>Delete File</span>
              </>
            )}
          </button>
        </>
      }
    >
      <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-xs dark:border-rose-900/30 dark:bg-rose-950/20">
        <p className="leading-relaxed text-slate-600 dark:text-slate-300">
          Are you sure you want to permanently delete this file record from the
          archive repository?
        </p>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-rose-200/50 pt-2.5 dark:border-rose-900/40">
          <div className="flex justify-between gap-3">
            <span className="font-semibold text-slate-400">File Number:</span>
            <span className="font-mono font-bold text-slate-800 dark:text-white">
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
      </div>
    </FileModalShell>
  );
}

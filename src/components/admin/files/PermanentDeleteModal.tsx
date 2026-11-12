'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiTrash2 } from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';
import type { FileRecordRow } from 'models/FileRepository';

export default function PermanentDeleteModal({
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
  const { t } = useTranslation('files');
  const [confirmText, setConfirmText] = useState('');

  if (!file) return null;

  const typedMatches = confirmText.trim().toLowerCase() === file.file_no.trim().toLowerCase();
  const showMismatch = confirmText.length > 0 && !typedMatches;
  const confirmDisabled = loading || !typedMatches;

  return (
    <Modal
      open
      onClose={onCancel}
      busy={loading}
      labelledBy="permanent-delete-title"
      panelClassName="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/40 dark:bg-navy-800"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
          <FiTrash2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="permanent-delete-title" className="text-base font-bold text-slate-800 dark:text-white">
            {t('modals.permanentDeleteTitle', 'Permanently Delete File?')}
          </h3>
          <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {t('modals.permanentDeleteSubtitle', 'Irreversible action — this file and all its linked records will be erased completely.')}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-xs dark:border-rose-900/40 dark:bg-rose-950/20">
        <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200">
          <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed">
            {t(
              'modals.permanentDeleteWarning',
              'This action cannot be undone. The file record, historical requests, extensions, and logs will be permanently erased from the repository.',
            )}
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-rose-200/60 pt-2.5 dark:border-rose-900/40">
          <div className="flex justify-between gap-3">
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {t('modals.fileNumber', 'File Number')}
            </span>
            <span className="font-mono font-bold text-slate-800 dark:text-white">
              {file.file_no}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
              {t('modals.fileName', 'File Name')}
            </span>
            <span className="max-w-[240px] truncate text-right font-bold text-slate-800 dark:text-white" title={file.file_name}>
              {file.file_name}
            </span>
          </div>
        </div>

        <div className="mt-3.5">
          <label
            htmlFor="permanent-delete-input"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
          >
            {t('modals.deleteConfirmRequired', 'Type the File No to confirm')}
          </label>
          <input
            id="permanent-delete-input"
            type="text"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('modals.deleteConfirmPlaceholder', { fileNo: file.file_no })}
            className={`w-full rounded-xl border bg-white p-2.5 font-mono text-xs text-slate-800 outline-none transition-all placeholder:font-sans placeholder:text-slate-400 focus:ring-2 dark:border-navy-700 dark:bg-navy-900 dark:text-white ${
              showMismatch
                ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/20'
                : 'border-slate-200 focus:border-rose-400 focus:ring-rose-400/20'
            }`}
          />
          {showMismatch && (
            <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
              <span className="mt-0.5 shrink-0">•</span>
              <span>{t('modals.deleteConfirmMismatch', 'The File No does not match.')}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button
          type="button"
          variant="cancel"
          size="sm"
          onClick={onCancel}
          disabled={loading}
          className="flex-1"
        >
          {t('common:buttons.cancel', 'Cancel')}
        </Button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/25 transition-all hover:bg-rose-700 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>{t('modals.deleting', 'Deleting…')}</span>
            </>
          ) : (
            <>
              <FiTrash2 className="h-4 w-4" />
              <span>{t('modals.permanentDeleteConfirm', 'Permanently Delete')}</span>
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

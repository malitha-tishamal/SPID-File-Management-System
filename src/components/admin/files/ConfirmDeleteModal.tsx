'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2, FiAlertTriangle, FiRotateCcw } from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';
import type { FileRecordRow } from 'models/FileRepository';

export interface ConfirmDeleteModalProps {
  file: FileRecordRow | null;
  loading?: boolean;
  dependents: {
    fileRequests: number;
    fileRequestExtensions: number;
    activeCheckouts?: number;
    returnedCheckouts?: number;
    auditLogs?: number;
    canDelete?: boolean;
  } | null;
  loadingDependents?: boolean;
  reason?: string;
  onReasonChange?: (reason: string) => void;
  confirmText?: string;
  onConfirmTextChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({
  file,
  loading = false,
  dependents,
  loadingDependents = false,
  reason = '',
  onReasonChange,
  confirmText = '',
  onConfirmTextChange,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const { t } = useTranslation('files');
  const { t: tc } = useTranslation('common');

  if (!file) return null;

  const activeCheckouts = dependents?.activeCheckouts ?? 0;
  const isBlocked = !loadingDependents && activeCheckouts > 0;
  const canSubmit = !loading && !loadingDependents && !isBlocked && !!dependents;

  const kept = [
    {
      label: t('modals.keptRequests', 'File requests'),
      value: dependents?.fileRequests ?? 0,
    },
    {
      label: t('modals.keptExtensions', 'Request extensions'),
      value: dependents?.fileRequestExtensions ?? 0,
    },
    {
      label: t('modals.keptCheckouts', 'Returned checkouts'),
      value: dependents?.returnedCheckouts ?? 0,
    },
    {
      label: t('modals.keptLogs', 'Audit log entries'),
      value: dependents?.auditLogs ?? 0,
    },
  ];

  return (
    <Modal
      open
      onClose={onCancel}
      busy={loading}
      labelledBy="delete-file-title"
      panelClassName="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-700"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <FiTrash2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="delete-file-title" className="text-base font-bold text-navy-700 dark:text-white">
            {t('modals.softDeleteTitle', 'Delete this file record?')}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'modals.softDeleteSubtitle',
              'This is reversible: the file record is hidden and moved to Deleted Files, not erased.',
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs dark:border-navy-600 dark:bg-navy-800/60">
        <div className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500 dark:text-slate-400">
            {t('modals.fileNumber', 'File Number')}:
          </span>
          <span className="font-mono font-bold text-slate-800 dark:text-white">
            {file.file_no}
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span className="font-semibold text-slate-500 dark:text-slate-400">
            {t('modals.fileName', 'File Name')}:
          </span>
          <span className="max-w-[260px] truncate text-right font-bold text-slate-800 dark:text-white" title={file.file_name}>
            {file.file_name}
          </span>
        </div>
      </div>

      {loadingDependents && (
        <p role="status" className="mt-4 flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          <FiRotateCcw className="h-3.5 w-3.5 animate-spin" />
          <span>{t('modals.loadingImpact', 'Checking linked departmental records…')}</span>
        </p>
      )}

      {!loadingDependents && dependents && (
        <>
          {isBlocked && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm font-bold text-red-800 dark:text-red-300">
                <FiAlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t('modals.blockedActiveCheckouts', {
                    count: activeCheckouts,
                    defaultValue: `This file is currently issued (${activeCheckouts} active checkout). It cannot be deleted until marked as returned.`,
                  })}
                </span>
              </p>
              <p className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                {t('modals.blockedActiveHint', 'Please process the return in Staff File Requests before retiring this record.')}
              </p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-navy-600 dark:bg-navy-800">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
              {t('modals.keptHeading', 'THESE RECORDS ARE KEPT')}
            </p>
            <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold text-slate-700 dark:text-gray-300">
              {kept.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{row.label}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#4318FF] shadow-xs dark:bg-navy-700 dark:text-brand-300">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-200/60 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-navy-700 dark:text-gray-400">
              {t(
                'modals.keptFootnote',
                'All related requests and audit trails will be preserved, marked with this file.',
              )}
            </p>
          </div>

          <label className="mt-4 block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-gray-300">
              {t('modals.deleteReasonLabel', 'REASON (RECORDED IN THE AUDIT LOG)')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange?.(e.target.value.slice(0, 500))}
              rows={2}
              placeholder={t('modals.deleteReasonPlaceholder', 'Optional — why this file is being deleted')}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-200"
            />
          </label>
        </>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button
          type="button"
          variant="cancel"
          size="sm"
          onClick={onCancel}
          disabled={loading}
          className="flex-1"
        >
          {tc('buttons.cancel', 'Cancel')}
        </Button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canSubmit}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-md shadow-red-600/25 transition-all hover:bg-red-700 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>{t('modals.deleting', 'Deleting…')}</span>
            </>
          ) : (
            <>
              <FiTrash2 className="h-4 w-4" />
              <span>{t('modals.deleteConfirm', 'Delete file')}</span>
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

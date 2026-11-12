'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2, FiRotateCcw, FiAlertCircle, FiRefreshCw, FiEye } from 'react-icons/fi';
import { TABLE_BODY_CLASS, TABLE_HEAD_ROW_CLASS, TABLE_ROW_CLASS } from 'lib/tableStyles';
import type { FileRecordRow } from 'models/FileRepository';
import { formatSriLankaDateTimeCompact } from 'lib/datetime';
import FilesTableSkeleton from './FilesTableSkeleton';
import FilesPagination from './FilesPagination';
import LocationDetailsButton from './LocationDetailsButton';
import TableLoadingSpinner from './TableLoadingSpinner';
import { localizeField, useLocalizedFields } from 'lib/useLocalizedFields';
import AttributedUser from 'components/ui/AttributedUser';
import { attributedNameText } from 'utils/userDisplay';

function getInitials(name?: string | null): string {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getSectionBadge(section?: string | null) {
  const s = (section || '').toLowerCase();
  if (s.includes('legal') || s.includes('contract')) {
    return 'bg-[#FAF5FF] text-[#A855F7] border-[#F3E8FF] dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
  }
  if (s.includes('land') || s.includes('hydrology') || s.includes('water')) {
    return 'bg-[#ECFDF5] text-[#05CD99] border-[#A7F3D0] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (s.includes('engineering') || s.includes('irrigation')) {
    return 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE] dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (s.includes('finance') || s.includes('account') || s.includes('audit')) {
    return 'bg-[#F0F9FF] text-[#0284C7] border-[#BAE6FD] dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  }
  if (s.includes('hr') || s.includes('admin')) {
    return 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  return 'bg-[#F4F7FE] text-[#4318FF] border-[#E0E5F2] dark:bg-navy-900 dark:text-brand-300 dark:border-navy-700';
}

export default function DeletedFilesTable({
  files,
  loading = false,
  refreshing = false,
  error = null,
  total = 0,
  page = 1,
  limit = 15,
  totalPages = 1,
  isFiltered = false,
  onPageChange,
  onView,
  onRestore,
  onPermanentDelete,
  onRetry,
}: {
  files: FileRecordRow[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  isFiltered?: boolean;
  onPageChange?: (newPage: number) => void;
  onView: (file: FileRecordRow) => void;
  onRestore: (file: FileRecordRow) => void;
  onPermanentDelete: (file: FileRecordRow) => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('files');
  useLocalizedFields(files.flatMap((file) => [file.file_name, file.section_name]));

  if (error && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-16 text-center dark:border-rose-900/40 dark:bg-navy-800">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
          <FiAlertCircle className="h-7 w-7" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">
            {t('empty.errorDeleted', 'Could not load deleted files')}
          </h4>
          <p className="mt-1 max-w-sm text-xs text-slate-400">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#3311CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/50"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            {t('page.retry', 'Retry')}
          </button>
        )}
      </div>
    );
  }

  if (!loading && !refreshing && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white px-4 py-20 text-center dark:border-navy-700 dark:bg-navy-800">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 dark:bg-navy-700 dark:text-slate-300">
          <FiTrash2 className="h-7 w-7" />
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">
          {t('empty.noDeletedTitle', 'No Deleted Files')}
        </h4>
        <p className="mt-1 max-w-sm text-xs text-slate-400">
          {t(
            'empty.noDeletedHint',
            'Deleted file records are moved here safely. You can restore them anytime or permanently erase them.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      className="shadow-xs relative w-full overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800"
      aria-busy={loading || undefined}
    >
      {refreshing && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-white/45 backdrop-blur-[1px] dark:bg-navy-900/35" />
      )}
      <div className="w-full overflow-x-auto">
        <table aria-label={t('table.deletedAria', 'Deleted Files')} className="w-full min-w-[880px] border-collapse table-auto text-left">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[12%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className="px-2.5 py-2.5 text-center">{t('table.colNo', '#')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.colFileNumber', 'File Number')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.colFileName', 'File Name')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.colSectionDept', 'Section / Dept')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.colStaffName', 'Registered By')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.colDeletedDate', 'Deleted Date')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.colReason', 'Reason')}</th>
              <th scope="col" className="px-2.5 py-2.5 text-center">{t('table.colAction', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className={TABLE_BODY_CLASS}>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <TableLoadingSpinner label={t('table.loadingDeleted', 'Loading deleted files…')} />
                </td>
              </tr>
            ) : (
              files.map((file, idx) => {
                const rowNo = String((page - 1) * limit + idx + 1).padStart(2, '0');
                const deletedFormatted = file.deleted_at
                  ? formatSriLankaDateTimeCompact(file.deleted_at)
                  : '—';

                return (
                  <tr key={file.id ?? idx} className={TABLE_ROW_CLASS}>
                    {/* NO */}
                    <td className="text-muted px-2.5 py-2.5 align-top text-center text-xs font-bold">
                      {rowNo}
                    </td>

                    {/* FILE NUMBER */}
                    <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                      <span
                        className="text-[11px] font-bold tracking-tight text-[#4318FF] [overflow-wrap:anywhere] sm:text-xs dark:text-brand-300"
                        title={file.file_no}
                      >
                        {file.file_no}
                      </span>
                    </td>

                    {/* FILE NAME */}
                    <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                      <div
                        className="line-clamp-2 w-[240px] break-words text-xs font-bold leading-snug text-slate-800 [overflow-wrap:anywhere] dark:text-white"
                        title={localizeField(file.file_name)}
                      >
                        {localizeField(file.file_name)}
                      </div>
                      <div className="mt-0.5">
                        <LocationDetailsButton
                          file={file}
                          className="text-muted inline-flex max-w-full items-center gap-1 text-[10px] font-medium"
                        />
                      </div>
                    </td>

                    {/* SECTION / DEPT */}
                    <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                      <span
                        className={`inline-flex items-start rounded-2xl border px-2 py-1 text-[10px] font-bold leading-snug break-words ${getSectionBadge(
                          file.section_name,
                        )}`}
                      >
                        {localizeField(file.section_name)}
                      </span>
                    </td>

                    {/* STAFF NAME */}
                    <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                      <div
                        className="flex items-start gap-1.5"
                        title={attributedNameText(file.registrar_name, {
                          deleted: file.registrar_is_deleted,
                          label: t('common:deletedUser'),
                          fallback: t('common:roles.STAFF'),
                        })}
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                            file.registrar_is_deleted
                              ? 'bg-slate-100 text-slate-400 dark:bg-navy-700 dark:text-slate-500'
                              : 'bg-slate-100 text-slate-700 dark:bg-navy-700 dark:text-slate-200'
                          }`}
                        >
                          {file.registrar_is_deleted && !file.registrar_name
                            ? '—'
                            : getInitials(file.registrar_name)}
                        </div>
                        <span className="min-w-0 break-words text-[11px] font-bold leading-tight text-slate-800 dark:text-white">
                          <AttributedUser
                            name={file.registrar_name}
                            deleted={file.registrar_is_deleted}
                            fallback={t('common:roles.STAFF')}
                          />
                        </span>
                      </div>
                    </td>

                    {/* DELETED DATE */}
                    <td className="whitespace-nowrap px-2.5 py-2.5 align-top text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {deletedFormatted}
                    </td>

                    {/* REASON */}
                    <td className="min-w-0 break-words px-2.5 py-2.5 align-top text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="line-clamp-2" title={file.deletion_reason || undefined}>
                        {file.deletion_reason || '—'}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td className="px-2.5 py-2.5 align-top text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onView(file)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none dark:border-navy-600 dark:bg-navy-700 dark:text-slate-200 dark:hover:bg-navy-600"
                          title={t('table.actionViewDetails', 'View details')}
                        >
                          <FiEye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRestore(file)}
                          className="flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                          title={t('table.actionRestoreFile', 'Restore file to active repository')}
                        >
                          <FiRotateCcw className="h-3 w-3" />
                          <span>{t('table.actionRestore', 'Restore')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onPermanentDelete(file)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 focus:outline-none dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
                          title={t('table.actionPermanentDelete', 'Permanently delete record')}
                        >
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <FilesPagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={onPageChange}
      />
    </div>
  );
}

'use client';

import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEye, FiXCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
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

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().split('T')[0];
  } catch {
    return iso;
  }
}

export default function RejectedFilesTable({
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
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">{t('empty.errorRejected')}</h4>
          <p className="mt-1 max-w-sm text-xs text-slate-400">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#3311CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/50 cursor-pointer"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            {t('page.retry')}
          </button>
        )}
      </div>
    );
  }

  if (!loading && !refreshing && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300 mb-3">
          <FiXCircle className="h-7 w-7" />
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">{t('empty.noRejectedTitle')}</h4>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          {t('empty.noRejectedHint')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-white shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700"
      aria-busy={loading || undefined}
    >
      {refreshing && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-white/45 dark:bg-navy-900/35 backdrop-blur-[1px]" />
      )}
      <div className="w-full overflow-x-auto">
        <table aria-label={t('table.rejectedAria')} className="w-full min-w-[860px] text-left border-collapse table-auto">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[9%]" />
            <col className="w-[20%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className="py-2.5 px-2.5 text-center">{t('table.colNo')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colFileNumber')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colFileName')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colSectionDept')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colStaffName')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colSubmissionDate')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colRejectionDate')}</th>
              <th scope="col" className="py-2.5 px-2.5">{t('table.colRejectedBy')}</th>
              <th scope="col" className="py-2.5 px-2.5 text-center">{t('table.colAction')}</th>
            </tr>
          </thead>
          <tbody className={TABLE_BODY_CLASS}>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-0">
                  <TableLoadingSpinner label={t('table.loadingRejected')} />
                </td>
              </tr>
            ) : files.map((file, idx) => {
              const rowNo = String((page - 1) * limit + idx + 1).padStart(2, '0');
              // rejected_by_name is snapshot-only (no id, no deleted flag); when it is
              // absent the cell falls back to the approver's name, which does carry one.
              const rejectedFromApprover =
                !file.rejected_by_name && !!file.approved_by_name;
              const rejectedByDeleted =
                rejectedFromApprover && file.approver_is_deleted === true;
              const rejectedByName = attributedNameText(
                file.rejected_by_name || file.approved_by_name,
                {
                  deleted: rejectedByDeleted,
                  label: t('common:deletedUser'),
                  fallback: t('table.roleAdministrator'),
                }
              );

              return (
                <tr
                  key={file.id ?? idx}
                  className={TABLE_ROW_CLASS}
                >
                  {/* NO */}
                  <td className="py-2.5 px-2.5 align-top text-center font-bold text-muted text-xs">
                    {rowNo}
                  </td>

                  {/* FILE NUMBER */}
                  <td className="py-2.5 px-2.5 align-top break-words min-w-0">
                    <span
                      className="font-bold text-[#4318FF] dark:text-brand-300 text-[11px] sm:text-xs tracking-tight [overflow-wrap:anywhere]"
                      title={file.file_no}
                    >
                      {file.file_no}
                    </span>
                  </td>

                  {/* FILE NAME */}
                  <td className="py-2.5 px-2.5 align-top break-words min-w-0">
                    <div
                      className="w-[240px] line-clamp-2 break-words font-bold text-slate-800 dark:text-white leading-snug text-xs [overflow-wrap:anywhere]"
                      title={localizeField(file.file_name)}
                    >
                      {localizeField(file.file_name)}
                    </div>
                    <div className="mt-0.5">
                      <LocationDetailsButton
                        file={file}
                        className="inline-flex max-w-full items-center gap-1 text-[10px] font-medium text-muted"
                      />
                    </div>
                  </td>

                  {/* SECTION / DEPT */}
                  <td className="py-2.5 px-2.5 align-top break-words min-w-0">
                    <span
                      className={`inline-flex items-start rounded-2xl px-2 py-1 text-[10px] font-bold border leading-snug break-words ${getSectionBadge(
                        file.section_name
                      )}`}
                    >
                      {localizeField(file.section_name)}
                    </span>
                  </td>

                  {/* STAFF NAME */}
                  <td className="py-2.5 px-2.5 align-top break-words min-w-0">
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
                      <span className="min-w-0 break-words font-bold text-slate-800 dark:text-white text-[11px] leading-tight">
                        <AttributedUser
                          name={file.registrar_name}
                          deleted={file.registrar_is_deleted}
                          fallback={t('common:roles.STAFF')}
                        />
                      </span>
                    </div>
                  </td>

                  {/* SUBMISSION DATE */}
                  <td className="py-2.5 px-2.5 align-top">
                    <div className="whitespace-nowrap font-semibold text-slate-700 dark:text-slate-200 text-[11px]">
                      {formatDate(file.created_at)}
                    </div>
                  </td>

                  {/* REJECTION DATE */}
                  <td className="py-2.5 px-2.5 align-top">
                    <div className="whitespace-nowrap font-semibold text-rose-600 dark:text-rose-400 text-[11px]">
                      {formatDate(file.rejected_at || file.approved_at)}
                    </div>
                  </td>

                  {/* REJECTED BY */}
                  <td className="py-2.5 px-2.5 align-top break-words min-w-0">
                    <div className="flex items-start gap-1.5">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          rejectedByDeleted
                            ? 'bg-slate-100 text-slate-400 dark:bg-navy-700 dark:text-slate-500'
                            : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}
                      >
                        {getInitials(
                          file.rejected_by_name ||
                            file.approved_by_name ||
                            t('table.roleAdministrator')
                        )}
                      </div>
                      <span className="min-w-0 break-words font-bold text-slate-800 dark:text-white text-[11px] leading-tight" title={t('table.rejectedByNameAdmin', { name: rejectedByName })}>
                        {t('table.rejectedByNameAdmin', { name: rejectedByName })}
                      </span>
                    </div>
                  </td>

                  {/* ACTION */}
                  <td className="py-2.5 px-2.5 align-top text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onView(file)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#4318FF] hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700 transition-colors cursor-pointer"
                        title={t('table.actionViewRejection')}
                        aria-label={t('table.actionViewRejection')}
                      >
                        <FiEye className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FilesPagination
        total={total}
        page={page}
        limit={limit}
        totalPages={totalPages}
        onPageChange={onPageChange}
        itemLabel="rejection"
        isFiltered={isFiltered}
      />
    </div>
  );
}

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { TABLE_BODY_CLASS, TABLE_HEAD_ROW_CLASS, TABLE_HIGHLIGHT_CLASS, tableRowClass } from 'lib/tableStyles';
import { localizeField, useLocalizedFields } from 'lib/useLocalizedFields';
import {
  FiCalendar,
  FiCheckCircle,
  FiEye,
  FiFileText,
  FiRotateCcw,
  FiUpload,
} from 'react-icons/fi';
import { formatSriLankaDate, formatSriLankaDateTimeCompact } from 'lib/datetime';
import FilesTableSkeleton from 'components/admin/files/FilesTableSkeleton';
import AttributedUser from 'components/ui/AttributedUser';
import { attributedNameText } from 'utils/userDisplay';
import {
  RETURN_BADGE_CLASS,
  getSectionBadge,
  type IssuedFileRow,
} from './issuedTypes';

function getInitials(name?: string | null): string {
  if (!name) return 'SF';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Date cell: readable Sri Lanka date plus the raw source value as a tooltip. */
function DateCell({ value }: { value: string | null | undefined }) {
  return (
    <span
      className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] leading-tight"
      title={value || undefined}
    >
      {formatSriLankaDate(value)}
    </span>
  );
}

export default function IssuedFilesTable({
  files,
  loading = false,
  refreshing = false,
  busyId = null,
  highlightId = null,
  onView,
  onReturn,
  onExtend,
}: {
  files: IssuedFileRow[];
  loading?: boolean;
  refreshing?: boolean;
  busyId?: number | null;
  /** Row a notification deep link pointed at. */
  highlightId?: number | null;
  onView: (file: IssuedFileRow) => void;
  onReturn: (file: IssuedFileRow) => void;
  onExtend: (file: IssuedFileRow) => void;
}) {
  const { t } = useTranslation('issued');
  // Section names and storage locations are officer content; requester names
  // and file numbers are identities and are never translated.
  useLocalizedFields(
    files.flatMap((file) => [
      file.file_name,
      file.storage_location,
      file.section_name,
      file.requester_section,
    ]),
  );

  if (loading) {
    return (
      <>
        <span className="sr-only" role="status">
          {t('table.loading')}
        </span>
        <FilesTableSkeleton />
      </>
    );
  }

  if (!refreshing && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white px-4 py-20 text-center dark:border-navy-700 dark:bg-navy-800 shadow-xs">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
          <FiFileText className="h-7 w-7" />
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">
          {t('empty.title')}
        </h4>
        <p className="mt-1 max-w-sm text-xs text-muted">
          {t('empty.hint')}
        </p>
      </div>
    );
  }

  return (
    <div
      aria-busy={refreshing}
      className="shadow-xs relative w-full overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800"
    >
      <span className="sr-only" role="status" aria-live="polite">
        {refreshing ? t('table.updating') : ''}
      </span>
      {refreshing && (
        <div
          className="pointer-events-none absolute inset-0 z-10 bg-white/45 backdrop-blur-[1px] dark:bg-navy-900/35"
          aria-hidden="true"
        />
      )}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse table-auto text-left">
          <caption className="sr-only">
            {t('table.caption')}
          </caption>
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className="px-2.5 py-2.5 text-center">{t('table.columns.no')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.fileNumber')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.fileName')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.staffName')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.section')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.issueDate')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.duration')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.originalReturn')}</th>
              <th scope="col" className="px-2.5 py-2.5">{t('table.columns.expectedReturn')}</th>
              <th scope="col" className="px-2.5 py-2.5 text-center">{t('table.columns.returnStatus')}</th>
              <th scope="col" className="px-2.5 py-2.5 text-center">{t('table.columns.action')}</th>
            </tr>
          </thead>
          <tbody className={TABLE_BODY_CLASS}>
            {files.map((file, idx) => {
              const isReturned = Boolean(file.returned_at);
              const rowBusy = busyId === file.id;

              return (
                <tr
                  key={file.id}
                  className={tableRowClass(
                    file.is_overdue && 'bg-rose-50/25 dark:bg-rose-950/15',
                    highlightId === file.id && TABLE_HIGHLIGHT_CLASS,
                  )}
                >
                  {/* NO */}
                  <td className="px-2.5 py-2.5 text-center text-xs font-bold text-muted">
                    {String(idx + 1).padStart(2, '0')}
                  </td>

                  {/* FILE NUMBER */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <span
                      className="font-mono text-[11px] font-bold tracking-tight text-[#4318FF] dark:text-brand-300 sm:text-xs [overflow-wrap:anywhere]"
                      title={file.file_no}
                    >
                      {file.file_no}
                    </span>
                  </td>

                  {/* FILE NAME */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <div
                      className="w-[240px] line-clamp-2 break-words text-xs font-bold leading-snug text-slate-800 dark:text-white [overflow-wrap:anywhere]"
                      title={localizeField(file.file_name)}
                    >
                      {localizeField(file.file_name)}
                    </div>
                    <div className="mt-0.5 break-words text-[10px] font-medium text-muted">
                      {localizeField(file.storage_location) || t('table.storageFallback')}
                    </div>
                  </td>

                  {/* STAFF NAME */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <div
                      className="flex items-start gap-1.5"
                      title={
                        attributedNameText(file.requester_name, {
                          deleted: file.requester_is_deleted,
                          label: t('common:deletedUser'),
                        }) || undefined
                      }
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-700 dark:bg-navy-700 dark:text-slate-200">
                        {getInitials(file.requester_name)}
                      </div>
                      <div className="min-w-0 break-words">
                        <span className="block text-[11px] font-bold leading-tight text-slate-800 dark:text-white">
                          <AttributedUser
                            name={file.requester_name}
                            deleted={file.requester_is_deleted}
                          />
                        </span>
                        <span className="block text-[10px] leading-tight text-muted">
                          {localizeField(file.requester_section) || t('table.staffFallback')}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* SECTION */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <span
                      className={`inline-block max-w-full break-words rounded-2xl border px-1.5 py-1 text-[10px] font-bold leading-snug ${getSectionBadge(
                        file.section_name,
                      )}`}
                    >
                      {localizeField(file.section_name)}
                    </span>
                  </td>

                  {/* ISSUE DATE */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] leading-tight">
                      {formatSriLankaDate(file.issued_at || file.request_date)}
                    </div>
                    {file.issued_at && (
                      <div className="mt-0.5 text-[10px] leading-tight text-muted">
                        {formatSriLankaDateTimeCompact(file.issued_at).slice(11)}
                      </div>
                    )}
                  </td>

                  {/* DURATION */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <span className="inline-flex items-center rounded-xl bg-slate-100/90 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-navy-900/90 dark:text-slate-200">
                      {file.duration_days ?? '—'}
                      <span className="ml-1 text-[10px] font-semibold text-muted">
                        {file.duration_days === 1 ? t('table.day') : t('table.days')}
                      </span>
                    </span>
                  </td>

                  {/* ORIGINAL RETURN DATE */}
                  <td className="min-w-0 break-words px-2.5 py-2.5 align-top">
                    <DateCell value={file.original_return_date} />
                  </td>

                  {/* EXPECTED RETURN DATE — extension is a rose flag, never the overdue status */}
                  <td className="px-2.5 py-2.5">
                    <div className="whitespace-nowrap">
                      <DateCell value={file.expected_return_date} />
                    </div>
                    {file.is_extended && !isReturned && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                          <FiUpload className="h-2.5 w-2.5" />
                          {t('table.extended')}
                        </span>
                        <span
                          className="text-[10px] font-bold text-rose-600 line-through dark:text-rose-400"
                          title={t('table.originalReturnTitle', {
                            date: file.original_return_date,
                          })}
                        >
                          {t('table.wasDate', {
                            date: formatSriLankaDate(file.original_return_date),
                          })}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* RETURN STATUS */}
                  <td className="px-2.5 py-2.5 text-center align-top">
                    <span
                      className={`inline-flex flex-wrap items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${
                        RETURN_BADGE_CLASS[file.return_status] ??
                        RETURN_BADGE_CLASS.active
                      }`}
                      title={
                        file.days_remaining === null
                          ? file.return_label
                          : `${file.return_label} • ${file.expected_return_date ?? ''}`
                      }
                    >
                      {isReturned ? (
                        <FiCheckCircle className="h-3 w-3 stroke-[2.5]" />
                      ) : (
                        <FiCalendar className="h-3 w-3 stroke-[2.5]" />
                      )}
                      <span className="break-words">{file.return_label}</span>
                    </span>
                  </td>

                  {/* ACTION */}
                  <td className="px-2.5 py-2.5 text-center align-top">
                    <div className="flex flex-col items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => onView(file)}
                        disabled={rowBusy}
                        aria-label={t('table.viewTitle')}
                        className="cursor-pointer self-center rounded-lg p-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-[#4318FF] disabled:opacity-40 dark:hover:bg-navy-700"
                        title={t('table.viewTitle')}
                      >
                        <FiEye className="h-3.5 w-3.5" />
                      </button>

                      {!isReturned && (
                        <>
                          <button
                            type="button"
                            onClick={() => onReturn(file)}
                            disabled={rowBusy}
                            aria-label={t('table.markReturned')}
                            className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-[#C6F6D5] bg-white px-1.5 py-1 text-[10px] font-bold text-[#05CD99] shadow-xs transition-all hover:bg-emerald-50 active:scale-95 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-navy-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                            title={t('table.markReturned')}
                          >
                            {rowBusy ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                            ) : (
                              <FiRotateCcw className="h-3 w-3" />
                            )}
                            <span>{t('table.return')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onExtend(file)}
                            disabled={rowBusy}
                            aria-label={t('table.extendTitle')}
                            className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-[#4318FF] px-1.5 py-1 text-[10px] font-bold text-white shadow-xs transition-all hover:bg-[#3311CC] active:scale-95 disabled:opacity-50"
                            title={t('table.extendTitle')}
                          >
                            <FiUpload className="h-3 w-3" />
                            <span>{t('table.extend')}</span>
                          </button>
                        </>
                      )}

                      {isReturned && (
                        <span className="text-[10px] font-semibold text-muted">
                          {t('table.closed')}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

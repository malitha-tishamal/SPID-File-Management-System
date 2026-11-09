'use client';

import { useTranslation } from 'react-i18next';
import {
  FiAlertCircle,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiEye,
  FiFlag,
  FiRefreshCw,
  FiX,
} from 'react-icons/fi';
import { formatSriLankaDate } from 'lib/datetime';
import { localiseReturnStatusLabel } from 'i18n/uiText';
import { localizeField, useLocalizedFields } from 'lib/useLocalizedFields';
import CompetingBadge from 'components/requests/CompetingBadge';
import { getCompetingRowClasses, getCompetingRowState } from 'lib/competing-requests';
import { getReturnStatus, isReturnDateExtended } from 'lib/returnStatus';
import {
  requestTabOf,
  type StaffRequestPriority,
  type StaffRequestStatus,
  type StaffRequestTab,
} from 'lib/staffRequests';
import {
  TABLE_BODY_CLASS,
  TABLE_EMPTY_CELL_CLASS,
  TABLE_HIGHLIGHT_CLASS,
  TABLE_PAGER_BTN_CLASS,
  TABLE_PAGER_CLASS,
  TABLE_PAGER_PAGE_ACTIVE_CLASS,
  TABLE_PAGER_PAGE_CLASS,
  tableRowClass,
} from 'lib/tableStyles';
import type { StaffRequestRow } from 'types/staffRequests';

/** Keys, not copy: each label is resolved with `t()` at render time. */
const priorityStyle: Record<
  StaffRequestPriority,
  { label: string; badgeClass: string }
> = {
  HIGH: {
    label: 'common:priority.HIGH',
    badgeClass:
      'bg-rose-50 text-red-800 border border-rose-300 dark:bg-rose-900 dark:text-rose-50 dark:border-rose-700',
  },
  NORMAL: {
    label: 'common:priority.NORMAL',
    badgeClass:
      'bg-amber-50 text-orange-800 border border-amber-300 dark:bg-amber-900 dark:text-amber-50 dark:border-amber-700',
  },
  LOW: {
    label: 'common:priority.LOW',
    badgeClass:
      'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-500',
  },
};

const statusStyle: Record<StaffRequestStatus, { label: string; className: string }> = {
  PENDING: {
    label: 'common:status.pending',
    className:
      'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-800 dark:text-amber-50 dark:border-amber-600',
  },
  APPROVED: {
    label: 'common:status.approved',
    className:
      'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-800 dark:text-emerald-50 dark:border-emerald-600',
  },
  REJECTED: {
    label: 'common:status.rejected',
    className:
      'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900 dark:text-rose-50 dark:border-rose-700',
  },
  CANCELLED: {
    label: 'common:status.cancelled',
    className:
      'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-500',
  },
};

/**
 * Fixed pixel widths keep every tab pixel-identical: all four tabs render this
 * same table, so the widths are the single source of truth for the layout.
 */
const COLUMNS = [
  { key: 'file_no', label: 'table.fileNo', className: 'w-[135px]' },
  { key: 'file_name', label: 'table.fileName', className: 'w-[195px]' },
  { key: 'section', label: 'table.sectionLocation', className: 'w-[185px]' },
  { key: 'access_date', label: 'table.accessDate', className: 'w-[100px]' },
  { key: 'duration', label: 'table.duration', className: 'w-[80px]' },
  { key: 'return_status', label: 'table.returnStatus', className: 'w-[130px]' },
  { key: 'priority', label: 'common:labels.priority', className: 'w-[85px]' },
  { key: 'status', label: 'common:labels.status', className: 'w-[90px]' },
  { key: 'action', label: 'common:labels.action', className: 'w-[285px]' },
] as const;

/** Two buttons must never wrap onto a second line inside the Action column. */
const ACTION_BTN_CLASS =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] font-bold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60';

function getLocationParts(location: string): string[] {
  return String(location || '')
    .split(/\s+—\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function ymd(value: string | null | undefined): string {
  return String(value || '').slice(0, 10);
}

function pageWindow(page: number, totalPages: number): number[] {
  const size = Math.min(5, totalPages);
  let start = Math.max(1, page - Math.floor(size / 2));
  if (start + size - 1 > totalPages) start = Math.max(1, totalPages - size + 1);
  return Array.from({ length: size }, (_, index) => start + index);
}

interface RequestsTableProps {
  requests: StaffRequestRow[];
  tab: StaffRequestTab;
  loading: boolean;
  refreshing: boolean;
  error: string;
  onRetry: () => void;
  cancellingId: number | null;
  onCancel: (request: StaffRequestRow) => void;
  onDetails: (request: StaffRequestRow) => void;
  onExtend: (request: StaffRequestRow) => void;
  highlightId: number | null;
  isFiltered: boolean;
  onClearFilters: () => void;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function RequestsTable({
  requests,
  tab,
  loading,
  refreshing,
  error,
  onRetry,
  cancellingId,
  onCancel,
  onDetails,
  onExtend,
  highlightId,
  isFiltered,
  onClearFilters,
  page,
  limit,
  total,
  totalPages,
  onPageChange,
}: RequestsTableProps) {
  const { t } = useTranslation('requests');
  // One batched lookup for every officer-typed value on this page; the hook
  // also re-renders the table when a translation arrives.
  useLocalizedFields(
    requests.flatMap((request) => [
      request.file_name,
      request.section_name,
      request.storage_location,
    ]),
  );
  const firstRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow = Math.min(page * limit, total);

  return (
    <div
      id="staff-requests-panel"
      role="tabpanel"
      aria-labelledby={`staff-requests-tab-${tab}`}
      aria-busy={loading || refreshing}
      className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-navy-700 dark:bg-navy-800"
    >
      {refreshing && !loading && (
        <div className="h-0.5 w-full overflow-hidden bg-slate-100 dark:bg-navy-700">
          <div className="h-full w-1/3 animate-pulse bg-[#4318FF] dark:bg-brand-400" />
        </div>
      )}

      {error && !loading ? (
        <div
          role="alert"
          className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <p className="flex items-center gap-2 font-bold">
            <FiAlertCircle className="h-4 w-4" /> {t('table.loadFailed')}
          </p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 cursor-pointer text-xs font-bold underline"
          >
            {t('common:buttons.retry')}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-navy-600">
          <table className="w-full min-w-[1285px] table-auto text-left">
            <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:bg-navy-900/50 dark:text-slate-300">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className={`px-3 py-2.5 ${column.className}`}>
                    {t(column.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={TABLE_BODY_CLASS}>
              {loading ? (
                Array.from({ length: 5 }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className="px-3 py-2">
                        <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-navy-700/80" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className={TABLE_EMPTY_CELL_CLASS}>
                    <FiClock className="mx-auto mb-2 h-7 w-7 text-slate-300 dark:text-navy-500" />
                    <p className="text-sm font-bold text-slate-700 dark:text-white">
                      {isFiltered
                        ? t('common:table.noRequestsMatch')
                        : t(`tabs.empty.${tab}.title`)}
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {isFiltered
                        ? t('empty.filteredBody')
                        : t(`tabs.empty.${tab}.body`)}
                    </p>
                    {isFiltered && (
                      <button
                        type="button"
                        onClick={onClearFilters}
                        className="mt-3 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300"
                      >
                        {t('common:buttons.clearFilters')}
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                requests.map((request) => {
                  const returnStatus =
                    request.status === 'APPROVED'
                      ? getReturnStatus(request.expected_return_date, request.returned_at)
                      : null;
                  const isExtended = isReturnDateExtended(
                    request.original_return_date,
                    request.expected_return_date,
                  );
                  const rowTab = requestTabOf(request.status, request.returned_at);
                  const canCancel = request.status === 'PENDING';
                  const canExtend =
                    rowTab === 'ongoing' && !request.returned_at;

                  return (
                    <tr
                      key={request.id}
                      data-state={getCompetingRowState(request.competing)}
                      className={tableRowClass(
                        getCompetingRowClasses(request.competing),
                        highlightId === request.id && TABLE_HIGHLIGHT_CLASS,
                      )}
                    >
                      <td className="min-w-0 px-3 py-2 align-middle">
                        <button
                          type="button"
                          onClick={() => onDetails(request)}
                          title={t('table.viewDetailsTitle', { fileNo: request.file_no })}
                          className="block max-w-full cursor-pointer truncate text-left font-bold tabular-nums text-indigo-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:text-brand-300"
                        >
                          {request.file_no}
                        </button>
                        <p
                          className="mt-0.5 truncate text-[10px] leading-tight text-muted"
                          title={t('table.submitted', {
                            date: formatSriLankaDate(request.created_at),
                          })}
                        >
                          {t('table.submitted', {
                            date: formatSriLankaDate(request.created_at),
                          })}
                        </p>
                        {request.competing?.isCompeting && (
                          <div className="mt-1">
                            <CompetingBadge info={request.competing} variant="count" />
                          </div>
                        )}
                      </td>

                      <td className="min-w-0 px-3 py-2 align-middle">
                        <p
                          className="line-clamp-2 break-words text-[12px] font-semibold leading-snug row-text-primary"
                          title={localizeField(request.file_name)}
                        >
                          {localizeField(request.file_name)}
                        </p>
                      </td>

                      <td className="min-w-0 px-3 py-2 align-middle">
                        <p
                          className="truncate text-[11.5px] font-semibold leading-snug row-text-secondary"
                          title={localizeField(request.section_name)}
                        >
                          {localizeField(request.section_name)}
                        </p>
                        <p
                          className="mt-0.5 truncate text-[10px] leading-tight text-muted"
                          title={localizeField(request.storage_location)}
                        >
                          {getLocationParts(localizeField(request.storage_location)).join(' • ') || '—'}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 align-middle text-[11px] tabular-nums row-text-secondary">
                        {formatSriLankaDate(`${ymd(request.request_date)}T00:00:00Z`)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 align-middle text-[11px] tabular-nums row-text-secondary">
                        {t('common:datetime.days', { count: request.duration_days })}
                      </td>

                      <td className="min-w-0 px-3 py-2 align-middle">
                        {returnStatus ? (
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <span
                              className={`inline-flex max-w-full items-center whitespace-normal break-words rounded-full px-2.5 py-1 text-[10px] font-extrabold leading-snug ${returnStatus.badgeClass}`}
                            >
                              {localiseReturnStatusLabel(returnStatus)}
                            </span>
                            {isExtended && (
                              <span
                                title={t('table.extendedTo', {
                                  date: formatSriLankaDate(
                                    `${ymd(request.expected_return_date)}T00:00:00Z`,
                                  ),
                                })}
                                className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[9px] font-black leading-snug text-rose-800 dark:border-rose-700 dark:bg-rose-900 dark:text-rose-50"
                              >
                                <FiCalendar className="h-2.5 w-2.5 shrink-0" />
                                <span className="min-w-0">
                                  {t('table.extendedTo', {
                                    date: formatSriLankaDate(
                                      `${ymd(request.expected_return_date)}T00:00:00Z`,
                                    ),
                                  })}
                                </span>
                              </span>
                            )}
                            {request.pending_extension && (
                              <span
                                title={t('table.extensionPending', {
                                  date: formatSriLankaDate(
                                    `${ymd(
                                      request.pending_extension.new_return_date,
                                    )}T00:00:00Z`,
                                  ),
                                })}
                                className="line-clamp-2 text-[9px] font-bold leading-tight text-amber-700 dark:text-amber-300"
                              >
                                {t('table.extensionPending', {
                                  date: formatSriLankaDate(
                                    `${ymd(
                                      request.pending_extension.new_return_date,
                                    )}T00:00:00Z`,
                                  ),
                                })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted">—</span>
                        )}
                      </td>

                      <td className="min-w-0 px-3 py-2 align-middle">
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <span
                            className={`inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full px-2.5 py-1 text-[10px] font-bold leading-snug ${
                              priorityStyle[request.priority]?.badgeClass ??
                              priorityStyle.NORMAL.badgeClass
                            }`}
                          >
                            <FiFlag aria-hidden="true" className="h-3 w-3 shrink-0" />
                            {priorityStyle[request.priority]
                              ? t(priorityStyle[request.priority].label)
                              : request.priority}
                          </span>
                          {/* Where this request sits in the queue for the file —
                              the same rank the admin queue and the API use. */}
                          <CompetingBadge info={request.competing} />
                        </div>
                      </td>

                      <td className="min-w-0 px-3 py-2 align-middle">
                        <span
                          className={`inline-flex max-w-full items-center whitespace-normal break-words rounded-full px-2.5 py-1 text-[10px] font-extrabold leading-snug ${
                            statusStyle[request.status]?.className ??
                            statusStyle.CANCELLED.className
                          }`}
                        >
                          {statusStyle[request.status]
                            ? t(statusStyle[request.status].label)
                            : request.status}
                        </span>
                      </td>

                      <td className="min-w-0 px-3 py-2 align-middle">
                        <div className="flex flex-wrap items-center justify-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDetails(request)}
                            className={`${ACTION_BTN_CLASS} bg-[#4318FF] text-white hover:bg-[#3414d8] focus-visible:ring-[#4318FF]/60 dark:bg-brand-600 dark:hover:bg-brand-500`}
                          >
                            <FiEye className="h-3.5 w-3.5 shrink-0" />
                            <span>{t('table.seeDetails')}</span>
                          </button>

                          {canCancel && (
                            <button
                              type="button"
                              disabled={cancellingId !== null}
                              onClick={() => onCancel(request)}
                              className={`${ACTION_BTN_CLASS} bg-[#EF4444] text-white hover:bg-[#DC2626] focus-visible:ring-rose-500/60`}
                            >
                              {cancellingId === request.id ? (
                                <FiRefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : (
                                <FiX className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>{t('table.cancelRequest')}</span>
                            </button>
                          )}

                          {canExtend &&
                            (request.pending_extension ? (
                              <span
                                className="min-w-0 truncate text-[10px] font-bold leading-tight text-amber-600 dark:text-amber-400"
                                title={t('table.extensionPending', {
                                  date: formatSriLankaDate(
                                    `${ymd(
                                      request.pending_extension.new_return_date,
                                    )}T00:00:00Z`,
                                  ),
                                })}
                              >
                                {t('table.extensionPendingReview')}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onExtend(request)}
                                className={`${ACTION_BTN_CLASS} bg-[#10B981] text-white hover:bg-[#059669] focus-visible:ring-emerald-500/60`}
                              >
                                <FiCalendar className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('table.requestExtraDays')}</span>
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className={TABLE_PAGER_CLASS}>
          <span className="text-[11px] font-semibold">
            {t('common:table.showing', { from: firstRow, to: lastRow, total })}
          </span>
          {totalPages > 1 && (
            <nav aria-label={t('table.pagesAria')} className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t('table.previousPage')}
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className={TABLE_PAGER_BTN_CLASS}
              >
                <FiChevronLeft />
              </button>
              {pageWindow(page, totalPages).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  aria-label={t('table.pageNumber', { page: pageNumber })}
                  aria-current={pageNumber === page ? 'page' : undefined}
                  onClick={() => onPageChange(pageNumber)}
                  className={`${TABLE_PAGER_PAGE_CLASS} ${
                    pageNumber === page
                      ? TABLE_PAGER_PAGE_ACTIVE_CLASS
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label={t('table.nextPage')}
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className={TABLE_PAGER_BTN_CLASS}
              >
                <FiChevronRight />
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

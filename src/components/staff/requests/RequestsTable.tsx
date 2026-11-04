'use client';

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
import { getReturnStatus, isReturnDateExtended } from 'lib/returnStatus';
import {
  getStaffRequestTabMeta,
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

const priorityStyle: Record<
  StaffRequestPriority,
  { label: string; badgeClass: string }
> = {
  HIGH: {
    label: 'High',
    badgeClass:
      'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  },
  NORMAL: {
    label: 'Normal',
    badgeClass:
      'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  LOW: {
    label: 'Low',
    badgeClass:
      'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
  },
};

const statusStyle: Record<StaffRequestStatus, { label: string; className: string }> = {
  PENDING: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
  },
  APPROVED: {
    label: 'Approved',
    className:
      'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
  },
  REJECTED: {
    label: 'Rejected',
    className:
      'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40',
  },
  CANCELLED: {
    label: 'Cancelled',
    className:
      'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-navy-700 dark:text-slate-300 dark:border-navy-600',
  },
};

/**
 * Fixed pixel widths keep every tab pixel-identical: all four tabs render this
 * same table, so the widths are the single source of truth for the layout.
 */
const COLUMNS = [
  { key: 'file_no', label: 'File No', className: 'w-[135px]' },
  { key: 'file_name', label: 'File Name', className: 'w-[195px]' },
  { key: 'section', label: 'Section & Location', className: 'w-[185px]' },
  { key: 'access_date', label: 'Access Date', className: 'w-[100px]' },
  { key: 'duration', label: 'Duration', className: 'w-[80px]' },
  { key: 'return_status', label: 'Return Status', className: 'w-[130px]' },
  { key: 'priority', label: 'Priority', className: 'w-[85px]' },
  { key: 'status', label: 'Status', className: 'w-[90px]' },
  { key: 'action', label: 'Action', className: 'w-[285px]' },
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
  const meta = getStaffRequestTabMeta(tab);
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
            <FiAlertCircle className="h-4 w-4" /> Could not load requests
          </p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 cursor-pointer text-xs font-bold underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-navy-600">
          <table className="w-full min-w-[1285px] table-fixed text-left">
            <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:bg-navy-900/50">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className={`px-3 py-2.5 ${column.className}`}>
                    {column.label}
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
                      {isFiltered ? 'No requests match your filters' : meta.emptyTitle}
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {isFiltered
                        ? 'Adjust the search text, date range, or priority — or clear the filters to see this tab again.'
                        : meta.emptyBody}
                    </p>
                    {isFiltered && (
                      <button
                        type="button"
                        onClick={onClearFilters}
                        className="mt-3 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300"
                      >
                        Clear filters
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
                      className={tableRowClass(highlightId === request.id && TABLE_HIGHLIGHT_CLASS)}
                    >
                      <td className="px-3 py-2 align-middle">
                        <button
                          type="button"
                          onClick={() => onDetails(request)}
                          title={`View details for ${request.file_no}`}
                          className="block max-w-full cursor-pointer truncate text-left font-bold tabular-nums text-[#4318FF] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 dark:text-brand-300"
                        >
                          {request.file_no}
                        </button>
                        <p
                          className="mt-0.5 truncate text-[10px] leading-tight text-slate-400"
                          title={`Submitted ${formatSriLankaDate(request.created_at)}`}
                        >
                          Submitted {formatSriLankaDate(request.created_at)}
                        </p>
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <p
                          className="line-clamp-2 break-words text-[12px] font-semibold leading-snug text-slate-700 dark:text-slate-200"
                          title={request.file_name}
                        >
                          {request.file_name}
                        </p>
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <p
                          className="truncate text-[11.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200"
                          title={request.section_name}
                        >
                          {request.section_name}
                        </p>
                        <p
                          className="mt-0.5 truncate text-[10px] leading-tight text-slate-400"
                          title={request.storage_location}
                        >
                          {getLocationParts(request.storage_location).join(' • ') || '—'}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 align-middle text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                        {formatSriLankaDate(`${ymd(request.request_date)}T00:00:00Z`)}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 align-middle text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                        {request.duration_days}{' '}
                        {request.duration_days === 1 ? 'day' : 'days'}
                      </td>

                      <td className="px-3 py-2 align-middle">
                        {returnStatus ? (
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <span
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-extrabold ${returnStatus.badgeClass}`}
                            >
                              {returnStatus.label}
                            </span>
                            {isExtended && (
                              <span
                                title={`Extended to ${formatSriLankaDate(`${ymd(request.expected_return_date)}T00:00:00Z`)}`}
                                className="inline-flex max-w-full items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-700 dark:border-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
                              >
                                <FiCalendar className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">
                                  Extended to{' '}
                                  {formatSriLankaDate(`${ymd(request.expected_return_date)}T00:00:00Z`)}
                                </span>
                              </span>
                            )}
                            {request.pending_extension && (
                              <span
                                title={`Extension to ${formatSriLankaDate(
                                  `${ymd(request.pending_extension.new_return_date)}T00:00:00Z`,
                                )} awaiting approval`}
                                className="line-clamp-2 text-[9px] font-bold leading-tight text-amber-600 dark:text-amber-400"
                              >
                                Extension to{' '}
                                {formatSriLankaDate(
                                  `${ymd(request.pending_extension.new_return_date)}T00:00:00Z`,
                                )}{' '}
                                awaiting approval
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            priorityStyle[request.priority]?.badgeClass ??
                            priorityStyle.NORMAL.badgeClass
                          }`}
                        >
                          <FiFlag aria-hidden="true" className="h-3 w-3 shrink-0" />
                          {priorityStyle[request.priority]?.label ?? request.priority}
                        </span>
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            statusStyle[request.status]?.className ??
                            statusStyle.CANCELLED.className
                          }`}
                        >
                          {statusStyle[request.status]?.label ?? request.status}
                        </span>
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-nowrap items-center justify-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDetails(request)}
                            className={`${ACTION_BTN_CLASS} bg-[#4318FF] text-white hover:bg-[#3414d8] focus-visible:ring-[#4318FF]/60 dark:bg-brand-600 dark:hover:bg-brand-500`}
                          >
                            <FiEye className="h-3.5 w-3.5 shrink-0" />
                            <span>See Details</span>
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
                              <span>Cancel request</span>
                            </button>
                          )}

                          {canExtend &&
                            (request.pending_extension ? (
                              <span
                                className="min-w-0 truncate text-[10px] font-bold leading-tight text-amber-600 dark:text-amber-400"
                                title={`Extension to ${formatSriLankaDate(
                                  `${ymd(request.pending_extension.new_return_date)}T00:00:00Z`,
                                )} awaiting approval`}
                              >
                                Extension pending review
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onExtend(request)}
                                className={`${ACTION_BTN_CLASS} bg-[#10B981] text-white hover:bg-[#059669] focus-visible:ring-emerald-500/60`}
                              >
                                <FiCalendar className="h-3.5 w-3.5 shrink-0" />
                                <span>Request extra days</span>
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
            Showing {firstRow}–{lastRow} of {total}
          </span>
          {totalPages > 1 && (
            <nav aria-label="Request pages" className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
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
                  aria-label={`Page ${pageNumber}`}
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
                aria-label="Next page"
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

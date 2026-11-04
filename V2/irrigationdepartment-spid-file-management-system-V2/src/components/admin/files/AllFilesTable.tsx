'use client';

import React from 'react';
import { TABLE_BODY_CLASS, TABLE_HEAD_ROW_CLASS, TABLE_PAGER_BTN_CLASS, TABLE_PAGER_CLASS, TABLE_PAGER_PAGE_ACTIVE_CLASS, TABLE_PAGER_PAGE_CLASS, TABLE_ROW_CLASS } from 'lib/tableStyles';
import { formatSriLankaDateTimeCompact, formatSriLankaTime } from 'lib/datetime';
import {
  FiEye,
  FiEdit2,
  FiTrash2,
  FiArchive,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiXCircle,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiCheck,
  FiX,
  FiRefreshCw,
} from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';
import FilesTableSkeleton from './FilesTableSkeleton';
import FilesPagination from './FilesPagination';
import LocationDetailsButton from './LocationDetailsButton';
import TableLoadingSpinner from './TableLoadingSpinner';

function getInitials(name?: string | null): string {
  if (!name) return 'SO';
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

function formatDateTimeParts(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  try {
    return {
      date: formatSriLankaDateTimeCompact(iso).slice(0, 10),
      time: formatSriLankaTime(iso),
    };
  } catch {
    return { date: iso, time: '' };
  }
}

export default function AllFilesTable({
  files,
  total,
  page,
  limit,
  totalPages,
  loading = false,
  refreshing = false,
  error = null,
  isFiltered = false,
  onPageChange,
  onView,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onRetry,
}: {
  files: FileRecordRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  isFiltered?: boolean;
  onPageChange: (newPage: number) => void;
  onView: (file: FileRecordRow) => void;
  onEdit: (file: FileRecordRow) => void;
  onDelete: (file: FileRecordRow) => void;
  onApprove?: (file: FileRecordRow) => void;
  onReject?: (file: FileRecordRow) => void;
  onRetry?: () => void;
}) {
  if (error && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-16 text-center dark:border-rose-900/40 dark:bg-navy-800">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
          <FiAlertCircle className="h-7 w-7" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">Failed to Load Files</h4>
          <p className="mt-1 max-w-sm text-xs text-slate-400">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#3311CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/50 cursor-pointer"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!refreshing && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 mb-3">
          <FiFileText className="h-7 w-7" />
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">No Files Found</h4>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          No records match the current filter or search criteria. Try resetting filters or adding a new file.
        </p>
      </div>
    );
  }

  const startRecord = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-white shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700"
      aria-busy={loading || undefined}
    >
      {refreshing && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-white/45 dark:bg-navy-900/35 backdrop-blur-[1px]" />
      )}
      <div className="w-full overflow-x-auto">
        <table aria-label="All system files" className="w-full min-w-[860px] text-left border-collapse table-auto xl:table-fixed xl:min-w-0">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[12%]" />
            <col className="w-[15%]" />
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className="py-2.5 px-1.5 text-center">NO</th>
              <th scope="col" className="py-2.5 px-1.5">FILE NUMBER</th>
              <th scope="col" className="py-2.5 px-1.5">FILE NAME</th>
              <th scope="col" className="py-2.5 px-1.5">SECTION</th>
              <th scope="col" className="py-2.5 px-1.5">FILE LOCATION</th>
              <th scope="col" className="py-2.5 px-1.5">ADDED BY</th>
              <th scope="col" className="py-2.5 px-1.5 text-center">ROLE</th>
              <th scope="col" className="py-2.5 px-1.5">ADDED DATE &amp; TIME</th>
              <th scope="col" className="py-2.5 px-1.5 text-center">REQUEST STATUS</th>
              <th scope="col" className="py-2.5 px-1.5 text-center">ADMIN ACTIONS</th>
            </tr>
          </thead>
          <tbody className={TABLE_BODY_CLASS}>
            {loading ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <TableLoadingSpinner label="Loading files..." />
                </td>
              </tr>
            ) : files.map((file, idx) => {
              const isAdmin =
                file.registrar_role === 'Administrator' ||
                file.registrar_role === 'Admin' ||
                (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));
              const rowNo = String((page - 1) * limit + idx + 1).padStart(2, '0');
              const dt = formatDateTimeParts(file.created_at);

              // Administrator attribution resolution
              const adminName =
                file.approved_by_name ||
                (file.approved_by && !file.approved_by.includes('-') ? file.approved_by : null);

              let statusLabel = 'System Verified';
              let subtext: string | null = `Admin Added (${file.registrar_name || 'Admin'})`;
              let statusColor = 'text-blue-600 dark:text-blue-400';
              let IconComponent = FiCheckCircle;

              if (isAdmin) {
                statusLabel = 'System Verified';
                subtext = `Admin Added (${file.registrar_name || 'Admin'})`;
                statusColor = 'text-blue-600 dark:text-blue-400';
                IconComponent = FiCheckCircle;
              } else if (file.status === 'PENDING') {
                statusLabel = 'Pending Review';
                subtext = 'Awaiting administrative review';
                statusColor = 'text-amber-600 dark:text-amber-400';
                IconComponent = FiClock;
              } else if (file.status === 'disabled' || file.status === 'disposed') {
                statusLabel = 'Disabled';
                subtext = adminName ? `by ${adminName}` : null;
                statusColor = 'text-rose-600 dark:text-rose-400';
                IconComponent = FiAlertCircle;
              } else if (file.status === 'REJECTED') {
                statusLabel = 'Rejected';
                const rejectedName = file.rejected_by_name || adminName;
                subtext = rejectedName ? `By ${rejectedName} (Admin)` : 'By Admin';
                statusColor = 'text-rose-600 dark:text-rose-400';
                IconComponent = FiXCircle;
              } else {
                statusLabel = 'Approved';
                subtext = `Approved (${file.approved_by_name || adminName || 'Admin'})`;
                statusColor = 'text-emerald-600 dark:text-emerald-400';
                IconComponent = FiCheckCircle;
              }

              return (
                <tr
                  key={file.id ?? idx}
                  className={TABLE_ROW_CLASS}
                >
                  {/* NO */}
                  <td className="py-2.5 px-1.5 align-top text-center font-bold text-slate-400 text-xs">
                    {rowNo}
                  </td>

                  {/* FILE NUMBER */}
                  <td className="break-words py-2.5 px-1.5 align-top">
                    <span className="font-bold text-[#4318FF] dark:text-brand-300 text-[11px] sm:text-xs tracking-tight">
                      {file.file_no}
                    </span>
                  </td>

                  {/* FILE NAME */}
                  <td className="py-2.5 px-1.5 align-top">
                    <div
                      className="break-words font-bold text-slate-800 dark:text-white leading-snug text-xs"
                      title={file.file_name}
                    >
                      {file.file_name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 break-words text-[10px] font-medium leading-tight text-slate-400">
                      <span>Recordroom Ingest</span>
                      <span>•</span>
                      <span>Horizon RMS</span>
                    </div>
                  </td>

                  {/* SECTION */}
                  <td className="py-2.5 px-1.5 align-top">
                    <span
                      className={`inline-flex items-start rounded-2xl px-2 py-1 text-[10px] font-bold border leading-snug ${getSectionBadge(
                        file.section_name
                      )}`}
                    >
                      {file.section_name}
                    </span>
                  </td>

                  {/* FILE LOCATION (Highlighted pill, wraps long location onto next line) */}
                  <td className="py-2.5 px-2">
                    <LocationDetailsButton
                      file={file}
                      className="inline-flex items-start gap-1.5 rounded-xl bg-slate-100/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-navy-900/90 dark:text-slate-200 border border-slate-200/80 dark:border-navy-700 max-w-[160px] xl:max-w-[200px] leading-tight"
                    />
                  </td>

                  {/* ADDED BY */}
                  <td className="py-2.5 px-1.5 align-top">
                    <div
                      className="flex min-w-0 items-start gap-1.5"
                      title={file.registrar_name || 'System Officer'}
                    >
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          isAdmin
                            ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 text-slate-700 dark:bg-navy-700 dark:text-slate-200'
                        }`}
                      >
                        {getInitials(file.registrar_name)}
                      </div>
                      <span className="min-w-0 break-words font-bold text-slate-800 dark:text-white text-[11px] leading-tight">
                        {file.registrar_name || 'System Officer'}
                      </span>
                    </div>
                  </td>

                  {/* ROLE */}
                  <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                    {isAdmin ? (
                      <span className="inline-block rounded-full bg-[#FEECEB] text-[#FF4757] dark:bg-rose-950/40 dark:text-rose-400 border border-[#FED7D7] dark:border-rose-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-[#E6F9F0] text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-400 border border-[#C6F6D5] dark:border-emerald-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Staff
                      </span>
                    )}
                  </td>

                  {/* ADDED DATE & TIME (Stacked cleanly) */}
                  <td className="py-2.5 px-1.5 align-top whitespace-nowrap">
                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] leading-tight">
                      {dt.date}
                    </div>
                    {dt.time && (
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                        {dt.time}
                      </div>
                    )}
                  </td>

                  {/* REQUEST STATUS */}
                  <td className="py-2.5 px-1.5 align-top text-center">
                    {isAdmin ? (
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 px-2.5 py-0.5 text-[10px] font-bold">
                          <FiCheckCircle className="h-3 w-3 stroke-[2.5]" />
                          <span>System Verified</span>
                        </span>
                        <span className="break-words text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                          Admin Added ({file.registrar_name || 'Admin'})
                        </span>
                      </div>
                    ) : file.status === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 px-2.5 py-0.5 text-[10px] font-bold">
                        <span className="text-[9px]">⏳</span>
                        <span>Pending Review</span>
                      </span>
                    ) : file.status === 'REJECTED' ? (
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900 px-2.5 py-0.5 text-[10px] font-bold">
                          <FiX className="h-3 w-3 stroke-[3]" />
                          <span>Rejected</span>
                        </span>
                        <span className="break-words text-[10px] font-semibold leading-tight text-rose-500 dark:text-rose-400">
                          By {file.rejected_by_name || file.approved_by_name || 'Admin'} (Admin)
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F9F0] text-[#05CD99] border border-[#C6F6D5] dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900 px-2.5 py-0.5 text-[10px] font-bold">
                          <FiCheck className="h-3 w-3 stroke-[3]" />
                          <span>Approved</span>
                        </span>
                        <span className="break-words text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                          {file.approved_by_name?.toLowerCase().includes('auto') || (!file.approved_by && !file.approved_by_name && !isAdmin)
                            ? '(Reason: Auto approval on)'
                            : `Admin (${file.approved_by_name || 'Admin'})`}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* ADMIN ACTIONS: Approve, Reject (only for pending staff files), View, Edit, Delete */}
                  <td className="py-2.5 px-1.5 align-top text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {!isAdmin && file.status === 'PENDING' && onApprove && onReject && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApprove(file)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#05CD99] hover:bg-[#04B787] text-white px-2 py-1 text-[10px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Approve File"
                          >
                            <FiCheck className="h-3 w-3 stroke-[3]" />
                            <span>Approve</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onReject(file)}
                            className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 dark:bg-navy-900 dark:border-rose-900/40 dark:hover:bg-rose-950/30 px-2 py-1 text-[10px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Reject File"
                          >
                            <FiX className="h-3 w-3 stroke-[3]" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => onView(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#4318FF] hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors cursor-pointer"
                        title="View details"
                      >
                        <FiEye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors cursor-pointer"
                        title="Edit file"
                      >
                        <FiEdit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete file"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
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
        itemLabel="file"
        isFiltered={isFiltered}
      />
    </div>
  );
}

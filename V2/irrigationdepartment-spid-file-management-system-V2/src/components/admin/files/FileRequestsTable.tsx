'use client';

import React, { memo } from 'react';
import { FiCheck, FiX, FiEye, FiClock, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { TABLE_BODY_CLASS, TABLE_HEAD_ROW_CLASS, TABLE_ROW_CLASS } from 'lib/tableStyles';
import type { FileRecordRow } from 'models/FileRepository';
import FilesTableSkeleton from './FilesTableSkeleton';
import FilesPagination from './FilesPagination';
import { formatSriLankaDateTimeCompact, formatSriLankaTime } from 'lib/datetime';
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

export default function FileRequestsTable({
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
  onApprove,
  onReject,
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
  onApprove: (file: FileRecordRow) => void;
  onReject: (file: FileRecordRow) => void;
  onView: (file: FileRecordRow) => void;
  onRetry?: () => void;
}) {
  if (error && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-16 text-center dark:border-rose-900/40 dark:bg-navy-800">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
          <FiAlertCircle className="h-7 w-7" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">Failed to Load File Requests</h4>
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

  if (!loading && !refreshing && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 mb-3">
          <FiCheck className="h-7 w-7" />
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">All Clear! No Pending Submissions</h4>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          There are currently no staff file requests awaiting administrative approval. New staff submissions will appear here.
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
        <table aria-label="Pending file requests" className="w-full min-w-[860px] text-left border-collapse table-auto xl:table-fixed xl:min-w-0">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[9%]" />
            <col className="w-[17%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className="py-2.5 px-1.5 text-center">NO</th>
              <th scope="col" className="py-2.5 px-1.5">FILE NUMBER</th>
              <th scope="col" className="py-2.5 px-1.5">FILE NAME</th>
              <th scope="col" className="py-2.5 px-1.5">SECTION</th>
              <th scope="col" className="py-2.5 px-1.5">FILE LOCATION</th>
              <th scope="col" className="py-2.5 px-1.5">SUBMITTED BY</th>
              <th scope="col" className="py-2.5 px-1.5 text-center">ROLE</th>
              <th scope="col" className="py-2.5 px-1.5">SUBMITTED DATE &amp; TIME</th>
              <th scope="col" className="py-2.5 px-1.5 text-center">REQUEST STATUS</th>
              <th scope="col" className="py-2.5 px-1.5 text-center">ADMIN ACTIONS</th>
            </tr>
          </thead>
          <tbody className={TABLE_BODY_CLASS}>
            {loading ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <TableLoadingSpinner label="Loading file requests..." />
                </td>
              </tr>
            ) : files.map((file, idx) => {
              const isAdmin =
                file.registrar_role === 'Administrator' ||
                file.registrar_role === 'Admin' ||
                (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));
              const roleLabel = isAdmin ? 'Admin' : 'Staff';
              const dt = formatDateTimeParts(file.created_at);
              const rowNo = String((page - 1) * limit + idx + 1).padStart(2, '0');

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
                  <td className="py-2.5 px-1.5 align-top break-words">
                    <span className="font-bold text-[#4318FF] dark:text-brand-300 text-[11px] sm:text-xs tracking-tight">
                      {file.file_no}
                    </span>
                  </td>

                  {/* FILE NAME */}
                  <td className="py-2.5 px-1.5 align-top break-words">
                    <div
                      className="break-words font-bold text-slate-800 dark:text-white leading-snug text-xs"
                      title={file.file_name}
                    >
                      {file.file_name}
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 flex flex-wrap items-center gap-1 mt-0.5 break-words leading-tight">
                      <span>Recordroom Ingest</span>
                      <span>•</span>
                      <span>Horizon RMS</span>
                    </div>
                  </td>

                  {/* SECTION */}
                  <td className="py-2.5 px-1.5 align-top break-words">
                    <span
                      className={`inline-flex items-start rounded-2xl px-2 py-1 text-[10px] font-bold border leading-snug break-words ${getSectionBadge(
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

                  {/* SUBMITTED BY */}
                  <td className="py-2.5 px-1.5 align-top break-words">
                    <div
                      className="flex items-start gap-1.5"
                      title={file.registrar_name || 'Staff Member'}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-navy-700 dark:text-slate-200 text-[9px] font-bold">
                        {getInitials(file.registrar_name)}
                      </div>
                      <span className="min-w-0 break-words font-bold text-slate-800 dark:text-white text-[11px] leading-tight">
                        {file.registrar_name || 'Staff Member'}
                      </span>
                    </div>
                  </td>

                  {/* ROLE */}
                  <td className="py-2.5 px-1.5 text-center align-top whitespace-nowrap">
                    {isAdmin ? (
                      <span className="inline-block rounded-full border border-[#FED7D7] bg-[#FEECEB] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FF4757] dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
                        Admin
                      </span>
                    ) : (
                      <span className="inline-block rounded-full border border-[#C6F6D5] bg-[#E6F9F0] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#05CD99] dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                        Staff
                      </span>
                    )}
                  </td>

                  {/* SUBMITTED DATE & TIME (Stacked cleanly) */}
                  <td className="py-2.5 px-1.5 align-top">
                    <div className="whitespace-nowrap font-semibold text-slate-700 dark:text-slate-200 text-[11px] leading-tight">
                      {dt.date}
                    </div>
                    {dt.time && (
                      <div className="whitespace-nowrap text-[10px] text-slate-400 leading-tight mt-0.5">
                        {dt.time}
                      </div>
                    )}
                  </td>

                  {/* REQUEST STATUS */}
                  <td className="py-2.5 px-1.5 align-top text-center">
                    {isAdmin ? (
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 px-2 py-0.5 text-[10px] font-bold leading-tight">
                          <span className="break-words">System Verified</span>
                        </span>
                        <span className="break-words text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                          Admin Added
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 px-2 py-0.5 text-[10px] font-bold leading-tight">
                        <FiClock className="h-3 w-3 stroke-[2.5]" />
                        <span className="break-words">Pending Review</span>
                      </span>
                    )}
                  </td>

                  {/* ADMIN ACTIONS */}
                  <td className="py-2.5 px-1.5 align-top text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {/* Approve & Reject: ONLY for staff submissions */}
                      {!isAdmin && (
                        <>
                          {/* Approve Button */}
                          <button
                            type="button"
                            onClick={() => onApprove(file)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#05CD99] hover:bg-[#04B787] text-white px-2 py-1 text-[10px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Approve request"
                          >
                            <FiCheck className="h-3 w-3 stroke-[3]" />
                            <span>Approve</span>
                          </button>

                          {/* Reject Button */}
                          <button
                            type="button"
                            onClick={() => onReject(file)}
                            className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 dark:bg-navy-900 dark:border-rose-900/40 dark:hover:bg-rose-950/30 px-2 py-1 text-[10px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Reject request"
                          >
                            <FiX className="h-3 w-3 stroke-[3]" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {/* View Details Button (Always available) */}
                      <button
                        type="button"
                        onClick={() => onView(file)}
                        className="p-1 rounded-lg text-slate-400 hover:text-[#4318FF] hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors cursor-pointer"
                        title="View details"
                      >
                        <FiEye className="h-3.5 w-3.5" />
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
        itemLabel="request"
        isFiltered={isFiltered}
      />
    </div>
  );
}

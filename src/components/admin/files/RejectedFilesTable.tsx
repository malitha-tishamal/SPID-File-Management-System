'use client';

import React from 'react';
import {
  FiEye,
  FiArchive,
  FiXCircle,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';

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
  total = 0,
  page = 1,
  limit = 15,
  totalPages = 1,
  isFiltered = false,
  onPageChange,
  onView,
}: {
  files: FileRecordRow[];
  loading?: boolean;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  isFiltered?: boolean;
  onPageChange?: (newPage: number) => void;
  onView: (file: FileRecordRow) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700">
        <span className="h-8 w-8 animate-spin rounded-full border-3 border-rose-500 border-t-transparent" />
        <p className="mt-3 text-xs font-semibold text-slate-400">Loading rejected submissions…</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-navy-800 rounded-2xl border border-slate-100 dark:border-navy-700 text-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300 mb-3">
          <FiXCircle className="h-7 w-7" />
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-white">No Rejected Submissions</h4>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          There are currently no rejected file submissions. Declined staff requests will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse table-auto min-w-[980px] xl:min-w-0">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/60 dark:bg-navy-900/40 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <th className="py-2.5 px-2 w-9 text-center">NO</th>
              <th className="py-2.5 px-2 w-[108px]">FILE NUMBER</th>
              <th className="py-2.5 px-2 min-w-[155px]">FILE NAME</th>
              <th className="py-2.5 px-2 w-[130px]">SECTION / DEPT</th>
              <th className="py-2.5 px-2 w-[120px]">STAFF NAME</th>
              <th className="py-2.5 px-2 w-[90px]">SUBMISSION DATE</th>
              <th className="py-2.5 px-2 w-[90px]">REJECTION DATE</th>
              <th className="py-2.5 px-2 w-[115px]">REJECTED BY</th>
              <th className="py-2.5 px-2 text-center w-[70px]">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-navy-700 text-xs">
            {files.map((file, idx) => {
              const rowNo = String((page - 1) * limit + idx + 1).padStart(2, '0');
              const rejectedByName =
                file.rejected_by_name ||
                file.approved_by_name ||
                'Administrator';

              return (
                <tr
                  key={file.id ?? idx}
                  className="hover:bg-slate-50/80 dark:hover:bg-navy-700/50 transition-colors"
                >
                  {/* NO */}
                  <td className="py-2.5 px-2 text-center font-bold text-slate-400 text-xs">
                    {rowNo}
                  </td>

                  {/* FILE NUMBER */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span className="font-bold text-[#4318FF] dark:text-brand-300 text-[11px] sm:text-xs tracking-tight">
                      {file.file_no}
                    </span>
                  </td>

                  {/* FILE NAME */}
                  <td className="py-2.5 px-2">
                    <div
                      className="font-bold text-slate-800 dark:text-white leading-snug line-clamp-2 text-xs"
                      title={file.file_name}
                    >
                      {file.file_name}
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                      <FiArchive className="h-3 w-3 shrink-0" />
                      <span className="truncate">{file.archive_repository || 'Central Record Room'}</span>
                    </div>
                  </td>

                  {/* SECTION / DEPT */}
                  <td className="py-2.5 px-2">
                    <span
                      className={`inline-flex items-start rounded-2xl px-2 py-1 text-[10px] font-bold border leading-snug ${getSectionBadge(
                        file.section_name
                      )}`}
                    >
                      {file.section_name}
                    </span>
                  </td>

                  {/* STAFF NAME */}
                  <td className="py-2.5 px-2">
                    <div
                      className="flex items-center gap-1.5"
                      title={file.registrar_name || 'Staff Member'}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-navy-700 dark:text-slate-200 text-[9px] font-bold">
                        {getInitials(file.registrar_name)}
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white text-[11px] truncate max-w-[85px]">
                        {file.registrar_name || 'Staff Member'}
                      </span>
                    </div>
                  </td>

                  {/* SUBMISSION DATE */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px]">
                      {formatDate(file.created_at)}
                    </div>
                  </td>

                  {/* REJECTION DATE */}
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <div className="font-semibold text-rose-600 dark:text-rose-400 text-[11px]">
                      {formatDate(file.rejected_at || file.approved_at)}
                    </div>
                  </td>

                  {/* REJECTED BY */}
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 text-[9px] font-bold">
                        {getInitials(rejectedByName)}
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white text-[11px] truncate max-w-[80px]" title={rejectedByName}>
                        {rejectedByName}
                      </span>
                    </div>
                  </td>

                  {/* ACTION */}
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onView(file)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#4318FF] hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors cursor-pointer"
                      title="View rejection details"
                    >
                      <FiEye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer — hidden when a search/filter is active */}
      {!isFiltered && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-navy-700 px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
          <div>
            {total === 0
              ? 'No rejected submissions'
              : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total} rejected submission${total !== 1 ? 's' : ''}`}
          </div>

          {totalPages >= 1 && onPageChange && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <FiChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                if (
                  totalPages > 7 &&
                  p !== 1 &&
                  p !== totalPages &&
                  Math.abs(p - page) > 1
                ) {
                  if (p === 2 || p === totalPages - 1) {
                    return (
                      <span key={p} className="px-1 text-slate-400 text-xs">
                        ...
                      </span>
                    );
                  }
                  return null;
                }

                return (
                  <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                      page === p
                        ? 'bg-[#4318FF] text-white shadow-xs'
                        : 'border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <FiChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

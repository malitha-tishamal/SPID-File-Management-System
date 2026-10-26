'use client';

import React, { useEffect } from 'react';
import { formatSriLankaDateTime } from 'lib/datetime';
import { useProfile } from 'contexts/ProfileContext';
import {
  FiX,
  FiFileText,
  FiFolder,
  FiMapPin,
  FiCalendar,
  FiUser,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiLayers,
  FiAlertCircle,
} from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';

export default function ViewFileModal({
  file,
  onClose,
  isStaffView,
}: {
  file: FileRecordRow | null;
  onClose: () => void;
  isStaffView?: boolean;
}) {
  const { profile } = useProfile();
  const isViewerStaff = isStaffView ?? (profile?.role === 'Staff');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!file) return null;

  const isAdmin =
    file.registrar_role === 'Administrator' ||
    file.registrar_role === 'Admin' ||
    (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));

  const isPending = file.status === 'PENDING';
  const isApproved = file.status === 'APPROVED' || file.status === 'active';
  const isRejected = file.status === 'REJECTED';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-navy-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiFileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#4318FF] dark:text-brand-300">
                  {file.file_no}
                </span>
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    <FiCheckCircle className="h-3 w-3 stroke-[2.5]" />
                    System Verified â€¢ Admin Added ({file.registrar_name || 'Admin'})
                  </span>
                ) : isApproved ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <FiCheckCircle className="h-3 w-3" />
                    {file.approved_by_name?.toLowerCase().includes('auto') || (!file.approved_by && !file.approved_by_name && !isAdmin)
                      ? 'Approved (Reason: Auto approval on)'
                      : (isViewerStaff ? 'Approved (Admin)' : `Approved (Admin: ${file.approved_by_name || 'Admin'})`)}
                  </span>
                ) : isPending ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    <FiClock className="h-3 w-3" />
                    Pending Review
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                    <FiXCircle className="h-3 w-3" />
                    Rejected
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-navy-800 dark:text-white leading-snug">
                {file.file_name}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Section */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiFolder className="h-3.5 w-3.5" /> Department / Section
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.section_name || 'â€”'}
            </p>
          </div>

          {/* Storage Location */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiMapPin className="h-3.5 w-3.5" /> Storage Location
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {[file.locker_no, file.shelf_name, file.shelf_position]
                .filter(Boolean)
                .join(' / ') || 'Central Record Room'}
            </p>
          </div>

          {/* Date Range */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiCalendar className="h-3.5 w-3.5" /> Record Coverage
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.start_date || 'â€”'} to {file.end_date || 'â€”'}
            </p>
          </div>

          {/* Pages & Sheets */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiLayers className="h-3.5 w-3.5" /> Volume Metrics
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.page_numbers ?? 0} Pages â€¢ {file.minute_sheets_count ?? 0} Minute Sheets
            </p>
          </div>

          {/* Submitting Staff Officer */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiUser className="h-3.5 w-3.5" /> Submitted / Added By
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.registrar_name || 'Staff Member'}
            </p>
            <p className="text-[11px] text-slate-400">
              Role:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {file.registrar_role === 'Administrator' ? 'Administrator' : 'Staff'}
              </span>
            </p>
          </div>

          {/* Submission Timestamp & Approval */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiClock className="h-3.5 w-3.5" /> Ledger Timing
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.created_at ? formatSriLankaDateTime(file.created_at) : 'â€”'}
            </p>
            {isApproved && file.approved_at && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                {file.approved_by_name?.toLowerCase().includes('auto') || (!file.approved_by && !file.approved_by_name && !isAdmin)
                  ? `Approved: ${formatSriLankaDateTime(file.approved_at)} (Auto approval on)`
                  : `Approved: ${formatSriLankaDateTime(file.approved_at)}`}
              </p>
            )}
            {isRejected && (file.rejected_at || file.approved_at) && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                Rejected:{' '}
                {new Date(file.rejected_at || file.approved_at!).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Rejection Reason block â€” shown only for rejected submissions */}
        {isRejected && (
          <div className="mt-4 rounded-2xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20 p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                <FiAlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
                  Rejection Reason
                </p>
                {file.reject_reason ? (
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-200 whitespace-pre-wrap break-words">
                    {file.reject_reason}
                  </p>
                ) : (
                  <p className="text-xs italic text-rose-400 dark:text-rose-500">
                    No rejection reason recorded.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-rose-600 dark:text-rose-400">
                  <p>
                    Rejected by:{' '}
                    <span className="font-bold">
                      {isViewerStaff
                        ? 'Admin'
                        : `${file.rejected_by_name || file.approved_by_name || 'Administrator'} (Admin)`}
                    </span>
                  </p>
                  {(file.rejected_at || file.approved_at) && (
                    <p>
                      Date:{' '}
                      <span className="font-bold">
                        {formatSriLankaDateTime(file.rejected_at || file.approved_at!)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 hover:bg-brand-600 active:scale-95 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';
import { useProfile } from 'contexts/ProfileContext';
import {
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
import FileModalShell from './FileModalShell';

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
  const isViewerStaff = isStaffView ?? profile?.role === 'Staff';

  if (!file) return null;

  const isAdmin =
    file.registrar_role === 'Administrator' ||
    file.registrar_role === 'Admin' ||
    (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));

  const isPending = file.status === 'PENDING';
  const isApproved = file.status === 'APPROVED' || file.status === 'active';
  const isRejected = file.status === 'REJECTED';
  const isAutoApproved =
    file.approved_by_name?.toLowerCase().includes('auto') ||
    (!file.approved_by && !file.approved_by_name && !isAdmin);

  const statusBadge = isAdmin ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
      <FiCheckCircle className="h-3 w-3 stroke-[2.5]" />
      System Verified • Admin Added ({file.registrar_name || 'Admin'})
    </span>
  ) : isApproved ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
      <FiCheckCircle className="h-3 w-3" />
      {isAutoApproved
        ? 'Approved (Reason: Auto approval on)'
        : isViewerStaff
        ? 'Approved (Admin)'
        : `Approved (Admin: ${file.approved_by_name || 'Admin'})`}
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
  );

  return (
    <FileModalShell
      title={file.file_name}
      subtitle={
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-[#4318FF] dark:text-brand-300">
            {file.file_no}
          </span>
          {statusBadge}
        </div>
      }
      icon={<FiFileText className="h-5 w-5" />}
      iconTone="brand"
      onClose={onClose}
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="ml-auto cursor-pointer rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 transition-all hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 active:scale-95 dark:focus-visible:ring-offset-navy-800"
        >
          Close
        </button>
      }
    >
      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:gap-4">
        {/* Section */}
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
            <FiFolder className="h-3.5 w-3.5" /> Department / Section
          </span>
          <p className="break-words font-bold text-slate-800 dark:text-white">
            {file.section_name || '—'}
          </p>
        </div>

        {/* Date Range */}
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
            <FiCalendar className="h-3.5 w-3.5" /> Record Coverage
          </span>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1 dark:border-navy-700">
            <span className="text-[11px] font-semibold text-slate-400">
              Start Date
            </span>
            <span className="font-bold text-slate-800 dark:text-white">
              {formatSriLankaDate(file.start_date)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-slate-400">
              End Date
            </span>
            <span className="font-bold text-slate-800 dark:text-white">
              {formatSriLankaDate(file.end_date)}
            </span>
          </div>
        </div>

        {/* Submitted By */}
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
            <FiUser className="h-3.5 w-3.5" /> Submitted / Added By
          </span>
          <p className="break-words font-bold text-slate-800 dark:text-white">
            {file.registrar_name || 'Staff Member'}
          </p>
          <p className="text-[11px] text-slate-400">
            Role:{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {file.registrar_role === 'Administrator' ? 'Administrator' : 'Staff'}
            </span>
          </p>
        </div>

        {/* Page Count */}
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
            <FiLayers className="h-3.5 w-3.5" /> Page Count
          </span>
          <p className="font-bold text-slate-800 dark:text-white">
            {file.page_numbers ?? 0} Pages • {file.minute_sheets_count ?? 0} Minute Sheets
          </p>
        </div>

        {/* File Location */}
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
            <FiMapPin className="h-3.5 w-3.5" /> File Location
          </span>
          {file.locker_no || file.shelf_name ? (
            <p className="break-words font-bold text-slate-800 dark:text-white">
              {[file.locker_no, file.shelf_name, file.shelf_position].filter(Boolean).join(' / ')}
            </p>
          ) : (
            <p className="italic text-slate-400">Not specified</p>
          )}
        </div>

        {/* Ledger Timing */}
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
            <FiClock className="h-3.5 w-3.5" /> Ledger Timing
          </span>
          <p className="font-bold text-slate-800 dark:text-white">
            {file.created_at ? formatSriLankaDateTime(file.created_at) : '—'}
          </p>
          {isApproved && file.approved_at && (
            <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              {isAutoApproved
                ? `Approved: ${formatSriLankaDateTime(file.approved_at)} (Auto approval on)`
                : `Approved: ${formatSriLankaDateTime(file.approved_at)}`}
            </p>
          )}
          {isRejected && (file.rejected_at || file.approved_at) && (
            <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
              Rejected:{' '}
              {formatSriLankaDateTime(file.rejected_at || file.approved_at)}
            </p>
          )}
        </div>
      </div>

      {/* Rejection Reason block */}
      {isRejected && (
        <div className="mt-4 rounded-2xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20 p-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
              <FiAlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Rejection Reason
              </p>
              {file.reject_reason ? (
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
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
                      {formatSriLankaDateTime(file.rejected_at || file.approved_at)}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </FileModalShell>
  );
}

'use client';

import React, { useEffect } from 'react';
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
} from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';

export default function ViewFileModal({
  file,
  onClose,
}: {
  file: FileRecordRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!file) return null;

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
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isPending
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : isApproved
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                  }`}
                >
                  {isPending && <FiClock className="h-3 w-3" />}
                  {isApproved && <FiCheckCircle className="h-3 w-3" />}
                  {isRejected && <FiXCircle className="h-3 w-3" />}
                  {isPending ? 'Pending Review' : isApproved ? 'Approved / Active' : 'Rejected'}
                </span>
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
              {file.section_name || '—'}
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
              {file.start_date || '—'} to {file.end_date || '—'}
            </p>
          </div>

          {/* Pages & Sheets */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiLayers className="h-3.5 w-3.5" /> Volume Metrics
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.page_numbers ?? 0} Pages • {file.minute_sheets_count ?? 0} Minute Sheets
            </p>
          </div>

          {/* Submitting / Adding Officer */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiUser className="h-3.5 w-3.5" /> Submitted / Added By
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.registrar_name || 'System User'}
            </p>
            <p className="text-[11px] text-slate-400">
              Role: <span className="font-semibold text-slate-600 dark:text-slate-300">{file.registrar_role || 'Staff'}</span>
            </p>
          </div>

          {/* Submission Timestamp & Approval */}
          <div className="rounded-2xl bg-slate-50 dark:bg-navy-900/50 p-3.5 border border-slate-100 dark:border-navy-700">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-1">
              <FiClock className="h-3.5 w-3.5" /> Ledger Timing
            </span>
            <p className="font-bold text-slate-800 dark:text-white">
              {file.created_at ? new Date(file.created_at).toLocaleString() : '—'}
            </p>
            {file.approved_at && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                Approved: {new Date(file.approved_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

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

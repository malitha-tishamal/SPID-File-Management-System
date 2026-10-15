'use client';
import React, { useEffect } from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

/**
 * Small confirmation dialog for destructive account actions
 * (disable / reject / delete) before the feedback modal fires.
 */
export default function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-navy-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
            tone === 'danger'
              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-brand-50 text-[#4318FF] dark:bg-navy-600'
          }`}
        >
          <FiAlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-navy-700 dark:text-white">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white shadow transition-colors disabled:opacity-60 ${
              tone === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#4318FF] hover:bg-brand-600'
            }`}
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

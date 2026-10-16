'use client';

import React, { useEffect } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';

export type GlassNotificationType = 'success' | 'failure';

export interface GlassNotificationProps {
  isOpen: boolean;
  type: GlassNotificationType;
  title?: string;
  message?: string;
  onClose: () => void;
  autoCloseDuration?: number; // ms, default 3500 for success
}

export default function GlassNotification({
  isOpen,
  type,
  title,
  message,
  onClose,
  autoCloseDuration = 3500,
}: GlassNotificationProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let timer: NodeJS.Timeout | null = null;
    if (type === 'success' && autoCloseDuration > 0) {
      timer = setTimeout(() => {
        onClose();
      }, autoCloseDuration);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, type, autoCloseDuration, onClose]);

  if (!isOpen) return null;

  const isSuccess = type === 'success';
  const defaultTitle = isSuccess ? 'File Added Successfully' : 'File Added Failed';
  const defaultMessage = isSuccess
    ? 'The file has been successfully added to the system.'
    : 'The file could not be added at this time. Please try again.';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/25 backdrop-blur-[6px] transition-opacity duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[480px] sm:max-w-[540px] rounded-[32px] p-8 sm:p-12 text-center transition-all transform duration-300 scale-100 shadow-2xl overflow-hidden
          ${
            isSuccess
              ? 'bg-white/80 dark:bg-navy-800/85 border border-emerald-100/90 dark:border-emerald-500/20 shadow-[0_25px_60px_-15px_rgba(16,185,129,0.3)]'
              : 'bg-white/80 dark:bg-navy-800/85 border border-rose-100/90 dark:border-rose-500/20 shadow-[0_25px_60px_-15px_rgba(239,68,68,0.3)]'
          }
        `}
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        {isSuccess ? (
          <div className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2 h-52 w-52 rounded-full bg-emerald-400/30 blur-3xl" />
        ) : (
          <div className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2 h-52 w-52 rounded-full bg-rose-500/25 blur-3xl" />
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close notification"
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 dark:hover:bg-navy-700 dark:hover:text-white transition-colors"
        >
          <FiX className="h-4 w-4" />
        </button>

        {/* Icon with radial glow ring */}
        <div className="relative mx-auto mb-6 flex items-center justify-center">
          {isSuccess ? (
            <div className="relative flex items-center justify-center">
              {/* Outer soft ambient aura */}
              <div className="absolute h-28 w-28 rounded-full bg-emerald-400/20 blur-md animate-pulse" />
              {/* Halo circle */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100/70 dark:bg-emerald-950/40">
                {/* Core Icon button */}
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/40">
                  <FiCheck className="h-7 w-7 text-white" strokeWidth={3} />
                </div>
              </div>
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              {/* Outer soft ambient aura */}
              <div className="absolute h-28 w-28 rounded-full bg-rose-500/25 blur-md animate-pulse" />
              {/* Halo circle */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-100/70 dark:bg-rose-950/40">
                {/* Core Icon button */}
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-rose-600 to-red-500 text-white shadow-lg shadow-rose-500/40">
                  <span className="text-2xl font-black text-white leading-none">!</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Heading */}
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2.5">
          {title || defaultTitle}
        </h3>

        {/* Description */}
        <p className="mx-auto max-w-sm text-sm sm:text-base font-medium leading-relaxed text-slate-500 dark:text-slate-300">
          {message || defaultMessage}
        </p>

        {/* Bottom Action for failure (or quick dismiss) */}
        {!isSuccess && (
          <div className="mt-7 flex justify-center">
            <button
              onClick={onClose}
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-red-500/25 hover:from-red-600 hover:to-rose-700 active:scale-95 transition-all"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

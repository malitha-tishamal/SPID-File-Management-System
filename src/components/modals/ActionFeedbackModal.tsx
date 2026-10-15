'use client';
import React, { useEffect } from 'react';
import {
  FiCheck,
  FiAlertCircle,
  FiPause,
  FiX,
  FiLock,
} from 'react-icons/fi';

export type FeedbackTone = 'success' | 'error' | 'info' | 'restricted' | 'warning';
export type FeedbackIcon = 'check' | 'alert' | 'pause' | 'x' | 'lock';

export interface FeedbackState {
  tone: FeedbackTone;
  icon?: FeedbackIcon;
  badge?: string;
  title: string;
  description: string;
}

const TONE_CONFIG: Record<
  FeedbackTone,
  { gradient: string; glow: string; badge: string; defaultIcon: FeedbackIcon }
> = {
  success: {
    gradient: 'from-emerald-400 to-teal-500',
    glow: 'bg-emerald-400',
    badge: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    defaultIcon: 'check',
  },
  error: {
    gradient: 'from-red-500 to-rose-600',
    glow: 'bg-red-500',
    badge: 'bg-red-50 text-red-600 border border-red-200/60 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    defaultIcon: 'alert',
  },
  info: {
    gradient: 'from-sky-400 to-blue-500',
    glow: 'bg-sky-400',
    badge: 'bg-sky-50 text-sky-600 border border-sky-200/60 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800',
    defaultIcon: 'pause',
  },
  restricted: {
    gradient: 'from-red-500 to-rose-600',
    glow: 'bg-red-400',
    badge: 'bg-red-50 text-red-600 border border-red-200/60 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    defaultIcon: 'lock',
  },
  warning: {
    gradient: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-600 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    defaultIcon: 'alert',
  },
};

const ICONS: Record<FeedbackIcon, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  check: FiCheck,
  alert: FiAlertCircle,
  pause: FiPause,
  x: FiX,
  lock: FiLock,
};

/**
 * Reusable action-feedback dialog (success / failure / restricted) matching Image 3.
 * Centered card over a blurred backdrop with a tone-tinted glow, icon badge,
 * optional pill badge with padlock, title and description. Auto-dismisses success tones.
 */
export default function ActionFeedbackModal({
  feedback,
  onClose,
}: {
  feedback: FeedbackState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onClose]);

  useEffect(() => {
    if (!feedback || (feedback.tone !== 'success' && feedback.tone !== 'info')) return;
    const timer = setTimeout(onClose, 5200);
    return () => clearTimeout(timer);
  }, [feedback, onClose]);

  if (!feedback) return null;

  const cfg = TONE_CONFIG[feedback.tone];
  const Icon = ICONS[feedback.icon ?? cfg.defaultIcon];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm sm:max-w-md overflow-hidden rounded-[28px] bg-white px-8 pb-9 pt-10 text-center shadow-2xl dark:bg-navy-700 border border-slate-100 dark:border-navy-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tone-tinted ambient glow */}
        <div
          className={`pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full ${cfg.glow} opacity-20 blur-3xl`}
        />
        <div
          className={`pointer-events-none absolute -bottom-14 -right-10 h-48 w-48 rounded-full ${cfg.glow} opacity-20 blur-3xl`}
        />

        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-navy-600 cursor-pointer"
          aria-label="Close"
        >
          <FiX className="h-4 w-4" />
        </button>

        {/* Central glowing icon (matching Image 3) */}
        <div
          className={`relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b ${cfg.gradient} text-white shadow-xl shadow-emerald-500/25 ring-8 ring-emerald-50 dark:ring-navy-600/60`}
        >
          <Icon className="h-8 w-8" strokeWidth={feedback.icon === 'x' ? 3 : 2.5} />
        </div>

        {/* Optional Pill Badge (e.g. 🔒 CRYPTOGRAPHICALLY SEALED) */}
        {feedback.badge && (
          <div className="mt-4 flex justify-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${cfg.badge}`}
            >
              <FiLock className="h-3 w-3" />
              {feedback.badge}
            </span>
          </div>
        )}

        <h3 className="mt-3.5 text-lg font-bold text-navy-700 dark:text-white">{feedback.title}</h3>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {feedback.description}
        </p>
      </div>
    </div>
  );
}

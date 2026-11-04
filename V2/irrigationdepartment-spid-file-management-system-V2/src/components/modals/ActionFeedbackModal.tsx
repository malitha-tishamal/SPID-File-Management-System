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
  { bg: string; gradient: string; glow: string; ring: string; badge: string; shadow: string; defaultIcon: FeedbackIcon }
> = {
  success: {
    bg: 'bg-emerald-500',
    gradient: 'from-emerald-400 to-teal-500',
    glow: 'bg-emerald-400',
    ring: 'ring-emerald-100 dark:ring-emerald-900/30',
    shadow: 'shadow-emerald-400/40',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    defaultIcon: 'check',
  },
  error: {
    bg: 'bg-red-500',
    gradient: 'from-red-500 to-rose-600',
    glow: 'bg-red-500',
    ring: 'ring-red-100 dark:ring-red-900/30',
    shadow: 'shadow-red-400/40',
    badge: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    defaultIcon: 'alert',
  },
  info: {
    bg: 'bg-blue-500',
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'bg-blue-500',
    ring: 'ring-blue-100 dark:ring-blue-900/30',
    shadow: 'shadow-blue-400/40',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    defaultIcon: 'pause',
  },
  restricted: {
    bg: 'bg-red-500',
    gradient: 'from-red-500 to-rose-600',
    glow: 'bg-red-400',
    ring: 'ring-red-100 dark:ring-red-900/30',
    shadow: 'shadow-red-400/40',
    badge: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    defaultIcon: 'lock',
  },
  warning: {
    bg: 'bg-amber-500',
    gradient: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-400',
    ring: 'ring-amber-100 dark:ring-amber-900/30',
    shadow: 'shadow-amber-400/40',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
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
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-600 cursor-pointer"
          aria-label="Close"
        >
          <FiX className="h-4 w-4" />
        </button>

        {/* Central glowing icon */}
        <div
          className={`relative mx-auto flex h-16 w-16 items-center justify-center rounded-full ${cfg.bg} bg-gradient-to-b ${cfg.gradient} text-white shadow-xl ${cfg.shadow} ring-8 ${cfg.ring}`}
        >
          <Icon className="h-8 w-8 text-white" strokeWidth={feedback.icon === 'x' ? 3 : 2.5} />
        </div>

        {/* Optional Pill Badge */}
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

        <h3 className="mt-5 text-lg font-extrabold text-slate-900 dark:text-white">{feedback.title}</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-relaxed text-slate-600 dark:text-gray-300">
          {feedback.description}
        </p>
      </div>
    </div>
  );
}

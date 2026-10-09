'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FiCheckCircle, FiAlertCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Global dispatcher fallback so non-React utility files can also dispatch toasts if needed
let globalShowToast: ((toast: Omit<ToastItem, 'id'>) => void) | null = null;

export function triggerGlobalToast(toast: Omit<ToastItem, 'id'>) {
  if (globalShowToast) {
    globalShowToast(toast);
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4500 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  React.useEffect(() => {
    globalShowToast = showToast;
    return () => {
      globalShowToast = null;
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}

      {/* Floating Toast Container */}
      <aside
        aria-live="polite"
        aria-label="Notifications"
        className="fixed top-4 right-4 left-4 sm:left-auto z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-md w-full"
      >
        {toasts.map((toast) => {
          const typeStyles = {
            success: {
              border: 'border-emerald-500/40 dark:border-emerald-500/60',
              bg: 'bg-white/95 dark:bg-[#0b1437]/95',
              badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
              icon: <FiCheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />,
            },
            error: {
              border: 'border-rose-500/40 dark:border-rose-500/60',
              bg: 'bg-white/95 dark:bg-[#0b1437]/95',
              badge: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
              icon: <FiAlertCircle className="h-5 w-5 text-rose-500 shrink-0" />,
            },
            warning: {
              border: 'border-amber-500/40 dark:border-amber-500/60',
              bg: 'bg-white/95 dark:bg-[#0b1437]/95',
              badge: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
              icon: <FiAlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
            },
            info: {
              border: 'border-sky-500/40 dark:border-sky-500/60',
              bg: 'bg-white/95 dark:bg-[#0b1437]/95',
              badge: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400',
              icon: <FiInfo className="h-5 w-5 text-sky-500 shrink-0" />,
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl p-4 shadow-xl shadow-slate-900/10 dark:shadow-navy-950/40 border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-3 fade-in ${typeStyles.border} ${typeStyles.bg}`}
            >
              <div className="mt-0.5">{typeStyles.icon}</div>
              <div className="flex-1 text-left">
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {toast.title}
                </p>
                {toast.message && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition"
                aria-label="Dismiss toast"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

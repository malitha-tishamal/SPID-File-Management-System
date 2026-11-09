'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ICON_TONES: Record<string, string> = {
  brand:
    'bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300',
  emerald:
    'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
};

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
};

export default function FileModalShell({
  title,
  subtitle,
  headerMeta,
  icon,
  iconTone = 'brand',
  onClose,
  closeDisabled = false,
  footer,
  size = 'md',
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  headerMeta?: React.ReactNode;
  icon: React.ReactNode;
  iconTone?: keyof typeof ICON_TONES;
  onClose: () => void;
  closeDisabled?: boolean;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const { t } = useTranslation('files');
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Rendered through a portal: a transformed ancestor (e.g. a table using
  // animate-fadeIn) otherwise becomes the containing block for this fixed
  // overlay, which misplaces the dialog and leaves the page scroll-locked.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const requestClose = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);

  useEffect(() => {
    if (!portalTarget) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    // Prefer the close button so keyboard users can dismiss immediately.
    (closeRef.current ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [requestClose, portalTarget]);

  if (!portalTarget) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${SIZES[size]} flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white font-dm shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-150 dark:border-navy-700 dark:bg-navy-800 sm:rounded-3xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-navy-700 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11 ${ICON_TONES[iconTone]}`}
            >
              {icon}
            </div>
            <div className="min-w-0">
              {headerMeta}
              <h2
                id={titleId}
                className="break-words text-base font-bold leading-snug text-navy-800 dark:text-white [overflow-wrap:anywhere] sm:text-lg"
                title={typeof title === 'string' ? title : undefined}
              >
                {title}
              </h2>
              {subtitle ? (
                <div className="mt-0.5 break-words text-xs font-medium leading-relaxed text-slate-400 dark:text-gray-400 [overflow-wrap:anywhere]">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            disabled={closeDisabled}
            aria-label={t('modals.closeDialog')}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-navy-700 dark:hover:text-white dark:focus-visible:ring-offset-navy-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="flex gap-3 border-t border-slate-100 px-5 py-4 dark:border-navy-700 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    portalTarget,
  );
}

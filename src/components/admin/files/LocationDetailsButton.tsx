'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiMapPin, FiX } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function LocationDetailsButton({
  file,
  className,
}: {
  file: FileRecordRow;
  className: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const locationSummary =
    [
      file.locker_no,
      file.shelf_name,
      file.shelf_position ? `Position: ${file.shelf_position}` : null,
      !file.locker_no && !file.shelf_name ? file.archive_repository : null,
    ]
      .filter(Boolean)
      .join(' / ') || 'Central Record Room';

  const locationDetails = [
    ['Record Room', file.archive_repository || 'Central Record Room'],
    ['Locker', file.locker_no || '—'],
    ['Shelf', file.shelf_name || '—'],
    ['File Position', file.shelf_position || '—'],
  ];

  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
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
      triggerRef.current?.focus?.();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${className} cursor-pointer text-left hover:border-[#4318FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] transition-colors`}
        title={`Storage location: ${locationSummary}`}
        aria-haspopup="dialog"
        aria-label={`View detailed storage location for ${file.file_no}: ${locationSummary}`}
      >
        <FiMapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4318FF] dark:text-brand-300" />
        <span className="line-clamp-2 min-w-0 whitespace-normal break-words">
          {locationSummary}
        </span>
      </button>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_-16px_rgba(15,23,42,0.4)] outline-none ring-1 ring-slate-900/5 dark:bg-navy-800 dark:ring-white/10 sm:rounded-3xl"
              >
                <div className="flex items-start gap-3.5 px-5 pb-4 pt-5 sm:px-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] ring-1 ring-[#4318FF]/10 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-300/20">
                    <FiMapPin className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2
                      id={titleId}
                      className="text-lg font-bold leading-tight tracking-tight text-[#1B2559] dark:text-white"
                    >
                      Storage location
                    </h2>
                    <p
                      className="mt-1 truncate text-xs font-bold tabular-nums text-[#4318FF] dark:text-brand-300"
                      title={file.file_no}
                    >
                      {file.file_no}
                    </p>
                    <p
                      className="mt-0.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400"
                      title={file.file_name}
                    >
                      {file.file_name}
                    </p>
                  </div>

                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close dialog"
                    className="-mr-1.5 -mt-1.5 shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 dark:hover:bg-navy-700 dark:hover:text-white dark:focus-visible:ring-offset-navy-800"
                  >
                    <FiX className="h-5 w-5" />
                  </button>
                </div>

                <div className="border-t border-slate-100 dark:border-navy-700" />

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                  <dl className="space-y-2">
                    {locationDetails.map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-100 dark:bg-navy-900/60 dark:ring-navy-700"
                      >
                        <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {label}
                        </dt>
                        <dd
                          className="min-w-0 truncate text-right text-[13px] font-bold text-[#1B2559] dark:text-white"
                          title={value}
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

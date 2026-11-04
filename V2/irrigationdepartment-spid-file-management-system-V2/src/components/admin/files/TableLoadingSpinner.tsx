'use client';

import React from 'react';

/**
 * Centered circular loading indicator for table content areas.
 * The spinner graphic is decorative; the visible label inside the
 * role="status" region is announced by screen readers on mount.
 */
export default function TableLoadingSpinner({
  label,
  compact = false,
  announce = true,
}: {
  label: string;
  compact?: boolean;
  /**
   * When false, the spinner is purely visual (aria-hidden). Use for refresh
   * overlays where a sibling live region (e.g. TableLoadingProgressBar)
   * already announces the refresh.
   */
  announce?: boolean;
}) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-hidden={announce ? undefined : true}
      className={`flex flex-col items-center justify-center gap-3 text-center ${
        compact ? 'py-6' : 'py-20'
      }`}
    >
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#4318FF]/15 border-t-[#4318FF] motion-reduce:animate-pulse dark:border-brand-300/15 dark:border-t-brand-300"
      />
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

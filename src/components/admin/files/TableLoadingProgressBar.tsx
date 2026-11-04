'use client';

import React from 'react';

/**
 * Indeterminate loading bar for table fetches.
 *
 * The bar never reports a percentage (the client cannot know server
 * progress). The track always occupies one line so appearing/disappearing
 * never shifts the table below it.
 */
export default function TableLoadingProgressBar({
  active,
  label = 'Loading file records',
}: {
  active: boolean;
  label?: string;
}) {
  return (
    <div className="mb-2">
      <div
        role="progressbar"
        aria-busy={active}
        aria-label={label}
        aria-hidden={!active}
        className={`relative h-1 w-full overflow-hidden rounded-full bg-slate-100 transition-opacity duration-150 dark:bg-navy-700 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {active && (
          <span className="loading-bar-indeterminate absolute inset-y-0 left-0 rounded-full bg-[#4318FF] shadow-[0_0_8px_rgba(67,24,255,0.35)] dark:bg-brand-300" />
        )}
      </div>
      {active && (
        <span className="sr-only" role="status" aria-live="polite">
          {label}
        </span>
      )}
    </div>
  );
}

'use client';

import React from 'react';

const ROWS = 8;

export default function FilesTableSkeleton() {
  return (
    <div
      className="w-full overflow-hidden rounded-2xl bg-white shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700"
      aria-hidden="true"
    >
      <div className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/60 dark:bg-navy-900/40 px-3 py-2.5">
        <div className="h-3 w-48 animate-pulse rounded bg-slate-200 dark:bg-navy-600" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-navy-700">
        {Array.from({ length: ROWS }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="h-3 w-6 animate-pulse rounded bg-slate-200 dark:bg-navy-600" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-navy-600" />
            <div className="h-3 flex-1 animate-pulse rounded bg-slate-100 dark:bg-navy-700" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-navy-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

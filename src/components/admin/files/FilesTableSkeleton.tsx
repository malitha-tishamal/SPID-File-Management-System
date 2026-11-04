'use client';

import React from 'react';

const ROWS = 8;

/**
 * Skeleton placeholder that mirrors the real table column structure.
 * Columns: NO | FILE NUMBER | FILE NAME | SECTION | LOCATION | OFFICER | ROLE | DATE | STATUS | ACTIONS
 *
 * The `columns` prop lets each table trim the skeleton to its own column count.
 */
const COL_CONFIGS = [
  { width: 'w-6',    type: 'text',   shade: 'strong' }, // NO
  { width: 'w-20',   type: 'text',   shade: 'strong' }, // FILE NUMBER
  { width: 'flex-1', type: 'text',   shade: 'medium' }, // FILE NAME
  { width: 'w-20',   type: 'badge',  shade: 'medium' }, // SECTION
  { width: 'w-24',   type: 'pill',   shade: 'medium' }, // LOCATION
  { width: 'w-20',   type: 'text',   shade: 'medium' }, // OFFICER
  { width: 'w-10',   type: 'badge',  shade: 'medium' }, // ROLE
  { width: 'w-16',   type: 'text',   shade: 'medium' }, // DATE
  { width: 'w-20',   type: 'badge',  shade: 'medium' }, // STATUS
  { width: 'w-24',   type: 'action', shade: 'medium' }, // ACTIONS
] as const;

export default function FilesTableSkeleton({ columns = 10 }: { columns?: number }) {
  const cols = COL_CONFIGS.slice(0, Math.min(columns, COL_CONFIGS.length));

  return (
    <div
      role="status"
      aria-label="Loading file records"
      aria-busy={true}
      className="w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xs dark:border-navy-700 dark:bg-navy-800"
    >
      {/* ── Header row skeleton ── */}
      <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-navy-700 dark:bg-navy-900/40">
        <div className="flex items-center gap-3">
          {cols.map(({ width }, i) => (
            <div
              key={i}
              className={`h-2.5 animate-pulse rounded bg-slate-200 dark:bg-navy-600 ${width}`}
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      </div>

      {/* ── Body rows skeleton ── */}
      <div className="divide-y divide-slate-300 dark:divide-navy-600">
        {Array.from({ length: ROWS }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-3 px-3 py-3">
            {cols.map(({ width, type, shade }, colIdx) => {
              const isBadge = type === 'badge';
              const isPill  = type === 'pill';
              const isAction = type === 'action';
              const baseColor =
                shade === 'strong'
                  ? 'bg-slate-200 dark:bg-navy-600'
                  : 'bg-slate-100 dark:bg-navy-700';
              const shape = isBadge || isPill ? 'rounded-full' : isAction ? 'rounded-lg' : 'rounded';
              const height = isBadge ? 'h-5' : isAction ? 'h-6' : 'h-3';
              return (
                <div
                  key={colIdx}
                  className={`animate-pulse ${height} ${shape} ${baseColor} ${width}`}
                  style={{ animationDelay: `${(rowIdx * cols.length + colIdx) * 25}ms` }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Pagination row skeleton ── */}
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 dark:border-navy-700">
        <div className="h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-navy-700" />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-7 animate-pulse rounded-lg bg-slate-100 dark:bg-navy-700"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading file records, please wait…</span>
    </div>
  );
}

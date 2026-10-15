'use client';
import React from 'react';

export type StatTone = 'purple' | 'green' | 'blue' | 'red' | 'amber' | 'gray';

const TONE_PILL: Record<StatTone, string> = {
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  blue: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  gray: 'bg-gray-100 text-gray-500 dark:bg-navy-600 dark:text-gray-400',
};

const TONE_ICON: Record<StatTone, string> = {
  purple: 'from-[#4318FF] to-brand-500',
  green: 'from-emerald-400 to-teal-500',
  blue: 'from-sky-400 to-blue-500',
  red: 'from-red-500 to-rose-600',
  amber: 'from-amber-400 to-orange-500',
  gray: 'from-gray-400 to-gray-600',
};

/** Shared KPI card for the directory pages. */
export default function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  pill,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: StatTone;
  label: string;
  value: string | number;
  pill?: string;
  sub?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-gradient-to-b ${TONE_ICON[tone]} opacity-10`}
      />
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b ${TONE_ICON[tone]} text-white shadow-md`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <p className="text-xl font-black text-navy-700 dark:text-white">{value}</p>
          {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>}
        </div>
        {pill && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_PILL[tone]}`}
          >
            {pill}
          </span>
        )}
      </div>
    </div>
  );
}

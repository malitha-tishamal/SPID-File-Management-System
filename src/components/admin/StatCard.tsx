'use client';
import React from 'react';

export type StatTone = 'purple' | 'green' | 'blue' | 'red' | 'amber' | 'gray';

const TONE_PILL: Record<StatTone, string> = {
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 font-extrabold',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-extrabold',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-extrabold',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-extrabold',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-extrabold',
  gray: 'bg-gray-200 text-gray-800 dark:bg-navy-600 dark:text-gray-300 font-extrabold',
};

const TONE_ICON: Record<StatTone, string> = {
  purple: 'bg-[#4318FF] from-[#4318FF] to-brand-500',
  green: 'bg-emerald-500 from-emerald-500 to-teal-600',
  blue: 'bg-blue-600 from-blue-600 to-indigo-600',
  red: 'bg-red-500 from-red-500 to-rose-600',
  amber: 'bg-amber-500 from-amber-500 to-orange-500',
  gray: 'bg-gray-500 from-gray-500 to-gray-700',
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
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none border border-slate-100 dark:border-navy-600">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-gradient-to-b ${TONE_ICON[tone]} opacity-10`}
      />
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b ${TONE_ICON[tone]} text-white shadow-md`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wider text-slate-800 dark:text-gray-300">
            {label}
          </p>
          <p className="text-2xl font-black text-black dark:text-white leading-tight">{value}</p>
          {sub && <p className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {pill && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${TONE_PILL[tone]}`}
          >
            {pill}
          </span>
        )}
      </div>
    </div>
  );
}

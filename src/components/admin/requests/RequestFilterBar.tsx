'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiFlag, FiGrid, FiSearch, FiX } from 'react-icons/fi';
import type { StaffRequestPriorityFilter } from 'lib/staffRequests';

/** Same field chrome the staff request toolbar uses, so both queues match. */
const fieldLabel =
  'mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400';
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#4318FF] focus:ring-4 focus:ring-[#4318FF]/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white';

interface RequestFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  priority: StaffRequestPriorityFilter;
  onPriorityChange: (value: StaffRequestPriorityFilter) => void;
  grouped: boolean;
  onGroupedChange: (value: boolean) => void;
  /** True when a search term or a priority is narrowing the list. */
  isFiltered: boolean;
  onClearFilters: () => void;
  resultCount: number;
  totalCount: number;
}

/**
 * Search, priority and the same-file grouping switch for the admin queue.
 *
 * Pure presentation: every value arrives from the page, which also mirrors them
 * into the URL. The row shading, badges and approve eligibility stay where they
 * are — this bar only decides which rows are visible and in what order.
 */
export default function RequestFilterBar({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  grouped,
  onGroupedChange,
  isFiltered,
  onClearFilters,
  resultCount,
  totalCount,
}: RequestFilterBarProps) {
  const { t } = useTranslation('staffRequests');
  const showCount = isFiltered || grouped;

  return (
    <div
      role="search"
      aria-label={t('filters.ariaLabel')}
      className="mb-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-navy-700 dark:bg-navy-800"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] lg:grid-cols-[minmax(0,1.7fr)_160px_auto_auto] lg:items-end">
        <div className="min-w-0">
          <label htmlFor="admin-requests-search" className={fieldLabel}>
            {t('filters.search')}
          </label>
          <div className="relative">
            <FiSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              id="admin-requests-search"
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              autoComplete="off"
              aria-describedby="admin-requests-count"
              className={`${inputClass} pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`}
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t('filters.clearSearch')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="admin-requests-priority" className={fieldLabel}>
            {t('filters.priority')}
          </label>
          <div className="relative">
            <FiFlag
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <select
              id="admin-requests-priority"
              value={priority}
              onChange={(event) =>
                onPriorityChange(event.target.value as StaffRequestPriorityFilter)
              }
              className={`${inputClass} appearance-none pl-9 pr-8`}
            >
              <option value="ALL">{t('filters.priorityAll')}</option>
              <option value="HIGH">{t('filters.priorityHigh')}</option>
              <option value="NORMAL">{t('filters.priorityNormal')}</option>
              <option value="LOW">{t('filters.priorityLow')}</option>
            </select>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-400"
            >
              ▾
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-pressed={grouped}
          onClick={() => onGroupedChange(!grouped)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 cursor-pointer ${
            grouped
              ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/20'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-navy-700'
          }`}
          title={t('filters.groupSameFileTitle')}
        >
          <FiGrid className="h-3.5 w-3.5" aria-hidden="true" />
          {t('filters.groupSameFile')}
        </button>

        <button
          type="button"
          onClick={onClearFilters}
          disabled={!isFiltered && !grouped}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 disabled:cursor-not-allowed disabled:opacity-40 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <FiX className="h-3.5 w-3.5" />
          {t('filters.clearFilters')}
        </button>
      </div>

      {showCount && (
        <p
          id="admin-requests-count"
          role="status"
          className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
        >
          {t('filters.showing', { shown: resultCount, total: totalCount })}
        </p>
      )}
    </div>
  );
}

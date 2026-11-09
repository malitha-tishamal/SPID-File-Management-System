'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiCalendar, FiFlag, FiSearch, FiX } from 'react-icons/fi';
import type { StaffRequestPriorityFilter } from 'lib/staffRequests';

const fieldLabel =
  'mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400';
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#4318FF] focus:ring-4 focus:ring-[#4318FF]/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white';

interface RequestsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  priority: StaffRequestPriorityFilter;
  onPriorityChange: (value: StaffRequestPriorityFilter) => void;
  dateError: string;
  isFiltered: boolean;
  onClearFilters: () => void;
}

export default function RequestsToolbar({
  search,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  priority,
  onPriorityChange,
  dateError,
  isFiltered,
  onClearFilters,
}: RequestsToolbarProps) {
  const { t } = useTranslation('requests');
  return (
    <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-xs dark:border-navy-700 dark:bg-navy-800">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_150px_150px_minmax(150px,0.8fr)_auto] lg:items-end">
        <div>
          <label htmlFor="staff-requests-search" className={fieldLabel}>
            {t('common:buttons.search')}
          </label>
          <div className="relative">
            <FiSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              id="staff-requests-search"
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('toolbar.searchPlaceholder')}
              autoComplete="off"
              className={`${inputClass} pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`}
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t('toolbar.clearSearch')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="staff-requests-date-from" className={fieldLabel}>
            {t('toolbar.startDate')}
          </label>
          <div className="relative">
            <FiCalendar
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              id="staff-requests-date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => onDateFromChange(event.target.value)}
              aria-invalid={Boolean(dateError)}
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="staff-requests-date-to" className={fieldLabel}>
            {t('toolbar.endDate')}
          </label>
          <div className="relative">
            <FiCalendar
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              id="staff-requests-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => onDateToChange(event.target.value)}
              aria-invalid={Boolean(dateError)}
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="staff-requests-priority" className={fieldLabel}>
            {t('common:labels.priority')}
          </label>
          <div className="relative">
            <FiFlag
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <select
              id="staff-requests-priority"
              value={priority}
              onChange={(event) =>
                onPriorityChange(event.target.value as StaffRequestPriorityFilter)
              }
              className={`${inputClass} appearance-none pl-9 pr-8`}
            >
              <option value="ALL">{t('common:priority.all')}</option>
              <option value="HIGH">{t('common:priority.HIGH')}</option>
              <option value="NORMAL">{t('common:priority.NORMAL')}</option>
              <option value="LOW">{t('common:priority.LOW')}</option>
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
          onClick={onClearFilters}
          disabled={!isFiltered}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 disabled:cursor-not-allowed disabled:opacity-40 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-navy-700"
        >
          <FiX className="h-3.5 w-3.5" />
          {t('common:buttons.clearFilters')}
        </button>
      </div>

      {dateError && (
        <p role="alert" className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">
          {t('common:validation.dateRangeInvalid')}
        </p>
      )}
    </div>
  );
}

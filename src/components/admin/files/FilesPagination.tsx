'use client';

import React, { useMemo } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

type PageItem = number | 'gap-left' | 'gap-right';

function buildPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) {
      items.push(page === total ? 'gap-right' : previous === 1 ? 'gap-left' : 'gap-left');
    }
    items.push(page);
    previous = page;
  }
  return items;
}

export default function FilesPagination({
  total,
  page,
  limit,
  totalPages,
  onPageChange,
  itemLabel = 'file',
  isFiltered = false,
  disabled = false,
}: {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  itemLabel?: string;
  isFiltered?: boolean;
  disabled?: boolean;
}) {
  const pageItems = useMemo(
    () => buildPageItems(Math.min(Math.max(page, 1), Math.max(totalPages, 1)), Math.max(totalPages, 1)),
    [page, totalPages],
  );

  const startRecord = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);
  const plural = total === 1 ? '' : 's';

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500 dark:border-navy-700 dark:text-slate-400 sm:flex-row">
      <div aria-live="polite">
        {total === 0
          ? `No ${itemLabel}s`
          : `Showing ${startRecord}\u2013${endRecord} of ${total} ${itemLabel}${plural}${isFiltered ? ' (filtered)' : ''}`}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            aria-label="Previous page"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300"
          >
            <FiChevronLeft className="h-3.5 w-3.5" />
          </button>

          {pageItems.map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-current={page === item ? 'page' : undefined}
                className={`flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-lg px-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/50 disabled:cursor-not-allowed disabled:opacity-60 ${
                  page === item
                    ? 'bg-[#4318FF] text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300'
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="px-1 text-xs text-slate-400" aria-hidden="true">
                &hellip;
              </span>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
            aria-label="Next page"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300"
          >
            <FiChevronRight className="h-3.5 w-3.5" />
          </button>
        </nav>
      )}
    </div>
  );
}

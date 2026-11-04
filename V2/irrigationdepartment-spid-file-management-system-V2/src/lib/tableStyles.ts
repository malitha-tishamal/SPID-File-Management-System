/**
 * Shared table chrome for every Admin and Staff data table.
 * Keeping the tokens here means a table reads as part of one system:
 * the same header weight, dividers, hover response and row tint everywhere.
 */

export const TABLE_HEAD_CLASS =
  'text-[9px] font-black uppercase leading-tight tracking-wide text-slate-400 bg-slate-50/70 dark:bg-navy-900/40';

export const TABLE_HEAD_ROW_CLASS = `${TABLE_HEAD_CLASS} border-b border-slate-300 dark:border-navy-600`;

/**
 * Row dividers. slate-100/navy-700 were near-invisible against the white and
 * navy-800 card backgrounds, so rows blurred together; these tones read as a
 * deliberate line in both themes.
 */
export const TABLE_BODY_CLASS =
  'divide-y divide-slate-300 text-xs dark:divide-navy-600';

/** Neutral row hover; tinted rows (overdue, competing, highlighted) layer on top of it. */
export const TABLE_ROW_CLASS =
  'transition-colors hover:bg-slate-50/70 dark:hover:bg-navy-700/40';

/** Row a notification deep link pointed at. The ring keeps it visible under hover. */
export const TABLE_HIGHLIGHT_CLASS =
  'bg-[#4318FF]/[0.07] ring-1 ring-inset ring-[#4318FF]/25 dark:bg-brand-900/30';

export function tableRowClass(...extra: (string | false | null | undefined)[]): string {
  return [TABLE_ROW_CLASS, ...extra.filter(Boolean)].join(' ');
}

/** Pagination footer that closes a table card. */
export const TABLE_PAGER_CLASS =
  'flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 px-3 py-2.5 text-xs text-slate-500 dark:border-navy-600 dark:text-slate-400';

/** 32px hit area so page controls stay clickable at 1366x768. */
export const TABLE_PAGER_BTN_CLASS =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300';

export const TABLE_PAGER_PAGE_CLASS =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-colors';

export const TABLE_PAGER_PAGE_ACTIVE_CLASS = 'bg-[#4318FF] text-white shadow-xs';

/** Centered message row used when a table has nothing to show. */
export const TABLE_EMPTY_CELL_CLASS =
  'px-4 py-12 text-center text-xs font-semibold text-slate-500 dark:text-slate-400';

/**
 * Row action group. Wrapping is what keeps the buttons inside the cell: a
 * fixed-layout table clips a row of buttons that is wider than its column,
 * which is exactly how Action buttons ended up off-screen at 1366x768.
 */
export const TABLE_ACTIONS_CLASS =
  'flex flex-wrap items-center justify-end gap-1';


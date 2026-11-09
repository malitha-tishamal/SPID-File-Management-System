/**
 * Deep links from notifications (e.g. `/staff/your-requests?request=12`).
 *
 * These pages are client components that are statically prerendered, so they
 * read the address from the DOM instead of `useSearchParams`, which would
 * require a Suspense boundary in every route just to open one record.
 */

export function readQueryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

/** Drops a consumed parameter so a refresh does not reopen the same dialog. */
export function clearQueryParam(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // Leaving the address untouched is harmless; the record still opened.
  }
}

/** Positive integer id, or null for anything unusable. */
export function parseRecordId(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Writes (or removes) one query parameter without touching the others, so a
 * screen can keep its filters in the address bar and a shared link still opens
 * with them applied. A null/empty value drops the parameter, which keeps
 * default states out of the URL.
 */
export function setQueryParam(name: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(name);
    const next = value === null || value === '' ? null : value;
    if (current === next) return;
    if (next === null) url.searchParams.delete(name);
    else url.searchParams.set(name, next);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // An unreadable address should never break the screen itself.
  }
}

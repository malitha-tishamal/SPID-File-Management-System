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

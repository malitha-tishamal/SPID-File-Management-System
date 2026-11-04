/**
 * Client-side deduplicated request utility for /api/sections.
 * Prevents multiple sibling components from firing duplicate concurrent HTTP
 * requests on page mount.
 *
 * Results are intentionally NOT cached between mounts: a section can be
 * disabled or re-enabled at any time, and every dropdown must reflect that
 * without a manual page reload.
 */

interface SectionItem {
  id: number;
  name: string;
  code?: string;
  status?: string;
  [x: string]: any;
}

export interface FetchSectionOptions {
  /** Only Active sections — use for dropdowns that create/reassign files. */
  activeOnly?: boolean;
  /** Keep this section in an activeOnly result even if it is disabled. */
  include?: string;
}

const inFlight = new Map<string, Promise<SectionItem[]>>();
const cache = new Map<string, { data: SectionItem[]; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

function buildSectionsUrl({ activeOnly, include }: FetchSectionOptions): string {
  const params = new URLSearchParams();
  if (activeOnly) params.set('activeOnly', 'true');
  if (include?.trim()) params.set('include', include.trim());
  const query = params.toString();
  return query ? `/api/sections?${query}` : '/api/sections';
}

async function requestSections(url: string): Promise<SectionItem[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.data?.sections)) {
        return json.data.sections as SectionItem[];
      }
    }
  } catch (e) {
    console.warn('[sectionsClient] Failed to load sections:', e);
  }
  return [];
}

export async function fetchClientSections(
  forceRefresh = false,
  options: FetchSectionOptions = {},
): Promise<SectionItem[]> {
  const url = buildSectionsUrl(options);

  if (!forceRefresh) {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    const pending = inFlight.get(url);
    if (pending) return pending;
  }

  const request = requestSections(url).then((items) => {
    if (Array.isArray(items) && items.length > 0) {
      cache.set(url, { data: items, timestamp: Date.now() });
    }
    return items;
  });

  inFlight.set(url, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(url) === request) inFlight.delete(url);
  }
}

export function invalidateClientSectionsCache() {
  cache.clear();
  inFlight.clear();
}

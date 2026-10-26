/**
 * Client-side deduplicated request utility for /api/sections.
 * Prevents multiple sibling components from firing duplicate concurrent HTTP requests
 * on page mount.
 */

interface SectionItem {
  id: number;
  name: string;
  code?: string;
  status?: string;
  [x: string]: any;
}

let sectionsPromise: Promise<SectionItem[]> | null = null;
let cachedSections: SectionItem[] | null = null;
let cacheTimestamp = 0;
const CLIENT_CACHE_TTL_MS = 60_000; // 1 minute in-memory cache

export async function fetchClientSections(forceRefresh = false): Promise<SectionItem[]> {
  const now = Date.now();

  if (!forceRefresh && cachedSections && now - cacheTimestamp < CLIENT_CACHE_TTL_MS) {
    return cachedSections;
  }

  if (!forceRefresh && sectionsPromise) {
    return sectionsPromise;
  }

  sectionsPromise = (async () => {
    try {
      const res = await fetch('/api/sections', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.ok && Array.isArray(json.data?.sections)) {
          cachedSections = json.data.sections;
          cacheTimestamp = Date.now();
          return cachedSections;
        }
      }
    } catch (e) {
      console.warn('[sectionsClient] Failed to load sections:', e);
    } finally {
      sectionsPromise = null;
    }
    return cachedSections || [];
  })();

  return sectionsPromise;
}

export function invalidateClientSectionsCache() {
  cachedSections = null;
  cacheTimestamp = 0;
  sectionsPromise = null;
}

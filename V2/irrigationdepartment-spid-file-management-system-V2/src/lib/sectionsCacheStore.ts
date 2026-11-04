/**
 * Shared in-memory cache store for the public /api/sections endpoint.
 * Extracted from the route file so it can be imported by server-side
 * controllers without violating Next.js route-file export constraints.
 */

import type { SectionRow } from 'models/SectionRepository';

let cachedSections: SectionRow[] | null = null;
let lastCacheTime = 0;
export const SECTIONS_CACHE_TTL_MS = 30_000; // 30 seconds

export function getSectionsCache(): { sections: SectionRow[] | null; lastCacheTime: number } {
  return { sections: cachedSections, lastCacheTime };
}

export function setSectionsCache(sections: SectionRow[]) {
  cachedSections = sections;
  lastCacheTime = Date.now();
}

export function invalidatePublicSectionsCache() {
  cachedSections = null;
  lastCacheTime = 0;
}

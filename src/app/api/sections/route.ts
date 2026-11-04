import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from 'config/supabase/server';
import { SectionRepository } from 'models/SectionRepository';
import type { SectionRow } from 'models/SectionRepository';
import { jsonOk, withErrorHandling } from 'lib/apiResponse';
import {
  getSectionsCache,
  setSectionsCache,
  SECTIONS_CACHE_TTL_MS,
} from 'lib/sectionsCacheStore';

export const dynamic = 'force-dynamic';

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

/**
 * GET /api/sections — reference list for selection dropdowns and filters.
 *
 * Default: every section (active + disabled) so management screens and search
 * filters can still reference existing records.
 * `?activeOnly=true`: only Active sections, for dropdowns that create or
 * reassign files.
 * `?include=<name>`: adds a single named section back to an `activeOnly`
 * result, so an edit form can keep showing its current (possibly disabled)
 * section as the selected value.
 */
export const GET = withErrorHandling(async (req) => {
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get('activeOnly') === 'true';
  const includeName = (url.searchParams.get('include') ?? '').trim();

  try {
    const supabase = await getSupabaseServerClient();
    const repo = new SectionRepository(supabase);

    let sections: SectionRow[];
    if (activeOnly) {
      // Bypass the shared cache: a section that was just disabled must not be
      // offered, and the cache is only keyed to the unfiltered list.
      sections = await repo.listActive();
      if (includeName) {
        const alreadyListed = sections.some(
          (s) => s.name.toLowerCase() === includeName.toLowerCase(),
        );
        if (!alreadyListed) {
          const current = await repo.findByName(includeName);
          if (current) sections = [...sections, current];
        }
      }
    } else {
      const now = Date.now();
      const { sections: cachedSections, lastCacheTime } = getSectionsCache();
      if (cachedSections && now - lastCacheTime < SECTIONS_CACHE_TTL_MS) {
        return withNoStore(jsonOk({ sections: cachedSections }));
      }
      sections = await repo.list();
      if (sections.length > 0) setSectionsCache(sections);
    }

    return withNoStore(jsonOk({ sections }));
  } catch (error) {
    console.error('Error in /api/sections:', error);
    const { sections: staleCache } = getSectionsCache();
    return withNoStore(jsonOk({ sections: !activeOnly && staleCache ? staleCache : [] }));
  }
});

import { getSupabaseServerClient } from 'config/supabase/server';
import { SectionRepository } from 'models/SectionRepository';
import { jsonOk, withErrorHandling } from 'lib/apiResponse';
import {
  getSectionsCache,
  setSectionsCache,
  SECTIONS_CACHE_TTL_MS,
} from 'lib/sectionsCacheStore';

export const dynamic = 'force-dynamic';

/** GET /api/sections — public reference list for registration and selection dropdowns. */
export const GET = withErrorHandling(async () => {
  const now = Date.now();
  const { sections: cachedSections, lastCacheTime } = getSectionsCache();
  if (cachedSections && now - lastCacheTime < SECTIONS_CACHE_TTL_MS) {
    const res = jsonOk({ sections: cachedSections });
    res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res;
  }

  try {
    const supabase = await getSupabaseServerClient();
    const sections = await new SectionRepository(supabase).list();

    if (!sections || sections.length === 0) {
      return jsonOk({ sections: [] });
    }

    setSectionsCache(sections);
    const res = jsonOk({ sections });
    res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res;
  } catch (error) {
    console.error('Error in /api/sections:', error);
    const { sections: staleCache } = getSectionsCache();
    if (staleCache) {
      return jsonOk({ sections: staleCache });
    }
    return jsonOk({ sections: [] });
  }
});

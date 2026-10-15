import { getSupabaseServerClient } from 'config/supabase/server';
import { SectionRepository, SectionRow } from 'models/SectionRepository';
import { jsonOk, withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

let cachedSections: SectionRow[] | null = null;
let lastCacheTime = 0;

/** GET /api/sections — public reference list for the registration form. */
export const GET = withErrorHandling(async () => {
  try {
    const supabase = await getSupabaseServerClient();
    const sections = await new SectionRepository(supabase).list();

    if (!sections || sections.length === 0) {
      // Return empty array instead of error
      return jsonOk({ sections: [] });
    }

    cachedSections = sections;
    lastCacheTime = Date.now();
    return jsonOk({ sections });
  } catch (error) {
    console.error('Error in /api/sections:', error);
    // Return empty array on error to avoid breaking the UI
    return jsonOk({ sections: [] });
  }
});

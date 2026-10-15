import { getSupabaseServerClient } from 'config/supabase/server';
import { SectionRepository, SectionRow } from 'models/SectionRepository';
import { jsonOk, withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

let cachedSections: SectionRow[] | null = null;
let lastCacheTime = 0;

/** GET /api/sections — public reference list for the registration form. */
export const GET = withErrorHandling(async () => {
  if (cachedSections && Date.now() - lastCacheTime < 60000) {
    return jsonOk({ sections: cachedSections });
  }
  const supabase = await getSupabaseServerClient();
  const sections = await new SectionRepository(supabase).list();
  cachedSections = sections;
  lastCacheTime = Date.now();
  return jsonOk({ sections });
});

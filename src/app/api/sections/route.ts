import { getSupabaseServerClient } from 'config/supabase/server';
import { SectionRepository } from 'models/SectionRepository';
import { jsonOk, withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

/** GET /api/sections — public reference list for the registration form. */
export const GET = withErrorHandling(async () => {
  const supabase = await getSupabaseServerClient();
  const sections = await new SectionRepository(supabase).list();
  return jsonOk({ sections });
});

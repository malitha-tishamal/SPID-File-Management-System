import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, missingEnvMessage, validatePublicEnv } from 'config/env';

let browserClient: SupabaseClient | null = null;

/**
 * Browser (anon) Supabase client — singleton.
 * Uses only the publishable/anon key; never the service-role key.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { valid, missing } = validatePublicEnv();
    if (!valid) {
      throw new Error(missingEnvMessage(missing));
    }
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}

import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  missingEnvMessage,
  validatePublicEnv,
  validateServerEnv,
} from 'config/env';

/**
 * Cookie-bound Supabase client for Route Handlers and Server Components.
 * Carries the signed-in user's session (anon key + auth cookies).
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const { valid, missing } = validatePublicEnv();
  if (!valid) {
    throw new Error(missingEnvMessage(missing));
  }
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — cookies are read-only there.
          // Session refresh is handled by middleware.
        }
      },
    },
  });
}

/**
 * Privileged service-role client — SERVER-SIDE ONLY.
 * Bypasses RLS; used strictly for trusted admin operations
 * (approval workflow, session revocation, lockout bookkeeping).
 * Never import this from client components.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const { valid, missing } = validateServerEnv();
  if (!valid) {
    throw new Error(missingEnvMessage(missing));
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

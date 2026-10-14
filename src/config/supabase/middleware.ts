import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from 'config/env';

/**
 * Refreshes the Supabase session inside middleware and returns the
 * (possibly refreshed) response plus the authenticated user, if any.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
  getProfile: () => Promise<Record<string, any> | null>;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const getProfile = async () => {
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, section_id, account_status, sections(name)')
      .eq('id', user.id)
      .single();
    return data ?? null;
  };

  return { response, user: user ? { id: user.id, email: user.email } : null, getProfile };
}

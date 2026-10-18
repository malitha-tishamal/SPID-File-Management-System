import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from 'config/env';

export interface SessionMeta {
  id: string;
  role: string;
  status: string;
  t: number;
}

const META_COOKIE = 'spid_session_auth';
const META_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Refreshes the Supabase session inside middleware and returns the
 * (possibly refreshed) response plus the authenticated user, if any.
 * Caches profile metadata in an httpOnly cookie to prevent blocking
 * database roundtrips on every client-side page transition.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
  getProfile: () => Promise<Record<string, any> | null>;
  cachedMeta: SessionMeta | null;
}> {
  let response = NextResponse.next({ request });

  // Read fast session meta cookie if present
  let cachedMeta: SessionMeta | null = null;
  const rawMeta = request.cookies.get(META_COOKIE)?.value;
  if (rawMeta) {
    try {
      const parsed: SessionMeta = JSON.parse(rawMeta);
      if (parsed?.id && parsed?.role && parsed?.status && Date.now() - (parsed.t || 0) < META_TTL_MS) {
        cachedMeta = parsed;
      }
    } catch {}
  }

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

    // Fast path: cached metadata matches current user
    if (cachedMeta && cachedMeta.id === user.id) {
      return {
        id: cachedMeta.id,
        role: cachedMeta.role,
        account_status: cachedMeta.status,
      };
    }

    // Fallback: query database once and set cookie
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, section_id, account_status, sections(name)')
      .eq('id', user.id)
      .single();

    if (data?.id) {
      const newMeta: SessionMeta = {
        id: data.id,
        role: data.role,
        status: data.account_status,
        t: Date.now(),
      };
      response.cookies.set(META_COOKIE, JSON.stringify(newMeta), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 300,
      });
    }

    return data ?? null;
  };

  return { response, user: user ? { id: user.id, email: user.email } : null, getProfile, cachedMeta };
}


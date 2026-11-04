import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from 'config/env';
import {
  INACTIVITY_TIMEOUT_MS,
  REMEMBER_LIFETIME_SECONDS,
  SESSION_META_COOKIE,
  parseSessionMeta,
  sessionCookieOptions,
  type SessionMeta,
} from 'lib/sessionPolicy';

export type { SessionMeta } from 'lib/sessionPolicy';

const META_COOKIE = SESSION_META_COOKIE;
const SUPABASE_AUTH_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

/**
 * Refreshes the Supabase session inside middleware and returns the
 * (possibly refreshed) response plus the authenticated user, if any.
 *
 * The httpOnly session-metadata cookie carries the activity anchor (`t`).
 * A session whose anchor is 2 hours old is expired — even if Supabase still
 * considers the refresh token valid — so JS timer throttling or a restored
 * cookie jar can never bypass the inactivity policy.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string; email?: string } | null;
  getProfile: () => Promise<Record<string, any> | null>;
  cachedMeta: SessionMeta | null;
  expired: boolean;
}> {
  let response = NextResponse.next({ request });

  const isRecoveryPage = request.nextUrl.pathname.startsWith('/auth/reset-password');
  const meta = parseSessionMeta(request.cookies.get(META_COOKIE)?.value);

  const clearAppSession = () => {
    response.cookies.delete(META_COOKIE);
    request.cookies.getAll().forEach((c) => {
      if (c.name.startsWith('sb-') && c.name.includes('-auth-token')) {
        response.cookies.set(c.name, '', { path: '/', maxAge: 0 });
      }
    });
  };

  if (!isRecoveryPage) {
    // Absolute inactivity enforcement — runs before any Supabase call.
    if (meta && Date.now() - meta.t >= INACTIVITY_TIMEOUT_MS) {
      clearAppSession();
      return {
        response,
        user: null,
        getProfile: async () => null,
        cachedMeta: null,
        expired: true,
      };
    }

    // Fast path: a fresh anchor makes the cached identity trustworthy.
    if (meta) {
      const user = { id: meta.id, email: '' };
      const getProfile = async () => ({
        id: meta.id,
        role: meta.role,
        account_status: meta.status,
      });
      return { response, user, getProfile, cachedMeta: meta, expired: false };
    }
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

  let authUser: { id: string; email?: string } | null = null;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!error && user) {
      if (!isRecoveryPage && !meta) {
        // Valid tokens but no activity anchor: the session cannot prove when
        // it was last used, so it must not be restored. Re-login is required.
        clearAppSession();
      } else {
        authUser = { id: user.id, email: user.email };
      }
    } else if (error && !meta) {
      // Clear stale metadata and auth token cookies to stop repeated refresh failures
      clearAppSession();
    }
  } catch {
    if (!meta) clearAppSession();
  }

  // @supabase/ssr hardcodes a 400-day Max-Age on refreshed token cookies.
  // Re-apply the Remember Me lifetime so a non-remembered login stays a
  // browser-session cookie even after a token refresh.
  if (authUser) {
    const remember = meta?.remember === true;
    for (const cookie of response.cookies.getAll()) {
      if (!SUPABASE_AUTH_COOKIE.test(cookie.name)) continue;
      response.cookies.set(cookie.name, cookie.value, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        ...(remember ? { maxAge: REMEMBER_LIFETIME_SECONDS } : {}),
      });
    }
  }

  const effectiveUser = authUser;

  const getProfile = async () => {
    const targetId = effectiveUser?.id;
    if (!targetId) return null;

    // Fast path: cached metadata matches current user
    if (meta && meta.id === targetId) {
      return {
        id: meta.id,
        role: meta.role,
        account_status: meta.status,
      };
    }

    // Fallback 1: query via anon client
    let profileData: any = null;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, section_id, account_status, sections(name)')
        .eq('id', targetId)
        .single();
      profileData = data;
    } catch {}

    // Fallback 2: query via service role if anon query failed
    if (!profileData?.id && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: adminData } = await adminClient
          .from('profiles')
          .select('id, full_name, email, role, section_id, account_status, sections(name)')
          .eq('id', targetId)
          .single();
        profileData = adminData;
      } catch {}
    }

    // Recovery sessions are temporary and must not become an app session.
    if (profileData?.id && !isRecoveryPage) {
      const newMeta: SessionMeta = {
        id: profileData.id,
        role: profileData.role,
        status: profileData.account_status,
        // An account switch inside this browser starts a fresh deadline.
        t: meta?.id === profileData.id ? meta.t : Date.now(),
        remember: meta?.remember === true,
      };
      response.cookies.set(META_COOKIE, JSON.stringify(newMeta), sessionCookieOptions(newMeta.remember === true));
    }

    return profileData ?? null;
  };

  return { response, user: effectiveUser, getProfile, cachedMeta: meta, expired: false };
}

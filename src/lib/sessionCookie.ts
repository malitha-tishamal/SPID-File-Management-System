import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import {
  REMEMBER_LIFETIME_SECONDS,
  SESSION_META_COOKIE,
  parseSessionMeta,
  sessionCookieOptions,
  type SessionMeta,
} from 'lib/sessionPolicy';

const SUPABASE_AUTH_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

export async function readSessionMeta(): Promise<SessionMeta | null> {
  try {
    const store = await cookies();
    return parseSessionMeta(store.get(SESSION_META_COOKIE)?.value);
  } catch {
    return null;
  }
}

export function writeSessionMeta(res: NextResponse, meta: SessionMeta): void {
  res.cookies.set(SESSION_META_COOKIE, JSON.stringify(meta), sessionCookieOptions(meta.remember === true));
}

/**
 * @supabase/ssr always writes token cookies with a 400-day Max-Age, which
 * would silently defeat the Remember Me choice. Re-apply the intended
 * lifetime after the auth call: 30 days when remembered, browser-session
 * cookies otherwise.
 */
export async function enforceAuthCookieLifetime(
  res: NextResponse,
  remember: boolean
): Promise<void> {
  let store;
  try {
    store = await cookies();
  } catch {
    return;
  }

  for (const cookie of store.getAll()) {
    if (!SUPABASE_AUTH_COOKIE.test(cookie.name)) continue;
    res.cookies.set(cookie.name, cookie.value, {
      path: '/',
      sameSite: 'lax',
      // Matches the @supabase/ssr default; the browser client must read it.
      httpOnly: false,
      ...(remember ? { maxAge: REMEMBER_LIFETIME_SECONDS } : {}),
    });
  }
}

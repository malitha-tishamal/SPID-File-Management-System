import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from 'config/supabase/middleware';

const PROTECTED_PREFIXES = ['/admin', '/rtl'];
const ADMIN_ONLY_PREFIXES = ['/admin/users', '/admin/admin-management'];

/**
 * Server-side route protection.
 * - Unauthenticated access to protected routes -> sign-in
 * - Sessions are refreshed here on every request
 * - Pending/disabled/locked/rejected accounts never reach the dashboard:
 *   enforcement reads the profile from the database, not from client state.
 * Misconfiguration falls open (API routes then report the exact missing
 * variables) so users never see a misleading "authentication failure".
 */
export async function middleware(request: NextRequest) {
  try {
    return await guard(request);
  } catch (err: any) {
    console.error('[middleware] Supabase configuration problem:', err?.message || err);
    return NextResponse.next();
  }
}

async function guard(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, getProfile } = await updateSupabaseSession(request);

  const isProtectedRoute = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = pathname.startsWith('/auth');
  const isRootRoute = pathname === '/';
  const isAdminOnlyRoute = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  const isResetPassword = pathname.startsWith('/auth/reset-password');

  const redirect = (url: URL) => {
    const r = NextResponse.redirect(url);
    // Carry refreshed session cookies over to the redirect response.
    response.cookies.getAll().forEach((c) => r.cookies.set({ ...c }));
    return r;
  };

  // 1. Protected routes: require an authenticated, APPROVED account.
  if (isProtectedRoute) {
    if (!user) {
      const signInUrl = new URL('/auth/sign-in', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return redirect(signInUrl);
    }

    const profile = await getProfile();
    if (!profile) {
      const signInUrl = new URL('/auth/sign-in', request.url);
      signInUrl.searchParams.set('status', 'unknown');
      return redirect(signInUrl);
    }

    if (profile.account_status !== 'approved') {
      const signInUrl = new URL('/auth/sign-in', request.url);
      signInUrl.searchParams.set('status', String(profile.account_status));
      return redirect(signInUrl);
    }

    if (isAdminOnlyRoute && profile.role !== 'Administrator') {
      return redirect(new URL('/admin/default', request.url));
    }

    return response;
  }

  // 2. Signed-in users skip the auth pages (reset-password keeps its session).
  if (isAuthRoute && !isResetPassword && user) {
    return redirect(new URL('/admin/default', request.url));
  }

  // 3. Root: entrance is sign-in for guests, dashboard for signed-in users.
  if (isRootRoute) {
    return redirect(new URL(user ? '/admin/default' : '/auth/sign-in', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/rtl/:path*',
    '/auth/:path*',
  ],
};

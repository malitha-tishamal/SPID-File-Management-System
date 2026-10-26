import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from 'config/supabase/middleware';

const PROTECTED_PREFIXES = ['/admin', '/rtl', '/staff'];
const ADMIN_ONLY_PREFIXES = ['/admin/users', '/admin/admin-management'];

/**
 * Server-side route protection.
 * - Unauthenticated access to protected routes -> sign-in
 * - Sessions are refreshed here on every request
 * - Pending/disabled/locked/rejected accounts never reach the dashboard:
 *   enforcement reads the profile from the database, not from client state.
 * - Staff users are routed to /staff/default; Admins to /admin/default.
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
  const { response, user, getProfile, cachedMeta } = await updateSupabaseSession(request);

  const isProtectedRoute = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = pathname.startsWith('/auth');
  const isRootRoute = pathname === '/';
  const isAdminOnlyRoute = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  const isAdminRoute = pathname.startsWith('/admin');
  const isResetPassword = pathname.startsWith('/auth/reset-password');

  const redirect = (url: URL) => {
    const r = NextResponse.redirect(url);
    // Carry refreshed session cookies over to the redirect response.
    response.cookies.getAll().forEach((c) => r.cookies.set({ ...c }));
    return r;
  };

  /** Returns the correct home dashboard URL based on role */
  const homeDashboard = (role?: string) => {
    if (role === 'Staff') return new URL('/staff/default', request.url);
    return new URL('/admin/dashboard', request.url);
  };

  // 1. Protected routes: require an authenticated, APPROVED account.
  if (isProtectedRoute) {
    if (!user) {
      const signInUrl = new URL('/auth/sign-in', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return redirect(signInUrl);
    }

    // Fast path: use cached session metadata if valid, otherwise fetch profile
    let role = cachedMeta?.id === user.id ? cachedMeta.role : null;
    let status = cachedMeta?.id === user.id ? cachedMeta.status : null;

    if (!role || !status) {
      const profile = await getProfile();
      if (!profile) {
        const signInUrl = new URL('/auth/sign-in', request.url);
        signInUrl.searchParams.set('status', 'inactivity');
        return redirect(signInUrl);
      }
      role = profile.role;
      status = profile.account_status;
    }

    if (status !== 'approved') {
      const signInUrl = new URL('/auth/sign-in', request.url);
      signInUrl.searchParams.set('status', String(status));
      return redirect(signInUrl);
    }

    // Admin-only pages: non-admin gets bumped to their home
    if (isAdminOnlyRoute && role !== 'Administrator') {
      return redirect(homeDashboard(role));
    }

    // Staff visiting any /admin path â†’ redirect to staff dashboard
    if (isAdminRoute && role === 'Staff') {
      return redirect(new URL('/staff/default', request.url));
    }

    return response;
  }

  // 2. Signed-in users skip the auth pages (reset-password keeps its session).
  if (isAuthRoute && !isResetPassword && user) {
    const role = cachedMeta?.id === user.id ? cachedMeta.role : (await getProfile())?.role;
    return redirect(homeDashboard(role));
  }

  // 3. Root: sign-in for guests, role-aware dashboard for signed-in users.
  if (isRootRoute) {
    if (!user) return redirect(new URL('/auth/sign-in', request.url));
    const role = cachedMeta?.id === user.id ? cachedMeta.role : (await getProfile())?.role;
    return redirect(homeDashboard(role));
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/rtl/:path*',
    '/auth/:path*',
    '/staff/:path*',
    '/api/auth/me',
  ],
};

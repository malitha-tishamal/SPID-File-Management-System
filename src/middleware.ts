import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('spid_session')?.value;
  const isAuthenticated = Boolean(sessionCookie && sessionCookie.trim() !== '');

  const isProtectedRoute = pathname.startsWith('/admin') || pathname.startsWith('/rtl');
  const isAuthRoute = pathname.startsWith('/auth');
  const isRootRoute = pathname === '/';

  // 1. Unauthenticated users trying to access protected routes -> redirect to Sign In
  if (isProtectedRoute && !isAuthenticated) {
    const signInUrl = new URL('/auth/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 2. Authenticated users trying to access auth pages (sign-in, register, forgot-password) -> redirect to Dashboard
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/admin/default', request.url));
  }

  // 3. Root route handling: initial entrance must be sign-in if not authenticated
  if (isRootRoute) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/admin/default', request.url));
    } else {
      return NextResponse.redirect(new URL('/auth/sign-in', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, icons, svgs)
     */
    '/',
    '/admin/:path*',
    '/rtl/:path*',
    '/auth/:path*',
  ],
};

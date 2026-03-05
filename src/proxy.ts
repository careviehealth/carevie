import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Paths that require an authenticated user (Supabase session).
 * Unauthenticated requests are redirected to login with a return URL.
 */
const PROTECTED_PATH_PREFIX = '/app';

export async function proxy(request: NextRequest) {
  // Build response first so Supabase can write refreshed cookies to it
  let response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = pathname === PROTECTED_PATH_PREFIX || pathname.startsWith(PROTECTED_PATH_PREFIX + '/');

  if (isProtected && !user) {
    const loginUrl = new URL('/auth/login', request.url);
    const safeReturnTo = pathname.startsWith('/app') ? pathname : '/app/homepage';
    loginUrl.searchParams.set('returnTo', safeReturnTo);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Only run proxy on /app and everything under it.
     * All other routes (/, /landing-page, /auth/*, /api/*, _next, static) are skipped.
     */
    '/app',
    '/app/:path*',
  ],
};

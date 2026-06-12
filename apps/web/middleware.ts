import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, SESSION_COOKIE, verifySessionCookieValue } from './lib/auth';

/**
 * Workspace gate: every page and proxy route requires a valid session cookie
 * when PULSE_ACCESS_CODE is set. Pages redirect to /login; API routes get a
 * 401. The landing page (/ for logged-out visitors), login/logout endpoints,
 * and static assets stay public.
 */

const PUBLIC_PATHS = new Set(['/', '/login', '/api/auth/login', '/api/auth/logout']);

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const valid = await verifySessionCookieValue(request.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    // A signed-in user has no business on the login screen — send them home.
    if (pathname === '/login' && valid) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (valid) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};

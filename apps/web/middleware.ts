import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, SESSION_COOKIE, verifySessionCookieValue } from './lib/auth';

/**
 * Workspace gate: every page and proxy route requires a valid session cookie
 * when PULSE_ACCESS_CODE is set. Pages redirect to /login; API routes get a
 * 401. The login/logout endpoints and static assets stay public.
 */

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const valid = await verifySessionCookieValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (valid) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

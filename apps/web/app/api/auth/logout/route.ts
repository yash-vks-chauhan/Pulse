import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/auth';

/** Clears the session and lands on /login (works as a plain HTML form post). */
export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  // Same attributes as login sets, so the browser reliably replaces the cookie.
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

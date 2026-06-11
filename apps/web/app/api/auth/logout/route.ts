import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/auth';

/** Clears the session and lands on /login (works as a plain HTML form post). */
export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

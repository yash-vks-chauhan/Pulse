import { NextResponse } from 'next/server';
import {
  accessCode,
  authEnabled,
  constantTimeEqual,
  createSessionCookieValue,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '../../../../lib/auth';

/**
 * Exchange the workspace access code for a signed session cookie.
 * Brute-force is slowed two ways: timing-safe comparison and a small
 * per-IP attempt budget (10 per 15 minutes, in-memory).
 */

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 10_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    // Bound the map: a spoofed-IP flood must not grow memory forever. Expired
    // entries go first; if the cap is still hit, fail closed for new IPs.
    if (!entry && attempts.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of attempts) {
        if (value.resetAt <= now) attempts.delete(key);
      }
      if (attempts.size >= MAX_TRACKED_IPS) return true;
    }
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

/** Platform-set client IP first (x-real-ip); the first x-forwarded-for hop
 *  is client-spoofable and only acceptable as a fallback. */
function clientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local'
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authEnabled()) {
    return NextResponse.json({ disabled: true });
  }

  if (tooManyAttempts(clientIp(request))) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
  }

  let code: unknown;
  try {
    ({ code } = (await request.json()) as { code?: unknown });
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof code !== 'string' || code.length === 0 || code.length > 200) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  }

  if (!constantTimeEqual(code, accessCode()!)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}

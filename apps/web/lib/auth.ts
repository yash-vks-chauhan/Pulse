/**
 * Session auth for the demo workspace — a shared access code exchanged for a
 * signed, httpOnly session cookie.
 *
 *  - Enabled by setting PULSE_ACCESS_CODE (hosted deploys); without it the
 *    app is open and says so. PULSE_SESSION_SECRET signs cookies (falls back
 *    to the access code so one secret is enough to turn auth on).
 *  - Cookie value is `<expiresAtMs>.<hmacSha256(expiresAtMs)>` — nothing to
 *    store server-side, nothing sensitive inside, tamper-evident.
 *  - Web Crypto only, so the same code runs in middleware (edge) and routes.
 *
 * Stated tradeoff (docs/SECURITY.md): one shared code for the single-brand
 * demo workspace, no user identities. Real multi-user auth (magic links via
 * an email provider, sessions in the DB) is out of scope per the brief.
 */

export const SESSION_COOKIE = 'pulse_session';
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;

export function accessCode(): string | undefined {
  const code = process.env.PULSE_ACCESS_CODE;
  return code && code.length >= 8 ? code : undefined;
}

export function authEnabled(): boolean {
  return accessCode() !== undefined;
}

function signingSecret(): string | undefined {
  const code = accessCode();
  if (!code) return undefined;
  return process.env.PULSE_SESSION_SECRET || code;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionCookieValue(now = Date.now()): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error('auth not enabled');
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${await hmacHex(secret, expiresAt)}`;
}

export async function verifySessionCookieValue(
  value: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const secret = signingSecret();
  if (!secret || !value) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const expiresAt = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d{1,16}$/.test(expiresAt) || Number(expiresAt) <= now) return false;
  const expected = await hmacHex(secret, expiresAt);
  return constantTimeEqual(signature, expected);
}

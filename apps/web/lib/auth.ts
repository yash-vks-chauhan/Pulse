/**
 * Session auth for the demo workspace: a shared access code exchanged for a
 * signed, httpOnly session cookie.
 *
 *  - Enabled by setting PULSE_ACCESS_CODE (hosted deploys); without it the
 *    app is open and says so. PULSE_SESSION_SECRET signs cookies (falls back
 *    to the access code so one secret is enough to turn auth on).
 *  - Cookie value is `<expiresAtMs>.<name>.<hmacSha256(expiresAtMs.name)>`.
 *    Nothing sensitive is stored inside, and every field is tamper-evident.
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

const MAX_NAME_CHARS = 40;

function encodeName(name?: string): string {
  const clean = (name ?? '')
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, MAX_NAME_CHARS);
  if (!clean) return '';
  const bytes = new TextEncoder().encode(clean);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeName(encoded: string): string | undefined {
  if (!encoded) return undefined;
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes) || undefined;
  } catch {
    return undefined;
  }
}

export interface Session {
  valid: boolean;
  name?: string;
}

export async function createSessionCookieValue(name?: string, now = Date.now()): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error('auth not enabled');
  const payload = `${String(now + SESSION_TTL_MS)}.${encodeName(name)}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}

/** Verifies the cookie and extracts the HMAC-covered display name. */
export async function readSessionCookie(
  value: string | undefined,
  now = Date.now(),
): Promise<Session> {
  const secret = signingSecret();
  if (!secret || !value) return { valid: false };
  const parts = value.split('.');
  if (parts.length !== 3) return { valid: false };
  const [expiresAt, nameEncoded, signature] = parts;
  if (!/^\d{1,16}$/.test(expiresAt) || Number(expiresAt) <= now) return { valid: false };
  if (!/^[A-Za-z0-9_-]{0,80}$/.test(nameEncoded)) return { valid: false };
  const expected = await hmacHex(secret, `${expiresAt}.${nameEncoded}`);
  if (!constantTimeEqual(signature, expected)) return { valid: false };
  return { valid: true, name: decodeName(nameEncoded) };
}

export async function verifySessionCookieValue(
  value: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  return (await readSessionCookie(value, now)).valid;
}

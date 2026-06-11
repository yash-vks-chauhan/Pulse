import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC request signing for every CRM ⇄ Simulator call.
 *
 * Scheme: signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex.
 * The timestamp is bound into the signature and checked against a replay
 * window, so a captured request cannot be replayed later. Verification is
 * timing-safe.
 */

export const SIGNATURE_HEADER = 'x-pulse-signature';
export const TIMESTAMP_HEADER = 'x-pulse-timestamp';
export const DEFAULT_REPLAY_WINDOW_MS = 5 * 60_000;

export function signPayload(secret: string, timestamp: string, rawBody: string | Buffer): string {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  return createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
}

/** Builds the signed headers for an outgoing request. */
export function buildSignatureHeaders(
  secret: string,
  rawBody: string | Buffer,
  now: number = Date.now(),
): Record<string, string> {
  const timestamp = String(now);
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signPayload(secret, timestamp, rawBody),
  };
}

export interface VerifyResult {
  valid: boolean;
  reason?: 'missing_headers' | 'stale_timestamp' | 'bad_signature';
}

export function verifySignature(params: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string | Buffer;
  replayWindowMs?: number;
  now?: number;
}): VerifyResult {
  const {
    secret,
    timestamp,
    signature,
    rawBody,
    replayWindowMs = DEFAULT_REPLAY_WINDOW_MS,
    now = Date.now(),
  } = params;

  if (!timestamp || !signature) return { valid: false, reason: 'missing_headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > replayWindowMs) {
    return { valid: false, reason: 'stale_timestamp' };
  }

  const expected = signPayload(secret, timestamp, rawBody);
  if (!timingSafeEqualStrings(expected, signature)) {
    return { valid: false, reason: 'bad_signature' };
  }
  return { valid: true };
}

/** Constant-time string comparison — safe for API keys and signatures. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPLAY_WINDOW_MS,
  buildSignatureHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  timingSafeEqualStrings,
  verifySignature,
} from './security';

const secret = 'test-secret-with-at-least-32-characters!!';
const body = JSON.stringify({ events: [{ id: 1 }] });

describe('HMAC request signing', () => {
  it('round-trips: signed headers verify against the same body', () => {
    const headers = buildSignatureHeaders(secret, body);
    const result = verifySignature({
      secret,
      timestamp: headers[TIMESTAMP_HEADER],
      signature: headers[SIGNATURE_HEADER],
      rawBody: body,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const headers = buildSignatureHeaders(secret, body);
    const result = verifySignature({
      secret,
      timestamp: headers[TIMESTAMP_HEADER],
      signature: headers[SIGNATURE_HEADER],
      rawBody: body + ' ',
    });
    expect(result).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects the wrong secret', () => {
    const headers = buildSignatureHeaders(secret, body);
    const result = verifySignature({
      secret: 'another-secret-with-at-least-32-chars!!!',
      timestamp: headers[TIMESTAMP_HEADER],
      signature: headers[SIGNATURE_HEADER],
      rawBody: body,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects replayed (stale) requests outside the window', () => {
    const past = Date.now() - DEFAULT_REPLAY_WINDOW_MS - 1000;
    const headers = buildSignatureHeaders(secret, body, past);
    const result = verifySignature({
      secret,
      timestamp: headers[TIMESTAMP_HEADER],
      signature: headers[SIGNATURE_HEADER],
      rawBody: body,
    });
    expect(result).toEqual({ valid: false, reason: 'stale_timestamp' });
  });

  it('rejects missing headers', () => {
    const result = verifySignature({
      secret,
      timestamp: undefined,
      signature: undefined,
      rawBody: body,
    });
    expect(result).toEqual({ valid: false, reason: 'missing_headers' });
  });

  it('timing-safe comparison handles unequal lengths', () => {
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
  });
});

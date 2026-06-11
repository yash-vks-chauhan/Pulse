import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PiiCrypto } from './pii-crypto';

const key = randomBytes(32).toString('base64');
const hashKey = randomBytes(32).toString('hex');

describe('PiiCrypto', () => {
  it('round-trips plaintext', () => {
    const crypto = new PiiCrypto(key, hashKey);
    const value = 'asha.kulkarni@example.com';
    expect(crypto.decrypt(crypto.encrypt(value))).toBe(value);
  });

  it('uses a fresh IV per encryption (no ciphertext reuse)', () => {
    const crypto = new PiiCrypto(key, hashKey);
    expect(crypto.encrypt('same value')).not.toBe(crypto.encrypt('same value'));
  });

  it('rejects tampered ciphertext (GCM authentication)', () => {
    const crypto = new PiiCrypto(key, hashKey);
    const token = crypto.encrypt('+91 98765 43210');
    const parts = token.split(':');
    const corrupted = Buffer.from(parts[3]!, 'base64');
    corrupted[0] = corrupted[0]! ^ 0xff;
    parts[3] = corrupted.toString('base64');
    expect(() => crypto.decrypt(parts.join(':'))).toThrow();
  });

  it('rejects unknown formats', () => {
    const crypto = new PiiCrypto(key, hashKey);
    expect(() => crypto.decrypt('v9:not:a:token')).toThrow('Unrecognized ciphertext format');
  });

  it('blind index is deterministic and normalization-insensitive', () => {
    const crypto = new PiiCrypto(key, hashKey);
    expect(crypto.blindIndex('Asha@Example.com ')).toBe(crypto.blindIndex('asha@example.com'));
    expect(crypto.blindIndex('a@example.com')).not.toBe(crypto.blindIndex('b@example.com'));
  });

  it('refuses keys that are not 32 bytes', () => {
    expect(() => new PiiCrypto(randomBytes(16).toString('base64'), hashKey)).toThrow();
  });
});

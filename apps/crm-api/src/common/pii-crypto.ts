import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * PII at rest: AES-256-GCM with a random 12-byte IV per value and a versioned
 * wire format `v1:<iv b64>:<tag b64>:<ciphertext b64>` so keys can be rotated
 * later without a flag day. GCM authenticates the ciphertext — tampered values
 * fail decryption instead of decrypting to garbage.
 *
 * Blind index: HMAC-SHA256 over the normalized value with a separate key,
 * enabling equality lookups/dedupe without ever decrypting the column.
 */

const VERSION = 'v1';
const IV_LENGTH = 12;

export class PiiCrypto {
  private readonly key: Buffer;

  constructor(
    keyBase64: string,
    private readonly hashKey: string,
  ) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) {
      throw new Error('PII encryption key must be exactly 32 bytes (base64-encoded)');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(token: string): string {
    const [version, ivB64, tagB64, ciphertextB64] = token.split(':');
    if (version !== VERSION || !ivB64 || !tagB64 || !ciphertextB64) {
      throw new Error('Unrecognized ciphertext format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Deterministic keyed hash for equality lookups without decryption. */
  blindIndex(value: string): string {
    return createHmac('sha256', this.hashKey).update(value.trim().toLowerCase()).digest('hex');
  }
}

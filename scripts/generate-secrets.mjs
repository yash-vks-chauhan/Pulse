#!/usr/bin/env node
/**
 * Generates a local `.env` from `.env.example` with cryptographically strong
 * secrets filled in. Refuses to overwrite an existing `.env` so a key in use
 * is never silently rotated (rotating PII_ENCRYPTION_KEY makes existing
 * ciphertext unreadable).
 *
 * Usage: npm run secrets
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(root, '.env.example');
const envPath = join(root, '.env');

if (existsSync(envPath)) {
  console.error('Refusing to overwrite existing .env — delete it first if you really want new keys.');
  console.error('WARNING: rotating PII_ENCRYPTION_KEY makes previously encrypted data unreadable.');
  process.exit(1);
}

const generators = {
  PULSE_API_KEY: () => `pk_${randomBytes(32).toString('hex')}`,
  WEBHOOK_HMAC_SECRET: () => randomBytes(48).toString('hex'),
  PII_ENCRYPTION_KEY: () => randomBytes(32).toString('base64'),
  PII_HASH_KEY: () => randomBytes(48).toString('hex'),
  SIMULATOR_ADMIN_KEY: () => `ak_${randomBytes(32).toString('hex')}`,
};

const lines = readFileSync(examplePath, 'utf8').split('\n');
const out = lines.map((line) => {
  const match = line.match(/^([A-Z0-9_]+)=$/);
  if (match && generators[match[1]]) {
    return `${match[1]}=${generators[match[1]]()}`;
  }
  return line;
});

writeFileSync(envPath, out.join('\n'), { mode: 0o600 });
console.log(`Wrote ${envPath} (mode 600) with generated secrets for: ${Object.keys(generators).join(', ')}`);

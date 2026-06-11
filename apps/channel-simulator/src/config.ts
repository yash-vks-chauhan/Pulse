import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Local .env wins; fall back to the repo-root .env for monorepo dev.
const localEnv = resolve(__dirname, '../.env');
const rootEnv = resolve(__dirname, '../../../.env');
loadDotenv({ path: existsSync(localEnv) ? localEnv : rootEnv });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SIMULATOR_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  /** Shared secret for HMAC signing of /send (inbound) and callbacks (outbound). */
  WEBHOOK_HMAC_SECRET: z.string().min(32, 'WEBHOOK_HMAC_SECRET must be at least 32 chars'),
  /** Admin key protecting the chaos/config endpoints. */
  SIMULATOR_ADMIN_KEY: z.string().min(32, 'SIMULATOR_ADMIN_KEY must be at least 32 chars'),
  /** Comma-separated origins callbacks may be POSTed to (SSRF guard). */
  CALLBACK_ALLOWLIST: z.string().default('http://localhost:4000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast and loud — a simulator with a missing secret must not boot.
  console.error('[channel-simulator] Invalid environment:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.SIMULATOR_PORT ?? parsed.data.PORT ?? 4100,
  hmacSecret: parsed.data.WEBHOOK_HMAC_SECRET,
  adminKey: parsed.data.SIMULATOR_ADMIN_KEY,
  callbackAllowlist: parsed.data.CALLBACK_ALLOWLIST.split(',').map((origin) => origin.trim()),
};

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
  CRM_API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** Base URL of the channel simulator (worker dispatch target). */
  SIMULATOR_URL: z.string().url().default('http://localhost:4100'),
  /** Public base URL of this API — given to the simulator as callback target. */
  CRM_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  /** Web app origin for the CORS allowlist. */
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  /** API key required on every write endpoint. */
  PULSE_API_KEY: z.string().min(32, 'PULSE_API_KEY must be at least 32 chars'),
  /** Shared secret for HMAC signing of CRM ⇄ Simulator traffic. */
  WEBHOOK_HMAC_SECRET: z.string().min(32, 'WEBHOOK_HMAC_SECRET must be at least 32 chars'),
  /** AES-256-GCM key for PII at rest — base64, exactly 32 bytes. */
  PII_ENCRYPTION_KEY: z
    .string()
    .refine((value) => {
      try {
        return Buffer.from(value, 'base64').length === 32;
      } catch {
        return false;
      }
    }, 'PII_ENCRYPTION_KEY must be base64-encoded 32 bytes (generate with: npm run secrets)'),
  /** HMAC key for PII blind indexes. */
  PII_HASH_KEY: z.string().min(32, 'PII_HASH_KEY must be at least 32 chars'),
  /** Anthropic API key for the AI layer. Optional: without it the AI
   *  endpoints return 503 and everything else keeps working. An empty
   *  string (the .env template default) counts as "not configured". */
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine(
      (value) => value === undefined || value.length >= 10,
      'ANTHROPIC_API_KEY must be at least 10 chars when set',
    ),
  /** Claude model for NL→DSL and message drafting. */
  AI_MODEL: z.string().min(1).default('claude-opus-4-8'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast — an API with a missing secret or key must not boot.
  console.error('[crm-api] Invalid environment:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.CRM_API_PORT ?? parsed.data.PORT ?? 4000,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  simulatorUrl: parsed.data.SIMULATOR_URL.replace(/\/$/, ''),
  crmPublicUrl: parsed.data.CRM_PUBLIC_URL.replace(/\/$/, ''),
  webOrigin: parsed.data.WEB_ORIGIN,
  apiKey: parsed.data.PULSE_API_KEY,
  hmacSecret: parsed.data.WEBHOOK_HMAC_SECRET,
  piiEncryptionKey: parsed.data.PII_ENCRYPTION_KEY,
  piiHashKey: parsed.data.PII_HASH_KEY,
  anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
  aiModel: parsed.data.AI_MODEL,
};

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Local .env wins; fall back to the repo-root .env for monorepo dev.
const localEnv = resolve(__dirname, '../.env');
const rootEnv = resolve(__dirname, '../../../.env');
loadDotenv({ path: existsSync(localEnv) ? localEnv : rootEnv });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const publicUrlFields = ['SIMULATOR_URL', 'CRM_PUBLIC_URL', 'WEB_ORIGIN'] as const;

function isLocalUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    CRM_API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    DATABASE_URL: z.string().trim().url(),
    REDIS_URL: z.string().trim().url(),
    /** Base URL of the channel simulator (worker dispatch target). */
    SIMULATOR_URL: z.string().trim().url().default('http://localhost:4100'),
    /** Public base URL of this API — given to the simulator as callback target. */
    CRM_PUBLIC_URL: z.string().trim().url().default('http://localhost:4000'),
    /** Web app origin for the CORS allowlist. */
    WEB_ORIGIN: z.string().trim().url().default('http://localhost:3000'),
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
    /** OpenRouter API key — the zero-budget alternative (free `:free` models,
     *  cloud-hosted, OpenAI-compatible). Same containment model applies. */
    OPENROUTER_API_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine(
        (value) => value === undefined || value.length >= 10,
        'OPENROUTER_API_KEY must be at least 10 chars when set',
      ),
    /** Google AI Studio (Gemini) free-tier key — second leg of the chain. */
    GEMINI_API_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine(
        (value) => value === undefined || value.length >= 10,
        'GEMINI_API_KEY must be at least 10 chars when set',
      ),
    /** Groq free-tier key — third leg of the chain. */
    GROQ_API_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine(
        (value) => value === undefined || value.length >= 10,
        'GROQ_API_KEY must be at least 10 chars when set',
      ),
    /** Force the PRIMARY provider; the rest of the configured chain still
     *  acts as fallback. Default order: openrouter → gemini → groq → anthropic. */
    AI_PROVIDER: z.enum(['anthropic', 'openrouter', 'gemini', 'groq']).optional(),
    /** Model id for the chosen provider; sensible per-provider default. */
    AI_MODEL: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    /** Comma-separated fallback models (OpenRouter routes to the next one
     *  when the primary is rate-limited or down). */
    AI_FALLBACK_MODELS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : undefined,
      ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const field of publicUrlFields) {
      if (isLocalUrl(env[field])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be a public URL in production`,
        });
      }
    }
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

export type AiProvider = 'anthropic' | 'openrouter' | 'gemini' | 'groq';

const AI_DEFAULTS: Record<AiProvider, { model: string; fallbacks: string[] }> = {
  openrouter: {
    model: 'openai/gpt-oss-120b:free',
    fallbacks: ['qwen/qwen3-next-80b-a3b-instruct:free', 'meta-llama/llama-3.3-70b-instruct:free'],
  },
  gemini: { model: 'gemini-2.5-flash', fallbacks: [] },
  groq: { model: 'llama-3.3-70b-versatile', fallbacks: [] },
  anthropic: { model: 'claude-opus-4-8', fallbacks: [] },
};

/**
 * Build the provider failover chain: every provider with a key, in priority
 * order (free tiers first, paid Anthropic last). AI_PROVIDER forces the
 * primary; the rest of the configured chain still backs it up.
 */
function buildAiChain(env: NonNullable<typeof parsed.data>): AiProvider[] {
  const keys: Record<AiProvider, string | undefined> = {
    openrouter: env.OPENROUTER_API_KEY,
    gemini: env.GEMINI_API_KEY,
    groq: env.GROQ_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  };
  let order: AiProvider[] = ['openrouter', 'gemini', 'groq', 'anthropic'];
  if (env.AI_PROVIDER) {
    if (!keys[env.AI_PROVIDER]) {
      console.error(`[crm-api] AI_PROVIDER=${env.AI_PROVIDER} but the matching API key is not set`);
      process.exit(1);
    }
    order = [env.AI_PROVIDER, ...order.filter((provider) => provider !== env.AI_PROVIDER)];
  }
  return order.filter((provider) => keys[provider] !== undefined);
}

const aiChain = buildAiChain(parsed.data);

/** Per-provider model: defaults, with AI_MODEL overriding the primary's. */
function buildAiModels(env: NonNullable<typeof parsed.data>): Record<AiProvider, string> {
  const models = Object.fromEntries(
    (Object.keys(AI_DEFAULTS) as AiProvider[]).map((provider) => [
      provider,
      AI_DEFAULTS[provider].model,
    ]),
  ) as Record<AiProvider, string>;
  if (env.AI_MODEL && aiChain[0]) models[aiChain[0]] = env.AI_MODEL;
  return models;
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.CRM_API_PORT ?? parsed.data.PORT ?? 4000,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  simulatorUrl: trimTrailingSlash(parsed.data.SIMULATOR_URL),
  crmPublicUrl: trimTrailingSlash(parsed.data.CRM_PUBLIC_URL),
  webOrigin: trimTrailingSlash(parsed.data.WEB_ORIGIN),
  apiKey: parsed.data.PULSE_API_KEY,
  hmacSecret: parsed.data.WEBHOOK_HMAC_SECRET,
  piiEncryptionKey: parsed.data.PII_ENCRYPTION_KEY,
  piiHashKey: parsed.data.PII_HASH_KEY,
  aiKeys: {
    anthropic: parsed.data.ANTHROPIC_API_KEY,
    openrouter: parsed.data.OPENROUTER_API_KEY,
    gemini: parsed.data.GEMINI_API_KEY,
    groq: parsed.data.GROQ_API_KEY,
  } as Record<AiProvider, string | undefined>,
  /** Failover chain of configured providers; empty = AI unconfigured. */
  aiChain,
  aiModels: buildAiModels(parsed.data),
  /** Within-provider model fallbacks (OpenRouter routing). */
  aiFallbackModels: parsed.data.AI_FALLBACK_MODELS ?? AI_DEFAULTS.openrouter.fallbacks,
};

# Pulse — Security Architecture

Security is designed in from Phase 0, not bolted on. This document is the
threat model and the concrete controls, with pointers to the code that
implements each one.

## Trust boundaries

```
 Browser ──(HTTPS, no secrets client-side)──► Web app (Next.js)
 Web app ──(x-api-key, server-side only)───► CRM API
 CRM API ──(HMAC-SHA256 signed)────────────► Channel Simulator /send
 Simulator ──(HMAC-SHA256 signed)──────────► CRM API /api/receipts
 CRM API ◄──────────────────────────────────► Postgres / Redis (private network in prod)
```

Every arrow that crosses a boundary is authenticated, validated, and rate
limited. No service trusts input from any other service.

## Controls

| Threat | Control | Where |
|---|---|---|
| Forged/replayed webhooks | HMAC-SHA256 over `timestamp.rawBody`, ±5 min replay window, timing-safe compare — on **both** directions of CRM ⇄ Simulator traffic | `packages/shared/src/security.ts`, `apps/crm-api/src/common/hmac.guard.ts`, `apps/channel-simulator/src/middleware.ts` |
| Unauthorized API writes | `x-api-key` (≥32 chars) on every CRM write endpoint, timing-safe compare | `apps/crm-api/src/common/api-key.guard.ts` |
| API key leaking to browsers | The web app proxies ingest through a server route; the key lives only in server env | `apps/web/app/api/ingest/route.ts` |
| PII exposure at rest (DB dump, backup leak) | Customer email/phone encrypted with AES-256-GCM, random IV per value, versioned format (`v1:iv:tag:ct`) for key rotation; decrypted just-in-time at dispatch | `apps/crm-api/src/common/pii-crypto.ts` |
| Lookups forcing decryption | HMAC-SHA256 blind index (`email_hash`) with a separate key | same file; `prisma/schema.prisma` |
| Injection via LLM or API input | The LLM can only emit the whitelisted Segment DSL (zod-validated); it never writes SQL or touches the DB. All queries are parameterized via Prisma. Every HTTP body is zod-parsed before use | `packages/shared/src/segment-dsl.ts`, `apps/crm-api/src/common/zod-validation.pipe.ts` |
| SSRF via callback_url | The simulator only POSTs callbacks to allowlisted origins (`CALLBACK_ALLOWLIST`) | `apps/channel-simulator/src/emitter.ts` |
| Webhook poisoning / dup floods | Idempotency keys (unique constraint) absorb duplicates; rank-guarded status updates make concurrent receipt processing safe; unknown messages are counted, never 500s | `apps/crm-api/src/receipts/` |
| DoS / abuse | Global rate limiting (Nest throttler; express-rate-limit on the simulator), bounded JSON body sizes (5 MB / 1 MB), batch caps (≤1,000 rows, ≤500 events) | `app.module.ts`, `channel-simulator/src/index.ts` |
| Secret sprawl | All secrets via env; zod-validated at boot (fail fast); `.env` git-ignored; `npm run secrets` generates strong keys with mode-600 file perms and refuses to overwrite | `src/config.ts` in both services, `scripts/generate-secrets.mjs` |
| Clickjacking / MIME sniffing / downgrade | Helmet on both APIs; CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy on the web app | `apps/web/next.config.mjs` |
| Information leaks in errors | Generic error bodies; no stack traces in responses; structured validation errors expose paths, not internals | error handlers in both services |
| Chaos-panel abuse | Simulator admin endpoints require `x-admin-key` (timing-safe) | `apps/channel-simulator/src/middleware.ts` |

## Key management

- `PULSE_API_KEY` — CRM write auth. Rotate by deploying a new value.
- `WEBHOOK_HMAC_SECRET` — shared CRM ⇄ Simulator. Rotate both sides together.
- `PII_ENCRYPTION_KEY` — AES-256-GCM, base64 32 bytes. Ciphertext is
  version-prefixed (`v1:`) so a `v2` key can be introduced with lazy
  re-encryption; **losing this key makes PII unrecoverable by design**.
- `PII_HASH_KEY` — blind-index HMAC key, separate from the encryption key so
  compromising one does not weaken the other.
- `SIMULATOR_ADMIN_KEY` — chaos panel auth.

In production, set these as platform secrets (Railway/Vercel env),
never in files. Postgres (Neon) and Redis (Upstash) connections use TLS.

## Deliberate scope limits (stated tradeoffs)

- Single-workspace auth model; user login (magic link) lands in Phase 3 per
  the build plan. All write surfaces are already key-protected.
- Web CSP still allows `unsafe-inline`/`unsafe-eval` (Next.js dev tooling);
  tightening to nonce-based CSP is a known follow-up.
- At enterprise scale: per-service mTLS, KMS-held keys with envelope
  encryption, and audit logging — out of scope for this assignment and said so.

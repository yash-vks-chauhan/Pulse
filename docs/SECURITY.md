# Pulse — Security Architecture

Security is designed in from Phase 0, not bolted on. This document is the
threat model and the concrete controls, with pointers to the code that
implements each one.

## Trust boundaries

```
 Browser ──(access code → signed session cookie)──► Web app (Next.js)
 Web app ──(x-api-key, server-side only)───► CRM API
 Web app ──(x-admin-key, server-side only)─► Simulator /admin (chaos panel)
 CRM API ──(HMAC-SHA256 signed)────────────► Channel Simulator /send
 Simulator ──(HMAC-SHA256 signed)──────────► CRM API /api/receipts
 CRM API ──(HTTPS, key server-side only)───► Anthropic API (NL→DSL, drafting)
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
| Injection via LLM or API input | The LLM can only emit the whitelisted Segment DSL (zod-validated); it never writes SQL or touches the DB. The DSL→query compiler maps whitelisted field/op pairs onto parameterized Prisma filters over fixed columns — no dynamic column names, no string interpolation. Every HTTP body is zod-parsed before use | `packages/shared/src/segment-dsl.ts`, `apps/crm-api/src/segments/dsl.compiler.ts`, `apps/crm-api/src/common/zod-validation.pipe.ts` |
| Prompt injection via marketer text | Marketer input is wrapped in data tags and the system prompt instructs the model to ignore instructions inside it. Containment, not trust: the LLM's only outputs are artifacts (DSL / draft variants) that are structured-output-constrained server-side, re-validated with zod here, and **human-approved in the UI before anything executes**. A fully hijacked model can at worst propose a weird-but-valid segment or draft | `apps/crm-api/src/ai/ai.logic.ts`, `apps/crm-api/src/ai/ai.service.ts` |
| AI output drift / hallucinated structure | Structured outputs (JSON-schema-constrained) + zod re-validation (defense in depth); exactly one corrective retry with the validation issues fed back, then an honest 422. Drafts may only use the `{{name}}`/`{{city}}` merge tags and are length-capped per channel | `apps/crm-api/src/ai/ai.logic.ts` |
| LLM cost abuse / token burn | AI endpoints are key-guarded and throttled to 10 req/min (vs 300 global); prompts capped at 500 chars; `max_tokens` bounded; at most one retry per request | `apps/crm-api/src/ai/ai.controller.ts`, `apps/crm-api/src/ai/ai.schemas.ts` |
| PII leaking to the LLM or previews | The LLM never sees customer rows — it gets the marketer's text and an audience summary only. Segment previews return non-sensitive columns; encrypted email/phone are decrypted just-in-time at dispatch and nowhere else | `apps/crm-api/src/segments/segments.service.ts` |
| Web proxy abuse (SSRF / path steering) | Browser-facing `/api/*` routes proxy only FIXED upstream paths; UUID params are format-validated; bodies are JSON-only, size-capped, re-serialized before forwarding; the API key exists only server-side | `apps/web/app/api/_lib/proxy.ts` |
| Unauthorized workspace access | With `PULSE_ACCESS_CODE` set, middleware gates every page and proxy route behind a signed httpOnly session cookie (HMAC-SHA256 over the expiry, tamper-evident, nothing sensitive inside). Login compares timing-safe and budgets 10 attempts / 15 min / IP (platform-set `x-real-ip` preferred over spoofable `x-forwarded-for`; the tracking map is size-capped and fails closed) | `apps/web/middleware.ts`, `apps/web/lib/auth.ts`, `apps/web/app/api/auth/login/route.ts` |
| Open redirect via login `?next=` | Post-login redirects accept same-origin paths only — `//host` and `/\host` (which browsers treat as cross-origin) are rejected | `apps/web/app/login/page.tsx` |
| AI seeing customer data | The insights narrative is generated from aggregate campaign numbers only — counts, rates, revenue totals. No names, no contacts, no per-customer rows ever reach the LLM | `apps/crm-api/src/insights/insights.service.ts` |
| Double escalation under failover | `parent_communication_id` is UNIQUE + children inserted with `skipDuplicates`, so crashed/retried/concurrent sweeps cannot double-send; sweeps have deterministic job ids; only SENT/FAILED communications escalate (QUEUED is still inside our own pipeline) | `apps/crm-api/src/worker/failover.worker.ts`, `apps/crm-api/src/worker/failover.logic.ts` |
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
- `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` /
  `ANTHROPIC_API_KEY` — the AI failover chain (free tiers first, in that
  order; each key is one account on one service, used within that service's
  own terms). Optional: with no keys, the AI endpoints return 503 and the
  rest of the product keeps working. Never proxied to the browser. Providers
  are swappable because the containment model doesn't trust any of them:
  outputs are zod-validated locally regardless, and no PII ever goes
  upstream — which also makes free-tier data policies a non-issue.
- `PULSE_ACCESS_CODE` — web workspace login. Optional locally; set it on
  hosted deploys. `PULSE_SESSION_SECRET` signs session cookies (falls back to
  the access code).

In production, set these as platform secrets (Railway/Vercel env),
never in files. Postgres (Neon) and Redis (Upstash) connections use TLS.

## Deliberate scope limits (stated tradeoffs)

- Single-workspace auth: one shared access code, no per-user identities. The
  brief forbids real messaging/email providers, which rules out true magic
  links; a signed-cookie code gate is the honest equivalent for a single
  demo workspace. At scale: SSO/OIDC + per-user sessions + audit logging.
- Web CSP still allows `unsafe-inline`/`unsafe-eval` (Next.js dev tooling);
  tightening to nonce-based CSP is a known follow-up.
- At enterprise scale: per-service mTLS, KMS-held keys with envelope
  encryption, and audit logging — out of scope for this assignment and said so.

# Pulse — Project Structure

Pulse is a monorepo (npm workspaces) with three deployable apps and one shared
package. This document is the map of the repository — what lives where and why.

```
pulse/
├── README.md                      # Product overview, build plan, architecture (judge-facing)
├── STRUCTURE.md                   # This file — repository map
├── package.json                   # Root workspace config + orchestration scripts
├── tsconfig.base.json             # Strict TS settings shared by every workspace
├── .env.example                   # All required env vars, documented, no secrets
├── docker-compose.yml             # Local Postgres + Redis (prod uses Neon/Upstash)
│
├── apps/
│   ├── web/                       # Frontend — Next.js 16 (App Router)
│   ├── crm-api/                   # Service #1 — CRM API (NestJS + Prisma + BullMQ)
│   └── channel-simulator/         # Service #2 — Channel Simulator (Express)
│
├── packages/
│   └── shared/                    # Types & schemas shared across all services
│
├── docs/
│   ├── ARCHITECTURE.md            # Diagram, the receipt loop, scale tradeoffs
│   ├── SECURITY.md                # Threat model + controls, with code pointers
│   ├── DEPLOYMENT.md              # Vercel/Railway/Neon/Upstash runbook + local dev
│   ├── AI_WORKFLOW.md             # How AI was used to build this (directed/reviewed/rejected)
│   └── LOAD_TEST.md               # (stretch) Load test evidence
│
└── scripts/
    └── generate-secrets.mjs       # Writes .env with cryptographically strong secrets
```

---

## `apps/web` — Frontend (Next.js 16 + Tailwind)

The marketer-facing UI. Phase 1 ships reviewer-usable ingest; copilot,
segments, campaigns, and insights arrive in Phases 2–3.

```
apps/web/
├── app/
│   ├── page.tsx                   # Overview + live service health
│   ├── copilot/page.tsx           # NL → segment → drafts → channel plan → launch (Phase 2)
│   ├── segments/page.tsx          # Saved segments with rule chips
│   ├── campaigns/page.tsx         # Campaign list
│   ├── campaigns/[id]/page.tsx    # Live funnel, failover savings (3s polling)
│   ├── data/page.tsx              # CSV upload for customers/orders (batched, validated)
│   ├── docs/page.tsx              # In-app API docs with curl examples
│   ├── api/_lib/proxy.ts          # Fixed-path server proxy — key never reaches the browser
│   ├── api/{ingest,segments,campaigns,ai}/  # Same-origin proxy routes to the CRM API
│   └── layout.tsx                 # Dashboard shell
├── next.config.mjs                # Security headers (CSP, HSTS, frame-deny, …)
└── package.json
```

## `apps/crm-api` — CRM API (NestJS + Prisma + BullMQ)

The core service. One NestJS module per domain — each owns its controller,
service, and schemas. Controllers stay thin; queue logic lives in `worker/`.

```
apps/crm-api/
├── src/
│   ├── ingest/                    # POST /api/ingest/{customers,orders} — zod-validated, idempotent upserts
│   ├── receipts/                  # POST /api/receipts — HMAC-verified, idempotent, rank-based state machine
│   │   └── receipts.logic.ts      #   pure planning step (unit-tested ordering/dedupe rules)
│   ├── segments/                  # Segment DSL → parameterized Prisma query, preview, CRUD
│   │   └── dsl.compiler.ts        #   the ONLY path from a DSL document to the DB (unit-tested)
│   ├── ai/                        # NL→DSL + message drafting (Anthropic structured outputs)
│   │   ├── ai.logic.ts            #   prompts + validate/retry rules, pure & unit-tested
│   │   └── ai.service.ts          #   the only file that talks to an LLM; 503s when unconfigured
│   ├── campaigns/                 # Create, launch (segment or raw audience → queue), stats-on-read
│   ├── worker/                    # BullMQ dispatch: batching, throttle backoff, retries, DLQ
│   │   ├── failover.logic.ts      #   escalation rules (pure, unit-tested)
│   │   └── failover.worker.ts     #   delayed sweeps → linked child comms on the next channel
│   ├── health/                    # GET /healthz with dependency checks
│   ├── common/                    # ApiKeyGuard, HmacGuard, ZodValidationPipe, PiiCrypto (AES-256-GCM)
│   ├── config.ts                  # zod-validated env — fails fast on missing secrets
│   └── main.ts                    # helmet, CORS allowlist, raw-body capture, bounded parsers
├── prisma/
│   ├── schema.prisma              # Data model — doubles as DB documentation
│   └── seed.ts                    # ~5k customers / ~25k orders / 1 past campaign (PII encrypted)
├── test/integration/
│   └── campaign-loop.ts           # 1k-message campaign under chaos — the Phase 1 acceptance test
└── package.json
```

Planned Phase 3 module (seam already in place): `insights/` (funnel
narrative + next-action recommendation).

## `apps/channel-simulator` — Channel Simulator (Express + TypeScript)

A stand-in for real messaging vendors. Deliberately small and dependency-light.

```
apps/channel-simulator/
├── src/
│   ├── channels.ts                # Per-channel profiles: latency, failure %, rate limits, vocabularies
│   ├── throttle.ts                # Token buckets per channel
│   ├── emitter.ts                 # Callback outbox: dups, out-of-order, webhook retry w/ backoff, SSRF allowlist
│   ├── middleware.ts              # HMAC verification (inbound), admin-key guard
│   ├── config.ts                  # zod-validated env
│   └── index.ts                   # /send, /healthz, /admin/config (chaos panel API)
└── package.json
```

## `packages/shared` — Shared Contracts

The single source of truth for every cross-service boundary. If two services
exchange it, the type lives here.

```
packages/shared/
├── src/
│   ├── status.ts                  # Communication status enum + state-machine ranks
│   ├── events.ts                  # Callback event schemas + per-channel vocabularies
│   ├── send-api.ts                # CRM ↔ Simulator /send request/response contracts
│   ├── segment-dsl.ts             # Segment DSL zod schema (what the LLM must produce)
│   └── security.ts                # HMAC request signing + timing-safe comparison
└── package.json
```

---

## Conventions

- **Validation at every boundary.** Every external input (HTTP body, LLM
  output, webhook event) is parsed with a zod schema before use.
- **The LLM never touches the database.** AI produces a validated DSL
  document; a compiler turns it into a parameterized query.
- **The event log is append-only.** `comm_events` is the source of truth;
  campaign aggregates are derived on read and can be recomputed.
- **Secrets fail fast.** Both services zod-validate their environment at boot
  and refuse to start misconfigured. No secret ever enters the repo.
- **One module per domain** in the CRM API — controllers stay thin, business
  logic lives in services, queue logic lives in `worker/`.

## Where to look first (for reviewers)

| If you want to see… | Go to |
|---|---|
| The receipt idempotency + ordering logic | `apps/crm-api/src/receipts/` (pure logic + tests) |
| The end-to-end loop proven under chaos | `apps/crm-api/test/integration/campaign-loop.ts` |
| "The LLM never touches the DB" made concrete | `packages/shared/src/segment-dsl.ts` → `apps/crm-api/src/segments/dsl.compiler.ts` |
| The AI layer (structured outputs, validate + retry, containment) | `apps/crm-api/src/ai/` (pure logic + tests) |
| Channel failover escalation | `apps/crm-api/src/worker/failover.{logic,worker}.ts` |
| The security model | `docs/SECURITY.md`, `packages/shared/src/security.ts` |
| PII encryption at rest | `apps/crm-api/src/common/pii-crypto.ts` |
| How realistic the vendor simulation is | `apps/channel-simulator/src/channels.ts` |
| The shared API contracts | `packages/shared/src/` |
| The data model | `apps/crm-api/prisma/schema.prisma` |

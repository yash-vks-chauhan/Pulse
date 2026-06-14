# Pulse

**An AI-native campaign copilot for D2C brands.** A marketer describes who they
want to reach in plain English; Pulse proposes the audience, drafts the message,
and plans the channel; the marketer approves; the system executes through a
realistic delivery pipeline, measures the outcome, and recommends the next move.

> **AI proposes → human approves → system executes → AI observes & recommends.**
> Every AI action produces a visible, editable, approvable artifact — no
> black-box autonomy. The LLM never writes SQL and never touches the database.

---

## What it does

| Capability | How it works |
|---|---|
| **Ingest** | REST APIs (and a CSV uploader) for customers and orders — validated, idempotent upserts. Ships with ~5k customers / ~25k orders of realistic seed data for a fictional coffee brand. |
| **Segment** | Natural language → a **validated Segment DSL** (a JSON filter spec) → a parameterized SQL query. The marketer sees and edits the compiled rules and gets a live audience count before running. |
| **Send** | A campaign engine renders per-customer personalised messages and dispatches them to a **separate Channel Simulator** over a `/send` API, respecting per-channel rate limits. |
| **Measure** | The simulator posts back async delivery events (delivered / opened / read / clicked). A campaign dashboard shows the funnel, per-channel breakdown, conversion attribution, and an AI-written performance summary with a one-click follow-up. |

Two things set it apart from a stub implementation:

- **The Channel Simulator is a real simulator.** Four channels (WhatsApp, SMS,
  Email, RCS), each with its own failure rate, latency distribution, rate limit,
  and channel-correct event vocabulary. It injects out-of-order callbacks,
  duplicate callbacks, and retries its webhooks with backoff if the receiver is
  down — so the receipt-handling code has to be genuinely robust.
- **Per-customer delivery is a state machine with channel failover.** If a send
  hard-fails or isn't delivered within a window, a campaign can automatically
  escalate to the next channel (e.g. WhatsApp → SMS → Email), linking the retry
  back to the original communication.

```
QUEUED → SENT → DELIVERED → OPENED → READ → CLICKED → CONVERTED
             ↘ FAILED → (failover policy) → retry on next channel
```

---

## Architecture

Pulse is a monorepo of **three deployable services** plus a shared contracts
package. Services never share types by hand — every cross-service payload is
defined once in `packages/shared` and validated with zod at each boundary.

```
┌─────────────────────────────────────────────────────────────┐
│                     Web — Next.js (App Router)               │
│   Copilot · Segments · Campaigns · Insights · Chaos panel    │
│   Server-side proxy routes keep API keys out of the browser  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (REST)
┌───────────────────────────▼─────────────────────────────────┐
│                  CRM API — NestJS + Prisma                   │
│                                                             │
│   /api/ingest      validated, idempotent upserts            │
│   /api/segments    NL → DSL → compile → preview → save      │
│   /api/campaigns   create · launch · stats-on-read          │
│   /api/receipts ◄──── HMAC-verified idempotent callbacks    │
│   /api/insights    funnel · attribution · AI narrative      │
│                                                             │
│   ┌─────────────────┐   ┌─────────────────────────────────┐ │
│   │  AI layer (LLM) │   │  Worker (BullMQ + Redis)        │ │
│   │  NL → DSL       │   │  batch dispatch · rate limits   │ │
│   │  message drafts │   │  retries/backoff · DLQ          │ │
│   │  insights       │   │  failover state machine         │ │
│   └─────────────────┘   └───────────────┬─────────────────┘ │
└──────────────┬──────────────────────────┼───────────────────┘
               │                          │ POST /send
        ┌──────▼──────┐        ┌──────────▼──────────────────┐
        │ PostgreSQL  │        │   Channel Simulator         │
        │ (Prisma)    │        │   (Express, separate deploy)│
        │             │        │                             │
        │ customers   │        │  per-channel latency,       │
        │ orders      │        │  failures, throttling,      │
        │ segments    │        │  out-of-order + dup events, │
        │ campaigns   │        │  webhook retry w/ backoff   │
        │ comms       │◄───────┤                             │
        │ comm_events │  async │  POST {CRM}/api/receipts    │
        └─────────────┘  events└─────────────────────────────┘
```

### How the core flows work

1. **Ingest** — `POST /api/ingest/*` validates with zod and upserts. PII is
   encrypted at rest (AES-256-GCM).
2. **Segment** — chat input → LLM → Segment DSL (JSON) → schema-validated →
   compiled to a parameterized Prisma query → preview count + sample → save.
   The LLM only ever emits a DSL document — re-validated locally with one
   corrective retry, then an honest error — and a dedicated compiler is the
   single path from DSL to the database. The model has no tools, no DB access,
   and never sees customer PII.
3. **Launch** — snapshot the audience → create `communications` rows (QUEUED) →
   enqueue jobs in batches → the worker calls the simulator's `/send`, honoring
   per-channel rate limits → mark SENT with a `vendor_message_id`.
4. **Receipts** — the simulator asynchronously posts events. `/api/receipts`
   dedupes on `vendor_message_id + event_type`, tolerates out-of-order events
   via a state-machine rank (it never downgrades state), and the append-only
   `comm_events` log is the source of truth — aggregates are derived on read.
5. **Failover** — a delayed BullMQ job checks whether a communication failed or
   stalled; if a policy is enabled, it creates a child communication on the next
   channel, linked via `parent_communication_id`.
6. **Attribution** runs at order ingest: an order placed within 72h of a
   click/read attributes to that communication (last-touch) and advances it to
   CONVERTED with a deterministic event, so re-ingestion never double-counts.
7. **Insights** — the funnel, per-channel split, and attributed revenue are
   derived on read from `communications` + `comm_events`. The AI summarises
   performance and drafts a one-click follow-up campaign; with no LLM key it
   degrades to a heuristic readout rather than failing the page.

---

## Repository layout

```
pulse/
├── apps/
│   ├── web/                 Next.js frontend (App Router, Tailwind, shadcn-style)
│   ├── crm-api/             CRM API — NestJS + Prisma + BullMQ (one module per domain)
│   └── channel-simulator/   Vendor stand-in — Express, dependency-light
├── packages/
│   └── shared/              Cross-service contracts: status ranks, event + DSL schemas, HMAC signing
├── docs/                    ARCHITECTURE · SECURITY · DEPLOYMENT · AI_WORKFLOW
├── scripts/                 generate-secrets.mjs
└── docker-compose.yml       Local Postgres + Redis
```

A full annotated map is in [STRUCTURE.md](STRUCTURE.md). The original product
brief and build plan is preserved in [Project_README.md](Project_README.md).

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind, Radix / shadcn-style components, Recharts |
| CRM API | NestJS 11 (TypeScript), Prisma 6, PostgreSQL |
| Queue | BullMQ + Redis (batching, retry/backoff, DLQ) |
| Channel Simulator | Express 4 (TypeScript) |
| AI | LLM with a provider fallback chain (OpenRouter free models by default → Gemini → Groq → Anthropic). Structured outputs + local zod re-validation with a corrective retry; provider-swappable because the code never trusts the model |
| Contracts | `packages/shared` — zod schemas shared across services |

**Stated scale tradeoffs** (production-at-Xeno-scale vs. this scope): BullMQ now
→ Kafka later; synchronous ingest now → queued consumers later; counters on read
now → streaming aggregation later; a single Postgres table now → partitioned
events later. The boundaries are drawn so each swap is local.

---

## Design principles

- **Validate at every boundary.** Every HTTP body, LLM output, and webhook event
  is parsed with a zod schema before use.
- **The LLM never touches the database.** It produces a validated DSL document; a
  compiler turns that into a parameterized query.
- **The event log is the source of truth.** `comm_events` is append-only;
  campaign aggregates are derived and recomputable.
- **Secrets fail fast.** Both services zod-validate their environment at boot and
  refuse to start misconfigured. No secret ever enters the repo.
- **Thin controllers, pure logic.** Ordering, dedupe, failover, and attribution
  rules live in pure, unit-tested modules separate from their I/O.

---

## Documentation

| Document | What's inside |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagram, the two-service receipt loop, scale tradeoffs |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, controls, and code pointers |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel / Railway / Postgres / Redis runbook |
| [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) | How AI was directed, reviewed, and integrated to build this |
| [STRUCTURE.md](STRUCTURE.md) | Annotated repository map |

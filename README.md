<div align="center">

# Pulse

### AI-native campaign copilot for D2C brands

Describe who you want to reach in plain English — Pulse proposes the audience,
drafts the message, plans the channel, executes through a realistic delivery
pipeline, and tells you what to do next.

<br />

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS_11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-FF4438?style=for-the-badge&logo=redis&logoColor=white)

**[Overview](#overview)** · **[Architecture](#architecture)** · **[How it works](#how-it-works)** · **[Tech stack](#tech-stack)** · **[Documentation](#documentation)**

</div>

---

<div align="center">

<img alt="AI proposes" src="https://img.shields.io/badge/AI-proposes-6366F1?style=for-the-badge">&nbsp;➜&nbsp;
<img alt="Human approves" src="https://img.shields.io/badge/Human-approves-0EA5E9?style=for-the-badge">&nbsp;➜&nbsp;
<img alt="System executes" src="https://img.shields.io/badge/System-executes-10B981?style=for-the-badge">&nbsp;➜&nbsp;
<img alt="AI observes" src="https://img.shields.io/badge/AI-observes_%26_recommends-F59E0B?style=for-the-badge">

</div>

> Every AI action produces a visible, editable, approvable artifact — no
> black-box autonomy. **The LLM never writes SQL and never touches the database.**

---

## Overview

Pulse is a **Campaign Copilot, not a form-filling CRM**. A marketer expresses
intent in natural language; the AI proposes a segment, message, and channel
plan; the marketer approves; the system executes through a realistic delivery
pipeline, measures outcomes, and recommends the next action.

| | Capability | How it works |
|:--:|---|---|
| **1** | **Ingest** | REST APIs (and a CSV uploader) for customers and orders — validated, idempotent upserts. Ships with ~5k customers / ~25k orders of realistic seed data for a fictional coffee brand. |
| **2** | **Segment** | Natural language → a **validated Segment DSL** (a JSON filter spec) → a parameterized SQL query. The marketer sees and edits the compiled rules and gets a live audience count before running. |
| **3** | **Send** | A campaign engine renders per-customer personalised messages and dispatches them to a **separate Channel Simulator** over a `/send` API, respecting per-channel rate limits. |
| **4** | **Measure** | Async delivery events flow back (delivered / opened / read / clicked). A dashboard shows the funnel, per-channel breakdown, conversion attribution, and an AI-written summary with a one-click follow-up. |

### What sets it apart

> **The Channel Simulator is a real simulator, not a stub.**
> Four channels (WhatsApp, SMS, Email, RCS), each with its own failure rate,
> latency distribution, rate limit, and channel-correct event vocabulary. It
> injects out-of-order callbacks, duplicate callbacks, and retries its webhooks
> with backoff if the receiver is down — so the receipt-handling code has to be
> genuinely robust.

> **Per-customer delivery is a state machine with channel failover.**
> If a send hard-fails or stalls within a window, a campaign can automatically
> escalate to the next channel, linking the retry back to the original
> communication.

```
QUEUED ─▶ SENT ─▶ DELIVERED ─▶ OPENED ─▶ READ ─▶ CLICKED ─▶ CONVERTED
              └─▶ FAILED ─▶ (failover policy) ─▶ retry on next channel
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

---

## How it works

The receipt loop is the spine of the system. Every step is idempotent and
forward-only, so duplicate, late, and out-of-order events can never corrupt
state.

<details>
<summary><b>Walk through the end-to-end flow</b></summary>

<br />

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
   channel, linked via a `UNIQUE parent_communication_id` (idempotent at the DB
   level — a retried sweep cannot create two children).
6. **Attribution** runs at order ingest: an order placed within 72h of a
   click/read attributes to that communication (last-touch) and advances it to
   CONVERTED with a deterministic event, so re-ingestion never double-counts.
7. **Insights** — the funnel, per-channel split, and attributed revenue are
   derived on read from `communications` + `comm_events`. The AI summarises
   performance and drafts a one-click follow-up campaign; with no LLM key it
   degrades to a heuristic readout rather than failing the page.

</details>

<details>
<summary><b>Data model</b> (Prisma)</summary>

<br />

```
Customer       external_id, name, email, phone, city, tags[]
               total_spend, order_count, last_order_at   ← denormalized on ingest

Order          customer_id, amount, items, ordered_at, source
               attributed_communication_id?              ← set by attribution

Segment        name, dsl_json, created_from ("nl" | "manual"), nl_prompt?

Campaign       name, segment_id, objective, channel_policy_json
               message_template, status, audience_snapshot_count

Communication  campaign_id, customer_id, channel, message_rendered
               status, status_rank, attempt, parent_communication_id?
               vendor_message_id, sent_at, last_event_at

CommEvent      communication_id, event_type, event_ts, payload_json
               idempotency_key UNIQUE (vendor_message_id + event_type)
```

**Segment DSL** — what the LLM must produce, validated by zod (whitelisted
fields + operators only; anything off-schema is rejected and retried):

```json
{
  "logic": "AND",
  "conditions": [
    { "field": "order_count",   "op": ">=",               "value": 2 },
    { "field": "last_order_at",  "op": "older_than_days",   "value": 60 },
    { "field": "total_spend",    "op": ">",                 "value": 2000 }
  ]
}
```

</details>

<details>
<summary><b>The two API contracts that matter</b></summary>

<br />

**CRM → Simulator** · `POST /send` (HMAC-signed batches)

```jsonc
{
  "batch_id": "uuid",
  "messages": [
    { "message_id": "uuid", "channel": "whatsapp", "recipient": "+91…", "body": "Hi Asha, …" }
  ],
  "callback_url": "https://crm…/api/receipts"
}
// → 202 { "accepted": [...], "throttled": [...] }   // throttled → CRM re-enqueues with backoff
```

**Simulator → CRM** · `POST /api/receipts` (HMAC-verified, idempotent)

```jsonc
{
  "events": [
    { "message_id": "uuid", "event": "delivered", "ts": "…", "event_id": "uuid" }
  ]
}
// → 200 { "accepted": n, "duplicates": m }
```

Duplicate events collide on a unique key; out-of-order events move state forward
only via ranks; if the CRM is down the simulator retries with exponential
backoff.

</details>

---

## Tech stack

| Layer | Choice |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind, Radix / shadcn-style components, Recharts |
| **CRM API** | NestJS 11 (TypeScript), Prisma 6, PostgreSQL |
| **Queue** | BullMQ + Redis — batching, retry/backoff, dead-letter queue |
| **Channel Simulator** | Express 4 (TypeScript), dependency-light |
| **AI** | Provider fallback chain (OpenRouter free models by default → Gemini → Groq → Anthropic). Structured outputs + local zod re-validation with a corrective retry; swappable because the code never trusts the model |
| **Contracts** | `packages/shared` — zod schemas shared across every service |

**Stated scale tradeoffs** (production-at-scale vs. this scope): BullMQ now →
Kafka later; synchronous ingest now → queued consumers later; counters on read
now → streaming aggregation later; a single Postgres table now → partitioned
events later. The boundaries are drawn so each swap is local.

<details>
<summary><b>Repository layout</b></summary>

<br />

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

</details>

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

<div align="center">
<br />
<sub>Built as a monorepo — TypeScript end to end, zod at every boundary, the event log as the single source of truth.</sub>
</div>

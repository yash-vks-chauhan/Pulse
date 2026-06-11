# Pulse — Architecture

Current as of Phase 3. See the README for the full product narrative; this
document covers what is actually built and why.

## System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│   Login gate (signed session cookie, middleware)                 │
│   Copilot · Segments · Campaigns+Insights · Chaos panel ·        │
│   Data ingest (CSV) · API docs                                   │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS · fixed-path server proxies hold the keys
┌───────────────▼──────────────────────────────────────────────────┐
│                      CRM API (NestJS)                            │
│  /api/ingest/*     x-api-key · zod · idempotent upserts          │
│  /api/segments     DSL validate · compile · preview              │
│  /api/ai/*         NL→DSL · drafting (structured outputs, 10/min)│
│  /api/campaigns    create · launch (segment or raw) · stats      │
│  /api/insights/*   channel split · revenue · narrative · follow-up│
│  /api/receipts     HMAC-verified · idempotent · rank-guarded     │
│  /healthz          dependency health                             │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Dispatch worker (BullMQ + Redis)                         │  │
│  │  batch dispatch · throttle-aware retry w/ backoff · DLQ   │  │
│  │  Failover worker: delayed sweeps → child comms on the     │  │
│  │  next channel (UNIQUE parent link = idempotent)           │  │
│  └───────────────────────┬───────────────────────────────────┘  │
└──────────────┬───────────┼───────────────────────────────────────┘
               │           │ POST /send  (HMAC-signed batches)
        ┌──────▼──────┐    │
        │ PostgreSQL  │ ┌──▼───────────────────────────────────────┐
        │ + Prisma    │ │  CHANNEL SIMULATOR (Express)             │
        │             │ │  per-channel latency/failure/throttle    │
        │ customers   │ │  channel-correct event vocabularies      │
        │ orders      │ │  dup + out-of-order injection            │
        │ segments    │ │  webhook retry w/ exponential backoff    │
        │ campaigns   │◄┤  admin chaos panel (failure dials)       │
        │ comms       │ │                                          │
        │ comm_events │ │  POST {CRM}/api/receipts (HMAC-signed)   │
        └─────────────┘ └──────────────────────────────────────────┘
                │
                │ aggregate stats only (never PII)
        ┌───────▼─────────────────────────┐
        │  Anthropic API (Claude)         │
        │  NL→Segment DSL · drafting ·    │
        │  insights narrative — all       │
        │  structured outputs, all        │
        │  zod-re-validated               │
        └─────────────────────────────────┘
```

## The receipt loop (the spine)

1. **Launch** snapshots the audience (compiled Segment DSL or raw filters) and
   creates `communications` rows (QUEUED), then enqueues dispatch jobs in
   batches of 50 and schedules the first failover sweep.
2. **Dispatch worker** decrypts recipients just-in-time and POSTs HMAC-signed
   batches to the simulator. Accepted → SENT (rank-guarded). Throttled →
   re-enqueued with exponential backoff + jitter. Transport failure → BullMQ
   retry ×5 → dead-letter queue + comms marked FAILED. Failures are visible,
   never silent.
3. **Simulator** plans a per-message lifecycle from channel-correct
   vocabularies (SMS never emits `read`; email emits `opened`), draws latency
   and failures from per-channel profiles, injects duplicates (same event_id)
   and out-of-order delays, and flushes due events to `/api/receipts` —
   retrying with backoff if the CRM is down.
4. **Receipts** are idempotent: per-event keys (`message_id:event`) collide on
   a unique constraint (in-batch and cross-batch). Status moves forward-only
   via ranks (`QUEUED 0 → SENT 10 → FAILED 15 → DELIVERED 20 → OPENED 30 →
   READ 40 → CLICKED 50 → CONVERTED 60`); the rank predicate is enforced again
   in the UPDATE's WHERE clause, so concurrent batches can never downgrade.
5. **Failover sweeps** run one window after each hop: SENT-but-undelivered and
   FAILED communications get a linked child on the next channel (QUEUED rows
   are never escalated — they are still inside our own pipeline). The UNIQUE
   `parent_communication_id` makes escalation idempotent at the database
   level. The sweep after the last hop finalizes the campaign → COMPLETED.
6. **Attribution** runs at order ingest: an order placed within 72h of a
   click/read attributes to that communication (last-touch) and advances it
   to CONVERTED with a deterministic `converted` event — re-ingestion never
   double-counts.
7. **Stats & insights** are derived on read from `communications` + the
   append-only `comm_events` log — the event log is the source of truth;
   aggregates are disposable. The AI narrative sees aggregates only and
   degrades to a heuristic readout when no LLM key is configured.

## State machine

```
QUEUED → SENT → DELIVERED → OPENED → READ → CLICKED → CONVERTED
            ↘ FAILED → (failover policy) → child comm on next channel
```

FAILED ranks below DELIVERED on purpose: when both a failure and a delivery
receipt exist for one message, the delivery receipt is ground truth.

## The AI boundary

The LLM is a proposal engine, never an actor: it emits (a) Segment DSL
documents, (b) message draft variants, (c) an insights narrative — each
constrained by structured outputs server-side, re-validated with zod locally
(one corrective retry, then an honest 422), and approved by a human in the UI
before anything executes. It has no tools, no database access, and never sees
customer PII. See docs/SECURITY.md for the full containment table.

## Scale tradeoffs (stated, not hidden)

Assumption: ~100k customers, ~1M communications/month.

| Now (this scope) | At Xeno scale |
|---|---|
| Synchronous ingest writes | Queue (pub/sub) — API validates and acks only |
| BullMQ + Redis | Kafka or managed streams |
| Stats computed on read | Streaming aggregation into counters |
| Attribution at ingest time | Streaming join on an events topic |
| Single Postgres | Partitioned `comm_events`, read replicas |
| In-memory simulator outbox | Durable outbox table + scheduler |
| Shared access code + signed cookie | SSO/OIDC, per-user identities, audit log |

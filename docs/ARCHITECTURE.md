# Pulse — Architecture

Current as of Phase 1. See the README for the full product narrative; this
document covers what is actually built and why.

## System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│        Overview · Data ingest (CSV) · API docs    [Phase 1]      │
│        Copilot · Segments · Campaigns · Insights  [Phase 2–3]    │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS · server-side proxy holds the API key
┌───────────────▼──────────────────────────────────────────────────┐
│                      CRM API (NestJS)                            │
│  /api/ingest/*     x-api-key · zod · idempotent upserts          │
│  /api/campaigns    create · launch · stats                       │
│  /api/receipts     HMAC-verified · idempotent · rank-guarded     │
│  /healthz          dependency health                             │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Dispatch worker (BullMQ + Redis)                         │  │
│  │  batch dispatch · throttle-aware retry w/ backoff · DLQ   │  │
│  └───────────────────────┬───────────────────────────────────┘  │
└──────────────┬───────────┼───────────────────────────────────────┘
               │           │ POST /send  (HMAC-signed batches)
        ┌──────▼──────┐    │
        │ PostgreSQL  │ ┌──▼───────────────────────────────────────┐
        │ + Prisma    │ │  CHANNEL SIMULATOR (Express)             │
        │             │ │  per-channel latency/failure/throttle    │
        │ customers   │ │  channel-correct event vocabularies      │
        │ orders      │ │  dup + out-of-order injection            │
        │ campaigns   │ │  webhook retry w/ exponential backoff    │
        │ comms       │◄┤  admin chaos panel (failure dials)       │
        │ comm_events │ │                                          │
        └─────────────┘ │  POST {CRM}/api/receipts (HMAC-signed)   │
                        └──────────────────────────────────────────┘
```

## The receipt loop (the spine)

1. **Launch** snapshots the audience and creates `communications` rows
   (QUEUED), then enqueues dispatch jobs in batches of 50.
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
5. **Stats** are derived on read from `communications` + the append-only
   `comm_events` log — the event log is the source of truth; aggregates are
   disposable.

## State machine

```
QUEUED → SENT → DELIVERED → OPENED → READ → CLICKED → CONVERTED
            ↘ FAILED → (failover policy, Phase 2) → next channel
```

FAILED ranks below DELIVERED on purpose: when both a failure and a delivery
receipt exist for one message, the delivery receipt is ground truth.

## Scale tradeoffs (stated, not hidden)

Assumption: ~100k customers, ~1M communications/month.

| Now (this scope) | At Xeno scale |
|---|---|
| Synchronous ingest writes | Queue (pub/sub) — API validates and acks only |
| BullMQ + Redis | Kafka or managed streams |
| Stats computed on read | Streaming aggregation into counters |
| Single Postgres | Partitioned `comm_events`, read replicas |
| In-memory simulator outbox | Durable outbox table + scheduler |

## Phase 2+ seams already in place

- `packages/shared/src/segment-dsl.ts` — the validated DSL the LLM must emit
- `Campaign.channelPolicy.failover` + `Communication.parentCommunicationId` —
  failover escalation wiring
- `Order.attributedCommunicationId` — conversion attribution
- Simulator admin API — the live chaos demo

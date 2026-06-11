# Pulse — AI-Native Mini CRM for Reaching Shoppers

**Xeno Engineering Internship Assignment 2026 (SDE Track) — Complete Build Guide**

> Deadline: **12 PM, June 15, 2026** · Deliverables: **Hosted URL + GitHub repo + 5–6 min walkthrough video**

---

## Quickstart (local)

```bash
docker compose up -d     # Postgres + Redis
npm run secrets          # one-time: writes .env with strong generated keys
npm ci                   # install all workspaces
npm run db:migrate       # create the schema
npm run seed             # 5k customers / 25k orders / 1 past campaign
npm run dev:sim          # channel simulator  :4100
npm run dev:crm          # CRM API            :4000   (separate terminal)
npm run dev:web          # web app            :3000   (separate terminal)

npm test                 # unit tests (state machine, HMAC, DSL, crypto, simulator)
npm run test:integration # 1k-message campaign loop under chaos (services must be running)
```

Repository map: [STRUCTURE.md](STRUCTURE.md) · Security model: [docs/SECURITY.md](docs/SECURITY.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Deploy: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 1. Product Point of View (Creativity in Scoping)

Xeno's brief is open-ended on purpose. Our bet — stated explicitly and committed to:

> **Pulse is a Campaign Copilot, not a form-filling CRM.** The marketer expresses intent in natural language; the AI proposes a segment, message, and channel plan; the marketer approves; the system executes through a realistic delivery pipeline, measures outcomes, and recommends the next action.

This sits between "AI assists at key steps" and "true AI agent" from the brief: **AI proposes → human approves → system executes → AI observes & recommends.** Every AI action has a visible, editable, approvable artifact — no black-box autonomy.

### What we ARE building (per the PDF's minimum bar, done deeply)
| PDF Requirement | Our implementation |
|---|---|
| **Ingest data** | REST ingestion APIs for customers + orders, batch-friendly, validated, idempotent. Realistic seed dataset (~5,000 customers, ~25,000 orders) for a fictional D2C coffee brand. |
| **Segment shoppers** | Natural language → **validated Segment DSL** (JSON filter spec) → safe query execution. Marketer sees and edits the compiled rules before running. Live audience preview with count. |
| **Send personalised communications** | Campaign engine dispatches per-customer personalised messages to a **separate Channel Simulator service** over its Send API. |
| **Surface performance insights** | Receipt API ingests async callbacks (delivered/failed/opened/read/clicked/converted). Campaign dashboard with funnel, per-channel breakdown, conversion attribution, and an AI-written performance summary + next-action recommendation. |

### What we are deliberately NOT building (say this in the video)
- ❌ Sales/support CRM features — no deals, pipelines, leads, tickets (explicitly out of scope per PDF)
- ❌ Real messaging provider integrations (explicitly forbidden — simulator only)
- ❌ Multi-tenant orgs, RBAC, billing — single brand workspace, simple auth
- ❌ Drag-and-drop template builders, A/B testing infra, journey builders
- ❌ Real-time websocket dashboards — polling is fine at this scale

**Tradeoff framing for the video:** "At Xeno's scale I'd do X; for this scope I consciously did Y." Examples are listed in §9.

---

## 2. The Two Differentiators (where we win)

### 2.1 The Channel Simulator is a real simulator, not a stub
The PDF says how we model the callback loop "tells us a lot." Most candidates will sleep(2s) and post back "delivered." We build a **configurable delivery simulator**:

- **All four channels from the brief — WhatsApp, SMS, Email, RCS** — each with its own config
- Per-channel **failure rates** and **latency distributions** (WhatsApp ≠ SMS ≠ Email ≠ RCS)
- **Channel-correct event vocabularies** (realism signal): WhatsApp/RCS emit `delivered/read/clicked`; Email emits `delivered/opened/clicked`; SMS emits `delivered/failed/clicked` only — no fake "read" events on channels that don't support them
- **Rate limiting** per channel (e.g., WhatsApp throttles at N msgs/sec → CRM must queue & retry)
- **Out-of-order callbacks** (clicked can arrive before delivered)
- **Duplicate callbacks** (CRM receipt API must be idempotent)
- **Callback retry with backoff** if the CRM receipt API is down (simulating real webhook behavior)
- A **simulator control panel** (`/simulator` page or env config) to crank failure/chaos dials live in the demo

### 2.2 Per-customer delivery state machine with channel failover
Each communication is a state machine:

```
QUEUED → SENT → DELIVERED → OPENED → READ → CLICKED → CONVERTED
            ↘ FAILED → (failover policy) → retry on next channel
```

Campaigns can enable a **failover policy** (e.g., WhatsApp → SMS → Email): if a send hard-fails or isn't delivered within a window, the system automatically escalates to the next channel. This is the original product bet — it mirrors what a real engagement platform does, and it forces genuinely interesting orchestration code.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│  Copilot chat · Segment builder/preview · Campaigns · Insights   │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS (REST)
┌───────────────▼──────────────────────────────────────────────────┐
│                      CRM API (Service #1)                        │
│  NestJS (or Express + TS)                                        │
│                                                                  │
│  /api/ingest/customers   /api/ingest/orders                      │
│  /api/segments  (NL → DSL compile · preview · save)              │
│  /api/campaigns (create · launch · stats)                        │
│  /api/receipts  ◄────────────── idempotent callback ingestion   │
│  /api/insights  (funnel · AI summary · next-action)              │
│                                                                  │
│  ┌────────────────────┐   ┌───────────────────────────────────┐ │
│  │  AI Layer (LLM)    │   │  Campaign Worker (BullMQ + Redis) │ │
│  │  NL→Segment DSL    │   │  batch dispatch · rate-limit      │ │
│  │  Message drafting  │   │  retries/backoff · DLQ            │ │
│  │  Insights summary  │   │  failover state machine           │ │
│  └────────────────────┘   └───────────────┬───────────────────┘ │
└──────────────┬────────────────────────────┼─────────────────────┘
               │                            │ POST /send (per msg/batch)
        ┌──────▼──────┐          ┌──────────▼──────────────────────┐
        │ PostgreSQL  │          │   CHANNEL SIMULATOR (Service #2)│
        │ (Neon/Supa) │          │   separate deploy, own repo dir │
        │             │          │                                 │
        │ customers   │          │  simulates per-channel:         │
        │ orders      │          │  latency · failures · throttle  │
        │ segments    │          │  out-of-order + dup callbacks   │
        │ campaigns   │          │  webhook retry w/ backoff       │
        │ comms       │◄─────────┤                                 │
        │ comm_events │ async    │  POST {CRM}/api/receipts        │
        └─────────────┘ callbacks└─────────────────────────────────┘
```

**Key flows**

1. **Ingest:** `POST /api/ingest/*` → validate (zod) → upsert → done. Stated tradeoff: at Xeno scale this goes through a queue (pub/sub) so the API only validates and acks; here it's synchronous writes, and we say so.
2. **Segment:** chat input → LLM → Segment DSL (JSON) → schema-validated → compiled to a parameterized SQL/Prisma query → preview count + sample → save. **The LLM never writes SQL and never touches the DB.**
3. **Campaign launch:** snapshot the audience → create `communications` rows (QUEUED) → enqueue jobs in batches → worker calls Simulator `/send` respecting per-channel rate limits → mark SENT (with `vendor_message_id`).
4. **Receipts:** Simulator asynchronously POSTs events → `/api/receipts` dedupes via idempotency key (`message_id + event_type`), tolerates out-of-order events via a state-machine rank (never downgrade state), batches counter updates.
5. **Failover:** scheduled check (BullMQ delayed job) — if FAILED or not DELIVERED within window and policy enabled → create new communication on next channel, link via `parent_communication_id`.
6. **Insights:** funnel from `comm_events`; conversion = order placed within attribution window (e.g., 72h) after a click/read, linked back to the communication; AI summarises performance and recommends a follow-up campaign.

---

## 4. Tech Stack (ship-fast, defensible)

| Layer | Choice | Why (your defense in the interview) |
|---|---|---|
| Frontend | **Next.js 16 (App Router) + Tailwind + shadcn/ui** | Fast to build, Vercel deploy in minutes |
| CRM API | **NestJS (TypeScript)** | You know it from Sentinel; modular structure reads well in code review |
| Channel Simulator | **Express + TypeScript** (tiny, separate service) | Deliberately lightweight — it's a vendor stand-in |
| Queue | **BullMQ + Redis (Upstash free tier)** | Real retry/backoff/DLQ semantics without running Kafka; state the "Kafka at scale" tradeoff |
| DB | **PostgreSQL (Neon/Supabase) + Prisma** | Relational fits customers/orders/segments; Prisma schema doubles as documentation |
| AI | **Anthropic API or OpenRouter** (free `:free` models — zero budget) | Provider-swappable because outputs are zod-validated locally either way; schema rides server-side (Anthropic structured outputs) or in-prompt (OpenRouter) |
| Deploy | **Vercel (frontend) + Railway (CRM API, Simulator, Redis worker)** | Public URLs, free tiers, no DevOps time sink |
| Repo | **Monorepo:** `apps/web`, `apps/crm-api`, `apps/channel-simulator`, `packages/shared` (DSL types, event schemas) | Shared types between services = clean contract story |

---

## 5. Data Model (Prisma-style sketch)

```
Customer      id, external_id, name, email, phone, city, tags[], created_at
              total_spend, order_count, last_order_at   ← denormalized, updated on ingest

Order         id, customer_id, amount, items_json, ordered_at, source
              attributed_communication_id?              ← set by attribution job

Segment       id, name, dsl_json, created_from ("nl" | "manual"), nl_prompt?, created_at

Campaign      id, name, segment_id, objective, channel_policy_json
              (primary channel + ordered failover list + windows)
              message_template, status (DRAFT|RUNNING|COMPLETED), audience_snapshot_count
              created_at, launched_at

Communication id, campaign_id, customer_id, channel, message_rendered
              status (QUEUED|SENT|DELIVERED|FAILED|OPENED|READ|CLICKED|CONVERTED)
              status_rank int, attempt int, parent_communication_id?
              vendor_message_id, sent_at, last_event_at

CommEvent     id, communication_id, event_type, event_ts, payload_json
              idempotency_key UNIQUE (vendor_message_id + event_type)
```

**Segment DSL example** (what the LLM must produce, validated by zod):

```json
{
  "logic": "AND",
  "conditions": [
    { "field": "order_count", "op": ">=", "value": 2 },
    { "field": "last_order_at", "op": "older_than_days", "value": 60 },
    { "field": "total_spend", "op": ">", "value": 2000 }
  ]
}
```

Whitelisted fields + operators only. Anything outside the schema → rejected, AI asked to retry, error surfaced honestly.

---

## 6. API Contracts (the two that get grilled)

### CRM → Simulator: `POST /send`
```json
{
  "batch_id": "uuid",
  "messages": [
    { "message_id": "uuid", "channel": "whatsapp",
      "recipient": "+91...", "body": "Hi Asha, ..." }
  ],
  "callback_url": "https://crm.../api/receipts"
}
→ 202 { "accepted": [...], "throttled": [...] }   // throttled → CRM re-enqueues with backoff
```

### Simulator → CRM: `POST /api/receipts`
```json
{
  "events": [
    { "message_id": "uuid", "event": "delivered", "ts": "...",
      "event_id": "uuid" }
  ]
}
→ 200 { "accepted": n, "duplicates": m }
```
**Receipt-handling rules (rehearse these answers):**
- **Duplicate event?** `event_id`/idempotency-key unique constraint → counted as duplicate, no state change.
- **Out of order?** Each status has a rank; events only move state forward (a late `delivered` after `clicked` records the event but doesn't downgrade status).
- **Volume?** Events appended individually; aggregate campaign counters updated in batches / computed on read. Stated tradeoff: at Xeno scale → queue + consumer; here → batched upsert.
- **CRM down?** Simulator retries callbacks with exponential backoff (demonstrably).

---

## 7. AI-Native Features (woven in, not bolted on)

1. **NL → Segment** — "shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000" → DSL → editable rule UI → live count. *Centerpiece.*
2. **Message drafting** — given segment + objective, drafts 2–3 personalised variants per channel ({{name}}, {{last_product}} merge tags), marketer edits/approves.
3. **Channel recommendation** — copilot suggests primary channel + failover order with one-line rationale, based on simple heuristics + past campaign stats.
4. **Insights narrative + next action** — after a campaign: "Delivery 91%, but WhatsApp open-rate lagged email. 38% of the win-back audience never opened — recommend an SMS follow-up to non-openers in 48h. [Create follow-up campaign]" → one click creates the drafted follow-up. **This closes the loop and is the demo's mic-drop.**

**AI-native workflow (scored separately — collect evidence as you build):**
- Keep a `docs/AI_WORKFLOW.md` log: which parts were AI-generated (Claude/Copilot/Cursor), your prompts, what you rejected/rewrote and why.
- Screenshot 2–3 real moments (e.g., AI drafted the receipt idempotency logic; you caught a race condition and fixed it). That "directed, reviewed, integrated" story is exactly what they're grading.

---

## 8. Phase-Wise Build Plan (June 11 → June 15, 12 PM)

### Phase 0 — Today, ~2h: Skeleton & deploy pipeline FIRST
- [x] Monorepo scaffold (`apps/web`, `apps/crm-api`, `apps/channel-simulator`, `packages/shared`)
- [ ] Provision: Neon Postgres, Upstash Redis, LLM API key
- [ ] Deploy "hello world" of all three apps to Vercel/Railway **today** — never fight deployment on the last day
- [x] Prisma schema v1 committed

### Phase 1 — June 11–12 (the spine): Ingest + Simulator + Receipt loop ✅
> If this works end-to-end by Friday night, you have already passed the bar.
- [x] Ingestion APIs (customers, orders) with zod validation + upsert idempotency
- [x] **Reviewer-usable ingest**: simple CSV upload UI for customers/orders + an in-app API docs page — the PDF says "a public URL we can open **and use**", so ingest must be exercisable without Postman
- [x] **Pre-seeded demo workspace** so reviewers land on a living product (data, 1–2 past campaigns with stats), not an empty state
- [x] Seed script: realistic D2C coffee-brand data (5k customers, 25k orders, skewed spend distribution, believable recency patterns)
- [x] Channel Simulator: `/send` with per-channel config (latency dist, failure %, rate limit), async callback emitter with dup/out-of-order injection + webhook retry
- [x] `/api/receipts`: idempotent, rank-based state machine, event log
- [x] BullMQ worker: batch dispatch, throttle-aware retry, backoff, DLQ
- [x] **Integration test**: launch a raw 1k-message campaign via API, watch states converge correctly with chaos dials up

### Phase 2 — June 13: AI layer + Campaigns + Failover ✅
- [x] Segment DSL schema + compiler (DSL → Prisma query) + preview endpoint
- [x] NL → DSL via LLM structured output, validation + retry-on-invalid
- [x] Campaign create/launch flow: audience snapshot → comms rows → enqueue
- [x] Message drafting endpoint (variants + merge-tag rendering)
- [x] Failover policy: delayed-job check → escalate channel → linked child communication
- [x] Frontend: copilot chat surface, segment preview/edit, campaign creation, campaign list

### Phase 3 — June 14: Insights + polish + chaos demo ✅
- [x] Campaign dashboard: funnel (sent→delivered→opened→read→clicked→converted), per-channel split, failover savings ("214 customers reached via SMS after WhatsApp failed")
- [x] Attribution job: order within 72h of click/read → `attributed_communication_id`; revenue-per-campaign stat
- [x] AI insights summary + one-click follow-up campaign
- [x] Simulator chaos panel (crank failure rate live)
- [x] Auth (access-code login + signed session cookie — magic links would need a real email provider, which the brief forbids; tradeoff stated in docs/SECURITY.md)
- [x] `docs/ARCHITECTURE.md` with diagram + tradeoffs; `AI_WORKFLOW.md` kept current; README updated to reality

### Phase 4 — June 15 morning (buffer is sacred): Video + submit
- [ ] Fresh-eyes test of the deployed product start-to-finish
- [ ] Record 5–6 min video (script in §10) — max 2–3 takes, don't perfectionize
- [ ] Submit hosted URL + repo + video via the **SDE form** well before 12 PM

**Rule of thumb when behind schedule:** cut frontend polish first, then failover, then AI insights narrative. Never cut the receipt-loop robustness or the deployed demo — those are the spine.

### Stretch Upgrades — Depth, Not Width (only after the spine is flawless)
> No new product features, ever. If extra capacity exists, raise the engineering ceiling in this exact order:

1. **Proof of scale, not claims of scale.** Run a 50k-message load test against the simulator and commit the results to the repo (`docs/LOAD_TEST.md`): throughput (sends/sec), p95 receipt-processing latency, system behavior at 30% simulated failure rate. Converts the "system design & scalability" evaluation row from opinion into evidence — every candidate will *claim* scale; almost none will show numbers.
2. **Ops/observability page.** A `/system` dashboard: live queue depth, DLQ size, callback ingestion lag, sends/sec, simulator health. Star of the chaos demo — "crank failures to 40%, watch the DLQ absorb it" — and signals production-operations thinking.
3. **Event log as source of truth + replay.** `comm_events` is already append-only; add the ability to rebuild any campaign's aggregates purely from the event log, with a "recompute stats" action. One small feature that earns a senior architectural statement: *"the event log is the source of truth; aggregates are derived and disposable."* Survives ten minutes of interview probing.

If even these are done: more tests on the receipt state machine + DSL compiler, richer demo data, extra video rehearsal. Never new features.

---

## 9. Evaluation Rubric → Our Answer (keep this open while building)

| Xeno evaluates | How Pulse answers it |
|---|---|
| **Build & deploy (table stakes)** | 3 services live on public URLs from Day 0; video recorded against the deployed app, not localhost |
| **Creativity in scoping** | One sharp POV (Campaign Copilot + failover delivery), explicit NOT-building list, single vivid brand scenario |
| **AI-native development** | `AI_WORKFLOW.md` + video segment showing direct/review/integrate moments, including AI output we rejected |
| **Code quality & structure** | Monorepo with shared typed contracts, NestJS modules (ingest/segments/campaigns/receipts/insights), zod at every boundary, meaningful tests on the receipt state machine + DSL compiler |
| **System design & scalability** | Stated scale assumption (~100k customers, ~1M comms/month). Tradeoffs stated in README & video: BullMQ now → Kafka at scale; sync ingest now → queued consumers at scale; counters on read now → streaming aggregation at scale; Postgres now → partitioned events table at scale. If stretch upgrades land: load-test evidence in `docs/LOAD_TEST.md` + live ops dashboard |
| **Thought clarity & communication** | Scripted, rehearsed video; architecture diagram; every decision has a one-sentence "because" |

---

## 10. Walkthrough Video Script (5–6 min, matches their suggested structure)

1. **Product intro (0:30)** — "Brands don't need another form-heavy CRM. Pulse is a campaign copilot: you tell it who you want to win back, it proposes the audience, the message, and the channel plan — you approve, it executes and learns."
2. **Functional demo (1:30)** — NL prompt → segment preview → edit one rule → AI drafts message → set WhatsApp→SMS failover → launch → watch live stats fill → show AI insight + one-click follow-up.
3. **Architecture (1:00)** — diagram; emphasize the two-service callback loop, idempotent receipts, rank-based state machine, queue with retry/DLQ; state scale assumptions + 2 tradeoffs.
4. **Code walkthrough (1:00)** — show receipt handler (idempotency + ordering), the DSL validator ("the LLM never touches the DB"), and the failover job.
5. **AI-native workflow (1:00)** — your actual dev loop, one concrete example of AI output you rejected and why.
6. **Close (0:15)** — what you'd build next (journeys, streaming aggregation, real provider adapters).
7. **Chaos moment (weave into demo)** — crank simulator failure rate to 40% live; show DLQ + failover keeping reach high. This is the "surprise us." ✨

---

## 11. Ground-Rules Compliance Checklist (from the PDF)

- [x] No real messaging provider — simulator only, separate service ✅
- [x] Marketing/engagement CRM, NOT sales/support (no deals/pipelines/leads/tickets) ✅
- [x] Realistic simulated data, no real customers ✅
- [x] AI used freely, but **every line understood and defensible** — they will ask live; never ship code you can't explain ✅
- [x] Tradeoffs stated explicitly in README, docs, and video ✅
- [x] Own stack choice, justified ✅
- [x] Original work — code will be reviewed and discussed live ✅
- [x] Submitted via **SDE submission link** before **12 PM, June 15, 2026** ✅

# AI-Native Workflow Log

Evidence of how AI was used to build Pulse: what was delegated, what was
reviewed, what was rejected and why. Updated as the build progresses.

---

## 2026-06-11 — Phase 0 + Phase 1 scaffold (Claude Code)

**Delegated:** Monorepo scaffold (4 workspaces), Prisma schema v1, the
ingest/receipts/campaigns NestJS modules, the channel simulator, the BullMQ
dispatch worker, seed script, and the security baseline (HMAC signing, PII
encryption, zod-at-every-boundary) — generated with Claude Code from the
README build plan, then reviewed module by module.

**Directed decisions (mine, not the AI's):**
- Security posture set explicitly up front: HMAC on *both* directions of
  CRM ⇄ Simulator traffic (most examples only sign webhooks one way),
  AES-256-GCM for PII at rest with a separate blind-index key, and secrets
  validated at boot so a misconfigured service refuses to start.
- `FAILED` ranks *below* `DELIVERED` in the state machine, so a delivery
  receipt beats a failure if both arrive — delivery receipts are ground truth.
  This ordering question is exactly the kind of judgment call the AI does not
  make on its own; it was specified in review.

**Reviewed & corrected:**
- First pass marked communications SENT unconditionally after dispatch. That
  races with fast receipts (the simulator's minimum latency is only 300 ms —
  a `delivered` callback can beat the SENT write). Fixed by rank-guarding the
  SENT update (`WHERE status_rank < 10`), same forward-only rule as receipts.
- Duplicate counting initially only used the DB unique constraint; duplicates
  *within* one webhook batch were silently merged by `createMany`. Split the
  planner into a pure function (`receipts.logic.ts`) that dedupes in-batch and
  counts both kinds — and is now directly unit-tested.

**Supply-chain pass:** `npm audit` on the first install reported 7 advisories
(1 critical). Root causes were the Next.js 14.x line and vitest 2.x's dev
server; upgraded to Next 16 + React 19 and vitest 4, pinned `ioredis`/`postcss`
via root overrides to deduplicate vulnerable nested copies. Re-verified: all
builds green, 36/36 tests pass, `npm audit` reports 0 vulnerabilities.

**Rejected:** an early suggestion to store campaign stats as counter columns
updated on every receipt. Rejected for write amplification and drift risk —
the event log is the source of truth; aggregates are derived on read and can
always be recomputed. (At Xeno scale this becomes streaming aggregation; the
tradeoff is stated in ARCHITECTURE.md.)

---

## 2026-06-11 — Phase 2: AI layer, segments, failover (Claude Code)

**Delegated:** the `segments/` module (DSL→Prisma compiler + preview), the
`ai/` module (NL→DSL and message drafting via Anthropic structured outputs),
campaign-from-segment launch, the failover sweep worker, and the copilot /
campaigns / segments frontend with its fixed-path server proxy.

**Directed decisions (mine, not the AI's):**
- **Double validation on LLM output.** Structured outputs constrain the
  response server-side at Anthropic, *and* we still re-parse with our own zod
  schema (which carries range limits JSON Schema can't express) — one
  corrective retry with the issues fed back verbatim, then an honest 422.
- **Escalate SENT/FAILED only, never QUEUED.** A QUEUED communication is
  still inside our own dispatch pipeline (throttle backoff); escalating it
  would risk a double send. If dispatch gives up it becomes FAILED and the
  next sweep catches it.
- **`parent_communication_id` is UNIQUE.** Failover idempotency is enforced
  by the database, not by application logic — a crashed or concurrently
  retried sweep physically cannot create two children for one parent.
- **`older_than_days` on `last_order_at` includes never-ordered customers.**
  "Nothing in 60 days" semantically covers someone who never bought; a naive
  `lt cutoff` filter silently drops NULLs.

**Rejected:** a generic catch-all web proxy (`/api/crm/[...path]`) that
forwards any path to the CRM API. Convenient, but it would let the browser
steer requests anywhere the API key reaches. Replaced with one explicit route
per endpoint over a shared helper — fixed upstream string literals, UUID
params format-checked, JSON-only size-capped bodies.

**Containment over trust for prompt injection:** rather than trying to make
the prompt injection-proof, the design caps the blast radius — the model can
only emit schema-bound artifacts, those artifacts are previewed and approved
by a human, and the LLM never sees PII or touches the DB.

---

## 2026-06-11 — Phase 3: attribution, insights, chaos panel, auth (Claude Code)

**Delegated:** the `insights/` module (attribution at ingest, per-channel
breakdown, attributed revenue, AI narrative + one-click follow-up), the
chaos-panel UI over the simulator admin API, and the web login gate
(middleware + signed session cookie).

**Directed decisions (mine, not the AI's):**
- **Attribution is last-touch inside 72h, computed at ingest, idempotent.**
  The CONVERTED advance is rank-guarded and the `converted` event carries a
  deterministic idempotency key — re-ingesting the same orders can never
  double-count revenue. The matching rules live in a pure, unit-tested
  function (`attribution.logic.ts`), same pattern as receipts and failover.
- **The insights narrative must never break the page.** AI configured → AI
  narrative; AI failing or absent → heuristic readout computed from the same
  aggregates, labeled `source: "heuristic"`. The endpoint cannot 5xx because
  an LLM hiccuped.
- **The LLM sees aggregates only.** The narrative prompt receives counts,
  rates and revenue totals — never customer rows. Cheap to enforce, easy to
  defend in review.
- **No magic links, and saying so.** Real email providers are forbidden by
  the brief, so "magic link" auth would be theater. Shipped instead: a shared
  access code → HMAC-signed httpOnly cookie, timing-safe comparison, 10
  attempts / 15 min / IP — and the tradeoff documented in SECURITY.md.

**Reviewed & corrected:** the funnel's `queued`/`failed` counts are typed
`number | undefined` under `noUncheckedIndexedAccess`; the first insights
draft summed them unchecked. Caught by the strict build, fixed with explicit
coalescing rather than loosening the compiler.

---

## 2026-06-11 — AI provider swap: OpenRouter free models (zero budget)

**Why:** no budget for paid LLM calls. OpenRouter's free `:free` models
(cloud-hosted, OpenAI-compatible) replace Anthropic as the default provider,
with Anthropic still supported behind a config switch.

**The architecture made this a ~150-line change, which is the point:** the
AI layer never trusted the model. Structured outputs were a belt; the zod
validation + corrective retry was always the suspenders. For OpenRouter the
JSON Schema moves into the prompt, responses get lenient JSON extraction
(fenced/prose-wrapped output), and validation stays identical. Free-model
rate limits are handled with OpenRouter's fallback routing
(gpt-oss-120b → qwen3-next-80b → llama-3.3-70b) and surfaced honestly as
503 `ai_rate_limited` instead of a fake 502.

**Privacy check:** free models may train on inputs — acceptable here only
because the containment model already guarantees no PII ever reaches the
LLM (marketer text, aggregate stats, nothing else).

**Extended to a provider chain (same day):** openrouter → gemini → groq →
anthropic, each leg one account on one service within its own terms. A
rate-limited leg cools down five minutes while the next serves; responses
report which leg answered (`model: "openrouter:openai/gpt-oss-120b:free"`).
Rejected on principle: rotating multiple keys from multiple accounts of ONE
provider to dodge its free-tier quota — that's a ToS violation with a ban
risk precisely when reviewers would be grading the hosted demo.

---

*(Next: Phase 4 — deploy, fresh-eyes pass, walkthrough video.)*

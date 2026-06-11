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

*(Next entries: Phase 2 — NL → Segment DSL prompts, validation-retry loop,
message drafting; screenshots of rejected AI output.)*

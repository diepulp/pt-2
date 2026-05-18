# Wave 2 Progress Tracker — Transactional Outbox

**Document type:** living progress tracker (human-readable)  
**Machine-readable companion:** `WAVE-2-TRACKER.json` (same directory — keep in sync)  
**Authority:** `WAVE-2-ROLLOUT-MAP.md` (phase plan) · `ROLLOUT-TRACKER.json` (parent machine state)  
**First established:** 2026-05-17  
**Last updated:** 2026-05-17  
**Current position:** Phase 2.1 COMPLETE — PRD-083 / EXEC-083 implemented (2026-05-17). All gates pass. Phase 2.2 PRD not yet authored.

---

## 1. Overall Wave 2 Status

| Phase | Label | Status | PRD | Commit |
|-------|-------|--------|-----|--------|
| 2.0 | Exemplar Proof Slice | ✅ COMPLETE | PRD-081 | `8a1b8741` |
| PRD-082 | Integration Proof Runtime Gate | ✅ COMPLETE | PRD-082 | `b1d45302` |
| **PRD-082 Teardown** | **Harness cleanup pre-2.1 merge** | **✅ APPLIED** | `20260517141021` | 2026-05-17 |
| 2.1 | Producer Expansion A: Financial Adjustment | ✅ COMPLETE | PRD-083 / EXEC-083 | PENDING_MERGE |
| 2.2 | Producer Expansion B: Dependency Events | 🔲 NOT STARTED | PRD to author | — |
| 2.3 | First Consumer Slice: Completeness Projection | 🔲 NOT STARTED | PRD to author | — |
| 2.4 | Consumer Expansion: Operational Telemetry | 🔲 NOT STARTED | PRD to author | — |
| 2.5 | Observability + Sign-Off | 🔲 NOT STARTED | PRD to author | — |

**Wave 2 completion:** all five producers wired + DEC-1 resolved + shift telemetry event-driven + sign-off artifact

---

## 2. Transport Infrastructure Posture (Phase 2.0 Delivered)

The following infrastructure is in place and proven. Phases 2.1–2.5 inherit it without reinstating it.

### 2.1 Database layer

| Artifact | Migration | Notes |
|----------|-----------|-------|
| `generate_uuid_v7()` | `20260511134015` | UUIDv7 monotonic counter; must be called explicitly — no DEFAULT |
| `finance_outbox` Wave 2 DDL | `20260511134129` | `event_id` UUID PK, `envelope_version`, `fact_class`, `origin_label`, `event_type`, `aggregate_id`, `casino_id`, `table_id`, `player_id`, `actor_id`, `gaming_day`, `payload`, `processed_at`, `claimed_until`, `delivery_attempts`, `last_error` |
| `table_buyin_telemetry` reconcile | `20260511134257` | Added `event_type NOT NULL`; `bridge_rated_buyin_to_telemetry()` trigger updated |
| `processed_messages` | `20260511134418` | Idempotent consumer receipts; `(event_id, casino_id)` UNIQUE |
| `rpc_claim_outbox_batch` | `20260511134531` | `FOR UPDATE SKIP LOCKED`; `service_role`; returns batch with `claimed_until` lease |
| `rpc_commit_consumer_receipt` | `20260511134638` | `(event_id, casino_id)` → `'processed'`/`'duplicate'`; SECURITY DEFINER; `service_role` |
| Class A outbox extension | `20260511134903` | `rpc_create_financial_txn` amended; outbox row in same transaction |
| Class B RPC | `20260511135047` | `rpc_record_grind_observation` new; atomic `table_buyin_telemetry` + `finance_outbox` INSERT |
| RLS hardening | `20260511134741` | `finance_outbox`: no authenticated policies (deny-by-default); `processed_messages`: same |
| Transport path bug fixes | `20260512021632` | Fixes Bug 1–4 uncovered during PRD-082 proof (see §3 below) |

### 2.2 Application layer

| Artifact | Location | Notes |
|----------|----------|-------|
| `FinancialOutboxEventDTO` | `services/player-financial/dtos.ts` | Intersection type derived from DB row |
| `runConsumer()` | `services/player-financial/outbox-consumer.ts` | Delegates to `rpc_commit_consumer_receipt`; returns `'processed'` / `'duplicate'` / `Error` |
| Relay route | `app/api/internal/outbox-relay/route.ts` | `POST`; `CRON_SECRET` bearer auth validated before any DB access; stop-before-deadline at 30s−5s |
| Vercel cron | `vercel.json` | `* * * * *` schedule; `POST /api/internal/outbox-relay` |
| Event catalog | `wave-2/WAVE-2-ROLLOUT-MAP.md §4` | `buyin.recorded`, `cashout.recorded`, `grind.observed` registered |

### 2.3 Test suite

| Suite | Count | Status |
|-------|-------|--------|
| `tests/failure/` I1–I4 harness | 19 | ✅ PASS |
| `services/player-financial/__tests__/outbox-producers.test.ts` | 8 unit + 3 skipped integration | ✅ PASS |
| `services/player-financial/__tests__/outbox-relay.test.ts` | 8 | ✅ PASS |
| `services/player-financial/__tests__/outbox-consumer.test.ts` | 6 | ✅ PASS |
| pgTAP `outbox_transport_access.test.sql` | 10 | local only |
| pgTAP `outbox_legacy_shape.test.sql` | 10 | local only |

---

## 3. Transport Path Bugs Fixed (PRD-082 — Migration `20260512021632`)

Four real transport bugs were uncovered during the PRD-082 integration proof run and fixed before signoff.

| Bug | Root Cause | Fix Applied |
|-----|-----------|-------------|
| Bug 1 — `rpc_create_financial_txn` RLS failure | `ON CONFLICT DO UPDATE` causes PostgreSQL 17 to check SELECT policy on conflict-resolution scan path; `player_financial_transaction_no_updates` (USING=false) denies it even when no real conflict exists | Changed to `DO NOTHING` + SELECT fallback |
| Bug 2 — `bridge_rated_buyin_to_telemetry()` trigger | Migration `20260511134257` added `event_type NOT NULL` to `table_buyin_telemetry` but did not update this AFTER INSERT trigger; rated buy-ins failed with NOT NULL violation | Added `v_event_type = 'buyin.observed'` for RATED_BUYIN and RATED_ADJUSTMENT kinds |
| Bug 3 — `rpc_create_financial_adjustment` RLS failure | Same `DO UPDATE` denial-policy issue as Bug 1 | Same `DO NOTHING` fix — **adjustment RPC is now ready for Phase 2.1 outbox extension** |
| Bug 4 — `finance_outbox` INSERT default-deny | `rpc_create_financial_txn` is SECURITY INVOKER (ADR-040); no INSERT policy on `finance_outbox` = default deny for `authenticated` role | Added `finance_outbox_insert_staff` INSERT policy + `GRANT INSERT ON finance_outbox TO authenticated` |

**Key PostgreSQL 17 behavior documented:** When `ON CONFLICT ... WHERE ...` targets a partial index, PostgreSQL checks SELECT policy on the conflict-resolution scan path even when no actual conflict occurs. Plain-column `ON CONFLICT DO NOTHING` (no partial index predicate) does not trigger this check.

---

## 4. Invariant Proof Record

### 4.1 Unit / failure harness (Phase 2.0 — commit `8a1b8741`)

| Invariant | Tests | Result | Scope |
|-----------|-------|--------|-------|
| I1 Atomicity | 5/5 | ✅ PASS | Exemplar pair only — **must re-prove per new producer** |
| I2 Durability | 4/4 | ✅ PASS | Transport baseline — inherited by 2.1–2.5 |
| I3 Idempotency | 5/5 | ✅ PASS | Transport baseline — consumer-level re-verified in 2.3/2.4 |
| I4 Replayability | 5/5 | ✅ PASS | Transport baseline — projection-level re-verified in 2.3/2.4 |

### 4.2 Integration proof (PRD-082 — commit `b1d45302`, local environment)

| Invariant | Result | Key Evidence |
|-----------|--------|-------------|
| I1 Atomicity | ✅ PASS | Class A success + F14 rollback (0 rows both tables); Class B success + cross-casino rollback |
| I2 Durability | ✅ PASS | `delivery_attempts=2` on retry after crash simulation; `processed_at` set after commit |
| I3 Idempotency | ✅ PASS | First: `'processed'`, 1 proof-state row; duplicate: `'duplicate'`, still 1 row (SQL `ON CONFLICT DO NOTHING`) |
| I4 Replayability | ✅ PASS | 15 rows; live fingerprint = replay fingerprint = `eaae205b1e02b9d8067c29766f34abde` |
| I5 Cashout Non-Emission | ✅ PASS | Cashout PFT row created; 0 `finance_outbox` rows emitted |
| Runtime Drift | ✅ ALL_NON_BLOCKING | 8 checks PASS; no blocking drift classes (RELAY_AUTH_BROKEN / SERVICE_ROLE_RPC_ACCESS_BROKEN / RLS_BOUNDARY_BROKEN) |

**I1 is producer-scoped.** The exemplar proof certifies the exemplar pair only. Each new producer (`rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit`) must ship with an explicit atomicity proof test. I2–I4 are transport-substrate invariants and are inherited unless the relay worker, ordering guarantee, or idempotent-consumer implementation changes materially.

---

## 5. PRD-082 Teardown Gate

**Status: ✅ APPLIED — 2026-05-17 (migration 20260517141021, local DB verified clean, commit fe327c45)**

The PRD-082 integration proof introduced harness-only infrastructure that must not survive into Phase 2.1 production code.

### What must be removed

| Item | Current State | Required End State |
|------|--------------|-------------------|
| `rpc_commit_consumer_receipt` harness proof-state write | Writes `outbox_integration_proof_state` inside receipt transaction | Restored to non-harness body (proof-state write removed) |
| `outbox_integration_proof_state` table | Exists (local only — not in shared/remote) | Dropped or explicitly disabled via migration |
| Harness-only grants | If any were added for proof execution | Revoked/removed |

### Teardown mechanism

**Migration authored (2026-05-17):**
```
supabase/migrations/20260517141021_remove_prd082_harness_receipt_proof_state.sql
```

Contents:
1. `CREATE OR REPLACE FUNCTION public.rpc_commit_consumer_receipt(...)` — non-harness body restored (proof-state write removed)
2. `DROP TABLE IF EXISTS public.outbox_integration_proof_state`
3. Revoke harness-only grants
4. Comments documenting teardown completion

**Migration must be applied before any Phase 2.1 migration merges.**

Authority: `TEARDOWN-ARTIFACT-PRD-082.md`

---

## 6. Immediate Next Actions (ordered)

```
1. [x] Author PRD-082 teardown migration
       supabase/migrations/20260517141021_remove_prd082_harness_receipt_proof_state.sql
       Restores rpc_commit_consumer_receipt; drops outbox_integration_proof_state. (2026-05-17)

2. [x] Author Phase 2.1 PRD
       PRD-083 authored. EXEC-083 generated, patched (5 compact patches), and approved. (2026-05-17)

3. [x] /lead-architect EXEC-SPEC scaffold for Phase 2.1
       EXEC-083 scaffolded. (2026-05-17)

4. [x] /build PRD-083 execute Phase 2.1
       All 7 workstreams complete. 127 tests pass, 25 skipped. type-check + lint exit 0. (2026-05-17)

5. [ ] Author Phase 2.2 PRD
       Scope: rpc_request_table_fill + rpc_request_table_credit → 'fill.recorded' + 'credit.recorded' (simultaneous — ADR-055 intra-category parity)
       Chain: /prd-writer → /lead-architect (EXEC-SPEC) → /build PRD-###
       See WAVE-2-ROLLOUT-MAP.md §4 Phase 2.2 for deliverables and exit gate.
```

---

## 7. Phase Detail — Remaining Phases

---

### Phase 2.1 — Producer Expansion A: Financial Adjustment

**Status:** ✅ COMPLETE — PRD-083 / EXEC-083 (2026-05-17)  
**Entry gate:** Phase 2.0 exit ✅ + PRD-082 signoff ✅ + PRD-082 teardown migration ✅ + Phase 2.1 PRD ✅

**Scope:** Wire `rpc_create_financial_adjustment` to emit a `finance_outbox` row atomically. The adjustment RPC already has Bug 3 fixed (`DO NOTHING` idempotency) — the outbox extension is the only remaining work. No relay, consumer, or DDL schema changes needed.

**Semantic contract:**

| Field | Value |
|-------|-------|
| `event_type` | `'adjustment.recorded'` |
| `fact_class` | `'ledger'` |
| `origin_label` | `'actual'` |
| `player_id` | NOT NULL — full attribution required |
| `table_id` | mandatory |
| `aggregate_id` | PFT row id for the adjustment |

**Deliverables:**
- [x] Teardown migration for PRD-082 harness (pre-merge gate) — `20260517141021` ✅
- [x] WS3: RPC signature remediation — drops stale `p_casino_id` overload, restores canonical 7-param ADR-040 signature — `20260517233745`
- [x] WS4: Producer extension migration — conditional ADR-057-eligible outbox emission, `fn_finance_outbox_emit` SD helper, Option A security hardening — `20260517234015`
- [x] WS2: Event catalog entry for `adjustment.recorded` registered in INT-002
- [x] `FinancialOutboxEventDTO` unchanged — no shape changes
- [x] WS5: TypeScript layer — `casino_id` removed from `CreateFinancialAdjustmentInput` / DTOs / hooks; type-check exit 0
- [x] WS6: I1 atomicity proof test for adjustment path — `tests/failure/i1-atomicity-adjustment.test.ts` T1–T7 PASS (7/7 unit)
- [x] WS6: Source-level proof — `services/player-financial/__tests__/outbox-adjustment-producer.test.ts` T15/T18 PASS
- [x] type-check, lint exit 0

**Exit gate:**
- `rpc_create_financial_adjustment` atomically emits `finance_outbox` row (I1 for adjustment path)
- `adjustment.recorded` registered in Wave 2 event catalog
- No second adjustment-to-outbox path in TypeScript
- PRD-082 teardown migration applied
- All gates pass

---

### Phase 2.2 — Producer Expansion B: Dependency Events (Fills + Credits)

**Status:** 🔲 NOT STARTED  
**Entry gate:** Phase 2.1 exit

**Scope:** Wire `rpc_request_table_fill` and `rpc_request_table_credit`. Both must ship simultaneously — they form a **symmetric Dependency Event rollout pair** (ADR-055 intra-category parity). Asymmetric rollout is not permitted; one cannot land without the other.

**Semantic contract (both producers):**

| Field | Value | Note |
|-------|-------|------|
| `fact_class` | `'operational'` | Dependency Events are not Authority Facts |
| `origin_label` | `'estimated'` | Provenance label — not an accuracy qualifier |
| `player_id` | `NULL` | Unconditional — no player attribution |
| `table_id` | mandatory | |
| `event_type` (fill) | `'fill.recorded'` | |
| `event_type` (credit) | `'credit.recorded'` | |

**Critical classification note:** Fills and credits are operationally auditable to the cent. They carry `'estimated'` because they are non-ledger operational inputs — not because their values are uncertain. Authority conflation to `'actual'` is a violation.

**Deliverables:**
- [ ] Migration extending `rpc_request_table_fill` with outbox emission
- [ ] Migration extending `rpc_request_table_credit` with outbox emission
- [ ] Both migrations in same PR (ADR-055 simultaneous landing)
- [ ] Event catalog entries for `fill.recorded` and `credit.recorded`
- [ ] `fact_class = 'operational'` and `origin_label = 'estimated'` hardcoded in both RPCs (not caller-derived)
- [ ] `player_id = NULL` enforced unconditionally in both RPCs
- [ ] I1 atomicity proof tests for both paths
- [ ] Tests proving `origin_label` cannot be upgraded by consumer
- [ ] type-check, lint exit 0

**Exit gate:**
- Both RPCs atomically emit `finance_outbox` rows
- `fill.recorded` and `credit.recorded` in Wave 2 event catalog
- `fact_class = 'operational'` and `origin_label = 'estimated'` verified in migration text
- No authority conflation — consumer tests assert `origin_label` stays `'estimated'`
- All gates pass

---

### Phase 2.3 — First Consumer Slice: Lifecycle-Aware Completeness Projection

**Status:** 🔲 NOT STARTED  
**Entry gate:** Phase 2.1 exit (Class A adjustment producer wired)

**Scope:** First projection consumer that closes DEC-1. Currently all visit-level financial aggregates emit `completeness.status: 'unknown'` because no lifecycle-aware projection exists. This slice builds the consumer infrastructure and lifecycle signal that enables `'complete'` and `'partial'`.

**DEC-1 (outstanding decision):** `VisitFinancialSummaryDTO.total_in/total_out/net_amount` and `FinancialSectionDTO.totalCashIn/totalCashOut/netPosition` emit `completeness.status: 'unknown'` always. The underlying views have no gaming-day lifecycle column. Wave 2 Phase 2.3 must resolve this.

**What this phase builds:**
- Projection store for visit-level Class A financial state (buy-ins, cashouts, adjustments per gaming-day window)
- Consumer reading `buyin.recorded`, `cashout.recorded`, `adjustment.recorded` from `finance_outbox`
- Gaming-day lifecycle signal (close event or lifecycle column enabling `'complete'`)
- Updated completeness logic in `VisitFinancialSummaryDTO` and `FinancialSectionDTO`

**Consumer constraints (non-negotiable):**
- Must use `processed_messages` idempotency before applying any side effect
- Must pass `origin_label` through unchanged — no upgrade from `'estimated'` to `'actual'`
- Must not write to `player_financial_transaction` or any authoring store
- Reads `fact_class` and `origin_label` directly — never infers from payload content

**Deliverables:**
- [ ] Projection store migration (gaming-day-scoped Class A financial state)
- [ ] Consumer service reading `finance_outbox` for Class A event types
- [ ] `processed_messages` idempotency wired within same transaction as projection update
- [ ] Gaming-day lifecycle signal mechanism
- [ ] `VisitFinancialSummaryDTO` completeness: `'complete'` when gaming-day closed, `'partial'` when open, `'unknown'` only when no projection data
- [ ] `FinancialSectionDTO` completeness updated equivalently
- [ ] I3 consumer idempotency re-verification (consumer layer)
- [ ] I4 replay test: truncate projection store → replay Class A events → equivalent completeness state
- [ ] type-check, lint, build exit 0

**Exit gate:**
- DEC-1 resolved — visit-level financial aggregates emit `'complete'`/`'partial'` when events are flowing
- Consumer idempotency test passes: duplicate delivery of same `event_id` produces one projection update
- Replay produces identical completeness state as live processing
- Wave 1 surface rendering contract not broken
- All gates pass

---

### Phase 2.4 — Consumer Expansion: Operational Telemetry Projection

**Status:** 🔲 NOT STARTED  
**Entry gate:** Phase 2.2 exit (all producers wired) + Phase 2.3 exit (consumer infrastructure established)

**Scope:** Projection consumer for Class B (grind) and Dependency Event (fills, credits) streams. Shift telemetry becomes event-driven rather than polling authoring stores.

**Events consumed:**
- `grind.observed` (`fact_class: 'operational'`, `origin_label: 'estimated'`)
- `fill.recorded` (same labels)
- `credit.recorded` (same labels)

**Authority rule:** All three event types carry `origin_label: 'estimated'`. Mixed-class surfaces aggregating these alongside Class A events must degrade to `'estimated'` (Actual > Observed > Estimated hierarchy). No surface may show a combined operational + ledger total without degradation labeling.

**Deliverables:**
- [ ] Operational projection store migration (shift-level Class B + Dependency Event state)
- [ ] Consumer reading `grind.observed`, `fill.recorded`, `credit.recorded` from `finance_outbox`
- [ ] `processed_messages` idempotency wired for operational consumer
- [ ] Authority degradation enforced: mixed-class aggregates degrade to `'estimated'`
- [ ] Completeness: `'partial'` during open shift, `'complete'` on gaming-day close
- [ ] I4 replay test for operational projection
- [ ] Shift telemetry surfaces updated to consume projection (not poll authoring store)
- [ ] type-check, lint, build exit 0

**Exit gate:**
- Shift telemetry receives fresh Class B + Dependency Event data via outbox
- Authority labels correct: `type: 'estimated'` on all operationally-derived values
- Mixed-class surface shows degraded authority (not spurious `'actual'`)
- Completeness signals meaningful during shift lifecycle
- All gates pass

---

### Phase 2.5 — Observability + Sign-Off

**Status:** 🔲 NOT STARTED  
**Entry gate:** Phase 2.4 exit

**Scope:** Minimal relay health observability, outbox retention policy, and Wave 2 sign-off artifact.

**Deliverables:**
- [ ] `outbox_backlog_size` log line in relay worker (count of `processed_at IS NULL` rows per cycle)
- [ ] `processing_lag_ms` log line (elapsed from `finance_outbox.created_at` to `processed_at`)
- [ ] Retention policy for processed rows older than 7 days
- [ ] Wave 2 sign-off artifact: `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md`
  - Summary of all phases completed
  - I1–I4 proof record
  - DEC-1 resolution record
  - Known residual gaps (multi-consumer fan-out, CDC relay, external consumer contract)

**Exit gate:**
- Backlog and lag metrics appear in relay logs
- Retention policy active
- Sign-off document authored and approved
- All gates pass

---

## 8. Invariant Scope per Phase

| Invariant | Scope | 2.0 | 2.1 | 2.2 | 2.3 | 2.4 | 2.5 |
|-----------|-------|-----|-----|-----|-----|-----|-----|
| I1 Atomicity | Producer-specific — re-prove per producer | ✅ exemplar | ✅ T1–T7 PASS (PRD-083) | re-prove: fill + credit | inherited | inherited | inherited |
| I2 Durability | Transport baseline — inherited | ✅ proven | inherited | inherited | inherited | inherited | inherited |
| I3 Idempotency | Transport baseline — consumer-level re-verify | ✅ proven | inherited | inherited | re-verify: consumer layer | re-verify: operational consumer | inherited |
| I4 Replayability | Transport baseline — projection-level re-verify | ✅ proven | inherited | inherited | re-verify: Class A projection | re-verify: operational projection | inherited |
| I5 Truthfulness | Surface enforcement (Wave 1 baseline) | ✅ proven (Wave 1) | inherited | inherited | inherited | inherited | inherited |

---

## 9. Dormant Workstreams (activate through Phase 2.1 / 2.2)

| ID | Producer | Category | Activates |
|----|----------|----------|-----------|
| WS_PRODUCER_ADJUSTMENT | `rpc_create_financial_adjustment` | Class A (Authority Fact) | Phase 2.1 |
| WS_PRODUCER_FILL | `rpc_request_table_fill` | Dependency Event | Phase 2.2 |
| WS_PRODUCER_CREDIT | `rpc_request_table_credit` | Dependency Event | Phase 2.2 |

---

## 10. Permanent Non-Goals (Wave 2 scope boundary)

These require a new FIB or superseding ADR before they can enter scope:

- No CDC / WAL relay (Debezium, `pg_logical`, WAL streaming)
- No external consumer contract (no public event bus, no third-party event semantics)
- No event sourcing (outbox does not reconstruct authoritative state)
- No authoritative totals (Total Drop, shift-end settlement, final money position)
- No multi-consumer fan-out registry
- No UI-driven reconciliation
- No compliance domain scope (`mtl_entry` / MTLService remains parallel)
- No new PFT columns (`player_financial_transaction` is append-only)

---

## 11. Authoritative Sources

| What | Where |
|------|-------|
| Phase plan (scope, deliverables, exit gates per phase) | `wave-2/WAVE-2-ROLLOUT-MAP.md` |
| Machine-readable rollout state | `actions/ROLLOUT-TRACKER.json` |
| Exemplar directive | `wave-2/PRD-081_VERTICAL_COLLAPSE_EXEMPLAR_DIRECTIVE.md` |
| Integration proof signoff | `wave-2/w-2-integration-proof/WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` |
| Integration proof précis | `wave-2/w-2-integration-proof/PRD-082-precis.md` |
| Teardown gate | `wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md` |
| PRD-081 build checkpoint | `.claude/skills/build-pipeline/checkpoints/PRD-081.json` |
| Outbox implementation contract | `wave-2/outbox-knowledge-base.md` |
| Frozen ADR set | `docs/80-adrs/ADR-052` through `ADR-056` |

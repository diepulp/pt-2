# Wave 2 Progress Tracker — Transactional Outbox

**Document type:** living progress tracker (human-readable)  
**Machine-readable companion:** `WAVE-2-TRACKER.json` (same directory — keep in sync)  
**Authority:** `WAVE-2-ROLLOUT-MAP.md` (phase plan) · `ROLLOUT-TRACKER.json` (parent machine state)  
**First established:** 2026-05-17  
**Last updated:** 2026-05-21 (PRD-089 / EXEC-089 Phase 2.5 in progress — WS1_LOG + WS2_RETENTION + WS3_SIGNOFF complete; WS4_GOVERNANCE reconciles trackers (this update). PRD-087 Phase 2.3 closed `ba17a4d0`; PRD-088 Phase 2.4 closed `931f5ed9`; PROD-ANCHOR-STD-001 ratified via WAVE-2-SIGN-OFF.md.)
**Current position:** Phase 2.5 IN PROGRESS (PRD-089 / EXEC-089). Phases 2.0 / PRD-082 / 2.1 / 2.2 / 2.3a / 2.3 / 2.4 all COMPLETE. WS3_SIGNOFF authored `WAVE-2-SIGN-OFF.md` and ratified PROD-ANCHOR-STD-001. Phase 2.5 closure pending devils-advocate Phase 4 review + lint gate. Post-Wave-2 backlog (PWB-001 / PWB-002 / W2-OBS-CASHOUT-PRODUCER-001) reconciled against PRD-088 closure (PWB-003 CLOSED).

---

## 0. Phase Sequencing Model (updated 2026-05-19)

Beginning after Phase 2.2 completion, Wave 2 transitions from **transport-certification sequencing** to **bounded operational rollout sequencing**.

**Phase 2.3a and Phase 2.3 may proceed in parallel.** They operate on different architectural layers:

- **Phase 2.3a** — read-only runtime verification surface for the existing transactional substrate. Does not mutate producer semantics, relay behavior, replay ordering, `processed_messages`, or projection state.
- **Phase 2.3** — first projection consumer with derived completeness state. Reads `finance_outbox` events and writes to a projection store.

Parallelization is permitted while **all four conditions hold**:

1. Relay topology remains frozen
2. Replay ordering semantics remain unchanged
3. No projection logic is introduced into the observability surface
4. No write/replay/repair actions are added to the admin observability boundary

If any condition breaks, parallelization reverts to sequential. This model is authoritative in `WAVE-2-TRACKER.json → direction.principles[parallelization_rule]`.

Phase 2.3a is expected to become the preferred runtime-confidence and debugging surface before broader projection rollout and operational validation proceed.

---

## 1. Overall Wave 2 Status

| Phase | Label | Status | PRD | Commit |
|-------|-------|--------|-----|--------|
| 2.0 | Exemplar Proof Slice | ✅ COMPLETE | PRD-081 | `8a1b8741` |
| PRD-082 | Integration Proof Runtime Gate | ✅ COMPLETE | PRD-082 | `b1d45302` |
| **PRD-082 Teardown** | **Harness cleanup pre-2.1 merge** | **✅ APPLIED** | `20260517141021` | 2026-05-17 |
| 2.1 | Producer Expansion A: Financial Adjustment | ✅ CERTIFIED | PRD-083 / PRD-084 | PENDING_MERGE |
| 2.2 | Producer Expansion B: Dependency Events | ✅ COMPLETE | PRD-085 / EXEC-085 | PENDING_MERGE |
| **2.3a** | **Operational Outbox Observability** | **✅ COMPLETE** | **PRD-086 / EXEC-086** | **PENDING_MERGE** |
| **2.3** | **First Consumer Slice: Completeness Projection** | **✅ COMPLETE** | **PRD-087 / EXEC-087** | **`ba17a4d0`** |
| **2.4** | **Consumer Expansion: Operational Telemetry** | **✅ COMPLETE** | **PRD-088 / EXEC-088** | **`931f5ed9`** |
| **2.5** | **Observability + Sign-Off** | **🔷 IN PROGRESS** | **PRD-089 / EXEC-089** | **PENDING_MERGE** |

**Wave 2 completion:** all producers wired + DEC-1 resolved + shift telemetry event-driven + observability surface live + sign-off artifact

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

5. [x] Author Phase 2.2 PRD + execute via build pipeline
       PRD-085 authored (2026-05-18). EXEC-085 scaffolded and approved. /build PRD-085 executed.
       WS1 (migration 20260518134715), WS2 (i1 fill/credit proof tests), WS3 (governance) all complete. (2026-05-19)

6. [x] Author Phase 2.3a PRD
       PRD-086 authored 2026-05-19. FIB-H-W2-OUTBOX-OBS-001 v0 reviewed and frozen.
       Parallelization model with Phase 2.3 authorized and documented in tracker.

7. [x] /build PRD-086 — Phase 2.3a complete (EXEC-086 scaffolded, all 4 workstreams executed 2026-05-19)
       WS1: admin RPCs (migration 20260519010436) + DTOs. WS2: GET /api/internal/outbox-observability.
       WS3: /admin/outbox-observability page + sidebar link. WS4: tracker update (this entry).

8. [x] Author Phase 2.3 PRD  ← Track B (complete 2026-05-19)
       PRD-087 authored: docs/10-prd/PRD-087-wave2-phase-2.3-lifecycle-aware-completeness-projection-v0.md
       Scope: gaming_day_lifecycle table + visit_class_a_projection table + rpc_process_class_a_projection consumer +
       relay dispatch branch for fact_class='ledger' + completeness resolution in two affected routes.
       Governs: FIB-H-W2-OUTBOX-001 (original wave 2 FIB — no new FIB required).

9. [ ] /lead-architect EXEC-SPEC scaffold for Phase 2.3 (PRD-087)  ← Track B next
       Pre-EXEC gate: verify payload.visit_id presence in migrations 20260511134903 + 20260517234015.
       Chain: /lead-architect → /build PRD-087
       See docs/10-prd/PRD-087-wave2-phase-2.3-lifecycle-aware-completeness-projection-v0.md
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

**PRD-084 Live Certification (2026-05-18):** 20/20 cases pass — see `phase-2-1-certification/CERTIFICATION-RESULT-083.md`.
Infrastructure fix applied: migration `20260518105926` adds `ON CONFLICT (aggregate_id, event_type) DO NOTHING` to `fn_finance_outbox_emit` (idempotency fix for SECURITY INVOKER callers that cannot SELECT from `finance_outbox`).

---

### Phase 2.2 — Producer Expansion B: Dependency Events (Fills + Credits)

**Status:** ✅ COMPLETE — PRD-085 / EXEC-085 (2026-05-19)  
**Entry gate:** Phase 2.1 exit ✅ (certified 2026-05-18)

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
- [x] Migration extending `rpc_request_table_fill` with outbox emission — `20260518134715`
- [x] Migration extending `rpc_request_table_credit` with outbox emission — `20260518134715` (same migration)
- [x] Both migrations in same PR (ADR-055 simultaneous landing) — single migration file
- [x] `fact_class = 'operational'` and `origin_label = 'estimated'` hardcoded in both RPCs (not caller-derived)
- [x] `player_id = NULL` enforced unconditionally in both RPCs
- [x] I1 atomicity proof test for fill path — `tests/failure/i1-atomicity-fill.test.ts` T1-T12 PASS (10 unit + 12 integration stubs)
- [x] I1 atomicity proof test for credit path — `tests/failure/i1-atomicity-credit.test.ts` T1-T12 PASS (10 unit + 12 integration stubs)
- [x] IDEMPOTENCY_CONFLICT: propagation tests in TypeScript layer (`chip-custody.test.ts`)
- [x] rpc_create_financial_adjustment SECURITY DEFINER compatibility upgrade (pre-REVOKE)
- [x] fn_finance_outbox_emit EXECUTE revoked from authenticated (Option A hardening complete)
- [x] type-check, lint exit 0

**Exit gate:**
- ✅ Both RPCs atomically emit `finance_outbox` rows
- ✅ `fact_class = 'operational'` and `origin_label = 'estimated'` hardcoded in migration text
- ✅ `player_id = NULL` unconditional in both RPCs
- ✅ I1 unit proof T1-T12 PASS for both fill and credit producers
- ✅ IDEMPOTENCY_CONFLICT: prefix propagates to TypeScript DomainError without 23505 fallback
- ✅ No supabase.from() outbox fallback path
- ✅ All gates pass

---

### Phase 2.3a — Operational Outbox Observability

**Status:** ✅ COMPLETE — PRD-086 / EXEC-086 (2026-05-19)  
**Entry gate:** Phase 2.2 exit ✅ (2026-05-19)  
**Parallelization:** Proceeded concurrently with Phase 2.3; parallelization conditions remain in force

**Scope:** Read-only internal admin surface at `/admin/outbox-observability`. Makes `finance_outbox` row state and relay delivery status inspectable without SQL access. Provides relay health summary, event queue with full semantic envelope, poison-candidate labeling (`delivery_attempts >= 3` — pilot heuristic, non-authoritative), and search/filter. Does not build projection consumers, write to any authoring store, or process events.

**What this phase does NOT do:**
- No writes to `finance_outbox` or any authoring table
- No replay, retry, repair, or dead-letter routing
- No projection consumers — that is Phase 2.3
- No changes to relay behavior, producer semantics, or replay ordering

**New artifacts:**
- `rpc_get_outbox_relay_health` + `rpc_get_outbox_event_page` — SECURITY DEFINER RPCs (service_role)
- `OutboxAdminEventDTO` — standalone `Pick<FinancialOutboxRow, ...>` (not extending consumer DTO)
- `OutboxRelayHealthDTO` — includes `processed_count_24h` (last 24h window)
- `GET /api/internal/outbox-observability` — admin session auth, service-role DB client
- `app/(dashboard)/admin/outbox-observability/page.tsx`

**Deliverables:**
- [x] Migration with `rpc_get_outbox_relay_health` + `rpc_get_outbox_event_page` — `20260519010436`
- [x] `OutboxAdminEventDTO` and `OutboxRelayHealthDTO` in `services/player-financial/dtos.ts`
- [x] `GET /api/internal/outbox-observability` route (WS2) — two-client auth pattern (session + service-role)
- [x] Admin page `app/(dashboard)/admin/outbox-observability/page.tsx` + `OutboxObservabilityClient.tsx` (WS3)
- [x] Sidebar nav link (Activity icon) — `components/layout/app-sidebar.tsx`
- [x] Unit + integration tests: 401 guard, correct casino scope, poison candidate classification
- [x] type-check (app/ + components/ scope) exit 0; lint exit 0; Turbopack compile exit 0

**Exit gate:**
- ✅ Admin surface renders relay health summary and event queue without SQL
- ✅ `origin_label` rendered with uniform neutral badge — no upgrade at display layer (ADR-054 D5 compliant)
- ✅ `delivery_attempts >= 3` labeled as poison candidate (heuristic, non-authoritative)
- ✅ Zero writes to `finance_outbox` or any authoring table
- ✅ `finance_outbox` read path routes through SECURITY DEFINER RPCs
- ✅ All gates pass

**Phase 2.5 boundary note:** Phase 2.5 delivers relay log-line metrics (`outbox_backlog_size`, `processing_lag_ms`). This phase delivers the interactive surface. No duplication.

---

### Phase 2.3 — First Consumer Slice: Lifecycle-Aware Completeness Projection

**Status:** ✅ COMPLETE — PRD-087 v1.1 / EXEC-087 (commit `ba17a4d0`, 2026-05-19)
**Entry gate:** Phase 2.1 exit (Class A adjustment producer wired) ✅
**Parallelization:** Proceeded concurrently with Phase 2.3a; parallelization conditions held throughout (see §0)
**Pre-EXEC gate:** Resolved — `visit_id` derived via PFT JOIN on `aggregate_id` inside `rpc_process_class_a_projection`; not in outbox payload

**Scope:** Resolved DEC-1. First projection consumer that closes the lifecycle-aware completeness signal: visit-level financial aggregates now emit `'complete'` / `'partial'` based on gaming-day lifecycle + Class A projection backlog. Implemented as Gate A (envelope) + Gate B (projection) per EXEC-087 cadence directive.

**DEC-1 resolution:** `VisitFinancialSummaryDTO.total_in/total_out/net_amount` and `FinancialSectionDTO.totalCashIn/totalCashOut/netPosition` now emit `'complete'` / `'partial'` / `'unknown'` based on Class A projection state + gaming-day lifecycle. Affected routes: `GET /api/v1/visits/{visitId}/financial-summary` and `GET /api/v1/rating-slips/{id}/modal-data` (financial section).

**Gate A migrations (envelope compatibility — `gaming_day` column added to `finance_outbox`):**
- `20260519183629` — add `finance_outbox.gaming_day` (nullable)
- `20260519183630` — `fn_finance_outbox_emit` 9-param signature (old 8-param removed)
- `20260519183631` — amend all five producers to emit `gaming_day`
- `20260519183632` — authoritative backfill (ledger rows from PFT.gaming_day; fill/credit/grind fail-closed)
- `20260519183633` — harden `gaming_day NOT NULL`
- `20260519183634` — extend immutability trigger to include `gaming_day`

**Gate B migrations (Class A projection + lifecycle close signal):**
- `20260519184706` — `visit_class_a_projection` store
- `20260519184708` — `rpc_process_class_a_projection(p_message_id)` ledger-only consumer; non-ledger rows remain `processed_at IS NULL`
- `20260519184707` / `20260519184709` — `gaming_day_lifecycle` table + `rpc_close_gaming_day`

**Application layer:**
- `services/player-financial/crud.ts` — `getVisitClassACompleteness()` added; completeness propagated via `getVisitSummary` → mapper
- `VisitFinancialSummaryDTO` and `FinancialSectionDTO` completeness updated through mapper chain

**Consumer constraints honored:**
- `processed_messages` idempotency check before projection side effect
- `origin_label` travels unchanged — no upgrade from `'estimated'` to `'actual'`
- Consumer claims only `fact_class = 'ledger'`; non-ledger rows preserved for Phase 2.4

**Exit gate ✅ MET (2026-05-19):**
- Gate A: all five producers emit non-null `gaming_day`; NOT NULL hardened; immutability guard extended; no authenticated write path broken
- Gate B: DEC-1 resolved; I3 consumer re-verification PASS (duplicate → one projection update); I4 replay re-verification PASS (truncate + replay → identical state); non-ledger rows remain `processed_at IS NULL`
- Wave 1 surface rendering contract not broken

---

### Phase 2.4 — Consumer Expansion: Operational Telemetry Projection

**Status:** ✅ COMPLETE — PRD-088 / EXEC-088 (commit `931f5ed9`, 2026-05-21 — "feat(outbox): PRD-088 Phase 2.4 — operational telemetry projection complete")
**Entry gate:** Phase 2.2 exit (all producers wired) ✅ + Phase 2.3 exit (consumer infrastructure + Gate A `gaming_day` envelope) ✅

**Scope:** Projection consumer for Class B (grind) and Dependency Event (fills, credits) streams. Reads `grind.observed`, `fill.recorded`, `credit.recorded`. Produces shift-level operational telemetry with strict `type: 'estimated'` authority (ADR-054 R4). Closes PWB-003 (GrindBuyinPanel mounting).

**Migrations:**
- `20260521015409` — `shift_operational_projection` table (PK `(casino_id, gaming_day, table_id)`; `grind_volume_cents BIGINT`, `fill_total_cents BIGINT`, `credit_total_cents BIGINT`, `event_count BIGINT`, `updated_at TIMESTAMPTZ`)
- `20260521022656` — `rpc_claim_operational_outbox_batch(p_batch_size INT)` — SECURITY DEFINER, service_role; claims `fact_class='operational' AND delivery_attempts < 5` with FOR UPDATE SKIP LOCKED
- `20260521022703` — `rpc_process_operational_projection(p_message_id)` — SECURITY DEFINER, service_role; returns `'processed' | 'duplicate' | 'skipped_ledger' | 'skipped_unknown' | 'not_found'`; stamps `processed_at` atomically (DEC-EXEC-1)
- `20260521022708` — backlog index `finance_outbox(casino_id, fact_class, delivery_attempts, processed_at)`

**Application layer:**
- `services/player-financial/outbox-operational-consumer.ts` — `runOperationalConsumer()` (batch_size=25, stop-before-deadline)
- `app/api/internal/outbox-relay/route.ts` — operational branch added; dual-branch response `{classA, operational}`
- `app/api/internal/outbox-observability/route.ts` — 3-way backlog breakdown `operationalBacklog: {claimable, deadLetter}` (DEC-EXEC-6)
- `services/player-financial/crud.ts` — `getShiftOperationalCompleteness(supabase: SupabaseClient | null, ...)` with 5-step completeness logic (`unknown` / `complete-zero` / `partial-no-lifecycle` / `partial-with-backlog` / `complete`); always `type: 'estimated'` (ADR-054 R4)
- `app/api/v1/table-context/operational-projection/route.ts` — GET; `casinoId` from `rlsContext` only (DEC-EXEC-4); 400 on invalid params
- `services/player-financial/dtos.ts` — `OperationalProjectionResponseDTO`, `OperationalConsumerResultDTO` added
- `services/player-financial/schemas.ts` — `operationalProjectionQuerySchema` (ADR-013 compliant; `uuidFormat` permissive regex)
- `hooks/table-context/use-buyin-telemetry.ts` — interface changed from `shiftWindow` to `gamingDay: string` (DEC-EXEC-2)
- **PWB-003 closure:** `GrindBuyinPanel` mounted in `components/pit-panels/tables-panel.tsx` via `panel-container.tsx`; `gamingDay` threaded `PanelContainer → TablesPanel → GrindBuyinPanel` (DEC-EXEC-2)

**Exit gate ✅ MET (2026-05-21):**
- Consumer certified: `rpc_claim_operational_outbox_batch` + `rpc_process_operational_projection` wired and tested
- `GrindBuyinPanel` mounted in `TablesPanel` — `grind.observed` rows producible via real operator workflow (PWB-003 closed)
- Fill/credit operator UI gap acknowledged — `fill.recorded` / `credit.recorded` require direct API call; operator UI deferred to PWB-002
- ADR-054 R4 authority invariant: `type: 'estimated'` on all `OperationalProjectionResponseDTO` values; test suite passes
- DEC-EXEC-4: `casinoId` from `rlsContext` only; attacker-supplied casinoId query param rejected
- I3 consumer idempotency re-verified at operational consumer layer
- I4 replay re-verified at operational consumer layer
- 58 tests across 6 suites — 100% pass; type-check exit 0; lint exit 0

---

### Phase 2.5 — Observability + Sign-Off

**Status:** 🔷 IN PROGRESS — PRD-089 / EXEC-089 (2026-05-21)
**Entry gate:** Phase 2.4 exit ✅ (commit `931f5ed9`, 2026-05-21)

**Scope:** Closing slice of Wave 2 — three deliverables exactly: (1) structured `outbox_relay_cycle` per-cycle log emission (FR-1 authenticated + FR-2 unauthenticated variants); (2) 7-day retention path for processed `finance_outbox` rows via cron-driven SECURITY DEFINER RPC + partial index; (3) `WAVE-2-SIGN-OFF.md` ratifying PROD-ANCHOR-STD-001 and reconciling post-Wave-2 backlog against PRD-088 closure. No new producers, consumers, or UI surfaces.

**WS1_LOG — Relay cycle log emission ✅ COMPLETE:**
- `outbox_relay_cycle` structured log line per relay invocation, two schema variants (`auth_failed: false` and `auth_failed: true`)
- Branch lag-sample contract: `lagSamplesMs: number[]` on Class A and operational consumer branch results; DB-clock derived (`Date.parse(processed_at) - Date.parse(created_at)` for `processedEventIds`); duplicate / skipped / failed / claim-error / auth-fail outcomes excluded by construction
- Backlog count predicates match `rpc_claim_class_a_outbox_batch` and `rpc_claim_operational_outbox_batch` claim paths verbatim (including operational `event_type` whitelist drift detected and propagated)
- GET export added to `/api/internal/outbox-relay` for Vercel cron; GET + POST share `runRelayCycle`
- HTTP response body strips `lagSamplesMs` to preserve prior contract
- 30 new tests: `outbox-relay-log-emission.test.ts` (17) + `lag-aggregates.test.ts` (13)

**WS2_RETENTION — Cleanup RPC + cron + integration tests ✅ COMPLETE:**
- Migration `20260521142441_create_rpc_cleanup_outbox_processed.sql`:
  - `rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER` — SECURITY DEFINER, `SET search_path = ''`, EXECUTE granted to service_role only
  - CTE-based DELETE (`WITH doomed AS (... FOR UPDATE SKIP LOCKED), deleted AS (DELETE ... USING doomed ...)`)
  - `p_max_rows` validation rejects NULL / < 1 / > 1000 before row locks
  - Partial index `idx_finance_outbox_processed_retention ON public.finance_outbox (processed_at, event_id) WHERE processed_at IS NOT NULL`
- `app/api/internal/outbox-cleanup/route.ts` — GET-only with `CRON_SECRET` bearer auth + structured `outbox_cleanup_cycle` log line (ok / error / auth_fail variants); POST not exported
- `vercel.json` daily cron entry `0 7 * * *`
- 21 new tests: route unit (11) + integration (10) + advisory planner-evidence behind `RUN_PLANNER_EVIDENCE_TESTS`

**WS3_SIGNOFF — Sign-off artifact ✅ COMPLETE:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` authored with 8 sections per PRD §6.3
- GR-1 canonical phrase verbatim (3 occurrences)
- P1-RETENTION-REPLAY-BOUNDARY-GATE triple assertion satisfied (§8.2.1 boundary stated / §8.2.2 authoring-store reseed naming all 5 stores / §8.2.3 FIB-ADR amendment requirement)
- Principle 9 four-level (L1–L4) certification mapping per producer
- Three-category post-Wave-2 backlog reconciliation: §6.1 unresolved (PWB-001 / PWB-002 / W2-OBS-CASHOUT-PRODUCER-001) / §6.2 closed-in-Phase-2.4 (PWB-003 with commit `931f5ed9`) / §6.3 deferred infrastructure (fan-out / CDC / external contract)

**WS4_GOVERNANCE — Standard ratification + tracker re-sync ✅ COMPLETE (this update):**
- `PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml` status promoted `accepted_for_wave_2_5_signoff` → `ratified` with `ratified_by: WAVE-2-SIGN-OFF.md` + `ratified_date: 2026-05-21`
- `WAVE-2-TRACKER.json` cursor advanced; Phase 2.5 entry populated; Phase 2.3 commit `ba17a4d0` recorded; audit-patch applications logged
- `WAVE-2-PROGRESS-TRACKER.md` reconciled (this file)
- `actions/ROLLOUT-TRACKER.json` cursor advanced to Phase 2.5

**Audit patches applied (6):** P0-PHASE-24-EVIDENCE-GATE / P1-TEST-GATE-ORDERING / P1-LAG-SAMPLE-CLOCK-CONTRACT / P1-BACKLOG-CLAIMABILITY-DEFINITION / P1-RETENTION-REPLAY-BOUNDARY-GATE / P2-EXPLAIN-INDEX-BRITTLENESS.

**Exit gate (pending Phase 4 DoD):**
- All four workstreams above complete ✅
- Phase 1 gates PASS (type-check / schema-validation / lint / test-pass with `RUN_INTEGRATION_TESTS=true`) ✅
- Phase 2 lint gate (npm run lint -- --max-warnings=0) — pending after WS4 edits
- Devils-advocate review of `WAVE-2-SIGN-OFF.md` — no unresolved P0 findings (Phase 4 DoD gate per PRD-089 §8)
- Merge gate `npm run test:verify` (with `RUN_INTEGRATION_TESTS=true`) — pending on PR
- Pre-merge: address dev-env finding (`.env` vs `.env.local` precedence in `jest.setup.js`) — non-blocking for documentation workstreams; blocking for merge per PRD-089 §8

---

## 8. Invariant Scope per Phase

| Invariant | Scope | 2.0 | 2.1 | 2.2 | 2.3a | 2.3 | 2.4 | 2.5 |
|-----------|-------|-----|-----|-----|------|-----|-----|-----|
| I1 Atomicity | Producer-specific — re-prove per producer | ✅ exemplar | ✅ T1–T7 PASS (PRD-083) | ✅ T1-T12 PASS fill+credit | N/A (read-only surface) | inherited | inherited | inherited |
| I2 Durability | Transport baseline — inherited | ✅ proven | inherited | inherited | inherited (no relay change) | inherited | inherited | inherited |
| I3 Idempotency | Transport baseline — consumer-level re-verify | ✅ proven | inherited | inherited | inherited (no consumer write) | re-verify: consumer layer | re-verify: operational consumer | inherited |
| I4 Replayability | Transport baseline — projection-level re-verify | ✅ proven | inherited | inherited | inherited (no projection state) | re-verify: Class A projection | re-verify: operational projection | inherited |
| I5 Truthfulness | Surface enforcement (Wave 1 baseline) | ✅ proven (Wave 1) | inherited | inherited | enforced (origin_label rendered as-authored, no upgrade) | inherited | inherited | inherited |

---

## 9. Dormant Workstreams (completed through Phase 2.4)

| ID | Producer / item | Category | Status |
|----|----------|----------|--------|
| WS_PRODUCER_ADJUSTMENT | `rpc_create_financial_adjustment` | Class A (Authority Fact) | ✅ COMPLETE (Phase 2.1, RPC-certified; workflow gap → PWB-001) |
| WS_PRODUCER_FILL | `rpc_request_table_fill` | Dependency Event | ✅ COMPLETE (Phase 2.2, RPC-certified; operator UI gap → PWB-002) |
| WS_PRODUCER_CREDIT | `rpc_request_table_credit` | Dependency Event | ✅ COMPLETE (Phase 2.2, RPC-certified; operator UI gap → PWB-002) |
| PWB-003 | `GrindBuyinPanel` mounting | Layer 5 (consumer reachability) | ✅ CLOSED (Phase 2.4, PRD-088 / EXEC-088, commit `931f5ed9`) — panel mounted in `TablesPanel` via `panel-container.tsx`; `gamingDay` threaded through prop chain per DEC-EXEC-2 |

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

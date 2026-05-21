---
id: WAVE-2-SIGN-OFF
title: Wave 2 Sign-Off — Transactional Outbox Substrate & Projection Infrastructure
phase: Wave 2 Phase 2.5
status: ratified
created: 2026-05-21
signed_by: Lead Architect (WAVE-2-SIGN-OFF authoring chain)
ratified_by: PRD-089 / EXEC-089 / build-pipeline PRD-089.json checkpoint
ratified_date: 2026-05-21
authority: WAVE-2-SIGN-OFF
governs:
  - PROD-ANCHOR-STD-001 (this document ratifies)
  - finance_outbox retention boundary (7-day processed-row window)
  - post-Wave-2 backlog category boundaries (unresolved / closed / deferred)
supersedes_for_wave_2_state:
  - WAVE-2-TRACKER.json phase 2.4 status
  - WAVE-2-PROGRESS-TRACKER.md current position narrative
adrs_referenced_not_edited: [ADR-052, ADR-053, ADR-054, ADR-055, ADR-056]
prd_refs: [PRD-081, PRD-082, PRD-083, PRD-085, PRD-086, PRD-087, PRD-088, PRD-089]
exec_refs: [EXEC-081, EXEC-082, EXEC-083, EXEC-085, EXEC-086, EXEC-087, EXEC-088, EXEC-089]
predecessor: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md
parent_fib: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md
rollout_map: docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
---

# 1. Header & Summary

**Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued.**

Wave 2 closes the transactional propagation substrate (`finance_outbox`), proves five wired producers, delivers two projection consumers (Class A lifecycle completeness, operational telemetry), establishes a read-only admin observability surface, and ships per-cycle structured log emission plus a 7-day retention path for processed rows. Two workflow-level producer-coverage gaps (`adjustment.recorded` anchor resolution, fill/credit operator UI) and one Layer-1 producer absence (`cashout.recorded`) remain documented and queued as post-Wave-2 backlog. The substrate is operationally trustworthy for the certified producers and for the two projection consumers built on it; it is not the system of record, and post-retention replay-from-outbox is bounded by the 7-day window declared in §8.

This sign-off ratifies PROD-ANCHOR-STD-001 as the governing standard for `adjustment.recorded` anchor remediation, reconciles the three Wave 2 trackers against the same closure state, and records the canonical sign-off language that downstream communication must use.

---

# 2. Wave 2 Phase Summary

Each phase below corresponds to a PRD, an EXEC-SPEC, and (where merged) a commit hash. ADR-052 through ADR-056 frame the entire wave as frozen authority; this section cites them as the governing axis without amending them.

## Phase 2.0 — Exemplar Proof Slice (GAP-F1 Closure)

- **PRD:** PRD-081 — `docs/10-prd/PRD-081-transactional-outbox-gap-f1-closure-v0.md`
- **EXEC:** EXEC-081 — `docs/21-exec-spec/EXEC-081-transactional-outbox-gap-f1-exemplar.md`
- **Commit:** `8a1b8741` (2026-05-11)
- **Scope:** Establish `finance_outbox` Wave 2 DDL, `processed_messages` idempotency table, `generate_uuid_v7()`, `rpc_claim_outbox_batch` (FOR UPDATE SKIP LOCKED), `rpc_commit_consumer_receipt`, the relay route at `/api/internal/outbox-relay` with Vercel cron `* * * * *`, the `runConsumer` idempotent consumer backbone, and the I1–I4 invariant harness. Vertical collapse: only the exemplar pair (`rpc_create_financial_txn` → `buyin.recorded` for Class A; `rpc_record_grind_observation` → `grind.observed` for Class B) was wired in this phase. GAP-F1 (`finance_outbox` has zero producers) closed.

## PRD-082 — Integration Proof Runtime Gate

- **PRD:** PRD-082 — `docs/10-prd/PRD-082-wave2-integration-proof-v0.md`
- **EXEC:** EXEC-082 — `docs/21-exec-spec/EXEC-082-wave2-integration-proof.md`
- **Commit:** `b1d45302` (2026-05-12)
- **Scope:** Runtime validation gate against a real local Supabase instance, executing I1–I4 plus an I5 cashout-non-emission spot check against the exemplar pair. The harness uncovered and resolved four transport-path bugs (`ON CONFLICT DO UPDATE` denial-policy on partial-index targets in PostgreSQL 17, a missing `event_type` default in the `bridge_rated_buyin_to_telemetry` trigger, the same `DO UPDATE` denial on `rpc_create_financial_adjustment`, and a missing `finance_outbox` INSERT policy for SECURITY INVOKER callers) via migration `20260512021632`. Decision recorded: Phase 2.1 authorized. Harness teardown migration `20260517141021` applied 2026-05-17.

## Phase 2.1 — Producer Expansion A: Financial Adjustment

- **PRD:** PRD-083 — `docs/10-prd/PRD-083-wave2-phase2-1-adjustment-producer-expansion-v0.md`
- **EXEC:** EXEC-083 — `docs/21-exec-spec/EXEC-083-wave2-phase2-1-adjustment-producer.md`
- **Live certification:** PRD-084 — 20/20 PASS, see `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2-1-certification/CERTIFICATION-RESULT-083.md` (2026-05-18)
- **Migrations:** `20260517233745_wave2_adj_sig_restore.sql` (canonical 7-param ADR-040 signature restore; stale `p_casino_id` overload dropped) and `20260517234015_wave2_adj_producer_ext.sql` (`rpc_create_financial_adjustment` conditional ADR-057-eligible outbox emission, `fn_finance_outbox_emit` SECURITY DEFINER helper, Option A REVOKE INSERT hardening). Idempotency fix migration `20260518105926` applied during certification.
- **Scope:** Wire the third Class A producer atomically into `finance_outbox`. I1 atomicity proof T1–T7 PASS (`tests/failure/i1-atomicity-adjustment.test.ts`). The RPC is workflow-conditional on the anchor (ADR-057): emission occurs only when `original_txn_id` resolves at the callsite; otherwise the RPC succeeds silently with no outbox row. This conditional shape is the seed of the PWB-001 workflow gap surfaced in §6.

## Phase 2.2 — Producer Expansion B: Dependency Events (Fills + Credits)

- **PRD:** PRD-085 — `docs/10-prd/PRD-085-wave2-phase-2.2-dependency-event-producer-expansion-v0.md`
- **EXEC:** EXEC-085 — `docs/21-exec-spec/EXEC-085-wave2-phase2-2-fill-credit-producer-ext.md`
- **Migration:** `20260518134715_wave2_fill_credit_producer_ext.sql` (single migration, ADR-055 simultaneous landing)
- **Scope:** Wire `rpc_request_table_fill` and `rpc_request_table_credit` atomically with hardcoded `fact_class='operational'`, `origin_label='estimated'`, `player_id=NULL`. Same migration also upgraded `rpc_create_financial_adjustment` to SECURITY DEFINER and revoked `fn_finance_outbox_emit` EXECUTE from `authenticated`. I1 atomicity proofs T1–T12 PASS for both producers (`tests/failure/i1-atomicity-fill.test.ts`, `tests/failure/i1-atomicity-credit.test.ts`). The RPCs are correct at Layer 1; the operator-facing UI for these surfaces does not yet exist (PWB-002).

## Phase 2.3a — Operational Outbox Observability

- **PRD:** PRD-086 — `docs/10-prd/PRD-086-wave2-phase-2.3a-operational-outbox-observability-v0.md`
- **EXEC:** EXEC-086 — `docs/21-exec-spec/EXEC-086-wave2-phase-2.3a-operational-outbox-observability.md`
- **Migration:** `20260519010436` (`rpc_get_outbox_relay_health`, `rpc_get_outbox_event_page` — SECURITY DEFINER, service_role, hard-cap 100 rows)
- **Scope:** Read-only admin surface at `/admin/outbox-observability` rendering relay health (pending count, oldest pending age, retry pressure, poison-candidate heuristic, processed-count-24h) plus an event queue with the full semantic envelope (`fact_class`, `origin_label`, `event_type`, `aggregate_id`, `casino_id`, `table_id`, `player_id`, `payload`, `processed_at`, `delivery_attempts`, `last_error`). `origin_label` rendered as authored — no display-layer upgrade. Phase 2.3a was authorized to run in parallel with Phase 2.3 under the four parallelization conditions named in WAVE-2-ROLLOUT-MAP.md §2 Principle 8; all four held throughout execution.

## Phase 2.3 — First Consumer Slice: Class A Lifecycle Completeness Projection

- **PRD:** PRD-087 v1.1 — `docs/10-prd/PRD-087-wave2-phase-2.3-class-a-lifecycle-completeness-proof-v1.md`
- **EXEC:** EXEC-087 — `docs/21-exec-spec/EXEC-087-wave2-phase-2.3-lifecycle-aware-completeness-projection.md`
- **Commit:** `ba17a4d0` (2026-05-19 — Phase 2.3 closure: Class A lifecycle completeness projection)
- **Gate A migrations:** `20260519183629` (add `finance_outbox.gaming_day` nullable), `20260519183630` (`fn_finance_outbox_emit` 9-param signature), `20260519183631` (amend all five producers), `20260519183632` (authoritative backfill from PFT; fill/credit/grind fail-closed per Gate A patch), `20260519183633` (`gaming_day NOT NULL`), `20260519183634` (immutability guard extended).
- **Gate B migrations:** `20260519184706` (`visit_class_a_projection`), `20260519184707`/`20260519184709` (`gaming_day_lifecycle` + `rpc_close_gaming_day`), `20260519184708` (`rpc_process_class_a_projection`).
- **Scope:** Resolved DEC-1. Built the projection store, the lifecycle close signal, the Class A consumer (ledger-only; non-ledger rows remain `processed_at IS NULL`), and the completeness-resolution chain that propagates `'complete'` / `'partial'` / `'unknown'` through `VisitFinancialSummaryDTO` and `FinancialSectionDTO`. I3 consumer re-verification and I4 replay re-verification PASS at the Class A consumer layer.

## Phase 2.3a Observability Investigation (no PRD — investigation record)

- **Commit:** `de06ac0e` (2026-05-21 — observability investigation: producer trigger posture + anchor standard)
- **Record:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3a/CORE-OPERATIONAL-LOOP.md`
- **Scope:** Recorded the per-producer trigger-posture taxonomy (Categories A–D), the two confirmed Layer-1 gaps (`W2-OBS-ANCHOR-COVERAGE-001` for `adjustment.recorded`, `W2-OBS-CASHOUT-PRODUCER-001` for `cashout.recorded`), and authored `PROD-ANCHOR-STD-001` as the proposed governance directive for adjustment anchor resolution. This investigation is the upstream evidence for PWB-001 and PWB-002 in §6 and for the `cashout.recorded` deferral.

## Phase 2.4 — Consumer Expansion: Operational Telemetry Projection

- **PRD:** PRD-088 — `docs/10-prd/PRD-088-wave2-phase-2.4-operational-telemetry-projection-v0.md`
- **EXEC:** EXEC-088 — `docs/21-exec-spec/EXEC-088-wave2-phase-2.4-operational-telemetry-projection.md`
- **Commit:** `931f5ed9` (2026-05-21 — "feat(outbox): PRD-088 Phase 2.4 — operational telemetry projection complete")
- **Migrations:** `20260521015409` (`shift_operational_projection` table, PK `(casino_id, gaming_day, table_id)`), `20260521022656` (`rpc_claim_operational_outbox_batch` — claims `fact_class='operational' AND delivery_attempts < 5`), `20260521022703` (`rpc_process_operational_projection` — atomic `processed_at` stamp per DEC-EXEC-1; returns `'processed' | 'duplicate' | 'skipped_ledger' | 'skipped_unknown' | 'not_found'`), `20260521022708` (backlog index `finance_outbox(casino_id, fact_class, delivery_attempts, processed_at)`).
- **Scope:** Second projection consumer. Reads `grind.observed`, `fill.recorded`, `credit.recorded`. Produces shift-level operational telemetry. Authority labels enforced per ADR-054 R4 (`type` always `'estimated'`). Completeness uses a 5-step logic (`unknown` / `complete-zero` / `partial-no-lifecycle` / `partial-with-backlog` / `complete`). The `GrindBuyinPanel` component was mounted in `TablesPanel` via `panel-container.tsx`, with `gamingDay` threaded through the prop chain (DEC-EXEC-2) — closing PWB-003. 58 tests across 6 suites, 100% pass.

## Phase 2.5 — Observability + Sign-Off (this phase)

- **PRD:** PRD-089 — `docs/10-prd/PRD-089-wave2-phase-2.5-observability-and-signoff-v0.md`
- **EXEC:** EXEC-089 — `docs/21-exec-spec/EXEC-089-wave2-phase-2.5-observability-and-signoff.md`
- **Migration:** `20260521142441_create_rpc_cleanup_outbox_processed.sql` (`rpc_cleanup_outbox_processed` SECURITY DEFINER + partial index `idx_finance_outbox_processed_retention`)
- **Scope:** Three deliverables exactly: (1) structured `outbox_relay_cycle` log line per relay invocation (FR-1 authenticated variant with backlog split by fact_class and claimability plus per-cycle lag aggregates; FR-2 unauthenticated variant for auth_fail invocations) plus a paired GET export of the relay route for Vercel cron; (2) `rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER` with CTE-based DELETE, `FOR UPDATE SKIP LOCKED`, `p_max_rows` validation, the supporting partial index, plus `GET /api/internal/outbox-cleanup` with `CRON_SECRET` bearer auth and a structured `outbox_cleanup_cycle` log line, plus a daily Vercel cron entry `0 7 * * *`; (3) this sign-off document, plus the ratification of PROD-ANCHOR-STD-001 and the reconciliation of three Wave 2 trackers. No new UI surface, no new producers, no new consumers.

---

# 3. I1–I4 Proof Record

The four transport invariants are scoped per WAVE-2-ROLLOUT-MAP.md §5. I1 is producer-specific and re-proven per producer. I2–I4 are transport-substrate invariants, proven once at the relay/consumer architecture level in Phase 2.0 and inherited unless the relay worker, ordering guarantee, or idempotent-consumer implementation changes materially. Consumer projection layers in Phases 2.3 and 2.4 add layer-specific re-verifications for I3 and I4 without replacing the baseline harness. I5 is the Wave 1 surface-truthfulness invariant; it is inherited and was spot-checked by PRD-082's cashout-non-emission run.

## 3.1 Per-producer I1 (Atomicity)

| Producer | Event type | Class | Phase | Unit proof | Live / integration evidence |
|---|---|---|---|---|---|
| `rpc_create_financial_txn` | `buyin.recorded` | Class A (Authority Fact) | 2.0 | 5/5 PASS — `tests/failure/i1-atomicity.test.ts` | PRD-082 integration proof (commit `b1d45302`): Class A success + F14 rollback (PFT + 0 outbox row); cross-casino rejection |
| `rpc_record_grind_observation` | `grind.observed` | Class B (Telemetry / operational) | 2.0 | included in 5/5 PASS | PRD-082 integration proof: Class B success + cross-casino rollback; `player_id=NULL` invariant |
| `rpc_create_financial_adjustment` | `adjustment.recorded` (workflow-conditional) | Class A | 2.1 | T1–T7 PASS — `tests/failure/i1-atomicity-adjustment.test.ts` | PRD-084 live certification 2026-05-18 — 20/20 PASS — `phase-2-1-certification/CERTIFICATION-RESULT-083.md` |
| `rpc_request_table_fill` | `fill.recorded` | Dependency Event | 2.2 | T1–T12 PASS — `tests/failure/i1-atomicity-fill.test.ts` (10 unit + 12 integration stubs); `IDEMPOTENCY_CONFLICT:` propagation verified in `services/table-context/__tests__/chip-custody.test.ts` |
| `rpc_request_table_credit` | `credit.recorded` | Dependency Event | 2.2 | T1–T12 PASS — `tests/failure/i1-atomicity-credit.test.ts` (10 unit + 12 integration stubs); `IDEMPOTENCY_CONFLICT:` propagation verified in `services/table-context/__tests__/chip-custody.test.ts` |

**`cashout.recorded`** is not in this table. There is no producer for `cashout.recorded`. `rpc_create_financial_txn` hardcodes `'buyin.recorded'` with no direction branch; the session-close cashout path writes only to `pit_cash_observation`. I1 is not applicable until a producer exists. This is recorded as `W2-OBS-CASHOUT-PRODUCER-001` and surfaced in §6 and §7.

## 3.2 I2 — Transport-baseline Durability

- **Status:** ✅ proven 2026-05-11 (Phase 2.0), commit `8a1b8741`.
- **Unit:** 4/4 PASS — `tests/failure/i2-durability.test.ts`.
- **Integration (PRD-082, commit `b1d45302`):** `delivery_attempts=1` post-crash; reclaim confirmed; `delivery_attempts=2` on retry; `processed_at` set after commit.
- **Inheritance:** All subsequent Wave 2 phases inherit. No relay-worker, ordering, or claim-primitive change has occurred since Phase 2.0; re-verification is not required.

## 3.3 I3 — Idempotency

- **Transport baseline:** ✅ proven 2026-05-11 (Phase 2.0). 5/5 PASS — `tests/failure/i3-idempotency.test.ts`. PRD-082 confirms: first delivery `'processed'`, duplicate delivery `'duplicate'`, 1 proof-state row total (SQL `ON CONFLICT DO NOTHING` boundary).
- **Consumer layer re-verifications:**
  - **Phase 2.3 (Class A projection consumer):** duplicate `event_id` → `'duplicate'`; projection update applied once. Test: `services/player-financial/__tests__/class-a-projection.int.test.ts`.
  - **Phase 2.4 (operational telemetry consumer):** duplicate delivery to `runOperationalConsumer` increments the `duplicate` counter, not `processed`; `rpc_process_operational_projection` returns `'duplicate'` on re-delivery. Test: `services/player-financial/__tests__/outbox-operational-consumer.test.ts`. Commit `931f5ed9`.

## 3.4 I4 — Replayability

- **Transport baseline:** ✅ proven 2026-05-11 (Phase 2.0). 5/5 PASS — `tests/failure/i4-replayability.test.ts`. PRD-082 confirms: 15-row sample, live fingerprint = replay fingerprint = `eaae205b1e02b9d8067c29766f34abde`. Determinism via `ORDER BY (table_id, event_id)` with UUIDv7 monotonic ordering.
- **Projection-layer re-verifications:**
  - **Phase 2.3 (Class A projection replay):** truncate `visit_class_a_projection` → replay Class A events → identical completeness state. Test: `services/player-financial/__tests__/class-a-projection.int.test.ts`.
  - **Phase 2.4 (operational projection replay):** truncate `shift_operational_projection` → replay operational events → identical completeness state. Test: `services/player-financial/__tests__/shift-operational-completeness.test.ts`. Commit `931f5ed9`.
- **Replay-window constraint:** Beginning with Phase 2.5, replay-from-outbox is bounded by the 7-day retention window. See §8 for the explicit boundary statement and the authoring-store reseed escape hatch.

## 3.5 I5 — Truthfulness (Wave 1 inheritance)

- **Status:** ✅ proven Wave 1 Phase 1.4 (EXEC-078, 2026-05-05); inherited by Wave 2.
- **Wave 2 spot-check:** PRD-082 confirmed I5 cashout-non-emission — cashout (`direction='out'`, `source='cage'`) on `rpc_create_financial_txn` creates a PFT row and zero `finance_outbox` rows. This is the substrate-side confirmation that the absent `cashout.recorded` producer behaves silently rather than emitting a malformed event.
- **Re-verify trigger:** surface rendering contract change or new financial surface added. None occurred in Wave 2.

---

# 4. DEC-1 Resolution Record

## 4.1 What DEC-1 was

DEC-1 was the residual unresolved decision recorded in EXEC-080 (Pre-Wave-2 Surface Debt Closure, commit `20df161b`, 2026-05-06). After Wave 1 wrapped every visit-level financial aggregate in `FinancialValue`, those aggregates emitted `completeness.status: 'unknown'` unconditionally. The underlying `mtl_gaming_day_summary` view and `player_financial_transaction` aggregates had no gaming-day lifecycle column from which `'complete'` or `'partial'` could be derived. The label envelope was correct; the completeness signal was inert. Affected routes were:

- `GET /api/v1/visits/{visitId}/financial-summary`
- `GET /api/v1/rating-slips/{id}/modal-data` (financial section)

EXEC-080's stated Wave-2 action was: "design lifecycle-aware completeness projection as part of Wave 2 dual-layer + outbox work."

## 4.2 How DEC-1 was resolved

Phase 2.3 (PRD-087 v1.1, EXEC-087, commit `ba17a4d0`, 2026-05-19) resolved DEC-1 through Gate A + Gate B:

- **Gate A** added `finance_outbox.gaming_day` (nullable → backfilled → `NOT NULL` → immutability-guarded) and amended all five producers to emit `gaming_day` in the same transaction as the outbox row. This made the outbox row carry a gaming-day stamp the consumer could trust.
- **Gate B** introduced the `visit_class_a_projection` store, the `gaming_day_lifecycle` table with `rpc_close_gaming_day`, and the `rpc_process_class_a_projection` consumer (ledger-only — non-ledger rows remain `processed_at IS NULL`). Completeness resolution was added to `services/player-financial/crud.ts` via `getVisitClassACompleteness()` and propagated through `VisitFinancialSummaryDTO` and `FinancialSectionDTO` via the existing mapper chain. The result: `'complete'` is emitted when the gaming day is closed and the Class A projection backlog is empty; `'partial'` is emitted when the gaming day is open or the projection backlog is non-empty; `'unknown'` is reserved for the case where no projection data exists for the visit.

I3 (consumer idempotency) and I4 (projection replay) were re-verified at the Class A consumer layer. Wave 1's surface rendering contract was not broken — `type`, `source`, and `completeness` continue to render as before.

## 4.3 Affected DTOs and routes (post-resolution)

| DTO | Field group | Pre-resolution | Post-resolution |
|---|---|---|---|
| `VisitFinancialSummaryDTO` | `total_in` / `total_out` / `net_amount` | `'unknown'` always | `'complete' \| 'partial' \| 'unknown'` per Class A projection state + gaming-day lifecycle |
| `FinancialSectionDTO` | `totalCashIn` / `totalCashOut` / `netPosition` | `'unknown'` always | Same resolution as above (BFF RPC + mapper chain) |

Routes affected: `GET /api/v1/visits/{visitId}/financial-summary` and `GET /api/v1/rating-slips/{id}/modal-data` (financial section).

## 4.4 Remaining caveat

Visits whose aggregates draw from both Class A and operational sources (mixed-class surfaces) continue to emit `'partial'` until table-scoped operational backlog drains and the gaming day closes. This is by design (ADR-054 R4 authority degradation) — a mixed-class surface cannot honestly emit `'complete'` until both projection backlogs are empty under a closed gaming day. The 5-step completeness logic added in Phase 2.4 (`getShiftOperationalCompleteness`) and the Class A resolver from Phase 2.3 (`getVisitClassACompleteness`) compose correctly without authority conflation. No surface emits `'actual'` for an operational aggregate at any layer.

---

# 5. PROD-ANCHOR-STD-001 Ratification

`PROD-ANCHOR-STD-001` (`docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml`) is **ratified** by this sign-off, effective 2026-05-21. It transitions from `status: accepted_for_wave_2_5_signoff` to `status: ratified`, with `ratified_by: WAVE-2-SIGN-OFF.md` and `ratified_date: 2026-05-21`. The companion file edit lives in WS4 (`docs/21-exec-spec/EXEC-089` §WS4_GOVERNANCE outputs).

**What the standard governs going forward**

PROD-ANCHOR-STD-001 is the governing artifact for `adjustment.recorded` producer remediation (PWB-001). Specifically:

- The anchor hierarchy (`visit_id` / `rating_slip_id` / `pft_id` / `mtl_entry_id` / `mtl_entry.idempotency_key`) is the canonical lookup chain for resolving `original_txn_id` before the producer RPC is called.
- UI surfaces may request an adjustment; only a service or BFF boundary may resolve the ledger fact being corrected. The "current direct-browser-RPC pattern" called out in the standard's `recommended_architecture_adjustment` is the antipattern PWB-001 must remove.
- The `mtl_source_pft_guard` regex (`^fin:[0-9a-fA-F-]{36}$`) is the only sanctioned mechanism for deriving `source_pft_id` from an MTL idempotency key.
- The ambiguity rule (`eligible_pft_count` surfaced to BFF/service) is required when more than one eligible PFT exists; silent "latest" selection is forbidden unless explicitly declared as pilot behavior.

**Authority scope**

PROD-ANCHOR-STD-001 governs adjustment-producing workflows, DTO/BFF/API boundaries that carry or resolve producer anchors, and outbox producer certification for linked financial corrections. It does not redefine visit, rating_slip, or MTL semantics, does not change ADR-057 eligibility criteria, and does not amend any ADR-052 through ADR-056 frozen rule.

**Why ratify now**

The standard was authored after PRD-086 / EXEC-086 (Phase 2.3a) made the `adjustment.recorded` Layer-1 gap visible at the admin observability surface. Ratifying it concurrently with Wave 2 sign-off locks in the governing rule for PWB-001 before any post-Wave-2 implementation work begins. PWB-001 cannot enter implementation against a "proposed" standard — sign-off ratification is the gate.

**Future amendment path**

PROD-ANCHOR-STD-001 amendments require a superseding directive that cites this sign-off. The standard is not patched silently. If PWB-001 implementation reveals a flaw, the resolution is a new directive — not a backdoor edit to the YAML.

---

# 6. Post-Wave-2 Backlog Reconciliation

The three categories below come directly from `WAVE-2-ROLLOUT-MAP.md` §10 and are reproduced here with PRD-088 closure state applied. The categorisation is **load-bearing** — a closed item must not read as unresolved, and an unresolved item must not be elided. Each table is its own category; there is no undifferentiated all-in-one backlog.

## 6.1 Unresolved post-Wave-2 backlog

These items are gaps in real-workflow producer coverage that Wave 2 does not close. Each requires its own PRD before code may be written, and each is excluded from the Wave 2 transport / projection completion claim.

| ID | Item | Source / evidence | Governing artifact | Path forward |
|---|---|---|---|---|
| **PWB-001** | `adjustment.recorded` workflow anchor — the rating-slip modal and the MTL compliance dashboard both call `services/player-financial/http.ts:createFinancialAdjustment` directly from the browser without passing `original_txn_id`. The ADR-057 eligibility gate silently skips emission; the RPC accepts a null `original_txn_id` without error and writes the PFT row only. No outbox row results. | `W2-OBS-ANCHOR-COVERAGE-001`; LAYER-1-FAILURE narrative in `wave-2/phase-2.3a/CORE-OPERATIONAL-LOOP.md` Category D | **PROD-ANCHOR-STD-001** (ratified by this sign-off, §5) | Author a PWB-001 PRD that moves adjustment creation behind a server/API/service boundary (matching the existing `POST /api/v1/financial-transactions` buy-in pattern), enforces the anchor hierarchy at that boundary, and updates both UI surfaces accordingly. Implementation gated on Wave 2 sign-off and ratified standard. |
| **PWB-002** | Fill / credit operator UI — `rpc_request_table_fill` and `rpc_request_table_credit` are correctly wired at Layer 1 (Phase 2.2), but no operator-facing surface exists. The existing routes (`POST /api/v1/table-context/fills`, `/credits`) are hardware-integration endpoints. Real operator workflows produce no `fill.recorded` / `credit.recorded` rows; the operational projection shows them as permanent gaps. | `CORE-OPERATIONAL-LOOP.md` Category A (Greenfield backend-only) | Phase 2.5 sign-off (this document) names the gap; remediation governance is a new feature PRD | Author a PWB-002 feature pipeline (FIB → PRD → EXEC) for the operator UI surface. Scope is "hardware integration UI" — separate from the rest of Wave 3 thinking. |
| **W2-OBS-CASHOUT-PRODUCER-001** | `cashout.recorded` Layer-1 producer absence — `rpc_create_financial_txn` hardcodes `'buyin.recorded'` with no direction branch. The session-close cashout path writes only to `pit_cash_observation`. The projection consumer has a reserved slot but no events arrive. Originally cataloged in WAVE-2-ROLLOUT-MAP.md as part of the exemplar pair; never implemented. | `CORE-OPERATIONAL-LOOP.md` Category D; substrate-side confirmation in PRD-082 I5 cashout-non-emission run | Phase 2.5 sign-off (this document) | Author a PRD that adds a `CASE WHEN v_row.direction = 'out' THEN 'cashout.recorded'` branch in `rpc_create_financial_txn` (or an equivalent direction-aware emission point) and confirms the rating-slip cashout callsite passes `rating_slip_id`. Implementation may follow PRD-088 operational consumer wiring patterns; no new consumer required. |

## 6.2 Closed in Phase 2.4 (PRD-088)

These items appeared in earlier rollout-map iterations of §10 but **closed before Wave 2 sign-off**. They are listed here as **evidence of closure**, not as open backlog.

| ID | Item | Closure evidence | Notes |
|---|---|---|---|
| **PWB-003** | `GrindBuyinPanel` mounting — component and hook existed since Phase 2.0 but the panel was not mounted in any operator-facing page; `grind.observed` rows could not be produced by real operator workflows. | **PRD-088 / EXEC-088, commit `931f5ed9`, 2026-05-21.** `GrindBuyinPanel` mounted in `TablesPanel` via `panel-container.tsx`; `gamingDay` threaded `PanelContainer → TablesPanel → GrindBuyinPanel` per DEC-EXEC-2. PWB-003 closed and removed from the active backlog. | Wave 2 sign-off records PWB-003 as **CLOSED**, not unresolved. `WAVE-2-TRACKER.json` phase 2.4 `pwb_003_closed.status: "CLOSED"` is the machine-readable companion record. |

## 6.3 Deferred infrastructure upgrades

These were never in Wave 2 scope; they are recorded here as named non-goals so post-Wave-2 work cannot pull them in by assumption. Each requires its own ADR and (if it touches the propagation substrate) a FIB amendment before scope reopens.

| Item | Why deferred | Scope-reopen path |
|---|---|---|
| Multi-consumer fan-out | Wave 2 assumes a single internal consumer path. The `processed_messages` schema has no `consumer_id` column; introducing one is a schema-evolution event with replay-state-rebuild implications. | New ADR + FIB amendment; `processed_messages` schema redesign. |
| CDC / WAL relay (Debezium, `pg_logical`, WAL streaming) | Post-pilot scale upgrade. The polling relay is the Wave 2 mechanism by design. Adopting CDC requires production-grade WAL configuration and reconnect-handling not present in the pilot runtime topology. | New ADR; Vercel-runtime compatibility analysis. |
| External consumer contract / public event bus | Q3 explicitly deferred at FIB-H §G. The outbox is internal PT-2 infrastructure; no third-party event semantics are sanctioned. | New ADR + stakeholder discovery before any external consumer contract is defined. |

---

# 7. Sign-Off Language & Per-Producer Certification

## 7.1 Canonical sign-off phrase

> **Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued.**

This phrase is the only sanctioned summary of Wave 2 closure. The bare phrase "Wave 2 complete" is not permitted in any downstream artifact unless qualified by the workflow-coverage-gap clause above. The qualifier is what makes the sign-off honest: transport substrate and projection consumers are operationally trustworthy; two workflow-level gaps and one producer absence are explicitly carried forward. Sign-off does not assert "every event flows from every workflow."

## 7.2 Principle 9 — four-level certification distinction

Per WAVE-2-ROLLOUT-MAP.md §2 Principle 9 and §8 note, producer coverage is reported on four distinct levels. The levels are not collapsible — a producer at Level 2 (RPC capable) is not certified at Level 3 (workflow coverage) unless an operator-reachable surface actually triggers it. The table below maps each Wave 2 producer to its certification level.

| Level | Meaning |
|---|---|
| **L1 — Transport complete** | Substrate (DDL, relay, idempotent consumer, claim primitives) certified. Inherited; identical for all producers. |
| **L2 — RPC producer coverage** | The producer RPC atomically emits a correctly-shaped `finance_outbox` row when invoked. I1 atomicity proven. |
| **L3 — Workflow-level producer coverage** | A real operator workflow reaches the producer RPC with the required anchor / context. End-to-end emission proven. |
| **L4 — Known unresolved workflow gap** | Producer cannot reach L3 under current wiring; gap is formally recorded and queued. |

| Producer | Event type | L1 | L2 | L3 | L4 (gap reference) | Certified at |
|---|---|---|---|---|---|---|
| `rpc_create_financial_txn` (buy-in branch) | `buyin.recorded` | ✅ | ✅ I1 5/5 PASS (Phase 2.0) | ✅ standard operator workflow via rating-slip modal | — | **L3 — workflow-certified** |
| `rpc_create_financial_txn` (cashout branch) | `cashout.recorded` | ✅ | ❌ producer branch does not exist | ❌ | **W2-OBS-CASHOUT-PRODUCER-001** | **L4 — RPC absent** |
| `rpc_create_financial_adjustment` | `adjustment.recorded` | ✅ | ✅ I1 T1–T7 + PRD-084 live cert 20/20 PASS | ❌ rating-slip modal and MTL compliance dashboard call without `original_txn_id`; ADR-057 gate skips emission | **PWB-001 / PROD-ANCHOR-STD-001** | **L2 — RPC-certified, workflow gap** |
| `rpc_record_grind_observation` | `grind.observed` | ✅ | ✅ I1 (Phase 2.0 5/5 PASS, included) | ✅ Phase 2.4 — `GrindBuyinPanel` mounted in `TablesPanel`; operator can produce rows from real workflow | — | **L3 — workflow-certified** |
| `rpc_request_table_fill` | `fill.recorded` | ✅ | ✅ I1 T1–T12 PASS | ❌ no operator-facing UI; only hardware-integration POST endpoint | **PWB-002** | **L2 — RPC/API-certified, operator UI gap** |
| `rpc_request_table_credit` | `credit.recorded` | ✅ | ✅ I1 T1–T12 PASS | ❌ no operator-facing UI; only hardware-integration POST endpoint | **PWB-002** | **L2 — RPC/API-certified, operator UI gap** |

**Reading guide for downstream artifacts:**

- A producer reported at L3 may be cited as "workflow-certified."
- A producer at L2 must be cited as "RPC-certified" with the explicit gap reference; it must not be referred to as "workflow-certified" or "Wave 2 complete for this producer."
- A producer at L4 (RPC absent) must be cited as such; it must not be referred to as wired or pending wiring without naming `W2-OBS-CASHOUT-PRODUCER-001`.

## 7.3 Aggregate Wave 2 certification statement

The substrate (relay, consumer backbone, processed-messages idempotency, claim primitives, observability surface, retention path) is **L1 transport-complete**. Five producers are **L2 RPC-certified**. Two producers are **L3 workflow-certified** (`buyin.recorded`, `grind.observed`). Three workflow-level gaps remain at **L4** (one of them is a producer absence at L2, not just a workflow gap): PWB-001, PWB-002, and W2-OBS-CASHOUT-PRODUCER-001.

The two projection consumers built on the substrate (Class A lifecycle completeness in Phase 2.3, operational telemetry in Phase 2.4) are operationally live: I3 idempotency and I4 replayability are re-verified at the consumer layer; ADR-054 R4 authority degradation is enforced (`type: 'estimated'` on all operational projection values).

---

# 8. Hand-off to Post-Wave-2 Backlog

## 8.1 Queued post-Wave-2 work

The following items are queued. Each requires its own PRD before code may begin, per WAVE-2-ROLLOUT-MAP.md §2 Principle 5 (gates are pass/fail) and §8 §note on Principle 9. No item below is authorized for implementation by this sign-off alone.

| Item | Owner-level authority | Gating PRD path |
|---|---|---|
| **PWB-001** — `adjustment.recorded` workflow anchor remediation | PROD-ANCHOR-STD-001 (ratified §5) | PWB-001 PRD: move adjustment creation behind server/API/service boundary; enforce anchor hierarchy; update rating-slip modal and MTL compliance dashboard callsites; producer-certification re-run on closure |
| **PWB-002** — Fill / credit operator UI | Phase 2.5 sign-off (this document) | PWB-002 PRD: operator-facing surface for `rpc_request_table_fill` / `rpc_request_table_credit`; integrates with the existing `/api/v1/table-context/fills` and `/credits` routes; producer-certification re-run on closure |
| **W2-OBS-CASHOUT-PRODUCER-001** — `cashout.recorded` Layer-1 producer | Phase 2.5 sign-off (this document) | Direction-aware producer PRD for `rpc_create_financial_txn`; producer-certification on closure; operational projection then begins reflecting cashout volumes |

## 8.2 Retention replay-boundary (P1-RETENTION-REPLAY-BOUNDARY-GATE)

The 7-day retention path delivered in Phase 2.5 (WS2 — migration `20260521142441_create_rpc_cleanup_outbox_processed.sql`, daily Vercel cron at `0 7 * * *`, partial index `idx_finance_outbox_processed_retention`) bounds the system's outbox-history horizon. This subsection records the three explicit assertions required by the audit-patch acceptance gate.

### 8.2.1 Boundary stated

> **Replay from `finance_outbox` is bounded to the retained 7-day processed-row window; rows older than this window are unrecoverable from outbox history and require authoring-store reseed.**

Operationally: the cleanup RPC deletes rows whose `processed_at IS NOT NULL AND processed_at < now() - INTERVAL '7 days'`. Rows with `processed_at IS NULL` (including dead-letter rows with `delivery_attempts >= 5`) are preserved indefinitely by predicate, regardless of age. The 7-day window therefore applies only to **successfully processed** outbox history.

### 8.2.2 Authoring-store reseed escape hatch

The system of record for any financial fact lives in its authoring store, not in `finance_outbox`. The outbox is propagation infrastructure — it carries an event from authoring boundary to projection consumer; it is not a replay log of authoritative state. When historical replay beyond the 7-day window is required, reconstruction must proceed from the authoring stores below:

- `player_financial_transaction` (PFT) — Class A buy-in / cashout / adjustment authority
- `pit_cash_observation` — cash-handling authority (cashout source path)
- `table_buyin_telemetry` — Class B grind authority
- `table_fills` — Dependency Event authority (fill rows)
- `table_credits` — Dependency Event authority (credit rows)

`finance_outbox` is propagation infrastructure, **not a replay log**. The authoring stores listed above are the systems of record. Wave-1 Phase 1.4 I5 truthfulness invariant continues to hold at the surface layer; this section names its substrate-layer consequence.

### 8.2.3 FIB / ADR amendment requirement

Any post-Wave-2 work requiring **unbounded** outbox-history replay — for example, audit-driven replay from an arbitrary historical point, regulator-requested reconstruction over months or years, or any operational pattern that assumes processed rows persist beyond 7 days — requires a new FIB or a superseding ADR before scope reopens. Such work **cannot be assumed by Wave 2 sign-off** and cannot be authored on the implicit expectation that `finance_outbox` rows are durable indefinitely.

If a future Wave introduces a longer retention window, an archive table, a CDC / WAL relay (currently a §6.3 deferred infrastructure upgrade), or any mechanism that broadens the replay horizon, the gating authority is a new FIB-H plus a superseding ADR that explicitly amends this section. Until that work lands, the 7-day boundary stated in §8.2.1 is the operational truth.

## 8.3 Wave 2 closure statement

**Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued.** The substrate is operationally certified. The two projection consumers (Class A lifecycle completeness; operational telemetry) are live with consumer-layer I3 / I4 re-verifications passing. The three workflow-coverage gaps (PWB-001, PWB-002, W2-OBS-CASHOUT-PRODUCER-001) are explicitly queued per §6.1 with named governance paths. PROD-ANCHOR-STD-001 is ratified per §5. The 7-day replay boundary is named per §8.2. ADR-052 through ADR-056 remain frozen authority.

Post-Wave-2 work begins after this sign-off ratifies and the trackers (`WAVE-2-TRACKER.json`, `WAVE-2-PROGRESS-TRACKER.md`, `actions/ROLLOUT-TRACKER.json`) reconcile to it (WS4 of PRD-089 / EXEC-089).

— Lead Architect (Wave 2 sign-off, 2026-05-21)

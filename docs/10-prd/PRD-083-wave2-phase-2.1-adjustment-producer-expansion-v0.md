---
id: PRD-083
title: Wave 2 Phase 2.1 — Financial Adjustment Producer Expansion
owner: Lead Architect
status: Draft
affects: [PRD-081, PRD-082, ADR-052, ADR-054, ADR-055, ADR-057, FIB-H-W2-OUTBOX-001]
created: 2026-05-17
last_review: 2026-05-17
phase: Phase 2.1 (Wave 2 Financial Data Distribution)
http_boundary: false
---

# PRD-083 — Wave 2 Phase 2.1 — Financial Adjustment Producer Expansion

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Parent FIB:** FIB-H-W2-OUTBOX-001 (containment loop STEP-1 / STEP-2, CAP-1)
- **Wave 2 authorization:** PRD-082 signoff (2026-05-12, commit `b1d45302`) — Phase 2.1 authorized
- **Summary:** This PRD extends `rpc_create_financial_adjustment` to emit a `finance_outbox` row atomically for **ADR-057-eligible linked adjustments** only: adjustments whose `p_original_txn_id` resolves to an original PFT that recomputes as Wave-2-eligible and whose inherited `rating_slip_id` resolves to a same-casino `rating_slip.table_id`. Unlinked adjustments and adjustments linked to excluded originals remain valid PFT rows and emit no Wave 2 outbox row. The transport infrastructure (DDL, relay worker, idempotent consumer, I1–I4 harness) is already in place from Phase 2.0. Bug-3 (`ON CONFLICT DO UPDATE` denial under PostgreSQL 17) was already patched in migration `20260512021632`, but the Phase 2.1 migration must also restore the ADR-040/PRD-044 no-`p_casino_id` RPC signature before adding outbox logic. The PRD-082 integration harness teardown migration `20260517141021_remove_prd082_harness_receipt_proof_state.sql` is authored and must be applied before any Phase 2.1 artifact merges. No relay, consumer, table-envelope shape, or DTO shape changes are in scope.

---

## 2. Problem & Goals

### Problem Statement

`rpc_create_financial_adjustment` is the only remaining ADR-057-eligible Class A (Authority Fact) authoring path that does not emit to `finance_outbox`. Eligible linked adjustments are invisible to the outbox relay today, meaning downstream projection consumers — once built in Phase 2.3 — cannot see those table-scoped adjustment events. Unlinked adjustments and linked adjustments to excluded originals are intentionally outside Wave 2 outbox scope because they have no deterministic table anchor. Closing the eligible linked-adjustment gap now keeps the table-scoped producer surface complete before any consumer infrastructure is built on top of it.

### Goals

1. `rpc_create_financial_adjustment` emits one `finance_outbox` row atomically within the same PostgreSQL RPC transaction boundary as the `player_financial_transaction` insert for each ADR-057-eligible linked adjustment — I1 atomicity proven for this producer path.
2. `adjustment.recorded` is verified in the canonical Wave 2 event catalog before the producer migration ships.
3. Excluded adjustments remain valid PFT rows and emit no `finance_outbox` row.
4. No TypeScript-layer adjustment producer insert path exists for `finance_outbox`, and direct authenticated `finance_outbox` writes are denied at the database boundary.
5. The PRD-082 integration harness is fully removed from the database before any Phase 2.1 artifact merges.
6. Phase 2.2 entry gate is unblocked (Phase 2.1 exit clears the way for Dependency Event wiring).

### Non-Goals

- `rpc_request_table_fill` and `rpc_request_table_credit` outbox extension — **Phase 2.2** (must ship as a simultaneous pair under ADR-055 parity).
- Any projection consumer, projection store, or lifecycle-aware completeness signal — **Phase 2.3**.
- DEC-1 resolution (`completeness.status: 'unknown'` on visit-level aggregates) — **Phase 2.3**.
- Relay worker changes — transport substrate inherited from Phase 2.0; no modifications needed.
- `FinancialOutboxEventDTO` shape changes — DTO is unchanged.
- Any operator-visible UI or API surface changes.
- `rpc_commit_consumer_receipt` behavioral changes — teardown only restores the non-harness form from Phase 2.0.

---

## 3. Users & Use Cases

### Primary User: System — Adjustment Authoring Path

Financial adjustments are authored by pit floor staff through the existing adjustment flow. The authoring RPC is the trigger; no direct operator interaction at the outbox layer.

**Jobs:**
1. Staff submits a linked financial adjustment through the existing UI flow → system calls `rpc_create_financial_adjustment` → if the original PFT recomputes as ADR-057 eligible, the adjustment row and `finance_outbox` row commit together; relay picks up the event on its next cycle.
2. Staff submits an unlinked adjustment or an adjustment linked to an excluded original → system authors the adjustment PFT row and emits no Wave 2 outbox row.
3. If an eligible adjustment RPC fails or rolls back after the PFT insert but before the outbox insert → neither the `player_financial_transaction` row nor the `finance_outbox` row exists; no partial state.

### Secondary User: Phase 2.3 Implementer

The lifecycle-aware completeness projection (Phase 2.3) consumes eligible table-scoped `buyin.recorded` and `adjustment.recorded` events from `finance_outbox`. Phase 2.3 cannot process table-scoped adjustment deltas unless this producer is wired.

**Jobs:**
1. Confirm `adjustment.recorded` is present in `finance_outbox` for eligible linked-adjustment scenarios before beginning Phase 2.3 consumer implementation.
2. Verify `fact_class = 'ledger'` and `origin_label = 'actual'` on adjustment rows — these are required for the Class A consumer branch in Phase 2.3.

---

## 4. Scope & Feature List

- [ ] PRD-082 teardown migration `20260517141021_remove_prd082_harness_receipt_proof_state.sql` is applied in every target database environment before Phase 2.1 migration merge (see §5 Functional Requirements — Pre-merge gate). File presence alone does not satisfy this gate.
- [ ] A SQL migration restores the ADR-040/PRD-044 `rpc_create_financial_adjustment` signature with no caller-supplied `p_casino_id`, matching the existing TypeScript caller and authoritative context derivation. The migration must explicitly drop/revoke stale caller-supplied casino overloads so no executable adjustment RPC accepts execution tenant identity from the client.
- [ ] A SQL migration extends `rpc_create_financial_adjustment` with a conditional `finance_outbox` INSERT inside the same RPC transaction boundary for ADR-057-eligible linked adjustments only. The INSERT uses `generate_uuid_v7()` for `event_id` and hardcodes all discriminator fields (not caller-derived).
- [ ] The `finance_outbox` row emitted by `rpc_create_financial_adjustment` carries: `event_type = 'adjustment.recorded'`, `fact_class = 'ledger'`, `origin_label = 'actual'`, `player_id NOT NULL`, `table_id NOT NULL`, `aggregate_id` = the PFT row id for the adjustment.
- [ ] Unlinked adjustments and linked adjustments to excluded originals author valid PFT rows with zero `finance_outbox` rows.
- [ ] `adjustment.recorded` is verified in the canonical Wave 2 event catalog (`docs/35-integration/INT-002-event-catalog.md`) before the producer migration ships; if stale, the entry is updated before implementation proceeds.
- [ ] A unit test proves the adjustment authoring path calls the single RPC with no TypeScript-layer adjustment outbox producer fallback path.
- [ ] `CreateFinancialAdjustmentInput` docs/types no longer present `casino_id` as required caller input for the final adjustment RPC path.
- [ ] Phase 2.1 selects **Option A — SECURITY DEFINER outbox insertion boundary**: direct authenticated `finance_outbox` INSERT is revoked, producer outbox writes run only through governed SECURITY DEFINER SQL with ADR-018 safeguards, and existing producer business semantics remain unchanged.
- [ ] A database access test proves an authenticated client cannot directly insert forged `finance_outbox` rows, including after `set_rls_context_from_staff()` context establishment; only governed producer SQL can write valid adjustment events.
- [ ] A producer idempotency guard prevents duplicate `adjustment.recorded` rows for the same adjustment aggregate, using a mandatory database uniqueness constraint on `(aggregate_id, event_type)`. The constraint includes a pre-state duplicate assertion that fails loudly before DDL is applied.
- [ ] An I1 atomicity proof test covers the eligible adjustment producer path: controlled rollback injection after PFT insert and before outbox insert confirms both the `player_financial_transaction` row and the `finance_outbox` row are absent post-rollback; success path confirms both rows are present. Excluded adjustment tests confirm PFT row present and zero outbox rows.
- [ ] The Phase 2.1 migration asserts zero authenticated `finance_outbox` INSERT grants/policies after remediation, no stale `p_casino_id` adjustment overloads, PRD-082 teardown applied, and no duplicate `(aggregate_id, event_type)` rows before adding uniqueness.
- [ ] SRM is updated to mark `finance_outbox` as Wave 2 transport infrastructure and to allow the narrow ADR-057 FinanceService → RatingSlipService same-casino `rating_slip_id → table_id` lookup.
- [ ] No projection store, consumer branch, event bus, generic dispatcher, envelope change, or producer business-semantics rewrite is introduced in Phase 2.1.
- [ ] `npm run db:types-local` exits 0 after the extension migration.
- [ ] `npm run type-check`, `npm run lint`, `npm run build` all exit 0.

---

## 5. Requirements

### Functional Requirements

#### Pre-merge gate (PRD-082 teardown — executed in parallel)

The following must be true before any Phase 2.1 migration is merged. The teardown migration is authored as `supabase/migrations/20260517141021_remove_prd082_harness_receipt_proof_state.sql` and must be applied in every target database environment before the Phase 2.1 producer migration. File presence without applied database state is insufficient.

- `rpc_commit_consumer_receipt` is restored to its non-harness body: `processed_messages` INSERT with `ON CONFLICT DO NOTHING` duplicate guard, Wave 2 consumer side-effect placeholder comment, returns `'processed'`/`'duplicate'`. The `outbox_integration_proof_state` INSERT block is fully removed.
- `DROP TABLE IF EXISTS public.outbox_integration_proof_state` is executed.
- Harness-only grants (`GRANT SELECT, INSERT, TRUNCATE ON public.outbox_integration_proof_state TO service_role`) are revoked.
- The teardown migration is named `<timestamp>_remove_prd082_harness_receipt_proof_state.sql` and includes comments referencing `TEARDOWN-ARTIFACT-PRD-082.md`.

Authority: `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md`

#### Phase 2.1 producer extension

**FR-1 — ADR-057 eligibility-gated atomic outbox emission.** `rpc_create_financial_adjustment` must INSERT one row into `finance_outbox` within the same PostgreSQL RPC transaction boundary as the `player_financial_transaction` INSERT only when the adjustment is ADR-057 eligible. PostgreSQL function execution gives both inserts one atomic transaction scope under the caller transaction. If either insert fails for an eligible adjustment, the entire transaction rolls back with no partial state.

Eligibility is recomputed from the original PFT row, not from caller input and not from the existence of a prior outbox row:

```sql
IF p_original_txn_id IS NOT NULL
AND original_txn.casino_id = v_casino_id
AND original_txn.player_id = p_player_id
AND original_txn.visit_id = p_visit_id
AND original_txn.source = 'pit'
AND original_txn.direction = 'in'
AND original_txn.tender_type IN ('cash', 'chips')
AND original_txn.rating_slip_id IS NOT NULL
AND original_txn.rating_slip_id resolves to a same-casino rating_slip.table_id
THEN emit adjustment.recorded with table_id = rating_slip.table_id
ELSE author the adjustment PFT row and emit no Wave 2 outbox row
END IF;
```

If an inherited `rating_slip_id` is present but does not resolve to a same-casino rating slip, the RPC must reject the financial write and emit no outbox row.

**FR-2 — Discriminator fields hardcoded.** The outbox row must set the following values unconditionally, not derived from caller input:
- `event_type = 'adjustment.recorded'`
- `fact_class = 'ledger'`
- `origin_label = 'actual'`

**FR-3 — Mandatory envelope fields.** Every emitted adjustment outbox row must carry:
- `event_id = generate_uuid_v7()` — generated at insert time, not inherited from the PFT row
- `player_id NOT NULL` — full attribution is required for Class A; a NULL `player_id` on an adjustment outbox row is a violation
- `table_id NOT NULL` — table-first anchoring (ADR-052 R1)
- `aggregate_id` — the PFT row id for this adjustment
- `casino_id` — derived from the existing adjustment authoring context

**FR-4 — No TypeScript producer fallback path or direct authenticated write path.** No application code, service layer, or route handler may insert into `finance_outbox` on behalf of the adjustment producer path. Legitimate relay lifecycle reads/updates remain in scope for the existing relay worker, but TypeScript must not author adjustment outbox rows. Authenticated clients must not be able to directly `INSERT` forged `finance_outbox` rows through the table API, including same-casino `adjustment.recorded`, same-casino `buyin.recorded`, and arbitrary payload attempts after context establishment. The only write path for adjustment outbox rows is the governed SQL producer boundary.

Phase 2.1 selects **Option A — SECURITY DEFINER outbox insertion boundary**:
- Revoke direct authenticated `finance_outbox` INSERT and remove authenticated INSERT policies.
- Run outbox table writes through governed SECURITY DEFINER SQL with ADR-018 safeguards (`SET search_path = ''`, explicit grants, no caller-supplied tenant identity, and minimal body scope).
- Preserve existing public producer RPC business semantics and caller contracts; the SECURITY DEFINER boundary may be a narrow helper invoked from SECURITY INVOKER producer RPCs after authoritative context derivation.

The selected design must preserve existing `rpc_create_financial_txn` and `rpc_record_grind_observation` producer success while denying direct table API forgery. SECURITY INVOKER marker/GUC designs are explicitly out of scope for Phase 2.1 unless a later ADR proves the marker is unforgeable by authenticated SQL clients.

**FR-5 — Event catalog verification.** `adjustment.recorded` must be present in the canonical Wave 2 event catalog (`docs/35-integration/INT-002-event-catalog.md`) with its `fact_class`, `origin_label`, producer RPC, and ADR-057 eligibility rule before the producer migration is applied. `WAVE-2-ROLLOUT-MAP.md §4` is a phase tracker, not the catalog source of truth.

**FR-6 — No table-envelope or transport shape changes.** `finance_outbox` envelope columns, `processed_messages` columns, relay worker, `rpc_claim_outbox_batch`, and `rpc_commit_consumer_receipt` (post-teardown) are unchanged. RLS/grant hardening and a duplicate-prevention uniqueness constraint are in scope to enforce this PRD's security and idempotency invariants, but the remediation must not change the outbox envelope, event catalog, relay/consumer contracts, or producer business semantics beyond provenance enforcement.

**FR-7 — RPC signature and RLS posture.** The adjustment RPC is SECURITY INVOKER (ADR-040), matching `rpc_create_financial_txn`, and must derive casino context via `set_rls_context_from_staff()` rather than accepting caller-supplied `p_casino_id`. Phase 2.1 must reconcile migration `20260512021632` with the ADR-040/PRD-044 signature by removing the required `p_casino_id` parameter from the final function shape. Phase 2.1 must also prove direct authenticated `finance_outbox` table writes are denied while valid adjustment producer writes and existing exemplar producer writes still succeed.

**FR-8 — Stale overload removal.** Phase 2.1 must explicitly remove or make non-executable every stale `rpc_create_financial_adjustment` overload that accepts caller-supplied `p_casino_id`. The migration must include exact `DROP FUNCTION IF EXISTS` statements for every known stale signature, including the legacy eight-argument shape and any other overload where the first argument is execution `casino_id`. Acceptance requires a catalog/introspection assertion proving no executable overload contains `p_casino_id` or the legacy eight-argument shape.

**FR-9 — Producer idempotency.** Retrying `rpc_create_financial_adjustment` with the same `(casino_id, idempotency_key)` must not create a second `adjustment.recorded` row. The implementation must enforce at most one outbox row per logical aggregate and event type with a mandatory database uniqueness invariant on `(aggregate_id, event_type)`. Before adding the uniqueness constraint, the migration must assert no existing duplicate `(aggregate_id, event_type)` rows exist and abort with a clear message if duplicates are found.

**FR-10 — Payload contract.** `adjustment.recorded` payload must preserve the Class A exemplar's `amount` numeric field for consumer parity with `buyin.recorded`. `amount` is the signed PFT `amount` value. If implementation also includes `amount_cents`, it must be additive and documented with an explicit conversion rule from PFT `amount`; consumers must not be forced to infer units from event type. Payload must include:
- `amount` — signed numeric adjustment delta from PFT `amount`
- `pft_direction` — literal PFT `direction` value, currently `'in'`
- `delta_direction` — semantic direction derived from `amount` sign: `'increase'` for positive deltas and `'decrease'` for negative deltas
- `reason_code` — adjustment reason code

`note` may be omitted or redacted if sensitive.

**FR-11 — Migration pre-state and post-state gates.** The Phase 2.1 migration must fail loudly before mutating producer code unless all pre-state gates pass: PRD-082 teardown has been applied, no duplicate `(aggregate_id, event_type)` rows exist, and stale `p_casino_id` overloads are either absent or explicitly dropped in the same migration. The migration must also assert post-state invariants before commit: zero authenticated `finance_outbox` INSERT grants/policies, no executable `rpc_create_financial_adjustment` overload with caller-supplied `p_casino_id`, and a unique database invariant on `(aggregate_id, event_type)`.

### Non-Functional Requirements

**NFR-1 — I1 atomicity re-proven.** The exemplar pair certification (Phase 2.0) does not extend to the adjustment path. A dedicated I1 atomicity proof test for eligible `rpc_create_financial_adjustment` calls is a required deliverable. Minimum: controlled failure injection after PFT insert but before outbox insert confirms zero rows in both tables post-rollback; eligible success path confirms one row in each; excluded success paths confirm one PFT row and zero outbox rows. If a GUC-based injection flag is used, it must be namespaced for tests, default off, unavailable to ordinary authenticated clients, and covered by a production-safety assertion.

**NFR-2 — No performance regression.** The outbox INSERT adds one additional row write per eligible linked adjustment. No batching, background job, or asynchronous path is introduced. Performance impact is equivalent to the exemplar pattern for rows that enter the outbox.

**NFR-3 — Type-check and lint clean.** `npm run type-check` and `npm run lint` must exit 0. No `as any`, no `console.*` in production code paths.

---

## 6. UX / Flow Overview

This PRD introduces no operator-visible surface changes. The internal flow post-Phase 2.1:

1. Staff records a financial adjustment through the existing UI → adjustment route handler calls `rpc_create_financial_adjustment`.
2. `rpc_create_financial_adjustment` executes within one PostgreSQL RPC transaction boundary → inserts `player_financial_transaction` row (adjustment) → recomputes ADR-057 eligibility from the linked original PFT → if eligible, inserts `finance_outbox` row with `event_type = 'adjustment.recorded'` through the governed SQL producer boundary → commits atomically with the caller transaction.
3. Relay worker (`POST /api/internal/outbox-relay`) polls `finance_outbox WHERE processed_at IS NULL` on its cron schedule → claims eligible adjustment rows → delivers them to `runConsumer`.
4. `runConsumer` calls `rpc_commit_consumer_receipt` → `processed_messages` INSERT confirms new event → returns `'processed'`. (Wave 2 consumer side effect remains a placeholder until Phase 2.3.)
5. Relay marks the outbox row `processed_at = NOW()`.

Operator-observable effect: none at Phase 2.1. The completeness signal on visit-level financial surfaces remains `'unknown'` until Phase 2.3 builds the projection consumer.

---

## 7. Dependencies & Risks

### Prerequisites

| Prerequisite | Status | Notes |
|---|---|---|
| Phase 2.0 complete (PRD-081) | ✅ DONE | `finance_outbox` DDL, relay, consumer, I1–I4 harness — all live. Commit `8a1b8741`. |
| PRD-082 integration proof signoff | ✅ DONE | Phase 2.1 authorized. Commit `b1d45302`. |
| Bug-3 fix (`rpc_create_financial_adjustment` ON CONFLICT DO NOTHING) | ✅ DONE + REMEDIATION REQUIRED | Migration `20260512021632` fixed `DO NOTHING` but restored a required `p_casino_id` parameter. Phase 2.1 must restore the ADR-040/PRD-044 no-`p_casino_id` signature before merge. |
| Bug-4 fix (finance_outbox INSERT policy for authenticated role) | ⚠️ REMEDIATION REQUIRED | Migration `20260512021632` added authenticated INSERT. Phase 2.1 must prove direct authenticated outbox writes are denied while producer writes still succeed. |
| PRD-082 harness teardown migration | ✅ AUTHORED / ⚠️ APPLY PENDING | `20260517141021_remove_prd082_harness_receipt_proof_state.sql` exists. Must be applied before Phase 2.1 merge. Authority: `TEARDOWN-ARTIFACT-PRD-082.md`. |
| Event catalog entry | ✅ PRESENT / VERIFY | `docs/35-integration/INT-002-event-catalog.md` already lists `adjustment.recorded`; Phase 2.1 must verify it matches the final payload and ADR-057 eligibility rule before migration merge. |

### Risks

**R-1 — Teardown merge sequencing.** The teardown migration and the Phase 2.1 extension migration must be applied in order: teardown first, extension second. If the extension is merged before teardown, `rpc_commit_consumer_receipt` still carries the harness proof-state write — a standing runtime artifact that must not exist post-Phase 2.1. Mitigation: enforce merge order at PR review; confirm teardown migration is present in `supabase/migrations/` before Phase 2.1 extension PR is approved.

**R-2 — I1 proof scope confusion.** There is a documented risk of assuming the Phase 2.0 exemplar I1 proof certifies the adjustment path. It does not. Each new producer must ship with its own I1 atomicity proof test (`WAVE-2-TRACKER.json governance_rules.i1_scope`). Mitigation: I1 atomicity proof test for adjustment path is a required exit gate item.

**R-3 — TypeScript fallback path introduction.** Developers extending adjustment-related TypeScript service code may be tempted to add a `finance_outbox` insert in the service layer as a "safety net." This would create a dual write path, violating FR-4 and ADR-054 D6 (no trigger or fallback writes to the outbox from TypeScript). Mitigation: unit test explicitly asserts the single-RPC path; no TS outbox write exists post-Phase 2.1.

**R-4 — ADR-057 scope violation.** Treating all adjustments as outbox-eligible would either fail on `finance_outbox.table_id NOT NULL` or fabricate an anchor for standalone/cage-linked adjustments. Mitigation: encode ADR-057 eligibility in the RPC and test excluded adjustment classes.

**R-5 — Direct authenticated outbox insertion.** If authenticated clients can insert into `finance_outbox` through the table API, a same-casino staff client can forge projection input without a valid producer aggregate. Mitigation: select Option A, revoke direct authenticated INSERT, remove authenticated INSERT policies, route producer outbox writes through governed SECURITY DEFINER SQL, and prove producer RPC inserts still succeed.

**R-6 — Payload drift.** If `adjustment.recorded` uses `amount_cents` while the Class A exemplar uses `amount`, consumers may misread units or silently drop adjustment amounts. Mitigation: preserve `amount` numeric in payload and make any cents field additive with explicit conversion semantics.

**R-7 — Stale overload escape hatch.** If a legacy overload accepting `p_casino_id` remains executable, the final API violates ADR-040 even if the new canonical function is correct. Mitigation: drop stale overloads and prove absence by function catalog introspection.

**R-8 — Teardown state drift.** If the Phase 2.1 migration assumes PRD-082 teardown has applied but does not assert it, a branch can merge producer changes while harness proof-state artifacts remain live. Mitigation: add a migration pre-state assertion that `outbox_integration_proof_state` is absent and `rpc_commit_consumer_receipt` has no proof-state side effect.

**R-9 — Relay operability blind spot.** If adjustment events enter relay processing but failure behavior is not smoke-tested, bad consumer behavior can mark rows incorrectly or lose retryability. Mitigation: add a relay smoke proving failed adjustment events keep `processed_at IS NULL`, record bounded `last_error`, and retry successfully.

### Open Questions

None. All design decisions relevant to this phase are locked:
- Q1–Q4 resolved 2026-05-06 (ROLLOUT-TRACKER.json)
- Fills/credits routing frozen in FIB-H §G (Phase 2.2 scope, not here)
- Producer provenance frozen to Option A — governed SECURITY DEFINER outbox insertion boundary; SECURITY INVOKER marker/GUC designs are out of scope for Phase 2.1
- No open questions permitted at Phase 2.1 per FIB-S governance block

---

## 8. Definition of Done

The release is considered **Done** when:

**Functionality**
- [ ] `rpc_create_financial_adjustment` emits one `finance_outbox` row per successful ADR-057-eligible linked adjustment, with `event_type = 'adjustment.recorded'`, `fact_class = 'ledger'`, `origin_label = 'actual'`, `player_id NOT NULL`, `table_id NOT NULL`, `aggregate_id` = PFT row id
- [ ] Unlinked adjustments and linked adjustments to excluded originals create valid PFT rows and zero `finance_outbox` rows
- [ ] A failed or rolled-back adjustment produces zero rows in both `player_financial_transaction` and `finance_outbox`

**Data & Integrity**
- [ ] `adjustment.recorded` is verified in `docs/35-integration/INT-002-event-catalog.md` before the producer migration is applied
- [ ] `event_id` on adjustment outbox rows is a UUIDv7 value generated at insert time, not a static or reused UUID
- [ ] `player_id` is never NULL on adjustment outbox rows
- [ ] Retrying the same adjustment idempotency key does not create a duplicate `adjustment.recorded` row
- [ ] `finance_outbox` has a DB uniqueness invariant on `(aggregate_id, event_type)` after a passing duplicate pre-state assertion
- [ ] `adjustment.recorded` payload includes `amount`, `pft_direction`, `delta_direction`, and `reason_code`; any `amount_cents` field is additive and explicitly converted

**Security & Access**
- [ ] No TypeScript-layer adjustment producer insert path exists for `finance_outbox` — confirmed by unit test and grep; existing relay lifecycle reads/updates remain allowed
- [ ] Authenticated direct `INSERT` into `finance_outbox` through the table API is denied; adjustment producer emission and existing exemplar producer emission still succeed
- [ ] Same-casino forged table API insert attempts for `adjustment.recorded`, `buyin.recorded`, and arbitrary payload rows are denied after context establishment
- [ ] Direct authenticated `finance_outbox` INSERT grant/policy is absent after Phase 2.1 migration; outbox writes run through governed SECURITY DEFINER SQL only
- [ ] `rpc_create_financial_adjustment` final signature has no caller-supplied `p_casino_id`; casino scope is derived from `set_rls_context_from_staff()`
- [ ] No executable stale `rpc_create_financial_adjustment` overload accepts caller-supplied `p_casino_id`
- [ ] PRD-082 harness teardown migration is applied: `outbox_integration_proof_state` is dropped; `rpc_commit_consumer_receipt` runs its non-harness body; harness grants revoked
- [ ] Phase 2.1 migration includes a pre-state assertion that PRD-082 teardown has already applied
- [ ] `CreateFinancialAdjustmentInput` docs/types do not require caller-supplied `casino_id` for the final adjustment RPC path

**Testing**
- [ ] I1 atomicity proof test for `rpc_create_financial_adjustment` passes: rollback injection (zero rows both tables) + success path (one row each table)
- [ ] Excluded adjustment tests pass: unlinked adjustment, linked-to-cage/marker/unrated original, and inherited invalid/cross-casino rating slip scenarios
- [ ] Concurrency retry test proves two simultaneous calls with the same idempotency key create one PFT row and at most one `adjustment.recorded` row
- [ ] Function catalog test proves stale `p_casino_id` overload absence
- [ ] Payload contract test proves amount field names, units, signs, `pft_direction`, and `delta_direction` for positive and negative adjustment deltas
- [ ] Relay operability smoke proves failed adjustment event delivery keeps `processed_at IS NULL`, records bounded `last_error`, and retries cleanly
- [ ] Unit test asserts adjustment path calls single RPC with no TS-level outbox fallback
- [ ] Existing I1–I4 harness (`tests/failure/`) remains green — no regression from teardown or extension migrations
- [ ] Existing `services/player-financial/__tests__/` suite remains green

**Operational Readiness**
- [ ] `npm run db:types-local` exits 0
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0

**Governance**
- [ ] I1 validation matrix entry for `rpc_create_financial_adjustment` updated in `WAVE-2-TRACKER.json` with `harness_result` and `phase: "2.1"`
- [ ] `WAVE-2-TRACKER.json` and `WAVE-2-PROGRESS-TRACKER.md` updated: Phase 2.1 status → `complete`, teardown status → `done`
- [ ] `ROLLOUT-TRACKER.json` cursor updated: `active_phase → "2.2"`, `last_closed_phase → "2.1"`
- [ ] SRM updated: `finance_outbox` marked as Wave 2 transport infrastructure, and FinanceService → RatingSlipService ADR-057 table-anchor lookup is explicitly allowlisted
- [ ] Phase 2.1 introduces no projection store, consumer branch, generic event bus, generic dispatcher, envelope change, or producer business-semantics rewrite

---

## 9. Related Documents

| Document | Role |
|---|---|
| `docs/35-integration/INT-002-event-catalog.md` | Canonical Wave 2 event catalog — source of truth for `adjustment.recorded` registration |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md §4` | Phase 2.1 scope, deliverables, exit gate — phase tracker; ADR-057 and INT-002 control event semantics if wording conflicts |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json` | Machine-readable phase state and validation matrix |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` | Human-readable companion — update at phase close |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` | Parent tracker — update cursor on phase transition |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md` | Teardown gate authority — pre-merge requirement |
| `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` | Parent FIB — scope authority |
| `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-S-TRANSACTIONAL-OUTBOX.json` | Structured FIB companion |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md` | Outbox implementation contract — DDL, relay, consumer, D2 vs D6 trigger classification |
| `supabase/migrations/20260511134903_wave2_rpc_create_financial_txn_ext.sql` | Exemplar pattern — Class A outbox extension to follow |
| `supabase/migrations/20260511134638_wave2_rpc_commit_consumer_receipt.sql` | Non-harness `rpc_commit_consumer_receipt` body — teardown target |
| `supabase/migrations/20260512000744_add_outbox_integration_proof_state.sql` | Harness body to be replaced by teardown migration |
| `supabase/migrations/20260512021632_fix_wave2_transport_path_bugs.sql` | Bug-3 (DO NOTHING) + Bug-4 (INSERT policy) already applied |
| `tests/failure/i1-atomicity.test.ts` | I1 harness pattern — follow for adjustment producer proof |
| `docs/80-adrs/ADR-052` through `ADR-055` | Frozen ADR set — governs Wave 2 transport decisions |
| `docs/80-adrs/ADR-057-class-a-table-anchoring-idempotency-clarification.md` | Class A eligibility and table-anchor rule — governs adjustment inclusion/exclusion |

---

## Appendix A: Migration Authoring Notes

### Extension migration — pattern to follow

The Class A exemplar extension in `20260511134903_wave2_rpc_create_financial_txn_ext.sql` is the canonical pattern. The adjustment extension must match it structurally, with ADR-057 eligibility gating before the outbox insert:

```sql
-- Inside rpc_create_financial_adjustment, after the PFT INSERT and before RETURN:
-- Only execute this INSERT when the linked original PFT recomputes as ADR-057 eligible
-- and the inherited rating_slip_id resolves to a same-casino rating_slip.table_id.
INSERT INTO public.finance_outbox (
  event_id,
  event_type,
  fact_class,
  origin_label,
  casino_id,
  table_id,
  player_id,
  aggregate_id,
  payload
) VALUES (
  public.generate_uuid_v7(),      -- monotonic; generated at insert time
  'adjustment.recorded',          -- hardcoded; not caller-derived
  'ledger',                       -- hardcoded; Class A
  'actual',                       -- hardcoded; immutable in transit (ADR-054 D5)
  <casino_id from authoring context>,
  <table_id derived from original rating_slip.table_id>,
  <player_id from adjustment row>,  -- NOT NULL enforced; violation if NULL
  <pft_row_id>,                   -- aggregate_id = the PFT row for this adjustment
  jsonb_build_object(
    'amount',          <signed adjustment amount numeric>,
    'pft_direction',   <literal PFT direction>,
    'delta_direction', <increase|decrease derived from amount sign>,
    'reason_code',     <reason_code>
  )
);
```

The `DO NOTHING` idempotency fix (Bug-3) is already present in `20260512021632`. The extension migration must preserve that fix while adding eligibility-gated outbox emission, RPC signature remediation, direct-write denial, and duplicate-outbox prevention.

The Phase 2.1 migration must still reconcile the final RPC signature with ADR-040/PRD-044 by removing caller-supplied `p_casino_id` from `rpc_create_financial_adjustment`; migration `20260512021632` reintroduced it while applying Bug-3. Use explicit `DROP FUNCTION IF EXISTS` statements for stale overloads and re-emit grants only on the canonical no-`p_casino_id` signature.

Before adding a duplicate-prevention unique constraint, assert the pre-state:

```sql
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.finance_outbox
    GROUP BY aggregate_id, event_type
    HAVING COUNT(*) > 1
  ), 'PRE-STATE FAIL: duplicate finance_outbox aggregate_id/event_type rows exist';
END $$;
```

Before replacing `rpc_create_financial_adjustment`, assert PRD-082 teardown state:

```sql
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'outbox_integration_proof_state'
  ), 'PRE-STATE FAIL: PRD-082 harness table still exists';
END $$;
```

After provenance remediation, assert direct authenticated outbox insertion is impossible:

```sql
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'finance_outbox'
      AND roles::text LIKE '%authenticated%'
      AND cmd IN ('INSERT', 'ALL')
  ), 'POST-STATE FAIL: authenticated INSERT policy still exists on finance_outbox';

  ASSERT NOT has_table_privilege('authenticated', 'public.finance_outbox', 'INSERT'),
    'POST-STATE FAIL: authenticated still has INSERT privilege on finance_outbox';
END $$;
```

The outbox insertion implementation must use the selected Option A posture: a governed SECURITY DEFINER SQL boundary for `finance_outbox` writes, with no authenticated table INSERT grant. If implemented as a helper callable from SECURITY INVOKER producer RPCs, the helper must be narrowly scoped to deterministic envelope insertion, must derive tenant context from existing authoritative session context, and must not accept caller-supplied execution `casino_id`.

### Teardown migration — body to restore

`rpc_commit_consumer_receipt` must be restored to the body in `20260511134638_wave2_rpc_commit_consumer_receipt.sql` (no proof-state block). The function signature, SECURITY DEFINER, `SET search_path = ''`, grant pattern, and `'processed'`/`'duplicate'` semantics are identical to that migration's form.

---

## Appendix B: I1 Proof Test Sketch

The adjustment-path I1 proof follows the same structure as the exemplar tests in `tests/failure/i1-atomicity.test.ts`:

1. **Eligible rollback case** — inject a controlled mid-transaction failure after PFT insert and before outbox insert. Assert: zero rows in `player_financial_transaction` for the test `player_id`; zero rows in `finance_outbox` for the test `table_id`. No orphaned outbox row. Any test-only injection hook must be default-off and impossible to activate through ordinary authenticated application calls.
2. **Eligible success case** — call `rpc_create_financial_adjustment` with `p_original_txn_id` linked to a rated pit cash/chips original whose `rating_slip_id` resolves to same-casino `rating_slip.table_id`. Assert: exactly one row in `player_financial_transaction`; exactly one row in `finance_outbox` with `event_type = 'adjustment.recorded'`, `fact_class = 'ledger'`, `origin_label = 'actual'`, `player_id` matching the adjustment's player.
3. **Excluded success cases** — call `rpc_create_financial_adjustment` with no `p_original_txn_id`, with an original cage/marker/unrated transaction, and with an original that lacks a resolvable same-casino table anchor. Assert: valid PFT row where applicable; zero `finance_outbox` rows.
4. **Retry case** — retry with the same `(casino_id, idempotency_key)` and assert no second `adjustment.recorded` row exists for the same aggregate.
5. **Concurrent retry case** — issue two simultaneous eligible adjustment calls with the same idempotency key and assert one PFT row and at most one outbox row.
6. **Payload contract case** — assert positive and negative adjustment deltas emit payload `amount` with the correct sign and numeric unit, `pft_direction = 'in'`, and `delta_direction` derived from the sign; if `amount_cents` is present, assert its conversion from `amount`.
7. **Relay operability case** — inject a consumer failure for an adjustment event and assert the row keeps `processed_at IS NULL`, `last_error` is bounded, and the event can later be retried successfully.

The proof does not re-certify I2–I4 (transport-substrate invariants, inherited from Phase 2.0) unless the relay worker or consumer architecture has materially changed — which it has not.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0 | 2026-05-17 | Lead Architect | Initial draft |
| v1 | 2026-05-17 | Codex / Devil's Advocate | Applied audit patch delta: ADR-057 eligibility gating, RPC signature remediation, direct-write denial, idempotency guard, and test gates |
| v1.1 | 2026-05-17 | Codex / Devil's Advocate | Clarified direct-write denial for SECURITY INVOKER producers and ADR-057 precedence over rollout-map placeholders |
| v1.2 | 2026-05-17 | Codex / Devil's Advocate | Added stale overload cleanup, INT-002 catalog authority, payload contract, uniqueness pre-state assertion, and concurrency/rollback test gates |
| v1.3 | 2026-05-17 | Codex / Devil's Advocate swarm | Applied final three-review consensus: producer provenance choice, mandatory uniqueness, direction semantics, teardown pre-state, relay operability, and DTO caller-input cleanup |
| v1.4 | 2026-05-17 | Codex / Devil's Advocate swarm | Locked producer provenance to Option A, clarified RPC transaction-boundary language, scoped TS fallback checks, added authenticated INSERT post-state assertions, and required SRM boundary cleanup |

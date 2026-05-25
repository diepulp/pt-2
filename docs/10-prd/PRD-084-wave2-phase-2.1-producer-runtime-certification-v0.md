---
id: PRD-084
title: Wave 2 Phase 2.1 — Producer Runtime Certification
owner: Lead Architect
status: Draft
affects: [PRD-083, PRD-082, PRD-081, ADR-054, ADR-057, FIB-H-W2-OUTBOX-001]
created: 2026-05-18
last_review: 2026-05-18
phase: Phase 2.1 (Wave 2 Financial Data Distribution)
http_boundary: false
---

# PRD-084 — Wave 2 Phase 2.1 — Producer Runtime Certification

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Parent FIB:** FIB-H-W2-OUTBOX-001 (STEP-1 / STEP-2, CAP-1)
- **Certifies:** PRD-083 (Wave 2 Phase 2.1 — Financial Adjustment Producer Expansion)
- **Summary:** PRD-083 wired `rpc_create_financial_adjustment` to emit `adjustment.recorded` through the `finance_outbox` transport substrate and hardened direct-insert access via Option A security. This PRD delivers the narrow runtime certification slice that proves the Phase 2.1 producer expansion holds under live database execution — covering RLS enforcement, SECURITY DEFINER helper routing, idempotency, payload contract, exemplar regression smoke, and relay compatibility. It is not a new architecture phase. It does not repeat the PRD-082 existential transport proof. It certifies only the surfaces PRD-083 actually changed. Phase 2.2 is gated on this certification completing with no blockers.

---

## 2. Problem & Goals

### 2.1 Problem

PRD-083 expanded the outbox producer surface from the exemplar pair to include `rpc_create_financial_adjustment`. The implementation was merged and the migration applied. However, runtime behavior — live RLS, SECURITY DEFINER helper routing, idempotency guard, atomicity under concurrent retry, payload shape, exemplar regression, and relay compatibility — has not been proven against a live Supabase database. The transport substrate proved by PRD-082 must be reconfirmed to not have been disturbed by the Option A security hardening and the helper-backed insertion refactor. Phase 2.2 cannot begin until this certification gate closes.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Prove adjustment I1 atomicity in a live database | Eligible adjustment emits exactly one `adjustment.recorded` + one PFT row; rollback injection leaves zero rows; ineligible adjustments emit zero outbox rows |
| **G2**: Prove Option A security hardening holds | Direct authenticated `finance_outbox` INSERT fails at the DB boundary; helper-backed producer INSERT succeeds |
| **G3**: Prove idempotency and concurrent-retry safety | Same idempotency key produces at most one PFT row and one outbox row under sequential and concurrent retry |
| **G4**: Prove payload contract conforms to FR-10 | Positive/negative adjustment payloads match expected field values; `note` field is absent |
| **G5**: Prove exemplar producers still emit after helper adaptation | `buyin.recorded` and `grind.observed` emit successfully through `fn_finance_outbox_emit` |
| **G6**: Prove adjustment row is relay-compatible | `rpc_claim_outbox_batch` returns the row; relay can process it; failure leaves row retryable |

### 2.3 Non-Goals

- Repeating the PRD-082 existential transport proof (I1–I5 globally, relay/replay/idempotent receipt architecture).
- New relay architecture, consumer branch, or projection store.
- `FinancialOutboxEventDTO` shape changes or new DTO fields.
- Phase 2.2 producer work (`rpc_request_table_fill` / `rpc_request_table_credit`).
- Phase 2.3 lifecycle completeness projection or DEC-1 resolution.
- Observability dashboard, retry backoff policy, or DLQ semantics.
- TypeScript fallback producer path.
- Any operator-visible UI or API surface changes.

---

## 3. Users & Use Cases

- **Primary users:** Certifying engineer (internal), Phase 2.2 gate reviewer

**Top Jobs:**

- As the **certifying engineer**, I need to run a reproducible live proof against a seeded local Supabase database and capture a result log so that Phase 2.2 has a documented, binary-testable certification record.
- As the **gate reviewer**, I need to inspect the 14 pass/fail conditions from the certification invariant so that I can approve Phase 2.2 entry with confidence that the Phase 2.1 producer surface is live-proven.
- As the **Phase 2.3 implementer** (future), I need the certification record to exist as evidence that `adjustment.recorded` is relay-compatible and consumer-ready before building projection consumer logic on top of it.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Proof Script:**
- [ ] A proof script at `scripts/outbox-proof/phase-2-1-adjustment-certification.ts` that can be run against a live local Supabase database with seeded fixtures. May reuse PRD-082 proof helpers; must not recreate PRD-082 harness infrastructure.
- [ ] Script covers all six proof sections: Adjustment I1, Option A Security, Idempotency/Concurrency, Payload Contract, Exemplar Regression Smoke, Relay Compatibility Smoke.
- [ ] Script exits with a non-zero code if any case produces an unexpected result, making it CI-runnable.

The proof script is an ephemeral certification utility, not a reusable proof framework or generalized validation platform. Reuse of PRD-082 helpers is permitted only to reduce duplication; this PRD must not introduce a new proof orchestration subsystem, reusable certification engine, or transport-validation framework.

**Certification Result Document:**
- [ ] A completed `CERTIFICATION-RESULT-083.md` captured under `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2-1-certification/`.
- [ ] The result document records: environment, branch/commit, migration state, per-section summary, and the binary Decision (certified / not certified / blocked).
- [ ] All 14 pass/fail gate conditions from §9 of the source certification specification are addressed with explicit pass/fail status.

### 4.2 Out of Scope

- Any migration changes.
- Any changes to relay worker, consumer, or outbox DDL.
- New integration test files in the Jest suite (script is standalone; Jest coverage is a separate concern).
- Retroactive re-execution of PRD-082 proof cases.

---

## 5. Requirements

### 5.1 Functional Requirements

**Adjustment I1 Live Proof (5 cases required):**
- Eligible adjustment (pit source, in direction, cash/chips, same-casino rating slip) emits exactly one adjustment PFT row and one `finance_outbox` row with `event_type='adjustment.recorded'`, `fact_class='ledger'`, `origin_label='actual'`, `table_id NOT NULL`, `aggregate_id` = adjustment PFT id.
- Rollback injection after PFT insert and before outbox emission must leave zero PFT rows and zero `finance_outbox` rows.
- Unlinked adjustment (`p_original_txn_id IS NULL`) produces a valid PFT row and zero outbox rows.
- Excluded linked adjustment (original fails ADR-057 eligibility on any axis) produces a valid PFT row and zero outbox rows.
- Invalid inherited table anchor (rating slip does not resolve to same-casino table) raises an exception; zero PFT rows; zero outbox rows.

**Option A Security Live Proof (5 cases required):**
- Direct authenticated insert into `finance_outbox` is denied for all tested event types (`adjustment.recorded`, `buyin.recorded`, arbitrary payload).
- Helper-backed producer insertion through `fn_finance_outbox_emit` succeeds when business rules are valid.

**Idempotency and Concurrency Live Proof (3 cases required):**
- Sequential idempotent retry with same idempotency key: at most one PFT row and at most one `adjustment.recorded` row.
- Concurrent retry with same idempotency key: no duplicate `(aggregate_id, event_type)` escapes as uncaught partial-write state.
- `uq_finance_outbox_aggregate_event` uniqueness guard verified to exist and protect producer deduplication without conflicting with replay processing.

**Payload Contract Live Proof (2 cases required):**
- Positive delta: `amount > 0`, `pft_direction='in'`, `delta_direction='increase'`, `reason_code` present, `note` absent.
- Negative delta: `amount < 0`, `pft_direction='in'`, `delta_direction='decrease'`, `reason_code` present, `note` absent.

**Exemplar Regression Smoke (2 cases required):**
- `rpc_create_financial_txn` (Class A exemplar) still emits `buyin.recorded` through helper.
- `rpc_record_grind_observation` (Class B exemplar) still emits `grind.observed` through helper.

**Relay Compatibility Smoke (3 cases required):**
- `rpc_claim_outbox_batch` returns an `adjustment.recorded` row; row shape conforms to existing DTO with no new fields required.
- Existing relay/consumer path processes the row; `processed_at` is set after commit; duplicate delivery returns safe result with no new consumer branch.
- Controlled consumer failure leaves `processed_at IS NULL`, increments `delivery_attempts`, introduces no DLQ or backoff expansion.

Relay compatibility smoke exists only to prove that `adjustment.recorded` conforms to the already-certified relay contract established by PRD-082. This section MUST NOT evolve into a broader relay-operability, retry-policy, consumer-lifecycle, or observability certification layer.

### 5.2 Non-Functional Requirements

- Proof script must be idempotent: re-running against a clean database must produce the same results.
- Proof artifacts must remain isolated, identifiable, and non-authoritative. Cleanup or rollback is preferred where practical, but the certification slice must not introduce complex teardown orchestration solely to restore a perfectly pristine database state.
- No new production code artifacts are introduced by this PRD; only the proof script and the certification result document.

> Architecture and transport substrate details: PRD-081, PRD-082, PRD-083.
> Security model: ADR-054 (Option A), ADR-057 (eligibility), ADR-018 (SECURITY DEFINER governance).
> Schema: `types/database.types.ts`.

---

## 6. Proof Execution Flow

**Flow 1: Pre-execution Setup**
1. Confirm local Supabase is running with PRD-083 migration applied.
2. Apply seed fixtures: casino, staff, table, rating slip, original ADR-057-eligible PFT row.
3. Confirm PRD-082 teardown migration is applied (no harness receipt state present).

**Flow 2: Proof Script Execution**
1. Run `npx ts-node scripts/outbox-proof/phase-2-1-adjustment-certification.ts`.
2. Script executes 20 cases sequentially across the six proof sections.
3. Script prints a per-case pass/fail summary and exits 0 (all pass) or non-zero (any fail).

Concurrent retry certification is valid if either:
- true concurrent execution is observed and no duplicate producer state escapes, or
- the UNIQUE `(aggregate_id, event_type)` constraint is structurally verified and the environment documents pooler serialization preventing true concurrency.

This prevents local pooler behavior from producing false-negative concurrency conclusions.

**Flow 3: Result Capture**
1. Copy the 14-condition pass/fail gate into the certification result template.
2. Record environment, commit, migration state, and per-section findings.
3. Set Decision to `Runtime certified` / `Runtime certified with non-blocking notes` / `Not certified — blocker found`.
4. Commit the result document to the branch.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-083 migration applied** — `rpc_create_financial_adjustment` must be the Phase 2.1 form with `fn_finance_outbox_emit` call; no `p_casino_id` overload.
- **PRD-082 teardown migration applied** — `20260517141021_remove_prd082_harness_receipt_proof_state.sql` must be present; harness state must be absent.
- **PRD-082 proof helpers** — may be reused; must not recreate the full PRD-082 harness.
- **Seeded local Supabase** — an ADR-057-eligible original PFT row and its `rating_slip` + `table` anchor are required fixtures.
- **`uq_finance_outbox_aggregate_event` constraint** — must exist from Phase 2.0 DDL; verified as part of idempotency proof.

### 7.2 Risks & Open Questions

- **Concurrent retry proof** — requires two simultaneous DB connections from the proof script. If the local Supabase pooler serializes them, the concurrent case degrades to a sequential idempotency check. Mitigation: note the limitation in the result document; treat as a non-blocking observation if the uniqueness constraint is verified structurally.
- **Rollback injection** — requires a controlled mid-transaction failure. Mitigation: use a deliberate constraint violation or an advisory lock to simulate failure; document the injection mechanism in the script.
- **Relay compatibility smoke** — relies on the relay worker being accessible from the proof script. If relay is a separate process, the smoke case may be limited to verifying the claimed row shape. Mitigation: note as non-blocking if row shape conforms and DTO requires no changes.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when all 14 gate conditions are explicitly marked PASS in the certification result document:

**Adjustment I1 Live Proof**
- [ ] Eligible adjustment emits exactly one `adjustment.recorded` outbox row atomically with its PFT row
- [ ] Rollback injection leaves zero PFT rows and zero outbox rows (no partial write state)
- [ ] Unlinked adjustment produces valid PFT row and zero outbox rows
- [ ] Ineligible linked adjustment (any ADR-057 exclusion axis) produces valid PFT row and zero outbox rows
- [ ] Invalid inherited table anchor rejects the entire write (exception, zero rows)

**Security**
- [ ] Direct authenticated `finance_outbox` insert is denied at the database boundary
- [ ] Helper-backed producer insertion through `fn_finance_outbox_emit` succeeds

**Idempotency and Concurrency**
- [ ] Sequential idempotent retry produces at most one PFT row and at most one outbox row
- [ ] Concurrent retry produces no duplicate `(aggregate_id, event_type)` violation escaping as uncaught partial-write state

**Payload Contract**
- [ ] Positive and negative adjustment payloads conform to FR-10 field expectations
- [ ] `note` field is absent from all emitted payloads

**Exemplar Regression Smoke**
- [ ] `buyin.recorded` still emits through adapted exemplar producer after helper refactor
- [ ] `grind.observed` still emits through adapted exemplar producer after helper refactor

**Relay Compatibility**
- [ ] Adjustment row is relay-compatible (row shape conforms to existing DTO; no new consumer branch or envelope change introduced)

**Certification Artifact**
- [ ] Completed `CERTIFICATION-RESULT-083.md` committed under `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2-1-certification/`
- [ ] Proof script committed at `scripts/outbox-proof/phase-2-1-adjustment-certification.ts`
- [ ] No new production code, migration, relay change, DTO field, or consumer branch introduced

---

## 9. Related Documents

- **Source specification:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/actions/PRODUCER-RUNTIME-CERTIFICATION-083.md`
- **Prerequisite PRDs:** `docs/10-prd/PRD-081-transactional-outbox-gap-f1-closure-v0.md`, `docs/10-prd/PRD-082-wave2-integration-proof-v0.md`, `docs/10-prd/PRD-083-wave2-phase-2.1-adjustment-producer-expansion-v0.md`
- **Wave 2 tracker:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md`
- **Eligibility rule:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/ADR-057-DIRECTION-NOTE.md`
- **Security model:** ADR-054 (Option A hardening), ADR-018 (SECURITY DEFINER governance)
- **Event catalog:** `docs/35-integration/INT-002-event-catalog.md`
- **Schema / Types:** `types/database.types.ts`
- **Over-Engineering Guardrail:** `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- **Wave 2 outbox guardrail:** `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_OUTBOX_WAVE2.md`

---

## Appendix A: Certification Invariant

> An ADR-057-eligible financial adjustment emits exactly one `adjustment.recorded` outbox row atomically with its PFT row through the governed SECURITY DEFINER helper, while ineligible adjustments remain valid PFT writes with zero outbox emission, direct authenticated table insertion remains denied, and previously proven exemplar producers still emit successfully.

This invariant is the single governing test oracle for the proof script. Any case that violates it is a blocker.

---

## Appendix B: Implementation Plan

### WS1: Proof Script (P0)

- [ ] Scaffold `scripts/outbox-proof/phase-2-1-adjustment-certification.ts` using PRD-082 proof helpers where available
- [ ] Implement Adjustment I1 cases (5 cases: eligible success, rollback injection, unlinked, excluded linked, invalid anchor)
- [ ] Implement Option A Security cases (5 cases: direct insert × 4 event types, helper-backed success)
- [ ] Implement Idempotency/Concurrency cases (3 cases: sequential idempotent, concurrent, constraint verification)
- [ ] Implement Payload Contract cases (2 cases: positive delta, negative delta)
- [ ] Implement Exemplar Regression Smoke (2 cases: `buyin.recorded`, `grind.observed`)
- [ ] Implement Relay Compatibility Smoke (3 cases: claim, process, failure-retryable)
- [ ] Verify script exits non-zero on any unexpected result
- [ ] Verify script leaves no residual DB state after execution

### WS2: Certification Result (P0)

- [ ] Execute proof script against live local Supabase with seeded fixtures
- [ ] Capture result log
- [ ] Complete `CERTIFICATION-RESULT-083.md` from result template (§10 of source spec)
- [ ] Set binary Decision
- [ ] Commit result document under `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2-1-certification/`
- [ ] Update `WAVE-2-PROGRESS-TRACKER.md` to reflect Phase 2.1 runtime certified

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-05-18 | Lead Architect | Initial draft |

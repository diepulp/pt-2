
---
id: FIB-H-W2-INTEGRATION-PROOF-001
title: Wave 2 Integration Proof — Exemplar Runtime Validation
status: PROPOSED
date: 2026-05-11
owner: Architecture / Build Pipeline
parent_authority:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - PRD-081
  - EXEC-081
  - WAVE-2-ROLLOUT-MAP
scope: PT-2 pilot — post-PRD-081 runtime validation gate
---

# A. Feature Identity

This FIB defines the post-PRD-081 Wave 2 Integration Proof slice.

The slice validates that the PRD-081 transactional outbox exemplar works under real integration conditions, not merely under unit, mock, or bounded failure-harness assumptions.

This is not a producer-expansion slice.

This is not the first projection-consumer slice.

This is the hardening gate between:

- Phase 2.0 exemplar implementation
- Phase 2.1 producer expansion

# B. Operator Problem

The system now has a functional transactional outbox exemplar, but the architecture must be proven against real runtime behavior before more producer paths are wired.

The operator-facing risk is indirect but serious:

If the transport chain fails under real database, relay, idempotency, replay, or deployment conditions, downstream financial surfaces may appear current, complete, or reliable when the propagation substrate is still brittle.

The integration proof prevents Wave 2 from building more surface area on an unproven transport spine.

# C. Pilot Fit

This slice fits the pilot because it validates infrastructure already implemented by PRD-081 without adding new business behavior.

The pilot does not need:

- more dashboards,
- external event contracts,
- observability products,
- event-platform abstractions,
- reconciliation behavior.

The pilot does need confidence that the outbox transport mechanism survives real execution.

# D. Actor / Moment

Primary actor:

- Developer / system operator validating Wave 2 readiness.

Secondary actor:

- Future implementer of Phase 2.1 and Phase 2.2 producer expansion.

Moment:

- Immediately after PRD-081 exemplar implementation.
- Before activating `rpc_create_financial_adjustment`, `rpc_request_table_fill`, or `rpc_request_table_credit`.

# E. Containment Loop

The loop is intentionally narrow:

1. Seed real integration data.
2. Execute the two PRD-081 exemplar producers:
   - `rpc_create_financial_txn`
   - `rpc_record_grind_observation`
3. Drive the real relay path.
4. Verify idempotent receipt.
5. Replay from persisted `finance_outbox` rows.
6. Compare deterministic proof state.
7. Record pass/fail evidence.
8. Freeze or block Wave 2 continuation.

The loop ends when I1-I4 are proven against real database/RPC/relay execution.

# F. Required Outcomes

## O1 — Real RPC Execution

Both exemplar producers must be exercised against real database RPCs and migrations.

Required producers:

- Class A Authority Fact: `rpc_create_financial_txn`
- Class B Telemetry Fact: `rpc_record_grind_observation`

No mocked producer substitute may satisfy this outcome.

## O2 — I1 Atomicity Runtime Proof

For both exemplar producers:

- authoring row and `finance_outbox` row commit together,
- injected failure causes both writes to disappear,
- no orphaned authoring rows,
- no phantom outbox rows,
- row-count-only proof is insufficient.

## O3 — I2 Durability Runtime Proof

A committed outbox row must survive relay interruption and remain processable on a later relay cycle.

Required proof:

- simulate relay failure or interrupted processing,
- verify event remains claimable/reclaimable,
- verify successful later processing.

## O4 — I3 Idempotency Runtime Proof

Processing the same `event_id` more than once must produce one logical consumer side effect.

Required proof:

- `processed_messages` gates duplicate delivery,
- side-effect and receipt commit atomically,
- repeated relay delivery does not duplicate derived proof state.

## O5 — I4 Replayability Runtime Proof

Replay from `finance_outbox` must produce deterministic equivalent proof state.

Required proof:

- generate exemplar event history,
- process live once,
- capture proof-state hash or comparable deterministic state,
- truncate proof state,
- replay ordered outbox rows,
- compare replay result against live result.

## O6 — Runtime Environment Drift Check

The integration proof must identify whether local, preview, or deployed runtime configuration changes the behavior of:

- Supabase RPC execution,
- service-role relay access,
- cron-secret validation,
- RLS behavior,
- environment variable availability.

This is not a broad CI/CD project. It is a targeted runtime drift check for the transport path.

## O7 — Evidence Artifact

The slice must produce a concise signoff artifact recording:

- environment tested,
- commands or scripts run,
- I1-I4 result,
- failures encountered,
- fixes applied,
- decision: Phase 2.1 may proceed or is blocked.

# G. Explicit Exclusions

This slice must not include:

- `rpc_create_financial_adjustment` producer wiring,
- `rpc_request_table_fill` producer wiring,
- `rpc_request_table_credit` producer wiring,
- new projection stores (exception: `outbox_integration_proof_state` is authorized as a test harness artifact for I4 replay hashing; it is not a projection store, not a product read model, and must not be consumed by application code outside PRD-082 validation),
- lifecycle-aware completeness projection,
- shift telemetry projection,
- dashboard freshness behavior,
- operator-visible UI changes,
- replay UI,
- observability dashboard,
- generic event platform,
- multi-consumer fan-out,
- external event contract,
- reconciliation behavior,
- new financial totals,
- changes to ADR-052 through ADR-055,
- broad schema redesign.

If any of those become necessary, this FIB is violated and must be amended before proceeding.

# H. Adjacent Rejected Ideas

## Rejected: Proceed directly to Phase 2.1

Rejected because PRD-081 proves the exemplar structurally, but Phase 2.1 should not expand producer surface until the exemplar survives real runtime validation.

## Rejected: Fold integration proof into producer expansion

Rejected because failures would become ambiguous. If adjustment wiring fails, it should not be unclear whether the issue belongs to adjustment semantics or the base outbox transport.

## Rejected: Build the first projection consumer now

Rejected because transport must be proven before projection correctness can mean anything.

## Rejected: Add observability dashboard

Rejected because minimal runtime evidence is enough for this gate. A dashboard is productized observability and belongs later.

# I. Dependencies / Assumptions

Dependencies:

- PRD-081 implementation merged or available on the integration branch.
- `finance_outbox` DDL exists.
- `processed_messages` exists.
- `rpc_claim_outbox_batch` exists.
- `rpc_commit_consumer_receipt` exists.
- `rpc_create_financial_txn` emits outbox rows.
- `rpc_record_grind_observation` emits outbox rows.
- relay route exists.
- test database can be seeded/reset safely.

Assumptions:

- Integration environment is expendable.
- Test data may be synthetic.
- No production data is required.
- The proof may run locally against a real Supabase/Postgres stack before preview validation.

# J. Likely Next

If the integration proof passes:

- freeze the PRD-081 benchmark,
- authorize Phase 2.1: `rpc_create_financial_adjustment` producer expansion.

If the integration proof fails:

- patch the exemplar transport path only,
- rerun this integration proof,
- do not proceed to Phase 2.1.

# K. Expansion Trigger Rule

Expansion beyond this FIB is allowed only when:

- I1-I4 pass in the selected integration environment,
- runtime drift findings are either resolved or explicitly accepted,
- signoff artifact states Phase 2.1 may proceed.

No producer expansion is permitted before this gate passes.

# L. Scope Authority Block

This FIB authorizes a bounded integration-proof slice.

It does not authorize new business behavior.

It does not authorize new producer categories.

It does not authorize projection implementation.

It does not authorize dashboard or surface changes.

It exists to answer one question:

> Does the PRD-081 exemplar transactional outbox survive real runtime execution well enough to become the benchmark for Wave 2 expansion?

If yes, proceed to Phase 2.1.

If no, fix the exemplar before widening the blast radius.
```


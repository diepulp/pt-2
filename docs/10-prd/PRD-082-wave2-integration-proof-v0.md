---
id: PRD-082
title: Wave 2 Integration Proof — Exemplar Runtime Validation Gate
owner: Lead Architect
status: Accepted
affects: [PRD-081, ADR-052, ADR-053, ADR-054, ADR-055, EXEC-081]
created: 2026-05-11
last_review: 2026-05-11
phase: Phase 2 (Wave 2 Financial Data Distribution)
http_boundary: false
---

# PRD-082 — Wave 2 Integration Proof — Exemplar Runtime Validation Gate

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Accepted
- **Summary:** PRD-081 delivered the transactional outbox exemplar structurally. PRD-082 is the hardening gate that proves the exemplar transport chain survives real runtime execution before any Phase 2.1 producer expansion begins. It exercises both exemplar producers (`rpc_create_financial_txn`, `rpc_record_grind_observation`) against a live Supabase/Postgres stack and validates four invariants — Atomicity, Durability, Idempotency, and Replayability — under conditions that mocks cannot satisfy. The slice produces a single evidence artifact (`WAVE-2-INTEGRATION-PROOF-SIGNOFF.md`) whose decision field gates Phase 2.1. No new business behavior, producer wiring, projection stores, or operator-visible UI changes are in scope.

---

## 2. Problem & Goals

### Problem Statement

The PRD-081 transactional outbox exemplar has been implemented structurally: migrations exist, RPCs emit outbox rows, the relay route is wired, and `processed_messages` guards idempotency. However, structural correctness proven under unit or mock conditions is not sufficient to authorize expanding the producer surface. If the transport chain fails under real database, relay-interruption, duplicate-delivery, or replay conditions, downstream financial surfaces will appear reliable when the propagation substrate is still brittle. Phase 2.1 must not begin on an unproven spine.

### Goals

1. Prove I1 (Atomicity): authoring row and outbox row commit together; failure rolls back both; no orphans.
2. Prove I2 (Durability): a committed outbox row survives relay interruption and remains processable on a later cycle.
3. Prove I3 (Idempotency): duplicate delivery of the same `event_id` produces exactly one logical consumer side effect.
4. Prove I4 (Replayability): ordered replay from `finance_outbox` produces deterministic state equivalent to live processing.
5. Record a runtime drift check covering the RPC, relay, cron-secret, RLS, and env-var surfaces.

### Non-Goals

- `rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit` producer wiring.
- Any projection store (lifecycle-aware completeness, shift telemetry, or otherwise). Exception: `outbox_integration_proof_state` is authorized as a test harness artifact for I4 replay hashing and comparison. It is not a projection store, not a product read model, and must not be consumed by application code outside PRD-082 validation.
- Dashboard freshness behavior or replay UI.
- Operator-visible UI changes of any kind.
- Observability products, generic event platforms, multi-consumer fan-out.
- External event contracts or reconciliation behavior.
- Amendments to ADR-052 through ADR-055.
- Broad schema redesign.

---

## 3. Users & Use Cases

### Primary User: Developer / System Operator

Validating Wave 2 readiness immediately after PRD-081.

**Jobs:**
1. Execute both exemplar producers against real RPCs and observe `finance_outbox` population.
2. Inject failures and confirm atomicity — no orphaned authoring rows, no phantom outbox rows.
3. Simulate relay interruption and confirm durability — committed rows survive and are reclaimable.
4. Simulate duplicate delivery and confirm idempotency — `processed_messages` blocks re-execution.
5. Replay ordered outbox history and confirm state equivalence.
6. Record all findings in the signoff artifact and issue a go/no-go decision for Phase 2.1.

### Secondary User: Phase 2.1 Implementer

Relies on the signoff artifact as the authorization record before beginning `rpc_create_financial_adjustment` producer wiring.

**Jobs:**
1. Confirm `WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` exists and decision field reads "Phase 2.1 authorized".
2. Reference the runtime drift findings to avoid repeating known environment issues.

---

## 4. Scope & Feature List

- [ ] Seed script or documented seed procedure creates casino, staff, player, visit, and table with valid FK anchors for both exemplar RPCs.
- [ ] `rpc_create_financial_txn` is invoked against the real local Supabase stack; `finance_outbox` row is verified by content (not row count alone).
- [ ] `rpc_record_grind_observation` is invoked against the real local Supabase stack; `finance_outbox` row is verified by content.
- [ ] Failure injection (mid-transaction abort) for each producer confirms both authoring row and outbox row are absent post-rollback.
- [ ] `rpc_claim_outbox_batch` reclaimability verified before I2 execution: stale-claim expiry or explicit reclaim path confirmed; if absent, PRD-082 is blocked.
- [ ] Relay interruption scenario (claim without commit) confirms outbox row becomes reclaimable via the verified reclaim path and processes successfully on the next relay cycle.
- [ ] Duplicate `event_id` delivery scenario confirms `rpc_commit_consumer_receipt` rejects the second delivery and `outbox_integration_proof_state` contains exactly one record for that event.
- [ ] `outbox_integration_proof_state` table exists (migration introduced by this slice), is truncatable, and is populated only by consumed `finance_outbox` rows during proof execution.
- [ ] Replay scenario: live run captured into `outbox_integration_proof_state`, proof state truncated, ordered outbox replay executed, final state fingerprint compared deterministically against live capture.
- [ ] Runtime drift check executed against: Supabase RPC invocation, `service_role` key availability, `CRON_SECRET` validation in relay route, RLS policies under service-role, required ENV vars.
- [ ] `WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` authored at `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/` containing all required fields (see §5 below).
- [ ] Decision field in signoff is binary: "Phase 2.1 authorized" or "Phase 2.1 blocked — patch required".

---

## 5. Requirements

### Functional Requirements

**FR-1 — Real execution only.** No mocked producer, relay, or database substitute may satisfy any invariant proof. All assertions must be observed against a real Supabase/Postgres stack.

**FR-2 — Atomicity (I1).** For each producer:
- Success path: `player_financial_transaction` (or `table_buyin_telemetry`) row and `finance_outbox` row exist together after commit.
- Failure path: mid-transaction abort leaves neither row. Row-content inspection required; row-count-only assertion is rejected.

**FR-3 — Durability (I2) — claim reclaimability is a prerequisite.** Before executing the I2 proof, `rpc_claim_outbox_batch` MUST be verified to support stale-claim reclaimability. A row claimed but not committed through `rpc_commit_consumer_receipt` must become claimable again through either claim-expiry semantics (e.g., `claimed_at` + `claim_token` + timeout) or an explicit reclaim path in `rpc_claim_outbox_batch`. Acceptable options: claim-expiry timeout, stale-claim reclaim in the batch RPC, or a test-only unclaim helper used solely during proof execution. Not acceptable: permanent claim on first touch, claim state clearable only by manual intervention, or treating "claimed but uncommitted" as processed. If no reclaimability path exists at proof execution time, PRD-082 is blocked and a transport-path patch is required before I2 may be attempted. Once reclaimability is confirmed: simulate processing failure after `rpc_claim_outbox_batch` but before `rpc_commit_consumer_receipt`; verify the row is reclaimable on the next relay cycle and processes successfully.

**FR-4 — Idempotency (I3).** Call `rpc_commit_consumer_receipt` with the same `event_id` twice. The second call must be rejected by the `processed_messages` guard. Proof state must contain exactly one record attributable to that event. No duplicate side effect is acceptable.

**FR-5 — Replayability (I4).** Generate a history of exemplar events via live processing. Capture proof-state row fingerprint or hash from `outbox_integration_proof_state`. Truncate proof state. Re-drive the same ordered `finance_outbox` rows through the relay path. Final state must match the captured fingerprint deterministically. `processed_messages` must not be used as the replay proof-state surface — it is an idempotency guard, not a projection.

**FR-6 — Runtime drift check.** Check and document behavior of: RPC execution under service-role, cron-secret header validation, RLS grant/deny behavior, and ENV var resolution. Record whether local and preview environments diverge.

**FR-7 — Signoff artifact.** `WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` must contain: `environment_tested`, `commands_or_scripts_run`, `I1_result`, `I2_result`, `I3_result`, `I4_result`, `runtime_drift_findings`, `decision`.

### Non-Functional Requirements

**NFR-1 — Environment is expendable.** Test data is synthetic. No production data required or permitted.

**NFR-2 — Scope discipline.** Any finding that requires producer expansion, schema redesign, or ADR amendment must stop the proof and trigger a FIB amendment before proceeding.

**NFR-3 — Fixes are transport-path only.** If a failure is discovered, only the exemplar transport path may be patched. The proof must rerun after any patch before issuing a pass decision.

---

## 6. UX / Flow Overview

This slice has no operator-visible UI. The "UX" is the developer execution flow:

1. Reset local Supabase DB to a clean migration state; run seed procedure.
2. Invoke `rpc_create_financial_txn` and `rpc_record_grind_observation` via Supabase client or `curl`; inspect `finance_outbox` rows.
3. Run atomicity failure injection for each producer; verify rollback via direct table query.
4. Trigger relay route once; interrupt before `rpc_commit_consumer_receipt`; verify row is reclaimable; trigger relay again to completion.
5. Re-deliver same `event_id` via `rpc_commit_consumer_receipt`; verify rejection and single proof-state record.
6. Run full replay scenario; compare proof-state hashes.
7. Execute runtime drift checklist; note any env deltas.
8. Write `WAVE-2-INTEGRATION-PROOF-SIGNOFF.md`; set decision field.

---

## 7. Dependencies & Risks

### Dependencies (all satisfied by PRD-081)

| Artifact | Status |
|---|---|
| `finance_outbox` DDL | Migration `20260511134100` ✓ |
| `processed_messages` DDL | Migration `20260511134300` ✓ |
| `rpc_claim_outbox_batch` | Migration `20260511134400` ✓ |
| `rpc_commit_consumer_receipt` | Migration `20260511134450` ✓ |
| `rpc_create_financial_txn` (outbox-emitting) | Migration `20260511134600` ✓ |
| `rpc_record_grind_observation` | Migration `20260511134700` ✓ |
| Relay route | `app/api/internal/outbox-relay/route.ts` ✓ |
| Local Supabase stack | Required; must be resetable |

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Relay claim lock prevents reclaimability on interruption | Medium | Verify `rpc_claim_outbox_batch` claim-expiry or retry semantics before running durability proof |
| `CRON_SECRET` not set locally | Low | Check ENV before executing relay; document in signoff |
| Replay hash comparison is non-deterministic due to timestamp ordering | Medium | Sort replay by `finance_outbox.created_at` strictly; use row identity (not wall-clock) for state comparison |
| Atomicity failure injection is difficult to simulate at application layer | Medium | Use a Postgres advisory lock or explicit `RAISE EXCEPTION` injection inside a test wrapper function |

### Open Questions

- Claim reclaimability is required before I2 execution (see FR-3). If `rpc_claim_outbox_batch` lacks expiry or reclaim semantics, a transport-path patch is required before proceeding.
- `outbox_integration_proof_state` is the designated proof-state surface for I4 replay comparison. A migration introducing this table is in scope for this slice.

---

## 8. Definition of Done

The slice is considered **Done** when:

**Invariant Proofs**
- [ ] I1 Atomicity proven for `rpc_create_financial_txn`: success and failure paths both confirmed by content inspection.
- [ ] I1 Atomicity proven for `rpc_record_grind_observation`: success and failure paths both confirmed by content inspection.
- [ ] I2 Durability pre-check: `rpc_claim_outbox_batch` reclaimability confirmed via expiry or reclaim path before proof execution.
- [ ] I2 Durability proven: committed row survives simulated relay interruption and processes successfully on retry via the verified reclaim path.
- [ ] I3 Idempotency proven: duplicate `event_id` delivery produces exactly one logical side effect.
- [ ] I4 Replayability proven: `outbox_integration_proof_state` replay fingerprint matches live-processing fingerprint deterministically.

**Runtime Drift**
- [ ] Runtime drift check executed and findings recorded (pass, fail, or noted delta) for all areas listed in FR-6.

**Evidence Artifact**
- [ ] `WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` exists at the designated path.
- [ ] All required fields present and non-empty.
- [ ] Decision field is set to one of: "Phase 2.1 authorized" or "Phase 2.1 blocked — patch required".

**Scope Discipline**
- [ ] No producer expansion, projection stores, UI changes, or ADR amendments were introduced during this slice.
- [ ] If any transport patch was required, the proof was fully rerun after the patch before issuing the decision.

---

## 9. Related Documents

| Document | Purpose |
|---|---|
| `PRD-081-transactional-outbox-gap-f1-closure-v0.md` | Exemplar implementation this proof validates |
| `FIB-W2-INTEGRATION-PROOF.md` | Human-readable FIB authority for this slice |
| `fib-s-integration-proof.json` | Machine-readable FIB-S spec (Zachman coverage, entry/exit criteria) |
| `WAVE-2-ROLLOUT-MAP.md` | Phase sequencing authority; Phase 2.1 blocked until this PRD exits |
| `docs/80-adrs/ADR-052.md` | Financial Fact Model (Dual-Layer) — authority/telemetry class definitions |
| `docs/80-adrs/ADR-053.md` | Financial System Scope Boundary — pilot scope, truth-claim boundary |
| `docs/80-adrs/ADR-054.md` | Financial Event Propagation and Surface Contract — outbox delivery guarantees |
| `docs/80-adrs/ADR-055.md` | Cross-Class Authoring Parity — envelope shape and transaction discipline |
| `docs/deployments/ENVIRONMENT-FLOW.md` | Environment architecture for runtime drift check |
| `outbox_integration_proof_state` migration (this slice) | Harness-only proof-state table for I4 replay hashing |
| `WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` (produced by this slice) | Gate artifact; decision field authorizes or blocks Phase 2.1 |
| `FIB amendment: outbox_integration_proof_state exception` | Exempts harness table from "no projection stores" exclusion |

---

## Appendix A: Signoff Artifact Template

Path: `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/WAVE-2-INTEGRATION-PROOF-SIGNOFF.md`

```markdown
---
id: WAVE-2-INTEGRATION-PROOF-SIGNOFF-001
prd: PRD-082
date: YYYY-MM-DD
environment_tested: [local | preview | both]
---

# Wave 2 Integration Proof — Signoff

## Environment
[Describe stack: local Supabase version, branch, migration state]

## Commands / Scripts Run
[Exact invocations used for each proof scenario]

## Invariant Results

| Invariant | Result | Notes |
|---|---|---|
| I1 Atomicity — rpc_create_financial_txn | PASS / FAIL | |
| I1 Atomicity — rpc_record_grind_observation | PASS / FAIL | |
| I2 Durability | PASS / FAIL | |
| I3 Idempotency | PASS / FAIL | |
| I4 Replayability | PASS / FAIL | |

## Runtime Drift Findings
[Note any behavioral differences between environments, or "None observed"]

## Failures Encountered
[List any failures; patches applied; re-run confirmation]

## Decision

> **Phase 2.1 authorized** | **Phase 2.1 blocked — patch required**

[One sentence rationale]
```

---

## Appendix B: Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0 | 2026-05-11 | Lead Architect | Initial draft from FIB-W2-INTEGRATION-PROOF-001 |
| v1 | 2026-05-11 | Lead Architect | Accepted: FR-3 claim-reclaimability mandatory; outbox_integration_proof_state harness table authorized; ADR labels corrected; open questions resolved |

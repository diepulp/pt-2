---
id: PRD-087
title: Wave 2 Phase 2.3 — Class A Lifecycle Completeness Proof
owner: Lead Architect
status: Draft
affects: [ADR-052, ADR-053, ADR-054, ADR-055, PRD-081, PRD-083, PRD-085]
created: 2026-05-19
last_review: 2026-05-19
phase: Wave 2 Phase 2.3
pattern: B
http_boundary: false
scope_authority: docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3/PRD-CONTAINMENT.md
cadence_authority: docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3/EXEC-087-CADENCE-DIRECTIVE.md
---

# PRD-087 — Wave 2 Phase 2.3: Class A Lifecycle Completeness Proof

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Phase 2.3 proves that one ledger-authoritative Class A outbox stream can update one visit-level projection and produce a lifecycle-aware completeness signal, without consuming or damaging Phase 2.4 operational inputs. It resolves **DEC-1**: all visit-level financial aggregates currently emit `completeness.status: 'unknown'` always because the system has no lifecycle-aware projection mechanism. The work is structured as two sequential gates: Gate A stabilises the shared outbox envelope (adding `gaming_day` to `finance_outbox` and amending all producers) before Gate B activates the first Class A consumer projection. This slice is a **vertical collapse** — one stream, one projection store, one completeness signal. Operational telemetry, grind, fills, and credits are Phase 2.4.

---

## 2. Problem & Goals

### 2.1 Problem

Every call to `GET /api/v1/visits/{visitId}/financial-summary` and `GET /api/v1/rating-slips/{id}/modal-data` returns financial values with `completeness.status: 'unknown'`. This is not a rendering bug — it is correct behaviour given the system's current state: there is no lifecycle-aware projection, and no signal indicating when a gaming day is closed.

`VisitFinancialSummaryDTO` and `FinancialSectionDTO` aggregate across `player_financial_transaction` rows but have no way to determine whether the gaming day that produced those rows is still open or has closed. Without that signal, `'complete'` is never safe to emit, and `'partial'` is never distinguishable from `'unknown'`.

The transport substrate is proven (Phases 2.0–2.2). Five producer paths emit to `finance_outbox`. The gap is the consumer layer: no projection reads those events, and no lifecycle mechanism exists to mark a gaming-day window as closed.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1** — DEC-1 resolved | `VisitFinancialSummaryDTO.total_in/total_out/net_amount` completeness status is `'complete'` or `'partial'` for visits with flowing Class A events; `'unknown'` only when no projection data exists |
| **G2** — `gaming_day` envelope hardened | `finance_outbox.gaming_day` is NOT NULL; all five existing producers emit a non-null value; immutability guard covers it |
| **G3** — Consumer is idempotent | Duplicate delivery of the same `event_id` produces exactly one projection update (I3 re-verified at consumer layer) |
| **G4** — Projection is replayable | Truncating the projection store and replaying Class A events from `finance_outbox` produces the same completeness state as live processing (I4 re-verified at consumer layer) |
| **G5** — Phase 2.4 inputs preserved | Non-ledger rows (`fact_class = 'operational'`) remain with `processed_at IS NULL` after Phase 2.3 consumer runs; no Phase 2.4 data is consumed or damaged |

### 2.3 Non-Goals

The following are **explicitly out of scope** for this PRD. They require Phase 2.4 or a new FIB amendment.

- Consuming `grind.observed`, `fill.recorded`, or `credit.recorded`
- Operational telemetry projections (shift-level Class B or Dependency Event state)
- Mixed-source surface completion — any surface where non-Class-A contributors affect values must remain `'partial'` until Phase 2.4 owns that path
- Replay UI or operator-facing gaming-day close UI
- Reconciliation or authoritative financial totals
- Changes to `player_financial_transaction` schema or any authoring table

---

## 3. Users & Use Cases

- **Primary user:** Internal system — the relay worker and consumer projection service. No operator-facing action is introduced.
- **Secondary beneficiaries:** Pit bosses and floor supervisors who see visit financial summaries and rating slip modal data — they gain meaningful completeness signals instead of perpetual `'unknown'`.

**Top Jobs:**

- As the **relay consumer**, I need to read `buyin.recorded`, `cashout.recorded`, and `adjustment.recorded` events and update a projection store atomically with idempotency, so that visit financial summaries can emit meaningful completeness signals.
- As the **relay consumer**, I need the `finance_outbox` envelope to carry a `gaming_day` field, so that the projection can scope aggregates to a gaming-day window and apply a lifecycle close signal.
- As a **pit boss**, I need the visit financial summary to show `'complete'` when the gaming day is closed and all Class A events are processed, so that I can trust the displayed totals are final for that window.
- As a **pit boss**, I need the visit financial summary to show `'partial'` when the gaming day is still open, so that I know the values are correct but not yet final.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Gate A — Envelope Compatibility (prerequisite for Gate B):**
- Add `finance_outbox.gaming_day` column (nullable migration, then NOT NULL hardening after all producers are amended)
- Amend `fn_finance_outbox_emit` to accept and pass `gaming_day`
- Amend all five existing producers to emit non-null `gaming_day`: `rpc_create_financial_txn`, `rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_record_grind_observation`
- Add `gaming_day` to the `fn_finance_outbox_immutable_envelope()` immutability guard
- Add `gaming_day` to `FinancialOutboxEventDTO` Pick (after DB types are regenerated)

**Gate B — Class A Projection (proceeds only after Gate A passes):**
- `visit_class_a_projection` store: gaming-day-scoped Class A financial state per visit
- `rpc_process_class_a_projection(p_message_id)`: claims only `fact_class = 'ledger'`; leaves non-ledger rows with `processed_at IS NULL`
- `processed_messages` idempotency check wired within same DB transaction as projection update
- Gaming-day lifecycle close signal mechanism that marks a window as closed (enabling `'complete'` emission)
- Updated completeness logic in `VisitFinancialSummaryDTO`: `'complete'` when gaming-day closed, `'partial'` when open, `'unknown'` only when no projection data
- Updated completeness logic in `FinancialSectionDTO` equivalently

### 4.2 Out of Scope

- Consumer for `grind.observed`, `fill.recorded`, `credit.recorded` (Phase 2.4)
- Operational or shift-level projection store (Phase 2.4)
- Operator-facing gaming-day close interface
- Relay log-line metrics (`outbox_backlog_size`, `processing_lag_ms`) — Phase 2.5
- Any changes to `player_financial_transaction` or grind authoring stores

---

## 5. Requirements

### 5.1 Functional Requirements

**Gate A:**
- `finance_outbox.gaming_day` must be NOT NULL after Gate A migrations complete; Gate A may harden the constraint only after every existing row has an authoritative gaming-day derivation (see §7.2 for derivation rules)
- Every call to `fn_finance_outbox_emit` must require a `gaming_day` argument; the old signature without it must not remain
- `gaming_day` must be listed in the `fn_finance_outbox_immutable_envelope()` trigger so post-insert updates are rejected
- Before the helper signature or privilege change is accepted, EXEC-087 must verify the `SECURITY DEFINER` / `SECURITY INVOKER` posture of all five producer RPCs and confirm that helper EXECUTE privileges match each producer's execution posture; Gate A fails if any authenticated producer write path breaks after the helper change

**Gate B:**
- The consumer must inspect `fact_class` directly from the outbox row — never infer it from payload content
- `origin_label` must travel unchanged through the projection path and rendered surface; if the projection store persists origin authority, it must copy the value from the outbox row and may not infer or upgrade it
- Before implementing `rpc_process_class_a_projection`, EXEC-087 must inspect the physical `processed_messages` DDL and align the consumer idempotency fence with the actual key shape; the EXEC may not assume `message_id`, `event_id`, or a composite key without proving the schema or authoring a normalisation migration
- The consumer must write to `processed_messages` and the projection store within the same transaction; partial writes are not permitted
- Non-ledger rows (`fact_class = 'operational'`) must not be processed or marked `processed_at`; they must remain available for Phase 2.4
- `VisitFinancialSummaryDTO.{total_in, total_out, net_amount}.completeness.status` must be:
  - `'complete'` when the gaming-day window is closed and the Class A projection backlog for that visit is empty
  - `'partial'` when the gaming-day window is open (regardless of event count)
  - `'unknown'` only when no projection data exists for the visit
- `FinancialSectionDTO.{totalCashIn, totalCashOut, netPosition}.completeness.status` must follow the same logic
- Mixed-source surfaces — any surface where non-Class-A contributors affect rendered values — must remain `'partial'` until Phase 2.4 owns that projection path

### 5.2 Non-Functional Requirements

- No 100× amount corruption: projection amounts must be stored and served in the same integer-cents unit as PFT source rows
- Consumer idempotency must hold under concurrent relay delivery: two relay cycles delivering the same `event_id` must produce exactly one projection update
- Gate A migrations must not break any authenticated write path; all five producer RPCs must pass their existing test suites after amendment

> Architecture details: See `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`, `ADR-052` through `ADR-055`.

---

## 6. UX / Flow Overview

This phase has no new operator-facing UI. The observable change is in two existing surfaces.

**Flow 1: Visit financial summary — gaming day open**
1. Relay worker claims Class A events for a visit from `finance_outbox`
2. Consumer calls `rpc_process_class_a_projection` for each `event_id`
3. Projection store records buy-in / cashout / adjustment amounts under the gaming-day window
4. `GET /api/v1/visits/{visitId}/financial-summary` reads projection store; gaming day is open → returns `completeness.status: 'partial'` on all financial values

**Flow 2: Visit financial summary — gaming day closed**
1. Gaming-day lifecycle close signal marks the window as closed in the projection store
2. Relay processes remaining Class A events for that window
3. `GET /api/v1/visits/{visitId}/financial-summary` reads projection store; no pending Class A backlog for this gaming day → returns `completeness.status: 'complete'`

**Flow 3: Duplicate delivery (idempotency)**
1. Relay delivers `event_id` X to the consumer
2. `processed_messages` check finds existing receipt for X → consumer returns `'duplicate'`
3. Projection store is unchanged; completeness status is unchanged

**Flow 4: Replay**
1. Projection store is truncated (e.g., disaster recovery)
2. Relay replays Class A events from `finance_outbox` in `(table_id, event_id)` order
3. Consumer rebuilds projection; resulting completeness state matches pre-truncation state

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 2.1 exit** (`PRD-083` certified 2026-05-18) — `rpc_create_financial_adjustment` emits to `finance_outbox`; required for `adjustment.recorded` consumer path
- **Phase 2.2 exit** (`PRD-085` complete 2026-05-19) — fills and credits wired; non-ledger rows present in `finance_outbox` and must be preserved unprocessed
- **Transport infrastructure** (`PRD-081`, commit `8a1b8741`) — `finance_outbox` DDL, `processed_messages`, `rpc_claim_outbox_batch`, `rpc_commit_consumer_receipt`, relay worker all in place; not reinstated in this phase
- **Pre-EXEC gate** — EXEC-087 authoring is blocked until `payload.visit_id` presence is verified in migrations `20260511134903` (`rpc_create_financial_txn` extension) and `20260517234015` (`rpc_create_financial_adjustment` extension); the projection store requires `visit_id` provenance from the outbox payload

### 7.2 Risks & Open Questions

- **`gaming_day` backfill — authoritative derivation only** — Migrations `20260511134129` through `20260518134715` emitted rows without a `gaming_day` column. Gate A may harden the NOT NULL constraint only after every existing row has an authoritative derivation. Accepted rules: (1) ledger rows derive `gaming_day` from `player_financial_transaction.gaming_day` via `finance_outbox.aggregate_id`; (2) operational rows derive only from their authoring source if that source exposes a stable `gaming_day`; (3) if an event type has no authoritative derivation, Gate A fails closed until a remediation migration is authored. No timestamp inference, no synthetic placeholder, no NULL-resolved fake value, no manual deletion in shared/staging/remote environments. In local disposable development only, rows may be cleared before rerunning migrations — this is not a shared-environment remediation strategy.
- **Gaming-day close signal mechanism** — The mechanism (a lifecycle column, a close event, or a separate signal table) is an architectural decision for EXEC-087. The PRD requires it exists; the form is deferred to the EXEC. Must not require an operator UI action in this phase.
- **`FinancialOutboxEventDTO` shape change** — Adding `gaming_day` to the Pick type extends the frozen consumer contract. Verify no downstream consumer of `FinancialOutboxEventDTO` breaks on an added field before Gate A is merged.
- **Mixed-source surface identification** — The architect must enumerate which rendered surfaces receive both Class A and non-Class-A contributors before EXEC-087 authoring, to correctly scope which surfaces remain `'partial'` after Gate B.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Gate A — Envelope Compatibility**
- [ ] `finance_outbox.gaming_day` is NOT NULL (migration applied, constraint hardened)
- [ ] Existing `finance_outbox` rows have authoritative `gaming_day` derivation, or Gate A fails closed
- [ ] All five existing producers emit non-null `gaming_day` (proven by producer unit tests passing after amendment)
- [ ] Producer `SECURITY DEFINER` / `SECURITY INVOKER` posture verified and helper privileges aligned
- [ ] No old `fn_finance_outbox_emit` call site omits `gaming_day`
- [ ] `gaming_day` is protected by the immutability trigger
- [ ] No authenticated write path is broken (all affected producer test suites pass)

**Gate B — Class A Projection**
- [ ] `processed_messages` physical idempotency key shape verified before consumer SQL ships
- [ ] DEC-1 resolved: `VisitFinancialSummaryDTO` and `FinancialSectionDTO` emit `'complete'` or `'partial'` for visits with Class A projection data
- [ ] Duplicate delivery does not double-project (I3 consumer re-verification test passes)
- [ ] Replay from `finance_outbox` produces identical completeness state (I4 consumer re-verification test passes)
- [ ] Non-ledger rows remain with `processed_at IS NULL` after consumer runs
- [ ] No amount unit corruption: projection amounts match PFT source in integer cents
- [ ] `origin_label` travels unchanged through the projection path and rendered surface

**Scope Containment**
- [ ] No consumer reads `grind.observed`, `fill.recorded`, or `credit.recorded`
- [ ] No operator-facing gaming-day close UI introduced

**Quality Gates**
- [ ] `npm run db:types-local` exits 0 after all migrations
- [ ] `type-check`, `lint`, `build` exit 0

---

## 9. Related Documents

- **Scope authority:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3/PRD-CONTAINMENT.md`
- **Cadence authority:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3/EXEC-087-CADENCE-DIRECTIVE.md`
- **Wave 2 phase plan:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md` §4 Phase 2.3
- **Wave 2 tracker:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`
- **Outbox knowledge base:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`
- **ADR authority set:** `docs/80-adrs/ADR-052` through `ADR-055` (frozen 2026-04-23)
- **Financial model authority:** `docs/issues/gaps/financial-data-distribution-standard/` (FMA skill)
- **Transport proof:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/WAVE-2-INTEGRATION-PROOF-SIGNOFF.md`
- **Prerequisite PRDs:** PRD-081 (transport substrate), PRD-083 (adjustment producer), PRD-085 (fill/credit producers)
- **Schema / Types:** `types/database.types.ts` — regenerate with `npm run db:types-local` after Gate A migrations
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.11.0

---

## Appendix A: Gate Execution Sequence

Gate A and Gate B are sequential within this PRD. Gate B must not activate the consumer before Gate A passes all proofs.

```
Gate A — Envelope Compatibility
  ├── migration: add finance_outbox.gaming_day (nullable)
  ├── migration: amend fn_finance_outbox_emit signature
  ├── migration: amend all five producers (gaming_day argument)
  ├── migration: harden gaming_day NOT NULL
  ├── migration: update immutability trigger
  ├── FinancialOutboxEventDTO: add gaming_day to Pick
  └── PROOF: all producers emit non-null gaming_day, no write path broken

Gate B — Class A Projection (after Gate A passes)
  ├── migration: create visit_class_a_projection store
  ├── migration: create rpc_process_class_a_projection
  ├── consumer service: reads ledger events, skips operational rows
  ├── completeness logic: VisitFinancialSummaryDTO + FinancialSectionDTO
  ├── PROOF I3: duplicate delivery → one projection update
  ├── PROOF I4: replay → identical completeness state
  └── PROOF: non-ledger rows remain with processed_at IS NULL
```

## Appendix B: DEC-1 Resolution Targets

| DTO Field | Route | Current State | After Phase 2.3 |
|-----------|-------|--------------|-----------------|
| `VisitFinancialSummaryDTO.total_in` | `GET /api/v1/visits/{visitId}/financial-summary` | `completeness: 'unknown'` | `'complete'` / `'partial'` / `'unknown'` |
| `VisitFinancialSummaryDTO.total_out` | same | `completeness: 'unknown'` | `'complete'` / `'partial'` / `'unknown'` |
| `VisitFinancialSummaryDTO.net_amount` | same | `completeness: 'unknown'` | `'complete'` / `'partial'` / `'unknown'` |
| `FinancialSectionDTO.totalCashIn` | `GET /api/v1/rating-slips/{id}/modal-data` | `completeness: 'unknown'` | `'complete'` / `'partial'` / `'unknown'` |
| `FinancialSectionDTO.totalCashOut` | same | `completeness: 'unknown'` | `'complete'` / `'partial'` / `'unknown'` |
| `FinancialSectionDTO.netPosition` | same | `completeness: 'unknown'` | `'complete'` / `'partial'` / `'unknown'` |

`'unknown'` remains valid only when no Class A projection data exists for the visit (e.g., a visit with zero PFT transactions or a visit processed before Phase 2.3 migration).

## Appendix C: Consumer Constraints (Non-Negotiable)

These constraints are authoritative (ADR-054, outbox knowledge base) and cannot be relaxed by the EXEC-SPEC:

1. `processed_messages` idempotency check must occur before any projection side effect
2. `origin_label` travels unchanged; no upgrade from `'estimated'` to `'actual'`
3. Consumer must not write to `player_financial_transaction` or any authoring store
4. Consumer must not perform reconciliation
5. Consumer reads `fact_class` and `origin_label` directly from the outbox row — never infers from payload
6. Consumer claims only `fact_class = 'ledger'`; non-ledger rows remain with `processed_at IS NULL`

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.x | 2026-05-19 | — | Discarded — grew into implementation dump |
| 1.0 | 2026-05-19 | Vladimir Ivanov | Re-draft from containment directive. Gate A / Gate B structure. Scope reset to vertical collapse. |
| 1.1 | 2026-05-19 | Vladimir Ivanov | Audit delta applied: authoritative gaming_day derivation rules (P0/P1), producer execution posture proof (P1), processed_messages schema proof (P1), origin_label wording precision (P2). |

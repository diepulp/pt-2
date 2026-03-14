# Feature Brief: Cross-Property Player Recognition and Loyalty Entitlement

**ID:** PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
**Date:** 2026-03-13
**Author:** Lead Architect
**Status:** Proposed

---

## Goal

Enable staff at their home casino to recognize players enrolled at sister properties, view company-usable loyalty entitlement, receive exclusion safety signals, activate the player locally, and redeem allowed entitlement through local workflows — without switching casino context or exposing operational telemetry across properties.

---

## Primary Actor

**Pit Boss / Floor Supervisor** — Staff at their assigned casino performing patron recognition, local activation, and loyalty workflows.

---

## Primary Scenario

Staff looks up a patron by name. System returns the player's identity, cross-company enrollment status, company-usable loyalty entitlement, and any exclusion safety signals from sister properties. If the player is not enrolled locally, staff activates them at the current property and proceeds with gaming and loyalty workflows.

---

## Success Metric

Company-scoped player lookup returns correct results within existing RPC latency SLO (<200ms p95). Single-casino staff see zero behavioral change. RLS audit confirms no cross-property operational data leakage.

---

## Bounded Context

| Aspect | Details |
|---|---|
| **Owner Service(s)** | CasinoService (enrollment + activation), LoyaltyService (entitlement + redemption), Platform/Auth (RPCs + RLS) |
| **Writes** | `player_casino` (activation), `loyalty_ledger` (redemption), `audit_log` (new event types) |
| **RLS Policy Changes** | `player_casino` (company-scoped SELECT), `player_loyalty` (company-scoped SELECT, entitlement projection) |
| **Scalar Extraction (no policy change)** | `visit` → `last_company_visit` timestamp, `player_exclusion` → safety signal |
| **Cross-Context Contracts** | `RecognitionSummaryDTO`, `PlayerEnrollmentDTO`, `PlayerLoyaltyEntitlementDTO` |

---

## Non-Goals (8 Explicit Exclusions)

1. **Staff multi-casino operations / tenant switching** — Staff remains single-casino-bound. No junction table, no tenant picker. Scope inset is explicit.
2. **Raw `visit` row exposure cross-property** — Contains gaming_day, visit_kind, duration, visit_group_id (operational telemetry). 5 CRITICAL child tables. Host context served as scalar timestamp only.
3. **Raw `loyalty_ledger` exposure cross-property** — Contains campaign context, staff linkage, visit linkage, accrual rules. If history is ever needed cross-property, it must be a sanitized projection.
4. **Cross-property financial transparency** — Buy-in/cash-out amounts, player_financial_transaction rows, pit_cash_observation remain property-scoped.
5. **Company-wide exclusion propagation** — ADR-042 defers this. Phase 2 provides a boolean safety signal + severity, not full exclusion detail sharing.
6. **Card scanner / swipe interoperability** — Manual lookup only per operational addendum. Scanner is a future lookup input, not a different workflow.
7. **ADR-024 INV-8 amendment** — No `p_selected_casino_id`. No client-supplied casino selection. `app.company_id` (Phase 1) is the only tenancy primitive needed.
8. **`player_loyalty.preferences` cross-property exposure** — Entitlement projection limited to `current_balance` + `tier`. Non-essential fields excluded.

---

## Dependencies

| Dependency | Type | Status |
|---|---|---|
| ADR-043 Phase 1 (company foundation) | Required | Implemented (commit `e86e5eb`) |
| `app.company_id` session variable | Required | Implemented (Phase 1) |
| `casino.company_id` NOT NULL + RESTRICT FK | Required | Implemented (Phase 1) |
| `RLSContext.companyId` in TypeScript | Required | Implemented (Phase 1) |
| `player_exclusion` table + RPCs (ADR-042) | Required for safety signal | On `player-exclusion` branch — not yet merged to this branch |
| LoyaltyService (player_loyalty, loyalty_ledger) | Required | Implemented |
| CasinoService (player_casino) | Required | Implemented |

---

## Risks / Open Questions

| Risk / Question | Impact | Mitigation / Answer Needed |
|---|---|---|
| D3: Activation RPC design — new RPC vs. extend existing `player_casino` INSERT | Medium | New audited RPC recommended (captures activation intent distinctly from enrollment). Freeze in ADR-044. |
| D5: Exclusion UX policy — what severity triggers what response | Medium | Product decision for PRD-051. System provides signal; business rules determine block vs. warn vs. escalate. |
| D6: Local redemption mechanics — how Casino B debits company entitlement | High | Requires loyalty domain analysis. Casino B creates local `loyalty_ledger` entry. Exact debit semantics need LoyaltyService design. |
| D7: Canonical redemption surface — single total vs. per-property vs. hybrid | High | Product + architecture decision. Determines RPC return shape and whether `player_loyalty` rows are presented individually or aggregated. Must freeze in ADR-044. |
| `player_exclusion` branch not merged | Medium | Safety signal depends on this table. Can proceed with recognition + entitlement first; add exclusion signal after merge. |
| Company-scoped RLS performance on `player_casino` | Low | EXISTS subquery on indexed `casino.company_id`. Benchmark during implementation. |

---

## Next Steps

1. [x] Feature Boundary Statement approved
2. [ ] Feature Brief approved (this document)
3. [ ] PRD-051 drafted (product requirements + UX states + exclusion policy)
4. [ ] SEC_NOTE reviewed (threat model for company-scoped read expansion + scalar extraction)
5. [ ] ADR-044 created and frozen (D3, D5, D6, D7 decisions locked)
6. [ ] EXEC-SPEC + DoD generated

---

**Gate:** If you can't list 5+ non-goals, you're about to overbuild.

# Feature Boundary Statement: Cross-Property Player Recognition and Loyalty Entitlement (ADR-044)

> **Ownership Sentence:** This feature spans **CasinoService** (enrollment visibility + local activation), **LoyaltyService** (entitlement visibility + local redemption), and **Platform/Auth** (RLS policy broadening + SECURITY DEFINER RPCs). CasinoService writes to `player_casino` (activation); LoyaltyService writes to `loyalty_ledger` (redemption). Cross-context needs go through **RecognitionSummaryDTO**, **PlayerEnrollmentDTO**, and **PlayerLoyaltyEntitlementDTO**.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **CasinoService** (Foundational) — enrollment visibility via company-scoped RLS on `player_casino`; local activation write
  - **LoyaltyService** (Reward) — entitlement visibility via company-scoped RLS on `player_loyalty`; local redemption write to `loyalty_ledger`
  - **Platform/Auth** — SECURITY DEFINER recognition RPC (`rpc_lookup_player_company`), activation RPC (`rpc_activate_player_locally`), RLS policy changes

- **Writes:**
  - `player_casino` (local activation — new enrollment row at current casino)
  - `loyalty_ledger` (local redemption — debit entry against company-recognized entitlement)
  - `audit_log` (new event types: `company_lookup`, `local_activation`, `loyalty_redemption`)

- **RLS Policy Changes (READ only):**
  - `player_casino` — company-scoped SELECT (Tier 1: dual-mode RLS)
  - `player_loyalty` — company-scoped SELECT (Tier 1: dual-mode RLS, entitlement projection)

- **Reads (via SECURITY DEFINER scalar extraction, NO policy change):**
  - `visit` — `last_company_visit` scalar timestamp only
  - `player_exclusion` — `has_sister_exclusions` boolean + `max_exclusion_severity` text only

- **Cross-context contracts:**
  - `RecognitionSummaryDTO` — composite recognition + entitlement response from `rpc_lookup_player_company`
  - `PlayerEnrollmentDTO` — enrollment state (existing, from CasinoService)
  - `PlayerLoyaltyEntitlementDTO` — company-usable entitlement projection (new, from LoyaltyService)
  - `CasinoService.activatePlayerLocally()` — local enrollment creation
  - `LoyaltyService.redeemEntitlement()` — local redemption against company entitlement

- **Non-goals (top 5):**
  1. Staff switching active casino context / tenant picker / multi-casino operations
  2. Raw `visit`, `loyalty_ledger`, `rating_slip`, `player_financial_transaction`, or `mtl_entry` exposure cross-property
  3. Cross-property financial transparency (buy-in/cash-out visibility across casinos)
  4. Company-wide exclusion propagation (ADR-042 defers this — Phase 2 provides safety signal only)
  5. Card scanner / swipe interoperability (manual lookup only per operational addendum)

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-044)

---

## Goal

Enable staff at Casino B to recognize players enrolled at sister properties, view their company-usable loyalty entitlement, receive safety signals about sister-property exclusions, activate the player locally, and redeem allowed entitlement through Casino B-local workflows — without switching casino context or exposing operational telemetry across properties.

## Primary Actor

**Pit Boss / Floor Supervisor** (staff at their home casino performing patron recognition and loyalty workflows)

## Primary Scenario

Staff looks up a patron by name. System finds the player enrolled at a sister property, shows enrollment status, company-usable loyalty entitlement, and any exclusion safety signals. Staff activates the player locally and proceeds with Casino B gaming and loyalty workflows.

## Success Metric

Company-scoped player lookup returns correct results within existing RPC latency SLO (<200ms p95). Single-casino staff see zero behavioral change. No cross-property operational data leakage in RLS audit.

---

## Architectural Context

| Document | Purpose | Location |
|---|---|---|
| **ADR-043** | Phase 1 foundation (company entity, `app.company_id`) | `docs/80-adrs/ADR-043-dual-boundary-tenancy.md` |
| **ADR-044** | Phase 2 decisions (this feature) | `docs/80-adrs/ADR-044-cross-property-recognition-entitlement.md` |
| **PHASE-2-SCOPE-REALIGNMENT** | Scope definition | `docs/00-vision/DUAL-BOUNDARY-TENANCY/PHASE-2/PHASE-2-SCOPE-REALIGNMENT.md` |
| **PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION** | Surface design + exclusion safety | `docs/00-vision/DUAL-BOUNDARY-TENANCY/PHASE-2/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md` |
| **Feature Boundary** | This file | `docs/20-architecture/specs/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION/FEATURE_BOUNDARY.md` |

## SRM Version Note

This feature requires SRM amendment to register:
- Company-scoped RLS on `player_casino` (CasinoService) and `player_loyalty` (LoyaltyService)
- New SECURITY DEFINER RPCs: `rpc_lookup_player_company`, `rpc_activate_player_locally`
- New audit event types in `audit_log`
- `player_exclusion` read (scalar extraction) — table not yet registered in SRM (pending `player-exclusion` branch merge)

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

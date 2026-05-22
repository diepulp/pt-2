# PRD-032 — Cage Chip Purchase Telemetry (Aspirational Addendum)

> **Relationship:** This is an **aspirational addendum** to **PRD-033** (Cashier Workflow MVP). PRD-033 delivers the core cashier console with the three required attestations (cash-out, fill/credit confirmation, drop received). This PRD adds cage chip purchase as an optional capability once the cashier console exists. Implement PRD-033 first.

## 1. Overview

- **Owner:** Product
- **Status:** Draft (Aspirational — implement after PRD-033)
- **Version:** 0.1.1
- **Date:** 2026-02-11
- **Vision Source:** `docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-ADDENDUM-CAGE-BUYIN-v0.1.md`
- **Parent:** PRD-033 (Cashier Workflow MVP), PRD-009 (Player Financial Service)
- **Priority:** Optional but ready — quick add once PRD-033 cashier console exists

**Summary:** This PRD adds **cage chip purchase telemetry** as a new transaction type within the Cashier Console (delivered by PRD-033). The cage chip purchase capability resolves a documented gap where players arrive at tables pre-loaded with chips purchased at the cage, creating phantom bankroll ambiguity in shift narratives. This is bounded to **operational telemetry** — it explicitly excludes accounting, drawer balancing, and denomination tracking.

---

## 2. Problem & Goals

### 2.1 Problem

PT-2 has a fully implemented financial ledger service (PlayerFinancialService, PRD-009) with RPC write paths, RLS policies, and role-based validation for cashier, pit_boss, and admin roles. However:

1. **No cashier UI exists.** The `cashier` role was added via ADR-017 and Zod schemas validate cashier transactions, but there is no screen for cashiers to use. All cashier-role financial operations are API-only.

2. **Cage chip purchases are blocked by validation rules.** The current cashier Zod schema (`createFinancialTxnCashierSchema`) restricts cashiers to `direction='out'` or `tender_type='marker'` only. Cage chip purchases (`direction='in'`, `source='cage'`) are rejected. SRM v4.2.0 originally excluded cage buy-ins based on the assumption they were "not standard casino workflow," but operational reality shows otherwise — players routinely purchase chips at the cage for efficiency, high-denomination handling, and table-hopping scenarios.

3. **Phantom bankroll gaps in shift narratives.** When a player arrives at a table already holding chips from a cage purchase, the pit sees zero table buy-in. Without cage issuance telemetry, shift explanations for bankroll origin are incomplete, and drop/hold accuracy is compromised.

### 2.2 Goals

1. **Cashiers can record cage chip purchases** (chips issued to a player at the cage) as confirmed financial events, with player, amount, tender type, and optional visit linkage.
2. **Cashiers can record cash-outs** (chips redeemed for cash at the cage) linked to an active or recently-closed visit, using the existing `rpc_create_financial_txn` write path.
3. **Cashiers have a dedicated console UI** accessible from the sidebar navigation that provides player/visit search, transaction entry, and transaction history views.
4. **Cage chip purchase events appear in shift telemetry**, resolving phantom bankroll ambiguity for supervisors reviewing shift data.
5. **Void/correction workflow** follows the existing append-only adjustment pattern (via `rpc_create_financial_adjustment`) — no silent edits, no record deletion.

### 2.3 Non-Goals

- **No drawer balancing** — PT-2 does not track cage drawer contents or reconciliation
- **No denomination breakdown** — transactions record total amounts only
- **No GL codes / chart of accounts** — no accounting system integration
- **No bank deposits or end-of-day cage close** workflow
- **No fill/credit confirmation UI** — table inventory operations are a separate concern (see PRD-031)
- **No drop received stamp** — deferred to future PRD
- **No marker credit management** (limits, aging, bad debt) — marker issuance/settlement uses simple transaction model only
- **No chip exchange / color-up tracking** — deferred post-MVP per vision addendum
- **No anonymous/walk-in transactions without visit linkage** — MVP requires visit context per SRM v4.2.0

---

## 3. Users & Use Cases

- **Primary users:** Cashier (staff with `role='cashier'`)
- **Secondary users:** Admin (full access), Compliance (read-only audit)

**Top Jobs:**

- As a **cashier**, I need to **record a cage chip purchase** (player exchanged cash for chips at the cage) so that the pit has accurate bankroll-source telemetry for shift narratives.
- As a **cashier**, I need to **record a cash-out** (player redeemed chips for cash at the cage) linked to the player's visit so that net cash flow per visit is accurate.
- As a **cashier**, I need to **search for a player and their active/recent visit** so that I can associate transactions with the correct session context.
- As a **cashier**, I need to **view my recent transactions** so that I can verify entries and catch mistakes quickly.
- As a **cashier**, I need to **void a mistaken transaction** using the adjustment workflow so that errors are corrected without destroying audit history.
- As a **supervisor/admin**, I need to **see cage chip purchase events in shift telemetry** so that "where did this bankroll come from?" questions have answers.

---

## 4. Scope & Feature List

### Cashier Console UI
1. Sidebar navigation entry for "Cashier" under Operational group
2. Player/visit search: lookup by name, player ID, or loyalty number
3. Active and recently-closed visit listing for a selected player
4. Transaction entry form with amount, tender type, and direction
5. Transaction confirmation step (with double-confirm for amounts exceeding configurable threshold)
6. Transaction history list (filtered to current cashier's entries, current gaming day)

### Cage Chip Purchase (New Capability)
7. Cage chip purchase transaction type: `direction='in'`, `source='cage'`, `tender_type` from MVP set
8. Cashier Zod schema expanded to allow `direction='in'` with `source='cage'`
9. Optional `external_ref` field for receipt/ticket number attachment
10. Cage chip purchase events visible in shift dashboard telemetry

### Cash-Out (Existing Backend, New UI)
11. Cash-out transaction entry: `direction='out'`, `source='cage'`, `tender_type='cash'`
12. Visit selection required for cash-out association

### Corrections
13. Adjustment workflow for cashier-entered transactions via existing `rpc_create_financial_adjustment`
14. Reason code + note required for all adjustments (existing constraint)

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1:** Cashier can create a cage chip purchase transaction with: player_id, visit_id, amount (positive, in cents per ADR-031), tender_type ('cash', 'chips'), and optional external_ref and notes.

**FR-2:** Cashier can create a cash-out transaction with: player_id, visit_id (required), amount, tender_type ('cash'), and optional notes.

**FR-3:** Cashier can search for players by name (partial match) and view their active or recently-closed visits (within current gaming day + configurable lookback window).

**FR-4:** Cashier can view a list of their own transactions for the current gaming day, with filters by direction and tender type.

**FR-5:** Cashier can create an adjustment to a previous transaction they entered, providing reason_code and note (min 10 chars). The adjustment creates a new record; original records are never modified.

**FR-6:** All cashier transactions are persisted via `rpc_create_financial_txn` with `source='cage'` and idempotency key support.

**FR-7:** Cage chip purchase events are included in shift dashboard telemetry aggregations (via existing `table_buyin_telemetry` bridge trigger or shift rollup RPCs).

**FR-8:** Transaction amounts follow ADR-031 convention: stored in cents, displayed in dollars at the UI boundary.

### 5.2 Non-Functional Requirements

**NFR-1:** Transaction creation latency p95 < 500ms (consistent with existing financial RPC performance).

**NFR-2:** Idempotency: duplicate submissions with the same idempotency key return the existing transaction without creating duplicates.

**NFR-3:** Casino-scoped RLS enforced on all reads and writes — cashier can only see/create transactions for their own casino.

> Architecture, schema, and RLS details: see SRM v4.12.0 (PlayerFinancialService section), ADR-015, ADR-017, ADR-024, ADR-030.

---

## 6. UX / Flow Overview

### 6.1 Cage Chip Purchase Flow
1. Cashier opens Cashier Console from sidebar
2. Searches player by name or ID
3. Selects player → system shows active/recent visits
4. Selects visit (or creates one if none exists — deferred, see Risks)
5. Taps "Chip Purchase" action
6. Enters amount + tender type (cash/chips) + optional receipt ref
7. Confirms → system calls `rpc_create_financial_txn` with `direction='in'`, `source='cage'`
8. Success confirmation with transaction ID displayed

### 6.2 Cash-Out Flow
1. Same player/visit search as above
2. Taps "Cash Out" action
3. Enters amount + notes
4. Confirms → `direction='out'`, `source='cage'`, `tender_type='cash'`

### 6.3 Correction Flow
1. Cashier opens transaction history
2. Selects the transaction to correct
3. Taps "Adjust" → enters delta amount, reason code, note
4. System creates adjustment record via `rpc_create_financial_adjustment`

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PlayerFinancialService (PRD-009) | Implemented | `player_financial_transaction` table, RPCs, service layer |
| Cashier role (ADR-017) | Implemented | `staff_role` enum includes 'cashier' |
| Financial adjustment support | Implemented | `rpc_create_financial_adjustment`, txn_kind enum |
| ADR-024 context injection | Implemented | `set_rls_context_from_staff()` |
| ADR-031 cents convention | Implemented | Amounts stored in cents |
| Sidebar navigation component | Implemented | `components/layout/app-sidebar.tsx` |

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Cashier schema expansion** changes role boundaries | Medium | Expand cashier Zod schema to allow `direction='in'` + `source='cage'`. RPC already allows it for cashier role. Document scope change in SRM changelog. |
| **visit_id requirement for cage purchases** | Medium | Cage chip purchases may occur before a visit exists. MVP requires visit context (SRM v4.2.0 invariant). Cashier must search/select existing visit first. If no visit exists, cashier refers player to pit for visit creation. Post-MVP: consider optional visit_id for cage-only transactions. |
| **SRM v4.2.0 scope exclusion contradiction** | Low | SRM v4.2.0 removed cage buy-ins from scope. This PRD re-introduces them based on updated operational understanding (vision addendum). SRM must be updated to v4.13.0 with changelog noting this evolution. |
| **external_ref column missing from schema** | Low | Add `external_ref` nullable text column to `player_financial_transaction` via migration. Lightweight schema addition. |
| **Shift telemetry integration for cage events** | Medium | Existing bridge trigger (`trg_bridge_finance_to_telemetry`) bridges financial transactions to `table_buyin_telemetry`. Cage transactions don't have a `table_id` — they need either a cage-specific telemetry path or a shift-level aggregation that includes non-table sources. Investigate during implementation. |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Cashier can record a cage chip purchase (`direction='in'`, `source='cage'`) via the Cashier Console UI
- [ ] Cashier can record a cash-out (`direction='out'`, `source='cage'`) linked to a visit
- [ ] Cashier can search players and view active/recent visits for transaction association
- [ ] Cashier can view their transaction history for the current gaming day
- [ ] Cashier can create adjustments to their own transactions with reason code and note

**Data & Integrity**
- [ ] All cashier transactions persist to `player_financial_transaction` with correct `source='cage'` and `direction` values
- [ ] Idempotency key prevents duplicate transaction creation
- [ ] Gaming day is auto-derived via existing trigger (`trg_fin_gaming_day`)

**Security & Access**
- [ ] Cashier role can only access transactions within their own casino (RLS enforced)
- [ ] Updated Zod schema allows cashier `direction='in'` with `source='cage'` (cage chip purchases)
- [ ] Pit boss constraints remain unchanged (direction='in', source='pit' only)
- [ ] Compliance role retains read-only access

**Testing**
- [ ] Unit tests for updated cashier Zod schema validation (direction='in' + source='cage' allowed)
- [ ] Integration test for cage chip purchase via `rpc_create_financial_txn`
- [ ] E2E happy path: cashier logs in, searches player, records cage chip purchase, verifies in history

**Operational Readiness**
- [ ] Cage chip purchase transactions appear in existing financial transaction API responses
- [ ] Error states (invalid visit, unauthorized role, duplicate key) surface meaningful messages in UI

**Documentation**
- [ ] SRM updated to v4.13.0 documenting cage chip purchase capability for cashier role
- [ ] Cashier Zod schema change documented in ADR-017 changelog or inline comments

---

## 9. Related Documents

| Document | Relevance |
|----------|-----------|
| `docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-ADDENDUM-CAGE-BUYIN-v0.1.md` | Vision source for cage chip purchase telemetry |
| `docs/10-prd/PRD-009-cashier-workflows-addendum.md` | Parent cashier workflows (cash-out, markers) |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.12.0) | PlayerFinancialService bounded context, schema invariants |
| `docs/80-adrs/ADR-017-cashier-role-implementation.md` | Cashier role as staff_role enum value |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation |
| `docs/80-adrs/ADR-031-financial-amount-convention.md` | Cents storage, dollars at UI boundary |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy templates for financial transactions |
| `docs/30-security/SEC-005-role-taxonomy.md` | Role capabilities matrix |
| `docs/25-api-data/API_SURFACE_MVP.md` | Endpoint catalogue |
| `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | Complexity guardrails |

---

## Appendix A: Investigation Findings Summary

### A.1 What Exists Today

| Component | Status | Location |
|-----------|--------|----------|
| `player_financial_transaction` table | Implemented | `supabase/migrations/20251211015115_prd009_player_financial_service.sql` |
| `rpc_create_financial_txn` | Implemented (ADR-024) | `supabase/migrations/20251231014359_adr024_financial_rpc_remediation.sql` |
| `rpc_create_financial_adjustment` | Implemented | `supabase/migrations/20260116150149_add_financial_adjustment_support.sql` |
| `visit_financial_summary` view | Implemented | `supabase/migrations/20251213180125_add_visit_financial_summary_view.sql` |
| PlayerFinancialService (Pattern A) | Implemented | `services/player-financial/` (dtos, schemas, keys, mappers, crud, http) |
| Financial transaction Route Handler | Implemented | `app/api/v1/financial-transactions/route.ts` |
| Cashier role enum | Implemented | `supabase/migrations/20251211161847_adr015_add_cashier_role.sql` |
| Cashier Zod validation | Implemented | `services/player-financial/schemas.ts` |
| Table buy-in telemetry | Implemented | `supabase/migrations/20260114003530_table_buyin_telemetry.sql` |
| Finance-to-telemetry bridge | Implemented | `supabase/migrations/20260115000300_trg_bridge_finance_to_telemetry.sql` |
| React Query hooks | Implemented | `hooks/player-financial/` |
| 78 unit/integration tests | Implemented | Mappers (44), service (17), RLS (17) |

### A.2 Enums Already Available

```sql
financial_direction: 'in' | 'out'
financial_source:    'pit' | 'cage' | 'system'
tender_type:         text (used as 'cash' | 'chips' | 'marker')
financial_txn_kind:  'original' | 'adjustment' | 'reversal'
staff_role:          'dealer' | 'pit_boss' | 'admin' | 'cashier'
```

### A.3 Schema Changes Required

| Change | Type | Rationale |
|--------|------|-----------|
| Add `external_ref` column to `player_financial_transaction` | Migration | Receipt/ticket reference for cage operations |
| Expand cashier Zod schema | Code change | Allow `direction='in'` + `source='cage'` for chip purchases |
| Update SRM cashier role capabilities | Doc update | Document cage chip purchase as cashier capability |

### A.4 Key Architectural Decision: Cage Buy-In Scope Evolution

SRM v4.2.0 (2025-12-11) explicitly excluded cage buy-ins:
> "Removed 'buy-ins' from cashier cage operations (incorrect terminology - players cash out at cage, not buy-in). Cashier workflows limited to: cash-outs and marker settlements."

The vision addendum (2026-02) re-introduces cage chip purchases based on updated operational understanding:
- Phantom bankroll problem (player arrives pre-loaded, pit sees $0 buy-in)
- Multi-table hopping (single cage purchase, multiple table sessions)
- Shift narrative integrity (cage issuance explains bankroll source)

**Resolution:** This PRD supersedes the SRM v4.2.0 exclusion for cage chip purchases. The existing `player_financial_transaction` schema with `source='cage'` and `direction='in'` already models this correctly. The only blocking constraint is the cashier Zod schema validation, which is a code-level change (not schema).

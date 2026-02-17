---
id: PRD-033
title: "Cashier Workflow MVP: Operational Telemetry Attestations"
owner: Product
status: Accepted
version: 0.2.0
created: 2026-02-11
last_review: 2026-02-11
affects:
  - ADR-015
  - ADR-017
  - ADR-024
  - ADR-030
  - ADR-031
  - SEC-001
  - SEC-005
  - PRD-009
  - PRD-032
  - ARCH-SRM
phase: "Cashier Console MVP"
http_boundary: true
bounded_contexts:
  - PlayerFinancialService
  - TableContextService
depends_on:
  - PRD-009 (Player Financial Service — deployed)
  - ADR-024 (Authoritative Context Derivation — deployed)
  - ADR-017 (Cashier Role — deployed)
  - ADR-031 (Financial Amount Convention — deployed)
blocks: [PRD-032 (Cage Chip Purchase)]
source_artifacts:
  - docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-MVP-v0.1.md
  - docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-ADDENDUM-CAGE-BUYIN-v0.1.md
tags: [cashier, cage-attestation, cash-out, fill-credit-confirmation, drop-received, operational-telemetry]
---

# PRD-033 — Cashier Workflow MVP: Operational Telemetry Attestations

## 1. Overview

- **Owner:** Product
- **Status:** Approved (Architecture Validated)
- **Version:** 0.2.0
- **Date:** 2026-02-11
- **Architecture Review:** Lead Architect — validated 2026-02-11 (bounded context alignment, OE-01 compliant, ADR-024/031 compatible)
- **Vision Source:** `docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-MVP-v0.1.md`
- **Addendum (Aspirational):** PRD-032 (Cage Chip Purchase — optional, ready when console exists)
- **SDLC Categories:** DB/SCHEMA, RLS/RPC, SERVICE, API/DATA, UI/FRONTEND, QA/TEST

**Summary:** This PRD delivers the **Cashier Console MVP** — a purpose-built UI and backend completion layer enabling cashiers to confirm three categories of operational events that currently lack cage-side attestation: (1) patron cash-outs, (2) fill/credit fulfillment, and (3) drop received acknowledgements. These are the three required signals identified in the vision document as blocking shift truth, inventory lifecycle closure, and ghost-drop prevention. PT-2 records these as **attestations of operational events** — not financial accounting. Corrections follow void+replacement semantics; no drawer balancing, denomination tracking, or reconciliation is in scope.

---

## 2. Problem & Goals

### 2.1 Problem

The floor keeps running into the same three gaps:

1. **Cash-out ambiguity.** When a player leaves a table and cashes out at the cage, the pit has no system confirmation. Shift explanations for large wins/losses rely on verbal reports or manual notes. Drop/hold estimates are speculative without cage-confirmed cash-out data.

2. **Fill/credit lifecycle is incomplete.** Pit staff can *request* fills and credits (tables exist: `table_fill`, `table_credit`), but the current schema treats them as single-step inserts with no cashier confirmation step. The pit cannot distinguish "requested" from "fulfilled" — the inventory lifecycle loop is open.

3. **Ghost drops.** Drop boxes are removed from tables and logged via `table_drop_event`, but there is no cage-side "received" stamp. The pit cannot confirm the cage actually received the drop, creating ambiguity in shift reporting and table rundown closure.

All three gaps exist because **there is no cashier-facing UI** and the backend models lack the two-step request→confirmation pattern the vision document requires.

### 2.2 Goals

1. **Cashiers can confirm patron cash-outs** with amount, tender type, and player/visit context, creating a cage-attested financial event that shift dashboards can consume.
2. **Cashiers can confirm fill/credit fulfillment** against pending pit requests, recording fulfilled amount, timestamp, and optional discrepancy notes — closing the inventory lifecycle loop.
3. **Cashiers can acknowledge drop received** with a cage-side timestamp, preventing ghost-drop ambiguity.
4. **All confirmations are attributable** — stamped with `created_by`, `casino_id`, `gaming_day`, and `created_at`.
5. **Corrections follow void+replacement** — no silent edits, no record deletion. Original records preserved for audit integrity.

### 2.3 Non-Goals

- **No drawer balancing / till counts** — PT-2 does not track cage drawer contents
- **No denomination breakdowns** — amounts only (chipset JSON payload stays in table_fill/credit but is not a cashier concern)
- **No GL codes, chart of accounts, journal entries**
- **No bank deposits, cash logistics, reconciliation**
- **No end-of-day "cage close" / shift balancing workflow**
- **No cage chip purchase** (buy-in at cage) — deferred to PRD-032 as optional add-on
- **No marker credit management** (limits, aging, bad debt)
- **No cage variance reporting**

---

## 3. Users & Use Cases

- **Primary users:** Cashier (`staff_role = 'cashier'`)
- **Secondary users:** Admin (full access), Pit/Shift staff (read consumers), Compliance (read-only audit)

**Top Jobs:**

- As a **cashier**, I need to **confirm a patron cash-out** so that the pit has cage-attested evidence of chips-to-cash conversion for shift narrative accuracy.
- As a **cashier**, I need to **confirm fill fulfillment** against a pending pit request so that the inventory model can trust that chips actually moved from cage to table.
- As a **cashier**, I need to **confirm credit receipt** against a pending pit request so that chips returned from table to cage are acknowledged.
- As a **cashier**, I need to **acknowledge drop received** so that the pit knows the cage has the drop box and ghost-drop ambiguity is eliminated.
- As a **cashier**, I need to **void a mistaken confirmation** and replace it with a corrected one so that errors are traceable without destroying audit history.
- As a **cashier**, I need to **view my recent confirmations** for the current gaming day so that I can verify entries and catch mistakes quickly.
- As a **pit supervisor**, I need to **see cashier-confirmed events in shift telemetry** so that shift narratives, inventory reconciliation, and drop status are backed by cage attestations.

---

## 4. Scope & Feature List

### Screen 1 — Patron Transactions (Cash-Out Confirmation)

1. Player/visit search: lookup by name, player ID, or loyalty number
2. Active and recently-closed visit listing for a selected player
3. Cash-out confirmation form: amount, tender type (MVP: `cash`), optional receipt ref, optional notes
4. Confirmation step with double-confirm for amounts exceeding configurable threshold
5. Recent cash-out transaction list (current cashier, current gaming day)
6. Void + replacement workflow for mistaken entries

### Screen 2 — Operational Confirmations (Fill/Credit Fulfillment)

7. Queue of pending fill/credit requests (filtered to current gaming day)
8. "Confirm Fulfilled" action per fill/credit request
9. Fulfilled amount entry (pre-populated from request, editable if discrepancy)
10. Discrepancy reason note when fulfilled amount differs from requested amount
11. Fulfillment confirmation timestamp

### Screen 3 — Drop Acknowledgements

12. Today's drop events (by table / drop batch) awaiting cage acknowledgement
13. "Received" stamp action with timestamp
14. Optional counted total entry (Phase 1.5 — field present but not required)

### Cross-Cutting

15. Sidebar navigation entry for "Cashier" in Operational group
16. Cashier session context: `casino_id` + `gaming_day` resolved on sign-in
17. All events stamped with `created_by`, `casino_id`, `gaming_day`, `created_at`

---

## 5. Requirements

### 5.1 Functional Requirements

**Cash-Out Confirmation (Screen 1)**

**FR-1:** Cashier can search for a player by name (partial match) and view their active or recently-closed visits within the current gaming day.

**FR-2:** Cashier can create a cash-out confirmation with: `player_id`, `visit_id` (required), `amount` (positive, in cents per ADR-031), `tender_type` ('cash'), optional `external_ref`, optional `notes`. Persisted via `rpc_create_financial_txn` with `direction='out'`, `source='cage'`.

**FR-3:** Cashier can void a previously confirmed cash-out by creating an adjustment/reversal record with `reason_code` and `note` (min 10 chars), via existing `rpc_create_financial_adjustment`. Original record is never modified.

**FR-4:** Cashier can view their own cash-out confirmations for the current gaming day, filtered by direction and tender type.

**Fill/Credit Fulfillment (Screen 2)**

**FR-5:** The system presents a queue of fill/credit requests that are pending cashier fulfillment confirmation, scoped to the cashier's casino and current gaming day.

**FR-6:** Cashier can confirm fulfillment of a fill request by recording: fulfilled amount, confirmed timestamp, and `confirmed_by_staff_id`. If fulfilled amount differs from requested amount, a discrepancy reason is required.

**FR-7:** Cashier can confirm receipt of a credit by recording: confirmed amount, confirmed timestamp, and `confirmed_by_staff_id`. Same discrepancy logic as fills.

**FR-8:** Once confirmed, the fill/credit status transitions from `requested` to `confirmed`. Confirmed records cannot be re-confirmed (idempotency).

**Drop Received (Screen 3)**

**FR-9:** The system presents today's drop events that lack a cage-received acknowledgement, scoped to the cashier's casino.

**FR-10:** Cashier can stamp a drop event as "received" by recording: `cage_received_at` timestamp and `cage_received_by` staff ID.

**FR-11:** Once acknowledged, the drop event status shows "received" in shift dashboards and table rundown views.

**Cross-Cutting**

**FR-12:** All cashier confirmations use ADR-024 authoritative context injection (`set_rls_context_from_staff()`). Casino and actor are derived, not provided by the caller.

**FR-13:** Transaction amounts follow ADR-031 convention: stored in cents, displayed in dollars at the UI boundary.

### 5.2 Non-Functional Requirements

**NFR-1:** Confirmation latency p95 < 500ms (consistent with existing RPC performance).

**NFR-2:** Idempotency: duplicate submissions on fill/credit confirmations and drop acknowledgements are safe (no duplicates created).

**NFR-3:** Casino-scoped RLS enforced on all reads and writes.

> Architecture, schema, and RLS details: see SRM v4.12.0 (PlayerFinancialService, TableContextService sections), ADR-015, ADR-017, ADR-024, ADR-030.

---

## 6. UX / Flow Overview

### 6.1 Cash-Out Confirmation Flow

1. Cashier signs in → Console opens → selects "Patron Transactions" tab
2. Searches player by name or ID
3. Selects player → system shows active/recent visits
4. Selects visit → taps "Cash Out"
5. Enters amount + optional receipt ref + optional notes
6. Confirms → system calls `rpc_create_financial_txn` (`direction='out'`, `source='cage'`)
7. Success confirmation with transaction ID displayed
8. Transaction appears in recent confirmations list

### 6.2 Fill/Credit Fulfillment Flow

1. Cashier selects "Operational Confirmations" tab
2. System shows queue of pending fill/credit requests for today
3. Cashier selects a pending fill request
4. Reviews requested amount, table, requesting staff
5. Enters fulfilled amount (pre-populated, editable) + optional discrepancy note
6. Confirms → system updates fill record status to `confirmed`
7. Confirmed fill appears in completed list; removed from pending queue

### 6.3 Drop Received Flow

1. Cashier selects "Drop Acknowledgements" tab
2. System shows today's drop events without cage receipt
3. Cashier selects drop event (identified by table label, drop box ID, seal number)
4. Taps "Mark Received"
5. System stamps `cage_received_at` + `cage_received_by`
6. Drop event moves to "received" status in shift dashboard

### 6.4 Void + Replacement Flow

1. Cashier opens recent confirmations list
2. Selects the mistaken entry → taps "Void"
3. Enters reason code + note (min 10 chars)
4. System creates reversal/void record linked to original
5. Cashier can then create a replacement confirmation if needed

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `player_financial_transaction` table + RPCs | Implemented | PRD-009, ADR-024 compliant |
| `table_fill`, `table_credit` tables | Implemented | Schema exists but lacks confirmation columns |
| `table_drop_event` table | Implemented | Schema exists but lacks cage-received columns |
| Cashier role in `staff_role` enum | Implemented | ADR-017 |
| `rpc_create_financial_txn` | Implemented | ADR-024, supports `source='cage'` |
| `rpc_create_financial_adjustment` | Implemented | Void/correction path |
| ADR-024 context injection | Implemented | `set_rls_context_from_staff()` |
| ADR-031 cents convention | Implemented | Amounts stored in cents |
| Sidebar navigation component | Implemented | `components/layout/app-sidebar.tsx` |

### 7.2 Schema Changes Required

These are net-new columns/enums needed to support the two-step model:

| Table | Change | Purpose |
|-------|--------|---------|
| `table_fill` | Add `status` column (`requested` \| `confirmed`) | Two-step request→confirmation lifecycle |
| `table_fill` | Add `confirmed_at` timestamptz | Confirmation timestamp |
| `table_fill` | Add `confirmed_by` uuid FK to staff | Cashier who confirmed |
| `table_fill` | Add `confirmed_amount_cents` int | Actual fulfilled amount (may differ from requested) |
| `table_fill` | Add `discrepancy_note` text | Required when confirmed amount differs |
| `table_credit` | Same 5 columns as `table_fill` | Same two-step model |
| `table_drop_event` | Add `cage_received_at` timestamptz | Cage receipt timestamp |
| `table_drop_event` | Add `cage_received_by` uuid FK to staff | Cashier who acknowledged |
| `player_financial_transaction` | Add `external_ref` text nullable | Receipt/ticket reference |

### 7.3 Risks & Open Questions

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | **Fill/credit status column migration** needs backward compatibility with existing single-step RPCs | Medium | Default new `status` column to `'confirmed'` for existing rows (they were already fulfilled at insert time). New rows from pit requests start as `'requested'`. Update `rpc_request_table_fill`/`rpc_request_table_credit` to set `status='requested'`. |
| 2 | **Cashier RLS for fill/credit/drop** — current RLS allows pit roles, not cashier | Medium | Add cashier to UPDATE policies for `table_fill`, `table_credit`, `table_drop_event`. Cashier needs UPDATE on confirmation columns only. Consider column-level security via RPC wrapper. |
| 3 | **SECURITY DEFINER RPCs need ADR-024 upgrade** — existing fill/credit/drop RPCs are simple SECURITY DEFINER without `set_rls_context_from_staff()` | Medium | Create new ADR-024-compliant RPCs: `rpc_confirm_table_fill`, `rpc_confirm_table_credit`, `rpc_acknowledge_drop_received`. Follow pattern from `rpc_create_financial_txn`. |
| 4 | **Cashier Zod schema currently blocks `direction='in'`** | Low | Not needed for this PRD (cash-outs only are `direction='out'`). Deferred to PRD-032 for cage chip purchase. |
| 5 | **Gaming day resolution for cashier** | Low | Cashier console resolves gaming day via existing `rpc_current_gaming_day()` on sign-in, same as pit dashboard. |
| 6 | **Pending queue real-time updates** | Low | Use Supabase Realtime on `table_fill`/`table_credit` changes (existing pattern from `INT-002`). Poll fallback acceptable for MVP. |
| 7 | **"Anonymous / Walk-in" cash-outs** | Medium | Vision doc mentions this. Current schema requires `visit_id NOT NULL`. MVP: require visit selection. If player is unknown, pit boss creates a ghost visit first. Document as post-MVP enhancement if anonymous cage transactions are needed. |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Cashier can confirm a patron cash-out (`direction='out'`, `source='cage'`) via the Cashier Console UI, linked to a player visit
- [ ] Cashier can confirm fulfillment of a pending fill request, recording fulfilled amount and optional discrepancy note
- [ ] Cashier can confirm receipt of a pending credit, recording confirmed amount and optional discrepancy note
- [ ] Cashier can acknowledge drop received with cage-side timestamp
- [ ] Cashier can void a mistaken confirmation via adjustment/reversal workflow

**Data & Integrity**
- [ ] Fill/credit records transition from `requested` → `confirmed` status; confirmed records are immutable
- [ ] Drop events show cage-received status in shift telemetry
- [ ] Cash-out transactions persist to `player_financial_transaction` with `source='cage'`, `direction='out'`
- [ ] All events stamped with `created_by`, `casino_id`, `gaming_day`, `created_at`

**Security & Access**
- [ ] Cashier role can confirm fill/credit/drop events within their own casino (RLS enforced)
- [ ] Cashier role can create cash-out financial transactions (existing permission, new UI)
- [ ] Pit roles retain read access to confirmed events; cannot modify cashier confirmations
- [ ] New RPCs follow ADR-024 pattern (`set_rls_context_from_staff()`)

**Testing**
- [ ] Unit tests for fill/credit confirmation status transitions
- [ ] Integration test for cash-out via `rpc_create_financial_txn` with `source='cage'`
- [ ] Integration test for `rpc_confirm_table_fill` and `rpc_confirm_table_credit`
- [ ] E2E happy path: cashier confirms cash-out, fill fulfillment, and drop received

**Operational Readiness**
- [ ] Confirmed events visible in existing shift dashboard views
- [ ] Error states (invalid fill request, unauthorized role, duplicate confirmation) surface meaningful messages

**Documentation**
- [ ] SRM updated with fill/credit confirmation columns and drop received columns
- [ ] New RPCs documented with ADR-024 compliance notes

---

## 9. Related Documents

| Document | Relevance |
|----------|-----------|
| `docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-MVP-v0.1.md` | Primary vision source |
| `docs/00-vision/cashier-workflow/CASHIER-WORKFLOW-ADDENDUM-CAGE-BUYIN-v0.1.md` | Aspirational: cage chip purchase (PRD-032) |
| `docs/10-prd/PRD-032-cashier-console-cage-buyin-v0.md` | Addendum PRD for cage buy-in (optional, ready) |
| `docs/10-prd/PRD-009-cashier-workflows-addendum.md` | Original cashier workflows skeleton |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.12.0) | PlayerFinancialService + TableContextService bounded contexts |
| `docs/80-adrs/ADR-017-cashier-role-implementation.md` | Cashier role as staff_role enum |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation |
| `docs/80-adrs/ADR-031-financial-amount-convention.md` | Cents storage, dollars at UI boundary |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy templates |
| `docs/30-security/SEC-005-role-taxonomy.md` | Role capabilities matrix |
| `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | Complexity guardrails |

---

## Appendix A: Current State Analysis

### A.1 What Exists (Ready to Use)

| Component | Status | Gap for This PRD |
|-----------|--------|------------------|
| `player_financial_transaction` table | Implemented | Cash-out works today via API; needs UI |
| `rpc_create_financial_txn` (ADR-024) | Implemented | Cashier can create `direction='out'`, `source='cage'` — no code changes needed |
| `rpc_create_financial_adjustment` | Implemented | Void/correction path — no changes needed |
| `table_fill` table | Implemented | **Missing**: `status`, `confirmed_at`, `confirmed_by`, `confirmed_amount_cents`, `discrepancy_note` |
| `table_credit` table | Implemented | **Missing**: same 5 columns as `table_fill` |
| `table_drop_event` table | Implemented | **Missing**: `cage_received_at`, `cage_received_by` |
| `rpc_request_table_fill` | Implemented | **Not ADR-024 compliant** — needs new `rpc_confirm_table_fill` alongside it |
| `rpc_request_table_credit` | Implemented | **Not ADR-024 compliant** — needs new `rpc_confirm_table_credit` |
| `rpc_log_table_drop` | Implemented | **Not ADR-024 compliant** — needs new `rpc_acknowledge_drop_received` |
| Cashier role in `staff_role` | Implemented | No changes needed |
| Financial Route Handler | Implemented | `POST /api/v1/financial-transactions` — works for cash-outs |
| Fill/Credit/Drop Route Handlers | Implemented | API exists, but for pit-initiated requests; need cashier confirmation endpoints |
| Sidebar navigation | Implemented | Need new "Cashier" entry |
| **Cashier UI** | **Missing** | No routes, no pages, no components |

### A.2 Schema Changes Summary

```
table_fill:
  + status              text NOT NULL DEFAULT 'confirmed'  -- backfill existing
  + confirmed_at        timestamptz
  + confirmed_by        uuid REFERENCES staff(id)
  + confirmed_amount_cents  int
  + discrepancy_note    text

table_credit:
  + status              text NOT NULL DEFAULT 'confirmed'  -- backfill existing
  + confirmed_at        timestamptz
  + confirmed_by        uuid REFERENCES staff(id)
  + confirmed_amount_cents  int
  + discrepancy_note    text

table_drop_event:
  + cage_received_at    timestamptz
  + cage_received_by    uuid REFERENCES staff(id)

player_financial_transaction:
  + external_ref        text  -- receipt/ticket reference
```

### A.3 New RPCs Required

| RPC | Pattern | Purpose |
|-----|---------|---------|
| `rpc_confirm_table_fill` | SECURITY INVOKER + ADR-024 | Cashier confirms fill fulfillment |
| `rpc_confirm_table_credit` | SECURITY INVOKER + ADR-024 | Cashier confirms credit receipt |
| `rpc_acknowledge_drop_received` | SECURITY INVOKER + ADR-024 | Cashier stamps drop as received |

All follow the `rpc_create_financial_txn` pattern: call `set_rls_context_from_staff()`, validate role ∈ (`cashier`, `admin`), enforce casino scoping, return updated row.

### A.4 Rollout Order (from Vision Doc)

| Priority | Event Type | PRD Scope | Telemetry Unlocked |
|----------|-----------|-----------|-------------------|
| **1** | Cash-out confirmed | **This PRD** | Shift truth, drop/hold accuracy |
| **2** | Fill/Credit confirmed | **This PRD** | Inventory lifecycle closure |
| **3** | Drop received stamp | **This PRD** | Ghost-drop prevention |
| 4 | Cage chip purchase | PRD-032 (optional) | Phantom bankroll resolution |

### A.5 Bounded Context Ownership

| Event | Owner Context | Table | Notes |
|-------|---------------|-------|-------|
| Cash-out confirmation | **PlayerFinancialService** | `player_financial_transaction` | Existing context, existing table |
| Fill/credit fulfillment | **TableContextService** | `table_fill`, `table_credit` | Existing context, schema extension |
| Drop received | **TableContextService** | `table_drop_event` | Existing context, schema extension |
| Cashier Console UI | **New UI surface** | — | No new bounded context; consumes from Finance + TableContext |

---

## Appendix B: Workstream Scaffold (Architecture)

> This scaffold defines vertical slices for EXEC-SPEC generation. Domain experts refine each workstream.

### Workstream Dependency Graph

```
WS1 (Schema) → WS2 (RPCs) → WS3 (Service Layer) → WS4 (API Transport)
                                                   ↘ WS5 (UI — can start with mocks)
                                    WS4 + WS5 → WS6 (Testing)
```

### WS1: Database Schema Extensions
- **Type:** database
- **Bounded Context:** TableContextService, PlayerFinancialService
- **Dependencies:** none
- **Scope:**
  - Migration: `table_fill` + `table_credit` confirmation columns (status, confirmed_at, confirmed_by, confirmed_amount_cents, discrepancy_note)
  - Migration: `table_drop_event` cage-received columns (cage_received_at, cage_received_by)
  - Migration: `player_financial_transaction.external_ref` (nullable text)
  - Backward compatibility: DEFAULT 'confirmed' for existing fill/credit rows
  - `npm run db:types` after migration
- **Consult:** `backend-service-builder`

### WS2: ADR-024 Compliant RPCs
- **Type:** rls/rpc
- **Bounded Context:** TableContextService
- **Dependencies:** [WS1]
- **Scope:**
  - `rpc_confirm_table_fill` — role gate (cashier, admin), status transition requested→confirmed, idempotent
  - `rpc_confirm_table_credit` — same pattern
  - `rpc_acknowledge_drop_received` — role gate, idempotent stamp
  - All call `set_rls_context_from_staff()` per ADR-024
  - Update `rpc_request_table_fill` / `rpc_request_table_credit` to set `status='requested'` on new rows
- **Consult:** `rls-expert`

### WS3: Service Layer Extension
- **Type:** service
- **Bounded Context:** TableContextService
- **Dependencies:** [WS1, WS2]
- **Scope:**
  - Update `dtos.ts`: add confirmation fields to TableFillDTO, TableCreditDTO, TableDropEventDTO
  - Add `ConfirmTableFillInput`, `ConfirmTableCreditInput`, `AcknowledgeDropInput` DTOs
  - Update `mappers.ts` for new columns
  - Add `confirmTableFill()`, `confirmTableCredit()`, `acknowledgeDropReceived()` to `chip-custody.ts`
  - Add confirmation Zod schemas to `schemas.ts`
  - Update `keys.ts` with cache keys for pending queues
- **Consult:** `backend-service-builder`

### WS4: API Transport (Route Handlers)
- **Type:** api
- **Bounded Context:** TableContextService
- **Dependencies:** [WS3]
- **Scope:**
  - `PATCH /api/v1/table-fills/[id]/confirm` — cashier confirmation endpoint
  - `PATCH /api/v1/table-credits/[id]/confirm` — cashier confirmation endpoint
  - `PATCH /api/v1/drop-events/[id]/acknowledge` — cage receipt stamp
  - `GET /api/v1/table-fills?status=requested` — pending fill queue
  - `GET /api/v1/table-credits?status=requested` — pending credit queue
  - `GET /api/v1/drop-events?cage_received=false` — unacknowledged drops
  - React Query hooks for cashier operations
- **Consult:** `api-builder`

### WS5: Cashier Console UI
- **Type:** frontend
- **Bounded Context:** Cashier Console (UI surface)
- **Dependencies:** [WS3, WS4] (can start with mocks before WS4 completes)
- **Scope:**
  - Route: `app/(dashboard)/cashier/` (3 tab screens)
  - Sidebar navigation entry in Operational group
  - Screen 1: Patron Transactions (player search + cash-out form + recent list)
  - Screen 2: Operational Confirmations (pending fill/credit queue + confirm action)
  - Screen 3: Drop Acknowledgements (unacknowledged list + "received" stamp)
  - Player/visit search component (reuse existing player search patterns)
  - Void/correction workflow for cash-out transactions
- **Consult:** `frontend-design-pt-2`

### WS6: Testing & Validation
- **Type:** testing
- **Bounded Context:** cross-cutting
- **Dependencies:** [WS4, WS5]
- **Scope:**
  - Unit tests: fill/credit status transition logic, DTO mappings
  - RLS integration: cashier role can confirm fills/credits/drops within own casino
  - RLS integration: pit_boss cannot modify cashier confirmations
  - E2E: cashier confirms cash-out → appears in shift telemetry
  - E2E: cashier confirms fill fulfillment → inventory loop closes
  - E2E: cashier acknowledges drop received → visible in table rundown
- **Consult:** `qa-specialist`, `e2e-testing`

---

## Appendix C: Architecture Validation Summary

**Validated by:** Lead Architect, 2026-02-11

| Check | Result | Notes |
|-------|--------|-------|
| Bounded context alignment | PASS | No new context; extends Finance + TableContext |
| OE-01 compliance | PASS | No unnecessary abstractions, extends existing patterns |
| ADR-024 RPC pattern | PASS | All new RPCs use `set_rls_context_from_staff()` |
| ADR-031 amount convention | PASS | Cents storage, dollars at UI boundary |
| ADR-017 cashier role | PASS | Role already in enum; no changes needed |
| RLS casino scoping | PASS | All tables already casino-scoped |
| Schema backward compatibility | PASS | DEFAULT 'confirmed' for existing rows |
| Single authoritative mutator | PASS | TableContextService owns fill/credit/drop; Finance owns cash-out |
| Vision alignment | PASS | All 3 required attestations covered; cage chip purchase deferred to PRD-032 |

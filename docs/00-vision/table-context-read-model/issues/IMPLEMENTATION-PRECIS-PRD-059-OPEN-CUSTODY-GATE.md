---
title: "Implementation Precis — PRD-059 OPEN Table Custody Gate"
issue_id: PRD-059-IMPLEMENTATION
parent_issue: OPEN-WORKFLOW-GAP
status: delivered
severity: P0
date: 2026-03-26
branch: table-lifecycle-recovery
commit: 2cd6bb9
prior_art:
  - OPEN-WORKFLOW-GAP.md (identified the three-layer deference gap)
  - REMEDIATION-SESSION-CLOSE-LIFECYCLE-GAPS.md (5a/5b/5c downstream gaps)
  - session-open-close-precis.md (permissive-by-design analysis)
scope:
  - OPEN → ACTIVE custody gate with opening attestation
  - Predecessor provenance chain (Session N-1 → Session N)
  - OPEN-cancellation path (cancel without artifacts)
  - Session-gated seating (exclude OPEN from gameplay-allowed)
bounded_contexts:
  - TableContextService (table_session, table_opening_attestation owner)
adrs:
  - ADR-048 (Open Table Custody Gate)
  - ADR-028 (Table Status Standardization, amended)
  - ADR-047 (Operator–Admin Surface Separation, D3.1 undeferred)
---

# Implementation Precis — PRD-059 OPEN Table Custody Gate

## 1. What Was Delivered

PRD-059 closes the **OPEN Workflow Gap** identified during the ADR-047 audit. The system previously bypassed the `OPEN` session phase entirely — `rpc_open_table_session` wrote `ACTIVE` directly, skipping custody verification. The three-layer deference (schema ready, RPC blocked, UI defensive) has been resolved across all layers.

### Before (MVP permissive)

```
open_session() ──→ [ACTIVE] ──→ [RUNDOWN] ──→ [CLOSED]
                     ↑
               no gate, no attestation,
               no predecessor chain
```

### After (PRD-059 custody gate)

```
open_session() ──→ [OPEN] ──→ activate_session() ──→ [ACTIVE] ──→ [RUNDOWN] ──→ [CLOSED]
                     │              │
                     │         attestation:
                     │         - chip count verified
                     │         - dealer confirmed
                     │         - predecessor provenance
                     │         - opening note (conditional)
                     │
                     └──→ cancel_opening() ──→ [CLOSED] (reason: 'cancelled')
```

---

## 2. Intended Workflow

### 2.1 Table Opening (Pit Boss initiates)

1. Pit boss clicks "Open Table" on the pit dashboard table card.
2. `rpc_open_table_session` creates a session with `status = 'OPEN'` (no longer `ACTIVE`).
3. If a predecessor session exists (Session N-1 was CLOSED for this gaming table):
   - The new session's `predecessor_session_id` FK links to Session N-1.
   - The predecessor's closing inventory snapshot is available for provenance.
4. The **Activation Drawer** auto-opens in the pit panels right sidebar.

### 2.2 Custody Gate (Activation Drawer)

The drawer presents one of two conditions:

**Condition A — Predecessor Exists:**
- Displays predecessor close total (dollar amount from closing snapshot).
- Pre-fills the opening total input with the predecessor value.
- If the pit boss enters a different amount → **Variance Detected** warning.
- A note is required to explain the variance.

**Condition B — No Predecessor (Par Bootstrap):**
- Displays amber **Par Bootstrap** warning.
- The pit boss must enter the opening total manually (no pre-fill).
- A note is required to document the bootstrap context.

**Additional Warning — Reconciliation Flag:**
- If the predecessor session was force-closed (`requires_reconciliation = true`), a red warning appears.
- A note is required.

**Form fields:**
- Opening total (dollars, converted to cents for storage)
- Dealer confirmation checkbox (must be checked — hard gate)
- Opening note (conditionally required when any warning is shown)

### 2.3 Activation (OPEN → ACTIVE)

When the pit boss clicks "Activate Table for Play":

1. `rpc_activate_table_session` (SECURITY DEFINER) executes:
   - Validates session is in `OPEN` state.
   - Validates dealer confirmed, opening amount non-negative.
   - Creates `table_opening_attestation` row:
     - `opening_total_cents`, `attested_by`, `dealer_confirmed`, `note`
     - `predecessor_snapshot_id`, `predecessor_close_total_cents` (from consumption)
     - `provenance_source`: `'predecessor'` or `'par_bootstrap'`
   - If predecessor exists: marks the closing snapshot as consumed (`consumed_by_session_id`, `consumed_at`). A UNIQUE constraint prevents double-consumption.
   - Transitions session to `ACTIVE`.
   - Sets `activated_by_staff_id` and `activated_at`.
2. UI updates: badge transitions from blue OPEN → emerald IN_PLAY.
3. Table is now available for player seating and rating slips.

### 2.4 Cancellation (OPEN → CLOSED)

If the pit boss clicks "Cancel Opening":

1. `rpc_close_table_session` accepts `OPEN` status with `close_reason = 'cancelled'`.
2. When entry status is `OPEN`: artifact requirements are skipped (no drop event or closing snapshot needed).
3. Session transitions directly to `CLOSED`.
4. No `table_opening_attestation` is created.

### 2.5 Session-Gated Seating (Safety Gate)

A critical safety invariant enforced by this milestone:

> **Players can only be seated (rating slip created) at tables with ACTIVE or RUNDOWN sessions. OPEN sessions are excluded from gameplay.**

- `rpc_start_rating_slip`: changed `IN ('OPEN','ACTIVE','RUNDOWN')` → `IN ('ACTIVE','RUNDOWN')`
- `rpc_check_table_seat_availability`: same change
- This prevents rating slips from being created before the custody gate is cleared.

---

## 3. Artifact Inventory

### Schema (WS1)

| Object | Type | Purpose |
|--------|------|---------|
| `table_opening_attestation` | Table | Attestation record (12 columns, UNIQUE on session_id) |
| `table_session.predecessor_session_id` | FK column | Links Session N → Session N-1 |
| `table_inventory_snapshot.consumed_by_session_id` | FK column | Marks snapshot as consumed |
| `table_inventory_snapshot.consumed_at` | Timestamp | When consumption occurred |
| `close_reason_type` | Enum value | Added `'cancelled'` |
| RLS policies | 4 policies | Pattern C hybrid SELECT, DENY INSERT/UPDATE/DELETE |

### RPCs (WS2)

| RPC | Change |
|-----|--------|
| `rpc_open_table_session` | Now writes `OPEN` (not `ACTIVE`), links predecessor |
| `rpc_activate_table_session` | **NEW** — SECURITY DEFINER, attestation, OPEN→ACTIVE |
| `rpc_close_table_session` | Widened to accept `OPEN` + `cancelled` path |
| `rpc_start_table_rundown` | Narrowed to `ACTIVE`-only (excluded `OPEN`) |
| `rpc_start_rating_slip` | Narrowed to `ACTIVE`/`RUNDOWN` (excluded `OPEN`) |
| `rpc_check_table_seat_availability` | Narrowed to `ACTIVE`/`RUNDOWN` (excluded `OPEN`) |

### Service Layer (WS3)

| File | Change |
|------|--------|
| `dtos.ts` | `OpeningAttestationDTO`, `ActivateTableSessionParams`, extended `TableSessionDTO` |
| `schemas.ts` | `activateTableSessionSchema`, relaxed close schema for cancellation |
| `table-session.ts` | `activateTableSession()` operation + P-code error mappings |
| `labels.ts` | Added `'cancelled'` close reason label |
| `domain-errors.ts` | P0008–P0011 error codes for activation failures |

### Frontend (WS4)

| File | Purpose |
|------|---------|
| `app/api/v1/table-sessions/[id]/activate/route.ts` | POST route handler |
| `services/table-context/http.ts` | `activateTableSession` HTTP fetcher |
| `hooks/table-context/use-activate-table-session.ts` | TanStack mutation hook |
| `components/table/activation-drawer.tsx` | Sheet-based custody gate form |
| `components/pit-panels/pit-panels-client.tsx` | Auto-open drawer on OPEN status |

### Tests (WS5 + WS6)

| File | Count | Coverage |
|------|-------|----------|
| `rpc-open-table-session.int.test.ts` | 6 | AC-1 through AC-4 |
| `rpc-activate-table-session.int.test.ts` | 14 | AC-5 through AC-18 |
| `rpc-close-table-session-cancel.int.test.ts` | 5 | AC-19 through AC-21 |
| `table-opening-attestation-rls.int.test.ts` | 4 | AC-22, AC-23 |
| `table-activation-drawer.spec.ts` | 5 | AC-24 through AC-28 (E2E, fixme) |
| **Total** | **34** | **28 acceptance criteria** |

---

## 4. Gap Closure Status

This precis resolves the **OPEN-WORKFLOW-GAP** document's three-layer deference:

| Layer | Before | After |
|-------|--------|-------|
| **Schema** | Ready (enum, constraints existed) | Extended (attestation table, predecessor FK, consumption columns) |
| **RPC/Data** | **Blocked** (no OPEN write, no transition gate) | **Complete** (6 RPCs modified/created, session-gated seating enforced) |
| **UI/Display** | Ready (defensive branches) | **Active** (activation drawer, auto-open, provenance display) |

### Remaining Deferred Items

| Item | Status | Notes |
|------|--------|-------|
| Par binding verification against snapshot | Deferred | Par columns exist; enforcement depends on operational policy |
| Gaming day auto-rollover of OPEN sessions | Deferred | Manual rollover only; no auto-close/reopen at day boundary |
| Source C par bootstrap validation | Deferred | Bootstrap accepted with note; no structural par comparison |
| `has_unresolved_items` population | Separate track | REMEDIATION-SESSION-CLOSE-LIFECYCLE-GAPS.md (Issue 5b) |

---

## 5. Operational Impact

**For pit bosses:**
- Opening a table is now a **two-step process**: Open → Activate (instead of one-click).
- The activation drawer auto-appears — no navigation required.
- Cancel is always available if the opening was premature.

**For the system:**
- Every active session has an auditable opening attestation.
- Predecessor provenance creates an unbroken custody chain across shift boundaries.
- Players cannot be seated at tables still in the OPEN custody gate.
- The `cancelled` close reason provides a clean escape without force-close stigma.

**For compliance:**
- `table_opening_attestation` provides an audit trail: who attested, when, what amount, dealer confirmation, provenance source.
- Variance explanations are captured as mandatory notes.
- Double-consumption of closing snapshots is structurally prevented (UNIQUE constraint).

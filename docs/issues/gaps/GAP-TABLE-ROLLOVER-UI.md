---
title: "Gap Analysis: Table Rollover UI Components"
doc_id: "GAP-TABLE-ROLLOVER-UI"
version: "0.1.0"
status: "draft"
date: "2026-01-16"
owner: "TableContext"
related_docs:
  - "docs/20-architecture/specs/PRD-TABLE-SESSION-LIFECYCLE-MVP/EXECUTION-SPEC-TABLE-SESSION-LIFECYCLE_PATCHED_v0.2.0.md"
  - "docs/00-vision/table-context-read-model/table-inventory-rundown-lifecycle.md"
  - "docs/00-vision/table-context-read-model/ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md"
  - "docs/00-vision/table-context-read-model/GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md"
---

# Gap Analysis: Table Rollover UI Components

## Executive Summary

The Table Session Lifecycle MVP (PRD-TABLE-SESSION-LIFECYCLE-MVP) implemented the session state machine (OPEN → ACTIVE → RUNDOWN → CLOSED) and basic UI for session transitions. However, the **operational UI** required for pit bosses to actually perform table rollover workflows is incomplete.

This document catalogs the UI gaps, clarifies open questions, and provides implementation guidance.

---

## Current State

### Implemented (Session Lifecycle MVP)

| Component | Location | Status |
|-----------|----------|--------|
| Session state machine | `table_session` + RPCs | ✅ Complete |
| Session status banner | `components/table/session-status-banner.tsx` | ✅ Complete |
| Session action buttons | `components/table/session-action-buttons.tsx` | ✅ Complete |
| Close session dialog | `components/table/close-session-dialog.tsx` | ⚠️ Partial (manual UUID entry) |
| Session hooks | `hooks/table-context/use-table-session.ts` | ✅ Complete |
| Inventory schema | `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` | ✅ Complete |
| Shift metrics RPC | `rpc_shift_table_metrics` | ✅ Complete |
| Buy-in telemetry schema | `table_buyin_telemetry` + RPC | ✅ Complete |

### Not Implemented

| Component | Blocking Workflow | Priority |
|-----------|-------------------|----------|
| Chip count capture UI | Opening/closing/mid-shift inventory snapshots | CRITICAL |
| Artifact picker in close dialog | Session close with proper artifact selection | HIGH |
| Grind logging UI | Buy-in telemetry for shift dashboard accuracy | HIGH |
| Drop event logging UI | Drop box custody chain | HIGH |
| Live inventory panel | Real-time inventory visibility | HIGH |
| Rundown summary view | Win/loss display during/after rundown | MEDIUM |
| Automatic telemetry bridge | Rated buy-ins → dashboard rollups | CRITICAL (backend) |

---

## UI Gap Details

### 1. Chip Count Capture UI (CRITICAL)

**Problem:** No UI to record inventory snapshots with denomination breakdown.

**Use Cases:**
- **Opening snapshot** - Baseline at session start
- **Closing snapshot** - Final count at session end
- **Mid-shift / ad-hoc rundown** - Interim counts for pacing, break coverage, or audit

**Required Component:**

```
ChipCountCaptureDialog
├── Snapshot type selector: OPENING | CLOSING | RUNDOWN | AD_HOC
├── Denomination grid (casino-configurable chip colors/values)
│   ├── $1 chips: [quantity input]
│   ├── $5 chips: [quantity input]
│   ├── $25 chips: [quantity input]
│   ├── $100 chips: [quantity input]
│   ├── $500 chips: [quantity input]
│   └── [Additional denominations per casino config]
├── Auto-computed total (read-only)
├── Counted by (current user, auto-filled)
├── Verified by (optional second signature)
├── Notes field
└── Submit → calls logInventorySnapshot RPC
```

**Service layer:** Existing `logInventorySnapshot()` in `services/table-context/chip-custody.ts`

**RPC:** Existing `rpc_log_table_inventory_snapshot()`

---

### 2. Grind Logging UI (HIGH)

**Problem:** No UI for pit boss to log anonymous/unrated buy-ins (grind).

**Use Cases:**
- Pit boss observes cash buy-in at table from unrated player
- Captures approximate amount for shift dashboard accuracy
- Quick-tap interface for high-volume logging

**Required Component:**

```
GrindBuyinPanel
├── Quick-tap denomination buttons (matching US currency):
│   ├── +$5
│   ├── +$10
│   ├── +$20
│   ├── +$50
│   └── +$100 (or Custom)
├── Custom amount input (for larger/odd amounts)
├── Current shift grind total (running count)
├── "Undo last" button (reversal for mistakes)
└── Submit → calls rpc_log_table_buyin_telemetry(kind='GRIND_BUYIN')
```

**Design note:** Buttons should match common cash denominations ($5, $10, $20, $50) since grind buy-ins are typically cash-based. The +$100 button covers larger bills or can be replaced with a "Custom" option.

**Placement options:**
- Floating action button on table screen
- Dedicated panel in inventory view
- Quick-action in table toolbar

---

### 3. Close Session Dialog Enhancement (HIGH)

**Problem:** Current dialog requires manual UUID entry for artifacts.

**Current state:** `components/table/close-session-dialog.tsx` has text inputs for:
- `drop_event_id` (raw UUID)
- `closing_inventory_snapshot_id` (raw UUID)

**Required improvements:**

```
CloseSessionDialog (enhanced)
├── Closing Inventory Snapshot
│   ├── Dropdown: Select from recent snapshots for this table
│   ├── OR: "Take New Snapshot" → opens ChipCountCaptureDialog
│   └── Display: timestamp, total, counted_by
├── Drop Event
│   ├── Dropdown: Select from today's drop events for this table
│   ├── OR: "Log Drop Event" → opens DropEventDialog
│   └── Display: timestamp, seal_no, removed_by
├── Notes field
└── Submit (enabled only when at least one artifact selected)
```

---

### 4. Drop Event Logging UI (HIGH)

**Problem:** No UI to log drop box removal/custody chain.

**Required Component:**

```
DropEventDialog
├── Drop box ID (optional, casino-specific)
├── Seal number (if applicable)
├── Removed by (current user, auto-filled)
├── Witnessed by (staff picker)
├── Gaming day (auto-derived from casino settings)
├── Sequence number (auto-increment per table/day)
├── Notes field
└── Submit → calls logDropEvent RPC
```

**Service layer:** Existing `logDropEvent()` in `services/table-context/chip-custody.ts`

---

### 5. Live Inventory Panel (HIGH)

**Problem:** `components/pit-panels/inventory-panel.tsx` uses hardcoded mock data.

**Required changes:**

```
InventoryPanel (live data)
├── Connect to getInventoryHistory() for real snapshots
├── Connect to table_fill / table_credit queries
├── Connect to table_drop_event queries
├── Session-scoped filtering (show only current session's artifacts)
├── Real-time updates via React Query polling or subscriptions
└── Integration with ChipCountCaptureDialog for "Count Chips" button
```

---

### 6. Rundown Summary View (MEDIUM)

**Problem:** No UI to display computed win/loss for a session.

**Required Component:**

```
RundownSummaryPanel
├── Opening bankroll (from opening snapshot)
├── Closing bankroll (from closing snapshot)
├── Total fills (sum of verified fills)
├── Total credits (sum of verified credits)
├── Computed win/loss (inventory-based: closing - opening + fills - credits)
└── Data source: rpc_shift_table_metrics or local computation
```

---

## Deferred / Out of Scope

### Fill/Credit Request Workflows

**Status:** Deferred - depends on cashier/cage workflows that do not exist.

**Rationale:** Fill and credit workflows require:
- Cage-side approval and chip issuance
- Runner transport tracking
- Multi-party signature verification
- Integration with cage accountability system

These are **cross-bounded-context** workflows involving:
- TableContext (pit-side request and verification)
- CageContext (chip issuance and accountability) - **does not exist**

**Recommendation:** Defer until CageContext service is designed. Current `table_fill` and `table_credit` tables can be used for manual record-keeping, but automated workflows require cage integration.

---

## Backend Gap: Automatic Telemetry Bridge (CRITICAL)

**Problem:** Rated buy-ins logged via `player_financial_transaction` do not automatically populate `table_buyin_telemetry`.

**Impact:** Shift dashboard's `estimated_drop_rated_cents` is always $0 for rated buy-ins.

**Required:** Database trigger on `player_financial_transaction`:

```sql
-- AFTER INSERT ON player_financial_transaction
-- WHEN NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL
-- INSERT INTO table_buyin_telemetry(
--   kind = 'RATED_BUYIN',
--   source = 'finance_bridge',
--   idempotency_key = 'pft:' || NEW.id
-- )
```

**See:** `GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md` for guardrails G1-G5.

---

## Implementation Priority

### Phase 1: Enable Session Close (Current Blocker)
1. `ChipCountCaptureDialog` - Create closing inventory snapshots
2. Enhance `CloseSessionDialog` with artifact pickers
3. Connect `InventoryPanel` to live data

### Phase 2: Operational Completeness
4. `DropEventDialog` - Log drop custody events
5. `GrindBuyinPanel` - Manual buy-in telemetry
6. `RundownSummaryPanel` - Win/loss display

### Phase 3: Backend Pipeline
7. Automatic telemetry bridge (DB trigger)

### Deferred
- Fill/credit request workflows (requires CageContext)
- Soft count integration
- Exception tracking

---

## Definition of Done

- [ ] Pit boss can capture chip inventory (opening/closing/mid-shift)
- [ ] Pit boss can close session by selecting artifacts from picker (not manual UUID)
- [ ] Pit boss can log grind buy-ins with quick-tap buttons
- [ ] Pit boss can log drop events
- [ ] Inventory panel shows live data, not mock data
- [ ] Rundown summary shows computed win/loss
- [ ] Rated buy-ins automatically flow to telemetry (bridge trigger)

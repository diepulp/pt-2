---
doc: "Investigation Findings"
id: "FINDINGS-PRD-038A-UI-WIRING"
parent_prd: "PRD-038, PRD-038A"
date: "2026-02-25"
status: "Draft"
supersedes: "UI-WIRING-PLAN-PRD-038A.md (invalidated — wrong UI surface assumptions)"
---

# PRD-038/038A UI Wiring — Investigation Findings

## Executive Summary

The original `UI-WIRING-PLAN-PRD-038A.md` is **architecturally wrong**. It conflates
two distinct UI surfaces and misidentifies where table lifecycle operations should live.
This document corrects the record and defines the actual integration gaps.

---

## Finding 1: Two Distinct UI Surfaces, Not One

The plan treats the shift dashboard and pit terminal as a single integration target.
They are architecturally separate with different users, concerns, and data granularity.

| Surface | Route | Purpose | User | Granularity |
|---------|-------|---------|------|-------------|
| **Pit Terminal** | `/pit` | Manage individual tables — open/close sessions, rate players, count chips | Pit Boss | Per-table |
| **Shift Dashboard** | `/shift-dashboard` | Monitor aggregate shift KPIs — win/loss, coverage, quality | Floor Supervisor | Per-shift (casino-scope) |

**The plan put table-level operations (close reason, force close, reconciliation)
on the shift dashboard.** These belong exclusively on the pit terminal.

### What goes WHERE

| Feature | Correct Surface | Why |
|---------|----------------|-----|
| Close reason dropdown | **Pit Terminal** (CloseSessionDialog) | Per-table operation during session close |
| Force close button | **Pit Terminal** (CloseSessionDialog) | Emergency per-table override |
| Unresolved items warning | **Pit Terminal** (CloseSessionDialog) | Per-session guardrail |
| Reconciliation badge | **Pit Terminal** (TablesPanel / session card) | Per-table flag after forced close |
| Checkpoint button | **Shift Dashboard** (header toolbar) | Shift-level snapshot |
| Win/loss delta badge | **Shift Dashboard** (HeroWinLossCompact) | Shift-level KPI delta |
| Per-table delta column | **Shift Dashboard** (MetricsTable) — deferred vNext | Shift-level drill-down |
| Rundown report / finalize | **Pit Terminal** (table detail / session view) | Per-table audit artifact |

---

## Finding 2: Orphaned Components — Not Wired Into Any Page

Two key components exist but are **rendered by nothing**:

### `components/table/session-action-buttons.tsx`
- Provides Open Session / Start Rundown / Close Session buttons
- Has `compact` and `default` variants
- Uses `useOpenTableSession`, `useStartTableRundown`, `canOpenSession`, etc.
- **Imported by: NOTHING** — zero consumer references in the codebase

### `components/table/close-session-dialog.tsx`
- Full close workflow with artifact pickers (drop event, closing inventory snapshot)
- **Hardcodes `close_reason: 'end_of_shift'`** (line 148) — no user selection
- **Imported by: NOTHING** — `artifact-picker.tsx` is a sibling, not a consumer

### Root cause
The `TablesPanel` (the pit terminal's table view) renders `TableToolbar` which has
action groups for slips, limits, and enrollment — but **no session lifecycle actions**.
The toolbar was built for rating slip operations (player-centric) without considering
table session lifecycle (table-centric).

---

## Finding 3: Backend Is Complete, Frontend Is Disconnected

The `table-lifecycle` branch merge brought comprehensive backend + service layer work:

| Layer | Status | Evidence |
|-------|--------|---------|
| **DB migrations** (8 files) | Complete | `close_reason_type` enum, `table_rundown_report`, `shift_checkpoint`, attribution columns, guardrail RPCs |
| **RPCs** | Complete | `rpc_persist_table_rundown`, `rpc_finalize_rundown`, `rpc_create_shift_checkpoint`, `rpc_force_close_table_session`, modified `rpc_close_table_session` |
| **Service layer** | Complete | `rundown-report/` and `shift-checkpoint/` subdirectories with full DTOs, schemas, mappers, CRUD, HTTP, keys |
| **API route handlers** (8 routes) | Complete | All table-rundown-reports, shift-checkpoints, force-close routes |
| **React Query hooks** (8 hooks) | Complete | Rundown, checkpoint, delta hooks all exist |
| **UI components** | **Disconnected** | Components exist but are not rendered in any page |
| **Dashboard wiring** | **Not started** | shift-dashboard-v3 has no checkpoint/delta integration |

---

## Finding 4: The CloseSessionDialog Needs Close Reason UI

The dialog hardcodes `close_reason: 'end_of_shift'` at line 148:

```tsx
await closeMutation.mutateAsync({
  drop_event_id: useDropEvent && dropEventId ? dropEventId : undefined,
  closing_inventory_snapshot_id: ...,
  notes: notes.trim() || undefined,
  close_reason: 'end_of_shift',  // ← HARDCODED
});
```

The backend Zod schema (`closeTableSessionSchema`) requires `close_reason` and
conditionally requires `close_note` when `close_reason === 'other'`. But the UI
provides no mechanism for the user to choose a reason.

### Missing from CloseSessionDialog:
1. `<Select>` for close reason (8 enum options from `CLOSE_REASON_LABELS`)
2. `<Textarea>` for close note (shown/required when reason = 'other')
3. Unresolved items `<Alert>` when `session.has_unresolved_items === true`
4. "Force Close" button for `pit_boss`/`admin` roles using `useForceCloseTableSession`
5. `staffRole` prop for role-gated force-close visibility

---

## Finding 5: Missing Service Layer Items

| Item | Status | File |
|------|--------|------|
| `CLOSE_REASON_LABELS` (human-readable labels for 8 close reasons) | **Missing** | `services/table-context/labels.ts` — has table status + session phase labels but NOT close reason |
| `forceCloseTableSession` HTTP fetcher | **Missing** | `services/table-context/http.ts` — route handler exists but no client fetcher |
| `useForceCloseTableSession` hook | **Missing** | `hooks/table-context/use-table-session.ts` — only has close, not force-close |

---

## Finding 6: Shift Dashboard Components in Wrong Directory

The merge placed checkpoint/delta components in `components/shift-dashboard/` (the legacy
directory) rather than `components/shift-dashboard-v3/` (the active dashboard):

| Component | Actual Location | Expected Location |
|-----------|----------------|-------------------|
| `CheckpointButton` | `components/shift-dashboard/checkpoint-button.tsx` | `shift-dashboard-v3/layout/` or imported as-is |
| `DeltaBadge` | `components/shift-dashboard/delta-badge.tsx` | Used by `shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` |
| `LateEventBadge` | `components/shift-dashboard/late-event-badge.tsx` | Used in rundown report display |

These can be imported from their current location — no move needed — but the shift-dashboard-v3
orchestrator (`shift-dashboard-v3.tsx`) does not wire them.

---

## Open Questions

### Q1: Where exactly should `SessionActionButtons` render in the pit terminal?

Options:
- **A) Inside `TableToolbar`** — Add a "Session" action group alongside existing slip/limits groups
- **B) Above `TableLayoutTerminal`** — Dedicated session status bar between toolbar and table visualization
- **C) In `TablesPanel` header** — Next to table name, showing current session status + actions

**Recommendation:** Option A (toolbar integration) is most consistent with existing patterns.
The toolbar already groups related actions. Add a "Session" group with the lifecycle buttons.

### Q2: How does the pit boss know the current session state?

Currently `TablesPanel` receives `DashboardTableDTO` which has `status` (table availability)
but NOT the session state (OPEN/ACTIVE/RUNDOWN/CLOSED). The `useCurrentTableSession(tableId)`
hook exists but is not called in the pit terminal flow.

**This is a data-flow gap:** `PitPanelsClient` must call `useCurrentTableSession(selectedTableId)`
and pass the session to `TablesPanel` → `SessionActionButtons` → `CloseSessionDialog`.

### Q3: Should rundown report/finalize UI live in a separate tab or panel?

The pit terminal has tabs: Tables, Active Sessions, Inventory, Analytics, Sessions.
Options:
- **A)** Add a "Rundown" section to the existing Tables tab (inline below table visualization)
- **B)** Show rundown report in the "Sessions" tab (alongside closed sessions)
- **C)** Pop a rundown sheet/drawer when session transitions to RUNDOWN state

**Recommendation:** Option A for quick access, Option C for detailed view.

### Q4: How does `staffRole` reach the CloseSessionDialog?

The pit page (`app/(dashboard)/pit/page.tsx`) authenticates via `getAuthContext()` which
provides `staffId` but the staff role may not be propagated down to the dialog.
Need to verify if `DashboardTableDTO` or the auth context includes role information.

### Q5: Should we keep the legacy `components/shift-dashboard/` checkpoint/delta components?

They work but target the wrong dashboard directory. Options:
- **A)** Import from `shift-dashboard/` into `shift-dashboard-v3/` (no file move)
- **B)** Move to `shift-dashboard-v3/` and update imports

**Recommendation:** Option A for now. Don't move files unnecessarily.

### Q6: Is MetricsTable per-table delta column in scope for MVP?

PRD-038 says per-table deltas are "deferred vNext" for UI. The schema and RPC support
it, but the UI was explicitly scoped out. The original wiring plan included it — should it?

**Recommendation:** Defer. Focus on casino-scope HeroWinLossCompact delta first.

---

## Corrected Scope: Two Independent Workstreams

### Workstream A: Pit Terminal — Table Session Lifecycle Wiring

**Goal:** Pit boss can open, close (with reason), force-close, and view rundown for individual tables.

**Integration points:**
1. `PitPanelsClient` → call `useCurrentTableSession(selectedTableId)`
2. `TablesPanel` → receive session prop → render `SessionActionButtons`
3. `SessionActionButtons` → `onCloseRequest` opens `CloseSessionDialog`
4. `CloseSessionDialog` → enhanced with close reason, force close, guardrails
5. `ReconciliationBadge` → shown on table cards when `requires_reconciliation`

**Files to modify:**
- `components/pit-panels/pit-panels-client.tsx` — add session query + pass down
- `components/pit-panels/tables-panel.tsx` — accept session prop, render SessionActionButtons
- `components/table/close-session-dialog.tsx` — add close reason, force close, guardrails
- `services/table-context/labels.ts` — add CLOSE_REASON_LABELS
- `services/table-context/http.ts` — add forceCloseTableSession fetcher
- `hooks/table-context/use-table-session.ts` — add useForceCloseTableSession hook

**New files:**
- `components/table/reconciliation-badge.tsx`

### Workstream B: Shift Dashboard — Checkpoint & Delta Display

**Goal:** Floor supervisor can checkpoint shift metrics and see delta since last checkpoint.

**Integration points:**
1. `shift-dashboard-v3.tsx` → call `useLatestCheckpoint()`, `useCheckpointDelta()`
2. `ShiftDashboardHeader` → render `CheckpointButton`
3. `HeroWinLossCompact` → accept + render `checkpointDelta` prop

**Files to modify:**
- `components/shift-dashboard-v3/shift-dashboard-v3.tsx` — add checkpoint queries
- `components/shift-dashboard-v3/layout/shift-dashboard-header.tsx` — add CheckpointButton
- `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` — add delta prop

**No new files** — import existing `CheckpointButton` from `components/shift-dashboard/`.

---

## Recommendation

**Discard the original `UI-WIRING-PLAN-PRD-038A.md`.** Replace with two focused plans:

1. **PIT-TERMINAL-SESSION-WIRING.md** — Workstream A above
2. **SHIFT-DASHBOARD-CHECKPOINT-WIRING.md** — Workstream B above

These are independent and can be executed in parallel. Workstream A is the higher-priority
item (close reason is hardcoded and the session buttons are orphaned). Workstream B is
lower risk (existing components just need import wiring).

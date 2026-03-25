---
title: "Session Close Downstream Gaps — Table Stays Active, Players Unaffected, Dashboard Stale"
issue_id: ISSUE-SESSION-CLOSE-DOWNSTREAM
status: open
severity: P1
date: 2026-03-23
branch: table-lifecycle-recovery
affects:
  - table-layout-terminal badge
  - pit-map-selector dropdown
  - shift dashboard table grid
  - player/rating-slip lifecycle
  - session close workflow
root_cause: Session closure is a terminal DB state change with no downstream side-effects
---

# Session Close Downstream Gaps

## Observed Symptoms

After a pit boss closes a table session (ACTIVE/RUNDOWN -> CLOSED):

1. **Table remains "active"** — `gaming_table.status` is unchanged; the green badge and "In Play" / "active" label reverts to green "active" instead of signaling "session ended"
2. **Players still seated** — Open/paused rating slips are not affected; players appear to be actively playing at a closed table
3. **Shift dashboard shows table as Active** — No visual distinction between a table with an active session and one whose session just closed
4. **Pit navigation shows "Available"** — The pit-map-selector maps `gaming_table.status = 'active'` to label "Available" (ADR-028 D6), which is technically correct but operationally misleading for a table that just closed its session

---

## Issue 1: Table Badge Reverts to Raw "active" After Session Close

### Evidence

**File**: `components/table/table-layout-terminal.tsx:67-79`

```typescript
// EXEC-038A Bug 3: Derive effective badge status from session lifecycle
const effectiveStatus: 'active' | 'inactive' | 'closed' = sessionStatus
  ? sessionStatus === 'RUNDOWN'
    ? 'inactive'
    : 'active'
  : tableStatus;   // <-- Falls back to gaming_table.status when session is null

const effectiveLabel = sessionStatus
  ? ({ OPEN: 'Opening', ACTIVE: 'In Play', RUNDOWN: 'Rundown' } as const)[sessionStatus]
  : tableStatus;   // <-- Shows raw string "active", not a semantic label
```

### Problem

When a session closes, the dashboard RPC `rpc_get_dashboard_tables_with_counts` returns `current_session_status = null` (because the query filters `WHERE status IN ('OPEN','ACTIVE','RUNDOWN')`). This makes `sessionStatus` null, so:

- `effectiveStatus` falls back to `tableStatus` = `'active'` (green badge)
- `effectiveLabel` falls back to `tableStatus` = `'active'` (raw enum string as label text)

The table looks identical to one that never had a session. There is no visual state for "session just closed" or "no active session on this active table."

### Additional Label Inconsistency

Two components use different label systems for the same `'active'` status:

| Component | `gaming_table.status = 'active'` displays as | Source |
|-----------|----------------------------------------------|--------|
| `pit-map-selector.tsx` | **"Available"** | `STATUS_CONFIG` lookup (ADR-028 D6) |
| `table-layout-terminal.tsx` | **"active"** (raw) | Direct `tableStatus` fallback |

The terminal badge should use the same ADR-028 D6 labels (`Available` / `Idle` / `Decommissioned`) or the session-aware labels from `getSessionStatusLabel()`.

### Fix Required

The `effectiveLabel` fallback should map through `STATUS_CONFIG` or `TABLE_AVAILABILITY_LABELS` (from `services/table-context/labels.ts`) instead of using the raw enum string.

---

## Issue 2: Pit Navigation Dropdown Shows "Available" — Correct but Misleading

### Evidence

**File**: `components/table/pit-map-selector.tsx:50-77`

```typescript
const STATUS_CONFIG: Record<TableStatus, { label: string; ... }> = {
  active: { label: 'Available', ... },
  inactive: { label: 'Idle', ... },
  closed: { label: 'Decommissioned', ... },
};
```

### Problem

The pit-map-selector exclusively reads `gaming_table.status` and does not consider `current_session_status`. A table with `gaming_table.status = 'active'` always shows "Available" regardless of whether:
- It has an active session (ACTIVE/RUNDOWN)
- Its session was just closed
- It never had a session

This is **not a seed data bug** — the labels are correctly mapped from the enum per ADR-028 D6. The problem is that the pit-map-selector has no session awareness. It should incorporate `current_session_status` to show richer states like "In Play", "Rundown", or "Available (No Session)".

### Fix Required

The `PitMapTable` interface needs a `sessionStatus` field, and `STATUS_CONFIG` needs session-aware label overrides.

---

## Issue 3: Shift Dashboard Does Not Distinguish "Active Session" from "No Session"

### Evidence

**File**: `supabase/migrations/20260320173126_enrich_dashboard_rpc_session_status.sql:59-81`

The dashboard RPC correctly returns `current_session_status` via a LEFT JOIN to `table_session`:

```sql
LEFT JOIN (
  SELECT DISTINCT ON (gaming_table_id)
    gaming_table_id, status as session_status
  FROM table_session
  WHERE status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
    AND casino_id = v_casino_id
  ORDER BY gaming_table_id, opened_at DESC
) current_sessions ON current_sessions.gaming_table_id = gt.id
```

When a session closes, `session_status` becomes null. The `table-layout-terminal.tsx` then falls back to `gaming_table.status = 'active'`, showing a green badge. The shift dashboard grid shows the same green "active" indicator for:
- Tables with active sessions (correct)
- Tables whose session just closed (misleading)
- Tables with no session at all (ambiguous)

### Root Cause

The `effectiveStatus` derivation in `table-layout-terminal.tsx` maps `sessionStatus = null` + `tableStatus = 'active'` to the same green visual as `sessionStatus = 'ACTIVE'`. There is no "no session" visual state distinct from "active session".

### Fix Required

When `sessionStatus` is null and `tableStatus` is 'active', the badge should show a visually distinct state (e.g., dimmed green, different label like "Available" or "No Session") rather than the same fully-lit green used during active play.

---

## Issue 4: Session Close Does Not Affect Gaming Table Status (By Design — Not a Bug)

### The Question

Should closing a table session change `gaming_table.status` from `'active'` to something else (e.g., `'closed'` or `'inactive'`)?

### Answer: No — and here is precisely why

**File**: `docs/80-adrs/ADR-028-table-status-standardization.md` (D1, D2)

`gaming_table.status` is a **persistent administrative availability state**, not an operational lifecycle indicator. The three enum values have specific, non-overlapping meanings:

| `gaming_table.status` | Canonical Meaning (ADR-028 D2) | Recovery Path |
|---|---|---|
| `inactive` | **Maintenance / offline** — table physically unavailable | Admin activates → `active` |
| `active` | **Available for operation** — accepting sessions and players | Persistent; stays active across sessions |
| `closed` | **Permanently decommissioned** — table removed from service | **Terminal. No recovery.** Cannot open sessions ever again. |

**Setting `gaming_table.status = 'closed'` on session close would permanently decommission the table** — the pit boss could never open a new session on it. This is the equivalent of removing the physical table from the casino floor.

**Setting `gaming_table.status = 'inactive'` on session close would imply maintenance/offline** — which is semantically wrong and would require admin intervention to re-activate before the next session could open (ADR-028 D3 availability gate).

### The Semantic Gap

The `gaming_table.status` enum was designed for three administrative states and deliberately has **no value for "available but between sessions."** The states are:

```
inactive  = "this table is offline"
active    = "this table is in service"
closed    = "this table is gone forever"
```

None of these mean "session ended, awaiting next session." That concept lives entirely in the session lifecycle (`table_session.status = 'CLOSED'`).

### Why ADR-028 D1 Is Correct

ADR-028 D1 states: *"Availability (table_status) and lifecycle (table_session_status) are orthogonal concerns."*

This is the right call because:
1. **Temporal vs persistent state**: Sessions are per-shift artifacts; table availability is administrative/persistent
2. **Pit boss agency**: A closed session does not mean the table should go offline — the same table may get a new session immediately
3. **Shift rotation**: Tables cycle through multiple sessions per day — closing one session is routine, not an availability event
4. **One-way gate**: `rpc_open_table_session` requires `gaming_table.status = 'active'` (D3) — the gate enforces the constraint in the correct direction (availability gates session creation, not vice versa)

### The Real Problem

The architecture is sound, but **the UI conflates the two concerns**. When `sessionStatus = null` and `tableStatus = 'active'`, the display falls back to the same green badge used for an active session. The fix is in the **presentation layer** (Issues #1–3), not in the data model. The UI must derive a composite visual state from both statuses:

| `gaming_table.status` | `current_session_status` | Correct UI State |
|---|---|---|
| `active` | `ACTIVE` | Green, "In Play" |
| `active` | `RUNDOWN` | Amber, "Rundown" |
| `active` | `null` (closed/none) | Dimmed green, "Available" or "No Session" |
| `inactive` | any | Gray, "Idle" |
| `closed` | any | Dark gray, "Decommissioned" |

---

## Issue 5: Players and Rating Slips Are Not Affected by Session Close

### Evidence

**Service layer check exists but is one-directional:**

**File**: `services/table-context/table-session.ts:336-354`

```typescript
// Check for open rating slips before close
const hasOpenSlips = await hasOpenSlipsForTable(supabase, currentSession.gaming_table_id, currentSession.casino_id);
if (hasOpenSlips) {
  throw new DomainError('TABLE_HAS_OPEN_SLIPS');
}
```

This blocks standard close when open slips exist. But:

### Sub-Issue 5a: Force-close bypasses the open-slips check

`rpc_force_close_table_session` does not check for open rating slips. After force-close:
- Rating slips remain in `open` or `paused` status
- The visit remains open (`ended_at IS NULL`)
- No audit trail of the orphaned slips
- `requires_reconciliation = true` is set but there is no reconciliation workflow to consume it

### Sub-Issue 5b: `has_unresolved_items` flag is never populated

**File**: `components/table/close-session-dialog.tsx:152`

```typescript
const hasUnresolvedItems = session?.has_unresolved_items ?? false;
```

This flag **defaults to false and is never set by any code path**. The frontend guardrail for unresolved items is non-functional. This was documented as **Bug 2, High Severity** in `EXEC-038A-SESSION-UI-BUGS.md` but remains unfixed.

### Sub-Issue 5c: No post-close cleanup for rating slips or visits

When a session closes (standard or force):
- **Rating slips**: Remain untouched. Open slips continue to show as active for the table.
- **Visits**: `visit.ended_at` stays NULL. The player appears to be still checked in.
- **No triggers**: No DB trigger auto-closes or flags orphaned slips on session close.
- **No events**: No service-layer post-close hook to notify RatingSlipService or VisitService.

### Bounded Context Boundary

Per SRM v4.11.0:
- `TableContextService` owns `table_session`
- `RatingSlipService` owns `rating_slip`
- `VisitService` owns `visit`

Session close is a terminal event in TableContext that should emit a cross-context signal. Currently no such signal exists — the bounded contexts are decoupled but lack the domain event plumbing for lifecycle coordination.

---

## Issue 6: Dashboard Real-Time Subscription Does Not Listen to `table_session`

### Evidence

**File**: `hooks/dashboard/use-dashboard-realtime.tsx:85-109`

The real-time subscription listens to:
- `gaming_table` changes
- `rating_slip` changes

It does **not** subscribe to `table_session` changes. When a session closes, the real-time channel does not fire, so the dashboard does not auto-refresh. The cache invalidation only happens through the mutation hook's `onSuccess` callback — which only fires on the client that performed the close action, not on other connected clients viewing the same dashboard.

### Impact

If Pit Boss A closes a session, Pit Boss B (viewing the same dashboard on another terminal) will not see the update until their next manual refresh or the 30-second stale time expires.

---

## Summary: Issue Matrix

| # | Issue | Severity | Root Cause | Fix Scope |
|---|-------|----------|------------|-----------|
| 1 | Table badge shows raw "active" after session close | **P1** | `effectiveLabel` fallback uses raw enum string, not ADR-028 labels | Frontend: `table-layout-terminal.tsx` |
| 2 | Pit dropdown shows "Available" with no session awareness | **P2** | `pit-map-selector` reads only `gaming_table.status`, ignores session | Frontend: `pit-map-selector.tsx` |
| 3 | Dashboard grid has no "no session" visual state | **P1** | `effectiveStatus` maps null session + active table to same green as active session | Frontend: `table-layout-terminal.tsx` |
| 4 | `gaming_table.status` unchanged on session close | **Info** | By design (ADR-028 D1) — not a bug, but creates downstream display issues | N/A (design decision) |
| 5a | Force-close orphans open rating slips | **P1** | Force-close skips `hasOpenSlipsForTable` check; no post-close cleanup | Service + RPC |
| 5b | `has_unresolved_items` flag never set | **P1** | Placeholder from PRD-038A; no code path populates it | Service + RPC |
| 5c | No post-close rating slip/visit cleanup | **P2** | No cross-context domain event on session close | Architecture: event plumbing |
| 6 | Real-time subscription missing `table_session` | **P2** | `use-dashboard-realtime` only subscribes to `gaming_table` + `rating_slip` | Hook: `use-dashboard-realtime.tsx` |

---

## Affected Files

### Frontend (Display Issues: 1, 2, 3)
- `components/table/table-layout-terminal.tsx` — effectiveStatus/effectiveLabel derivation
- `components/table/pit-map-selector.tsx` — STATUS_CONFIG label mapping
- `services/table-context/labels.ts` — TABLE_AVAILABILITY_LABELS (unused by terminal)

### Real-Time (Issue 6)
- `hooks/dashboard/use-dashboard-realtime.tsx` — missing `table_session` subscription

### Service Layer (Issues 5a, 5b, 5c)
- `services/table-context/table-session.ts` — closeTableSession, forceCloseTableSession
- `services/rating-slip/queries.ts` — hasOpenSlipsForTable (consumed but not orchestrated post-close)
- `components/table/close-session-dialog.tsx` — has_unresolved_items flag consumption

### Database (Issues 5a, 5b)
- `supabase/migrations/20260225110743_prd038a_close_guardrails_rpcs.sql` — rpc_force_close_table_session
- `supabase/migrations/20260225110509_prd038a_schema_additions.sql` — has_unresolved_items column

### Architecture Reference
- `docs/80-adrs/ADR-028-table-status-standardization.md` — D1 decoupling rationale
- `docs/issues/gaps/table-inventory-lifecycle/EXEC-038A-SESSION-UI-BUGS.md` — Bug 2 (has_unresolved_items)

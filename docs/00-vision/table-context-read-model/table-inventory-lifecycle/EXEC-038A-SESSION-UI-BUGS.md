---
id: EXEC-038A-SESSION-UI-BUGS
title: "Session UI Bugs — Investigation + Fix Spec"
status: ready
date: 2026-03-01
branch: feat/pit-terminal-session-ui
parent_spec: docs/21-exec-spec/EXEC-038A-pit-terminal-session-wiring.md
related:
  - GAP-SESSION-ROLLOVER.md
---

# EXEC-038A Session UI — Bug Fix Specification

**Status**: Ready for implementation
**Branch**: `feat/pit-terminal-session-ui`

---

## Terms / Semantics

### Two independent concepts (stop conflating them)

1. **Table availability status** (from `gaming_table.status`)
   - "Is the table enabled/available as an asset?"
2. **Session activity status** (from the current table session)
   - "Is there an active/open/rundown session running on this table?"

UI badges and actions must be driven by the correct concept.

### Close classes

| Close Class | Rules | Open Slips | Reconciliation |
|---|---|---|---|
| **Standard Close** | Human ends session | **Blocked** — must close slips first | N/A |
| **Force Close** | Privileged bypass | Allowed | `requires_reconciliation = true` + actor provenance |
| **Rollover Close** | Shift handoff boundary | Allowed | `close_reason_type = shift_handoff` + `rolled_over_by_staff_id` |

---

## Priority Ranking

| Priority | Bug | Severity | Effort | Rationale |
|----------|-----|----------|--------|-----------|
| **P0** | #2 — Open rating slips bypass | High | Low | Data integrity risk; existing pattern to reuse |
| **P1** | #3 — Stale activity badge | Medium | Low | Misleading operational UI |
| **P1** | #1 — Can't re-open table | Medium | Low | Blocks core workflow |

---

## Bug 1: Table Cannot Be Re-Opened After Session Close

**Severity**: Medium — blocks pit boss workflow
**Symptom**: After closing a table session, the "Open Session" button remains grayed out / disabled.

### Root Cause: Cache Staleness / Refetch Timing

All predicates and invalidation logic are individually correct:

- `canOpenSession()` returns `true` when session is `null` or `CLOSED` (`hooks/table-context/use-table-session.ts:171-173`)
- `rpc_get_current_table_session` filters `status IN ('OPEN','ACTIVE','RUNDOWN')` — returns NULL for closed sessions (`supabase/migrations/20260115025237_table_session_rpcs.sql:248-272`)
- Close mutations call `setQueryData(null)` + `invalidateQueries` (`hooks/table-context/use-table-session.ts:122-132`)

**However**, `useCurrentTableSession` has `staleTime: 30_000` (30s). After close sets cache to `null`, a background refetch can race with the stale-time window, or the query may not re-trigger when `selectedTableId` hasn't changed.

### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `hooks/table-context/use-table-session.ts` | 39-46 | Add `refetchOnMount: "always"` to query options |
| `hooks/table-context/use-table-session.ts` | 113-133 | Fix close mutation: cancel → setQueryData(null) → invalidate |

### Implementation

In the **close session mutation success handler** (`use-table-session.ts`), replace the current invalidation with:

```typescript
// 1. Cancel in-flight fetches that could overwrite our cache write
await queryClient.cancelQueries({ queryKey });
// 2. Optimistic set to null
queryClient.setQueryData(queryKey, null);
// 3. Background refetch for consistency
queryClient.invalidateQueries({ queryKey, refetchType: "active" });
```

Add safety belt to query options:

```typescript
refetchOnMount: "always"
```

### Acceptance Criteria

- [ ] Close session → "Open Session" enables immediately (no refresh)
- [ ] Close session → tab focus / window focus does not re-disable
- [ ] Close session → rapid close/open sequences remain consistent

---

## Bug 2: Table Closes With Open Rating Slips Present

**Severity**: High — data integrity / operational risk
**Symptom**: A table session can be standard-closed even when open/paused rating slips exist on the table.

### Root Cause: `has_unresolved_items` Is a Placeholder — Never Set

The guardrail infrastructure exists end-to-end but the flag driving it is never populated:

1. **Frontend** correctly checks `has_unresolved_items` (`close-session-dialog.tsx:150`)
2. **Backend RPC** correctly blocks close when flag is `true` (`prd038a_close_guardrails_rpcs.sql:250-255`)
3. **But the flag defaults to `false` and nothing ever sets it** (`prd038a_schema_additions.sql:33-36`)

The pattern for checking open slips **already exists** in table deactivation:

```typescript
// services/table-context/table-lifecycle.ts:145-149
const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);
if (hasOpenSlips) {
  throw new DomainError('TABLE_HAS_OPEN_SLIPS');
}
```

This calls `services/rating-slip/queries.ts:49-69` — ready-made query.

### Session Lifecycle Context

| Lifecycle Action | Block on open rating slips? | Rationale |
|---|---|---|
| Start Rundown | **No** | Rundown is observational (snapshot / delta); players may still be active |
| Standard Close (from ACTIVE or RUNDOWN) | **Yes** | Session termination; open slips = orphaned player activity |
| Force Close (privileged) | **No** | Override; sets `requires_reconciliation = true` for post-hoc audit |
| Deactivate Table | **Yes** | Already implemented (`table-lifecycle.ts:145-149`) |

### Implementation: Enforce in the Service Layer (Option A)

**Selected approach**: Add `hasOpenSlipsForTable` check in `closeTableSession` service layer, before calling the RPC. Mirrors the deactivation pattern. No migration required.

#### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `services/table-context/table-session.ts` | close function | Add open-slip guard before RPC call |
| `components/table/close-session-dialog.tsx` | 150 | Stop relying on `has_unresolved_items` flag; derive from query |

#### Service layer guard

In `closeTableSession` (standard close path):

```typescript
// Before calling close RPC
const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);
if (hasOpenSlips) {
  throw new DomainError('TABLE_HAS_OPEN_SLIPS');
}
```

Force close path bypasses the check and sets `requires_reconciliation = true`.

#### Stop relying on `has_unresolved_items`

**Prefer**: Derive "open slips exist" from `rating_slip` query (already implemented and truthy). Remove `has_unresolved_items` from gating until Finance/MTL truly owns and writes it.

### Acceptance Criteria

- [ ] With OPEN slip → standard close is blocked with clear UI message
- [ ] With PAUSED slip → standard close is blocked
- [ ] With OPEN slip → force close succeeds and flags reconciliation + logs actor
- [ ] Rundown is unaffected — open slips are expected during rundown
- [ ] Regression: table deactivation and session close both use the same open-slip truth source

---

## Bug 3: Activity Badge Remains 'Active' After Session Close

**Severity**: Medium — misleading UI for pit bosses
**Symptom**: The activity indicator (green badge) on the table in the pit terminal grid stays "active" after the table session is closed.

### Root Cause: Two Independent Status Models Not Synchronized

| Concept | Column | Values | Updated by close? |
|---------|--------|--------|--------------------|
| Physical table availability | `gaming_table.status` | `active`, `inactive`, `closed` | **No** |
| Session lifecycle | `table_session.status` | `OPEN`, `ACTIVE`, `RUNDOWN`, `CLOSED` | **Yes** |

When a session closes:
- `rpc_close_table_session` updates `table_session.status → 'CLOSED'` only
- `gaming_table.status` stays `'active'` (not touched)
- Dashboard RPC (`dashboard_tables_batch_rpc.sql:70`) returns `gt.status` (table status, not session)
- Dashboard tables cache (`useDashboardTables`, 30s stale time) is **not invalidated** by session close mutations

The **toolbar** badge correctly shows session status (reads `session` prop). The **grid/terminal** badge reads `gaming_table.status` — wrong data source for session state.

### Implementation (Option A — immediate + correctness)

#### Step 1: Immediate UX fix (cache invalidation)

| File | Change |
|------|--------|
| `hooks/table-context/use-table-session.ts` | Close mutation also invalidates dashboard tables query key |

When session closes, invalidate the dashboard query used by `useDashboardTables()`.

#### Step 2: Correctness fix (RPC enrichment)

Enrich the dashboard RPC/query to include **current session status** (nullable):
- `current_session_status` (e.g., OPEN/ACTIVE/RUNDOWN or null)

Badge logic:
- If `current_session_status` exists → show session badge
- Else → show table availability status (or neutral "No Session" indicator)

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration: enrich dashboard RPC with LEFT JOIN to current session |
| `hooks/dashboard/use-dashboard-tables.ts` | Consume new `current_session_status` field |
| `components/table/table-layout-terminal.tsx` | Badge reads `current_session_status` instead of `gaming_table.status` |
| `components/dashboard/table-grid.tsx` | Pass `current_session_status` to terminal component |

#### Step 3: UI cleanup (prop naming)

Rename props to stop conflating concepts:
- `tableAvailabilityStatus` (from `gaming_table.status`)
- `sessionStatus` (from session join)

### Acceptance Criteria

- [ ] Close session → badge updates immediately
- [ ] Open session → badge updates immediately
- [ ] Table disabled vs no-session states are distinguishable in the UI

---

## Deferred: Shift Handoff Rollover (complements Bug 2)

> Rollover is out of scope for this bug-fix pass. Documented here to preserve the design constraint.

**Selected approach**: Option A (close old, open new; keep slips attached to old session). Option B (transfer slips) deferred — high complexity, cross-context mutation.

### Constraint: Rollover must not become a Bug 2 loophole

The explicit rule split from the close classes table above applies:
- **Standard Close**: MUST block if open/paused slips exist
- **Rollover Close**: MAY bypass the open-slip block, but must record provenance (`close_reason_type = shift_handoff` + `rolled_over_by_staff_id`)
- **Force Close**: bypass + must flag reconciliation

### Data invariant (A1 — required when rollover is implemented)

> An OPEN/PAUSED rating slip may reference a CLOSED session **only if** that session was closed via rollover (`close_reason_type = "shift_handoff"`).

See `GAP-SESSION-ROLLOVER.md` for full rollover spec.

---

## Implementation Checklist

### React Query (Bug 1 + Bug 3)

- [ ] Close session mutation: `cancelQueries` → `setQueryData(null)` → `invalidateQueries`
- [ ] Invalidate dashboard tables query after close
- [ ] Add `refetchOnMount: "always"` for current session query

### Service Layer Guards (Bug 2)

- [ ] `closeTableSession(standard)` calls `hasOpenSlipsForTable()` and blocks
- [ ] `closeTableSession(force)` bypasses + flags reconciliation
- [ ] Remove `has_unresolved_items` from gating (derive from query instead)

### Dashboard RPC Enrichment (Bug 3)

- [ ] New migration: LEFT JOIN current session status into dashboard tables RPC
- [ ] Badge component reads `current_session_status` instead of `gaming_table.status`
- [ ] Prop rename: `tableAvailabilityStatus` / `sessionStatus`

---

## Cross-References

- EXEC-038A spec: `docs/21-exec-spec/EXEC-038A-pit-terminal-session-wiring.md`
- EXEC-038A audit patch: `docs/21-exec-spec/EXEC-038A-table-lifecycle-audit-patch.md`
- Table lifecycle gap: `docs/issues/gaps/table-inventory-lifecycle/GAP-TABLE-INVENTORY-LIFECYCLE.md`
- Rollover gap: `docs/issues/gaps/table-inventory-lifecycle/GAP-SESSION-ROLLOVER.md`
- PRD-038A UI wiring: `docs/issues/gaps/table-inventory-lifecycle/UI-WIRING-PLAN-PRD-038A.md`

---
title: "Remediation Report — Session Close Lifecycle Gaps (Issues 5a, 5b, 5c)"
issue_id: REMEDIATION-SESSION-CLOSE-LIFECYCLE
parent_issue: ISSUE-SESSION-CLOSE-DOWNSTREAM
status: proposed
severity: P1
date: 2026-03-25
branch: table-lifecycle-recovery
prior_art: 2f1b30a (ADR-028 D6 operator display contract)
scope:
  - has_unresolved_items population (5b)
  - post-close rating slip / visit cleanup (5c)
  - force-close open-slip orphan safety (5a)
bounded_contexts:
  - TableContextService (table_session owner)
  - RatingSlipService (rating_slip owner)
  - VisitService (visit owner)
---

# Remediation Report — Session Close Lifecycle Gaps

## 1. Executive Summary

Session closure is a **terminal DB state change with no downstream side-effects**. When a pit boss closes a table session, the system updates `table_session.status = 'CLOSED'` but does nothing to the open rating slips, active visits, or real-time subscriptions that depend on session availability. The UI guardrail `has_unresolved_items` — designed to block standard close when liabilities exist — is never populated and always defaults to `false`.

The operational invariant the system must enforce:

> **A player can only be seated (rating slip created) at a table that has an active session (`table_session.status IN ('OPEN', 'ACTIVE', 'RUNDOWN')`). When a session closes, all downstream artifacts must be reconciled or flagged.**

This invariant is currently violated at every layer.

---

## 2. Issue Posture

### 2.1 Issue 5b — `has_unresolved_items` Never Populated (PRIMARY)

**Column**: `table_session.has_unresolved_items BOOLEAN NOT NULL DEFAULT false`
**Migration**: `20260225110509_prd038a_schema_additions.sql:35`
**Schema comment**: `"PRD-038A Gap A: Placeholder for Finance/MTL integration. Write ownership: Finance/MTL RPCs or service_role only. TableContextService reads only."`

#### What exists (read path — complete)

| Layer | File | Line | Behavior |
|-------|------|------|----------|
| RPC guardrail | `20260225110743_prd038a_close_guardrails_rpcs.sql` | 230–255 | `rpc_close_table_session` reads flag; raises `P0005 'unresolved_liabilities'` if true |
| Service mapping | `services/table-context/table-session.ts` | 141 | Maps RPC result → `TableSessionDTO.has_unresolved_items` |
| Service error mapping | `services/table-context/table-session.ts` | 228–233 | Maps P0005 → `DomainError('UNRESOLVED_LIABILITIES')` |
| DTO interface | `services/table-context/dtos.ts` | 462 | `has_unresolved_items: boolean` |
| UI consumption | `components/table/close-session-dialog.tsx` | 152 | `session?.has_unresolved_items ?? false` |
| UI validation | `components/table/close-session-dialog.tsx` | 160–165 | Blocks standard close when true |
| UI warning | `components/table/close-session-dialog.tsx` | 332–341 | Shows destructive Alert when true |
| Force-close audit | `20260225110743_prd038a_close_guardrails_rpcs.sql` | 389 | Logs current value in `audit_log.details` |

#### What is missing (write path — zero implementations)

| Expected Writer | Status | Evidence |
|-----------------|--------|----------|
| Finance/MTL RPC that detects open fills/credits | **Does not exist** | Zero SQL functions write this column |
| RatingSlipService signal on unresolved slip state | **Does not exist** | No cross-context write path |
| Any UPDATE statement setting `has_unresolved_items = true` | **Does not exist** | Grep across entire codebase: zero hits |

**Root cause**: The column was created as a forward-compatible placeholder during PRD-038A. The populating RPCs were deferred indefinitely. The read-side guardrail is correctly wired but non-functional because the write side was never built.

**Impact**: The standard-close `unresolved_liabilities` guardrail (`P0005`) can never fire. A pit boss can standard-close a session that has open fills, pending credits, or other unresolved items because the flag that would block them is permanently `false`.

---

### 2.2 Issue 5c — No Post-Close Cleanup for Rating Slips or Visits (TANGENTIAL)

#### The cross-context gap

Per SRM v4.11.0, session closure is a terminal event in `TableContextService` that should produce a cross-context signal. No such signal exists:

| Signal | Source Context | Target Context | Status |
|--------|---------------|----------------|--------|
| "Session closed" → close open slips | TableContext | RatingSlipService | **Missing** |
| "Session closed" → end visits | TableContext | VisitService | **Missing** |
| "Session closed" → refresh dashboard | TableContext | Dashboard hooks | **Missing** (Issue 6) |
| PostgreSQL trigger on `table_session.status` | Database | Any listener | **Does not exist** |
| Domain event / pub-sub | Service layer | Any subscriber | **No infrastructure** |

#### What happens after session close today

| Entity | Expected State | Actual State |
|--------|---------------|--------------|
| `rating_slip` (open/paused) | Closed or flagged | **Untouched** — remains open, player appears actively playing at a closed table |
| `visit` | `ended_at` populated | **NULL** — player appears checked in |
| Dashboard (other clients) | Refreshed | **Stale** until manual refresh or 30s stale time |
| Seat availability | Blocked (no session) | **Still "available"** — `rpc_check_table_seat_availability` checks only `gaming_table.status`, not `table_session.status` |

#### The seating invariant violation

Two RPCs allow player seating without session awareness:

**1. `rpc_check_table_seat_availability`** (`20251222142642_prd017_rpc_table_availability.sql`)
```sql
-- Checks gaming_table.status ONLY (lines 59-74)
-- No table_session lookup
-- A table with gaming_table.status='active' + table_session.status='CLOSED'
-- returns {available: true}
```

**2. `rpc_start_rating_slip`** (`20251227170749_fix_policy_snapshot_population.sql:89-97`)
```sql
-- Validates table is active
IF NOT EXISTS (
  SELECT 1 FROM gaming_table
  WHERE id = p_table_id AND casino_id = p_casino_id AND status = 'active'
) THEN
  RAISE EXCEPTION 'TABLE_NOT_ACTIVE';
END IF;
-- No table_session check — slip can be created for a closed session
```

**Consequence**: After closing a session, a new rating slip can be created at the table before a new session is opened. The slip has no session association. The seating invariant is broken.

---

### 2.3 Issue 5a — Force-Close Orphans Open Rating Slips (RESOLVED)

**Status**: Resolved — force-close button removed from UI in commit `f7490f5`.

**Resolution**: Investigation determined that force-close provides no real operational value today:
- The `has_unresolved_items` guardrail it bypasses is never populated (Issue 5b) — always `false`
- The `OPEN` session state it can close is never written — sessions go directly to `ACTIVE`
- Its only differentiator (closing without artifacts) does not justify a privileged escape hatch

The force-close button, privilege gating (`FORCE_CLOSE_PRIVILEGED_ROLES`), `useAuth` hook, `useForceCloseTableSession` mutation, `handleForceClose` callback, and the unresolved-items warning directing users to force-close were all removed from `close-session-dialog.tsx`. The backend RPC, API endpoint, service function, and HTTP wrapper are retained for future reconciliation workflows.

#### Original issue (preserved for context)

Force-close skipped the open-slips pre-check (`hasOpenSlipsForTable()`) and required no closing artifacts. When used, it orphaned open rating slips and visits with no cascade, no cleanup, and no enumeration of affected records in the audit trail. The `requires_reconciliation` flag was set but no workflow consumed it.

---

## 3. Root Cause Analysis

The issues share a single architectural root cause:

> **Session closure is implemented as an isolated state mutation with no lifecycle orchestration.**

The close RPCs update `table_session` in isolation. There are no:
- Database triggers propagating state changes to related tables
- Service-layer post-close hooks coordinating across bounded contexts
- Domain events signaling downstream consumers
- Client-side cache invalidation beyond the closing client's own session query

The `has_unresolved_items` guardrail was designed as the **pre-close safety gate** — it was supposed to be populated by Finance/MTL RPCs that detect unresolved fills, credits, or rating slips. Without this population logic, the entire close safety model collapses to: standard close checks for open slips (service layer), force-close checks nothing.

---

## 4. Remediation Plan

### Phase 1: Populate `has_unresolved_items` (Issue 5b — P1)

**Principle**: The flag should be **derived, not manually managed**. Compute it from the actual state of downstream entities at the moment of close, rather than relying on external RPCs to keep it in sync.

#### 4.1.1 Option A — Computed at close time (RECOMMENDED)

Add a computation step inside `rpc_close_table_session` that checks for unresolved items before allowing close:

```sql
-- Inside rpc_close_table_session, BEFORE the has_unresolved_items check:
SELECT EXISTS(
  SELECT 1 FROM rating_slip
  WHERE table_id = v_session.gaming_table_id
    AND casino_id = v_casino_id
    AND status IN ('open', 'paused')
) INTO v_has_unresolved;

-- Update the session flag to reflect reality
UPDATE table_session
  SET has_unresolved_items = v_has_unresolved
  WHERE id = p_table_session_id;
```

**Pros**: Flag always reflects truth. No separate write path to maintain. No race conditions.
**Cons**: Widens the RPC's cross-context read (already done in service layer via `hasOpenSlipsForTable`).

#### 4.1.2 Option B — Trigger-based (DEFERRED)

Create a PostgreSQL trigger on `rating_slip` INSERT/UPDATE/DELETE that recalculates `has_unresolved_items` on the parent session. This keeps the flag always current but adds trigger complexity and requires a reliable `rating_slip → table_session` join path (currently indirect through `gaming_table_id` + temporal overlap).

**Recommendation**: Option A. The flag only matters at close time. Real-time accuracy is unnecessary overhead.

#### 4.1.3 What constitutes "unresolved items"

Define the computation scope for `has_unresolved_items`:

| Condition | Unresolved? | Rationale |
|-----------|-------------|-----------|
| Open rating slips (`status IN ('open','paused')`) for this table | **Yes** | Active play artifacts must be resolved |
| Open visits (`ended_at IS NULL`) with slips at this table | **Yes** | Player still checked in at closing table |
| Pending fills (`table_fill` with no verified status) | **Deferred** | Fill/credit workflow not yet implemented |
| Pending credits | **Deferred** | Same as above |

**MVP scope**: Open rating slips + open visits. Finance/MTL items deferred per original schema comment.

---

### Phase 2: Session-Gated Seating (Issue 5c — P1)

**Principle**: No player can be seated at a table without an active session.

#### 4.2.1 Gate `rpc_start_rating_slip`

Add a session existence check after the `gaming_table.status` check:

```sql
-- After TABLE_NOT_ACTIVE check (line 97):
IF NOT EXISTS (
  SELECT 1 FROM table_session
  WHERE gaming_table_id = p_table_id
    AND casino_id = p_casino_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
) THEN
  RAISE EXCEPTION 'NO_ACTIVE_SESSION: Table % has no active session', p_table_id;
END IF;
```

**Service layer error mapping** (services/table-context/table-session.ts):
```typescript
case 'NO_ACTIVE_SESSION':
  throw new DomainError('NO_ACTIVE_SESSION', 'Table has no active session. Open a session before seating players.');
```

#### 4.2.2 Gate `rpc_check_table_seat_availability`

Add session awareness to the availability check:

```sql
-- After table status checks (line 74), before seat occupancy check:
IF NOT EXISTS (
  SELECT 1 FROM table_session
  WHERE gaming_table_id = p_table_id
    AND casino_id = v_table_record.casino_id
    AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
) THEN
  RETURN jsonb_build_object(
    'available', false,
    'reason', 'no_active_session',
    'table_name', v_table_record.label
  );
END IF;
```

#### 4.2.3 Post-close rating slip flagging

When a session closes (standard or force), flag orphaned slips rather than auto-closing them (preserves bounded context ownership):

**Option**: Add a `session_closed_orphan` flag or status to rating slips found open at close time. This gives RatingSlipService's reconciliation UI (future) a query surface.

**MVP alternative**: The existing `hasOpenSlipsForTable` check in `closeTableSession` already blocks standard close when slips are open. For force-close, the `requires_reconciliation = true` flag combined with the audit log entry (which should enumerate orphaned slips) provides a sufficient paper trail.

---

### Phase 3: Force-Close Safety Hardening (Issue 5a — P1)

**Principle**: Force-close is a privileged escape hatch. It should not silently orphan artifacts — it should **enumerate what it orphans** and produce an actionable reconciliation record.

#### 4.3.1 Enumerate orphaned items in audit log

Enhance `rpc_force_close_table_session` to capture orphaned slips/visits in the audit payload:

```sql
-- Before the UPDATE, capture orphaned items:
SELECT json_agg(json_build_object(
  'slip_id', rs.id,
  'visit_id', rs.visit_id,
  'status', rs.status,
  'seat_number', rs.seat_number
)) INTO v_orphaned_slips
FROM rating_slip rs
WHERE rs.table_id = v_session.gaming_table_id
  AND rs.casino_id = v_casino_id
  AND rs.status IN ('open', 'paused');

-- Include in audit_log.details:
jsonb_build_object(
  'table_session_id', p_table_session_id,
  'close_reason', p_close_reason,
  'has_unresolved_items', v_has_unresolved,
  'orphaned_rating_slips', COALESCE(v_orphaned_slips, '[]'::json),
  'orphaned_slip_count', (SELECT count(*) FROM rating_slip WHERE table_id = v_session.gaming_table_id AND casino_id = v_casino_id AND status IN ('open', 'paused'))
)
```

#### 4.3.2 Set `has_unresolved_items` on force-close too

Even though force-close skips the guardrail check, it should still **record truth**:

```sql
-- Compute the flag (same as Phase 1)
SELECT EXISTS(
  SELECT 1 FROM rating_slip
  WHERE table_id = v_session.gaming_table_id
    AND casino_id = v_casino_id
    AND status IN ('open', 'paused')
) INTO v_has_unresolved;

-- Include in the UPDATE:
UPDATE table_session SET
  status = 'CLOSED',
  has_unresolved_items = v_has_unresolved,  -- RECORD truth
  requires_reconciliation = true,
  ...
```

This gives the reconciliation UI (future) two query surfaces:
- `requires_reconciliation = true` → "this session was force-closed"
- `has_unresolved_items = true` → "this session had open slips at close time"

#### 4.3.3 Force-close should NOT auto-close slips

Force-close should **not cascade-close** rating slips. Rationale:
- RatingSlipService owns `rating_slip` — TableContextService must not mutate it
- Auto-closing could destroy in-progress rating data (average bet, buy-ins, time calculations)
- The pit boss may want to transfer slips to another table/session
- The `requires_reconciliation` flag exists precisely for deferred manual resolution

---

## 5. Affected Files — Change Map

### Migration (new)

| File | Changes |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_session_close_lifecycle_hardening.sql` | (1) Amend `rpc_close_table_session` to compute `has_unresolved_items` from live state. (2) Amend `rpc_force_close_table_session` to compute flag + enumerate orphans in audit. (3) Amend `rpc_start_rating_slip` to add session existence gate. (4) Amend `rpc_check_table_seat_availability` to add session awareness. |

### Service Layer

| File | Changes |
|------|---------|
| `services/table-context/table-session.ts` | Add `NO_ACTIVE_SESSION` error mapping in `mapRpcError`. Remove redundant `hasOpenSlipsForTable` pre-check from `closeTableSession` (now computed inside RPC). |
| `services/table-context/labels.ts` | Add `NO_ACTIVE_SESSION` to error label map. |

### Components

| File | Changes |
|------|---------|
| `components/table/close-session-dialog.tsx` | No changes needed — UI read path already correct. Warning will now display when flag is actually populated. |

### Hooks

| File | Changes |
|------|---------|
| `hooks/table-context/use-table-session.ts` | Add `rating-slip` and `visit` query key invalidation to `useCloseTableSession` and `useForceCloseTableSession` `onSuccess` callbacks. |

### Tests

| File | Changes |
|------|---------|
| `components/table/__tests__/close-session-dialog.test.tsx` | Add test: `has_unresolved_items=true` blocks standard close, shows warning. |
| `services/table-context/__tests__/close-guardrails.test.ts` | Add test: flag is populated by RPC; force-close records truth. |

---

## 6. Boundary Decisions

### What this remediation does NOT do

| Item | Reason | Future Scope |
|------|--------|--------------|
| Auto-close orphaned rating slips | Bounded context violation — RatingSlipService owns `rating_slip` | Reconciliation UI |
| Auto-end orphaned visits | Bounded context violation — VisitService owns `visit` | Reconciliation UI |
| Add `table_session` realtime subscription | Separate issue (#6), orthogonal to data integrity | Dashboard refresh PR |
| Build reconciliation workflow | Large feature — consuming `requires_reconciliation` + `has_unresolved_items` | Dedicated PRD |
| Populate `has_unresolved_items` from Finance/MTL | Fill/credit workflows not implemented | Per original schema comment |
| Add `OPEN → ACTIVE` session gate | Aspirational per `session-open-close-precis.md` | Future lifecycle hardening |
| Gaming day auto-rollover | Out of scope per precis | Future automation |

### Cross-context query allowlist (SRM compliance)

The remediation introduces these cross-context reads:

| RPC | Reads From | Justification |
|-----|-----------|---------------|
| `rpc_close_table_session` | `rating_slip` (count open) | Already done in service layer via `hasOpenSlipsForTable`; moving to RPC for atomicity |
| `rpc_force_close_table_session` | `rating_slip` (enumerate open) | Audit trail completeness |
| `rpc_start_rating_slip` | `table_session` (existence check) | Seating invariant enforcement |
| `rpc_check_table_seat_availability` | `table_session` (existence check) | Seating invariant enforcement |

These are **read-only cross-context queries** — no bounded context writes another context's tables. Consistent with existing pattern (`hasOpenSlipsForTable` in `closeTableSession`).

---

## 7. Issue Dependency Graph

```
Issue 5b (has_unresolved_items population)
  │
  ├── Phase 1: Compute flag at close time
  │     ├── Amend rpc_close_table_session
  │     └── Amend rpc_force_close_table_session
  │
  └── Enables: Close dialog warning (already wired, now functional)

Issue 5c (post-close seating invariant)
  │
  ├── Phase 2: Session-gated seating
  │     ├── Amend rpc_start_rating_slip (NO_ACTIVE_SESSION gate)
  │     └── Amend rpc_check_table_seat_availability (session awareness)
  │
  └── Depends on: Session open/close working correctly (existing)

Issue 5a (force-close orphan safety)
  │
  ├── Phase 3: Enumerate orphans in audit
  │     ├── Amend rpc_force_close_table_session (orphan enumeration)
  │     └── Populate has_unresolved_items on force-close
  │
  └── Depends on: Phase 1 (computation logic shared)
```

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Session gate blocks existing workflows that seat players without opening a session | **High** | Verify all E2E paths open a session before seating. Add clear error message. Check seed data. |
| `has_unresolved_items` computation in RPC extends transaction scope | **Low** | Single indexed query on `rating_slip(table_id, casino_id, status)` — sub-ms |
| Force-close orphan enumeration adds latency | **Low** | `json_agg` on small result set (typically 0–10 slips per table) |
| `hasOpenSlipsForTable` removal from service layer creates gap if RPC bypassed | **None** | All close paths go through RPC; service layer pre-check was defense-in-depth, now redundant |

---

## 9. Acceptance Criteria

- [ ] `has_unresolved_items` is computed from live `rating_slip` state at close time
- [ ] Standard close is blocked when open/paused rating slips exist at the table (flag = true, P0005 fires)
- [ ] Force-close records `has_unresolved_items = true` when open slips exist (does not block)
- [ ] Force-close audit log includes enumerated orphaned slips (slip_id, visit_id, status, seat)
- [ ] `rpc_start_rating_slip` rejects seating when no active session exists (OPEN/ACTIVE/RUNDOWN)
- [ ] `rpc_check_table_seat_availability` returns `{available: false, reason: 'no_active_session'}` when no active session
- [ ] Close dialog warning displays when `has_unresolved_items = true` (existing UI, now functional)
- [ ] `useCloseTableSession` and `useForceCloseTableSession` invalidate rating-slip and visit query caches on success
- [ ] All existing close-session tests pass (no regression)
- [ ] New tests cover: flag population, session gate, orphan enumeration

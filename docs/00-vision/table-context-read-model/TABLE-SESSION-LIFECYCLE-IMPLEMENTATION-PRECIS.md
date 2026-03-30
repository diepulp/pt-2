---
title: "Table Session Lifecycle — Implementation Precis"
doc_type: implementation-precis
status: current
date: 2026-03-23
owner_context: TableContext
scope: Implementation reality vs aspirational vision
branch: table-lifecycle-recovery
tip_commit: b90061a
---

# Table Session Lifecycle — Implementation Precis

## 1. Executive Summary

The table session lifecycle is **substantially implemented** as a 4-state machine governing the operational boundary of a gaming table within a shift. The implementation diverges from the aspirational 10-state vision document (`table-inventory-rundown-lifecycle.md`) by design — the MVP PRD (`PRD-TABLE-SESSION-LIFECYCLE-MVP`) scoped the state machine to the minimum needed for session boundaries, rundown computation, and shift attribution.

**What exists today**: A complete vertical slice — database schema, RLS policies, 6 RPCs, service layer, React Query hooks, API route handlers, and UI components — that lets a pit boss open a table session, manage its lifecycle through ACTIVE → RUNDOWN → CLOSED, compute a table rundown (win/loss), and persist the result atomically on close.

**What does not exist**: The upstream phases (pre-shift setup, soft count integration, exception framework, fill/credit status workflows) and the downstream phases (reconciliation, finalization) from the full lifecycle vision.

---

## 2. Implemented State Machine

### 2.1 States (4-value enum: `table_session_status`)

| State | Meaning | Entry Condition |
|-------|---------|-----------------|
| `OPEN` | Created, awaiting activation | Defined in enum but **unused in practice** — `rpc_open_table_session` inserts directly as `ACTIVE` |
| `ACTIVE` | Table in operation, play underway | Session created via `rpc_open_table_session` |
| `RUNDOWN` | Closing procedures in progress | Pit boss triggers `rpc_start_table_rundown` |
| `CLOSED` | Finalized, immutable historical record | `rpc_close_table_session` or `rpc_force_close_table_session` |

### 2.2 Transition Graph

```
                 rpc_open_table_session()
                         │
                         ▼
                   ┌───────────┐
                   │  ACTIVE   │ ◄── Normal operational state
                   └─────┬─────┘
                         │
            ┌────────────┼────────────────┐
            │            │                │
            │  rpc_start_table_rundown()  │  rpc_close_table_session()
            │            │                │  (shortcut: ACTIVE → CLOSED)
            │            ▼                │
            │      ┌───────────┐          │
            │      │  RUNDOWN  │          │
            │      └─────┬─────┘          │
            │            │                │
            │  rpc_close_table_session()  │
            │  rpc_force_close_table_session()
            │            │                │
            └────────────┼────────────────┘
                         ▼
                   ┌───────────┐
                   │  CLOSED   │ ◄── Terminal, immutable
                   └───────────┘
```

### 2.3 Invariants Enforced

| Invariant | Mechanism |
|-----------|-----------|
| Exactly one non-closed session per table | Partial unique index on `(casino_id, gaming_table_id) WHERE status IN ('OPEN','ACTIVE','RUNDOWN')` |
| Table must be `active` to open session | ADR-028 D3 availability gate in `rpc_open_table_session` |
| Close requires closing artifact | RPC checks `drop_event_id IS NOT NULL OR closing_inventory_snapshot_id IS NOT NULL` |
| Close requires reason | `close_reason` NOT NULL enforced; `close_note` required when `close_reason = 'other'` (CHECK constraint) |
| Unresolved items block standard close | `has_unresolved_items = true` → P0005 error; must use force-close |
| Concurrent mutation safety | All RPCs use `SELECT ... FOR UPDATE` row-level locking |
| Casino-scoped tenancy | All RPCs call `set_rls_context_from_staff()` (ADR-024); RLS blocks direct INSERT/UPDATE/DELETE |

---

## 3. Database Schema

### 3.1 Core Table: `table_session`

**Origin migration**: `20260115025236_table_session_lifecycle.sql`
**Amended by**: 5 subsequent migrations (ADR-027, ADR-028, PRD-038, PRD-038A)

| Column Group | Columns | Notes |
|-------------|---------|-------|
| **Identity** | `id`, `casino_id`, `gaming_table_id`, `gaming_day`, `shift_id` | `gaming_day` derived via trigger from `opened_at` + `casino_settings.gaming_day_start_time` |
| **Lifecycle** | `status`, `opened_at`, `opened_by_staff_id`, `rundown_started_at`, `rundown_started_by_staff_id`, `closed_at`, `closed_by_staff_id` | Core state machine columns |
| **Inventory refs** | `opening_inventory_snapshot_id`, `closing_inventory_snapshot_id`, `drop_event_id` | Deferred FKs to existing chip custody tables |
| **Financial (ADR-027)** | `table_bank_mode`, `need_total_cents`, `fills_total_cents`, `credits_total_cents`, `drop_total_cents`, `drop_posted_at` | Bank mode enum: `INVENTORY_COUNT` or `IMPREST_TO_PAR`; totals accumulated during session |
| **Close governance (PRD-038A)** | `close_reason`, `close_note`, `has_unresolved_items`, `requires_reconciliation` | 8-value `close_reason_type` enum; force-close sets `requires_reconciliation = true` |
| **Attribution stubs** | `activated_by_staff_id`, `paused_by_staff_id`, `resumed_by_staff_id`, `rolled_over_by_staff_id` | Forward-compatibility columns, all NULL today |
| **Misc** | `crossed_gaming_day`, `notes`, `metadata` | Rollover flag for sessions spanning a gaming day boundary (`casino_settings.gaming_day_start_time`) |

### 3.2 Supporting Table: `table_rundown_report`

**Origin migration**: `20260224123748_prd038_rundown_persistence_schema.sql`

Persisted rundown computation, UPSERT'd atomically when a session closes.

| Field | Source |
|-------|--------|
| `opening_total_cents` | Opening inventory snapshot chipset total |
| `closing_total_cents` | Closing inventory snapshot chipset total |
| `fills_total_cents` | Sum of session-scoped fills |
| `credits_total_cents` | Sum of session-scoped credits |
| `drop_total_cents` | Posted drop amount (nullable) |
| `table_win_cents` | `closing + credits + drop - opening - fills` (NULL if drop not posted) |

### 3.3 RLS Policies

Pattern C Hybrid (ADR-015/ADR-020):
- **SELECT**: Authenticated users scoped to `casino_id` via `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)`
- **INSERT/UPDATE/DELETE**: Blocked (`auth.uid() IS NOT NULL AND false`) — all writes via SECURITY DEFINER RPCs

### 3.4 Triggers

| Trigger | Event | Purpose |
|---------|-------|---------|
| `trg_table_session_gaming_day` | BEFORE INSERT | Derives `gaming_day` from `opened_at` using casino settings |
| `trg_table_session_updated_at` | BEFORE UPDATE | Maintains `updated_at` timestamp |

---

## 4. RPC Surface

### 4.1 Session Lifecycle RPCs

| RPC | Transition | Authorization | Key Behavior |
|-----|-----------|---------------|--------------|
| `rpc_open_table_session(p_gaming_table_id)` | → ACTIVE | pit_boss, admin | Checks table `active` status (ADR-028 D3); binds bank mode + par from `gaming_table` settings |
| `rpc_start_table_rundown(p_table_session_id)` | OPEN/ACTIVE → RUNDOWN | pit_boss, admin | Sets `rundown_started_at/by` |
| `rpc_close_table_session(p_table_session_id, ...)` | RUNDOWN/ACTIVE → CLOSED | pit_boss, admin | Requires ≥1 artifact; blocks on `has_unresolved_items`; calls `_persist_inline_rundown` |
| `rpc_force_close_table_session(p_table_session_id, p_close_reason, p_close_note)` | ANY non-closed → CLOSED | pit_boss, admin | Skips artifact + unresolved checks; sets `requires_reconciliation = true`; emits `audit_log` |
| `rpc_get_current_table_session(p_gaming_table_id)` | (query) | authenticated | Returns most recent non-closed session |

### 4.2 Rundown RPCs

| RPC | Purpose |
|-----|---------|
| `rpc_post_table_drop_total(p_session_id, p_drop_total_cents)` | Posts drop amount + timestamp before close |
| `rpc_compute_table_rundown(p_session_id)` | Live computation for dashboards (does not persist) |
| `rpc_persist_table_rundown(p_table_session_id)` | Explicit UPSERT into `table_rundown_report` |
| `_persist_inline_rundown(...)` | Internal helper called by close/force-close RPCs |

### 4.3 Error Code Matrix

| Code | Domain Error | Meaning |
|------|-------------|---------|
| P0001 | UNAUTHORIZED | Staff role not pit_boss/admin |
| P0002 | SESSION_NOT_FOUND | Session ID not found or wrong casino |
| P0003 | INVALID_STATE_TRANSITION | Status does not allow requested transition |
| P0004 | MISSING_CLOSING_ARTIFACT | Neither drop_event_id nor closing_inventory_snapshot_id provided |
| P0005 | UNRESOLVED_LIABILITIES | `has_unresolved_items = true`; use force-close |
| P0006 | CLOSE_NOTE_REQUIRED | `close_reason = 'other'` but `close_note` empty |

---

## 5. Application Stack

### 5.1 Service Layer (`services/table-context/`)

| File | Responsibility |
|------|---------------|
| `dtos.ts` | `TableSessionDTO`, `OpenTableSessionInput`, `CloseTableSessionInput`, `ForceCloseTableSessionInput`, `TableRundownDTO` |
| `schemas.ts` | Zod schemas for all inputs; validates close-reason/note coupling, artifact requirement |
| `table-session.ts` | CRUD operations wrapping RPC calls; cross-context check for open rating slips before close |
| `rundown.ts` | `computeTableRundown()`, `postTableDropTotal()` |
| `table-lifecycle.ts` | Physical table state (activate/deactivate/close — separate from session lifecycle) |
| `keys.ts` | React Query key factory: `sessions.current(tableId)`, `sessions.byId(id)`, `sessions.byGamingDay(casinoId, day)` |
| `http.ts` | Client-side HTTP fetchers for each route handler |
| `mappers.ts` | Row → DTO transformations |
| `labels.ts` | UI label constants for close reasons |
| `index.ts` | `createTableContextService(supabase)` factory exporting full `TableContextServiceInterface` |

### 5.2 React Query Hooks (`hooks/table-context/`)

| Hook | Type | Key Behavior |
|------|------|-------------|
| `useCurrentTableSession(tableId)` | Query | 30s staleTime, refetchOnMount:'always' (EXEC-038A Bug 1 fix) |
| `useOpenTableSession(tableId)` | Mutation | Invalidates dashboard tables scope |
| `useStartTableRundown(sessionId, tableId)` | Mutation | Optimistic cache update |
| `useCloseTableSession(sessionId, tableId)` | Mutation | Cancel → set null → invalidate pattern (EXEC-038A fix) |
| `useForceCloseTableSession(sessionId, tableId)` | Mutation | Same cache pattern as close |
| `useTableRundown(sessionId)` | Query | 30s staleTime; returns live computation |
| `usePostDropTotal()` | Mutation | Invalidates rundown + session caches |

Utility functions exported from hooks:
- `canOpenSession(session)` — true if no session or CLOSED
- `canStartRundown(session)` — true if OPEN or ACTIVE
- `canCloseSession(session)` — true if RUNDOWN or ACTIVE
- `getSessionStatusLabel(status)` — OPEN→'Opening', ACTIVE→'In Play', RUNDOWN→'Rundown', CLOSED→'Closed'
- `getSessionStatusColor(status)` — mapped to Tailwind color tokens

### 5.3 API Route Handlers (`app/api/v1/`)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/table-sessions` | Open session |
| PATCH | `/table-sessions/[id]/rundown` | Start rundown |
| PATCH | `/table-sessions/[id]/close` | Standard close |
| POST | `/table-sessions/[id]/force-close` | Privileged force close |
| GET | `/tables/[tableId]/current-session` | Fetch current session |

All routes use idempotency headers and `ServiceHttpResult` contracts.

### 5.4 UI Components (`components/table/`)

| Component | Purpose |
|-----------|---------|
| `session-action-buttons.tsx` | Open / Start Rundown / Close buttons with state-aware enable/disable; default and compact variants |
| `session-status-banner.tsx` | Current session status badge with animated ping for ACTIVE; shows gaming day, opened time, staff |
| `close-session-dialog.tsx` | Full close workflow modal: close reason dropdown (8 options), artifact picker, close note, force-close toggle, unresolved items guardrail |

### 5.5 Integration with Pit Dashboard

The pit dashboard (`app/(dashboard)/pit/page.tsx`) renders `pit-panels-client.tsx` which:
- Fetches `currentSession` via `useCurrentTableSession()` for the selected table
- Passes session state to `session-action-buttons` and `session-status-banner`
- Invalidates dashboard cache on session mutations for real-time visual feedback

---

## 6. Vision vs Reality: Gap Map

### 6.1 What the Vision Defines (10-state lifecycle)

```
READY_TO_OPEN → OPENING → OPEN → DROP_SCHEDULED → DROPPED → COUNTED →
CLOSING → CLOSED → RECONCILED → FINALIZED
```

### 6.2 What Is Implemented (4-state lifecycle)

```
[OPEN] → ACTIVE → RUNDOWN → CLOSED
```

### 6.3 Phase-by-Phase Delta

| Vision Phase | States | Implementation Status | Notes |
|-------------|--------|----------------------|-------|
| **Phase 0: Pre-shift setup** | `READY_TO_OPEN` | Not implemented | No precondition enforcement (drop box, forms). Sessions start directly in ACTIVE. |
| **Phase 1: Open table** | `OPENING → OPEN` | Implemented as ACTIVE | Opening snapshot linkable via `opening_inventory_snapshot_id`; no mandatory snapshot-before-open gate. Bank mode + par bound at open (ADR-027). |
| **Phase 2: Live play** | (within OPEN) | Partially implemented | `table_fill` and `table_credit` tables exist with session_id FK. No status workflow (`REQUESTED→VERIFIED→DEPOSITED`). No slip numbering enforcement. Cumulative totals on session. |
| **Phase 3: Drop** | `DROP_SCHEDULED → DROPPED` | Partially implemented | `table_drop_event` exists (custody chain). `drop_total_cents` postable via `rpc_post_table_drop_total`. No session-scoped drop scheduling state. |
| **Phase 4: Soft count** | `COUNTED` | Not implemented | No `soft_count_table_result` table. No count room ingestion. `drop_total_cents` is manually posted, not count-derived. |
| **Phase 5: Close table** | `CLOSING → CLOSED` | Implemented as RUNDOWN → CLOSED | Close requires artifact + reason. Force-close available for exceptions. Rundown persisted inline at close. |
| **Phase 6: Compute rundown** | (within CLOSED) | Implemented | `rpc_compute_table_rundown` returns full breakdown. `table_rundown_report` persisted atomically. Win/loss = `closing + credits + drop - opening - fills`. |
| **Phase 7: Exceptions** | (cross-cutting) | Stubbed | `has_unresolved_items` flag exists. `requires_reconciliation` set by force-close. No `reconciliation_exception` table, no detection logic, no resolution workflow. |
| **Post-close: Reconciliation** | `RECONCILED` | Not implemented | No reconciliation workflow. |
| **Post-close: Finalization** | `FINALIZED` | Not implemented | No finalization gate. `table_rundown_report` has no `finalized_at` enforcement. |

### 6.4 Telemetry Pipeline Status

| Component | Status | Notes |
|-----------|--------|-------|
| `table_buyin_telemetry` table | Exists | Schema + RLS + indexes |
| `rpc_log_table_buyin_telemetry` | Exists | ADR-024 compliant |
| `rpc_shift_table_metrics` | Exists | Dual-stream win/loss (inventory + estimated) |
| Automatic bridge trigger (Finance → telemetry) | Not implemented | `player_financial_transaction` inserts do not populate telemetry |
| Manual grind logging UI | Not implemented | No "Log Unrated Buy-in" button |
| Service/HTTP/Hook for telemetry logging | Not implemented | RPC exists but no application-layer wiring |

---

## 7. Architectural Decisions Baked In

| Decision | Reference | Impact |
|----------|-----------|--------|
| OPEN state exists but is unused; sessions start as ACTIVE | PRD-TABLE-SESSION-LIFECYCLE-MVP §7.1 | Simplifies UX; OPEN reserved for future pre-shift gate |
| Bank mode bound at session open | ADR-027 | `INVENTORY_COUNT` vs `IMPREST_TO_PAR` determines close semantics |
| Table must be `active` to open session | ADR-028 D3 | Prevents sessions on maintenance/closed tables |
| Rundown persisted inline at close | PRD-038 | Single atomic operation; no orphaned reports |
| Force-close as privileged escape hatch | PRD-038A | Flags `requires_reconciliation` for post-shift review |
| `gaming_day` derived from `opened_at` via trigger | Casino settings | Handles gaming day boundary-crossing scenarios via `compute_gaming_day()` + `crossed_gaming_day` flag |
| Attribution columns stubbed but unpopulated | PRD-038A Gap C | `activated_by`, `paused_by`, `resumed_by`, `rolled_over_by` reserved for future phases |

---

## 8. Migration History (Chronological)

| Migration | What It Does |
|-----------|-------------|
| `20260115025236_table_session_lifecycle.sql` | Core table + enums + triggers + RLS |
| `20260115025237_table_session_rpcs.sql` | Initial 4 RPCs (open, rundown, close, get_current) |
| `20260117001638_adr028_table_status_standardization.sql` | `drop_posted_at`, availability gate |
| `20260117153430_adr027_table_bank_mode_schema.sql` | Bank mode enum, financial columns |
| `20260117153726_adr027_rpc_session_mode_binding.sql` | Open RPC binds bank mode + par |
| `20260117153727_adr027_rpc_rundown.sql` | `rpc_post_table_drop_total`, `rpc_compute_table_rundown` |
| `20260219235800_adr018_revoke_public_security_remediation.sql` | REVOKE PUBLIC on all RPCs, GRANT to authenticated |
| `20260224123748_prd038_rundown_persistence_schema.sql` | `table_rundown_report`, `session_id` FK on fill/credit |
| `20260224123754_prd038_rundown_rpcs.sql` | `rpc_persist_table_rundown`, `rpc_finalize_rundown` |
| `20260224123758_prd038_close_session_inline_persist.sql` | Close RPC persists rundown inline |
| `20260225110509_prd038a_schema_additions.sql` | Close reason enum, governance columns, attribution stubs |
| `20260225110743_prd038a_close_guardrails_rpcs.sql` | `_persist_inline_rundown` helper, force-close RPC, close guardrails |

---

## 9. Key File Manifest

```
supabase/migrations/
  20260115025236_table_session_lifecycle.sql        # Schema
  20260115025237_table_session_rpcs.sql             # Core RPCs
  20260117*.sql                                      # ADR-027/028 amendments
  20260224*.sql                                      # PRD-038 rundown persistence
  20260225*.sql                                      # PRD-038A close governance

services/table-context/
  dtos.ts              table-session.ts       rundown.ts
  schemas.ts           table-lifecycle.ts     crud.ts
  keys.ts              http.ts                mappers.ts
  labels.ts            index.ts

hooks/table-context/
  use-table-session.ts    use-table-rundown.ts    index.ts

components/table/
  session-action-buttons.tsx    session-status-banner.tsx
  close-session-dialog.tsx

app/api/v1/
  table-sessions/route.ts                          # POST open
  table-sessions/[id]/rundown/route.ts             # PATCH rundown
  table-sessions/[id]/close/route.ts               # PATCH close
  table-sessions/[id]/force-close/route.ts         # POST force-close
  tables/[tableId]/current-session/route.ts        # GET current

types/database.types.ts                             # Generated types (table_session, enums)
```

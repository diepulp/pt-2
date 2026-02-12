---
title: "Table Status Standardization Analysis"
doc_id: "TABLE-STATUS-STANDARDIZATION"
version: "0.1.0"
status: "superseded"
date: "2026-01-16"
owner: "TableContext"
superseded_by: "docs/80-adrs/ADR-028-table-status-standardization.md"
related_docs:
  - "docs/80-adrs/ADR-028-table-status-standardization.md"
  - "docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md"
  - "docs/issues/gaps/GAP-TABLE-ROLLOVER-UI.md"
---

# Table Status Standardization Analysis

> **⚠️ SUPERSEDED:** This analysis has been formalized as [ADR-028: Table Status Standardization](../80-adrs/ADR-028-table-status-standardization.md). Refer to the ADR for authoritative decisions.

## Problem Statement

PT-2 has **two distinct status systems** for tables that have evolved separately:

1. **`table_status`** — Physical table operational state (baseline SRM)
2. **`table_session_status`** — Session lifecycle state (PRD-TABLE-SESSION-LIFECYCLE-MVP)

This creates confusion, inconsistent naming, and unclear relationships.

---

## Current State

### Enum 1: `table_status` (gaming_table.status)

**Source:** `00000000000000_baseline_srm.sql` (line 9)

```sql
CREATE TYPE table_status AS ENUM ('inactive', 'active', 'closed');
```

| Value | Meaning | When Used |
|-------|---------|-----------|
| `inactive` | Table offline, not available | Default state, maintenance |
| `active` | Table operational, accepting players | Normal operation |
| `closed` | Table permanently decommissioned | Rare, administrative |

**Characteristics:**
- Lowercase values
- Persistent state (changes infrequently)
- Represents physical/administrative availability
- Pre-dates session lifecycle feature

### Enum 2: `table_session_status` (table_session.status)

**Source:** `20260115025236_table_session_lifecycle.sql` (line 12)

```sql
CREATE TYPE table_session_status AS ENUM ('OPEN', 'ACTIVE', 'RUNDOWN', 'CLOSED');
```

| Value | Meaning | When Used |
|-------|---------|-----------|
| `OPEN` | Session just created | Implicit (MVP skips this) |
| `ACTIVE` | Session in operation | Normal gameplay |
| `RUNDOWN` | Closing procedures initiated | End of shift |
| `CLOSED` | Session finalized | Historical record |

**Characteristics:**
- UPPERCASE values
- Temporal state (changes per session)
- Represents operational lifecycle
- New feature (Jan 2026)

---

## Inconsistencies

### 1. Case Convention Mismatch

| Enum | Convention | Example |
|------|------------|---------|
| `table_status` | lowercase | `'active'` |
| `table_session_status` | UPPERCASE | `'ACTIVE'` |

**Impact:** Inconsistent codebase, easy to confuse in queries.

### 2. Semantic Overloading of "ACTIVE"

Both enums use "active/ACTIVE" with different meanings:

| Context | Meaning |
|---------|---------|
| `gaming_table.status = 'active'` | Table is operationally available |
| `table_session.status = 'ACTIVE'` | Current session is in active operation |

**Impact:** Queries like `WHERE status = 'active'` require knowing which table you're querying.

### 3. OPEN State Unused in MVP

The `OPEN` state exists in the enum but MVP creates sessions directly in `ACTIVE`:

```sql
-- rpc_open_table_session creates with:
INSERT INTO table_session (..., status) VALUES (..., 'ACTIVE');
```

**Impact:** Dead code path, confusion about state machine entry point.

### 4. Relationship Undocumented

No explicit documentation or constraint enforces:
- A session requires `gaming_table.status = 'active'`
- When `gaming_table.status` changes, what happens to open sessions?

---

## UI Mapping Analysis

### pit-map-selector.tsx (STATUS_CONFIG)

```typescript
const STATUS_CONFIG = {
  active: { label: "Open", ... },    // table_status='active' → "Open"
  inactive: { label: "Idle", ... },  // table_status='inactive' → "Idle"
  closed: { label: "Closed", ... },  // table_status='closed' → "Closed"
};
```

**Note:** UI correctly avoids showing raw enum values to users.

### Session Components

Session status banner, close dialog, action buttons all use `table_session_status` values directly in code but display human-readable labels.

---

## Recommendations

### Option A: Minimal Change (Recommended for Now)

**Rationale:** The dual system works, just needs documentation.

1. **Document the relationship** in SRM and component docs
2. **Add constraint** to `rpc_open_table_session`:
   ```sql
   -- Verify gaming_table.status = 'active' before creating session
   IF v_table_status <> 'active' THEN
     RAISE EXCEPTION 'Cannot open session: table is not active';
   END IF;
   ```
3. **Remove OPEN state** from MVP path (or use it for "session created, awaiting opening snapshot")
4. **Keep case conventions** — they actually help distinguish the two systems

### Option B: Rename for Clarity (Future Refactor)

If confusion persists, consider renaming:

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `table_status` | `table_availability` | Clearer: about availability, not lifecycle |
| `table_session_status` | `session_phase` | Clearer: about lifecycle phase |
| `ACTIVE` (session) | `IN_PROGRESS` | Avoids collision with table `active` |

**Breaking change:** Requires migration, DTO updates, UI updates.

### Option C: Unified State Machine (Significant Refactor)

Merge into single state machine with composite states:

```
TABLE_OFFLINE
TABLE_AVAILABLE
  └── SESSION_OPENING
  └── SESSION_ACTIVE
  └── SESSION_RUNDOWN
  └── SESSION_CLOSED (historical)
TABLE_DECOMMISSIONED
```

**Not recommended:** Over-engineering for current needs.

---

## Proposed Constraint for ADR-027 Implementation

Add validation to `rpc_open_table_session`:

```sql
-- Verify table is active before opening session
SELECT status INTO v_table_status
FROM gaming_table
WHERE id = p_gaming_table_id AND casino_id = v_casino_id;

IF v_table_status IS NULL THEN
  RAISE EXCEPTION 'Table not found';
ELSIF v_table_status <> 'active' THEN
  RAISE EXCEPTION 'Cannot open session: table status is %, expected active', v_table_status;
END IF;
```

---

## State Machine Clarification

### gaming_table.status (Operational Availability)

```
                    ┌──────────────┐
                    │   inactive   │ ← Default
                    └──────┬───────┘
                           │ activate
                           ▼
                    ┌──────────────┐
                    │    active    │ ← Sessions allowed
                    └──────┬───────┘
                           │ decommission
                           ▼
                    ┌──────────────┐
                    │    closed    │ ← Terminal
                    └──────────────┘
```

### table_session.status (Session Lifecycle)

```
Requires: gaming_table.status = 'active'

     ┌────────┐
     │  OPEN  │ ← Created (MVP skips to ACTIVE)
     └────┬───┘
          │ (implicit in MVP)
          ▼
     ┌────────┐
     │ ACTIVE │ ← In operation
     └────┬───┘
          │ start_rundown
          ▼
     ┌─────────┐
     │ RUNDOWN │ ← Closing procedures
     └────┬────┘
          │ close_session
          ▼
     ┌────────┐
     │ CLOSED │ ← Terminal (historical)
     └────────┘
```

---

## Definition of Done for Standardization

- [ ] Document relationship in `docs/20-architecture/service-responsibility-matrix.md`
- [ ] Add `gaming_table.status = 'active'` check to `rpc_open_table_session`
- [ ] Decide: Use OPEN state or keep MVP behavior (ACTIVE as entry point)
- [ ] Update UI components to handle edge cases (table deactivated with open session)
- [ ] Add integration test for state machine transitions

---

## Impact on ADR-027 Implementation

The table bank mode and par policy implementation should:

1. **Bind to `table_session`** — Mode and par are session-scoped, not table-scoped
2. **Respect table availability** — Cannot open session on inactive table
3. **Handle edge case** — If table deactivated mid-session, session can still close
4. **Use UPPERCASE convention** — New enums should follow `table_session_status` pattern

---

## References

### Files with `table_status` Usage

| File | Usage |
|------|-------|
| `supabase/migrations/00000000000000_baseline_srm.sql` | Enum definition |
| `services/table-context/crud.ts` | `getActiveTables()` filters |
| `components/table/pit-map-selector.tsx` | STATUS_CONFIG mapping |
| `components/table/table-layout-terminal.tsx` | Styling by status |
| `components/pit-panels/pit-panels-client.tsx` | Active table filtering |

### Files with `table_session_status` Usage

| File | Usage |
|------|-------|
| `supabase/migrations/20260115025236_table_session_lifecycle.sql` | Enum definition |
| `supabase/migrations/20260115025237_table_session_rpcs.sql` | RPC transitions |
| `services/table-context/table-session.ts` | Service layer |
| `components/table/session-status-banner.tsx` | Banner display |
| `components/table/session-action-buttons.tsx` | Action buttons |
| `components/table/close-session-dialog.tsx` | Close workflow |

# ADR-028: Table Status Standardization

**Status:** Proposed (approve with ADR-027)
**Date:** 2026-01-16
**Owner:** TableContext
**Decision Scope:** Table availability and session lifecycle status systems
**Amends:** SRM v4.0.0 (TableContext bounded context)
**Required By:** ADR-027
**Related:** PRD-TABLE-SESSION-LIFECYCLE-MVP

> **Contingency:** This ADR must be approved together with [ADR-027: Table Bank Mode](./ADR-027-table-bank-mode-dual-policy.md). ADR-027 depends on the status contract defined here.

---

## Context

### Problem Statement

PT-2 has **two distinct status systems** for tables that evolved independently:

1. **`table_status`** (baseline SRM) — Physical table operational availability
2. **`table_session_status`** (PRD-TABLE-SESSION-LIFECYCLE-MVP) — Session lifecycle phase

These systems collide on terminology ("active" vs "ACTIVE") and lack a documented relationship, causing:

- **Semantic confusion**: Both enums use "active/ACTIVE" with different meanings
- **Case inconsistency**: `table_status` uses lowercase, `table_session_status` uses UPPERCASE
- **Missing constraints**: No enforcement that sessions require an available table
- **Dead code**: `OPEN` state exists but MVP skips directly to `ACTIVE`
- **Unclear edge cases**: What happens if a table becomes inactive mid-session?

### Current State

#### `table_status` (gaming_table.status)

**Source:** `00000000000000_baseline_srm.sql`

```sql
CREATE TYPE table_status AS ENUM ('inactive', 'active', 'closed');
```

| Value | Meaning | Usage |
|-------|---------|-------|
| `inactive` | Table offline, not available | Default state, maintenance |
| `active` | Table operational | Normal operation |
| `closed` | Table decommissioned | Rare, administrative |

#### `table_session_status` (table_session.status)

**Source:** `20260115025236_table_session_lifecycle.sql`

```sql
CREATE TYPE table_session_status AS ENUM ('OPEN', 'ACTIVE', 'RUNDOWN', 'CLOSED');
```

| Value | Meaning | Usage |
|-------|---------|-------|
| `OPEN` | Session created | **Unused in MVP** |
| `ACTIVE` | Session in operation | Entry point in MVP |
| `RUNDOWN` | Closing procedures | Explicit transition |
| `CLOSED` | Session finalized | Terminal state |

### Why Not Merge?

**Availability ≠ session lifecycle.** These are orthogonal concerns:

- A table can be `active` (available) with no current session
- A table can be `active` with a `CLOSED` historical session
- A table can be `active` with an `ACTIVE` current session
- Merging into one mega-enum creates a combinatorial explosion and couples unrelated state transitions

---

## Decision

### D1: Two Status Systems Remain Separate

Keep `table_status` and `table_session_status` as independent enums. Do not merge.

**Rationale:**
- Availability and lifecycle are orthogonal concerns
- Merging creates refactor bait (mega-enum with N×M states)
- Each system has different persistence characteristics (availability = persistent, session = temporal)
- Existing code and queries remain valid

### D2: Canonical Meaning Contract

Establish authoritative definitions for each enum value.

#### A. `gaming_table.status` — Table Availability

| Value | Canonical Meaning | Sessions Allowed? |
|-------|-------------------|-------------------|
| `inactive` | Not available (maintenance, offline, new table default) | ❌ No |
| `active` | Available for operation, accepting players | ✅ Yes |
| `closed` | Permanently decommissioned (terminal state) | ❌ No |

**Characteristics:**
- Persistent state (changes infrequently, admin action)
- Represents physical/administrative availability
- Pre-condition for session creation

#### B. `table_session.status` — Session Phase

| Value | Canonical Meaning | MVP Behavior |
|-------|-------------------|--------------|
| `OPEN` | Session created, awaiting opening snapshot | **Reserved** (MVP starts at ACTIVE) |
| `ACTIVE` | Session in operation, gameplay active | Entry point in MVP |
| `RUNDOWN` | Closing procedures initiated | Explicit transition |
| `CLOSED` | Session finalized, historical record | Terminal state |

**Characteristics:**
- Temporal state (changes per session lifecycle)
- Represents operational phase within a shift
- One active session per table at a time

### D3: Availability Gate (Enforced Constraint)

`rpc_open_table_session` MUST require `gaming_table.status = 'active'`.

```sql
-- Inside rpc_open_table_session, BEFORE creating session:
SELECT status INTO v_table_status
FROM gaming_table
WHERE id = p_gaming_table_id AND casino_id = v_casino_id;

IF v_table_status IS NULL THEN
  RAISE EXCEPTION 'Table not found';
ELSIF v_table_status <> 'active' THEN
  RAISE EXCEPTION 'Cannot open session: table status is %, expected active', v_table_status;
END IF;
```

**Edge Case Rule:** If a table becomes `inactive` mid-session, the session can still close normally. No forced shutdown — the pit boss completes the rundown workflow.

### D4: OPEN State Disposition

The `OPEN` state is **reserved for future use** but deprecated in MVP.

**MVP Behavior:** Sessions start directly in `ACTIVE` state.

**Future Use Case:** "Session created, awaiting opening inventory snapshot" workflow where:
1. Session created → status = `OPEN`
2. Opening snapshot captured → status = `ACTIVE`

**No Migration Required:** The enum value exists; code simply doesn't use it.

### D5: TypeScript Type Aliases

To avoid "active/ACTIVE" collision in code, use semantic type aliases:

```typescript
// services/table-context/dtos.ts

/** Physical table availability (gaming_table.status) */
export type TableAvailability = Database["public"]["Enums"]["table_status"];
// Values: 'inactive' | 'active' | 'closed'

/** Session lifecycle phase (table_session.status) */
export type SessionPhase = Database["public"]["Enums"]["table_session_status"];
// Values: 'OPEN' | 'ACTIVE' | 'RUNDOWN' | 'CLOSED'
```

**Benefits:**
- Self-documenting code
- IDE autocomplete shows semantic meaning
- No database migration required
- Grep-friendly for auditing usage

### D6: UI Label Mapping

Resolve naming collision at the presentation layer with distinct human-readable labels:

| DB Enum | DB Value | UI Label | Color |
|---------|----------|----------|-------|
| `table_status` | `inactive` | "Idle" | Gray |
| `table_status` | `active` | "Available" | Green |
| `table_status` | `closed` | "Decommissioned" | Red |
| `table_session_status` | `OPEN` | "Opening" | Blue |
| `table_session_status` | `ACTIVE` | "In Play" | Green |
| `table_session_status` | `RUNDOWN` | "Rundown" | Amber |
| `table_session_status` | `CLOSED` | "Closed" | Gray |

**Implementation:**

```typescript
// components/table/status-labels.ts

export const TABLE_AVAILABILITY_LABELS: Record<TableAvailability, string> = {
  inactive: "Idle",
  active: "Available",
  closed: "Decommissioned",
};

export const SESSION_PHASE_LABELS: Record<SessionPhase, string> = {
  OPEN: "Opening",
  ACTIVE: "In Play",
  RUNDOWN: "Rundown",
  CLOSED: "Closed",
};
```

### D7: Count/Drop Status Is Separate

Do NOT cram count posting status into `table_session_status`. Use a separate field:

```sql
ALTER TABLE table_session
ADD COLUMN drop_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN table_session.drop_posted_at IS
  'When soft count was posted. NULL = pending, SET = posted.';
```

**Rationale:**
- Session lifecycle (ACTIVE → RUNDOWN → CLOSED) is orthogonal to count posting
- A session can be CLOSED with count pending or posted
- Timestamp provides audit trail vs. boolean flag
- Avoids enum pollution (`CLOSED_PENDING`, `CLOSED_POSTED`, etc.)

---

## State Relationship Diagram

```
gaming_table.status              table_session.status
(TableAvailability)              (SessionPhase)
───────────────────              ────────────────────────────

    ┌──────────┐
    │ inactive │ ◄── Default, no sessions allowed
    └────┬─────┘
         │ activate (admin)
         ▼
    ┌──────────┐         ┌────────────────────────────────┐
    │  active  │────────►│ OPEN ──► ACTIVE ──► RUNDOWN ──►│ CLOSED
    └────┬─────┘         │  (reserved)    (in play)       │ (historical)
         │               │         │                      │
         │               │         └── drop_posted_at ────┘
         │               │
         │               └── (cycle: new session per shift)
         │ decommission (admin)
         ▼
    ┌──────────┐
    │  closed  │ ◄── Terminal, no sessions allowed
    └──────────┘

Constraint: session.open requires table.status = 'active'
Edge case: table.inactive mid-session → session can still close
```

---

## Data Model Changes

### 1. Add Availability Gate to RPC

Modify `rpc_open_table_session` to enforce constraint:

```sql
-- Add at beginning of rpc_open_table_session

-- Verify table is available
SELECT status INTO v_table_status
FROM gaming_table
WHERE id = p_gaming_table_id AND casino_id = v_casino_id;

IF v_table_status IS NULL THEN
  RAISE EXCEPTION 'TBLSESS_TABLE_NOT_FOUND: Table % not found', p_gaming_table_id;
ELSIF v_table_status <> 'active' THEN
  RAISE EXCEPTION 'TBLSESS_TABLE_NOT_AVAILABLE: Cannot open session, table status is % (expected active)', v_table_status;
END IF;
```

### 2. Add Count Status Field

```sql
ALTER TABLE table_session
ADD COLUMN drop_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN table_session.drop_posted_at IS
  'Timestamp when soft count was posted. NULL = count pending, NOT NULL = count posted.';
```

### 3. Document OPEN State as Reserved

Add comment to enum:

```sql
COMMENT ON TYPE table_session_status IS
  'Session lifecycle phases. OPEN is reserved for future "awaiting opening snapshot" workflow; MVP starts sessions in ACTIVE.';
```

---

## Service Layer Changes

### TypeScript Type Aliases

```typescript
// services/table-context/dtos.ts

import type { Database } from "@/types/database.types";

/**
 * Physical table availability state.
 * - 'inactive': Not available (maintenance, offline)
 * - 'active': Available for operation
 * - 'closed': Permanently decommissioned
 */
export type TableAvailability = Database["public"]["Enums"]["table_status"];

/**
 * Session lifecycle phase.
 * - 'OPEN': Reserved (MVP unused) - session created, awaiting opening snapshot
 * - 'ACTIVE': Session in operation
 * - 'RUNDOWN': Closing procedures started
 * - 'CLOSED': Session finalized (historical)
 */
export type SessionPhase = Database["public"]["Enums"]["table_session_status"];

// Existing type aliases for backward compatibility
export type TableStatus = TableAvailability;
export type TableSessionStatus = SessionPhase;
```

### Label Constants

```typescript
// services/table-context/labels.ts

import type { TableAvailability, SessionPhase } from "./dtos";

export const TABLE_AVAILABILITY_LABELS: Record<TableAvailability, string> = {
  inactive: "Idle",
  active: "Available",
  closed: "Decommissioned",
};

export const TABLE_AVAILABILITY_COLORS: Record<TableAvailability, string> = {
  inactive: "gray",
  active: "green",
  closed: "red",
};

export const SESSION_PHASE_LABELS: Record<SessionPhase, string> = {
  OPEN: "Opening",
  ACTIVE: "In Play",
  RUNDOWN: "Rundown",
  CLOSED: "Closed",
};

export const SESSION_PHASE_COLORS: Record<SessionPhase, string> = {
  OPEN: "blue",
  ACTIVE: "green",
  RUNDOWN: "amber",
  CLOSED: "gray",
};
```

---

## UI Changes

### Update pit-map-selector.tsx

```typescript
// Current (keep internal config, just update labels)
const STATUS_CONFIG = {
  active: { label: "Available", color: "bg-emerald-500", ... },
  inactive: { label: "Idle", color: "bg-gray-400", ... },
  closed: { label: "Decommissioned", color: "bg-red-500", ... },
};
```

### Update session-status-banner.tsx

```typescript
// Use SESSION_PHASE_LABELS instead of hardcoded strings
import { SESSION_PHASE_LABELS, SESSION_PHASE_COLORS } from "@/services/table-context/labels";

const statusLabel = SESSION_PHASE_LABELS[session.status];
const statusColor = SESSION_PHASE_COLORS[session.status];
```

---

## Security Invariants

**INV-1:** `gaming_table.status = 'active'` is required to open a session (RPC-enforced)

**INV-2:** Session can close regardless of table availability (no forced shutdown)

**INV-3:** Only `admin` role can change `gaming_table.status` (existing RLS policy)

**INV-4:** Session status transitions are RPC-enforced (no direct UPDATE on status column)

**INV-5:** `OPEN` state is reserved; MVP code path does not use it

---

## Migration Plan

### Phase 1: Schema (Single Migration)

```sql
-- Migration: YYYYMMDDHHMMSS_adr028_table_status_standardization.sql

-- 1. Add count status field
ALTER TABLE table_session
ADD COLUMN IF NOT EXISTS drop_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN table_session.drop_posted_at IS
  'Timestamp when soft count was posted. NULL = count pending, NOT NULL = count posted.';

-- 2. Document enum semantics
COMMENT ON TYPE table_status IS
  'Table availability: inactive (offline), active (available for sessions), closed (decommissioned).';

COMMENT ON TYPE table_session_status IS
  'Session lifecycle: OPEN (reserved, MVP unused), ACTIVE (in play), RUNDOWN (closing), CLOSED (finalized).';
```

### Phase 2: RPC Update

Add availability gate to `rpc_open_table_session` (see Data Model Changes section).

### Phase 3: Service Layer

1. Add type aliases to `services/table-context/dtos.ts`
2. Create `services/table-context/labels.ts` with label/color constants
3. Regenerate types: `npm run db:types`

### Phase 4: UI Updates

1. Update `pit-map-selector.tsx` labels
2. Update `session-status-banner.tsx` to use centralized labels
3. Update any other components using hardcoded status strings

---

## Consequences

### Positive

- **Clarity:** Documented contract eliminates confusion about which status means what
- **Safety:** Availability gate prevents sessions on unavailable tables
- **Maintainability:** Type aliases make code self-documenting
- **Consistency:** Centralized labels ensure UI uniformity
- **Non-breaking:** No enum changes, no data migration needed
- **Future-ready:** OPEN state reserved for enhanced workflow

### Negative

- **Learning curve:** Developers must understand two systems (mitigated by documentation)
- **Additional constants:** Label files add code (but reduce duplication)

### Neutral

- **Case convention stays:** lowercase vs UPPERCASE actually helps distinguish systems
- **OPEN state unused:** Acceptable tech debt for MVP

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Developers confuse the two systems | Type aliases + documentation + code review |
| UI shows wrong label | Centralized label constants + component audit |
| Edge case: table inactive mid-session | Documented rule: session can still close |
| OPEN state causes confusion | Document as "reserved", add enum comment |

---

## Acceptance Criteria

- [ ] `rpc_open_table_session` rejects sessions when `gaming_table.status ≠ 'active'`
- [ ] Session can close even if table becomes `inactive` mid-session (tested)
- [ ] `TableAvailability` and `SessionPhase` type aliases exist in DTOs
- [ ] Label constants centralized in `services/table-context/labels.ts`
- [ ] UI displays "Idle/Available/Decommissioned" for table availability
- [ ] UI displays "Opening/In Play/Rundown/Closed" for session phase
- [ ] `drop_posted_at` column added to `table_session`
- [ ] Enum comments document canonical meanings
- [ ] OPEN state documented as reserved in code comments

---

## References

### Internal

- `docs/issues/TABLE-STATUS-STANDARDIZATION.md` — Analysis document
- `docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md` — Related ADR (references this)
- `supabase/migrations/00000000000000_baseline_srm.sql` — `table_status` definition
- `supabase/migrations/20260115025236_table_session_lifecycle.sql` — `table_session_status` definition

### Files Affected

| File | Change |
|------|--------|
| `supabase/migrations/20260115025237_table_session_rpcs.sql` | Add availability gate |
| `supabase/migrations/YYYYMMDD_adr028_*.sql` | New migration |
| `services/table-context/dtos.ts` | Add type aliases |
| `services/table-context/labels.ts` | New file |
| `components/table/pit-map-selector.tsx` | Update labels |
| `components/table/session-status-banner.tsx` | Use centralized labels |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-01-16 | Initial ADR — Table Status Standardization proposed |

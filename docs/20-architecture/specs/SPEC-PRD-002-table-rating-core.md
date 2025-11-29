# SPEC-PRD-002: Table & Rating Core Architecture

---
id: SPEC-PRD-002
title: Table & Rating Core Architecture
prd_ref: PRD-002
version: 1.0.0
status: Draft
date: 2025-11-28
owner: Architecture
affects: [TableContextService, RatingSlipService]
slad_pattern: Vertical Slice
---

## 1. Context & Scope

### 1.1 Problem Statement

Pit operations lack a digital way to track table status and player session time. Supervisors manually log sessions on paper, leading to inaccurate time tracking, lost data, and no audit trail. This blocks any form of automated loyalty accrual or compliance monitoring.

### 1.2 PRD Reference

- **Source**: `docs/10-prd/PRD-002-table-rating-core.md`
- **Owner**: Product
- **Phase**: MVP Pilot

### 1.3 Affected Domains

| Domain | Impact | Pattern |
|--------|--------|---------|
| **TableContextService** | Table lifecycle operations (open/close) | Pattern A (Contract-First) |
| **RatingSlipService** | Slip lifecycle operations (start/pause/resume/close) | Pattern C (Hybrid) |

### 1.4 In Scope

- Table status transitions: `inactive` → `active` → `closed`
- Rating slip lifecycle: `open` ↔ `paused` → `closed`
- Server-derived duration calculation (excludes paused intervals)
- Prevent duplicate active slips per player/table
- Audit logging for all state changes

### 1.5 Out of Scope

- Loyalty points calculation (see PRD-004)
- Chip custody tracking (existing TableContext feature)
- Floor layout design/activation workflows
- Finance transactions or MTL compliance

---

## 2. Constraints & Assumptions

### 2.1 Technical Constraints

- **Stack**: Next.js 15, React 19, Supabase/PostgreSQL
- **Database**: RLS-enabled, casino-scoped
- **Types**: Single source of truth: `types/database.types.ts`
- **Service Pattern**: Functional factories, explicit interfaces (per SLAD)

### 2.2 Business Constraints

- **NFRs**: LCP ≤ 2.5s, UI refresh ≤ 2s, p95 mutation latency < 400ms
- **Compliance**: All state changes auditable with actor/timestamp

### 2.3 Assumptions

1. `gaming_table` and `rating_slip` tables exist with correct status enums
2. TableContextService and RatingSlipService are implemented
3. State machine logic exists in `services/rating-slip/state-machine.ts`
4. Visit must be active before creating rating slips

---

## 3. Current State Assessment

### 3.1 Existing Schema

**gaming_table** (owned by TableContextService):
```sql
-- Status enum already exists
CREATE TYPE table_status AS ENUM ('inactive', 'active', 'closed');

-- Table exists with status column
gaming_table.status: table_status DEFAULT 'inactive'
```

**rating_slip** (owned by RatingSlipService):
```sql
-- Status enum already exists
CREATE TYPE rating_slip_status AS ENUM ('open', 'paused', 'closed', 'archived');

-- Table exists with required columns
rating_slip: id, casino_id, player_id, visit_id, table_id, seat_number,
             start_time, end_time, average_bet, status, game_settings, policy_snapshot
```

### 3.2 Existing Service Layer

- `services/table-context/`: Chip custody operations (fills, credits, inventory, drops)
- `services/rating-slip/`: Telemetry updates, state machine logic
- `services/rating-slip/state-machine.ts`: Pure functions for state transitions

### 3.3 Gap Analysis

| PRD Requirement | Current State | Gap |
|-----------------|---------------|-----|
| Open/close tables | Schema exists, no RPC | Need `rpc_update_table_status` |
| Start rating slip | Schema exists, no RPC | Need `rpc_start_rating_slip` |
| Pause/resume slip | Status enum exists, no pause tracking | Need `rating_slip_pause` table + RPCs |
| Close slip | Schema exists, no RPC | Need `rpc_close_rating_slip` |
| Duration calculation | State machine exists (client-side) | Need server-side RPC |
| No duplicate slips | No constraint | Need UNIQUE index |
| Audit logging | `audit_log` table exists | Need trigger/RPC integration |

---

## 4. Proposed Architecture

### 4.1 Approach: Vertical Slice

Per SLAD decision tree:
- Single domain (RatingSlip + TableContext coordination) → User-facing → **VERTICAL** (1 week)
- Transport: React Query mutations → Route Handlers (`app/api/v1/**/route.ts`)

### 4.2 High-Level Design

```mermaid
graph TB
    subgraph "Client Layer"
        PIT_DASH[Pit Dashboard<br/>Floor View]
        SLIP_PANEL[Rating Slip Panel<br/>Session UI]
    end

    subgraph "React Query Hooks"
        USE_TABLE[useTableOperations<br/>useMutation]
        USE_SLIP[useRatingSlipLifecycle<br/>useMutation]
    end

    subgraph "Transport Layer"
        TABLE_ROUTE[POST /api/v1/table-context/status<br/>Route Handler]
        SLIP_ROUTES[POST /api/v1/rating-slip/{action}<br/>Route Handlers]
        WRAPPER[withServerAction<br/>Auth + RLS + Audit]
    end

    subgraph "Service Layer"
        TABLE_SVC[TableContextService<br/>updateTableStatus()]
        SLIP_SVC[RatingSlipService<br/>start/pause/resume/close()]
    end

    subgraph "Database Layer"
        GAMING_TABLE[(gaming_table<br/>status transitions)]
        RATING_SLIP[(rating_slip<br/>lifecycle state)]
        SLIP_PAUSE[(rating_slip_pause<br/>pause intervals)]
        AUDIT[(audit_log<br/>state change audit)]
    end

    PIT_DASH --> USE_TABLE
    SLIP_PANEL --> USE_SLIP
    USE_TABLE --> TABLE_ROUTE
    USE_SLIP --> SLIP_ROUTES
    TABLE_ROUTE --> WRAPPER
    SLIP_ROUTES --> WRAPPER
    WRAPPER --> TABLE_SVC
    WRAPPER --> SLIP_SVC
    TABLE_SVC --> GAMING_TABLE
    SLIP_SVC --> RATING_SLIP
    SLIP_SVC --> SLIP_PAUSE
    GAMING_TABLE --> AUDIT
    RATING_SLIP --> AUDIT
```

### 4.3 Data Flow

**Table Open Flow:**
1. Pit Boss clicks "Open Table" on dashboard
2. `useTableOperations.mutate({ tableId, status: 'active' })`
3. POST `/api/v1/table-context/status` with `x-idempotency-key`
4. `withServerAction` → `tableContextService.updateTableStatus()`
5. RPC validates state transition: `inactive` → `active` only
6. Updates `gaming_table.status`, writes `audit_log`
7. Returns `GamingTableDTO`, invalidates `tableKeys.detail(id)`

**Rating Slip Pause/Resume Flow:**
1. Pit Boss clicks "Pause" on slip panel
2. `useRatingSlipLifecycle.mutate({ slipId, action: 'pause' })`
3. POST `/api/v1/rating-slip/pause` with `x-idempotency-key`
4. RPC validates: `status = 'open'` → insert `rating_slip_pause(start)`
5. Updates `rating_slip.status = 'paused'`, writes `audit_log`
6. Resume: inserts `rating_slip_pause.end`, updates status to `open`
7. Close: finalizes any open pause, calculates duration

### 4.4 Invariants

Critical properties that must remain true:

1. **Table state machine**: Only valid transitions allowed (`inactive` ↔ `active` → `closed` terminal)
2. **Slip state machine**: Only valid transitions allowed (`open` ↔ `paused` → `closed`)
3. **No duplicate active slips**: Player cannot have two `open` or `paused` slips at same table
4. **Duration excludes pauses**: Server-derived, not client-dependent
5. **Audit completeness**: Every state change logged with actor/timestamp
6. **Casino scoping**: All operations scoped by RLS to `current_setting('app.casino_id')`

---

## 5. Schema Changes

### 5.1 New Table: `rating_slip_pause`

```sql
-- Migration: YYYYMMDDHHMMSS_rating_slip_pause_tracking.sql

CREATE TABLE public.rating_slip_pause (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_slip_id UUID NOT NULL REFERENCES rating_slip(id) ON DELETE CASCADE,
  casino_id UUID NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  CONSTRAINT valid_pause_interval CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- Index for efficient duration calculation
CREATE INDEX ix_slip_pause_slip_id ON rating_slip_pause(rating_slip_id, started_at);

-- RLS
ALTER TABLE rating_slip_pause ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rating_slip_pause_read_same_casino"
  ON rating_slip_pause FOR SELECT USING (
    casino_id = current_setting('app.casino_id')::uuid
  );

CREATE POLICY "rating_slip_pause_write_pit_boss"
  ON rating_slip_pause FOR INSERT WITH CHECK (
    casino_id = current_setting('app.casino_id')::uuid
  );
```

### 5.2 New Constraint: Prevent Duplicate Active Slips

```sql
-- Partial unique index: Only one open/paused slip per player per table
CREATE UNIQUE INDEX ux_rating_slip_player_table_active
  ON rating_slip (player_id, table_id)
  WHERE status IN ('open', 'paused');
```

### 5.3 New RPCs

#### `rpc_update_table_status`

```sql
CREATE OR REPLACE FUNCTION rpc_update_table_status(
  p_casino_id UUID,
  p_table_id UUID,
  p_new_status table_status,
  p_actor_id UUID
) RETURNS gaming_table
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status table_status;
  v_result gaming_table;
BEGIN
  -- Get current status with row lock
  SELECT status INTO v_current_status
  FROM gaming_table
  WHERE id = p_table_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Table % not found', p_table_id;
  END IF;

  -- Validate state transition
  -- Valid: inactive → active, active → inactive, active → closed
  -- Invalid: closed → anything (terminal state)
  IF NOT (
    (v_current_status = 'inactive' AND p_new_status = 'active') OR
    (v_current_status = 'active' AND p_new_status IN ('inactive', 'closed'))
  ) THEN
    RAISE EXCEPTION 'TABLE_INVALID_TRANSITION: Cannot transition from % to %',
      v_current_status, p_new_status;
  END IF;

  -- Update status
  UPDATE gaming_table
  SET status = p_new_status
  WHERE id = p_table_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'table-context',
    p_actor_id,
    'update_table_status',
    jsonb_build_object(
      'table_id', p_table_id,
      'from_status', v_current_status,
      'to_status', p_new_status
    )
  );

  RETURN v_result;
END;
$$;
```

#### `rpc_start_rating_slip`

```sql
CREATE OR REPLACE FUNCTION rpc_start_rating_slip(
  p_casino_id UUID,
  p_player_id UUID,
  p_visit_id UUID,
  p_table_id UUID,
  p_seat_number TEXT,
  p_game_settings JSONB,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result rating_slip;
BEGIN
  -- Validate visit is open
  IF NOT EXISTS (
    SELECT 1 FROM visit
    WHERE id = p_visit_id
      AND player_id = p_player_id
      AND casino_id = p_casino_id
      AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'VISIT_NOT_OPEN: Visit % is not active', p_visit_id;
  END IF;

  -- Validate table is active
  IF NOT EXISTS (
    SELECT 1 FROM gaming_table
    WHERE id = p_table_id
      AND casino_id = p_casino_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_ACTIVE: Table % is not active', p_table_id;
  END IF;

  -- Create slip (unique constraint prevents duplicates)
  INSERT INTO rating_slip (
    casino_id, player_id, visit_id, table_id,
    seat_number, game_settings, status, start_time
  )
  VALUES (
    p_casino_id, p_player_id, p_visit_id, p_table_id,
    p_seat_number, p_game_settings, 'open', now()
  )
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'start_rating_slip',
    jsonb_build_object(
      'rating_slip_id', v_result.id,
      'player_id', p_player_id,
      'table_id', p_table_id
    )
  );

  RETURN v_result;
END;
$$;
```

#### `rpc_pause_rating_slip`

```sql
CREATE OR REPLACE FUNCTION rpc_pause_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result rating_slip;
BEGIN
  -- Validate slip is open
  IF NOT EXISTS (
    SELECT 1 FROM rating_slip
    WHERE id = p_rating_slip_id
      AND casino_id = p_casino_id
      AND status = 'open'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_OPEN: Slip % cannot be paused', p_rating_slip_id;
  END IF;

  -- Create pause record
  INSERT INTO rating_slip_pause (rating_slip_id, casino_id, started_at, created_by)
  VALUES (p_rating_slip_id, p_casino_id, now(), p_actor_id);

  -- Update slip status
  UPDATE rating_slip
  SET status = 'paused'
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'pause_rating_slip',
    jsonb_build_object('rating_slip_id', p_rating_slip_id)
  );

  RETURN v_result;
END;
$$;
```

#### `rpc_resume_rating_slip`

```sql
CREATE OR REPLACE FUNCTION rpc_resume_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_actor_id UUID
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result rating_slip;
BEGIN
  -- Validate slip is paused
  IF NOT EXISTS (
    SELECT 1 FROM rating_slip
    WHERE id = p_rating_slip_id
      AND casino_id = p_casino_id
      AND status = 'paused'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_PAUSED: Slip % cannot be resumed', p_rating_slip_id;
  END IF;

  -- Close current pause interval
  UPDATE rating_slip_pause
  SET ended_at = now()
  WHERE rating_slip_id = p_rating_slip_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  -- Update slip status
  UPDATE rating_slip
  SET status = 'open'
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'resume_rating_slip',
    jsonb_build_object('rating_slip_id', p_rating_slip_id)
  );

  RETURN v_result;
END;
$$;
```

#### `rpc_close_rating_slip`

```sql
CREATE OR REPLACE FUNCTION rpc_close_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_average_bet NUMERIC DEFAULT NULL,
  p_actor_id UUID
) RETURNS TABLE (
  slip rating_slip,
  duration_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result rating_slip;
  v_duration INTEGER;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ := now();
  v_paused_ms BIGINT;
BEGIN
  -- Validate slip is open or paused
  SELECT start_time INTO v_start_time
  FROM rating_slip
  WHERE id = p_rating_slip_id
    AND casino_id = p_casino_id
    AND status IN ('open', 'paused')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_INVALID_STATE: Slip % cannot be closed', p_rating_slip_id;
  END IF;

  -- Close any open pause interval
  UPDATE rating_slip_pause
  SET ended_at = v_end_time
  WHERE rating_slip_id = p_rating_slip_id
    AND casino_id = p_casino_id
    AND ended_at IS NULL;

  -- Calculate paused duration
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(ended_at, v_end_time) - started_at)) * 1000
  ), 0)::BIGINT INTO v_paused_ms
  FROM rating_slip_pause
  WHERE rating_slip_id = p_rating_slip_id;

  -- Calculate active duration (total - paused)
  v_duration := GREATEST(0,
    FLOOR((EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000 - v_paused_ms) / 1000)
  )::INTEGER;

  -- Update slip
  UPDATE rating_slip
  SET
    status = 'closed',
    end_time = v_end_time,
    average_bet = COALESCE(p_average_bet, average_bet)
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'rating-slip',
    p_actor_id,
    'close_rating_slip',
    jsonb_build_object(
      'rating_slip_id', p_rating_slip_id,
      'duration_seconds', v_duration,
      'average_bet', p_average_bet
    )
  );

  RETURN QUERY SELECT v_result, v_duration;
END;
$$;
```

#### `rpc_get_rating_slip_duration`

```sql
CREATE OR REPLACE FUNCTION rpc_get_rating_slip_duration(
  p_rating_slip_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_status rating_slip_status;
  v_paused_ms BIGINT;
BEGIN
  SELECT start_time, end_time, status
  INTO v_start_time, v_end_time, v_status
  FROM rating_slip
  WHERE id = p_rating_slip_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Use end_time if closed, otherwise as_of
  IF v_status = 'closed' AND v_end_time IS NOT NULL THEN
    v_end_time := v_end_time;
  ELSE
    v_end_time := p_as_of;
  END IF;

  -- Calculate paused duration
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(ended_at, v_end_time) - started_at)) * 1000
  ), 0)::BIGINT INTO v_paused_ms
  FROM rating_slip_pause
  WHERE rating_slip_id = p_rating_slip_id
    AND started_at <= v_end_time;

  -- Return active seconds
  RETURN GREATEST(0,
    FLOOR((EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000 - v_paused_ms) / 1000)
  )::INTEGER;
END;
$$;
```

---

## 6. SRM Bounded Context Updates

### 6.1 TableContextService Update

**Add to existing TableContextService section:**

```markdown
### Table Lifecycle Operations (PRD-002)

**New RPCs:**
- `rpc_update_table_status(casino_id, table_id, new_status, actor_id)` - State machine transitions

**State Machine:**
```
inactive ←→ active → closed (terminal)
```

**Status Definitions:**
| Status | Meaning | Can Create Slips? |
|--------|---------|-------------------|
| `inactive` | Table provisioned but not open for play. Ready to activate. | No |
| `active` | Table open for play. Players can be seated. | Yes |
| `closed` | Table closed for the gaming day. Terminal state. | No |

**Valid Transitions:**
- `inactive` → `active` (Open table for play)
- `active` → `inactive` (Temporarily close - break, low traffic, dealer change)
- `active` → `closed` (End of gaming day close)
- `closed` → (none) - Terminal state; reset via gaming day rollover

**Why `closed` is Terminal:**
- Prevents accidental reopening after end-of-day close
- Gaming day rollover process resets tables to `inactive`
- Maintains clear audit trail for daily operations

**Implementation Note:** Existing `services/table-context/table-state-machine.ts` must be updated to allow `active → inactive`.

**Audit:** All transitions logged to `audit_log` with `domain='table-context'`
```

### 6.2 RatingSlipService Update

**Add to existing RatingSlipService section:**

```markdown
### Rating Slip Lifecycle Operations (PRD-002)

**New Tables:**
- `rating_slip_pause` - Tracks pause/resume intervals for duration calculation

**New RPCs:**
- `rpc_start_rating_slip(...)` - Create slip with `status='open'`
- `rpc_pause_rating_slip(...)` - Pause slip, record interval start
- `rpc_resume_rating_slip(...)` - Resume slip, record interval end
- `rpc_close_rating_slip(...)` - Close slip, calculate duration
- `rpc_get_rating_slip_duration(...)` - Server-derived duration (excludes pauses)

**State Machine:**
```
open ←→ paused → closed → archived
```

**Constraints:**
- `ux_rating_slip_player_table_active` - Prevents duplicate active slips per player/table
- `valid_pause_interval` - Ensures pause end > start

**Audit:** All transitions logged to `audit_log` with `domain='rating-slip'`
```

---

## 7. API Surface Specifications

### 7.1 Table Status Update

```markdown
## API Surface: Update Table Status

### Endpoint
`POST /api/v1/table-context/status`

### Purpose
Transition a gaming table between status states (open/close)

### Authentication
- **Required:** Yes
- **Roles:** `pit_boss`, `admin`
- **RLS:** Casino-scoped via `current_setting('app.casino_id')`

### Request

**Headers:**
```
Authorization: Bearer [token]
Content-Type: application/json
x-idempotency-key: [uuid]
x-correlation-id: [uuid]
```

**Body:**
```typescript
interface UpdateTableStatusRequest {
  table_id: string;        // UUID
  status: 'inactive' | 'active' | 'closed';
}
```

### Response

**Success (200 OK):**
```typescript
interface UpdateTableStatusResponse {
  ok: true;
  code: 'OK';
  status: 200;
  requestId: string;
  data: {
    id: string;
    label: string;
    type: 'blackjack' | 'poker' | 'roulette' | 'baccarat';
    status: 'inactive' | 'active' | 'closed';
    pit: string | null;
    casino_id: string;
  };
}
```

**Error (400/403/404/409):**
```typescript
interface ErrorResponse {
  ok: false;
  code: 'TABLE_NOT_FOUND' | 'TABLE_INVALID_TRANSITION' | 'FORBIDDEN';
  status: number;
  error: string;
}
```
```

### 7.2 Start Rating Slip

```markdown
## API Surface: Start Rating Slip

### Endpoint
`POST /api/v1/rating-slip/start`

### Purpose
Start a new rating slip for a seated player

### Request

**Body:**
```typescript
interface StartRatingSlipRequest {
  player_id: string;       // UUID
  visit_id: string;        // UUID (must be open)
  table_id: string;        // UUID (must be active)
  seat_number: string;     // e.g., "1", "2", "3"
  game_settings?: object;  // Snapshot of game configuration
}
```

### Response

**Success (201 Created):**
```typescript
interface StartRatingSlipResponse {
  ok: true;
  code: 'CREATED';
  status: 201;
  data: {
    id: string;
    casino_id: string;
    player_id: string;
    visit_id: string;
    table_id: string;
    seat_number: string;
    status: 'open';
    start_time: string;    // ISO 8601
    game_settings: object | null;
  };
}
```

**Error (400/409):**
- `VISIT_NOT_OPEN` - Visit has ended
- `TABLE_NOT_ACTIVE` - Table is not open
- `UNIQUE_VIOLATION` - Duplicate active slip
```

### 7.3 Pause/Resume/Close Rating Slip

```markdown
## API Surface: Rating Slip Lifecycle Actions

### Endpoints
- `POST /api/v1/rating-slip/{id}/pause`
- `POST /api/v1/rating-slip/{id}/resume`
- `POST /api/v1/rating-slip/{id}/close`

### Close Request

**Body:**
```typescript
interface CloseRatingSlipRequest {
  average_bet?: number;    // Final average bet (optional override)
}
```

### Close Response

**Success (200 OK):**
```typescript
interface CloseRatingSlipResponse {
  ok: true;
  data: {
    id: string;
    status: 'closed';
    start_time: string;
    end_time: string;
    average_bet: number | null;
    duration_seconds: number;  // Server-calculated, excludes pauses
  };
}
```
```

---

## 8. Alternatives Considered

### Option A: Client-Side Duration Calculation (Rejected)

**Pros:** Simpler implementation, no new table needed
**Cons:** Relies on client clock, prone to manipulation, not auditable
**Reason rejected:** PRD-002 explicitly requires server-derived duration

### Option B: Store Duration on rating_slip (Rejected)

**Pros:** Simpler queries, no need for pause table
**Cons:** Cannot recalculate, loses pause history, auditing gaps
**Reason rejected:** Loses ability to audit pause/resume events

---

## 9. Risks & Open Questions

### 9.1 Risks

| Risk | Mitigation |
|------|------------|
| RLS complexity for cross-table queries | Per-role integration tests (per PRD-002) |
| Clock drift on pause/resume | Server timestamps only; client advisory |
| Race condition on duplicate check | `FOR UPDATE` row locks + unique constraint |

### 9.2 Open Questions

1. **Should closing a table auto-close active slips?**
   - **Recommendation**: Yes, with warning in UI. RPCs can be extended to handle this.
   - **Decision needed**: Before implementation

---

## 10. Implementation Plan

### 10.1 Database Layer

**Owner:** Backend
**Complexity:** Medium

- [ ] Create migration: `YYYYMMDDHHMMSS_rating_slip_pause_tracking.sql`
  - [ ] Create `rating_slip_pause` table with RLS
  - [ ] Add `ux_rating_slip_player_table_active` constraint
  - [ ] Create `rpc_update_table_status`
  - [ ] Create `rpc_start_rating_slip`
  - [ ] Create `rpc_pause_rating_slip`
  - [ ] Create `rpc_resume_rating_slip`
  - [ ] Create `rpc_close_rating_slip`
  - [ ] Create `rpc_get_rating_slip_duration`
- [ ] Run `npm run db:types` to regenerate types

### 10.2 Service Layer

**Owner:** Backend
**Complexity:** Medium

- [ ] Update `services/table-context/table-state-machine.ts`:
  - [ ] Add `active → inactive` transition (temporary close)
  - [ ] Current: `{ inactive: ['active'], active: ['closed'], closed: [] }`
  - [ ] Updated: `{ inactive: ['active'], active: ['inactive', 'closed'], closed: [] }`
- [ ] Extend `services/table-context/index.ts`:
  - [ ] Add `updateTableStatus(tableId, status): Promise<ServiceResult<GamingTableDTO>>`
- [ ] Extend `services/rating-slip/index.ts`:
  - [ ] Add `startSlip(input): Promise<ServiceResult<RatingSlipDTO>>`
  - [ ] Add `pauseSlip(slipId): Promise<ServiceResult<RatingSlipDTO>>`
  - [ ] Add `resumeSlip(slipId): Promise<ServiceResult<RatingSlipDTO>>`
  - [ ] Add `closeSlip(slipId, averageBet?): Promise<ServiceResult<RatingSlipCloseDTO>>`
  - [ ] Add `getDuration(slipId): Promise<ServiceResult<number>>`
- [ ] Update DTOs in `services/rating-slip/dtos.ts`
- [ ] Update `services/rating-slip/keys.ts` with new query keys

### 10.3 API Layer

**Owner:** Backend
**Complexity:** Low

- [ ] Create `app/api/v1/table-context/status/route.ts`
- [ ] Create `app/api/v1/rating-slip/start/route.ts`
- [ ] Create `app/api/v1/rating-slip/[id]/pause/route.ts`
- [ ] Create `app/api/v1/rating-slip/[id]/resume/route.ts`
- [ ] Create `app/api/v1/rating-slip/[id]/close/route.ts`
- [ ] Wrap all routes with `withServerAction()`

### 10.4 Frontend

**Owner:** Frontend
**Complexity:** Medium

- [ ] Create `hooks/table-context/use-table-operations.ts`
- [ ] Create `hooks/rating-slip/use-rating-slip-lifecycle.ts`
- [ ] Update Pit Dashboard with table status controls
- [ ] Create Rating Slip Panel component
- [ ] Add duration display with real-time updates

### 10.5 Testing

**Owner:** QA
**Complexity:** Medium

- [ ] Unit tests for state machine transitions (existing + new RPCs)
- [ ] Integration tests with RLS enabled
- [ ] E2E test: open table → start slip → pause → resume → close
- [ ] Test duplicate slip prevention constraint
- [ ] Test duration calculation accuracy

### 10.6 Documentation

- [ ] Update `services/table-context/README.md`
- [ ] Update `services/rating-slip/README.md`
- [ ] Update SRM with new RPCs and constraints

---

## 11. Definition of Done

Per PRD-002:

**Functionality**
- [ ] Pit Boss can open/close tables via dashboard
- [ ] Pit Boss can start/pause/resume/close rating slips
- [ ] No duplicate active slips allowed (constraint enforced)
- [ ] Duration displayed correctly after pause/resume cycles

**Data & Integrity**
- [ ] Table state machine enforced (no invalid transitions)
- [ ] Slip state machine enforced (no invalid transitions)
- [ ] No orphaned slips (all have valid visit/table FKs)

**Security & Access**
- [ ] RLS: pit_boss can only see/modify own casino's tables/slips

**Testing**
- [ ] Unit tests for state machine transitions
- [ ] Integration test: full slip lifecycle with RLS enabled
- [ ] One E2E test: open table → start slip → pause → resume → close

**Operational Readiness**
- [ ] Structured logs for table/slip state changes
- [ ] Error states visible in UI (not silent failures)

---

## 12. OE-01 Over-Engineering Check

Per `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`:

- [x] A section 6 trigger exists? **Yes** - PRD-002 mandates server-derived duration
- [x] Measured evidence attached? **Yes** - PRD NFRs (LCP ≤ 2.5s, p95 < 400ms)
- [x] Idempotency handled at DB (UNIQUE key)? **Yes** - Unique constraint on active slips
- [x] Single service mutates the domain? **Yes** - RatingSlipService owns slips, TableContextService owns tables
- [x] Infra-only change ≤150 LOC? **No** - New table + 6 RPCs → Mini-ADR not required (feature work)

**Result:** [x] Proceed

---

## 13. References

- **PRD**: `docs/10-prd/PRD-002-table-rating-core.md`
- **SLAD**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Existing State Machine**: `services/rating-slip/state-machine.ts`
- **TableContext README**: `services/table-context/README.md`
- **RatingSlip README**: `services/rating-slip/README.md`
- **Edge Transport**: `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- **Testing Strategy**: `docs/40-quality/QA-001-service-testing-strategy.md`

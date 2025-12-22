# PRD-017 — Start From Previous Session (Visit Continuation)

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Created:** 2025-12-22
- **Depends On:** PRD-016 (Rating Slip Session Continuity)
- **Summary:** Enable operators to quickly start a new visit seeded from a recently closed session's context (last table/seat, game settings, average bet). This PRD introduces `visit_group_id` for cross-visit continuity tracking, read models for recent sessions listing, and a write endpoint for continuation. Resolves the "start over from scratch" friction when a player returns shortly after leaving.

## 2. Problem & Goals

### 2.1 Problem

When a player leaves and returns shortly after, operators currently must:
1. Search for the player again
2. Manually start a new visit from scratch
3. Manually look up their last table/seat
4. Re-enter game settings and observe average bet from memory

This creates operational friction and potential data entry errors. The system knows the prior context but doesn't offer a fast path to reuse it.

**Root cause:** No mechanism exists to:
- List recently closed sessions for a player
- Retrieve last-known context (table, seat, settings)
- Create a new visit pre-seeded from prior context
- Track continuity across related visits

### 2.2 Goals

1. **Recent sessions display**: Pit Boss can view a player's recently closed sessions with aggregated totals
2. **Context seeding**: "Start from previous" action pre-fills destination table/seat and game settings from last session
3. **Visit grouping**: Link continuation visits via `visit_group_id` for aggregation and audit
4. **Guardrails**: Prevent duplicate open visits; enforce explicit session selection
5. **Audit trail**: Log continuation actions with source and destination references

### 2.3 Non-Goals

- Re-opening closed visits (visits remain immutable once closed)
- Mutating historical rating slips (immutability preserved)
- Copying financial ledger rows (Finance remains authoritative)
- Automatic continuation (always explicit operator selection)
- Grace period "resume same visit" logic (future enhancement)
- Cross-casino session tracking

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor
- **System consumers:** Pit Dashboard, Loyalty aggregation views

**Top Jobs:**

1. As a **Pit Boss**, I need to see a player's recently closed sessions so that I can quickly start them from where they left off.

2. As a **Pit Boss**, I need to start a new visit pre-filled with the player's last table, seat, and game settings so that I don't have to re-enter this information manually.

3. As a **Floor Supervisor**, I need to see aggregated totals across a player's visit group so that I understand their full session history for comp decisions.

4. As the **Pit Dashboard**, I need to query recent sessions via RPC so that I can display the "Start from previous" UI.

5. As **Compliance**, I need an audit trail showing when a new visit was started as a continuation of a prior visit so that session relationships are traceable.

## 4. Scope & Feature List

**P0 (Must-Have)**
- Add `visit_group_id` column to `visit` table with DB-level default trigger
- Add partial unique index enforcing max 1 open visit per identified player per casino
- Create `rpc_get_player_recent_sessions(p_casino_id, p_player_id, p_limit, p_cursor)` RPC
- Create `rpc_get_player_last_session_context(p_casino_id, p_player_id)` RPC
- Implement `POST /api/v1/visits/start-from-previous` endpoint
- Validate destination table/seat via TableContextService published query
- Audit log continuation actions with source reference
- Index on `(casino_id, visit_group_id, started_at)` for efficient group queries

**P1 (Should-Have)**
- `rpc_get_visit_group_totals(p_visit_group_id)` for group-level aggregation
- Idempotency support via `Idempotency-Key` header (per ADR-021)

**P2 (Nice-to-Have)**
- Gaming day totals alongside visit group totals in UI
- Configurable "recent sessions" window (default: last 5, up to 7 days)

## 5. Requirements

### 5.1 Data Model & DB Invariants

#### 5.1.1 visit_group_id Column

```sql
-- New column on visit
visit_group_id UUID NOT NULL
```

**Invariant enforcement via trigger (DB-level, not application):**

```sql
CREATE OR REPLACE FUNCTION trg_visit_set_group_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If visit_group_id not provided, default to self-reference
  IF NEW.visit_group_id IS NULL THEN
    NEW.visit_group_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_visit_group_id_default
  BEFORE INSERT ON visit
  FOR EACH ROW
  EXECUTE FUNCTION trg_visit_set_group_id();
```

**Semantics:**
- First visit of a group: `visit_group_id = id` (trigger sets automatically if NULL)
- Continuation visit: Application sets `visit_group_id = source.visit_group_id`

#### 5.1.2 One Open Visit Per Player (DB Constraint)

**Invariant: Max 1 open visit per identified player per casino**

```sql
CREATE UNIQUE INDEX idx_visit_one_open_per_player
  ON visit (casino_id, player_id)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;
```

This partial unique index:
- Applies only to open visits (`ended_at IS NULL`)
- Applies only to identified players (`player_id IS NOT NULL`)
- Allows ghost visits (`player_id IS NULL`) to coexist
- Makes the 409 behavior DB-enforced, not race-condition bait

### 5.2 RPC Contracts

#### 5.2.1 rpc_get_player_recent_sessions

```sql
CREATE FUNCTION rpc_get_player_recent_sessions(
  p_casino_id uuid,
  p_player_id uuid,
  p_limit int DEFAULT 5,
  p_cursor text DEFAULT NULL  -- Encoded cursor, not raw timestamp
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER;
```

**Contract Requirements:**

| Field | Type | Null Semantics |
|-------|------|----------------|
| `sessions` | array | Never null; empty array if no results |
| `sessions[].visit_id` | string (uuid) | Never null |
| `sessions[].ended_at` | string (ISO8601) | Never null (closed sessions only) |
| `sessions[].last_seat_number` | number (int) | Never null |
| `sessions[].total_duration_seconds` | number (int) | Never null; 0 if no segments |
| `sessions[].total_buy_in` | number (decimal) | Never null; 0 if no transactions |
| `sessions[].points_earned` | number (int) | Never null; 0 if no accrual |
| `next_cursor` | string | Null if no more pages |
| `open_visit` | object | Null if no open visit; separate from sessions list |

**Ordering:** `ended_at DESC, visit_id DESC` (deterministic, handles ties)

**Cursor encoding:** `base64(ended_at::text || '|' || visit_id::text)`

**Scope:** Returns **closed sessions only** in `sessions` array. Open visit (if any) returned separately in `open_visit` field.

**Response shape:**
```typescript
interface RecentSessionsResponse {
  sessions: Array<{
    visit_id: string;
    visit_group_id: string;
    started_at: string;           // ISO8601, never null
    ended_at: string;             // ISO8601, never null (closed only)
    last_table_id: string;        // Never null
    last_table_name: string;      // Never null
    last_seat_number: number;     // int, never null
    total_duration_seconds: number; // int >= 0
    total_buy_in: number;         // decimal >= 0
    total_cash_out: number;       // decimal >= 0
    net: number;                  // decimal (can be negative)
    points_earned: number;        // int >= 0
    segment_count: number;        // int >= 0
  }>;
  next_cursor: string | null;
  open_visit: {                   // Separate from sessions list
    visit_id: string;
    visit_group_id: string;
    started_at: string;
    current_table_id: string;
    current_table_name: string;
    current_seat_number: number;
  } | null;
}
```

#### 5.2.2 rpc_get_player_last_session_context

```sql
CREATE FUNCTION rpc_get_player_last_session_context(
  p_casino_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER;
```

**Contract Requirements:**

| Field | Type | Null Semantics |
|-------|------|----------------|
| `visit_id` | string | Never null (returns null object if no closed session) |
| `last_table_id` | string | Never null |
| `last_seat_number` | number | int, never null |
| `last_game_settings` | object | Null if no settings stored |
| `last_average_bet` | number | Null if not observed |

**Response shape:**
```typescript
interface LastSessionContextResponse {
  visit_id: string;
  visit_group_id: string;
  last_table_id: string;
  last_table_name: string;
  last_seat_number: number;
  last_game_settings: Record<string, unknown> | null;
  last_average_bet: number | null;
  ended_at: string;
} | null  // null if player has no closed sessions
```

### 5.3 Cross-Context Aggregation Contracts

**Problem:** VisitService needs Finance and Loyalty totals without violating bounded context rules.

**Solution:** Explicit published contracts (not direct table reads):

| Data | Owner | Published Contract | Consumer |
|------|-------|-------------------|----------|
| Visit financial totals | PlayerFinancialService | `visit_financial_summary` view (EXISTS, SRM v4.4.0) | VisitService RPCs |
| Visit loyalty points | LoyaltyService | `rpc_get_visit_loyalty_summary(visit_id)` RPC (NEW) | VisitService RPCs |
| Segment context | RatingSlipService | `rpc_get_visit_last_segment(visit_id)` RPC (NEW) | VisitService RPCs |

**Composition approach:**
```sql
-- Inside rpc_get_player_recent_sessions:
-- 1. Query visit table (owned)
-- 2. LEFT JOIN visit_financial_summary (published view, Finance-owned)
-- 3. Call rpc_get_visit_loyalty_summary for each visit (or batch query)
-- 4. Call rpc_get_visit_last_segment for last table/seat
```

**Alternative (simpler, recommended):** Create a `visit_session_summary` materialized view or reporting query that the SRM explicitly permits for read-only aggregation. Document in SRM as a "reporting read model" exception.

### 5.4 Write Endpoint

`POST /api/v1/visits/start-from-previous`

**Request:**
```typescript
interface StartFromPreviousRequest {
  player_id: string;
  source_visit_id: string;
  destination_table_id: string;
  destination_seat_number: number;
  game_settings_override?: Record<string, unknown>;
}
```

**Server Validation (all required, in order):**

1. **Actor permission**: `pit_boss` or `admin` role required
2. **Source visit exists**: Query by `source_visit_id`
3. **Source visit closed**: `source.ended_at IS NOT NULL` (else 400 `SOURCE_VISIT_NOT_CLOSED`)
4. **Source visit player match**: `source.player_id == request.player_id` (else 400 `PLAYER_MISMATCH`)
5. **Source visit casino match**: `source.casino_id == current_casino` (else 403 `FORBIDDEN`)
6. **No open visit**: Check partial unique index (DB will reject, return 409 `VISIT_ALREADY_OPEN`)
7. **Destination table valid**: Call `TableContextService.isTableAvailable(table_id, seat_number)` published query
   - If table inactive/closed: 422 `TABLE_NOT_AVAILABLE`
   - If seat occupied: 422 `SEAT_OCCUPIED` (if occupancy tracking enabled)

**Response (201 Created):**
```typescript
interface StartFromPreviousResponse {
  visit_id: string;
  visit_group_id: string;
  active_slip_id: string;
  started_at: string;
}
```

**Error Responses:**

| Code | Error | Description |
|------|-------|-------------|
| 400 | `SOURCE_VISIT_NOT_CLOSED` | Source visit is still open |
| 400 | `PLAYER_MISMATCH` | Source visit belongs to different player |
| 403 | `FORBIDDEN` | Source visit belongs to different casino |
| 404 | `SOURCE_VISIT_NOT_FOUND` | Source visit_id doesn't exist |
| 409 | `VISIT_ALREADY_OPEN` | Player has an open visit; includes `open_visit_id` |
| 422 | `TABLE_NOT_AVAILABLE` | Destination table is not active |
| 422 | `SEAT_OCCUPIED` | Destination seat is occupied |

### 5.5 Destination Validation Ownership

**Invariant:** VisitService does NOT read `gaming_table` directly.

**Published contract from TableContextService:**

```typescript
// TableContextService published query (add to SRM)
interface TableAvailabilityCheck {
  table_id: string;
  seat_number: number;
}

interface TableAvailabilityResult {
  available: boolean;
  reason?: 'table_inactive' | 'table_closed' | 'seat_occupied';
  table_name?: string;
}

// RPC or service method
rpc_check_table_seat_availability(p_table_id uuid, p_seat_number int) RETURNS jsonb
```

**Implementation:** VisitService calls this RPC before creating the visit. If unavailable, return 422 with the reason.

### 5.6 Policy Snapshot Semantics

**Decision:** New continuation segment uses CURRENT policy snapshot, not copied from source.

**Rationale:**
- A continuation is a **new session**, not a replay
- Policies may have changed (comp rates, threshold multipliers)
- Copying old policy creates compliance ambiguity

**Acceptance test:**
```
GIVEN casino policy snapshot v1 (comp_rate = 0.5%)
AND player has closed visit with segment using v1
WHEN casino updates policy to v2 (comp_rate = 0.75%)
AND operator starts from previous
THEN new segment has policy_snapshot = v2
```

### 5.7 Non-Functional Requirements

- RPCs p95 latency < 200ms (recent sessions with up to 50 sessions scanned)
- Write endpoint p95 latency < 150ms
- All RPCs use SECURITY INVOKER (RLS context required)
- Migrations backward compatible (new column has trigger default)
- No breaking changes to existing visit creation flow

> Architecture details: See SRM v4.4.0 (VisitService, RatingSlipService), ADR-015 (RLS context)

## 6. UX / Flow Overview

**Flow 1: Start From Previous (Primary)**
```
1. Pit Boss searches/selects player
2. UI calls rpc_get_player_recent_sessions(casino_id, player_id, limit, cursor)
   → returns closed sessions list + open_visit (if any)
3. If open_visit exists → UI shows "Resume current" card (separate from list)
4. UI displays closed sessions list with "Start from previous" action
5. Pit Boss clicks on a closed session row
6. UI calls rpc_get_player_last_session_context to prefill form
7. Modal appears with:
   - Pre-filled: Last table, seat, game settings
   - Editable: Destination table/seat override
8. Pit Boss confirms → POST /api/v1/visits/start-from-previous
   - Server validates: no open visit + source closed + source.player_id matches + destination valid
   - Server creates new visit with visit_group_id = source.visit_group_id
   - Server starts first segment (RatingSlipService)
   - Server writes audit_log continuation record
9. UI redirects to active session view (visit-centric)
```

**Flow 2: Open Visit Guard**
```
1. Pit Boss attempts "Start from previous" for player with open visit
2. DB partial unique index rejects INSERT
3. System returns 409 with open_visit_id
4. UI displays: "Player already has an active visit. Resume instead?"
5. Pit Boss can click "Resume" to navigate to existing visit
```

**Session Context View**
```
┌─────────────────────────────────────────────────────┐
│ John Smith                                          │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● ACTIVE SESSION                                │ │
│ │   Today 2:30 PM - now (1h 45m)                  │ │
│ │   BJ-05 Seat 3 | $500 in | $200 out | 150 pts   │ │
│ │   [Resume]                                      │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ Recent Closed Sessions                              │
├─────────────────────────────────────────────────────┤
│ ○ Today 11:00 AM - 12:30 PM (1h 30m)               │
│   BJ-03 Seat 2 → BJ-01 Seat 5 | $300 in | $450 out │
│   [Start from previous]                             │
├─────────────────────────────────────────────────────┤
│ ○ Yesterday 8:00 PM - 10:45 PM (2h 45m)            │
│   Roulette-02 Seat 8 | $1000 in | $800 out         │
│   [Start from previous]                             │
└─────────────────────────────────────────────────────┘
```

Note: Active session displayed separately from closed sessions list (not mixed).

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PRD-016 (Rating Slip Session Continuity) | **REQUIRED** | `rpc_get_visit_live_view` provides session totals pattern |
| VisitService | COMPLETE | Visit CRUD operations |
| RatingSlipService | COMPLETE | Segment creation on visit start |
| PlayerFinancialService | COMPLETE | `visit_financial_summary` view (published contract) |
| TableContextService | **REQUIRES UPDATE** | Add `rpc_check_table_seat_availability` published query |
| LoyaltyService | **REQUIRES UPDATE** | Add `rpc_get_visit_loyalty_summary` published query |
| ADR-015 RLS context | COMPLETE | `set_rls_context` pattern |

### 7.2 Rollout Sequence

1. **Phase 1: Schema** - Add `visit_group_id` column, trigger, backfill, partial unique index
2. **Phase 2: Published contracts** - Add TableContext and Loyalty published queries
3. **Phase 3: Read RPCs** - Deploy `rpc_get_player_recent_sessions`, `rpc_get_player_last_session_context`
4. **Phase 4: Write endpoint** - Deploy `POST /api/v1/visits/start-from-previous`
5. **Phase 5: UI** - Pit Dashboard integration (separate PRD)

### 7.3 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Two staff click "Start from previous" simultaneously | Partial unique index `idx_visit_one_open_per_player` enforces at DB level |
| Table/seat no longer available at destination | Validate via TableContext published query; return 422 with reason |
| Large visit history slows query | Limit to last 7 days + cursor pagination with tie-breaking |
| Policy snapshot copied from source | Trigger and application code use CURRENT policy (tested) |
| Cross-context reads violate SRM | Explicit published contracts documented; no direct table access |

**Resolved Questions:**
- ✅ Continuity key: `visit_group_id` (Option A from issue spec)
- ✅ Aggregation: Via published contracts (Finance view, Loyalty RPC)
- ✅ Policy handling: New visit gets current policy snapshot (acceptance test defined)
- ✅ Financial data: Aggregated via `visit_financial_summary` view, not copied
- ✅ DB enforcement: Trigger for visit_group_id, partial unique index for one-open-visit
- ✅ Pagination: Cursor encodes (ended_at, visit_id) for deterministic ordering

**Open Questions:**
1. What is the default "recent sessions" window? (Proposed: last 5 sessions, up to 7 days)
2. Should seat occupancy validation be enforced? (Proposed: optional, based on casino settings)

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `visit_group_id` column added with trigger-based default (`= id` if NULL)
- [ ] Trigger tested: INSERT without visit_group_id results in self-reference
- [ ] `rpc_get_player_recent_sessions` returns paginated closed sessions with totals
- [ ] `rpc_get_player_last_session_context` returns last table/seat/settings
- [ ] `POST /api/v1/visits/start-from-previous` creates visit + first segment
- [ ] Continuation populates `visit_group_id` from source visit

**Data & Integrity**
- [ ] Partial unique index `idx_visit_one_open_per_player` created and enforced
- [ ] DB rejects duplicate open visit INSERT (constraint violation → 409)
- [ ] `visit_group_id` is NOT NULL on all visits (constraint enforced)
- [ ] Source visit validation: closed + player_id match + casino match
- [ ] Destination segment created with CURRENT policy snapshot (not source)

**Cross-Context Contracts**
- [ ] TableContextService publishes `rpc_check_table_seat_availability`
- [ ] LoyaltyService publishes `rpc_get_visit_loyalty_summary`
- [ ] RatingSlipService publishes `rpc_get_visit_last_segment` (or equivalent)
- [ ] VisitService RPCs use only published contracts (no direct table reads)

**Security & Access**
- [ ] All RPCs use SECURITY INVOKER
- [ ] RLS enforced: cannot query/continue visits from other casinos
- [ ] Negative test: cross-casino continuation returns 403
- [ ] Negative test: source.player_id mismatch returns 400
- [ ] Role check: pit_boss or admin required for write endpoint

**Concurrency**
- [ ] Partial unique index prevents duplicate open visits (DB-enforced)
- [ ] Transaction isolation prevents race conditions
- [ ] `Idempotency-Key` header support on write endpoint (import from `lib/http/headers.ts` per ADR-021)

**Testing**
- [ ] Unit test: Trigger sets visit_group_id = id when NULL on INSERT
- [ ] Unit test: Partial unique index rejects second open visit for same player
- [ ] Unit test: `rpc_get_player_recent_sessions` pagination with tie-breaking
- [ ] Unit test: `rpc_get_player_recent_sessions` excludes open visits from sessions list
- [ ] Integration test: Start from previous creates visit with correct `visit_group_id`
- [ ] Integration test: 409 returned when player has open visit (DB constraint)
- [ ] Integration test: 400 returned when source.player_id != request.player_id
- [ ] Integration test: 422 returned when destination table not available
- [ ] Integration test: RLS prevents cross-casino access
- [ ] **Acceptance test:** Policy v1 → v2 change → continuation uses v2 snapshot

**Audit & Observability**
- [ ] Audit log entry for continuation actions with source_visit_id
- [ ] Structured logging with correlation_id
- [ ] Request tracing via `x-request-id`

**Documentation**
- [ ] RPC contracts documented (params, response shapes, null semantics)
- [ ] Write endpoint documented with all error codes
- [ ] `visit_group_id` semantics documented in SRM
- [ ] Published contracts added to SRM cross-context consumption rules
- [ ] Continuation audit log format documented

## 9. Related Documents

- **Proposal:** `docs/00-vision/ISSUE_Start_From_Previous_Session_Visit_Continuation.md`
- **Prerequisite:** `docs/10-prd/PRD-016-rating-slip-continuity.md` (Visit Live View RPC)
- **Visit Service:** `docs/10-prd/PRD-003-player-visit-management.md`
- **SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.4.0
- **RLS Context:** `docs/80-adrs/ADR-015-rls-context-injection.md`
- **Idempotency Standard:** `docs/80-adrs/ADR-021-idempotency-header-standardization.md`
- **Pit Dashboard:** `docs/10-prd/PRD-006-pit-dashboard.md`
- **Financial Service:** `docs/10-prd/PRD-009-player-financial-service.md`
- **Schema:** `types/database.types.ts`

---

## Appendix A: Schema Changes

### Migration: `YYYYMMDDHHMMSS_prd017_visit_continuation.sql`

```sql
-- =============================================================
-- PRD-017: Visit Continuation Schema
-- =============================================================

-- 1. Add visit_group_id column (nullable initially for backfill)
ALTER TABLE visit
  ADD COLUMN IF NOT EXISTS visit_group_id UUID;

-- 2. Backfill existing visits (each becomes its own group)
UPDATE visit
SET visit_group_id = id
WHERE visit_group_id IS NULL;

-- 3. Make NOT NULL after backfill
ALTER TABLE visit
  ALTER COLUMN visit_group_id SET NOT NULL;

-- 4. Trigger to default visit_group_id = id on INSERT
CREATE OR REPLACE FUNCTION trg_visit_set_group_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.visit_group_id IS NULL THEN
    NEW.visit_group_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visit_group_id_default ON visit;
CREATE TRIGGER trg_visit_group_id_default
  BEFORE INSERT ON visit
  FOR EACH ROW
  EXECUTE FUNCTION trg_visit_set_group_id();

-- 5. Partial unique index: max 1 open visit per identified player per casino
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_one_open_per_player
  ON visit (casino_id, player_id)
  WHERE ended_at IS NULL AND player_id IS NOT NULL;

-- 6. Index for group queries
CREATE INDEX IF NOT EXISTS idx_visit_group
  ON visit (casino_id, visit_group_id, started_at DESC);

-- 7. Index for recent sessions query (closed sessions, paginated)
CREATE INDEX IF NOT EXISTS idx_visit_player_recent_closed
  ON visit (casino_id, player_id, ended_at DESC, id DESC)
  WHERE player_id IS NOT NULL AND ended_at IS NOT NULL;
```

### RLS Policy Implications

No new RLS policies required. Existing `visit` policies cover:
- Casino-scoped reads (`casino_id = current_setting('app.casino_id')`)
- Role-based writes (pit_boss, admin)

The new `visit_group_id` column inherits existing row-level access.

---

## Appendix B: Bounded Context Compliance

Per SRM v4.4.0:

| Component | Owning Service | Notes |
|-----------|----------------|-------|
| `visit.visit_group_id` | VisitService | New column, continuation metadata |
| `trg_visit_set_group_id` | VisitService | DB trigger for default |
| `idx_visit_one_open_per_player` | VisitService | DB constraint for invariant |
| `rpc_get_player_recent_sessions` | VisitService | Composes published contracts |
| `rpc_get_player_last_session_context` | VisitService | Composes published contracts |
| `POST /visits/start-from-previous` | VisitService | Creates visit, validates via published contracts |

**Published Contracts Consumed (read-only):**

| Contract | Owner | Type | Purpose |
|----------|-------|------|---------|
| `visit_financial_summary` | PlayerFinancialService | View | Visit financial totals |
| `rpc_get_visit_loyalty_summary` | LoyaltyService | RPC | Visit points earned |
| `rpc_get_visit_last_segment` | RatingSlipService | RPC | Last segment context |
| `rpc_check_table_seat_availability` | TableContextService | RPC | Destination validation |

**Published Contracts Added (new):**

| Contract | Owner | Type | Description |
|----------|-------|------|-------------|
| `rpc_get_visit_loyalty_summary` | LoyaltyService | RPC | Returns `{ points_earned: number }` for visit_id |
| `rpc_get_visit_last_segment` | RatingSlipService | RPC | Returns last segment's table/seat/settings |
| `rpc_check_table_seat_availability` | TableContextService | RPC | Returns availability status for table/seat |

**SRM Update Required:** Add these published contracts to cross-context consumption rules in SRM v4.5.0.

---

## Appendix C: Cursor Pagination Specification

**Cursor Format:**
```
base64(ended_at_iso || '|' || visit_id)
```

**Example:**
```
Input: ended_at = 2025-12-22T14:30:00Z, visit_id = abc-123
Cursor: base64("2025-12-22T14:30:00Z|abc-123") = "MjAyNS0xMi0yMlQxNDozMDowMFp8YWJjLTEyMw=="
```

**Query with cursor:**
```sql
SELECT ... FROM visit
WHERE casino_id = p_casino_id
  AND player_id = p_player_id
  AND ended_at IS NOT NULL
  AND (ended_at, id) < (cursor_ended_at, cursor_visit_id)  -- Tuple comparison
ORDER BY ended_at DESC, id DESC
LIMIT p_limit;
```

**Tie-breaking:** `visit_id DESC` ensures deterministic ordering when multiple visits have the same `ended_at`.

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2025-12-22 | Lead Architect | Corrected idempotency header to `Idempotency-Key` per ADR-021 (was incorrectly `x-idempotency-key`); added ADR-021 to related documents |
| 1.1 | 2025-12-22 | Lead Architect | Enforcement layer: trigger for visit_group_id default, partial unique index for one-open-visit, cursor pagination spec, explicit cross-context contracts, destination validation ownership, source visit player_id validation, RPC null semantics, policy snapshot acceptance test |
| 1.0 | 2025-12-22 | Lead Architect | Initial draft based on ISSUE_Start_From_Previous_Session_Visit_Continuation.md |

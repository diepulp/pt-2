# PRD-016 — Rating Slip Session Continuity

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Approved
- **Created:** 2025-12-22
- **Summary:** Enable session continuity across player table/seat moves without violating rating slip immutability invariants. This PRD introduces slip chaining metadata, enforces visit-anchored financial transactions, and provides a Visit Live View RPC that presents operators with a stable "session slip" while preserving immutable segment telemetry for audit. Resolves the "data loss on move" perception reported by operations.

## 2. Problem & Goals

### 2.1 Problem

Current behavior creates new rating slips on player moves (table/seat changes). This is **architecturally intentional** per SRM v4.4.0—rating slips are immutable telemetry records capturing "what happened where."

However, operators (Pit Boss) experience this as **data loss**:
- Buy-ins/cash-outs appear to "reset" when a player moves
- Duration tracking restarts from zero on each segment
- MTL threshold progress doesn't accumulate visibly
- The "session slip" concept doesn't match database reality

The root cause: UI/business treats `rating_slip` as the session object, but it's actually segment telemetry. The session anchor is `visit`.

### 2.2 Goals

1. **Slip chaining**: Link rating slip segments via `previous_slip_id` to preserve movement history
2. **Duration continuity**: Carry forward accumulated play time across moves via `accumulated_seconds`
3. **Visit-anchored financials**: Enforce `visit_id` as required on financial transactions (no apparent "reset")
4. **Visit Live View RPC**: Single published query returning session totals + current position for UI
5. **Stable session identity**: Operators see one "session" keyed by **`visit_id`** (canonical session key)

### 2.3 Non-Goals

- Mutating `table_id`/`seat_number` on existing slips (violates SRM immutability)
- Backfilling historical data (dev environment, clean re-seed)
- UI implementation (separate follow-up after RPC ships)
- Cross-casino session tracking (out of scope)
- `visit_group_id` for cross-visit continuations (future PRD if needed)

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor
- **System consumers:** Pit Dashboard, LoyaltyService, MTLService

**Top Jobs:**

1. As a **Pit Boss**, I need to move a player to a different table/seat without losing their session data so that their accumulated play time, buy-ins, and loyalty progress remain visible.

2. As a **Pit Boss**, I need to see a single "session slip" view for a player's visit so that I don't have to mentally stitch together multiple segments.

3. As a **Floor Supervisor**, I need to view a player's total session duration across all table moves so that I can accurately assess their play time for comps.

4. As the **Pit Dashboard**, I need to query a Visit Live View that aggregates all segments so that I display stable session data regardless of moves.

5. As **MTLService**, I need visit-scoped financial totals so that threshold calculations accumulate correctly across segments.

## 4. Scope & Feature List

**P0 (Must-Have)**
- Add `previous_slip_id` FK column to `rating_slip` (segment chain)
- Add `move_group_id` column to `rating_slip` (segment chain identifier, NOT session key)
- Add `accumulated_seconds` column to `rating_slip` (duration continuity)
- Add `final_duration_seconds` column to `rating_slip` (computed on close, authoritative)
- Enforce `visit_id` NOT NULL + FK on `player_financial_transaction`
- Enforce max 1 open/paused slip per visit (partial unique index)
- Enhance move endpoint to populate continuity metadata
- Create `rpc_get_visit_live_view(visit_id)` RPC returning session aggregate
- Create `compute_slip_final_seconds(slip_id)` function (authoritative duration)

**P1 (Should-Have)**
- Index on `move_group_id` for efficient chain traversal
- Index on `previous_slip_id` for chain traversal

## 5. Requirements

### 5.1 Session Identity (CRITICAL)

**Canonical operator session key = `visit_id`**

Everything session-scoped is anchored to `visit_id`:
- Financial transactions (`player_financial_transaction.visit_id`)
- Loyalty accrual
- MTL threshold progress
- Duration totals

**`move_group_id` is NOT the session key.** It is segment-chain metadata useful for:
- Traversing the slip chain
- Presentation (grouping segments in UI)
- Audit trail

Do NOT use `move_group_id` as a session identifier. If cross-visit continuations are needed later (e.g., "continue yesterday's session"), that's `visit_group_id` in a future PRD.

### 5.2 Slip Chaining (Schema)

```sql
-- New columns on rating_slip
previous_slip_id      UUID NULL REFERENCES rating_slip(id)
move_group_id         UUID NULL  -- First segment: self-ref; moves: carry forward
accumulated_seconds   INT NOT NULL DEFAULT 0  -- Prior segments total
final_duration_seconds INT NULL  -- Set on close, authoritative
```

**Invariant: Max 1 open/paused slip per visit**

```sql
CREATE UNIQUE INDEX idx_rating_slip_one_active_per_visit
ON rating_slip (visit_id)
WHERE status IN ('open', 'paused');
```

This prevents race conditions where two pit bosses create overlapping slips.

### 5.3 Duration Calculation (Authoritative)

**Single source of truth: `compute_slip_final_seconds(slip_id)`**

```sql
CREATE OR REPLACE FUNCTION compute_slip_final_seconds(p_slip_id uuid)
RETURNS int AS $$
DECLARE
  v_slip rating_slip%ROWTYPE;
  v_pause_total int;
  v_raw_seconds int;
BEGIN
  SELECT * INTO v_slip FROM rating_slip WHERE id = p_slip_id;

  IF v_slip.end_time IS NULL THEN
    RETURN NULL;  -- Still open, no final duration
  END IF;

  -- Raw duration
  v_raw_seconds := EXTRACT(EPOCH FROM (v_slip.end_time - v_slip.start_time))::int;

  -- Sum all pause intervals (auto-close any open pause)
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(ended_at, v_slip.end_time) - started_at))::int
  ), 0)
  INTO v_pause_total
  FROM rating_slip_pause
  WHERE rating_slip_id = p_slip_id;

  RETURN GREATEST(v_raw_seconds - v_pause_total, 0);
END;
$$ LANGUAGE plpgsql STABLE;
```

**Edge cases handled:**
- Paused → moved: open pause auto-closed at slip end_time
- Paused → closed: same behavior
- Multiple pauses: all summed
- Missing pause end_time: treated as slip end_time (fail-safe)

**On slip close:**
```sql
UPDATE rating_slip
SET final_duration_seconds = compute_slip_final_seconds(id)
WHERE id = p_slip_id;
```

### 5.4 Move Endpoint Enhancement

When creating a new slip during move operation:

```
new.previous_slip_id = old.id
new.move_group_id = old.move_group_id ?? old.id
new.accumulated_seconds = old.accumulated_seconds + old.final_duration_seconds
```

**Locking strategy:**
1. Lock the visit row (`SELECT ... FOR UPDATE` on `visit`)
2. Close current slip (sets `final_duration_seconds`)
3. Create new slip with continuity metadata
4. Commit transaction

This prevents:
- Two simultaneous moves on same visit
- Race to create overlapping slips
- Lost duration data

### 5.5 Financial Transaction Anchoring

**Invariant: All financial transactions require an open visit**

```sql
-- Migration
ALTER TABLE player_financial_transaction
  ALTER COLUMN visit_id SET NOT NULL;

ALTER TABLE player_financial_transaction
  ADD CONSTRAINT player_financial_transaction_visit_id_fk
  FOREIGN KEY (visit_id) REFERENCES visit(id);
```

**Application enforcement:**
- Creating a financial txn requires `visit_id` parameter
- Service validates visit exists and is open before insert
- Reject txn creation if visit is closed

**Diagnostic query (run before enforcing NOT NULL):**
```sql
SELECT COUNT(*) as orphan_count
FROM player_financial_transaction
WHERE visit_id IS NULL;
```

### 5.6 Visit Live View RPC (Contract)

```sql
CREATE OR REPLACE FUNCTION rpc_get_visit_live_view(
  p_visit_id uuid,
  p_include_segments boolean DEFAULT false,
  p_segments_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- CRITICAL: Uses caller's RLS context
AS $$ ... $$;
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `p_visit_id` | uuid | required | Visit to query |
| `p_include_segments` | boolean | `false` | Include segment history array |
| `p_segments_limit` | int | `10` | Max segments returned |

**Response shape:**
```typescript
interface VisitLiveView {
  visit_id: string;
  player_id: string;
  player_name: string;
  visit_status: 'open' | 'closed';
  started_at: string;  // ISO timestamp

  // NULL if no active segment (visit open but slip closed, or visit closed)
  current_segment: {
    slip_id: string;
    table_id: string;
    table_name: string;
    seat_number: number;  // INT in schema
    status: 'open' | 'paused';
    segment_started_at: string;
    average_bet: number | null;
  } | null;

  session_totals: {
    total_duration_seconds: number;  // accumulated + current elapsed
    total_buy_in: number;
    total_cash_out: number;
    net: number;
    points_earned: number;
    segment_count: number;
  };

  // Only present if p_include_segments = true
  segments?: Array<{
    slip_id: string;
    table_name: string;
    seat_number: number;
    duration_seconds: number | null;  // NULL if active
    status: 'open' | 'paused' | 'closed';
    started_at: string;
  }>;
}
```

**Segment ordering:** `started_at DESC, slip_id DESC` (most recent first)

**Null semantics:**
- `current_segment: null` when visit has no open/paused slip
- `segments` key absent when `p_include_segments = false`
- `duration_seconds: null` for active segment (calculate client-side from `started_at`)

### 5.7 RLS & Security Requirements

**SECURITY INVOKER (mandatory)**

All RPCs in this PRD use `SECURITY INVOKER`:
- `rpc_get_visit_live_view`
- `compute_slip_final_seconds`

No `SECURITY DEFINER` unless explicitly documented with justification.

**RLS context requirements:**

RPC execution requires `set_rls_context(casino_id, actor_id)` called before invocation. Under Supavisor pooling:
- Context set via `rpc_set_casino_context` (per ADR-015)
- Verified by checking `current_setting('app.casino_id', true)`

**Negative test requirement:**

```sql
-- Must fail: cross-casino access
SET app.casino_id = 'casino-A';
SELECT rpc_get_visit_live_view('visit-from-casino-B');
-- Expected: empty result or RLS violation
```

### 5.8 Non-Functional Requirements

- RPC p95 latency < 200ms
- Migration backward compatible (new columns nullable or have defaults)
- No breaking changes to existing move endpoint request contract

## 6. UX / Flow Overview

**Move Flow (Enhanced)**
```
1. Pit Boss initiates move: POST /api/v1/rating-slips/{id}/move
2. System locks visit row (FOR UPDATE)
3. System closes current slip:
   - Sets end_time
   - Computes final_duration_seconds via compute_slip_final_seconds()
4. System creates new slip at destination with:
   - previous_slip_id = old.id
   - move_group_id = old.move_group_id ?? old.id
   - accumulated_seconds = old.accumulated_seconds + old.final_duration_seconds
5. UI refreshes via rpc_get_visit_live_view(visit_id)
6. Operator sees same session totals, new position
```

**What changes for the operator:**
- Totals (buy-in, cash-out, points, duration) remain unchanged after move
- Only current position changes (table/seat)
- Segment history shows the move trail

**Session View (New Mental Model)**
```
┌─────────────────────────────────────────────────────┐
│ Visit Live View (keyed by visit_id)                 │
├─────────────────────────────────────────────────────┤
│ Player: John Smith                                  │
│ Current Position: BJ-05 Seat 3                      │
│ Status: Playing                                     │
├─────────────────────────────────────────────────────┤
│ Session Totals:                                     │
│   Duration: 2h 15m (across 3 tables)                │
│   Buy-In: $500  |  Cash-Out: $200  |  Net: -$300    │
│   Points: 150                                       │
├─────────────────────────────────────────────────────┤
│ Segment History (optional):                         │
│   1. BJ-01 Seat 5 | 30min | Closed                  │
│   2. BJ-03 Seat 2 | 40min | Closed                  │
│   3. BJ-05 Seat 3 | 1h 5min | Active                │
└─────────────────────────────────────────────────────┘
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| rating_slip table | EXISTS | Adding 4 columns |
| player_financial_transaction table | EXISTS | Adding NOT NULL + FK |
| Move endpoint | EXISTS | `POST /api/v1/rating-slips/[id]/move` |
| VisitService | COMPLETE | visit_id anchor |
| PlayerFinancialService | COMPLETE | Financial ledger queries |
| ADR-015 RLS context | COMPLETE | `set_rls_context` pattern |

### 7.2 Rollout Sequence (Pre-Decided)

1. **Phase 1: Migration** - Add columns, unique index, visit_id NOT NULL + FK, re-seed
2. **Phase 2: Duration function** - Deploy `compute_slip_final_seconds`
3. **Phase 3: Move endpoint** - Populate continuity metadata, use locking
4. **Phase 4: RPC** - Deploy `rpc_get_visit_live_view`
5. **Phase 5: UI** - Switch Pit Dashboard to Visit Live View (separate PRD)

### 7.3 Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing code creates txns without visit_id | Run diagnostic query; fix write paths before migration |
| Two pit bosses move same player simultaneously | Partial unique index + visit row locking prevents race |
| RPC performance with many segments | Default `p_include_segments=false`; limit to 10 |
| RLS bypass under pooling | SECURITY INVOKER + negative cross-casino test |
| Pause edge cases corrupt duration | `compute_slip_final_seconds` handles all edge cases with tests |

**Resolved Questions:**
- ✅ Session identity: `visit_id` is canonical (not `move_group_id`)
- ✅ visit_id on player_financial_transaction: Will be NOT NULL + FK
- ✅ Rollout order: RPC first, then UI
- ✅ Data backfill: Not needed (dev environment)
- ✅ Concurrency: Partial unique index + visit row locking

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Move operation populates `previous_slip_id`, `move_group_id`, `accumulated_seconds`
- [ ] `move_group_id` is self-referential on first segment, carried forward on moves
- [ ] `final_duration_seconds` computed and stored on slip close
- [ ] `rpc_get_visit_live_view` returns complete session aggregate
- [ ] Financial transactions require `visit_id` (NOT NULL + FK enforced)

**Data & Integrity**
- [ ] Slip chain traversable via `previous_slip_id`
- [ ] Max 1 open/paused slip per visit (unique index enforced)
- [ ] Duration calculation correct via `compute_slip_final_seconds`
- [ ] No orphaned financial transactions (all have valid visit_id FK)

**Security & Access**
- [ ] RPC uses SECURITY INVOKER (verified in migration)
- [ ] RPC respects RLS under Supavisor pooling with `set_rls_context`
- [ ] Negative test: cross-casino visit query returns empty/fails
- [ ] visit_id FK constraint prevents invalid references

**Concurrency**
- [ ] Partial unique index prevents duplicate open slips per visit
- [ ] Move endpoint locks visit row during transaction
- [ ] Concurrent move attempts handled gracefully (409 or retry)

**Testing**
- [ ] Unit test: `compute_slip_final_seconds` handles pause edge cases
  - [ ] paused → moved (open pause auto-closed)
  - [ ] paused → closed
  - [ ] multiple pauses
  - [ ] missing pause end_time
- [ ] Unit test: move populates continuity fields correctly
- [ ] Integration test: multi-move session preserves chain and totals
- [ ] Integration test: rpc_get_visit_live_view returns correct aggregate
- [ ] Integration test: rpc_get_visit_live_view respects RLS (cross-casino blocked)

**Acceptance Criteria (Operator Experience)**
- [ ] **After move, operator totals remain unchanged** (buy-in, cash-out, points, duration) — only current position changes
- [ ] UI consumers query `rpc_get_visit_live_view`, NOT slip tables directly for totals
- [ ] "Data loss on move" perception eliminated

**Documentation**
- [ ] RPC contract documented (params, response shape, null semantics)
- [ ] `compute_slip_final_seconds` behavior documented
- [ ] Move endpoint locking strategy documented
- [ ] Session identity clarification: visit_id is canonical

## 9. Related Documents

- **Proposal:** `docs/issues/PT2_RatingSlip_Continuity_Fix_No_Rewrite.md`
- **Rating Slip Service:** `docs/10-prd/PRD-002-rating-slip-service.md`
- **SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.4.0
- **Visit Service:** `docs/10-prd/PRD-003-player-visit-management.md`
- **Financial Service:** `docs/10-prd/PRD-009-player-financial-service.md`
- **Pit Dashboard:** `docs/10-prd/PRD-006-pit-dashboard.md`
- **RLS Context:** `docs/80-adrs/ADR-015-rls-context-injection.md`
- **Schema:** `types/database.types.ts`

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-12-22 | Lead Architect | Tightened contracts: session identity (visit_id canonical), RPC pagination/null semantics, compute_slip_final_seconds, concurrency invariants (partial unique index + visit locking), RLS/SECURITY INVOKER requirements, acceptance criteria |
| 1.0 | 2025-12-22 | Lead Architect | Initial draft based on continuity fix proposal |

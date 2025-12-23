# Rating Slip Lifecycle Guide

> **Post PRD-016 Implementation** | Last Updated: 2025-12-22

This guide documents the rating slip lifecycle, state machine, and session continuity features implemented in PRD-016.

## Core Concepts

### Session Identity

The canonical session key is **`visit_id`**, not the rating slip itself.

| Concept | Description |
|---------|-------------|
| **Rating Slip** | Immutable telemetry segment capturing "what happened where" |
| **Visit** | Session anchor for all financial, loyalty, and compliance data |
| **Move Group** | Chain identifier linking related slips (NOT the session key) |

Rating slips are **immutable records**. When a player moves tables, we create a new slip rather than mutating the existing one. The visit anchors all session-scoped data.

### Key Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Max 1 open/paused slip per visit | Partial unique index: `(visit_id) WHERE status IN ('open','paused')` |
| Financial transactions require visit | `player_financial_transaction.visit_id NOT NULL` + FK |
| Immutable slip location | `table_id`/`seat_number` never mutated; moves create new slips |
| Duration excludes pauses | `compute_slip_final_seconds()` subtracts pause intervals |
| RLS scoped to casino | `SECURITY INVOKER` + `set_rls_context()` on all RPCs |

---

## State Machine

```
┌─────────┐     pause()     ┌─────────┐
│  OPEN   │ ◄─────────────► │ PAUSED  │
└────┬────┘     resume()    └────┬────┘
     │                           │
     │     close()               │  close()
     └───────────┬───────────────┘
                 ▼
           ┌──────────┐
           │  CLOSED  │  (terminal)
           └──────────┘
```

### State Transitions

| From | To | Operation | Notes |
|------|-----|-----------|-------|
| (none) | OPEN | `start()` | Creates slip at table/seat |
| OPEN | PAUSED | `pause()` | Creates `rating_slip_pause` record |
| PAUSED | OPEN | `resume()` | Closes pause record |
| OPEN | CLOSED | `close()` | Terminal state, computes final duration |
| PAUSED | CLOSED | `close()` | Auto-closes any open pause |
| OPEN | CLOSED → OPEN | `move()` | Closes current, creates new with continuity |
| PAUSED | CLOSED → OPEN | `move()` | Same as above |

---

## Service Operations

### RatingSlipService Interface

```typescript
interface RatingSlipServiceInterface {
  // State machine operations
  start(casinoId, actorId, input): Promise<RatingSlipDTO>;
  pause(casinoId, actorId, slipId): Promise<RatingSlipDTO>;
  resume(casinoId, actorId, slipId): Promise<RatingSlipDTO>;
  close(casinoId, actorId, slipId, input?): Promise<RatingSlipWithDurationDTO>;

  // Move with continuity (PRD-016)
  move(casinoId, actorId, slipId, input): Promise<MoveRatingSlipResult>;

  // Session view (PRD-016)
  getVisitLiveView(casinoId, visitId, options?): Promise<VisitLiveViewDTO | null>;

  // Queries
  getById(slipId): Promise<RatingSlipWithPausesDTO>;
  listForTable(tableId, filters?): Promise<{ items, cursor }>;
  listForVisit(visitId): Promise<RatingSlipDTO[]>;
  getActiveForTable(tableId): Promise<RatingSlipDTO[]>;
  getDuration(slipId, asOf?): Promise<number>;
}
```

### Operation Details

| Operation | RPC | What Happens |
|-----------|-----|--------------|
| `start()` | `rpc_start_rating_slip` | Creates slip at table/seat, enforces max 1 open slip per visit |
| `pause()` | `rpc_pause_rating_slip` | Creates `rating_slip_pause` record, pauses duration accrual |
| `resume()` | `rpc_resume_rating_slip` | Closes pause record, resumes duration accrual |
| `close()` | `rpc_close_rating_slip` | Sets `end_time`, computes `final_duration_seconds` |
| `move()` | Transactional | Closes current → creates new with continuity metadata |

---

## PRD-016: Session Continuity

### Problem Solved

Before PRD-016, moving a player appeared to "reset" their session:
- Buy-ins/cash-outs seemed to disappear
- Duration tracking restarted from zero
- MTL threshold progress didn't accumulate
- Operators perceived "data loss"

### Solution: Slip Chaining

New columns on `rating_slip`:

```sql
previous_slip_id       UUID NULL     -- Links to prior segment
move_group_id          UUID NULL     -- Chain identifier (first slip's ID)
accumulated_seconds    INT DEFAULT 0 -- Prior segments' total play time
final_duration_seconds INT NULL      -- Authoritative duration (set on close)
```

### Move Operation Flow

```
1. Pit Boss: POST /api/v1/rating-slips/{id}/move
   Body: { destinationTableId, destinationSeatNumber? }

2. System locks visit row (SELECT ... FOR UPDATE)
   - Prevents race conditions with concurrent moves

3. Close current slip:
   - Sets end_time = NOW()
   - Computes final_duration_seconds via compute_slip_final_seconds()
   - Status → 'closed'

4. Create new slip at destination:
   - previous_slip_id = old.id
   - move_group_id = old.move_group_id ?? old.id  (self-ref on first move)
   - accumulated_seconds = old.accumulated_seconds + old.final_duration_seconds
   - Copies game_settings from old slip

5. Return MoveRatingSlipResult:
   {
     closed_slip: RatingSlipWithDurationDTO,
     new_slip: RatingSlipDTO
   }
```

### Duration Calculation

**Authoritative function**: `compute_slip_final_seconds(slip_id)`

```sql
final_duration = (end_time - start_time) - sum(pause_intervals)
```

**Edge cases handled**:

| Scenario | Behavior |
|----------|----------|
| Open pause at close | Auto-closed at `end_time` |
| Multiple pauses | All intervals summed |
| Missing `pause.ended_at` | Uses `slip.end_time` as fallback |
| Negative result | Returns 0 (GREATEST protection) |

---

## Visit Live View API

### Endpoint

```
GET /api/v1/visits/{visitId}/live-view
    ?include_segments=true
    &segments_limit=10
```

### Response Shape

```typescript
interface VisitLiveViewDTO {
  // Visit info
  visit_id: string;
  player_id: string;
  player_first_name: string;
  player_last_name: string;
  visit_status: 'open' | 'closed';
  started_at: string;  // ISO timestamp

  // Current position (null if no active slip)
  current_segment_slip_id: string | null;
  current_segment_table_id: string | null;
  current_segment_table_name: string | null;
  current_segment_seat_number: string | null;
  current_segment_status: 'open' | 'paused' | null;
  current_segment_started_at: string | null;
  current_segment_average_bet: number | null;

  // Session totals (aggregated across ALL slips)
  session_total_duration_seconds: number;  // accumulated + current elapsed
  session_total_buy_in: number;
  session_total_cash_out: number;
  session_net: number;
  session_points_earned: number;
  session_segment_count: number;

  // Optional segment history (when include_segments=true)
  segments?: Array<{
    slip_id: string;
    table_id: string;
    table_name: string;
    seat_number: string | null;
    status: string;
    start_time: string;
    end_time: string | null;
    final_duration_seconds: number | null;
    average_bet: number | null;
  }>;
}
```

### Null Semantics

| Field | Null When |
|-------|-----------|
| `current_segment_*` | Visit has no open/paused slip |
| `segments` | `include_segments=false` (key absent) |
| `final_duration_seconds` | Segment is still active |

---

## Operator Experience

### Session View (Mental Model)

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
│ Segment History:                                    │
│   1. BJ-01 Seat 5 | 30min | Closed                  │
│   2. BJ-03 Seat 2 | 40min | Closed                  │
│   3. BJ-05 Seat 3 | 1h 5min | Active                │
└─────────────────────────────────────────────────────┘
```

### What Changes After a Move

| Aspect | Behavior |
|--------|----------|
| Session totals | **Unchanged** (buy-in, cash-out, points, duration persist) |
| Current position | **Updates** to new table/seat |
| Segment history | **Grows** with new entry |
| Slip chain | **Linked** via `previous_slip_id` |

---

## Database Schema

### rating_slip Table (Relevant Columns)

```sql
CREATE TABLE rating_slip (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id              UUID NOT NULL REFERENCES casino(id),
  visit_id               UUID NOT NULL REFERENCES visit(id),
  table_id               UUID NOT NULL REFERENCES gaming_table(id),
  seat_number            TEXT,
  start_time             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time               TIMESTAMPTZ,
  status                 rating_slip_status NOT NULL DEFAULT 'open',
  average_bet            NUMERIC(12,2),
  game_settings          JSONB,

  -- PRD-016 Continuity Fields
  previous_slip_id       UUID REFERENCES rating_slip(id),
  move_group_id          UUID,
  accumulated_seconds    INT NOT NULL DEFAULT 0,
  final_duration_seconds INT,

  -- Constraints
  CONSTRAINT one_active_per_visit UNIQUE (visit_id)
    WHERE status IN ('open', 'paused')
);

-- Indexes for chain traversal
CREATE INDEX idx_rating_slip_move_group ON rating_slip(move_group_id);
CREATE INDEX idx_rating_slip_previous ON rating_slip(previous_slip_id);
```

### Key Functions

```sql
-- Authoritative duration calculation
compute_slip_final_seconds(p_slip_id uuid) RETURNS int

-- Session aggregate view
rpc_get_visit_live_view(
  p_visit_id uuid,
  p_include_segments boolean DEFAULT false,
  p_segments_limit int DEFAULT 10,
  p_casino_id uuid  -- For RLS self-injection (ADR-015)
) RETURNS jsonb
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/10-prd/PRD-016-rating-slip-continuity.md` | Full PRD with requirements |
| `docs/10-prd/PRD-002-rating-slip-service.md` | Original rating slip service PRD |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Service boundaries |
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | RLS context injection pattern |
| `services/rating-slip/index.ts` | Service implementation |
| `services/rating-slip/crud.ts` | CRUD operations including move() |

---

## Common Patterns

### Starting a New Session

```typescript
// 1. Create or get active visit
const visit = await visitService.startVisit(casinoId, actorId, { player_id });

// 2. Start rating slip at table
const slip = await ratingSlipService.start(casinoId, actorId, {
  visit_id: visit.id,
  table_id: tableId,
  seat_number: '3',
  game_settings: { game_type: 'blackjack', table_min: 25 }
});
```

### Moving a Player

```typescript
// Close current slip and create new one at destination
const result = await ratingSlipService.move(casinoId, actorId, currentSlipId, {
  new_table_id: destinationTableId,
  new_seat_number: '5',
  game_settings: currentSlip.game_settings  // Carry forward
});

// result.closed_slip - The slip that was closed
// result.new_slip - The new slip at destination with continuity metadata
```

### Getting Session Totals

```typescript
// Query aggregated session data
const liveView = await ratingSlipService.getVisitLiveView(
  casinoId,
  visitId,
  { includeSegments: true, segmentsLimit: 20 }
);

// liveView.session_total_duration_seconds - Total play time
// liveView.session_total_buy_in - Sum of all buy-ins
// liveView.session_segment_count - Number of table moves + 1
```

### Closing a Session

```typescript
// 1. Close the current rating slip
const closedSlip = await ratingSlipService.close(casinoId, actorId, slipId, {
  average_bet: calculatedAverageBet
});

// 2. Close the visit
await visitService.closeVisit(casinoId, actorId, visitId);
```

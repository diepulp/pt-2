# FINDINGS: Rating Slip Pause Migration Analysis

---
date: 2025-11-28
status: Complete
analyst: Claude (backend-service-builder skill)
spec_ref: SPEC-PRD-002
prd_ref: PRD-002
---

## Executive Summary

The `rating_slip_pause` table migration is **required and correctly specified**. The existing client-side state machine (`services/rating-slip/state-machine.ts`) is **not misleading**—it correctly models the domain logic. However, it operates entirely in-memory and the current database schema lacks the necessary persistence layer for pause intervals.

**Bottom Line**: Without `rating_slip_pause`, server-derived duration calculation is impossible, violating PRD-002 §5.1.

---

## 1. Current Database Schema Analysis

### 1.1 `rating_slip` Table (from `types/database.types.ts:1254-1327`)

```typescript
rating_slip: {
  Row: {
    average_bet: number | null
    casino_id: string
    end_time: string | null        // ← Only captures final end
    game_settings: Json | null
    id: string
    player_id: string
    policy_snapshot: Json | null
    seat_number: string | null
    start_time: string             // ← Only captures initial start
    status: "open" | "paused" | "closed" | "archived"
    table_id: string | null
    visit_id: string | null
  }
}
```

### 1.2 `rating_slip_status` Enum (from `types/database.types.ts:2066`)

```typescript
rating_slip_status: "open" | "paused" | "closed" | "archived"
```

### 1.3 Key Observation: No Pause Tracking

| What Exists | What's Missing |
|-------------|----------------|
| `start_time` (when slip opened) | Pause start timestamps |
| `end_time` (when slip closed) | Pause end timestamps |
| `status` enum includes 'paused' | Historical pause interval records |
| — | Count of pause/resume cycles |

**Grep confirmation** - no pause-related tables exist:
```
$ grep -n "pause" types/database.types.ts
2066:      rating_slip_status: "open" | "paused" | "closed" | "archived"
```

Only reference to "pause" is in the status enum. No `rating_slip_pause` table, no `paused_at` column, nothing.

---

## 2. Client-Side State Machine Analysis

### 2.1 Implementation Review (`services/rating-slip/state-machine.ts`)

The state machine defines:

```typescript
// Core data structure (IN-MEMORY ONLY)
export interface PauseInterval {
  start: Date;
  end?: Date;
}

export interface RatingSlipTimeline {
  startTime: Date;
  endTime?: Date;
  status: RatingSlipStatus;
  pauses: PauseInterval[];  // ← THIS IS THE CRITICAL FIELD
}
```

### 2.2 State Transitions

```
┌──────────┐     pauseSlip()      ┌──────────┐
│   open   │ ──────────────────►  │  paused  │
└──────────┘                      └──────────┘
     ▲                                  │
     │         resumeSlip()             │
     └──────────────────────────────────┘
     │                                  │
     │         closeSlip()              │
     ▼                                  ▼
┌──────────────────────────────────────────┐
│                 closed                    │
└──────────────────────────────────────────┘
```

### 2.3 Duration Calculation Logic

From `state-machine.ts:146-175`:

```typescript
export function calculateDurationSeconds(
  timeline: RatingSlipTimeline,
  asOf = new Date(),
): number {
  const effectiveEnd =
    timeline.status === 'closed' && timeline.endTime ? timeline.endTime : asOf;

  const totalElapsedMs = effectiveEnd.getTime() - timeline.startTime.getTime();

  // CRITICAL: Subtracts ALL pause intervals
  const pausedMs = timeline.pauses.reduce((sum, pause) => {
    const pauseEnd = normalizePauseEnd(pause, timeline, asOf);
    const cappedEnd = Math.min(pauseEnd.getTime(), effectiveEnd.getTime());
    if (cappedEnd <= pause.start.getTime()) {
      return sum;
    }
    return sum + (cappedEnd - pause.start.getTime());
  }, 0);

  const activeMs = Math.max(0, totalElapsedMs - pausedMs);
  return Math.floor(activeMs / 1000);
}
```

**Formula**: `duration = (end_time - start_time) - SUM(pause_intervals)`

### 2.4 Test Evidence (`services/rating-slip/state-machine.test.ts`)

```typescript
it('stops accruing time while paused and resumes afterwards', () => {
  const opened = startSlip(new Date('2025-05-05T10:00:00Z'));
  const paused = pauseSlip(opened, new Date('2025-05-05T10:10:00Z'));
  const resumed = resumeSlip(paused, new Date('2025-05-05T10:20:00Z'));
  const closed = closeSlip(resumed, new Date('2025-05-05T10:40:00Z'));

  // 40 min total - 10 min paused = 30 min active
  expect(calculateDurationSeconds(closed)).toBe(30 * 60);
});
```

---

## 3. The Gap: Why `rating_slip_pause` is Required

### 3.1 PRD-002 Requirements

From `PRD-002-table-rating-core.md`:

> **§2.2 Goals**: "Session duration is server-derived and accurate (no client clock dependency)"
>
> **§4 (Rating Slip Operations)**: "Pause slip (records pause timestamp)"
>
> **§5.1 Functional Requirements**: "Duration calculation excludes paused intervals (server-derived)"

### 3.2 The Fundamental Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                    ┌─────────────────────┐         │
│  │   Browser Client    │                    │      Database       │         │
│  │                     │                    │                     │         │
│  │  RatingSlipTimeline │   status only      │   rating_slip       │         │
│  │  ├─ startTime       │ ───────────────►   │   ├─ start_time     │         │
│  │  ├─ endTime         │                    │   ├─ end_time       │         │
│  │  ├─ status          │                    │   ├─ status         │         │
│  │  └─ pauses[] ◄──────┼── NOT PERSISTED    │   └─ (no pauses!)   │         │
│  │      ├─ start       │                    │                     │         │
│  │      └─ end         │                    │                     │         │
│  └─────────────────────┘                    └─────────────────────┘         │
│                                                                              │
│  PROBLEM: If browser refreshes, pauses[] is LOST                            │
│  PROBLEM: Server cannot calculate duration without pause history            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Scenario: Data Loss Without Pause Table

**Timeline**:
1. 10:00 - Pit Boss starts rating slip (persisted: `start_time=10:00`)
2. 10:10 - Pit Boss pauses slip (persisted: `status='paused'`)
3. 10:15 - Browser refresh or network reconnect
4. 10:20 - Pit Boss resumes slip (persisted: `status='open'`)
5. 10:40 - Pit Boss closes slip (persisted: `end_time=10:40`)

**Expected Duration**: 30 minutes (40 total - 10 paused)
**Actual Duration Without Pause Table**: 40 minutes (no record of the pause)

### 3.4 Why Can't We Just Add Columns to `rating_slip`?

**Option Considered**: Add `paused_at` and `resumed_at` columns to `rating_slip`

**Why It Fails**:
- A player might pause/resume **multiple times** in a single session
- Single columns can't track: pause₁, resume₁, pause₂, resume₂, pause₃, resume₃...
- Would require `paused_at_1`, `paused_at_2`, `paused_at_3`... (unbounded)

**Correct Solution**: Normalize into a separate `rating_slip_pause` table with one row per pause interval.

---

## 4. State Machine Assessment

### 4.1 Is the Existing State Machine "Misleading"?

**No.** The state machine is **correctly implemented** for its purpose:

| Aspect | Assessment |
|--------|------------|
| State transitions | Correct: `open ↔ paused → closed` |
| Duration calculation | Correct: subtracts all pause intervals |
| Test coverage | Adequate: covers pause/resume cycles |
| Immutability | Good: returns new objects, doesn't mutate |
| Error handling | Good: throws on invalid transitions |

### 4.2 What the State Machine IS

- A **pure functional implementation** of rating slip domain logic
- Useful for **client-side real-time duration display**
- A **reference implementation** for server-side RPCs

### 4.3 What the State Machine IS NOT

- **Not a persistence layer** - operates entirely in memory
- **Not server-authoritative** - no database integration
- **Not sufficient alone** - needs server-side complement

### 4.4 Intended Usage Pattern

```typescript
// CLIENT-SIDE: Use state machine for UI updates
const timeline = startSlip(new Date());
// ... user actions update timeline in memory
const duration = calculateDurationSeconds(timeline);
displayDuration(duration);

// SERVER-SIDE: RPCs persist state changes + intervals
// When user clicks "Pause":
await supabase.rpc('rpc_pause_rating_slip', { ... });
// This persists to rating_slip + rating_slip_pause tables
```

---

## 5. Solution: `rating_slip_pause` Table

### 5.1 Schema Design (from SPEC-PRD-002)

```sql
CREATE TABLE public.rating_slip_pause (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_slip_id UUID NOT NULL REFERENCES rating_slip(id) ON DELETE CASCADE,
  casino_id UUID NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  CONSTRAINT valid_pause_interval CHECK (ended_at IS NULL OR ended_at > started_at)
);
```

### 5.2 How It Works

| Action | What Happens |
|--------|--------------|
| **Start Slip** | Insert into `rating_slip` with `status='open'` |
| **Pause Slip** | Update `rating_slip.status='paused'` + Insert into `rating_slip_pause(started_at=now())` |
| **Resume Slip** | Update `rating_slip.status='open'` + Update `rating_slip_pause SET ended_at=now()` |
| **Close Slip** | Update `rating_slip.status='closed', end_time=now()` + Close any open pause |

### 5.3 Server-Side Duration Calculation

```sql
-- rpc_get_rating_slip_duration
SELECT GREATEST(0,
  FLOOR((
    EXTRACT(EPOCH FROM (COALESCE(end_time, now()) - start_time)) * 1000
    - COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) * 1000)
        FROM rating_slip_pause
        WHERE rating_slip_id = $1
      ), 0)
  ) / 1000)
)::INTEGER AS duration_seconds;
```

### 5.4 Benefits

1. **Server-authoritative**: No client clock dependency
2. **Auditable**: Complete history of pause/resume events
3. **Resumable**: Browser refresh doesn't lose pause state
4. **Multi-pause support**: Handles unlimited pause/resume cycles
5. **RLS-compatible**: `casino_id` enables row-level security

---

## 6. Conclusions

### 6.1 Summary of Findings

| Finding | Status |
|---------|--------|
| `rating_slip_pause` migration is necessary | **CONFIRMED** |
| Current state machine is misleading | **FALSE** - it's correct but client-side only |
| Database schema has a gap | **CONFIRMED** - no pause interval storage |
| PRD-002 requires server-derived duration | **CONFIRMED** - §2.2, §5.1 |

### 6.2 Recommendations

1. **Proceed with `rating_slip_pause` migration** as specified in SPEC-PRD-002
2. **Keep existing state machine** - it's valuable for client-side logic
3. **Create server-side RPCs** that mirror state machine transitions
4. **Use state machine as test oracle** - server RPCs should produce same results

### 6.3 Risk Assessment

| Risk | Mitigation |
|------|------------|
| Pause table adds query complexity | Add index on `rating_slip_id` |
| RLS policy complexity | Follow existing patterns from `rating_slip` |
| Migration rollback needed | Migration is additive, no destructive changes |

---

## 7. References

- **PRD**: `docs/10-prd/PRD-002-table-rating-core.md`
- **SPEC**: `docs/20-architecture/specs/SPEC-PRD-002-table-rating-core.md`
- **State Machine**: `services/rating-slip/state-machine.ts`
- **State Machine Tests**: `services/rating-slip/state-machine.test.ts`
- **Database Types**: `types/database.types.ts:1254-1327`

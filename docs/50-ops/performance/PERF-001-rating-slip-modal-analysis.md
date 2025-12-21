# Performance Analysis: Rating Slip Modal Endpoint

**Document ID:** PERF-001
**Date:** 2025-12-20
**Author:** QA Specialist
**Classification:** Performance Engineering
**Priority:** HIGH (2.5s initial load time)

---

## Executive Summary

The rating slip modal endpoint (`GET /api/v1/rating-slips/[id]/modal-data`) exhibits a **2.5 second initial load time**, significantly exceeding the 500ms p95 target defined in QA-001. Root cause analysis reveals a **sequential waterfall of 11+ database calls** including a critical **N+1 query pattern** when fetching occupied seats for active tables.

### Key Findings

| Issue | Impact | Severity |
|-------|--------|----------|
| N+1 Query Pattern | +100-150ms per active table | **CRITICAL** |
| Sequential Query Waterfall | ~150ms × 11 calls = 1.65s baseline | **HIGH** |
| No Query Parallelization | Blocked on sequential awaits | **HIGH** |
| Missing BFF RPC | Forces app-layer aggregation | **MEDIUM** |

---

## Affected Endpoint

```
GET /api/v1/rating-slips/[id]/modal-data
```

**Location:** `app/api/v1/rating-slips/[id]/modal-data/route.ts`

**Purpose:** Aggregates data from 5 bounded contexts into single modal response:
- RatingSlipService (slip details + duration)
- VisitService (session anchor)
- PlayerService (identity)
- LoyaltyService (balance + suggestion)
- PlayerFinancialService (financial summary)
- TableContextService (tables + occupied seats)

---

## Performance Breakdown

### Current Query Waterfall (Sequential)

```
Timeline (estimated per query: 100-150ms avg with RLS)
──────────────────────────────────────────────────────────────────────────────
0ms      │ 1. ratingSlipService.getById(slipId)           [SELECT + JOIN pauses]
150ms    │ 2. visitService.getById(visitId)               [SELECT visit]
300ms    │ 3. tableContextService.getTable(tableId)       [SELECT gaming_table]
450ms    │ 4. ratingSlipService.getDuration(slipId)       [RPC: rpc_get_rating_slip_duration]
600ms    │ 5. playerService.getById(playerId)             [SELECT player]
750ms    │ 6. loyaltyService.getBalance(playerId)         [SELECT player_loyalty]
900ms    │ 7. loyaltyService.evaluateSuggestion(slipId)   [RPC: evaluate_session_reward_suggestion]
1050ms   │ 8. financialService.getVisitSummary(visitId)   [SELECT + aggregate]
1200ms   │ 9. tableContextService.getActiveTables(casino) [SELECT gaming_table + dealer_rotation]
         │
         │ ┌─── N+1 LOOP ───────────────────────────────────────────────────────┐
1350ms   │ │ 10a. ratingSlipService.getActiveForTable(table1)                   │
1500ms   │ │ 10b. ratingSlipService.getActiveForTable(table2)                   │
1650ms   │ │ 10c. ratingSlipService.getActiveForTable(table3)                   │
1800ms   │ │ ...                                                                 │
2400ms   │ │ 10n. ratingSlipService.getActiveForTable(tableN) [N = 8-10 tables] │
         │ └────────────────────────────────────────────────────────────────────┘
2500ms   │ Response returned
──────────────────────────────────────────────────────────────────────────────
```

### N+1 Query Problem (Lines 192-212)

```typescript
// PROBLEMATIC CODE: N+1 pattern
const tablesWithSeats = await Promise.all(
  activeTables.map(async (t) => {
    // This executes a SEPARATE query for EACH table!
    const activeSlips = await ratingSlipService.getActiveForTable(t.id);
    const occupiedSeats = activeSlips
      .filter((s) => s.seat_number)
      .map((s) => s.seat_number as string);
    // ...
  }),
);
```

**Impact:** With 10 active tables, this adds 10 additional database round trips.

---

## Root Cause Analysis

### 1. Sequential Await Pattern

All service calls use sequential `await`:
```typescript
const slipWithPauses = await ratingSlipService.getById(params.id);
// Must wait for slip before getting visit
const visit = await visitService.getById(slipWithPauses.visit_id);
// Must wait for visit before getting player
const player = await playerService.getById(visit.player_id);
```

**Some dependencies exist**, but several queries are parallelizable:
- Duration can be fetched in parallel with table/player/loyalty queries
- Financial summary can be fetched in parallel with loyalty queries

### 2. N+1 Query Anti-Pattern

The occupied seats query issues N+1 queries instead of a single bulk query:

```typescript
// CURRENT: N+1 (bad)
for each table:
  SELECT * FROM rating_slip WHERE table_id = ? AND status IN ('open', 'paused')

// OPTIMAL: Single query
SELECT table_id, seat_number
FROM rating_slip
WHERE table_id = ANY(?) AND status IN ('open', 'paused')
GROUP BY table_id, seat_number
```

### 3. No Database-Level Aggregation

The endpoint aggregates 5 bounded contexts at the application layer. A PostgreSQL function could aggregate in a single round trip:

```sql
-- Potential BFF RPC
CREATE FUNCTION rpc_get_rating_slip_modal_data(p_slip_id uuid)
RETURNS jsonb AS $$
  -- Single query returning:
  -- { slip, visit, player, loyalty, financial, tables }
$$
```

### 4. RLS Overhead Per Query

Each query incurs RLS policy evaluation. With SEC-004 optimizations applied, the overhead is minimized but still compounds across 15+ queries.

---

## Optimization Recommendations

### Priority 1: Eliminate N+1 Pattern (Est. -800ms)

**Add batch query for occupied seats:**

```typescript
// services/rating-slip/crud.ts - NEW FUNCTION
export async function getOccupiedSeatsByTables(
  supabase: SupabaseClient<Database>,
  tableIds: string[],
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('rating_slip')
    .select('table_id, seat_number')
    .in('table_id', tableIds)
    .in('status', ['open', 'paused'])
    .not('seat_number', 'is', null);

  // Group by table_id
  const result = new Map<string, string[]>();
  for (const row of data ?? []) {
    const seats = result.get(row.table_id) ?? [];
    seats.push(row.seat_number);
    result.set(row.table_id, seats);
  }
  return result;
}
```

**Update modal-data endpoint:**
```typescript
// Replace N+1 loop with single call
const activeTables = await tableContextService.getActiveTables(casinoId);
const tableIds = activeTables.map(t => t.id);
const occupiedSeatsMap = await ratingSlipService.getOccupiedSeatsByTables(tableIds);

const tablesWithSeats = activeTables.map(t => ({
  ...t,
  occupiedSeats: occupiedSeatsMap.get(t.id) ?? [],
}));
```

### Priority 2: Parallelize Independent Queries (Est. -400ms)

**Identify parallelizable queries:**

```typescript
// After getting slip and visit (sequential - required)
const [table, durationSeconds, player, financialSummary] = await Promise.all([
  tableContextService.getTable(slipWithPauses.table_id, casinoId),
  ratingSlipService.getDuration(params.id),
  visit.player_id ? playerService.getById(visit.player_id) : null,
  financialService.getVisitSummary(visit.id),
]);

// Loyalty queries depend on player existing
if (player) {
  const [balance, suggestion] = await Promise.all([
    loyaltyService.getBalance(visit.player_id!, casinoId),
    slipWithPauses.status === 'open'
      ? loyaltyService.evaluateSuggestion(params.id)
      : null,
  ]);
}
```

### Priority 3: Create BFF RPC (Est. -600ms additional)

**Long-term solution - single database round trip:**

```sql
CREATE OR REPLACE FUNCTION rpc_get_rating_slip_modal_data(
  p_slip_id uuid,
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'slip', (SELECT row_to_json(rs.*) FROM rating_slip rs WHERE id = p_slip_id),
    'visit', (SELECT row_to_json(v.*) FROM visit v WHERE id = rs.visit_id),
    'player', (SELECT row_to_json(p.*) FROM player p WHERE id = v.player_id),
    'loyalty', (SELECT row_to_json(pl.*) FROM player_loyalty pl WHERE ...),
    'financial', (SELECT ... aggregate ...),
    'tables', (SELECT json_agg(...) FROM gaming_table ...)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
```

### Priority 4: Add Database Indexes (if missing)

**Verify these indexes exist for modal-data queries:**

```sql
-- Rating slip by table + status (for occupied seats)
CREATE INDEX IF NOT EXISTS idx_rating_slip_table_status
  ON rating_slip (table_id, status)
  WHERE status IN ('open', 'paused');

-- Gaming table by casino + status (for active tables)
CREATE INDEX IF NOT EXISTS idx_gaming_table_casino_status
  ON gaming_table (casino_id, status)
  WHERE status = 'active';

-- Player loyalty composite (for balance lookup)
CREATE INDEX IF NOT EXISTS idx_player_loyalty_player_casino
  ON player_loyalty (player_id, casino_id);
```

---

## Expected Performance Improvement

| Optimization | Current | After | Improvement |
|--------------|---------|-------|-------------|
| Baseline (9 queries) | 1350ms | 600ms | -750ms (parallelization) |
| N+1 elimination | 800ms | 100ms | -700ms |
| **Total** | **2500ms** | **700ms** | **-1800ms (72%)** |

With BFF RPC (future):
| With BFF RPC | 700ms | 150ms | -550ms additional |

---

## Test Validation

### QA Route Tests Status

```
Test Suites: 9 passed, 9 total
Tests:       29 passed, 29 total

Rating Slip Route Coverage:
├── GET /rating-slips           ✓
├── POST /rating-slips          ✓
├── GET /rating-slips/[id]      ✓
├── POST /rating-slips/[id]/pause    ✓
├── POST /rating-slips/[id]/resume   ✓
├── POST /rating-slips/[id]/close    ✓
├── GET /rating-slips/[id]/duration  ✓
├── PATCH /rating-slips/[id]/average-bet ✓
├── GET /rating-slips/[id]/modal-data    ✓
└── POST /rating-slips/[id]/move    ✓
```

### HTTP Contract Tests Status

```
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Contracts Validated: 9/9
```

---

## Performance Test Recommendations

### Add Performance Benchmarks

```typescript
// __tests__/performance/modal-data.perf.test.ts
describe('modal-data performance', () => {
  it('should respond within 500ms p95', async () => {
    const times: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await fetch(`/api/v1/rating-slips/${testSlipId}/modal-data`);
      times.push(performance.now() - start);
    }

    const p95 = percentile(times, 95);
    expect(p95).toBeLessThan(500);
  });
});
```

### Add Query Timing Instrumentation

```typescript
// In modal-data route handler
const timings: Record<string, number> = {};

const startSlip = performance.now();
const slip = await ratingSlipService.getById(id);
timings.getSlip = performance.now() - startSlip;

// ... include in response headers for debugging
response.headers.set('X-Query-Timings', JSON.stringify(timings));
```

---

## Action Items for Performance Engineer

1. **Immediate** (P0): Implement `getOccupiedSeatsByTables` batch query
2. **Immediate** (P0): Refactor modal-data to use `Promise.all` for independent queries
3. **Short-term** (P1): Add performance benchmark tests
4. **Short-term** (P1): Verify/add missing database indexes
5. **Medium-term** (P2): Design and implement BFF RPC
6. **Ongoing**: Add query timing instrumentation for monitoring

---

## References

- `app/api/v1/rating-slips/[id]/modal-data/route.ts` - Endpoint implementation
- `services/rating-slip/crud.ts` - Rating slip CRUD operations
- `services/table-context/crud.ts` - Table context operations
- `docs/30-security/SEC-004-rls-performance-analysis.md` - RLS optimization patterns
- `docs/40-quality/QA-001-service-testing-strategy.md` - Performance targets

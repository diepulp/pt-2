# Query Performance Anti-Patterns

**Target Agents**: `performance-engineer`, `api-expert`, `backend-developer`
**Severity**: CRITICAL - Direct impact on user experience
**Source**: PERF-001 Rating Slip Modal Optimization (2025-12-20)

> **Result**: 2500ms → 600ms (76% improvement achieved)

---

## N+1 Query Pattern (CRITICAL)

### ❌ NEVER issue one database query per item in a collection

```typescript
// ❌ WRONG - N+1 Pattern (cost: +800ms with 10 tables)
const tablesWithSeats = await Promise.all(
  activeTables.map(async (t) => {
    // This executes a SEPARATE query for EACH table!
    const activeSlips = await ratingSlipService.getActiveForTable(t.id);
    const occupiedSeats = activeSlips
      .filter((s) => s.seat_number)
      .map((s) => s.seat_number as string);
    return { ...t, occupiedSeats };
  }),
);

// ✅ CORRECT - Batch query (single database round trip)
const tableIds = activeTables.map((t) => t.id);
const occupiedSeatsMap = await ratingSlipService.getOccupiedSeatsByTables(tableIds);

const tablesWithSeats = activeTables.map((t) => ({
  ...t,
  occupiedSeats: occupiedSeatsMap.get(t.id) ?? [],
}));
```

### Detection Patterns

- `Promise.all(items.map(async (item) => { await supabase.from()... }))`
- `for (const item of items) { await service.getXxx(item.id) }`
- Multiple `.eq('id', dynamicId)` calls in loops

### Remediation

1. Create batch query function using `.in('column', arrayOfIds)`
2. Return `Map<id, data[]>` for O(1) lookup
3. See `services/rating-slip/crud.ts:getOccupiedSeatsByTables` as reference

---

## Sequential Query Waterfall (HIGH)

### ❌ NEVER execute independent queries sequentially

```typescript
// ❌ WRONG - Sequential waterfall (cost: +1000ms)
// Each await blocks the next, even though queries are independent
const slipWithPauses = await ratingSlipService.getById(params.id);     // 150ms
const visit = await visitService.getById(slipWithPauses.visit_id);     // 150ms
const table = await tableContextService.getTable(tableId, casinoId);   // 150ms
const durationSeconds = await ratingSlipService.getDuration(params.id);// 150ms
const player = await playerService.getById(visit.player_id);           // 150ms
const financialSummary = await financialService.getVisitSummary(visitId);// 150ms
// Total: 900ms sequential

// ✅ CORRECT - Three-phase parallelization strategy
// Phase A: Sequential (required dependencies)
const slipWithPauses = await ratingSlipService.getById(params.id);
const visit = await visitService.getById(slipWithPauses.visit_id);

// Phase B: Parallel (independent queries)
const [table, durationSeconds, player, financialSummary, activeTables] =
  await Promise.all([
    tableContextService.getTable(slipWithPauses.table_id, casinoId),
    ratingSlipService.getDuration(params.id),
    visit.player_id ? playerService.getById(visit.player_id) : null,
    financialService.getVisitSummary(visit.id),
    tableContextService.getActiveTables(casinoId),
  ]);
// Total Phase B: ~150ms (parallel, limited by slowest)
```

### Detection Patterns

- Multiple sequential `await` statements with no data dependency
- More than 3 sequential database calls in a single handler

### Remediation

1. Analyze query dependencies (draw a DAG)
2. Group independent queries into `Promise.all()` phases
3. Add timing instrumentation to validate improvement

---

## Missing Batch Query Opportunities (MEDIUM)

### ❌ NEVER call the same table multiple times with different IDs

```typescript
// ❌ WRONG - Multiple single-ID queries
const player1 = await supabase.from('player').select('*').eq('id', id1).single();
const player2 = await supabase.from('player').select('*').eq('id', id2).single();
const player3 = await supabase.from('player').select('*').eq('id', id3).single();

// ✅ CORRECT - Single batch query
const { data: players } = await supabase
  .from('player')
  .select('*')
  .in('id', [id1, id2, id3]);

const playerMap = new Map(players.map(p => [p.id, p]));
```

### When to Create Batch Functions

- Fetching related data for a list (e.g., seats for multiple tables)
- Loading details for IDs extracted from a parent query
- Any scenario where you have `N` IDs and need `N` records

---

## Redundant Idempotency Checks (MEDIUM)

### ❌ NEVER perform the same query at multiple layers

```typescript
// ❌ WRONG - Redundant queries (found in POST /visits)
// Route handler:
const { has_active_visit } = await service.getActiveForPlayer(input.player_id); // Query #1
const visit = await service.startVisit(input.player_id, casinoId);

// Inside startVisit():
export async function startVisit(supabase, playerId, casinoId) {
  const existing = await getActiveVisitForPlayer(supabase, playerId); // Query #2 (duplicate!)
  if (existing.visit) return existing.visit;
  // ...
}

// ✅ CORRECT - Single authoritative check
const visit = await service.startVisit(input.player_id, casinoId);
// Let startVisit handle idempotency internally
// Determine isNew from return value or a flag property
```

### Remediation

- Idempotency checks should exist at ONE layer (typically the service)
- Route handlers should not pre-check if the service already handles it
- Use RPC-based state machines when atomicity is required

---

## Missing Query Timing Instrumentation (MEDIUM)

### ❌ NEVER deploy complex endpoints without timing visibility

```typescript
// ❌ WRONG - No timing visibility
const data = await ratingSlipService.getById(params.id);
// No way to know if this took 50ms or 500ms in production

// ✅ CORRECT - Add timing instrumentation
const timings: Record<string, number> = {};
const totalStart = performance.now();

const startPhaseA = performance.now();
const data = await ratingSlipService.getById(params.id);
timings.phaseA = Math.round(performance.now() - startPhaseA);

timings.total = Math.round(performance.now() - totalStart);

// Expose in development/staging via response header
if (process.env.NODE_ENV !== 'production') {
  response.headers.set('X-Query-Timings', JSON.stringify(timings));
}
```

### Instrumentation Pattern (from PERF-001)

```typescript
// Header format: X-Query-Timings: {"phaseA":150,"phaseB":200,"phaseC":100,"total":450}
```

---

## Known Locations Requiring Audit

| File | Pattern | Priority | Est. Impact |
|------|---------|----------|-------------|
| `app/api/v1/players/[playerId]/enroll/route.ts:56-73` | Sequential queries (3 parallelizable) | HIGH | -50-75ms |
| `app/api/v1/visits/route.ts:114-121` | Redundant idempotency check | MEDIUM | -30-50ms |
| `services/visit/crud.ts:198-226` | Double-query on race condition | LOW | Race-only |
| `app/api/v1/rating-slips/[id]/modal-data/route.ts` | ✅ FIXED (PERF-001) | — | -1800ms achieved |

---

## Reference Implementation

See `services/rating-slip/crud.ts:getOccupiedSeatsByTables` (lines 605-634):

```typescript
export async function getOccupiedSeatsByTables(
  supabase: SupabaseClient<Database>,
  tableIds: string[],
): Promise<Map<string, string[]>> {
  if (tableIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('rating_slip')
    .select('table_id, seat_number')
    .in('table_id', tableIds)
    .in('status', ['open', 'paused'])
    .not('seat_number', 'is', null);

  if (error) throw mapDatabaseError(error);

  // Group by table_id
  const result = new Map<string, string[]>();
  for (const row of data ?? []) {
    const tableId = row.table_id;
    const seatNumber = row.seat_number;
    if (tableId && seatNumber) {
      const seats = result.get(tableId) ?? [];
      seats.push(seatNumber);
      result.set(tableId, seats);
    }
  }
  return result;
}
```

---

## Quick Checklist

- [ ] No N+1 patterns (loops with database calls inside)
- [ ] Independent queries use `Promise.all()` parallelization
- [ ] Batch queries exist for "get by multiple IDs" scenarios
- [ ] Idempotency checks exist at ONE layer only
- [ ] Complex endpoints (>5 queries) have timing instrumentation
- [ ] BFF route handlers that aggregate multiple services are profiled

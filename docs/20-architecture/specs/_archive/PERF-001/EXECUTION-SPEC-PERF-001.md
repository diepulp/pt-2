---
id: PERF-001
title: Rating Slip Modal Performance Optimization
service: RatingSlipService
phase: Performance Hardening
pattern: Query Optimization + Parallelization
http_boundary: true
version: 1.0.0
created: 2025-12-20
status: ready
source: docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md
target_improvement: 72% (2500ms → 700ms)

workstreams:
  WS1:
    name: Batch Query for Occupied Seats
    agent: backend-developer
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - services/rating-slip/crud.ts (add getOccupiedSeatsByTables)
      - services/rating-slip/index.ts (export new function)
    gate: type-check
    estimated_impact: -700ms
    notes: |
      Eliminates N+1 query pattern. Single query replaces N queries
      for fetching occupied seats across all active tables.

  WS2:
    name: Database Performance Indexes
    agent: performance-engineer
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_perf001_modal_indexes.sql
    gate: migration-apply
    estimated_impact: -100ms
    notes: |
      Add composite indexes for modal-data query patterns:
      - idx_rating_slip_table_status (partial index)
      - idx_gaming_table_casino_status (partial index)
      - idx_player_loyalty_player_casino (composite)

  WS3:
    name: Route Handler Query Parallelization
    agent: api-expert
    status: pending
    depends_on: [WS1]
    parallel_group: B
    outputs:
      - app/api/v1/rating-slips/[id]/modal-data/route.ts
    gate: test-pass
    estimated_impact: -750ms
    notes: |
      Refactor modal-data endpoint to use Promise.all for
      independent queries. Integrate batch query from WS1.
      Three-phase parallel execution strategy.

  WS4:
    name: Performance Benchmark Tests
    agent: performance-engineer
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - __tests__/performance/modal-data.perf.test.ts
      - jest.config.perf.js (if needed)
    gate: test-pass
    estimated_impact: n/a (measurement)
    notes: |
      Add p95 latency benchmarks for modal-data endpoint.
      Target: <500ms p95 response time.
      Baseline measurement before optimization.

  WS5:
    name: Query Timing Instrumentation
    agent: api-expert
    status: pending
    depends_on: [WS3]
    parallel_group: C
    outputs:
      - app/api/v1/rating-slips/[id]/modal-data/route.ts (X-Query-Timings header)
    gate: test-pass
    estimated_impact: n/a (observability)
    notes: |
      Add timing instrumentation to modal-data route handler.
      Exposes X-Query-Timings response header for debugging.
      Enables continuous performance monitoring.

  WS6:
    name: BFF RPC Design Document
    agent: backend-developer
    status: pending
    depends_on: [WS3]
    parallel_group: C
    outputs:
      - docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md
    gate: docs-review
    estimated_impact: -550ms (future)
    notes: |
      Design document for rpc_get_rating_slip_modal_data.
      Future optimization: single database round trip.
      Deferred to post-MVP unless 700ms target not met.

execution_phases:
  - name: "Phase 1: Foundation (Parallel)"
    parallel: [WS1, WS2, WS4]
    status: pending
    gate: type-check + migration-apply
    agents: [backend-developer, performance-engineer]
    notes: |
      All three workstreams can execute simultaneously.
      No dependencies between them.

  - name: "Phase 2: Route Refactor"
    parallel: [WS3]
    status: pending
    gate: test-pass
    agents: [api-expert]
    notes: |
      Depends on WS1 (batch query) being available.
      Can run in parallel with WS2/WS4 completion.

  - name: "Phase 3: Instrumentation & Design (Parallel)"
    parallel: [WS5, WS6]
    status: pending
    gate: test-pass + docs-review
    agents: [api-expert, backend-developer]
    notes: |
      Both workstreams can execute in parallel.
      WS5 adds observability, WS6 designs future optimization.

gates:
  - name: type-check
    command: npm run type-check
    required_for: [WS1]

  - name: migration-apply
    command: npx supabase db push
    required_for: [WS2]

  - name: test-pass
    command: npm test -- --testPathPatterns="rating-slips|modal-data|perf"
    required_for: [WS3, WS4, WS5]

  - name: docs-review
    command: echo "Manual review required"
    required_for: [WS6]

  - name: performance-validation
    command: npm test -- --testPathPatterns="perf" --runInBand
    required_for: [FINAL]
    acceptance_criteria: "p95 < 500ms"

agent_assignments:
  backend-developer:
    workstreams: [WS1, WS6]
    skills_required:
      - Service layer patterns (SLAD §308-348)
      - Supabase query builder
      - TypeScript generics for Map<K,V>
    context_files:
      - services/rating-slip/crud.ts
      - services/rating-slip/index.ts
      - docs/25-api-data/DTO_CANONICAL_STANDARD.md

  performance-engineer:
    workstreams: [WS2, WS4]
    skills_required:
      - PostgreSQL indexing (partial indexes)
      - Jest performance testing
      - EXPLAIN ANALYZE interpretation
    context_files:
      - supabase/migrations/20251220161147_add_foreign_key_indexes_for_performance.sql
      - docs/30-security/SEC-004-rls-performance-analysis.md
      - docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md

  api-expert:
    workstreams: [WS3, WS5]
    skills_required:
      - Next.js Route Handlers
      - Promise.all parallelization
      - HTTP response headers
    context_files:
      - app/api/v1/rating-slips/[id]/modal-data/route.ts
      - lib/http/service-response.ts
      - docs/20-architecture/EDGE_TRANSPORT_POLICY.md
---

# EXECUTION-SPEC: Rating Slip Modal Performance Optimization

## Problem Statement

**Source:** `docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md`

The rating slip modal endpoint (`GET /api/v1/rating-slips/[id]/modal-data`) exhibits a **2.5 second initial load time**, exceeding the 500ms p95 target by 5x. Root cause analysis identified:

| Issue | Impact | Severity |
|-------|--------|----------|
| N+1 Query Pattern | +100-150ms per active table | **CRITICAL** |
| Sequential Query Waterfall | ~150ms × 11 calls = 1.65s | **HIGH** |
| No Query Parallelization | Blocked on sequential awaits | **HIGH** |
| Missing Database Indexes | Additional scan overhead | **MEDIUM** |

**Target:** 2500ms → 700ms (**72% improvement**)

## Scope

### In Scope
- Batch query for occupied seats (eliminates N+1)
- Query parallelization in route handler
- Performance-focused database indexes
- Performance benchmark tests
- Query timing instrumentation
- BFF RPC design document (future)

### Out of Scope
- BFF RPC implementation (deferred unless 700ms not achieved)
- Other endpoint optimizations (can be extended later)
- Frontend caching strategies (separate initiative)

## Architecture Decision

### Query Execution Strategy: Three-Phase Parallelization

```
Phase A: Sequential (Required Dependencies)
├── 1. getById(slipId)        → Returns slip with visit_id
└── 2. getById(visitId)       → Returns visit with player_id

Phase B: Parallel (Independent Queries)
├── getTable(tableId, casinoId)
├── getDuration(slipId)
├── getById(playerId)           [if player exists]
├── getVisitSummary(visitId)
└── getActiveTables(casinoId)

Phase C: Parallel (Player-Dependent)
├── getBalance(playerId)        [if player exists]
├── evaluateSuggestion(slipId)  [if open + player]
└── getOccupiedSeatsByTables(tableIds)  ← NEW BATCH QUERY
```

### Dependency Graph

```
                    ┌─────────────────────────────────────────────┐
                    │           PHASE 1 (Parallel)                │
                    │                                             │
                    │   ┌─────────┐  ┌─────────┐  ┌─────────┐    │
                    │   │   WS1   │  │   WS2   │  │   WS4   │    │
                    │   │ Batch   │  │ Indexes │  │ Bench-  │    │
                    │   │ Query   │  │         │  │ marks   │    │
                    │   └────┬────┘  └─────────┘  └─────────┘    │
                    │        │                                    │
                    └────────┼────────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    PHASE 2      │
                    │                 │
                    │   ┌─────────┐   │
                    │   │   WS3   │   │
                    │   │ Route   │   │
                    │   │ Refactor│   │
                    │   └────┬────┘   │
                    │        │        │
                    └────────┼────────┘
                             │
                             ▼
                    ┌─────────────────────────────────────────────┐
                    │           PHASE 3 (Parallel)                │
                    │                                             │
                    │   ┌─────────┐            ┌─────────┐       │
                    │   │   WS5   │            │   WS6   │       │
                    │   │ Timing  │            │  BFF    │       │
                    │   │ Headers │            │ Design  │       │
                    │   └─────────┘            └─────────┘       │
                    │                                             │
                    └─────────────────────────────────────────────┘
```

---

## Workstream Details

### WS1: Batch Query for Occupied Seats

**Agent:** `backend-developer`
**Parallel Group:** A
**Estimated Impact:** -700ms

**Implementation:**

```typescript
// services/rating-slip/crud.ts - NEW FUNCTION

/**
 * Batch query for occupied seats across multiple tables.
 * Eliminates N+1 pattern in modal-data endpoint.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableIds - Array of gaming table UUIDs
 * @returns Map of table_id → occupied seat numbers
 */
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

**Export in index.ts:**
```typescript
export interface RatingSlipServiceInterface {
  // ... existing methods ...

  /**
   * Batch query for occupied seats across multiple tables.
   * Used by modal-data BFF to eliminate N+1 queries.
   */
  getOccupiedSeatsByTables(tableIds: string[]): Promise<Map<string, string[]>>;
}
```

**Acceptance Criteria:**
- [ ] Function implemented with proper error handling
- [ ] Exported from service interface
- [ ] Type-check passes
- [ ] Empty array returns empty Map

---

### WS2: Database Performance Indexes

**Agent:** `performance-engineer`
**Parallel Group:** A
**Estimated Impact:** -100ms

**Migration:**

```sql
-- Migration: YYYYMMDDHHMMSS_perf001_modal_indexes.sql

-- Index for batch occupied seats query
-- Covers: WHERE table_id = ANY(?) AND status IN ('open', 'paused')
CREATE INDEX IF NOT EXISTS idx_rating_slip_table_status_active
  ON rating_slip (table_id, status)
  WHERE status IN ('open', 'paused');

-- Index for active tables by casino
-- Covers: WHERE casino_id = ? AND status = 'active'
CREATE INDEX IF NOT EXISTS idx_gaming_table_casino_active
  ON gaming_table (casino_id)
  WHERE status = 'active';

-- Index for player loyalty balance lookup
-- Covers: WHERE player_id = ? AND casino_id = ?
CREATE INDEX IF NOT EXISTS idx_player_loyalty_lookup
  ON player_loyalty (player_id, casino_id);

-- Analyze tables after index creation
ANALYZE rating_slip;
ANALYZE gaming_table;
ANALYZE player_loyalty;
```

**Acceptance Criteria:**
- [ ] Migration creates indexes successfully
- [ ] EXPLAIN ANALYZE shows index usage
- [ ] No duplicate indexes created

---

### WS3: Route Handler Query Parallelization

**Agent:** `api-expert`
**Parallel Group:** B
**Depends On:** WS1
**Estimated Impact:** -750ms

**Implementation Pattern:**

```typescript
// app/api/v1/rating-slips/[id]/modal-data/route.ts

// Phase A: Sequential (required dependencies)
const slipWithPauses = await ratingSlipService.getById(params.id);
if (!slipWithPauses) {
  throw new DomainError("RATING_SLIP_NOT_FOUND", ...);
}

const visit = await visitService.getById(slipWithPauses.visit_id);
if (!visit) {
  throw new DomainError("VISIT_NOT_FOUND", ...);
}

// Phase B: Parallel (independent queries)
const [table, durationSeconds, player, financialSummary, activeTables] =
  await Promise.all([
    tableContextService.getTable(slipWithPauses.table_id, casinoId),
    ratingSlipService.getDuration(params.id),
    visit.player_id ? playerService.getById(visit.player_id) : null,
    financialService.getVisitSummary(visit.id),
    tableContextService.getActiveTables(casinoId),
  ]);

// Phase C: Parallel (player-dependent + batch seats)
const tableIds = activeTables.map(t => t.id);
const [loyaltyData, occupiedSeatsMap] = await Promise.all([
  player ? getLoyaltyData(loyaltyService, visit.player_id!, casinoId, slipWithPauses) : null,
  ratingSlipService.getOccupiedSeatsByTables(tableIds),
]);

// Build tables with occupied seats (NO N+1!)
const tablesWithSeats = activeTables.map(t => ({
  id: t.id,
  label: t.label,
  type: t.type,
  status: t.status,
  occupiedSeats: occupiedSeatsMap.get(t.id) ?? [],
}));

// Helper for loyalty data
async function getLoyaltyData(
  loyaltyService: LoyaltyServiceInterface,
  playerId: string,
  casinoId: string,
  slip: RatingSlipWithPausesDTO,
): Promise<{ balance: PlayerLoyaltyDTO | null; suggestion: SessionRewardSuggestionOutput | null }> {
  const [balance, suggestion] = await Promise.all([
    loyaltyService.getBalance(playerId, casinoId),
    slip.status === 'open'
      ? loyaltyService.evaluateSuggestion(slip.id).catch(() => null)
      : null,
  ]);
  return { balance, suggestion };
}
```

**Acceptance Criteria:**
- [ ] All existing tests pass
- [ ] Response structure unchanged
- [ ] No N+1 queries in trace
- [ ] Parallel execution verified via timing

---

### WS4: Performance Benchmark Tests

**Agent:** `performance-engineer`
**Parallel Group:** A
**Estimated Impact:** n/a (measurement)

**Implementation:**

```typescript
// __tests__/performance/modal-data.perf.test.ts

import { createMockNextRequest } from '@/lib/testing/route-test-helpers';

describe('modal-data performance', () => {
  const SAMPLE_SIZE = 50;
  const P95_TARGET_MS = 500;

  let testSlipId: string;

  beforeAll(async () => {
    // Create test data or use existing fixtures
    testSlipId = process.env.TEST_RATING_SLIP_ID ?? 'fixture-slip-id';
  });

  it('should baseline current performance', async () => {
    const times: number[] = [];

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const start = performance.now();
      const response = await GET(
        createMockNextRequest(`/api/v1/rating-slips/${testSlipId}/modal-data`),
        { params: Promise.resolve({ id: testSlipId }) }
      );
      times.push(performance.now() - start);

      expect(response.status).toBe(200);
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    console.log(`Performance Results (n=${SAMPLE_SIZE}):`);
    console.log(`  p50: ${p50.toFixed(2)}ms`);
    console.log(`  p95: ${p95.toFixed(2)}ms`);
    console.log(`  p99: ${p99.toFixed(2)}ms`);

    // Track but don't fail on baseline
    expect(p95).toBeDefined();
  });

  it('should meet p95 target after optimization', async () => {
    const times: number[] = [];

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const start = performance.now();
      await GET(
        createMockNextRequest(`/api/v1/rating-slips/${testSlipId}/modal-data`),
        { params: Promise.resolve({ id: testSlipId }) }
      );
      times.push(performance.now() - start);
    }

    const sorted = times.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    expect(p95).toBeLessThan(P95_TARGET_MS);
  });
});

function percentile(arr: number[], p: number): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, idx)];
}
```

**Acceptance Criteria:**
- [ ] Baseline test captures current performance
- [ ] p95 target test validates optimization
- [ ] Tests run in CI (optional: skip in normal runs)

---

### WS5: Query Timing Instrumentation

**Agent:** `api-expert`
**Parallel Group:** C
**Depends On:** WS3
**Estimated Impact:** n/a (observability)

**Implementation:**

```typescript
// In modal-data route handler

interface QueryTimings {
  getSlip: number;
  getVisit: number;
  parallelPhaseB: number;
  parallelPhaseC: number;
  total: number;
}

// Add to route handler
const timings: Partial<QueryTimings> = {};
const routeStart = performance.now();

// Phase A
let phaseStart = performance.now();
const slipWithPauses = await ratingSlipService.getById(params.id);
timings.getSlip = performance.now() - phaseStart;

phaseStart = performance.now();
const visit = await visitService.getById(slipWithPauses.visit_id);
timings.getVisit = performance.now() - phaseStart;

// Phase B
phaseStart = performance.now();
const [table, durationSeconds, player, financialSummary, activeTables] =
  await Promise.all([...]);
timings.parallelPhaseB = performance.now() - phaseStart;

// Phase C
phaseStart = performance.now();
const [loyaltyData, occupiedSeatsMap] = await Promise.all([...]);
timings.parallelPhaseC = performance.now() - phaseStart;

timings.total = performance.now() - routeStart;

// Add header (development only)
const response = successResponse(ctx, modalData);
if (process.env.NODE_ENV === 'development') {
  response.headers.set('X-Query-Timings', JSON.stringify(timings));
}
return response;
```

**Acceptance Criteria:**
- [ ] X-Query-Timings header present in development
- [ ] Header NOT present in production
- [ ] Timings accurately reflect phases

---

### WS6: BFF RPC Design Document

**Agent:** `backend-developer`
**Parallel Group:** C
**Depends On:** WS3
**Estimated Impact:** -550ms (future)

**Output:** `docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md`

**Document Outline:**
1. Current State (post-WS3 optimization)
2. BFF RPC Design (`rpc_get_rating_slip_modal_data`)
3. Security Considerations (SECURITY INVOKER, RLS)
4. Cross-context Aggregation Strategy
5. Migration Path
6. Performance Projections

**Acceptance Criteria:**
- [ ] Design document complete
- [ ] ADR-018 compliance verified
- [ ] Implementation deferred to post-MVP

---

## Expected Performance Improvement

| Phase | Optimization | Before | After | Delta |
|-------|--------------|--------|-------|-------|
| Phase 1 | Batch query (WS1) | 2500ms | 1800ms | -700ms |
| Phase 1 | Indexes (WS2) | 1800ms | 1700ms | -100ms |
| Phase 2 | Parallelization (WS3) | 1700ms | 700ms | -1000ms |
| **Total** | **All Optimizations** | **2500ms** | **700ms** | **-1800ms (72%)** |

Future (if needed):
| Phase 4 | BFF RPC (WS6 impl) | 700ms | 150ms | -550ms |

---

## Execution Instructions

### For Parallel Execution

```bash
# Phase 1: Launch in parallel
# Terminal 1 (backend-developer)
claude-code --skill backend-developer --args "Execute WS1 from EXECUTION-SPEC-PERF-001"

# Terminal 2 (performance-engineer)
claude-code --skill performance-engineer --args "Execute WS2 and WS4 from EXECUTION-SPEC-PERF-001"

# Wait for Phase 1 completion, then Phase 2
# Terminal 1 (api-expert)
claude-code --skill api-expert --args "Execute WS3 from EXECUTION-SPEC-PERF-001"

# Phase 3: Launch in parallel after WS3
# Terminal 1 (api-expert)
claude-code --skill api-expert --args "Execute WS5 from EXECUTION-SPEC-PERF-001"

# Terminal 2 (backend-developer)
claude-code --skill backend-developer --args "Execute WS6 from EXECUTION-SPEC-PERF-001"
```

### Validation Gates

```bash
# After each workstream
npm run type-check                     # WS1
npx supabase db push                   # WS2
npm test -- --testPathPatterns="rating-slips"  # WS3, WS4, WS5

# Final validation
npm test -- --testPathPatterns="perf" --runInBand
# Expect: p95 < 500ms
```

---

## Definition of Done

- [ ] All workstreams completed
- [ ] All gates passed
- [ ] p95 latency < 500ms (validated by WS4)
- [ ] No regression in existing tests
- [ ] Query timing instrumentation active in development
- [ ] BFF RPC design documented for future

---

## References

- Source Analysis: `docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md`
- RLS Optimization: `docs/30-security/SEC-004-rls-performance-analysis.md`
- Service Patterns: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- Route Handler: `app/api/v1/rating-slips/[id]/modal-data/route.ts`
- Performance Targets: `docs/40-quality/QA-001-service-testing-strategy.md`

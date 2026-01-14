# Shift Dashboard Performance Audit

**Date**: 2026-01-14
**Auditor**: qa-specialist skill
**Scope**: PRD-Shift-Dashboards-v0.2 API Endpoints
**Standard**: GATE-2 Performance Thresholds (API ≤500ms p95)

---

## Executive Summary

| Finding | Severity | Impact |
|---------|----------|--------|
| N+1 query in `getShiftAllPitsMetrics` | **CRITICAL** | O(n) database calls for n pits |
| Missing composite indexes for time-window queries | HIGH | Full table scans on large datasets |
| Redundant RPC calls when loading dashboard | MEDIUM | 3× table metrics computation |
| No response caching | LOW | Repeated computation for same window |

**Recommendation**: Fix N+1 query immediately. Add composite indexes before production load.

---

## API Endpoint Inventory

| Endpoint | Method | Service Function | RPC Called | Expected p95 |
|----------|--------|------------------|------------|--------------|
| `/metrics/tables` | GET | `getShiftTableMetrics` | `rpc_shift_table_metrics` | 200ms |
| `/metrics/pits` | GET | `getShiftAllPitsMetrics` | **N+1 pattern** | ⚠️ 500ms+ |
| `/metrics/casino` | GET | `getShiftCasinoMetrics` | `rpc_shift_casino_metrics` | 150ms |
| `/cash-observations/tables` | GET | `getShiftCashObsTable` | `rpc_shift_cash_obs_table` | 100ms |
| `/cash-observations/pits` | GET | `getShiftCashObsPit` | `rpc_shift_cash_obs_pit` | 80ms |
| `/cash-observations/casino` | GET | `getShiftCashObsCasino` | `rpc_shift_cash_obs_casino` | 50ms |
| `/cash-observations/alerts` | GET | `getShiftCashObsAlerts` | `rpc_shift_cash_obs_alerts` | 100ms |

---

## Critical Finding: N+1 Query Pattern

### Location
`services/table-context/shift-metrics/service.ts:91-114`

### Problem
```typescript
export async function getShiftAllPitsMetrics(supabase, params) {
  // 1️⃣ First call: Get ALL table metrics
  const tableMetrics = await getShiftTableMetrics(supabase, params);

  // Extract unique pits
  const pitIds = [...new Set(tableMetrics.map(t => t.pit_id).filter(Boolean))];

  // 2️⃣ N MORE CALLS: One per pit!
  const pitMetrics = [];
  for (const pitId of pitIds) {
    const metrics = await getShiftPitMetrics(supabase, { ...params, pitId });
    if (metrics) pitMetrics.push(metrics);
  }

  return pitMetrics;
}
```

### Impact
For a casino with 10 pits:
- **Current**: 1 + 10 = **11 database round-trips**
- **Expected latency**: 50ms × 11 = **550ms** (exceeds p95 threshold)

### Root Cause
There is no `rpc_shift_all_pits_metrics` RPC. The pit rollup RPC requires a single `p_pit_id` parameter.

### Recommended Fix

**Option A**: Create new RPC (preferred)
```sql
CREATE OR REPLACE FUNCTION rpc_shift_all_pits_metrics(
  p_window_start timestamptz,
  p_window_end timestamptz
) RETURNS TABLE (...) AS $$
  WITH table_metrics AS (
    SELECT * FROM rpc_shift_table_metrics(p_window_start, p_window_end)
  )
  SELECT
    tm.pit_id,
    COUNT(*)::integer AS tables_count,
    -- ... aggregations grouped by pit_id
  FROM table_metrics tm
  WHERE tm.pit_id IS NOT NULL
  GROUP BY tm.pit_id;
$$;
```

**Option B**: Client-side aggregation (temporary)
```typescript
export async function getShiftAllPitsMetrics(supabase, params) {
  // Single call
  const tableMetrics = await getShiftTableMetrics(supabase, params);

  // Aggregate in memory (no additional DB calls)
  const pitMap = new Map<string, ShiftPitMetricsDTO>();
  for (const table of tableMetrics) {
    if (!table.pit_id) continue;
    // ... aggregate into pitMap
  }
  return Array.from(pitMap.values());
}
```

---

## High Severity: Missing Composite Indexes

### Current Index Coverage

| Table | Existing Indexes | Missing for Time-Window |
|-------|-----------------|------------------------|
| `table_inventory_snapshot` | `casino_id`, `table_id` | ❌ `(casino_id, created_at)` |
| `table_fill` | `table_id` | ❌ `(casino_id, created_at)` |
| `table_credit` | `table_id` | ❌ `(casino_id, created_at)` |
| `table_buyin_telemetry` | None | ❌ `(casino_id, occurred_at)` |
| `table_drop_event` | None | ❌ `(casino_id, removed_at)` |
| `pit_cash_observation` | `casino_day`, `visit_time`, `player_time` | ✅ Adequate |

### Query Patterns Without Indexes

From `rpc_shift_table_metrics`:
```sql
-- Opening snapshot: DISTINCT ON with ORDER BY
SELECT DISTINCT ON (tis.table_id)
  tis.table_id, tis.id, tis.created_at, ...
FROM public.table_inventory_snapshot tis
WHERE tis.casino_id = v_context_casino_id
  AND tis.created_at <= p_window_start  -- ⚠️ Requires index on (casino_id, created_at)
ORDER BY tis.table_id, tis.created_at DESC;

-- Fills aggregation
SELECT tf.table_id, SUM(tf.amount_cents)
FROM public.table_fill tf
WHERE tf.casino_id = v_context_casino_id
  AND tf.created_at >= p_window_start  -- ⚠️ Requires index
  AND tf.created_at < p_window_end
GROUP BY tf.table_id;
```

### Recommended Migration

```sql
-- Performance indexes for shift metrics RPCs
CREATE INDEX CONCURRENTLY idx_table_inventory_snapshot_casino_created
  ON public.table_inventory_snapshot (casino_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_table_fill_casino_created
  ON public.table_fill (casino_id, created_at);

CREATE INDEX CONCURRENTLY idx_table_credit_casino_created
  ON public.table_credit (casino_id, created_at);

CREATE INDEX CONCURRENTLY idx_table_buyin_telemetry_casino_occurred
  ON public.table_buyin_telemetry (casino_id, occurred_at);

CREATE INDEX CONCURRENTLY idx_table_drop_event_casino_removed
  ON public.table_drop_event (casino_id, removed_at);
```

---

## Medium Severity: Redundant RPC Computation

### Dashboard Load Pattern

When the shift dashboard loads, the UI calls all 3 metrics endpoints:
1. `/metrics/casino` → calls `rpc_shift_casino_metrics`
2. `/metrics/pits` → calls `rpc_shift_table_metrics` + N × `rpc_shift_pit_metrics`
3. `/metrics/tables` → calls `rpc_shift_table_metrics`

### RPC Call Graph

```
rpc_shift_casino_metrics
  └── rpc_shift_table_metrics (internal call)

rpc_shift_pit_metrics(pit_id)
  └── rpc_shift_table_metrics (internal call, filtered by pit_id)

rpc_shift_table_metrics
  └── Direct query (no nesting)
```

### Impact

**Current**: For dashboard with 5 pits:
- `/metrics/casino`: 1 × `rpc_shift_table_metrics`
- `/metrics/pits`: 1 + 5 = 6 × `rpc_shift_table_metrics` (N+1!)
- `/metrics/tables`: 1 × `rpc_shift_table_metrics`

**Total**: 8 calls to `rpc_shift_table_metrics` for single dashboard load

### Recommended Fix

**BFF Endpoint**: Create `/api/v1/shift-dashboards/summary` that returns all three levels in one call:

```typescript
// Single HTTP request returns:
{
  casino: ShiftCasinoMetricsDTO,
  pits: ShiftPitMetricsDTO[],
  tables: ShiftTableMetricsDTO[]
}
```

Implementation:
```typescript
const tableMetrics = await getShiftTableMetrics(supabase, params);
const casinoMetrics = aggregateToCasino(tableMetrics);
const pitMetrics = aggregateToPits(tableMetrics);

return { casino: casinoMetrics, pits: pitMetrics, tables: tableMetrics };
```

---

## RPC Complexity Analysis

### `rpc_shift_table_metrics`

| CTE | Operations | Complexity |
|-----|------------|------------|
| `tables` | Filter `gaming_table` by casino | O(T) where T = tables |
| `opening_snapshots` | DISTINCT ON + ORDER BY | O(S log S) |
| `closing_snapshots` | DISTINCT ON + ORDER BY | O(S log S) |
| `fills_agg` | GROUP BY table_id | O(F) |
| `credits_agg` | GROUP BY table_id | O(C) |
| `drop_custody` | GROUP BY table_id | O(D) |
| `telemetry_agg` | GROUP BY + FILTER | O(B) |
| **Final JOIN** | 6 LEFT JOINs | O(T) |

**Overall**: O(T + S log S + F + C + D + B) ≈ O(n log n) where n = max dataset size

**Assessment**: Well-designed single-pass aggregation. Performance depends on index coverage.

### `rpc_shift_cash_obs_table`

| Operation | Complexity |
|-----------|------------|
| JOIN `pit_cash_observation → rating_slip → gaming_table` | O(O × log R × log G) |
| FILTER aggregations | O(O) |
| GROUP BY + ORDER BY | O(P log P) where P = unique tables |

**Assessment**: Efficient. Benefits from existing indexes on `pit_cash_observation`.

---

## Test Coverage Analysis

### Existing Tests

| Test File | Coverage |
|-----------|----------|
| `__tests__/services/table-context/shift-metrics.int.test.ts` | ✅ Integration tests for RPCs |
| `app/api/v1/shift-dashboards/metrics/*/__tests__/route.test.ts` | ✅ Route handler tests |
| `app/api/v1/shift-dashboards/cash-observations/*/__tests__/route.test.ts` | ✅ Route handler tests |

### Missing Performance Tests

| Gap | Priority |
|-----|----------|
| Load test with realistic data volumes | HIGH |
| Benchmark `getShiftAllPitsMetrics` with 20+ pits | CRITICAL |
| Response time assertions (p95 < 500ms) | MEDIUM |
| Memory usage during large time windows (24h) | LOW |

### Recommended Performance Test

```typescript
describe('Performance: getShiftAllPitsMetrics', () => {
  it('returns all pit metrics in under 500ms for 20 pits', async () => {
    // Setup: 20 pits, 5 tables each = 100 tables
    const start = performance.now();

    const metrics = await getShiftAllPitsMetrics(supabase, {
      casinoId,
      startTs: windowStart,
      endTs: windowEnd,
    });

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
    expect(metrics.length).toBe(20);
  });
});
```

---

## Performance Optimization Roadmap

### Phase 1: Critical Fixes (Immediate)

1. **Fix N+1 in `getShiftAllPitsMetrics`**
   - Option A: Create `rpc_shift_all_pits_metrics` RPC
   - Option B: Client-side aggregation from table metrics

2. **Add composite indexes**
   - Run index migration with `CONCURRENTLY` during low traffic

### Phase 2: Medium-Term Improvements

3. **Create BFF summary endpoint**
   - Single call for dashboard initialization
   - Reduces HTTP round-trips from 7 to 1

4. **Add response caching**
   - React Query staleTime: 60s for shift metrics
   - HTTP Cache-Control headers for identical windows

### Phase 3: Monitoring & Optimization

5. **Add performance observability**
   - Track RPC execution times via pg_stat_statements
   - Alert on p95 > 500ms

6. **Consider materialized views**
   - For frequently accessed historical windows
   - Refresh on schedule (hourly)

---

## Quality Gate Assessment

| Threshold | Current Status | Notes |
|-----------|----------------|-------|
| API response ≤ 500ms (p95) | ⚠️ AT RISK | N+1 pattern in pits endpoint |
| No N+1 queries | ❌ FAIL | `getShiftAllPitsMetrics` |
| Index coverage | ⚠️ PARTIAL | Missing time-window composites |
| Test coverage | ✅ PASS | Integration + route tests exist |

**Overall**: **CONDITIONAL PASS** - Fix N+1 before production traffic

---

## Appendix: EXPLAIN ANALYZE Recommendations

Run these queries against production data to validate index effectiveness:

```sql
-- Test opening snapshot query
EXPLAIN ANALYZE
SELECT DISTINCT ON (tis.table_id) tis.*
FROM table_inventory_snapshot tis
WHERE tis.casino_id = 'your-casino-id'
  AND tis.created_at <= '2026-01-14T00:00:00Z'
ORDER BY tis.table_id, tis.created_at DESC;

-- Test fills aggregation
EXPLAIN ANALYZE
SELECT tf.table_id, SUM(tf.amount_cents)
FROM table_fill tf
WHERE tf.casino_id = 'your-casino-id'
  AND tf.created_at >= '2026-01-14T00:00:00Z'
  AND tf.created_at < '2026-01-14T08:00:00Z'
GROUP BY tf.table_id;
```

---

**Status**: Audit complete. Immediate action required on N+1 pattern.

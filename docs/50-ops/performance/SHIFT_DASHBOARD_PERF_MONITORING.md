# Shift Dashboard Performance Monitoring

**Status**: Active
**Created**: 2026-01-14
**Relates to**: SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md, OBSERVABILITY_SPEC.md

---

## SLO Targets

| Endpoint | p95 Target | Alert Threshold | Notes |
|----------|------------|-----------------|-------|
| `/api/v1/shift-dashboards/summary` (BFF) | 300ms | 500ms | Single call for dashboard init |
| `/api/v1/shift-dashboards/metrics/tables` | 200ms | 300ms | Per-table metrics |
| `/api/v1/shift-dashboards/metrics/pits` | 200ms | 300ms | Pit rollup (N+1 fixed) |
| `/api/v1/shift-dashboards/metrics/casino` | 150ms | 250ms | Casino rollup |
| `/api/v1/shift-dashboards/cash-observations/*` | 100ms | 200ms | Telemetry data |

---

## pg_stat_statements Monitoring Queries

### Top Shift Metrics RPCs by Execution Time

```sql
-- Run against production database
-- Requires: pg_stat_statements extension enabled

SELECT
  queryid,
  calls,
  ROUND(mean_exec_time::numeric, 2) as mean_ms,
  ROUND(stddev_exec_time::numeric, 2) as stddev_ms,
  ROUND(max_exec_time::numeric, 2) as max_ms,
  ROUND((total_exec_time / 1000)::numeric, 2) as total_sec,
  ROUND((shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0) * 100), 1) as cache_hit_pct,
  LEFT(query, 80) as query_preview
FROM pg_stat_statements
WHERE query ILIKE '%rpc_shift_%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### p95 Approximation for Shift RPCs

```sql
-- Approximate p95 using mean + 2*stddev (assumes normal distribution)
SELECT
  CASE
    WHEN query ILIKE '%rpc_shift_table_metrics%' THEN 'rpc_shift_table_metrics'
    WHEN query ILIKE '%rpc_shift_pit_metrics%' THEN 'rpc_shift_pit_metrics'
    WHEN query ILIKE '%rpc_shift_casino_metrics%' THEN 'rpc_shift_casino_metrics'
    WHEN query ILIKE '%rpc_shift_cash_obs%' THEN 'rpc_shift_cash_obs_*'
    ELSE 'other'
  END as rpc_name,
  SUM(calls) as total_calls,
  ROUND(AVG(mean_exec_time)::numeric, 2) as avg_mean_ms,
  ROUND(AVG(mean_exec_time + 2 * stddev_exec_time)::numeric, 2) as approx_p95_ms,
  ROUND(MAX(max_exec_time)::numeric, 2) as observed_max_ms,
  ROUND(AVG(shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0) * 100), 1) as avg_cache_hit_pct
FROM pg_stat_statements
WHERE query ILIKE '%rpc_shift_%'
GROUP BY 1
ORDER BY approx_p95_ms DESC;
```

### Index Effectiveness Check

```sql
-- Verify new composite indexes are being used
SELECT
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan as times_used,
  idx_tup_read as rows_read,
  idx_tup_fetch as rows_fetched
FROM pg_stat_user_indexes
WHERE indexrelname LIKE 'idx_table_%_casino_%'
ORDER BY idx_scan DESC;
```

### Monitor Slow Queries (>500ms)

```sql
-- Find queries exceeding SLO threshold
SELECT
  queryid,
  calls,
  ROUND(mean_exec_time::numeric, 2) as mean_ms,
  ROUND(max_exec_time::numeric, 2) as max_ms,
  query
FROM pg_stat_statements
WHERE query ILIKE '%shift%'
  AND mean_exec_time > 500
ORDER BY mean_exec_time DESC;
```

---

## Supabase Dashboard Alerts

Configure these alerts in Supabase Dashboard > Settings > Alerts:

| Alert Name | Condition | Action |
|------------|-----------|--------|
| Shift Metrics Slow | `rpc_shift_table_metrics` p95 > 500ms | Slack notification |
| Index Not Used | `idx_table_*_casino_*` scans = 0 (24h) | Review query plans |
| High RLS Overhead | Any shift RPC > 200% overhead | Investigate policies |

---

## Performance Regression Detection

### Baseline Comparison Script

Run after deployments to detect regressions:

```bash
# Compare current metrics to baseline
npx supabase db execute --sql "
WITH current AS (
  SELECT
    CASE
      WHEN query ILIKE '%rpc_shift_table_metrics%' THEN 'table_metrics'
      WHEN query ILIKE '%rpc_shift_pit_metrics%' THEN 'pit_metrics'
      WHEN query ILIKE '%rpc_shift_casino_metrics%' THEN 'casino_metrics'
    END as endpoint,
    ROUND(mean_exec_time::numeric, 2) as mean_ms
  FROM pg_stat_statements
  WHERE query ILIKE '%rpc_shift_%metrics%'
)
SELECT
  endpoint,
  mean_ms,
  CASE
    WHEN endpoint = 'table_metrics' AND mean_ms > 200 THEN 'WARN'
    WHEN endpoint = 'pit_metrics' AND mean_ms > 200 THEN 'WARN'
    WHEN endpoint = 'casino_metrics' AND mean_ms > 150 THEN 'WARN'
    ELSE 'OK'
  END as status
FROM current
WHERE endpoint IS NOT NULL;
"
```

---

## Optimization History

| Date | Change | Impact |
|------|--------|--------|
| 2026-01-14 | Fixed N+1 in `getShiftAllPitsMetrics` | 11 DB calls → 1 |
| 2026-01-14 | Added composite indexes | Index scans for time-window queries |
| 2026-01-14 | Added BFF `/summary` endpoint | 3 HTTP calls → 1 |
| 2026-01-14 | React Query caching 60s | Reduced redundant fetches |

---

## Runbook: SLO Breach Investigation

### Symptoms
- Dashboard load time > 3s
- Alert: "Shift Metrics Slow"
- User complaints about shift dashboard

### Investigation Steps

1. **Check pg_stat_statements**
   ```sql
   SELECT * FROM pg_stat_statements
   WHERE query ILIKE '%rpc_shift_%'
   ORDER BY mean_exec_time DESC LIMIT 5;
   ```

2. **Verify indexes are used**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM rpc_shift_table_metrics(
     '2026-01-14T00:00:00Z'::timestamptz,
     '2026-01-14T08:00:00Z'::timestamptz,
     NULL
   );
   ```

3. **Check for lock contention**
   ```sql
   SELECT * FROM pg_locks WHERE NOT granted;
   ```

4. **Review connection pool**
   - Supabase Dashboard > Settings > Database
   - Check active connections vs pool size

### Resolution Actions

1. If sequential scans: Verify composite indexes exist
2. If lock waits: Identify blocking query, consider transaction isolation
3. If N+1 pattern: Ensure client uses `/summary` endpoint
4. If cache misses: Review React Query `staleTime` settings

---

## References

- [SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md](../../40-quality/audits/SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md)
- [OBSERVABILITY_SPEC.md](../OBSERVABILITY_SPEC.md)
- [SLO Definitions](/.claude/skills/performance-engineer/references/slo-definitions.md)

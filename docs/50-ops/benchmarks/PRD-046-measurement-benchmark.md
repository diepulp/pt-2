# PRD-046 Measurement Benchmark Report

**Status:** PENDING — Requires live database for EXPLAIN ANALYZE
**Date:** 2026-03-08
**EXEC-SPEC:** EXEC-046 WS6

---

## SLO Targets

| Metric | Target | Status |
|--------|--------|--------|
| Aggregate BFF p95 | < 2s | PENDING |
| MEAS-001 (Theo Discrepancy) p95 | < 500ms | PENDING |
| MEAS-002 (Audit Correlation) p95 | < 500ms | PENDING |
| MEAS-003 (Rating Coverage) p95 | < 500ms | PENDING |
| MEAS-004 (Loyalty Liability) p95 | < 500ms | PENDING |

---

## Methodology

### Per-Query Benchmarks

Each query function's SQL will be run with `EXPLAIN (ANALYZE, BUFFERS, TIMING)` under RLS context.

**Minimum iterations:** 100 per query for statistically meaningful p95 calculation.

### Aggregate BFF Benchmark

`GET /api/v1/measurement/summary` with auth bearer token.

**Minimum iterations:** 200+

### Route Variants

1. Unfiltered request (baseline)
2. Pit-only request (includes pit → table resolution subquery + semantic validation)
3. Table-only request (includes casino-scope validation)
4. Pit + table request (includes mismatch validation + queries)

---

## MEAS-002 Risk Analysis

### Cartesian Fan-Out Mitigation

The `measurement_audit_event_correlation_v` view produces N×M×K rows per slip (one per combination of PFT × MTL × loyalty entries). All aggregation in `mapAuditCorrelationRows` uses Set-based `DISTINCT` counting:

- `COUNT(DISTINCT rating_slip_id)` for total slips
- `COUNT(DISTINCT pft_id)` for PFT count
- `COUNT(DISTINCT mtl_entry_id)` for MTL count
- `COUNT(DISTINCT loyalty_ledger_id)` for loyalty count

**Verification checklist:**
- [ ] Actual row count from view ≤ 2× `rating_slip` row count
- [ ] DISTINCT aggregation confirmed in mapper code (Set-based)
- [ ] No `COUNT(*)` used for correlation metrics
- [ ] Join order optimized (rating_slip as driving table)

### Escalation Sequence (if budget exceeded)

1. Verify `COUNT(DISTINCT ...)` correctly applied
2. Column pruning (SELECT only needed columns from view)
3. Aggregate pushdown (add WHERE filters before aggregation)
4. Index review (composite indexes on join columns)
5. Migration exception (last resort — file with benchmark evidence)

---

## MEAS-003 LATERAL Join Analysis

**Verification checklist:**
- [ ] LATERAL subquery uses index on `rating_slip` (not seq scan)
- [ ] `gaming_table_id` filter pushes down into view query
- [ ] Pit filter subquery (`floor_table_slot`) uses index on `pit_id`

---

## Connection Pool Impact

The BFF endpoint uses `Promise.allSettled` for 4 concurrent PostgREST connections per request.

- **Admin endpoint**: < 5 concurrent users expected
- **Max pool connections per request:** 4
- **Peak concurrent connections:** ~20 (5 users × 4 queries)
- **Assessment:** Within standard Supabase pool limits (default: 200)

---

## EXPLAIN ANALYZE Results

> **TODO:** Run EXPLAIN ANALYZE against live database and record results below.

### MEAS-001: Theo Discrepancy

```sql
-- PENDING: Run against live DB
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT ...
FROM rating_slip
WHERE casino_id = '<casino_id>'
  AND legacy_theo_cents IS NOT NULL;
```

### MEAS-002: Audit Correlation

```sql
-- PENDING: Run against live DB
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT *
FROM measurement_audit_event_correlation_v
WHERE casino_id = '<casino_id>';
```

### MEAS-003: Rating Coverage

```sql
-- PENDING: Run against live DB
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT *
FROM measurement_rating_coverage_v
WHERE casino_id = '<casino_id>';
```

### MEAS-004: Loyalty Liability

```sql
-- PENDING: Run against live DB
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT *
FROM loyalty_liability_snapshot
WHERE casino_id = '<casino_id>'
ORDER BY snapshot_date DESC
LIMIT 1;
```

---

## BFF Aggregate Benchmark Results

> **TODO:** Run curl benchmark against live endpoint

```bash
# Benchmark script (run against deployed environment)
for i in $(seq 1 200); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "https://<host>/api/v1/measurement/summary"
done | sort -n | awk 'NR==int(NR*0.95){print "p95: "$0"s"}'
```

---

## Index Recommendations

> **TODO:** Based on EXPLAIN ANALYZE results

---

## Conclusion

> **TODO:** Complete after running benchmarks against live database.
> Gate: Aggregate BFF p95 must be < 2s to pass.

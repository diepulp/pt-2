---
name: performance-engineer
description: >
  PT-2 performance engineering specialist for Supabase (Postgres/RLS/RPC) and API endpoints.
  This skill should be used when analyzing query performance, investigating slow queries,
  setting SLO targets, building benchmark harnesses, creating CI performance gates,
  investigating latency regressions, diagnosing performance issues, running Supabase
  advisors for performance linting, fixing InitPlan re-evaluation in RLS policies,
  auditing unused or missing indexes, or optimizing connection pooling. Also triggers on
  "why is this slow", "optimize query", "performance regression", "p95 latency",
  "EXPLAIN ANALYZE", "unused indexes", "unindexed foreign keys", or "RLS overhead".
  Produces EXPLAIN ANALYZE reports, index recommendations, and performance dashboards.
---

# Performance Engineer

PT-2 performance engineering specialist owning latency budgets, regression prevention, and query optimization for Supabase (Postgres 17 / RLS / RPC) and Next.js API endpoints.

## Quick Reference

| Task | Command |
|------|---------|
| Analyze slow query | `scripts/query_analyzer.py --sql "SELECT..." --conn $DATABASE_URL` |
| Monitor DB queries | `scripts/query_monitor.py --database-url $DATABASE_URL --top 20` |
| Analyze RLS overhead | `scripts/query_monitor.py --database-url $DATABASE_URL --rls-overhead` |
| Check pool stats | `scripts/query_monitor.py --database-url $DATABASE_URL --pool-stats` |
| Run benchmark suite | `scripts/benchmark.py --suite api --iterations 100 --correlation-id pr-123` |
| Check SLO compliance | `scripts/benchmark.py --suite api --slo-file .perf/slos.json` |
| CI regression gate | `scripts/benchmark.py --threshold 10 --baseline .perf/baseline.json --fail-on-slo` |

## Supabase MCP — First-Line Diagnostics

When the Supabase MCP is authenticated, **start every investigation here**:

```
get_advisors(project_id, type="performance")  → InitPlan issues, unused indexes, unindexed FKs, duplicate indexes
get_advisors(project_id, type="security")     → mutable search_path, exposed materialized views
execute_sql(project_id, query)                → run EXPLAIN ANALYZE against remote DB
```

Run `get_advisors` after any migration or schema change. The performance advisor catches:
- **auth_rls_initplan** (WARN) — `current_setting()` re-evaluated per-row instead of cached
- **unindexed_foreign_keys** (INFO) — missing indexes on FK columns causing slow JOINs
- **unused_index** (INFO) — indexes consuming write overhead with no read benefit
- **duplicate_index** (WARN) — identical indexes wasting storage
- **multiple_permissive_policies** (WARN) — OR'd policies widening access + adding planning cost

## RLS Context in PT-2 (ADR-015 / ADR-024)

PT-2 uses `app.casino_id` (not `app.current_casino_id`) for casino-scoped RLS. Context is set via:

- **`set_rls_context_from_staff()`** — derives context from JWT `staff_id` claim + staff table lookup (ADR-024)
- **`SET LOCAL`** — sets `app.actor_id`, `app.casino_id`, `app.staff_role` (pooler-safe)
- **Pattern C hybrid** — `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)`

The **InitPlan subselect pattern** is critical for performance:

```sql
-- BAD: re-evaluated per-row (57 policies have this issue as of 2026-04-02)
USING (casino_id = current_setting('app.casino_id', true)::uuid)

-- GOOD: cached as InitPlan, evaluated once per query
USING (casino_id = (SELECT current_setting('app.casino_id', true)::uuid))
```

This is the single highest-impact performance fix across the database — it affects every query on 27+ tables.

---

## Core Workflows

### 1. Query Performance Investigation

1. **Run Supabase MCP `get_advisors`** to catch systemic issues first
2. **Capture baseline metrics** using the benchmark harness
3. **Run EXPLAIN ANALYZE** on suspected slow queries
4. **Analyze the query plan** for sequential scans, high row estimates, or nested loops
5. **Check RLS overhead** by comparing with/without policy enforcement
6. **Recommend fixes** (indexes, query rewrites, InitPlan wrapping, caching)

```bash
python scripts/query_analyzer.py \
  --sql "SELECT * FROM visits WHERE player_id = $1" \
  --params '["uuid-here"]' \
  --conn "$DATABASE_URL"
```

### 2. Database Query Monitoring (pg_stat_statements)

```bash
# Top 20 queries by execution time
python scripts/query_monitor.py --database-url $DATABASE_URL --top 20

# Analyze with RLS overhead assessment
python scripts/query_monitor.py --database-url $DATABASE_URL --top 10 --rls-overhead

# Check connection pool utilization
python scripts/query_monitor.py --database-url $DATABASE_URL --pool-stats

# Export analysis for dashboard integration
python scripts/query_monitor.py --database-url $DATABASE_URL \
  --top 50 --csv-output monthly-queries.csv --json-output trends.json
```

**Key Metrics Tracked:**
- Mean execution time and deviation
- Cache hit ratio and buffer efficiency
- Calls per query pattern
- RLS policy overhead assessment
- Connection pool utilization

### 3. SLO Compliance & Benchmarking

```bash
# Run benchmark suite with SLO checking
python scripts/benchmark.py --suite api --slo-file .perf/slos.json --dump-audit audit.json

# Compare against baseline
python scripts/benchmark.py --suite api --baseline .perf/baseline.json

# CI mode: fail on regression OR SLO violation
python scripts/benchmark.py --suite api --baseline .perf/baseline.json --fail-on-slo
```

**Benchmark suites:** `api` (endpoint latency), `db` (SQL/RPC/PostgREST), `e2e` (critical flows)

**Standard SLO tiers:**

| Tier | p50 | p95 | p99 | Use Case |
|------|-----|-----|-----|----------|
| Fast | <50ms | <100ms | <200ms | Simple reads, cached data |
| Standard | <100ms | <250ms | <500ms | CRUD operations, joins |
| Complex | <250ms | <500ms | <1000ms | Aggregations, reports |
| Background | <1000ms | <2000ms | <5000ms | Batch operations |

### 4. SLO Definition

1. Read `references/slo-definitions.md` for standard targets
2. Categorize endpoint by type (read-heavy, write-heavy, aggregation)
3. Set appropriate p50/p95/p99 targets
4. Add endpoint to benchmark suite
5. Configure CI gate thresholds

## Temporal Performance Anti-Pattern (TEMP-003, PRD-027)

### P0 Incident: JS Gaming Day Bypass

A performance optimization replaced the canonical `useGamingDay()` → RPC path with pure-JS `getCurrentGamingDay()` using `new Date().toISOString().slice(0, 10)` (UTC). After UTC midnight (4 PM Pacific), JS returned tomorrow's date while the DB still considered today the current gaming day. Every Player 360 financial panel showed $0.

**Lesson:** Performance optimizations that bypass shared hooks/RPCs must not replace DB-derived values with JS date math. The RPC latency is negligible (< 5ms). JS date math saves nothing and risks a P0 regression.

**References:** `docs/20-architecture/temporal-patterns/INDEX.md`, `docs/issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md`

---

## KPI Dashboard

### API Endpoint KPIs
- **Latency**: p50 / p95 / p99 response times
- **Error rate**: % non-2xx responses, timeouts
- **Throughput**: max sustainable RPS at target p95
- **DB time ratio**: DB time / total time

### Supabase/Postgres KPIs
- **Query execution time**: distribution across percentiles
- **Cache hit ratio**: buffer cache effectiveness (target >95%)
- **RLS overhead**: policy enforcement cost (target <20% for simple tenant filter)
- **Connection pool saturation**: queued requests, latency spikes (target <70% utilization)
- **InitPlan compliance**: % of RLS policies using subselect wrapper

### End-to-End Flow KPIs
- **Slip lifecycle**: open → update → close path latency
- **Player search**: search → open visit → view ledger flow
- **Table operations**: table assignment, player movement

---

## Performance Review Checklist

For PR reviews involving database or API changes:

- [ ] New queries have EXPLAIN ANALYZE output attached
- [ ] Indexes exist for WHERE/JOIN columns
- [ ] No N+1 query patterns introduced
- [ ] RLS policies use `(SELECT current_setting(...))` subselect wrapper
- [ ] Functions include `SET search_path = ''`
- [ ] Benchmark results show no p95 regression >10%
- [ ] Connection pooling implications considered
- [ ] Batch operations preferred over loops
- [ ] **No JS gaming day computation** replacing DB RPCs (TEMP-003)

See `references/pr-checklist.md` for detailed checklist.

## Resources

### scripts/

| Script | Purpose |
|--------|---------|
| `benchmark.py` | Benchmarking harness with SLO checking, audit emission, correlation tracking |
| `query_monitor.py` | pg_stat_statements analysis — top queries, RLS overhead, pool stats |
| `query_analyzer.py` | EXPLAIN ANALYZE runner with optimization recommendations |
| `ci_gate.py` | CI integration gate with SLO-aware regression detection |

### references/

| Reference | When to Load |
|-----------|--------------|
| `slo-definitions.md` | Setting SLO targets, classifying endpoints |
| `query-patterns.md` | Query optimization, anti-patterns, index strategy |
| `rls-performance.md` | RLS overhead analysis, InitPlan pattern, SECURITY DEFINER |
| `pr-checklist.md` | PR performance review (copy checklist into PR description) |

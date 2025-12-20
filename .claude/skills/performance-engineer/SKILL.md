---
name: performance-engineer
description: PT-2 performance engineering specialist for Supabase (Postgres/RLS/RPC) and API endpoints. This skill should be used when analyzing query performance, setting SLO targets, building benchmark harnesses, creating CI performance gates, or investigating latency regressions. Produces EXPLAIN ANALYZE reports, index recommendations, and performance dashboards. Follows OPS/SRE standards per OBSERVABILITY_SPEC.md §3.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, Task, WebFetch
tags: [OPS/SRE, PERFORMANCE, SLO, BENCHMARKING]
---

# Performance Engineer

PT-2 performance engineering specialist owning latency budgets, regression prevention, and query optimization for Supabase (Postgres/RLS/RPC) and Next.js API endpoints.

## Quick Reference

| Task | Command |
|------|---------|
| Analyze slow query | `scripts/query_analyzer.py --sql "SELECT..." --conn $DATABASE_URL` |
| Monitor DB queries | `scripts/query_monitor.py --database-url $DATABASE_URL --top 20`|
| Analyze RLS overhead | `scripts/query_monitor.py --database-url $DATABASE_URL --rls-overhead`|
| Check pool stats | `scripts/query_monitor.py --database-url $DATABASE_URL --pool-stats`|
| Run benchmark suite | `scripts/benchmark.py --suite api --iterations 100 --correlation-id pr-123` |
| Check SLO compliance | `scripts/benchmark.py --suite api --slo-file .perf/slos.json` |
| CI regression gate | `scripts/benchmark.py --threshold 10 --baseline .perf/baseline.json --fail-on-slo` |
| Generate report | `scripts/benchmark.py --report --output perf-report.md --dump-audit audit.json` |

## When to Invoke This Skill

- Investigating slow API endpoints or database queries (OBSERVABILITY_SPEC §3.1)
- Setting up SLO targets for new endpoints (SRM §1576)
- Creating benchmark baselines before optimization
- Adding CI gates to prevent performance regressions
- Analyzing EXPLAIN plans and recommending indexes
- Auditing RLS policy overhead
- Reviewing connection pooling behavior
- Verifying compliance with p95/p99 SLOs per OBSERVABILITY_SPEC
- Associating performance tests with correlation-IDs for tracing
- Ensuring SLO budget management per error budget policy

## Core Workflows

### 1. Query Performance Investigation

To investigate a slow query or endpoint:

1. **Capture baseline metrics** using the benchmark harness
2. **Run EXPLAIN ANALYZE** on suspected slow queries
3. **Analyze the query plan** for sequential scans, high row estimates, or nested loops
4. **Check RLS overhead** by comparing with/without policy enforcement
5. **Recommend fixes** (indexes, query rewrites, caching)

```bash
# Analyze a specific query
python scripts/query_analyzer.py \
  --sql "SELECT * FROM visits WHERE player_id = $1" \
  --params '["uuid-here"]' \
  --conn "$DATABASE_URL"
```

**Output includes:**
- Execution time breakdown (planning vs execution)
- Row estimates vs actual rows
- Index usage and sequential scan detection
- Buffer cache hit ratio
- Recommendations based on plan analysis

### 2. Database Query Monitoring (pg_stat_statements)

Continuous monitoring of query performance using pg_stat_statements (OBSERVABILITY_SPEC §3.8):

```bash
# Top 20 queries by execution time
python scripts/query_monitor.py --database-url $DATABASE_URL --top 20

# Analyze with RLS overhead assessment
python scripts/query_monitor.py --database-url $DATABASE_URL --top 10 --rls-overhead

# Check connection pool utilization
python scripts/query_monitor.py --database-url $DATABASE_URL --pool-stats

# Generate audit event for performance review
python scripts/query_monitor.py --database-url $DATABASE_URL --top 5 --audit audit.json
```

**Key Metrics Tracked:**
- Mean execution time and deviation
- Cache hit ratio and buffer efficiency
- Calls per query pattern
- Cost per row analysis
- RLS policy overhead assessment (OBSERVABILITY_SPEC §3.119)
- Connection pool utilization (OBSERVABILITY_SPEC §3.105)

**Integration with SLOs:**
- Flag queries exceeding 5ms for PK lookups
- Alert on range scans >25ms
- Track queries with <90% cache hit ratio

### 3. SLO Compliance Checking

To verify endpoints meet operational SLOs defined in OBSERVABILITY_SPEC §3:

```bash
# Run with SLO targets from file
python scripts/benchmark.py --suite api --slo-file .perf/slos.json

# Fail build on SLO violations (recommended for CI)
python scripts/benchmark.py --suite api --fail-on-slo --baseline .perf/baseline.json

# Custom SLO file format
```json
{
  "slos": [
    {
      "service": "RatingSlip",
      "operation": "UpdateTelemetry",
      "p95_target_ms": 80,
      "metric_name": "ratingslip_update_latency_p95",
      "alert_threshold_ms": 100
    }
  ]
}
```

**SLO Status Tracking:**
- Green: p95 within target (✅ All OK)
- Warning: p95 exceeds target (+20-50%)
- Critical: p95 significantly exceeds target (+50%+)
- Automatic audit emission with correlation ID for traceability

### 4. Database Monitoring Suite

Comprehensive DB performance analysis with pg_stat_statements integration (OBSERVABILITY_SPEC §3)

```bash
# Analyze top queries by execution time
python scripts/query_monitor.py --database-url $DATABASE_URL --top 20 --format json

# Check RLS overhead for tenant queries
python scripts/query_monitor.py --database-url $DATABASE_URL --rls-overhead --audit pls-audit.json

# Monitor connection pool health from OBSERVABILITY_SPEC §3.105
python scripts/query_monitor.py --database-url $DATABASE_URL --pool-stats

# Export analysis to CSV for dashboard integration
python scripts/query_monitor.py --database-url $DATABASE_URL \
  --top 50 --csv-output monthly-queries.csv --json-output trends.json
```

**pg_stat_statements Analysis:**
- Track query execution time trends
- Monitor buffer cache hit ratios
- Identify N+1 query patterns
- Analyze connection pool saturation
- Measure RLS policy overhead

### 5. Benchmark Harness

To establish performance baselines and detect regressions with SRE integration:

```bash
# Run full benchmark suite with correlation tracking
python scripts/benchmark.py --suite api --iterations 100 --correlation-id pr-123

# Run with SLO checking and audit emission
python scripts/benchmark.py --suite api --slo-file .perf/slos.json --dump-audit audit.json

# Compare against baseline with regression detection
python scripts/benchmark.py --suite api --baseline .perf/baseline.json

# Generate detailed report with SLO analysis
python scripts/benchmark.py --report --output perf-report.md --slo-file .perf/slos.json

# CI mode: fail on regression OR SLO violation
python scripts/benchmark.py --suite api --baseline .perf/baseline.json --fail-on-slo
```

# Compare against baseline
python scripts/benchmark.py --suite api --baseline .perf/baseline.json

# Generate markdown report
python scripts/benchmark.py --report --output perf-report.md
```

**Benchmark suites:**
- `api`: API endpoint latency (p50/p95/p99)
- `db`: Database query performance (SQL, RPC, PostgREST)
- `e2e`: Critical user flows (slip lifecycle, player search)

**SLO Integration:**
- Dynamic SLO checking against OBSERVABILITY_SPEC §3 targets
- Service-specific KPI tracking (RatingSlip, Loyalty, TableContext)
- Connection pool utilization monitoring
- Automatic audit event emission with correlation IDs

**React Query Timing:**
- Invalidate target: <100ms per query key set
- Integration with invalidation patterns per ADR-004
- State transition optimization


**Gate behavior:**
- Fails build if p95 latency increases >10% from baseline
- Fails build if any endpoint exceeds SLO target
- Generates diff report showing regressions

### 4. SLO Definition

To define performance targets for endpoints:

1. Read `references/slo-definitions.md` for standard targets
2. Categorize endpoint by type (read-heavy, write-heavy, aggregation)
3. Set appropriate p50/p95/p99 targets
4. Add endpoint to benchmark suite
5. Configure CI gate thresholds

**Standard SLO tiers:**

| Tier | p50 | p95 | p99 | Use Case |
|------|-----|-----|-----|----------|
| Fast | <50ms | <100ms | <200ms | Simple reads, cached data |
| Standard | <100ms | <250ms | <500ms | CRUD operations, joins |
| Complex | <250ms | <500ms | <1000ms | Aggregations, reports |
| Background | <1000ms | <2000ms | <5000ms | Batch operations |

## KPI Dashboard

Track these metrics for system health:

### API Endpoint KPIs
- **Latency**: p50 / p95 / p99 response times
- **Error rate**: % non-2xx responses, timeouts
- **Throughput**: max sustainable RPS at target p95
- **DB time ratio**: DB time / total time

### Supabase/Postgres KPIs
- **Query execution time**: distribution across percentiles
- **Selectivity**: rows scanned vs rows returned
- **Cache hit ratio**: buffer cache effectiveness
- **Lock waits / deadlocks**: contention indicators
- **RLS overhead**: policy enforcement cost
- **Connection pool saturation**: queued requests, latency spikes

### End-to-End Flow KPIs
- **Slip lifecycle**: open → update → close path latency
- **Player search**: search → open visit → view ledger flow
- **Table operations**: table assignment, player movement

## Performance Review Checklist

For PR reviews involving database or API changes:

- [ ] New queries have EXPLAIN ANALYZE output attached
- [ ] Indexes exist for WHERE/JOIN columns
- [ ] No N+1 query patterns introduced
- [ ] RLS policies use indexed predicates
- [ ] Benchmark results show no p95 regression >10%
- [ ] Connection pooling implications considered
- [ ] Batch operations preferred over loops

See `references/pr-checklist.md` for detailed checklist.

## Resources

| Verify CI progression | `python ci_gate.py --baseline .perf/baseline.json --threshold 10` |

### scripts/

| Script | Purpose | New Features |
|--------|---------|-------------|
| `benchmark.py` | Main benchmarking harness | SLO checking, audit emission, correlation tracking (OPS-PE-003) |
| `query_monitor.py` | pg_stat_statements analysis | Top queries, RLS overhead, pool stats (OPS-PE-004) |
| `ci_gate.py` | CI integration gate | SLO-aware regression detection (OPS-PE-005) |


### slos/

| SLO Config | Purpose |
|------------|---------|
| `slos-template.json` | Example SLO definitions per OBSERVABILITY_SPEC §3|
| `slos.json` | Production SLO configuration with server specifics|
| `baseline.json` | Performance regression detection thresholds|

### references/

| Reference | Purpose |
|-----------|---------|
| `slo-definitions.md` | Standard SLO targets by endpoint type |
| `query-patterns.md` | Query optimization patterns and anti-patterns |
| `rls-performance.md` | RLS-specific performance considerations |
| `pr-checklist.md` | Detailed PR performance review checklist |

## Memory Recording Protocol

This skill tracks execution outcomes to build performance pattern knowledge.

### Record Performance Analysis

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:performance-engineer")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="performance-engineer",
    task="Query optimization for visits table",
    outcome="success",
    pattern_used="Index addition + query rewrite",
    validation_results={
        "p95_before_ms": 450,
        "p95_after_ms": 85,
        "improvement_pct": 81
    },
    files_created=["supabase/migrations/xxx_add_visits_index.sql"],
    lessons_learned=["Composite index on (casino_id, player_id) critical for RLS"]
)
```

### Query Past Optimizations

```python
past_optimizations = memori.search_learnings(
    query="query optimization RLS",
    tags=["performance", "rls", "indexing"],
    category="skills",
    limit=5
)
```

## Top 10 Expensive Queries

Maintain a living document of the most expensive queries:

```sql
-- Query the pg_stat_statements extension
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

Update `docs/50-ops/TOP_10_QUERIES.md` weekly with current offenders.

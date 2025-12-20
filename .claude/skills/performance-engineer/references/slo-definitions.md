# SLO Definitions

Standard Service Level Objectives for PT-2 API endpoints and database operations.

## Latency Tiers

| Tier | p50 | p95 | p99 | Description |
|------|-----|-----|-----|-------------|
| **Fast** | <50ms | <100ms | <200ms | Simple reads, cached data, health checks |
| **Standard** | <100ms | <250ms | <500ms | CRUD operations, single-table queries with indexes |
| **Complex** | <250ms | <500ms | <1000ms | Multi-table joins, aggregations, reports |
| **Background** | <1000ms | <2000ms | <5000ms | Batch operations, exports, data migrations |

## Endpoint Classification

### Fast Tier Endpoints

```
GET /api/health
GET /api/tables/:id
GET /api/players/:id (by primary key)
GET /api/casino/current
```

**Characteristics:**
- Single-row lookups by primary key
- Cached or rarely-changing data
- No complex joins

### Standard Tier Endpoints

```
GET /api/players?search=...
GET /api/visits?table_id=...
GET /api/rating-slips?visit_id=...
POST /api/visits
PUT /api/rating-slips/:id
```

**Characteristics:**
- Filtered queries with indexed columns
- Single-table or simple JOIN operations
- Standard CRUD mutations

### Complex Tier Endpoints

```
GET /api/reports/daily-summary
GET /api/analytics/player-activity
GET /api/ledger/player/:id/history
```

**Characteristics:**
- Multi-table aggregations
- Date range queries over large datasets
- Computed/derived values

### Background Tier Operations

```
POST /api/export/players
POST /api/batch/close-visits
Scheduled jobs and cron tasks
```

**Characteristics:**
- Large dataset operations
- No user waiting for response
- Can be queued/async

## Error Rate Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| HTTP 5xx rate | <0.1% | >0.5% |
| Timeout rate | <0.01% | >0.1% |
| Database errors | <0.01% | >0.05% |

## Throughput Targets

| Scenario | Target RPS | Notes |
|----------|------------|-------|
| Single casino, normal load | 50 RPS | Typical operation |
| Single casino, peak (shift change) | 200 RPS | 4x normal |
| Multi-casino deployment | 500 RPS | Enterprise target |

## Database-Specific SLOs

### Query Execution Time

| Query Type | p95 Target | Max Acceptable |
|------------|------------|----------------|
| Point lookup (PK) | <5ms | <20ms |
| Indexed range scan | <25ms | <100ms |
| Full table scan | Avoid | <500ms if unavoidable |
| Aggregation | <100ms | <500ms |

### Buffer Cache

| Metric | Target | Alert |
|--------|--------|-------|
| Cache hit ratio | >95% | <90% |
| Shared buffers saturation | <80% | >90% |

### Connection Pool

| Metric | Target | Alert |
|--------|--------|-------|
| Pool utilization | <70% | >85% |
| Connection wait time | <10ms | >50ms |
| Idle connections | >20% of pool | <10% |

## RLS Overhead Budget

### Connection Pool Targets

Per OBSERVABILITY_SPEC §3.105-111:

| Metric | Target | Alert | Notes |
|--------|--------|-------|-------|
| Pool utilization | <70% | >85% | Prevent queuing spikes |
| Connection wait time | <10ms | >50ms | Indirect wait measurement |
| Idle connections | >20% of pool | <10% | Maintain cache efficiency |

**Connection Pool Monitoring:**
```sql
-- Check pool utilization
SELECT
  count(*) as total_conns,
  count(*) FILTER (WHERE state = 'idle') as idle_conns,
  ROUND(count(*) FILTER (WHERE state != 'idle') * 100.0 / count(*)) as active_pct
FROM pg_stat_activity
WHERE datname = current_database();
```

## React Query Invalidation Performance

For React Query optimization tracking:

- **Invalidate target**: <100ms per query key set
- **Broadcast throttle**: State-only transitions, 1-5s debounce for snapshots
- **Channel naming**: Follows `{casino_id}:{entity_type}:{entity_id}` pattern
- **Event correlation**: Links invalidation to performance profiles

## Error Budget Consumption

SLO violations consume monthly error budget:

- 99.9% availability = 43.2 minutes downtime/month
- 50% budget consumed in <50% of month triggers escalation
- SLO compliance failures count toward error budget

## Implementation Notes


| Scenario | Max Overhead |
|----------|--------------|
| Simple tenant filter | +10% |
| Role-based access | +20% |
| Complex policy with subquery | +50% |

If RLS overhead exceeds budget:
1. Ensure predicate columns are indexed
2. Simplify policy logic
3. Consider SECURITY DEFINER functions for complex checks

## Measurement Protocol

### How to Measure

1. **API Latency**: Measure from request received to response sent (server-side)
2. **DB Time**: Use `pg_stat_statements` for query timing
3. **E2E Time**: Playwright tests with `performance.now()` markers

### When to Measure

- **CI**: Every PR against baseline
- **Daily**: Automated benchmark on main branch
- **Weekly**: Full regression suite with reports

### Baseline Management

- Update baseline after intentional performance changes
- Baseline stored in `.perf/baseline.json`
- Annotate baseline updates in commit messages

## Alerting Rules

### P1 (Page immediately)

- p99 latency >5x SLO target for >5 minutes
- Error rate >5% for >2 minutes
- Database unreachable

### P2 (Page during business hours)

- p95 latency >2x SLO target for >15 minutes
- Error rate >1% for >10 minutes
- Connection pool saturation >95%

### P3 (Review next business day)

- p95 latency >1.5x SLO target
- Gradual latency increase trend
- Cache hit ratio decline

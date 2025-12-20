# Query Optimization Patterns

Patterns and anti-patterns for PostgreSQL query performance in PT-2.

## Index Strategy

### Essential Indexes

Every table should have indexes on:

1. **Primary key** (automatic)
2. **Foreign keys** (for JOIN performance)
3. **RLS predicate columns** (`casino_id` in most tables)
4. **Frequently filtered columns**

### Composite Index Rules

```sql
-- Good: Matches query filter order
CREATE INDEX idx_visits_casino_player
ON visits(casino_id, player_id);

-- For query:
SELECT * FROM visits WHERE casino_id = $1 AND player_id = $2;
```

**Column order matters:**
- Put equality conditions first
- Put range conditions last
- Match SELECT column order when possible

### Partial Indexes

For queries that filter on a constant value:

```sql
-- Good: Only indexes active visits
CREATE INDEX idx_visits_active
ON visits(player_id)
WHERE status = 'active';

-- Useful for:
SELECT * FROM visits WHERE status = 'active' AND player_id = $1;
```

### Covering Indexes

Include columns to avoid table lookups:

```sql
-- Good: Includes columns needed by SELECT
CREATE INDEX idx_players_search
ON players(last_name, first_name)
INCLUDE (player_id, email);

-- Enables index-only scan for:
SELECT player_id, first_name, last_name, email
FROM players
WHERE last_name LIKE 'Smi%';
```

## Query Anti-Patterns

### N+1 Queries

```typescript
// BAD: N+1 pattern
const visits = await getVisits();
for (const visit of visits) {
  visit.player = await getPlayer(visit.player_id);  // N additional queries!
}

// GOOD: Single query with JOIN
const visits = await supabase
  .from('visits')
  .select('*, player:players(*)');
```

### SELECT *

```sql
-- BAD: Fetches all columns
SELECT * FROM players WHERE casino_id = $1;

-- GOOD: Only needed columns
SELECT player_id, first_name, last_name, loyalty_tier
FROM players
WHERE casino_id = $1;
```

### Functions in WHERE

```sql
-- BAD: Prevents index usage
SELECT * FROM visits
WHERE DATE(created_at) = '2024-01-15';

-- GOOD: Range query uses index
SELECT * FROM visits
WHERE created_at >= '2024-01-15'
  AND created_at < '2024-01-16';
```

### LIKE with Leading Wildcard

```sql
-- BAD: Full table scan
SELECT * FROM players
WHERE email LIKE '%@gmail.com';

-- GOOD: Use trigram index or full-text search
CREATE INDEX idx_players_email_trgm
ON players USING gin(email gin_trgm_ops);
```

### Unbounded Queries

```sql
-- BAD: Could return millions of rows
SELECT * FROM audit_log WHERE event_type = 'login';

-- GOOD: Always paginate
SELECT * FROM audit_log
WHERE event_type = 'login'
ORDER BY created_at DESC
LIMIT 100 OFFSET 0;
```

## Join Optimization

### Join Order

PostgreSQL optimizes join order, but hints help:

```sql
-- Explicit join order with smaller table first
SELECT v.*, p.name
FROM visits v
INNER JOIN players p ON p.player_id = v.player_id
WHERE v.casino_id = $1
  AND v.created_at > NOW() - INTERVAL '1 day';
```

### Avoid Cross Joins

```sql
-- BAD: Accidental cross join
SELECT * FROM visits, players
WHERE visits.player_id = players.player_id;

-- GOOD: Explicit JOIN
SELECT * FROM visits
INNER JOIN players ON visits.player_id = players.player_id;
```

### EXISTS vs IN

```sql
-- GOOD for large subquery results: EXISTS
SELECT * FROM players p
WHERE EXISTS (
  SELECT 1 FROM visits v
  WHERE v.player_id = p.player_id
    AND v.created_at > NOW() - INTERVAL '30 days'
);

-- GOOD for small IN lists: IN
SELECT * FROM players
WHERE loyalty_tier IN ('gold', 'platinum', 'diamond');
```

## Aggregation Patterns

### Pre-aggregate When Possible

```sql
-- BAD: Aggregate on every request
SELECT player_id, SUM(amount) as total_play
FROM rating_slips
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY player_id;

-- GOOD: Maintain summary table
-- Updated via trigger or scheduled job
SELECT player_id, total_play_30d
FROM player_summary
WHERE casino_id = $1;
```

### Use Materialized Views

```sql
-- For expensive reports
CREATE MATERIALIZED VIEW mv_daily_summary AS
SELECT
  date_trunc('day', created_at) as day,
  casino_id,
  COUNT(*) as visit_count,
  SUM(total_play) as total_play
FROM visits
GROUP BY 1, 2;

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_summary;
```

## RLS-Aware Patterns

### Index RLS Predicate Columns

```sql
-- RLS policy
CREATE POLICY casino_isolation ON visits
USING (casino_id = current_setting('app.current_casino_id')::uuid);

-- MUST have index
CREATE INDEX idx_visits_casino ON visits(casino_id);
```

### Avoid RLS in Hot Paths

For high-frequency queries, consider SECURITY DEFINER functions:

```sql
CREATE FUNCTION get_player_visits(p_player_id uuid)
RETURNS SETOF visits
SECURITY DEFINER
AS $$
  SELECT * FROM visits
  WHERE player_id = p_player_id
    AND casino_id = current_setting('app.current_casino_id')::uuid;
$$ LANGUAGE sql;
```

### Test With and Without RLS

```sql
-- Temporarily disable for comparison
SET row_security = off;
EXPLAIN ANALYZE SELECT * FROM visits WHERE player_id = $1;

SET row_security = on;
EXPLAIN ANALYZE SELECT * FROM visits WHERE player_id = $1;
```

## Connection Pooling Patterns

### Session Variables

With transaction pooling, session variables don't persist:

```typescript
// BAD: SET persists in session mode only
await supabase.rpc('set_config', {
  setting: 'app.current_casino_id',
  value: casinoId
});

// GOOD: Pass context per-query or use RPC
await supabase.rpc('get_player_with_context', {
  p_player_id: playerId,
  p_casino_id: casinoId
});
```

### Statement Timeout

Always set statement timeout for long-running protection:

```sql
-- In connection setup
SET statement_timeout = '30s';

-- Or per-query
SELECT /*+ statement_timeout(5000) */ *
FROM expensive_view;
```

## EXPLAIN ANALYZE Checklist

When analyzing a slow query, check for:

1. **Seq Scan on large tables** → Add index
2. **Rows estimate vs actual** differ >10x → Run ANALYZE
3. **Nested Loop with high actual rows** → Consider hash join
4. **Sort with external disk** → Increase work_mem or add index
5. **Buffers: read >> hit** → Memory pressure, check shared_buffers
6. **Planning time >> execution time** → Query is fine, reduce planning overhead

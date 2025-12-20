# RLS Performance Guide

Row-Level Security performance considerations for PT-2's multi-tenant Supabase architecture.

## RLS Overhead Model

Every query with RLS enabled incurs:

1. **Policy evaluation** - Predicate check per row
2. **Context lookup** - `current_setting()` calls
3. **Subquery execution** - If policy uses subqueries

Typical overhead: 5-30% depending on policy complexity.

## Policy Design Principles

### 1. Use Indexed Predicates

```sql
-- GOOD: casino_id is indexed
CREATE POLICY casino_isolation ON visits
USING (casino_id = current_setting('app.current_casino_id')::uuid);

-- Ensure index exists
CREATE INDEX idx_visits_casino ON visits(casino_id);
```

```sql
-- BAD: Function call prevents index usage
CREATE POLICY check_access ON visits
USING (check_user_access(auth.uid(), casino_id));
```

### 2. Avoid Subqueries in Policies

```sql
-- BAD: Subquery executed per-row
CREATE POLICY role_based ON visits
USING (
  EXISTS (
    SELECT 1 FROM user_casino_roles
    WHERE user_id = auth.uid()
      AND casino_id = visits.casino_id
  )
);

-- GOOD: Store role in JWT claim, check directly
CREATE POLICY role_based ON visits
USING (
  casino_id = (current_setting('request.jwt.claims', true)::json->>'casino_id')::uuid
);
```

### 3. Combine Policies Efficiently

```sql
-- BAD: Multiple permissive policies (OR'd together)
CREATE POLICY p1 ON visits USING (is_admin());
CREATE POLICY p2 ON visits USING (casino_id = get_user_casino());
CREATE POLICY p3 ON visits USING (is_supervisor());

-- GOOD: Single policy with explicit logic
CREATE POLICY access_control ON visits
USING (
  is_admin()
  OR casino_id = (current_setting('request.jwt.claims', true)::json->>'casino_id')::uuid
);
```

## Context Injection Patterns

### Pattern A: JWT Claims (Preferred)

```sql
-- Extract from JWT set by Supabase Auth
CREATE POLICY tenant_isolation ON visits
USING (
  casino_id = (
    current_setting('request.jwt.claims', true)::json->>'casino_id'
  )::uuid
);
```

**Pros:** No extra query, validated by auth
**Cons:** Requires custom JWT claims setup

### Pattern B: Session Variable

```sql
-- Set via RPC at connection start
CREATE POLICY tenant_isolation ON visits
USING (
  casino_id = current_setting('app.current_casino_id', true)::uuid
);
```

```typescript
// Set context before queries
await supabase.rpc('set_context', { casino_id: casinoId });
```

**Pros:** Flexible, works with any auth
**Cons:** Extra RPC call, session pooling issues

### Pattern C: Function-Based

```sql
-- Lookup in auth context
CREATE OR REPLACE FUNCTION get_current_casino_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT casino_id FROM user_profiles
  WHERE user_id = auth.uid()
$$;

CREATE POLICY tenant_isolation ON visits
USING (casino_id = get_current_casino_id());
```

**Pros:** Always current
**Cons:** Query per policy evaluation

## Measuring RLS Overhead

### Compare With/Without RLS

```sql
-- Session 1: With RLS (default)
SET row_security = on;
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visits WHERE player_id = $1;

-- Session 2: Without RLS (superuser only)
SET row_security = off;
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visits WHERE player_id = $1;
```

### Check Policy Execution

```sql
-- View active policies
SELECT * FROM pg_policies WHERE tablename = 'visits';

-- Check if policy is being used
EXPLAIN (ANALYZE, VERBOSE)
SELECT * FROM visits LIMIT 10;
-- Look for "Filter:" lines showing policy predicate
```

## Optimization Techniques

### 1. SECURITY DEFINER Escape Hatch

For hot paths where RLS overhead is unacceptable:

```sql
CREATE FUNCTION get_active_visits_fast(p_casino_id uuid)
RETURNS SETOF visits
LANGUAGE sql
SECURITY DEFINER  -- Bypasses RLS
STABLE
AS $$
  SELECT * FROM visits
  WHERE casino_id = p_casino_id
    AND status = 'active';
$$;

-- Still validate caller has access!
REVOKE ALL ON FUNCTION get_active_visits_fast FROM public;
GRANT EXECUTE ON FUNCTION get_active_visits_fast TO authenticated;
```

**Warning:** Security Definer bypasses RLS. Always validate access in the function!

### 2. Materialized Views

For reports that aggregate across tenants:

```sql
-- View with RLS applied at creation
CREATE MATERIALIZED VIEW mv_casino_daily_stats AS
SELECT
  casino_id,
  date_trunc('day', created_at) as day,
  count(*) as visit_count
FROM visits
GROUP BY 1, 2;

-- RLS on the materialized view (not source table)
CREATE POLICY casino_access ON mv_casino_daily_stats
USING (casino_id = current_setting('app.current_casino_id')::uuid);
```

### 3. Denormalization

For complex policies requiring joins:

```sql
-- Instead of joining to check casino access
-- Store casino_id directly on child tables
ALTER TABLE rating_slips ADD COLUMN casino_id uuid;

-- Simple policy, no join needed
CREATE POLICY casino_access ON rating_slips
USING (casino_id = current_setting('app.current_casino_id')::uuid);
```

## Common Pitfalls

### 1. Missing Index on RLS Column

```sql
-- Policy uses casino_id
CREATE POLICY tenant_isolation ON visits
USING (casino_id = current_setting('app.current_casino_id')::uuid);

-- But no index! Full table scan per query.
-- ALWAYS add:
CREATE INDEX idx_visits_casino ON visits(casino_id);
```

### 2. current_setting Without Default

```sql
-- BAD: Throws error if not set
current_setting('app.current_casino_id')

-- GOOD: Returns NULL if not set
current_setting('app.current_casino_id', true)
```

### 3. Type Mismatch

```sql
-- BAD: String comparison when column is UUID
USING (casino_id::text = current_setting('app.current_casino_id'))

-- GOOD: Cast setting to UUID
USING (casino_id = current_setting('app.current_casino_id')::uuid)
```

### 4. Policy on Views

```sql
-- Views don't support RLS directly
-- RLS applies to underlying tables

-- If view joins multiple tables, ensure all have appropriate policies
CREATE VIEW visit_details AS
SELECT v.*, p.name as player_name
FROM visits v
JOIN players p ON v.player_id = p.player_id;

-- Both visits AND players need RLS policies
```

## Benchmarking RLS Impact

### Test Query Template

```sql
-- 1. Baseline (no RLS)
SET row_security = off;
\timing on
SELECT count(*) FROM visits WHERE player_id = 'test-uuid';
-- Note: X.XX ms

-- 2. With RLS
SET row_security = on;
SET app.current_casino_id = 'casino-uuid';
SELECT count(*) FROM visits WHERE player_id = 'test-uuid';
-- Note: Y.YY ms

-- 3. Calculate overhead
-- Overhead = (Y - X) / X * 100%
```

### Acceptable Overhead

| Query Type | Max RLS Overhead |
|------------|------------------|
| Point lookup | +10% |
| Range scan | +15% |
| Aggregation | +20% |
| Complex join | +30% |

If exceeding these thresholds:
1. Check index on RLS predicate column
2. Simplify policy logic
3. Consider SECURITY DEFINER function

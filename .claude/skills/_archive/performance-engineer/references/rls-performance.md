# RLS Performance Guide

Row-Level Security performance considerations for PT-2's multi-tenant Supabase architecture.

## PT-2 RLS Context Model (ADR-015 / ADR-024)

PT-2 uses these session variables for RLS, set via `SET LOCAL` (pooler-safe):

| Variable | Purpose | Set by |
|----------|---------|--------|
| `app.casino_id` | Casino tenant scope | `set_rls_context_from_staff()` |
| `app.actor_id` | Staff identity | `set_rls_context_from_staff()` |
| `app.staff_role` | Role for RBAC | `set_rls_context_from_staff()` |

Context is derived authoritatively from the JWT `staff_id` claim + staff table lookup (ADR-024). It is **not** user-provided — this prevents spoofing.

## InitPlan Subselect Pattern (Critical)

This is the single most impactful performance pattern in PT-2. Without the subselect wrapper, Postgres re-evaluates `current_setting()` for every row scanned. With it, the value is cached once per query.

```sql
-- BAD: re-evaluated per-row (Supabase advisor flags as auth_rls_initplan WARN)
CREATE POLICY casino_isolation ON visits
USING (casino_id = current_setting('app.casino_id', true)::uuid);

-- GOOD: cached as InitPlan, evaluated once per query
CREATE POLICY casino_isolation ON visits
USING (casino_id = (SELECT current_setting('app.casino_id', true)::uuid));
```

As of 2026-04-02, 57 policies across 27 tables lack the subselect wrapper. Fixing this is the highest-impact batch optimization available.

**How to detect:** Run Supabase MCP `get_advisors(type="performance")` and look for `auth_rls_initplan` entries.

## RLS Overhead Model

Every query with RLS enabled incurs:

1. **Policy evaluation** — predicate check per row (mitigated by InitPlan)
2. **Context lookup** — `current_setting()` calls (mitigated by subselect)
3. **Index scan** — if predicate column is indexed (ensure it is)

Typical overhead with InitPlan + index: 5-15%. Without InitPlan: 15-40%.

## Policy Design Principles

### 1. Use Indexed Predicates with InitPlan

```sql
-- Canonical PT-2 pattern
CREATE POLICY casino_isolation ON visits
USING (casino_id = (SELECT current_setting('app.casino_id', true)::uuid));

-- Ensure index exists
CREATE INDEX idx_visits_casino ON visits(casino_id);
```

### 2. Always Include auth.uid() Guard

All PT-2 policies include an authentication check:

```sql
CREATE POLICY visit_select ON visits FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND casino_id = (SELECT current_setting('app.casino_id', true)::uuid)
);
```

### 3. Avoid Subqueries in Policies

```sql
-- BAD: Subquery executed per-row
CREATE POLICY role_based ON visits
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE id = (SELECT current_setting('app.actor_id', true)::uuid)
      AND casino_id = visits.casino_id
  )
);

-- GOOD: Use session variable directly (already validated by set_rls_context_from_staff)
CREATE POLICY role_based ON visits
USING (
  casino_id = (SELECT current_setting('app.casino_id', true)::uuid)
);
```

### 4. Consolidate Permissive Policies

```sql
-- BAD: Multiple permissive policies (OR'd together, each evaluated)
CREATE POLICY p1 ON staff FOR UPDATE USING (is_admin());
CREATE POLICY p2 ON staff FOR UPDATE USING (id = (SELECT current_setting('app.actor_id', true)::uuid));

-- GOOD: Single policy with explicit logic
CREATE POLICY staff_update ON staff FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND (
    (SELECT current_setting('app.staff_role', true)) = 'pit_boss'
    OR id = (SELECT current_setting('app.actor_id', true)::uuid)
  )
);
```

## SECURITY DEFINER Escape Hatch

For hot paths where RLS overhead is unacceptable, use SECURITY DEFINER RPCs. These bypass RLS but must validate access internally.

```sql
CREATE OR REPLACE FUNCTION get_active_visits_fast(p_casino_id uuid)
RETURNS SETOF visits
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''  -- Prevent search-path hijacking
STABLE
AS $$
  SELECT * FROM public.visits
  WHERE casino_id = p_casino_id
    AND status = 'active';
$$;

-- Restrict access
REVOKE ALL ON FUNCTION get_active_visits_fast FROM public;
GRANT EXECUTE ON FUNCTION get_active_visits_fast TO authenticated;
```

Per ADR-018, SECURITY DEFINER functions must:
- Include `SET search_path = ''`
- Validate caller access internally
- Be explicitly granted (not public)
- Be documented in SEC-001 matrix

## Measuring RLS Overhead

### Compare With/Without RLS

```sql
-- With RLS (default for authenticated role)
SET row_security = on;
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visits WHERE player_id = $1;

-- Without RLS (superuser only — for measurement, not production)
SET row_security = off;
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visits WHERE player_id = $1;
```

### Acceptable Overhead

| Query Type | Max RLS Overhead |
|------------|------------------|
| Point lookup | +10% |
| Range scan | +15% |
| Aggregation | +20% |
| Complex join | +30% |

If exceeding these thresholds:
1. Verify InitPlan subselect wrapper is present
2. Check index on RLS predicate column
3. Simplify policy logic
4. Consider SECURITY DEFINER function

## Common Pitfalls

### 1. Missing Index on RLS Column

```sql
-- Policy uses casino_id but no index → full table scan per query
CREATE INDEX idx_visits_casino ON visits(casino_id);
```

### 2. current_setting Without Default

```sql
-- BAD: Throws error if not set
current_setting('app.casino_id')

-- GOOD: Returns empty string if not set
current_setting('app.casino_id', true)
```

### 3. Missing InitPlan Wrapper

```sql
-- BAD: Per-row evaluation
USING (casino_id = current_setting('app.casino_id', true)::uuid)

-- GOOD: Cached
USING (casino_id = (SELECT current_setting('app.casino_id', true)::uuid))
```

### 4. Missing search_path on Functions

```sql
-- BAD: Supabase advisor flags as function_search_path_mutable WARN
CREATE FUNCTION compute_gaming_day() ...

-- GOOD:
CREATE FUNCTION compute_gaming_day()
...
SET search_path = ''
AS $$ ... $$;
```

### 5. Type Mismatch

```sql
-- BAD: String comparison when column is UUID
USING (casino_id::text = current_setting('app.casino_id'))

-- GOOD: Cast setting to UUID
USING (casino_id = (SELECT current_setting('app.casino_id', true)::uuid))
```

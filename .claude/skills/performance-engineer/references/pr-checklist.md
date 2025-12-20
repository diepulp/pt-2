# Performance PR Checklist

Use this checklist when reviewing PRs that involve database schema changes, new queries, API endpoints, or performance-sensitive code paths.

## Quick Checklist

Copy this into PR description for tracking:

```markdown
## Performance Checklist

### Database Changes
- [ ] New queries have EXPLAIN ANALYZE output attached
- [ ] Indexes exist for all WHERE/JOIN columns
- [ ] No N+1 query patterns introduced
- [ ] RLS policies use indexed predicates
- [ ] Migrations are backwards-compatible

### API Changes
- [ ] Endpoint classified by SLO tier (fast/standard/complex)
- [ ] Response payload size is bounded
- [ ] Pagination implemented for list endpoints
- [ ] No blocking operations in hot paths

### Performance Validation
- [ ] Benchmark results attached (before/after)
- [ ] No p95 regression >10% from baseline
- [ ] Memory usage verified (no leaks)
- [ ] Connection pooling implications considered

### N/A Sections
- [ ] Mark any non-applicable sections as N/A with reason
```

## Detailed Review Guide

### Database Schema Changes

#### New Tables

**Check:**
- [ ] Primary key defined (usually UUID)
- [ ] `casino_id` column for multi-tenancy
- [ ] `created_at` and `updated_at` timestamps
- [ ] Appropriate NOT NULL constraints
- [ ] Default values where sensible

**Indexes required:**
- [ ] Primary key (automatic)
- [ ] Foreign key columns
- [ ] `casino_id` (for RLS)
- [ ] Any column used in WHERE clauses

**RLS:**
- [ ] Policy created for new table
- [ ] Policy uses indexed column
- [ ] Both SELECT and INSERT/UPDATE/DELETE policies

#### New Columns

**Check:**
- [ ] Column is NOT NULL with default OR allows NULL for backfill
- [ ] Type is appropriate (avoid TEXT for structured data)
- [ ] No breaking change to existing queries

**If filterable:**
- [ ] Index created
- [ ] ANALYZE run after data migration

### Query Changes

#### New Queries

**Attach EXPLAIN ANALYZE for:**
- [ ] Main query path
- [ ] Edge cases (empty result, max result)
- [ ] With realistic data volume

**Check query plan for:**
- [ ] No Seq Scan on tables >1000 rows
- [ ] Index usage on filtered columns
- [ ] Reasonable estimated vs actual rows
- [ ] No Sort with external disk

**Query patterns:**
- [ ] Explicit column list (no SELECT *)
- [ ] LIMIT on all list queries
- [ ] Parameterized (no string concatenation)
- [ ] Uses EXISTS instead of COUNT for existence checks

#### Modified Queries

**Check:**
- [ ] Before/after EXPLAIN comparison
- [ ] No regression in execution time
- [ ] Same or better row estimates

### API Endpoints

#### New Endpoints

**Classification:**
- [ ] Identified SLO tier (fast/standard/complex/background)
- [ ] Documented expected latency
- [ ] Added to benchmark suite

**Implementation:**
- [ ] Input validation (reject early)
- [ ] Response pagination (max 100 items default)
- [ ] Error handling (don't expose internal errors)
- [ ] Appropriate caching headers

**Database access:**
- [ ] Single query preferred over multiple
- [ ] Joins preferred over multiple round-trips
- [ ] Uses select() with specific columns

#### Modified Endpoints

**Check:**
- [ ] Backwards compatible response format
- [ ] No new required parameters
- [ ] Performance baseline comparison

### Code Patterns

#### React/Frontend

**Check:**
- [ ] No unnecessary re-renders
- [ ] Large lists use virtualization
- [ ] Images lazy-loaded
- [ ] Bundle size impact checked

**Data fetching:**
- [ ] Uses React Query for server state
- [ ] Appropriate staleTime/cacheTime
- [ ] No waterfalls (parallel fetches)

#### Server Actions / API Routes

**Check:**
- [ ] Streaming for large responses
- [ ] No blocking calls in hot paths
- [ ] Proper error boundaries
- [ ] Timeout configured

### Performance Testing

#### Before Merging

**Run:**
```bash
# Benchmark current branch
python scripts/benchmark.py --suite api --save-baseline .perf/pr-$(git rev-parse --short HEAD).json

# Compare to main
python scripts/ci_gate.py --current .perf/pr-*.json --baseline .perf/main.json --threshold 10
```

**Attach results showing:**
- [ ] All endpoints within SLO
- [ ] No regression >10% from main
- [ ] New endpoints baselined

#### For Significant Changes

**Additional testing:**
- [ ] Load test with k6 or similar
- [ ] Memory profiling (no leaks)
- [ ] Database connection monitoring

### Red Flags

**Immediate concerns requiring discussion:**

1. **Seq Scan on large table** - Always needs index
2. **N+1 in loop** - Must use JOIN or batch
3. **Unbounded query** - Must add LIMIT
4. **RLS on unindexed column** - Performance disaster
5. **Nested loops with >100 actual rows** - Query rewrite needed
6. **External sort** - Memory or index issue

### Approval Criteria

**Ready to merge when:**

1. All applicable checklist items checked
2. EXPLAIN ANALYZE attached for new/modified queries
3. Benchmark shows no regression >10%
4. New endpoints have SLO classification
5. RLS policies are indexed
6. No red flags unaddressed

**Needs discussion if:**

1. Intentional performance tradeoff
2. New query pattern not in guidelines
3. Schema change affecting many queries
4. Significant benchmark regression with justification

## Sample PR Comments

### Good Performance

```markdown
Performance looks good!

- Query uses index scan on `visits(casino_id, player_id)`
- Execution time: 12ms (within Standard tier SLO)
- RLS overhead: 8% (acceptable)
- Benchmark: p95 unchanged from baseline
```

### Needs Work

```markdown
Performance concerns:

1. Query at line 45 shows Seq Scan on `rating_slips`:
   ```
   Seq Scan on rating_slips  (cost=0.00..1234.56 rows=10000...)
   ```
   **Action needed:** Add index on `rating_slips(visit_id)`

2. N+1 pattern detected at line 78:
   ```typescript
   for (const visit of visits) {
     await getSlips(visit.id);  // Separate query per visit
   }
   ```
   **Action needed:** Use JOIN or batch query

Please address before merging.
```

### Acceptable Tradeoff

```markdown
Noted performance tradeoff:

- New aggregation query takes 450ms (Complex tier)
- This is for admin-only reporting feature
- Acceptable given usage pattern (<10 calls/day)
- Consider materialized view if usage increases

Approved with above caveat documented.
```

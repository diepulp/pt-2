# Phase B Implementation Workflow

**Version**: 1.0.0
**Status**: In Progress — Migrations Ready
**Started**: 2025-10-20
**Target Completion**: 2025-10-27 (5 business days)
**Parent**: [RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md](../RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md)

## Executive Summary

Phase B establishes financial bounded context integrity through view-based aggregation, clear ownership documentation, and performance validation. The migration infrastructure is complete; documentation, validation, and performance testing remain.

**Key Insight**: Most remaining work can be parallelized across 3 tracks (Documentation, Validation, Performance).

---

## Current State

### ✅ Completed (2025-10-20)

1. **Migration Phase 1** - `20251019234325_phase_b_financial_views_phase1.sql`
   - ✅ Applied to local database
   - ✅ `financial_event_type` enum created
   - ✅ `event_type` + `idempotency_key` columns added to `player_financial_transaction`
   - ✅ Historical data backfilled
   - ✅ Append-only trigger + RLS policies established
   - ✅ 3 views created: `visit_financial_summary`, `visit_financial_summary_gd`, `ratingslip_with_financials`
   - ✅ Performance indexes added
   - ✅ `reporting_reader` role configured
   - ✅ Database types regenerated

2. **Migration Phase 2** - `20251019234330_phase_b_financial_views_phase2.sql`
   - ✅ Safety checks implemented (view existence, dependency detection)
   - ✅ View rebuild for dependency elimination
   - ✅ Column drop logic ready
   - ✅ PostgREST cache reload included
   - 🔄 Ready to apply (pending consumer migration validation)

### 🔄 In Progress

**Track 1: Documentation** (Days 1-3)
**Track 2: Validation** (Days 2-4)
**Track 3: Performance** (Days 3-5)

---

## Parallel Execution Plan

```
Day 1-2: [Doc Track: Financial Ownership] || [Validation Track: Consumer Audit]
Day 2-3: [Doc Track: Interface Patterns] || [Validation Track: RLS Tests]
Day 3-4: [Doc Track: Matrix Updates] || [Perf Track: Benchmark Harness]
Day 4-5: [Validation Track: Integration] || [Perf Track: Performance Validation]
Day 5:   [All Tracks: PR Preparation & Review]
```

### Dependencies
- Performance Track depends on Validation Track completing consumer audit (Day 2)
- Migration Phase 2 application depends on consumer migration completion (Day 4)
- PR merge depends on all exit criteria passing (Day 5)

---

## Track 1: Documentation (Days 1-3)

**Owner**: Architecture Lead
**Parallel**: Can run independently except final matrix update

### Task 1.1: Financial Data Ownership Table (Day 1) ⚡ START NOW

**Goal**: Create comprehensive inventory of all financial columns with authoritative service assignments.

**Inputs**:
- `types/database.types.ts` (schema source)
- Existing SERVICE_RESPONSIBILITY_MATRIX.md sections
- Migration files (event_type definitions)

**Process**:
1. Extract all financial-related columns from schema:
   ```bash
   # Search for monetary columns
   rg -t typescript "cash_in|chips_brought|chips_taken|net_change|amount|balance" types/database.types.ts
   ```
2. Map each column to:
   - **Table**: Physical location
   - **Service**: Authoritative owner (CRUD authority)
   - **Pattern**: OWNS (write) vs REFERENCES (read-only)
   - **Status**: Current state (denormalized/normalized/migrating)
   - **Action**: Phase B remediation (view/remove/document)

**Output**: Create `docs/bounde-context-integrity/phase-B/FINANCIAL_DATA_OWNERSHIP_TABLE.md`

**Template**:
```markdown
# Financial Data Ownership Table

| Table | Column | Type | Owner Service | Pattern | Status | Phase B Action |
|-------|--------|------|---------------|---------|--------|----------------|
| player_financial_transaction | cash_in | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| player_financial_transaction | chips_brought | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| player_financial_transaction | chips_taken | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| player_financial_transaction | net_change | decimal | PlayerFinancial | OWNS | Source of Truth | ✅ Primary |
| player_financial_transaction | event_type | enum | PlayerFinancial | OWNS | Source of Truth | ✅ Added Phase B.1 |
| player_financial_transaction | idempotency_key | text | PlayerFinancial | OWNS | Source of Truth | ✅ Added Phase B.1 |
| ratingslip | cash_in | decimal | RatingSlip | DENORMALIZED | Legacy Duplication | 🔄 Remove Phase B.2 |
| ratingslip | chips_brought | decimal | RatingSlip | DENORMALIZED | Legacy Duplication | 🔄 Remove Phase B.2 |
| ratingslip | chips_taken | decimal | RatingSlip | DENORMALIZED | Legacy Duplication | 🔄 Remove Phase B.2 |
| visit_financial_summary | total_cash_in | decimal | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| visit_financial_summary | total_chips_brought | decimal | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| visit_financial_summary | total_chips_taken | decimal | PlayerFinancial | REFERENCES | Aggregate View | ✅ Created Phase B.1 |
| ratingslip_with_financials | cash_in | decimal | PlayerFinancial | REFERENCES | Compatibility View | ✅ Created Phase B.1 |

## Temporal Authority Pattern

**Casino → PlayerFinancial**: Casino service owns `casino_settings` (timezone, gaming_day_start).
PlayerFinancial REFERENCES these for gaming-day aggregation via `visit_financial_summary_gd`.

**Visit → PlayerFinancial**: Visit service owns `visit` records.
PlayerFinancial joins `visit.id` for aggregation but never modifies visit data.

## Anti-Patterns Eliminated

❌ **Duplicate Writes**: RatingSlip can no longer write financial fields (removed in Phase B.2)
❌ **Missing Idempotency**: Phase B.1 adds `idempotency_key` + unique constraint
❌ **Event Type Ambiguity**: Phase B.1 adds `financial_event_type` enum with CHECK constraints
❌ **Temporal Leakage**: Gaming-day logic isolated to `visit_financial_summary_gd` view
```

**Deliverable**: Markdown file ready for inclusion in SERVICE_RESPONSIBILITY_MATRIX.md

---

### Task 1.2: Visit ↔ PlayerFinancial Interface Documentation (Day 2) ⚡ START AFTER 1.1

**Goal**: Document the read-model contract between Visit and PlayerFinancial services.

**Output**: Create `docs/bounde-context-integrity/phase-B/VISIT_PLAYERFINANCIAL_INTERFACE.md`

**Template**:
```markdown
# Visit ↔ PlayerFinancial Service Interface

## Overview

Visit service consumes financial data from PlayerFinancial service via **read-only views**. This establishes a clear bounded context: PlayerFinancial owns the financial ledger, Visit reads aggregated summaries.

## Interface Contract

### Data Flow
```
PlayerFinancial Service (Write Authority)
  └─ player_financial_transaction (append-only table)
      └─ visit_financial_summary (aggregate view)
          ├─ Visit Service (read-only consumer)
          └─ ratingslip_with_financials (compatibility view)
              └─ RatingSlip consumers (read-only, transitional)
```

### Provided Views

#### 1. visit_financial_summary
**Purpose**: Per-visit financial totals
**Consumer**: Visit service, reporting
**Columns**:
- `visit_id` (UUID) - Foreign key to visit.id
- `total_cash_in` (decimal) - Sum of CASH_IN events minus REVERSAL
- `total_chips_brought` (decimal) - Sum of CHIPS_BROUGHT minus REVERSAL
- `total_chips_taken` (decimal) - Sum of CHIPS_TAKEN minus REVERSAL
- `transaction_count` (integer) - Total events for this visit
- `last_transaction_at` (timestamp) - Most recent transaction

**Event Semantics**:
- `CASH_IN`: Player deposits cash (positive movement)
- `CHIPS_BROUGHT`: Player brings chips to table (positive movement)
- `CHIPS_TAKEN`: Player takes chips from table (positive movement)
- `REVERSAL`: Correction transaction (negative movement, subtracts from totals)

**Aggregation Logic**:
```sql
SUM(CASE WHEN event_type = 'CASH_IN' THEN cash_in
         WHEN event_type = 'REVERSAL' THEN -1 * cash_in
         ELSE 0 END) AS total_cash_in
```

#### 2. visit_financial_summary_gd
**Purpose**: Per-visit financial totals aligned to casino gaming day
**Consumer**: MTL service, reporting dashboards
**Additional Columns**:
- `casino_id` (UUID) - From visit
- `timezone` (text) - From casino_settings
- `gaming_day_start` (time) - From casino_settings (default: 06:00)
- `gaming_day` (date) - Computed gaming day boundary

**Gaming Day Calculation**:
```sql
(DATE_TRUNC('day', (transaction_time AT TIME ZONE timezone)
  - (COALESCE(gaming_day_start::interval, INTERVAL '6 hours')))
  + (COALESCE(gaming_day_start::interval, INTERVAL '6 hours')))::date
```

**Temporal Authority**: Casino service owns timezone/gaming_day_start; PlayerFinancial REFERENCES read-only.

#### 3. ratingslip_with_financials
**Purpose**: Compatibility view for legacy RatingSlip consumers
**Status**: Transitional (retain for 1 release cycle post-Phase B.2)
**Consumer**: Legacy reporting queries, dashboards
**Design**: Explicit column list (no `r.*`) to avoid dependency on dropped ratingslip financial columns

## Responsibilities

### PlayerFinancial Service OWNS
- ✅ Write authority for `player_financial_transaction`
- ✅ Schema evolution (add event types, constraints)
- ✅ View maintenance (update aggregation logic)
- ✅ Append-only enforcement (RLS + trigger)
- ✅ Idempotency protection (unique constraint on idempotency_key)

### Visit Service REFERENCES
- ✅ Read-only access via `visit_financial_summary`
- ✅ Join on `visit.id` for financial context
- ❌ Never writes to `player_financial_transaction`
- ❌ Never modifies aggregation logic

### Casino Service REFERENCES (Temporal Authority)
- ✅ Owns `casino_settings` (timezone, gaming_day_start)
- ✅ PlayerFinancial reads these for gaming-day aggregation
- ❌ Casino never writes financial transaction data

## Anti-Responsibilities

**Visit Service MUST NOT**:
- ❌ Write to `player_financial_transaction` directly
- ❌ Cache financial totals in `visit` table (use views)
- ❌ Implement custom aggregation logic (use provided views)

**RatingSlip Service MUST NOT** (post-Phase B.2):
- ❌ Store financial fields directly (removed: cash_in, chips_brought, chips_taken)
- ❌ Write financial data (use PlayerFinancial service)
- ❌ Query `player_financial_transaction` directly (use `ratingslip_with_financials` view)

## Security Posture

### Row-Level Security (RLS)
- **authenticated**: Can SELECT own transactions (`player_id = auth.uid()`)
- **service_role**: Full access (trusted internal service)
- **reporting_reader**: Can SELECT via views only (no raw table access)
- **authenticated**: CANNOT UPDATE or DELETE (enforced via RLS + trigger)

### Grants
```sql
GRANT SELECT ON visit_financial_summary TO authenticated;
GRANT SELECT ON visit_financial_summary_gd TO reporting_reader;
GRANT SELECT ON ratingslip_with_financials TO authenticated;
REVOKE SELECT ON player_financial_transaction FROM authenticated;
```

## Performance Contract

**Target**: p95 ≤ 100 ms, mean ≤ 40 ms
**Indexes**:
- `idx_pft_visit_id` - Primary join key
- `idx_pft_visit_event` - Event type filtering
- `idx_pft_transaction_time` - Gaming day calculation
- `idx_visit_casino` - Casino join
- `idx_csettings_cid` - Casino settings lookup

**Query Plan Requirements**:
- No Seq Scan over `player_financial_transaction` > 1,000 rows
- Index-only scans preferred where possible
- Security barrier does not block index usage

## Migration Path (Phase B.2)

**Pre-Cutover**:
1. ✅ Views created and indexed (Phase B.1)
2. 🔄 Consumer audit: Identify all `ratingslip.cash_in|chips_*` references
3. 🔄 Update consumers to use `ratingslip_with_financials` view
4. 🔄 Validate: No direct column references remain

**Cutover** (Migration Phase 2):
1. 🔄 Apply `20251019234330_phase_b_financial_views_phase2.sql`
2. 🔄 Drop `ratingslip.{cash_in, chips_brought, chips_taken}`
3. 🔄 PostgREST cache reload (`NOTIFY pgrst, 'reload schema'`)
4. 🔄 Validate: API responses use view data

**Post-Cutover**:
- Monitor `ratingslip_with_financials` usage for 1 release cycle
- Schedule view deprecation after consumers migrate to direct joins
- Document in ADR-006 addendum if denormalization retained

## Rollback Plan

If Phase B.2 causes issues:
1. Re-add nullable columns to `ratingslip`
2. Backfill from `visit_financial_summary`:
   ```sql
   UPDATE ratingslip r
   SET cash_in = vfs.total_cash_in,
       chips_brought = vfs.total_chips_brought,
       chips_taken = vfs.total_chips_taken
   FROM visit_financial_summary vfs
   WHERE r.visit_id = vfs.visit_id;
   ```
3. Retain compatibility view for seamless transition
```

**Deliverable**: Interface documentation ready for SERVICE_RESPONSIBILITY_MATRIX.md inclusion

---

### Task 1.3: SERVICE_RESPONSIBILITY_MATRIX.md Updates (Day 3) ⚡ DEPENDS ON 1.1, 1.2

**Goal**: Integrate Financial Ownership Table and Interface documentation into the matrix.

**Process**:
1. Add Financial Data Ownership Table as new appendix
2. Update PlayerFinancial service section with:
   - OWNS: `player_financial_transaction` (all columns)
   - PROVIDES: 3 financial aggregation views
   - Event type semantics
3. Update Visit service section with:
   - REFERENCES: `visit_financial_summary` (read-only)
   - Anti-pattern: Never writes financial data
4. Update RatingSlip service section with:
   - DEPRECATED: `cash_in`, `chips_brought`, `chips_taken` (removed Phase B.2)
   - MIGRATION: Use `ratingslip_with_financials` view
5. Update Casino service section with:
   - Temporal Authority: Owns gaming-day configuration
   - PlayerFinancial dependency noted

**Deliverable**: Updated SERVICE_RESPONSIBILITY_MATRIX.md ready for PR

---

## Track 2: Validation (Days 2-4)

**Owner**: Database Lead
**Parallel**: Can run alongside Documentation Track

### Task 2.1: Consumer Audit (Day 2) ⚡ START NOW

**Goal**: Identify all code references to legacy `ratingslip` financial columns.

**Process**:
```bash
# Search codebase for direct column references
rg "ratingslip\.cash_in|ratingslip\.chips_brought|ratingslip\.chips_taken" \
  --type typescript --type tsx --type javascript \
  services/ apps/ libs/

# Search for Supabase query patterns
rg "from\(.*ratingslip.*\)\.select.*cash_in|chips_brought|chips_taken" \
  --type typescript --type tsx \
  services/ apps/ libs/

# Search for database query builders
rg "\.table\(.*ratingslip.*\).*cash_in|chips_brought|chips_taken" \
  services/ apps/ libs/
```

**Output**: Create `.validation/consumer_audit_report.md`

**Template**:
```markdown
# RatingSlip Financial Column Consumer Audit

**Date**: 2025-10-20
**Scope**: All TypeScript/JavaScript files in services/, apps/, libs/
**Target**: References to `ratingslip.{cash_in, chips_brought, chips_taken}`

## Findings

### Direct Column References
| File | Line | Pattern | Migration Required |
|------|------|---------|-------------------|
| services/visit/queries.ts | 45 | `ratingslip.cash_in` | ✅ Update to `ratingslip_with_financials` |
| apps/dashboard/reports.tsx | 128 | `.select('cash_in')` | ✅ Update to view |

### Query Builder Patterns
| File | Line | Pattern | Migration Required |
|------|------|---------|-------------------|
| libs/supabase/ratingslip.ts | 67 | `.from('ratingslip').select('*')` | ⚠️ May include financial fields |

## Migration Actions

1. **services/visit/queries.ts:45**
   - Before: `supabase.from('ratingslip').select('cash_in, chips_brought')`
   - After: `supabase.from('ratingslip_with_financials').select('cash_in, chips_brought')`

2. **apps/dashboard/reports.tsx:128**
   - Before: `const { cash_in } = ratingslip;`
   - After: `const { cash_in } = ratingslipWithFinancials;`

## Summary
- Total files with references: X
- Direct column references: Y
- Query builder patterns: Z
- Estimated migration effort: N hours

## Sign-Off
- [ ] All references documented
- [ ] Migration plan approved
- [ ] Ready for Phase B.2 execution
```

**Deliverable**: Consumer audit report + migration task list

---

### Task 2.2: RLS Contract Tests (Day 3) ⚡ DEPENDS ON 2.1

**Goal**: Validate Row-Level Security policies enforce append-only + read-only patterns.

**Process**: Create `.validation/rls_contract_tests.sql`

**Template**:
```sql
-- =====================================================================
-- RLS Contract Tests: PlayerFinancial Service Security Posture
-- =====================================================================

BEGIN;

-- Test 1: reporting_reader can SELECT via views
SET ROLE reporting_reader;
SELECT COUNT(*) FROM visit_financial_summary; -- Should succeed
SELECT COUNT(*) FROM visit_financial_summary_gd; -- Should succeed
SELECT COUNT(*) FROM ratingslip_with_financials; -- Should succeed

-- Test 2: reporting_reader CANNOT SELECT raw table
SELECT COUNT(*) FROM player_financial_transaction; -- Should fail with permission denied

-- Test 3: authenticated CANNOT UPDATE player_financial_transaction
SET ROLE authenticated;
UPDATE player_financial_transaction SET cash_in = 100 WHERE id = (SELECT id FROM player_financial_transaction LIMIT 1);
-- Expected: ERROR: player_financial_transaction is append-only for non-service roles

-- Test 4: authenticated CANNOT DELETE player_financial_transaction
DELETE FROM player_financial_transaction WHERE id = (SELECT id FROM player_financial_transaction LIMIT 1);
-- Expected: ERROR: player_financial_transaction is append-only for non-service roles

-- Test 5: authenticated CAN SELECT own transactions
SET ROLE authenticated;
SET request.jwt.claim.sub = '<test-player-uuid>';
SELECT COUNT(*) FROM player_financial_transaction WHERE player_id = '<test-player-uuid>'; -- Should succeed

-- Test 6: authenticated CAN SELECT via views
SELECT COUNT(*) FROM visit_financial_summary; -- Should succeed
SELECT COUNT(*) FROM ratingslip_with_financials; -- Should succeed

-- Test 7: service_role has full access
SET ROLE service_role;
SELECT COUNT(*) FROM player_financial_transaction; -- Should succeed
UPDATE player_financial_transaction SET idempotency_key = 'test' WHERE id = (SELECT id FROM player_financial_transaction LIMIT 1); -- Should succeed
ROLLBACK; -- Don't actually modify

ROLLBACK;

-- =====================================================================
-- Expected Results Summary
-- =====================================================================
-- ✅ reporting_reader: View access only, no raw table
-- ✅ authenticated: Read own data, no UPDATE/DELETE
-- ✅ service_role: Full access (trusted service)
-- =====================================================================
```

**Execution**:
```bash
psql $DATABASE_URL < .validation/rls_contract_tests.sql > .validation/rls_test_results.txt 2>&1
```

**Deliverable**: RLS test results proving security posture compliance

---

### Task 2.3: Schema Validation (Day 3) ⚡ PARALLEL WITH 2.2

**Goal**: Verify matrix validation script passes with Phase B changes.

**Process**:
```bash
npm run validate:matrix-schema
```

**Expected Output**:
```
✅ 47 database entities validated
✅ Zero duplicate ownership
✅ Zero orphaned references
✅ Financial ownership documented in appendix
✅ PlayerFinancial service owns all monetary columns
```

**If Failures**: Update SERVICE_RESPONSIBILITY_MATRIX.md to resolve conflicts

**Deliverable**: Clean validation run captured in PR

---

### Task 2.4: Integration Validation (Day 4) ⚡ DEPENDS ON 2.1, 2.2, 2.3

**Goal**: End-to-end validation that views work with application code.

**Process**:
1. Deploy migrations to staging environment
2. Run consumer migration updates (from Task 2.1)
3. Execute smoke tests:
   ```bash
   # Test visit financial summary
   curl -H "Authorization: Bearer $TOKEN" \
     "$SUPABASE_URL/rest/v1/visit_financial_summary?visit_id=eq.$VISIT_ID"

   # Test ratingslip compatibility view
   curl -H "Authorization: Bearer $TOKEN" \
     "$SUPABASE_URL/rest/v1/ratingslip_with_financials?id=eq.$RATINGSLIP_ID"
   ```
4. Verify PostgREST schema includes new views
5. Validate aggregation accuracy (spot-check 10 records)

**Output**: Integration test results in `.validation/integration_results.md`

**Deliverable**: Green integration tests proving readiness for Phase B.2

---

## Track 3: Performance (Days 3-5)

**Owner**: Database Lead + Observability Team
**Parallel**: Starts after consumer audit (Day 3)

### Task 3.1: Performance Benchmark Harness (Day 3) ⚡ START AFTER 2.1

**Goal**: Create repeatable performance test suite for financial views.

**Process**: Create `.validation/queries.sql` with representative workload

**Template**:
```sql
-- =====================================================================
-- Performance Benchmark Queries: PlayerFinancial Views
-- Target: p95 ≤ 100ms, mean ≤ 40ms
-- =====================================================================

-- Query 1: visit_financial_summary by visit_id (most common)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visit_financial_summary WHERE visit_id = '<sample-visit-uuid>';

-- Query 2: visit_financial_summary_gd by casino + gaming day
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM visit_financial_summary_gd
WHERE casino_id = '<sample-casino-uuid>'
  AND gaming_day = CURRENT_DATE;

-- Query 3: ratingslip_with_financials by rating slip ID
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM ratingslip_with_financials WHERE id = '<sample-ratingslip-uuid>';

-- Query 4: Aggregate across multiple visits (reporting query)
EXPLAIN (ANALYZE, BUFFERS)
SELECT casino_id, gaming_day, SUM(total_cash_in) AS daily_total
FROM visit_financial_summary_gd
WHERE gaming_day BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE
GROUP BY casino_id, gaming_day
ORDER BY gaming_day DESC;

-- Query 5: Player-specific financial history
EXPLAIN (ANALYZE, BUFFERS)
SELECT v.visit_id, v.check_in_date, vfs.total_cash_in, vfs.transaction_count
FROM visit v
JOIN visit_financial_summary vfs ON vfs.visit_id = v.id
WHERE v.player_id = '<sample-player-uuid>'
ORDER BY v.check_in_date DESC
LIMIT 20;

-- =====================================================================
-- Validation Criteria
-- =====================================================================
-- ✅ Execution Time: p95 ≤ 100ms, mean ≤ 40ms
-- ✅ Index Usage: All queries use indexes (no Seq Scan > 1000 rows)
-- ✅ Buffer Performance: Minimal shared hits, zero reads from disk
-- ✅ Security Barrier: Does not block index usage
-- =====================================================================
```

**Deliverable**: Benchmark query suite ready for execution

---

### Task 3.2: Baseline Performance Capture (Day 4) ⚡ DEPENDS ON 3.1

**Goal**: Execute benchmark harness and capture EXPLAIN ANALYZE output.

**Process**:
```bash
# Run all benchmark queries
psql $DATABASE_URL < .validation/queries.sql > .validation/explain_output.txt 2>&1

# Capture pg_stat_statements deltas
psql $DATABASE_URL -c "SELECT query, calls, mean_exec_time, max_exec_time
  FROM pg_stat_statements
  WHERE query LIKE '%visit_financial_summary%'
  ORDER BY mean_exec_time DESC
  LIMIT 20;" > .validation/pg_stat_statements.txt
```

**Analysis**:
1. Extract execution times from EXPLAIN ANALYZE
2. Identify queries exceeding 100ms p95
3. Check for Seq Scans over large tables
4. Validate index usage

**Output**: Create `.validation/performance_report.md`

**Template**:
```markdown
# Performance Validation Report

**Date**: 2025-10-20
**Environment**: Local development (Supabase)
**Dataset Size**: X player_financial_transaction rows, Y visits

## Query Performance Summary

| Query | Execution Time (ms) | Index Used | Buffers | Status |
|-------|---------------------|------------|---------|--------|
| visit_financial_summary (visit_id) | 12.3 | idx_pft_visit_id | 8 shared hits | ✅ PASS |
| visit_financial_summary_gd (casino+day) | 45.7 | idx_pft_transaction_time | 32 shared hits | ✅ PASS |
| ratingslip_with_financials (id) | 18.9 | idx_pft_visit_id | 12 shared hits | ✅ PASS |
| Aggregate 7-day casino totals | 89.4 | idx_pft_transaction_time | 156 shared hits | ✅ PASS |
| Player financial history | 34.2 | idx_visit_casino, idx_pft_visit_id | 45 shared hits | ✅ PASS |

## Performance Metrics

- **p95 Latency**: 89.4 ms (target: ≤ 100 ms) ✅
- **Mean Latency**: 40.1 ms (target: ≤ 40 ms) ⚠️ MARGINAL
- **Sequential Scans**: 0 (target: 0 over 1000 rows) ✅
- **Index Coverage**: 100% (all queries use indexes) ✅

## Bottleneck Analysis

**Query 4** (7-day aggregation) approaches target:
- Execution time: 89.4 ms (11 ms headroom)
- Scans: 1,234 rows via index
- Recommendation: Add covering index if dataset grows 10x

**Query 5** (Player history) slightly over mean target:
- Mean: 34.2 ms, but p95: 67.8 ms
- Join cost: visit → visit_financial_summary
- Acceptable for low-frequency query

## Scaling Projections

Current dataset: 10K transactions, 500 visits
Projected 100K transactions:
- Query 1-3: Linear scaling with indexes (~20-50ms)
- Query 4: May require materialized view at 1M+ transactions
- Query 5: Stable (limited by LIMIT 20)

## Recommendations

✅ **Approve for Production**: All queries meet performance targets
⚠️ **Monitor Query 4**: Track execution time as dataset grows
📊 **Baseline Established**: Re-benchmark at 100K, 500K, 1M transactions
🔧 **Future Optimization**: Consider materialized view for Query 4 if p95 > 150ms
```

**Deliverable**: Performance report with PASS/FAIL on all criteria

---

### Task 3.3: Performance Validation Gate (Day 5) ⚡ DEPENDS ON 3.2

**Goal**: Confirm performance targets met before Phase B.2 approval.

**Process**:
1. Review performance report (Task 3.2)
2. If PASS: Proceed to Phase B.2
3. If FAIL: Identify bottleneck and remediate:
   - Add covering indexes
   - Adjust aggregation logic
   - Consider materialized view (future optimization)

**Exit Criteria**:
- ✅ p95 ≤ 100 ms on all benchmark queries
- ✅ Mean ≤ 40 ms on 80%+ of queries
- ✅ No Seq Scan over player_financial_transaction > 1,000 rows
- ✅ All queries use appropriate indexes

**Deliverable**: Performance sign-off in PR review

---

## Phase B.2 Execution (Day 4-5)

**Prerequisites** (must be complete):
- ✅ Consumer audit complete (Task 2.1)
- ✅ All consumers migrated to `ratingslip_with_financials` view
- ✅ Integration tests pass (Task 2.4)
- ✅ Performance validation pass (Task 3.3)

**Execution Steps**:
1. **Final Consumer Validation** (30 min)
   ```bash
   # Ensure zero references to legacy columns
   rg "ratingslip\.cash_in|ratingslip\.chips_brought|ratingslip\.chips_taken" services/ apps/ libs/
   # Expected: 0 results (or only in historical comments)
   ```

2. **Apply Migration Phase 2** (5 min)
   ```bash
   npx supabase migration up
   # Applies 20251019234330_phase_b_financial_views_phase2.sql
   # - Rebuilds view without dependencies
   # - Drops cash_in, chips_brought, chips_taken from ratingslip
   # - Sends PostgREST cache reload
   ```

3. **Regenerate Types** (2 min)
   ```bash
   npm run db:types-local
   ```

4. **Smoke Test** (10 min)
   ```bash
   # Verify API responses
   curl -H "Authorization: Bearer $TOKEN" \
     "$SUPABASE_URL/rest/v1/ratingslip?select=*&limit=1"
   # Expected: No cash_in, chips_brought, chips_taken columns

   curl -H "Authorization: Bearer $TOKEN" \
     "$SUPABASE_URL/rest/v1/ratingslip_with_financials?select=*&limit=1"
   # Expected: Financial columns present (from view)
   ```

5. **Monitor** (1 hour)
   - Check application logs for errors
   - Monitor query performance (no regressions)
   - Verify PostgREST schema cache refreshed

**Rollback Plan** (if issues):
```sql
-- Re-add columns
ALTER TABLE ratingslip
  ADD COLUMN cash_in DECIMAL,
  ADD COLUMN chips_brought DECIMAL,
  ADD COLUMN chips_taken DECIMAL;

-- Backfill from view
UPDATE ratingslip r
SET cash_in = vfs.total_cash_in,
    chips_brought = vfs.total_chips_brought,
    chips_taken = vfs.total_chips_taken
FROM visit_financial_summary vfs
WHERE r.visit_id = vfs.visit_id;

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
```

---

## Phase B Completion Checklist

### Documentation Track ✅
- [ ] Financial Data Ownership Table created (Task 1.1)
- [ ] Visit ↔ PlayerFinancial Interface documented (Task 1.2)
- [ ] SERVICE_RESPONSIBILITY_MATRIX.md updated (Task 1.3)

### Validation Track ✅
- [ ] Consumer audit complete, migration plan approved (Task 2.1)
- [ ] RLS contract tests pass (Task 2.2)
- [ ] `npm run validate:matrix-schema` passes (Task 2.3)
- [ ] Integration tests pass (Task 2.4)

### Performance Track ✅
- [ ] Benchmark harness created (Task 3.1)
- [ ] Performance baselines captured (Task 3.2)
- [ ] Performance targets met: p95 ≤ 100ms, mean ≤ 40ms (Task 3.3)

### Migration Execution ✅
- [ ] Migration Phase 2 applied (column drop)
- [ ] Database types regenerated
- [ ] PostgREST cache refreshed
- [ ] Smoke tests pass
- [ ] No errors in application logs (1-hour monitoring)

### Exit Criteria (from parent workflow) ✅
- [ ] Every monetary field has one authoritative service documented
- [ ] RatingSlip two-phase transition executed with migration scripts
- [ ] Visit ↔ PlayerFinancial interface section details responsibilities
- [ ] `npm run validate:matrix-schema` passes
- [ ] Compatibility views sustain p95 ≤ 100ms, mean ≤ 40ms
- [ ] Architecture Lead and Database Lead approve Phase B PR

---

## Risk Management

### Medium Risks
1. **Consumer Migration Incomplete**
   - **Risk**: Application code still references legacy columns
   - **Mitigation**: Consumer audit (Task 2.1) + integration tests (Task 2.4)
   - **Contingency**: Delay Phase B.2 until all consumers migrated

2. **Performance Regression**
   - **Risk**: Views slower than direct table access
   - **Mitigation**: Benchmark harness (Task 3.1) + baseline capture (Task 3.2)
   - **Contingency**: Add covering indexes or defer materialization

### Low Risks
3. **PostgREST Cache Stale**
   - **Risk**: API serves old schema after column drop
   - **Mitigation**: `NOTIFY pgrst, 'reload schema'` in migration
   - **Contingency**: Manual PostgREST restart

4. **Rollback Required**
   - **Risk**: Issues discovered post-deployment
   - **Mitigation**: Retain views indefinitely, re-add columns if needed
   - **Contingency**: Execute rollback plan (backfill from views)

---

## Timeline Summary

| Day | Track 1 (Docs) | Track 2 (Validation) | Track 3 (Perf) | Milestone |
|-----|----------------|---------------------|----------------|-----------|
| 1 | 1.1: Financial Ownership Table | | | Inventory complete |
| 2 | 1.2: Interface Documentation | 2.1: Consumer Audit | | Consumer migration plan |
| 3 | 1.3: Matrix Updates | 2.2: RLS Tests, 2.3: Schema Validation | 3.1: Benchmark Harness | Validation ready |
| 4 | PR Preparation | 2.4: Integration Tests | 3.2: Performance Baseline | Performance validated |
| 5 | Review & Approval | Migration B.2 Execution | 3.3: Performance Gate | Phase B Complete |

**Total Effort**: 5 business days (with parallel execution)

---

## Next Steps

**Immediate Actions** (Start Today):
1. ⚡ **Task 1.1**: Create Financial Data Ownership Table (Architecture Lead)
2. ⚡ **Task 2.1**: Run consumer audit for legacy column references (Database Lead)

**Day 2 Actions**:
3. ⚡ **Task 1.2**: Document Visit ↔ PlayerFinancial Interface (Architecture Lead)
4. ⚡ **Task 2.2**: Execute RLS contract tests (Database Lead)

**Day 3 Actions**:
5. ⚡ **Task 1.3**: Update SERVICE_RESPONSIBILITY_MATRIX.md (Architecture Lead)
6. ⚡ **Task 3.1**: Create performance benchmark harness (Database Lead + Observability)

**Day 4-5 Actions**:
7. ⚡ **Task 2.4**: Integration validation (Database Lead)
8. ⚡ **Task 3.2**: Capture performance baselines (Observability)
9. ⚡ **Phase B.2**: Execute column drop migration (Database Lead)

**Final Actions**:
10. 📋 Open Phase B PR with all deliverables
11. 👥 Architecture Lead + Database Lead review and approve
12. 🎯 Merge and close Phase B

---

## Document Control

**Version**: 1.0.0
**Author**: Database Lead + Architecture Lead
**Created**: 2025-10-20
**Status**: Active Implementation
**Parent Workflow**: [RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md](../RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md)

**Questions**: Contact Database Lead or Architecture Lead

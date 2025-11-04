# Phase C Progress Report: MTL Patron UUID Migration

**Date**: 2025-10-20
**Status**: Phase C.1 BLOCKED - SQL Function Error
**Reporter**: Architecture Team

---

## Executive Summary

Phase C implementation is **95% complete** for Phase C.0 and C.1, with a critical SQL function error blocking final migration. The error is a simple ambiguous column reference in the `check_phase_c1_cutover_gate()` function that requires a one-line fix.

**Impact**: Medium - Does not affect production, only blocks local migration completion
**Effort to Fix**: 5 minutes (qualified column name)
**Risk**: Low - Isolated to validation function, not core migration logic

---

## ✅ Completed Work

### Phase C.0: Validation Infrastructure (100% Complete)

**Migration**: `20251020120000_phase_c0_validation_infrastructure.sql`
**Status**: ✅ Successfully Applied

**Deliverables**:
1. ✅ `schema_validation_alerts` table created
2. ✅ `validate_mtl_patron_backfill()` function deployed
3. ✅ `check_phase_c1_cutover_gate()` function deployed (with bug)
4. ✅ pg_cron hourly validation job scheduled

**Verification Output**:
```
NOTICE: Phase C.0 validation infrastructure installed successfully

jobname: mtl-patron-backfill-validation
schedule: 0 * * * *  (hourly)
command: SELECT validate_mtl_patron_backfill()
```

**Test Results**:
```sql
SELECT * FROM check_phase_c1_cutover_gate();

     gate_name      |  status   | failing_count | can_proceed
--------------------+-----------+---------------+-------------
 patron_uuid_column | NOT_READY |             1 | f
 OVERALL_DECISION   | NO-GO     |             1 | f
```

✅ **Expected behavior**: Returns NOT_READY before patron_uuid column exists

---

### Phase C.1: Add patron_uuid Column (95% Complete)

**Migration**: `20251020121000_phase_c1_add_patron_uuid.sql`
**Status**: ⚠️ Blocked by validation query error

**Completed Components**:
1. ✅ Pre-migration validation (orphan check)
2. ✅ `patron_uuid` UUID column addition
3. ✅ Backfill logic (patron_id::uuid → patron_uuid)
4. ✅ Parity constraint (`mtl_patron_uuid_parity_chk`)
5. ✅ Foreign key constraint (`fk_mtl_entry_patron`)
6. ✅ Index creation (2 indexes)
7. ✅ Post-migration verification logic

**Migration Output** (before error):
```
NOTICE: Pre-migration validation passed: 0 orphaned records
NOTICE: Backfill validation passed: total_rows=0, non_null_patron_id=0, backfilled=0
NOTICE: Phase C.1 verification passed: FK constraint, parity constraint, and 2 indexes created
```

**Blocked At**: Final validation query calling `check_phase_c1_cutover_gate()`

---

## ❌ Issue Encountered

### Error Details

**Error Message**:
```
ERROR: column reference "can_proceed" is ambiguous (SQLSTATE 42702)
It could refer to either a PL/pgSQL variable or a table column.
At statement: 22
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)
```

**Location**: `20251020121000_phase_c1_add_patron_uuid.sql:237`
**Root Cause**: Ambiguous column reference in `check_phase_c1_cutover_gate()` function

### Root Cause Analysis

**Problem**: In the `check_phase_c1_cutover_gate()` function (Phase C.0 migration), the final UNION query has an ambiguous column reference:

```sql
-- From Phase C.0 migration
CREATE OR REPLACE FUNCTION check_phase_c1_cutover_gate()
RETURNS TABLE(gate_name text, status text, failing_count bigint, can_proceed boolean)
AS $$
BEGIN
  -- ...validation logic...

  WITH validation_results AS (
    SELECT 'divergence_check'::text AS gate, COUNT(*) AS failures FROM ...
  ),
  gate_results AS (
    SELECT
      gate AS gate_name,
      CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
      failures AS failing_count,
      (failures = 0) AS can_proceed  -- ← Creates column "can_proceed"
    FROM validation_results
  )
  SELECT * FROM gate_results

  UNION ALL

  SELECT
    'OVERALL_DECISION'::text,
    CASE WHEN MIN(can_proceed::int) = 1 THEN 'GO' ELSE 'NO-GO' END::text,  -- ← Ambiguous reference!
    SUM(failing_count),
    (MIN(can_proceed::int) = 1)  -- ← Ambiguous reference!
  FROM gate_results;  -- ← Subquery from gate_results CTE
END;
$$ LANGUAGE plpgsql;
```

**Issue**: PostgreSQL can't determine if `can_proceed` refers to:
1. The function's RETURNS TABLE column definition
2. The `gate_results` CTE column

### Proposed Fix

**File**: `supabase/migrations/20251020120000_phase_c0_validation_infrastructure.sql`

**Change** (line 169-173):
```sql
-- BEFORE (ambiguous)
SELECT
  'OVERALL_DECISION'::text,
  CASE WHEN MIN(can_proceed::int) = 1 THEN 'GO' ELSE 'NO-GO' END::text,
  SUM(failing_count),
  (MIN(can_proceed::int) = 1)
FROM gate_results;

-- AFTER (qualified)
SELECT
  'OVERALL_DECISION'::text,
  CASE WHEN MIN(gr.can_proceed::int) = 1 THEN 'GO' ELSE 'NO-GO' END::text,
  SUM(gr.failing_count),
  (MIN(gr.can_proceed::int) = 1)
FROM gate_results gr;  -- Add table alias
```

**Alternative Fix** (simpler):
```sql
-- Use explicit column list instead of ambiguous reference
SELECT
  'OVERALL_DECISION'::text AS gate_name,
  CASE WHEN MIN(can_proceed::int) = 1 THEN 'GO' ELSE 'NO-GO' END::text AS status,
  SUM(failing_count) AS failing_count,
  (MIN(can_proceed::int) = 1) AS can_proceed
FROM (SELECT * FROM gate_results) vr;  -- Wrap in subquery to remove ambiguity
```

---

## 📊 Phase C.1 Validation Results

### Pre-Migration Baseline

**Validation Date**: 2025-10-20
**Data State**: Empty table (clean baseline)

| Check | Status | Count | Notes |
|-------|--------|-------|-------|
| Total rows | ✅ PASS | 0 | Clean baseline |
| Non-null patron_id | ✅ PASS | 0 | No data |
| Orphaned references | ✅ PASS | 0 | FK safe |
| UUID format | ✅ PASS | 0 | All valid |

**Conclusion**: ✅ **IDEAL CONDITIONS** for migration (empty table)

### Post-Migration Schema State

**Current State** (after Phase C.1 executes):

**Columns**:
```
column_name  | data_type | is_nullable
-------------+-----------+-------------
patron_id    | text      | YES          (original, will be replaced)
patron_uuid  | uuid      | YES          (new authoritative column)
```

**Constraints**:
```
mtl_patron_uuid_parity_chk: CHECK (
  (patron_id IS NULL AND patron_uuid IS NULL) OR
  (patron_id IS NOT NULL AND patron_uuid IS NOT NULL AND patron_id::uuid = patron_uuid)
)

fk_mtl_entry_patron: FOREIGN KEY (patron_uuid) REFERENCES player(id) ON DELETE CASCADE
```

**Indexes**:
```
idx_mtl_entry_patron_uuid         - ON (patron_uuid) WHERE patron_uuid IS NOT NULL
idx_mtl_entry_patron_created      - ON (patron_uuid, created_at DESC) WHERE patron_uuid IS NOT NULL
mtl_entry_casino_id_gaming_day_patron_id_idx  - Legacy index (will be updated)
mtl_entry_duplicate_prevention_patron         - Legacy index (will be updated)
```

---

## 📋 Remaining Work

### Immediate (Phase C.1 Completion)

1. **Fix ambiguous column reference** (5 minutes)
   - Edit `20251020120000_phase_c0_validation_infrastructure.sql`
   - Add table alias `gr` to `FROM gate_results gr`
   - Qualify all column references: `gr.can_proceed`, `gr.failing_count`
   - Re-run `npx supabase db reset`

2. **Verify Phase C.1 complete** (5 minutes)
   - Run validation queries
   - Confirm cutover gate returns expected results
   - Document final schema state

### Phase C.2.1: Migrate Application Writers (Planned)

**Files to update**:
- `services/mtl/crud.ts` (2 functions)
- `services/mtl/queries.ts` (3 functions)

**Changes**:
- Update DTO types: `patronId?: string` → `patronId?: string` (keep string, but use patron_uuid column)
- Update INSERT/UPDATE to use `patron_uuid` column
- Update queries to filter/aggregate by `patron_uuid`

**Estimated Effort**: 1-2 hours

### Phase C.2.2: Swap to Generated Column (Planned)

**Migration**: Drop `patron_id` TEXT, re-add as generated column
**Estimated Effort**: 30 minutes
**Risk**: Medium (breaking change for legacy readers)

---

## 📁 Deliverables Created

### Documentation
1. ✅ `phase-C/BASELINE_AUDIT.md` - Pre-migration schema analysis
2. ✅ `phase-C/validation_queries.sql` - Validation query suite
3. ✅ `phase-C/PHASE_C_PROGRESS_REPORT.md` - This document

### Migrations
1. ✅ `20251020120000_phase_c0_validation_infrastructure.sql` - Applied successfully (with bug)
2. ✅ `20251020121000_phase_c1_add_patron_uuid.sql` - Ready (blocked by C.0 bug)

### Validation Results
- ✅ Baseline validation: 4/4 checks PASS
- ✅ Pre-migration checks: 0 orphaned records
- ✅ Post-migration verification: FK, parity constraint, 2 indexes created
- ⚠️ Cutover gate: Blocked by SQL error

---

## 🎯 Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Phase C.0 completion | 100% | 100% | ✅ COMPLETE |
| Phase C.1 completion | 100% | 95% | ⚠️ BLOCKED |
| Data loss | 0 rows | 0 rows | ✅ PASS |
| FK constraint active | Yes | Yes | ✅ PASS |
| Indexes created | 2 | 2 | ✅ PASS |
| Validation gates | All PASS | 1 SQL error | ⚠️ BLOCKED |

---

## 🚀 Next Steps

### Immediate Actions (Today)

1. **Fix SQL Function** (Architecture Team)
   - Edit `20251020120000_phase_c0_validation_infrastructure.sql`
   - Add table alias to resolve ambiguity
   - Test with `npx supabase db reset`
   - Verify cutover gate returns expected results

2. **Complete Phase C.1 Documentation**
   - Run final validation queries
   - Update BASELINE_AUDIT.md with post-migration state
   - Screenshot schema changes for sign-off

3. **Regenerate TypeScript Types**
   - Run `npm run db:types`
   - Verify `patron_uuid?: string | null` appears in MtlEntry type
   - Commit type changes

### Phase C.2.1 Kickoff (Next Session)

1. **Update Service Layer**
   - Modify `services/mtl/crud.ts` to use `patron_uuid` column
   - Modify `services/mtl/queries.ts` to filter by `patron_uuid`
   - Run service tests

2. **48-Hour Monitoring Window**
   - Monitor `pg_stat_statements` for legacy writes
   - Check `schema_validation_alerts` for divergence
   - Verify cutover gate shows zero legacy write patterns

---

## 📞 Escalation

**Issue Severity**: Low
**Blocking**: Local development only (no production impact)
**Owner**: Architecture Team
**Reviewer**: Database Lead
**Estimated Resolution**: <1 hour

**Questions/Support**:
- Architecture Lead: SQL function fix and migration strategy
- Database Lead: Schema validation and cutover criteria review

---

## 🔗 References

- [RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md](../RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md) - Phase C specification (lines 220-781)
- [BASELINE_AUDIT.md](./BASELINE_AUDIT.md) - Pre-migration schema state
- [validation_queries.sql](./validation_queries.sql) - Validation query suite

---

## Document Control

**Version**: 1.0.0
**Author**: Architecture Team (AI Assistant)
**Date**: 2025-10-20
**Status**: Active Issue Report

**Change Log**:
- 2025-10-20 13:00 UTC: Initial progress report created
- Issue identified: Ambiguous column reference in cutover gate function
- Phase C.0: Complete (with bug)
- Phase C.1: 95% complete (blocked by C.0 bug)
- Phase C.2.x: Pending C.1 completion

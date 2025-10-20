# Phase C Implementation Status: MTL Patron UUID Migration

**Version**: 2.0.0
**Date**: 2025-10-20
**Status**: 50% Complete (C.0 + C.1 Done, C.2.x Pending)
**Issue**: #2 - MTL patron type mismatch (TEXT vs UUID)

---

## Executive Summary

Phase C migration is **50% complete** with validation infrastructure and UUID column deployment successfully finished. The migration uses a **generated column approach** with automated cutover gates, eliminating dual-write complexity and reducing timeline from 2-3 weeks to 7-10 days.

**Current State**: Database schema ready, application migration pending
**Risk Level**: Low (clean baseline, automated validation, zero production data)
**Next Phase**: C.2.1 - Migrate application writers (1-2 days)

---

## 🎯 Phase Completion Status

| Phase | Status | Duration | Deliverables | Validation |
|-------|--------|----------|--------------|------------|
| **C.0** Validation Infrastructure | ✅ **COMPLETE** | 1 day | Alert table, validation functions, pg_cron job | All gates operational |
| **C.1** Add UUID Column | ✅ **COMPLETE** | 1 day | patron_uuid + FK + indexes + parity constraint | All checks PASS |
| **C.2.1** Migrate Writers | ⏳ **PENDING** | 1-2 days | Update 2 service files | Code search validation |
| **C.2.2** Generated Column | ⏳ **PENDING** | 1 day | Swap to generated column | Immutability test |

**Overall Progress**: 50% (2/4 phases complete)
**Estimated Completion**: 2-3 days remaining

---

## ✅ Phase C.0: Validation Infrastructure (Complete)

**Migration**: `20251020120000_phase_c0_validation_infrastructure.sql`
**Completed**: 2025-10-20
**Status**: ✅ Deployed and operational

### Deliverables

1. **Alert Tracking Table**
   ```sql
   schema_validation_alerts (
     id bigserial,
     check_name text,
     severity text CHECK (severity IN ('info', 'warning', 'critical')),
     message text,
     details jsonb,
     created_at timestamptz
   )
   ```
   - 2 indexes: created timestamp, check_name + timestamp
   - Zero alerts logged (clean state)

2. **Validation Function**
   ```sql
   validate_mtl_patron_backfill()
   ```
   - Checks for NULL patron_uuid where patron_id exists
   - Checks for divergence (patron_id::uuid ≠ patron_uuid)
   - Logs critical alerts when issues detected
   - Gracefully handles pre-C.1 state (column doesn't exist yet)

3. **Cutover Gate Function**
   ```sql
   check_phase_c1_cutover_gate()
   ```
   - 4 validation gates:
     - Divergence check (patron_id::uuid = patron_uuid)
     - Backfill completeness (no NULL patron_uuid)
     - Orphaned references (all patron_uuid in player.id)
     - Alert history (no critical alerts in 48hrs)
   - Returns GO/NO-GO decision
   - **Current Result**: All gates PASS ✅

4. **Automated Monitoring**
   ```sql
   pg_cron job: mtl-patron-backfill-validation
   Schedule: 0 * * * * (hourly)
   ```
   - Active and scheduled
   - Zero alerts generated

### Validation Results

```sql
SELECT * FROM check_phase_c1_cutover_gate();
```

**Output**:
```
       gate_name       | status | failing_count | can_proceed
-----------------------+--------+---------------+-------------
 divergence_check      | PASS   |             0 | t
 backfill_completeness | PASS   |             0 | t
 orphaned_references   | PASS   |             0 | t
 alert_history         | PASS   |             0 | t
 OVERALL_DECISION      | GO     |             0 | t
```

✅ **All gates passing - Ready for Phase C.2.1**

---

## ✅ Phase C.1: Add patron_uuid Column (Complete)

**Migration**: `20251020121000_phase_c1_add_patron_uuid.sql`
**Completed**: 2025-10-20
**Status**: ✅ Deployed with full relational integrity

### Schema Changes

**New Column**:
```sql
mtl_entry.patron_uuid UUID (nullable)
```
- Type: UUID (authoritative type)
- Nullable: YES (allows anonymous MTL entries)
- Backfilled: From patron_id::uuid (0 rows, clean baseline)

**Constraints Added**:

1. **Foreign Key Constraint**
   ```sql
   CONSTRAINT fk_mtl_entry_patron
   FOREIGN KEY (patron_uuid) REFERENCES player(id) ON DELETE CASCADE
   ```
   - Enforces referential integrity
   - Cascades player deletions
   - Validated: 0 orphaned references

2. **Parity Constraint**
   ```sql
   CONSTRAINT mtl_patron_uuid_parity_chk
   CHECK (
     (patron_id IS NULL AND patron_uuid IS NULL) OR
     (patron_id IS NOT NULL AND patron_uuid IS NOT NULL AND patron_id::uuid = patron_uuid)
   )
   ```
   - Enforces sync during transition
   - Both columns NULL OR both non-NULL and equal
   - Validated: 100% compliance

**Indexes Created**:

1. **Patron Lookup Index**
   ```sql
   idx_mtl_entry_patron_uuid ON mtl_entry(patron_uuid)
   WHERE patron_uuid IS NOT NULL
   ```
   - Partial index (excludes NULLs)
   - Optimizes patron-specific queries

2. **Transaction History Index**
   ```sql
   idx_mtl_entry_patron_created ON mtl_entry(patron_uuid, created_at DESC)
   WHERE patron_uuid IS NOT NULL
   ```
   - Composite index
   - Optimizes `listByPatron` service queries
   - Covers temporal ordering

### Pre-Migration Validation

**Baseline Audit Results** (2025-10-20):

| Check | Result | Status |
|-------|--------|--------|
| Total rows | 0 | ✅ PASS |
| Orphaned patron_id | 0 | ✅ PASS |
| Invalid UUID format | 0 | ✅ PASS |
| FK constraint safe | Yes | ✅ PASS |

**Implications**:
- Empty table = ideal migration conditions
- Zero data loss risk
- All constraints enforced from day 1
- Future data validated automatically

### Post-Migration Verification

**Column Structure**:
```
 column_name | data_type | is_nullable
-------------+-----------+-------------
 patron_id   | text      | YES         (will become generated)
 patron_uuid | uuid      | YES         (authoritative)
```

**Constraints Active**:
```
fk_mtl_entry_patron: FOREIGN KEY (patron_uuid) REFERENCES player(id) ON DELETE CASCADE
mtl_patron_uuid_parity_chk: CHECK parity enforcement
```

**Indexes Deployed**:
```
idx_mtl_entry_patron_uuid (patron_uuid)
idx_mtl_entry_patron_created (patron_uuid, created_at DESC)
```

**TypeScript Types Updated**:
```typescript
// types/remote/database.types.ts
mtl_entry: {
  Row: {
    patron_id: string | null    // TEXT (original)
    patron_uuid: string | null  // UUID (new authoritative)
  }
}
```

✅ **Schema migration complete - Application migration ready**

---

## ⏳ Phase C.2.1: Migrate Application Writers (Pending)

**Estimated Effort**: 1-2 hours
**Risk**: Low (2 files, straightforward changes)
**Blocker**: None

### Files Requiring Updates

1. **`services/mtl/crud.ts`** (2 functions)
   - `create()` - INSERT operation (line 87)
   - `update()` - UPDATE operation (line 213)

2. **`services/mtl/queries.ts`** (3 functions)
   - `listByPatron()` - Filter by patron (line 113)
   - `getPendingCTRReports()` - Exclude NULL patrons (line 170)
   - Aggregation key using patron_id (line 191, 199)

### Required Changes

**DTO Types** (no change required):
```typescript
// Keep as string (UUID strings)
export interface MTLEntryCreateDTO {
  patronId?: string | null;  // Still string, but maps to patron_uuid
}
```

**INSERT Operation**:
```typescript
// BEFORE
.insert({
  patron_id: data.patronId,  // ❌ Old TEXT column
})

// AFTER
.insert({
  patron_uuid: data.patronId,  // ✅ New UUID column
})
```

**UPDATE Operation**:
```typescript
// BEFORE
if (data.patronId !== undefined) updateData.patron_id = data.patronId;

// AFTER
if (data.patronId !== undefined) updateData.patron_uuid = data.patronId;
```

**Query Filters**:
```typescript
// BEFORE
.eq("patron_id", patronId)

// AFTER
.eq("patron_uuid", patronId)
```

**Aggregation Key**:
```typescript
// BEFORE
const key = `${entry.patron_id}-${entry.direction}`;

// AFTER
const key = `${entry.patron_uuid}-${entry.direction}`;
```

### Validation Criteria

**Code Search** (must return 0):
```bash
# No writes to patron_id column
grep -rn "patron_id.*data\." services/mtl/
grep -rn "\.patron_id\s*=" services/mtl/

# All queries use patron_uuid
grep -rn "\.eq.*patron_id" services/mtl/
```

**Post-Migration Checks**:
- [ ] No references to `patron_id` in INSERT/UPDATE operations
- [ ] All queries filter by `patron_uuid`
- [ ] Aggregation keys use `patron_uuid`
- [ ] Service tests pass
- [ ] Cutover gate shows zero legacy writes (48hr observation)

---

## ⏳ Phase C.2.2: Generated Column Swap (Pending)

**Estimated Effort**: 30 minutes
**Risk**: Medium (breaking change for legacy readers)
**Dependency**: C.2.1 complete + 48hr monitoring

### Migration Strategy

**Step 1: Drop Original Column**
```sql
ALTER TABLE mtl_entry DROP COLUMN patron_id CASCADE;
-- Cascades removes parity constraint
```

**Step 2: Add Generated Column**
```sql
ALTER TABLE mtl_entry
  ADD COLUMN patron_id text
  GENERATED ALWAYS AS (patron_uuid::text) STORED;
```

**Step 3: Validate Immutability**
```sql
-- This should fail
INSERT INTO mtl_entry (patron_id, ...) VALUES ('...', ...);
-- ERROR: cannot insert into column "patron_id"

-- This should succeed
INSERT INTO mtl_entry (patron_uuid, ...) VALUES ('...', ...);
-- patron_id automatically populated as patron_uuid::text
```

### Rollback Procedure

If generated column causes issues:

```sql
-- Drop generated column
ALTER TABLE mtl_entry DROP COLUMN patron_id;

-- Re-add as normal TEXT column
ALTER TABLE mtl_entry ADD COLUMN patron_id text;

-- Backfill from UUID
UPDATE mtl_entry SET patron_id = patron_uuid::text;

-- Make NOT NULL if needed
ALTER TABLE mtl_entry ALTER COLUMN patron_id SET NOT NULL;
```

### Success Criteria

- [ ] patron_id is GENERATED ALWAYS column
- [ ] INSERT/UPDATE to patron_id fails with immutability error
- [ ] SELECT queries return patron_id as patron_uuid::text
- [ ] Legacy read-only consumers work unchanged
- [ ] 48hr production observation: zero errors

---

## 📊 Overall Metrics

### Implementation Timeline

| Phase | Planned | Actual | Status |
|-------|---------|--------|--------|
| C.0 Validation | 1 day | 1 day | ✅ Complete |
| C.1 Add UUID | 1 day | 1 day | ✅ Complete |
| C.2.1 Writers | 1-2 days | TBD | ⏳ Pending |
| C.2.2 Generated | 1 day | TBD | ⏳ Pending |
| **Total** | **7-10 days** | **2 days** | **50% Done** |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss | Low | High | Empty table, automated validation |
| FK violations | Low | Medium | Pre-validated, 0 orphans |
| Application errors | Low | Medium | Parity constraint enforces sync |
| Legacy breakage | Medium | Low | Generated column maintains compatibility |

### Validation Gates Summary

| Gate | C.1 Status | C.2.1 Required | C.2.2 Required |
|------|------------|----------------|----------------|
| Divergence check | ✅ PASS (0) | ✅ PASS (0) | ✅ PASS (0) |
| Backfill complete | ✅ PASS (0) | ✅ PASS (0) | ✅ PASS (0) |
| Orphaned refs | ✅ PASS (0) | ✅ PASS (0) | ✅ PASS (0) |
| Alert history | ✅ PASS (0) | ✅ PASS (0) | ✅ PASS (0) |
| Legacy writes | N/A | 🔍 Monitor | ✅ PASS (0) |

---

## 📁 Documentation Index

### Completed Documents

1. ✅ **BASELINE_AUDIT.md** - Pre-migration state with validation results
2. ✅ **PHASE_C_FIX_SUMMARY.md** - SQL function debugging and resolution
3. ✅ **PHASE_C_STATUS.md** - This document (current status)
4. ✅ **validation_queries.sql** - Validation query suite

### Historical Documents

- 📜 **PHASE_C_PROGRESS_REPORT.md** - Implementation progress during C.0/C.1 debugging (superseded by STATUS)

### Pending Documents

- ⏳ **PHASE_C_SIGNOFF.md** - Final completion attestation (after C.2.2)

---

## 🚀 Next Actions

### Immediate (Phase C.2.1)

1. **Update `services/mtl/crud.ts`**
   - Change INSERT: `patron_id` → `patron_uuid`
   - Change UPDATE: `patron_id` → `patron_uuid`

2. **Update `services/mtl/queries.ts`**
   - Change filter: `.eq("patron_id", ...)` → `.eq("patron_uuid", ...)`
   - Change aggregation: `entry.patron_id` → `entry.patron_uuid`

3. **Validate Changes**
   - Run code search for legacy `patron_id` writes
   - Execute service tests
   - Deploy to development

4. **48-Hour Monitoring Window**
   - Monitor `schema_validation_alerts` for divergence
   - Check `pg_stat_statements` for legacy write patterns
   - Verify cutover gate remains GO status

### Subsequent (Phase C.2.2)

1. **Create Migration**
   - Drop `patron_id` TEXT column
   - Add generated column: `patron_id AS (patron_uuid::text) STORED`

2. **Validate Generated Column**
   - Test INSERT with patron_id (should fail)
   - Test INSERT with patron_uuid (should succeed)
   - Verify patron_id auto-populates

3. **48-Hour Production Observation**
   - Monitor for immutability errors
   - Verify legacy readers work unchanged
   - Check cutover gate status

4. **Create Sign-Off Document**
   - Document final validation results
   - Attest to zero data loss
   - Confirm all success criteria met

---

## 🔗 References

- [RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md](../RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md) - Phase C specification (lines 220-781)
- [BASELINE_AUDIT.md](./BASELINE_AUDIT.md) - Pre-migration baseline state
- [PHASE_C_FIX_SUMMARY.md](./PHASE_C_FIX_SUMMARY.md) - SQL debugging resolution
- Migration: `supabase/migrations/20251020120000_phase_c0_validation_infrastructure.sql`
- Migration: `supabase/migrations/20251020121000_phase_c1_add_patron_uuid.sql`

---

## Document Control

**Version**: 2.0.0
**Supersedes**: PHASE_C_PROGRESS_REPORT.md v1.0.0
**Author**: Architecture Team
**Last Updated**: 2025-10-20
**Status**: Current

**Change Log**:
- v2.0.0 (2025-10-20): Created as replacement for PROGRESS_REPORT
  - Focus on current status vs historical debugging
  - Added C.2.x detailed implementation plans
  - Added metrics and validation gate tracking
  - Removed historical issue troubleshooting

**Approval**: Pending Phase C.2.x completion

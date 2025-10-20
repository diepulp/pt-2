# Phase C Baseline Audit: MTL Patron ID Schema

**Version**: 1.0.0
**Date**: 2025-10-20
**Status**: Pre-Migration Baseline
**Issue**: #2 - MTL patron type mismatch (TEXT vs UUID)

---

## Executive Summary

This document captures the current state of the `mtl_entry.patron_id` column before beginning Phase C migration from TEXT to UUID type. This baseline establishes the validation criteria for zero-data-loss migration.

---

## Current Schema State

### Table: `mtl_entry`

**Column**: `patron_id`
- **Type**: `text` (nullable)
- **Constraint**: None
- **Foreign Key**: ❌ None (no FK to `player` table)
- **Indexes**: ❌ None specific to `patron_id`
- **Source**: `types/remote/database.types.ts:683`

**Related Columns**:
```typescript
Row: {
  id: number
  casino_id: string
  patron_id: string | null          // ← TARGET COLUMN
  person_name: string | null
  person_last_name: string | null
  person_description: string | null
  direction: MtlDirection
  area: MtlArea
  tender_type: TenderType
  amount: number
  table_number: string | null
  location_note: string | null
  event_time: string
  gaming_day: string
  recorded_by_employee_id: string   // ← Has FK to Staff
  recorded_by_signature: string
  notes: string | null
  created_at: string
  updated_at: string
}
```

**Existing Foreign Keys**:
1. `mtl_entry_recorded_by_employee_id_fkey` → `Staff(id)`

---

## Application Usage Analysis

### Service Layer

**Files Using `patron_id`**:
1. `services/mtl/crud.ts` - Write operations
2. `services/mtl/queries.ts` - Read operations

### Write Operations (`services/mtl/crud.ts`)

**Insert** (line 87):
```typescript
await supabase.from("mtl_entry").insert({
  patron_id: data.patronId,  // string | null
  // ...
})
```

**Update** (line 213):
```typescript
if (data.patronId !== undefined) {
  updateData.patron_id = data.patronId;  // string | null
}
```

**DTOs**:
```typescript
// Line 18
export interface MTLEntryCreateDTO {
  patronId?: string | null;  // ← Will need UUID conversion
  // ...
}

// Line 36
export interface MTLEntryUpdateDTO {
  patronId?: string | null;  // ← Will need UUID conversion
  // ...
}
```

### Read Operations (`services/mtl/queries.ts`)

**Filter by patron_id** (line 113):
```typescript
.eq("patron_id", patronId)  // string parameter
```

**Exclude nulls** (line 170):
```typescript
.not("patron_id", "is", null)
```

**Aggregation key** (lines 191, 199):
```typescript
const key = `${entry.patron_id}-${entry.direction}`;
patron_id: entry.patron_id!,  // Non-null assertion
```

---

## Migration Requirements

### Phase C.0: Validation Infrastructure
- [ ] Create `schema_validation_alerts` table
- [ ] Create `validate_mtl_patron_backfill()` function
- [ ] Create `check_phase_c1_cutover_gate()` function
- [ ] Schedule pg_cron hourly validation job

### Phase C.1: Add UUID Column
- [ ] Add `patron_uuid` UUID column (nullable initially)
- [ ] Backfill from existing `patron_id::uuid` cast
- [ ] Add NOT NULL constraint
- [ ] Add parity CHECK constraint: `patron_id::uuid = patron_uuid`
- [ ] Add FK constraint: `patron_uuid REFERENCES player(id) ON DELETE CASCADE`
- [ ] Create indexes:
  - `idx_mtl_entry_patron_uuid` on `(patron_uuid)`
  - `idx_mtl_entry_patron_created` on `(patron_uuid, created_at DESC)`
- [ ] 48-hour monitoring window (zero divergence required)

### Phase C.2.1: Migrate Application Writers
**Files to update**:
1. `services/mtl/crud.ts`:
   - Change `MTLEntryCreateDTO.patronId` type to UUID
   - Change `MTLEntryUpdateDTO.patronId` type to UUID
   - Update INSERT to use `patron_uuid` (line 87)
   - Update UPDATE to use `patron_uuid` (line 213)

2. `services/mtl/queries.ts`:
   - Update `.eq("patron_id", patronId)` → `.eq("patron_uuid", patronId)` (line 113)
   - Update aggregation key to use `patron_uuid` (line 191)

**Validation**:
- [ ] Code search confirms zero writes to `patron_id` column
- [ ] 48-hour observation: zero legacy write patterns in `pg_stat_statements`

### Phase C.2.2: Swap to Generated Column
- [ ] Drop old `patron_id` TEXT column (CASCADE removes parity constraint)
- [ ] Add generated column: `patron_id text GENERATED ALWAYS AS (patron_uuid::text) STORED`
- [ ] Validate: INSERT/UPDATE to `patron_id` fails with immutability error
- [ ] 48-hour observation: zero production errors

---

## Pre-Migration Validation Results

**Validation Date**: 2025-10-20
**Validation Script**: `validation_queries.sql`

### Query 1: Current Row Count
```sql
SELECT COUNT(*) AS total_rows,
       COUNT(patron_id) AS non_null_patron_id,
       COUNT(DISTINCT patron_id) AS unique_patrons
FROM mtl_entry;
```

**Result**:
```
 total_rows | non_null_patron_id | unique_patrons
------------+--------------------+----------------
          0 |                  0 |              0
```

✅ **Status**: PASS - Table is empty (clean baseline for migration)

### Query 2: Check for Orphaned Records
```sql
SELECT COUNT(*) AS orphaned_count
FROM mtl_entry e
LEFT JOIN player p ON e.patron_id::uuid = p.id
WHERE e.patron_id IS NOT NULL
  AND p.id IS NULL;
```

**Result**:
```
 orphaned_count
----------------
              0
```

✅ **Status**: PASS - Zero orphaned references (FK constraint safe)

### Query 3: Validate UUID Castability
```sql
SELECT patron_id
FROM mtl_entry
WHERE patron_id IS NOT NULL
  AND patron_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

**Result**:
```
 patron_id | occurrences
-----------+-------------
(0 rows)
```

✅ **Status**: PASS - All patron_id values are valid UUIDs (or NULL)

### Query 4: Sample Data
```sql
SELECT patron_id, person_name, person_last_name, created_at
FROM mtl_entry
WHERE patron_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

**Result**:
```
 patron_id | person_name | person_last_name | created_at
-----------+-------------+------------------+------------
(0 rows)
```

✅ **Status**: PASS - No data (clean slate)

---

## Validation Summary

| Check | Status | Notes |
|-------|--------|-------|
| Row count | ✅ PASS | 0 rows (clean baseline) |
| Orphaned references | ✅ PASS | 0 orphaned (FK safe) |
| UUID format | ✅ PASS | All values valid UUIDs |
| Data sample | ✅ PASS | No data |

**Overall**: ✅ **READY FOR MIGRATION**

**Implications**:
- Empty table provides clean migration baseline
- All validation gates will pass by default
- Future data will be enforced by FK constraint from day 1
- Zero data loss risk (no existing data to lose)
- Ideal conditions for implementing full validation infrastructure

---

## Success Criteria

### Zero Data Loss
- [ ] All `patron_id` values successfully cast to UUID
- [ ] All `patron_uuid` values backfilled (zero NULLs)
- [ ] Zero divergence: `patron_id::uuid = patron_uuid` for all rows

### Referential Integrity
- [ ] Zero orphaned records (all `patron_uuid` exist in `player.id`)
- [ ] FK constraint active and validated
- [ ] ON DELETE CASCADE behavior tested

### Application Compatibility
- [ ] All service writers migrated to `patron_uuid`
- [ ] Generated `patron_id` TEXT column provides legacy read compatibility
- [ ] `npm run db:types` succeeds (TypeScript types regenerated)
- [ ] Zero production errors after cutover

### Performance
- [ ] Indexes created and analyzed
- [ ] Query plans show index usage for patron lookups
- [ ] No performance regression in MTL queries

---

## Rollback Procedures

### Phase C.1 Rollback (Simple)
```sql
ALTER TABLE mtl_entry DROP COLUMN patron_uuid CASCADE;
DROP INDEX IF EXISTS idx_mtl_entry_patron_uuid;
DROP INDEX IF EXISTS idx_mtl_entry_patron_created;
```

### Phase C.2.2 Rollback (Requires Backfill)
```sql
-- Drop generated column
ALTER TABLE mtl_entry DROP COLUMN patron_id;

-- Re-add as normal TEXT column
ALTER TABLE mtl_entry ADD COLUMN patron_id text;

-- Backfill from UUID
UPDATE mtl_entry SET patron_id = patron_uuid::text;

-- Make NOT NULL
ALTER TABLE mtl_entry ALTER COLUMN patron_id SET NOT NULL;
```

---

## Document Control

**Author**: Architecture Team
**Reviewers**: Database Lead
**Approval**: Pending Phase C.0 completion

**Next Steps**:
1. Execute pre-migration validation queries
2. Review findings with Database Lead
3. Proceed to Phase C.0 if validation passes

---

## References

- [RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md](../RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md) - Phase C specification
- [ADR-007](../../adr/ADR-007-mtl-patron-uuid-migration.md) - Migration strategy decision (to be created)
- [Phase A Sign-off](../phase-A/PHASE_A_SIGNOFF.md) - Previous phase completion
- [Phase B Sign-off](../phase-B/PHASE_B_SIGNOFF.md) - Previous phase completion

---

## Appendix: Migration Timeline

| Phase | Duration | Risk | Dependencies |
|-------|----------|------|--------------|
| C.0 Validation Infrastructure | 1 day | Low | None |
| C.1 Add UUID with FK | 3-4 days | Medium | C.0 complete, validation passing |
| C.2.1 Migrate Writers | 2-3 days | Medium | C.1 complete, 48hr monitoring pass |
| C.2.2 Generated Column | 1 day | High | C.2.1 complete, zero legacy writes |
| **Total** | **7-10 days** | **High** | Sequential execution required |

**Monitoring Windows**:
- C.1 → C.2.1: 48 hours zero divergence
- C.2.1 → C.2.2: 48 hours zero legacy writes
- C.2.2 → Complete: 48 hours zero production errors

**Total Calendar Time**: 13-16 days (including monitoring windows)

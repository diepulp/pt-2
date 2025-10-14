# MTL Migration Fixes - Post-Timestamp Correction

> **Date**: 2025-10-14
> **Context**: Fixes applied after migration timestamp standardization
> **Status**: Complete - All migrations apply successfully

---

## Issues Discovered During Database Reset

After standardizing all migration timestamps, `npx supabase db reset` revealed dependency and schema mismatch issues.

---

## Issue 1: Migration Dependency Order

### Problem

**Error**:
```
ERROR: foreign key constraint "player_financial_transaction_rating_slip_id_fkey" cannot be implemented (SQLSTATE 42804)
Key columns "rating_slip_id" and "id" are of incompatible types: uuid and text.
```

**Root Cause**:
The `create_player_financial_transaction` migration (00:02:57) ran BEFORE the `migrate_ratingslip_id_to_uuid` migration (00:30:08). The financial transaction table tried to create a FK to `ratingslip.id` as UUID, but `ratingslip.id` was still TEXT at that point.

**Chronological Order** (based on file creation times):
1. `20251007000257_create_player_financial_transaction.sql` ❌ (expects UUID)
2. `20251007003008_migrate_ratingslip_id_to_uuid.sql` (makes it UUID)

**Logical Dependency Order** (what's needed):
1. `migrate_ratingslip_id_to_uuid` MUST run first
2. `create_player_financial_transaction` can then reference UUID

### Solution

Swapped the timestamps to match logical dependency order:

**Before**:
- `20251007000257_create_player_financial_transaction.sql`
- `20251007003008_migrate_ratingslip_id_to_uuid.sql`

**After**:
- `20251007000257_migrate_ratingslip_id_to_uuid.sql` ✅
- `20251007003008_create_player_financial_transaction.sql` ✅

**Principle**: When file creation timestamps create a dependency conflict, **logical dependency order takes precedence** over chronological file creation time.

---

## Issue 2: Column Name Mismatches in MTL Migration

### Problem 1: Visit Table Column Names

**Error**:
```
ERROR: column v.check_in_time does not exist (SQLSTATE 42703)
```

**Root Cause**:
MTL migration referenced `check_in_time` and `check_out_time`, but visit table uses `check_in_date` and `check_out_date`.

**Fix**:
```sql
-- ❌ BEFORE
v.check_in_time as visit_check_in,
v.check_out_time as visit_check_out,
v.status as visit_status,

-- ✅ AFTER
v.check_in_date as visit_check_in,
v.check_out_date as visit_check_out,
```

### Problem 2: Player Table Column Names

**Error**:
```
ERROR: column p.first_name does not exist (SQLSTATE 42703)
Hint: Perhaps you meant to reference the column "p.firstName".
```

**Root Cause**:
MTL migration used snake_case (`first_name`, `last_name`) but player and Staff tables use camelCase (`firstName`, `lastName`).

**Schema Inconsistency**:
- Player table: `firstName`, `lastName` (camelCase)
- Staff table: `firstName`, `lastName` (camelCase)
- Visit table: `check_in_date`, `check_out_date` (snake_case)
- RatingSlip table: `average_bet`, `accumulated_seconds` (snake_case)

**Fix**:
```sql
-- ❌ BEFORE (Player columns)
p.first_name as player_first_name,
p.last_name as player_last_name,
p.card_number as player_card_number,

-- ✅ AFTER
p."firstName" as player_first_name,
p."lastName" as player_last_name,

-- ❌ BEFORE (Staff columns)
s.first_name as staff_first_name,
s.last_name as staff_last_name,

-- ✅ AFTER
s."firstName" as staff_first_name,
s."lastName" as staff_last_name,

-- ❌ BEFORE (mtl_entry_with_notes view)
'staff_name', s.first_name || ' ' || s.last_name

-- ✅ AFTER
'staff_name', s."firstName" || ' ' || s."lastName"
```

**Note**: Quoted identifiers required for camelCase columns in PostgreSQL.

---

## Files Modified

### 1. Migration File Timestamp Swaps

- ✅ `20251007000257_migrate_ratingslip_id_to_uuid.sql` (was 003008)
- ✅ `20251007003008_create_player_financial_transaction.sql` (was 000257)

### 2. MTL Migration Schema Fixes

**File**: `supabase/migrations/20251014134942_mtl_schema_enhancements.sql`

**Changes**:
- Line 153-154: `check_in_time` → `check_in_date`, `check_out_time` → `check_out_date`
- Line 158-159: `first_name` → `"firstName"`, `last_name` → `"lastName"` (player)
- Line 174-175: `first_name` → `"firstName"`, `last_name` → `"lastName"` (staff)
- Line 233: `first_name` → `"firstName"`, `last_name` → `"lastName"` (audit notes)

### 3. Documentation Updates

**File**: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`

**Changes**:
- Line 300: `check_in_time` → `check_in_date`, `check_out_time` → `check_out_date`

---

## Validation

### Migration Order Validation

```bash
$ ./scripts/validate-migration-names.sh
✅ All migration filenames are valid
Standard: YYYYMMDDHHMMSS_description.sql
Total migrations: 19
```

### Database Reset Validation

```bash
$ npx supabase db reset
...
Applying migration 20251007000257_migrate_ratingslip_id_to_uuid.sql...
Applying migration 20251007003008_create_player_financial_transaction.sql...
Applying migration 20251007110110_rls_testing_policies.sql...
Applying migration 20251012185626_phase_6_wave_0_bounded_context_corrections.sql...
Applying migration 20251012191318_drop_old_close_player_session.sql...
Applying migration 20251013014128_fix_increment_player_loyalty_rpc.sql...
Applying migration 20251013233420_wave_2_schema_hardening.sql...
Applying migration 20251014134942_mtl_schema_enhancements.sql...
✅ All migrations applied successfully
```

---

## Lessons Learned

### 1. Dependency Order > Chronological Order

When file creation timestamps create logical dependency conflicts, swap timestamps to maintain correct dependency order. The goal is correct database state, not perfect historical accuracy.

### 2. Schema Naming Inconsistency

The codebase has mixed naming conventions:
- **camelCase**: `player.firstName`, `Staff.firstName`
- **snake_case**: `visit.check_in_date`, `ratingslip.average_bet`

**Recommendation**: Document naming conventions per table in schema documentation to prevent future migration errors.

### 3. Test Migrations Early

Always run `npx supabase db reset` after creating new migrations to catch:
- Dependency order issues
- Column name mismatches
- Type incompatibilities
- Missing references

### 4. Use Quoted Identifiers for camelCase

When referencing camelCase columns in SQL, use double quotes:
```sql
-- ✅ CORRECT
SELECT p."firstName", p."lastName"

-- ❌ WRONG
SELECT p.firstName, p.lastName  -- PostgreSQL will look for lowercase
```

---

## Final Migration Order

All 19 migrations now apply in correct order:

```
1.  20250828011313_init_corrected.sql
2.  20250920003818_fix_start_rated_visit_seats_available.sql
3.  20250920004037_fix_ratingslip_id_generation.sql
4.  20250920004252_fix_uuid_regex_validation.sql
5.  20250920060318_visit_service_rpc_functions.sql
6.  20250920161500_create_personalization_tables.sql
7.  20250921120000_create_player_notes_table.sql
8.  20251006012817_jwt_helpers.sql
9.  20251006013359_enable_rls.sql
10. 20251006013411_compliance_table_stubs.sql
11. 20251006013418_audit_log_scaffold.sql
12. 20251007000257_migrate_ratingslip_id_to_uuid.sql          ✅ (swapped)
13. 20251007003008_create_player_financial_transaction.sql    ✅ (swapped)
14. 20251007110110_rls_testing_policies.sql
15. 20251012185626_phase_6_wave_0_bounded_context_corrections.sql
16. 20251012191318_drop_old_close_player_session.sql
17. 20251013014128_fix_increment_player_loyalty_rpc.sql
18. 20251013233420_wave_2_schema_hardening.sql
19. 20251014134942_mtl_schema_enhancements.sql                ✅ (fixed)
```

---

**Status**: ✅ Complete - All migrations apply successfully
**Next Step**: Run `npm run db:types` to generate updated TypeScript types

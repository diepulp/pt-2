# Migration Fixes - Schema Alignment

**Date**: 2025-10-02
**Issue**: Original migrations assumed a different schema structure than actually exists

---

## Problem

The original Phase 1 security migrations were written assuming:
1. Player table has `user_id` column linking to `auth.uid()`
2. Need to create `staff_role` enum from scratch
3. Need to create `audit_log` and `mtl_entry` tables from scratch

**Actual schema** (from existing database):
- Player table has NO `user_id` column (not linked to auth)
- `StaffRole` enum already exists (DEALER, SUPERVISOR, PIT_BOSS, AUDITOR)
- `AuditLog` table already exists
- `mtl_entry` and `casino_settings` tables already exist with full schemas

---

## Changes Made

### Migration 1: `20251002010000_enable_rls.sql`

**Original**: Assumed `user_id` column for owner-based policies
```sql
-- ❌ This would fail
CREATE POLICY "player_owner_policy" ON player
  USING (user_id = auth.uid())
```

**Fixed**: Staff-based access using existing `Staff` table
```sql
-- ✅ Works with actual schema
CREATE POLICY "staff_access_policy" ON player
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM Staff s
      WHERE s.id = auth.uid()
    )
  );
```

**What it does**:
- Enables RLS on: player, visit, ratingslip, casino
- Creates staff-only access policies (authenticated staff can access data)
- No player self-service until `user_id` column is added in Phase 2

---

### Migration 2: `20251002020000_jwt_helpers.sql`

**Original**: Create new `staff_role` enum
```sql
-- ❌ Would conflict with existing enum
CREATE TYPE staff_role AS ENUM (...)
```

**Fixed**: Use existing `StaffRole` enum
```sql
-- ✅ Uses existing enum type
CREATE OR REPLACE FUNCTION jwt_get_role()
RETURNS "StaffRole"
AS $$
BEGIN
  RETURN 'SUPERVISOR'::"StaffRole";
END;
$$;
```

**What it does**:
- Creates JWT helper function (stub returns SUPERVISOR)
- Uses existing `StaffRole` enum from schema
- Ready for Phase 2 expansion to read JWT claims

---

### Migration 3: `20251002030000_audit_log_scaffold.sql`

**Original**: Create new `audit_log` table
```sql
-- ❌ Would conflict with existing table
CREATE TABLE audit_log (...)
```

**Fixed**: Add RLS to existing `AuditLog` table
```sql
-- ✅ Extends existing table
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auditor_read_policy" ON "AuditLog"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Staff" s
      WHERE s.id = auth.uid()
      AND s.role = 'AUDITOR'
    )
  );
```

**What it does**:
- Enables RLS on existing `AuditLog` table
- AUDITOR role can read audit logs
- Any authenticated staff can insert audit entries
- Adds indexes for performance

---

### Migration 4: `20251002040000_compliance_table_stubs.sql`

**Original**: Create `mtl_entry` and `casino_settings` tables
```sql
-- ❌ Would conflict with existing tables
CREATE TABLE mtl_entry (...)
CREATE TABLE casino_settings (...)
```

**Fixed**: Add RLS policies to existing tables
```sql
-- ✅ Adds security to existing tables
ALTER TABLE mtl_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino_settings ENABLE ROW LEVEL SECURITY;

-- AUDITOR + SUPERVISOR can read MTL
-- SUPERVISOR only can modify casino settings
```

**What it does**:
- Enables RLS on existing compliance tables
- AUDITOR/SUPERVISOR can read MTL entries
- Any staff can insert MTL entries
- Only SUPERVISOR can modify casino settings

---

## Schema Discovery

### Existing Tables (Relevant to Security)
- `Staff`: id, firstName, lastName, email, **role** (StaffRole enum), createdAt, updatedAt
- `player`: id, firstName, lastName, email, phone_number, dob, company_id, address, etc. (NO user_id)
- `AuditLog`: id, userId, action, entity, entityId, timestamp, details
- `mtl_entry`: Comprehensive MTL tracking with all fields
- `casino_settings`: Per-casino config with timezone, gaming_day_start, thresholds

### Existing Enums
- `StaffRole`: DEALER, SUPERVISOR, PIT_BOSS, AUDITOR
- `Gender`: M, F
- `VisitStatus`: ONGOING, COMPLETED, CANCELED
- Many others...

---

## Execution Steps (Updated)

### 1. Run Fixed Migrations in Order

```bash
# Via Supabase Dashboard SQL Editor
# https://supabase.com/dashboard/project/vaicxfihdldgepzryhpd/sql

# Copy/paste each file:
1. 20251002010000_enable_rls.sql
2. 20251002020000_jwt_helpers.sql
3. 20251002030000_audit_log_scaffold.sql
4. 20251002040000_compliance_table_stubs.sql
```

### 2. Verify RLS Enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('player', 'visit', 'ratingslip', 'casino', 'AuditLog', 'mtl_entry', 'casino_settings');
-- Expected: All show rowsecurity = true
```

### 3. Verify Policies Created

```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('player', 'visit', 'ratingslip', 'casino', 'AuditLog', 'mtl_entry', 'casino_settings')
ORDER BY tablename, policyname;
```

### 4. Test JWT Function

```sql
SELECT jwt_get_role();
-- Expected: 'SUPERVISOR'
```

### 5. Regenerate Types

```bash
npm run db:types
```

---

## What's Still Missing (Deferred to Phase 2)

### Player Self-Service
- **Issue**: No `user_id` column linking players to auth.uid()
- **Impact**: Players cannot access their own data yet
- **Phase 2**: Add `user_id UUID REFERENCES auth.users(id)` to player table
- **Phase 2**: Add player-owner policies: `USING (user_id = auth.uid())`

### JWT Claims Expansion
- **Current**: `jwt_get_role()` returns hardcoded SUPERVISOR
- **Phase 2**: Read actual role from `auth.jwt() -> 'app_metadata' -> 'role'`
- **Phase 2**: Validate role against Staff table

### Rich Audit Triggers
- **Current**: Empty `audit_trigger()` stub function
- **Phase 2**: Wire triggers to tables for automatic audit logging
- **Phase 2**: Log specific events: player_updated, visit_completed, rating_calculated

---

## Security Posture

### Current (Phase 1)
✅ **RLS Enabled**: All core tables deny access by default
✅ **Staff Access**: Authenticated staff can operate (via Staff table check)
✅ **Role-Based MTL**: AUDITOR/SUPERVISOR restricted
✅ **Audit Trail**: AuditLog has proper RLS (AUDITOR read-only)

❌ **No Player Self-Service**: Players cannot access their own records
❌ **No Fine-Grained Permissions**: All staff have same access (except MTL/Settings)
❌ **No Automatic Auditing**: Triggers not wired

### Phase 2 Goals
- Add player auth integration (`user_id` columns)
- Expand JWT helper to read claims
- Wire audit triggers per domain
- Implement role-based policies for each table

---

## Migration File Status

| File | Original Purpose | Actual Outcome | Status |
|------|-----------------|----------------|--------|
| `20251002010000_enable_rls.sql` | Player owner policies | Staff-only policies | ✅ Fixed |
| `20251002020000_jwt_helpers.sql` | Create role enum + JWT helper | JWT helper only (enum exists) | ✅ Fixed |
| `20251002030000_audit_log_scaffold.sql` | Create audit_log table | RLS on existing AuditLog | ✅ Fixed |
| `20251002040000_compliance_table_stubs.sql` | Create compliance tables | RLS on existing tables | ✅ Fixed |

---

## Next Steps

1. **Execute fixed migrations** in Supabase Dashboard
2. **Verify RLS** using verification queries above
3. **Regenerate types**: `npm run db:types`
4. **Commit changes**: Updated migration files
5. **Proceed to Phase 2**: TDD vertical slice with proper auth integration

---

## Lessons Learned

1. **Always inspect schema first**: Use `list_tables` MCP tool before writing migrations
2. **Schema assumptions are dangerous**: PT-1 reference had different structure than PT-2
3. **Incremental security is OK**: Phase 1 provides baseline, Phase 2 refines
4. **Document deviations**: This file explains why migrations differ from PRD examples

# Phase 1: Security Skeleton Migrations

## Overview
These migrations establish the baseline security scaffolding for PT-2, following the "Security First" principle from the PRD. They enable RLS, create role infrastructure, and stub out audit/compliance tables without gold-plating.

## Migration Files (Execute in Order)

### 1. `20251002010000_enable_rls.sql`
**Purpose**: Enable RLS on all core tables with deny-all baseline

**What it does**:
- Enables RLS on: `player`, `visit`, `ratingslip`, `casino`
- Adds single owner-only policy for `player` table: `user_id = auth.uid()`
- Other tables locked down (no policies = deny all access)

**Acceptance**: RLS ON for all core tables, one working policy on player

---

### 2. `20251002020000_jwt_helpers.sql`
**Purpose**: Create role infrastructure and JWT helper stub

**What it does**:
- Creates `staff_role` enum: `SUPERVISOR`, `DEALER`, `PIT_BOSS`, `AUDITOR`
- Creates `jwt_get_role()` function (hardcoded to return `SUPERVISOR`)
- Grants execute to authenticated users

**Acceptance**: Enum exists, function returns 'SUPERVISOR', other roles unused

---

### 3. `20251002030000_audit_log_scaffold.sql`
**Purpose**: Create audit log table with empty trigger scaffold

**What it does**:
- Creates `audit_log` table: `id`, `action`, `actor_id`, `timestamp`, `metadata`
- Adds indexes for timestamp, actor, and action queries
- Enables RLS on audit_log
- Creates `audit_trigger()` stub (no-op, wiring deferred to Phase 2)

**Acceptance**: Table exists with proper schema, trigger function exists but not wired

---

### 4. `20251002040000_compliance_table_stubs.sql`
**Purpose**: Create placeholder compliance tables

**What it does**:
- Creates `mtl_entry`: `id`, `casino_id`, `staff_id`, `created_at`, `metadata`
- Creates `casino_settings`: `casino_id`, `gaming_day_start`, `metadata`
- Enables RLS on both (deny-all)
- Adds indexes for common lookups

**Acceptance**: Tables exist, no business logic, RLS enabled

---

## Execution Instructions

### Option 1: Supabase Dashboard (SQL Editor)
1. Navigate to: https://supabase.com/dashboard/project/vaicxfihdldgepzryhpd/sql
2. Execute each migration file in order (001 → 002 → 003 → 004)
3. Copy/paste entire file contents into SQL editor
4. Click "Run" for each migration
5. Verify no errors in output

### Option 2: psql (if direct DB access available)
```bash
psql <connection_string> -f supabase/migrations/20251002010000_enable_rls.sql
psql <connection_string> -f supabase/migrations/20251002020000_jwt_helpers.sql
psql <connection_string> -f supabase/migrations/20251002030000_audit_log_scaffold.sql
psql <connection_string> -f supabase/migrations/20251002040000_compliance_table_stubs.sql
```

### Option 3: Supabase CLI (when available)
```bash
supabase db push
```

---

## Post-Migration Verification

Run these checks after executing all migrations:

```sql
-- 1. Verify RLS is enabled on core tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('player', 'visit', 'ratingslip', 'casino', 'audit_log', 'mtl_entry', 'casino_settings');
-- Expected: All tables show rowsecurity = true

-- 2. Verify player policy exists
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename = 'player';
-- Expected: player_owner_policy on player table

-- 3. Verify staff_role enum
SELECT enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname = 'staff_role';
-- Expected: SUPERVISOR, DEALER, PIT_BOSS, AUDITOR

-- 4. Test jwt_get_role function
SELECT jwt_get_role();
-- Expected: 'SUPERVISOR'

-- 5. Verify audit_log table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'audit_log';
-- Expected: id, action, actor_id, timestamp, metadata

-- 6. Verify compliance tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('mtl_entry', 'casino_settings');
-- Expected: Both tables present
```

---

## Regenerate TypeScript Types

After migrations succeed:

```bash
npm run db:types
```

This updates `types/database.types.ts` with new tables/enums.

---

## CI Validation

Ensure CI passes:
- ✅ Type check: `npm run type-check`
- ✅ Lint: `npm run lint`
- ✅ Build: `npm run build`

---

## Phase 1 Acceptance Criteria

- [x] RLS ON by default for all core tables
- [x] One working "only owner can read/write" policy for player
- [x] JWT helper exists, returns hardcoded SUPERVISOR role
- [x] `audit_log`, `mtl_entry`, `casino_settings` tables exist but not wired
- [ ] CI passes migrations + regenerated types (pending execution)

---

## What's NOT Included (By Design)

**Deferred to Phase 2+**:
- Complex RLS role matrices (staff role enforcement)
- JWT claims expansion (multi-role, tiered permissions)
- Rich audit triggers per operation
- MTL thresholds, reporting, AML/CTR exports
- Additional policies for visit/ratingslip/casino tables

**Why**: Avoid gold-plating. Phase 1 is a safety net, not a fortress. Full security hardening happens after there's something to protect.

---

## Next Steps

1. Execute migrations in Supabase dashboard
2. Run post-migration verification queries
3. Regenerate types: `npm run db:types`
4. Commit changes and verify CI passes
5. Proceed to Phase 2: Player → Visit → Rating Slip vertical slice

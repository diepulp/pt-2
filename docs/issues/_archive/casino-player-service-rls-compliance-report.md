# RLS Security Specialist Report: CasinoService & PlayerService ADR-020 Track A Compliance

**Generated:** 2025-12-15
**Specialist:** RLS Security Specialist
**Scope:** CasinoService and PlayerService RLS compliance against ADR-020 Track A requirements
**Reference ADRs:** ADR-015, ADR-020

---

## Executive Summary

### Compliance Status: **PARTIAL COMPLIANCE - 1 CRITICAL GAP IDENTIFIED**

**Overall Assessment:**
- **PlayerService:** ✅ FULLY COMPLIANT
- **CasinoService:** ⚠️ **CRITICAL GAP - `casino` table has NO RLS policies**
- **RLS Policy Patterns:** ✅ All existing policies use ADR-020 Track A Pattern C (Hybrid)
- **Service Code:** ✅ No direct table access bypassing RLS detected
- **ADR-015 Scanner:** ✅ 0 issues (all migrations compliant or superseded)

**Critical Finding:**
The `casino` table itself has **NO ROW LEVEL SECURITY** enabled and **NO RLS policies** defined. This is a **cross-tenant data leakage vulnerability** allowing any authenticated user to read all casinos regardless of their assigned `casino_id`.

---

## Scope

**Task Requested:** Evaluate RLS compliance for CasinoService and PlayerService against ADR-020 Track A requirements

**Files Analyzed:**
- Services: 2 (casino, player)
- CRUD operations: 2 files
- RLS policies audited: 15 policies across 5 tables
- Migrations scanned: 26 SQL files

**Policies Audited:**
- `casino` (0 policies - **CRITICAL GAP**)
- `casino_settings` (2 policies - compliant)
- `staff` (4 policies - compliant)
- `player` (3 policies - compliant)
- `player_casino` (3 policies - compliant)

---

## ADR-020 Track A Pattern (Required Standard)

All RLS policies MUST use Pattern C (Hybrid):

```sql
CREATE POLICY "table_read_hybrid"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Requirements:**
1. `auth.uid() IS NOT NULL` - Authenticated user guard
2. `current_setting('app.X', true)` - Silent fail if unset
3. `NULLIF(..., '')` - Treat empty string as null (pooling edge case)
4. `COALESCE(..., auth.jwt() -> 'app_metadata' ->> 'X')` - JWT fallback
5. Pattern works with Supabase transaction-mode connection pooling

---

## Findings

### CRITICAL: `casino` Table Has No RLS Policies

**Severity:** P0 - Cross-Tenant Data Leakage
**Impact:** Any authenticated user can read all casinos in the database
**Current State:**
- `casino` table created in `00000000000000_baseline_srm.sql` (line 20-28)
- **NO `ALTER TABLE casino ENABLE ROW LEVEL SECURITY` found**
- **NO policies defined for SELECT/INSERT/UPDATE/DELETE**
- Table is wide-open to all authenticated users

**Evidence:**
```bash
# Searched all migrations for casino RLS enablement
$ grep -r "ALTER TABLE casino ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql
# Result: No matches found

# Searched for casino policies
$ grep -r "CREATE POLICY.*\bcasino\b.*FOR" supabase/migrations/*.sql
# Result: No matches found (only casino_settings policies exist)
```

**Schema (from baseline_srm.sql:20-28):**
```sql
create table casino (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references company(id) on delete cascade,
  name text not null,
  location text,
  address jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
```

**Expected Behavior:**
Staff members should only be able to read their own casino record (via `staff.casino_id` FK).

**Current Behavior:**
Any authenticated user can execute:
```sql
SELECT * FROM casino; -- Returns ALL casinos (cross-tenant leakage)
```

**Service Impact:**
- `services/casino/crud.ts` functions:
  - `listCasinos()` - Line 53-84: Will return all casinos for any user
  - `getCasinoById()` - Line 89-104: Will return any casino by ID
  - `updateCasino()` - Line 137-163: Can modify any casino
  - `deleteCasino()` - Line 168-183: Can soft-delete any casino

**Recommended Pattern C Policy:**
```sql
-- Enable RLS
ALTER TABLE casino ENABLE ROW LEVEL SECURITY;

-- Read: Staff can only read their own casino
CREATE POLICY casino_read_own ON casino
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Write: Admin-only (for casino creation/updates)
-- OR delegate to SECURITY DEFINER RPC
CREATE POLICY casino_write_admin ON casino
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );
```

---

### ✅ Compliant: `casino_settings` Policies

**Migration:** `20251211153228_adr015_rls_compliance_patch.sql` (lines 138-158)
**Status:** FULLY COMPLIANT with ADR-020 Track A Pattern C

**Policies:**
1. `casino_settings_read` (line 138)
   - ✅ Has `auth.uid() IS NOT NULL`
   - ✅ Uses `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)`
   - ✅ Pattern C compliant

2. `casino_settings_write` (line 147)
   - ✅ Has `auth.uid() IS NOT NULL`
   - ✅ Casino scope: Pattern C hybrid
   - ✅ Role check: Pattern C hybrid for `staff_role = 'admin'`
   - ✅ Full Pattern C compliant

**Service Impact:**
- `getCasinoSettings()` - Line 190-205: ✅ Protected by RLS
- `updateCasinoSettings()` - Line 210-244: ✅ Protected (admin-only)

---

### ✅ Compliant: `staff` Policies

**Migration:** `20251211153228_adr015_rls_compliance_patch.sql` (lines 172-227)
**Status:** FULLY COMPLIANT with ADR-020 Track A Pattern C

**Policies:**
1. `staff_read` (line 172)
   - ✅ Has `auth.uid() IS NOT NULL`
   - ✅ Bootstrap OR clause: `user_id = auth.uid()` (own record)
   - ✅ Casino scope: Pattern C hybrid
   - ✅ Full Pattern C compliant

2. `staff_write` (line 188)
   - ✅ Admin-only with Pattern C hybrid
   - ✅ Casino scope validation
   - ✅ Role check validation

3. `staff_update` (line 202)
   - ✅ Admin-only with Pattern C hybrid
   - ✅ Full Pattern C compliant

4. `staff_delete` (line 216)
   - ✅ Admin-only with Pattern C hybrid
   - ✅ Full Pattern C compliant

**Service Impact:**
- `listStaff()` - Line 251-287: ✅ Protected by RLS
- `getStaffById()` - Line 292-307: ✅ Protected by RLS
- `createStaff()` - Line 313-368: ✅ Protected (admin-only)
- `updateStaff()` - Line 374-456: ✅ Protected (admin-only)
- **JWT Sync:** ✅ Lines 352-365, 429-453 call `syncUserRLSClaims()` (ADR-015 Phase 2)

---

### ✅ Compliant: `player` Policies

**Migration:** `20251209183401_adr015_hybrid_rls_policies.sql` (lines 118-150)
**Status:** FULLY COMPLIANT with ADR-020 Track A Pattern C

**Policies:**
1. `player_select_enrolled` (line 118)
   - ✅ Has `auth.uid() IS NOT NULL`
   - ✅ Uses subquery to `player_casino` for enrollment check
   - ✅ Casino scope: Pattern C hybrid
   - ✅ Full Pattern C compliant

2. `player_insert_admin` (line 131)
   - ✅ Admin-only with Pattern C hybrid
   - ✅ Full Pattern C compliant

3. `player_update_enrolled` (line 140)
   - ✅ Pattern C hybrid for both enrollment check and role check
   - ✅ Full Pattern C compliant

**Service Impact:**
- `getPlayerById()` - Line 65-77: ✅ Protected by RLS (enrollment check)
- `listPlayers()` - Line 83-119: ✅ Protected by RLS
- `createPlayer()` - Line 124-140: ✅ Protected (admin-only)
- `updatePlayer()` - Line 146-171: ✅ Protected (enrollment + role check)
- `searchPlayers()` - Line 180-197: ✅ Uses `player_casino` join (RLS protected)

---

### ✅ Compliant: `player_casino` Policies

**Migration:** `20251209183401_adr015_hybrid_rls_policies.sql` (lines 73-105)
**Status:** FULLY COMPLIANT with ADR-020 Track A Pattern C

**Policies:**
1. `player_casino_select_same_casino` (line 73)
   - ✅ Has `auth.uid() IS NOT NULL`
   - ✅ Casino scope: Pattern C hybrid
   - ✅ Full Pattern C compliant

2. `player_casino_insert_staff` (line 82)
   - ✅ Staff role check with Pattern C hybrid
   - ✅ Casino scope validation
   - ✅ Full Pattern C compliant

3. `player_casino_update_admin` (line 95)
   - ✅ Admin-only with Pattern C hybrid
   - ✅ Full Pattern C compliant

**Service Impact:**
- `enrollPlayer()` - Line 205-243: ✅ Protected by RLS
- `getPlayerEnrollment()` - Line 249-263: ✅ Protected by RLS
- `getPlayerEnrollmentByPlayerId()` - Line 269-282: ✅ Protected by RLS

---

## Service Code Analysis

### CasinoService (`services/casino/crud.ts`)

**Context Injection:** ✅ No direct context injection (uses server-provided Supabase client with RLS)

**Direct Table Access:**
- Line 60-73: `.from("casino").select()` - ⚠️ **VULNERABLE** (no RLS on casino table)
- Line 93-97: `.from("casino").select().eq("id")` - ⚠️ **VULNERABLE**
- Line 114-122: `.from("casino").insert()` - ⚠️ **VULNERABLE**
- Line 148-153: `.from("casino").update()` - ⚠️ **VULNERABLE**
- Line 172-175: `.from("casino").update({status: 'inactive'})` - ⚠️ **VULNERABLE**
- Line 195-198: `.from("casino_settings").select()` - ✅ Protected by RLS
- Line 230-234: `.from("casino_settings").update()` - ✅ Protected by RLS
- Line 258-261: `.from("staff").select()` - ✅ Protected by RLS
- Line 297-300: `.from("staff").select()` - ✅ Protected by RLS
- Line 326-337: `.from("staff").insert()` - ✅ Protected by RLS
- Line 406-411: `.from("staff").update()` - ✅ Protected by RLS

**Bypass Detection:** ❌ No service key usage detected
**RLS Enforcement:** ⚠️ Relies on database RLS (which is missing for `casino` table)

---

### PlayerService (`services/player/crud.ts`)

**Context Injection:** ✅ No direct context injection (uses server-provided Supabase client with RLS)

**Direct Table Access:**
- Line 70-73: `.from('player').select()` - ✅ Protected by RLS
- Line 90-93: `.from('player').select()` - ✅ Protected by RLS
- Line 129-136: `.from('player').insert()` - ✅ Protected by RLS (admin-only)
- Line 157-160: `.from('player').update()` - ✅ Protected by RLS
- Line 188-193: `.from('player_casino').select()` - ✅ Protected by RLS
- Line 217-224: `.from('player_casino').insert()` - ✅ Protected by RLS
- Line 255-259: `.from('player_casino').select()` - ✅ Protected by RLS
- Line 273-277: `.from('player_casino').select()` - ✅ Protected by RLS

**Bypass Detection:** ❌ No service key usage detected
**RLS Enforcement:** ✅ All operations protected by RLS

---

## ADR-015 Scanner Results

**Scan Date:** 2025-12-15
**Scanner:** `scripts/adr015-rls-scanner.sh`

**Results:**
```
Files scanned:     26
Files superseded:  6 (policies replaced by later migrations)
Files with issues: 0
Total issues:      0

SUCCESS: All migrations are ADR-015 compliant.
```

**Interpretation:**
- All RLS policies in migrations use Pattern C (Hybrid) correctly
- No anti-patterns detected (bare current_setting, missing auth.uid(), etc.)
- 6 legacy migrations superseded by compliant fix migrations
- Scanner does NOT detect missing RLS on tables (only validates existing policies)

---

## Security Verification Checklist

**ADR-020 Track A Compliance:**
- [x] All policies include `auth.uid() IS NOT NULL`
- [x] All policies use `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)`
- [x] No raw `SET LOCAL` outside transactions
- [x] JWT fallback present for pooling resilience
- [ ] **CRITICAL GAP:** `casino` table has NO RLS enabled
- [x] No cross-tenant data leakage in existing policies
- [x] No service key usage detected in application code

**Pattern C Compliance by Table:**
- [ ] ❌ `casino` - **NO POLICIES** (P0 gap)
- [x] ✅ `casino_settings` - Full Pattern C
- [x] ✅ `staff` - Full Pattern C with bootstrap clause
- [x] ✅ `player` - Full Pattern C with enrollment check
- [x] ✅ `player_casino` - Full Pattern C

---

## Gaps Identified

| Priority | Table | Issue | Impact | Recommended Pattern |
|----------|-------|-------|--------|---------------------|
| **P0** | `casino` | No RLS enabled, no policies | Cross-tenant data leakage: any user can read/modify all casinos | Pattern C (see remediation) |

---

## Recommendations

### Immediate Actions (P0 - Before MVP)

1. **Create migration:** `20251215HHMMSS_adr020_casino_table_rls.sql`
2. **Enable RLS on `casino` table**
3. **Create Pattern C policies** for `casino` table (see recommended policies above)
4. **Test CasinoService** to ensure staff can only access their assigned casino
5. **Run integration tests** to verify cross-casino denial

### Migration Template

```sql
-- Migration: ADR-020 - Enable RLS on casino table
-- Priority: P0 (Cross-tenant data leakage)
-- Reference: docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md

BEGIN;

-- Enable RLS
ALTER TABLE casino ENABLE ROW LEVEL SECURITY;

-- Read: Staff can only read their own casino
CREATE POLICY casino_read_own ON casino
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Insert: Admin-only (for casino creation)
CREATE POLICY casino_insert_admin ON casino
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- Update: Admin-only OR own casino
CREATE POLICY casino_update_own_or_admin ON casino
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND (
      -- Admin can update any casino
      COALESCE(
        NULLIF(current_setting('app.staff_role', true), ''),
        (auth.jwt() -> 'app_metadata' ->> 'staff_role')
      ) = 'admin'
      OR
      -- Staff can update only their own casino
      id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
  );

-- Delete: Admin-only (soft delete via status update)
CREATE POLICY casino_delete_admin ON casino
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification: Confirm policies exist
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'casino';
```

### Post-Migration Verification

```bash
# 1. Apply migration
npx supabase migration up

# 2. Regenerate types
npm run db:types

# 3. Run integration tests
npm run test -- services/casino/__tests__/casino.integration.test.ts

# 4. Verify RLS scanner still passes
bash scripts/adr015-rls-scanner.sh
```

### Integration Test Requirements

Add test case in `services/casino/__tests__/casino.integration.test.ts`:

```typescript
describe('RLS: Cross-casino isolation', () => {
  it('should deny access to other casino records', async () => {
    // Setup: Create two casinos
    const casino1 = await createCasino(supabase, { name: 'Casino A' });
    const casino2 = await createCasino(supabase, { name: 'Casino B' });

    // Setup: Create staff for casino1
    const staff1 = await createStaff(supabase, {
      casino_id: casino1.id,
      role: 'pit_boss',
      user_id: user1.id,
    });

    // Context: Inject staff1 context (casino1)
    await injectRLSContext(supabase, {
      actorId: staff1.id,
      casinoId: casino1.id,
      staffRole: 'pit_boss',
    });

    // Test: Staff1 can read casino1
    const result1 = await getCasinoById(supabase, casino1.id);
    expect(result1).not.toBeNull();

    // Test: Staff1 CANNOT read casino2 (cross-tenant denial)
    const result2 = await getCasinoById(supabase, casino2.id);
    expect(result2).toBeNull(); // RLS should block
  });
});
```

---

## ADR-020 Compliance Summary

### MVP Phase 1 Checklist (Required for MVP)

- [x] ADR-015 scanner reports 0 issues
- [ ] **CRITICAL:** `casino` table RLS policies created
- [ ] Verify all SECURITY DEFINER RPCs have self-injection (not in scope for this audit)
- [ ] Write execution spec (EXEC-RLS-001) for remaining hardening work

### High-Value Tests (Required for MVP)

- [ ] Cross-casino denial tests (User A cannot see Casino B data) - **ADD TEST FOR `casino` TABLE**
- [ ] Role boundary tests (dealer vs pit_boss vs admin permissions)
- [ ] Pooling sanity tests (same behavior under Supavisor)

---

## Files Analyzed

### Service Files
- `/home/diepulp/projects/pt-2/services/casino/crud.ts`
- `/home/diepulp/projects/pt-2/services/player/crud.ts`

### Migration Files (RLS Policies)
- `supabase/migrations/00000000000000_baseline_srm.sql` (casino table schema)
- `supabase/migrations/20251129161956_prd000_casino_foundation.sql` (superseded)
- `supabase/migrations/20251211153228_adr015_rls_compliance_patch.sql` (casino_settings, staff)
- `supabase/migrations/20251209183401_adr015_hybrid_rls_policies.sql` (player, player_casino)
- `supabase/migrations/20251129230733_prd003_player_visit_rls.sql` (superseded)

### Documentation
- `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md`
- `/home/diepulp/projects/pt-2/docs/30-security/SEC-001-rls-policy-matrix.md`

---

## Conclusion

**Overall Compliance:** ⚠️ **PARTIAL - 1 P0 GAP**

**Strengths:**
- All existing RLS policies are fully compliant with ADR-020 Track A Pattern C
- PlayerService is fully protected by RLS
- No service key bypasses detected
- ADR-015 scanner reports 0 policy anti-patterns
- JWT claims sync implemented (ADR-015 Phase 2)

**Critical Gap:**
- **`casino` table has NO RLS protection** - This is a P0 cross-tenant data leakage vulnerability that MUST be fixed before MVP

**Next Steps:**
1. Create migration to enable RLS on `casino` table (use template above)
2. Apply migration and regenerate types
3. Add integration test for cross-casino denial on `casino` table
4. Verify CasinoService listCasinos() only returns user's casino
5. Re-run this audit to confirm 100% compliance

**ADR-020 Compliance Status:**
- Track A Pattern C implementation: ✅ Correct where implemented
- Coverage: ⚠️ Missing on 1 critical table (`casino`)
- MVP Readiness: ❌ **NOT READY** until `casino` table RLS is fixed

---

**Report Generated:** 2025-12-15
**Auditor:** RLS Security Specialist
**Status:** DELIVERED - AWAITING P0 REMEDIATION

# Rating Slip Workflow Misconfiguration Report

> **Date:** 2025-12-14
> **Status:** ACTIVE - Partial fixes applied
> **Related Issues:** ISSUE-5AD0182D, ISSUE-04905F8D, ISSUE-B3C8BA48
> **Related PRDs:** PRD-002, PRD-008
> **Affected Service:** RatingSlipService

---

## Executive Summary

A comprehensive analysis of the rating slip bounded context identified **interconnected issues** across architecture, security, and service layers that caused the move endpoint (`POST /api/v1/rating-slips/[id]/move`) to fail with 500 errors.

| Issue | Severity | Status | Root Cause |
|-------|----------|--------|------------|
| **ISSUE-5AD0182D** (RLS Context Pooling) | HIGH | FIXED (pending deploy) | RPCs not self-injecting context |
| **ISSUE-04905F8D** (Missing Columns) | HIGH | STALE TYPES | `npm run db:types` not run after migrations |
| **ISSUE-B3C8BA48** (Test Gap) | HIGH | OPEN | Tests fail before execution or test wrong scenario |
| Legacy RLS Policies | MEDIUM | OPEN | Duplicate non-compliant policies on `rating_slip_pause` |
| Migration Temporal Integrity | MEDIUM | FIXED | Column added after RPC that uses it |

---

## 1. Root Cause Analysis

### 1.1 Connection Pooling Context Loss

**The Core Problem:**

```
POST /api/v1/rating-slips/[id]/move
  │
  ├─ withRLS() → set_rls_context() [Transaction A]
  │               └─ SET LOCAL app.casino_id = 'xxx'
  │
  └─ handler()
      │
      ├─ rpc_close_rating_slip() [Transaction B - NEW CONNECTION]
      │    └─ current_setting('app.casino_id') = NULL ❌
      │       → "RLS context not set" error
      │
      └─ rpc_start_rating_slip() [Transaction C - NEVER REACHED]
```

**Why It Happens:**
- Supavisor uses **transaction mode pooling** (port 6543)
- `SET LOCAL` only persists within a single transaction
- Each RPC call = new pooled connection = new transaction = context lost

**Solution Applied:** Each RPC now calls `set_rls_context()` internally (ADR-015 Phase 1A)

### 1.2 Schema-Code Misalignment

**Missing Columns in TypeScript Types:**

| Column | In Database | In Types | Status |
|--------|-------------|----------|--------|
| `pause_intervals` | YES | YES | OK |
| `duration_seconds` | YES | NO | STALE |
| `final_average_bet` | YES | NO | STALE |

**Fix:** Run `npm run db:types` after migrations.

### 1.3 Migration Temporal Integrity Violation

**Before Fix:**
```
20251213190000_adr015_fix_rpc_context_injection.sql  ← Uses pause_intervals
20251214043516_add_rating_slip_pause_intervals.sql   ← Adds pause_intervals (TOO LATE)
```

**After Fix:**
```
20251213185500_add_rating_slip_pause_intervals.sql   ← Column added FIRST
20251213190000_adr015_fix_rpc_context_injection.sql  ← RPC uses column SECOND
```

---

## 2. Consolidated Findings by Domain

### 2.1 Architecture (Lead Architect Analysis)

| Finding | Severity | Impact |
|---------|----------|--------|
| Migration order conflict: RPCs reference columns added in later migrations | HIGH | Schema drift risk |
| Dual pause tracking: Both `rating_slip_pause` table AND `pause_intervals` array | MEDIUM | Mapper confusion |
| Deprecated parameter: `crud.ts` still passes `p_player_id` (removed from RPC) | LOW | TypeScript error if types regenerated |
| Bounded context isolation | COMPLIANT | No cross-context violations |
| ADR-015 Phase 1A self-injection | COMPLETE | All 4 RPCs updated |

### 2.2 Security (RLS Expert Analysis)

| Finding | Severity | Impact |
|---------|----------|--------|
| 3 legacy policies lack JWT fallback on `rating_slip_pause` table | MEDIUM | Auth bypass risk under pooling |
| Duplicate policies (old + new both active) | MEDIUM | Security rule conflicts |
| RPC self-injection pattern | IMPLEMENTED | Context persists across pooled connections |
| JWT claims sync | WORKING | Phase 2 complete |
| ADR-015 Pattern C compliance | **97.5%** | 119/122 policies compliant |

**Non-Compliant Policies (from migration `20251128221408`):**
```sql
-- Missing auth.uid() guard and JWT fallback
CREATE POLICY "rating_slip_pause_read_same_casino"
  ON rating_slip_pause FOR SELECT USING (
    casino_id = current_setting('app.casino_id')::uuid  -- NO JWT FALLBACK!
  );
```

### 2.3 Service Layer (Backend Developer Analysis)

| Finding | Severity | Impact |
|---------|----------|--------|
| TypeScript types stale: Missing `duration_seconds`, `final_average_bet` | HIGH | Runtime type mismatch |
| Manual type definitions in mappers.ts | MEDIUM | Drift from database schema |
| Move endpoint flow traced | ANALYZED | Failure point at `rpc_close_rating_slip` |
| DTO design | CORRECT | Appropriate field omissions |

---

## 3. Test Coverage Gap Analysis

### 3.1 Why Tests Didn't Catch the Issue

| Test File | Status | Why Issue Missed |
|-----------|--------|------------------|
| `rls-pooling-safety.integration.test.ts` | PASSES | Tests `set_rls_context` + SELECT only, NOT RPC→RPC flows |
| `rating-slip-move-pooling.test.ts` | FAILS at line 40 | Requires port 6543, env uses 54321. **Test never runs!** |
| `e2e/rating-slip-lifecycle.spec.ts` | BROKEN | `TransformStream is not defined` - Playwright broken |

### 3.2 The Critical Gap

```typescript
// services/rating-slip/__tests__/rating-slip-move-pooling.test.ts:40
beforeAll(() => {
  expect(supabaseUrl).toContain('6543'); // ← FAILS HERE
  // ... actual test code never reached
});
```

**Environment:** `http://127.0.0.1:54321` (direct DB)
**Expected:** Port `6543` (Supavisor pooled)

**Result:** A test exists that would catch the issue, but it **fails on precondition** before testing the actual flow.

---

## 4. Fixes Applied

### 4.1 Migration Temporal Integrity (FIXED)

| Action | Before | After |
|--------|--------|-------|
| Renamed | `20251214043516_add_rating_slip_pause_intervals.sql` | `20251213185500_add_rating_slip_pause_intervals.sql` |
| Updated | schema_migrations version `20251214043516` | `20251213185500` |
| Removed | Duplicate `pause_intervals` from `20251214044205` | Kept only `duration_seconds`, `final_average_bet` |
| Added | `IF NOT EXISTS` clause | Safety for re-runs |

### 4.2 RPC Self-Injection (PENDING DEPLOY)

Migration `20251213190000_adr015_fix_rpc_context_injection.sql` adds self-injection to all 4 rating slip RPCs:

```sql
CREATE OR REPLACE FUNCTION rpc_close_rating_slip(...) AS $$
BEGIN
  -- Self-inject context (ADR-015 Phase 1A)
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Now context is available for entire transaction
  ...
END;
$$;
```

---

## 5. Priority Action Matrix

### P0 - Critical (Deploy Now)

| Action | Command/File |
|--------|--------------|
| Regenerate TypeScript types | `npm run db:types` |
| Deploy RPC self-injection migration | `supabase db push` |

### P1 - High (This Sprint)

| Action | Details |
|--------|---------|
| Drop legacy RLS policies | Create migration to drop 3 non-compliant policies on `rating_slip_pause` |
| Remove deprecated `p_player_id` | `services/rating-slip/crud.ts:197-205` |
| Fix move-pooling test | Remove port 6543 assertion or make conditional |
| Add RPC→RPC context test | Add to `rls-pooling-safety.integration.test.ts` |

### P2 - Medium (Next Sprint)

| Action | Details |
|--------|---------|
| Refactor mappers to use DB types | Replace manual type definitions in `services/rating-slip/mappers.ts` |
| Fix Playwright E2E | Resolve `TransformStream is not defined` error |
| Add CI gate | Fail builds when integration tests fail |

### P3 - Low (Backlog)

| Action | Details |
|--------|---------|
| Complete ADR-015 Phase 3 | Migrate to JWT-only (remove SET LOCAL) |
| Remove middleware redundancy | `withRLS()` now redundant for RPC calls |

---

## 6. Verification SQL

### Check RPC Self-Injection Deployed

```sql
SELECT proname, prosrc LIKE '%PERFORM set_rls_context%' AS has_self_injection
FROM pg_proc
WHERE proname IN (
  'rpc_start_rating_slip',
  'rpc_pause_rating_slip',
  'rpc_resume_rating_slip',
  'rpc_close_rating_slip'
);
-- Expected: All rows show has_self_injection = true
```

### Check for Duplicate Policies

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'rating_slip_pause'
ORDER BY policyname;
-- Issue: May show duplicate policy names with different definitions
```

### Verify Migration Order

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '202512%'
ORDER BY version;
-- Verify: 20251213185500 comes BEFORE 20251213190000
```

---

## 7. Related Files

### Migrations (Fix Applied)

| File | Purpose | Status |
|------|---------|--------|
| `20251213185500_add_rating_slip_pause_intervals.sql` | Add pause_intervals column | RENAMED (was 20251214043516) |
| `20251213190000_adr015_fix_rpc_context_injection.sql` | RPC self-injection | PENDING DEPLOY |
| `20251214044205_add_missing_rating_slip_columns.sql` | Add duration_seconds, final_average_bet | UPDATED (removed duplicate) |

### Service Layer

| File | Issue |
|------|-------|
| `services/rating-slip/crud.ts:197-205` | Passes deprecated `p_player_id` |
| `services/rating-slip/mappers.ts:32-44` | Manual type definitions |
| `types/database.types.ts` | Missing `duration_seconds`, `final_average_bet` |

### Tests

| File | Issue |
|------|-------|
| `services/rating-slip/__tests__/rating-slip-move-pooling.test.ts:40` | Port assertion fails |
| `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` | Missing RPC→RPC test |
| `e2e/rating-slip-lifecycle.spec.ts` | Playwright broken |

### Documentation

| File | Purpose |
|------|---------|
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | Connection pooling strategy |
| `docs/issues/ISSUE-5AD0182D-CONNECTION-POOLING-ANALYSIS.md` | Root cause analysis |

---

## 8. Technical Debt Recorded

The following technical debt has been recorded to the Memori `arch_decisions` namespace:

1. **Migration Naming Violations** (PRD-004 loyalty)
   - Severity: MEDIUM
   - Latent risk - will surface when loyalty workflows tested
   - Cannot safely rename committed migrations

2. **E2E Test Coverage Gap**
   - Severity: HIGH
   - Issue ID: ISSUE-B3C8BA48
   - Tests fail before execution or test wrong scenario

3. **Temporal Integrity Fix**
   - Status: APPLIED
   - pause_intervals column now added before RPC that uses it

---

## 9. Lessons Learned

1. **Connection Pooling Changes Everything**
   - SET LOCAL context does NOT persist across pooled connections
   - Each RPC must be self-contained (self-inject context)
   - ADR-015 Pattern C (Hybrid) is the correct approach

2. **Tests Must Test Production Conditions**
   - Port 54321 (direct) behaves differently than port 6543 (pooled)
   - Tests that require specific environments should skip gracefully, not fail
   - RPC-to-RPC flows must be explicitly tested

3. **Migration Order Matters**
   - PL/pgSQL functions don't validate column existence at creation time
   - But they WILL fail at execution time if columns don't exist
   - Always verify migration dependencies run in correct order

4. **Type Generation Must Be Part of Workflow**
   - After every migration: `npm run db:types`
   - Consider adding to CI/CD pipeline
   - TypeScript types are documentation - keep them accurate

---

## 10. Next Steps

1. [ ] Run `npm run db:types` to regenerate TypeScript types
2. [ ] Deploy migration `20251213190000_adr015_fix_rpc_context_injection.sql`
3. [ ] Create migration to drop legacy `rating_slip_pause` policies
4. [ ] Fix `rating-slip-move-pooling.test.ts` port assertion
5. [ ] Add RPC→RPC context test to `rls-pooling-safety.integration.test.ts`
6. [ ] Test move endpoint: `POST /api/v1/rating-slips/[id]/move`
7. [ ] Monitor for "RLS context not set" errors in Supabase logs (24 hours)

---

## Appendix: Issue Cross-Reference

| Issue ID | Title | Status | Related To |
|----------|-------|--------|------------|
| ISSUE-5AD0182D | RLS context not persisting across pooled connections | FIXED (pending deploy) | ADR-015 |
| ISSUE-04905F8D | Missing rating_slip columns causing PostgreSQL errors | STALE TYPES | PRD-002 |
| ISSUE-B3C8BA48 | E2E test suite fails to catch RLS issues | OPEN | Test coverage |
| ISSUE-3A0FC573 | Test issue for namespace verification | LOW | Memori testing |

---

**Document Author:** Lead Architect + RLS Security Specialist + Backend Developer (Parallel Analysis)
**Last Updated:** 2025-12-14
**Review Cycle:** After each fix is deployed

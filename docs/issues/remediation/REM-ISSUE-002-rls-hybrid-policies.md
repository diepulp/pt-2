# REM-ISSUE-002: RLS Hybrid Policies Remediation

**Issue:** ISSUE-002 - RLS Context RPC Injection Failure
**Status:** Ready for Execution
**Priority:** P0 - Blocking
**Created:** 2025-12-10
**Author:** Lead Architect + RLS Security Specialist

---

## Executive Summary

The `/api/v1/visits` endpoint fails with `invalid input syntax for type uuid: ""` due to ADR-015 WS4 hybrid RLS policies **not being applied** to the database. The migration files exist but the actual database policies still use the vulnerable pattern that fails when `app.casino_id` is empty.

---

## Root Cause Analysis

### The Problem Chain

```
1. API Request: GET /api/v1/visits
         ↓
2. Middleware: withAuth → withRLS → handler
         ↓
3. withRLS: supabase.rpc('set_rls_context', {...})
         ↓ [Transaction A - context set here]
4. Handler: supabase.from('visit').select('..., player:player_id(...)')
         ↓ [Transaction B - NEW transaction, context NOT available]
5. RLS Policy: player_select_enrolled evaluates
         ↓
6. Policy Expression: (current_setting('app.casino_id', true))::uuid
         ↓
7. current_setting returns: '' (empty string - context not set in this transaction)
         ↓
8. Cast fails: ''::uuid → ERROR: invalid input syntax for type uuid: ""
```

### Why Transaction Isolation Breaks RLS

Supabase uses **connection pooling** (Supavisor/PgBouncer in transaction mode):
- Each query can get a different connection from the pool
- `SET LOCAL` only persists within the **same transaction**
- RPC call and data query run in **separate transactions**
- Context set in Transaction A is **not visible** in Transaction B

### Why ADR-015 Pattern C Fixes This

The hybrid pattern uses `COALESCE` with JWT fallback:

```sql
-- BROKEN (current): Direct cast fails on empty string
casino_id = (current_setting('app.casino_id', true))::uuid

-- FIXED (ADR-015 Pattern C): NULLIF guard + JWT fallback
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,  -- Returns NULL if empty
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid       -- JWT fallback
)
```

---

## Diagnostic Evidence

### Database State (Verified 2025-12-10)

```sql
-- Actual policy in database (BROKEN):
SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname = 'player_select_enrolled';
-- Result: (EXISTS (SELECT 1 FROM player_casino pc WHERE ((pc.player_id = player.id)
--          AND (pc.casino_id = (current_setting('app.casino_id'::text, true))::uuid))))

-- RLS Status:
-- player: RLS ENABLED (policies enforced)
-- visit: RLS DISABLED (policies exist but not enforced)
-- gaming_table: RLS DISABLED
-- rating_slip: RLS DISABLED
```

### API Endpoint Behavior

| Endpoint | Table Join | RLS on Join? | Status |
|----------|------------|--------------|--------|
| `/api/v1/tables` | `gaming_table` only | No | 200 OK |
| `/api/v1/rating-slips` | `rating_slip` only | No | 200 OK |
| `/api/v1/visits` | `visit` + `player` | **player: YES** | **500 Error** |

### Migration Status Discrepancy

```
Supabase CLI shows:     20251209183401 as "applied"
schema_migrations table: Does NOT contain 20251209183401
Database policies:      Use OLD pattern without COALESCE
```

---

## Remediation Options

### Option A: Apply Hybrid Policies Migration (RECOMMENDED)

**Complexity:** Low
**Risk:** Low
**Downtime:** None (online DDL)

Execute the ADR-015 WS4 migration directly:

```bash
# From project root
docker exec -i supabase_db_pt-2 psql -U postgres < supabase/migrations/20251209183401_adr015_hybrid_rls_policies.sql
```

**Verification:**
```bash
# Verify policies updated
docker exec -i supabase_db_pt-2 psql -U postgres -c "
SELECT policyname, pg_get_expr(polqual, polrelid) as using_clause
FROM pg_policy WHERE polname = 'player_select_enrolled';
"

# Should show COALESCE pattern
```

**Post-execution:**
1. Refresh browser at `http://localhost:3000/pit`
2. Verify `/api/v1/visits` returns 200 OK
3. Confirm dashboard loads without error

---

### Option B: Database Reset (Clean Slate)

**Complexity:** Low
**Risk:** Medium (loses dev data)
**Downtime:** ~2-3 minutes

```bash
npx supabase db reset
```

**Use when:**
- Development database is expendable
- Want to ensure all migrations apply cleanly
- Seed data refresh is acceptable

---

### Option C: Temporary Dev Workaround (NOT RECOMMENDED)

**Complexity:** Low
**Risk:** HIGH (security bypass)
**Downtime:** None

```sql
-- TEMPORARY: Disable RLS on player table
ALTER TABLE player DISABLE ROW LEVEL SECURITY;
```

**Risks:**
- Cross-tenant data exposure in dev
- Masks the real issue
- MUST NOT reach production
- Technical debt accumulation

**Only use if:** Urgent unblocking needed and Option A/B are blocked

---

## Recommended Execution Plan

### Phase 1: Immediate Fix (Option A)

```bash
# Step 1: Apply hybrid policies
docker exec -i supabase_db_pt-2 psql -U postgres \
  < supabase/migrations/20251209183401_adr015_hybrid_rls_policies.sql

# Step 2: Verify policies updated
docker exec -i supabase_db_pt-2 psql -U postgres -c "
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('visit', 'player', 'player_casino')
ORDER BY tablename;
"

# Step 3: Test API
curl -s http://localhost:3000/api/v1/visits?status=active | jq '.ok'
# Expected: true
```

### Phase 2: Validation

1. **Browser Test:**
   - Navigate to `http://localhost:3000/pit`
   - Confirm "ERROR LOADING DASHBOARD" is gone
   - Verify tables and active visits display

2. **Integration Tests:**
   ```bash
   npm run test -- --grep "RLS"
   ```

3. **Cross-tenant Isolation:**
   - Verify queries only return data for `DEV_RLS_CONTEXT.casinoId`

### Phase 3: Documentation Update

1. Update ISSUE-002 status to "Resolved"
2. Update EXECUTION-SPEC-ADR-015.md with WS4 completion
3. Record in Memori for session continuity

---

## Rollback Plan

If Option A causes issues:

```sql
-- Revert to original policies (from prd003_player_visit_rls migration)
-- This restores the broken state but at least it's a known state

DROP POLICY IF EXISTS player_select_enrolled ON player;
CREATE POLICY player_select_enrolled ON player
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = (current_setting('app.casino_id', true))::uuid
    )
  );
```

---

## Long-term Prevention

### ADR-015 Phase 2 Completion

To fully resolve connection pooling issues, complete Phase 2:

1. **JWT Claims Integration:**
   ```typescript
   // At authentication time, embed context in JWT
   await supabase.auth.admin.updateUserById(userId, {
     app_metadata: {
       casino_id: staffRecord.casino_id,
       staff_role: staffRecord.role,
       staff_id: staffRecord.id
     }
   });
   ```

2. **Remove SET LOCAL Dependency:**
   - With JWT claims, RLS policies use `auth.jwt()` directly
   - No transaction scope issues
   - Connection pooling fully compatible

### CI/CD Integration

Add migration verification to CI:

```yaml
# .github/workflows/migration-check.yml
- name: Verify migrations applied
  run: |
    npx supabase db diff --linked
    # Fail if local migrations don't match remote
```

---

## Related Documents

- [ISSUE-002: RLS Context RPC Injection Failure](../ISSUE-002-rls-context-rpc-failure.md)
- [ADR-015: RLS Connection Pooling Strategy](../../80-adrs/ADR-015-rls-connection-pooling-strategy.md)
- [EXECUTION-SPEC-ADR-015](../../20-architecture/specs/ADR-015/EXECUTION-SPEC-ADR-015.md)
- [SEC-001: RLS Policy Matrix](../../30-security/SEC-001-rls-policy-matrix.md)

---

## Approval & Execution

| Role | Name | Status |
|------|------|--------|
| Author | Lead Architect | Ready |
| Reviewer | RLS Security Specialist | Verified |
| Approver | User | **PENDING** |

**To execute Option A, run:**
```bash
docker exec -i supabase_db_pt-2 psql -U postgres < supabase/migrations/20251209183401_adr015_hybrid_rls_policies.sql
```

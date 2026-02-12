# ISSUE-5AD0182D: RLS Context Not Persisting - Connection Pooling Gap Analysis

## Executive Summary

The root cause of the "RLS context not set: app.casino_id is required" error in POST `/api/v1/rating-slips/[id]/move` endpoint is a fundamental design gap in ADR-015 implementation. While Phase 1 (transaction-wrapped RPC) was correctly implemented for `set_rls_context()`, the rating slip RPCs (`rpc_start_rating_slip`, `rpc_close_rating_slip`, etc.) are NOT calling `set_rls_context` internally. Each RPC call gets a separate pooled connection, causing context to be lost.

## Root Cause Analysis

### 1. Current Flow (Broken)

```
withServerAction()
  ├─ withAuth()      → Sets ctx.rlsContext (JS memory only)
  ├─ withRLS()       → Calls set_rls_context() RPC (Transaction A: SET LOCAL)
  └─ handler()       → Calls crud.close() and crud.start()
                      ├─ rpc_close_rating_slip() (Transaction B: reads context, EMPTY!)
                      └─ rpc_start_rating_slip() (Transaction C: reads context, EMPTY!)
```

**Problem**: Each RPC call (`set_rls_context`, `rpc_close_rating_slip`, `rpc_start_rating_slip`) runs in a separate transaction due to Supavisor's transaction mode pooling. The SET LOCAL context set in Transaction A does NOT persist to Transactions B and C.

### 2. RPC Structure Gap

All rating slip RPCs validate context but do NOT inject it:

```sql
CREATE OR REPLACE FUNCTION rpc_close_rating_slip(
  p_casino_id UUID,
  p_rating_slip_id UUID,
  p_actor_id UUID,
  p_average_bet NUMERIC DEFAULT NULL
) RETURNS TABLE (...) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- VALIDATE ONLY - does NOT inject
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';  -- ← Error thrown here
  END IF;
```

### 3. ADR-015 Design vs Implementation Gap

**ADR-015 Pattern C (Hybrid) expects:**
```sql
-- Policy uses COALESCE for fallback
CREATE POLICY "table_read_hybrid" ON table FOR SELECT USING (
  casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid  -- Fallback to JWT
  )
);
```

**ADR-015 Phase 2 expectations:**
- JWT claims populated in `app_metadata`
- RPCs use JWT fallback when SET LOCAL unavailable
- Context persists via JWT claims even across pooled connections

**Current implementation:**
- JWT claims ARE populated (Phase 2 complete per ADR-015 changelog)
- But RPCs call `current_setting()` directly without JWT fallback
- Missing: JWT fallback in RPC context validation

## Affected Components

### Rating Slip Operations (ALL)
- `rpc_start_rating_slip()` - Called by `crud.start()`
- `rpc_pause_rating_slip()` - Called by `crud.pause()`
- `rpc_resume_rating_slip()` - Called by `crud.resume()`
- `rpc_close_rating_slip()` - Called by `crud.close()`

### File Locations
- `/home/diepulp/projects/pt-2/supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql` (most recent RPC definitions)
- `/home/diepulp/projects/pt-2/services/rating-slip/crud.ts` (CRUD layer calling RPCs)
- `/home/diepulp/projects/pt-2/services/rating-slip/index.ts` (service factory)
- `/home/diepulp/projects/pt-2/app/api/v1/rating-slips/[id]/move/route.ts` (affected endpoint)
- `/home/diepulp/projects/pt-2/lib/server-actions/middleware/compositor.ts` (middleware chain)
- `/home/diepulp/projects/pt-2/lib/server-actions/middleware/rls.ts` (RLS injection middleware)
- `/home/diepulp/projects/pt-2/lib/supabase/rls-context.ts` (context injection implementation)

## Solution Options

### Option 1: RPC Context Self-Injection (Recommended, Pattern C Compliance)

Update all rating slip RPCs to call `set_rls_context` internally:

```sql
CREATE OR REPLACE FUNCTION rpc_close_rating_slip(...) RETURNS TABLE (...) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Self-inject context from JWT or parameters
  PERFORM set_rls_context(
    p_actor_id,
    p_casino_id,
    COALESCE(current_setting('app.staff_role', true), '')  -- from JWT if available
  );

  -- Now context is available for RLS and audit
  INSERT INTO audit_log ...;
  -- etc.
END;
$$;
```

**Pros:**
- True Pattern C compliance
- JWT fallback works correctly
- Each RPC is self-contained
- No middleware dependency
- Works across multiple RPC calls

**Cons:**
- Need to update 4 RPCs
- Redundant context injection (but required for pooling)

### Option 2: Transaction-Wrapped RPC Orchestration (Pattern B)

Create a single RPC that handles multiple operations in one transaction:

```sql
CREATE OR REPLACE FUNCTION rpc_move_player(
  p_current_slip_id UUID,
  p_destination_table_id UUID,
  p_destination_seat_number TEXT,
  p_casino_id UUID,
  p_actor_id UUID
) RETURNS TABLE (new_slip rating_slip, closed_slip rating_slip) AS $$
BEGIN
  PERFORM set_rls_context(p_actor_id, p_casino_id, 'pit_boss');

  -- Close current slip
  UPDATE rating_slip SET status = 'closed', end_time = now() WHERE id = p_current_slip_id;

  -- Start new slip
  INSERT INTO rating_slip (...) VALUES (...) RETURNING *;
END;
$$;
```

**Pros:**
- All operations in single transaction
- Guaranteed context consistency
- Avoids multiple pooled connections

**Cons:**
- Breaks service isolation (combining close + start logic)
- Less reusable
- Violates PRD-002 service boundaries
- Makes move endpoint special case

### Option 3: JWT-Only Full Migration (Pattern A)

Remove SET LOCAL entirely. Switch all RPCs to use JWT claims only:

```sql
CREATE OR REPLACE FUNCTION rpc_close_rating_slip(...) RETURNS TABLE (...) AS $$
BEGIN
  v_context_actor_id := (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid;
  v_context_casino_id := (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid;
  -- Remove current_setting() calls entirely
END;
$$;
```

**Pros:**
- Native Supabase pattern
- Best performance (no extra RPC)
- No connection pooling issues

**Cons:**
- JWT claims must be refreshed on role change
- Requires Phase 3 completion
- Big bang migration risk
- Service layer still passes actor_id/casino_id params that go unused

## Recommendation: Option 1 + Phase 3 Preparation

**Strategy:** Implement Option 1 (RPC self-injection) as immediate fix, with Phase 3 (JWT-only) as follow-up.

### Phase 1A: RPC Self-Injection Update

```sql
-- Update all 4 rating slip RPCs
CREATE OR REPLACE FUNCTION rpc_start_rating_slip(...) RETURNS rating_slip
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Inject context locally (transaction-scoped)
  PERFORM set_rls_context(p_actor_id, p_casino_id, 'pit_boss');  -- Role from parameter

  -- Continue with original logic
END;
$$;
```

### Phase 1B: JWT Fallback Validation

Verify JWT sync is working correctly:
- Check `auth.users.app_metadata` has `casino_id`, `staff_id`, `staff_role`
- Validate `syncUserRLSClaims()` is called on staff creation/update
- Monitor for JWT vs. session variable mismatches

### Phase 3: Full JWT Migration

Once self-injection pattern is confirmed working:
- Remove `current_setting()` calls entirely
- Keep `PERFORM set_rls_context()` for audit logs and RLS
- Update service layer to stop passing redundant params
- Document JWT claim refresh requirements

## Immediate Action Items

1. **Update RPCs** (4 functions in `/home/diepulp/projects/pt-2/supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql`):
   - `rpc_start_rating_slip()`
   - `rpc_pause_rating_slip()`
   - `rpc_resume_rating_slip()`
   - `rpc_close_rating_slip()`

2. **Verify JWT Claims** (Ensure Phase 2 is complete):
   - Check existing `supabase/migrations/20251210001858_adr015_backfill_jwt_claims.sql`
   - Validate JWT claims in auth.users.app_metadata

3. **Test Connection Pooling**:
   - Add integration test specifically for move endpoint
   - Test under concurrent load with connection pooling enabled
   - Verify no cross-tenant data leakage

4. **Update Documentation**:
   - SEC-001: Document RPC self-injection pattern
   - ADR-015: Add Phase 1A entry for RPC updates
   - Add migration guide for Phase 3

## Verification Checklist

- [ ] All 4 rating slip RPCs call `set_rls_context` internally
- [ ] JWT claims fallback working in RLS policies
- [ ] Remove all `current_setting()` calls from RLS policies
- [ ] Integration test for move endpoint passes under pooling
- [ ] No cross-tenant data leakage under concurrent load
- [ ] Update SEC-001 and ADR-015 documentation
- [ ] Service layer still functional (no external API changes)

## Related Files for Fix

1. **Primary**: `/home/diepulp/projects/pt-2/supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql`
2. **Test**: `/home/diepulp/projects/pt-2/services/rating-slip/__tests__/rating-slip.integration.test.ts`
3. **Service**: `/home/diepulp/projects/pt-2/services/rating-slip/crud.ts`
4. **Endpoint**: `/home/diepulp/projects/pt-2/app/api/v1/rating-slips/[id]/move/route.ts`
5. **Middleware**: `/home/diepulp/projects/pt-2/lib/server-actions/middleware/rls.ts`
6. **Documentation**: `/home/diepulp/projects/pt-2/docs/30-security/SEC-001-rls-policy-matrix.md`

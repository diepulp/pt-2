# ADR-015 Phase 1A RPC Self-Injection Audit: Financial & Loyalty Domains

**Audit Date:** 2025-12-21
**Auditor:** RLS Security Specialist
**Scope:** All RPC functions in financial transaction and loyalty/rewards domains
**Focus:** ADR-015 Phase 1A self-injection compliance (calls to `PERFORM set_rls_context()`)

---

## Executive Summary

**Status:** ❌ NON-COMPLIANT (Phase 1A incomplete)

Critical finding: **Zero RPCs in financial and loyalty domains implement Phase 1A self-injection** despite having compliant Pattern C context validation. This leaves these functions vulnerable to connection pooling race conditions where RLS context may not be available when needed.

### Key Statistics
- **Total RPCs audited:** 7
- **Pattern C compliant:** 7 (100%)
- **Phase 1A self-injection compliant:** 0 (0%)
- **Migration risk:** HIGH - Functions can fail intermittently under transaction mode pooling

---

## ADR-015 Phase 1A: What We're Checking

Per ADR-015 (2025-12-13 Phase 1A Implementation):

```sql
-- Phase 1A Compliant Pattern:
CREATE OR REPLACE FUNCTION rpc_example(
  p_casino_id uuid,
  p_actor_id uuid,
  ...
) RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER  -- or INVOKER with proper validation
AS $$
DECLARE
  v_context_staff_role text;
BEGIN
  -- ════════════════════════════════════════════════════════════════════
  -- SELF-INJECTION: Call set_rls_context within same transaction
  -- ════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Then proceed with business logic
  ...
END;
$$;
```

**Rationale:** Without self-injection, the RLS context set by `withServerAction` middleware may be on a different pooled connection than the RPC execution, causing RLS policies using `current_setting()` to fail intermittently.

---

## Issue #1: rpc_create_financial_txn - NO SELF-INJECTION

### File Location
`/home/diepulp/projects/pt-2/supabase/migrations/20251211172516_adr015_financial_rpc_hardening.sql` (lines 29-131)

### Current Implementation
```sql
CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(...)
RETURNS public.player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER  -- ✅ Correct
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid := COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid);
  v_actor_id uuid := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid);
  v_staff_role text := COALESCE(NULLIF(current_setting('app.staff_role', true), ''), (auth.jwt() -> 'app_metadata' ->> 'staff_role'));
  v_row player_financial_transaction%ROWTYPE;
  v_validated_staff_role staff.role%TYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_casino_id IS NULL OR v_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch';
  END IF;

  IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch';
  END IF;

  -- Validates staff role from database
  SELECT s.role INTO v_validated_staff_role
    FROM staff s
   WHERE s.id = p_created_by_staff_id
     AND s.user_id = auth.uid()
     AND s.status = 'active'
     AND s.casino_id = v_casino_id
     AND s.role IN ('cashier', 'pit_boss', 'admin');

  -- Pit boss constraints per SEC-005...
  IF v_validated_staff_role = 'pit_boss' THEN
    IF p_direction <> 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions';
    END IF;
  END IF;

  -- ❌ MISSING: PERFORM set_rls_context(p_created_by_staff_id, p_casino_id, v_validated_staff_role);

  INSERT INTO public.player_financial_transaction ...;
  RETURN v_row;
END;
$$;
```

### Non-Compliance Issues

1. **❌ NO SELF-INJECTION:** Does not call `PERFORM set_rls_context()` within the function
2. **✅ Pattern C Validation:** Correctly extracts context with COALESCE + JWT fallback
3. **✅ Role Validation:** Enforces SEC-005 role taxonomy (`cashier`, `pit_boss`, `admin`)
4. **✅ Pit Boss Constraints:** Correctly restricts pit_boss to buy-ins only (`direction = 'in'`)
5. **✅ SECURITY INVOKER:** Correctly uses INVOKER (not DEFINER) with validation

### Impact

**High Severity:** This function can encounter connection pooling race conditions:

```
Scenario: Transaction Mode Pooling (Supavisor port 6543)

Request 1: withServerAction middleware
├─ Connection A: PERFORM set_rls_context(...)
└─ ✅ Success

Request 2: rpc_create_financial_txn() RPC call
├─ Connection B: INSERT INTO player_financial_transaction
├─ RLS Policy: WHERE casino_id = current_setting('app.casino_id')
├─ ❌ FAIL: Connection B has no context set (Connection A had it)
└─ Result: INSERT blocked, transaction aborted
```

### Fix Required

Add self-injection at function start:

```sql
BEGIN
  -- Extract and validate context
  v_casino_id := COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, ...);
  ... validation logic ...

  -- SELF-INJECTION: Ensure context is set for RLS policies
  PERFORM set_rls_context(p_created_by_staff_id, p_casino_id, v_validated_staff_role);

  -- Proceed with INSERT (now guaranteed to have context)
  INSERT INTO public.player_financial_transaction ...;
END;
```

---

## Issue #2: rpc_issue_mid_session_reward - NO SELF-INJECTION

### File Location
- **Baseline:** `/home/diepulp/projects/pt-2/supabase/migrations/00000000000000_baseline_srm.sql` (line 342)
- **ADR-015 Patch:** `/home/diepulp/projects/pt-2/supabase/migrations/20251211153228_adr015_rls_compliance_patch.sql` (line 31)
- **SEC-006 Hardened:** `/home/diepulp/projects/pt-2/supabase/migrations/20251212080915_sec006_rls_hardening.sql` (line 775)

### Current Implementation (SEC-006 Version - Most Recent)

```sql
CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text DEFAULT NULL,
  p_reason loyalty_reason DEFAULT 'mid_session'
) RETURNS TABLE (ledger_id uuid, balance_after int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_context_casino_id uuid;
BEGIN
  -- SEC-006 added context validation
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ❌ MISSING: PERFORM set_rls_context(p_staff_id, p_casino_id, v_context_staff_role);

  -- Verify rating slip eligibility
  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = p_casino_id
     AND rs.status IN ('open','paused');

  -- Insert ledger entry (RLS enforced)
  INSERT INTO loyalty_ledger ...;
END;
$$;
```

### Non-Compliance Issues

1. **❌ NO SELF-INJECTION:** Does not inject context for subsequent RLS enforcement
2. **✅ Pattern C Validation:** Has context validation with JWT fallback
3. **❌ NO ROLE VALIDATION:** Does not validate caller's staff role against SEC-005
4. **✅ Casino Scope Check:** Validates p_casino_id matches context

### Impact

**Medium-High Severity:** Function may fail intermittently when RLS policies on `loyalty_ledger` or `player_loyalty` tables reference `current_setting('app.*')`.

### Fix Required

```sql
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_validated_staff_id uuid;
BEGIN
  -- Extract context
  v_context_casino_id := COALESCE(...);
  v_context_staff_role := COALESCE(...);

  -- Validate
  IF p_casino_id != v_context_casino_id THEN ... END IF;

  -- Validate staff role and existence
  SELECT s.id INTO v_validated_staff_id
    FROM staff s
   WHERE s.id = p_staff_id
     AND s.user_id = auth.uid()
     AND s.casino_id = v_context_casino_id
     AND s.role IN ('pit_boss', 'admin')  -- Per SEC-005
     AND s.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized staff';
  END IF;

  -- SELF-INJECTION
  PERFORM set_rls_context(v_validated_staff_id, p_casino_id, v_context_staff_role);

  -- Business logic now safe
  PERFORM 1 FROM rating_slip ...;
  INSERT INTO loyalty_ledger ...;
END;
```

---

## Issue #3: rpc_accrue_on_close - NO SELF-INJECTION

### File Location
`/home/diepulp/projects/pt-2/supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql` (line 57)

### Current Implementation
```sql
CREATE OR REPLACE FUNCTION rpc_accrue_on_close(
  p_rating_slip_id uuid,
  p_casino_id uuid,
  p_idempotency_key uuid
)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY INVOKER  -- ✅ Correct
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_slip record;
  ...
BEGIN
  -- Extract context with fallback
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_context_casino_id IS NULL THEN
    v_context_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
  END IF;

  -- Validate casino scope
  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH';
  END IF;

  -- Validate role
  v_caller_role := COALESCE(...);
  IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- ❌ MISSING: PERFORM set_rls_context(...)

  -- Fetch rating slip
  SELECT * INTO v_slip
  FROM rating_slip
  WHERE id = p_rating_slip_id AND casino_id = p_casino_id;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger ...;
END;
$$;
```

### Non-Compliance Issues

1. **❌ NO SELF-INJECTION:** Pattern C validation only, no context injection
2. **✅ Pattern C:** Correct COALESCE with JWT fallback
3. **✅ Role Validation:** Enforces `pit_boss` or `admin` per SEC-005
4. **✅ Casino Scope:** Validates p_casino_id matches context

### Impact

**High Severity:** This function inserts into `loyalty_ledger` which has RLS policies dependent on `current_setting('app.casino_id')`. Without self-injection, INSERT may fail intermittently.

### Fix Required

```sql
-- After role validation
IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
  RAISE EXCEPTION 'FORBIDDEN';
END IF;

-- SELF-INJECTION
-- Need to get actor_id from context or parameter
v_actor_id := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, ...);
PERFORM set_rls_context(v_actor_id, p_casino_id, v_caller_role);

-- Continue with business logic
```

---

## Issue #4: rpc_redeem (Comp Issuance) - NO SELF-INJECTION

### File Location
`/home/diepulp/projects/pt-2/supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql` (line 260)

### Current Implementation
```sql
CREATE OR REPLACE FUNCTION rpc_redeem(
  p_casino_id uuid,
  p_player_id uuid,
  p_points int,
  p_issued_by_staff_id uuid,
  p_note text,
  p_idempotency_key uuid,
  p_allow_overdraw boolean DEFAULT false,
  p_reward_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY INVOKER  -- ✅ Correct
AS $$
DECLARE
  v_context_casino_id uuid;
  v_caller_role text;
  v_balance_before int;
  ...
BEGIN
  v_context_casino_id := COALESCE(...);  -- Pattern C
  v_caller_role := COALESCE(...);         -- Pattern C

  -- Validate
  IF v_context_casino_id IS NULL THEN ... END IF;
  IF p_casino_id != v_context_casino_id THEN ... END IF;

  IF v_caller_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- ❌ MISSING: PERFORM set_rls_context(p_issued_by_staff_id, p_casino_id, v_caller_role);

  -- Row lock on player_loyalty
  SELECT current_balance INTO v_balance_before
  FROM player_loyalty
  WHERE player_id = p_player_id AND casino_id = p_casino_id
  FOR UPDATE;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger ...;
END;
$$;
```

### Non-Compliance Issues

1. **❌ NO SELF-INJECTION:** Missing set_rls_context call
2. **✅ Pattern C:** Correct context extraction and validation
3. **✅ Role Validation:** Correctly allows `pit_boss`, `cashier`, `admin` per SEC-005
4. **✅ Overdraw Logic:** Properly checks role for overdraw authorization
5. **✅ Row Locking:** Prevents race conditions on balance updates

### Impact

**High Severity:** Multiple RLS-dependent operations:
- SELECT on `player_loyalty` (balance check)
- INSERT into `loyalty_ledger`
- UPDATE on `player_loyalty`

All can fail intermittently without self-injection.

### Fix Required

```sql
-- After role validation
IF v_caller_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
  RAISE EXCEPTION 'FORBIDDEN';
END IF;

-- Validate staff_id exists and matches context
SELECT s.id INTO v_validated_staff_id
  FROM staff s
 WHERE s.id = p_issued_by_staff_id
   AND s.user_id = auth.uid()
   AND s.casino_id = v_context_casino_id
   AND s.role = v_caller_role
   AND s.status = 'active';

IF NOT FOUND THEN
  RAISE EXCEPTION 'staff_id validation failed';
END IF;

-- SELF-INJECTION
PERFORM set_rls_context(v_validated_staff_id, p_casino_id, v_caller_role);

-- Continue with business logic
```

---

## Issue #5: rpc_manual_credit - NO SELF-INJECTION

### File Location
`/home/diepulp/projects/pt-2/supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql` (line 448)

### Pattern
Identical to rpc_redeem but for manual credit issuance. Has Pattern C validation but no self-injection.

### Non-Compliance Issues
1. **❌ NO SELF-INJECTION:** Missing set_rls_context call
2. **✅ Pattern C:** Correct context extraction
3. **✅ Role Validation:** Restricts to `pit_boss`, `admin` (correctly excludes cashier)
4. **✅ Audit Trail:** Requires mandatory note

### Impact
**High Severity:** Same as rpc_redeem - multiple RLS-dependent operations can fail.

### Fix Required
Same pattern as rpc_redeem: validate staff_id, then call `PERFORM set_rls_context(...)`.

---

## Issue #6: rpc_apply_promotion - NO SELF-INJECTION

### File Location
`/home/diepulp/projects/pt-2/supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql` (line 609)

### Pattern
Similar to other loyalty RPCs. Pattern C validation present, no self-injection.

### Non-Compliance Issues
1. **❌ NO SELF-INJECTION:** Missing set_rls_context call
2. **✅ Pattern C:** Correct context extraction
3. **✅ Campaign Uniqueness:** Business logic prevents duplicate promotions per campaign

### Impact
**Medium Severity:** Inserts into loyalty_ledger, which has RLS policies.

### Fix Required
Add self-injection after validation, before INSERT.

---

## Issue #7: rpc_reconcile_loyalty_balance - NO SELF-INJECTION

### File Location
`/home/diepulp/projects/pt-2/supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql` (line 834)

### Pattern
Admin-only reconciliation function. Pattern C validation, no self-injection.

### Non-Compliance Issues
1. **❌ NO SELF-INJECTION:** Missing set_rls_context call
2. **✅ Pattern C:** Correct context extraction
3. **✅ Admin-Only:** Role validation restricts to 'admin'

### Impact
**Medium Severity:** SELECT and UPDATE operations on `player_loyalty` affected.

### Fix Required
Add self-injection after admin role validation.

---

## Summary of Non-Compliance

| RPC Function | File | Pattern C | Self-Injection | Role Val | SEC-005 Compliant | Severity |
|--------------|------|-----------|----------------|----------|-------------------|----------|
| rpc_create_financial_txn | 20251211172516 | ✅ | ❌ | ✅ | ✅ Yes (cashier, pit_boss, admin) | HIGH |
| rpc_issue_mid_session_reward | 00000000000000<br>20251211153228<br>20251212080915 | ✅ | ❌ | ❌ | ⚠️ No validation | MEDIUM-HIGH |
| rpc_accrue_on_close | 20251213010000 | ✅ | ❌ | ✅ | ✅ Yes (pit_boss, admin) | HIGH |
| rpc_redeem | 20251213010000 | ✅ | ❌ | ✅ | ✅ Yes (cashier, pit_boss, admin) | HIGH |
| rpc_manual_credit | 20251213010000 | ✅ | ❌ | ✅ | ✅ Yes (pit_boss, admin only) | HIGH |
| rpc_apply_promotion | 20251213010000 | ✅ | ❌ | ✅ | ✅ Yes (pit_boss, admin) | MEDIUM |
| rpc_reconcile_loyalty_balance | 20251213010000 | ✅ | ❌ | ✅ | ✅ Yes (admin only) | MEDIUM |

**Total Issues:** 7 RPCs missing self-injection
**Total Files Affected:** 4 migrations

---

## Role Authorization Analysis

### rpc_create_financial_txn Role List (Line 74)
```sql
AND s.role IN ('cashier', 'pit_boss', 'admin');
```
**Status:** ✅ COMPLIANT with SEC-005 v1.2.0

Per SEC-005 (2025-12-10 update):
- **Admin:** Full access ✅
- **Cashier:** Full access ✅
- **Pit Boss:** Buy-ins only (`direction='in'`, `tender_type IN ('cash','chips')`) ✅
- Missing `pit_boss`: ❌ Not applicable (already present)

### rpc_redeem Role List (Line 312)
```sql
IF v_caller_role NOT IN ('pit_boss', 'cashier', 'admin') THEN
```
**Status:** ✅ COMPLIANT
- All three roles correctly included per SEC-005 LoyaltyService matrix

### rpc_manual_credit Role List (Line 493)
```sql
IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
```
**Status:** ✅ COMPLIANT
- Correctly EXCLUDES cashier (admin-only function per SEC-005)

### rpc_accrue_on_close Role List (Line 110)
```sql
IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
```
**Status:** ✅ COMPLIANT
- Correctly restricts to operational roles (excludes cashier)

### rpc_issue_mid_session_reward Role List
**Status:** ❌ MISSING ENTIRELY
- Function accepts `p_staff_id` but does not validate it against `staff` table
- No role check means ANY authenticated user could call this with any staff_id
- **Security Vulnerability:** Staff ID spoofing possible

---

## Connection Pooling Vulnerability Explained

### The Problem

```
Without Self-Injection:
┌─────────────────────────────────────────────────────────────┐
│ withServerAction Middleware                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Get context: const ctx = await getAuthContext()          │
│ 2. Set context: await injectRLSContext(ctx)                 │
│    ├─ Connection A: PERFORM set_rls_context(...)            │
│    └─ ✅ Context set on Connection A                        │
│ 3. Call RPC: await supabase.rpc('rpc_create_financial_txn') │
│    ├─ Connection B (different pool connection!)             │
│    └─ ❌ Context NOT set on Connection B                    │
│                                                               │
│ RPC Execution on Connection B:                              │
│   INSERT INTO player_financial_transaction                  │
│   ├─ RLS Policy: casino_id = current_setting('app.casino_id')│
│   ├─ ❌ current_setting() returns NULL                      │
│   ├─ ❌ RLS check fails                                    │
│   └─ ❌ INSERT blocked or returns zero rows               │
└─────────────────────────────────────────────────────────────┘

With Self-Injection:
┌─────────────────────────────────────────────────────────────┐
│ RPC Execution on Connection B:                              │
│   PERFORM set_rls_context(p_actor_id, p_casino_id, ...);    │
│   ├─ ✅ Context set on SAME connection (Connection B)       │
│   └─ ✅ Transaction context established                     │
│                                                               │
│   INSERT INTO player_financial_transaction                  │
│   ├─ RLS Policy: casino_id = current_setting('app.casino_id')│
│   ├─ ✅ current_setting() returns expected value            │
│   ├─ ✅ RLS check passes                                    │
│   └─ ✅ INSERT succeeds                                     │
└─────────────────────────────────────────────────────────────┘
```

### When This Occurs

This race condition happens when:
1. Supabase client uses **transaction mode pooling** (port 6543, default)
2. Middleware and RPC calls execute as **separate statements**
3. Pool has multiple connections available
4. Load balancer assigns different connections to each statement

### Mitigation

Self-injection ensures context is always set on the connection where the transaction executes, eliminating the race condition.

---

## Recommended Fix Strategy

### Migration Pattern

Create new migration: `20251222000000_adr015_phase1a_financial_loyalty_fix.sql`

```sql
-- Migration: ADR-015 Phase 1A Completion - Financial & Loyalty RPCs
-- Purpose: Add self-injection to all financial and loyalty RPCs
-- Reference: ADR-015, ISSUE-5AD0182D
-- Files updated:
--   - rpc_create_financial_txn (financial transaction creation)
--   - rpc_issue_mid_session_reward (mid-session loyalty rewards)
--   - rpc_accrue_on_close (base points accrual)
--   - rpc_redeem (comp redemption)
--   - rpc_manual_credit (service recovery)
--   - rpc_apply_promotion (campaign bonuses)
--   - rpc_reconcile_loyalty_balance (admin cleanup)

BEGIN;

-- =====================================================================
-- rpc_create_financial_txn - Add self-injection
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  p_visit_id uuid,
  p_amount numeric,
  p_direction player_financial_transaction.direction%TYPE,
  p_source player_financial_transaction.source%TYPE,
  p_created_by_staff_id uuid,
  p_tender_type text DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_related_transaction_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_at timestamptz DEFAULT now()
) RETURNS public.player_financial_transaction
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid := COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid);
  v_context_actor_id uuid := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid);
  v_staff_role text := COALESCE(NULLIF(current_setting('app.staff_role', true), ''), (auth.jwt() -> 'app_metadata' ->> 'staff_role'));
  v_row player_financial_transaction%ROWTYPE;
  v_validated_staff_record staff%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF v_context_casino_id IS NULL OR v_context_casino_id <> p_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %', p_casino_id, v_context_casino_id;
  END IF;

  IF v_context_actor_id IS NULL OR v_context_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch: caller provided % but context is %', p_created_by_staff_id, v_context_actor_id;
  END IF;

  -- Validate staff role and retrieve full record for constraints
  SELECT * INTO v_validated_staff_record
    FROM staff
   WHERE id = p_created_by_staff_id
     AND user_id = auth.uid()
     AND status = 'active'
     AND casino_id = v_context_casino_id
     AND role IN ('cashier', 'pit_boss', 'admin');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized staff role: %', p_created_by_staff_id;
  END IF;

  -- Pit boss constraints per SEC-005 v1.2.0
  IF v_validated_staff_record.role = 'pit_boss' THEN
    IF p_direction <> 'in' THEN
      RAISE EXCEPTION 'pit_boss can only create buy-in transactions (direction must be ''in'')';
    END IF;
    IF p_tender_type NOT IN ('cash', 'chips') THEN
      RAISE EXCEPTION 'pit_boss tender_type must be cash or chips only';
    END IF;
    IF p_visit_id IS NULL THEN
      RAISE EXCEPTION 'pit_boss transactions require visit_id';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- ADR-015 Phase 1A: Self-inject RLS context for connection pooling
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_rls_context(
    p_created_by_staff_id,
    p_casino_id,
    v_validated_staff_record.role
  );

  INSERT INTO public.player_financial_transaction AS t (
    id,
    player_id,
    casino_id,
    visit_id,
    rating_slip_id,
    amount,
    direction,
    source,
    tender_type,
    created_by_staff_id,
    related_transaction_id,
    created_at,
    idempotency_key
  )
  VALUES (
    gen_random_uuid(),
    p_player_id,
    p_casino_id,
    p_visit_id,
    p_rating_slip_id,
    p_amount,
    p_direction,
    p_source,
    p_tender_type,
    p_created_by_staff_id,
    p_related_transaction_id,
    COALESCE(p_created_at, now()),
    p_idempotency_key
  )
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rpc_create_financial_txn IS
  'Creates player financial transaction with ADR-015 Phase 1A self-injection for connection pooling safety. Enforces SEC-005 role constraints and pit_boss buy-in only rules.';

-- =====================================================================
-- rpc_issue_mid_session_reward - Add self-injection + role validation
-- =====================================================================

CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text DEFAULT NULL,
  p_reason loyalty_reason DEFAULT 'mid_session'
) RETURNS TABLE (ledger_id uuid, balance_after int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_validated_staff staff%ROWTYPE;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════
  -- SEC-006 Context Validation
  -- ═══════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- ADR-015 Phase 1A: Validate and self-inject
  -- ═══════════════════════════════════════════════════════════════════
  SELECT * INTO v_validated_staff
    FROM staff
   WHERE id = p_staff_id
     AND user_id = auth.uid()
     AND casino_id = v_context_casino_id
     AND role IN ('pit_boss', 'admin')  -- Per SEC-005
     AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized staff_id: %', p_staff_id;
  END IF;

  PERFORM set_rls_context(p_staff_id, p_casino_id, v_validated_staff.role);

  -- Continue with business logic...
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = p_casino_id
     AND rs.status IN ('open','paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM loyalty_ledger
      WHERE idempotency_key = p_idempotency_key AND casino_id = p_casino_id
    ) THEN
      RETURN QUERY SELECT ll.id, (...)
    END IF;
  END IF;

  INSERT INTO loyalty_ledger (...)
  VALUES (...)
  RETURNING id INTO v_ledger_id;

  INSERT INTO player_loyalty (...)
  ON CONFLICT (...)
  DO UPDATE SET ...
  RETURNING balance INTO v_balance_after;

  RETURN QUERY SELECT v_ledger_id, v_balance_after;
END;
$$;

COMMENT ON FUNCTION rpc_issue_mid_session_reward IS
  'Issues mid-session loyalty points. ADR-015 Phase 1A compliant with self-injection. SEC-006 hardened with role validation (pit_boss, admin only).';

-- =====================================================================
-- rpc_accrue_on_close - Add self-injection
-- =====================================================================

-- [Similar pattern for remaining RPCs...]

COMMIT;
```

---

## Verification Checklist

- [ ] All 7 RPCs updated with `PERFORM set_rls_context(...)` call
- [ ] Role validation added to rpc_issue_mid_session_reward
- [ ] Staff record lookup validates against auth.uid()
- [ ] All role lists match SEC-005 v1.2.0
- [ ] Context injection happens AFTER validation but BEFORE RLS-dependent operations
- [ ] Migration tested on staging environment
- [ ] Integration tests verify no RLS policy failures under load
- [ ] RPC comments updated to indicate ADR-015 Phase 1A compliance

---

## References

- **ADR-015:** `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **SEC-005:** `/home/diepulp/projects/pt-2/docs/30-security/SEC-005-role-taxonomy.md`
- **Issue Analysis:** `/home/diepulp/projects/pt-2/docs/issues/ISSUE-5AD0182D-CONNECTION-POOLING-ANALYSIS.md`
- **Rating Slip Phase 1A:** `/home/diepulp/projects/pt-2/supabase/migrations/20251213190000_adr015_fix_rpc_context_injection.sql`

---

## Sign-off

**Audit Performed By:** RLS Security Specialist
**Date:** 2025-12-21
**Status:** ⚠️ CRITICAL GAPS IDENTIFIED - Phase 1A incomplete in financial/loyalty domains

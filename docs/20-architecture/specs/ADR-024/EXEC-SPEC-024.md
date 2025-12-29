# EXEC-SPEC-024: RLS Context Self-Injection Remediation

**ADR Reference:** [ADR-024_DECISIONS.md](../../../80-adrs/ADR-024_DECISIONS.md)
**Status:** Draft
**Created:** 2025-12-29

---

## Overview

This execution spec details the implementation of the secure RLS context injection pattern to replace the vulnerable self-injection anti-pattern identified in ADR-024.

---

## Pilot Boundary (Frozen)

This spec implements the pilot-scope boundary established in `docs/80-adrs/ADR-024_DECISIONS.md`. The pilot is **not acceptable** if:
- the old param-based setter remains callable by `authenticated` or `PUBLIC`
- staff identity is not bound to `auth.uid()`

Explicitly out of scope for pilot:
- Enterprise multi-tenant model / multi-casino staff
- Must-match RLS everywhere
- CI scanners to detect future `app.*` setters
- Perfect ops lane with auditing

---

## Affected RPCs (16 total)

### WS2 Loyalty RPCs (7)

| RPC | Location | Status |
|-----|----------|--------|
| `rpc_accrue_on_close` | `supabase/migrations/` | Pending |
| `rpc_redeem` | `supabase/migrations/` | Pending |
| `rpc_manual_credit` | `supabase/migrations/` | Pending |
| `rpc_apply_promotion` | `supabase/migrations/` | Pending |
| `rpc_reconcile_loyalty_balance` | `supabase/migrations/` | Pending |
| `rpc_get_player_ledger` | `supabase/migrations/` | Pending |
| `rpc_issue_mid_session_reward` | `supabase/migrations/` | Pending |

### PRD-017 Visit/Analytics RPCs (5)

| RPC | Location | Status |
|-----|----------|--------|
| `rpc_check_table_seat_availability` | `supabase/migrations/` | Pending |
| `rpc_get_visit_loyalty_summary` | `supabase/migrations/` | Pending |
| `rpc_get_visit_last_segment` | `supabase/migrations/` | Pending |
| `rpc_get_player_recent_sessions` | `supabase/migrations/` | Pending |
| `rpc_get_player_last_session_context` | `supabase/migrations/` | Pending |

### PRD-016/018/Dashboard RPCs (4)

| RPC | Location | Status |
|-----|----------|--------|
| `rpc_get_visit_live_view` | `supabase/migrations/` | Pending |
| `rpc_get_rating_slip_modal_data` | `supabase/migrations/` | Pending |
| `rpc_get_dashboard_tables_with_counts` | `supabase/migrations/` | Pending |
| `rpc_start_rating_slip` | `supabase/migrations/` | Pending |

---

## Schema Changes

### Unique Constraint on staff.user_id

Required for deterministic staff lookup.

```sql
-- Add unique constraint on staff.user_id (deterministic lookup)
ALTER TABLE public.staff
  ADD CONSTRAINT staff_user_id_unique UNIQUE (user_id);
```

**Preflight check (must be clean before applying constraint):**

```sql
select user_id, count(*)
from public.staff
where user_id is not null
group by user_id
having count(*) > 1;
```

If this returns rows, resolve duplicates in a cleanup migration before adding the constraint, or switch to the hard-fail lookup path and explicitly defer the constraint.

---

## RPCs/Functions

### set_rls_context_from_staff()

Primary function for authoritative context injection.

```sql
CREATE OR REPLACE FUNCTION public.set_rls_context_from_staff(
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_id uuid;
  v_casino_id uuid;
  v_role text;
  v_correlation_id text;
BEGIN
  -- Guard correlation_id for log safety
  IF p_correlation_id IS NOT NULL THEN
    v_correlation_id := regexp_replace(p_correlation_id, '[^a-zA-Z0-9:_\\-\\.]+', '', 'g');
    v_correlation_id := left(v_correlation_id, 64);
  END IF;

  -- Derive staff_id from JWT (authoritative, not spoofable)
  v_staff_id := NULLIF((auth.jwt() -> 'app_metadata' ->> 'staff_id'), '')::uuid;

  IF v_staff_id IS NULL THEN
    -- Fallback: map auth.uid() to staff.user_id
    BEGIN
      SELECT s.id INTO STRICT v_staff_id
      FROM public.staff s
      WHERE s.user_id = auth.uid();
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_staff_id := NULL;
    END;
  ELSE
    -- Bind staff_id claim to auth.uid() to prevent mis-issued token escalation
    BEGIN
      SELECT s.id INTO STRICT v_staff_id
      FROM public.staff s
      WHERE s.id = v_staff_id
        AND s.user_id = auth.uid();
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_staff_id := NULL;
    END;
  END IF;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: staff identity not found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Derive casino_id and role from staff table (authoritative, not spoofable)
  SELECT s.casino_id, s.role::text
  INTO v_casino_id, v_role
  FROM public.staff s
  WHERE s.id = v_staff_id
    AND s.status = 'active'
    AND s.casino_id IS NOT NULL;

  IF v_casino_id IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: staff not active or not casino-scoped'
      USING ERRCODE = 'P0001';
  END IF;

  -- Transaction-local context (pooler-safe SET LOCAL)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_role, true);

  IF v_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', v_correlation_id, true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_rls_context_from_staff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context_from_staff(text) TO authenticated;
```

### set_rls_context_internal()

Ops lane for service_role (migrations, admin operations).

```sql
CREATE OR REPLACE FUNCTION public.set_rls_context_internal(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Minimal pilot-grade validation for ops lane
  IF p_actor_id IS NULL OR p_casino_id IS NULL OR p_staff_role IS NULL THEN
    RAISE EXCEPTION 'INVALID: all context parameters required for internal setter'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate actor exists and is casino-scoped
  PERFORM 1
  FROM public.staff s
  WHERE s.id = p_actor_id
    AND s.casino_id = p_casino_id
    AND s.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: actor not active or casino mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  -- Optional: validate p_staff_role against enum or allowed set (if available)
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context_internal(uuid, uuid, text, text) TO service_role;
```

---

## RPC Update Pattern

### BEFORE (Vulnerable)

```sql
-- Extract staff role from session or JWT
v_context_staff_role := COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')
);

PERFORM set_rls_context(
  COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  ),
  COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  ),
  v_context_staff_role
);
```

### AFTER (Secure)

```sql
-- Authoritative context injection (no spoofable params)
PERFORM set_rls_context_from_staff();
```

---

## Deprecation of Old Function

After all RPCs are updated:

```sql
-- Remove ability for callers to forge context
REVOKE EXECUTE ON FUNCTION public.set_rls_context(uuid, uuid, text, text) FROM authenticated;

COMMENT ON FUNCTION public.set_rls_context IS
  'DEPRECATED: Use set_rls_context_from_staff() instead. This function accepts spoofable parameters.';
```

**Overloads:** if multiple signatures exist, all must be revoked for `authenticated` and `PUBLIC`. Use an audit query to list grants and then revoke each signature explicitly.

```sql
select p.oid::regprocedure as signature,
       r.rolname as role,
       has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on r.rolname in ('authenticated', 'public')
where n.nspname = 'public'
  and p.proname = 'set_rls_context';
```

---

## Migration Plan

### Phase 1: Deploy New Function

**Migration:** `YYYYMMDDHHMMSS_adr024_rls_context_from_staff.sql`

1. Create `set_rls_context_from_staff()` function
2. Grant execute to `authenticated`
3. Add unique constraint on `staff.user_id` (deterministic lookup)
4. Create `set_rls_context_internal(...)` and grant to `service_role`

### Phase 2: Update Affected RPCs

**Migration:** `YYYYMMDDHHMMSS_adr024_rpc_remediation.sql`

Update all 16 RPCs via `CREATE OR REPLACE`:
- Remove `v_context_staff_role` extraction block
- Remove `PERFORM set_rls_context(COALESCE(...), ...)` block
- Add `PERFORM set_rls_context_from_staff();`

### Phase 3: Deprecate Old Function

**Migration:** `YYYYMMDDHHMMSS_adr024_deprecate_old_context.sql`

1. `REVOKE EXECUTE ON FUNCTION set_rls_context(...) FROM authenticated`
2. Add deprecation comment

### Rollout Sequencing

Ship all phases in one deployment window to avoid a spoofable gap:

1. Create `set_rls_context_from_staff()`
2. Update all affected RPCs to call it
3. Revoke `set_rls_context(...)` from `authenticated`

If a single transaction is not feasible, phases 2 and 3 must be applied together.

---

## Test Requirements

### Unit Tests

| Test | File | Description |
|------|------|-------------|
| Staff lookup succeeds | `services/security/__tests__/rls-context.test.ts` | Valid staff with active status derives context |
| Inactive staff blocked | `services/security/__tests__/rls-context.test.ts` | Inactive staff raises FORBIDDEN |
| Missing staff blocked | `services/security/__tests__/rls-context.test.ts` | Unknown auth.uid() raises UNAUTHORIZED |
| Mismatched claim blocked | `services/security/__tests__/rls-context.test.ts` | staff_id claim not matching user_id fails |
| Correlation ID sanitized | `services/security/__tests__/rls-context.test.ts` | Special chars stripped, length capped |

### Integration Tests

| Test | File | Description |
|------|------|-------------|
| Spoofed context rejected | `services/security/__tests__/rls-context.integration.test.ts` | Poisoned session vars overwritten |
| Cross-tenant blocked | `services/security/__tests__/rls-context.integration.test.ts` | Casino A user cannot access casino B data |
| Transaction pooling safe | `services/security/__tests__/rls-context.integration.test.ts` | Context does not leak across connections |

### Security Tests

| Test | Description |
|------|-------------|
| Deprecated function revoked | `set_rls_context` not callable by authenticated |
| No spoofable RPC parameters | Audit confirms no RPC accepts casino_id/actor_id from user |

---

## Pilot Definition of Done (DoD)

1) **Security invariant enforced**
- `set_rls_context(...)` is not executable by `authenticated` or `PUBLIC`.
- Only `set_rls_context_from_staff()` is callable by client roles.
- DoD check: `select has_function_privilege('authenticated', 'public.set_rls_context(uuid,uuid,text,text)', 'execute');` returns false.

2) **Identity binding is correct**
- Staff identity is bound to `auth.uid()` even when `staff_id` claim exists.
- Inactive staff are blocked.
- DoD check: a mismatched `staff_id` claim fails and does not set context.

3) **Pooling safety proven**
- Context is set via `SET LOCAL` and does not leak across transactions.
- DoD check: under transaction pooling, two sequential requests in different casinos do not cross-tenant.

4) **Deterministic staff lookup**
- Either `staff.user_id` is unique or lookup hard-fails on duplicates (no `LIMIT 1` ambiguity).
- DoD check: no nondeterministic staff lookup paths remain.

5) **Updated RPC surface uses new setter**
- All client-callable RPCs that depend on session vars call `set_rls_context_from_staff()`.
- No client-callable RPC accepts casino_id/actor_id as user input (ops-only exceptions allowed).
- DoD check: search confirms no remaining calls to old setter in client RPCs.

### DoD Audit Checks (Concrete)

```sql
select has_function_privilege('authenticated', 'public.set_rls_context(uuid,uuid,text,text)', 'execute');
select has_function_privilege('public', 'public.set_rls_context(uuid,uuid,text,text)', 'execute');
```

```bash
rg "set_rls_context\\(" supabase/migrations -g "*.sql"
rg "set_config\\('app\\.casino_id'" supabase/migrations -g "*.sql"
```

---

## Rollback Strategy

Rollback that re-grants `set_rls_context` to `authenticated` violates pilot invariants and is **not permitted** in pilot scope. If rollback is required in a non-pilot environment, document an explicit exception and obtain security sign-off.

Rollback migration:

```sql
-- Rollback: revert RPCs (must be done via separate CREATE OR REPLACE for each)
```

**Pilot hard-fail:** do not deploy any rollback that re-enables the param setter. If rollback is necessary, it must preserve INV-1/INV-2 and continue to use `set_rls_context_from_staff()` or a non-spoofable equivalent.

---

## References

- ADR: [ADR-024_DECISIONS.md](../../../80-adrs/ADR-024_DECISIONS.md)
- DoD Gates: [DOD-024.md](./DOD-024.md)
- [Analysis: RLS Context Self-Injection Anti-Pattern](../../issues/loyalty-ledger/RLS_CONTEXT_SELF_INJECTION_ANTIPATTERN_REMEDIATION_PLAN.md)

---
title: "RLS Context Self‑Injection Anti‑Pattern & Remediation Plan (Includes Loyalty Instantiation Gap)"
date: 2025-12-29
status: approved-plan
scope: PT-2
tags:
  - rls
  - security
  - supabase
  - rpc
  - loyalty
  - adr-015
---

# RLS Context Self‑Injection Anti‑Pattern & Remediation Plan  
*(Includes Loyalty Instantiation Gap remediation)*

## Executive summary

You are not “just fixing loyalty.” You have a **trust-boundary bug**:

- `set_rls_context(p_actor_id, p_casino_id, p_staff_role)` is callable by `authenticated`
- it **blindly sets** `app.actor_id/app.casino_id/app.staff_role` (transaction-local)
- several RPCs and/or RLS policies use `COALESCE(current_setting(...), auth.jwt()...)` (often session-first)

**Consequence:** a caller can **self-assign** casino/role/actor for the transaction, and if any policy/RPC trusts `current_setting(...)` as an authority, you have tenant/role escalation.

The “Loyalty Instantiation Gap” (missing `player_loyalty` at enrollment, lazy-create at accrual) is a legitimate bug, but it also **surfaced** the deeper anti-pattern (self-injection + untrusted session context).

This doc:
1) formulates the issue,
2) captures the anti-pattern,
3) provides a hardened replacement function,
4) folds the loyalty fixes into a sequenced remediation plan.

---

# 1) Problem formulation

## 1.1 Symptom bug: Loyalty Instantiation Gap
- Enrollment creates `player_casino` but not `player_loyalty`
- Accrual path attempts to “ensure/create” `player_loyalty`
- Under RLS + invoker execution, this fails for certain roles and creates hidden coupling.

## 1.2 Underlying platform risk: context spoofing
Because `set_rls_context` currently accepts untrusted params and only sets config values, **any authenticated caller can set `app.*` context**.  
If RLS policies (or RPCs) treat `current_setting('app.casino_id')` as “truth,” isolation is broken.

---

# 2) Anti‑pattern: RLS Context Self‑Injection

## 2.1 Anti‑pattern signature
In RPCs:

```sql
v_role := COALESCE(NULLIF(current_setting('app.staff_role', true), ''),
                   (auth.jwt() -> 'app_metadata' ->> 'staff_role'));

PERFORM set_rls_context(
  COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid),
  COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid),
  v_role
);
```

In RLS policies:

```sql
casino_id = COALESCE(
  current_setting('app.casino_id', true)::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

## 2.2 Why it’s dangerous
- Session vars become **user-writable**.
- `COALESCE(current_setting(...), jwt)` makes session vars **higher priority** than JWT.
- A `SECURITY DEFINER` context setter that accepts params can be used to inject a forged context.

**Bottom line:** `current_setting('app.*')` must not be authoritative unless it is **derived** from authoritative sources.

---

# 3) Remediation strategy (no “global auth rewrite”)

## Guiding rules
1) **Derive, don’t accept:** context variables should be derived from JWT / DB, not passed in by clients.
2) **JWT-first / must-match:** RLS must never allow session vars to override JWT claims.
3) **Defense-in-depth:** high-impact RPCs (minting points, financial ops) must explicitly validate staff membership/role.

---

# 4) Hardened functions (SQL)

## 4.1 New: `set_rls_context_from_staff()` (authoritative, no spoofable inputs)

**Intent:** Set `app.actor_id/app.casino_id/app.staff_role` from the **staff table** for the current caller.

Assumptions (align to your model):
- `auth.uid()` is the authenticated user identifier (and you map it to `staff.user_id`), OR
- JWT contains `app_metadata.staff_id` which equals `staff.id`

> Choose one identity source and delete the other branch if you don’t need it.

```sql
CREATE OR REPLACE FUNCTION public.set_rls_context_from_staff(
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_casino_id uuid;
  v_role text;
BEGIN
  -- Prefer staff_id claim if present; otherwise map auth.uid() to staff.user_id
  v_staff_id := NULLIF((auth.jwt() -> 'app_metadata' ->> 'staff_id'), '')::uuid;

  IF v_staff_id IS NULL THEN
    SELECT s.id
    INTO v_staff_id
    FROM public.staff s
    WHERE s.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: staff identity not found'
      USING ERRCODE = 'P0001';
  END IF;

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

  -- Transaction-local context (pooler-safe)
  PERFORM set_config('app.actor_id', v_staff_id::text, true);
  PERFORM set_config('app.casino_id', v_casino_id::text, true);
  PERFORM set_config('app.staff_role', v_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_rls_context_from_staff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context_from_staff(text) TO authenticated;

COMMENT ON FUNCTION public.set_rls_context_from_staff IS
  'Authoritative context injection: derives actor/casino/role from staff table for caller; pooler-safe SET LOCAL.';
```

### Notes
- This removes spoofable parameters entirely.
- It establishes the missing invariant: “actor is active staff in this casino” (at least for context setting).

## 4.2 Deprecate or harden the old `set_rls_context(...)`
**Recommended:** deprecate and stop using it from application/RPCs.

If you must keep it temporarily, harden it:
- require `p_actor_id` match derived staff id
- require `p_casino_id` match staff.casino_id
- require `p_staff_role` match staff.role
- otherwise raise

---

# 5) RLS policy hardening: stop session-first COALESCE

## 5.1 JWT-first pattern (minimum)
Use JWT claim as authoritative; session var can be a redundant cache but not a source of truth.

```sql
casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
```

## 5.2 Must-match pattern (recommended in hybrid phase)
If you still want to support session vars for pooler compatibility, enforce equality when both exist:

```sql
(
  current_setting('app.casino_id', true) IS NULL
  OR current_setting('app.casino_id', true)::uuid =
     (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
```

This prevents session vars from overriding JWT even if something sets them.

---

# 6) RPC hygiene: remove self-injection blocks

## Rule
No RPC should call the old param-based `set_rls_context(...)` using values derived from `current_setting(...)`.

### Replacement
At the **start** of invoker RPCs that need pooler safety:

```sql
PERFORM public.set_rls_context_from_staff();
```

Or, if your application already calls it per request, omit entirely.

---

# 7) Fold-in: Loyalty Instantiation Gap remediation (sequenced)

## 7.1 Sequence (ship order)

### Track A (security hardening) — ship first
1) Add `public.set_rls_context_from_staff()`
2) Update application middleware to call it once per request (preferred)
3) Remove RPC self-injection blocks and replace with `set_rls_context_from_staff()` (or nothing)
4) Update RLS policies to JWT-first or must-match

**Gate:** After Track A, session context is no longer spoofable.

### Track B (loyalty bug) — ship immediately after Track A
1) Enrollment RPC provisions `player_loyalty` in the same transaction as `player_casino`
2) `rpc_accrue_on_close`: **UPDATE + NOT FOUND hard-fail** (no lazy-create)
3) Add FK: `player_loyalty(player_id, casino_id)` → `player_casino(player_id, casino_id)` (backfill optional in dev)
4) Ledger idempotency:
   - partial unique index: one `base_accrual` per slip
   - unique idempotency_key per casino (recommended)

## 7.2 Minimum SQL for the loyalty side (reference)

### FK (recommended even in dev)
```sql
ALTER TABLE public.player_loyalty
ADD CONSTRAINT player_loyalty_player_casino_fk
FOREIGN KEY (player_id, casino_id)
REFERENCES public.player_casino (player_id, casino_id)
ON DELETE CASCADE;
```

### Base accrual uniqueness
```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_base_accrual_uk
ON public.loyalty_ledger (casino_id, rating_slip_id)
WHERE reason = 'base_accrual';
```

### Idempotency key uniqueness
```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_idempotency_uk
ON public.loyalty_ledger (casino_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

---

# 8) Acceptance criteria (Definition of Done)

## Security / context
- [ ] Untrusted callers cannot set arbitrary `app.casino_id/app.staff_role/app.actor_id`
- [ ] RLS policies do not allow session vars to override JWT (JWT-first or must-match)
- [ ] RPCs do not implement self-injection via `COALESCE(current_setting(...), jwt)` + param `set_rls_context`

## Loyalty
- [ ] Enroll player → `player_loyalty` exists immediately
- [ ] Close slip → accrual succeeds for allowed roles
- [ ] If `player_loyalty` missing → accrual fails loudly (`PLAYER_LOYALTY_MISSING`)
- [ ] Base accrual is idempotent under concurrency (unique gate + conflict handling)

---

# 9) Operational notes (dev vs prod)

- In dev, you can omit backfill if you routinely reset the DB. Keep FK and uniqueness constraints regardless.
- In staging/prod, use backfill + `NOT VALID`/`VALIDATE` patterns to avoid failure on existing rows.

---

# Final verdict

Do **not** treat the loyalty bug as the root cause. Fix it, but first remove the ability for callers to forge RLS context.

**The remediation is sequenced, not a rewrite:**
1) harden context setting + policy precedence,
2) then ship the loyalty fixes on a trustworthy foundation.

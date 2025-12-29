---
title: "Migration Audit & Corrections: rpc_accrue_on_close + Loyalty Ledger Idempotency"
date: 2025-12-29
status: corrective-notes
scope: PT-2
tags:
  - loyalty
  - rpc
  - rls
  - security
  - migrations
---

# Migration Audit & Corrections: `rpc_accrue_on_close` + Loyalty Ledger Idempotency

This document folds the review corrections for the pasted migration into a concrete checklist and corrected SQL patterns.

> Verdict: **NOT approved as-is**. Ship after implementing the **P0 fixes** below.

---

## P0 Fix 1: Casino scope validation is currently a tautology (security bug)

### What’s wrong
The migration calls:

```sql
PERFORM set_rls_context(..., p_casino_id, ...);
```

…and **then** derives `v_context_casino_id` via `current_setting('app.casino_id')`.  
But `set_rls_context` just set `app.casino_id` to `p_casino_id`, so the later check:

```sql
IF p_casino_id != v_context_casino_id THEN ...
```

will effectively never fail. You’re validating the value you just injected.

### Required correction
Validate `p_casino_id` against the caller’s claim **before** calling `set_rls_context`, then set the context using the validated claim.

#### Correct pattern

```sql
-- Derive claim casino_id BEFORE set_rls_context
v_claim_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

IF v_claim_casino_id IS NULL THEN
  v_claim_casino_id := (auth.jwt()->'app_metadata'->>'casino_id')::uuid;
END IF;

IF v_claim_casino_id IS NULL THEN
  RAISE EXCEPTION 'UNAUTHORIZED: casino_id missing from context/JWT'
    USING ERRCODE = 'P0001';
END IF;

IF p_casino_id <> v_claim_casino_id THEN
  RAISE EXCEPTION 'CASINO_MISMATCH: param %, claim %', p_casino_id, v_claim_casino_id
    USING ERRCODE = 'P0001';
END IF;

-- Only now inject context (use the validated claim, not the param)
PERFORM set_rls_context(v_actor_id, v_claim_casino_id, v_context_staff_role);
```

---

## P0 Fix 2: Idempotency is not safe under concurrency (double insert risk)

### What’s wrong
The migration does:

1) `SELECT ... FROM loyalty_ledger ...`  
2) If not found, `INSERT ...`

Under concurrency, two sessions can both pass the SELECT and both INSERT.

### Required correction (choose one)

#### Option A (preferred): enforce uniqueness on business key + atomic insert
Add a uniqueness constraint (or unique index) for the business key that defines “one base accrual per slip”:

- **Business key:** `(casino_id, rating_slip_id, reason)`

Example:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_base_accrual_uk
ON public.loyalty_ledger (casino_id, rating_slip_id, reason);
```

Then insert with conflict handling:

```sql
INSERT INTO public.loyalty_ledger (
  casino_id, player_id, rating_slip_id, points_delta, reason, metadata, created_by, idempotency_key
)
VALUES (
  p_casino_id, v_player_id, p_rating_slip_id, v_base_points, 'base_accrual',
  jsonb_build_object('theo', v_theo, 'rate', COALESCE(v_loyalty_multiplier,1)),
  v_actor_id, p_idempotency_key
)
ON CONFLICT (casino_id, rating_slip_id, reason) DO NOTHING;
```

Then fetch the existing row if needed:

```sql
SELECT id, points_delta, created_at
INTO v_existing_ledger_id, v_existing_points_delta, v_existing_created_at
FROM public.loyalty_ledger
WHERE casino_id = p_casino_id
  AND rating_slip_id = p_rating_slip_id
  AND reason = 'base_accrual';
```

#### Option B: use idempotency_key as a uniqueness gate
If you intend `p_idempotency_key` to be the canonical dedupe key, enforce it:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_idempotency_uk
ON public.loyalty_ledger (casino_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

Then `INSERT ... ON CONFLICT DO NOTHING` on that key (you’ll still want the business key if your domain requires it).

---

## P0 Fix 3: Existing-ledger branch must not silently return balance 0

### What’s wrong
If the ledger exists but `player_loyalty` is missing, the current code returns `COALESCE(v_balance_after, 0)` which masks a broken invariant.

### Required correction
If `player_loyalty` is missing, **hard-fail** with the same invariant error you use elsewhere.

---

## P0 Fix 4: Replace “check then insert” on `player_loyalty` with UPDATE+NOT FOUND hard-fail

### Goal
Accrual must not provision loyalty accounts. It must update and fail if missing.

### Correct pattern

```sql
UPDATE public.player_loyalty
SET current_balance = current_balance + v_base_points,
    updated_at = now()
WHERE player_id = v_player_id
  AND casino_id = p_casino_id
RETURNING current_balance
INTO v_balance_after;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PLAYER_LOYALTY_MISSING: player_id=%, casino_id=%',
    v_player_id, p_casino_id
    USING ERRCODE = 'P0001';
END IF;
```

---

## P1 Recommendations (good hygiene; not blockers)

### 1) Cast `ROUND()` result explicitly
`ROUND(numeric)` returns `numeric`. Don’t rely on implicit casts.

```sql
v_base_points := ROUND(v_theo * COALESCE(v_loyalty_multiplier, 1))::int;
```

### 2) FK migration robustness
If you want replay-safe migrations or reduced lock risk:
- use `ADD CONSTRAINT ... NOT VALID;` then `VALIDATE CONSTRAINT ...;`
- or guard against `duplicate_object`

---

# Implementation Checklist (ship gate)

## Must-do (P0)
- [ ] Move casino validation **before** `set_rls_context`
- [ ] Validate `p_casino_id` against claim casino_id (JWT or existing context)
- [ ] Remove lazy-create for `player_loyalty`; use UPDATE+NOT FOUND
- [ ] Add **uniqueness enforcement** for loyalty ledger idempotency (business key and/or idempotency_key)
- [ ] Ensure existing-ledger branch hard-fails if `player_loyalty` is missing

## Nice-to-have (P1)
- [ ] Explicit casts on numeric/int
- [ ] Replay-safe / low-lock FK migration pattern if needed

---

# Final verdict

After applying the P0 fixes above, the migration becomes **production-approvable**: casino scoping is real again, idempotency is enforced by the database, and missing loyalty accounts fail loudly instead of being papered over.

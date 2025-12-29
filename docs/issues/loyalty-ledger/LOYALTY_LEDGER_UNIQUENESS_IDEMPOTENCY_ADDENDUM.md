---
title: "Loyalty Ledger Uniqueness & Idempotency: Correct Constraints for loyalty_reason Taxonomy"
date: 2025-12-29
status: corrective-addendum
scope: PT-2
tags:
  - loyalty
  - constraints
  - idempotency
  - migrations
---

# Loyalty Ledger Uniqueness & Idempotency (Correct Constraints for `loyalty_reason`)

Given this taxonomy:

```txt
loyalty_reason:
- base_accrual
- promotion
- redeem
- manual_reward
- adjustment
- reversal
```

the constraint:

> `UNIQUE (casino_id, rating_slip_id, reason)`

is **too strict** and will block legitimate multiple entries for several reasons.

---

## Why `UNIQUE (casino_id, rating_slip_id, reason)` is wrong

- `base_accrual`: should be **one per slip** ✅
- `promotion`: can be **multiple promos** (stacked offers, campaigns) ❌
- `manual_reward`: can be **multiple discretionary rewards** ❌
- `adjustment`: can be **multiple corrections** ❌
- `reversal`: may occur multiple times unless you explicitly constrain “one reversal per original” ❌
- `redeem`: often **not slip-scoped** or may support partial redemptions ❌

Conclusion: uniqueness must be **narrowly scoped** to the specific invariant you actually want:
> **“Only one `base_accrual` per rating slip per casino.”**

---

# P0 Fix: Partial uniqueness for base accrual only

## Option A (preferred): Partial unique index (simple)

```sql
-- Enforce: one base accrual per slip (per casino)
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_base_accrual_uk
ON public.loyalty_ledger (casino_id, rating_slip_id)
WHERE reason = 'base_accrual';
```

### Insert pattern

```sql
INSERT INTO public.loyalty_ledger (
  casino_id, player_id, rating_slip_id, points_delta, reason, metadata, created_by, idempotency_key
)
VALUES (
  p_casino_id, v_player_id, p_rating_slip_id, v_base_points, 'base_accrual',
  jsonb_build_object('theo', v_theo, 'rate', COALESCE(v_loyalty_multiplier,1)),
  v_actor_id, p_idempotency_key
)
ON CONFLICT (casino_id, rating_slip_id)
WHERE reason = 'base_accrual'
DO NOTHING;
```

> If your Postgres version rejects the `WHERE` conflict target (unlikely on modern PG), use Option B.

## Option B: Unique constraint on a generated key (constraint-friendly)

If you want `ON CONFLICT ON CONSTRAINT ...` syntax, you can create a uniqueness key that only materializes for base accrual.
One approach is a generated column (if allowed in your environment), or a partial unique *index* is usually the cleanest.

---

# P0/P1 Fix: Enforce idempotency_key uniqueness (defense-in-depth)

Even with business-key uniqueness for base accrual, you should enforce **idempotency_key** uniqueness to prevent duplicates for *other* reasons during retries.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_idempotency_uk
ON public.loyalty_ledger (casino_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

**Rule:** any RPC that accepts `p_idempotency_key` must:
- write it on the ledger row
- rely on this index to guarantee dedupe under retries

---

# Optional: Make reversals auditable and constraintable (recommended)

If you want “one reversal per original ledger entry” and clean audit trails:

1) Add a reference column:
```sql
ALTER TABLE public.loyalty_ledger
ADD COLUMN IF NOT EXISTS reverses_loyalty_ledger_id uuid NULL;
```

2) Enforce one reversal per original:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_one_reversal_per_original_uk
ON public.loyalty_ledger (casino_id, reverses_loyalty_ledger_id)
WHERE reason = 'reversal' AND reverses_loyalty_ledger_id IS NOT NULL;
```

3) (Optional) validate semantics in code/RPC:
- reversal must reference an existing ledger row in same casino
- reversal points_delta should negate the original (or net to zero per policy)

---

# Ship gate checklist

## Must-do (if shipping base accrual idempotency now)
- [ ] Replace `UNIQUE (casino_id, rating_slip_id, reason)` with **partial uniqueness** for `base_accrual`
- [ ] Update insert/upsert pattern in `rpc_accrue_on_close` to use conflict handling consistent with the partial uniqueness
- [ ] Add `loyalty_ledger_idempotency_uk` if RPCs accept `p_idempotency_key`

## Recommended next
- [ ] Add reversal reference column + uniqueness for one-reversal-per-original if you plan to support reversals robustly

---

# Verdict

With the given `loyalty_reason` taxonomy, **only `base_accrual`** should be constrained to “one per slip.”
Everything else requires either:
- multiple rows per slip, or
- different scoping (e.g., not slip-based), and therefore must not be blocked by a broad uniqueness rule.

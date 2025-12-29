---
title: "P0 Production Gate: Loyalty Ledger Instantiation Gap (B5894ED8)"
date: 2025-12-29
status: ready-for-implementation
owner: LoyaltyService / Enrollment Orchestrator
scope: PT-2
tags:
  - loyalty
  - rpc
  - rls
  - migration
  - bounded-context
---

# P0 Production Gate: Loyalty Ledger Instantiation Gap (B5894ED8)

This document folds the current P0 remediation plan + review verdict into a **ship-together checklist** with minimal, production-safe implementation details.

## Executive verdict

**Conditionally approved** once **P0 items (2) and (3)** are completed.

- ✅ (1) Service layer fix — approved
- ✅ (4) `rpc_create_player` auth — accepted (with quick sanity checks)
- ⛔ (2) `rpc_accrue_on_close` hard-fail — must be implemented (use UPDATE+NOT FOUND pattern)
- ⛔ (3) Backfill + FK constraint — must be implemented (ensure uniqueness prerequisite)

---

# P0 Remediation Plan (Ship Together)

## 1) Service Layer Fix — DONE (Approved)

**File:** `services/casino/crud.ts:510-536`  
**Change:** Removed the `player_loyalty` upsert block from `enrollPlayer()`  
**Rationale:** CasinoService must not write to LoyaltyService-owned tables (SRM/SLAD boundary).

### Approval notes (sanity check)
After removal, ensure enrollment still guarantees provisioning of `player_loyalty` by routing through the canonical enrollment path:
- `rpc_create_player` / `rpc_enroll_player` (preferred), **or**
- a published LoyaltyService ensure command

If `enrollPlayer()` is still used in flows that expect loyalty to exist, those flows must be updated to call the enrollment RPC.

---

## 2) Database: Hard-fail in `rpc_accrue_on_close` — NOT STARTED (Required)

**Current:** lazy-create pattern (`INSERT if not exists`) around lines 219–248.  
**Goal:** **No provisioning during accrual.** Accrual must assume `player_loyalty` exists.

### Required implementation (production-safe)
Avoid TOCTOU check-then-update races by doing the **UPDATE first**, then failing if it touched no rows:

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

### Acceptance for this item
- `rpc_accrue_on_close` contains **no INSERT/UPSERT** for `player_loyalty`.
- Missing `player_loyalty` results in a loud, explicit error (`P0001`) containing the ids.

---

## 3) Database: Backfill + FK constraint — NOT STARTED (Required)

### Findings
- `player_loyalty` has PK `(player_id, casino_id)` but **no FK** to `player_casino`.
- At least **1 enrolled player** currently missing a loyalty account.

### Migration order (required)
1) **Backfill** missing `player_loyalty` rows (source of truth: `player_casino`)
2) Add FK: `player_loyalty(player_id, casino_id) → player_casino(player_id, casino_id)` `ON DELETE CASCADE`

### Prerequisite check
FK requires the referenced columns be **UNIQUE** or **PRIMARY KEY** on `player_casino`.

If missing, add:

```sql
ALTER TABLE public.player_casino
  ADD CONSTRAINT player_casino_player_casino_uk UNIQUE (player_id, casino_id);
```

### Backfill (recommended template)

```sql
INSERT INTO public.player_loyalty (player_id, casino_id, current_balance, preferences, updated_at)
SELECT pc.player_id, pc.casino_id, 0, '{}'::jsonb, now()
FROM public.player_casino pc
LEFT JOIN public.player_loyalty pl
  ON pl.player_id = pc.player_id AND pl.casino_id = pc.casino_id
WHERE pl.player_id IS NULL;
```

### Add FK

```sql
ALTER TABLE public.player_loyalty
ADD CONSTRAINT player_loyalty_player_casino_fk
FOREIGN KEY (player_id, casino_id)
REFERENCES public.player_casino (player_id, casino_id)
ON DELETE CASCADE;
```

### Acceptance for this item
- Backfill inserts all missing rows (idempotent if re-run).
- FK exists and validates successfully.
- Deleting `player_casino` cascades to `player_loyalty` (expected lifecycle).

---

## 4) Verify `rpc_create_player` Auth — VERIFIED (Accepted)

**Verified controls:**
- `SECURITY DEFINER` with `SET search_path = public`
- Role check: `pit_boss` or `admin` only
- Casino ID mismatch check
- Actor must be **active staff** in casino

### Final two sanity checks (do before merge)
- Confirm staff lookup uses **caller identity** consistently (`auth.uid()` and/or your `app.actor_id` context), not a spoofable passed-in value.
- Confirm casino scope cannot be bypassed (you have mismatch check; ensure it is enforced before any writes).

---

# Ship Gate (Definition of Done)

✅ Approved for production **only when all are true**:

- [ ] Enrollment guarantees `player_loyalty` provisioning via the canonical enrollment path (no cross-context service writes)
- [ ] `rpc_accrue_on_close` **does not provision** loyalty; it UPDATEs and hard-fails if missing
- [ ] Backfill applied and FK constraint is in place (`player_loyalty → player_casino`)
- [ ] `rpc_create_player` auth sanity checks verified (caller identity + casino scope)
- [ ] A quick integration check is run:
  - Enroll player → `player_loyalty` exists immediately
  - Close slip → accrual succeeds
  - If `player_loyalty` is manually deleted → accrual fails with `PLAYER_LOYALTY_MISSING`

---

# Release note (internal)

This patch converts a previously implicit, seed-masked invariant into an explicit, enforced lifecycle:
**loyalty accounts are provisioned at enrollment, never at accrual**, and the DB schema now prevents orphan/missing loyalty state.

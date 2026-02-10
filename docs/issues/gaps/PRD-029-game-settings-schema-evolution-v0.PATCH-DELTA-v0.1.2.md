---
prd_id: PRD-029
title: "PRD-029 Micro Patch Delta — v0.1.2 (DDL correctness + expression-unique + side-bet tenancy integrity + seed RPC guardrails)"
version: "0.1.2-delta"
status: proposed_patch
created: 2026-02-10
last_updated: 2026-02-10
---

# What this patch fixes (tight, mechanical)

This delta addresses the remaining audit issues that can break migrations or create silent integrity/security drift:

1) Fix invalid **CHECK** syntax in the side-bet DDL snippet (must reference a column). citeturn0search1  
2) Clarify that uniqueness using `COALESCE(...)` requires an **expression unique index**, not a plain UNIQUE constraint. citeturn0search8  
3) If you keep `casino_id` on `game_settings_side_bet`, add an integrity rule ensuring it matches the parent `game_settings.casino_id`.  
4) Tighten seed RPC guardrails: precondition for RLS context, explicit allow-list, and explicit RLS posture expectations for SECURITY DEFINER. citeturn0search2  

---

## PATCH A — FR-4 (Side-bet table) DDL snippet correctness

### Replace the `CHECK` line in the `game_settings_side_bet` DDL snippet with:

- `house_edge numeric NOT NULL CHECK (house_edge >= 0 AND house_edge <= 100)`

> Postgres CHECK constraints require a Boolean expression, typically referencing the column (e.g., `price numeric CHECK (price > 0)`). citeturn0search1  

---

## PATCH B — FR-4 uniqueness wording (COALESCE requires expression unique index)

### Replace the “Unique:” bullet in FR-4 with:

- **Uniqueness** is enforced via an **expression UNIQUE INDEX** (because `COALESCE(...)` is not representable as a simple UNIQUE constraint):
  - `CREATE UNIQUE INDEX game_settings_side_bet_uq`
    `ON game_settings_side_bet (game_settings_id, side_bet_name, COALESCE(paytable_id, 'default'));`

> Postgres supports indexes on expressions and notes they can enforce constraints not definable as simple unique constraints. citeturn0search8  

---

## PATCH C — FR-4 tenancy integrity (casino_id duplication consistency)

If the PRD keeps `casino_id` on `game_settings_side_bet` for RLS ergonomics, add one of the following integrity mechanisms.

### Option C1 (recommended): drop `casino_id` from side-bets
- Remove `casino_id` column from `game_settings_side_bet`.
- Tenancy derives via FK join to `game_settings`.

**Pros**: no drift possible.  
**Cons**: RLS policies may require a join (or EXISTS).

### Option C2: keep `casino_id` + enforce it matches the parent
Add:

- A trigger (BEFORE INSERT/UPDATE) that sets `NEW.casino_id := (SELECT casino_id FROM game_settings WHERE id = NEW.game_settings_id)`
  and raises if mismatch.
- Or a constraint pattern if you introduce a composite key on `game_settings (id, casino_id)` and reference it.

**Add this explicit statement to FR-4**:

- `casino_id` (if present) **must equal** parent `game_settings.casino_id`; drift is rejected at write time.

---

## PATCH D — FR-5 seed RPC guardrails (context + role + RLS posture)

### Replace the “preconditions / security” paragraph in FR-5 with:

- The seed RPC must not rely on external call ordering.
  - **It MUST ensure RLS context is set** (either by calling the context setter internally or by explicitly failing fast with a clear error when `casino_id` / `actor_id` are absent).
- Allow-list: restrict execution to **configuration authority** roles (e.g., `admin`, `manager`). Exclude floor roles like `pit_boss` from template seeding.
- If using **SECURITY DEFINER**, the PRD must explicitly declare the RLS posture:
  - Table owners and roles with `BYPASSRLS` normally bypass RLS, unless `FORCE ROW LEVEL SECURITY` is enabled. citeturn0search2  
  - Therefore choose one:
    1) **RLS-respecting**: tables are `FORCE ROW LEVEL SECURITY` and policies are expected to apply to definer too, or  
    2) **RLS-bypassing by design**: definer bypass is accepted, but the function must enforce tenancy and role checks itself (validated `casino_id`, validated `actor_role`, scoped inserts).

### Add this to FR-5 “DoD”:

- DoD includes a migration test that proves:
  - the expression unique index exists and blocks duplicates where `paytable_id` is NULL vs `'default'` treated equivalently, and
  - `casino_id` cannot drift (either by removal or enforced match).

---

# Minimal downstream impact

- No new features, no new entities.
- Purely makes the PRD implementable without migration failures and without silent integrity drift.


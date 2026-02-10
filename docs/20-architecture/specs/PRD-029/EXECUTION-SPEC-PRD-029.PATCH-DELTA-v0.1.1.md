---
exec_spec_id: EXECUTION-SPEC-PRD-029
title: "EXECUTION-SPEC-PRD-029 Micro Patch Delta — v0.1.1 (idempotent DDL, safer code backfill, RLS vs seed RPC clarity, PostgREST reload note)"
version: "0.1.1-delta"
status: proposed_patch
created: 2026-02-10
last_updated: 2026-02-10
---

# Why this delta exists

The current execution spec contains a few implementation footguns:

- `ADD CONSTRAINT` has no `IF NOT EXISTS` and can fail if the migration is re-applied in local/reset flows. (See WS1 DDL block.)【233:0†EXECUTION-SPEC-PRD-029.md†L10-L15】
- The `code` backfill uses `NOT NULL DEFAULT ''` which is workable, but less safe than a nullable→backfill→NOT NULL pattern.【233:1†EXECUTION-SPEC-PRD-029.md†L31-L39】
- RLS policy bullets read as if they govern *all writes*, but WS2 explicitly states the seed RPC is **SECURITY DEFINER bypass-by-design**.【233:0†EXECUTION-SPEC-PRD-029.md†L64-L70】【233:4†EXECUTION-SPEC-PRD-029.md†L52-L58】
- PostgREST schema cache reload is correct, but in CI it’s mostly irrelevant; type regeneration is the real gate.【233:0†EXECUTION-SPEC-PRD-029.md†L71-L71】

This delta is purely mechanical: it makes the spec more robust and less “interpretation-driven.”

---

# PATCH A — WS1: Make CHECK constraint creation re-runnable

## Replace the WS1 “CHECK constraints” snippet with this robust variant

**Current snippet (replace):**【233:0†EXECUTION-SPEC-PRD-029.md†L10-L15】

**Proposed snippet:**

```sql
-- CHECK constraints (re-runnable)
DO $$
BEGIN
  ALTER TABLE game_settings
    ADD CONSTRAINT chk_shoe_decks CHECK (shoe_decks IN (1, 2, 4, 6, 8));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE game_settings
    ADD CONSTRAINT chk_deck_profile CHECK (deck_profile IN ('standard_52', 'with_joker_53', 'spanish_48'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE game_settings
    ADD CONSTRAINT chk_rating_edge_for_comp CHECK (rating_edge_for_comp >= 0 AND rating_edge_for_comp <= 100);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
```

**Normative note (add under the snippet):**
- A CHECK constraint is satisfied if the expression evaluates to TRUE **or NULL**, so it won’t prevent NULLs unless paired with `NOT NULL`. citeturn0search0

---

# PATCH B — WS1: Safer `code` backfill strategy (avoid DEFAULT '' hack)

## Replace WS1 step “Add `code` column + new unique” with:

**Current snippet (replace):**【233:1†EXECUTION-SPEC-PRD-029.md†L31-L39】

**Proposed snippet:**

```sql
-- Add `code` column (nullable first), backfill, then enforce NOT NULL
ALTER TABLE game_settings
  ADD COLUMN IF NOT EXISTS code text;

-- Backfill existing rows: code = game_type::text (safe under prior 1:1 uniqueness)
UPDATE game_settings
SET code = game_type::text
WHERE code IS NULL OR code = '';

-- Enforce NOT NULL after backfill
ALTER TABLE game_settings
  ALTER COLUMN code SET NOT NULL;

-- Uniqueness: stable identifier per casino
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_settings_casino_code
  ON game_settings (casino_id, code);
```

---

# PATCH C — WS1/WS2: Clarify RLS policies vs seed RPC bypass path

## Add this sentence under WS1 “RLS policies” bullets

**Insert immediately after the existing bullets:**【233:0†EXECUTION-SPEC-PRD-029.md†L64-L70】

> RLS policies govern direct table access (PostgREST/service CRUD). The seed RPC in WS2 is **SECURITY DEFINER bypass-by-design** and must enforce role + tenancy checks internally. Table owners and roles with `BYPASSRLS` normally bypass RLS unless `FORCE ROW LEVEL SECURITY` is enabled. citeturn0search2

This aligns the policy bullets with WS2’s explicitly stated posture.【233:4†EXECUTION-SPEC-PRD-029.md†L52-L58】

---

# PATCH D — WS1: Add one-line rationale for expression unique index (reduce reviewer churn)

## Add this note under the expression index snippet

**Under step 6 (immediately after the SQL):**【233:0†EXECUTION-SPEC-PRD-029.md†L33-L37】

> This is an **expression unique index**; Postgres supports indexes on expressions to enforce constraints not definable as simple unique constraints (e.g., `COALESCE(...)`). citeturn0search1

---

# PATCH E — WS1/WS2: PostgREST reload note (operationally correct, but not a CI gate)

## Replace the PostgREST reload bullet with:

**Current:**【233:0†EXECUTION-SPEC-PRD-029.md†L71-L71】

**Proposed:**
- PostgREST schema cache reload (optional for local/dev):
  - `NOTIFY pgrst, 'reload schema';` citeturn0search3
- CI gate is `npm run db:types` (generated types must match DB), so PostgREST reload is not relied upon in automated validation.

(Supabase also documents the same NOTIFY statement for schema refresh.) citeturn0search15

---

# PATCH F — WS4: Add explicit test for “side-bet insert without casino_id”

## Add one bullet under WS4 integration tests

The service DTO already expects `CreateGameSettingsSideBetDTO` omits `casino_id` (trigger-derived).【233:8†EXECUTION-SPEC-PRD-029.md†L58-L62】

Add a test case:
- Insert side-bet row **without** `casino_id` and assert:
  - insert succeeds, and
  - stored `casino_id` equals parent `game_settings.casino_id` (trigger overwrite).

(Trigger functions can modify `NEW` and return it.) citeturn0search12

---

# Result

After applying these micro-edits, the EXECUTION-SPEC becomes:
- safer to implement,
- less dependent on “engineer interpretation,”
- consistent with the stated SECURITY DEFINER posture,
- and more robust in local reset / iterative migration workflows.

-- ============================================================================
-- Migration: PRD-029 Game Settings Schema Evolution
-- Description: Extend game_settings for variant-level granularity (Setup Wizard B
--              Step 2). Add new enum values, variant columns, code column,
--              game_settings_side_bet table with Pattern C hybrid RLS.
-- Created: 2026-02-10
-- Reference: ADR-015, ADR-020, ADR-024, PRD-029
-- RLS_REVIEW_COMPLETE: Pattern C hybrid policies, admin-only writes
-- Affected Tables: game_settings (ALTER), game_settings_side_bet (CREATE)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum extension (FR-1)
-- ---------------------------------------------------------------------------
ALTER TYPE game_type ADD VALUE IF NOT EXISTS 'pai_gow';
ALTER TYPE game_type ADD VALUE IF NOT EXISTS 'carnival';

-- ---------------------------------------------------------------------------
-- 2. Drop old unique constraint (FR-2)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS ux_game_settings_casino_type;

-- ---------------------------------------------------------------------------
-- 3. Add `code` column + new unique (FR-2)
-- ---------------------------------------------------------------------------

-- Add `code` column (nullable first), backfill, then enforce NOT NULL
ALTER TABLE game_settings
  ADD COLUMN IF NOT EXISTS code text;

-- Precondition: prior schema enforced UNIQUE(casino_id, game_type), so mapping
-- existing rows code = game_type::text is collision-free against the new
-- UNIQUE(casino_id, code) constraint. Do NOT reuse this pattern without verifying
-- 1:1 uniqueness between source and target columns.
UPDATE game_settings
SET code = game_type::text
WHERE code IS NULL OR code = '';

-- Enforce NOT NULL after backfill
ALTER TABLE game_settings
  ALTER COLUMN code SET NOT NULL;

-- Uniqueness: stable identifier per casino
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_settings_casino_code
  ON game_settings (casino_id, code);

-- ---------------------------------------------------------------------------
-- 4. Add variant columns (FR-3)
-- ---------------------------------------------------------------------------
ALTER TABLE game_settings
  ADD COLUMN IF NOT EXISTS variant_name text,
  ADD COLUMN IF NOT EXISTS shoe_decks smallint,
  ADD COLUMN IF NOT EXISTS deck_profile text,
  ADD COLUMN IF NOT EXISTS rating_edge_for_comp numeric(6,3),
  ADD COLUMN IF NOT EXISTS notes text;

-- CHECK constraints (re-runnable via DO $$ blocks)
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

-- ---------------------------------------------------------------------------
-- 5. Create game_settings_side_bet table (FR-4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_settings_side_bet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_settings_id uuid NOT NULL REFERENCES game_settings(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  side_bet_name text NOT NULL,
  house_edge numeric(6,3) NOT NULL,
  paytable_id text,
  enabled_by_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_side_bet_house_edge CHECK (house_edge >= 0 AND house_edge <= 100)
);

-- ---------------------------------------------------------------------------
-- 6. Expression unique index (FR-4)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS game_settings_side_bet_uq
  ON game_settings_side_bet (game_settings_id, side_bet_name, COALESCE(paytable_id, 'default'));

-- ---------------------------------------------------------------------------
-- 7. Casino_id derivation trigger (FR-4, Option C2)
--    casino_id is trigger-derived, not client-supplied. The trigger overwrites
--    any client-supplied value. Service DTOs and Zod schemas must omit casino_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_game_settings_side_bet_casino_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.casino_id := (SELECT casino_id FROM game_settings WHERE id = NEW.game_settings_id);
  IF NEW.casino_id IS NULL THEN
    RAISE EXCEPTION 'Parent game_settings row not found for id %', NEW.game_settings_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_side_bet_derive_casino_id
  BEFORE INSERT OR UPDATE ON game_settings_side_bet
  FOR EACH ROW EXECUTE FUNCTION set_game_settings_side_bet_casino_id();

-- ---------------------------------------------------------------------------
-- 8. Updated_at trigger for side-bet table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_game_settings_side_bet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_game_settings_side_bet_updated_at ON game_settings_side_bet;
CREATE TRIGGER trg_game_settings_side_bet_updated_at
  BEFORE UPDATE ON game_settings_side_bet
  FOR EACH ROW EXECUTE FUNCTION update_game_settings_side_bet_updated_at();

-- ---------------------------------------------------------------------------
-- 9. RLS policies for game_settings_side_bet
--    Pattern C hybrid (ADR-015/ADR-020). Not a critical table per ADR-030 D4,
--    so COALESCE fallback is acceptable on writes.
-- ---------------------------------------------------------------------------

-- REQUIRED: Enable RLS (policies have no effect without this)
ALTER TABLE game_settings_side_bet ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated, casino-scoped (Pattern C hybrid)
CREATE POLICY side_bet_select ON game_settings_side_bet
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
  );

-- INSERT: Admin-only, casino-scoped (Pattern C hybrid)
CREATE POLICY side_bet_insert ON game_settings_side_bet
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
    AND COALESCE(
      current_setting('app.staff_role', true),
      (auth.jwt()->'app_metadata')::jsonb->>'staff_role'
    ) IN ('admin', 'manager')
  );

-- UPDATE: Admin-only, casino-scoped (USING + WITH CHECK)
CREATE POLICY side_bet_update ON game_settings_side_bet
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
    AND COALESCE(
      current_setting('app.staff_role', true),
      (auth.jwt()->'app_metadata')::jsonb->>'staff_role'
    ) IN ('admin', 'manager')
  )
  WITH CHECK (
    casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      ((auth.jwt()->'app_metadata')::jsonb->>'casino_id')::uuid
    )
  );

-- No DELETE policy: denied by default (mirrors game_settings)

-- ---------------------------------------------------------------------------
-- 10. PostgREST schema cache reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

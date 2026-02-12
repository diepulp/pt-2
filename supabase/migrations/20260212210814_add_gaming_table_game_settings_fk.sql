-- ============================================================================
-- Migration: Add game_settings_id FK to gaming_table
-- Description: Nullable FK linking gaming tables to their specific game variant.
--              Includes tenant-consistency trigger and partial index.
-- Reference: GAP-SEEDED-GAME-SETTINGS-ORPHANED WS1
-- ============================================================================

-- 1. Add nullable FK column
ALTER TABLE gaming_table
ADD COLUMN game_settings_id uuid REFERENCES game_settings(id) ON DELETE SET NULL;

-- 2. Partial index for FK lookups (only on non-null values)
CREATE INDEX idx_gaming_table_game_settings_id
ON gaming_table(game_settings_id)
WHERE game_settings_id IS NOT NULL;

-- 3. Tenant-consistency trigger: gaming_table.casino_id must match game_settings.casino_id
CREATE OR REPLACE FUNCTION trg_gaming_table_game_settings_tenant_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_gs_casino_id uuid;
BEGIN
  IF NEW.game_settings_id IS NOT NULL THEN
    SELECT casino_id INTO v_gs_casino_id
    FROM game_settings
    WHERE id = NEW.game_settings_id;

    IF v_gs_casino_id IS NULL THEN
      RAISE EXCEPTION 'game_settings_id "%" does not exist', NEW.game_settings_id;
    END IF;

    IF v_gs_casino_id != NEW.casino_id THEN
      RAISE EXCEPTION 'game_settings_id "%" belongs to a different casino', NEW.game_settings_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER gaming_table_game_settings_tenant_check
  BEFORE INSERT OR UPDATE OF game_settings_id ON gaming_table
  FOR EACH ROW
  EXECUTE FUNCTION trg_gaming_table_game_settings_tenant_check();

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- Migration: ADR-022 Player Identity Enrollment - Immutability Trigger
-- Purpose: Enforce immutability of casino_id, player_id, created_by columns
-- Reference: EXEC-SPEC-022 Section 3.2 (INV-10)

-- Create immutability enforcement trigger function
CREATE OR REPLACE FUNCTION enforce_player_identity_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent modification of casino_id
  IF OLD.casino_id IS DISTINCT FROM NEW.casino_id THEN
    RAISE EXCEPTION 'player_identity.casino_id is immutable'
    USING ERRCODE = '23514';
  END IF;

  -- Prevent modification of player_id
  IF OLD.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'player_identity.player_id is immutable'
    USING ERRCODE = '23514';
  END IF;

  -- Prevent modification of created_by
  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'player_identity.created_by is immutable'
    USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to player_identity table
CREATE TRIGGER trg_player_identity_immutability
  BEFORE UPDATE ON player_identity
  FOR EACH ROW
  EXECUTE FUNCTION enforce_player_identity_immutability();

-- Add comments
COMMENT ON FUNCTION enforce_player_identity_immutability() IS 'Enforces immutability of casino_id, player_id, created_by (INV-10)';
COMMENT ON TRIGGER trg_player_identity_immutability ON player_identity IS 'Prevents modification of key immutable fields (INV-10)';

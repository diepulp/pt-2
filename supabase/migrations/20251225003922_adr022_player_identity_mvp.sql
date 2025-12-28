-- Migration: ADR-022 Player Identity Enrollment - Player Identity Table
-- Purpose: Create player_identity table with all MVP columns
-- Reference: EXEC-SPEC-022 Section 1.3, ADR-015
-- Depends: Migration 20251225120002 (UNIQUE constraint on player_casino)
-- RLS_REVIEW_COMPLETE: ADR-015 hybrid pattern with DROP IF EXISTS for idempotency

-- Create player_identity table (IF NOT EXISTS for idempotency)
CREATE TABLE IF NOT EXISTS player_identity (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  -- Personal Information (from ID document)
  birth_date date NULL,
  gender text NULL CHECK (gender IN ('m', 'f', 'x')),
  eye_color text NULL,
  height text NULL,
  weight text NULL,
  address jsonb NULL,

  -- Document Information
  document_number_last4 text NULL,
  document_number_hash text NULL,
  issue_date date NULL,
  expiration_date date NULL,
  issuing_state text NULL,
  document_type text NULL CHECK (document_type IN ('drivers_license', 'passport', 'state_id')),

  -- Verification
  verified_at timestamptz NULL,
  verified_by uuid NULL REFERENCES staff(id) ON DELETE SET NULL,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  updated_by uuid NULL REFERENCES staff(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT uq_player_identity_casino_player
    UNIQUE (casino_id, player_id),

  CONSTRAINT fk_player_identity_enrollment
    FOREIGN KEY (casino_id, player_id)
    REFERENCES player_casino(casino_id, player_id)
    ON DELETE CASCADE
);

-- Create unique partial index for document hash deduplication
CREATE UNIQUE INDEX IF NOT EXISTS ux_player_identity_doc_hash
  ON player_identity (casino_id, document_number_hash)
  WHERE document_number_hash IS NOT NULL;

-- Create trigger for updated_at + updated_by auto-population
CREATE OR REPLACE FUNCTION update_player_identity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_player_identity_updated_at ON player_identity;
CREATE TRIGGER trg_player_identity_updated_at
  BEFORE UPDATE ON player_identity
  FOR EACH ROW
  EXECUTE FUNCTION update_player_identity_updated_at();

-- Add table and column comments
COMMENT ON TABLE player_identity IS 'Player identity information from government-issued ID documents (ADR-022)';
COMMENT ON COLUMN player_identity.casino_id IS 'Casino scoping (immutable per INV-10)';
COMMENT ON COLUMN player_identity.player_id IS 'Player reference (immutable per INV-10)';
COMMENT ON COLUMN player_identity.birth_date IS 'Date of birth from ID document (propagates to player.birth_date)';
COMMENT ON COLUMN player_identity.gender IS 'Gender: m=male, f=female, x=non-binary (lowercase)';
COMMENT ON COLUMN player_identity.height IS 'Height from ID (format: "6-01" for 6 feet 1 inch)';
COMMENT ON COLUMN player_identity.address IS 'Structured address from ID: {street, city, state, postalCode}';
COMMENT ON COLUMN player_identity.document_number_last4 IS 'Last 4 characters for display (PII masking)';
COMMENT ON COLUMN player_identity.document_number_hash IS 'SHA-256 hash for deduplication (never display)';
COMMENT ON COLUMN player_identity.document_type IS 'Document type: drivers_license, passport, state_id';
COMMENT ON COLUMN player_identity.verified_at IS 'Timestamp when identity was verified by staff';
COMMENT ON COLUMN player_identity.verified_by IS 'Staff member who verified identity';
COMMENT ON COLUMN player_identity.created_by IS 'Staff member who created record (immutable per INV-10)';
COMMENT ON COLUMN player_identity.updated_by IS 'Staff member who last updated record (auto-populated from app.actor_id)';
COMMENT ON CONSTRAINT uq_player_identity_casino_player ON player_identity IS 'One identity per player enrollment';
COMMENT ON CONSTRAINT fk_player_identity_enrollment ON player_identity IS 'Must reference valid enrollment in player_casino';
COMMENT ON INDEX ux_player_identity_doc_hash IS 'Prevents duplicate document numbers within casino';

-- Enable RLS
ALTER TABLE player_identity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - pit_boss, admin, cashier can read in their casino
DROP POLICY IF EXISTS "player_identity_select" ON player_identity;
CREATE POLICY "player_identity_select" ON player_identity
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

-- RLS Policy: INSERT - pit_boss, admin with actor binding (INV-9)
DROP POLICY IF EXISTS "player_identity_insert" ON player_identity;
CREATE POLICY "player_identity_insert" ON player_identity
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    AND created_by = COALESCE(
      NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
    )
  );

-- RLS Policy: UPDATE - pit_boss, admin with actor binding (INV-6, INV-9)
DROP POLICY IF EXISTS "player_identity_update" ON player_identity;
CREATE POLICY "player_identity_update" ON player_identity
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    AND (
      verified_by IS NULL
      OR verified_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- RLS Policy: DELETE - Explicit denial (audit trail preservation)
DROP POLICY IF EXISTS "player_identity_no_delete" ON player_identity;
CREATE POLICY "player_identity_no_delete" ON player_identity
  FOR DELETE USING (false);

COMMENT ON POLICY "player_identity_select" ON player_identity IS 'Casino-scoped read for pit_boss, admin, cashier';
COMMENT ON POLICY "player_identity_insert" ON player_identity IS 'Insert with actor binding (INV-9)';
COMMENT ON POLICY "player_identity_update" ON player_identity IS 'Update with verification actor check (INV-6, INV-9)';
COMMENT ON POLICY "player_identity_no_delete" ON player_identity IS 'Hard deletes denied (audit trail)';

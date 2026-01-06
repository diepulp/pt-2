-- =====================================================
-- Migration: PRD-OPS-CASH-OBS-001 Pit Cash Observation Table
-- Created: 2026-01-06 02:11:05
-- Purpose: Create pit_cash_observation table for tracking cash-out events
--          at gaming tables (walk-withs, phone confirmations, visual observations)
-- References: PRD-OPS-CASH-OBS-001, ADR-015, ADR-020
-- RLS_REVIEW_COMPLETE: Policies use ADR-015 hybrid pattern with auth.uid() guards
-- =====================================================

BEGIN;

-- =====================================================
-- SECTION 1: CREATE ENUMS
-- =====================================================

-- Amount kind classification: estimate vs cage-confirmed
CREATE TYPE observation_amount_kind AS ENUM (
  'estimate',        -- Pit boss visual estimate
  'cage_confirmed'   -- Verified by cage cashier
);

-- Observation source: how the cash-out was captured
CREATE TYPE observation_source AS ENUM (
  'walk_with',       -- Pit boss walked player to cage
  'phone_confirmed', -- Cage confirmed via phone
  'observed'         -- Visual observation only
);

-- =====================================================
-- SECTION 2: CREATE pit_cash_observation TABLE
-- =====================================================

CREATE TABLE pit_cash_observation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id UUID NOT NULL REFERENCES casino(id),
  gaming_day DATE NOT NULL,  -- Computed via trigger
  player_id UUID NOT NULL REFERENCES player(id),
  visit_id UUID NOT NULL REFERENCES visit(id),
  rating_slip_id UUID REFERENCES rating_slip(id),  -- Optional link to active slip
  direction TEXT NOT NULL DEFAULT 'out' CHECK (direction = 'out'),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  amount_kind observation_amount_kind NOT NULL DEFAULT 'estimate',
  source observation_source NOT NULL DEFAULT 'walk_with',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES staff(id),
  note TEXT,
  idempotency_key TEXT,  -- Optional for MVP
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pit_cash_observation IS
  'PRD-OPS-CASH-OBS-001: Tracks cash-out events observed at gaming tables. Direction is always "out" (cash leaving tables). Links to visit for session context.';

COMMENT ON COLUMN pit_cash_observation.gaming_day IS
  'Auto-computed via trigger using compute_gaming_day(casino_id, observed_at). Aligned with casino timezone.';

COMMENT ON COLUMN pit_cash_observation.amount_kind IS
  'estimate = pit boss visual estimate; cage_confirmed = verified by cage cashier';

COMMENT ON COLUMN pit_cash_observation.source IS
  'walk_with = escorted to cage; phone_confirmed = cage verified via phone; observed = visual only';

COMMENT ON COLUMN pit_cash_observation.idempotency_key IS
  'Optional unique key to prevent duplicate observations. Casino-scoped via unique index.';

-- =====================================================
-- SECTION 3: INDEXES
-- =====================================================

-- Idempotency: Casino-scoped unique constraint (partial index for non-null keys)
CREATE UNIQUE INDEX ux_pit_cash_observation_casino_idem
  ON pit_cash_observation (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Shift dashboard queries: Filter by casino + gaming_day
CREATE INDEX ix_pit_cash_observation_casino_day
  ON pit_cash_observation (casino_id, gaming_day);

-- Visit history: Get observations for a visit, most recent first
CREATE INDEX ix_pit_cash_observation_visit_time
  ON pit_cash_observation (visit_id, observed_at DESC);

-- Player history queries (common for compliance review)
CREATE INDEX ix_pit_cash_observation_player_time
  ON pit_cash_observation (player_id, observed_at DESC);

-- =====================================================
-- SECTION 4: GAMING DAY TRIGGER
-- =====================================================
-- Auto-compute gaming_day using canonical compute_gaming_day(casino_id, timestamp)

CREATE OR REPLACE FUNCTION trg_pit_cash_observation_set_gaming_day()
RETURNS TRIGGER AS $$
BEGIN
  -- Use the canonical compute_gaming_day RPC from PRD-000
  NEW.gaming_day := compute_gaming_day(NEW.casino_id, COALESCE(NEW.observed_at, now()));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger for INSERT operations
DROP TRIGGER IF EXISTS trg_pit_cash_observation_gaming_day ON pit_cash_observation;
CREATE TRIGGER trg_pit_cash_observation_gaming_day
  BEFORE INSERT ON pit_cash_observation
  FOR EACH ROW
  EXECUTE FUNCTION trg_pit_cash_observation_set_gaming_day();

-- =====================================================
-- SECTION 5: RLS POLICIES (ADR-015 Hybrid Pattern C)
-- =====================================================
-- Authorization matrix per PRD-OPS-CASH-OBS-001:
--   SELECT: pit_boss, cashier, admin (within casino scope)
--   INSERT: pit_boss, cashier, admin (within casino scope, actor binding)
--
-- Pattern C: COALESCE(session_var, JWT fallback) for pgbouncer compatibility

-- Enable RLS
ALTER TABLE pit_cash_observation ENABLE ROW LEVEL SECURITY;

-- SELECT policy: pit_boss, cashier, admin within casino scope
CREATE POLICY pit_cash_observation_select ON pit_cash_observation
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      auth.jwt() -> 'app_metadata' ->> 'staff_role'
    ) IN ('pit_boss', 'cashier', 'admin')
  );

-- INSERT policy: pit_boss, cashier, admin within casino scope
-- Actor binding: created_by_staff_id must match current actor context
CREATE POLICY pit_cash_observation_insert ON pit_cash_observation
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      auth.jwt() -> 'app_metadata' ->> 'staff_role'
    ) IN ('pit_boss', 'cashier', 'admin')
    AND created_by_staff_id = COALESCE(
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
    )
  );

-- Append-only guard: No UPDATE policy (absence = deny)
CREATE POLICY pit_cash_observation_no_update ON pit_cash_observation
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL AND false);

-- Append-only guard: No DELETE policy (absence = deny)
CREATE POLICY pit_cash_observation_no_delete ON pit_cash_observation
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL AND false);

-- =====================================================
-- SECTION 6: APPEND-ONLY ENFORCEMENT (Belt + Suspenders)
-- =====================================================
-- Two additional layers beyond RLS denial policies:
-- 1. REVOKE: Remove UPDATE/DELETE privileges from app roles
-- 2. TRIGGERS: BEFORE triggers as final defense (catches service_role bypass)

-- Layer 1: REVOKE UPDATE/DELETE privileges
REVOKE UPDATE, DELETE ON pit_cash_observation FROM authenticated;
REVOKE UPDATE, DELETE ON pit_cash_observation FROM anon;

-- Layer 2: Immutability triggers (defense in depth)
CREATE OR REPLACE FUNCTION trg_pit_cash_observation_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pit_cash_observation is immutable: UPDATE/DELETE not allowed'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pit_cash_observation_no_update ON pit_cash_observation;
CREATE TRIGGER trg_pit_cash_observation_no_update
  BEFORE UPDATE ON pit_cash_observation
  FOR EACH ROW
  EXECUTE FUNCTION trg_pit_cash_observation_immutable();

DROP TRIGGER IF EXISTS trg_pit_cash_observation_no_delete ON pit_cash_observation;
CREATE TRIGGER trg_pit_cash_observation_no_delete
  BEFORE DELETE ON pit_cash_observation
  FOR EACH ROW
  EXECUTE FUNCTION trg_pit_cash_observation_immutable();

-- =====================================================
-- NOTIFY POSTGREST
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- VERIFICATION NOTES
-- =====================================================
--
-- Schema Changes:
-- - observation_amount_kind ENUM: estimate, cage_confirmed
-- - observation_source ENUM: walk_with, phone_confirmed, observed
-- - pit_cash_observation TABLE with full schema per PRD-OPS-CASH-OBS-001
-- - gaming_day auto-computed via BEFORE INSERT trigger
--
-- Indexes:
-- - ux_pit_cash_observation_casino_idem: Casino-scoped idempotency (partial)
-- - ix_pit_cash_observation_casino_day: Shift dashboard queries
-- - ix_pit_cash_observation_visit_time: Visit history (DESC)
-- - ix_pit_cash_observation_player_time: Player history (DESC)
--
-- RLS Policies (ADR-015 Pattern C):
-- - SELECT: pit_boss, cashier, admin (casino scope)
-- - INSERT: pit_boss, cashier, admin (casino scope + actor binding)
-- - UPDATE/DELETE: Denied via policy + REVOKE + trigger
--
-- Append-Only Enforcement:
-- - RLS denial policies (USING false)
-- - REVOKE UPDATE, DELETE from authenticated/anon
-- - BEFORE triggers raise exception on UPDATE/DELETE
--
-- Run after migration:
--   npm run db:types
--
-- Verify with:
--   SELECT * FROM pg_type WHERE typname IN ('observation_amount_kind', 'observation_source');
--   \d pit_cash_observation
--   SELECT indexname FROM pg_indexes WHERE tablename = 'pit_cash_observation';
--

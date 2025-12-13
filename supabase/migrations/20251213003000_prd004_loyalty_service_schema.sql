-- ============================================================================
-- Migration: PRD-004 Loyalty Service Schema (Greenfield Reset)
-- ============================================================================
-- Status: WS1 - Database Layer - Schema Creation
-- ADR: ADR-019 v2 - Loyalty Points Policy (Ledger-Based Credit/Debit Model)
-- Strategy: MIGRATION-STRATEGY-PRD-004.md
-- Idempotency: IDEMPOTENCY-DRIFT-CONTRACT.md
-- Security: RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md
--
-- This migration DROPS and recreates loyalty schema with canonical enum values
-- and append-only ledger semantics. No backward compatibility required.
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop existing legacy tables and types
-- ============================================================================

-- Drop dependent objects first
DROP POLICY IF EXISTS loyalty_ledger_no_deletes ON loyalty_ledger CASCADE;
DROP POLICY IF EXISTS loyalty_ledger_no_updates ON loyalty_ledger CASCADE;
DROP POLICY IF EXISTS loyalty_ledger_insert ON loyalty_ledger CASCADE;
DROP POLICY IF EXISTS loyalty_ledger_select ON loyalty_ledger CASCADE;

DROP POLICY IF EXISTS player_loyalty_update ON player_loyalty CASCADE;
DROP POLICY IF EXISTS player_loyalty_insert ON player_loyalty CASCADE;
DROP POLICY IF EXISTS player_loyalty_select ON player_loyalty CASCADE;

-- Drop foreign key dependencies (loyalty_outbox references loyalty_ledger)
DROP TABLE IF EXISTS loyalty_outbox CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS loyalty_ledger CASCADE;
DROP TABLE IF EXISTS player_loyalty CASCADE;

-- Drop old enum (will recreate with canonical values only)
DROP TYPE IF EXISTS loyalty_reason CASCADE;

-- ============================================================================
-- STEP 2: Create canonical enum (ADR-019 v2)
-- ============================================================================

CREATE TYPE loyalty_reason AS ENUM (
  'base_accrual',    -- Deterministic theo-based credit on rating slip close
  'promotion',       -- Campaign/offer overlay credit
  'redeem',          -- Comp issuance (DEBIT, negative points_delta)
  'manual_reward',   -- Service recovery credit
  'adjustment',      -- Admin correction (can be +/-)
  'reversal'         -- Reverse a previous entry (references original via metadata)
);

COMMENT ON TYPE loyalty_reason IS
  'Canonical loyalty ledger entry reasons per ADR-019 v2. Greenfield schema - no legacy values.';

-- ============================================================================
-- STEP 3: Create loyalty_ledger (append-only ledger)
-- ============================================================================

CREATE TABLE loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  -- Optional references (context-dependent)
  rating_slip_id uuid REFERENCES rating_slip(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES visit(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,

  -- Core ledger fields
  points_delta int NOT NULL,              -- Positive=credit, negative=debit
  reason loyalty_reason NOT NULL,

  -- Idempotency and source tracking
  idempotency_key uuid,                   -- UUID for request deduplication
  campaign_id text,                       -- For promotion uniqueness (IDEMPOTENCY-DRIFT-CONTRACT §1.3.3)
  source_kind text,                       -- 'rating_slip', 'campaign', 'manual', etc.
  source_id uuid,                         -- Reference to source entity

  -- Provenance and audit
  metadata jsonb NOT NULL DEFAULT '{}',   -- Calculation provenance (theo, policy version, etc.)
  note text,                              -- Required for redeem/adjustment (RPC-enforced)

  -- Timestamp (append-only, no updates allowed)
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE loyalty_ledger IS
  'Append-only ledger for all loyalty point transactions. Per ADR-019 v2: credits (accrual, promotion, manual_reward) and debits (redeem, adjustment, reversal).';

COMMENT ON COLUMN loyalty_ledger.points_delta IS
  'Signed integer: positive=credit, negative=debit. Base accrual never negative (theo ≤ 0 → 0 points).';

COMMENT ON COLUMN loyalty_ledger.idempotency_key IS
  'UUID for request deduplication. Enforced via UNIQUE (casino_id, idempotency_key) partial index.';

COMMENT ON COLUMN loyalty_ledger.campaign_id IS
  'Campaign/promotion identifier. Used with rating_slip_id to enforce "one promotion per campaign per slip" uniqueness.';

COMMENT ON COLUMN loyalty_ledger.metadata IS
  'JSONB provenance data: {theo_cents, policy_version, house_edge, decisions_per_hour, duration_seconds, etc.}';

COMMENT ON COLUMN loyalty_ledger.note IS
  'Human-readable reason. Required for redeem (comp description), adjustment (justification), reversal (reference).';

-- ============================================================================
-- STEP 4: Idempotency and uniqueness indexes (IDEMPOTENCY-DRIFT-CONTRACT)
-- ============================================================================

-- General idempotency (all operations, casino-scoped)
CREATE UNIQUE INDEX ux_loyalty_ledger_idem
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX ux_loyalty_ledger_idem IS
  'General idempotency: prevents duplicate processing of same request (network retry, client bug). Casino-scoped for multi-tenancy.';

-- Base accrual uniqueness (one per rating slip per casino)
CREATE UNIQUE INDEX ux_loyalty_ledger_base_accrual
  ON loyalty_ledger (casino_id, rating_slip_id)
  WHERE reason = 'base_accrual' AND rating_slip_id IS NOT NULL;

COMMENT ON INDEX ux_loyalty_ledger_base_accrual IS
  'Business uniqueness: one base accrual reward per rating slip. Prevents double-minting even with different idempotency_key.';

-- Promotion uniqueness (one campaign per slip per casino)
CREATE UNIQUE INDEX ux_loyalty_ledger_promotion
  ON loyalty_ledger (casino_id, campaign_id, rating_slip_id)
  WHERE reason = 'promotion' AND campaign_id IS NOT NULL AND rating_slip_id IS NOT NULL;

COMMENT ON INDEX ux_loyalty_ledger_promotion IS
  'Business uniqueness: one promotion credit per campaign per rating slip. Prevents duplicate campaign awards.';

-- Query optimization indexes
CREATE INDEX ix_loyalty_ledger_player_time
  ON loyalty_ledger (player_id, created_at DESC);

COMMENT ON INDEX ix_loyalty_ledger_player_time IS
  'Supports player ledger history queries with time-based pagination.';

CREATE INDEX ix_loyalty_ledger_rating_slip
  ON loyalty_ledger (rating_slip_id)
  WHERE rating_slip_id IS NOT NULL;

COMMENT ON INDEX ix_loyalty_ledger_rating_slip IS
  'Supports "all loyalty entries for this rating slip" queries.';

-- Pagination index (LEDGER-PAGINATION-CONTRACT)
CREATE INDEX ix_loyalty_ledger_pagination
  ON loyalty_ledger (casino_id, player_id, created_at DESC, id ASC);

COMMENT ON INDEX ix_loyalty_ledger_pagination IS
  'Composite index for cursor-based pagination: casino_id + player_id + created_at DESC + id (tiebreaker).';

-- ============================================================================
-- STEP 5: Create player_loyalty (balance cache)
-- ============================================================================

CREATE TABLE player_loyalty (
  player_id uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,

  -- Balance cache (SUM(points_delta) from loyalty_ledger)
  current_balance int NOT NULL DEFAULT 0,  -- Can go negative with authorized overdraw

  -- Player tier and preferences
  tier text,                               -- 'bronze', 'silver', 'gold', 'platinum', etc.
  preferences jsonb NOT NULL DEFAULT '{}', -- Player-specific settings (email opt-in, etc.)

  -- Timestamp
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (player_id, casino_id)
);

COMMENT ON TABLE player_loyalty IS
  'Cached loyalty balance per player per casino. Balance MUST equal SUM(loyalty_ledger.points_delta) - enforced by RPCs and verified by drift detection.';

COMMENT ON COLUMN player_loyalty.current_balance IS
  'Cached points balance. Invariant: current_balance = SUM(loyalty_ledger.points_delta WHERE player_id=? AND casino_id=?). Can go negative with authorized overdraw per ADR-019 P4.';

COMMENT ON COLUMN player_loyalty.tier IS
  'Player tier (optional, post-MVP). Example values: bronze, silver, gold, platinum.';

COMMENT ON COLUMN player_loyalty.preferences IS
  'Player-specific loyalty preferences: {email_opt_in: boolean, preferred_redemption_categories: string[], ...}';

-- ============================================================================
-- STEP 6: RLS Policies (Pattern C Hybrid per ADR-015)
-- ============================================================================

-- Enable RLS
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_loyalty ENABLE ROW LEVEL SECURITY;

-- loyalty_ledger: SELECT (any authenticated staff, casino-scoped)
CREATE POLICY loyalty_ledger_select ON loyalty_ledger
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
  );

COMMENT ON POLICY loyalty_ledger_select ON loyalty_ledger IS
  'Pattern C Hybrid: Transaction context (app.casino_id) with JWT fallback. Any authenticated staff can read their casino ledger.';

-- loyalty_ledger: INSERT (pit_boss, cashier, admin only)
CREATE POLICY loyalty_ledger_insert ON loyalty_ledger
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
    AND COALESCE(
      current_setting('app.staff_role', true),
      (auth.jwt()->>'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

COMMENT ON POLICY loyalty_ledger_insert ON loyalty_ledger IS
  'Pattern C Hybrid with role gate. Only pit_boss, cashier, admin can insert ledger entries (per RPC-RLS-ROLE-ENFORCEMENT-PRD-004 §3.1).';

-- loyalty_ledger: DENY UPDATE (append-only enforcement)
CREATE POLICY loyalty_ledger_deny_update ON loyalty_ledger
  FOR UPDATE USING (false);

COMMENT ON POLICY loyalty_ledger_deny_update ON loyalty_ledger IS
  'Append-only enforcement: loyalty_ledger rows are immutable. Use reversal entries for corrections.';

-- loyalty_ledger: DENY DELETE (append-only enforcement)
CREATE POLICY loyalty_ledger_deny_delete ON loyalty_ledger
  FOR DELETE USING (false);

COMMENT ON POLICY loyalty_ledger_deny_delete ON loyalty_ledger IS
  'Append-only enforcement: loyalty_ledger rows cannot be deleted. Audit integrity per ADR-019.';

-- player_loyalty: SELECT (any authenticated staff, casino-scoped)
CREATE POLICY player_loyalty_select ON player_loyalty
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
  );

COMMENT ON POLICY player_loyalty_select ON player_loyalty IS
  'Pattern C Hybrid: Transaction context with JWT fallback. Any authenticated staff can read their casino player balances.';

-- player_loyalty: INSERT (pit_boss, admin only - balance initialization)
CREATE POLICY player_loyalty_insert ON player_loyalty
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
    AND COALESCE(
      current_setting('app.staff_role', true),
      (auth.jwt()->>'staff_role')
    ) IN ('pit_boss', 'admin')
  );

COMMENT ON POLICY player_loyalty_insert ON player_loyalty IS
  'Pattern C Hybrid with role gate. Only pit_boss, admin can initialize player loyalty records.';

-- player_loyalty: UPDATE (pit_boss, cashier, admin only - balance updates via RPCs)
CREATE POLICY player_loyalty_update ON player_loyalty
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt()->>'casino_id')::uuid
    )
    AND COALESCE(
      current_setting('app.staff_role', true),
      (auth.jwt()->>'staff_role')
    ) IN ('pit_boss', 'cashier', 'admin')
  );

COMMENT ON POLICY player_loyalty_update ON player_loyalty IS
  'Pattern C Hybrid with role gate. Balance updates via RPCs (accrual, redeem, adjustment) require pit_boss, cashier, or admin role.';

-- player_loyalty: DENY DELETE (soft delete via preferences, or admin-only)
CREATE POLICY player_loyalty_deny_delete ON player_loyalty
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      current_setting('app.staff_role', true),
      (auth.jwt()->>'staff_role')
    ) = 'admin'
  );

COMMENT ON POLICY player_loyalty_deny_delete ON player_loyalty IS
  'Balance records are admin-only deletable. Normal operations use soft-delete via preferences or status fields.';

-- ============================================================================
-- STEP 7: Balance Drift Detection (IDEMPOTENCY-DRIFT-CONTRACT §5)
-- ============================================================================

-- Materialized view: aggregate ledger sum per player
CREATE MATERIALIZED VIEW mv_loyalty_balance_reconciliation AS
SELECT
  casino_id,
  player_id,
  SUM(points_delta) AS ledger_balance,
  COUNT(*) AS entry_count,
  MAX(created_at) AS last_entry_at
FROM loyalty_ledger
GROUP BY casino_id, player_id;

COMMENT ON MATERIALIZED VIEW mv_loyalty_balance_reconciliation IS
  'Drift detection: pre-computed ledger sum per player. Compare with player_loyalty.current_balance to detect integrity violations. Refresh on-demand for MVP, cron for production.';

-- Index on materialized view for fast join
CREATE UNIQUE INDEX idx_mv_loyalty_balance_pk
  ON mv_loyalty_balance_reconciliation (casino_id, player_id);

COMMENT ON INDEX idx_mv_loyalty_balance_pk IS
  'Primary key index for drift detection materialized view. Enables fast joins with player_loyalty.';

-- ============================================================================
-- STEP 8: Validation query (smoke test - expect 0 rows on greenfield)
-- ============================================================================

-- Drift detection query (should return 0 rows on greenfield schema)
-- Run this after migration to verify no drift in empty database:
--
-- SELECT
--   pl.casino_id,
--   pl.player_id,
--   pl.current_balance AS cached_balance,
--   COALESCE(mv.ledger_balance, 0) AS ledger_balance,
--   (pl.current_balance - COALESCE(mv.ledger_balance, 0)) AS drift
-- FROM player_loyalty pl
-- LEFT JOIN mv_loyalty_balance_reconciliation mv
--   ON pl.casino_id = mv.casino_id
--   AND pl.player_id = mv.player_id
-- WHERE pl.current_balance != COALESCE(mv.ledger_balance, 0);
--
-- Expected result: 0 rows

-- ============================================================================
-- Migration complete
-- ============================================================================
-- Next: WS2 - Database RPCs (rpc_accrue_on_close, rpc_redeem, etc.)
-- ============================================================================

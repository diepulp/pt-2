-- =====================================================
-- Migration: ADR-029 Timeline Indexes (Phase 1)
-- Created: 2026-01-21 14:55:03
-- ADR Reference: docs/80-adrs/ADR-029-player-360-interaction-event-taxonomy.md
-- EXEC-SPEC: docs/20-architecture/specs/ADR-029/EXEC-SPEC-029.md
-- Workstream: WS1-D
-- Purpose: Create timeline indexes for Phase 1 source tables only
-- =====================================================
-- Phase 1 sources (10 event types):
--   - visit (visit_start, visit_end)
--   - rating_slip (rating_start, rating_close)
--   - player_financial_transaction (cash_in, cash_out)
--   - loyalty_ledger (points_earned, points_redeemed)
--   - mtl_entry (mtl_recorded)
--
-- Target: < 500ms latency for timeline query with 1 year of data (~500 events/player)
--
-- Note: CONCURRENTLY removed for Supabase migration compatibility.
-- For production deployments with large tables, consider creating indexes
-- manually with CONCURRENTLY via psql to avoid locking.
--
-- Phase 2 indexes (deferred per EXEC-SPEC-029 WS1-D):
--   - pit_cash_observation, promo_coupon, player_note, player_tag
-- =====================================================

-- ============================================================================
-- Visit timeline index (visit_start, visit_end events)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_visit_player_timeline
  ON visit (casino_id, player_id, started_at DESC, id DESC);

-- ============================================================================
-- Rating slip timeline index (rating_start, rating_close events)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rating_slip_player_timeline
  ON rating_slip (casino_id, start_time DESC, id DESC);

-- ============================================================================
-- Rating slip visit join index (for filtered timeline via visit_id)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rating_slip_visit_join
  ON rating_slip (casino_id, visit_id);

-- ============================================================================
-- Financial transaction timeline index (cash_in, cash_out events)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_financial_player_timeline
  ON player_financial_transaction (casino_id, player_id, created_at DESC, id DESC);

-- ============================================================================
-- Loyalty ledger timeline index (points_earned, points_redeemed events)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_loyalty_player_timeline
  ON loyalty_ledger (casino_id, player_id, created_at DESC, id DESC);

-- ============================================================================
-- MTL entry timeline index (mtl_recorded events)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_mtl_player_timeline
  ON mtl_entry (casino_id, patron_uuid, occurred_at DESC, id DESC);

-- ============================================================================
-- Phase 2 indexes (create when Phase 2 UNION blocks ship)
-- ============================================================================
-- The following indexes are deferred until Phase 2 to prevent churn on unused tables:
--
-- CREATE INDEX IF NOT EXISTS idx_pit_obs_player_timeline
--   ON pit_cash_observation (casino_id, player_id, observed_at DESC, id DESC);
--
-- CREATE INDEX IF NOT EXISTS idx_promo_coupon_player_timeline
--   ON promo_coupon (casino_id, player_id, created_at DESC, id DESC);
--
-- CREATE INDEX IF NOT EXISTS idx_player_note_timeline
--   ON player_note (casino_id, player_id, created_at DESC, id DESC);
--
-- CREATE INDEX IF NOT EXISTS idx_player_tag_timeline
--   ON player_tag (casino_id, player_id, created_at DESC, id DESC);
-- ============================================================================

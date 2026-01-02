-- ============================================================================
-- Migration: Fix house_edge unit mismatch (decimal → percentage)
-- Created: 2025-12-31
-- Issue: ISSUE-47B1DFF1 - Loyalty accrual calculating 0 points
-- ============================================================================
-- ROOT CAUSE: Seed data stored house_edge as decimal (0.005 = 0.5%) but
--             calculate_theo_from_snapshot divides by 100 expecting percentage.
--
-- Formula: theo = avg_bet * (house_edge/100) * duration_hours * decisions_per_hour
-- Bug: 0.005/100 = 0.00005 → theo too small → rounds to 0 points
-- Fix: Convert 0.005 → 0.5 so 0.5/100 = 0.005 (correct!)
--
-- CHANGES:
-- 1. Update game_settings to use percentage format (0.005 → 0.5)
-- 2. Update existing rating_slip policy_snapshot values
-- 3. Delete incorrect loyalty_ledger entry and recalculate
-- 4. Reconcile player_loyalty balance
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Fix game_settings values for demo casinos
-- Convert decimal format (0.005) to percentage format (0.5)
-- Only affects values < 1 which are clearly decimals
-- ============================================================================

UPDATE game_settings
SET house_edge = house_edge * 100
WHERE house_edge < 0.1  -- Catch decimal values like 0.005, 0.025, 0.053, 0.011, 0.010, 0.004
  AND casino_id IN (
    'ca000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000002'
  );

-- Log the update
DO $$
DECLARE
  v_updated_count int;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % game_settings rows to percentage format', v_updated_count;
END;
$$;

-- ============================================================================
-- STEP 2: Fix rating_slip policy_snapshot values
-- Update snapshots that have decimal house_edge to percentage format
-- ============================================================================

UPDATE rating_slip
SET policy_snapshot = jsonb_set(
  policy_snapshot,
  '{loyalty,house_edge}',
  to_jsonb(
    (policy_snapshot->'loyalty'->>'house_edge')::numeric * 100
  )
)
WHERE policy_snapshot->'loyalty'->>'house_edge' IS NOT NULL
  AND (policy_snapshot->'loyalty'->>'house_edge')::numeric < 0.1;

-- Log the update
DO $$
DECLARE
  v_updated_count int;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % rating_slip policy_snapshots to percentage format', v_updated_count;
END;
$$;

-- ============================================================================
-- STEP 3: Delete incorrect loyalty_ledger entries with 0 points
-- These will be recalculated when the slip is closed again or via backfill
-- ============================================================================

-- Store affected entries for audit
CREATE TEMP TABLE deleted_ledger_entries AS
SELECT
  ll.id,
  ll.player_id,
  ll.casino_id,
  ll.rating_slip_id,
  ll.points_delta,
  ll.metadata
FROM loyalty_ledger ll
WHERE ll.points_delta = 0
  AND ll.reason = 'base_accrual'
  AND ll.metadata->'calc'->>'base_points' = '0';

-- Delete the incorrect entries
DELETE FROM loyalty_ledger
WHERE points_delta = 0
  AND reason = 'base_accrual'
  AND metadata->'calc'->>'base_points' = '0';

-- Log deleted count
DO $$
DECLARE
  v_deleted_count int;
BEGIN
  SELECT COUNT(*) INTO v_deleted_count FROM deleted_ledger_entries;
  RAISE NOTICE 'Deleted % incorrect loyalty_ledger entries with 0 points', v_deleted_count;
END;
$$;

-- ============================================================================
-- STEP 4: Recalculate and insert correct loyalty_ledger entries
-- For all closed rating slips that now have no base_accrual entry
-- ============================================================================

-- Insert correct entries using the fixed policy_snapshot values
INSERT INTO loyalty_ledger (
  casino_id,
  player_id,
  rating_slip_id,
  visit_id,
  staff_id,
  points_delta,
  reason,
  idempotency_key,
  source_kind,
  source_id,
  metadata
)
SELECT
  rs.casino_id,
  v.player_id,
  rs.id,
  rs.visit_id,
  NULL,  -- No staff_id for migration backfill
  -- Calculate points using correct formula
  GREATEST(0, ROUND(
    COALESCE(rs.final_average_bet, rs.average_bet, 0)
    * (COALESCE((rs.policy_snapshot->'loyalty'->>'house_edge')::numeric, 1.5) / 100.0)
    * (COALESCE(rs.final_duration_seconds, rs.duration_seconds, 0) / 3600.0)
    * COALESCE((rs.policy_snapshot->'loyalty'->>'decisions_per_hour')::numeric, 60)
    * COALESCE((rs.policy_snapshot->'loyalty'->>'points_conversion_rate')::numeric, 10)
  ))::int,
  'base_accrual',
  rs.id,  -- Use slip ID as idempotency key
  'rating_slip',
  rs.id,
  jsonb_build_object(
    'calc', jsonb_build_object(
      'theo', COALESCE(rs.final_average_bet, rs.average_bet, 0)
        * (COALESCE((rs.policy_snapshot->'loyalty'->>'house_edge')::numeric, 1.5) / 100.0)
        * (COALESCE(rs.final_duration_seconds, rs.duration_seconds, 0) / 3600.0)
        * COALESCE((rs.policy_snapshot->'loyalty'->>'decisions_per_hour')::numeric, 60),
      'base_points', GREATEST(0, ROUND(
        COALESCE(rs.final_average_bet, rs.average_bet, 0)
        * (COALESCE((rs.policy_snapshot->'loyalty'->>'house_edge')::numeric, 1.5) / 100.0)
        * (COALESCE(rs.final_duration_seconds, rs.duration_seconds, 0) / 3600.0)
        * COALESCE((rs.policy_snapshot->'loyalty'->>'decisions_per_hour')::numeric, 60)
        * COALESCE((rs.policy_snapshot->'loyalty'->>'points_conversion_rate')::numeric, 10)
      ))::int,
      'conversion_rate', COALESCE((rs.policy_snapshot->'loyalty'->>'points_conversion_rate')::numeric, 10),
      'avg_bet', COALESCE(rs.final_average_bet, rs.average_bet),
      'house_edge', COALESCE((rs.policy_snapshot->'loyalty'->>'house_edge')::numeric, 1.5),
      'duration_seconds', COALESCE(rs.final_duration_seconds, rs.duration_seconds, 0),
      'decisions_per_hour', COALESCE((rs.policy_snapshot->'loyalty'->>'decisions_per_hour')::numeric, 60)
    ),
    'policy', jsonb_build_object(
      'snapshot_ref', 'rating_slip.policy_snapshot.loyalty',
      'version', rs.policy_snapshot->'loyalty'->>'policy_version'
    ),
    'migration', 'fix_house_edge_unit_mismatch'
  )
FROM rating_slip rs
JOIN visit v ON v.id = rs.visit_id
WHERE rs.status = 'closed'
  AND rs.accrual_kind = 'loyalty'
  AND v.player_id IS NOT NULL  -- Skip ghost visits
  AND NOT EXISTS (
    SELECT 1 FROM loyalty_ledger ll
    WHERE ll.rating_slip_id = rs.id
      AND ll.reason = 'base_accrual'
  )
ON CONFLICT (casino_id, rating_slip_id) WHERE reason = 'base_accrual'
DO NOTHING;

-- Log inserted count
DO $$
DECLARE
  v_inserted_count int;
BEGIN
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RAISE NOTICE 'Inserted % correct loyalty_ledger entries', v_inserted_count;
END;
$$;

-- ============================================================================
-- STEP 5: Reconcile player_loyalty balances
-- Recalculate from ledger sum to fix any drift
-- ============================================================================

UPDATE player_loyalty pl
SET
  current_balance = COALESCE(ledger_sum.total, 0),
  updated_at = now()
FROM (
  SELECT
    player_id,
    casino_id,
    SUM(points_delta) as total
  FROM loyalty_ledger
  GROUP BY player_id, casino_id
) ledger_sum
WHERE pl.player_id = ledger_sum.player_id
  AND pl.casino_id = ledger_sum.casino_id
  AND pl.current_balance != COALESCE(ledger_sum.total, 0);

-- Log reconciled count
DO $$
DECLARE
  v_reconciled_count int;
BEGIN
  GET DIAGNOSTICS v_reconciled_count = ROW_COUNT;
  RAISE NOTICE 'Reconciled % player_loyalty balances', v_reconciled_count;
END;
$$;

-- ============================================================================
-- STEP 6: Verification query (for manual check after migration)
-- ============================================================================

-- Cleanup temp table
DROP TABLE IF EXISTS deleted_ledger_entries;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run manually after migration)
-- ============================================================================
--
-- Check game_settings values are now percentages:
-- SELECT casino_id, game_type, house_edge FROM game_settings
-- WHERE casino_id LIKE 'ca000000%' ORDER BY casino_id, game_type;
--
-- Check Vlad's balance is now > 0:
-- SELECT p.first_name, pl.current_balance
-- FROM player p
-- JOIN player_loyalty pl ON pl.player_id = p.id
-- WHERE p.first_name ILIKE '%vlad%';
--
-- Check loyalty_ledger entries have correct points:
-- SELECT ll.rating_slip_id, ll.points_delta, ll.metadata->'calc'
-- FROM loyalty_ledger ll
-- WHERE ll.metadata->>'migration' = 'fix_house_edge_unit_mismatch';
--

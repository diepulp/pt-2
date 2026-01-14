-- =====================================================
-- Migration: chipset_total_cents helper function
-- Created: 2026-01-14
-- Workstream: WS3 - ADDENDUM-TBL-RUNDOWN
-- Purpose: SQL helper to aggregate chipset JSONB to total cents
-- =====================================================
--
-- This function computes the total value in cents from a chipset JSONB object.
-- The chipset format is: {"denomination": count, ...}
-- where denomination is in dollars and count is the number of chips.
--
-- Example:
--   Input:  {"1": 10, "5": 20, "25": 4}
--   Calculation: (1*10 + 5*20 + 25*4) * 100 = 21000 cents
--   Output: 21000
--
-- Used by: rpc_shift_table_metrics for computing snapshot bankroll totals
-- =====================================================

BEGIN;

-- =====================================================
-- Create chipset_total_cents function
-- =====================================================

CREATE OR REPLACE FUNCTION public.chipset_total_cents(p_chipset jsonb)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- Handle NULL or empty input
  -- Sum (denomination * count) for all entries, then convert to cents (* 100)
  SELECT COALESCE(
    (
      SELECT SUM((key::numeric) * (value::numeric) * 100)::bigint
      FROM jsonb_each_text(p_chipset)
      WHERE p_chipset IS NOT NULL
        AND jsonb_typeof(p_chipset) = 'object'
        AND p_chipset != '{}'::jsonb
    ),
    0
  )::bigint
$$;

-- =====================================================
-- Comments and documentation
-- =====================================================

COMMENT ON FUNCTION chipset_total_cents(jsonb) IS
  'Computes total value in cents from a chipset JSONB object. '
  'Chipset format: {"denomination_dollars": chip_count, ...}. '
  'Returns 0 for NULL or empty input.';

-- =====================================================
-- Unit test cases (in comments for documentation)
-- =====================================================

/*
  Unit Test Cases:

  -- Test 1: Standard chipset
  SELECT chipset_total_cents('{"1": 10, "5": 20, "25": 4}'::jsonb);
  -- Expected: 21000 (= (1*10 + 5*20 + 25*4) * 100 = 210 * 100)

  -- Test 2: NULL input
  SELECT chipset_total_cents(NULL);
  -- Expected: 0

  -- Test 3: Empty object
  SELECT chipset_total_cents('{}'::jsonb);
  -- Expected: 0

  -- Test 4: Single denomination
  SELECT chipset_total_cents('{"100": 5}'::jsonb);
  -- Expected: 50000 (= 100 * 5 * 100)

  -- Test 5: Fractional denominations (e.g., $0.50 chips)
  SELECT chipset_total_cents('{"0.5": 20, "1": 10}'::jsonb);
  -- Expected: 2000 (= (0.5*20 + 1*10) * 100 = 20 * 100)

  -- Test 6: Large chipset
  SELECT chipset_total_cents('{"1": 100, "5": 200, "25": 50, "100": 20, "500": 5}'::jsonb);
  -- Expected: 538500 (= (100 + 1000 + 1250 + 2000 + 2500) * 100 = 6850 * 100... wait let me recalc)
  -- = (1*100 + 5*200 + 25*50 + 100*20 + 500*5) * 100
  -- = (100 + 1000 + 1250 + 2000 + 2500) * 100
  -- = 6850 * 100 = 685000
  -- Expected: 685000

  -- Test 7: Zero counts
  SELECT chipset_total_cents('{"1": 0, "5": 0}'::jsonb);
  -- Expected: 0
*/

-- =====================================================
-- Grant permissions
-- =====================================================

-- Function is IMMUTABLE so can be used in indexes and by any role
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION chipset_total_cents(jsonb) TO anon;

-- =====================================================
-- Notify PostgREST to reload schema
-- =====================================================

NOTIFY pgrst, 'reload schema';

COMMIT;

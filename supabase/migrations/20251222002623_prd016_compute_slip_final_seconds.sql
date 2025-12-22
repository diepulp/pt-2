-- Migration: PRD-016 Rating Slip Duration Computation Function
-- Purpose: Single source of truth for slip duration calculation with pause handling
--
-- Creates compute_slip_final_seconds(p_slip_id UUID) function that:
-- - Returns NULL for open slips (end_time IS NULL)
-- - Computes: (end_time - start_time) - SUM(pause_intervals) in seconds
-- - Handles edge cases:
--   * Paused → moved: Open pause auto-closed at slip end_time
--   * Paused → closed: Same handling
--   * Multiple pauses: Sum all pause intervals
--   * Missing pause end_time: Use slip.end_time as failsafe
--
-- SECURITY: SECURITY INVOKER (ADR-015 compliance) - respects RLS
--
-- Usage Examples:
-- - Get duration for closed slip: SELECT compute_slip_final_seconds('slip-uuid-here');
-- - Update slip on close: UPDATE rating_slip SET final_duration_seconds = compute_slip_final_seconds(id) WHERE id = 'slip-uuid';
-- - Aggregate visit duration: SELECT SUM(compute_slip_final_seconds(id)) FROM rating_slip WHERE visit_id = 'visit-uuid';

-- ============================================================================
-- compute_slip_final_seconds: Authoritative duration calculator
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_slip_final_seconds(p_slip_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER  -- CRITICAL: Respects RLS, required by ADR-015
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_total_elapsed_seconds INTEGER;
  v_total_pause_seconds INTEGER;
BEGIN
  -- Fetch slip time boundaries
  SELECT start_time, end_time
  INTO v_start_time, v_end_time
  FROM rating_slip
  WHERE id = p_slip_id;

  -- If slip not found or still open, return NULL
  IF v_start_time IS NULL OR v_end_time IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate total elapsed time in seconds
  v_total_elapsed_seconds := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER;

  -- Calculate total pause time
  -- For pauses with NULL ended_at, use slip.end_time as failsafe (pause was never explicitly ended)
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      COALESCE(ended_at, v_end_time) - started_at
    ))::INTEGER
  ), 0)
  INTO v_total_pause_seconds
  FROM rating_slip_pause
  WHERE rating_slip_id = p_slip_id
    AND started_at < v_end_time;  -- Only count pauses that started before slip ended

  -- Return net play time (elapsed - paused)
  RETURN GREATEST(0, v_total_elapsed_seconds - v_total_pause_seconds);
END;
$$;

COMMENT ON FUNCTION compute_slip_final_seconds(UUID) IS
'Computes authoritative play duration in seconds for a rating slip.
Returns NULL for open slips (end_time IS NULL).
Calculation: (end_time - start_time) - SUM(pause_intervals).
Handles edge cases: open pauses auto-closed at slip end_time, multiple pauses summed.
SECURITY INVOKER: respects RLS policies (ADR-015).';

-- ============================================================================
-- Verification Examples (for manual validation)
-- ============================================================================

-- Test on closed slip with no pauses:
-- SELECT id, start_time, end_time, compute_slip_final_seconds(id) AS duration_seconds
-- FROM rating_slip WHERE status = 'closed' AND id IN (
--   SELECT rating_slip_id FROM rating_slip_pause GROUP BY rating_slip_id HAVING COUNT(*) = 0
-- ) LIMIT 5;

-- Test on closed slip with pauses:
-- SELECT rs.id, rs.start_time, rs.end_time,
--   COUNT(rsp.id) AS pause_count,
--   compute_slip_final_seconds(rs.id) AS duration_seconds
-- FROM rating_slip rs
-- LEFT JOIN rating_slip_pause rsp ON rsp.rating_slip_id = rs.id
-- WHERE rs.status = 'closed'
-- GROUP BY rs.id, rs.start_time, rs.end_time
-- HAVING COUNT(rsp.id) > 0
-- LIMIT 5;

-- Test that open slips return NULL:
-- SELECT id, status, compute_slip_final_seconds(id) AS duration_seconds
-- FROM rating_slip WHERE status IN ('open', 'paused') LIMIT 5;

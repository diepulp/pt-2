-- Phase C.0: Validation Infrastructure Setup
-- Creates alert tracking, validation functions, and automated monitoring
-- Part of Phase C: MTL Patron UUID Migration

BEGIN;

-- =============================================================================
-- Alert Tracking Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_validation_alerts (
  id bigserial PRIMARY KEY,
  check_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_validation_alerts IS
'Tracks schema validation alerts for migration monitoring. Part of Phase C validation infrastructure.';

CREATE INDEX idx_validation_alerts_created
  ON schema_validation_alerts(created_at DESC);

CREATE INDEX idx_validation_alerts_check_name
  ON schema_validation_alerts(check_name, created_at DESC);

-- =============================================================================
-- Hourly Validation Function
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_mtl_patron_backfill()
RETURNS void AS $$
DECLARE
  divergence_count int;
  null_count int;
  patron_uuid_exists boolean;
BEGIN
  -- Check if patron_uuid column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'mtl_entry'
      AND column_name = 'patron_uuid'
  ) INTO patron_uuid_exists;

  -- Skip validation if patron_uuid doesn't exist yet (pre-Phase C.1)
  IF NOT patron_uuid_exists THEN
    RETURN;
  END IF;

  -- Check for NULL patron_uuid where patron_id exists
  EXECUTE 'SELECT COUNT(*) FROM mtl_entry WHERE patron_uuid IS NULL AND patron_id IS NOT NULL'
  INTO null_count;

  -- Check for divergence between patron_id and patron_uuid
  EXECUTE 'SELECT COUNT(*) FROM mtl_entry WHERE patron_id IS NOT NULL AND patron_uuid IS NOT NULL AND patron_id::uuid <> patron_uuid'
  INTO divergence_count;

  -- Log alert if issues found
  IF null_count > 0 OR divergence_count > 0 THEN
    INSERT INTO schema_validation_alerts (
      check_name, severity, message, details
    ) VALUES (
      'mtl_patron_backfill',
      'critical',
      'Patron UUID backfill divergence detected',
      jsonb_build_object(
        'null_count', null_count,
        'divergence_count', divergence_count,
        'timestamp', NOW()
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_mtl_patron_backfill() IS
'Validates patron_uuid backfill consistency. Logs critical alerts for NULL values or divergence.';

-- =============================================================================
-- Cutover Gate Function
-- =============================================================================

CREATE OR REPLACE FUNCTION check_phase_c1_cutover_gate()
RETURNS TABLE(
  gate_name text,
  status text,
  failing_count bigint,
  can_proceed boolean
) AS $$
DECLARE
  patron_uuid_exists boolean;
BEGIN
  -- Check if patron_uuid column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'mtl_entry'
      AND column_name = 'patron_uuid'
  ) INTO patron_uuid_exists;

  -- If patron_uuid doesn't exist, return NOT READY status
  IF NOT patron_uuid_exists THEN
    RETURN QUERY
    SELECT
      'patron_uuid_column'::text AS gate_name,
      'NOT_READY'::text AS status,
      1::bigint AS failing_count,
      false AS can_proceed
    UNION ALL
    SELECT
      'OVERALL_DECISION'::text,
      'NO-GO'::text,
      1::bigint,
      false;
    RETURN;
  END IF;

  -- Run full validation if column exists
  RETURN QUERY
  WITH validation_results AS (
    -- Gate 1: Divergence check
    SELECT 'divergence_check'::text AS gate, COUNT(*) AS failures
    FROM mtl_entry
    WHERE patron_id IS NOT NULL
      AND patron_uuid IS NOT NULL
      AND patron_id::uuid <> patron_uuid

    UNION ALL

    -- Gate 2: Backfill completeness
    SELECT 'backfill_completeness'::text, COUNT(*)
    FROM mtl_entry
    WHERE patron_uuid IS NULL AND patron_id IS NOT NULL

    UNION ALL

    -- Gate 3: Orphaned references
    SELECT 'orphaned_references'::text, COUNT(*)
    FROM mtl_entry e
    LEFT JOIN player p ON e.patron_uuid = p.id
    WHERE e.patron_uuid IS NOT NULL AND p.id IS NULL

    UNION ALL

    -- Gate 4: Recent alert history
    SELECT 'alert_history'::text, COUNT(*)
    FROM schema_validation_alerts
    WHERE check_name = 'mtl_patron_backfill'
      AND severity = 'critical'
      AND created_at > NOW() - INTERVAL '48 hours'
  ),
  gate_results AS (
    SELECT
      gate AS gate_name,
      CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
      failures AS failing_count,
      (failures = 0) AS can_proceed
    FROM validation_results
  )
  SELECT gr.gate_name, gr.status, gr.failing_count, gr.can_proceed
  FROM gate_results gr

  UNION ALL

  -- Overall decision
  SELECT
    'OVERALL_DECISION'::text AS gate_name,
    CASE WHEN MIN(gr.can_proceed::int) = 1 THEN 'GO' ELSE 'NO-GO' END::text AS status,
    SUM(gr.failing_count)::bigint AS failing_count,
    (MIN(gr.can_proceed::int) = 1) AS can_proceed
  FROM gate_results gr;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_phase_c1_cutover_gate() IS
'Automated cutover gate for Phase C.1. Returns GO only if all validation gates pass.';

-- =============================================================================
-- Schedule Hourly Validation (pg_cron)
-- =============================================================================

-- Note: pg_cron must be installed and enabled
-- Enable extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing scheduled job for this check
SELECT cron.unschedule('mtl-patron-backfill-validation')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mtl-patron-backfill-validation'
);

-- Schedule new hourly validation job
SELECT cron.schedule(
  'mtl-patron-backfill-validation',
  '0 * * * *',  -- Every hour at minute 0
  $$SELECT validate_mtl_patron_backfill()$$
);

COMMENT ON EXTENSION pg_cron IS
'Cron-based job scheduler for PostgreSQL. Used for hourly validation monitoring.';

-- =============================================================================
-- Validation Script for Phase C.0
-- =============================================================================

-- Test validation function (should complete without errors)
DO $$
BEGIN
  -- Test function execution (won't log alert on empty table)
  PERFORM validate_mtl_patron_backfill();

  -- Test cutover gate function
  PERFORM * FROM check_phase_c1_cutover_gate();

  RAISE NOTICE 'Phase C.0 validation infrastructure installed successfully';
END $$;

COMMIT;

-- =============================================================================
-- Post-Migration Verification
-- =============================================================================

-- Verify table exists
SELECT
  table_name,
  (SELECT COUNT(*) FROM schema_validation_alerts) as alert_count
FROM information_schema.tables
WHERE table_name = 'schema_validation_alerts';

-- Verify functions exist
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN ('validate_mtl_patron_backfill', 'check_phase_c1_cutover_gate')
ORDER BY routine_name;

-- Verify pg_cron job scheduled
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname = 'mtl-patron-backfill-validation';

-- Test cutover gate (should show all PASS)
SELECT * FROM check_phase_c1_cutover_gate();

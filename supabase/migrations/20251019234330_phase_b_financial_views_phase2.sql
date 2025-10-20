-- =====================================================================
-- Phase B (Column Removal)
-- Drop legacy financial columns from ratingslip after consumers migrate
-- to PlayerFinancialService views.
-- =====================================================================

BEGIN;

-- Safety check: ensure compatibility view exists before dropping columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'ratingslip_with_financials'
  ) THEN
    RAISE EXCEPTION 'ratingslip_with_financials view missing – aborting column removal';
  END IF;
END;
$$;

-- Rebuild compatibility view to explicitly remove any column-level dependencies
-- on the financial fields we're about to drop. This ensures the view depends
-- only on non-financial ratingslip columns + aggregated financial data.
CREATE OR REPLACE VIEW ratingslip_with_financials WITH (security_barrier = true) AS
SELECT
  r.id,
  r.average_bet,
  r.seat_number,
  r.start_time,
  r.end_time,
  r.game_settings,
  r.gaming_table_id,
  r.visit_id,
  -- Financial fields sourced from aggregates (NOT from ratingslip columns)
  vfs.total_cash_in AS cash_in,
  vfs.total_chips_brought AS chips_brought,
  vfs.total_chips_taken AS chips_taken,
  vfs.transaction_count AS financial_transaction_count,
  vfs.last_transaction_at
FROM ratingslip r
LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;

COMMENT ON VIEW ratingslip_with_financials IS
  'Compatibility view providing legacy RatingSlip financial fields sourced from PlayerFinancialService aggregates.';

-- Safety check: confirm no dependent views/materialized views still touch legacy columns.
-- This query explicitly checks for view dependencies by traversing:
-- pg_attribute (column) → pg_depend (dependency) → pg_rewrite (view rule) → pg_class (view object)
DO $$
DECLARE
  orphan_count INTEGER;
  dependent_views TEXT;
BEGIN
  SELECT
    COUNT(DISTINCT c.relname),
    STRING_AGG(DISTINCT c.relname, ', ')
  INTO orphan_count, dependent_views
  FROM pg_attribute a
  JOIN pg_depend d ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
  JOIN pg_rewrite rw ON rw.oid = d.objid
  JOIN pg_class c ON c.oid = rw.ev_class
  WHERE a.attrelid = 'ratingslip'::regclass
    AND a.attname IN ('cash_in', 'chips_brought', 'chips_taken')
    AND a.attisdropped = false
    AND d.deptype = 'n'
    AND c.relkind IN ('v', 'm')  -- views and materialized views only
    AND c.relname != 'ratingslip_with_financials';  -- Exclude our compat view (we just rebuilt it)

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Legacy ratingslip financial columns still referenced by % view(s): %',
      orphan_count, dependent_views;
  END IF;
END;
$$;

ALTER TABLE ratingslip
  DROP COLUMN IF EXISTS cash_in,
  DROP COLUMN IF EXISTS chips_brought,
  DROP COLUMN IF EXISTS chips_taken;

-- Force PostgREST schema cache reload to avoid stale column references in API layer.
-- CRITICAL: Without this, PostgREST may continue serving old ratingslip shape with
-- dropped columns, causing 500 errors or incorrect type inference.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- Post-Execution Checklist
-- 1. PostgREST schema cache: ✅ NOTIFY sent automatically (line 86)
-- 2. Re-run `.validation/queries.sql` harness and capture new EXPLAIN output.
-- 3. Execute `.validation/rls_visit_read_contract.sql` to confirm security posture.
-- 4. Run `npm run db:types-local` to regenerate TypeScript types.
-- 5. Attach consumer inventory (logs or grep report) to the PR documenting zero
--    references to the removed columns.
-- 6. Verify API responses use ratingslip_with_financials view (not raw table).
-- =====================================================================

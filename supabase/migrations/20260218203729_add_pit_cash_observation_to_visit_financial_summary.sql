-- Migration: Include pit_cash_observation in visit_financial_summary
-- Purpose: Chips-taken observations now persist on Save (not just Close Session).
--          The view must include pit_cash_observation amounts in total_out so
--          server-side totals reflect mid-session chips-taken entries.
-- Issue: CHIPS-TAKEN-NOT-PERSISTED
-- Unit note: player_financial_transaction.amount is in cents,
--            pit_cash_observation.amount is in dollars (per ADR-031).
--            Observations are converted to cents (× 100) before aggregation.

BEGIN;

-- DROP required: CREATE OR REPLACE cannot change column types (numeric→bigint)
-- or rename columns (transaction_count→event_count).
-- No dependents reference this view (checked: no foreign keys, no materialized views).
DROP VIEW IF EXISTS public.visit_financial_summary;

CREATE VIEW public.visit_financial_summary AS
WITH combined AS (
  SELECT
    pft.visit_id,
    pft.casino_id,
    pft.direction::text AS direction,
    pft.amount::bigint  AS amount,   -- cents
    pft.created_at
  FROM public.player_financial_transaction pft

  UNION ALL

  SELECT
    pco.visit_id,
    pco.casino_id,
    'out'::text AS direction,
    ROUND(pco.amount * 100)::bigint AS amount, -- dollars -> cents, rounded
    pco.created_at
  FROM public.pit_cash_observation pco
)
SELECT
  c.visit_id,
  c.casino_id,
  COALESCE(SUM(CASE WHEN c.direction = 'in'  THEN c.amount END), 0)::bigint AS total_in,
  COALESCE(SUM(CASE WHEN c.direction = 'out' THEN c.amount END), 0)::bigint AS total_out,
  (
    COALESCE(SUM(CASE WHEN c.direction = 'in'  THEN c.amount END), 0)
    -
    COALESCE(SUM(CASE WHEN c.direction = 'out' THEN c.amount END), 0)
  )::bigint AS net_amount,
  COUNT(*)::integer AS event_count,
  MIN(c.created_at)::timestamptz AS first_transaction_at,
  MAX(c.created_at)::timestamptz AS last_transaction_at
FROM combined c
GROUP BY c.visit_id, c.casino_id;

ALTER VIEW public.visit_financial_summary
SET (security_invoker = true);

GRANT SELECT ON public.visit_financial_summary TO authenticated;
GRANT SELECT ON public.visit_financial_summary TO service_role;

COMMENT ON VIEW public.visit_financial_summary IS
  'Aggregated financial summary per visit. Combines player_financial_transaction (authoritative ledger, cents) and pit_cash_observation (operational cash-out observations, dollars converted to cents). Uses SECURITY INVOKER to enforce RLS.';

COMMENT ON COLUMN public.visit_financial_summary.total_in IS
  'Total amount IN in cents (from player_financial_transaction).';
COMMENT ON COLUMN public.visit_financial_summary.total_out IS
  'Total amount OUT in cents (from player_financial_transaction + pit_cash_observation converted from dollars).';
COMMENT ON COLUMN public.visit_financial_summary.net_amount IS
  'Net amount in cents (total_in - total_out).';
COMMENT ON COLUMN public.visit_financial_summary.event_count IS
  'Count of combined financial events (transactions + observations).';

COMMIT;

NOTIFY pgrst, 'reload schema';

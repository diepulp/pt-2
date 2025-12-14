-- Migration: Add visit_financial_summary view
-- Description: Creates a view that aggregates financial transactions by visit
-- Issue: PlayerFinancialService.getVisitSummary() requires this view but it was never created
-- Created: 2025-12-13

-- ============================================================================
-- visit_financial_summary - Aggregated financial data per visit
-- ============================================================================
-- This view provides a summary of all financial transactions for a visit,
-- including total in (buy-ins), total out (chips taken), net position,
-- and transaction count with timestamps.

CREATE OR REPLACE VIEW visit_financial_summary AS
SELECT
  pft.visit_id,
  pft.casino_id,
  COALESCE(SUM(CASE WHEN pft.direction = 'in' THEN pft.amount ELSE 0 END), 0)::numeric AS total_in,
  COALESCE(SUM(CASE WHEN pft.direction = 'out' THEN pft.amount ELSE 0 END), 0)::numeric AS total_out,
  COALESCE(
    SUM(CASE WHEN pft.direction = 'in' THEN pft.amount ELSE -pft.amount END),
    0
  )::numeric AS net_amount,
  COUNT(*)::integer AS transaction_count,
  MIN(pft.created_at)::timestamptz AS first_transaction_at,
  MAX(pft.created_at)::timestamptz AS last_transaction_at
FROM player_financial_transaction pft
GROUP BY pft.visit_id, pft.casino_id;

-- Add comment explaining the view
COMMENT ON VIEW visit_financial_summary IS
  'Aggregated financial summary per visit. Used by PlayerFinancialService.getVisitSummary() for rating slip modal display.';

-- Grant access to authenticated users (RLS on underlying table still applies)
GRANT SELECT ON visit_financial_summary TO authenticated;
GRANT SELECT ON visit_financial_summary TO service_role;

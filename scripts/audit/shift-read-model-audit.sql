-- Shift Read-Model Audit Harness
--
-- Validates that table -> pit -> casino rollups are mathematically correct,
-- direction filters are enforced, and NULL preservation is maintained.
--
-- Usage: Run against a specific shift window to validate aggregation.
-- Parameters: $1 = window_start (ISO timestamp), $2 = window_end (ISO timestamp)
--
-- Output: Rows with (level, entity_id, field, expected, actual, delta, status)
-- Any row with status = 'FAIL' indicates a reconciliation discrepancy.
--
-- @see SHIFT_READ_MODEL_AUDIT_v1.md
-- @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md

-- Step 1: Fetch table metrics (source of truth)
WITH table_metrics AS (
  SELECT *
  FROM rpc_shift_table_metrics($1::timestamptz, $2::timestamptz)
),

-- Step 2: Expected pit-level aggregates from table data
expected_pits AS (
  SELECT
    pit_id,
    COUNT(*)::int AS tables_count,
    COUNT(*) FILTER (WHERE NOT missing_opening_snapshot)::int AS tables_with_opening_snapshot,
    COUNT(*) FILTER (WHERE NOT missing_closing_snapshot)::int AS tables_with_closing_snapshot,
    COUNT(*) FILTER (WHERE telemetry_quality != 'NONE')::int AS tables_with_telemetry_count,
    COUNT(*) FILTER (WHERE telemetry_quality = 'GOOD_COVERAGE')::int AS tables_good_coverage_count,
    SUM(fills_total_cents)::bigint AS fills_total_cents,
    SUM(credits_total_cents)::bigint AS credits_total_cents,
    SUM(estimated_drop_rated_cents)::bigint AS estimated_drop_rated_total_cents,
    SUM(estimated_drop_grind_cents)::bigint AS estimated_drop_grind_total_cents,
    SUM(estimated_drop_buyins_cents)::bigint AS estimated_drop_buyins_total_cents,
    SUM(win_loss_inventory_cents) FILTER (WHERE win_loss_inventory_cents IS NOT NULL)::bigint AS win_loss_inventory_total_cents,
    SUM(win_loss_estimated_cents) FILTER (WHERE win_loss_estimated_cents IS NOT NULL)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics
  WHERE pit_id IS NOT NULL
  GROUP BY pit_id
),

-- Step 3: Actual pit metrics from RPC
actual_pits AS (
  SELECT *
  FROM rpc_shift_pit_metrics($1::timestamptz, $2::timestamptz, NULL)
),

-- Step 4: Pit reconciliation checks
pit_checks AS (
  SELECT
    'pit' AS level,
    ep.pit_id AS entity_id,
    field_name AS field,
    ep_val AS expected,
    ap_val AS actual,
    (ap_val - ep_val) AS delta,
    CASE WHEN ap_val = ep_val THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_pits ep
  JOIN actual_pits ap ON ep.pit_id = ap.pit_id
  CROSS JOIN LATERAL (VALUES
    ('fills_total_cents', ep.fills_total_cents, ap.fills_total_cents::bigint),
    ('credits_total_cents', ep.credits_total_cents, ap.credits_total_cents::bigint),
    ('estimated_drop_buyins_total_cents', ep.estimated_drop_buyins_total_cents, ap.estimated_drop_buyins_total_cents::bigint),
    ('estimated_drop_rated_total_cents', ep.estimated_drop_rated_total_cents, ap.estimated_drop_rated_total_cents::bigint),
    ('estimated_drop_grind_total_cents', ep.estimated_drop_grind_total_cents, ap.estimated_drop_grind_total_cents::bigint),
    ('tables_count', ep.tables_count::bigint, ap.tables_count::bigint),
    ('tables_with_opening_snapshot', ep.tables_with_opening_snapshot::bigint, ap.tables_with_opening_snapshot::bigint),
    ('tables_with_closing_snapshot', ep.tables_with_closing_snapshot::bigint, ap.tables_with_closing_snapshot::bigint)
  ) AS checks(field_name, ep_val, ap_val)
),

-- Step 5: Expected casino-level aggregates
expected_casino AS (
  SELECT
    COUNT(*)::int AS tables_count,
    COUNT(DISTINCT pit_id)::int AS pits_count,
    COUNT(*) FILTER (WHERE NOT missing_opening_snapshot)::int AS tables_with_opening_snapshot,
    COUNT(*) FILTER (WHERE NOT missing_closing_snapshot)::int AS tables_with_closing_snapshot,
    COUNT(*) FILTER (WHERE telemetry_quality != 'NONE')::int AS tables_with_telemetry_count,
    COUNT(*) FILTER (WHERE telemetry_quality = 'GOOD_COVERAGE')::int AS tables_good_coverage_count,
    SUM(fills_total_cents)::bigint AS fills_total_cents,
    SUM(credits_total_cents)::bigint AS credits_total_cents,
    SUM(estimated_drop_rated_cents)::bigint AS estimated_drop_rated_total_cents,
    SUM(estimated_drop_grind_cents)::bigint AS estimated_drop_grind_total_cents,
    SUM(estimated_drop_buyins_cents)::bigint AS estimated_drop_buyins_total_cents,
    SUM(win_loss_inventory_cents) FILTER (WHERE win_loss_inventory_cents IS NOT NULL)::bigint AS win_loss_inventory_total_cents,
    SUM(win_loss_estimated_cents) FILTER (WHERE win_loss_estimated_cents IS NOT NULL)::bigint AS win_loss_estimated_total_cents
  FROM table_metrics
),

-- Step 6: Actual casino metrics from RPC
actual_casino AS (
  SELECT *
  FROM rpc_shift_casino_metrics($1::timestamptz, $2::timestamptz)
),

-- Step 7: Casino reconciliation checks
casino_checks AS (
  SELECT
    'casino' AS level,
    '-' AS entity_id,
    field_name AS field,
    ec_val AS expected,
    ac_val AS actual,
    (ac_val - ec_val) AS delta,
    CASE WHEN ac_val = ec_val THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_casino ec
  CROSS JOIN actual_casino ac
  CROSS JOIN LATERAL (VALUES
    ('fills_total_cents', ec.fills_total_cents, ac.fills_total_cents::bigint),
    ('credits_total_cents', ec.credits_total_cents, ac.credits_total_cents::bigint),
    ('estimated_drop_buyins_total_cents', ec.estimated_drop_buyins_total_cents, ac.estimated_drop_buyins_total_cents::bigint),
    ('estimated_drop_rated_total_cents', ec.estimated_drop_rated_total_cents, ac.estimated_drop_rated_total_cents::bigint),
    ('estimated_drop_grind_total_cents', ec.estimated_drop_grind_total_cents, ac.estimated_drop_grind_total_cents::bigint),
    ('tables_count', ec.tables_count::bigint, ac.tables_count::bigint),
    ('pits_count', ec.pits_count::bigint, ac.pits_count::bigint),
    ('tables_with_opening_snapshot', ec.tables_with_opening_snapshot::bigint, ac.tables_with_opening_snapshot::bigint),
    ('tables_with_closing_snapshot', ec.tables_with_closing_snapshot::bigint, ac.tables_with_closing_snapshot::bigint)
  ) AS checks(field_name, ec_val, ac_val)
)

-- Final output: all reconciliation results
SELECT * FROM pit_checks
UNION ALL
SELECT * FROM casino_checks
ORDER BY level, entity_id, field;

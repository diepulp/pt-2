-- ADR-039 D4: Cross-context measurement views
-- Bounded context: Platform/Cross-Cutting
-- security_invoker=true: caller's RLS applies to all source tables (ADR-039 D4)

-- ============================================================
-- View 1: measurement_audit_event_correlation_v (BASE variant)
-- ADR-039 Artifact 2 — audit_log join blocked per Approval Condition 1
-- ============================================================
CREATE OR REPLACE VIEW measurement_audit_event_correlation_v
WITH (security_invoker = true)
AS
SELECT
  rs.id AS rating_slip_id,
  rs.casino_id,
  rs.visit_id,
  rs.status AS slip_status,
  rs.start_time, rs.end_time,
  rs.duration_seconds, rs.computed_theo_cents, rs.legacy_theo_cents,
  pft.id AS pft_id, pft.amount AS pft_amount, pft.txn_kind AS pft_txn_kind,
  pft.direction AS pft_direction, pft.created_at AS pft_created_at,
  me.id AS mtl_entry_id, me.amount AS mtl_amount, me.txn_type AS mtl_txn_type,
  me.direction AS mtl_direction, me.occurred_at AS mtl_occurred_at,
  ll.id AS loyalty_ledger_id, ll.points_delta AS loyalty_points_delta,
  ll.reason AS loyalty_reason, ll.created_at AS loyalty_created_at
FROM rating_slip rs
LEFT JOIN player_financial_transaction pft ON pft.rating_slip_id = rs.id
LEFT JOIN mtl_entry me ON me.rating_slip_id = rs.id
LEFT JOIN loyalty_ledger ll ON ll.rating_slip_id = rs.id;

COMMENT ON VIEW measurement_audit_event_correlation_v IS
  'ADR-039 Artifact 2 BASE variant — audit_log join blocked until append-only immutability enforced. '
  'Fan-out: a slip with N PFTs, M MTL entries, K ledger rows produces N*M*K rows. '
  'Consumers must aggregate before interpreting counts.';

-- ============================================================
-- View 2: measurement_rating_coverage_v
-- ADR-039 Artifact 3 — Rating coverage per table session
-- ============================================================
CREATE OR REPLACE VIEW measurement_rating_coverage_v
WITH (security_invoker = true)
AS
SELECT
  ts.id AS table_session_id,
  ts.casino_id, ts.gaming_table_id, ts.gaming_day,
  ts.status AS session_status, ts.opened_at, ts.closed_at,
  EXTRACT(EPOCH FROM (COALESCE(ts.closed_at, now()) - ts.opened_at))::integer AS open_seconds,
  COALESCE(slip_agg.rated_seconds, 0) AS rated_seconds,
  0 AS ghost_seconds,  -- MVP placeholder
  0 AS idle_seconds,   -- MVP placeholder
  GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(ts.closed_at, now()) - ts.opened_at))::integer
    - COALESCE(slip_agg.rated_seconds, 0), 0
  ) AS untracked_seconds,
  CASE WHEN EXTRACT(EPOCH FROM (COALESCE(ts.closed_at, now()) - ts.opened_at)) > 0
    THEN COALESCE(slip_agg.rated_seconds, 0)::numeric
         / EXTRACT(EPOCH FROM (COALESCE(ts.closed_at, now()) - ts.opened_at))
    ELSE 0 END AS rated_ratio,
  COALESCE(slip_agg.slip_count, 0) AS slip_count
FROM table_session ts
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(rs.final_duration_seconds, rs.duration_seconds, 0))::integer AS rated_seconds,
    COUNT(*)::integer AS slip_count
  FROM rating_slip rs
  -- rating_slip.table_id (FK to gaming_table.id) = table_session.gaming_table_id
  -- Different column names, same referent. Verified: database.types.ts line 1998, 2059-2063
  WHERE rs.table_id = ts.gaming_table_id
    AND rs.casino_id = ts.casino_id
    AND rs.status = 'closed'
    AND rs.start_time >= ts.opened_at
    AND (ts.closed_at IS NULL OR rs.start_time < ts.closed_at)
) slip_agg ON true;

COMMENT ON VIEW measurement_rating_coverage_v IS
  'ADR-039 Artifact 3 — Rating coverage per table session. '
  'ghost_seconds and idle_seconds are MVP placeholders (always 0). '
  'untracked_seconds = open_seconds - rated_seconds.';

-- ============================================================
-- GRANTs
-- Exposure decision: GRANT to authenticated (Option B)
-- security_invoker=true enforces caller's Pattern C RLS on all source tables,
-- guaranteeing casino-scoped isolation at the DB boundary.
-- ============================================================
GRANT SELECT ON measurement_audit_event_correlation_v TO authenticated;
GRANT SELECT ON measurement_rating_coverage_v TO authenticated;

NOTIFY pgrst, 'reload schema';

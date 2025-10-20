  -- =====================================================================
  -- Phase B (Compatibility Layer)
  -- Establish financial aggregation views, contractual constraints, and
  -- security posture required before removing RatingSlip financial fields.
  -- =====================================================================

  BEGIN;

  -- ---------------------------------------------------------------------
  -- 1. Financial event type guardrails (enum: financial_event_type)
  -- ---------------------------------------------------------------------
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_event_type') THEN
      CREATE TYPE financial_event_type AS ENUM (
        'CASH_IN',
        'CHIPS_BROUGHT',
        'CHIPS_TAKEN',
        'REVERSAL'
      );
    END IF;
  END;
  $$;

  ALTER TABLE player_financial_transaction
    ADD COLUMN IF NOT EXISTS event_type financial_event_type;

  ALTER TABLE player_financial_transaction
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

  -- Populate event_type for historical rows using existing field hints.
  UPDATE player_financial_transaction pft
  SET event_type = COALESCE(event_type,
    (CASE
      WHEN COALESCE(net_change, 0) < 0 THEN 'REVERSAL'
      WHEN COALESCE(chips_taken, 0) > 0 THEN 'CHIPS_TAKEN'
      WHEN COALESCE(chips_brought, 0) > 0 THEN 'CHIPS_BROUGHT'
      ELSE 'CASH_IN'
    END)::financial_event_type
  );

  -- Enforce event_type presence going forward.
  ALTER TABLE player_financial_transaction
    ALTER COLUMN event_type SET NOT NULL;

  -- Restrict values to expected column semantics.
  ALTER TABLE player_financial_transaction
    DROP CONSTRAINT IF EXISTS player_financial_transaction_event_semantics_chk,
    ADD CONSTRAINT player_financial_transaction_event_semantics_chk
    CHECK (
      CASE event_type
        WHEN 'CASH_IN' THEN COALESCE(cash_in, 0) >= 0 AND COALESCE(chips_brought, 0) = 0 AND COALESCE(chips_taken, 0) = 0
        WHEN 'CHIPS_BROUGHT' THEN COALESCE(chips_brought, 0) >= 0 AND COALESCE(cash_in, 0) = 0 AND COALESCE(chips_taken, 0) = 0
        WHEN 'CHIPS_TAKEN' THEN COALESCE(chips_taken, 0) >= 0 AND COALESCE(cash_in, 0) = 0 AND COALESCE(chips_brought, 0) = 0
        WHEN 'REVERSAL' THEN COALESCE(net_change, 0) <= 0
        ELSE FALSE
      END
    );

  ALTER TABLE player_financial_transaction
    ADD CONSTRAINT pft_one_amount_chk
    CHECK (
      event_type = 'REVERSAL'
      OR (
        COALESCE((cash_in > 0)::int, 0) +
        COALESCE((chips_brought > 0)::int, 0) +
        COALESCE((chips_taken > 0)::int, 0)
      ) <= 1
    );

  -- Guard against double posts (nullable-safe idempotency key).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pft_visit_event_idempotency
    ON player_financial_transaction (visit_id, event_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  -- ---------------------------------------------------------------------
  -- 2. Append-Only Enforcement (no UPDATE/DELETE for non-service roles)
  -- ---------------------------------------------------------------------
  CREATE OR REPLACE FUNCTION enforce_pft_append_only()
  RETURNS trigger AS $$
  BEGIN
    IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'player_financial_transaction is append-only for non-service roles';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS trg_pft_append_only ON player_financial_transaction;
  CREATE TRIGGER trg_pft_append_only
    BEFORE UPDATE OR DELETE ON player_financial_transaction
    FOR EACH ROW
    EXECUTE FUNCTION enforce_pft_append_only();

  -- ---------------------------------------------------------------------
  -- 3. Reporting / Visit Read Role (idempotent creation)
  -- ---------------------------------------------------------------------
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reporting_reader') THEN
      CREATE ROLE reporting_reader;
    END IF;
  END;
  $$;

  -- Ensure PUBLIC does not inherit access to financial sources directly.
  REVOKE ALL ON player_financial_transaction FROM PUBLIC;

  -- ---------------------------------------------------------------------
  -- 4. Financial Aggregation Views
  -- ---------------------------------------------------------------------
  CREATE OR REPLACE VIEW visit_financial_summary WITH (security_barrier = true) AS
  WITH aggregated AS (
    SELECT
      pft.visit_id,
      SUM(CASE WHEN pft.event_type = 'CASH_IN' THEN COALESCE(pft.cash_in, 0)
              WHEN pft.event_type = 'REVERSAL' THEN -1 * COALESCE(pft.cash_in, 0)
              ELSE 0 END) AS total_cash_in,
      SUM(CASE WHEN pft.event_type = 'CHIPS_BROUGHT' THEN COALESCE(pft.chips_brought, 0)
              WHEN pft.event_type = 'REVERSAL' THEN -1 * COALESCE(pft.chips_brought, 0)
              ELSE 0 END) AS total_chips_brought,
      SUM(CASE WHEN pft.event_type = 'CHIPS_TAKEN' THEN COALESCE(pft.chips_taken, 0)
              WHEN pft.event_type = 'REVERSAL' THEN -1 * COALESCE(pft.chips_taken, 0)
              ELSE 0 END) AS total_chips_taken,
      COUNT(*) AS transaction_count,
      MAX(COALESCE(pft.transaction_time, pft.created_at)) AS last_transaction_at
    FROM player_financial_transaction pft
    GROUP BY pft.visit_id
  )
  SELECT * FROM aggregated;

  COMMENT ON VIEW visit_financial_summary IS
    'Financial aggregates by visit_id; reversals treated as negative movements; security barrier enforced.';

  CREATE OR REPLACE VIEW visit_financial_summary_gd WITH (security_barrier = true) AS
  SELECT
    pft.visit_id,
    v.casino_id,
    cs.timezone,
    cs.gaming_day_start,
    -- Compute gaming day using casino-specific timezone offset
    (DATE_TRUNC('day', (pft.transaction_time AT TIME ZONE cs.timezone)
      - (COALESCE(cs.gaming_day_start::interval, INTERVAL '6 hours')))
      + (COALESCE(cs.gaming_day_start::interval, INTERVAL '6 hours')))::date AS gaming_day,
    SUM(CASE WHEN pft.event_type = 'CASH_IN' THEN COALESCE(pft.cash_in, 0)
            WHEN pft.event_type = 'REVERSAL' THEN -1 * COALESCE(pft.cash_in, 0)
            ELSE 0 END) AS total_cash_in,
    SUM(CASE WHEN pft.event_type = 'CHIPS_BROUGHT' THEN COALESCE(pft.chips_brought, 0)
            WHEN pft.event_type = 'REVERSAL' THEN -1 * COALESCE(pft.chips_brought, 0)
            ELSE 0 END) AS total_chips_brought,
    SUM(CASE WHEN pft.event_type = 'CHIPS_TAKEN' THEN COALESCE(pft.chips_taken, 0)
            WHEN pft.event_type = 'REVERSAL' THEN -1 * COALESCE(pft.chips_taken, 0)
            ELSE 0 END) AS total_chips_taken,
    COUNT(*) AS transaction_count,
    MAX(COALESCE(pft.transaction_time, pft.created_at)) AS last_transaction_at
  FROM player_financial_transaction pft
  JOIN visit v ON v.id = pft.visit_id
  LEFT JOIN casino_settings cs ON cs.casino_id = v.casino_id::text
  GROUP BY
    pft.visit_id,
    v.casino_id,
    cs.timezone,
    cs.gaming_day_start,
    (DATE_TRUNC('day', (pft.transaction_time AT TIME ZONE cs.timezone)
      - (COALESCE(cs.gaming_day_start::interval, INTERVAL '6 hours')))
      + (COALESCE(cs.gaming_day_start::interval, INTERVAL '6 hours')))::date;

  COMMENT ON VIEW visit_financial_summary_gd IS
    'Financial aggregates keyed by casino + gaming day; aligns to casino timezone and gaming-day start.';

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
    -- Financial fields sourced from aggregates
    vfs.total_cash_in AS cash_in,
    vfs.total_chips_brought AS chips_brought,
    vfs.total_chips_taken AS chips_taken,
    vfs.transaction_count AS financial_transaction_count,
    vfs.last_transaction_at
  FROM ratingslip r
  LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;

  COMMENT ON VIEW ratingslip_with_financials IS
    'Compatibility view providing legacy RatingSlip financial fields sourced from PlayerFinancialService aggregates.';

  -- ---------------------------------------------------------------------
  -- 5. Performance Indexes (idempotent)
  -- ---------------------------------------------------------------------
  CREATE INDEX IF NOT EXISTS idx_pft_visit_id
    ON player_financial_transaction (visit_id);
  CREATE INDEX IF NOT EXISTS idx_pft_visit_event
    ON player_financial_transaction (visit_id, event_type);
  CREATE INDEX IF NOT EXISTS idx_pft_player_id
    ON player_financial_transaction (player_id);
  CREATE INDEX IF NOT EXISTS idx_pft_rating_slip_id
    ON player_financial_transaction (rating_slip_id);
  CREATE INDEX IF NOT EXISTS idx_pft_created_at_desc
    ON player_financial_transaction (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pft_transaction_time
    ON player_financial_transaction (transaction_time DESC);
  CREATE INDEX IF NOT EXISTS idx_visit_casino
    ON visit (id, casino_id);
  CREATE INDEX IF NOT EXISTS idx_csettings_cid
    ON casino_settings (casino_id);

  -- ---------------------------------------------------------------------
  -- 6. Row-Level Security (append-only clarity)
  -- ---------------------------------------------------------------------
  ALTER TABLE player_financial_transaction ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view own financial transactions" ON player_financial_transaction;
  CREATE POLICY pft_read_authenticated
    ON player_financial_transaction
    FOR SELECT
    TO authenticated
    USING (auth.uid() = player_id);

  DROP POLICY IF EXISTS "Service role can manage all transactions" ON player_financial_transaction;
  CREATE POLICY pft_service_full_access
    ON player_financial_transaction
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

  DROP POLICY IF EXISTS pft_reporting_reader_select ON player_financial_transaction;
  CREATE POLICY pft_reporting_reader_select
    ON player_financial_transaction
    FOR SELECT
    TO reporting_reader
    USING (true);

  DROP POLICY IF EXISTS pft_no_update ON player_financial_transaction;
  CREATE POLICY pft_no_update
    ON player_financial_transaction
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

  DROP POLICY IF EXISTS pft_no_delete ON player_financial_transaction;
  CREATE POLICY pft_no_delete
    ON player_financial_transaction
    FOR DELETE
    TO authenticated
    USING (false);

  -- ---------------------------------------------------------------------
  -- 7. Grants (explicit read-only access for reporting)
  -- ---------------------------------------------------------------------
  GRANT USAGE ON SCHEMA public TO reporting_reader;
  GRANT SELECT ON visit_financial_summary TO reporting_reader;
  GRANT SELECT ON visit_financial_summary_gd TO reporting_reader;
  GRANT SELECT ON ratingslip_with_financials TO reporting_reader;

  -- Ensure authenticated users do not automatically gain raw access.
  REVOKE SELECT ON player_financial_transaction FROM authenticated;
  GRANT SELECT ON visit_financial_summary TO authenticated;
  GRANT SELECT ON ratingslip_with_financials TO authenticated;

  COMMIT;

  -- =====================================================================
  -- Post-Execution Checklist (manual, documented for operators)
  -- 1. Run `.validation/queries.sql` (added in repo) capturing EXPLAIN output.
  -- 2. Execute RLS contract test: ensure visit/read role cannot insert/update/delete
  --    from player_financial_transaction but can read via views.
  -- 3. Capture pg_stat_statements deltas for the added views.
  -- =====================================================================

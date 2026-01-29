-- =====================================================
-- Migration: Fix rpc_get_player_timeline cents-to-dollars
-- Created: 2026-01-29
-- Purpose: Convert financial amounts from cents to dollars in summary text
--          and amount return column. player_financial_transaction.amount and
--          mtl_entry.amount are stored in cents; the RPC should return dollars
--          for UI consumption.
--
-- Affected events:
--   - cash_in: summary + amount
--   - cash_out: summary + amount
--   - mtl_recorded: summary + amount
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION rpc_get_player_timeline(
  p_player_id uuid,
  p_event_types interaction_event_type[] DEFAULT NULL,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  -- Keyset pagination cursor (tuple)
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  event_type interaction_event_type,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  source_table text,
  source_id uuid,
  summary text,
  amount numeric,
  metadata jsonb,
  -- Pagination fields
  has_more boolean,
  next_cursor_at timestamptz,
  next_cursor_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET default_transaction_read_only = on
AS $$
DECLARE
  v_casino_id uuid;
BEGIN
  -- ========================================================================
  -- Cursor validation: require both fields or neither
  -- ========================================================================
  IF (p_cursor_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'Cursor must include both cursor_at and cursor_id, or neither';
  END IF;

  -- ========================================================================
  -- ADR-024: Derive casino context from RLS session
  -- ========================================================================
  PERFORM set_rls_context_from_staff();
  -- NULLIF guards against empty string before uuid cast (empty string cast throws)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Casino context not established';
  END IF;

  -- ========================================================================
  -- Return unified timeline with keyset pagination
  -- ========================================================================
  RETURN QUERY
  WITH timeline_events AS (
    -- ======================================================================
    -- Visit start events
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'visit:' || v.id::text || ':visit_start') as event_id,
      'visit_start'::interaction_event_type as event_type,
      v.started_at as occurred_at,
      NULL::uuid as actor_id,
      'visit' as source_table,
      v.id as source_id,
      'Checked in' as summary,
      NULL::numeric as amount,
      jsonb_build_object(
        'visitKind', v.visit_kind,
        'gamingDay', v.gaming_day
      ) as metadata
    FROM visit v
    WHERE v.player_id = p_player_id
      AND v.casino_id = v_casino_id

    UNION ALL

    -- ======================================================================
    -- Visit end events
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'visit:' || v.id::text || ':visit_end'),
      'visit_end'::interaction_event_type,
      v.ended_at,
      NULL::uuid,
      'visit',
      v.id,
      'Checked out',
      NULL::numeric,
      jsonb_build_object('visitKind', v.visit_kind)
    FROM visit v
    WHERE v.player_id = p_player_id
      AND v.casino_id = v_casino_id
      AND v.ended_at IS NOT NULL

    UNION ALL

    -- ======================================================================
    -- Rating slip start events (no created_by on rating_slip table)
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'rating_slip:' || rs.id::text || ':rating_start'),
      'rating_start'::interaction_event_type,
      rs.start_time,
      NULL::uuid,  -- rating_slip has no created_by column
      'rating_slip',
      rs.id,
      'Started play at ' || gt.label,
      NULL::numeric,
      jsonb_build_object(
        'tableId', rs.table_id,
        'tableName', gt.label,
        'seatNumber', rs.seat_number,
        'previousSlipId', rs.previous_slip_id
      )
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
    JOIN gaming_table gt ON gt.id = rs.table_id AND gt.casino_id = v_casino_id
    WHERE v.player_id = p_player_id
      AND rs.casino_id = v_casino_id

    UNION ALL

    -- ======================================================================
    -- Rating slip close events
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'rating_slip:' || rs.id::text || ':rating_close'),
      'rating_close'::interaction_event_type,
      rs.end_time,
      NULL::uuid,
      'rating_slip',
      rs.id,
      'Ended play at ' || gt.label,
      NULL::numeric,
      jsonb_build_object(
        'tableId', rs.table_id,
        'tableName', gt.label,
        'durationSeconds', rs.final_duration_seconds,
        'averageBet', rs.average_bet
      )
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
    JOIN gaming_table gt ON gt.id = rs.table_id AND gt.casino_id = v_casino_id
    WHERE v.player_id = p_player_id
      AND rs.casino_id = v_casino_id
      AND rs.status = 'closed'
      AND rs.end_time IS NOT NULL

    UNION ALL

    -- ======================================================================
    -- Financial cash_in events
    -- pft.amount is stored in CENTS — convert to dollars for UI
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'player_financial_transaction:' || pft.id::text || ':cash_in'),
      'cash_in'::interaction_event_type,
      pft.created_at,
      pft.created_by_staff_id,
      'player_financial_transaction',
      pft.id,
      'Buy-in: $' || ROUND(pft.amount / 100.0, 2)::text,
      ROUND(pft.amount / 100.0, 2),
      jsonb_build_object(
        'direction', pft.direction,
        'source', pft.source,
        'tenderType', pft.tender_type,
        'visitId', pft.visit_id
      )
    FROM player_financial_transaction pft
    WHERE pft.player_id = p_player_id
      AND pft.casino_id = v_casino_id
      AND pft.direction = 'in'
      AND pft.txn_kind = 'original'

    UNION ALL

    -- ======================================================================
    -- Financial cash_out events
    -- pft.amount is stored in CENTS — convert to dollars for UI
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'player_financial_transaction:' || pft.id::text || ':cash_out'),
      'cash_out'::interaction_event_type,
      pft.created_at,
      pft.created_by_staff_id,
      'player_financial_transaction',
      pft.id,
      'Cash-out: $' || ROUND(pft.amount / 100.0, 2)::text,
      ROUND(pft.amount / 100.0, 2),
      jsonb_build_object(
        'direction', pft.direction,
        'source', pft.source,
        'tenderType', pft.tender_type,
        'visitId', pft.visit_id
      )
    FROM player_financial_transaction pft
    WHERE pft.player_id = p_player_id
      AND pft.casino_id = v_casino_id
      AND pft.direction = 'out'
      AND pft.txn_kind = 'original'

    UNION ALL

    -- ======================================================================
    -- Loyalty points_earned events
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'loyalty_ledger:' || ll.id::text || ':points_earned'),
      'points_earned'::interaction_event_type,
      ll.created_at,
      ll.staff_id,
      'loyalty_ledger',
      ll.id,
      'Earned ' || ll.points_delta::text || ' points',
      ll.points_delta,
      jsonb_build_object(
        'reason', ll.reason,
        'ratingSlipId', ll.rating_slip_id,
        'visitId', ll.visit_id,
        'note', ll.note
      )
    FROM loyalty_ledger ll
    WHERE ll.player_id = p_player_id
      AND ll.casino_id = v_casino_id
      AND ll.reason IN ('base_accrual', 'promotion')
      AND ll.points_delta > 0

    UNION ALL

    -- ======================================================================
    -- Loyalty points_redeemed events
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'loyalty_ledger:' || ll.id::text || ':points_redeemed'),
      'points_redeemed'::interaction_event_type,
      ll.created_at,
      ll.staff_id,
      'loyalty_ledger',
      ll.id,
      'Redeemed ' || ABS(ll.points_delta)::text || ' points',
      ABS(ll.points_delta),
      jsonb_build_object(
        'reason', ll.reason,
        'note', ll.note
      )
    FROM loyalty_ledger ll
    WHERE ll.player_id = p_player_id
      AND ll.casino_id = v_casino_id
      AND ll.reason = 'redeem'

    UNION ALL

    -- ======================================================================
    -- MTL recorded events
    -- me.amount is stored in CENTS — convert to dollars for UI
    -- ======================================================================
    SELECT
      extensions.uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        'mtl_entry:' || me.id::text || ':mtl_recorded'),
      'mtl_recorded'::interaction_event_type,
      me.occurred_at,
      me.staff_id,
      'mtl_entry',
      me.id,
      'MTL: $' || ROUND(me.amount / 100.0, 2)::text || ' ' || me.direction,
      ROUND(me.amount / 100.0, 2),
      jsonb_build_object(
        'direction', me.direction,
        'txnType', me.txn_type,
        'source', me.source,
        'gamingDay', me.gaming_day
      )
    FROM mtl_entry me
    WHERE me.patron_uuid = p_player_id
      AND me.casino_id = v_casino_id

    -- ======================================================================
    -- Phase 2: Add UNION ALL blocks for remaining event types per ADR-029 D5
    -- (visit_resume, rating_pause/resume, financial_adjustment, cash_observation,
    --  points_adjusted, promo_*, player_enrolled, identity_verified, note_*, tag_*)
    -- ======================================================================
  ),
  filtered_events AS (
    SELECT *
    FROM timeline_events te
    WHERE (p_cursor_at IS NULL
           OR (te.occurred_at, te.event_id) < (p_cursor_at, p_cursor_id))
      AND (p_event_types IS NULL OR te.event_type = ANY(p_event_types))
      AND (p_from_date IS NULL OR te.occurred_at >= p_from_date)
      AND (p_to_date IS NULL OR te.occurred_at <= p_to_date)
    ORDER BY te.occurred_at DESC, te.event_id DESC
    LIMIT p_limit + 1
  ),
  counted AS (
    SELECT
      fe.*,
      ROW_NUMBER() OVER (ORDER BY fe.occurred_at DESC, fe.event_id DESC) as rn,
      COUNT(*) OVER () as total_fetched
    FROM filtered_events fe
  )
  SELECT
    c.event_id,
    c.event_type,
    c.occurred_at,
    c.actor_id,
    s.first_name || ' ' || s.last_name as actor_name,
    c.source_table,
    c.source_id,
    c.summary,
    c.amount,
    c.metadata,
    -- Pagination: has_more true when we fetched more than requested
    (c.total_fetched > p_limit) as has_more,
    -- Next cursor: only emit on last returned row when has_more
    CASE WHEN c.total_fetched > p_limit AND c.rn = p_limit
         THEN c.occurred_at END as next_cursor_at,
    CASE WHEN c.total_fetched > p_limit AND c.rn = p_limit
         THEN c.event_id END as next_cursor_id
  FROM counted c
  LEFT JOIN staff s ON s.id = c.actor_id AND s.casino_id = v_casino_id
  WHERE c.rn <= p_limit;
END;
$$;

-- ============================================================================
-- Notify PostgREST to reload schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

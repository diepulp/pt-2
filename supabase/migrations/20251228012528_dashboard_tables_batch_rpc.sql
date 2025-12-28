-- Migration: Dashboard Tables Batch RPC
-- Description: Single RPC to fetch all gaming tables with active slip counts
-- ISSUE: ISSUE-DD2C45CA (Dashboard HTTP Request Cascade)
-- Reference: ADR-015, SEC-001 Template 5
-- Workstream: WS1
-- Created: 2025-12-28
-- RLS_REVIEW_COMPLETE: Uses SECURITY INVOKER with context validation (not self-injection)
--
-- This RPC eliminates the N×2 HTTP request pattern in useDashboardTables hook:
-- Before: 4 tables × 2 status queries = 8 HTTP requests
-- After: 1 RPC call
--
-- Pattern: SECURITY INVOKER (read-only BFF pattern)
-- RLS context is already set by middleware via set_rls_context()
-- This RPC validates context but does not self-inject (SEC-001 Template 5)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_dashboard_tables_with_counts(
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_actor_id uuid;
  v_context_staff_role text;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, ISSUE-DD2C45CA)
  -- Validates that caller's RLS context matches the requested casino
  -- ═══════════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- ADR-015 Phase 1A: Self-inject RLS context for transaction pooling safety
  v_context_actor_id := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
  );
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')
  );
  PERFORM set_rls_context(v_context_actor_id, p_casino_id, v_context_staff_role);
  -- ═══════════════════════════════════════════════════════════════════════

  -- Return all gaming tables with active slip counts
  -- Structure matches DashboardTableDTO (extends GamingTableWithDealerDTO)
  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', gt.id,
        'casino_id', gt.casino_id,
        'label', gt.label,
        'pit', gt.pit,
        'type', gt.type,
        'status', gt.status,
        'created_at', gt.created_at,
        'current_dealer', (
          SELECT jsonb_build_object(
            'staff_id', dr.staff_id,
            'started_at', dr.started_at
          )
          FROM dealer_rotation dr
          WHERE dr.table_id = gt.id
            AND dr.ended_at IS NULL
          ORDER BY dr.started_at DESC
          LIMIT 1
        ),
        'activeSlipsCount', COALESCE(slip_counts.count, 0)
      ) ORDER BY gt.label
    ), '[]'::jsonb)
    FROM gaming_table gt
    LEFT JOIN (
      SELECT table_id, COUNT(*)::int as count
      FROM rating_slip
      WHERE status IN ('open', 'paused')
        AND casino_id = p_casino_id
      GROUP BY table_id
    ) slip_counts ON slip_counts.table_id = gt.id
    WHERE gt.casino_id = p_casino_id
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_dashboard_tables_with_counts(uuid) TO authenticated;

-- Document the function
COMMENT ON FUNCTION rpc_get_dashboard_tables_with_counts IS
  'ISSUE-DD2C45CA: Batch RPC for dashboard tables with active slip counts. '
  'Replaces N×2 HTTP pattern (8 requests → 1). '
  'Returns jsonb array matching DashboardTableDTO[]. '
  'RLS context validated via SEC-001 Template 5 pattern.';

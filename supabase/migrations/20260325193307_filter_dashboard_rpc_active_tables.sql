-- ============================================================================
-- Migration: Filter dashboard RPC to active tables only
-- Created: 2026-03-25
-- Reference: ADR-047 D2, PRD-058 WS1
-- ADR-024: Uses set_rls_context_from_staff() — no p_casino_id parameter.
-- Purpose: Add AND gt.status = 'active' to the dashboard RPC WHERE clause
--          so the pit dashboard only shows active tables. Inactive/closed
--          tables are excluded at the data layer, not just client-side.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_dashboard_tables_with_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-024: Authoritative RLS Context Injection
  -- Derives actor_id, casino_id, staff_role from JWT + staff table lookup.
  -- No spoofable parameters.
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino_id not set in RLS context';
  END IF;

  -- Return all gaming tables with active slip counts AND current session status
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
        'activeSlipsCount', COALESCE(slip_counts.count, 0),
        -- EXEC-038A Bug 3: Include current session status (nullable)
        -- NULL when no OPEN/ACTIVE/RUNDOWN session exists for this table
        'current_session_status', current_sessions.session_status
      ) ORDER BY gt.label
    ), '[]'::jsonb)
    FROM gaming_table gt
    LEFT JOIN (
      SELECT table_id, COUNT(*)::int as count
      FROM rating_slip
      WHERE status IN ('open', 'paused')
        AND casino_id = v_casino_id
      GROUP BY table_id
    ) slip_counts ON slip_counts.table_id = gt.id
    -- EXEC-038A Bug 3: LEFT JOIN current non-closed session per table
    LEFT JOIN (
      SELECT DISTINCT ON (gaming_table_id)
        gaming_table_id,
        status as session_status
      FROM table_session
      WHERE status IN ('OPEN', 'ACTIVE', 'RUNDOWN')
        AND casino_id = v_casino_id
      ORDER BY gaming_table_id, opened_at DESC
    ) current_sessions ON current_sessions.gaming_table_id = gt.id
    WHERE gt.casino_id = v_casino_id
      AND gt.status = 'active'   -- ADR-047 D2: pit dashboard shows only active tables
  );
END;
$function$;

-- Security grants: match PRD-043 pattern
REVOKE ALL ON FUNCTION public.rpc_get_dashboard_tables_with_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_dashboard_tables_with_counts() TO authenticated, service_role;

-- PostgREST schema reload
NOTIFY pgrst, 'reload schema';

-- Update function comment
COMMENT ON FUNCTION rpc_get_dashboard_tables_with_counts IS
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'ADR-047 D2: Filters to active tables only (gt.status = ''active''). '
  'EXEC-038A Bug 3: Enriched with current_session_status via LEFT JOIN to table_session. '
  'ISSUE-DD2C45CA: Batch RPC for dashboard tables with active slip counts. '
  'Returns jsonb array matching DashboardTableDTO[]. '
  'current_session_status is nullable (null = no active session).';

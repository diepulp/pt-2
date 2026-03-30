-- ============================================================================
-- Migration: Enrich dashboard tables RPC with current session status
-- Created: 2026-03-20 (re-timestamped from 2026-03-01)
-- Reference: EXEC-038A-SESSION-UI-BUGS Bug 3
-- ADR-024: Uses set_rls_context_from_staff() — no p_casino_id parameter.
-- Purpose: Add current_session_status to dashboard RPC output so the
--          pit terminal grid badge reflects session lifecycle, not just
--          table availability (gaming_table.status).
-- ============================================================================

-- Drop old (uuid) overload if still present (idempotent)
DROP FUNCTION IF EXISTS public.rpc_get_dashboard_tables_with_counts(uuid);

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
  'EXEC-038A Bug 3: Enriched with current_session_status via LEFT JOIN to table_session. '
  'ISSUE-DD2C45CA: Batch RPC for dashboard tables with active slip counts. '
  'Returns jsonb array matching DashboardTableDTO[]. '
  'current_session_status is nullable (null = no active session).';

-- ============================================================================
-- SEC-007 WS13: Dashboard RPC Context Restore
-- Fixes: P0-5 (rpc_get_dashboard_tables_with_counts context regression)
-- Source: SEC-007 Tenant Isolation Enforcement Contract (EXEC-040)
-- ADR: ADR-024
-- ============================================================================
-- The phantom migration 20260301015320 (applied locally but never committed)
-- replaced this function with a version that removed the
-- set_rls_context_from_staff() call. This migration restores the canonical
-- version from migration 20251229154013 (ADR-024 compliant).
--
-- Defense-in-depth: Even in environments where the phantom migration was never
-- applied, this migration is idempotent — CREATE OR REPLACE with identical body.
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
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- ADR-024: Authoritative RLS Context Injection
  -- Replaces vulnerable set_rls_context() pattern with secure staff-based lookup
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_rls_context_from_staff();

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

COMMENT ON FUNCTION rpc_get_dashboard_tables_with_counts IS
  'ADR-024: Uses set_rls_context_from_staff() for authoritative context injection. '
  'SEC-007 P0-5: Context-first-line restored after phantom regression. '
  'ISSUE-DD2C45CA: Batch RPC for dashboard tables with active slip counts. '
  'Returns jsonb array matching DashboardTableDTO[]. '
  'RLS context validated via SEC-001 Template 5 pattern.';

NOTIFY pgrst, 'reload schema';

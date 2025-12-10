-- Migration: ADR-015 RLS Context RPC Layer
-- Description: Transaction-wrapped RPC function for setting RLS context variables
-- Workstream: WS1 - Database RPC Layer
-- Created: 2025-12-09

-- ============================================================================
-- set_rls_context() - Transaction-safe RLS context injection
-- ============================================================================
-- This function wraps all SET LOCAL statements in a single callable RPC,
-- ensuring all context variables are set atomically within the same transaction.
-- Connection poolers (PgBouncer) reset session-level variables, but
-- transaction-local variables (SET LOCAL) persist for the entire transaction.
--
-- Usage from application:
--   await supabase.rpc('set_rls_context', {
--     p_actor_id: userId,
--     p_casino_id: casinoId,
--     p_staff_role: 'pit_boss',
--     p_correlation_id: requestId // optional
--   });
-- ============================================================================

CREATE OR REPLACE FUNCTION set_rls_context(
  p_actor_id uuid,
  p_casino_id uuid,
  p_staff_role text,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SET LOCAL ensures context persists for entire transaction
  -- The third parameter (true) makes these transaction-local
  PERFORM set_config('app.actor_id', p_actor_id::text, true);
  PERFORM set_config('app.casino_id', p_casino_id::text, true);
  PERFORM set_config('app.staff_role', p_staff_role, true);

  IF p_correlation_id IS NOT NULL THEN
    PERFORM set_config('application_name', p_correlation_id, true);
  END IF;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION set_rls_context(uuid, uuid, text, text) TO authenticated;

-- Document ADR-015 compliance
COMMENT ON FUNCTION set_rls_context IS
  'ADR-015: Transaction-wrapped RLS context injection. All SET LOCAL statements execute in same transaction, ensuring context persists for subsequent queries.';

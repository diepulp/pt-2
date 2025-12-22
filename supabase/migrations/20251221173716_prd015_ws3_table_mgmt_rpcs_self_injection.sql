-- Migration: PRD-015 WS3 - Table Management RPCs Self-Injection
-- Description: Add ADR-015 Phase 1A self-injection to 5 Table Management RPCs
-- Workstream: WS3 - Table Management Domain
-- Issue: ISSUE-5FE4A689
-- Authority: ADR-015, PRD-015
--
-- Problem:
-- Table management RPCs were created before ADR-015 Phase 1A (Dec 13, 2025).
-- They have Pattern C context extraction but MISSING self-injection call.
-- Under Supabase transaction mode pooling (port 6543), external set_rls_context()
-- and subsequent RPC calls execute on different pooled connections, causing
-- RLS context loss and potential cross-tenant data leakage.
--
-- Solution:
-- Add PERFORM set_rls_context() call at function start (BEFORE existing context
-- extraction) to ensure context is injected within the same transaction.
--
-- Pattern: RPC self-injection (ADR-015 Phase 1A compliant)
--
-- Affected RPCs:
-- 1. rpc_update_table_status (actor: p_actor_id)
-- 2. rpc_log_table_inventory_snapshot (actor: p_counted_by)
-- 3. rpc_request_table_fill (actor: p_requested_by)
-- 4. rpc_request_table_credit (actor: p_authorized_by)
-- 5. rpc_log_table_drop (actor: p_removed_by)

BEGIN;

-- ============================================================================
-- 1. rpc_update_table_status - Add self-injection
-- Actor parameter: p_actor_id
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_update_table_status(
  p_casino_id UUID,
  p_table_id UUID,
  p_new_status table_status,
  p_actor_id UUID
) RETURNS gaming_table
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_current_status table_status;
  v_result gaming_table;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  -- Extract staff role (Pattern C hybrid with JWT fallback)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- Self-inject context (must happen BEFORE any other context checks)
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-007)
  -- =======================================================================
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
  -- =======================================================================

  -- Get current status with row lock
  SELECT status INTO v_current_status
  FROM gaming_table
  WHERE id = p_table_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Table % not found', p_table_id;
  END IF;

  -- Validate state transition
  -- Valid: inactive → active, active → inactive, active → closed
  -- Invalid: closed → anything (terminal state)
  IF NOT (
    (v_current_status = 'inactive' AND p_new_status = 'active') OR
    (v_current_status = 'active' AND p_new_status IN ('inactive', 'closed'))
  ) THEN
    RAISE EXCEPTION 'TABLE_INVALID_TRANSITION: Cannot transition from % to %',
      v_current_status, p_new_status;
  END IF;

  -- Update status
  UPDATE gaming_table
  SET status = p_new_status
  WHERE id = p_table_id AND casino_id = p_casino_id
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'table-context',
    p_actor_id,
    'update_table_status',
    jsonb_build_object(
      'table_id', p_table_id,
      'from_status', v_current_status,
      'to_status', p_new_status
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_update_table_status(UUID, UUID, table_status, UUID) IS
  'Updates table status with state transition validation. ADR-015 Phase 1A: Self-injects RLS context for connection pooling compatibility.';

-- ============================================================================
-- 2. rpc_log_table_inventory_snapshot - Add self-injection
-- Actor parameter: p_counted_by (primary actor for the snapshot)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_log_table_inventory_snapshot(
  p_casino_id uuid,
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_counted_by uuid DEFAULT NULL,
  p_verified_by uuid DEFAULT NULL,
  p_discrepancy_cents int DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS public.table_inventory_snapshot
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result table_inventory_snapshot;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  -- Extract staff role (Pattern C hybrid with JWT fallback)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- Self-inject context using p_counted_by as actor
  -- Note: p_counted_by may be NULL for some snapshot types, use COALESCE with auth.uid()
  PERFORM set_rls_context(
    COALESCE(p_counted_by, auth.uid()),
    p_casino_id,
    v_context_staff_role
  );

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- =======================================================================
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
  -- =======================================================================

  INSERT INTO public.table_inventory_snapshot (
    casino_id,
    table_id,
    snapshot_type,
    chipset,
    counted_by,
    verified_by,
    discrepancy_cents,
    note
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_snapshot_type,
    p_chipset,
    p_counted_by,
    p_verified_by,
    COALESCE(p_discrepancy_cents, 0),
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_log_table_inventory_snapshot IS
  'Logs table chip inventory snapshot. ADR-015 Phase 1A: Self-injects RLS context for connection pooling compatibility.';

-- ============================================================================
-- 3. rpc_request_table_fill - Add self-injection
-- Actor parameter: p_requested_by
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents int,
  p_requested_by uuid,
  p_delivered_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS public.table_fill
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result table_fill;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  -- Extract staff role (Pattern C hybrid with JWT fallback)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- Self-inject context using p_requested_by as actor
  PERFORM set_rls_context(p_requested_by, p_casino_id, v_context_staff_role);

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- =======================================================================
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
  -- =======================================================================

  INSERT INTO public.table_fill (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    requested_by,
    delivered_by,
    received_by,
    slip_no,
    request_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    p_requested_by,
    p_delivered_by,
    p_received_by,
    p_slip_no,
    p_request_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET delivered_by = EXCLUDED.delivered_by,
        received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_fill IS
  'Requests table chip fill. ADR-015 Phase 1A: Self-injects RLS context for connection pooling compatibility.';

-- ============================================================================
-- 4. rpc_request_table_credit - Add self-injection
-- Actor parameter: p_authorized_by
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_casino_id uuid,
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents int,
  p_authorized_by uuid,
  p_sent_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS public.table_credit
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result table_credit;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  -- Extract staff role (Pattern C hybrid with JWT fallback)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- Self-inject context using p_authorized_by as actor
  PERFORM set_rls_context(p_authorized_by, p_casino_id, v_context_staff_role);

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- =======================================================================
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
  -- =======================================================================

  INSERT INTO public.table_credit (
    casino_id,
    table_id,
    chipset,
    amount_cents,
    authorized_by,
    sent_by,
    received_by,
    slip_no,
    request_id
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_chipset,
    p_amount_cents,
    p_authorized_by,
    p_sent_by,
    p_received_by,
    p_slip_no,
    p_request_id
  )
  ON CONFLICT (casino_id, request_id) DO UPDATE
    SET received_by = EXCLUDED.received_by,
        amount_cents = EXCLUDED.amount_cents
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_request_table_credit IS
  'Requests table chip credit. ADR-015 Phase 1A: Self-injects RLS context for connection pooling compatibility.';

-- ============================================================================
-- 5. rpc_log_table_drop - Add self-injection
-- Actor parameter: p_removed_by
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_log_table_drop(
  p_casino_id uuid,
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_removed_by uuid,
  p_witnessed_by uuid,
  p_removed_at timestamptz DEFAULT now(),
  p_delivered_at timestamptz DEFAULT NULL,
  p_delivered_scan_at timestamptz DEFAULT NULL,
  p_gaming_day date DEFAULT NULL,
  p_seq_no int DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS public.table_drop_event
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
  v_result table_drop_event;
BEGIN
  -- =======================================================================
  -- SELF-INJECTION: ADR-015 Phase 1A for connection pooling
  -- =======================================================================
  -- Extract staff role (Pattern C hybrid with JWT fallback)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text
  );

  -- Self-inject context using p_removed_by as actor
  PERFORM set_rls_context(p_removed_by, p_casino_id, v_context_staff_role);

  -- =======================================================================
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
  -- =======================================================================
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
  -- =======================================================================

  INSERT INTO public.table_drop_event (
    casino_id,
    table_id,
    drop_box_id,
    seal_no,
    removed_by,
    witnessed_by,
    removed_at,
    delivered_at,
    delivered_scan_at,
    gaming_day,
    seq_no,
    note
  )
  VALUES (
    p_casino_id,
    p_table_id,
    p_drop_box_id,
    p_seal_no,
    p_removed_by,
    p_witnessed_by,
    COALESCE(p_removed_at, now()),
    p_delivered_at,
    p_delivered_scan_at,
    p_gaming_day,
    p_seq_no,
    p_note
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_log_table_drop IS
  'Logs table drop box removal. ADR-015 Phase 1A: Self-injects RLS context for connection pooling compatibility.';

-- ============================================================================
-- Migration Completed
-- ============================================================================
-- All 5 table management RPCs now self-inject RLS context within their transactions.
-- This ensures context persists across Supabase's transaction mode connection pooling.
--
-- Per ADR-015 Phase 1A (RPC self-injection pattern)
--
-- Verification:
-- - Each RPC calls PERFORM set_rls_context() before any RLS-dependent operations
-- - Staff role extracted using Pattern C hybrid (session var + JWT fallback)
-- - Context validation still in place (defense in depth)
--
-- Next steps:
-- - Deploy to staging and verify under connection pooling
-- - Monitor for cross-casino data leakage (should be zero)
-- - Load test at 100 req/s to confirm no RLS failures

COMMIT;

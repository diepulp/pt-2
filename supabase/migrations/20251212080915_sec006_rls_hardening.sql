-- Migration: SEC-006 RLS Hardening
-- Created: 2025-12-12
-- Purpose: Remediate P0/P1 gaps identified in SEC-006 RLS Strategy Audit
-- Reference: SEC-006, ADR-015, SEC-001 Template 5
-- Approved: Lead Architect (2025-12-11)
--
-- SECTIONS:
--   1. FloorLayoutService RLS + Pattern C policies (5 tables)
--   2. RPC context validation (7 SECURITY DEFINER functions)
--   3. Append-only ledger denial policies (4 tables)
--
-- VERIFIED_SAFE

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: FLOOR LAYOUT SERVICE RLS
-- Enable RLS and create Pattern C (hybrid) policies for all 5 tables
-- Reference: SEC-006 Finding #1 (P0 Critical)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.1 floor_layout (has direct casino_id)
ALTER TABLE floor_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_layout_select_same_casino ON floor_layout
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY floor_layout_insert_authorized ON floor_layout
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY floor_layout_update_authorized ON floor_layout
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY floor_layout_delete_admin_only ON floor_layout
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role = 'admin'
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- 1.2 floor_layout_version (derives casino from floor_layout via layout_id)
ALTER TABLE floor_layout_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_layout_version_select_same_casino ON floor_layout_version
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout fl
      WHERE fl.id = floor_layout_version.layout_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
  );

CREATE POLICY floor_layout_version_insert_authorized ON floor_layout_version
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout fl
      WHERE fl.id = floor_layout_version.layout_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

CREATE POLICY floor_layout_version_update_authorized ON floor_layout_version
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout fl
      WHERE fl.id = floor_layout_version.layout_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

-- 1.3 floor_pit (derives casino via layout_version -> floor_layout)
ALTER TABLE floor_pit ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_pit_select_same_casino ON floor_pit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_pit.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
  );

CREATE POLICY floor_pit_insert_authorized ON floor_pit
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_pit.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

CREATE POLICY floor_pit_update_authorized ON floor_pit
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_pit.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

CREATE POLICY floor_pit_delete_admin_only ON floor_pit
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_pit.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role = 'admin'
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

-- 1.4 floor_table_slot (derives casino via layout_version -> floor_layout)
ALTER TABLE floor_table_slot ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_table_slot_select_same_casino ON floor_table_slot
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_table_slot.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
  );

CREATE POLICY floor_table_slot_insert_authorized ON floor_table_slot
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_table_slot.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

CREATE POLICY floor_table_slot_update_authorized ON floor_table_slot
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_table_slot.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

CREATE POLICY floor_table_slot_delete_admin_only ON floor_table_slot
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floor_layout_version flv
      JOIN floor_layout fl ON fl.id = flv.layout_id
      WHERE flv.id = floor_table_slot.layout_version_id
        AND fl.casino_id = COALESCE(
          NULLIF(current_setting('app.casino_id', true), '')::uuid,
          (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
        )
    )
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role = 'admin'
      AND status = 'active'
      AND user_id IS NOT NULL
    )
  );

-- 1.5 floor_layout_activation (has direct casino_id)
ALTER TABLE floor_layout_activation ENABLE ROW LEVEL SECURITY;

CREATE POLICY floor_layout_activation_select_same_casino ON floor_layout_activation
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY floor_layout_activation_insert_authorized ON floor_layout_activation
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY floor_layout_activation_update_authorized ON floor_layout_activation
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM staff
      WHERE casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      AND role IN ('pit_boss', 'admin')
      AND status = 'active'
      AND user_id IS NOT NULL
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: RPC CONTEXT VALIDATION
-- Harden SECURITY DEFINER functions with Template 5 context validation
-- Reference: SEC-006 Findings #2, #3, #4 (P0 Critical)
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 rpc_create_floor_layout - Add context validation
CREATE OR REPLACE FUNCTION public.rpc_create_floor_layout(
  p_casino_id uuid,
  p_name text,
  p_description text,
  p_created_by uuid
) RETURNS public.floor_layout
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layout_id uuid;
  v_context_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

  INSERT INTO public.floor_layout (casino_id, name, description, created_by)
  VALUES (p_casino_id, p_name, p_description, p_created_by)
  RETURNING id INTO v_layout_id;

  INSERT INTO public.floor_layout_version (layout_id, version_no, created_by)
  VALUES (v_layout_id, 1, p_created_by);

  RETURN (SELECT fl FROM public.floor_layout fl WHERE fl.id = v_layout_id);
END;
$$;

COMMENT ON FUNCTION rpc_create_floor_layout IS
  'Creates floor layout with initial version. SEC-006 hardened with Template 5 context validation.';

-- 2.2 rpc_activate_floor_layout - Add context validation (convert SQL to plpgsql)
CREATE OR REPLACE FUNCTION public.rpc_activate_floor_layout(
  p_casino_id uuid,
  p_layout_version_id uuid,
  p_activated_by uuid,
  p_request_id text
) RETURNS public.floor_layout_activation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_result floor_layout_activation;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

  INSERT INTO public.floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  ) VALUES (
    p_casino_id, p_layout_version_id, p_activated_by, p_request_id
  )
  ON CONFLICT (casino_id, activation_request_id) DO UPDATE
    SET layout_version_id = EXCLUDED.layout_version_id,
        activated_by = EXCLUDED.activated_by,
        activated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_activate_floor_layout IS
  'Activates floor layout version. SEC-006 hardened with Template 5 context validation.';

-- 2.3 rpc_log_table_inventory_snapshot - Add context validation
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
  v_result table_inventory_snapshot;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

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
  'Logs table chip inventory snapshot. SEC-006 hardened with Template 5 context validation.';

-- 2.4 rpc_request_table_fill - Add context validation
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
  v_result table_fill;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

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
  'Requests table chip fill. SEC-006 hardened with Template 5 context validation.';

-- 2.5 rpc_request_table_credit - Add context validation
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
  v_result table_credit;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

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
  'Requests table chip credit. SEC-006 hardened with Template 5 context validation.';

-- 2.6 rpc_log_table_drop - Add context validation
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
  v_result table_drop_event;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

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
  'Logs table drop box removal. SEC-006 hardened with Template 5 context validation.';

-- 2.7 rpc_issue_mid_session_reward - Add context validation at function start
CREATE OR REPLACE FUNCTION rpc_issue_mid_session_reward(
  p_casino_id uuid,
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_idempotency_key text DEFAULT NULL,
  p_reason loyalty_reason DEFAULT 'mid_session'
) RETURNS TABLE (ledger_id uuid, balance_after int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_balance_after int;
  v_now timestamptz := now();
  v_context_casino_id uuid;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-006)
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
  -- ═══════════════════════════════════════════════════════════════════════

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  -- Verify rating slip eligibility (derives player_id from visit)
  PERFORM 1
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_rating_slip_id
     AND v.player_id = p_player_id
     AND rs.casino_id = p_casino_id
     AND rs.status IN ('open','paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rating slip not eligible for mid-session reward';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM loyalty_ledger
       WHERE idempotency_key = p_idempotency_key
         AND casino_id = p_casino_id
    ) THEN
      RETURN QUERY
        SELECT ll.id,
               (
                 SELECT balance
                   FROM player_loyalty
                  WHERE player_id = p_player_id
                    AND casino_id = p_casino_id
               )
          FROM loyalty_ledger ll
         WHERE ll.idempotency_key = p_idempotency_key
           AND ll.casino_id = p_casino_id;
      RETURN;
    END IF;
  END IF;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger (
    casino_id,
    player_id,
    rating_slip_id,
    staff_id,
    points_earned,
    reason,
    idempotency_key,
    created_at
  )
  VALUES (
    p_casino_id,
    p_player_id,
    p_rating_slip_id,
    p_staff_id,
    p_points,
    COALESCE(p_reason, 'mid_session'),
    p_idempotency_key,
    v_now
  )
  RETURNING id INTO v_ledger_id;

  -- Update or insert player_loyalty balance
  INSERT INTO player_loyalty (player_id, casino_id, balance, updated_at)
  VALUES (p_player_id, p_casino_id, p_points, v_now)
  ON CONFLICT (player_id, casino_id)
  DO UPDATE SET
    balance = player_loyalty.balance + p_points,
    updated_at = v_now
  RETURNING balance INTO v_balance_after;

  RETURN QUERY SELECT v_ledger_id, v_balance_after;
END;
$$;

COMMENT ON FUNCTION rpc_issue_mid_session_reward IS
  'Issues mid-session loyalty points. SEC-006 hardened with Template 5 context validation.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: APPEND-ONLY LEDGER DENIAL POLICIES
-- Add explicit no_updates/no_deletes to preserve audit integrity
-- Reference: SEC-006 Finding #6 (P1 High), SEC-001 Template 3
-- ═══════════════════════════════════════════════════════════════════════════

-- 3.1 loyalty_ledger - Add denial policies
-- Pattern: auth.uid() IS NOT NULL AND false (consistent with 20251211170030)
CREATE POLICY loyalty_ledger_no_updates ON loyalty_ledger
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

CREATE POLICY loyalty_ledger_no_deletes ON loyalty_ledger
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 3.2 mtl_entry - Add denial policies
CREATE POLICY mtl_entry_no_updates ON mtl_entry
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

CREATE POLICY mtl_entry_no_deletes ON mtl_entry
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 3.3 finance_outbox - Add denial policies
CREATE POLICY finance_outbox_no_updates ON finance_outbox
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

CREATE POLICY finance_outbox_no_deletes ON finance_outbox
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- 3.4 loyalty_outbox - Add denial policies
CREATE POLICY loyalty_outbox_no_updates ON loyalty_outbox
  FOR UPDATE USING (auth.uid() IS NOT NULL AND false);

CREATE POLICY loyalty_outbox_no_deletes ON loyalty_outbox
  FOR DELETE USING (auth.uid() IS NOT NULL AND false);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Check all FloorLayoutService tables have RLS enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename LIKE 'floor%';
--
-- Check denial policies exist:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE policyname LIKE '%no_updates' OR policyname LIKE '%no_deletes';
--
-- Test context validation (should raise exception):
-- SELECT rpc_create_floor_layout(
--   '00000000-0000-0000-0000-000000000001'::uuid,  -- different casino
--   'Test', 'Test', '...'::uuid
-- );
-- Expected: 'casino_id mismatch: caller provided ... but context is ...'

COMMIT;

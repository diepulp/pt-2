-- ============================================================================
-- PRD-067: Admin Operations Pit Configuration — RPCs + RULE-3 Enforcement
-- EXEC-SPEC: docs/21-exec-spec/EXEC-067-admin-operations-pit-configuration.md
-- FIB-S:    docs/issues/gaps/pit-configuration/FIB-S-PIT-CONFIG-001-...json
-- Decisions:
--   DEC-001 — gaming_table.pit compatibility mirror (explicit casino_id predicate)
--   DEC-003 layer (1) — partial unique index on (layout_version_id, preferred_table_id)
--   DEC-003 layer (2) — deterministic active-layout resolution with FOR UPDATE lock
-- ADR compliance: ADR-015, ADR-018, ADR-020, ADR-024 (INV-8), ADR-030 (D4)
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Partial unique index (DEC-003 layer 1)
-- ----------------------------------------------------------------------------
-- Enforces RULE-3 at the DB layer for any single active layout_version: no
-- table may occupy two slots simultaneously. Race-proof within a single
-- layout_version; cross-layout-version drift is contained operationally by
-- DEC-003 layer (2) inside each RPC.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_floor_table_slot_preferred_table_active
  ON public.floor_table_slot (layout_version_id, preferred_table_id)
  WHERE preferred_table_id IS NOT NULL;

COMMENT ON INDEX public.ux_floor_table_slot_preferred_table_active IS
  'PRD-067 / DEC-003 layer (1): partial unique index enforcing RULE-3 — no '
  'duplicate active slot assignment within a single layout_version. Drop is '
  'forbidden outside a governed PRD.';

-- ============================================================================
-- SECTION 2: rpc_assign_or_move_table_to_slot
-- ----------------------------------------------------------------------------
-- Assigns a table to a slot, or moves it from its current slot to the target.
-- ADR-024 INV-8: signature accepts no p_casino_id / p_actor_id; context is
-- derived authoritatively via set_rls_context_from_staff().
-- ADR-018: SECURITY DEFINER with SET search_path = ''.
-- Single plpgsql transaction — no SAVEPOINT, no EXCEPTION WHEN OTHERS.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_assign_or_move_table_to_slot(uuid, uuid);

CREATE FUNCTION public.rpc_assign_or_move_table_to_slot(
  p_table_id uuid,
  p_slot_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id                 uuid;
  v_actor_id                  uuid;
  v_staff_role                text;
  v_active_layout_version_id  uuid;
  v_slot_pit_id               uuid;
  v_slot_layout_version_id    uuid;
  v_current_slot_table        uuid;
  v_table_casino_id           uuid;
  v_pit_label                 text;
  v_previous_slot_id          uuid;
  v_previous_pit_label        text;
BEGIN
  -- Step (a): Authoritative context injection (ADR-024, first statement)
  PERFORM public.set_rls_context_from_staff();

  -- Step (b): Extract validated context + admin role gate (RULE-2)
  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED: admin role required for pit assignment mutations'
      USING ERRCODE = 'P0001';
  END IF;

  -- Step (c): DEC-003 layer (2) — deterministic active-layout resolution with
  -- FOR UPDATE row lock. Contains the drift window if two
  -- floor_layout_activation rows both have deactivated_at IS NULL for this
  -- casino (R8); two concurrent RPC invocations converge on the same row.
  SELECT fla.layout_version_id
    INTO v_active_layout_version_id
    FROM public.floor_layout_activation fla
   WHERE fla.casino_id = v_casino_id
     AND fla.deactivated_at IS NULL
   ORDER BY fla.activated_at DESC, fla.id DESC
   LIMIT 1
   FOR UPDATE;

  IF v_active_layout_version_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_LAYOUT: casino has no active floor layout'
      USING ERRCODE = 'P0002';
  END IF;

  -- Step (d): Resolve target slot; enforce RULE-4 (slot must be in active layout)
  SELECT fts.pit_id, fts.layout_version_id, fts.preferred_table_id
    INTO v_slot_pit_id, v_slot_layout_version_id, v_current_slot_table
    FROM public.floor_table_slot fts
   WHERE fts.id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND: slot % does not exist', p_slot_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_slot_layout_version_id IS DISTINCT FROM v_active_layout_version_id THEN
    RAISE EXCEPTION 'SLOT_NOT_ACTIVE: slot % is not in the active layout version', p_slot_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_slot_pit_id IS NULL THEN
    RAISE EXCEPTION 'SLOT_HAS_NO_PIT: slot % has no pit association', p_slot_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step (e): Resolve table + cross-casino guard
  SELECT gt.casino_id
    INTO v_table_casino_id
    FROM public.gaming_table gt
   WHERE gt.id = p_table_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: table % does not exist', p_table_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_table_casino_id IS DISTINCT FROM v_casino_id THEN
    RAISE EXCEPTION 'CROSS_CASINO_FORBIDDEN: table % belongs to a different casino', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Step (f): RULE-3 occupied-target rejection (no implicit swap)
  IF v_current_slot_table IS NOT NULL
     AND v_current_slot_table IS DISTINCT FROM p_table_id THEN
    RAISE EXCEPTION 'SLOT_OCCUPIED: slot % already holds a different table', p_slot_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step (g): Resolve target pit label (for mirror + audit)
  SELECT fp.label
    INTO v_pit_label
    FROM public.floor_pit fp
   WHERE fp.id = v_slot_pit_id;

  IF NOT FOUND OR v_pit_label IS NULL THEN
    RAISE EXCEPTION 'PIT_NOT_FOUND: target pit % does not exist', v_slot_pit_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step (h): Capture previous-slot state for audit (move vs assign)
  SELECT fts.id, fp.label
    INTO v_previous_slot_id, v_previous_pit_label
    FROM public.floor_table_slot fts
    LEFT JOIN public.floor_pit fp ON fp.id = fts.pit_id
   WHERE fts.layout_version_id = v_active_layout_version_id
     AND fts.preferred_table_id = p_table_id
     AND fts.id IS DISTINCT FROM p_slot_id;

  -- Step (i): Clear previous-slot assignment for this table (move case)
  UPDATE public.floor_table_slot
     SET preferred_table_id = NULL
   WHERE layout_version_id = v_active_layout_version_id
     AND preferred_table_id = p_table_id
     AND id IS DISTINCT FROM p_slot_id;

  -- Step (j): Write new assignment
  UPDATE public.floor_table_slot
     SET preferred_table_id = p_table_id
   WHERE id = p_slot_id;

  -- Step (k): DEC-001 mirror — explicit casino_id predicate (P0-1)
  UPDATE public.gaming_table
     SET pit = v_pit_label
   WHERE id = p_table_id
     AND casino_id = v_casino_id;

  -- Step (l): Audit log emission
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'floor_layout',
    v_actor_id,
    CASE WHEN v_previous_slot_id IS NULL THEN 'slot_assign' ELSE 'slot_move' END,
    jsonb_build_object(
      'pit_id',              v_slot_pit_id,
      'pit_label',           v_pit_label,
      'slot_id',             p_slot_id,
      'table_id',            p_table_id,
      'previous_slot_id',    v_previous_slot_id,
      'previous_pit_label',  v_previous_pit_label,
      'layout_version_id',   v_active_layout_version_id
    )
  );

  -- Step (m): Return aggregate result
  RETURN jsonb_build_object(
    'table_id',         p_table_id,
    'slot_id',          p_slot_id,
    'pit_id',           v_slot_pit_id,
    'pit_label',        v_pit_label,
    'previous_slot_id', v_previous_slot_id
  );
END;
$$;

-- ============================================================================
-- SECTION 3: rpc_clear_slot_assignment
-- ----------------------------------------------------------------------------
-- Clears a slot's assignment. Idempotent for already-empty slots (RULE-4).
-- Same transactional atomicity guarantees as assign.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_clear_slot_assignment(uuid);

CREATE FUNCTION public.rpc_clear_slot_assignment(
  p_slot_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id                 uuid;
  v_actor_id                  uuid;
  v_staff_role                text;
  v_active_layout_version_id  uuid;
  v_slot_layout_version_id    uuid;
  v_slot_pit_id               uuid;
  v_prev_table_id             uuid;
BEGIN
  -- Authoritative context injection (ADR-024, first statement)
  PERFORM public.set_rls_context_from_staff();

  -- Extract validated context + admin role gate (RULE-2)
  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED: admin role required for pit assignment mutations'
      USING ERRCODE = 'P0001';
  END IF;

  -- DEC-003 layer (2): deterministic active-layout resolution with FOR UPDATE lock
  SELECT fla.layout_version_id
    INTO v_active_layout_version_id
    FROM public.floor_layout_activation fla
   WHERE fla.casino_id = v_casino_id
     AND fla.deactivated_at IS NULL
   ORDER BY fla.activated_at DESC, fla.id DESC
   LIMIT 1
   FOR UPDATE;

  IF v_active_layout_version_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_LAYOUT: casino has no active floor layout'
      USING ERRCODE = 'P0002';
  END IF;

  -- Resolve slot; enforce RULE-4 (slot must be in active layout)
  SELECT fts.layout_version_id, fts.pit_id, fts.preferred_table_id
    INTO v_slot_layout_version_id, v_slot_pit_id, v_prev_table_id
    FROM public.floor_table_slot fts
   WHERE fts.id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND: slot % does not exist', p_slot_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_slot_layout_version_id IS DISTINCT FROM v_active_layout_version_id THEN
    RAISE EXCEPTION 'SLOT_NOT_ACTIVE: slot % is not in the active layout version', p_slot_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent clear (RULE-4): empty slot returns success without mutation
  IF v_prev_table_id IS NULL THEN
    RETURN jsonb_build_object(
      'cleared',            false,
      'slot_id',            p_slot_id,
      'previous_table_id',  NULL,
      'idempotent',         true
    );
  END IF;

  -- Clear assignment
  UPDATE public.floor_table_slot
     SET preferred_table_id = NULL
   WHERE id = p_slot_id;

  -- DEC-001 mirror — explicit casino_id predicate (P0-1)
  UPDATE public.gaming_table
     SET pit = NULL
   WHERE id = v_prev_table_id
     AND casino_id = v_casino_id;

  -- Audit log emission
  INSERT INTO public.audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    v_casino_id,
    'floor_layout',
    v_actor_id,
    'slot_clear',
    jsonb_build_object(
      'slot_id',            p_slot_id,
      'pit_id',             v_slot_pit_id,
      'previous_table_id',  v_prev_table_id,
      'layout_version_id',  v_active_layout_version_id
    )
  );

  RETURN jsonb_build_object(
    'cleared',            true,
    'slot_id',            p_slot_id,
    'previous_table_id',  v_prev_table_id
  );
END;
$$;

-- ============================================================================
-- SECTION 4: Grants
-- ----------------------------------------------------------------------------
-- Admin gate is enforced INSIDE the RPC body (app.staff_role check). The
-- GRANT to authenticated is necessary for staff of any role to call the RPC;
-- non-admin callers are rejected with FORBIDDEN_ADMIN_REQUIRED.
-- ============================================================================

REVOKE ALL ON FUNCTION public.rpc_assign_or_move_table_to_slot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_clear_slot_assignment(uuid)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_assign_or_move_table_to_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_clear_slot_assignment(uuid)              TO authenticated;

-- ============================================================================
-- SECTION 5: Function documentation (P1 R1-5)
-- ============================================================================

COMMENT ON FUNCTION public.rpc_assign_or_move_table_to_slot(uuid, uuid) IS
  'PRD-067: SECURITY DEFINER. Admin-only (RULE-2) table-to-slot assignment or '
  'relocation. Enforcement layers: (1) partial unique index '
  'ux_floor_table_slot_preferred_table_active on '
  '(layout_version_id, preferred_table_id) — DEC-003 layer (1); (2) deterministic '
  'active-layout resolution with FOR UPDATE row lock containing '
  'single-active-activation drift (R8) — DEC-003 layer (2). ADR-024 INV-8 '
  'compliant: no p_casino_id / p_actor_id parameters; context derived via '
  'set_rls_context_from_staff(). DEC-001 mirror: gaming_table.pit is updated '
  'to the target floor_pit.label with explicit casino_id predicate. These '
  'RPCs (rpc_assign_or_move_table_to_slot + rpc_clear_slot_assignment) are '
  'the authoritative write path; all non-emergency writes to '
  'floor_table_slot.preferred_table_id MUST go through them (Mirror Authority '
  'Rule). Do NOT remove the app.staff_role admin check. Do NOT drop the '
  'FOR UPDATE lock in step (c). Do NOT add auth.jwt() fallback on write '
  'statements (ADR-030 D4).';

COMMENT ON FUNCTION public.rpc_clear_slot_assignment(uuid) IS
  'PRD-067: SECURITY DEFINER. Admin-only (RULE-2) slot clear; idempotent for '
  'already-empty slots (RULE-4). Same atomicity guarantees as '
  'rpc_assign_or_move_table_to_slot: single plpgsql transaction, no SAVEPOINT, '
  'no EXCEPTION WHEN OTHERS; any failure rolls back all preceding writes '
  'including the gaming_table.pit mirror. ADR-024 INV-8 compliant: signature '
  'accepts only p_slot_id. These RPCs '
  '(rpc_assign_or_move_table_to_slot + rpc_clear_slot_assignment) are the '
  'authoritative write path for floor_table_slot.preferred_table_id. Do NOT '
  'remove the app.staff_role admin check.';

COMMIT;

-- ============================================================================
-- Reload PostgREST schema cache so new RPCs are exposed immediately
-- ============================================================================

NOTIFY pgrst, 'reload schema';

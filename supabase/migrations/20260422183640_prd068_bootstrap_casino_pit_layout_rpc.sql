-- ============================================================================
-- PRD-068: Pit Bootstrap — Onboarding Materialization (Pilot Slice)
-- EXEC-SPEC: docs/21-exec-spec/EXEC-068-pit-bootstrap-onboarding-materialization.md
-- FIB-H:    docs/issues/gaps/pit-bootstrap/FIB-PIT-BOOTSTRAP-001.md
-- FIB-S:    docs/issues/gaps/pit-bootstrap/FIB-S-PIT-BOOTSTRAP-001.json
--
-- Decisions:
--   DEC-001 — Pit-name equivalence = lower(btrim(pit)); canonical label =
--             first btrim(pit) by (created_at ASC, id ASC) within each
--             normalized group.
--   DEC-002 — gaming_table.type → floor_table_slot.game_type identity map
--             (both reference public.game_type enum).
--   DEC-003 — SECURITY DEFINER RPC transport (RULE-6 atomicity of 5-table
--             write set requires server-side composition).
--   DEC-004 — No wizard UI change; bootstrap outcome observable via
--             structured log (RAISE LOG) only.
--
-- Findings applied (DA review):
--   Finding 1 — ux_floor_layout_activation_active_one_per_casino partial
--               unique index (RULE-7 race fence).
--   Finding 2 — floor_layout_version.status set explicitly to 'active'
--               (schema default 'draft' would silently break PRD-067 read).
--   Finding 3 — Does NOT call pre-existing rpc_create_floor_layout /
--               rpc_activate_floor_layout (both predate ADR-024).
--   Finding 5 — ux_floor_pit_layout_version_label_lower partial unique
--               index (RULE-2 defense in depth).
--   Finding 6 — Fixed activation_request_id = 'prd068_pit_bootstrap_v1'
--               makes the pre-existing UNIQUE (casino_id,
--               activation_request_id) a secondary idempotency guard.
--
-- ADR compliance: ADR-015, ADR-018, ADR-020, ADR-024 (INV-8), ADR-030 (D4)
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Partial unique indexes — database teeth for RULE-2 and RULE-7
-- ----------------------------------------------------------------------------
-- (1) ux_floor_layout_activation_active_one_per_casino — Finding 1
--     Enforces RULE-7 ("bootstrap is idempotent per casino") at the database
--     layer. Serializes concurrent first-time bootstraps: the EXISTS
--     short-circuit in the RPC is a fast-path optimization, this index is
--     the authoritative race fence. Second-writer hits unique violation and
--     the entire RPC transaction rolls back.
--
-- (2) ux_floor_pit_layout_version_label_lower — Finding 5
--     Enforces RULE-2 ("distinct non-empty pit values collapse to exactly
--     one floor_pit per distinct value per casino") at the database layer.
--     Complements the RPC's SELECT DISTINCT ON derivation; if the derivation
--     SQL is ever wrong, this index prevents silent duplicate commits.
--
-- Both created UNCONDITIONALLY with IF NOT EXISTS as the idempotency hedge
-- (re-running the migration is safe; base schema omits both).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_floor_layout_activation_active_one_per_casino
  ON public.floor_layout_activation (casino_id)
  WHERE deactivated_at IS NULL;

COMMENT ON INDEX public.ux_floor_layout_activation_active_one_per_casino IS
  'PRD-068 Finding 1: partial unique index — exactly one active '
  'floor_layout_activation per casino. Authoritative RULE-7 race fence for '
  'concurrent first-time bootstraps. Drop is forbidden outside a governed PRD.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_floor_pit_layout_version_label_lower
  ON public.floor_pit (layout_version_id, lower(label));

COMMENT ON INDEX public.ux_floor_pit_layout_version_label_lower IS
  'PRD-068 Finding 5: partial unique index on (layout_version_id, lower(label)) '
  'enforcing RULE-2 — distinct pit-name equivalence (trimmed + case-insensitive). '
  'Defense-in-depth behind the RPC SELECT DISTINCT ON derivation. Drop is '
  'forbidden outside a governed PRD.';

-- ============================================================================
-- SECTION 2: rpc_bootstrap_casino_pit_layout
-- ----------------------------------------------------------------------------
-- ADR-024 INV-8: zero parameters; context derived authoritatively via
-- set_rls_context_from_staff().
-- ADR-018:      SECURITY DEFINER with SET search_path = ''; all SQL uses
--               fully-qualified public.* names.
-- ADR-030 D4:   Write path derives casino_id from the session variable set
--               by set_rls_context_from_staff(); no JWT COALESCE fallback
--               on write statements.
-- RULE-5:       Zero UPDATE / DELETE statements against public.gaming_table.
--               Preservation is by construction (not a guard).
-- RULE-6:       Single plpgsql transaction — no SAVEPOINT, no
--               EXCEPTION WHEN OTHERS. Any failure rolls back the entire
--               5-table write set.
-- RULE-9:       FloorLayoutService is the mutation owner. This RPC is the
--               canonical write seam for bootstrap.
-- Finding 3:    This RPC does NOT call public.rpc_create_floor_layout or
--               public.rpc_activate_floor_layout (both predate ADR-024 and
--               accept spoofable parameters).
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_bootstrap_casino_pit_layout();

CREATE FUNCTION public.rpc_bootstrap_casino_pit_layout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_casino_id          uuid;
  v_actor_id           uuid;
  v_staff_role         text;
  v_layout_id          uuid;
  v_layout_version_id  uuid;
  v_pits_created       bigint := 0;
  v_slots_created      bigint := 0;
  v_tables_without_pit bigint := 0;
BEGIN
  -- Step (a): Authoritative context injection (ADR-024, first statement)
  PERFORM public.set_rls_context_from_staff();

  -- Step (b): Extract validated context + admin role gate (RULE-8)
  v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
  v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED: admin role required for pit bootstrap'
      USING ERRCODE = 'P0001';
  END IF;

  -- Step (c): Idempotency short-circuit (RULE-7). Look up any active
  -- activation for this casino; if present, return the existing state
  -- without writing new rows. The partial unique index created in
  -- SECTION 1 is the authoritative race fence behind this fast-path.
  SELECT fla.layout_version_id
    INTO v_layout_version_id
    FROM public.floor_layout_activation fla
   WHERE fla.casino_id = v_casino_id
     AND fla.deactivated_at IS NULL
   ORDER BY fla.activated_at DESC, fla.id DESC
   LIMIT 1;

  IF v_layout_version_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pits_created
      FROM public.floor_pit
     WHERE layout_version_id = v_layout_version_id;

    SELECT COUNT(*) INTO v_slots_created
      FROM public.floor_table_slot
     WHERE layout_version_id = v_layout_version_id;

    SELECT COUNT(*) INTO v_tables_without_pit
      FROM public.gaming_table
     WHERE casino_id = v_casino_id
       AND (pit IS NULL OR btrim(pit) = '');

    RAISE LOG 'PRD-068 bootstrap (already_bootstrapped): casino=% version=% pits=% slots=% unassigned=%',
      v_casino_id, v_layout_version_id, v_pits_created, v_slots_created, v_tables_without_pit;

    RETURN jsonb_build_object(
      'ok',                  true,
      'outcome',             'already_bootstrapped',
      'casino_id',           v_casino_id,
      'layout_version_id',   v_layout_version_id,
      'pits_created',        v_pits_created,
      'slots_created',       v_slots_created,
      'tables_without_pit',  v_tables_without_pit
    );
  END IF;

  -- Step (d): Create floor_layout (STEP-2)
  INSERT INTO public.floor_layout (casino_id, name, description, created_by)
  VALUES (v_casino_id, 'Default', '', v_actor_id)
  RETURNING id INTO v_layout_id;

  -- Step (e): Create floor_layout_version with explicit status='active'
  -- (Finding 2). Schema default is 'draft'; if left unset, PRD-067's read
  -- path would treat the version as inactive and render empty. layout_payload
  -- is NOT supplied — schema default '{}'::jsonb applies per FIB-S §K
  -- ("no payload authoring beyond the empty/default value the schema demands").
  INSERT INTO public.floor_layout_version (
    layout_id, version_no, status, created_by
  )
  VALUES (v_layout_id, 1, 'active', v_actor_id)
  RETURNING id INTO v_layout_version_id;

  -- Step (f): Create floor_layout_activation with fixed activation_request_id
  -- (Finding 6). The pre-existing UNIQUE (casino_id, activation_request_id)
  -- constraint then becomes a secondary idempotency guard alongside the
  -- SECTION 1 partial unique index.
  INSERT INTO public.floor_layout_activation (
    casino_id, layout_version_id, activated_by, activation_request_id
  )
  VALUES (
    v_casino_id, v_layout_version_id, v_actor_id, 'prd068_pit_bootstrap_v1'
  );

  -- Step (g): Insert floor_pits — one per distinct non-empty pit name (STEP-3).
  -- DEC-001: equivalence key = lower(btrim(pit)); canonical stored label =
  -- first btrim(pit) encountered by (created_at ASC, id ASC) within each
  -- normalized group. Deterministic across any two databases with identical
  -- input rows.
  WITH canonical_pits AS (
    SELECT DISTINCT ON (lower(btrim(pit)))
      btrim(pit)         AS canonical_label,
      lower(btrim(pit))  AS normalized_key
    FROM public.gaming_table
    WHERE casino_id = v_casino_id
      AND pit IS NOT NULL
      AND btrim(pit) <> ''
    ORDER BY lower(btrim(pit)), created_at ASC, id ASC
  )
  INSERT INTO public.floor_pit (layout_version_id, label, sequence)
  SELECT
    v_layout_version_id,
    canonical_label,
    (row_number() OVER (ORDER BY normalized_key))::int
  FROM canonical_pits;

  GET DIAGNOSTICS v_pits_created = ROW_COUNT;

  -- Step (h): Insert floor_table_slots — one per pit-bearing gaming_table
  -- (STEP-4). RULE-3 binding: preferred_table_id = gt.id AND pit_id =
  -- matching floor_pit.id. DEC-002 identity map: game_type = gt.type (same
  -- public.game_type enum). slot_label = gt.label (pilot default per PRD
  -- §10.3 decision notes). RULE-5: this is an INSERT against
  -- floor_table_slot, NOT an UPDATE/DELETE against gaming_table.
  INSERT INTO public.floor_table_slot (
    layout_version_id, pit_id, slot_label, game_type, preferred_table_id
  )
  SELECT
    v_layout_version_id,
    fp.id,
    gt.label,
    gt.type,
    gt.id
  FROM public.gaming_table gt
  JOIN public.floor_pit fp
    ON fp.layout_version_id = v_layout_version_id
   AND lower(fp.label) = lower(btrim(gt.pit))
  WHERE gt.casino_id = v_casino_id
    AND gt.pit IS NOT NULL
    AND btrim(gt.pit) <> '';

  GET DIAGNOSTICS v_slots_created = ROW_COUNT;

  -- Step (i): Count tables without pit (STEP-5). These intentionally have
  -- NO slot — they remain in gaming_table and will appear in PRD-067's
  -- unassigned list per RULE-4.
  SELECT COUNT(*) INTO v_tables_without_pit
    FROM public.gaming_table
   WHERE casino_id = v_casino_id
     AND (pit IS NULL OR btrim(pit) = '');

  -- Step (j): Structured log emission. Reuses the PostgreSQL log stream;
  -- this RPC does not introduce a new audit subsystem (PRD §5.2, §11.1).
  RAISE LOG 'PRD-068 bootstrap (success): casino=% version=% pits=% slots=% unassigned=%',
    v_casino_id, v_layout_version_id, v_pits_created, v_slots_created, v_tables_without_pit;

  -- Step (k): Return success envelope (CAP-7 hand-off summary)
  RETURN jsonb_build_object(
    'ok',                  true,
    'outcome',             'success',
    'casino_id',           v_casino_id,
    'layout_version_id',   v_layout_version_id,
    'pits_created',        v_pits_created,
    'slots_created',       v_slots_created,
    'tables_without_pit',  v_tables_without_pit
  );
END;
$$;

-- ============================================================================
-- SECTION 3: Grants (RULE-8 admin gate enforced inside function body)
-- ----------------------------------------------------------------------------
-- The admin gate (app.staff_role = 'admin') is enforced INSIDE the RPC body.
-- GRANT EXECUTE to authenticated is necessary for staff of any role to
-- invoke the RPC; non-admin callers are rejected with
-- FORBIDDEN_ADMIN_REQUIRED.
-- ============================================================================

REVOKE ALL ON FUNCTION public.rpc_bootstrap_casino_pit_layout() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_bootstrap_casino_pit_layout() TO authenticated;

-- ============================================================================
-- SECTION 4: Function documentation
-- ============================================================================

COMMENT ON FUNCTION public.rpc_bootstrap_casino_pit_layout() IS
  'PRD-068: SECURITY DEFINER. Admin-only one-shot materialization of '
  'canonical floor layout mapping from onboarding gaming_table.pit input. '
  'Writes exactly once per casino: floor_layout + floor_layout_version '
  '(status=''active'', version_no=1) + floor_layout_activation '
  '(activation_request_id=''prd068_pit_bootstrap_v1'') + floor_pit (one '
  'per distinct lower(btrim(pit))) + floor_table_slot (one per '
  'pit-bearing gaming_table). '
  'DEC-001: pit-name equivalence = lower(btrim(pit)); canonical stored '
  'label = first btrim(pit) by (created_at ASC, id ASC) within each '
  'normalized group. '
  'DEC-002: game_type identity map (both columns reference '
  'public.game_type enum). '
  'DEC-003: RPC transport chosen for RULE-6 atomicity of 5-table write set. '
  'DEC-004: no wizard UI change; outcome observable via RAISE LOG and the '
  'returned jsonb envelope. '
  'Idempotency: (1) EXISTS short-circuit returns already_bootstrapped; '
  '(2) partial unique index ux_floor_layout_activation_active_one_per_casino '
  'on (casino_id) WHERE deactivated_at IS NULL is the authoritative race '
  'fence (Finding 1); (3) pre-existing UNIQUE (casino_id, '
  'activation_request_id) with fixed string ''prd068_pit_bootstrap_v1'' is '
  'a secondary idempotency guard (Finding 6). '
  'ADR-024 INV-8 compliant: zero parameters; context derived via '
  'set_rls_context_from_staff(). '
  'ADR-018 compliant: SECURITY DEFINER with SET search_path = '''', '
  'fully-qualified public.* names throughout. '
  'ADR-030 D4 compliant: write path derives casino_id from session '
  'variable set by set_rls_context_from_staff(); no JWT COALESCE fallback '
  'on write statements. '
  'RULE-5 preservation: zero UPDATE / DELETE statements against '
  'public.gaming_table — preservation is by construction. '
  'RULE-6 atomicity: single plpgsql transaction; no SAVEPOINT, no '
  'EXCEPTION WHEN OTHERS. Any failure rolls back all canonical writes. '
  'RULE-9 mutation ownership: this RPC is the canonical write seam for '
  'bootstrap; onboarding handlers must invoke via '
  'FloorLayoutService.bootstrapCasinoPitLayout(), never directly. '
  'Do NOT remove the app.staff_role admin check. '
  'Do NOT call public.rpc_create_floor_layout or '
  'public.rpc_activate_floor_layout (Finding 3 — both predate ADR-024 and '
  'accept spoofable parameters). '
  'Do NOT add auth.jwt() fallback on write statements (ADR-030 D4). '
  'Do NOT elevate OQ-1 equivalence into a normalization policy, naming '
  'governance, or operator-facing reconciliation UX (FIB-S §K — amendment '
  'required).';

COMMIT;

-- ============================================================================
-- Reload PostgREST schema cache so the new RPC is exposed immediately
-- ============================================================================

NOTIFY pgrst, 'reload schema';

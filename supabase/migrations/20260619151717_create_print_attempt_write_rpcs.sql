-- ============================================================================
-- Migration: print_attempt controlled-write RPCs (SECURITY DEFINER)
-- Created: 2026-06-19
-- PRD Reference: docs/10-prd/PRD-092-loyalty-printing-linux-exemplar.md
-- EXEC Reference: docs/21-exec-spec/EXEC-092-loyalty-printing-linux-exemplar.md (WS2)
-- ADR References: ADR-024 (authoritative context), ADR-030 (write-path session vars),
--                 ADR-018 (SECURITY DEFINER governance), ADR-063 D5 (idempotency)
-- Bounded Context: LoyaltyService.InstrumentPrinting submodule
-- Purpose:
--   The ONLY sanctioned mutation route for print_attempt.
--     rpc_request_print_attempt   — INSERT a `requested` row (insert-or-return-prior
--                                    on idempotency-key collision, ADR-063 D5/DEC-005).
--     rpc_transition_print_attempt — mutate ONLY result_status/failure on a `requested`
--                                    row -> terminal. Relies on the WS1 trigger
--                                    (trg_print_attempt_lifecycle) for terminal-row /
--                                    identity-immutability enforcement — NOT re-implemented.
--   Both RPCs: SECURITY DEFINER, SET search_path, set_rls_context_from_staff()
--   (ADR-024 — NO operator_id/casino_id params; derived from context only),
--   role gate pit_boss|admin. casino scope enforced by explicit casino_id filter
--   (DEFINER bypasses RLS).
--   Writes ONLY print_attempt; promo_coupon / loyalty_ledger NEVER written.
--
-- Error codes:
--   P0001 — forbidden / unauthorized (no context or wrong role)
--   P0002 — print_attempt not found (or belongs to another casino)
--   P0003 — instrument_ref does not resolve to a same-casino instrument (P0-2/DEC-003)
--   P0101 — invalid transition target (non-terminal result_status)
--   (P0100 terminal-immutable / P0102 identity-immutable raised by the WS1 trigger)
--
-- Functions:
--   rpc_request_print_attempt          — INSERT `requested` (resolution + idempotency)
--   rpc_transition_print_attempt       — `requested` -> terminal
--   rpc_mark_stale_print_attempts_unknown — bounded crash-window reconciler (P0-4)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. rpc_request_print_attempt — INSERT `requested` (insert-or-return-prior)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_request_print_attempt(
  p_instrument_kind       text,
  p_instrument_ref        uuid,
  p_printer_target_id     text,
  p_template_id           text,
  p_template_version      integer,
  p_receipt_document_hash text,
  p_idempotency_key       text,
  p_station_id            text  DEFAULT NULL,
  p_reprint_of            uuid  DEFAULT NULL,
  p_correlation_id        text  DEFAULT NULL
)
RETURNS public.print_attempt
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id  uuid;
  v_role      text;
  v_existing  public.print_attempt;
  v_result    public.print_attempt;
BEGIN
  -- ADR-024: authoritative context injection (no spoofable params)
  PERFORM set_rls_context_from_staff(p_correlation_id);

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: pit_boss | admin only
  v_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_role IS NULL OR v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can request a print attempt';
  END IF;

  -- ADR-063 D5 / DEC-005: idempotency — return the prior row on key replay.
  -- The WS6 action interprets terminal-vs-in-flight collision semantics; this
  -- RPC's contract is simply insert-or-return-prior on (casino_id, idempotency_key).
  SELECT * INTO v_existing
  FROM print_attempt
  WHERE casino_id = v_casino_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- P0-2 / DEC-003: referential integrity guard. There is deliberately NO hard
  -- FK on instrument_ref, so the DB write boundary (this RPC) — NOT the route —
  -- owns the check that instrument_ref resolves to a REAL, SAME-CASINO instrument
  -- of the declared kind. A non-resolving or cross-casino ref is rejected before
  -- any write (a direct RPC call cannot mint a dangling/cross-casino correlation).
  IF p_instrument_kind = 'promo_coupon' THEN
    PERFORM 1 FROM promo_coupon
      WHERE id = p_instrument_ref AND casino_id = v_casino_id;
  ELSIF p_instrument_kind = 'ledger_entry' THEN
    PERFORM 1 FROM loyalty_ledger
      WHERE id = p_instrument_ref AND casino_id = v_casino_id;
  ELSE
    RAISE EXCEPTION 'invalid_instrument_kind'
      USING ERRCODE = 'P0003',
            HINT = format('unknown instrument_kind %s', p_instrument_kind);
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'instrument_ref_not_resolved'
      USING ERRCODE = 'P0003',
            HINT = 'instrument_ref does not resolve to a same-casino instrument of the declared kind';
  END IF;

  -- INSERT a fresh `requested` row. casino_id/operator_id are CONTEXT-derived
  -- (never params, ADR-024 INV-8). result_status defaults to 'requested'.
  INSERT INTO print_attempt (
    instrument_kind,
    instrument_ref,
    casino_id,
    operator_id,
    printer_target_id,
    station_id,
    template_id,
    template_version,
    receipt_document_hash,
    idempotency_key,
    reprint_of
  ) VALUES (
    p_instrument_kind,
    p_instrument_ref,
    v_casino_id,
    v_actor_id,
    p_printer_target_id,
    p_station_id,
    p_template_id,
    p_template_version,
    p_receipt_document_hash,
    p_idempotency_key,
    p_reprint_of
  )
  RETURNING * INTO v_result;

  RETURN v_result;

EXCEPTION
  -- Concurrent first_print: the UNIQUE(casino_id, idempotency_key) loser
  -- returns the winner's row rather than erroring (single-flight, DEC-005).
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM print_attempt
    WHERE casino_id = v_casino_id
      AND idempotency_key = p_idempotency_key;
    RETURN v_existing;
END;
$$;

COMMENT ON FUNCTION public.rpc_request_print_attempt(text, uuid, text, text, integer, text, text, text, uuid, text) IS
  'PRD-092 WS2: Inserts a `requested` print_attempt (ADR-024 context-derived casino/operator). '
  'Resolves instrument_ref to a same-casino promo_coupon|loyalty_ledger row before INSERT '
  '(P0-2/DEC-003 — the no-FK referential guard lives at the write boundary; P0003 on miss). '
  'Insert-or-return-prior on (casino_id, idempotency_key) replay (ADR-063 D5 / DEC-005). '
  'Role gate pit_boss|admin. Writes ONLY print_attempt. The admin test-print path is adapter-only '
  '(no instrument, no audit row) and does NOT call this RPC.';

REVOKE ALL ON FUNCTION public.rpc_request_print_attempt(text, uuid, text, text, integer, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_print_attempt(text, uuid, text, text, integer, text, text, text, uuid, text) TO authenticated;


-- ============================================================================
-- 2. rpc_transition_print_attempt — `requested` -> terminal (status/failure only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_transition_print_attempt(
  p_print_attempt_id uuid,
  p_result_status    text,
  p_failure_domain   text DEFAULT NULL,
  p_failure_code     text DEFAULT NULL,
  p_correlation_id   text DEFAULT NULL
)
RETURNS public.print_attempt
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id  uuid;
  v_role      text;
  v_row       public.print_attempt;
  v_result    public.print_attempt;
BEGIN
  -- ADR-024: authoritative context injection
  PERFORM set_rls_context_from_staff(p_correlation_id);

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  v_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_role IS NULL OR v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can transition a print attempt';
  END IF;

  -- Clean pre-check: only terminal targets are legal (the WS1 trigger also
  -- enforces this with P0101, but we surface a friendly error first).
  IF p_result_status NOT IN ('submitted', 'failed', 'unknown') THEN
    RAISE EXCEPTION 'invalid_transition'
      USING ERRCODE = 'P0101',
            HINT = 'result_status must transition to submitted|failed|unknown';
  END IF;

  -- Same-casino scope: a target in another casino is NOT FOUND (DEFINER bypasses
  -- RLS, so the explicit casino_id filter is the scope guard). Lock the row.
  SELECT * INTO v_row
  FROM print_attempt
  WHERE print_attempt_id = p_print_attempt_id
    AND casino_id = v_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'print_attempt_not_found'
      USING ERRCODE = 'P0002',
            HINT = 'Attempt does not exist or belongs to a different casino';
  END IF;

  -- Mutate ONLY result_status + failure columns. Terminal-row immutability and
  -- identity immutability are the WS1 trigger's job (P0100 / P0102) and will
  -- raise here if v_row is already terminal — we deliberately do NOT duplicate it.
  UPDATE print_attempt
  SET result_status  = p_result_status,
      failure_domain = p_failure_domain,
      failure_code   = p_failure_code
  WHERE print_attempt_id = p_print_attempt_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_transition_print_attempt(uuid, text, text, text, text) IS
  'PRD-092 WS2: Transitions a `requested` print_attempt to a terminal outcome, mutating '
  'ONLY result_status/failure_domain/failure_code. Terminal-row + identity immutability are '
  'enforced by trg_print_attempt_lifecycle (P0100/P0102), not re-implemented here. '
  'An explicit REPRINT is NOT a mutation of a terminal row — it is a fresh '
  'rpc_request_print_attempt with a new reprint-nonce idempotency_key and reprint_of set. '
  'Role gate pit_boss|admin; same-casino scope (P0002 otherwise).';

REVOKE ALL ON FUNCTION public.rpc_transition_print_attempt(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_transition_print_attempt(uuid, text, text, text, text) TO authenticated;


-- ============================================================================
-- 3. rpc_mark_stale_print_attempts_unknown — crash-window reconciler (P0-4)
-- ----------------------------------------------------------------------------
-- A crash after spooler acceptance but before the terminal transition can
-- strand an attempt in `requested` forever. Because the architecture is one-way
-- (submitted != printed; failure_domain=device deferred), we CANNOT know whether
-- such a job physically printed — so the only honest terminal sink is `unknown`.
--
-- This is a BOUNDED, idempotent sweep over the caller's own casino:
--   - frozen staleness threshold (15 minutes) — no caller-supplied age (no
--     spoofable window); invariant lives in the function body, not config drift.
--   - only `requested` rows older than the threshold transition, and only to
--     `unknown` (the WS1 trigger independently allows requested -> unknown).
--   - FOR UPDATE SKIP LOCKED so a concurrent transition of a specific row wins
--     the race rather than deadlocking the sweep.
-- Invocation for the exemplar is request-time / admin-triggered — NO scheduler
-- platform (pg_cron / external cron) is introduced (pilot containment).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_mark_stale_print_attempts_unknown(
  p_correlation_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_casino_id uuid;
  v_role      text;
  v_count     integer;
  -- Frozen staleness threshold (EXEC-092 P0-4). A `requested` row older than
  -- this with no terminal transition is presumed orphaned by a crash.
  c_stale_threshold constant interval := interval '15 minutes';
BEGIN
  PERFORM set_rls_context_from_staff(p_correlation_id);

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: context not established'
      USING ERRCODE = 'P0001';
  END IF;

  v_role := NULLIF(current_setting('app.staff_role', true), '');
  IF v_role IS NULL OR v_role NOT IN ('pit_boss', 'admin') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = 'P0001',
            HINT = 'Only pit_boss or admin roles can reconcile stale print attempts';
  END IF;

  WITH stale AS (
    SELECT print_attempt_id
    FROM print_attempt
    WHERE casino_id = v_casino_id
      AND result_status = 'requested'
      AND requested_at < now() - c_stale_threshold
    FOR UPDATE SKIP LOCKED
  )
  UPDATE print_attempt p
  SET result_status = 'unknown'
  FROM stale
  WHERE p.print_attempt_id = stale.print_attempt_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rpc_mark_stale_print_attempts_unknown(text) IS
  'PRD-092 WS2 / P0-4: bounded crash-window reconciler. Transitions the caller-casino '
  'stale `requested` rows (older than a frozen 15-minute threshold) to `unknown` — the only '
  'honest sink for a one-way path that cannot confirm physical print. Role gate pit_boss|admin; '
  'request-time/admin invocation (no scheduler). Returns the reconciled row count.';

REVOKE ALL ON FUNCTION public.rpc_mark_stale_print_attempts_unknown(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_stale_print_attempts_unknown(text) TO authenticated;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration: Create print_attempt table + closed-lifecycle trigger + RLS
-- Created: 2026-06-19
-- PRD Reference: docs/10-prd/PRD-092-loyalty-printing-linux-exemplar.md
-- EXEC Reference: docs/21-exec-spec/EXEC-092-loyalty-printing-linux-exemplar.md
-- ADR References: ADR-062 (D2 single audit-controlled lifecycle row),
--                 ADR-015/020/024 (Pattern C casino-scoped hybrid RLS)
-- Bounded Context: LoyaltyService.InstrumentPrinting submodule (WS1)
-- Purpose:
--   Dedicated audit-controlled relation — one lifecycle row per print attempt.
--   POLYMORPHIC instrument correlation (DEC-003): instrument_kind +
--   instrument_ref uuid with NO hard FK to promo_coupon / loyalty_ledger, so the
--   no-instrument-authoring invariant is preserved (this submodule writes ONLY
--   print_attempt; promo_coupon / promo_program / loyalty_ledger are READ-ONLY).
--   Closed state machine (requested -> exactly once -> terminal) and
--   identity/correlation immutability are enforced by a BEFORE UPDATE TRIGGER,
--   NOT by RLS. RLS governs row(casino) + role access only.
--
-- Scope guardrails (Linux/CUPS exemplar — ADR-062 D8 Phase 1):
--   - failure_domain CHECK FORBIDS 'device' this phase (§7a hard deferral;
--     only NULL or 'render_validation' permitted).
--   - submitted != printed; no acknowledged/printed/completed state.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Table: print_attempt
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.print_attempt (
  -- Immutable identity / correlation (frozen at insert; trigger-enforced) ------
  print_attempt_id     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- DEC-003: polymorphic instrument correlation. CHECK on kind; NO hard FK.
  instrument_kind      text        NOT NULL
                                   CHECK (instrument_kind IN ('promo_coupon', 'ledger_entry')),
  instrument_ref       uuid        NOT NULL,

  casino_id            uuid        NOT NULL REFERENCES public.casino(id),
  operator_id          uuid        NOT NULL REFERENCES public.staff(id),
  printer_target_id    text        NOT NULL,
  station_id           text        NULL,
  requested_at         timestamptz NOT NULL DEFAULT now(),
  template_id          text        NOT NULL,
  template_version     integer     NOT NULL,
  receipt_document_hash text       NOT NULL,

  -- Mutable lifecycle outcome (transition RPC + trigger-guarded) ---------------
  result_status        text        NOT NULL DEFAULT 'requested'
                                   CHECK (result_status IN ('requested', 'submitted', 'failed', 'unknown')),
  -- §7a deferral: 'device' is FORBIDDEN this phase. Permitted: NULL,
  -- 'render_validation' (pre-adapter validation) or 'transport_submission'
  -- (DEC-006: agent-unreachable / spooler-reject — a non-device transport fault).
  failure_domain       text        NULL
                                   CHECK (failure_domain IS NULL OR failure_domain IN ('render_validation', 'transport_submission')),
  failure_code         text        NULL,

  -- Server-derived idempotency (DEC-005) + reprint lineage --------------------
  idempotency_key      text        NOT NULL,
  reprint_of           uuid        NULL REFERENCES public.print_attempt(print_attempt_id),

  -- Single-flight primitive: one server-derived key per attempt per casino.
  CONSTRAINT print_attempt_idempotency_unique UNIQUE (casino_id, idempotency_key)
);

COMMENT ON TABLE public.print_attempt IS
  'PRD-092: Audit-controlled lifecycle row per loyalty-instrument print attempt (ADR-062 D2). '
  'Writes ONLY here; promo_coupon / loyalty_ledger READ-ONLY (DEC-003 polymorphic ref, no hard FK). '
  'Closed state machine + identity immutability enforced by trigger, not RLS.';

COMMENT ON COLUMN public.print_attempt.instrument_kind IS
  'DEC-003 discriminator: promo_coupon (entitlement) | ledger_entry (points_comp). CHECK only, no FK.';
COMMENT ON COLUMN public.print_attempt.instrument_ref IS
  'Polymorphic uuid reference to the source instrument. NO hard FK — referential validity is the '
  'controlled action''s read-only same-casino resolution guard (WS6), preserving no-authoring.';
COMMENT ON COLUMN public.print_attempt.result_status IS
  'Four-state vocabulary: requested -> terminal {submitted|failed|unknown}. submitted != printed.';
COMMENT ON COLUMN public.print_attempt.failure_domain IS
  'render_validation (pre-adapter) | transport_submission (DEC-006: agent-unreachable / spooler-reject). '
  '''device'' is FORBIDDEN (§7a hard deferral); CHECK rejects it.';
COMMENT ON COLUMN public.print_attempt.idempotency_key IS
  'Server-derived (DEC-005): hash(instrument_kind, instrument_ref, intent). Client never mints it.';
COMMENT ON COLUMN public.print_attempt.reprint_of IS
  'Self-FK lineage — NULL for first_print; populated for an explicit reprint instance.';

-- ============================================================================
-- Index: print-health signal + stuck-`requested` sweeps
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_print_attempt_casino_status_requested
  ON public.print_attempt (casino_id, result_status, requested_at);

-- ============================================================================
-- Closed-lifecycle + immutability trigger (NOT RLS's job)
-- ----------------------------------------------------------------------------
-- Enforces, on every UPDATE:
--   1. Terminal rows {submitted|failed|unknown} reject ALL mutation (exactly-once).
--   2. From `requested`, the only legal transition is to a terminal status.
--   3. Identity / correlation columns are immutable after insert.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_print_attempt_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- (1) Terminal rows are frozen — reject any mutation (exactly-once guarantee).
  IF OLD.result_status <> 'requested' THEN
    RAISE EXCEPTION 'print_attempt_terminal_immutable'
      USING ERRCODE = 'P0100',
            HINT = format('print_attempt %s is terminal (%s); terminal rows are immutable',
                          OLD.print_attempt_id, OLD.result_status);
  END IF;

  -- (2) From `requested`, the only legal transition is to a terminal status.
  IF NEW.result_status NOT IN ('submitted', 'failed', 'unknown') THEN
    RAISE EXCEPTION 'print_attempt_invalid_transition'
      USING ERRCODE = 'P0101',
            HINT = format('requested may transition only to submitted|failed|unknown, not %s',
                          NEW.result_status);
  END IF;

  -- (3) Identity / correlation columns are immutable after insert.
  IF NEW.print_attempt_id     IS DISTINCT FROM OLD.print_attempt_id
     OR NEW.instrument_kind   IS DISTINCT FROM OLD.instrument_kind
     OR NEW.instrument_ref    IS DISTINCT FROM OLD.instrument_ref
     OR NEW.casino_id         IS DISTINCT FROM OLD.casino_id
     OR NEW.operator_id       IS DISTINCT FROM OLD.operator_id
     OR NEW.printer_target_id IS DISTINCT FROM OLD.printer_target_id
     OR NEW.station_id        IS DISTINCT FROM OLD.station_id
     OR NEW.requested_at      IS DISTINCT FROM OLD.requested_at
     OR NEW.template_id       IS DISTINCT FROM OLD.template_id
     OR NEW.template_version  IS DISTINCT FROM OLD.template_version
     OR NEW.receipt_document_hash IS DISTINCT FROM OLD.receipt_document_hash
     OR NEW.idempotency_key   IS DISTINCT FROM OLD.idempotency_key
     OR NEW.reprint_of        IS DISTINCT FROM OLD.reprint_of
  THEN
    RAISE EXCEPTION 'print_attempt_identity_immutable'
      USING ERRCODE = 'P0102',
            HINT = 'Identity / correlation columns cannot be modified after insert';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_print_attempt_lifecycle() IS
  'PRD-092 WS1: BEFORE UPDATE guard on print_attempt. Closed state machine '
  '(requested -> exactly once -> terminal), terminal-row immutability, and '
  'identity/correlation immutability. Column scope is the trigger''s job, NOT RLS. '
  'Error codes: P0100 (terminal immutable), P0101 (invalid transition), P0102 (identity immutable).';

CREATE TRIGGER trg_print_attempt_lifecycle
  BEFORE UPDATE ON public.print_attempt
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_print_attempt_lifecycle();

-- ============================================================================
-- RLS: Pattern C casino-scoped hybrid — READ scope only (ADR-015/020/024)
-- ----------------------------------------------------------------------------
-- CONTROLLED-WRITE BOUNDARY (DEC-007): print_attempt is RPC-ONLY for writes.
-- ALL mutation flows through the WS2 SECURITY DEFINER RPCs
-- (rpc_request_print_attempt / rpc_transition_print_attempt), which derive the
-- authoritative actor/casino context (ADR-024), the server-derived idempotency
-- key (DEC-005), and the instrument_ref resolution guard (DEC-003/P0-2). A
-- direct PostgREST/client INSERT or UPDATE would bypass all of those, allowing
-- a forged operator_id, an arbitrary idempotency key, a fabricated 'submitted'
-- row that never reached an adapter, or a dangling instrument_ref. The DEFINER
-- RPCs bypass RLS, so denying direct DML here costs no legitimate path.
-- Column / state scope on the RPC UPDATE remains the trigger's job (above).
-- ============================================================================

ALTER TABLE public.print_attempt ENABLE ROW LEVEL SECURITY;

-- SELECT: same-casino staff may read (print-health surface).
CREATE POLICY print_attempt_select_same_casino ON public.print_attempt
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: direct DML DENIED — the request RPC (DEFINER) is the only insert path.
CREATE POLICY print_attempt_no_direct_insert ON public.print_attempt
  FOR INSERT WITH CHECK (false);

-- UPDATE: direct DML DENIED — the transition RPC (DEFINER) is the only update path.
CREATE POLICY print_attempt_no_direct_update ON public.print_attempt
  FOR UPDATE USING (false);

-- DELETE: denied (append-only audit semantics).
CREATE POLICY print_attempt_no_delete ON public.print_attempt
  FOR DELETE USING (false);

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

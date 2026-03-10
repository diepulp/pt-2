-- =====================================================================
-- EXEC-050 WS2: Player Exclusion — Table, Helper Functions, Indexes
-- Bounded Context: PlayerService (ADR-042)
-- Critical table per ADR-030 D4 (session-var-only writes)
-- =====================================================================

-- =====================================================================
-- 1. Exclusion type and enforcement enums (CHECK constraints)
-- =====================================================================

-- exclusion_type: legal/business classification — WHY the restriction exists
-- enforcement: system action — HOW the system responds
-- These are orthogonal axes (ADR-042 D2).

-- =====================================================================
-- 2. Table: player_exclusion
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.player_exclusion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id UUID NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  -- Classification (WHY)
  exclusion_type TEXT NOT NULL
    CONSTRAINT chk_exclusion_type CHECK (exclusion_type IN (
      'self_exclusion', 'trespass', 'regulatory', 'internal_ban', 'watchlist'
    )),

  -- Enforcement (HOW) — orthogonal to type (ADR-042 D2)
  enforcement TEXT NOT NULL
    CONSTRAINT chk_enforcement CHECK (enforcement IN (
      'hard_block', 'soft_alert', 'monitor'
    )),

  -- Temporal bounds
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  review_date TIMESTAMPTZ,

  -- Record details
  reason TEXT NOT NULL,
  external_ref TEXT,
  jurisdiction TEXT,

  -- Creation audit
  created_by UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Lift audit (soft-delete pattern — preserves compliance history)
  lifted_by UUID REFERENCES staff(id) ON DELETE RESTRICT,
  lifted_at TIMESTAMPTZ,
  lift_reason TEXT,

  -- Schema invariants (AUDIT-C4)
  CONSTRAINT chk_temporal_sanity CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT chk_lift_field_consistency CHECK (
    (lifted_at IS NULL) = (lifted_by IS NULL)
  )
);

COMMENT ON TABLE public.player_exclusion IS
  'Player exclusion/ban/watchlist records. Property-scoped MVP (ADR-042). Critical table per ADR-030 D4.';

-- =====================================================================
-- 3. Lift-only UPDATE trigger (AUDIT-C6)
-- Only lifted_at, lifted_by, lift_reason may be changed after creation.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_player_exclusion_lift_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Allow changes ONLY to lift fields
  IF NEW.casino_id     IS DISTINCT FROM OLD.casino_id
  OR NEW.player_id     IS DISTINCT FROM OLD.player_id
  OR NEW.exclusion_type IS DISTINCT FROM OLD.exclusion_type
  OR NEW.enforcement   IS DISTINCT FROM OLD.enforcement
  OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
  OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
  OR NEW.review_date   IS DISTINCT FROM OLD.review_date
  OR NEW.reason        IS DISTINCT FROM OLD.reason
  OR NEW.external_ref  IS DISTINCT FROM OLD.external_ref
  OR NEW.jurisdiction  IS DISTINCT FROM OLD.jurisdiction
  OR NEW.created_by    IS DISTINCT FROM OLD.created_by
  OR NEW.created_at    IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'EXCLUSION_IMMUTABLE: Only lifted_at, lifted_by, and lift_reason may be updated on player_exclusion records';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_player_exclusion_lift_only
  BEFORE UPDATE ON public.player_exclusion
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_player_exclusion_lift_only();

-- =====================================================================
-- 4. Canonical active predicate (ADR-042 D3)
-- Single source of truth for "is this exclusion currently active?"
-- Used by enforcement guards, service queries, search joins, reporting.
-- Indexes use lifted_at IS NULL only; temporal filtering at query time.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_exclusion_active(excl public.player_exclusion)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT excl.lifted_at IS NULL
    AND excl.effective_from <= now()
    AND (excl.effective_until IS NULL OR excl.effective_until > now());
$function$;

COMMENT ON FUNCTION public.is_exclusion_active(public.player_exclusion) IS
  'Canonical active predicate for player exclusions (ADR-042 D3). Single source of truth.';

-- =====================================================================
-- 5. Enforcement precedence collapse (ADR-042 D4)
-- Returns collapsed exclusion status for a player at a casino.
-- hard_block > soft_alert > monitor > clear
-- INTERNAL helper — called by RPC wrapper, not directly by clients.
-- =====================================================================

-- INTERNAL: Do not call directly from client code. Use rpc_get_player_exclusion_status.
CREATE OR REPLACE FUNCTION public.get_player_exclusion_status(
  p_player_id UUID,
  p_casino_id UUID
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $function$
  SELECT COALESCE(
    (
      SELECT
        CASE pe.enforcement
          WHEN 'hard_block'  THEN 'blocked'
          WHEN 'soft_alert'  THEN 'alert'
          WHEN 'monitor'     THEN 'watchlist'
        END
      FROM public.player_exclusion pe
      WHERE pe.player_id = p_player_id
        AND pe.casino_id = p_casino_id
        AND public.is_exclusion_active(pe)
      ORDER BY
        CASE pe.enforcement
          WHEN 'hard_block' THEN 1
          WHEN 'soft_alert' THEN 2
          WHEN 'monitor'    THEN 3
        END
      LIMIT 1
    ),
    'clear'
  );
$function$;

COMMENT ON FUNCTION public.get_player_exclusion_status(UUID, UUID) IS
  'INTERNAL: Enforcement precedence collapse (ADR-042 D4). Returns blocked|alert|watchlist|clear. Called by rpc_get_player_exclusion_status.';

-- =====================================================================
-- 6. Indexes (DA-F1: no now() in predicates — temporal filters at query time)
-- =====================================================================

-- Primary lookup: active exclusions for a player at a casino
CREATE INDEX IF NOT EXISTS ix_player_exclusion_active
  ON public.player_exclusion (casino_id, player_id)
  WHERE lifted_at IS NULL;

-- Review date lookup: upcoming reviews for active exclusions
CREATE INDEX IF NOT EXISTS ix_player_exclusion_review
  ON public.player_exclusion (review_date)
  WHERE lifted_at IS NULL AND review_date IS NOT NULL;

-- Jurisdiction/type lookup: regulatory reporting
CREATE INDEX IF NOT EXISTS ix_player_exclusion_jurisdiction
  ON public.player_exclusion (jurisdiction, exclusion_type)
  WHERE lifted_at IS NULL;

-- =====================================================================
-- 7. Enable RLS (policies in separate WS3 migration)
-- =====================================================================

ALTER TABLE public.player_exclusion ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 8. PostgREST schema reload
-- =====================================================================

NOTIFY pgrst, 'reload schema';

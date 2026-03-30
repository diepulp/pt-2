-- ============================================================================
-- ISS-EXCL-005: Fix is_exclusion_active() volatility
-- Created: 2026-03-29
-- Purpose: Change IMMUTABLE → STABLE. The function calls now() which is
--          non-deterministic — IMMUTABLE lets PostgreSQL cache stale results.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_exclusion_active(excl public.player_exclusion)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT excl.lifted_at IS NULL
    AND excl.effective_from <= now()
    AND (excl.effective_until IS NULL OR excl.effective_until > now());
$function$;

COMMENT ON FUNCTION public.is_exclusion_active(public.player_exclusion) IS
  'Canonical active predicate for player exclusions (ADR-042 D3). STABLE — calls now().';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration: PRD-038 RLS Policies + Privilege Posture
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-038-shift-rundown-persistence-deltas-v0.1.md
-- ADR References: ADR-015 (Pattern C hybrid), ADR-020 (Track A), ADR-038
-- Purpose: Casino-scoped SELECT RLS on table_rundown_report and
--          shift_checkpoint. Write denial via privilege posture (REVOKE ALL +
--          GRANT SELECT). Writes occur exclusively via SECURITY DEFINER RPCs.
-- Bounded Context: TableContextService
-- ============================================================================

-- ============================================================================
-- 1. table_rundown_report — RLS + Privilege Posture
-- ============================================================================

ALTER TABLE public.table_rundown_report ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated staff can read (casino-scoped, Pattern C hybrid)
CREATE POLICY "rundown_report_select" ON public.table_rundown_report
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
);

-- Privilege posture: REVOKE all, GRANT SELECT only.
-- Writes occur exclusively through GRANT EXECUTE on SECURITY DEFINER RPCs.
REVOKE ALL ON public.table_rundown_report FROM authenticated;
GRANT SELECT ON public.table_rundown_report TO authenticated;

-- ============================================================================
-- 2. shift_checkpoint — RLS + Privilege Posture
-- ============================================================================

ALTER TABLE public.shift_checkpoint ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated staff can read (casino-scoped, Pattern C hybrid)
CREATE POLICY "shift_checkpoint_select" ON public.shift_checkpoint
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
);

-- Privilege posture: REVOKE all, GRANT SELECT only.
REVOKE ALL ON public.shift_checkpoint FROM authenticated;
GRANT SELECT ON public.shift_checkpoint TO authenticated;

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

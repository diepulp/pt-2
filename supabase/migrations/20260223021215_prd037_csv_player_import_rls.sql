-- ============================================================================
-- Migration: PRD-037 CSV Player Import — RLS Policies
-- Created: 2026-02-23
-- PRD Reference: docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md
-- EXEC-SPEC: docs/21-exec-spec/EXEC-037-csv-player-import.md
-- ADR References: ADR-015 (Pattern C hybrid), ADR-020 (Track A MVP),
--                 ADR-024 (authoritative context), ADR-030 (write-path tightening)
-- Markers: ADR-015, ADR-020, ADR-024, ADR-030
--
-- Purpose:
--   Casino-scoped RLS policies for import_batch and import_row tables.
--   - SELECT: Pattern C hybrid (session-var + JWT fallback) with role gate
--   - INSERT/UPDATE: Session-vars only (no JWT fallback) per ADR-030 D4
--   - DELETE: Denied on both tables
--   - Role gate: admin and pit_boss only (dealer and cashier excluded)
--   - Actor binding on import_batch INSERT (created_by_staff_id = app.actor_id)
--
-- NOTE: RLS ENABLE + FORCE ROW LEVEL SECURITY is already set in the WS1
--   migration (20260223021214). This migration only creates policies.
-- ============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  import_batch POLICIES                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- import_batch SELECT — Pattern C hybrid + role gate
-- Read path: allows JWT fallback for direct PostgREST reads
-- -----------------------------------------------------------------------------
CREATE POLICY import_batch_select ON public.import_batch
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'staff_role'), '')
    ) IN ('pit_boss', 'admin')
  );

-- -----------------------------------------------------------------------------
-- import_batch INSERT — Session-vars only + actor binding + role gate
-- Write path: RPC-only writes (ADR-030 D4 — no JWT fallback)
-- Actor binding: created_by_staff_id must match app.actor_id
-- -----------------------------------------------------------------------------
CREATE POLICY import_batch_insert ON public.import_batch
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND created_by_staff_id = NULLIF((select current_setting('app.actor_id', true)), '')::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') IN ('pit_boss', 'admin')
  );

-- -----------------------------------------------------------------------------
-- import_batch UPDATE — Session-vars only + role gate
-- Write path: RPC-only writes (ADR-030 D4 — no JWT fallback)
-- -----------------------------------------------------------------------------
CREATE POLICY import_batch_update ON public.import_batch
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') IN ('pit_boss', 'admin')
  );

-- -----------------------------------------------------------------------------
-- import_batch DELETE — Denied (staging data is immutable for audit trail)
-- -----------------------------------------------------------------------------
CREATE POLICY import_batch_no_delete ON public.import_batch
  FOR DELETE
  USING ((select auth.uid()) IS NOT NULL AND false);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  import_row POLICIES                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- import_row SELECT — Pattern C hybrid + role gate
-- Read path: allows JWT fallback for direct PostgREST reads
-- -----------------------------------------------------------------------------
CREATE POLICY import_row_select ON public.import_row
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'casino_id'), '')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      NULLIF(((select auth.jwt()) -> 'app_metadata' ->> 'staff_role'), '')
    ) IN ('pit_boss', 'admin')
  );

-- -----------------------------------------------------------------------------
-- import_row INSERT — Session-vars only + role gate
-- Write path: RPC-only writes (ADR-030 D4 — no JWT fallback)
-- -----------------------------------------------------------------------------
CREATE POLICY import_row_insert ON public.import_row
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') IN ('pit_boss', 'admin')
  );

-- -----------------------------------------------------------------------------
-- import_row UPDATE — Session-vars only + role gate
-- Write path: RPC-only writes (ADR-030 D4 — no JWT fallback)
-- -----------------------------------------------------------------------------
CREATE POLICY import_row_update ON public.import_row
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = NULLIF((select current_setting('app.casino_id', true)), '')::uuid
    AND NULLIF((select current_setting('app.staff_role', true)), '') IN ('pit_boss', 'admin')
  );

-- -----------------------------------------------------------------------------
-- import_row DELETE — Denied (staging data is immutable for audit trail)
-- -----------------------------------------------------------------------------
CREATE POLICY import_row_no_delete ON public.import_row
  FOR DELETE
  USING ((select auth.uid()) IS NOT NULL AND false);

-- ============================================================================
-- PostgREST schema reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';

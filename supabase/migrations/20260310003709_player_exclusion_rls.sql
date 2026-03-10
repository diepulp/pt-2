-- =====================================================================
-- EXEC-050 WS3: Player Exclusion RLS Policies
-- Bounded Context: PlayerService (ADR-042)
-- Critical table per ADR-030 D4
--
-- SELECT: Pattern C hybrid (COALESCE casino_id, all authenticated)
-- INSERT: Session-var-only casino scope, pit_boss/admin (ADR-030)
-- UPDATE: Session-var-only casino scope, admin only (lift-only per AUDIT-C6)
-- DELETE: Denied for all roles
-- =====================================================================

-- =====================================================================
-- 1. SELECT — Pattern C hybrid (ADR-015)
-- All authenticated staff can read exclusions for their casino.
-- =====================================================================

CREATE POLICY player_exclusion_select_casino
  ON public.player_exclusion
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- =====================================================================
-- 2. INSERT — Session-var-only casino scope (ADR-030 D4, critical table)
-- pit_boss and admin can create exclusion records.
-- No JWT fallback for casino_id — write fails if app.casino_id unset.
-- JWT fallback permitted for staff_role only (Option B per AUDIT-C2).
-- =====================================================================

CREATE POLICY player_exclusion_insert_role
  ON public.player_exclusion
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- =====================================================================
-- 3. UPDATE — Session-var-only casino scope, admin only
-- UPDATE exists ONLY for lift operations (lifted_at, lifted_by, lift_reason).
-- Non-lift field mutations rejected by BEFORE UPDATE trigger (AUDIT-C6).
-- =====================================================================

CREATE POLICY player_exclusion_update_admin
  ON public.player_exclusion
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) = 'admin'
  );

-- =====================================================================
-- 4. DELETE — Denied for all roles (compliance audit trail)
-- =====================================================================

CREATE POLICY player_exclusion_no_delete
  ON public.player_exclusion
  FOR DELETE
  USING (false);

-- =====================================================================
-- 5. PostgREST schema reload
-- =====================================================================

NOTIFY pgrst, 'reload schema';

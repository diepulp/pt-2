-- Migration: SEC-011 — Revoke authenticated direct table access on outbox transport surfaces
-- Description: Privilege-layer denial for ADR-054 R3 outbox transport surfaces.
-- Reference: ADR-054
-- VERIFIED_SAFE: No SELECT/INSERT/UPDATE/DELETE policies remain for authenticated
--   after this migration. Intentional security hardening — no re-grant needed.
--   RLS stays enabled as defence-in-depth. service_role access unaffected.
-- RLS_REVIEW_COMPLETE
--
-- ADR-054 R3 mandates that finance_outbox and processed_messages are
-- service_role-only surfaces. The relay worker and the cleanup cron are the
-- only callers and both use service_role. Direct authenticated table access
-- must be denied at the privilege layer, not only via RLS policies.
--
-- History:
--   Phase 2.1 (20260517234015) revoked INSERT on finance_outbox.
--   The original processed_messages migration (20260511134418) assumed
--   "no policy = deny" but Supabase grants all DML to authenticated on
--   new tables by default unless explicitly revoked.
--
-- After this migration:
--   finance_outbox  — authenticated: no SELECT / INSERT / UPDATE / DELETE
--   processed_messages — authenticated: no SELECT / INSERT / UPDATE / DELETE
--   Both tables: service_role retains full access (bypasses RLS).
--   RLS remains enabled on both tables as a defence-in-depth layer.

-- ── finance_outbox ────────────────────────────────────────────────────────────
-- INSERT was already revoked in Phase 2.1. Revoke the remaining three.
REVOKE SELECT, UPDATE, DELETE ON public.finance_outbox FROM authenticated;

-- Drop the legacy RLS policies that granted SELECT / INSERT to authenticated.
-- They are redundant once the table-level privilege is revoked and become
-- misleading documentation of intent (ADR-054 R3 supersedes the pre-Wave-2
-- RLS-only access model on this table).
DROP POLICY IF EXISTS finance_outbox_select ON public.finance_outbox;
DROP POLICY IF EXISTS finance_outbox_insert ON public.finance_outbox;
DROP POLICY IF EXISTS finance_outbox_no_updates ON public.finance_outbox;
DROP POLICY IF EXISTS finance_outbox_no_deletes ON public.finance_outbox;

-- ── processed_messages ────────────────────────────────────────────────────────
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.processed_messages FROM authenticated;

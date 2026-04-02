-- ============================================================================
-- Migration: Add dto_before, dto_after, correlation_id to audit_log
-- Created: 2026-04-02
-- Purpose: Corrective migration — promo instrument RPCs (rpc_issue_promo_coupon,
--          rpc_void_promo_coupon, rpc_replace_promo_coupon) reference these
--          columns when inserting audit_log rows, but the columns were never
--          added to the table. The RPCs were created in:
--            - 20260106235611_loyalty_promo_instruments.sql
--            - 20260319010843_add_role_gate_rpc_issue_promo_coupon.sql
-- ============================================================================

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS dto_before jsonb,
  ADD COLUMN IF NOT EXISTS dto_after jsonb,
  ADD COLUMN IF NOT EXISTS correlation_id text;

COMMENT ON COLUMN public.audit_log.dto_before IS
  'Snapshot of entity state before the action (used by promo instrument RPCs for void/replace audit trail)';

COMMENT ON COLUMN public.audit_log.dto_after IS
  'Snapshot of entity state after the action (used by promo instrument RPCs for issue/void/replace audit trail)';

COMMENT ON COLUMN public.audit_log.correlation_id IS
  'Optional correlation ID for tracing related operations across RPCs';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

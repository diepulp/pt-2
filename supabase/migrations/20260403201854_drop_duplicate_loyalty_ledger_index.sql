-- =====================================================
-- Migration: Drop Duplicate Index on loyalty_ledger
-- Created: 2026-04-03
-- Purpose: PERF-P2 from Supabase Advisor Report 2026-04-02
--          loyalty_ledger_idempotency_uk duplicates ux_loyalty_ledger_idem
--          (same columns: casino_id, idempotency_key WHERE idempotency_key IS NOT NULL)
--
-- Original: ux_loyalty_ledger_idem (created in prd004_loyalty_service_schema, 2025-12-13)
-- Duplicate: loyalty_ledger_idempotency_uk (created in issue_b5894ed8_p0_blockers, 2025-12-29)
-- =====================================================

DROP INDEX IF EXISTS public.loyalty_ledger_idempotency_uk;

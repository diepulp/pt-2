-- ==========================================================================
-- Drop stale rpc_create_financial_txn overloads
--
-- The PRD-033 migration (20260217153443) added a new overload with
-- p_external_ref, but did not drop the previous 12-param overload.
-- PostgREST cannot disambiguate between them, causing:
--   "Could not choose the best candidate function"
--
-- Additionally, two legacy overloads (7-param and 8-param) predate the
-- current ADR-024-compliant version and are unused.
--
-- This migration drops all 3 stale overloads, leaving only the
-- canonical 13-param version with p_external_ref.
-- ==========================================================================

-- Drop the 12-param overload (no p_external_ref) — direct conflict source
DROP FUNCTION IF EXISTS public.rpc_create_financial_txn(
  uuid, uuid, uuid, numeric, financial_direction, financial_source, uuid,
  text, uuid, uuid, text, timestamptz
);

-- Drop legacy 7-param overload (pre-ADR-024, no direction/source/staff)
DROP FUNCTION IF EXISTS public.rpc_create_financial_txn(
  uuid, uuid, numeric, text, timestamptz, uuid, uuid
);

-- Drop legacy 8-param overload (pre-ADR-024, added idempotency_key)
DROP FUNCTION IF EXISTS public.rpc_create_financial_txn(
  uuid, uuid, numeric, text, timestamptz, uuid, uuid, text
);

NOTIFY pgrst, 'reload schema';

-- Wave 2 RLS hardening for finance_outbox transport tables (PRD-081 WS7_SECURITY)
--
-- Context: The four legacy finance_outbox authenticated policies were already dropped
-- in 20260511134100_wave2_finance_outbox_transform.sql as part of the explicit
-- dependency cleanup before DROP TABLE. This migration performs post-recreate
-- hardening: asserts zero authenticated policies on the new table and enables RLS
-- on processed_messages (authenticated role denied all operations by default).
--
-- No new authenticated policies are added. finance_outbox and processed_messages
-- are service_role-only surfaces for the relay worker.

-- ─────────────────────────────────────────────────────────────────────────────
-- POST-RECREATE ASSERTION: finance_outbox must have zero authenticated policies
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'finance_outbox'
      AND roles && ARRAY['authenticated']::name[]
  ), 'HARDENING FAIL: finance_outbox has authenticated policies after Wave 2 recreate. Remove them before proceeding.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- processed_messages: enable RLS
-- No authenticated policies → INSERT/SELECT/UPDATE/DELETE all denied by default
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Migration: Create email_send_attempt table
-- Created: 2026-04-06
-- PRD Reference: docs/10-prd/PRD-062-pilot-smtp-email-wiring-v0.md
-- EXEC Reference: docs/21-exec-spec/EXEC-062-pilot-smtp-email-wiring.md
-- Purpose: Append-only log of email delivery attempts for pilot SMTP wiring.
--   Casino-scoped with Pattern C hybrid RLS (ADR-015/020).
--   SELECT + INSERT only — no UPDATE or DELETE policies.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Table: email_send_attempt
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_send_attempt (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  casino_id           uuid        NOT NULL REFERENCES public.casino(id),
  original_attempt_id uuid        NULL     REFERENCES public.email_send_attempt(id),
  recipient_email     text        NOT NULL,
  template            text        NOT NULL,
  status              text        NOT NULL CHECK (status IN ('sent', 'failed', 'dismissed')),
  provider_message_id text        NULL,
  error_summary       text        NULL,
  payload_ref         jsonb       NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_send_attempt IS
  'Append-only log of email delivery attempts (PRD-062 pilot SMTP wiring).';

COMMENT ON COLUMN public.email_send_attempt.original_attempt_id IS
  'Self-FK to the first attempt — NULL for the original, populated for retries.';

COMMENT ON COLUMN public.email_send_attempt.template IS
  'Template key, e.g. ''shift_report''.';

COMMENT ON COLUMN public.email_send_attempt.status IS
  'Delivery outcome: sent, failed, or dismissed.';

COMMENT ON COLUMN public.email_send_attempt.payload_ref IS
  'Optional JSONB reference payload (IDs, metadata) — never PII.';

-- ============================================================================
-- Index: operational query on latest attempts per casino
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_email_send_attempt_casino_created
  ON public.email_send_attempt (casino_id, created_at DESC);

-- ============================================================================
-- RLS: Casino-scoped SELECT + INSERT only (Pattern C hybrid, ADR-015/020)
-- ============================================================================

ALTER TABLE public.email_send_attempt ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY email_send_attempt_select ON public.email_send_attempt
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT policy
CREATE POLICY email_send_attempt_insert ON public.email_send_attempt
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

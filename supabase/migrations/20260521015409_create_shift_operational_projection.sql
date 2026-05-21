-- Migration: 20260521015409_create_shift_operational_projection.sql
-- Purpose: Operational (grind/fill/credit) projection store — aggregates amounts
--   per (casino_id, gaming_day, table_id). PRD-088 WS1_DB.
--
-- All writes go through rpc_process_operational_projection (SECURITY DEFINER).
-- No authenticated policies — service_role only (same pattern as visit_class_a_projection).
-- grind_volume_cents/fill_total_cents/credit_total_cents in integer cents.
--
-- Depends on Gate A migrations (20260519183629-34): finance_outbox.gaming_day NOT NULL.
-- Depends on gaming_day_lifecycle (20260519184707) for completeness derivation (WS3_COMPLETENESS).
-- SRM: registered under PlayerFinancialService (SRM 4.25.0).

CREATE TABLE public.shift_operational_projection (
  casino_id          UUID        NOT NULL REFERENCES public.casino(id)        ON DELETE CASCADE,
  gaming_day         DATE        NOT NULL,
  table_id           UUID        NOT NULL REFERENCES public.gaming_table(id)  ON DELETE CASCADE,
  grind_volume_cents BIGINT      NOT NULL DEFAULT 0,
  fill_total_cents   BIGINT      NOT NULL DEFAULT 0,
  credit_total_cents BIGINT      NOT NULL DEFAULT 0,
  event_count        INT         NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (casino_id, gaming_day, table_id)
);

COMMENT ON TABLE public.shift_operational_projection IS
  'Operational outbox projection. Aggregates grind/fill/credit amounts per '
  '(casino_id, gaming_day, table_id). All amounts in integer cents. '
  'All writes via rpc_process_operational_projection (SECURITY DEFINER, I3 atomicity boundary). '
  'PRD-088 WS1_DB.';

ALTER TABLE public.shift_operational_projection ENABLE ROW LEVEL SECURITY;
-- No authenticated policies. All access via SECURITY DEFINER RPCs only.

REVOKE ALL ON TABLE public.shift_operational_projection FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shift_operational_projection TO service_role;

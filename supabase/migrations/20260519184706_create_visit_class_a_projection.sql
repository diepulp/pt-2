-- Migration: 20260519184706_create_visit_class_a_projection.sql
-- Purpose: Class A (ledger) projection store — aggregates buyin/cashout/adjustment
--   amounts per visit + gaming_day. PRD-087 WS1B_GATE_B_DB Gate B.
--
-- All writes go through rpc_process_class_a_projection (SECURITY DEFINER).
-- No authenticated policies — service_role only (same pattern as processed_messages).
-- total_in/total_out/adjustment_net in integer cents (same unit as PFT source).
-- adjustment_net is signed: positive = increase, negative = decrease.
--
-- Depends on Gate A migrations (20260519183629-34): finance_outbox.gaming_day NOT NULL.

CREATE TABLE public.visit_class_a_projection (
  casino_id       UUID        NOT NULL REFERENCES public.casino(id)  ON DELETE CASCADE,
  visit_id        UUID        NOT NULL REFERENCES public.visit(id)   ON DELETE CASCADE,
  gaming_day      DATE        NOT NULL,
  total_in        BIGINT      NOT NULL DEFAULT 0,
  total_out       BIGINT      NOT NULL DEFAULT 0,
  adjustment_net  BIGINT      NOT NULL DEFAULT 0,
  event_count     INT         NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (casino_id, visit_id, gaming_day)
);

COMMENT ON TABLE public.visit_class_a_projection IS
  'Class A (ledger) outbox projection. Aggregates buyin/cashout/adjustment amounts '
  'per visit+gaming_day. total_in/total_out in integer cents. adjustment_net is signed. '
  'All writes via rpc_process_class_a_projection (SECURITY DEFINER, I3 atomicity boundary). '
  'origin_label is an outbox envelope column and is NOT stored here (ADR-054 D5). '
  'PRD-087 WS1B Gate B.';

ALTER TABLE public.visit_class_a_projection ENABLE ROW LEVEL SECURITY;
-- No authenticated policies. All access via SECURITY DEFINER RPCs.
-- INSERT/UPDATE/SELECT denied to authenticated role by default.

GRANT SELECT, INSERT, UPDATE ON public.visit_class_a_projection TO service_role;

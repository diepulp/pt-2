-- Migration: 20260519184707_create_gaming_day_lifecycle.sql
-- Purpose: Gaming day close signal store. Row presence = closed.
--   INSERT-only semantics. No UPDATE or DELETE (close is permanent in Phase 2.3).
--   PRD-087 WS1B_GATE_B_DB Gate B.
--
-- Completeness signal contract (EXEC-087 WS3):
--   LEFT JOIN with visit_class_a_projection to determine 'complete' vs 'partial'.
--   'complete' = projection exists AND gaming_day row present AND backlog = 0.
--
-- All writes via rpc_close_gaming_day (SECURITY DEFINER, service_role-only).
-- No authenticated policies — service_role only.

CREATE TABLE public.gaming_day_lifecycle (
  casino_id   UUID        NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  gaming_day  DATE        NOT NULL,
  closed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (casino_id, gaming_day)
);

COMMENT ON TABLE public.gaming_day_lifecycle IS
  'Gaming day close signal. Row presence = closed window; absence = open. '
  'INSERT-only: close is permanent within Phase 2.3 (no UPDATE/DELETE). '
  'All writes via rpc_close_gaming_day (SECURITY DEFINER, service_role-only). '
  'Used in completeness derivation: closed + empty backlog = complete. '
  'PRD-087 WS1B Gate B.';

ALTER TABLE public.gaming_day_lifecycle ENABLE ROW LEVEL SECURITY;
-- No authenticated policies. All access via SECURITY DEFINER RPCs.
-- INSERT/SELECT denied to authenticated role by default.

GRANT SELECT, INSERT ON public.gaming_day_lifecycle TO service_role;

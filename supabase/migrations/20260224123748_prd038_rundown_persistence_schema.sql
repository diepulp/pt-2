-- ============================================================================
-- Migration: PRD-038 Rundown Persistence & Shift Checkpoint Schema
-- Created: 2026-02-24
-- PRD Reference: docs/10-prd/PRD-038-shift-rundown-persistence-deltas-v0.1.md
-- ADR Reference: docs/80-adrs/ADR-038-rundown-persistence-finalization-contract.md
-- Purpose: New tables (table_rundown_report, shift_checkpoint), session_id FK
--          on table_fill/table_credit for rundown linkage.
-- Bounded Context: TableContextService (SRM v4.16.0)
-- ============================================================================

-- ============================================================================
-- 1. table_rundown_report — Persisted rundown with UPSERT + finalization
-- ============================================================================

CREATE TABLE public.table_rundown_report (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id               UUID NOT NULL REFERENCES casino(id),
  table_session_id        UUID NOT NULL REFERENCES table_session(id),
  gaming_table_id         UUID NOT NULL REFERENCES gaming_table(id),
  gaming_day              DATE NOT NULL,

  -- Snapshot references
  opening_snapshot_id     UUID REFERENCES table_inventory_snapshot(id),
  closing_snapshot_id     UUID REFERENCES table_inventory_snapshot(id),
  drop_event_id           UUID REFERENCES table_drop_event(id),

  -- Computed values
  opening_bankroll_cents  INTEGER,           -- NULL = no opening snapshot
  closing_bankroll_cents  INTEGER,           -- NULL = no closing snapshot
  fills_total_cents       INTEGER NOT NULL DEFAULT 0,
  credits_total_cents     INTEGER NOT NULL DEFAULT 0,
  drop_total_cents        INTEGER,           -- NULL = drop not posted
  table_win_cents         INTEGER,           -- NULL = drop not posted (cannot compute)

  -- Provenance
  opening_source          TEXT NOT NULL,
  computation_grade       TEXT NOT NULL DEFAULT 'ESTIMATE',

  -- Variance
  par_target_cents        INTEGER,
  variance_from_par_cents INTEGER,

  -- Late events
  has_late_events         BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  computed_by             UUID REFERENCES staff(id),
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at            TIMESTAMPTZ,
  finalized_by            UUID REFERENCES staff(id),
  notes                   TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.table_rundown_report IS
  'Persisted rundown report for a table session. UPSERT on (table_session_id). Lifecycle: ABSENT -> DRAFT -> FINALIZED.';
COMMENT ON COLUMN public.table_rundown_report.table_win_cents IS
  'NULL when drop not posted — cannot compute win. Zero is valid.';
COMMENT ON COLUMN public.table_rundown_report.has_late_events IS
  'Monotonic false -> true. Set when fill/credit recorded after finalization.';
COMMENT ON COLUMN public.table_rundown_report.finalized_at IS
  'Immutable once set. Supervisor finalization timestamp.';

-- Unique constraint: one report per session (UPSERT keyed on this)
CREATE UNIQUE INDEX uq_rundown_report_session
  ON public.table_rundown_report (table_session_id);

-- Query index: list reports by casino + gaming day
CREATE INDEX idx_rundown_report_gaming_day
  ON public.table_rundown_report (casino_id, gaming_day);

-- ============================================================================
-- 2. shift_checkpoint — Immutable metric snapshots for delta computation
-- ============================================================================

CREATE TABLE public.shift_checkpoint (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id                 UUID NOT NULL REFERENCES casino(id),
  gaming_day                DATE NOT NULL,

  checkpoint_scope          TEXT NOT NULL DEFAULT 'casino'
                            CHECK (checkpoint_scope IN ('casino', 'pit', 'table')),
  gaming_table_id           UUID REFERENCES gaming_table(id),  -- MVP: always NULL
  pit_id                    UUID,  -- MVP: MUST be NULL. Pit entity not first-class.
                            --   Column reserved for vNext when Pit model is formalized.
                            --   No FK constraint — will be added when pit table is created.

  checkpoint_type           TEXT NOT NULL
                            CHECK (checkpoint_type IN ('mid_shift', 'end_of_shift', 'handoff')),

  window_start              TIMESTAMPTZ NOT NULL,
  window_end                TIMESTAMPTZ NOT NULL,

  -- Metric snapshot
  win_loss_cents            INTEGER,           -- NULL = no tables with coverage
  fills_total_cents         INTEGER NOT NULL DEFAULT 0,
  credits_total_cents       INTEGER NOT NULL DEFAULT 0,
  drop_total_cents          INTEGER,           -- NULL = no drop events
  tables_active             INTEGER NOT NULL DEFAULT 0,
  tables_with_coverage      INTEGER NOT NULL DEFAULT 0,

  -- Buy-in telemetry snapshot
  rated_buyin_cents         INTEGER NOT NULL DEFAULT 0,
  grind_buyin_cents         INTEGER NOT NULL DEFAULT 0,

  -- Cash observation snapshot
  cash_out_observed_cents   INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by                UUID REFERENCES staff(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                     TEXT
);

COMMENT ON TABLE public.shift_checkpoint IS
  'INSERT-only immutable metric snapshots for shift delta computation. MVP: casino scope only.';
COMMENT ON COLUMN public.shift_checkpoint.checkpoint_scope IS
  'MVP: always casino. pit/table scopes deferred to vNext.';
COMMENT ON COLUMN public.shift_checkpoint.pit_id IS
  'Reserved for vNext. No FK — pit is not a first-class entity yet.';
COMMENT ON COLUMN public.shift_checkpoint.win_loss_cents IS
  'NULL = no tables have coverage in window. Zero is valid.';

-- Query index: latest checkpoint by casino + scope
CREATE INDEX idx_shift_checkpoint_latest
  ON public.shift_checkpoint (casino_id, checkpoint_scope, created_at DESC);

-- ============================================================================
-- 3. ALTER TABLE: Add session_id FK to table_fill and table_credit
-- ============================================================================
-- Nullable for backfill compatibility — existing rows have no session linkage.

ALTER TABLE public.table_fill
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_session(id);

COMMENT ON COLUMN public.table_fill.session_id IS
  'Link to table_session for rundown aggregation. NULL for legacy rows.';

CREATE INDEX IF NOT EXISTS idx_table_fill_session
  ON public.table_fill (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.table_credit
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_session(id);

COMMENT ON COLUMN public.table_credit.session_id IS
  'Link to table_session for rundown aggregation. NULL for legacy rows.';

CREATE INDEX IF NOT EXISTS idx_table_credit_session
  ON public.table_credit (session_id)
  WHERE session_id IS NOT NULL;

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';

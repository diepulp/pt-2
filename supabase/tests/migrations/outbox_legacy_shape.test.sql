-- pgTAP migration regression tests: Wave 2 outbox schema shape (PRD-081 WS7_SECURITY)
--
-- Asserts that:
--   - finance_outbox has the Wave 2 columns (event_id, fact_class, origin_label, table_id)
--   - Legacy columns (ledger_id, attempt_count) are absent
--   - table_buyin_telemetry.event_type was added and required columns preserved
--   - table_buyin_telemetry.player_id is absent by DDL construction (ADR-052 R5)

BEGIN;

SELECT plan(10);

-- ─────────────────────────────────────────────────────────────────────────────
-- finance_outbox: Wave 2 columns present
-- ─────────────────────────────────────────────────────────────────────────────

SELECT has_column(
  'public', 'finance_outbox', 'event_id',
  'finance_outbox must have event_id (Wave 2 primary key)'
);

SELECT has_column(
  'public', 'finance_outbox', 'fact_class',
  'finance_outbox must have fact_class (Wave 2 dual-layer model)'
);

SELECT has_column(
  'public', 'finance_outbox', 'origin_label',
  'finance_outbox must have origin_label (Wave 2 provenance)'
);

SELECT has_column(
  'public', 'finance_outbox', 'table_id',
  'finance_outbox must have table_id (table-anchor per ADR-057)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- finance_outbox: legacy columns absent
-- ─────────────────────────────────────────────────────────────────────────────

SELECT hasnt_column(
  'public', 'finance_outbox', 'ledger_id',
  'ledger_id must be absent after Wave 2 transform'
);

SELECT hasnt_column(
  'public', 'finance_outbox', 'attempt_count',
  'attempt_count must be absent after Wave 2 transform'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- table_buyin_telemetry: event_type added, required columns preserved, player_id absent
-- ─────────────────────────────────────────────────────────────────────────────

SELECT has_column(
  'public', 'table_buyin_telemetry', 'event_type',
  'table_buyin_telemetry must have event_type (Wave 2 reconciliation)'
);

SELECT has_column(
  'public', 'table_buyin_telemetry', 'actor_id',
  'table_buyin_telemetry.actor_id must be preserved'
);

SELECT has_column(
  'public', 'table_buyin_telemetry', 'gaming_day',
  'table_buyin_telemetry.gaming_day must be preserved'
);

SELECT hasnt_column(
  'public', 'table_buyin_telemetry', 'player_id',
  'table_buyin_telemetry must not have player_id (ADR-052 R5 — absent by construction)'
);

SELECT * FROM finish();

ROLLBACK;

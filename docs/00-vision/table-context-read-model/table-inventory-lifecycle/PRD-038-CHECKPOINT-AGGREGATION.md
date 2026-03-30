# PRD-038: Checkpoint Aggregation Reference

> How the shift checkpoint aggregates financial data from all tables.

## Overview

The checkpoint is a **casino-scoped aggregate** — it sums all tables' financial transactions at the moment the pit boss clicks "Checkpoint". It is NOT a dashboard screenshot; it's a fresh SQL aggregation.

## Creation Flow

1. **Click "Checkpoint"** → `POST /api/v1/shift-checkpoints`
2. **RPC `rpc_create_shift_checkpoint`** runs server-side:
   - Derives casino context from JWT (ADR-024)
   - Computes gaming day window (e.g. 6:00 AM → now) from casino timezone settings
   - Calls `rpc_shift_table_metrics(window_start, window_end)` → per-table rows
3. **Aggregates all tables** into one casino-wide snapshot (see table below)
4. **Inserts immutable row** into `shift_checkpoint` (INSERT-only, no updates/deletes)

## Aggregation Sources

| Metric | Source Table(s) | Calculation |
|--------|----------------|-------------|
| `win_loss_cents` | `table_inventory_snapshot` + fills + credits | `SUM(closing_bankroll - opening_bankroll + fills - credits)` across all tables |
| `fills_total_cents` | `table_fill` | `SUM(amount_cents)` in window |
| `credits_total_cents` | `table_credit` | `SUM(amount_cents)` in window |
| `rated_buyin_cents` | `table_buyin_telemetry` (RATED_BUYIN) | `SUM(amount_cents)` in window |
| `grind_buyin_cents` | `table_buyin_telemetry` (GRIND_BUYIN) | `SUM(amount_cents)` in window |
| `tables_active` | count of tables with any metrics | |
| `tables_with_coverage` | count with both opening AND closing inventory snapshots | |

## Delta Calculation

`DeltaBadge` polls every 60s via `GET /api/v1/shift-checkpoints/delta`:

1. Fetches **latest checkpoint** as baseline
2. Calls `rpc_shift_table_metrics` again with window from checkpoint start → now
3. Subtracts: `current_metrics - checkpoint_metrics = delta`
4. Displays e.g. "+$2,400 since 11:30 AM"

## MVP Scope Limitations

- `drop_total_cents` — always NULL (casino aggregate drop not tracked yet)
- `cash_out_observed_cents` — always 0 (deferred)
- No per-pit or per-table checkpoint granularity — casino scope only
- Win/loss is NULL if tables lack inventory snapshot coverage (no guessing)

## UI Integration Points

| Component | Location | Wired Into |
|-----------|----------|------------|
| `CheckpointButton` | `components/shift-dashboard/checkpoint-button.tsx` | Shift Dashboard v3 header |
| `DeltaBadge` | `components/shift-dashboard/delta-badge.tsx` | Shift Dashboard v3 header (hidden when no checkpoint) |
| `RundownReportCard` | `components/table/rundown-report-card.tsx` | Inventory panel (pit dashboard) |

## Key Files

- RPC: `supabase/migrations/20260224123756_prd038_checkpoint_rpc.sql`
- Schema: `supabase/migrations/20260224123748_prd038_rundown_persistence_schema.sql`
- CRUD: `services/table-context/shift-checkpoint/crud.ts`
- DTOs: `services/table-context/shift-checkpoint/dtos.ts`
- Hooks: `hooks/table-context/use-create-checkpoint.ts`, `use-checkpoint-delta.ts`

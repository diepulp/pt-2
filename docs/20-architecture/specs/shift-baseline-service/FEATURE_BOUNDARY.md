# Feature Boundary: Shift Baseline Service (Rolling Median+MAD)

> **Ownership Sentence:** This feature belongs to **ShiftIntelligenceService** (new bounded context, Operational category) and may only write to `table_metric_baseline`; cross-context reads access TableContextService data via `rpc_shift_table_metrics` / `rpc_shift_rollups`, RatingSlipService data via `rpc_shift_cash_obs_*` RPCs, and CasinoService's `casino_settings.alert_thresholds.baseline` for configuration.

---

## Bounded Context

- **Owner service(s):**
  - **ShiftIntelligenceService** (NEW) — rolling statistical baseline computation and anomaly detection for shift-level operational metrics

- **Writes:**
  - `table_metric_baseline` (NEW — stored rolling baselines: median, MAD, sample count per table per metric per gaming day)

- **Reads:**
  - `table_drop_event` via `rpc_shift_table_metrics` (TableContextService — drop totals per table per shift window)
  - `pit_cash_observation` via `rpc_shift_cash_obs_table` / `rpc_shift_cash_obs_pit` (RatingSlipService — cash obs aggregates)
  - `table_session` (TableContextService — shift window boundaries, gaming day derivation)
  - `rating_slip` via `rpc_shift_table_metrics` (RatingSlipService — hold% derivation from rated play)
  - `casino_settings.alert_thresholds.baseline` (CasinoService — `window_days`, `method`, `min_history_days`)

- **Cross-context contracts:**
  - `rpc_shift_table_metrics(p_window_start, p_window_end)` — TableContextService/RatingSlipService aggregated metrics
  - `rpc_shift_rollups(p_window_start, p_window_end)` — pit-level rollups
  - `rpc_shift_cash_obs_table(p_start_ts, p_end_ts)` — per-table cash observation aggregates
  - `casino_settings.alert_thresholds` — CasinoService-owned configuration (read-only)
  - `BaselineDTO` (NEW) — published baseline data for consumer RPCs (anomaly alerting, dashboard display)

---

## SRM Registration Required

New entry in SRM under **Operational** category:

| Category | Service | Tables | Responsibility |
|----------|---------|--------|----------------|
| **Operational** | ShiftIntelligenceService | `table_metric_baseline` | Rolling statistical baselines and anomaly detection for shift operational metrics |

---

**Gate:** Ownership sentence written. Tables validated against SRM — `table_metric_baseline` is a new table owned exclusively by ShiftIntelligenceService. No cross-context write violations.

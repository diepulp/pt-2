# Feature Boundary: Alert Maturity (C-2/C-3)

> **Ownership Sentence:** This feature belongs to **ShiftIntelligenceService** and may only touch **`shift_alert` (new), `alert_acknowledgment` (new), `table_metric_baseline` (alter)**; cross-context needs go through **TableContextService source-metric RPCs** and **CasinoService `casino_settings` config reads**.

---

## Bounded Context

- **Owner service(s):**
  - **ShiftIntelligenceService** — alert persistence, deduplication, acknowledgment lifecycle, and baseline error state. Extends existing ownership from C-1 (`table_metric_baseline`) to include two new tables.

- **Writes:**
  - `shift_alert` (NEW — persistent alert store with `open` / `acknowledged` / `resolved` state machine, casino-scoped RLS, composite dedup key `(casino_id, table_id, metric_type, gaming_day)`)
  - `alert_acknowledgment` (NEW — audit trail: who acknowledged, when, with what notes. FK to `shift_alert`)
  - `table_metric_baseline` (ALTER — add `last_error` column for `compute_failed` readiness state)

- **Reads:**
  - `table_metric_baseline` (own table — baseline data for anomaly evaluation)
  - `rpc_shift_table_metrics`, `rpc_shift_cash_obs_table` (TableContextService — source metrics)
  - `casino_settings.alert_thresholds` (CasinoService — threshold config + new `cooldown_minutes` key)

- **Cross-context contracts:**
  - **TableContextService** `rpc_shift_table_metrics()`, `rpc_shift_cash_obs_table()` — source metric RPCs (read-only, existing)
  - **CasinoService** `casino_settings.alert_thresholds.cooldown_minutes` — new config key nested under existing `alert_thresholds` JSONB path (read-only)

- **New RPCs (ShiftIntelligenceService-owned):**
  - `rpc_persist_anomaly_alerts()` — SECURITY DEFINER, UPSERTs anomaly results into `shift_alert` with dedup
  - `rpc_acknowledge_alert()` — SECURITY DEFINER, transitions alert state + writes acknowledgment record, pit_boss/admin gated

- **SRM impact:** Update v4.21.0 → v4.22.0 — extend ShiftIntelligenceService ownership to include `shift_alert`, `alert_acknowledgment`

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

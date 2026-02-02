---
title: "Shift Snapshot Rules v1"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to: services/table-context/shift-metrics/
related:
  - SHIFT_METRICS_CATALOG_v0
  - TRUST_LAYER_RULES.md
  - SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
---

# Shift Snapshot Rules v1

Defines how opening/closing inventory snapshots are selected, when win/loss computation is valid, and how coverage is reported through the shift-metrics pipeline.

---

## 1. Snapshot Selection Rules

### 1.1 Opening Snapshot

The **opening snapshot** for a table in a shift window `[window_start, window_end)` is selected as:

```
SELECT id, created_at, bankroll_total_cents
FROM table_inventory_snapshot
WHERE table_id = $table_id
  AND snapshot_type = 'open'
  AND created_at >= $window_start
  AND created_at < $window_end
ORDER BY created_at ASC
LIMIT 1
```

**Rule**: The earliest `open`-type snapshot within the window boundaries.

If no qualifying snapshot exists, `opening_snapshot_id` and `opening_snapshot_at` are `NULL`, and `missing_opening_snapshot = true`.

### 1.2 Closing Snapshot

The **closing snapshot** for a table in a shift window is selected as:

```
SELECT id, created_at, bankroll_total_cents
FROM table_inventory_snapshot
WHERE table_id = $table_id
  AND snapshot_type IN ('close', 'rundown')
  AND created_at >= $window_start
  AND created_at < $window_end
ORDER BY created_at DESC
LIMIT 1
```

**Rule**: The latest `close` or `rundown`-type snapshot within the window boundaries.

If no qualifying snapshot exists, `closing_snapshot_id` and `closing_snapshot_at` are `NULL`, and `missing_closing_snapshot = true`.

### 1.3 Staleness Threshold

A snapshot is considered **stale** if:
- Opening snapshot: `opening_snapshot_at` is more than **30 minutes** after `window_start`
- Closing snapshot: `closing_snapshot_at` is more than **30 minutes** before `window_end`

Stale snapshots are still used for computation but contribute a `null_reason` of `'misaligned'`.

**MVP**: Staleness is tracked for informational purposes only. It does NOT suppress win/loss computation.

---

## 2. Null Policy

### 2.1 When `win_loss_inventory_cents` is NULL

`win_loss_inventory_cents` MUST be `NULL` when either:
- `missing_opening_snapshot = true`, OR
- `missing_closing_snapshot = true`

**Rationale**: Inventory win/loss requires both endpoints of the inventory equation:
```
win_loss_inventory = opening_bankroll + fills - credits - closing_bankroll
```
A missing endpoint produces an undefined result, not zero.

### 2.2 Null Reasons Enum

Every table metric row MAY carry zero or more `null_reasons` from this enum:

| Key | Condition | Impact |
|-----|-----------|--------|
| `missing_opening` | `missing_opening_snapshot = true` | `win_loss_inventory_cents = NULL` |
| `missing_closing` | `missing_closing_snapshot = true` | `win_loss_inventory_cents = NULL` |
| `misaligned` | Snapshot exists but exceeds staleness threshold | Informational warning; computation proceeds |
| `partial_coverage` | Table has telemetry but `telemetry_quality = 'LOW_COVERAGE'` | `metric_grade` stays `ESTIMATE` |

### 2.3 Zero vs NULL Semantics

| Value | Meaning |
|-------|---------|
| `0` | Measured value is zero (e.g., no fills occurred) |
| `NULL` | Value cannot be computed (missing required inputs) |

**Invariant**: Code MUST NOT coerce `NULL` to `0` in aggregation. Aggregation of nullable fields skips `NULL` entries.

---

## 3. Coverage Computation

### 3.1 Table-Level Coverage

A table has **full snapshot coverage** when:
```
missing_opening_snapshot = false AND missing_closing_snapshot = false
```

### 3.2 Pit-Level Coverage

```
snapshot_coverage_ratio = tables_with_both_snapshots / tables_count
```

Where:
- `tables_with_both_snapshots = MIN(tables_with_opening_snapshot, tables_with_closing_snapshot)`
- `tables_count` = total tables in the pit during the shift window

### 3.3 Casino-Level Coverage

Same formula applied across all tables in the casino:
```
snapshot_coverage_ratio = tables_with_both_snapshots / tables_count
```

### 3.4 Coverage Tiers

| Ratio | Tier | UI Treatment |
|-------|------|--------------|
| >= 0.80 | HIGH | Green indicator; no warnings |
| 0.50 - 0.79 | MEDIUM | Amber indicator; "partial coverage" note |
| < 0.50 | LOW | Red indicator; suppress comparisons |
| 0.00 | NONE | Gray indicator; "no snapshot data" warning |

---

## 4. Rollup Semantics

### 4.1 Financial Rollup with NULLs

When rolling up `win_loss_inventory_cents` from tables to pit/casino:

```
pit.win_loss_inventory_total_cents = SUM(table.win_loss_inventory_cents)
  WHERE table.win_loss_inventory_cents IS NOT NULL
  AND table.pit_id = pit.pit_id
```

**Rule**: NULL values are excluded from the sum. The resulting total represents only tables with complete inventory data.

### 4.2 Non-Nullable Financial Rollups

Fields that are never NULL (fills, credits, estimated drop) use standard SUM:

```
pit.fills_total_cents = SUM(table.fills_total_cents)
```

### 4.3 Count Rollups

Table counts are always complete (never NULL):
```
pit.tables_count = COUNT(table WHERE table.pit_id = pit.pit_id)
pit.tables_with_opening_snapshot = COUNT(table WHERE NOT missing_opening_snapshot)
```

---

## 5. Implementation Mapping

| Rule | Enforced In | How |
|------|-------------|-----|
| Snapshot selection | `rpc_shift_table_metrics` (SQL) | Window-bounded query with ORDER BY |
| Null policy | `rpc_shift_table_metrics` (SQL) | CASE WHEN for win_loss_inventory_cents |
| Coverage computation | `services/table-context/shift-metrics/snapshot-rules.ts` | Pure function from DTO fields |
| Rollup semantics | `services/table-context/shift-metrics/service.ts` | Client-side aggregation |
| Null reasons | `services/table-context/shift-metrics/snapshot-rules.ts` | Derived from DTO flags |

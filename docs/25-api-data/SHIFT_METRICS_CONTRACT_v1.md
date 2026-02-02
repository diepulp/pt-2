---
title: "Shift Metrics Contract v1"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to: services/table-context/shift-metrics/
related:
  - SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
  - SHIFT_SNAPSHOT_RULES_v1.md
  - SHIFT_SEVERITY_ALLOWLISTS_v1.md
  - TRUST_LAYER_RULES.md
---

# Shift Metrics Contract v1

Defines the canonical metric shapes, aggregation semantics, and trust metadata
for the shift dashboard statistical model.

---

## 1. Metric Hierarchy

```
ShiftTableMetricsDTO   (per-table, from RPC)
  └─► ShiftPitMetricsDTO     (per-pit, aggregated)
        └─► ShiftCasinoMetricsDTO   (casino-wide, aggregated)
              └─► ShiftDashboardSummaryDTO  (BFF envelope)
```

All three levels are returned in a single `ShiftDashboardSummaryDTO` via the BFF endpoint.

---

## 2. Table-Level Metrics (`ShiftTableMetricsDTO`)

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `table_id` | `string` | — | Gaming table UUID |
| `table_label` | `string` | — | Human-readable label (e.g., "BJ-01") |
| `pit_id` | `string \| null` | — | Pit assignment, null if unassigned |
| `window_start` | `string` | ISO 8601 | Shift window start |
| `window_end` | `string` | ISO 8601 | Shift window end |
| `opening_bankroll_total_cents` | `number` | cents | Opening chip tray total |
| `closing_bankroll_total_cents` | `number` | cents | Closing chip tray total |
| `fills_total_cents` | `number` | cents | Chip fills delivered to table |
| `credits_total_cents` | `number` | cents | Chip credits removed from table |
| `estimated_drop_rated_cents` | `number` | cents | Buy-ins from rated players (includes `RATED_ADJUSTMENT` telemetry — negative adjustments reduce total) |
| `estimated_drop_grind_cents` | `number` | cents | Buy-ins from unrated players |
| `estimated_drop_buyins_cents` | `number` | cents | Total buy-ins (rated + grind) |
| `win_loss_inventory_cents` | `number \| null` | cents | Win/loss via inventory method |
| `win_loss_estimated_cents` | `number \| null` | cents | Win/loss via estimated drop |
| `metric_grade` | `'ESTIMATE' \| 'AUTHORITATIVE'` | — | Confidence level |
| `telemetry_quality` | `'GOOD_COVERAGE' \| 'LOW_COVERAGE' \| 'NONE'` | — | Telemetry data quality |
| `provenance` | `ProvenanceMetadata` | — | Trust metadata |

### 2.1 Win/Loss Formulas

**Inventory method** (AUTHORITATIVE when both snapshots present):
```
win_loss_inventory_cents = opening + fills - credits - closing
```

**Estimated drop method** (ESTIMATE):
```
win_loss_estimated_cents = estimated_drop_buyins_cents - closing + opening - fills + credits
```

### 2.2 Null Policy

- `win_loss_inventory_cents` is `null` when opening or closing snapshot is missing
- `win_loss_estimated_cents` is `null` when drop data is unavailable
- **NULL means "cannot compute"** — never coerce NULL to 0

---

## 3. Pit-Level Metrics (`ShiftPitMetricsDTO`)

Aggregated from all tables assigned to the pit within the shift window.

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `pit_id` | `string` | — | Pit identifier |
| `tables_count` | `number` | — | Total tables in pit |
| `tables_with_opening_snapshot` | `number` | — | Tables with opening snapshot |
| `tables_with_closing_snapshot` | `number` | — | Tables with closing snapshot |
| `fills_total_cents` | `number` | cents | Sum of fills across all tables |
| `credits_total_cents` | `number` | cents | Sum of credits across all tables |
| `estimated_drop_rated_total_cents` | `number` | cents | Sum of rated buy-ins |
| `estimated_drop_grind_total_cents` | `number` | cents | Sum of grind buy-ins |
| `estimated_drop_buyins_total_cents` | `number` | cents | Sum of all buy-ins |
| `win_loss_inventory_total_cents` | `number` | cents | Aggregated inventory win/loss |
| `win_loss_estimated_total_cents` | `number` | cents | Aggregated estimated win/loss |
| `snapshot_coverage_ratio` | `number` | 0.0–1.0 | MIN(opening, closing) / total |
| `coverage_tier` | `CoverageTier` | — | HIGH/MEDIUM/LOW/NONE |
| `provenance` | `ProvenanceMetadata` | — | Worst-of rollup from tables |

---

## 4. Casino-Level Metrics (`ShiftCasinoMetricsDTO`)

Same structure as pit-level but aggregated across ALL tables (not from pits).

Additional field:
- `pits_count`: Number of distinct pits

---

## 5. Trust Metadata

### 5.1 ProvenanceMetadata

Every metric entity carries trust metadata:

```typescript
interface ProvenanceMetadata {
  source: 'inventory' | 'telemetry' | 'mixed';
  grade: 'ESTIMATE' | 'AUTHORITATIVE';
  quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
  coverage_ratio: number;  // 0.0 to 1.0
  null_reasons: NullReason[];
}
```

### 5.2 NullReason Enum

| Value | Meaning |
|-------|---------|
| `missing_opening` | Opening snapshot not found in window |
| `missing_closing` | Closing snapshot not found in window |
| `misaligned` | Snapshot >30 minutes from window edge |
| `partial_coverage` | Telemetry quality is LOW_COVERAGE |

### 5.3 Rollup Semantics

- **Grade**: worst-of — ESTIMATE if ANY child is ESTIMATE
- **Quality**: worst-of — minimum quality from all children
- **Source**: mixed if children have different sources
- **Coverage ratio**: MIN(tables_with_opening, tables_with_closing) / tables_count
- **Null reasons**: deduplicated union of all child null_reasons

### 5.4 Coverage Tiers

| Tier | Range | Meaning |
|------|-------|---------|
| `HIGH` | >= 0.80 | Strong snapshot coverage |
| `MEDIUM` | 0.50–0.79 | Acceptable but incomplete |
| `LOW` | 0.01–0.49 | Significant gaps |
| `NONE` | 0.00 | No snapshot pairs |

---

## 6. BFF Envelope (`ShiftDashboardSummaryDTO`)

```typescript
interface ShiftDashboardSummaryDTO {
  casino: ShiftCasinoMetricsDTO;
  pits: ShiftPitMetricsDTO[];
  tables: ShiftTableMetricsDTO[];
}
```

Single HTTP call via `GET /api/v1/shift-dashboards/summary?startTs=...&endTs=...`.

---

## 7. Telemetry Observations (Separate Domain)

Cash observation rollups (`CashObsSummaryDTO`) are **telemetry-only** and distinct from authoritative metrics:

| DTO | Scope |
|-----|-------|
| `CashObsCasinoRollupDTO` | Casino-wide observation totals |
| `CashObsPitRollupDTO` | Per-pit observation totals |
| `CashObsTableRollupDTO` | Per-table observation totals |
| `CashObsSpikeAlertDTO` | Threshold-breach alerts with severity guardrails |

### 7.1 Alert Severity Guardrails

Alerts carry enriched severity with downgrade tracking:

- `severity`: effective severity after guardrails
- `original_severity`: raw severity from threshold computation
- `downgraded`: boolean indicating if severity was reduced
- `downgrade_reason`: `'low_coverage'` or `'no_coverage'`

**No false-critical invariant**: critical alerts require GOOD_COVERAGE telemetry quality.

---

## 8. Source Files

| File | Purpose |
|------|---------|
| `services/table-context/shift-metrics/dtos.ts` | DTO type definitions |
| `services/table-context/shift-metrics/provenance.ts` | Provenance derivation and rollup |
| `services/table-context/shift-metrics/snapshot-rules.ts` | Coverage computation and tiers |
| `services/table-context/shift-metrics/service.ts` | BFF aggregation and RPC mapping |
| `services/table-context/shift-cash-obs/severity.ts` | Alert severity guardrails |
| `services/table-context/dtos.ts` | Cash observation DTOs |
| `services/table-context/shift-cash-obs.ts` | Cash observation queries |

---
title: "Shift Provenance Rollup Algorithm v1"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to: services/table-context/shift-metrics/
related:
  - SHIFT_SNAPSHOT_RULES_v1.md
  - TRUST_LAYER_RULES.md
  - SHIFT_METRICS_UX_CONTRACT_v1.md
---

# Shift Provenance Rollup Algorithm v1

Defines the deterministic algorithm for computing and propagating provenance metadata through the table -> pit -> casino aggregation hierarchy.

---

## 1. Provenance Metadata Shape

Every metric entity (table, pit, casino) carries provenance metadata:

```typescript
interface ProvenanceMetadata {
  /** Primary data source used for the metric */
  source: 'inventory' | 'telemetry' | 'mixed';
  /** Confidence level of the metric */
  grade: 'ESTIMATE' | 'AUTHORITATIVE';
  /** Telemetry data quality */
  quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
  /** Fraction of tables with complete snapshot pairs */
  coverage_ratio: number; // 0.0 to 1.0
  /** Reasons for reduced trust, if any */
  null_reasons: NullReason[];
}

type NullReason = 'missing_opening' | 'missing_closing' | 'misaligned' | 'partial_coverage';
```

---

## 2. Table-Level Provenance Derivation

Table provenance is derived directly from existing `ShiftTableMetricsDTO` fields:

### 2.1 Source

```
IF win_loss_inventory_cents IS NOT NULL AND win_loss_estimated_cents IS NOT NULL:
  source = 'mixed'
ELSE IF win_loss_inventory_cents IS NOT NULL:
  source = 'inventory'
ELSE:
  source = 'telemetry'
```

### 2.2 Grade

```
grade = metric_grade   // Direct passthrough from existing DTO field
```

**MVP**: All tables return `'ESTIMATE'`. `'AUTHORITATIVE'` is reserved for when count-room-verified drop is integrated (post-MVP).

### 2.3 Quality

```
quality = telemetry_quality   // Direct passthrough: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE'
```

### 2.4 Coverage Ratio (Table Level)

```
IF NOT missing_opening_snapshot AND NOT missing_closing_snapshot:
  coverage_ratio = 1.0
ELSE IF NOT missing_opening_snapshot OR NOT missing_closing_snapshot:
  coverage_ratio = 0.5
ELSE:
  coverage_ratio = 0.0
```

### 2.5 Null Reasons

Assembled from DTO flags:

```
null_reasons = []
IF missing_opening_snapshot:  null_reasons.push('missing_opening')
IF missing_closing_snapshot:  null_reasons.push('missing_closing')
IF snapshot is stale:         null_reasons.push('misaligned')
IF telemetry_quality = 'LOW_COVERAGE':  null_reasons.push('partial_coverage')
```

---

## 3. Pit-Level Provenance Rollup

Pit provenance is computed from constituent table provenance using **worst-of** semantics.

### 3.1 Source (Worst-Of)

```
IF ANY table has source = 'telemetry' AND ANY table has source = 'inventory':
  pit.source = 'mixed'
ELSE IF ALL tables have source = 'inventory':
  pit.source = 'inventory'
ELSE IF ALL tables have source = 'telemetry':
  pit.source = 'telemetry'
ELSE:
  pit.source = 'mixed'
```

### 3.2 Grade (Worst-Of)

```
IF ANY table has grade = 'ESTIMATE':
  pit.grade = 'ESTIMATE'
ELSE:
  pit.grade = 'AUTHORITATIVE'
```

**Invariant**: A rollup is only as strong as its weakest component.

### 3.3 Quality (Worst-Of)

Quality uses ordered comparison: `GOOD_COVERAGE > LOW_COVERAGE > NONE`

```
pit.quality = MIN(table.quality for all tables in pit)
```

Where MIN follows the ordering above. If any table has `'NONE'`, the pit quality is `'NONE'`.

### 3.4 Coverage Ratio

```
pit.coverage_ratio = tables_with_both_snapshots / tables_count
```

Where `tables_with_both_snapshots = MIN(tables_with_opening_snapshot, tables_with_closing_snapshot)`.

### 3.5 Null Reasons (Union)

```
pit.null_reasons = UNION(table.null_reasons for all tables in pit)
```

Deduplicated. If any table has `'missing_opening'`, the pit has `'missing_opening'`.

---

## 4. Casino-Level Provenance Rollup

Identical worst-of logic applied across ALL tables in the casino (not across pits).

### 4.1 Source, Grade, Quality

Same worst-of rules as pit-level, but applied to all tables:

```
casino.source = worst_of(all_tables.source)
casino.grade = worst_of(all_tables.grade)
casino.quality = worst_of(all_tables.quality)
```

### 4.2 Coverage Ratio

```
casino.coverage_ratio = tables_with_both_snapshots / tables_count
```

Using casino-level counts directly from `ShiftCasinoMetricsDTO`.

### 4.3 Null Reasons

```
casino.null_reasons = UNION(all_tables.null_reasons)
```

---

## 5. BFF Composition Rules

When `getShiftDashboardSummary()` composes the `ShiftDashboardSummaryDTO`:

### 5.1 Provenance Must Propagate

Every DTO level (casino, pit[], tables[]) MUST carry its computed provenance. The BFF endpoint MUST NOT:
- Drop provenance fields during serialization
- Default provenance to a "happy path" value
- Omit provenance when quality is poor

### 5.2 No Provenance Upgrading

The BFF MUST NOT upgrade provenance during composition:
- Casino provenance is computed from table data, NOT from pit provenance
- This prevents rounding errors in multi-level rollup

### 5.3 Field Mapping

| DTO Level | Provenance Source |
|-----------|-------------------|
| `tables[]` | Direct derivation from `ShiftTableMetricsDTO` fields |
| `pits[]` | Rollup from constituent `tables[]` |
| `casino` | Rollup from ALL `tables[]` (not from `pits[]`) |

---

## 6. Determinism Guarantees

The rollup algorithm is **deterministic**: given the same set of table metrics, it MUST produce identical provenance at every level.

### 6.1 No Randomness

No random sampling, probabilistic inference, or time-dependent logic in provenance computation.

### 6.2 No Weighting

Coverage ratio is a simple count ratio, not a weighted average. A table with $1M in fills and a table with $100 in fills contribute equally to coverage_ratio.

### 6.3 Idempotent

Running the provenance computation multiple times on the same input produces the same output.

---

## 7. Implementation Mapping

| Component | File | Responsibility |
|-----------|------|----------------|
| Table provenance derivation | `services/table-context/shift-metrics/provenance.ts` | Pure function: `deriveTableProvenance(table: ShiftTableMetricsDTO): ProvenanceMetadata` |
| Pit provenance rollup | `services/table-context/shift-metrics/provenance.ts` | Pure function: `rollupPitProvenance(tables: ShiftTableMetricsDTO[]): ProvenanceMetadata` |
| Casino provenance rollup | `services/table-context/shift-metrics/provenance.ts` | Pure function: `rollupCasinoProvenance(tables: ShiftTableMetricsDTO[]): ProvenanceMetadata` |
| BFF composition | `services/table-context/shift-metrics/service.ts` | `getShiftDashboardSummary()` attaches provenance to each level |
| Tests | `services/table-context/__tests__/shift-provenance-rollup.test.ts` | Exhaustive worst-of scenario coverage |

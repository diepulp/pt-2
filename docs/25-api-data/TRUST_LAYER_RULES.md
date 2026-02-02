---
title: "Trust Layer Rules"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to:
  - services/table-context/shift-metrics/
  - components/shift-dashboard-v3/trust/
related:
  - SHIFT_SNAPSHOT_RULES_v1.md
  - SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
  - SHIFT_SEVERITY_ALLOWLISTS_v1.md
  - SHIFT_METRICS_UX_CONTRACT_v1.md
---

# Trust Layer Rules

Defines the required trust metadata fields, their semantics, and the rules that govern how the UI communicates data quality and confidence to shift managers.

---

## 1. Required Trust Metadata Fields

Every metric entity (table, pit, casino) MUST carry these trust metadata fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grade` | `'ESTIMATE' \| 'AUTHORITATIVE'` | YES | Confidence level of the metric |
| `quality` | `'GOOD_COVERAGE' \| 'LOW_COVERAGE' \| 'NONE'` | YES | Telemetry data quality |
| `provenance` | `ProvenanceMetadata` | YES | Full provenance object (see below) |

### 1.1 ProvenanceMetadata Shape

```typescript
interface ProvenanceMetadata {
  source: 'inventory' | 'telemetry' | 'mixed';
  grade: 'ESTIMATE' | 'AUTHORITATIVE';
  quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
  coverage_ratio: number;
  null_reasons: NullReason[];
}
```

See `SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md` for derivation and rollup rules.

---

## 2. Grade Semantics

### 2.1 ESTIMATE

A metric graded `ESTIMATE` means:
- Computed from **telemetry data** (observed buy-ins, cash observations) and/or **partial inventory** data
- May have gaps in source data (missing snapshots, low telemetry coverage)
- Suitable for operational triage and trend identification
- NOT suitable for regulatory reporting or financial reconciliation

### 2.2 AUTHORITATIVE

A metric graded `AUTHORITATIVE` means:
- Computed from a **complete inventory chain**: opening snapshot + fills + credits + closing snapshot + verified drop
- All source data is present and verified
- Suitable for regulatory reporting and financial reconciliation

**MVP**: All metrics are `ESTIMATE`. `AUTHORITATIVE` grade is reserved for post-MVP when count-room-verified drop is integrated.

### 2.3 Grade Comparison Rules

| Comparison | Allowed | UI Treatment |
|------------|---------|--------------|
| ESTIMATE vs ESTIMATE | YES | Normal display |
| AUTHORITATIVE vs AUTHORITATIVE | YES | Normal display |
| ESTIMATE vs AUTHORITATIVE | YES with disclaimer | Show warning: "Comparing estimated and verified values" |

---

## 3. Quality Semantics

Quality maps directly to the existing `telemetry_quality` field on `ShiftTableMetricsDTO`:

| Quality | Meaning | Implications |
|---------|---------|--------------|
| `GOOD_COVERAGE` | >= 80% of expected observations present | Full trust in telemetry-derived values |
| `LOW_COVERAGE` | Some observations present but < 80% | Values are directionally correct but incomplete |
| `NONE` | No telemetry observations for the entity | Telemetry-derived values are unavailable or zero |

### 3.1 Quality Display Rules

| Quality | Display | Color |
|---------|---------|-------|
| `GOOD_COVERAGE` | Green checkmark or badge | Green |
| `LOW_COVERAGE` | Amber warning triangle | Amber |
| `NONE` | Gray dash or "N/A" | Gray |

### 3.2 Quality Comparison Rules

| Comparison | Allowed | UI Treatment |
|------------|---------|--------------|
| GOOD vs GOOD | YES | Normal display |
| GOOD vs LOW | YES with caveat | Show quality mismatch indicator |
| Any vs NONE | Suppress comparison | Do not show side-by-side comparison |

---

## 4. Coverage Semantics

Coverage is a numeric ratio (0.0 to 1.0) representing the fraction of tables with complete snapshot pairs.

| Range | Label | Treatment |
|-------|-------|-----------|
| >= 0.80 | HIGH | Green; trust the aggregate |
| 0.50 - 0.79 | MEDIUM | Amber; "based on partial data" |
| 0.01 - 0.49 | LOW | Red; "limited data available" |
| 0.00 | NONE | Gray; "no snapshot data" |

---

## 5. UI Display Rules

### 5.1 Trust Indicators (Required)

Every numeric KPI displayed on the dashboard MUST have an adjacent trust indicator showing at minimum:
- **Grade badge**: Visual icon (shield, checkmark, etc.) indicating ESTIMATE vs AUTHORITATIVE
- **Quality indicator**: Color-coded dot or icon indicating telemetry quality

### 5.2 Provenance Tooltip (Required)

Hovering over a trust indicator MUST show a tooltip containing:
1. **Source**: "Based on inventory data" / "Based on telemetry observations" / "Based on mixed sources"
2. **Quality**: "Good telemetry coverage" / "Limited telemetry coverage" / "No telemetry data"
3. **Coverage**: "X of Y tables have complete snapshot data" (or percentage)
4. **Warnings**: Any null_reasons in human-readable form

### 5.3 Suppression Rules

| Condition | What to Suppress |
|-----------|------------------|
| `quality = 'NONE'` for both entities | Suppress comparison columns entirely |
| `coverage_ratio = 0` | Show "No data" instead of zero |
| `win_loss_inventory_cents = NULL` | Show "Missing snapshots" instead of blank |

### 5.4 Never Mislead Rules

1. **Never show zero for missing data**: NULL means "cannot compute", not "zero"
2. **Never hide quality problems**: If data quality is poor, the UI must make this visible
3. **Never compare incompatible grades**: Show disclaimer when comparing ESTIMATE to AUTHORITATIVE
4. **Never show downgraded alerts without context**: Downgraded severity must show the original severity

---

## 6. Trust Propagation Through BFF

### 6.1 Field Preservation

The BFF layer (`getShiftDashboardSummary`) MUST preserve all trust fields through serialization:
- `provenance` object must be included in JSON response
- No trust fields may be dropped for "cleaner" payloads
- Default values are NOT acceptable for missing trust data (use NULL/undefined)

### 6.2 React Query / Hook Layer

React Query hooks that consume shift metrics MUST:
- Pass through provenance metadata without transformation
- Not cache trust metadata separately from the metric data it describes
- Invalidate trust metadata when metric data is invalidated

---

## 7. Implementation Mapping

| Component | File | Responsibility |
|-----------|------|----------------|
| Provenance derivation | `services/table-context/shift-metrics/provenance.ts` | Compute trust metadata from DTOs |
| Trust UI components | `components/shift-dashboard-v3/trust/` | Grade badge, quality indicator, provenance tooltip |
| UX contract compliance | `components/shift-dashboard-v3/trust/__tests__/` | Test visual trust rules |
| BFF propagation | `services/table-context/shift-metrics/service.ts` | Attach provenance to dashboard summary |

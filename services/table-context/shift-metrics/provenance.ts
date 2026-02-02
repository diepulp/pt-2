/**
 * Shift Metrics Provenance
 *
 * Pure functions for computing and propagating provenance metadata through
 * the table → pit → casino aggregation hierarchy.
 *
 * @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
 * @see TRUST_LAYER_RULES.md
 */

import type { ShiftTableMetricsDTO } from './dtos';

// === Types ===

export type NullReason =
  | 'missing_opening'
  | 'missing_closing'
  | 'misaligned'
  | 'partial_coverage';

export interface ProvenanceMetadata {
  /** Primary data source used for the metric */
  source: 'inventory' | 'telemetry' | 'mixed';
  /** Confidence level of the metric */
  grade: 'ESTIMATE' | 'AUTHORITATIVE';
  /** Telemetry data quality */
  quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE';
  /** Fraction of tables with complete snapshot pairs (0.0 to 1.0) */
  coverage_ratio: number;
  /** Reasons for reduced trust, if any */
  null_reasons: NullReason[];
}

// === Quality Ordering ===

const QUALITY_ORDER: Record<'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE', number> =
  {
    GOOD_COVERAGE: 2,
    LOW_COVERAGE: 1,
    NONE: 0,
  };

// === Table-Level Provenance Derivation ===

/**
 * Derive provenance metadata from a single table's metrics.
 * Pure function — no side effects.
 *
 * @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md §2
 */
export function deriveTableProvenance(
  table: Omit<ShiftTableMetricsDTO, 'provenance'>,
): ProvenanceMetadata {
  // Source derivation
  const hasInventory = table.win_loss_inventory_cents != null;
  const hasEstimated = table.win_loss_estimated_cents != null;

  let source: ProvenanceMetadata['source'];
  if (hasInventory && hasEstimated) {
    source = 'mixed';
  } else if (hasInventory) {
    source = 'inventory';
  } else {
    source = 'telemetry';
  }

  // Coverage ratio: 1.0 (both), 0.5 (one), 0.0 (neither)
  const hasOpening = !table.missing_opening_snapshot;
  const hasClosing = !table.missing_closing_snapshot;
  let coverage_ratio: number;
  if (hasOpening && hasClosing) {
    coverage_ratio = 1.0;
  } else if (hasOpening || hasClosing) {
    coverage_ratio = 0.5;
  } else {
    coverage_ratio = 0.0;
  }

  // Null reasons
  const null_reasons: NullReason[] = [];
  if (table.missing_opening_snapshot) null_reasons.push('missing_opening');
  if (table.missing_closing_snapshot) null_reasons.push('missing_closing');
  if (table.telemetry_quality === 'LOW_COVERAGE')
    null_reasons.push('partial_coverage');

  return {
    source,
    grade: table.metric_grade,
    quality: table.telemetry_quality,
    coverage_ratio,
    null_reasons,
  };
}

// === Pit-Level Provenance Rollup ===

/**
 * Compute pit-level provenance from constituent table metrics using worst-of semantics.
 * Pure function — no side effects.
 *
 * @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md §3
 */
export function rollupPitProvenance(
  tables: ShiftTableMetricsDTO[],
): ProvenanceMetadata {
  if (tables.length === 0) {
    return {
      source: 'telemetry',
      grade: 'ESTIMATE',
      quality: 'NONE',
      coverage_ratio: 0,
      null_reasons: [],
    };
  }

  const tableProvenances = tables.map(deriveTableProvenance);

  // Source: worst-of
  const sources = new Set(tableProvenances.map((p) => p.source));
  let source: ProvenanceMetadata['source'];
  if (sources.size === 1) {
    source = tableProvenances[0].source;
  } else {
    source = 'mixed';
  }

  // Grade: worst-of (ESTIMATE if any child is ESTIMATE)
  const grade: ProvenanceMetadata['grade'] = tableProvenances.some(
    (p) => p.grade === 'ESTIMATE',
  )
    ? 'ESTIMATE'
    : 'AUTHORITATIVE';

  // Quality: worst-of (MIN ordering)
  const quality = tableProvenances.reduce<ProvenanceMetadata['quality']>(
    (worst, p) =>
      QUALITY_ORDER[p.quality] < QUALITY_ORDER[worst] ? p.quality : worst,
    tableProvenances[0].quality,
  );

  // Coverage ratio from table counts
  const withOpening = tables.filter((t) => !t.missing_opening_snapshot).length;
  const withClosing = tables.filter((t) => !t.missing_closing_snapshot).length;
  const withBoth = Math.min(withOpening, withClosing);
  const coverage_ratio = tables.length > 0 ? withBoth / tables.length : 0;

  // Null reasons: union (deduplicated)
  const allReasons = new Set<NullReason>();
  for (const p of tableProvenances) {
    for (const reason of p.null_reasons) {
      allReasons.add(reason);
    }
  }

  return {
    source,
    grade,
    quality,
    coverage_ratio,
    null_reasons: Array.from(allReasons),
  };
}

// === Casino-Level Provenance Rollup ===

/**
 * Compute casino-level provenance from ALL tables (not from pits).
 * Pure function — no side effects.
 *
 * @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md §4
 */
export function rollupCasinoProvenance(
  tables: ShiftTableMetricsDTO[],
): ProvenanceMetadata {
  // Same worst-of logic as pit, applied to all tables
  return rollupPitProvenance(tables);
}

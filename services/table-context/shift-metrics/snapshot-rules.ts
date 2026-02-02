/**
 * Shift Metrics Snapshot Rules
 *
 * Pure functions for snapshot coverage computation, null-reason derivation,
 * and coverage tier classification.
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md
 */

import type { ShiftTableMetricsDTO } from './dtos';
import type { NullReason } from './provenance';

// === Types ===

export type CoverageTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// === Constants ===

/** Staleness threshold in milliseconds (30 minutes) */
const STALENESS_THRESHOLD_MS = 30 * 60 * 1000;

// === Snapshot Staleness ===

/**
 * Check if a snapshot is stale relative to the window edge.
 *
 * - Opening: stale if snapshot_at > window_start + 30 minutes
 * - Closing: stale if snapshot_at < window_end - 30 minutes
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md §1.3
 */
export function isSnapshotStale(
  snapshotAt: string | null,
  windowEdge: string,
  direction: 'opening' | 'closing',
): boolean {
  if (!snapshotAt) return false; // No snapshot = not stale (just missing)

  const snapshotTime = new Date(snapshotAt).getTime();
  const edgeTime = new Date(windowEdge).getTime();

  if (direction === 'opening') {
    // Opening is stale if taken >30 min after window start
    return snapshotTime - edgeTime > STALENESS_THRESHOLD_MS;
  } else {
    // Closing is stale if taken >30 min before window end
    return edgeTime - snapshotTime > STALENESS_THRESHOLD_MS;
  }
}

// === Null Reasons ===

/**
 * Compute null reasons for a table's metrics based on snapshot flags and telemetry.
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md §2.2
 */
export function computeTableNullReasons(
  table: ShiftTableMetricsDTO,
  windowStart: string,
  windowEnd: string,
): NullReason[] {
  const reasons: NullReason[] = [];

  if (table.missing_opening_snapshot) reasons.push('missing_opening');
  if (table.missing_closing_snapshot) reasons.push('missing_closing');

  // Staleness check
  if (
    isSnapshotStale(table.opening_snapshot_at, windowStart, 'opening') ||
    isSnapshotStale(table.closing_snapshot_at, windowEnd, 'closing')
  ) {
    reasons.push('misaligned');
  }

  // Partial coverage from telemetry
  if (table.telemetry_quality === 'LOW_COVERAGE') {
    reasons.push('partial_coverage');
  }

  return reasons;
}

// === Coverage Computation ===

/**
 * Compute coverage ratio for a single table.
 * Returns 1.0 (both snapshots), 0.5 (one), or 0.0 (neither).
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md §3.1
 */
export function computeTableCoverageRatio(table: ShiftTableMetricsDTO): number {
  const hasOpening = !table.missing_opening_snapshot;
  const hasClosing = !table.missing_closing_snapshot;

  if (hasOpening && hasClosing) return 1.0;
  if (hasOpening || hasClosing) return 0.5;
  return 0.0;
}

/**
 * Compute aggregated coverage ratio from snapshot counts.
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md §3.2–3.3
 */
export function computeAggregatedCoverageRatio(
  withOpening: number,
  withClosing: number,
  total: number,
): number {
  if (total === 0) return 0;
  const withBoth = Math.min(withOpening, withClosing);
  return withBoth / total;
}

// === Coverage Tiers ===

/**
 * Map a coverage ratio to a coverage tier.
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md §3.4
 */
export function getCoverageTier(ratio: number): CoverageTier {
  if (ratio >= 0.8) return 'HIGH';
  if (ratio >= 0.5) return 'MEDIUM';
  if (ratio > 0) return 'LOW';
  return 'NONE';
}

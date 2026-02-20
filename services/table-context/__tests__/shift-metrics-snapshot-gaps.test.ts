/**
 * Shift Metrics Snapshot Gap & Coverage Tests
 *
 * Tests for snapshot staleness detection, null-reason derivation,
 * coverage ratio computation, and coverage tier classification.
 *
 * @see SHIFT_SNAPSHOT_RULES_v1.md
 */

import type { ShiftTableMetricsDTO } from '../shift-metrics/dtos';
import {
  computeAggregatedCoverageRatio,
  computeTableCoverageRatio,
  computeTableNullReasons,
  getCoverageTier,
  isSnapshotStale,
} from '../shift-metrics/snapshot-rules';

// === Factory Helper ===

function makeTable(
  overrides: Partial<ShiftTableMetricsDTO> = {},
): ShiftTableMetricsDTO {
  return {
    table_id: 'table-001',
    table_label: 'BJ-01',
    pit_id: 'pit-A',
    window_start: '2026-01-15T08:00:00Z',
    window_end: '2026-01-15T16:00:00Z',
    opening_snapshot_id: 'snap-open-1',
    opening_snapshot_at: '2026-01-15T08:05:00Z',
    opening_bankroll_total_cents: 50000_00,
    closing_snapshot_id: 'snap-close-1',
    closing_snapshot_at: '2026-01-15T15:55:00Z',
    closing_bankroll_total_cents: 45000_00,
    fills_total_cents: 10000_00,
    credits_total_cents: 5000_00,
    drop_custody_present: false,
    estimated_drop_rated_cents: 20000_00,
    estimated_drop_grind_cents: 5000_00,
    estimated_drop_buyins_cents: 25000_00,
    telemetry_quality: 'GOOD_COVERAGE',
    telemetry_notes: '',
    win_loss_inventory_cents: 10000_00,
    win_loss_estimated_cents: 8000_00,
    metric_grade: 'AUTHORITATIVE',
    missing_opening_snapshot: false,
    missing_closing_snapshot: false,
    opening_source: 'snapshot:prior_count',
    opening_bankroll_cents: 50000_00,
    opening_at: '2026-01-15T07:55:00Z',
    coverage_type: 'full',
    provenance: {
      source: 'inventory',
      grade: 'AUTHORITATIVE',
      quality: 'GOOD_COVERAGE',
      coverage_ratio: 1.0,
      null_reasons: [],
    },
    ...overrides,
  };
}

// === isSnapshotStale ===

describe('isSnapshotStale', () => {
  const windowStart = '2026-01-15T08:00:00Z';
  const windowEnd = '2026-01-15T16:00:00Z';

  it('returns false for null snapshot (missing, not stale)', () => {
    expect(isSnapshotStale(null, windowStart, 'opening')).toBe(false);
  });

  it('returns false when opening is within 30 minutes of window start', () => {
    // 5 minutes after start
    expect(
      isSnapshotStale('2026-01-15T08:05:00Z', windowStart, 'opening'),
    ).toBe(false);
  });

  it('returns false at exactly 30 minutes from window start', () => {
    // Exactly 30 minutes
    expect(
      isSnapshotStale('2026-01-15T08:30:00Z', windowStart, 'opening'),
    ).toBe(false);
  });

  it('returns true when opening is >30 minutes after window start', () => {
    // 31 minutes after start
    expect(
      isSnapshotStale('2026-01-15T08:31:00Z', windowStart, 'opening'),
    ).toBe(true);
  });

  it('returns false when closing is within 30 minutes of window end', () => {
    // 5 minutes before end
    expect(isSnapshotStale('2026-01-15T15:55:00Z', windowEnd, 'closing')).toBe(
      false,
    );
  });

  it('returns false at exactly 30 minutes from window end', () => {
    expect(isSnapshotStale('2026-01-15T15:30:00Z', windowEnd, 'closing')).toBe(
      false,
    );
  });

  it('returns true when closing is >30 minutes before window end', () => {
    // 31 minutes before end
    expect(isSnapshotStale('2026-01-15T15:29:00Z', windowEnd, 'closing')).toBe(
      true,
    );
  });

  it('returns true for opening taken hours after window start', () => {
    expect(
      isSnapshotStale('2026-01-15T12:00:00Z', windowStart, 'opening'),
    ).toBe(true);
  });
});

// === computeTableNullReasons ===

describe('computeTableNullReasons', () => {
  const windowStart = '2026-01-15T08:00:00Z';
  const windowEnd = '2026-01-15T16:00:00Z';

  it('returns empty array for fully covered table', () => {
    const table = makeTable();
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toEqual([]);
  });

  it('includes missing_opening when opening snapshot is absent', () => {
    const table = makeTable({ missing_opening_snapshot: true });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('missing_opening');
  });

  it('includes missing_closing when closing snapshot is absent', () => {
    const table = makeTable({ missing_closing_snapshot: true });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('missing_closing');
  });

  it('includes both missing reasons when neither snapshot present', () => {
    const table = makeTable({
      missing_opening_snapshot: true,
      missing_closing_snapshot: true,
    });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('missing_opening');
    expect(reasons).toContain('missing_closing');
  });

  it('includes misaligned when opening is stale', () => {
    const table = makeTable({
      opening_snapshot_at: '2026-01-15T10:00:00Z', // 2 hours after start
    });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('misaligned');
  });

  it('includes misaligned when closing is stale', () => {
    const table = makeTable({
      closing_snapshot_at: '2026-01-15T14:00:00Z', // 2 hours before end
    });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('misaligned');
  });

  it('includes partial_coverage for LOW_COVERAGE telemetry', () => {
    const table = makeTable({ telemetry_quality: 'LOW_COVERAGE' });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('partial_coverage');
  });

  it('does not include partial_coverage for NONE telemetry', () => {
    const table = makeTable({ telemetry_quality: 'NONE' });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).not.toContain('partial_coverage');
  });

  it('accumulates multiple reasons simultaneously', () => {
    const table = makeTable({
      missing_opening_snapshot: true,
      closing_snapshot_at: '2026-01-15T14:00:00Z', // stale
      telemetry_quality: 'LOW_COVERAGE',
    });
    const reasons = computeTableNullReasons(table, windowStart, windowEnd);
    expect(reasons).toContain('missing_opening');
    expect(reasons).toContain('misaligned');
    expect(reasons).toContain('partial_coverage');
    expect(reasons.length).toBe(3);
  });
});

// === computeTableCoverageRatio ===

describe('computeTableCoverageRatio', () => {
  it('returns 1.0 when both snapshots present', () => {
    const table = makeTable({
      missing_opening_snapshot: false,
      missing_closing_snapshot: false,
    });
    expect(computeTableCoverageRatio(table)).toBe(1.0);
  });

  it('returns 0.5 when only opening present', () => {
    const table = makeTable({
      missing_opening_snapshot: false,
      missing_closing_snapshot: true,
    });
    expect(computeTableCoverageRatio(table)).toBe(0.5);
  });

  it('returns 0.5 when only closing present', () => {
    const table = makeTable({
      missing_opening_snapshot: true,
      missing_closing_snapshot: false,
    });
    expect(computeTableCoverageRatio(table)).toBe(0.5);
  });

  it('returns 0.0 when neither snapshot present', () => {
    const table = makeTable({
      missing_opening_snapshot: true,
      missing_closing_snapshot: true,
    });
    expect(computeTableCoverageRatio(table)).toBe(0.0);
  });
});

// === computeAggregatedCoverageRatio ===

describe('computeAggregatedCoverageRatio', () => {
  it('returns 0 for zero tables', () => {
    expect(computeAggregatedCoverageRatio(0, 0, 0)).toBe(0);
  });

  it('returns 1.0 when all tables have both snapshots', () => {
    expect(computeAggregatedCoverageRatio(5, 5, 5)).toBe(1.0);
  });

  it('uses MIN(opening, closing) / total', () => {
    // 3 opening, 2 closing, 4 total -> MIN(3,2)/4 = 0.5
    expect(computeAggregatedCoverageRatio(3, 2, 4)).toBe(0.5);
  });

  it('handles more closing than opening', () => {
    // 1 opening, 4 closing, 5 total -> MIN(1,4)/5 = 0.2
    expect(computeAggregatedCoverageRatio(1, 4, 5)).toBe(0.2);
  });

  it('returns 0 when no opening snapshots', () => {
    expect(computeAggregatedCoverageRatio(0, 5, 5)).toBe(0);
  });

  it('returns 0 when no closing snapshots', () => {
    expect(computeAggregatedCoverageRatio(5, 0, 5)).toBe(0);
  });
});

// === getCoverageTier ===

describe('getCoverageTier', () => {
  it('returns HIGH for ratio >= 0.80', () => {
    expect(getCoverageTier(1.0)).toBe('HIGH');
    expect(getCoverageTier(0.8)).toBe('HIGH');
    expect(getCoverageTier(0.95)).toBe('HIGH');
  });

  it('returns MEDIUM for ratio 0.50 to 0.79', () => {
    expect(getCoverageTier(0.79)).toBe('MEDIUM');
    expect(getCoverageTier(0.5)).toBe('MEDIUM');
    expect(getCoverageTier(0.6)).toBe('MEDIUM');
  });

  it('returns LOW for ratio > 0 and < 0.50', () => {
    expect(getCoverageTier(0.49)).toBe('LOW');
    expect(getCoverageTier(0.01)).toBe('LOW');
    expect(getCoverageTier(0.25)).toBe('LOW');
  });

  it('returns NONE for ratio 0', () => {
    expect(getCoverageTier(0)).toBe('NONE');
  });

  it('boundary: 0.80 is HIGH not MEDIUM', () => {
    expect(getCoverageTier(0.8)).toBe('HIGH');
  });

  it('boundary: 0.50 is MEDIUM not LOW', () => {
    expect(getCoverageTier(0.5)).toBe('MEDIUM');
  });
});

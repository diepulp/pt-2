/**
 * Shift Metrics Provenance Rollup Tests
 *
 * Tests for provenance metadata derivation and worst-of rollup semantics.
 *
 * @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
 * @see TRUST_LAYER_RULES.md
 */

import type { ShiftTableMetricsDTO } from '../shift-metrics/dtos';
import type { ProvenanceMetadata } from '../shift-metrics/provenance';
import {
  deriveTableProvenance,
  rollupCasinoProvenance,
  rollupPitProvenance,
} from '../shift-metrics/provenance';

// === Factory Helpers ===

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

// === deriveTableProvenance ===

describe('deriveTableProvenance', () => {
  it('returns AUTHORITATIVE with full coverage when both snapshots and inventory present', () => {
    const table = makeTable({
      win_loss_inventory_cents: 10000_00,
      win_loss_estimated_cents: 8000_00,
      missing_opening_snapshot: false,
      missing_closing_snapshot: false,
      telemetry_quality: 'GOOD_COVERAGE',
      metric_grade: 'AUTHORITATIVE',
    });

    const result = deriveTableProvenance(table);

    expect(result.source).toBe('mixed');
    expect(result.grade).toBe('AUTHORITATIVE');
    expect(result.quality).toBe('GOOD_COVERAGE');
    expect(result.coverage_ratio).toBe(1.0);
    expect(result.null_reasons).toEqual([]);
  });

  it('returns inventory source when only inventory is available', () => {
    const table = makeTable({
      win_loss_inventory_cents: 10000_00,
      win_loss_estimated_cents: null,
    });

    const result = deriveTableProvenance(table);

    expect(result.source).toBe('inventory');
  });

  it('returns telemetry source when only estimated is available', () => {
    const table = makeTable({
      win_loss_inventory_cents: null,
      win_loss_estimated_cents: 8000_00,
      missing_opening_snapshot: true,
      missing_closing_snapshot: true,
      metric_grade: 'ESTIMATE',
    });

    const result = deriveTableProvenance(table);

    expect(result.source).toBe('telemetry');
    expect(result.grade).toBe('ESTIMATE');
  });

  it('returns mixed source when both inventory and estimated present', () => {
    const table = makeTable({
      win_loss_inventory_cents: 10000_00,
      win_loss_estimated_cents: 8000_00,
    });

    const result = deriveTableProvenance(table);

    expect(result.source).toBe('mixed');
  });

  it('returns 0.5 coverage when missing opening snapshot', () => {
    const table = makeTable({
      missing_opening_snapshot: true,
      missing_closing_snapshot: false,
    });

    const result = deriveTableProvenance(table);

    expect(result.coverage_ratio).toBe(0.5);
    expect(result.null_reasons).toContain('missing_opening');
  });

  it('returns 0.5 coverage when missing closing snapshot', () => {
    const table = makeTable({
      missing_opening_snapshot: false,
      missing_closing_snapshot: true,
    });

    const result = deriveTableProvenance(table);

    expect(result.coverage_ratio).toBe(0.5);
    expect(result.null_reasons).toContain('missing_closing');
  });

  it('returns 0.0 coverage when missing both snapshots', () => {
    const table = makeTable({
      missing_opening_snapshot: true,
      missing_closing_snapshot: true,
    });

    const result = deriveTableProvenance(table);

    expect(result.coverage_ratio).toBe(0.0);
    expect(result.null_reasons).toContain('missing_opening');
    expect(result.null_reasons).toContain('missing_closing');
  });

  it('includes partial_coverage reason when telemetry is LOW_COVERAGE', () => {
    const table = makeTable({
      telemetry_quality: 'LOW_COVERAGE',
    });

    const result = deriveTableProvenance(table);

    expect(result.quality).toBe('LOW_COVERAGE');
    expect(result.null_reasons).toContain('partial_coverage');
  });

  it('does not include partial_coverage for NONE telemetry', () => {
    const table = makeTable({
      telemetry_quality: 'NONE',
    });

    const result = deriveTableProvenance(table);

    expect(result.quality).toBe('NONE');
    expect(result.null_reasons).not.toContain('partial_coverage');
  });
});

// === rollupPitProvenance ===

describe('rollupPitProvenance', () => {
  it('returns empty provenance for empty tables array', () => {
    const result = rollupPitProvenance([]);

    expect(result.source).toBe('telemetry');
    expect(result.grade).toBe('ESTIMATE');
    expect(result.quality).toBe('NONE');
    expect(result.coverage_ratio).toBe(0);
    expect(result.null_reasons).toEqual([]);
  });

  it('returns AUTHORITATIVE when all tables are AUTHORITATIVE', () => {
    const tables = [
      makeTable({ table_id: 't1', metric_grade: 'AUTHORITATIVE' }),
      makeTable({ table_id: 't2', metric_grade: 'AUTHORITATIVE' }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.grade).toBe('AUTHORITATIVE');
  });

  it('returns ESTIMATE when any table is ESTIMATE', () => {
    const tables = [
      makeTable({ table_id: 't1', metric_grade: 'AUTHORITATIVE' }),
      makeTable({ table_id: 't2', metric_grade: 'ESTIMATE' }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.grade).toBe('ESTIMATE');
  });

  it('uses worst-of quality (GOOD + LOW = LOW)', () => {
    const tables = [
      makeTable({ table_id: 't1', telemetry_quality: 'GOOD_COVERAGE' }),
      makeTable({ table_id: 't2', telemetry_quality: 'LOW_COVERAGE' }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.quality).toBe('LOW_COVERAGE');
  });

  it('uses worst-of quality (GOOD + NONE = NONE)', () => {
    const tables = [
      makeTable({ table_id: 't1', telemetry_quality: 'GOOD_COVERAGE' }),
      makeTable({ table_id: 't2', telemetry_quality: 'NONE' }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.quality).toBe('NONE');
  });

  it('returns mixed source when tables have different sources', () => {
    const tables = [
      makeTable({
        table_id: 't1',
        win_loss_inventory_cents: 100_00,
        win_loss_estimated_cents: null,
      }),
      makeTable({
        table_id: 't2',
        win_loss_inventory_cents: null,
        win_loss_estimated_cents: 200_00,
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
        metric_grade: 'ESTIMATE',
      }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.source).toBe('mixed');
  });

  it('returns consistent source when all tables match', () => {
    const tables = [
      makeTable({
        table_id: 't1',
        win_loss_inventory_cents: 100_00,
        win_loss_estimated_cents: null,
      }),
      makeTable({
        table_id: 't2',
        win_loss_inventory_cents: 200_00,
        win_loss_estimated_cents: null,
      }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.source).toBe('inventory');
  });

  it('computes coverage ratio from MIN(opening, closing) / total', () => {
    const tables = [
      makeTable({
        table_id: 't1',
        missing_opening_snapshot: false,
        missing_closing_snapshot: false,
      }),
      makeTable({
        table_id: 't2',
        missing_opening_snapshot: false,
        missing_closing_snapshot: true,
      }),
      makeTable({
        table_id: 't3',
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
      }),
    ];

    const result = rollupPitProvenance(tables);

    // withOpening=2, withClosing=1, MIN(2,1)=1, ratio=1/3
    expect(result.coverage_ratio).toBeCloseTo(1 / 3, 5);
  });

  it('unions null_reasons from all tables (deduplicated)', () => {
    const tables = [
      makeTable({
        table_id: 't1',
        missing_opening_snapshot: true,
        telemetry_quality: 'LOW_COVERAGE',
      }),
      makeTable({
        table_id: 't2',
        missing_closing_snapshot: true,
        telemetry_quality: 'LOW_COVERAGE',
      }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.null_reasons).toContain('missing_opening');
    expect(result.null_reasons).toContain('missing_closing');
    expect(result.null_reasons).toContain('partial_coverage');
    // partial_coverage appears once, not twice
    expect(
      result.null_reasons.filter((r) => r === 'partial_coverage').length,
    ).toBe(1);
  });
});

// === rollupCasinoProvenance ===

describe('rollupCasinoProvenance', () => {
  it('uses same worst-of semantics as pit rollup', () => {
    const tables = [
      makeTable({
        table_id: 't1',
        pit_id: 'pit-A',
        metric_grade: 'AUTHORITATIVE',
        telemetry_quality: 'GOOD_COVERAGE',
      }),
      makeTable({
        table_id: 't2',
        pit_id: 'pit-B',
        metric_grade: 'ESTIMATE',
        telemetry_quality: 'LOW_COVERAGE',
        missing_opening_snapshot: true,
      }),
    ];

    const result = rollupCasinoProvenance(tables);

    expect(result.grade).toBe('ESTIMATE');
    expect(result.quality).toBe('LOW_COVERAGE');
    expect(result.null_reasons).toContain('missing_opening');
    expect(result.null_reasons).toContain('partial_coverage');
  });

  it('computes from ALL tables across all pits', () => {
    const tables = [
      makeTable({ table_id: 't1', pit_id: 'pit-A' }),
      makeTable({ table_id: 't2', pit_id: 'pit-A' }),
      makeTable({ table_id: 't3', pit_id: 'pit-B' }),
    ];

    const result = rollupCasinoProvenance(tables);

    // All 3 tables have full snapshots -> ratio = 3/3 = 1.0
    expect(result.coverage_ratio).toBe(1.0);
  });

  it('returns empty provenance for no tables', () => {
    const result = rollupCasinoProvenance([]);

    expect(result.grade).toBe('ESTIMATE');
    expect(result.quality).toBe('NONE');
    expect(result.coverage_ratio).toBe(0);
  });
});

// === Invariant: ProvenanceMetadata shape ===

describe('ProvenanceMetadata contract', () => {
  it('always has all required fields populated', () => {
    const table = makeTable();
    const provenance = deriveTableProvenance(table);

    expect(provenance).toHaveProperty('source');
    expect(provenance).toHaveProperty('grade');
    expect(provenance).toHaveProperty('quality');
    expect(provenance).toHaveProperty('coverage_ratio');
    expect(provenance).toHaveProperty('null_reasons');
    expect(Array.isArray(provenance.null_reasons)).toBe(true);
    expect(typeof provenance.coverage_ratio).toBe('number');
    expect(provenance.coverage_ratio).toBeGreaterThanOrEqual(0);
    expect(provenance.coverage_ratio).toBeLessThanOrEqual(1);
  });

  it('coverage_ratio is bounded 0.0 to 1.0 at pit level', () => {
    const tables = [
      makeTable({
        table_id: 't1',
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
      }),
    ];

    const result = rollupPitProvenance(tables);

    expect(result.coverage_ratio).toBeGreaterThanOrEqual(0);
    expect(result.coverage_ratio).toBeLessThanOrEqual(1);
  });

  const gradeValues: ProvenanceMetadata['grade'][] = [
    'ESTIMATE',
    'AUTHORITATIVE',
  ];
  const qualityValues: ProvenanceMetadata['quality'][] = [
    'GOOD_COVERAGE',
    'LOW_COVERAGE',
    'NONE',
  ];
  const sourceValues: ProvenanceMetadata['source'][] = [
    'inventory',
    'telemetry',
    'mixed',
  ];

  it('grade is always a valid enum value', () => {
    const table = makeTable();
    const result = deriveTableProvenance(table);
    expect(gradeValues).toContain(result.grade);
  });

  it('quality is always a valid enum value', () => {
    const table = makeTable();
    const result = deriveTableProvenance(table);
    expect(qualityValues).toContain(result.quality);
  });

  it('source is always a valid enum value', () => {
    const table = makeTable();
    const result = deriveTableProvenance(table);
    expect(sourceValues).toContain(result.source);
  });
});

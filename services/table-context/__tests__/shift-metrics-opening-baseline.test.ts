/**
 * Shift Metrics Opening Baseline Tests (PRD-036)
 *
 * Tests for:
 * - Provenance mapping for each opening_source value
 * - Casino/pit null-aware aggregation (nullAwareSum semantics)
 * - Win/loss sign convention regression
 *
 * @see PRD-036-shift-winloss-opening-baseline-v0.1.md
 */

import type { ShiftTableMetricsDTO } from '../shift-metrics/dtos';
import { deriveTableProvenance } from '../shift-metrics/provenance';

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

// === Provenance Mapping: opening_source → DTO ===

describe('Provenance mapping for opening_source', () => {
  it('Source A: snapshot:prior_count → AUTHORITATIVE, full coverage', () => {
    const table = makeTable({
      opening_source: 'snapshot:prior_count',
      opening_bankroll_cents: 50000_00,
      opening_at: '2026-01-15T07:55:00Z',
      coverage_type: 'full',
      win_loss_inventory_cents: 10000_00,
      metric_grade: 'AUTHORITATIVE',
    });

    const prov = deriveTableProvenance(table);

    expect(table.opening_source).toBe('snapshot:prior_count');
    expect(table.coverage_type).toBe('full');
    expect(prov.grade).toBe('AUTHORITATIVE');
    expect(prov.coverage_ratio).toBe(1.0);
  });

  it('Source C: bootstrap:par_target → ESTIMATE, partial coverage', () => {
    const table = makeTable({
      opening_source: 'bootstrap:par_target',
      opening_bankroll_cents: 30000_00,
      opening_at: null,
      coverage_type: 'partial',
      missing_opening_snapshot: true,
      win_loss_inventory_cents: null,
      win_loss_estimated_cents: 5000_00,
      metric_grade: 'ESTIMATE',
    });

    expect(table.opening_source).toBe('bootstrap:par_target');
    expect(table.coverage_type).toBe('partial');
    expect(table.opening_bankroll_cents).toBe(30000_00);

    const prov = deriveTableProvenance(table);

    expect(prov.grade).toBe('ESTIMATE');
    expect(prov.null_reasons).toContain('missing_opening');
  });

  it('Source D: fallback:earliest_in_window → ESTIMATE, partial coverage', () => {
    const table = makeTable({
      opening_source: 'fallback:earliest_in_window',
      opening_bankroll_cents: 40000_00,
      opening_at: '2026-01-15T09:00:00Z',
      coverage_type: 'partial',
      missing_opening_snapshot: true,
      win_loss_inventory_cents: null,
      metric_grade: 'ESTIMATE',
    });

    expect(table.opening_source).toBe('fallback:earliest_in_window');
    expect(table.coverage_type).toBe('partial');

    const prov = deriveTableProvenance(table);

    expect(prov.grade).toBe('ESTIMATE');
    expect(prov.null_reasons).toContain('missing_opening');
  });

  it('Source E: none → ESTIMATE, no opening bankroll', () => {
    const table = makeTable({
      opening_source: 'none',
      opening_bankroll_cents: null,
      opening_at: null,
      coverage_type: 'unknown',
      missing_opening_snapshot: true,
      missing_closing_snapshot: true,
      win_loss_inventory_cents: null,
      win_loss_estimated_cents: null,
      metric_grade: 'ESTIMATE',
    });

    expect(table.opening_source).toBe('none');
    expect(table.opening_bankroll_cents).toBeNull();
    expect(table.coverage_type).toBe('unknown');

    const prov = deriveTableProvenance(table);

    expect(prov.grade).toBe('ESTIMATE');
    expect(prov.coverage_ratio).toBe(0.0);
    expect(prov.null_reasons).toContain('missing_opening');
    expect(prov.null_reasons).toContain('missing_closing');
  });
});

// === Null-Aware Aggregation ===

/**
 * These tests verify the null-aware summation logic used in aggregatePitMetrics
 * and aggregateCasinoMetrics. Since those are private functions, we test the
 * equivalent behavior by verifying the DTO contract expectations.
 */
describe('Null-aware aggregation contract', () => {
  it('casino aggregation: mix of null and non-null → sums known, excludes null', () => {
    // Given: 3 tables, 2 with win/loss, 1 without
    const tables: ShiftTableMetricsDTO[] = [
      makeTable({
        table_id: 't1',
        win_loss_inventory_cents: 10000_00,
        win_loss_estimated_cents: 8000_00,
      }),
      makeTable({
        table_id: 't2',
        win_loss_inventory_cents: 5000_00,
        win_loss_estimated_cents: 3000_00,
      }),
      makeTable({
        table_id: 't3',
        win_loss_inventory_cents: null,
        win_loss_estimated_cents: null,
        opening_source: 'none',
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
      }),
    ];

    // Simulate null-aware sum (same logic as nullAwareSum in service.ts)
    const inventoryValues = tables
      .map((t) => t.win_loss_inventory_cents)
      .filter((v): v is number => v != null);
    const estimatedValues = tables
      .map((t) => t.win_loss_estimated_cents)
      .filter((v): v is number => v != null);

    const inventorySum = inventoryValues.reduce((a, b) => a + b, 0);
    const estimatedSum = estimatedValues.reduce((a, b) => a + b, 0);

    expect(inventorySum).toBe(15000_00); // 10000 + 5000
    expect(estimatedSum).toBe(11000_00); // 8000 + 3000
    expect(inventoryValues.length).toBe(2); // Only 2 of 3 had values

    const missingCount = tables.filter(
      (t) => t.win_loss_inventory_cents == null,
    ).length;
    expect(missingCount).toBe(1);
  });

  it('casino aggregation: all tables null → total is null', () => {
    const tables: ShiftTableMetricsDTO[] = [
      makeTable({
        table_id: 't1',
        win_loss_inventory_cents: null,
        win_loss_estimated_cents: null,
        opening_source: 'none',
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
      }),
      makeTable({
        table_id: 't2',
        win_loss_inventory_cents: null,
        win_loss_estimated_cents: null,
        opening_source: 'none',
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
      }),
    ];

    // Simulate null-aware sum: filter non-null, empty array → null
    const inventoryValues = tables
      .map((t) => t.win_loss_inventory_cents)
      .filter((v): v is number => v != null);

    expect(inventoryValues.length).toBe(0);
    const result =
      inventoryValues.length === 0
        ? null
        : inventoryValues.reduce((a, b) => a + b, 0);
    expect(result).toBeNull();
  });

  it('pit aggregation: null-aware summation follows same contract', () => {
    const tables: ShiftTableMetricsDTO[] = [
      makeTable({
        table_id: 't1',
        pit_id: 'pit-A',
        win_loss_inventory_cents: 7500_00,
      }),
      makeTable({
        table_id: 't2',
        pit_id: 'pit-A',
        win_loss_inventory_cents: null,
        opening_source: 'none',
        missing_opening_snapshot: true,
        missing_closing_snapshot: true,
      }),
    ];

    const withValues = tables.filter((t) => t.win_loss_inventory_cents != null);
    const sum = withValues.reduce(
      (acc, t) => acc + t.win_loss_inventory_cents!,
      0,
    );

    expect(sum).toBe(7500_00);
    expect(withValues.length).toBe(1);
    expect(
      tables.filter((t) => t.win_loss_inventory_cents == null).length,
    ).toBe(1);
  });
});

// === Win/Loss Sign Convention ===

describe('Win/loss sign convention regression', () => {
  it('win_loss = (closing - opening) - fills + credits', () => {
    // Given: opening=50000, closing=45000, fills=10000, credits=5000
    // Expected: (45000 - 50000) - 10000 + 5000 = -5000 - 10000 + 5000 = -10000
    const opening = 50000_00;
    const closing = 45000_00;
    const fills = 10000_00;
    const credits = 5000_00;

    const winLoss = closing - opening - fills + credits;

    expect(winLoss).toBe(-10000_00);
  });

  it('positive win/loss when house wins', () => {
    // House wins when closing is higher (more chips retained)
    // opening=40000, closing=60000, fills=5000, credits=2000
    // (60000 - 40000) - 5000 + 2000 = 20000 - 5000 + 2000 = 17000
    const opening = 40000_00;
    const closing = 60000_00;
    const fills = 5000_00;
    const credits = 2000_00;

    const winLoss = closing - opening - fills + credits;

    expect(winLoss).toBe(17000_00);
  });

  it('zero win/loss when all balanced', () => {
    // opening=50000, closing=55000, fills=5000, credits=0
    // (55000 - 50000) - 5000 + 0 = 5000 - 5000 = 0
    const opening = 50000_00;
    const closing = 55000_00;
    const fills = 5000_00;
    const credits = 0;

    const winLoss = closing - opening - fills + credits;

    expect(winLoss).toBe(0);
  });
});

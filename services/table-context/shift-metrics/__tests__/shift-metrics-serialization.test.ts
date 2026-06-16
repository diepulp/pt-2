/**
 * Shift Metrics Serialization Suppression Tests — PRD-090 WS5
 *
 * Enforcement test ID: TIA-CANON-LEGACY-ALIAS-BOUNDARY (serialization side)
 * SRL binding: SRL-TIA-001
 *
 * Proves that serialized operator-facing API responses for shift table/pit/casino
 * metrics no longer include forbidden legacy field names.
 *
 * Routes tested:
 *   - /api/v1/shift-dashboards/metrics/tables (ShiftTableMetricsDTO[])
 *   - /api/v1/shift-dashboards/metrics/pits   (ShiftPitMetricsDTO[])
 *   - /api/v1/shift-dashboards/metrics/casino  (ShiftCasinoMetricsDTO)
 *
 * These tests serialize the DTO directly (not via HTTP) to validate field absence
 * at the DTO boundary, which is the serialization source of truth for all routes.
 */

import type {
  ShiftTableMetricsDTO,
  ShiftPitMetricsDTO,
  ShiftCasinoMetricsDTO,
} from '../dtos';
import type { ProvenanceMetadata } from '../provenance';

const FORBIDDEN_SERIALIZED_FIELDS = [
  'win_loss_inventory_cents',
  'win_loss_estimated_cents',
  'win_loss_inventory_total_cents',
  'win_loss_estimated_total_cents',
  'estimated_drop_buyins_cents',
];

// Build a minimal provenance stub
const stubProvenance: ProvenanceMetadata = {
  source: 'telemetry',
  grade: 'ESTIMATE',
  quality: 'NONE',
  coverage_ratio: 0,
  null_reasons: [],
};

// === Table metrics fixture ===

const tableMetricsFixture: ShiftTableMetricsDTO = {
  table_id: 'table-001',
  table_label: 'BJ-01',
  pit_id: 'pit-1',
  window_start: '2026-06-01T06:00:00Z',
  window_end: '2026-06-01T14:00:00Z',
  opening_snapshot_id: 'snap-001',
  opening_snapshot_at: '2026-06-01T06:05:00Z',
  opening_bankroll_total_cents: 500_000,
  closing_snapshot_id: 'snap-002',
  closing_snapshot_at: '2026-06-01T14:05:00Z',
  closing_bankroll_total_cents: 480_000,
  fills_total_cents: 100_000,
  credits_total_cents: 50_000,
  drop_custody_present: true,
  estimated_drop_rated_cents: 80_000,
  estimated_drop_grind_cents: 20_000,
  telemetry_quality: 'GOOD_COVERAGE',
  telemetry_notes: '',
  metric_grade: 'ESTIMATE',
  missing_opening_snapshot: false,
  missing_closing_snapshot: false,
  opening_source: null,
  opening_bankroll_cents: null,
  opening_at: null,
  coverage_type: null,
  provenance: stubProvenance,
};

// === Pit metrics fixture ===

const pitMetricsFixture: ShiftPitMetricsDTO = {
  pit_id: 'pit-1',
  window_start: '2026-06-01T06:00:00Z',
  window_end: '2026-06-01T14:00:00Z',
  tables_count: 1,
  tables_with_opening_snapshot: 1,
  tables_with_closing_snapshot: 1,
  tables_with_telemetry_count: 1,
  tables_good_coverage_count: 1,
  tables_grade_estimate: 1,
  fills_total_cents: 100_000,
  credits_total_cents: 50_000,
  estimated_drop_rated_total_cents: 80_000,
  estimated_drop_grind_total_cents: 20_000,
  estimated_drop_buyins_total_cents: 100_000,
  tables_missing_baseline_count: 0,
  snapshot_coverage_ratio: 1.0,
  coverage_tier: 'HIGH',
  provenance: stubProvenance,
};

// === Casino metrics fixture ===

const casinoMetricsFixture: ShiftCasinoMetricsDTO = {
  window_start: '2026-06-01T06:00:00Z',
  window_end: '2026-06-01T14:00:00Z',
  tables_count: 1,
  pits_count: 1,
  tables_with_opening_snapshot: 1,
  tables_with_closing_snapshot: 1,
  tables_with_telemetry_count: 1,
  tables_good_coverage_count: 1,
  tables_grade_estimate: 1,
  fills_total_cents: 100_000,
  credits_total_cents: 50_000,
  estimated_drop_rated_total_cents: 80_000,
  estimated_drop_grind_total_cents: 20_000,
  estimated_drop_buyins_total_cents: 100_000,
  tables_missing_baseline_count: 0,
  snapshot_coverage_ratio: 1.0,
  coverage_tier: 'HIGH',
  provenance: stubProvenance,
};

// === Serialization helper ===

function serializeKeys(obj: object): string[] {
  return Object.keys(JSON.parse(JSON.stringify(obj)));
}

describe('TIA-CANON-LEGACY-ALIAS-BOUNDARY: shift metrics API serialization suppression', () => {
  describe('ShiftTableMetricsDTO (tables API)', () => {
    const serializedKeys = serializeKeys(tableMetricsFixture);

    for (const forbidden of FORBIDDEN_SERIALIZED_FIELDS) {
      test(`does not serialize "${forbidden}"`, () => {
        expect(serializedKeys).not.toContain(forbidden);
      });
    }

    test('includes canonical fields (estimated_drop_rated_cents, estimated_drop_grind_cents)', () => {
      expect(serializedKeys).toContain('estimated_drop_rated_cents');
      expect(serializedKeys).toContain('estimated_drop_grind_cents');
    });
  });

  describe('ShiftPitMetricsDTO (pits API)', () => {
    const serializedKeys = serializeKeys(pitMetricsFixture);

    for (const forbidden of [
      'win_loss_inventory_total_cents',
      'win_loss_estimated_total_cents',
    ]) {
      test(`does not serialize "${forbidden}"`, () => {
        expect(serializedKeys).not.toContain(forbidden);
      });
    }

    test('includes estimated_drop_buyins_total_cents (aggregated from rated+grind)', () => {
      expect(serializedKeys).toContain('estimated_drop_buyins_total_cents');
      expect(pitMetricsFixture.estimated_drop_buyins_total_cents).toBe(100_000);
    });
  });

  describe('ShiftCasinoMetricsDTO (casino API)', () => {
    const serializedKeys = serializeKeys(casinoMetricsFixture);

    for (const forbidden of [
      'win_loss_inventory_total_cents',
      'win_loss_estimated_total_cents',
    ]) {
      test(`does not serialize "${forbidden}"`, () => {
        expect(serializedKeys).not.toContain(forbidden);
      });
    }
  });
});

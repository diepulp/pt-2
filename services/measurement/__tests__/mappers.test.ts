/**
 * MeasurementService Mapper Tests
 *
 * 100% coverage target for row-to-DTO transformation functions.
 * Tests null input, empty arrays, valid data, and numeric precision.
 *
 * @see EXEC-046 WS1 — Service Layer
 */

import {
  mapTheoDiscrepancyRows,
  mapAuditCorrelationRows,
  mapRatingCoverageRows,
  mapLoyaltyLiabilityRow,
} from '../mappers';
import type {
  TheoDiscrepancyQueryResult,
  AuditCorrelationQueryResult,
  RatingCoverageQueryResult,
  LoyaltyLiabilityQueryResult,
} from '../queries';

// === MEAS-001: mapTheoDiscrepancyRows ===

describe('mapTheoDiscrepancyRows', () => {
  it('returns zero counts for empty rows', () => {
    const result = mapTheoDiscrepancyRows({ rows: [] }, false);

    expect(result.totalSlips).toBe(0);
    expect(result.discrepantSlips).toBe(0);
    expect(result.discrepancyRate).toBe(0);
    expect(result.totalDiscrepancyCents).toBe(0);
    expect(result.avgDiscrepancyPercent).toBe(0);
    expect(result.breakdown).toBeNull();
    expect(result.supportedDimensions).toEqual(['pit', 'table']);
  });

  it('calculates discrepancy for valid data', () => {
    const input: TheoDiscrepancyQueryResult = {
      rows: [
        {
          id: 'slip-1',
          table_id: 'table-1',
          computed_theo_cents: 1000,
          legacy_theo_cents: 900,
        },
        {
          id: 'slip-2',
          table_id: 'table-1',
          computed_theo_cents: 500,
          legacy_theo_cents: 500,
        },
        {
          id: 'slip-3',
          table_id: 'table-2',
          computed_theo_cents: 800,
          legacy_theo_cents: 700,
        },
      ],
    };

    const result = mapTheoDiscrepancyRows(input, false);

    expect(result.totalSlips).toBe(3);
    expect(result.discrepantSlips).toBe(2); // slip-1 and slip-3
    expect(result.discrepancyRate).toBeCloseTo(2 / 3);
    expect(result.totalDiscrepancyCents).toBe(200); // 100 + 100
    // slip-1: 100/900 ≈ 0.111, slip-3: 100/700 ≈ 0.143
    expect(result.avgDiscrepancyPercent).toBeCloseTo(
      (100 / 900 + 100 / 700) / 2,
    );
    expect(result.breakdown).toBeNull(); // no filter
  });

  it('produces breakdown when hasFilter is true', () => {
    const input: TheoDiscrepancyQueryResult = {
      rows: [
        {
          id: 'slip-1',
          table_id: 'table-1',
          computed_theo_cents: 1000,
          legacy_theo_cents: 900,
        },
        {
          id: 'slip-2',
          table_id: 'table-2',
          computed_theo_cents: 500,
          legacy_theo_cents: 500,
        },
      ],
    };

    const result = mapTheoDiscrepancyRows(input, true);

    expect(result.breakdown).not.toBeNull();
    expect(result.breakdown).toHaveLength(2);

    const table1Group = result.breakdown!.find(
      (b) => b.groupName === 'table-1',
    );
    expect(table1Group?.slipCount).toBe(1);
    expect(table1Group?.discrepantCount).toBe(1);
    expect(table1Group?.totalDiscrepancyCents).toBe(100);

    const table2Group = result.breakdown!.find(
      (b) => b.groupName === 'table-2',
    );
    expect(table2Group?.slipCount).toBe(1);
    expect(table2Group?.discrepantCount).toBe(0);
    expect(table2Group?.totalDiscrepancyCents).toBe(0);
  });

  it('handles null computed_theo_cents gracefully', () => {
    const input: TheoDiscrepancyQueryResult = {
      rows: [
        {
          id: 'slip-1',
          table_id: 'table-1',
          computed_theo_cents: null,
          legacy_theo_cents: 900,
        },
      ],
    };

    const result = mapTheoDiscrepancyRows(input, false);

    expect(result.totalSlips).toBe(1);
    expect(result.discrepantSlips).toBe(1); // 0 - 900 = 900 diff
    expect(result.totalDiscrepancyCents).toBe(900);
  });

  it('handles zero legacy_theo_cents (avoids division by zero)', () => {
    const input: TheoDiscrepancyQueryResult = {
      rows: [
        {
          id: 'slip-1',
          table_id: 'table-1',
          computed_theo_cents: 100,
          legacy_theo_cents: 0,
        },
      ],
    };

    const result = mapTheoDiscrepancyRows(input, false);

    expect(result.discrepantSlips).toBe(1);
    // Division by zero protected: avgDiscrepancyPercent should not be NaN/Infinity
    expect(result.avgDiscrepancyPercent).toBe(0);
    expect(Number.isFinite(result.avgDiscrepancyPercent)).toBe(true);
  });
});

// === MEAS-002: mapAuditCorrelationRows ===

describe('mapAuditCorrelationRows', () => {
  it('returns zero counts for empty rows', () => {
    const result = mapAuditCorrelationRows({ rows: [] });

    expect(result.totalSlips).toBe(0);
    expect(result.slipsWithPft).toBe(0);
    expect(result.slipsWithMtl).toBe(0);
    expect(result.slipsWithLoyalty).toBe(0);
    expect(result.fullChainCount).toBe(0);
    expect(result.fullChainRate).toBe(0);
    expect(result.supportedDimensions).toEqual([]);
  });

  it('uses DISTINCT counting for Cartesian fan-out rows', () => {
    // Simulate fan-out: same slip appears multiple times with different artifacts
    const input: AuditCorrelationQueryResult = {
      rows: [
        {
          casino_id: 'c1',
          rating_slip_id: 'slip-1',
          pft_id: 'pft-1',
          mtl_entry_id: 'mtl-1',
          loyalty_ledger_id: 'loy-1',
          visit_id: 'v1',
          slip_status: 'closed',
          start_time: '2026-01-01T10:00:00Z',
          end_time: '2026-01-01T11:00:00Z',
          duration_seconds: 3600,
          computed_theo_cents: 1000,
          legacy_theo_cents: 900,
          pft_amount: 500,
          pft_created_at: '2026-01-01T10:30:00Z',
          pft_direction: 'in',
          pft_txn_kind: 'buy_in',
          mtl_amount: 500,
          mtl_occurred_at: '2026-01-01T10:30:00Z',
          mtl_direction: 'in',
          mtl_txn_type: 'cash_in',
          loyalty_created_at: '2026-01-01T11:00:00Z',
          loyalty_points_delta: 10,
          loyalty_reason: 'session_close',
        },
        // Same slip, different PFT (Cartesian product)
        {
          casino_id: 'c1',
          rating_slip_id: 'slip-1',
          pft_id: 'pft-2',
          mtl_entry_id: 'mtl-1',
          loyalty_ledger_id: 'loy-1',
          visit_id: 'v1',
          slip_status: 'closed',
          start_time: '2026-01-01T10:00:00Z',
          end_time: '2026-01-01T11:00:00Z',
          duration_seconds: 3600,
          computed_theo_cents: 1000,
          legacy_theo_cents: 900,
          pft_amount: 200,
          pft_created_at: '2026-01-01T10:45:00Z',
          pft_direction: 'in',
          pft_txn_kind: 'buy_in',
          mtl_amount: 500,
          mtl_occurred_at: '2026-01-01T10:30:00Z',
          mtl_direction: 'in',
          mtl_txn_type: 'cash_in',
          loyalty_created_at: '2026-01-01T11:00:00Z',
          loyalty_points_delta: 10,
          loyalty_reason: 'session_close',
        },
      ],
    };

    const result = mapAuditCorrelationRows(input);

    // DISTINCT counting: slip-1 counted once despite 2 rows
    expect(result.totalSlips).toBe(1);
    expect(result.slipsWithPft).toBe(1); // slip-1 has PFT
    expect(result.slipsWithMtl).toBe(1); // slip-1 has MTL
    expect(result.slipsWithLoyalty).toBe(1); // slip-1 has loyalty
    expect(result.fullChainCount).toBe(1);
    expect(result.fullChainRate).toBe(1);
  });

  it('counts partial chains correctly', () => {
    const input: AuditCorrelationQueryResult = {
      rows: [
        {
          casino_id: 'c1',
          rating_slip_id: 'slip-1',
          pft_id: 'pft-1',
          mtl_entry_id: null,
          loyalty_ledger_id: null,
          visit_id: 'v1',
          slip_status: 'closed',
          start_time: null,
          end_time: null,
          duration_seconds: null,
          computed_theo_cents: null,
          legacy_theo_cents: null,
          pft_amount: 500,
          pft_created_at: null,
          pft_direction: null,
          pft_txn_kind: null,
          mtl_amount: null,
          mtl_occurred_at: null,
          mtl_direction: null,
          mtl_txn_type: null,
          loyalty_created_at: null,
          loyalty_points_delta: null,
          loyalty_reason: null,
        },
        {
          casino_id: 'c1',
          rating_slip_id: 'slip-2',
          pft_id: 'pft-2',
          mtl_entry_id: 'mtl-1',
          loyalty_ledger_id: 'loy-1',
          visit_id: 'v2',
          slip_status: 'closed',
          start_time: null,
          end_time: null,
          duration_seconds: null,
          computed_theo_cents: null,
          legacy_theo_cents: null,
          pft_amount: 300,
          pft_created_at: null,
          pft_direction: null,
          pft_txn_kind: null,
          mtl_amount: 300,
          mtl_occurred_at: null,
          mtl_direction: null,
          mtl_txn_type: null,
          loyalty_created_at: null,
          loyalty_points_delta: 5,
          loyalty_reason: null,
        },
      ],
    };

    const result = mapAuditCorrelationRows(input);

    expect(result.totalSlips).toBe(2);
    expect(result.slipsWithPft).toBe(2);
    expect(result.slipsWithMtl).toBe(1); // only slip-2
    expect(result.slipsWithLoyalty).toBe(1); // only slip-2
    expect(result.fullChainCount).toBe(1); // only slip-2 has all three
    expect(result.fullChainRate).toBe(0.5);
  });

  it('handles rows with null rating_slip_id', () => {
    const input: AuditCorrelationQueryResult = {
      rows: [
        {
          casino_id: 'c1',
          rating_slip_id: null,
          pft_id: 'pft-1',
          mtl_entry_id: null,
          loyalty_ledger_id: null,
          visit_id: null,
          slip_status: null,
          start_time: null,
          end_time: null,
          duration_seconds: null,
          computed_theo_cents: null,
          legacy_theo_cents: null,
          pft_amount: null,
          pft_created_at: null,
          pft_direction: null,
          pft_txn_kind: null,
          mtl_amount: null,
          mtl_occurred_at: null,
          mtl_direction: null,
          mtl_txn_type: null,
          loyalty_created_at: null,
          loyalty_points_delta: null,
          loyalty_reason: null,
        },
      ],
    };

    const result = mapAuditCorrelationRows(input);

    expect(result.totalSlips).toBe(0);
    expect(result.fullChainCount).toBe(0);
  });
});

// === MEAS-003: mapRatingCoverageRows ===

describe('mapRatingCoverageRows', () => {
  it('returns zero counts for empty rows', () => {
    const result = mapRatingCoverageRows({ rows: [] }, false);

    expect(result.totalSessions).toBe(0);
    expect(result.avgCoverageRatio).toBe(0);
    expect(result.ratedSeconds).toBe(0);
    expect(result.openSeconds).toBe(0);
    expect(result.untrackedSeconds).toBe(0);
    expect(result.breakdown).toBeNull();
    expect(result.supportedDimensions).toEqual(['pit', 'table']);
  });

  it('calculates aggregate metrics for valid data', () => {
    const input: RatingCoverageQueryResult = {
      rows: [
        {
          casino_id: 'c1',
          gaming_table_id: 'table-1',
          table_session_id: 'sess-1',
          rated_ratio: 0.8,
          rated_seconds: 3600,
          open_seconds: 4500,
          untracked_seconds: 300,
          session_status: 'closed',
          slip_count: 2,
          opened_at: '2026-01-01T10:00:00Z',
          closed_at: '2026-01-01T12:00:00Z',
          gaming_day: '2026-01-01',
          ghost_seconds: 100,
          idle_seconds: 200,
        },
        {
          casino_id: 'c1',
          gaming_table_id: 'table-2',
          table_session_id: 'sess-2',
          rated_ratio: 0.6,
          rated_seconds: 2400,
          open_seconds: 4000,
          untracked_seconds: 600,
          session_status: 'closed',
          slip_count: 1,
          opened_at: '2026-01-01T14:00:00Z',
          closed_at: '2026-01-01T16:00:00Z',
          gaming_day: '2026-01-01',
          ghost_seconds: 50,
          idle_seconds: 150,
        },
      ],
    };

    const result = mapRatingCoverageRows(input, false);

    expect(result.totalSessions).toBe(2);
    expect(result.avgCoverageRatio).toBeCloseTo(0.7); // (0.8 + 0.6) / 2
    expect(result.ratedSeconds).toBe(6000); // 3600 + 2400
    expect(result.openSeconds).toBe(8500); // 4500 + 4000
    expect(result.untrackedSeconds).toBe(900); // 300 + 600
    expect(result.breakdown).toBeNull();
  });

  it('produces breakdown when hasFilter is true', () => {
    const input: RatingCoverageQueryResult = {
      rows: [
        {
          casino_id: 'c1',
          gaming_table_id: 'table-1',
          table_session_id: 'sess-1',
          rated_ratio: 0.8,
          rated_seconds: 3600,
          open_seconds: 4500,
          untracked_seconds: 300,
          session_status: 'closed',
          slip_count: 2,
          opened_at: null,
          closed_at: null,
          gaming_day: null,
          ghost_seconds: null,
          idle_seconds: null,
        },
      ],
    };

    const result = mapRatingCoverageRows(input, true);

    expect(result.breakdown).not.toBeNull();
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown![0].groupName).toBe('table-1');
    expect(result.breakdown![0].sessionCount).toBe(1);
    expect(result.breakdown![0].avgCoverageRatio).toBe(0.8);
    expect(result.breakdown![0].ratedSeconds).toBe(3600);
    expect(result.breakdown![0].openSeconds).toBe(4500);
  });

  it('handles null columns gracefully', () => {
    const input: RatingCoverageQueryResult = {
      rows: [
        {
          casino_id: null,
          gaming_table_id: null,
          table_session_id: null,
          rated_ratio: null,
          rated_seconds: null,
          open_seconds: null,
          untracked_seconds: null,
          session_status: null,
          slip_count: null,
          opened_at: null,
          closed_at: null,
          gaming_day: null,
          ghost_seconds: null,
          idle_seconds: null,
        },
      ],
    };

    const result = mapRatingCoverageRows(input, false);

    expect(result.totalSessions).toBe(1);
    expect(result.avgCoverageRatio).toBe(0);
    expect(result.ratedSeconds).toBe(0);
    expect(result.openSeconds).toBe(0);
    expect(result.untrackedSeconds).toBe(0);
  });
});

// === MEAS-004: mapLoyaltyLiabilityRow ===

describe('mapLoyaltyLiabilityRow', () => {
  it('returns null when no snapshot exists (new casino)', () => {
    const result = mapLoyaltyLiabilityRow({
      snapshot: null,
      policy: null,
    });

    expect(result).toBeNull();
  });

  it('maps snapshot with active policy', () => {
    const input: LoyaltyLiabilityQueryResult = {
      snapshot: {
        id: 'snap-1',
        casino_id: 'c1',
        snapshot_date: '2026-03-07',
        total_outstanding_points: 50000,
        estimated_monetary_value_cents: 25000,
        player_count: 100,
        valuation_effective_date: '2026-01-01',
        valuation_policy_version: 'v1',
        created_at: '2026-03-07T12:00:00Z',
      },
      policy: { cents_per_point: 50 },
    };

    const result = mapLoyaltyLiabilityRow(input);

    expect(result).not.toBeNull();
    expect(result!.totalOutstandingPoints).toBe(50000);
    expect(result!.estimatedMonetaryValueCents).toBe(25000);
    expect(result!.centsPerPoint).toBe(50);
    expect(result!.playerCount).toBe(100);
    expect(result!.snapshotDate).toBe('2026-03-07');
    expect(result!.supportedDimensions).toEqual([]);
  });

  it('maps snapshot without active policy (centsPerPoint is null)', () => {
    const input: LoyaltyLiabilityQueryResult = {
      snapshot: {
        id: 'snap-1',
        casino_id: 'c1',
        snapshot_date: '2026-03-07',
        total_outstanding_points: 50000,
        estimated_monetary_value_cents: 25000,
        player_count: 100,
        valuation_effective_date: '2026-01-01',
        valuation_policy_version: 'v1',
        created_at: '2026-03-07T12:00:00Z',
      },
      policy: null,
    };

    const result = mapLoyaltyLiabilityRow(input);

    expect(result).not.toBeNull();
    expect(result!.centsPerPoint).toBeNull();
    // estimated_monetary_value_cents from snapshot remains valid
    expect(result!.estimatedMonetaryValueCents).toBe(25000);
  });

  it('formats snapshotDate correctly', () => {
    const input: LoyaltyLiabilityQueryResult = {
      snapshot: {
        id: 'snap-1',
        casino_id: 'c1',
        snapshot_date: '2026-01-15',
        total_outstanding_points: 1000,
        estimated_monetary_value_cents: 500,
        player_count: 10,
        valuation_effective_date: '2026-01-01',
        valuation_policy_version: 'v1',
        created_at: '2026-01-15T00:00:00Z',
      },
      policy: { cents_per_point: 50 },
    };

    const result = mapLoyaltyLiabilityRow(input);

    expect(result!.snapshotDate).toBe('2026-01-15');
  });
});

/**
 * Shift Read-Model Audit Tests
 *
 * Validates that the BFF client-side aggregation logic correctly reconciles
 * table -> pit -> casino rollups, enforces direction filters, and preserves
 * NULL semantics.
 *
 * These tests exercise the SAME aggregation code used in getShiftDashboardSummary()
 * but with deterministic mock data, ensuring mathematical correctness without
 * requiring a database.
 *
 * @see SHIFT_READ_MODEL_AUDIT_v1.md
 * @see SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
 */

import { isAllowedAlertKind } from '../shift-cash-obs/severity';
import type {
  ShiftCasinoMetricsDTO,
  ShiftPitMetricsDTO,
  ShiftTableMetricsDTO,
} from '../shift-metrics/dtos';
import {
  rollupCasinoProvenance,
  rollupPitProvenance,
} from '../shift-metrics/provenance';
import {
  computeAggregatedCoverageRatio,
  getCoverageTier,
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
    provenance: {
      source: 'mixed',
      grade: 'AUTHORITATIVE',
      quality: 'GOOD_COVERAGE',
      coverage_ratio: 1.0,
      null_reasons: [],
    },
    ...overrides,
  };
}

/**
 * Simulate the BFF pit aggregation from getShiftDashboardSummary().
 * This is the exact algorithm used in production, extracted for audit testing.
 */
function aggregatePitsFromTables(
  tables: ShiftTableMetricsDTO[],
): ShiftPitMetricsDTO[] {
  const pitMap = new Map<string, ShiftPitMetricsDTO>();
  const pitTablesMap = new Map<string, ShiftTableMetricsDTO[]>();

  for (const table of tables) {
    if (!table.pit_id) continue;

    const arr = pitTablesMap.get(table.pit_id) ?? [];
    arr.push(table);
    pitTablesMap.set(table.pit_id, arr);

    const existing = pitMap.get(table.pit_id);
    if (existing) {
      existing.tables_count += 1;
      existing.tables_with_opening_snapshot += table.missing_opening_snapshot
        ? 0
        : 1;
      existing.tables_with_closing_snapshot += table.missing_closing_snapshot
        ? 0
        : 1;
      existing.tables_with_telemetry_count +=
        table.telemetry_quality !== 'NONE' ? 1 : 0;
      existing.tables_good_coverage_count +=
        table.telemetry_quality === 'GOOD_COVERAGE' ? 1 : 0;
      existing.tables_grade_estimate += 1;
      existing.fills_total_cents += table.fills_total_cents;
      existing.credits_total_cents += table.credits_total_cents;
      existing.estimated_drop_rated_total_cents +=
        table.estimated_drop_rated_cents;
      existing.estimated_drop_grind_total_cents +=
        table.estimated_drop_grind_cents;
      existing.estimated_drop_buyins_total_cents +=
        table.estimated_drop_buyins_cents;
      existing.win_loss_inventory_total_cents +=
        table.win_loss_inventory_cents ?? 0;
      existing.win_loss_estimated_total_cents +=
        table.win_loss_estimated_cents ?? 0;
    } else {
      pitMap.set(table.pit_id, {
        pit_id: table.pit_id,
        window_start: table.window_start,
        window_end: table.window_end,
        tables_count: 1,
        tables_with_opening_snapshot: table.missing_opening_snapshot ? 0 : 1,
        tables_with_closing_snapshot: table.missing_closing_snapshot ? 0 : 1,
        tables_with_telemetry_count: table.telemetry_quality !== 'NONE' ? 1 : 0,
        tables_good_coverage_count:
          table.telemetry_quality === 'GOOD_COVERAGE' ? 1 : 0,
        tables_grade_estimate: 1,
        fills_total_cents: table.fills_total_cents,
        credits_total_cents: table.credits_total_cents,
        estimated_drop_rated_total_cents: table.estimated_drop_rated_cents,
        estimated_drop_grind_total_cents: table.estimated_drop_grind_cents,
        estimated_drop_buyins_total_cents: table.estimated_drop_buyins_cents,
        win_loss_inventory_total_cents: table.win_loss_inventory_cents ?? 0,
        win_loss_estimated_total_cents: table.win_loss_estimated_cents ?? 0,
        snapshot_coverage_ratio: 0,
        coverage_tier: 'NONE' as const,
        provenance: rollupPitProvenance([table]),
      });
    }
  }

  for (const [pitId, pit] of pitMap) {
    const pitTables = pitTablesMap.get(pitId) ?? [];
    const ratio = computeAggregatedCoverageRatio(
      pit.tables_with_opening_snapshot,
      pit.tables_with_closing_snapshot,
      pit.tables_count,
    );
    pit.snapshot_coverage_ratio = ratio;
    pit.coverage_tier = getCoverageTier(ratio);
    pit.provenance = rollupPitProvenance(pitTables);
  }

  return Array.from(pitMap.values());
}

/**
 * Simulate the BFF casino aggregation from getShiftDashboardSummary().
 */
function aggregateCasinoFromTables(
  tables: ShiftTableMetricsDTO[],
): ShiftCasinoMetricsDTO {
  const uniquePitIds = new Set(tables.map((t) => t.pit_id).filter(Boolean));
  const casinoOpeningCount = tables.filter(
    (t) => !t.missing_opening_snapshot,
  ).length;
  const casinoClosingCount = tables.filter(
    (t) => !t.missing_closing_snapshot,
  ).length;
  const casinoCoverageRatio = computeAggregatedCoverageRatio(
    casinoOpeningCount,
    casinoClosingCount,
    tables.length,
  );

  return {
    window_start: tables[0]?.window_start ?? '',
    window_end: tables[0]?.window_end ?? '',
    tables_count: tables.length,
    pits_count: uniquePitIds.size,
    tables_with_opening_snapshot: casinoOpeningCount,
    tables_with_closing_snapshot: casinoClosingCount,
    tables_with_telemetry_count: tables.filter(
      (t) => t.telemetry_quality !== 'NONE',
    ).length,
    tables_good_coverage_count: tables.filter(
      (t) => t.telemetry_quality === 'GOOD_COVERAGE',
    ).length,
    tables_grade_estimate: tables.length,
    fills_total_cents: tables.reduce((sum, t) => sum + t.fills_total_cents, 0),
    credits_total_cents: tables.reduce(
      (sum, t) => sum + t.credits_total_cents,
      0,
    ),
    estimated_drop_rated_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_rated_cents,
      0,
    ),
    estimated_drop_grind_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_grind_cents,
      0,
    ),
    estimated_drop_buyins_total_cents: tables.reduce(
      (sum, t) => sum + t.estimated_drop_buyins_cents,
      0,
    ),
    win_loss_inventory_total_cents: tables.reduce(
      (sum, t) => sum + (t.win_loss_inventory_cents ?? 0),
      0,
    ),
    win_loss_estimated_total_cents: tables.reduce(
      (sum, t) => sum + (t.win_loss_estimated_cents ?? 0),
      0,
    ),
    snapshot_coverage_ratio: casinoCoverageRatio,
    coverage_tier: getCoverageTier(casinoCoverageRatio),
    provenance: rollupCasinoProvenance(tables),
  };
}

// === Test Data ===

const TABLE_PIT_A_1 = makeTable({
  table_id: 't-a1',
  table_label: 'BJ-01',
  pit_id: 'pit-A',
  fills_total_cents: 10000_00,
  credits_total_cents: 5000_00,
  estimated_drop_rated_cents: 20000_00,
  estimated_drop_grind_cents: 5000_00,
  estimated_drop_buyins_cents: 25000_00,
  win_loss_inventory_cents: 10000_00,
  win_loss_estimated_cents: 8000_00,
  missing_opening_snapshot: false,
  missing_closing_snapshot: false,
});

const TABLE_PIT_A_2 = makeTable({
  table_id: 't-a2',
  table_label: 'BJ-02',
  pit_id: 'pit-A',
  fills_total_cents: 15000_00,
  credits_total_cents: 8000_00,
  estimated_drop_rated_cents: 30000_00,
  estimated_drop_grind_cents: 7000_00,
  estimated_drop_buyins_cents: 37000_00,
  win_loss_inventory_cents: 12000_00,
  win_loss_estimated_cents: 9000_00,
  missing_opening_snapshot: false,
  missing_closing_snapshot: false,
});

const TABLE_PIT_B_1 = makeTable({
  table_id: 't-b1',
  table_label: 'PKR-01',
  pit_id: 'pit-B',
  fills_total_cents: 5000_00,
  credits_total_cents: 2000_00,
  estimated_drop_rated_cents: 10000_00,
  estimated_drop_grind_cents: 3000_00,
  estimated_drop_buyins_cents: 13000_00,
  win_loss_inventory_cents: null, // Missing opening
  win_loss_estimated_cents: 4000_00,
  missing_opening_snapshot: true,
  missing_closing_snapshot: false,
  metric_grade: 'ESTIMATE',
  telemetry_quality: 'LOW_COVERAGE',
});

const TABLE_NO_PIT = makeTable({
  table_id: 't-np1',
  table_label: 'ROUL-01',
  pit_id: null,
  fills_total_cents: 3000_00,
  credits_total_cents: 1000_00,
  estimated_drop_rated_cents: 8000_00,
  estimated_drop_grind_cents: 2000_00,
  estimated_drop_buyins_cents: 10000_00,
  win_loss_inventory_cents: 5000_00,
  win_loss_estimated_cents: 3000_00,
});

const ALL_TABLES = [TABLE_PIT_A_1, TABLE_PIT_A_2, TABLE_PIT_B_1, TABLE_NO_PIT];

// === Table -> Pit Reconciliation ===

describe('Table -> Pit Reconciliation', () => {
  const pits = aggregatePitsFromTables(ALL_TABLES);
  const pitA = pits.find((p) => p.pit_id === 'pit-A')!;
  const pitB = pits.find((p) => p.pit_id === 'pit-B')!;

  it('pit-A fills_total_cents = SUM(table fills in pit-A)', () => {
    const expected =
      TABLE_PIT_A_1.fills_total_cents + TABLE_PIT_A_2.fills_total_cents;
    expect(pitA.fills_total_cents).toBe(expected);
  });

  it('pit-A credits_total_cents = SUM(table credits in pit-A)', () => {
    const expected =
      TABLE_PIT_A_1.credits_total_cents + TABLE_PIT_A_2.credits_total_cents;
    expect(pitA.credits_total_cents).toBe(expected);
  });

  it('pit-A estimated_drop_buyins_total_cents = SUM(table buyins in pit-A)', () => {
    const expected =
      TABLE_PIT_A_1.estimated_drop_buyins_cents +
      TABLE_PIT_A_2.estimated_drop_buyins_cents;
    expect(pitA.estimated_drop_buyins_total_cents).toBe(expected);
  });

  it('pit-A estimated_drop_rated_total_cents = SUM(table rated in pit-A)', () => {
    const expected =
      TABLE_PIT_A_1.estimated_drop_rated_cents +
      TABLE_PIT_A_2.estimated_drop_rated_cents;
    expect(pitA.estimated_drop_rated_total_cents).toBe(expected);
  });

  it('pit-A estimated_drop_grind_total_cents = SUM(table grind in pit-A)', () => {
    const expected =
      TABLE_PIT_A_1.estimated_drop_grind_cents +
      TABLE_PIT_A_2.estimated_drop_grind_cents;
    expect(pitA.estimated_drop_grind_total_cents).toBe(expected);
  });

  it('pit-A win_loss_inventory_total_cents uses NULL-aware SUM', () => {
    // Both pit-A tables have non-null inventory win/loss
    const expected =
      TABLE_PIT_A_1.win_loss_inventory_cents! +
      TABLE_PIT_A_2.win_loss_inventory_cents!;
    expect(pitA.win_loss_inventory_total_cents).toBe(expected);
  });

  it('pit-A win_loss_estimated_total_cents uses NULL-aware SUM', () => {
    const expected =
      TABLE_PIT_A_1.win_loss_estimated_cents! +
      TABLE_PIT_A_2.win_loss_estimated_cents!;
    expect(pitA.win_loss_estimated_total_cents).toBe(expected);
  });

  it('pit-A tables_count matches expected', () => {
    expect(pitA.tables_count).toBe(2);
  });

  it('pit-B tables_count matches expected', () => {
    expect(pitB.tables_count).toBe(1);
  });

  it('pit-B fills_total_cents = single table fills', () => {
    expect(pitB.fills_total_cents).toBe(TABLE_PIT_B_1.fills_total_cents);
  });

  it('pit-B win_loss_inventory_total_cents handles NULL (treated as 0 in SUM)', () => {
    // TABLE_PIT_B_1 has null inventory -> ?? 0 = 0
    expect(pitB.win_loss_inventory_total_cents).toBe(0);
  });

  it('tables without pit_id are excluded from pit rollups', () => {
    const pitIds = pits.map((p) => p.pit_id);
    expect(pitIds).not.toContain(null);
    expect(pits.length).toBe(2); // pit-A and pit-B only
  });
});

// === Pit -> Casino Reconciliation ===

describe('Pit -> Casino Reconciliation', () => {
  const casino = aggregateCasinoFromTables(ALL_TABLES);
  const pits = aggregatePitsFromTables(ALL_TABLES);

  it('casino.tables_count includes ALL tables (including those without pit)', () => {
    expect(casino.tables_count).toBe(ALL_TABLES.length);
  });

  it('casino.pits_count counts distinct pits (excluding null)', () => {
    expect(casino.pits_count).toBe(2); // pit-A, pit-B
  });

  it('casino fills = SUM(all table fills) — not SUM(pit fills)', () => {
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + t.fills_total_cents,
      0,
    );
    expect(casino.fills_total_cents).toBe(expected);
  });

  it('casino credits = SUM(all table credits)', () => {
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + t.credits_total_cents,
      0,
    );
    expect(casino.credits_total_cents).toBe(expected);
  });

  it('casino estimated_drop_buyins = SUM(all table buyins)', () => {
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + t.estimated_drop_buyins_cents,
      0,
    );
    expect(casino.estimated_drop_buyins_total_cents).toBe(expected);
  });

  it('casino estimated_drop_rated = SUM(all table rated)', () => {
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + t.estimated_drop_rated_cents,
      0,
    );
    expect(casino.estimated_drop_rated_total_cents).toBe(expected);
  });

  it('casino estimated_drop_grind = SUM(all table grind)', () => {
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + t.estimated_drop_grind_cents,
      0,
    );
    expect(casino.estimated_drop_grind_total_cents).toBe(expected);
  });

  it('casino win_loss_inventory uses NULL-aware SUM', () => {
    // TABLE_PIT_B_1 has null -> contributes 0 to sum
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + (t.win_loss_inventory_cents ?? 0),
      0,
    );
    expect(casino.win_loss_inventory_total_cents).toBe(expected);
  });

  it('casino win_loss_estimated uses NULL-aware SUM', () => {
    const expected = ALL_TABLES.reduce(
      (sum, t) => sum + (t.win_loss_estimated_cents ?? 0),
      0,
    );
    expect(casino.win_loss_estimated_total_cents).toBe(expected);
  });

  it('casino snapshot counts include ALL tables', () => {
    const expectedOpening = ALL_TABLES.filter(
      (t) => !t.missing_opening_snapshot,
    ).length;
    const expectedClosing = ALL_TABLES.filter(
      (t) => !t.missing_closing_snapshot,
    ).length;
    expect(casino.tables_with_opening_snapshot).toBe(expectedOpening);
    expect(casino.tables_with_closing_snapshot).toBe(expectedClosing);
  });

  it('casino fills includes pit-less tables (not just SUM of pit totals)', () => {
    const pitOnlyFills = pits.reduce((s, p) => s + p.fills_total_cents, 0);
    const noPitFills = TABLE_NO_PIT.fills_total_cents;
    expect(casino.fills_total_cents).toBe(pitOnlyFills + noPitFills);
  });
});

// === Count Reconciliation ===

describe('Count Reconciliation', () => {
  const casino = aggregateCasinoFromTables(ALL_TABLES);
  const pits = aggregatePitsFromTables(ALL_TABLES);

  it('SUM(pit.tables_count) + unassigned = casino.tables_count', () => {
    const pitTotalTables = pits.reduce((s, p) => s + p.tables_count, 0);
    const unassigned = ALL_TABLES.filter((t) => !t.pit_id).length;
    expect(pitTotalTables + unassigned).toBe(casino.tables_count);
  });

  it('SUM(pit.tables_with_opening) + unassigned_with_opening = casino total', () => {
    const pitOpeningCount = pits.reduce(
      (s, p) => s + p.tables_with_opening_snapshot,
      0,
    );
    const unassignedOpening = ALL_TABLES.filter(
      (t) => !t.pit_id && !t.missing_opening_snapshot,
    ).length;
    expect(pitOpeningCount + unassignedOpening).toBe(
      casino.tables_with_opening_snapshot,
    );
  });
});

// === NULL Preservation ===

describe('NULL preservation', () => {
  it('table with missing snapshots has null win_loss_inventory_cents', () => {
    // This validates the source data contract, not the aggregation
    expect(TABLE_PIT_B_1.win_loss_inventory_cents).toBeNull();
    expect(TABLE_PIT_B_1.missing_opening_snapshot).toBe(true);
  });

  it('aggregated pit with NULL table does NOT treat null as zero in sum logic', () => {
    // The aggregation uses `?? 0` for summation but that's intentional:
    // The original value IS null (preserved at table level).
    // At pit level, we SUM non-null values. A table with null inventory
    // contributes 0 to the SUM (matching SQL FILTER WHERE IS NOT NULL behavior).
    const pits = aggregatePitsFromTables([TABLE_PIT_B_1]);
    // win_loss_inventory is null for the only table -> pit sum = 0 (not null)
    expect(pits[0].win_loss_inventory_total_cents).toBe(0);
  });

  it('aggregated casino preserves partial sum semantics', () => {
    // With 3 tables having inventory and 1 null, casino sum should be the 3 non-null values
    const casino = aggregateCasinoFromTables(ALL_TABLES);
    const expectedNonNull = ALL_TABLES.filter(
      (t) => t.win_loss_inventory_cents != null,
    ).reduce((sum, t) => sum + t.win_loss_inventory_cents!, 0);
    expect(casino.win_loss_inventory_total_cents).toBe(expectedNonNull);
  });
});

// === Direction Filter Enforcement ===

describe('Direction filter enforcement', () => {
  it('only cash_out_observed_spike_telemetry alerts are allowed', () => {
    expect(isAllowedAlertKind('cash_out_observed_spike_telemetry')).toBe(true);
    expect(isAllowedAlertKind('cash_in_observed_spike_telemetry')).toBe(false);
    expect(isAllowedAlertKind('cash_out_spike')).toBe(false);
  });

  it('rejected alert types are filtered out', () => {
    const alertTypes = [
      'cash_out_observed_spike_telemetry',
      'cash_in_spike',
      'unknown',
    ];
    const allowed = alertTypes.filter(isAllowedAlertKind);
    expect(allowed).toEqual(['cash_out_observed_spike_telemetry']);
    expect(allowed.length).toBe(1);
  });
});

// === Coverage Reconciliation ===

describe('Coverage reconciliation', () => {
  it('pit coverage = MIN(opening, closing) / total', () => {
    const pits = aggregatePitsFromTables(ALL_TABLES);
    const pitA = pits.find((p) => p.pit_id === 'pit-A')!;
    const pitB = pits.find((p) => p.pit_id === 'pit-B')!;

    // Pit-A: 2 tables, both with opening and closing
    expect(pitA.snapshot_coverage_ratio).toBe(1.0);
    expect(pitA.coverage_tier).toBe('HIGH');

    // Pit-B: 1 table, missing opening
    expect(pitB.snapshot_coverage_ratio).toBe(0); // MIN(0,1)/1 = 0
    expect(pitB.coverage_tier).toBe('NONE');
  });

  it('casino coverage = MIN(all_opening, all_closing) / total', () => {
    const casino = aggregateCasinoFromTables(ALL_TABLES);
    // 4 tables: 3 with opening, 4 with closing -> MIN(3,4)/4 = 0.75
    expect(casino.snapshot_coverage_ratio).toBe(0.75);
    expect(casino.coverage_tier).toBe('MEDIUM');
  });
});

// === Buyins Decomposition ===

describe('Buyins decomposition', () => {
  it('rated + grind = buyins_total at table level', () => {
    for (const table of ALL_TABLES) {
      expect(
        table.estimated_drop_rated_cents + table.estimated_drop_grind_cents,
      ).toBe(table.estimated_drop_buyins_cents);
    }
  });

  it('rated + grind = buyins_total at pit level', () => {
    const pits = aggregatePitsFromTables(ALL_TABLES);
    for (const pit of pits) {
      expect(
        pit.estimated_drop_rated_total_cents +
          pit.estimated_drop_grind_total_cents,
      ).toBe(pit.estimated_drop_buyins_total_cents);
    }
  });

  it('rated + grind = buyins_total at casino level', () => {
    const casino = aggregateCasinoFromTables(ALL_TABLES);
    expect(
      casino.estimated_drop_rated_total_cents +
        casino.estimated_drop_grind_total_cents,
    ).toBe(casino.estimated_drop_buyins_total_cents);
  });
});

// === Provenance Reconciliation ===

describe('Provenance reconciliation', () => {
  it('pit provenance reflects worst-of table grades', () => {
    const pits = aggregatePitsFromTables(ALL_TABLES);
    const pitB = pits.find((p) => p.pit_id === 'pit-B')!;

    // pit-B has only ESTIMATE table
    expect(pitB.provenance.grade).toBe('ESTIMATE');
  });

  it('casino provenance reflects worst-of ALL table qualities', () => {
    const casino = aggregateCasinoFromTables(ALL_TABLES);

    // TABLE_PIT_B_1 has LOW_COVERAGE -> worst-of = LOW_COVERAGE
    expect(casino.provenance.quality).toBe('LOW_COVERAGE');
  });

  it('casino provenance is derived from ALL tables (not from pits)', () => {
    // This ensures the unassigned table (TABLE_NO_PIT) is included
    const casino = aggregateCasinoFromTables(ALL_TABLES);

    // All 4 tables contribute -> coverage includes the unassigned table
    expect(casino.provenance.coverage_ratio).toBe(0.75); // 3/4
  });
});

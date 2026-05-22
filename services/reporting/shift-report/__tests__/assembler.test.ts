/** @jest-environment node */
/**
 * ShiftReport Assembly Service Tests
 *
 * Tests the cross-context assembly: happy path, partial failure, empty data.
 * Uses typed Supabase doubles to simulate source call results.
 *
 * @see EXEC-065 WS1
 * @see QA-001 Service Testing Strategy
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { ShiftReportParams } from '../dtos';

// ── Test Fixtures ───────────────────────────────────────────────────────────

const TEST_PARAMS: ShiftReportParams = {
  casinoId: '00000000-0000-0000-0000-000000000001',
  casinoName: 'Test Casino',
  startTs: '2026-04-15T06:00:00.000Z',
  endTs: '2026-04-15T14:00:00.000Z',
  gamingDay: '2026-04-15',
  shiftBoundary: 'day',
};

function makeTableMetrics(overrides: Record<string, unknown> = {}) {
  return {
    table_id: 'table-1',
    table_label: 'BJ-1',
    pit_id: 'pit-1',
    window_start: TEST_PARAMS.startTs,
    window_end: TEST_PARAMS.endTs,
    opening_snapshot_id: 'snap-1',
    opening_snapshot_at: TEST_PARAMS.startTs,
    opening_bankroll_total_cents: 50000_00,
    closing_snapshot_id: 'snap-2',
    closing_snapshot_at: TEST_PARAMS.endTs,
    closing_bankroll_total_cents: 48000_00,
    fills_total_cents: 10000_00,
    credits_total_cents: 5000_00,
    drop_custody_present: true,
    estimated_drop_rated_cents: 30000_00,
    estimated_drop_grind_cents: 5000_00,
    estimated_drop_buyins_cents: 2000_00,
    telemetry_quality: 'GOOD_COVERAGE' as const,
    telemetry_notes: '',
    win_loss_inventory_cents: 7000_00,
    win_loss_estimated_cents: 6800_00,
    metric_grade: 'ESTIMATE' as const,
    missing_opening_snapshot: false,
    missing_closing_snapshot: false,
    opening_source: null,
    opening_bankroll_cents: null,
    opening_at: null,
    coverage_type: null,
    provenance: {
      source: 'telemetry' as const,
      grade: 'ESTIMATE' as const,
      quality: 'GOOD_COVERAGE' as const,
      coverage_ratio: 1,
      null_reasons: [],
    },
    ...overrides,
  };
}

function makeDashboardSummary() {
  const table1 = makeTableMetrics();
  const table2 = makeTableMetrics({
    table_id: 'table-2',
    table_label: 'BJ-2',
    fills_total_cents: 8000_00,
    credits_total_cents: 3000_00,
    estimated_drop_rated_cents: 25000_00,
    estimated_drop_grind_cents: 4000_00,
    estimated_drop_buyins_cents: 1000_00,
    win_loss_inventory_cents: 5000_00,
    win_loss_estimated_cents: 4800_00,
  });

  return {
    tables: [table1, table2],
    pits: [],
    casino: {
      window_start: TEST_PARAMS.startTs,
      window_end: TEST_PARAMS.endTs,
      tables_count: 2,
      pits_count: 1,
      tables_with_opening_snapshot: 2,
      tables_with_closing_snapshot: 2,
      tables_with_telemetry_count: 2,
      tables_good_coverage_count: 2,
      tables_grade_estimate: 2,
      fills_total_cents: 18000_00,
      credits_total_cents: 8000_00,
      estimated_drop_rated_total_cents: 55000_00,
      estimated_drop_grind_total_cents: 9000_00,
      estimated_drop_buyins_total_cents: 3000_00,
      win_loss_inventory_total_cents: 12000_00,
      win_loss_estimated_total_cents: 11600_00,
      tables_missing_baseline_count: 0,
      snapshot_coverage_ratio: 1,
      coverage_tier: 'FULL',
      provenance: {
        source: 'telemetry' as const,
        grade: 'ESTIMATE' as const,
        quality: 'GOOD_COVERAGE' as const,
        coverage_ratio: 1,
        null_reasons: [],
      },
    },
  };
}

function makeCashObs() {
  return [
    {
      table_id: 'table-1',
      table_label: 'BJ-1',
      pit: 'pit-1',
      cash_out_observed_estimate_total: 2500_00,
      cash_out_observed_confirmed_total: 2000_00,
      cash_out_observation_count: 5,
      cash_out_last_observed_at: '2026-04-15T12:00:00.000Z',
    },
  ];
}

function makeMeasurementSummary() {
  return {
    theoDiscrepancy: {
      totalSlips: 20,
      discrepantSlips: 3,
      discrepancyRate: 0.15,
      totalDiscrepancyCents: 500_00,
      avgDiscrepancyPercent: 0.08,
      breakdown: null,
      supportedDimensions: ['pit' as const, 'table' as const],
    },
    auditCorrelation: {
      totalSlips: 20,
      slipsWithPft: 18,
      slipsWithMtl: 15,
      slipsWithLoyalty: 12,
      fullChainCount: 10,
      fullChainRate: 0.5,
      supportedDimensions: [] as ('pit' | 'table')[],
    },
    ratingCoverage: {
      totalSessions: 10,
      avgCoverageRatio: 0.85,
      ratedSeconds: 28800,
      openSeconds: 33900,
      untrackedSeconds: 5100,
      breakdown: null,
      supportedDimensions: ['pit' as const, 'table' as const],
    },
    loyaltyLiability: {
      totalOutstandingPoints: 150000,
      estimatedMonetaryValueCents: 75000_00,
      centsPerPoint: 50,
      playerCount: 45,
      snapshotDate: '2026-04-15',
      supportedDimensions: [] as ('pit' | 'table')[],
    },
    errors: {},
    filters: {},
  };
}

function makeAnomalyAlerts() {
  return {
    alerts: [
      {
        tableId: 'table-1',
        tableLabel: 'BJ-1',
        metricType: 'drop_total' as const,
        readinessState: 'ready' as const,
        observedValue: 50000_00,
        baselineMedian: 35000_00,
        baselineMad: 5000_00,
        deviationScore: 3.0,
        isAnomaly: true,
        severity: 'warn' as const,
        direction: 'above' as const,
        thresholdValue: 45000_00,
        baselineGamingDay: '2026-04-14',
        baselineSampleCount: 14,
        message: 'Drop total is 3.0 MADs above baseline',
        sessionCount: 5,
        peakDeviation: 3.0,
        recommendedAction: 'monitor',
      },
    ],
    baselineGamingDay: '2026-04-14',
    baselineCoverage: { withBaseline: 10, withoutBaseline: 2 },
  };
}

function makeAlertQuality() {
  return {
    totalAlerts: 5,
    acknowledgedCount: 3,
    falsePositiveCount: 1,
    medianAcknowledgeLatencyMs: 120000,
    period: { start: '2026-04-15T06:00:00Z', end: '2026-04-15T14:00:00Z' },
  };
}

function makeMtlSummary() {
  return [
    {
      casino_id: TEST_PARAMS.casinoId,
      patron_uuid: 'patron-1',
      patron_first_name: 'John',
      patron_last_name: 'Doe',
      patron_date_of_birth: '1985-03-15',
      gaming_day: TEST_PARAMS.gamingDay,
      total_in: 8000_00,
      count_in: 3,
      max_single_in: 5000_00,
      first_in_at: '2026-04-15T07:00:00Z',
      last_in_at: '2026-04-15T12:00:00Z',
      agg_badge_in: 'agg_watchlist' as const,
      total_out: 6000_00,
      count_out: 2,
      max_single_out: 4000_00,
      first_out_at: '2026-04-15T09:00:00Z',
      last_out_at: '2026-04-15T13:00:00Z',
      agg_badge_out: 'none' as const,
      total_volume: 14000_00,
      entry_count: 5,
    },
  ];
}

function makeVisitorsSummary() {
  return {
    rated_count: 15,
    unrated_count: 8,
    total_count: 23,
    rated_percentage: 65.2,
  };
}

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetShiftDashboardSummary = jest.fn();
const mockGetShiftCashObsTable = jest.fn();
const mockGetAnomalyAlerts = jest.fn();
const mockGetAlertQuality = jest.fn();
const mockGetGamingDaySummary = jest.fn();
const mockGetMeasurementSummary = jest.fn();

jest.mock('@/services/table-context/shift-metrics/service', () => ({
  getShiftDashboardSummary: (...args: unknown[]) =>
    mockGetShiftDashboardSummary(...args),
}));

jest.mock('@/services/table-context/shift-cash-obs', () => ({
  getShiftCashObsTable: (...args: unknown[]) =>
    mockGetShiftCashObsTable(...args),
}));

jest.mock('@/services/shift-intelligence', () => ({
  createShiftIntelligenceService: () => ({
    getAnomalyAlerts: (...args: unknown[]) => mockGetAnomalyAlerts(...args),
    getAlertQuality: (...args: unknown[]) => mockGetAlertQuality(...args),
  }),
}));

jest.mock('@/services/mtl', () => ({
  createMtlService: () => ({
    getGamingDaySummary: (...args: unknown[]) =>
      mockGetGamingDaySummary(...args),
  }),
}));

jest.mock('@/services/measurement', () => ({
  createMeasurementService: () => ({
    getSummary: (...args: unknown[]) => mockGetMeasurementSummary(...args),
  }),
}));

// Import after mocks
import { assembleShiftReport } from '../assembler';

// ── Supabase double ─────────────────────────────────────────────────────────

function makeSupabaseDouble(rpcOverride?: {
  data: unknown;
  error: unknown;
}): SupabaseClient<Database> {
  return {
    rpc: jest.fn().mockResolvedValue(
      rpcOverride ?? {
        data: [makeVisitorsSummary()],
        error: null,
      },
    ),
  } as unknown as SupabaseClient<Database>;
}

// ── Helper: configure all mocks for happy path ──────────────────────────────

function configureHappyPath() {
  mockGetShiftDashboardSummary.mockResolvedValue(makeDashboardSummary());
  mockGetShiftCashObsTable.mockResolvedValue(makeCashObs());
  mockGetAnomalyAlerts.mockResolvedValue(makeAnomalyAlerts());
  mockGetAlertQuality.mockResolvedValue(makeAlertQuality());
  mockGetGamingDaySummary.mockResolvedValue({
    items: makeMtlSummary(),
    next_cursor: null,
  });
  mockGetMeasurementSummary.mockResolvedValue(makeMeasurementSummary());
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('assembleShiftReport', () => {
  it('assembles all 8 sections from happy-path data', async () => {
    const supabase = makeSupabaseDouble();
    configureHappyPath();

    const report = await assembleShiftReport(supabase, TEST_PARAMS);

    // Executive summary always present
    expect(report.executiveSummary.casinoName).toBe('Test Casino');
    expect(report.executiveSummary.gamingDay).toBe('2026-04-15');
    expect(report.executiveSummary.tablesCount).toBe(2);

    // Financial summary
    expect(report.financialSummary).not.toBeNull();
    expect(report.financialSummary!.tables).toHaveLength(2);
    expect(report.financialSummary!.casinoTotals.fillsTotalCents).toBe(
      18000_00,
    );

    // Rating coverage
    expect(report.ratingCoverage).not.toBeNull();
    expect(report.ratingCoverage!.ratingCoverage?.avgCoverageRatio).toBe(0.85);
    expect(report.ratingCoverage!.theoDiscrepancy?.discrepantSlips).toBe(3);
    expect(report.ratingCoverage!.activeVisitors?.totalCount).toBe(23);

    // Compliance summary
    expect(report.complianceSummary).not.toBeNull();
    expect(report.complianceSummary!.patronSummaries).toHaveLength(1);
    expect(report.complianceSummary!.totals.patronCount).toBe(1);

    // Anomalies
    expect(report.anomalies).not.toBeNull();
    expect(report.anomalies!.alerts).toHaveLength(1);
    expect(report.anomalies!.alertQuality?.totalAlerts).toBe(5);

    // Baseline quality
    expect(report.baselineQuality).not.toBeNull();
    expect(report.baselineQuality!.snapshotCoverageRatio).toBe(1);
    expect(report.baselineQuality!.telemetryDistribution.goodCoverage).toBe(2);

    // Loyalty liability
    expect(report.loyaltyLiability).not.toBeNull();
    expect(
      report.loyaltyLiability!.loyaltyLiability?.totalOutstandingPoints,
    ).toBe(150000);

    // Footer
    expect(report.footer.referenceId).toBe('SR-2026-04-15-day');
    expect(report.footer.casinoName).toBe('Test Casino');

    // All sections available
    expect(report.availability.executiveSummary).toBe(true);
    expect(report.availability.financialSummary).toBe(true);
    expect(report.availability.ratingCoverage).toBe(true);
    expect(report.availability.complianceSummary).toBe(true);
    expect(report.availability.anomalies).toBe(true);
    expect(report.availability.baselineQuality).toBe(true);
    expect(report.availability.loyaltyLiability).toBe(true);

    // No errors
    expect(report.errors).toHaveLength(0);
  });

  it('produces partial degradation when a source fails', async () => {
    const supabase = makeSupabaseDouble();

    mockGetShiftDashboardSummary.mockResolvedValue(makeDashboardSummary());
    mockGetShiftCashObsTable.mockResolvedValue(makeCashObs());
    mockGetAnomalyAlerts.mockRejectedValue(new Error('Anomaly RPC timeout'));
    mockGetAlertQuality.mockRejectedValue(new Error('Alert quality failed'));
    mockGetGamingDaySummary.mockRejectedValue(
      new Error('MTL service unavailable'),
    );
    mockGetMeasurementSummary.mockResolvedValue(makeMeasurementSummary());

    const report = await assembleShiftReport(supabase, TEST_PARAMS);

    // Executive summary still present (from dashboard)
    expect(report.executiveSummary.tablesCount).toBe(2);

    // Financial summary still present
    expect(report.financialSummary).not.toBeNull();

    // Compliance summary null (MTL failed)
    expect(report.complianceSummary).toBeNull();
    expect(report.availability.complianceSummary).toBe(false);

    // Anomalies null (both sources failed)
    expect(report.anomalies).toBeNull();
    expect(report.availability.anomalies).toBe(false);

    // Rating coverage still present (measurement succeeded)
    expect(report.ratingCoverage).not.toBeNull();

    // Errors recorded
    expect(report.errors.length).toBeGreaterThanOrEqual(2);
    const errorSources = report.errors.map((e) => e.source);
    expect(errorSources).toContain('anomalyAlerts');
    expect(errorSources).toContain('mtlGamingDaySummary');
  });

  it('handles empty data gracefully', async () => {
    const supabase = makeSupabaseDouble({
      data: [
        {
          rated_count: 0,
          unrated_count: 0,
          total_count: 0,
          rated_percentage: 0,
        },
      ],
      error: null,
    });

    const emptyDashboard = {
      tables: [],
      pits: [],
      casino: {
        window_start: TEST_PARAMS.startTs,
        window_end: TEST_PARAMS.endTs,
        tables_count: 0,
        pits_count: 0,
        tables_with_opening_snapshot: 0,
        tables_with_closing_snapshot: 0,
        tables_with_telemetry_count: 0,
        tables_good_coverage_count: 0,
        tables_grade_estimate: 0,
        fills_total_cents: 0,
        credits_total_cents: 0,
        estimated_drop_rated_total_cents: 0,
        estimated_drop_grind_total_cents: 0,
        estimated_drop_buyins_total_cents: 0,
        win_loss_inventory_total_cents: null,
        win_loss_estimated_total_cents: null,
        tables_missing_baseline_count: 0,
        snapshot_coverage_ratio: 0,
        coverage_tier: 'NONE',
        provenance: {
          source: 'telemetry' as const,
          grade: 'ESTIMATE' as const,
          quality: 'NONE' as const,
          coverage_ratio: 0,
          null_reasons: [],
        },
      },
    };

    mockGetShiftDashboardSummary.mockResolvedValue(emptyDashboard);
    mockGetShiftCashObsTable.mockResolvedValue([]);
    mockGetAnomalyAlerts.mockResolvedValue({
      alerts: [],
      baselineGamingDay: TEST_PARAMS.gamingDay,
      baselineCoverage: { withBaseline: 0, withoutBaseline: 0 },
    });
    mockGetAlertQuality.mockResolvedValue({
      totalAlerts: 0,
      acknowledgedCount: 0,
      falsePositiveCount: 0,
      medianAcknowledgeLatencyMs: null,
      period: { start: TEST_PARAMS.startTs, end: TEST_PARAMS.endTs },
    });
    mockGetGamingDaySummary.mockResolvedValue({
      items: [],
      next_cursor: null,
    });
    mockGetMeasurementSummary.mockResolvedValue({
      theoDiscrepancy: null,
      auditCorrelation: null,
      ratingCoverage: null,
      loyaltyLiability: null,
      errors: {},
      filters: {},
    });

    const report = await assembleShiftReport(supabase, TEST_PARAMS);

    // Executive summary has zero counts
    expect(report.executiveSummary.tablesCount).toBe(0);
    expect(report.executiveSummary.fillsTotalCents).toBe(0);

    // Financial summary has empty tables but present
    expect(report.financialSummary).not.toBeNull();
    expect(report.financialSummary!.tables).toHaveLength(0);
    expect(report.financialSummary!.casinoTotals.dropTotalCents).toBe(0);

    // Compliance summary has empty patrons
    expect(report.complianceSummary).not.toBeNull();
    expect(report.complianceSummary!.patronSummaries).toHaveLength(0);
    expect(report.complianceSummary!.totals.patronCount).toBe(0);

    // Anomalies present but empty
    expect(report.anomalies).not.toBeNull();
    expect(report.anomalies!.alerts).toHaveLength(0);

    // No errors
    expect(report.errors).toHaveLength(0);
  });

  it('financial totals reconcile (casino = sum of tables)', async () => {
    const supabase = makeSupabaseDouble();
    configureHappyPath();

    const report = await assembleShiftReport(supabase, TEST_PARAMS);

    const financial = report.financialSummary!;
    const tableDropSum = financial.tables.reduce(
      (sum, t) => sum + t.dropTotalCents,
      0,
    );
    const tableFillsSum = financial.tables.reduce(
      (sum, t) => sum + t.fillsTotalCents,
      0,
    );
    const tableCreditsSum = financial.tables.reduce(
      (sum, t) => sum + t.creditsTotalCents,
      0,
    );

    // Per-table sums match the individual rows
    // table1: 30000+5000+2000=37000 * 100, table2: 25000+4000+1000=30000 * 100
    expect(tableDropSum).toBe(37000_00 + 30000_00);
    expect(tableFillsSum).toBe(10000_00 + 8000_00);
    expect(tableCreditsSum).toBe(5000_00 + 3000_00);
  });

  it('inlines cash obs in financial table rows (DEC-001)', async () => {
    const supabase = makeSupabaseDouble();
    configureHappyPath();

    const report = await assembleShiftReport(supabase, TEST_PARAMS);
    const tables = report.financialSummary!.tables;

    // table-1 has cash obs
    const table1 = tables.find((t) => t.tableId === 'table-1');
    expect(table1?.cashObsEstimateCents).toBe(2500_00);
    expect(table1?.cashObsCount).toBe(5);

    // table-2 has no cash obs
    const table2 = tables.find((t) => t.tableId === 'table-2');
    expect(table2?.cashObsEstimateCents).toBe(0);
    expect(table2?.cashObsCount).toBe(0);
  });

  it('computes hold % correctly', async () => {
    const supabase = makeSupabaseDouble();
    configureHappyPath();

    const report = await assembleShiftReport(supabase, TEST_PARAMS);
    const tables = report.financialSummary!.tables;

    const table1 = tables.find((t) => t.tableId === 'table-1')!;
    // win_loss_inventory_cents = 7000_00, drop = 37000_00
    // hold% = 7000_00 / 37000_00 * 100 ≈ 18.92
    expect(table1.holdPercent).toBeCloseTo(18.92, 1);
  });

  it('returns null hold % when win_loss is null', async () => {
    const supabase = makeSupabaseDouble();

    const dashboard = makeDashboardSummary();
    // Override to null via spread to avoid type assignment error
    dashboard.tables[0] = {
      ...dashboard.tables[0],
      win_loss_inventory_cents: null,
    };
    mockGetShiftDashboardSummary.mockResolvedValue(dashboard);
    mockGetShiftCashObsTable.mockResolvedValue(makeCashObs());
    mockGetAnomalyAlerts.mockResolvedValue(makeAnomalyAlerts());
    mockGetAlertQuality.mockResolvedValue(makeAlertQuality());
    mockGetGamingDaySummary.mockResolvedValue({
      items: makeMtlSummary(),
      next_cursor: null,
    });
    mockGetMeasurementSummary.mockResolvedValue(makeMeasurementSummary());

    const report = await assembleShiftReport(supabase, TEST_PARAMS);
    const table1 = report.financialSummary!.tables.find(
      (t) => t.tableId === 'table-1',
    )!;
    expect(table1.holdPercent).toBeNull();
  });

  it('all sources fail → nullable sections null, executive summary still present', async () => {
    const supabase = makeSupabaseDouble({
      data: null,
      error: { message: 'RPC failed' },
    });

    mockGetShiftDashboardSummary.mockRejectedValue(
      new Error('Dashboard failed'),
    );
    mockGetShiftCashObsTable.mockRejectedValue(new Error('CashObs failed'));
    mockGetAnomalyAlerts.mockRejectedValue(new Error('Anomaly failed'));
    mockGetAlertQuality.mockRejectedValue(new Error('AlertQ failed'));
    mockGetGamingDaySummary.mockRejectedValue(new Error('MTL failed'));
    mockGetMeasurementSummary.mockRejectedValue(
      new Error('Measurement failed'),
    );

    const report = await assembleShiftReport(supabase, TEST_PARAMS);

    // Executive summary always present (uses params defaults)
    expect(report.executiveSummary.casinoName).toBe('Test Casino');
    expect(report.executiveSummary.tablesCount).toBe(0);

    // All data-dependent sections null
    expect(report.financialSummary).toBeNull();
    expect(report.ratingCoverage).toBeNull();
    expect(report.complianceSummary).toBeNull();
    expect(report.anomalies).toBeNull();
    expect(report.baselineQuality).toBeNull();
    expect(report.loyaltyLiability).toBeNull();

    // Footer always present
    expect(report.footer.referenceId).toBe('SR-2026-04-15-day');

    // Errors recorded for each failed source
    expect(report.errors.length).toBeGreaterThanOrEqual(5);
  });
});

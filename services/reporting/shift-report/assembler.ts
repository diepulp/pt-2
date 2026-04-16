/**
 * ShiftReport Assembly Service
 *
 * Cross-context composition: fetches data from 6 consumed contexts
 * (7 source calls) in parallel via Promise.allSettled(), assembles
 * a composite ShiftReportDTO. Partial degradation on single-source
 * failure — affected sections are null, not crash.
 *
 * This is presentational assembly only. No owned tables, no domain
 * invariants, no SRM authority changes. All business computation
 * (totals, coverage %, executive summary) occurs here. Downstream
 * consumers (page, PDF, CSV) are strictly presentational.
 *
 * @see EXEC-065 WS1
 * @see MeasurementService (services/measurement/index.ts) — parallel pattern
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';

// ── Consumed service imports ────────────────────────────────────────────────

// Source 1: table-context — shift dashboard BFF (standalone function)

// Source 2: table-context — cash observation table rollups (standalone function)

// Source 3+4: shift-intelligence — anomaly alerts + alert quality (factory)
import { createMeasurementService } from '@/services/measurement';
import type { MeasurementSummaryResponse } from '@/services/measurement/dtos';
import { createMtlService } from '@/services/mtl';
import type { MtlGamingDaySummaryDTO } from '@/services/mtl/dtos';
import { createShiftIntelligenceService } from '@/services/shift-intelligence';
import type {
  AnomalyAlertsResponseDTO,
  AlertQualityDTO,
} from '@/services/shift-intelligence/dtos';

// Source 5: mtl — gaming day summary (factory)

// Source 6: measurement — cross-cutting metrics (factory)
import type { CashObsTableRollupDTO } from '@/services/table-context/dtos';

// Source 7: rpc_shift_active_visitors_summary (direct RPC, no service wrapper)
import type { ActiveVisitorsSummaryDTO } from '@/services/table-context/dtos';
import { getShiftCashObsTable } from '@/services/table-context/shift-cash-obs';
import type {
  ShiftDashboardSummaryDTO,
  ShiftTableMetricsDTO,
} from '@/services/table-context/shift-metrics/dtos';
import { getShiftDashboardSummary } from '@/services/table-context/shift-metrics/service';
import type { Database } from '@/types/database.types';

import type {
  ShiftReportParams,
  ShiftReportDTO,
  ShiftReportError,
  FinancialTableRow,
  FinancialSummarySection,
  ExecutiveSummarySection,
  RatingCoverageSection,
  ComplianceSummarySection,
  CompliancePatronRow,
  AnomaliesSection,
  BaselineQualitySection,
  LoyaltyLiabilitySection,
  ReportFooterSection,
  SectionAvailability,
} from './dtos';

// ── Source call result types ────────────────────────────────────────────────

interface SourceResults {
  dashboard: ShiftDashboardSummaryDTO | null;
  cashObs: CashObsTableRollupDTO[] | null;
  anomalyAlerts: AnomalyAlertsResponseDTO | null;
  alertQuality: AlertQualityDTO | null;
  mtlSummary: MtlGamingDaySummaryDTO[] | null;
  measurement: MeasurementSummaryResponse | null;
  visitors: ActiveVisitorsSummaryDTO | null;
}

// ── Assembly function ───────────────────────────────────────────────────────

/**
 * Assemble a shift report from 6 consumed contexts (7 source calls).
 *
 * Uses Promise.allSettled() for resilient parallel fetch. Single-source
 * failures produce partial degradation (null sections), not crash.
 *
 * @throws DomainError only for infrastructure failures (e.g., no supabase client)
 */
export async function assembleShiftReport(
  supabase: SupabaseClient<Database>,
  params: ShiftReportParams,
): Promise<ShiftReportDTO> {
  const { sources, errors } = await fetchAllSources(supabase, params);
  return buildReport(params, sources, errors);
}

// ── Source fetching ─────────────────────────────────────────────────────────

async function fetchAllSources(
  supabase: SupabaseClient<Database>,
  params: ShiftReportParams,
): Promise<{ sources: SourceResults; errors: ShiftReportError[] }> {
  const shiftIntelligence = createShiftIntelligenceService(supabase);
  const mtl = createMtlService(supabase);
  const measurement = createMeasurementService(supabase);

  const [
    dashboardResult,
    cashObsResult,
    anomalyResult,
    alertQualityResult,
    mtlResult,
    measurementResult,
    visitorsResult,
  ] = await Promise.allSettled([
    // Source 1: Shift dashboard BFF
    getShiftDashboardSummary(supabase, {
      casinoId: params.casinoId,
      startTs: params.startTs,
      endTs: params.endTs,
    }),

    // Source 2: Cash observation table rollups
    getShiftCashObsTable(supabase, {
      casinoId: params.casinoId,
      startTs: params.startTs,
      endTs: params.endTs,
    }),

    // Source 3: Anomaly alerts
    shiftIntelligence.getAnomalyAlerts({
      window_start: params.startTs,
      window_end: params.endTs,
    }),

    // Source 4: Alert quality
    shiftIntelligence.getAlertQuality(params.startTs, params.endTs),

    // Source 5: MTL gaming day summary
    mtl.getGamingDaySummary({
      casino_id: params.casinoId,
      gaming_day: params.gamingDay,
    }),

    // Source 6: Measurement summary (coverage, theo, audit, loyalty)
    measurement.getSummary(params.casinoId),

    // Source 7: Active visitors summary (direct RPC)
    fetchActiveVisitors(supabase),
  ]);

  const errors: ShiftReportError[] = [];
  const sources: SourceResults = {
    dashboard: extractResult(
      dashboardResult,
      'shiftDashboardSummary',
      ['executiveSummary', 'financialSummary', 'baselineQuality'],
      errors,
    ),
    cashObs: extractResult(
      cashObsResult,
      'shiftCashObsTable',
      ['financialSummary'],
      errors,
    ),
    anomalyAlerts: extractResult(
      anomalyResult,
      'anomalyAlerts',
      ['anomalies'],
      errors,
    ),
    alertQuality: extractResult(
      alertQualityResult,
      'alertQuality',
      ['anomalies'],
      errors,
    ),
    mtlSummary: extractMtlResult(mtlResult, errors),
    measurement: extractResult(
      measurementResult,
      'measurementSummary',
      ['ratingCoverage', 'baselineQuality', 'loyaltyLiability'],
      errors,
    ),
    visitors: extractResult(
      visitorsResult,
      'activeVisitors',
      ['ratingCoverage'],
      errors,
    ),
  };

  return { sources, errors };
}

async function fetchActiveVisitors(
  supabase: SupabaseClient<Database>,
): Promise<ActiveVisitorsSummaryDTO> {
  const { data, error } = await supabase.rpc(
    'rpc_shift_active_visitors_summary',
  );

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Failed to fetch active visitors summary',
      { details: safeErrorDetails(error) },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      rated_count: 0,
      unrated_count: 0,
      total_count: 0,
      rated_percentage: 0,
    };
  }

  return {
    rated_count: Number(row.rated_count) || 0,
    unrated_count: Number(row.unrated_count) || 0,
    total_count: Number(row.total_count) || 0,
    rated_percentage: Number(row.rated_percentage) || 0,
  };
}

// ── Result extraction helpers ───────────────────────────────────────────────

function extractResult<T>(
  result: PromiseSettledResult<T>,
  source: string,
  affectedSections: string[],
  errors: ShiftReportError[],
): T | null {
  if (result.status === 'fulfilled') {
    return result.value;
  }
  errors.push({
    source,
    message:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
    affectedSections,
  });
  return null;
}

function extractMtlResult(
  result: PromiseSettledResult<{
    items: MtlGamingDaySummaryDTO[];
    next_cursor: string | null;
  }>,
  errors: ShiftReportError[],
): MtlGamingDaySummaryDTO[] | null {
  if (result.status === 'fulfilled') {
    return result.value.items;
  }
  errors.push({
    source: 'mtlGamingDaySummary',
    message:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
    affectedSections: ['complianceSummary'],
  });
  return null;
}

// ── Report assembly ─────────────────────────────────────────────────────────

function buildReport(
  params: ShiftReportParams,
  sources: SourceResults,
  errors: ShiftReportError[],
): ShiftReportDTO {
  const financialSummary = buildFinancialSummary(
    sources.dashboard,
    sources.cashObs,
  );
  const ratingCoverage = buildRatingCoverage(
    sources.measurement,
    sources.visitors,
  );
  const complianceSummary = buildComplianceSummary(
    params.gamingDay,
    sources.mtlSummary,
  );
  const anomalies = buildAnomalies(sources.anomalyAlerts, sources.alertQuality);
  const baselineQuality = buildBaselineQuality(
    sources.dashboard,
    sources.measurement,
  );
  const loyaltyLiability = buildLoyaltyLiability(sources.measurement);

  const availability: SectionAvailability = {
    executiveSummary: sources.dashboard != null,
    financialSummary: financialSummary != null,
    ratingCoverage: ratingCoverage != null,
    complianceSummary: complianceSummary != null,
    anomalies: anomalies != null,
    baselineQuality: baselineQuality != null,
    loyaltyLiability: loyaltyLiability != null,
  };

  return {
    executiveSummary: buildExecutiveSummary(params, sources.dashboard),
    financialSummary,
    ratingCoverage,
    complianceSummary,
    anomalies,
    baselineQuality,
    loyaltyLiability,
    footer: buildFooter(params),
    availability,
    errors,
  };
}

// ── Section builders ────────────────────────────────────────────────────────

function buildExecutiveSummary(
  params: ShiftReportParams,
  dashboard: ShiftDashboardSummaryDTO | null,
): ExecutiveSummarySection {
  const casino = dashboard?.casino;
  return {
    casinoName: params.casinoName,
    gamingDay: params.gamingDay,
    shiftBoundary: params.shiftBoundary,
    windowStart: params.startTs,
    windowEnd: params.endTs,
    tablesCount: casino?.tables_count ?? 0,
    pitsCount: casino?.pits_count ?? 0,
    fillsTotalCents: casino?.fills_total_cents ?? 0,
    creditsTotalCents: casino?.credits_total_cents ?? 0,
    winLossInventoryTotalCents: casino?.win_loss_inventory_total_cents ?? null,
    winLossEstimatedTotalCents: casino?.win_loss_estimated_total_cents ?? null,
    snapshotCoverageRatio: casino?.snapshot_coverage_ratio ?? 0,
    coverageTier: casino?.coverage_tier ?? 'NONE',
  };
}

function buildFinancialSummary(
  dashboard: ShiftDashboardSummaryDTO | null,
  cashObs: CashObsTableRollupDTO[] | null,
): FinancialSummarySection | null {
  if (!dashboard) return null;

  // Build a lookup map for cash obs by table_id (DEC-001: inline)
  const cashObsMap = new Map<string, CashObsTableRollupDTO>();
  if (cashObs) {
    for (const obs of cashObs) {
      cashObsMap.set(obs.table_id, obs);
    }
  }

  const tables: FinancialTableRow[] = dashboard.tables.map((table) => {
    const obs = cashObsMap.get(table.table_id);
    const dropTotal =
      table.estimated_drop_rated_cents +
      table.estimated_drop_grind_cents +
      table.estimated_drop_buyins_cents;

    return {
      tableId: table.table_id,
      tableLabel: table.table_label,
      pitId: table.pit_id,
      gameType: null, // gaming_table.type not available on ShiftTableMetricsDTO
      dropTotalCents: dropTotal,
      fillsTotalCents: table.fills_total_cents,
      creditsTotalCents: table.credits_total_cents,
      winLossInventoryCents: table.win_loss_inventory_cents,
      winLossEstimatedCents: table.win_loss_estimated_cents,
      holdPercent: computeHoldPercent(
        table.win_loss_inventory_cents,
        dropTotal,
      ),
      cashObsEstimateCents: obs?.cash_out_observed_estimate_total ?? 0,
      cashObsCount: obs?.cash_out_observation_count ?? 0,
    };
  });

  const casinoTotals = computeCasinoTotals(tables, dashboard);

  return { tables, casinoTotals };
}

function computeCasinoTotals(
  tables: FinancialTableRow[],
  dashboard: ShiftDashboardSummaryDTO,
) {
  const casino = dashboard.casino;
  const dropTotal =
    casino.estimated_drop_rated_total_cents +
    casino.estimated_drop_grind_total_cents +
    casino.estimated_drop_buyins_total_cents;

  return {
    dropTotalCents: dropTotal,
    fillsTotalCents: casino.fills_total_cents,
    creditsTotalCents: casino.credits_total_cents,
    winLossInventoryTotalCents: casino.win_loss_inventory_total_cents,
    winLossEstimatedTotalCents: casino.win_loss_estimated_total_cents,
    holdPercent: computeHoldPercent(
      casino.win_loss_inventory_total_cents,
      dropTotal,
    ),
    cashObsEstimateTotalCents: tables.reduce(
      (sum, t) => sum + t.cashObsEstimateCents,
      0,
    ),
    cashObsTotalCount: tables.reduce((sum, t) => sum + t.cashObsCount, 0),
  };
}

function buildRatingCoverage(
  measurement: MeasurementSummaryResponse | null,
  visitors: ActiveVisitorsSummaryDTO | null,
): RatingCoverageSection | null {
  if (!measurement && !visitors) return null;

  return {
    ratingCoverage: measurement?.ratingCoverage ?? null,
    theoDiscrepancy: measurement?.theoDiscrepancy ?? null,
    activeVisitors: visitors
      ? {
          ratedCount: visitors.rated_count,
          unratedCount: visitors.unrated_count,
          totalCount: visitors.total_count,
          ratedPercentage: visitors.rated_percentage,
        }
      : null,
  };
}

function buildComplianceSummary(
  gamingDay: string,
  mtlSummaries: MtlGamingDaySummaryDTO[] | null,
): ComplianceSummarySection | null {
  if (!mtlSummaries) return null;

  const patronSummaries: CompliancePatronRow[] = mtlSummaries.map((s) => ({
    patronUuid: s.patron_uuid,
    patronFirstName: s.patron_first_name,
    patronLastName: s.patron_last_name,
    gamingDay: s.gaming_day,
    totalInCents: s.total_in,
    countIn: s.count_in,
    totalOutCents: s.total_out,
    countOut: s.count_out,
    totalVolumeCents: s.total_volume,
    aggBadgeIn: s.agg_badge_in,
    aggBadgeOut: s.agg_badge_out,
  }));

  const ctrNearCount = mtlSummaries.filter(
    (s) =>
      s.agg_badge_in === 'agg_ctr_near' || s.agg_badge_out === 'agg_ctr_near',
  ).length;
  const ctrMetCount = mtlSummaries.filter(
    (s) =>
      s.agg_badge_in === 'agg_ctr_met' || s.agg_badge_out === 'agg_ctr_met',
  ).length;

  return {
    gamingDay,
    patronSummaries,
    totals: {
      patronCount: patronSummaries.length,
      totalInCents: mtlSummaries.reduce((sum, s) => sum + s.total_in, 0),
      totalOutCents: mtlSummaries.reduce((sum, s) => sum + s.total_out, 0),
      totalVolumeCents: mtlSummaries.reduce(
        (sum, s) => sum + s.total_volume,
        0,
      ),
      ctrNearCount,
      ctrMetCount,
    },
  };
}

function buildAnomalies(
  anomalyAlerts: AnomalyAlertsResponseDTO | null,
  alertQuality: AlertQualityDTO | null,
): AnomaliesSection | null {
  if (!anomalyAlerts && !alertQuality) return null;

  return {
    alerts: anomalyAlerts?.alerts ?? [],
    baselineGamingDay: anomalyAlerts?.baselineGamingDay ?? null,
    baselineCoverage: anomalyAlerts?.baselineCoverage ?? null,
    alertQuality,
  };
}

function buildBaselineQuality(
  dashboard: ShiftDashboardSummaryDTO | null,
  measurement: MeasurementSummaryResponse | null,
): BaselineQualitySection | null {
  if (!dashboard) return null;

  const tables = dashboard.tables;
  const casino = dashboard.casino;

  const telemetryDistribution = countTelemetryDistribution(tables);

  return {
    snapshotCoverageRatio: casino.snapshot_coverage_ratio,
    coverageTier: casino.coverage_tier,
    tablesMissingBaselineCount: casino.tables_missing_baseline_count,
    tablesCount: casino.tables_count,
    telemetryDistribution,
    auditCorrelation: measurement?.auditCorrelation ?? null,
  };
}

function buildLoyaltyLiability(
  measurement: MeasurementSummaryResponse | null,
): LoyaltyLiabilitySection | null {
  if (!measurement?.loyaltyLiability) return null;

  return {
    loyaltyLiability: measurement.loyaltyLiability,
  };
}

function buildFooter(params: ShiftReportParams): ReportFooterSection {
  return {
    generatedAt: new Date().toISOString(),
    referenceId: `SR-${params.gamingDay}-${params.shiftBoundary}`,
    gamingDay: params.gamingDay,
    shiftBoundary: params.shiftBoundary,
    casinoName: params.casinoName,
    windowStart: params.startTs,
    windowEnd: params.endTs,
  };
}

// ── Computation helpers ─────────────────────────────────────────────────────

/**
 * Hold % = win_loss / drop × 100 (if both are available).
 * Returns null if either value is null or drop is zero.
 */
function computeHoldPercent(
  winLossCents: number | null,
  dropTotalCents: number,
): number | null {
  if (winLossCents == null || dropTotalCents === 0) return null;
  return (winLossCents / dropTotalCents) * 100;
}

function countTelemetryDistribution(tables: ShiftTableMetricsDTO[]): {
  goodCoverage: number;
  lowCoverage: number;
  none: number;
} {
  let goodCoverage = 0;
  let lowCoverage = 0;
  let none = 0;

  for (const table of tables) {
    switch (table.telemetry_quality) {
      case 'GOOD_COVERAGE':
        goodCoverage++;
        break;
      case 'LOW_COVERAGE':
        lowCoverage++;
        break;
      default:
        none++;
        break;
    }
  }

  return { goodCoverage, lowCoverage, none };
}

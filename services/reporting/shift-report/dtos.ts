/**
 * ShiftReportService DTOs
 *
 * Pattern A (Contract-First): Manual interfaces for cross-context
 * composite aggregate. This is a COMPOSITION surface — no owned tables,
 * no domain invariants, no SRM authority changes.
 *
 * The ShiftReportDTO aggregates data from 6 consumed contexts
 * (7 source calls) into a read-only document structure.
 *
 * @see EXEC-065 Shift Report
 * @see FIB-H-SHIFT-REPORT §E1 Shift Report Standard Template v1
 */

import type {
  TheoDiscrepancyDto,
  AuditCorrelationDto,
  RatingCoverageDto,
  LoyaltyLiabilityDto,
} from '@/services/measurement/dtos';
import type { AggBadge } from '@/services/mtl/dtos';
import type {
  AnomalyAlertDTO,
  AlertQualityDTO,
  BaselineCoverageDTO,
} from '@/services/shift-intelligence/dtos';

// ── Assembly Input ──────────────────────────────────────────────────────────

export interface ShiftReportParams {
  /** Casino UUID (for scoping; RLS derives authoritative casino from JWT) */
  casinoId: string;
  /** Casino display name for report header/footer */
  casinoName: string;
  /** ISO timestamp for shift window start */
  startTs: string;
  /** ISO timestamp for shift window end */
  endTs: string;
  /** Gaming day date string (YYYY-MM-DD) */
  gamingDay: string;
  /** Shift boundary identifier */
  shiftBoundary: 'swing' | 'day' | 'grave';
}

// ── Section DTOs ────────────────────────────────────────────────────────────

export interface ExecutiveSummarySection {
  casinoName: string;
  gamingDay: string;
  shiftBoundary: 'swing' | 'day' | 'grave';
  windowStart: string;
  windowEnd: string;
  tablesCount: number;
  pitsCount: number;
  fillsTotalCents: number;
  creditsTotalCents: number;
  winLossInventoryTotalCents: number | null;
  winLossEstimatedTotalCents: number | null;
  snapshotCoverageRatio: number;
  coverageTier: string;
}

/** Per-table financial row with inlined cash observations (DEC-001) */

export interface FinancialTableRow {
  tableId: string;
  tableLabel: string;
  pitId: string | null;
  gameType: string | null;
  /** Estimated total drop (rated + grind + buyins) in cents */
  dropTotalCents: number;
  fillsTotalCents: number;
  creditsTotalCents: number;
  winLossInventoryCents: number | null;
  winLossEstimatedCents: number | null;
  holdPercent: number | null;
  /** Inline cash obs: total observed estimate (DEC-001) */
  cashObsEstimateCents: number;
  /** Inline cash obs: observation count */
  cashObsCount: number;
}

export interface FinancialSummarySection {
  tables: FinancialTableRow[];
  casinoTotals: {
    dropTotalCents: number;
    fillsTotalCents: number;
    creditsTotalCents: number;
    winLossInventoryTotalCents: number | null;
    winLossEstimatedTotalCents: number | null;
    holdPercent: number | null;
    cashObsEstimateTotalCents: number;
    cashObsTotalCount: number;
  };
}

export interface RatingCoverageSection {
  /** From MeasurementService — rating coverage metrics */
  ratingCoverage: RatingCoverageDto | null;
  /** From MeasurementService — theo discrepancy badge (DEC-002) */
  theoDiscrepancy: TheoDiscrepancyDto | null;
  /** Active visitors from rpc_shift_active_visitors_summary */
  activeVisitors: {
    ratedCount: number;
    unratedCount: number;
    totalCount: number;
    ratedPercentage: number;
  } | null;
}

export interface ComplianceSummarySection {
  gamingDay: string;
  /** Patron-level gaming day summary from MTL service */
  patronSummaries: CompliancePatronRow[];
  /** Totals across all patrons */
  totals: {
    patronCount: number;
    totalInCents: number;
    totalOutCents: number;
    totalVolumeCents: number;
    ctrNearCount: number;
    ctrMetCount: number;
  };
}

export interface CompliancePatronRow {
  patronUuid: string;
  patronFirstName: string | null;
  patronLastName: string | null;
  gamingDay: string;
  totalInCents: number;
  countIn: number;
  totalOutCents: number;
  countOut: number;
  totalVolumeCents: number;
  aggBadgeIn: AggBadge;
  aggBadgeOut: AggBadge;
}

export interface AnomaliesSection {
  /** Anomaly alerts for this shift window */
  alerts: AnomalyAlertDTO[];
  baselineGamingDay: string | null;
  baselineCoverage: BaselineCoverageDTO | null;
  /** Alert quality telemetry */
  alertQuality: AlertQualityDTO | null;
}

export interface BaselineQualitySection {
  snapshotCoverageRatio: number;
  coverageTier: string;
  tablesMissingBaselineCount: number;
  tablesCount: number;
  /** Distribution of telemetry quality across tables */
  telemetryDistribution: {
    goodCoverage: number;
    lowCoverage: number;
    none: number;
  };
  /** From MeasurementService — audit event correlation */
  auditCorrelation: AuditCorrelationDto | null;
}

export interface LoyaltyLiabilitySection {
  loyaltyLiability: LoyaltyLiabilityDto | null;
}

export interface ReportFooterSection {
  generatedAt: string;
  referenceId: string;
  gamingDay: string;
  shiftBoundary: 'swing' | 'day' | 'grave';
  casinoName: string;
  windowStart: string;
  windowEnd: string;
}

// ── Composite DTO ───────────────────────────────────────────────────────────

/**
 * Shift report section availability — tracks which sections resolved
 * vs failed during assembly. Enables partial degradation rendering.
 */

export interface SectionAvailability {
  executiveSummary: boolean;
  financialSummary: boolean;
  ratingCoverage: boolean;
  complianceSummary: boolean;
  anomalies: boolean;
  baselineQuality: boolean;
  loyaltyLiability: boolean;
}

/**
 * Composite Shift Report DTO — the single output of the assembly service.
 * All downstream consumers (page, PDF, CSV) read from this structure.
 * No business logic downstream — this DTO is the complete, display-ready payload.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: composite aggregate from 6 contexts
export interface ShiftReportDTO {
  /** Section 1: Executive Summary */
  executiveSummary: ExecutiveSummarySection;
  /** Section 2: Financial Summary (per-table + casino totals) */
  financialSummary: FinancialSummarySection | null;
  /** Section 3: Rating / Coverage Quality */
  ratingCoverage: RatingCoverageSection | null;
  /** Section 4: Compliance Summary (MTL/CTR) */
  complianceSummary: ComplianceSummarySection | null;
  /** Section 5: Anomalies */
  anomalies: AnomaliesSection | null;
  /** Section 6: Baseline Quality */
  baselineQuality: BaselineQualitySection | null;
  /** Section 7: Loyalty Liability */
  loyaltyLiability: LoyaltyLiabilitySection | null;
  /** Section 8: Report Footer */
  footer: ReportFooterSection;
  /** Section availability tracking for partial degradation */
  availability: SectionAvailability;
  /** Errors from failed source calls */
  errors: ShiftReportError[];
}

export interface ShiftReportError {
  source: string;
  message: string;
  affectedSections: string[];
}

// ── Re-exported consumed types (for downstream convenience) ─────────────────

export type {
  ShiftCasinoMetricsDTO,
  ShiftTableMetricsDTO,
} from '@/services/table-context/shift-metrics/dtos';

export type { CashObsTableRollupDTO } from '@/services/table-context/dtos';

export type {
  AnomalyAlertDTO,
  AlertQualityDTO,
  BaselineCoverageDTO,
} from '@/services/shift-intelligence/dtos';

export type { MtlGamingDaySummaryDTO } from '@/services/mtl/dtos';

export type {
  TheoDiscrepancyDto,
  AuditCorrelationDto,
  RatingCoverageDto,
  LoyaltyLiabilityDto,
} from '@/services/measurement/dtos';

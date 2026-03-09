/**
 * MeasurementService DTOs
 *
 * Cross-cutting aggregation layer for ADR-039 measurement metrics.
 * Combines data from rating_slip, measurement views, and loyalty tables.
 *
 * Pattern A (Contract-First): Manual DTOs for cross-context aggregation.
 * NO direct table ownership — reads from existing bounded contexts.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS1 Service Layer
 */

// === Widget Identity ===

export type MeasurementWidgetId =
  | 'theo_discrepancy'
  | 'audit_correlation'
  | 'rating_coverage'
  | 'loyalty_liability';

// === Filter Types ===

export type FilterDimension = 'pit' | 'table';

export interface MeasurementFilters {
  pitId?: string;
  tableId?: string;
  gamingDay?: string;
}

// === Error Types ===

/**
 * Canonical error codes for measurement widget failures.
 * Locked enum — no raw database error messages exposed.
 */
export type WidgetErrorCode =
  | 'forbidden'
  | 'invalid_filter'
  | 'query_failed'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

const WIDGET_ERROR_MESSAGES: Record<WidgetErrorCode, string> = {
  forbidden: 'Access denied — insufficient permissions',
  invalid_filter: 'Invalid filter parameters',
  query_failed: 'Metric query failed — please retry',
  timeout: 'Metric query timed out — please retry',
  unavailable: 'Metric data is currently unavailable',
  unknown: 'An unexpected error occurred',
};

export interface WidgetError {
  code: WidgetErrorCode;
  message: string;
}

/**
 * Create a WidgetError with predefined message (no raw DB error leakage).
 */
export function createWidgetError(
  code: WidgetErrorCode,
  messageOverride?: string,
): WidgetError {
  return {
    code,
    message: messageOverride ?? WIDGET_ERROR_MESSAGES[code],
  };
}

// === MEAS-001: Theo Discrepancy ===

export interface TheoDiscrepancyBreakdownRow {
  groupName: string;
  slipCount: number;
  discrepantCount: number;
  discrepancyRate: number;
  totalDiscrepancyCents: number;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface TheoDiscrepancyDto {
  totalSlips: number;
  discrepantSlips: number;
  discrepancyRate: number;
  totalDiscrepancyCents: number;
  avgDiscrepancyPercent: number;
  breakdown: TheoDiscrepancyBreakdownRow[] | null;
  supportedDimensions: FilterDimension[];
}

// === MEAS-002: Audit Correlation ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface AuditCorrelationDto {
  totalSlips: number;
  slipsWithPft: number;
  slipsWithMtl: number;
  slipsWithLoyalty: number;
  fullChainCount: number;
  fullChainRate: number;
  supportedDimensions: FilterDimension[];
}

// === MEAS-003: Rating Coverage ===

export interface RatingCoverageBreakdownRow {
  groupName: string;
  sessionCount: number;
  avgCoverageRatio: number;
  ratedSeconds: number;
  openSeconds: number;
}

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface RatingCoverageDto {
  totalSessions: number;
  avgCoverageRatio: number;
  ratedSeconds: number;
  openSeconds: number;
  untrackedSeconds: number;
  breakdown: RatingCoverageBreakdownRow[] | null;
  supportedDimensions: FilterDimension[];
}

// === MEAS-004: Loyalty Liability ===

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Aggregated DTO from multiple services
export interface LoyaltyLiabilityDto {
  totalOutstandingPoints: number;
  estimatedMonetaryValueCents: number;
  centsPerPoint: number | null;
  playerCount: number;
  snapshotDate: string;
  supportedDimensions: FilterDimension[];
}

// === BFF Summary Response ===

export interface MeasurementSummaryResponse {
  theoDiscrepancy: TheoDiscrepancyDto | null;
  auditCorrelation: AuditCorrelationDto | null;
  ratingCoverage: RatingCoverageDto | null;
  loyaltyLiability: LoyaltyLiabilityDto | null;
  errors: Partial<Record<MeasurementWidgetId, WidgetError>>;
  filters: MeasurementFilters;
}

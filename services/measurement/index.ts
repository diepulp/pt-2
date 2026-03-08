/**
 * MeasurementService
 *
 * Cross-cutting aggregation service for ADR-039 measurement metrics.
 * Reads from rating_slip, measurement views, and loyalty tables.
 *
 * Pattern A (Contract-First): Manual DTOs for cross-context aggregation.
 * NO direct table ownership — reads from existing bounded contexts.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS1 Service Layer
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type {
  MeasurementFilters,
  MeasurementSummaryResponse,
  MeasurementWidgetId,
  WidgetError,
  WidgetErrorCode,
  TheoDiscrepancyDto,
  AuditCorrelationDto,
  RatingCoverageDto,
  LoyaltyLiabilityDto,
} from './dtos';
import { createWidgetError } from './dtos';
import {
  mapTheoDiscrepancyRows,
  mapAuditCorrelationRows,
  mapRatingCoverageRows,
  mapLoyaltyLiabilityRow,
} from './mappers';
import {
  queryTheoDiscrepancy,
  queryAuditCorrelation,
  queryRatingCoverage,
  queryLoyaltyLiability,
} from './queries';

// === Service Interface ===

export interface MeasurementService {
  getSummary(
    casinoId: string,
    filters?: MeasurementFilters,
  ): Promise<MeasurementSummaryResponse>;
}

// === Error Classification ===

function classifyError(error: unknown): WidgetErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const candidate = error as Record<string, unknown>;
    if (
      typeof candidate.code === 'string' &&
      isWidgetErrorCode(candidate.code)
    ) {
      return candidate.code;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('permission') || message.includes('rls')) {
      return 'forbidden';
    }
    if (message.includes('timeout') || message.includes('statement timeout')) {
      return 'timeout';
    }
  }

  return 'query_failed';
}

function isWidgetErrorCode(code: string): code is WidgetErrorCode {
  return [
    'forbidden',
    'invalid_filter',
    'query_failed',
    'timeout',
    'unavailable',
    'unknown',
  ].includes(code);
}

// === Factory ===

export function createMeasurementService(
  supabase: SupabaseClient<Database>,
): MeasurementService {
  return {
    async getSummary(
      casinoId: string,
      filters?: MeasurementFilters,
    ): Promise<MeasurementSummaryResponse> {
      const hasFilter = Boolean(filters?.pitId || filters?.tableId);

      const [theoResult, auditResult, coverageResult, loyaltyResult] =
        await Promise.allSettled([
          queryTheoDiscrepancy(supabase, casinoId, filters),
          queryAuditCorrelation(supabase, casinoId),
          queryRatingCoverage(supabase, casinoId, filters),
          queryLoyaltyLiability(supabase, casinoId),
        ]);

      let theoDiscrepancy: TheoDiscrepancyDto | null = null;
      let auditCorrelation: AuditCorrelationDto | null = null;
      let ratingCoverage: RatingCoverageDto | null = null;
      let loyaltyLiability: LoyaltyLiabilityDto | null = null;
      const errors: Partial<Record<MeasurementWidgetId, WidgetError>> = {};

      // MEAS-001
      if (theoResult.status === 'fulfilled') {
        theoDiscrepancy = mapTheoDiscrepancyRows(theoResult.value, hasFilter);
      } else {
        const code = classifyError(theoResult.reason);
        errors.theo_discrepancy = createWidgetError(code);
      }

      // MEAS-002
      if (auditResult.status === 'fulfilled') {
        auditCorrelation = mapAuditCorrelationRows(auditResult.value);
      } else {
        const code = classifyError(auditResult.reason);
        errors.audit_correlation = createWidgetError(code);
      }

      // MEAS-003
      if (coverageResult.status === 'fulfilled') {
        ratingCoverage = mapRatingCoverageRows(coverageResult.value, hasFilter);
      } else {
        const code = classifyError(coverageResult.reason);
        errors.rating_coverage = createWidgetError(code);
      }

      // MEAS-004 — null snapshot is valid (new casino), NOT an error
      if (loyaltyResult.status === 'fulfilled') {
        loyaltyLiability = mapLoyaltyLiabilityRow(loyaltyResult.value);
      } else {
        const code = classifyError(loyaltyResult.reason);
        errors.loyalty_liability = createWidgetError(code);
      }

      return {
        theoDiscrepancy,
        auditCorrelation,
        ratingCoverage,
        loyaltyLiability,
        errors,
        filters: filters ?? {},
      };
    },
  };
}

// === DTO Re-exports ===

export type {
  MeasurementWidgetId,
  FilterDimension,
  WidgetErrorCode,
  WidgetError,
  MeasurementFilters,
  MeasurementSummaryResponse,
  TheoDiscrepancyDto,
  TheoDiscrepancyBreakdownRow,
  AuditCorrelationDto,
  RatingCoverageDto,
  RatingCoverageBreakdownRow,
  LoyaltyLiabilityDto,
} from './dtos';
export { createWidgetError } from './dtos';

// === Mapper Re-exports (for testing) ===

export {
  mapTheoDiscrepancyRows,
  mapAuditCorrelationRows,
  mapRatingCoverageRows,
  mapLoyaltyLiabilityRow,
} from './mappers';

// === Query Re-exports (for testing) ===

export {
  queryTheoDiscrepancy,
  queryAuditCorrelation,
  queryRatingCoverage,
  queryLoyaltyLiability,
} from './queries';

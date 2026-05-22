/**
 * ShiftReportService Factory
 *
 * Composition surface: cross-context aggregation for shift reports.
 * Pattern A (Contract-First): functional factory with explicit interface.
 *
 * No owned tables. No domain invariants. No SRM authority changes.
 * Reads from 6 consumed contexts via their published query functions.
 *
 * @see EXEC-065 Shift Report
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { assembleShiftReport } from './assembler';
import type { ShiftReportDTO, ShiftReportParams } from './dtos';

// ── Service Interface ───────────────────────────────────────────────────────

export interface ShiftReportServiceInterface {
  /**
   * Assemble a shift report from 6 consumed contexts (7 source calls).
   * Uses Promise.allSettled() for resilient parallel fetch.
   * Partial failure → degraded DTO (null sections), not crash.
   */
  assembleShiftReport(params: ShiftReportParams): Promise<ShiftReportDTO>;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createShiftReportService(
  supabase: SupabaseClient<Database>,
): ShiftReportServiceInterface {
  return {
    assembleShiftReport: (params) => assembleShiftReport(supabase, params),
  };
}

// ── Re-exports ──────────────────────────────────────────────────────────────

export type {
  ShiftReportDTO,
  ShiftReportParams,
  ShiftReportError,
  ExecutiveSummarySection,
  FinancialSummarySection,
  FinancialTableRow,
  RatingCoverageSection,
  ComplianceSummarySection,
  CompliancePatronRow,
  AnomaliesSection,
  BaselineQualitySection,
  LoyaltyLiabilitySection,
  ReportFooterSection,
  SectionAvailability,
} from './dtos';

export { shiftReportKeys } from './keys';
export type { ShiftReportFilters } from './keys';

export { fetchShiftReport } from './http';

export { shiftReportParamsSchema, shiftBoundarySchema } from './schemas';

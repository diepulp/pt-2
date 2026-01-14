/**
 * Shift Metrics Service Module
 *
 * Exports DTOs, schemas, and service functions for shift metrics queries.
 *
 * @see PRD-Shift-Dashboards-v0.2
 * @see SHIFT_METRICS_CATALOG
 */

// DTOs
export type {
  ShiftCasinoMetricsDTO,
  ShiftDashboardSummaryDTO,
  ShiftMetricsTimeWindow,
  ShiftPitMetricsDTO,
  ShiftPitMetricsParams,
  ShiftTableMetricsDTO,
} from "./dtos";

// Zod Schemas
export {
  shiftCasinoMetricsQuerySchema,
  shiftMetricsTimeWindowSchema,
  shiftPitMetricsQuerySchema,
  shiftTableMetricsQuerySchema,
} from "./schemas";

export type {
  ShiftCasinoMetricsQuery,
  ShiftPitMetricsQuery,
  ShiftTableMetricsQuery,
} from "./schemas";

// Service Functions
export {
  getShiftAllPitsMetrics,
  getShiftCasinoMetrics,
  getShiftDashboardSummary,
  getShiftPitMetrics,
  getShiftTableMetrics,
} from "./service";

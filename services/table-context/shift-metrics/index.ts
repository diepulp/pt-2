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
} from './dtos';

// Provenance
export type { NullReason, ProvenanceMetadata } from './provenance';
export {
  deriveTableProvenance,
  rollupCasinoProvenance,
  rollupPitProvenance,
} from './provenance';

// Snapshot Rules
export type { CoverageTier } from './snapshot-rules';
export {
  computeAggregatedCoverageRatio,
  computeTableCoverageRatio,
  computeTableNullReasons,
  getCoverageTier,
  isSnapshotStale,
} from './snapshot-rules';

// Zod Schemas
export {
  shiftCasinoMetricsQuerySchema,
  shiftMetricsTimeWindowSchema,
  shiftPitMetricsQuerySchema,
  shiftTableMetricsQuerySchema,
} from './schemas';

export type {
  ShiftCasinoMetricsQuery,
  ShiftPitMetricsQuery,
  ShiftTableMetricsQuery,
} from './schemas';

// Service Functions
export {
  getShiftAllPitsMetrics,
  getShiftCasinoMetrics,
  getShiftDashboardSummary,
  getShiftPitMetrics,
  getShiftTableMetrics,
} from './service';

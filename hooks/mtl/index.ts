/**
 * MTL Service React Query Hooks
 *
 * Hooks for MTL (Monetary Transaction Log) queries and mutations:
 * - Entry list and detail queries
 * - Gaming Day Summary (COMPLIANCE AUTHORITY surface)
 * - Create entry and audit note mutations
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 * @see EXECUTION-SPEC-PRD-005.md WS5
 */

// Query key factory (re-export from service)
export { mtlKeys } from "@/services/mtl/keys";
export type {
  MtlEntryQueryFilters,
  MtlGamingDaySummaryQueryFilters,
} from "@/services/mtl/keys";

// Entry query hooks
export { useMtlEntries, useMtlEntry } from "./use-mtl-entries";

// Gaming Day Summary query hook (COMPLIANCE AUTHORITY)
export { useGamingDaySummary } from "./use-gaming-day-summary";

// Threshold notifications hook
export {
  useThresholdNotifications,
  checkThreshold,
  checkCumulativeThreshold,
  notifyThreshold,
  type ThresholdLevel,
  type ThresholdCheckResult,
  type ThresholdConfig,
} from "./use-threshold-notifications";

// Patron daily total hook
export {
  usePatronDailyTotal,
  patronDailyTotalKey,
  type PatronDailyTotalDTO,
} from "./use-patron-daily-total";

// Mutation hooks
export {
  useCreateMtlEntry,
  useCreateMtlAuditNote,
  type CreateMtlEntryInput,
  type CreateMtlAuditNoteInput,
} from "./use-mtl-mutations";

// Re-export DTOs for convenience
export type {
  MtlEntryDTO,
  MtlEntryWithNotesDTO,
  MtlAuditNoteDTO,
  MtlGamingDaySummaryDTO,
  MtlTxnType,
  MtlSource,
  MtlDirection,
  EntryBadge,
  AggBadge,
  MtlEntryFilters,
  MtlGamingDaySummaryFilters,
} from "@/services/mtl/dtos";

/**
 * Dashboard React Query Hooks
 *
 * Hooks for pit dashboard data fetching:
 * - Tables with active slip counts
 * - Active slips for selected table
 * - Aggregate stats (active tables, open slips, checked-in players)
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS3
 */

// Query key factory
export { dashboardKeys } from "./keys";

// Table hooks
export {
  useDashboardTables,
  useDashboardActiveTables,
} from "./use-dashboard-tables";

// Slip hooks
export {
  useDashboardSlips,
  useActiveSlipsForDashboard,
} from "./use-dashboard-slips";

// Stats hooks
export {
  useDashboardStats,
  useDashboardStatsWithGamingDay,
} from "./use-dashboard-stats";

// Realtime hooks (P1)
export {
  useDashboardRealtime,
  RealtimeStatusIndicator,
} from "./use-dashboard-realtime";

// Re-export types for convenience
export type {
  DashboardTablesFilters,
  DashboardSlipsFilters,
  DashboardTableDTO,
  DashboardStats,
  // Re-exported service types
  GamingTableDTO,
  GamingTableWithDealerDTO,
  TableStatus,
  GameType,
  RatingSlipDTO,
} from "./types";

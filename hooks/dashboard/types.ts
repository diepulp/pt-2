/**
 * Dashboard Hook Types
 *
 * Shared types for dashboard React Query hooks.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS3
 */

import type { RatingSlipDTO } from '@/services/rating-slip/dtos';
import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  TableStatus,
  GameType,
} from '@/services/table-context/dtos';
import type { Database } from '@/types/database.types';

// === Filter Types ===

/**
 * Filters for dashboard tables query.
 */
export type DashboardTablesFilters = {
  /** Filter by table status */
  status?: TableStatus;
  /** Filter by game type */
  type?: GameType;
  /** Filter by pit */
  pit?: string;
};

/**
 * Filters for dashboard slips query.
 */
export type DashboardSlipsFilters = {
  /** Filter by slip status (open, paused, closed) */
  status?: 'open' | 'paused' | 'closed';
};

// === Response Types ===

/**
 * Extended table DTO with active slips count for dashboard display.
 */
export interface DashboardTableDTO extends GamingTableWithDealerDTO {
  /** Number of active (open + paused) rating slips at this table */
  activeSlipsCount: number;
  /** Current session lifecycle status (null = no active session). EXEC-038A Bug 3. */
  current_session_status?: 'OPEN' | 'ACTIVE' | 'RUNDOWN' | null;
}

/**
 * Dashboard stats aggregation.
 */
export interface DashboardStats {
  /** Number of tables with status = 'active' */
  activeTablesCount: number;
  /** Number of open rating slips (status = 'open' or 'paused') */
  openSlipsCount: number;
  /** Number of players currently checked in (active visits) */
  checkedInPlayersCount: number;
  /** Current gaming day date string (YYYY-MM-DD) */
  gamingDay: string | null;
}

// === Coverage Types (PRD-048 WS3) ===

/**
 * Per-table coverage data from measurement_rating_coverage_v.
 * Derived from Database view type per Pattern B.
 */
export type TableCoverageRow =
  Database['public']['Views']['measurement_rating_coverage_v']['Row'];

/**
 * Coverage DTO for dashboard display — picks fields needed by the analytics panel.
 */
export type TableCoverageDTO = Pick<
  TableCoverageRow,
  | 'gaming_table_id'
  | 'rated_ratio'
  | 'untracked_seconds'
  | 'rated_seconds'
  | 'open_seconds'
  | 'slip_count'
  | 'gaming_day'
>;

/**
 * Coverage tier classification.
 * Aligned to canonical type from services/table-context/shift-metrics/snapshot-rules.ts.
 */
export type CoverageTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// Re-export service types for convenience
export type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  TableStatus,
  GameType,
} from '@/services/table-context/dtos';
export type { RatingSlipDTO } from '@/services/rating-slip/dtos';

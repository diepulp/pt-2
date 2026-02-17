/**
 * VisitService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 814-888
 * @see EXEC-VSE-001 Visit Service Evolution
 */

import type { Database } from '@/types/database.types';

// === Base Row Types (for Pick/Omit derivation) ===

type VisitRow = Database['public']['Tables']['visit']['Row'];
type VisitInsert = Database['public']['Tables']['visit']['Insert'];

// === Visit Kind Enum (derived from database) ===

/**
 * Visit archetype classification.
 *
 * - `reward_identified`: Player exists, no gaming, redemptions only (comps, vouchers)
 * - `gaming_identified_rated`: Player exists, gaming session, loyalty accrual eligible
 * - `gaming_ghost_unrated`: No player identity, gaming session, compliance tracking only
 *
 * @see EXEC-VSE-001 section 1 (Executive Summary)
 */
export type VisitKind = Database['public']['Enums']['visit_kind'];

// === Visit DTOs ===

/**
 * Public visit record.
 *
 * Note: player_id is now nullable (string | null) to support ghost gaming visits.
 * Ghost visits (gaming_ghost_unrated) have player_id = NULL.
 *
 * PRD-017: visit_group_id added for session continuity tracking.
 * ADR-026: gaming_day added for gaming-day-scoped visits.
 */
export type VisitDTO = Pick<
  VisitRow,
  | 'id'
  | 'player_id'
  | 'casino_id'
  | 'visit_kind'
  | 'started_at'
  | 'ended_at'
  | 'visit_group_id'
  | 'gaming_day'
>;

/** Visit creation input (casino_id comes from RLS context) */
export type CreateVisitDTO = Pick<VisitInsert, 'player_id'>;

/**
 * Visit close input.
 * Simple input type - optional end time, not a table projection.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input, not table-derived
export type CloseVisitDTO = {
  /** Optional explicit end time (defaults to now) */
  ended_at?: string;
};

// === Typed Visit Creation DTOs (EXEC-VSE-001 WS-2) ===

/**
 * Input for creating a reward-only visit.
 * Player must be identified (player_id required).
 * Creates visit with visit_kind = 'reward_identified'.
 *
 * Use case: Comps, vouchers, customer care without gaming session.
 */
export type CreateRewardVisitDTO = Pick<VisitInsert, 'player_id'>;

/**
 * Input for creating an identified gaming visit.
 * Player must be identified (player_id required).
 * Creates visit with visit_kind = 'gaming_identified_rated'.
 *
 * Use case: Standard rated play with loyalty accrual.
 */
export type CreateGamingVisitDTO = Pick<VisitInsert, 'player_id'>;

/**
 * RPC input for creating a ghost gaming visit.
 * No player identity required (player_id will be NULL).
 * Creates visit with visit_kind = 'gaming_ghost_unrated'.
 *
 * Use case: Tracking gaming activity for compliance (CTR/MTL) when
 * player declines or cannot provide identification.
 *
 * @see ADR-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input: table_id/notes not in visit table
export type CreateGhostGamingVisitDTO = {
  /** Required: the table where ghost gaming occurs */
  table_id: string;
  /** Optional: notes about the ghost gaming session */
  notes?: string;
};

/**
 * RPC input for converting a reward visit to a gaming visit.
 * Only valid for visits with visit_kind = 'reward_identified'.
 * Transitions to visit_kind = 'gaming_identified_rated'.
 *
 * Use case: Player came in for rewards, decided to play.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input: operation DTO, not table projection
export type ConvertRewardToGamingDTO = {
  /** Required: the visit to convert */
  visit_id: string;
};

// === Active Visit DTOs ===

/**
 * Active visit check result.
 * Used for idempotent check-in and active visit queries.
 * RPC response type - computed aggregate with boolean flag.
 */
export interface ActiveVisitDTO {
  /** Whether player has an active visit */
  has_active_visit: boolean;
  /** The active visit details (if any) */
  visit: VisitDTO | null;
}

/**
 * RPC response: Start visit result with idempotency metadata.
 * Eliminates redundant active visit check at route layer (P2 fix: ISSUE-983EFA10).
 *
 * ADR-026: Extended with `resumed` and `gamingDay` for gaming-day-scoped visits.
 * - `resumed`: true if resuming same-day visit (vs creating new)
 * - `gamingDay`: ISO date (YYYY-MM-DD) for the visit's gaming day
 */

export interface StartVisitResultDTO {
  /** The visit (new or existing) */
  visit: VisitDTO;
  /** True if a new visit was created, false if existing was returned */
  isNew: boolean;
  /** True if resuming same-day visit (ADR-026) */
  resumed: boolean;
  /** Gaming day for this visit (YYYY-MM-DD) (ADR-026) */
  gamingDay: string;
}

// === Visit with Player Info ===

/**
 * Visit with embedded player details.
 * Used for visit list displays.
 * RPC response type - joined response with nested player object.
 *
 * Note: player is optional for ghost visits (player_id = NULL).
 */
export interface VisitWithPlayerDTO extends VisitDTO {
  player: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for visit list queries */
export type VisitListFilters = {
  /** Filter by player */
  player_id?: string;
  /** Filter by visit status */
  status?: 'active' | 'closed';
  /** Filter by visit kind */
  visit_kind?: VisitKind;
  /** Filter by date range start */
  from_date?: string;
  /** Filter by date range end */
  to_date?: string;
  /** Cursor for pagination (started_at timestamp) */
  cursor?: string;
  /** Max results per page */
  limit?: number;
};

/** Filters for active visit query */
export type ActiveVisitFilters = {
  /** Required: player ID to check */
  player_id: string;
};

// === Visit Live View DTO (PRD-016) ===

/**
 * Visit live view with session aggregates.
 * Response from rpc_get_visit_live_view.
 *
 * PRD-016: Provides stable "session slip" view to operators.
 * Aggregates all rating slips for a visit into session totals.
 *
 * @see PRD-016 Rating Slip Session Continuity
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response type with computed aggregates
export interface VisitLiveViewDTO {
  /** Visit UUID */
  visit_id: string;
  /** Player UUID */
  player_id: string;
  /** Player first name */
  player_first_name: string;
  /** Player last name */
  player_last_name: string;
  /** Visit status: 'open' or 'closed' */
  visit_status: 'open' | 'closed';
  /** Visit start timestamp */
  started_at: string;

  // Current segment (active slip) - null if no active slip
  /** Current slip UUID (null if no active slip) */
  current_segment_slip_id: string | null;
  /** Current table UUID (null if no active slip) */
  current_segment_table_id: string | null;
  /** Current table name (null if no active slip) */
  current_segment_table_name: string | null;
  /** Current seat number (null if no active slip) */
  current_segment_seat_number: string | null;
  /** Current slip status: 'open' or 'paused' (null if no active slip) */
  current_segment_status: 'open' | 'paused' | null;
  /** Current segment start timestamp (null if no active slip) */
  current_segment_started_at: string | null;
  /** Current average bet in dollars (stored as dollars in rating_slip) */
  current_segment_average_bet: number | null;

  // Session totals (aggregated across all slips)
  /** Total play duration in seconds (closed slips + active slip) */
  session_total_duration_seconds: number;
  /** Total buy-in amount in dollars (converted from cents at service layer) */
  session_total_buy_in: number;
  /** Total cash-out amount in dollars (converted from cents at service layer) */
  session_total_cash_out: number;
  /** Net amount in dollars (buy_in - cash_out, converted at service layer) */
  session_net: number;
  /** Total loyalty points earned (0 until loyalty system implemented) */
  session_points_earned: number;
  /** Count of rating slip segments for this visit */
  session_segment_count: number;

  // Optional segments array (when include_segments=true)
  /** Array of recent slip segments (optional) */
  segments?: Array<{
    /** Slip UUID */
    slip_id: string;
    /** Table UUID */
    table_id: string;
    /** Table name */
    table_name: string;
    /** Seat number (null if not assigned) */
    seat_number: string | null;
    /** Slip status */
    status: string;
    /** Slip start timestamp */
    start_time: string;
    /** Slip end timestamp (null if still open) */
    end_time: string | null;
    /** Final duration in seconds (null if not closed) */
    final_duration_seconds: number | null;
    /** Average bet (null if not set) */
    average_bet: number | null;
  }>;
}

// === PRD-017: Visit Continuation DTOs ===

/**
 * Options for recent sessions query.
 * Used by getPlayerRecentSessions.
 */

export interface RecentSessionsOptions {
  /** Max sessions to return (default 5, max 100) */
  limit?: number;
  /** Cursor for pagination (base64 encoded ended_at|visit_id) */
  cursor?: string;
}

/**
 * Single session item in recent sessions list.
 * Response from rpc_get_player_recent_sessions.
 *
 * Note: ended_at is nullable for open_visit (null = still open).
 * For sessions array items, ended_at is always present (closed sessions only).
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response with aggregates
export interface RecentSessionDTO {
  /** Visit UUID */
  visit_id: string;
  /** Visit group UUID (for session continuity) */
  visit_group_id: string;
  /** Session start timestamp */
  started_at: string;
  /** Session end timestamp (null for open_visit) */
  ended_at: string | null;
  /** Last table UUID player was at */
  last_table_id: string | null;
  /** Last table name player was at */
  last_table_name: string | null;
  /** Last seat number player occupied */
  last_seat_number: number | null;
  /** Total session duration in seconds */
  total_duration_seconds: number;
  /** Total buy-in amount in dollars (converted from cents at service layer) */
  total_buy_in: number;
  /** Total cash-out amount in dollars (converted from cents at service layer) */
  total_cash_out: number;
  /** Net amount in dollars (converted from cents at service layer) */
  net: number;
  /** Total loyalty points earned */
  points_earned: number;
  /** Number of rating slip segments */
  segment_count: number;
}

/**
 * Response from rpc_get_player_recent_sessions.
 * Includes paginated closed sessions and any current open visit.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response envelope
export interface RecentSessionsDTO {
  /** Paginated closed sessions */
  sessions: RecentSessionDTO[];
  /** Cursor for next page (null if no more) */
  next_cursor: string | null;
  /** Current open visit (if any) */
  open_visit: RecentSessionDTO | null;
}

/**
 * Response from rpc_get_player_last_session_context.
 * Provides context from last closed session for prefilling continuation form.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response with composed context
export interface LastSessionContextDTO {
  /** Visit UUID of last closed session */
  visit_id: string;
  /** Visit group UUID for continuity */
  visit_group_id: string;
  /** Last table UUID player was at */
  last_table_id: string;
  /** Last table name player was at */
  last_table_name: string;
  /** Last seat number player occupied */
  last_seat_number: number;
  /** Last game settings (game-specific config) */
  last_game_settings: Record<string, unknown> | null;
  /** Last average bet in dollars */
  last_average_bet: number | null;
  /** When session ended */
  ended_at: string;
}

/**
 * Request for starting a new visit from a previous session.
 * Creates new visit with visit_group_id from source visit.
 */

export interface StartFromPreviousRequest {
  /** Player UUID */
  player_id: string;
  /** Source visit UUID to continue from */
  source_visit_id: string;
  /** Destination table UUID */
  destination_table_id: string;
  /** Destination seat number */
  destination_seat_number: number;
  /** Optional game settings override */
  game_settings_override?: Record<string, unknown>;
}

/**
 * Response from startFromPrevious operation.
 * Contains new visit and first rating slip IDs.
 */

export interface StartFromPreviousResponse {
  /** New visit UUID */
  visit_id: string;
  /** Visit group UUID (inherited from source) */
  visit_group_id: string;
  /** Active rating slip UUID (first segment) */
  active_slip_id: string;
  /** Visit start timestamp */
  started_at: string;
}

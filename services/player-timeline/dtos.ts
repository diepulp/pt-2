/**
 * PlayerTimeline Service DTOs
 *
 * Discriminated union types for the Player 360 Timeline per ADR-029.
 * Event metadata is typed per event_type for runtime validation.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md
 */

// === Event Type Enum ===

/**
 * Canonical interaction event types for the Player 360 timeline.
 * Phase 1 MVP: 9 event types from 5 source tables.
 * Phase 2: 13 additional event types.
 */
export type InteractionEventType =
  // Session & Presence
  | "visit_start"
  | "visit_end"
  | "visit_resume"
  // Gaming Activity
  | "rating_start"
  | "rating_pause"
  | "rating_resume"
  | "rating_close"
  // Financial
  | "cash_in"
  | "cash_out"
  | "cash_observation"
  | "financial_adjustment"
  // Loyalty & Rewards
  | "points_earned"
  | "points_redeemed"
  | "points_adjusted"
  | "promo_issued"
  | "promo_redeemed"
  // Staff Interactions
  | "note_added"
  | "tag_applied"
  | "tag_removed"
  // Compliance
  | "mtl_recorded"
  // Identity & Enrollment
  | "player_enrolled"
  | "identity_verified";

/**
 * Phase 1 MVP event types (9 events from 5 tables).
 * Used for type narrowing in Phase 1 implementations.
 */
export type Phase1EventType =
  | "visit_start"
  | "visit_end"
  | "rating_start"
  | "rating_close"
  | "cash_in"
  | "cash_out"
  | "points_earned"
  | "points_redeemed"
  | "mtl_recorded";

// === Metadata Type Contracts (Discriminated Union) ===

/**
 * Visit event metadata (visit_start, visit_end, visit_resume).
 */
export interface VisitEventMetadata {
  visitKind:
    | "reward_identified"
    | "gaming_identified_rated"
    | "gaming_ghost_unrated";
  gamingDay: string; // YYYY-MM-DD
}

/**
 * Rating event metadata (rating_start, rating_pause, rating_resume, rating_close).
 */
export interface RatingEventMetadata {
  tableId: string;
  tableName: string;
  seatNumber: string | null;
  /** Present if this was a table move - UI infers move from this field */
  previousSlipId?: string;
  /** Only present on rating_close */
  durationSeconds?: number;
  /** Only present on rating_close */
  averageBet?: number;
}

/**
 * Financial event metadata (cash_in, cash_out, cash_observation, financial_adjustment).
 */
export interface FinancialEventMetadata {
  direction: "in" | "out";
  source: "pit" | "cage" | "system";
  tenderType: string;
  visitId: string;
  note?: string;
}

/**
 * Loyalty event metadata (points_earned, points_redeemed, points_adjusted).
 */
export interface LoyaltyEventMetadata {
  reason: string;
  ratingSlipId?: string;
  visitId?: string;
  note?: string;
}

/**
 * Note event metadata (note_added).
 */
export interface NoteEventMetadata {
  content: string;
  visibility: "private" | "team" | "all";
}

/**
 * Tag event metadata (tag_applied, tag_removed).
 */
export interface TagEventMetadata {
  tagName: string;
  tagCategory: "vip" | "attention" | "service" | "custom";
}

/**
 * Compliance event metadata (mtl_recorded).
 */
export interface ComplianceEventMetadata {
  direction: "in" | "out";
  txnType: string;
  source: string;
  gamingDay: string;
}

/**
 * Identity event metadata (player_enrolled, identity_verified).
 */
export interface IdentityEventMetadata {
  documentType?: "drivers_license" | "passport" | "state_id";
  issuingState?: string;
}

/**
 * Promo event metadata (promo_issued, promo_redeemed).
 */
export interface PromoEventMetadata {
  promoType: string;
  promoCode?: string;
  amount?: number;
}

/**
 * Discriminated union of all event metadata types.
 * Used for runtime validation and type narrowing.
 */
export type InteractionEventMetadata =
  | VisitEventMetadata
  | RatingEventMetadata
  | FinancialEventMetadata
  | LoyaltyEventMetadata
  | NoteEventMetadata
  | TagEventMetadata
  | ComplianceEventMetadata
  | IdentityEventMetadata
  | PromoEventMetadata;

// === Canonical Event Shape (DTO) ===

/**
 * Canonical interaction event DTO.
 * RPC response shape from rpc_get_player_timeline.
 * Exempt from Database derivation rule per RPC response exception.
 */
export interface InteractionEventDTO {
  /** Synthetic event ID (deterministic: uuid_generate_v5) */
  eventId: string;
  /** Classified event type */
  eventType: InteractionEventType;
  /** When event occurred (ISO 8601) */
  occurredAt: string;
  /** Staff who performed action (null for system events) */
  actorId: string | null;
  /** Actor display name (for UI) */
  actorName: string | null;
  /** Source table for drilldown */
  sourceTable: string;
  /** Actual row PK for joins */
  sourceId: string;
  /** Human-readable summary */
  summary: string;
  /** Monetary or points amount (null if N/A) */
  amount: number | null;
  /** Event-specific payload (typed per eventType) */
  metadata: InteractionEventMetadata;
}

// === Query Types ===

/**
 * Timeline query parameters.
 * CRITICAL: No casinoId parameter - derived from RLS context per ADR-024.
 */
export interface TimelineQuery {
  /** Player ID (required) */
  playerId: string;
  /** Filter by event types (optional) */
  eventTypes?: InteractionEventType[];
  /** Filter from date (ISO date) */
  fromDate?: string;
  /** Filter to date (ISO date) */
  toDate?: string;
  /** Max results per page (default 50) */
  limit?: number;
  /** Keyset pagination: cursor timestamp */
  cursorAt?: string;
  /** Keyset pagination: cursor event ID */
  cursorId?: string;
}

/**
 * Timeline response with pagination metadata.
 */
export interface TimelineResponse {
  /** List of interaction events */
  events: InteractionEventDTO[];
  /** Next page cursor: timestamp */
  nextCursorAt: string | null;
  /** Next page cursor: event ID */
  nextCursorId: string | null;
  /** True if more pages exist */
  hasMore: boolean;
}

// === RPC Row Type (for internal mapping) ===

/**
 * Raw row shape from rpc_get_player_timeline.
 * Used internally for mapping to InteractionEventDTO.
 */
export interface RpcTimelineRow {
  event_id: string;
  event_type: InteractionEventType;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  source_table: string;
  source_id: string;
  summary: string;
  amount: number | null;
  metadata: Record<string, unknown>;
  has_more: boolean;
  next_cursor_at: string | null;
  next_cursor_id: string | null;
}

// === Filter Types (for UI) ===

/**
 * Filters for timeline queries (used in query keys and UI).
 */
export interface TimelineFilters {
  /** Filter by event types */
  eventTypes?: InteractionEventType[];
  /** Date range: from */
  fromDate?: string;
  /** Date range: to */
  toDate?: string;
  /** Limit per page */
  limit?: number;
}

/**
 * Pagination cursor for keyset pagination.
 */
export interface TimelineCursor {
  /** Cursor timestamp */
  cursorAt: string;
  /** Cursor event ID */
  cursorId: string;
}

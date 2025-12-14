/**
 * RatingSlipModal BFF DTOs
 *
 * Pattern A (Contract-First): Manual DTOs for BFF aggregation endpoint.
 * Aggregates data from 5 bounded contexts for the rating slip modal view.
 *
 * Bounded Contexts:
 * - RatingSlipService - Slip details
 * - VisitService - Session anchor
 * - PlayerService - Player identity
 * - LoyaltyService - Points balance
 * - PlayerFinancialService - Financial summary
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

import type { RatingSlipStatus } from "@/services/rating-slip/dtos";
import type { GameType, TableStatus } from "@/services/table-context/dtos";

// === Main BFF Response DTO ===

/**
 * Aggregated modal data response.
 * Single-fetch payload for rating slip modal display.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF aggregation response
export interface RatingSlipModalDTO {
  /** Rating slip details */
  slip: SlipSectionDTO;

  /** Player identity (null for ghost visits) */
  player: PlayerSectionDTO | null;

  /** Loyalty balance and suggestion (null if no loyalty record or ghost visit) */
  loyalty: LoyaltySectionDTO | null;

  /** Financial summary for the visit */
  financial: FinancialSectionDTO;

  /** Available tables for move player feature */
  tables: TableOptionDTO[];
}

// === Section DTOs ===

/**
 * Rating slip section of modal data.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF section
export interface SlipSectionDTO {
  /** Rating slip ID */
  id: string;

  /** Associated visit ID */
  visitId: string;

  /** Gaming table ID */
  tableId: string;

  /** Table label for display */
  tableLabel: string;

  /** Table game type */
  tableType: GameType;

  /** Seat position at table */
  seatNumber: string | null;

  /** Current average bet amount */
  averageBet: number;

  /** Session start timestamp (ISO 8601) */
  startTime: string;

  /** Session end timestamp (null if open) */
  endTime: string | null;

  /** Current slip status */
  status: RatingSlipStatus;

  /** Gaming day (YYYY-MM-DD) */
  gamingDay: string;

  /** Active play duration in seconds (excludes paused time) */
  durationSeconds: number;
}

/**
 * Player section of modal data.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF section
export interface PlayerSectionDTO {
  /** Player ID */
  id: string;

  /** Player first name */
  firstName: string;

  /** Player last name */
  lastName: string;

  /** Player card number (nullable) */
  cardNumber: string | null;
}

/**
 * Loyalty section of modal data.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF section
export interface LoyaltySectionDTO {
  /** Current points balance */
  currentBalance: number;

  /** Player tier (bronze, silver, gold, etc.) */
  tier: string | null;

  /** Session reward suggestion (only for open slips) */
  suggestion: LoyaltySuggestionDTO | null;
}

/**
 * Loyalty suggestion for active session.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF section
export interface LoyaltySuggestionDTO {
  /** Estimated points based on current session */
  suggestedPoints: number;

  /** Estimated theoretical win (cents) */
  suggestedTheo: number;

  /** Policy version used for calculation */
  policyVersion: string;
}

/**
 * Financial section of modal data.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF section
export interface FinancialSectionDTO {
  /** Total cash-in amount (cents) */
  totalCashIn: number;

  /** Total chips-out amount (cents) */
  totalChipsOut: number;

  /** Net position (totalCashIn - totalChipsOut) */
  netPosition: number;
}

/**
 * Table option for move player feature.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- BFF section
export interface TableOptionDTO {
  /** Table ID */
  id: string;

  /** Table label for display */
  label: string;

  /** Game type */
  type: GameType;

  /** Table status */
  status: TableStatus;

  /** List of occupied seat numbers */
  occupiedSeats: string[];
}

// === Route Params ===

/**
 * Route params for modal-data endpoint.
 */
export interface ModalDataRouteParams {
  /** Rating slip ID */
  id: string;
}

// === Move Player DTOs (WS5) ===

/**
 * Input for moving a player to a different table/seat.
 */

export interface MovePlayerInput {
  /** Target table UUID */
  destinationTableId: string;
  /** Target seat number (optional, null for unseated) */
  destinationSeatNumber?: string | null;
  /** Optional: final average bet for the current slip being closed */
  averageBet?: number;
}

/**
 * Response from move player operation.
 */

export interface MovePlayerResponse {
  /** UUID of the newly created slip at the destination */
  newSlipId: string;
  /** UUID of the closed slip (original) */
  closedSlipId: string;
}

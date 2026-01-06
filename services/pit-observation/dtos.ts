/**
 * Pit Cash Observation Service - DTOs
 *
 * Data Transfer Objects for pit cash observations (walk-with / chips taken).
 * These are operational telemetry artifacts, NOT financial settlements.
 *
 * @see PRD-OPS-CASH-OBS-001
 * @see DTO_CANONICAL_STANDARD.md §3.1 (Pattern A - Contract-First)
 */

import type { Database } from "@/types/database.types";

// === Database Row Type ===

type PitCashObservationRow =
  Database["public"]["Tables"]["pit_cash_observation"]["Row"];

// === Input DTOs ===

/**
 * Input for creating a pit cash observation.
 * Uses camelCase for client-side consistency.
 */
export type CreatePitCashObservationInput = {
  /** Visit ID (required) - observation is visit-scoped */
  visitId: string;
  /** Amount in dollars (required, must be > 0) */
  amount: number;
  /** Rating slip ID (optional) - convenience link */
  ratingSlipId?: string;
  /** Amount kind: 'estimate' (default) or 'cage_confirmed' */
  amountKind?: Database["public"]["Enums"]["observation_amount_kind"];
  /** Source: 'walk_with' (default), 'phone_confirmed', or 'observed' */
  source?: Database["public"]["Enums"]["observation_source"];
  /** Timestamp of observation (optional, defaults to now) */
  observedAt?: string;
  /** Optional note */
  note?: string;
  /** Idempotency key for deduplication (optional) */
  idempotencyKey?: string;
};

// === Output DTOs ===

/**
 * CamelCase DTO for pit cash observation.
 * Maps from snake_case database row to client-friendly format.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First camelCase DTO per PRD-OPS-CASH-OBS-001
export type PitCashObservationDTO = {
  id: PitCashObservationRow["id"];
  casinoId: PitCashObservationRow["casino_id"];
  gamingDay: PitCashObservationRow["gaming_day"];
  playerId: PitCashObservationRow["player_id"];
  visitId: PitCashObservationRow["visit_id"];
  ratingSlipId: PitCashObservationRow["rating_slip_id"];
  direction: PitCashObservationRow["direction"];
  amount: PitCashObservationRow["amount"];
  amountKind: PitCashObservationRow["amount_kind"];
  source: PitCashObservationRow["source"];
  observedAt: PitCashObservationRow["observed_at"];
  createdByStaffId: PitCashObservationRow["created_by_staff_id"];
  note: PitCashObservationRow["note"];
  idempotencyKey: PitCashObservationRow["idempotency_key"];
  createdAt: PitCashObservationRow["created_at"];
};

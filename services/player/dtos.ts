/**
 * PlayerService DTOs
 *
 * Pattern B (Canonical CRUD): DTOs derived via Pick/Omit from Database types.
 * No manual interfaces except for computed/aggregated response types.
 *
 * @see PRD-003 Player & Visit Management
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §814-888
 */

import type { Database } from "@/types/database.types";

// === Base Row Types (for Pick/Omit derivation) ===

type PlayerRow = Database["public"]["Tables"]["player"]["Row"];
type PlayerInsert = Database["public"]["Tables"]["player"]["Insert"];
type PlayerCasinoRow = Database["public"]["Tables"]["player_casino"]["Row"];

// === Player DTOs ===

/** Public player profile */
export type PlayerDTO = Pick<
  PlayerRow,
  "id" | "first_name" | "last_name" | "birth_date" | "created_at"
>;

/** Player creation input */
export type CreatePlayerDTO = Pick<
  PlayerInsert,
  "first_name" | "last_name" | "birth_date"
>;

/**
 * Player creation with RLS context (ADR-015 Pattern A).
 * Used when calling the rpc_create_player SECURITY DEFINER function.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input, combines table-derived type with RLS context
export type CreatePlayerWithContextDTO = CreatePlayerDTO & {
  /** Casino ID from RLS context */
  casino_id: string;
  /** Actor (staff) ID from RLS context */
  actor_id: string;
};

/** Player update input (all fields optional) */
export type UpdatePlayerDTO = Partial<
  Pick<PlayerInsert, "first_name" | "last_name" | "birth_date">
>;

// === Player Enrollment DTOs ===

/** Player enrollment status in a casino */
export type PlayerEnrollmentDTO = Pick<
  PlayerCasinoRow,
  "player_id" | "casino_id" | "status" | "enrolled_at"
>;

/**
 * Enrollment creation input (casino_id comes from RLS context).
 * Simple input type - not a table projection, casino_id from RLS context.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC input, not table-derived
export type CreateEnrollmentDTO = {
  player_id: string;
};

// === Player Search DTOs ===

/**
 * Player search result with enrollment status.
 * This is a computed RPC response combining player data with enrollment info.
 */
export interface PlayerSearchResultDTO {
  id: string;
  first_name: string;
  last_name: string;
  /** Computed full name for display */
  full_name: string;
  /** Enrollment status in the querying casino */
  enrollment_status: "enrolled" | "not_enrolled";
}

// === Player Identity DTOs (ADR-022) ===

type PlayerIdentityRow = Database["public"]["Tables"]["player_identity"]["Row"];
type PlayerIdentityInsert =
  Database["public"]["Tables"]["player_identity"]["Insert"];

/** Address structure from ID document */
export interface IdentityAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/**
 * Player identity RPC response with computed camelCase fields for frontend consumption.
 * Combines database row fields with presentation-layer transforms.
 */
export interface PlayerIdentityDTO {
  id: string;
  casino_id: string;
  player_id: string;
  birth_date: string | null;
  gender: string | null;
  eye_color: string | null;
  height: string | null;
  weight: string | null;
  document_number_last4: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  issuing_state: string | null;
  document_type: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string | null;
  /** Camel-cased convenience fields */
  casinoId: string;
  playerId: string;
  birthDate: string | null;
  eyeColor: string | null;
  documentNumberLast4: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  issuingState: string | null;
  documentType: "drivers_license" | "passport" | "state_id" | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string | null;
  /** Structured address from ID document */
  address: IdentityAddress | null;
}

/**
 * Player identity input for upsert operations.
 * Document number is ephemeral - converted to hash + last4.
 */

export interface PlayerIdentityInput {
  /** Full document number (NEVER stored, only hashed) */
  documentNumber?: string;
  /** Date of birth from ID */
  birthDate?: string;
  /** Gender: 'm', 'f', 'x' */
  gender?: "m" | "f" | "x";
  /** Eye color from ID */
  eyeColor?: string;
  /** Height (format: "6-01" for 6'1") */
  height?: string;
  /** Weight */
  weight?: string;
  /** Structured address */
  address?: IdentityAddress;
  /** Issue date */
  issueDate?: string;
  /** Expiration date */
  expirationDate?: string;
  /** Issuing state/province */
  issuingState?: string;
  /** Document type */
  documentType?: "drivers_license" | "passport" | "state_id";
}

// === Filter Types (for query keys and HTTP fetchers) ===

/** Filters for player list/search queries */
export type PlayerListFilters = {
  /** Search query (name) - min 2 chars */
  q?: string;
  /** Filter by enrollment status */
  status?: "active" | "inactive";
  /** Cursor for pagination (created_at timestamp) */
  cursor?: string;
  /** Max results per page */
  limit?: number;
};

/** Filters for enrollment queries */
export type PlayerEnrollmentFilters = {
  /** Filter by enrollment status */
  status?: "active" | "inactive";
};

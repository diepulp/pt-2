/**
 * PlayerTimeline Service Mappers
 *
 * Maps RPC results to DTOs with metadata validation.
 * Ensures type safety for discriminated union metadata.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS2-B
 */

import type { Json } from "@/types/database.types";

import type {
  ComplianceEventMetadata,
  FinancialEventMetadata,
  InteractionEventDTO,
  InteractionEventMetadata,
  InteractionEventType,
  LoyaltyEventMetadata,
  NoteEventMetadata,
  PromoEventMetadata,
  RatingEventMetadata,
  RpcTimelineRow,
  TagEventMetadata,
  TimelineResponse,
  VisitEventMetadata,
} from "./dtos";

// === Type Guards ===

/**
 * Type guard for JSON object (non-null, non-array object).
 * Used to safely convert RPC Json metadata to Record<string, unknown>.
 */
export function isJsonObject(
  value: Json,
): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Safely converts Json to Record<string, unknown>.
 * Returns empty object if input is null, primitive, or array.
 */
export function toMetadataRecord(json: Json): Record<string, unknown> {
  if (isJsonObject(json)) {
    return json;
  }
  return {};
}

// === Metadata Validation ===

/**
 * Event types that use VisitEventMetadata.
 */
const VISIT_EVENT_TYPES: InteractionEventType[] = [
  "visit_start",
  "visit_end",
  "visit_resume",
];

/**
 * Event types that use RatingEventMetadata.
 */
const RATING_EVENT_TYPES: InteractionEventType[] = [
  "rating_start",
  "rating_pause",
  "rating_resume",
  "rating_close",
];

/**
 * Event types that use FinancialEventMetadata.
 */
const FINANCIAL_EVENT_TYPES: InteractionEventType[] = [
  "cash_in",
  "cash_out",
  "cash_observation",
  "financial_adjustment",
];

/**
 * Event types that use LoyaltyEventMetadata.
 */
const LOYALTY_EVENT_TYPES: InteractionEventType[] = [
  "points_earned",
  "points_redeemed",
  "points_adjusted",
];

/**
 * Event types that use PromoEventMetadata.
 */
const PROMO_EVENT_TYPES: InteractionEventType[] = [
  "promo_issued",
  "promo_redeemed",
];

/**
 * Event types that use ComplianceEventMetadata.
 */
const COMPLIANCE_EVENT_TYPES: InteractionEventType[] = ["mtl_recorded"];

/**
 * Event types that use IdentityEventMetadata.
 */
const IDENTITY_EVENT_TYPES: InteractionEventType[] = [
  "player_enrolled",
  "identity_verified",
];

/**
 * Validates and coerces metadata to the correct type based on event_type.
 * Falls back to raw metadata if validation fails (defensive).
 */
function validateMetadata(
  eventType: InteractionEventType,
  raw: Record<string, unknown>,
): InteractionEventMetadata {
  // Visit events
  if (VISIT_EVENT_TYPES.includes(eventType)) {
    return {
      visitKind:
        (raw.visitKind as VisitEventMetadata["visitKind"]) ??
        "gaming_identified_rated",
      gamingDay: (raw.gamingDay as string) ?? "",
    } satisfies VisitEventMetadata;
  }

  // Rating events
  if (RATING_EVENT_TYPES.includes(eventType)) {
    return {
      tableId: (raw.tableId as string) ?? "",
      tableName: (raw.tableName as string) ?? "",
      seatNumber: (raw.seatNumber as string | null) ?? null,
      previousSlipId: raw.previousSlipId as string | undefined,
      durationSeconds: raw.durationSeconds as number | undefined,
      averageBet: raw.averageBet as number | undefined,
    } satisfies RatingEventMetadata;
  }

  // Financial events
  if (FINANCIAL_EVENT_TYPES.includes(eventType)) {
    return {
      direction: (raw.direction as FinancialEventMetadata["direction"]) ?? "in",
      source: (raw.source as FinancialEventMetadata["source"]) ?? "pit",
      tenderType: (raw.tenderType as string) ?? "",
      visitId: (raw.visitId as string) ?? "",
      note: raw.note as string | undefined,
    } satisfies FinancialEventMetadata;
  }

  // Loyalty events
  if (LOYALTY_EVENT_TYPES.includes(eventType)) {
    return {
      reason: (raw.reason as string) ?? "",
      ratingSlipId: raw.ratingSlipId as string | undefined,
      visitId: raw.visitId as string | undefined,
      note: raw.note as string | undefined,
    } satisfies LoyaltyEventMetadata;
  }

  // Promo events
  if (PROMO_EVENT_TYPES.includes(eventType)) {
    return {
      promoType: (raw.promoType as string) ?? "",
      promoCode: raw.promoCode as string | undefined,
      amount: raw.amount as number | undefined,
    } satisfies PromoEventMetadata;
  }

  // Compliance events
  if (COMPLIANCE_EVENT_TYPES.includes(eventType)) {
    return {
      direction:
        (raw.direction as ComplianceEventMetadata["direction"]) ?? "in",
      txnType: (raw.txnType as string) ?? "",
      source: (raw.source as string) ?? "",
      gamingDay: (raw.gamingDay as string) ?? "",
    } satisfies ComplianceEventMetadata;
  }

  // Identity events
  if (IDENTITY_EVENT_TYPES.includes(eventType)) {
    return {
      documentType: raw.documentType as
        | "drivers_license"
        | "passport"
        | "state_id"
        | undefined,
      issuingState: raw.issuingState as string | undefined,
    };
  }

  // Note events
  if (eventType === "note_added") {
    return {
      content: (raw.content as string) ?? "",
      visibility: (raw.visibility as NoteEventMetadata["visibility"]) ?? "team",
    } satisfies NoteEventMetadata;
  }

  // Tag events
  if (eventType === "tag_applied" || eventType === "tag_removed") {
    return {
      tagName: (raw.tagName as string) ?? "",
      tagCategory:
        (raw.tagCategory as TagEventMetadata["tagCategory"]) ?? "custom",
    } satisfies TagEventMetadata;
  }

  // Fallback: return minimal valid metadata (defensive)
  // This case handles unknown event types that shouldn't occur in production
  return {
    visitKind: "gaming_identified_rated",
    gamingDay: (raw.gamingDay as string) ?? "",
  } satisfies VisitEventMetadata;
}

// === Row to DTO Mappers ===

/**
 * Maps a single RPC row to an InteractionEventDTO.
 */
export function mapRpcRowToEvent(row: RpcTimelineRow): InteractionEventDTO {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    summary: row.summary,
    amount: row.amount,
    metadata: validateMetadata(row.event_type, row.metadata),
  };
}

/**
 * Maps RPC result rows to a TimelineResponse.
 * Extracts pagination metadata from the last row.
 */
export function mapRpcResultToTimelineResponse(
  rows: RpcTimelineRow[],
): TimelineResponse {
  if (rows.length === 0) {
    return {
      events: [],
      nextCursorAt: null,
      nextCursorId: null,
      hasMore: false,
    };
  }

  // Extract pagination from last row (all rows have same pagination fields)
  const lastRow = rows[rows.length - 1];

  return {
    events: rows.map(mapRpcRowToEvent),
    nextCursorAt: lastRow.next_cursor_at,
    nextCursorId: lastRow.next_cursor_id,
    hasMore: lastRow.has_more,
  };
}

// === Event Type Helpers ===

/**
 * Maps event type to source category for UI grouping.
 */
export type SourceCategory =
  | "session"
  | "gaming"
  | "financial"
  | "loyalty"
  | "staff"
  | "compliance"
  | "identity";

/**
 * Returns the source category for an event type.
 */
export function getSourceCategory(
  eventType: InteractionEventType,
): SourceCategory {
  if (VISIT_EVENT_TYPES.includes(eventType)) return "session";
  if (RATING_EVENT_TYPES.includes(eventType)) return "gaming";
  if (FINANCIAL_EVENT_TYPES.includes(eventType)) return "financial";
  if (
    LOYALTY_EVENT_TYPES.includes(eventType) ||
    PROMO_EVENT_TYPES.includes(eventType)
  )
    return "loyalty";
  if (
    eventType === "note_added" ||
    eventType === "tag_applied" ||
    eventType === "tag_removed"
  )
    return "staff";
  if (COMPLIANCE_EVENT_TYPES.includes(eventType)) return "compliance";
  if (IDENTITY_EVENT_TYPES.includes(eventType)) return "identity";
  return "session"; // fallback
}

/**
 * Returns display label for an event type.
 */
export function getEventTypeLabel(eventType: InteractionEventType): string {
  const labels: Record<InteractionEventType, string> = {
    visit_start: "Check-in",
    visit_end: "Check-out",
    visit_resume: "Visit Resumed",
    rating_start: "Started Play",
    rating_pause: "Paused Play",
    rating_resume: "Resumed Play",
    rating_close: "Ended Play",
    cash_in: "Buy-in",
    cash_out: "Cash-out",
    cash_observation: "Cash Observation",
    financial_adjustment: "Adjustment",
    points_earned: "Points Earned",
    points_redeemed: "Points Redeemed",
    points_adjusted: "Points Adjusted",
    promo_issued: "Promo Issued",
    promo_redeemed: "Promo Redeemed",
    note_added: "Note Added",
    tag_applied: "Tag Applied",
    tag_removed: "Tag Removed",
    mtl_recorded: "MTL Entry",
    player_enrolled: "Enrolled",
    identity_verified: "ID Verified",
  };
  return labels[eventType] ?? eventType;
}

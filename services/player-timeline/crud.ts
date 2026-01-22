/**
 * PlayerTimeline Service CRUD Operations
 *
 * Database operations for the Player 360 timeline.
 * Uses rpc_get_player_timeline for unified event retrieval.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS2-C
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  InteractionEventType,
  RpcTimelineRow,
  TimelineQuery,
  TimelineResponse,
} from "./dtos";
import { mapRpcResultToTimelineResponse, toMetadataRecord } from "./mappers";

// === Error Mapping ===

/**
 * Maps RPC errors to domain errors.
 */
function mapRpcError(error: { code?: string; message: string }): DomainError {
  // P0001 = Custom PL/pgSQL exception
  if (error.code === "P0001") {
    if (error.message.includes("Casino context")) {
      return new DomainError(
        "UNAUTHORIZED",
        "Casino context not established. Ensure you are authenticated.",
      );
    }
    if (error.message.includes("Cursor must include")) {
      return new DomainError(
        "VALIDATION_ERROR",
        "Invalid pagination cursor. Provide both cursorAt and cursorId, or neither.",
      );
    }
  }

  return new DomainError("INTERNAL_ERROR", error.message, { details: error });
}

// === Read Operations ===

/**
 * Get player interaction timeline with keyset pagination.
 *
 * CRITICAL: Casino context is derived from RLS session (ADR-024).
 * No casinoId parameter is accepted.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - Timeline query parameters
 * @returns TimelineResponse with events and pagination metadata
 *
 * @example
 * ```ts
 * const response = await getPlayerTimeline(supabase, {
 *   playerId: 'player-uuid',
 *   eventTypes: ['visit_start', 'cash_in'],
 *   limit: 20,
 * });
 *
 * // Next page
 * const nextPage = await getPlayerTimeline(supabase, {
 *   playerId: 'player-uuid',
 *   cursorAt: response.nextCursorAt,
 *   cursorId: response.nextCursorId,
 * });
 * ```
 */
export async function getPlayerTimeline(
  supabase: SupabaseClient<Database>,
  query: TimelineQuery,
): Promise<TimelineResponse> {
  const { data, error } = await supabase.rpc("rpc_get_player_timeline", {
    p_player_id: query.playerId,
    p_event_types: query.eventTypes,
    p_from_date: query.fromDate,
    p_to_date: query.toDate,
    p_limit: query.limit ?? 50,
    p_cursor_at: query.cursorAt,
    p_cursor_id: query.cursorId,
  });

  if (error) {
    throw mapRpcError(error);
  }

  // Type from database.types.ts: Database['public']['Functions']['rpc_get_player_timeline']['Returns']
  type RpcRow =
    Database["public"]["Functions"]["rpc_get_player_timeline"]["Returns"][number];

  // Map RPC result to RpcTimelineRow
  // Note: Generated types don't capture nullability for RPC returns, so we handle it
  const rpcRows = data ?? [];
  const rows: RpcTimelineRow[] = rpcRows.map((row: RpcRow) => ({
    event_id: row.event_id,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    actor_id: row.actor_id || null,
    actor_name: row.actor_name || null,
    source_table: row.source_table,
    source_id: row.source_id,
    summary: row.summary,
    amount: row.amount || null,
    // metadata from DB is Json type; convert to Record<string, unknown> safely
    metadata: toMetadataRecord(row.metadata),
    has_more: row.has_more,
    next_cursor_at: row.next_cursor_at || null,
    next_cursor_id: row.next_cursor_id || null,
  }));

  return mapRpcResultToTimelineResponse(rows);
}

/**
 * Fetch function for HTTP/API layer.
 * Wrapper around getPlayerTimeline for use in route handlers.
 */
export async function fetchPlayerTimeline(
  supabase: SupabaseClient<Database>,
  playerId: string,
  options: {
    eventTypes?: InteractionEventType[];
    fromDate?: string;
    toDate?: string;
    limit?: number;
    cursorAt?: string;
    cursorId?: string;
  } = {},
): Promise<TimelineResponse> {
  return getPlayerTimeline(supabase, {
    playerId,
    ...options,
  });
}

/**
 * RatingSlipModal BFF RPC Service
 *
 * Server-side RPC wrapper for the rpc_get_rating_slip_modal_data PostgreSQL function.
 * Provides type-safe interface to the BFF RPC that reduces modal-data endpoint
 * latency from ~600ms to ~150ms.
 *
 * @see PRD-018 Rating Slip Modal BFF RPC Implementation
 * @see docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  MovePlayerInput,
  MovePlayerResponse,
  RatingSlipModalDTO,
  ResolveSlipContextDTO,
} from './dtos';

/**
 * Raw RPC response shape from PostgreSQL.
 * Maps to RatingSlipModalDTO structure but with raw JSON types.
 */
interface RpcModalDataResponse {
  slip: {
    id: string;
    visitId: string;
    casinoId: string;
    tableId: string;
    tableLabel: string;
    tableType: string;
    seatNumber: string | null;
    averageBet: number;
    startTime: string;
    endTime: string | null;
    status: string;
    gamingDay: string;
    durationSeconds: number;
  };
  player: {
    id: string;
    firstName: string;
    lastName: string;
    cardNumber: string | null;
  } | null;
  loyalty: {
    currentBalance: number;
    tier: string | null;
    suggestion: {
      suggestedPoints: number;
      suggestedTheo: number;
      policyVersion: string;
    } | null;
  } | null;
  financial: {
    totalCashIn: number;
    totalChipsOut: number;
    netPosition: number;
  };
  tables: Array<{
    id: string;
    label: string;
    type: string;
    status: string;
    occupiedSeats: string[];
    seatsAvailable: number;
  }>;
}

/**
 * Type guard for RPC response validation.
 * Validates the shape of the JSONB response from the PostgreSQL RPC.
 */
function isValidRpcModalDataResponse(
  data: unknown,
): data is RpcModalDataResponse {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // Validate slip section (required)
  if (!obj.slip || typeof obj.slip !== 'object') return false;
  const slip = obj.slip as Record<string, unknown>;
  if (typeof slip.id !== 'string') return false;
  if (typeof slip.visitId !== 'string') return false;
  if (typeof slip.casinoId !== 'string') return false;
  if (typeof slip.tableId !== 'string') return false;
  if (typeof slip.tableLabel !== 'string') return false;
  if (typeof slip.tableType !== 'string') return false;
  if (typeof slip.status !== 'string') return false;

  // Validate financial section (required)
  if (!obj.financial || typeof obj.financial !== 'object') return false;
  const financial = obj.financial as Record<string, unknown>;
  if (typeof financial.totalCashIn !== 'number') return false;
  if (typeof financial.totalChipsOut !== 'number') return false;
  if (typeof financial.netPosition !== 'number') return false;

  // Validate tables section (required, array)
  if (!Array.isArray(obj.tables)) return false;

  // player and loyalty are nullable, so we just check they're objects if present
  if (obj.player !== null && typeof obj.player !== 'object') return false;
  if (obj.loyalty !== null && typeof obj.loyalty !== 'object') return false;

  return true;
}

/**
 * Fetches rating slip modal data via the BFF RPC function.
 *
 * This function consolidates 6+ database queries into a single round trip,
 * reducing endpoint latency by ~75%.
 *
 * Security:
 * - Uses SECURITY INVOKER (inherits caller's RLS context)
 * - Explicit casino_id validation (defense-in-depth)
 * - Cross-casino queries throw explicit error (not silent filter)
 *
 * @param supabase - Authenticated Supabase client with RLS context
 * @param slipId - Rating slip UUID
 * @param casinoId - Casino UUID (must match RLS context)
 * @returns RatingSlipModalDTO - Complete modal data
 * @throws DomainError with specific codes:
 *   - RATING_SLIP_NOT_FOUND (404)
 *   - VISIT_NOT_FOUND (404)
 *   - TABLE_NOT_FOUND (404)
 *   - CASINO_MISMATCH (403)
 *   - UNAUTHORIZED (401)
 *
 * @example
 * ```ts
 * const modalData = await getModalDataViaRPC(supabase, slipId, casinoId);
 * // Single round trip, ~150ms vs ~600ms multi-query
 * ```
 */
export async function getModalDataViaRPC(
  supabase: SupabaseClient<Database>,
  slipId: string,
  casinoId: string,
): Promise<RatingSlipModalDTO> {
  const { data, error } = await supabase.rpc('rpc_get_rating_slip_modal_data', {
    p_slip_id: slipId,
    p_casino_id: casinoId,
  });

  if (error) {
    // Parse PostgreSQL error message for domain-specific errors
    const message = error.message ?? '';

    if (message.includes('RATING_SLIP_NOT_FOUND')) {
      throw new DomainError('RATING_SLIP_NOT_FOUND', 'Rating slip not found', {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes('VISIT_NOT_FOUND')) {
      throw new DomainError('VISIT_NOT_FOUND', 'Associated visit not found', {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes('TABLE_NOT_FOUND')) {
      throw new DomainError('TABLE_NOT_FOUND', 'Gaming table not found', {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes('CASINO_MISMATCH')) {
      throw new DomainError(
        'FORBIDDEN',
        'Casino context mismatch - access denied',
        { httpStatus: 403, details: { slipId, casinoId } },
      );
    }

    if (message.includes('UNAUTHORIZED')) {
      throw new DomainError('UNAUTHORIZED', 'RLS context not set', {
        httpStatus: 401,
      });
    }

    // Generic database error
    throw new DomainError(
      'INTERNAL_ERROR',
      `RPC call failed: ${error.message}`,
      { httpStatus: 500, details: { code: error.code, hint: error.hint } },
    );
  }

  if (!data) {
    throw new DomainError(
      'RATING_SLIP_NOT_FOUND',
      'No data returned from RPC',
      {
        httpStatus: 404,
        details: { slipId },
      },
    );
  }

  // Validate RPC response shape using type guard
  if (!isValidRpcModalDataResponse(data)) {
    throw new DomainError('INTERNAL_ERROR', 'Invalid RPC response structure', {
      httpStatus: 500,
      details: { slipId, received: typeof data },
    });
  }

  // Map to RatingSlipModalDTO with proper type casting
  // Type assertions below are safe because we validated with type guard above
  const modalData: RatingSlipModalDTO = {
    slip: {
      id: data.slip.id,
      visitId: data.slip.visitId,
      casinoId: data.slip.casinoId,
      tableId: data.slip.tableId,
      tableLabel: data.slip.tableLabel,
      tableType: data.slip.tableType as RatingSlipModalDTO['slip']['tableType'],
      seatNumber: data.slip.seatNumber,
      averageBet: data.slip.averageBet,
      startTime: data.slip.startTime,
      endTime: data.slip.endTime,
      status: data.slip.status as RatingSlipModalDTO['slip']['status'],
      gamingDay: data.slip.gamingDay,
      durationSeconds: data.slip.durationSeconds,
    },
    player: data.player
      ? {
          id: data.player.id,
          firstName: data.player.firstName,
          lastName: data.player.lastName,
          cardNumber: data.player.cardNumber,
        }
      : null,
    loyalty: data.loyalty
      ? {
          currentBalance: data.loyalty.currentBalance,
          tier: data.loyalty.tier,
          suggestion: data.loyalty.suggestion
            ? {
                suggestedPoints: data.loyalty.suggestion.suggestedPoints,
                suggestedTheo: data.loyalty.suggestion.suggestedTheo,
                policyVersion: data.loyalty.suggestion.policyVersion,
              }
            : null,
        }
      : null,
    financial: {
      totalCashIn: data.financial.totalCashIn,
      totalChipsOut: data.financial.totalChipsOut,
      netPosition: data.financial.netPosition,
    },
    tables: data.tables.map((t) => ({
      id: t.id,
      label: t.label,
      type: t.type as RatingSlipModalDTO['tables'][0]['type'],
      status: t.status as RatingSlipModalDTO['tables'][0]['status'],
      occupiedSeats: t.occupiedSeats,
      seatsAvailable: t.seatsAvailable,
    })),
  };

  return modalData;
}

// === Move Player RPC (PRD-020) ===

/**
 * Raw RPC response shape from rpc_move_player.
 * Maps to MovePlayerResponse structure.
 */
interface RpcMovePlayerResponse {
  closedSlipId: string;
  newSlipId: string;
  moveGroupId: string;
  accumulatedSeconds: number;
  sourceTableId: string;
  sourceTableSeats: string[];
  destinationTableSeats: string[];
  newSlip: {
    id: string;
    tableId: string;
    seatNumber: string | null;
    status: string;
    startTime: string;
  };
}

/**
 * Type guard for move player RPC response validation.
 */
function isValidRpcMovePlayerResponse(
  data: unknown,
): data is RpcMovePlayerResponse {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.closedSlipId !== 'string') return false;
  if (typeof obj.newSlipId !== 'string') return false;
  if (typeof obj.moveGroupId !== 'string') return false;
  if (typeof obj.accumulatedSeconds !== 'number') return false;
  if (typeof obj.sourceTableId !== 'string') return false;
  if (!Array.isArray(obj.sourceTableSeats)) return false;
  if (!Array.isArray(obj.destinationTableSeats)) return false;
  if (!obj.newSlip || typeof obj.newSlip !== 'object') return false;

  const newSlip = obj.newSlip as Record<string, unknown>;
  if (typeof newSlip.id !== 'string') return false;
  if (typeof newSlip.tableId !== 'string') return false;
  if (typeof newSlip.status !== 'string') return false;
  if (typeof newSlip.startTime !== 'string') return false;

  return true;
}

/**
 * Moves a player to a different table/seat via the consolidated RPC.
 *
 * PRD-020: Reduces 4 DB round-trips to 1, latency from ~700ms to ~150ms.
 * Single transaction with FOR UPDATE locking for safety.
 *
 * Security:
 * - Uses SECURITY DEFINER with self-injected RLS context (ADR-015)
 * - Casino scope validated within RPC
 * - Seat availability checked atomically
 *
 * @param supabase - Authenticated Supabase client
 * @param casinoId - Casino UUID
 * @param slipId - Rating slip UUID to move
 * @param input - Move destination details
 * @returns MovePlayerResponse - Enhanced response with seat arrays
 * @throws DomainError with specific codes:
 *   - RATING_SLIP_NOT_FOUND (404)
 *   - RATING_SLIP_ALREADY_CLOSED (409)
 *   - SEAT_OCCUPIED (400)
 *
 * @example
 * ```ts
 * const result = await movePlayerViaRPC(supabase, casinoId, slipId, {
 *   destinationTableId: 'table-uuid',
 *   destinationSeatNumber: '3',
 *   averageBet: 25,
 * });
 * // Single round trip, ~150ms
 * // result.sourceTableSeats and result.destinationTableSeats for cache update
 * ```
 */
export async function movePlayerViaRPC(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  slipId: string,
  input: MovePlayerInput,
): Promise<MovePlayerResponse> {
  // Call the consolidated RPC
  const { data, error } = await supabase.rpc('rpc_move_player', {
    p_casino_id: casinoId,
    p_slip_id: slipId,
    p_new_table_id: input.destinationTableId,
    p_new_seat_number: input.destinationSeatNumber ?? undefined,
    p_average_bet: input.averageBet ?? undefined,
  });

  if (error) {
    const message = error.message ?? '';

    if (message.includes('RATING_SLIP_NOT_FOUND')) {
      throw new DomainError('RATING_SLIP_NOT_FOUND', 'Rating slip not found', {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes('RATING_SLIP_ALREADY_CLOSED')) {
      throw new DomainError(
        'RATING_SLIP_ALREADY_CLOSED',
        'Cannot move a closed rating slip',
        { httpStatus: 409, details: { slipId } },
      );
    }

    if (message.includes('SEAT_OCCUPIED')) {
      throw new DomainError(
        'SEAT_OCCUPIED',
        `Seat ${input.destinationSeatNumber} is already occupied at the destination table`,
        { httpStatus: 400, details: { seat: input.destinationSeatNumber } },
      );
    }

    // Generic database error
    throw new DomainError(
      'INTERNAL_ERROR',
      `Move player RPC failed: ${error.message}`,
      { httpStatus: 500, details: { code: error.code, hint: error.hint } },
    );
  }

  if (!data) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'No data returned from move player RPC',
      { httpStatus: 500, details: { slipId } },
    );
  }

  // Validate RPC response shape
  if (!isValidRpcMovePlayerResponse(data)) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Invalid move player RPC response structure',
      { httpStatus: 500, details: { slipId, received: typeof data } },
    );
  }

  // Map to MovePlayerResponse with proper typing
  const response: MovePlayerResponse = {
    newSlipId: data.newSlipId,
    closedSlipId: data.closedSlipId,
    moveGroupId: data.moveGroupId,
    accumulatedSeconds: data.accumulatedSeconds,
    sourceTableId: data.sourceTableId,
    sourceTableSeats: data.sourceTableSeats,
    destinationTableSeats: data.destinationTableSeats,
    newSlip: {
      id: data.newSlip.id,
      tableId: data.newSlip.tableId,
      seatNumber: data.newSlip.seatNumber,
      status: data.newSlip.status as MovePlayerResponse['newSlip']['status'],
      startTime: data.newSlip.startTime,
    },
  };

  return response;
}

// === Resolve Slip Context RPC (GAP-ADR-026-UI-SHIPPABLE) ===

/**
 * Raw RPC response shape from rpc_resolve_current_slip_context.
 */
interface RpcResolveSlipContextResponse {
  slipIdCurrent: string;
  visitIdCurrent: string;
  gamingDay: string;
  rolledOver: boolean;
  readOnly: boolean;
}

/**
 * Type guard for resolve slip context RPC response.
 */
function isValidResolveSlipContextResponse(
  data: unknown,
): data is RpcResolveSlipContextResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.slipIdCurrent === 'string' &&
    typeof obj.visitIdCurrent === 'string' &&
    typeof obj.gamingDay === 'string' &&
    typeof obj.rolledOver === 'boolean' &&
    typeof obj.readOnly === 'boolean'
  );
}

/**
 * Resolves the current slip context, rolling over to current gaming day if needed.
 *
 * GAP-ADR-026-UI-SHIPPABLE Patch A: Entry gate for rating slip modal.
 * Ensures modal always operates on current gaming day context.
 *
 * @param supabase - Authenticated Supabase client with RLS context
 * @param slipId - Rating slip UUID (may be from stale gaming day)
 * @returns ResolveSlipContextDTO with current slip/visit context
 * @throws DomainError on not found or unauthorized
 *
 * @example
 * ```ts
 * const ctx = await resolveCurrentSlipContext(supabase, slipId);
 * if (ctx.rolledOver) {
 *   toast.info("Session rolled over to today's gaming day.");
 * }
 * if (ctx.readOnly) {
 *   // Disable buy-in controls for ghost visits
 * }
 * ```
 */
export async function resolveCurrentSlipContext(
  supabase: SupabaseClient<Database>,
  slipId: string,
): Promise<ResolveSlipContextDTO> {
  const { data, error } = await supabase.rpc(
    'rpc_resolve_current_slip_context',
    {
      p_slip_id: slipId,
    },
  );

  if (error) {
    const message = error.message ?? '';

    if (message.includes('RATING_SLIP_NOT_FOUND')) {
      throw new DomainError('RATING_SLIP_NOT_FOUND', 'Rating slip not found', {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes('UNAUTHORIZED')) {
      throw new DomainError('UNAUTHORIZED', 'RLS context not set', {
        httpStatus: 401,
      });
    }

    throw new DomainError(
      'INTERNAL_ERROR',
      `Resolve slip context RPC failed: ${error.message}`,
      { httpStatus: 500, details: { code: error.code } },
    );
  }

  if (!data || !isValidResolveSlipContextResponse(data)) {
    throw new DomainError('INTERNAL_ERROR', 'Invalid RPC response structure', {
      httpStatus: 500,
      details: { slipId },
    });
  }

  return {
    slipIdCurrent: data.slipIdCurrent,
    visitIdCurrent: data.visitIdCurrent,
    gamingDay: data.gamingDay,
    rolledOver: data.rolledOver,
    readOnly: data.readOnly,
  };
}

/**
 * Start From Previous Visit Route
 *
 * POST /api/v1/visits/start-from-previous - Continue from a closed session
 *
 * PRD-017: Visit Continuation
 * Creates a new visit linked to a previous closed session via visit_group_id.
 * Validates source visit, creates new visit, and opens first rating slip at destination.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createVisitService } from '@/services/visit';
import { startFromPreviousSchema } from '@/services/visit/schemas';

/**
 * POST /api/v1/visits/start-from-previous
 *
 * Start a new visit from a previous session.
 * Requires Idempotency-Key header.
 * Returns 201 on success.
 *
 * Request Body:
 * - player_id: UUID of the player
 * - source_visit_id: UUID of the closed visit to continue from
 * - destination_table_id: UUID of the destination table
 * - destination_seat_number: Seat number at destination (1-20)
 * - game_settings_override?: Optional game settings override
 *
 * Response:
 * - visit_id: New visit UUID
 * - visit_group_id: Visit group UUID (inherited from source)
 * - active_slip_id: Active rating slip UUID (first segment)
 * - started_at: Visit start timestamp
 *
 * Error Codes:
 * - 400: SOURCE_VISIT_NOT_CLOSED, PLAYER_MISMATCH
 * - 403: FORBIDDEN (cross-casino access)
 * - 404: VISIT_NOT_FOUND (source visit not found)
 * - 409: VISIT_ALREADY_OPEN
 * - 422: TABLE_NOT_AVAILABLE, SEAT_OCCUPIED
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input
    const input = startFromPreviousSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createVisitService(mwCtx.supabase);

        // Call startFromPrevious with casinoId and actorId from RLS context
        const response = await service.startFromPrevious(
          mwCtx.rlsContext!.casinoId,
          mwCtx.rlsContext!.actorId,
          input,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: response,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'visit',
        action: 'start-from-previous',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new visit
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * Player Enrollment Status Route
 *
 * GET /api/v1/players/[playerId]/enrollment - Check enrollment status
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createPlayerService } from "@/services/player/index";
import { playerRouteParamsSchema } from "@/services/player/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * GET /api/v1/players/[playerId]/enrollment
 *
 * Get enrollment status for player in the authenticated user's casino.
 * Returns 404 if not enrolled.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      playerRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerService(mwCtx.supabase);

        const enrollment = await service.getEnrollment(params.playerId);

        if (!enrollment) {
          throw new DomainError(
            "PLAYER_NOT_ENROLLED",
            "Player not enrolled in this casino",
            {
              httpStatus: 404,
              details: { playerId: params.playerId },
            },
          );
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: enrollment,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "player",
        action: "enrollment.get",
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

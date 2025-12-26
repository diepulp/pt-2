/**
 * Player Identity Route
 *
 * POST /api/v1/players/[playerId]/identity - Upsert player identity
 * GET /api/v1/players/[playerId]/identity - Get player identity
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: ADR-022 Player Identity & Enrollment
 *
 * Note: Casino ID is derived from RLS context (staff's casino).
 * Upsert is idempotent - updating identity replaces existing record.
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type { PlayerIdentityInput } from "@/services/player/dtos";
import {
  getIdentityByPlayerId,
  upsertIdentity,
} from "@/services/player/identity";
import { playerRouteParamsSchema } from "@/services/player/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * POST /api/v1/players/[playerId]/identity
 *
 * Upsert player identity in the authenticated user's casino.
 * Requires Idempotency-Key header.
 * Returns 200 on update, 201 on new identity.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      playerRouteParamsSchema,
    );
    const supabase = await createClient();

    // Parse and validate request body
    const body = (await request.json()) as PlayerIdentityInput;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Get staff info for actor_id and casino_id
        const { data: staffData, error: staffError } = await mwCtx.supabase
          .from("staff")
          .select("id, casino_id")
          .limit(1)
          .single();

        if (staffError || !staffData?.casino_id || !staffData.id) {
          throw new DomainError(
            "UNAUTHORIZED",
            "Unable to determine casino context or staff identity",
            {
              httpStatus: 401,
            },
          );
        }

        // Check if identity already exists
        const existingIdentity = await getIdentityByPlayerId(
          mwCtx.supabase,
          params.playerId,
        );

        // Upsert identity using service layer
        const identity = await upsertIdentity(
          mwCtx.supabase,
          staffData.casino_id,
          params.playerId,
          body,
          staffData.id,
        );

        return {
          ok: true as const,
          code: "OK" as const,
          data: identity,
          isNew: !existingIdentity,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "player",
        action: "upsert-identity",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 for new identity, 200 for existing
    const status = (result as { isNew?: boolean }).isNew ? 201 : 200;
    return successResponse(ctx, result.data, "OK", status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * GET /api/v1/players/[playerId]/identity
 *
 * Get player identity in the authenticated user's casino.
 * Returns 404 if identity not found.
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
        const identity = await getIdentityByPlayerId(
          mwCtx.supabase,
          params.playerId,
        );

        if (!identity) {
          throw new DomainError("PLAYER_NOT_FOUND", "Identity not found", {
            httpStatus: 404,
            details: { playerId: params.playerId },
          });
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: identity,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "player",
        action: "get-identity",
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, "OK");
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

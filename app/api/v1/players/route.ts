/**
 * Player List/Create Route
 *
 * GET /api/v1/players - List/search players (paginated)
 * POST /api/v1/players - Create new player
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerSearchResultDTO,
} from "@/services/player/dtos";
import { createPlayerService } from "@/services/player/index";
import {
  createPlayerSchema,
  playerListQuerySchema,
} from "@/services/player/schemas";

/**
 * GET /api/v1/players
 *
 * List/search players with cursor-based pagination.
 * Query params: q (search), status, cursor, limit
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, playerListQuerySchema);

    // Separate handlers for search vs list to maintain type safety
    if (query.q) {
      const result = await withServerAction(
        supabase,
        async (mwCtx) => {
          const service = createPlayerService(mwCtx.supabase);
          const items = await service.search(query.q!, query.limit);
          return {
            ok: true as const,
            code: "OK" as const,
            data: {
              items: items as PlayerSearchResultDTO[],
              cursor: null as string | null,
            },
            requestId: mwCtx.correlationId,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
        },
        {
          domain: "player",
          action: "search",
          correlationId: ctx.requestId,
        },
      );

      if (!result.ok) {
        return errorResponse(ctx, result);
      }
      return successResponse(ctx, result.data);
    }

    // List with pagination
    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerService(mwCtx.supabase);
        const { items, cursor } = await service.list({
          status: query.status,
          cursor: query.cursor,
          limit: query.limit,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: {
            items: items as PlayerDTO[],
            cursor,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "player",
        action: "list",
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

/**
 * POST /api/v1/players
 *
 * Create a new player.
 * Requires Idempotency-Key header.
 * Returns 201 on success.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<CreatePlayerDTO>(request);

    // Validate input
    const input = createPlayerSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerService(mwCtx.supabase);

        const player = await service.create(input);

        return {
          ok: true as const,
          code: "OK" as const,
          data: player,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "player",
        action: "create",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, "OK", 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

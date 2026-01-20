/**
 * Table Settings Route
 *
 * GET /api/v1/tables/[tableId]/settings - Get table betting limits
 * PATCH /api/v1/tables/[tableId]/settings - Update table betting limits
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-012 Table Betting Limits Management
 *
 * @see services/table-context/table-settings.ts for service layer
 * @see services/table-context/dtos.ts for DTOs
 * @see services/table-context/schemas.ts for validation schemas
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import {
  tableRouteParamsSchema,
  updateTableLimitsSchema,
} from '@/services/table-context/schemas';
import {
  getTableSettings,
  updateTableLimits,
} from '@/services/table-context/table-settings';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ tableId: string }> };

/**
 * GET /api/v1/tables/[tableId]/settings
 *
 * Fetch table betting limits (min_bet, max_bet).
 * Auto-creates settings from game_settings defaults if missing.
 *
 * @returns TableSettingsDTO with current betting limits
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      tableRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const settings = await getTableSettings(
          mwCtx.supabase,
          params.tableId,
          mwCtx.rlsContext!.casinoId,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: settings,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'get-table-settings',
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
 * PATCH /api/v1/tables/[tableId]/settings
 *
 * Update table betting limits (min_bet, max_bet).
 * Requires Idempotency-Key header for write safety.
 *
 * @param request Body: { min_bet: number, max_bet: number }
 * @returns Updated TableSettingsDTO
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      tableRouteParamsSchema,
    );
    const body = await readJsonBody(request);

    // Validate request body against schema
    const validated = updateTableLimitsSchema.parse(body);

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const settings = await updateTableLimits(
          mwCtx.supabase,
          params.tableId,
          mwCtx.rlsContext!.casinoId,
          {
            min_bet: validated.min_bet,
            max_bet: validated.max_bet,
          },
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: settings,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'update-table-limits',
        requireIdempotency: true,
        idempotencyKey,
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

/**
 * Floor Layout Versions Route
 *
 * GET /api/v1/floor-layouts/[layoutId]/versions - List versions for a layout
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-004 Floor Layout Service
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createFloorLayoutService } from '@/services/floor-layout';
import {
  floorLayoutVersionQuerySchema,
  layoutIdParamSchema,
} from '@/services/floor-layout/schemas';

/**
 * GET /api/v1/floor-layouts/[layoutId]/versions
 *
 * List all versions for a specific floor layout.
 * Query params: status?, include_slots?
 *
 * RLS scopes results to casino automatically.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ layoutId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const { layoutId } = parseParams(await context.params, layoutIdParamSchema);
    const query = parseQuery(request, floorLayoutVersionQuerySchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createFloorLayoutService(mwCtx.supabase);

        const { items } = await service.listVersions({
          layout_id: layoutId,
          status: query.status,
          include_slots: query.include_slots,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            items,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'floor-layout',
        action: 'list-versions',
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

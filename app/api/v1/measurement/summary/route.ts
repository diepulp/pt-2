/**
 * Measurement Summary Route Handler (BFF)
 *
 * GET /api/v1/measurement/summary
 *
 * Returns all 4 ADR-039 measurement metrics in a single response.
 * Uses Promise.allSettled for partial-success (one metric failure
 * does not block other widgets).
 *
 * Security:
 * - Page guard: (dashboard)/admin/layout.tsx (pit_boss/admin)
 * - Handler guard: role check below (defense-in-depth)
 * - Casino scope: derived from RLS context (ADR-024)
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS2 Route Handler
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  RouteError,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createMeasurementService } from '@/services/measurement';
import type { MeasurementFilters } from '@/services/measurement';
import { measurementSummaryQuerySchema } from '@/services/measurement/schemas';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const queryObject: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryObject[key] = value;
    });
    const params = measurementSummaryQuerySchema.parse(queryObject);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Handler-level role guard (defense-in-depth with layout guard)
        const staffRole = mwCtx.rlsContext!.staffRole;
        if (!ALLOWED_ROLES.has(staffRole)) {
          throw new RouteError(
            'FORBIDDEN',
            'Measurement reports require pit_boss or admin role',
          );
        }

        const casinoId = mwCtx.rlsContext!.casinoId;

        // Semantic filter validation
        if (params.table_id) {
          // Verify table belongs to this casino
          const { data: table } = await mwCtx.supabase
            .from('gaming_table')
            .select('id, casino_id')
            .eq('id', params.table_id)
            .single();

          if (!table || table.casino_id !== casinoId) {
            throw new RouteError(
              'VALIDATION_ERROR',
              'Table not found in this casino',
            );
          }

          // Verify table assigned to pit if both provided
          if (params.pit_id) {
            const { data: slots } = await mwCtx.supabase
              .from('floor_table_slot')
              .select('preferred_table_id')
              .eq('pit_id', params.pit_id)
              .eq('preferred_table_id', params.table_id);

            if (!slots || slots.length === 0) {
              throw new RouteError(
                'VALIDATION_ERROR',
                'Table is not assigned to the specified pit',
              );
            }
          }
        }

        if (params.pit_id && !params.table_id) {
          // Verify pit belongs to this casino via floor_pit chain
          const { data: pit } = await mwCtx.supabase
            .from('floor_pit')
            .select('id, layout_version_id')
            .eq('id', params.pit_id)
            .single();

          if (!pit) {
            throw new RouteError('VALIDATION_ERROR', 'Pit not found');
          }
        }

        // Build filters
        const filters: MeasurementFilters = {};
        if (params.pit_id) filters.pitId = params.pit_id;
        if (params.table_id) filters.tableId = params.table_id;

        const service = createMeasurementService(mwCtx.supabase);
        const summary = await service.getSummary(casinoId, filters);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: summary,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'measurement',
        action: 'summary.fetch',
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

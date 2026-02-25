/**
 * Shift Checkpoints Route
 *
 * POST /api/v1/shift-checkpoints - Create checkpoint
 * GET  /api/v1/shift-checkpoints - List checkpoints by gaming_day
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-038 Mid-Shift Delta Checkpoints
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import {
  createCheckpoint,
  listCheckpointsByDay,
} from '@/services/table-context/shift-checkpoint/crud';
import {
  createCheckpointSchema,
  checkpointQuerySchema,
} from '@/services/table-context/shift-checkpoint/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/shift-checkpoints
 *
 * List checkpoints by gaming_day.
 * Casino scope derived from RLS context.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, checkpointQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        let gamingDay = query.gaming_day;
        if (!gamingDay) {
          const { data } = await mwCtx.supabase.rpc('rpc_current_gaming_day');
          gamingDay = data ?? undefined;
        }

        if (!gamingDay) {
          return {
            ok: true as const,
            code: 'OK' as const,
            data: [],
            requestId: mwCtx.correlationId,
            durationMs: Date.now() - mwCtx.startedAt,
            timestamp: new Date().toISOString(),
          };
        }

        const checkpoints = await listCheckpointsByDay(
          mwCtx.supabase,
          gamingDay,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: checkpoints,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'list-shift-checkpoints',
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
 * POST /api/v1/shift-checkpoints
 *
 * Create a shift checkpoint with metric snapshot.
 * Requires Idempotency-Key header.
 * Server derives: gaming_day, window_start, window_end, metric values.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<Record<string, unknown>>(request);
    const input = createCheckpointSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const checkpoint = await createCheckpoint(
          mwCtx.supabase,
          input.checkpoint_type,
          input.notes,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: checkpoint,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'create-shift-checkpoint',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * Floor Slot Assignment Route
 *
 * POST   /api/v1/floor-layouts/slots/[slotId]/assign — Assign or move a
 *        gaming_table into a slot. Body: { table_id }.
 * DELETE /api/v1/floor-layouts/slots/[slotId]/assign — Clear a slot's
 *        assignment. Idempotent at the RPC layer.
 *
 * Both require admin role and Idempotency-Key header. Casino is derived
 * authoritatively in the database (ADR-024 INV-8) — no casino_id or
 * actor_id parameters are passed to the RPC.
 *
 * Pattern: PRD-067 Admin Operations Pit Configuration (EXEC-067 §WS3).
 * Precedent: app/api/v1/casino/settings/route.ts.
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
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
import { createFloorLayoutService } from '@/services/floor-layout';
import type {
  AssignOrMoveResultDTO,
  ClearResultDTO,
} from '@/services/floor-layout/dtos';
import {
  assignOrMoveRequestSchema,
  slotIdParamSchema,
} from '@/services/floor-layout/schemas';

type RouteContext = { params: Promise<{ slotId: string }> };

/**
 * POST /api/v1/floor-layouts/slots/[slotId]/assign
 *
 * Assign a table to the slot, or move it from its current slot to the
 * target. Wraps `rpc_assign_or_move_table_to_slot`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { slotId } = parseParams(await context.params, slotIdParamSchema);
    const body = await readJsonBody(request);
    const { table_id: tableId } = assignOrMoveRequestSchema.parse(body);

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        if (mwCtx.rlsContext!.staffRole !== 'admin') {
          throw new DomainError(
            'FORBIDDEN_ADMIN_REQUIRED',
            'Admin role required for pit assignment mutations',
          );
        }

        const service = createFloorLayoutService(mwCtx.supabase);
        const data = await service.assignOrMoveTableToSlot(tableId, slotId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as AssignOrMoveResultDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'floor-layout',
        action: 'slot_assign',
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

/**
 * DELETE /api/v1/floor-layouts/slots/[slotId]/assign
 *
 * Clear the slot's table assignment. Idempotent at the RPC layer —
 * already-empty slots return success with `idempotent: true`.
 * Wraps `rpc_clear_slot_assignment`.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { slotId } = parseParams(await context.params, slotIdParamSchema);

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        if (mwCtx.rlsContext!.staffRole !== 'admin') {
          throw new DomainError(
            'FORBIDDEN_ADMIN_REQUIRED',
            'Admin role required for pit assignment mutations',
          );
        }

        const service = createFloorLayoutService(mwCtx.supabase);
        const data = await service.clearSlotAssignment(slotId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as ClearResultDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'floor-layout',
        action: 'slot_clear',
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

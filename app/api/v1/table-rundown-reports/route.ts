/**
 * Table Rundown Reports Route
 *
 * POST /api/v1/table-rundown-reports - Persist rundown report (manual path)
 * GET  /api/v1/table-rundown-reports - List reports by gaming_day
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-038 Shift Rundown Persistence
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
  persistRundown,
  listRundownsByDay,
} from '@/services/table-context/rundown-report/crud';
import {
  persistRundownSchema,
  rundownQuerySchema,
} from '@/services/table-context/rundown-report/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/table-rundown-reports
 *
 * List rundown reports by gaming_day (required) and optional gaming_table_id.
 * Casino scope derived from RLS context.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, rundownQuerySchema);

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

        const reports = await listRundownsByDay(mwCtx.supabase, gamingDay);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: reports,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'list-rundown-reports',
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
 * POST /api/v1/table-rundown-reports
 *
 * Persist a rundown report for a table session (manual pre-close path).
 * Requires Idempotency-Key header.
 * UPSERT contract: creates or updates, rejects if finalized (409).
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<Record<string, unknown>>(request);
    const input = persistRundownSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const report = await persistRundown(
          mwCtx.supabase,
          input.table_session_id,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: report,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'persist-rundown-report',
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

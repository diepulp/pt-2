/**
 * Gaming Day Route Handler
 *
 * GET /api/v1/casino/gaming-day
 *
 * Computes the current gaming day for the authenticated user's casino.
 * Uses compute_gaming_day RPC for consistent temporal alignment per TEMP-001.
 *
 * Security: casino_id extracted from RLS context (NEVER from request headers)
 * Pattern: WS3 reference implementation per SPEC-PRD-000 section 5.2.10
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { GamingDayDTO } from '@/services/casino/dtos';
import { gamingDayQuerySchema } from '@/services/casino/schemas';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params = gamingDayQuerySchema.parse({
      timestamp: searchParams.get('timestamp') ?? undefined,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        // Call compute_gaming_day RPC
        const { data: gamingDay, error: rpcError } = await mwCtx.supabase.rpc(
          'compute_gaming_day',
          {
            p_casino_id: casinoId,
            p_timestamp: params.timestamp ?? new Date().toISOString(),
          },
        );

        if (rpcError) {
          // Map RPC error to domain error
          if (rpcError.message?.includes('CASINO_SETTINGS_NOT_FOUND')) {
            throw new Error('CASINO_SETTINGS_NOT_FOUND');
          }
          throw rpcError;
        }

        // Fetch timezone from casino_settings for response
        const { data: settings } = await mwCtx.supabase
          .from('casino_settings')
          .select('timezone')
          .eq('casino_id', casinoId)
          .single();

        const responseData: GamingDayDTO = {
          gaming_day: gamingDay,
          casino_id: casinoId,
          computed_at: new Date().toISOString(),
          timezone: settings?.timezone ?? 'America/Los_Angeles',
        };

        return {
          ok: true as const,
          code: 'OK' as const,
          data: responseData,
          requestId: mwCtx.correlationId,
          durationMs: 0, // Overwritten by tracing middleware
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'gaming-day.compute',
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

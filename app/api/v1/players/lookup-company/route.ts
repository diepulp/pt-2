/**
 * Company Player Lookup Route
 *
 * POST /api/v1/players/lookup-company
 *
 * Company-scoped player recognition search. Returns recognition results
 * with enrollment, loyalty entitlement, and safety signals.
 *
 * Security: withServerAction middleware for auth/RLS/audit (ADR-024).
 *
 * @see PRD-051 Cross-Property Player Recognition
 * @see ADR-044 D4
 * @see EXEC-051 WS3
 */

export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRecognitionService } from '@/services/recognition';
import type { RecognitionResultDTO } from '@/services/recognition/dtos';
import { LookupCompanyInput } from '@/services/recognition/schemas';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);
    const parsed = LookupCompanyInput.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRecognitionService(mwCtx.supabase);
        const items = await service.lookupCompany(parsed.search_term);
        return {
          ok: true as const,
          code: 'OK' as const,
          data: items as RecognitionResultDTO[],
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'recognition',
        action: 'lookup-company',
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

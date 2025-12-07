/**
 * Casino List/Create Route
 *
 * GET /api/v1/casino - List casinos (cursor-based pagination)
 * POST /api/v1/casino - Create new casino
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: WS3-A reference implementation per SPEC-PRD-000 section 5.2.1-5.2.2
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
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
import type { CasinoDTO, CreateCasinoDTO } from '@/services/casino/dtos';
import {
  casinoListQuerySchema,
  createCasinoSchema,
} from '@/services/casino/schemas';
import type { Json } from '@/types/database.types';

/** Select fields for CasinoDTO projection */
const CASINO_SELECT = 'id, name, location, status, created_at';

/**
 * GET /api/v1/casino
 *
 * List casinos with cursor-based pagination.
 * Query params: status, cursor, limit
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, casinoListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Build query with filters
        let dbQuery = mwCtx.supabase
          .from('casino')
          .select(CASINO_SELECT)
          .order('created_at', { ascending: false });

        // Apply status filter if provided
        if (query.status) {
          dbQuery = dbQuery.eq('status', query.status);
        }

        // Apply cursor-based pagination
        if (query.cursor) {
          dbQuery = dbQuery.lt('created_at', query.cursor);
        }

        // Limit results (fetch one extra to determine if there are more)
        dbQuery = dbQuery.limit(query.limit + 1);

        const { data, error } = await dbQuery;

        if (error) {
          throw error;
        }

        // Determine if there are more results
        const hasMore = data.length > query.limit;
        const items = hasMore ? data.slice(0, query.limit) : data;
        const cursor = hasMore ? items[items.length - 1]?.created_at : null;

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            items: items as CasinoDTO[],
            cursor,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'list',
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
 * POST /api/v1/casino
 *
 * Create a new casino.
 * Requires Idempotency-Key header.
 * Returns 201 on success.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<CreateCasinoDTO>(request);

    // Validate input
    const input = createCasinoSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Check for duplicate name
        const { data: existing } = await mwCtx.supabase
          .from('casino')
          .select('id')
          .eq('name', input.name)
          .maybeSingle();

        if (existing) {
          throw new DomainError(
            'UNIQUE_VIOLATION',
            'Casino with this name already exists',
            {
              httpStatus: 409,
              details: { field: 'name', value: input.name },
            },
          );
        }

        // Insert new casino
        const { data, error } = await mwCtx.supabase
          .from('casino')
          .insert({
            name: input.name,
            location: input.location ?? null,
            address: (input.address as Json) ?? null,
            company_id: input.company_id ?? null,
            status: 'active',
          })
          .select(CASINO_SELECT)
          .single();

        if (error) {
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as CasinoDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'casino',
        action: 'create',
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

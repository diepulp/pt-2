/**
 * MTL Entry List/Create Route
 *
 * GET /api/v1/mtl/entries - List MTL entries with filters
 * POST /api/v1/mtl/entries - Create new MTL entry (idempotent)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Authorization per ADR-025:
 * - Entry READ: pit_boss, cashier, admin
 * - Entry WRITE: pit_boss, cashier, admin
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
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
import { assertRole } from '@/lib/supabase/rls-context';
import { createClient } from '@/lib/supabase/server';
import { createMtlService } from '@/services/mtl';
import {
  createMtlEntrySchema,
  mtlEntryListQuerySchema,
} from '@/services/mtl/schemas';

/**
 * GET /api/v1/mtl/entries
 *
 * List MTL entries with optional filters.
 * Query params: casino_id, patron_uuid?, gaming_day?, min_amount?, txn_type?, source?, entry_badge?, cursor?, limit?
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, mtlEntryListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-025: Entry READ allowed for pit_boss, cashier, admin
        assertRole(mwCtx.rlsContext!, ['pit_boss', 'cashier', 'admin']);

        const service = createMtlService(mwCtx.supabase);

        // Use casino_id from RLS context if not provided in query
        const filters = {
          casino_id: query.casino_id || mwCtx.rlsContext!.casinoId,
          patron_uuid: query.patron_uuid,
          gaming_day: query.gaming_day,
          min_amount: query.min_amount,
          txn_type: query.txn_type,
          source: query.source,
          entry_badge: query.entry_badge,
          cursor: query.cursor,
          limit: query.limit,
        };

        const response = await service.listEntries(filters);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: response,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'mtl',
        action: 'list-entries',
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
 * POST /api/v1/mtl/entries
 *
 * Create a new MTL entry (append-only).
 * Idempotent via (casino_id, idempotency_key) unique index.
 * Requires Idempotency-Key header.
 * Returns 201 on new entry, 200 on idempotent duplicate.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input
    const input = createMtlEntrySchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-025: Entry WRITE allowed for pit_boss, cashier, admin
        assertRole(mwCtx.rlsContext!, ['pit_boss', 'cashier', 'admin']);

        const service = createMtlService(mwCtx.supabase);

        // Use casino_id from RLS context, override any client-provided value for security
        const entry = await service.createEntry({
          ...input,
          casino_id: mwCtx.rlsContext!.casinoId,
          idempotency_key: input.idempotency_key || idempotencyKey,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: entry,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'mtl',
        action: 'create-entry',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new MTL entry
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * Financial Transaction List/Create Route
 *
 * GET /api/v1/financial-transactions - List financial transactions with filters
 * POST /api/v1/financial-transactions - Create new financial transaction
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-009 Player Financial Service
 *
 * Role-Based Constraints:
 * - Pit boss: Can only create buy-ins (direction=in, source=pit, tender_type in ['cash','chips'])
 * - Cashier: Can only create cash-outs (direction=out, source=cage) or markers (tender_type=marker, source=cage)
 * - Admin: Can create any transaction type
 * - Compliance: Read-only access
 * - Dealer: No access
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
import { createPlayerFinancialService } from '@/services/player-financial';
import {
  createFinancialTxnAdminSchema,
  createFinancialTxnCashierSchema,
  createFinancialTxnPitBossSchema,
  financialTxnListQuerySchema,
} from '@/services/player-financial/schemas';

/**
 * GET /api/v1/financial-transactions
 *
 * List financial transactions with optional filters.
 * Query params: player_id?, visit_id?, table_id?, direction?, source?, tender_type?, gaming_day?, limit?, cursor?
 *
 * RLS scopes results to casino automatically.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, financialTxnListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerFinancialService(mwCtx.supabase);

        const { items, cursor } = await service.list(query);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            items,
            cursor,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-financial',
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
 * POST /api/v1/financial-transactions
 *
 * Create a new financial transaction.
 * Requires Idempotency-Key header.
 * Returns 201 on success.
 *
 * Validation:
 * - Pit boss: Must have direction='in', source='pit', tender_type in ('cash', 'chips')
 * - Cashier: Must have source='cage', and either direction='out' OR tender_type='marker'
 * - Admin: No additional constraints
 *
 * Idempotency:
 * - RPC handles idempotency via unique constraint on (casino_id, idempotency_key)
 * - On duplicate, RPC throws IDEMPOTENCY_CONFLICT error
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Extract staff role from RLS context for role-based validation
        const staffRole = mwCtx.rlsContext?.staffRole;

        // Select appropriate schema based on role
        let input;
        if (staffRole === 'pit_boss') {
          input = createFinancialTxnPitBossSchema.parse(body);
        } else if (staffRole === 'cashier') {
          input = createFinancialTxnCashierSchema.parse(body);
        } else if (staffRole === 'admin') {
          input = createFinancialTxnAdminSchema.parse(body);
        } else {
          // Compliance, dealer, or unknown role
          return {
            ok: false as const,
            code: 'FORBIDDEN' as const,
            error: `Role '${staffRole}' is not authorized to create financial transactions`,
            requestId: mwCtx.correlationId,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
        }

        const service = createPlayerFinancialService(mwCtx.supabase);

        // Create transaction - RPC handles idempotency
        const transaction = await service.create({
          ...input,
          casino_id: mwCtx.rlsContext!.casinoId,
          created_by_staff_id: mwCtx.rlsContext!.actorId,
          idempotency_key: idempotencyKey,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: transaction,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-financial',
        action: 'create',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new transaction
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

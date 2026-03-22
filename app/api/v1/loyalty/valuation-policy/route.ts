/**
 * Valuation Policy Route
 *
 * GET  /api/v1/loyalty/valuation-policy - Read active valuation policy (any role)
 * POST /api/v1/loyalty/valuation-policy - Update valuation policy (admin only)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * GET: Any authenticated role can read the policy (admin form shows read-only for non-admin).
 * POST: Admin-only role gate. Requires x-idempotency-key header.
 * Casino context derived from RLS (ADR-024 INV-8 — no casinoId param).
 *
 * @see PRD-053 — Point Conversion Canonicalization
 * @see EXEC-054 WS5c
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createLoyaltyService } from '@/services/loyalty';
import { updateValuationPolicySchema } from '@/services/loyalty/schemas';

export const dynamic = 'force-dynamic';

/** Admin-only role gate for POST. */
const ALLOWED_ROLES = new Set(['admin']);

/**
 * GET /api/v1/loyalty/valuation-policy
 *
 * Returns the active valuation policy for the caller's casino.
 * Returns null (200) when no active policy exists — admin form renders "not configured" state.
 * Casino ID derived from RLS context (not query param).
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const rlsContext = mwCtx.rlsContext;
        if (!rlsContext) {
          throw new DomainError(
            'UNAUTHORIZED',
            'RLS context not available — authentication required',
          );
        }

        const service = createLoyaltyService(mwCtx.supabase);
        const policy = await service.getActiveValuationPolicy(
          rlsContext.casinoId,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: policy,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'get-valuation-policy',
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
 * POST /api/v1/loyalty/valuation-policy
 *
 * Updates the valuation policy (atomic deactivate + insert).
 * Admin-only. Requires x-idempotency-key header.
 * Casino ID derived from RLS context (ADR-024 INV-8).
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input (snake_case: cents_per_point, effective_date, version_identifier)
    const validated = updateValuationPolicySchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Defense-in-depth: role gate at route level BEFORE service dispatch
        const rlsContext = mwCtx.rlsContext;
        if (!rlsContext) {
          throw new DomainError(
            'UNAUTHORIZED',
            'RLS context not available — authentication required',
          );
        }

        if (!ALLOWED_ROLES.has(rlsContext.staffRole)) {
          throw new DomainError(
            'FORBIDDEN',
            `Role "${rlsContext.staffRole}" cannot update valuation policy. Requires admin.`,
          );
        }

        const service = createLoyaltyService(mwCtx.supabase);
        const policy = await service.updateValuationPolicy({
          centsPerPoint: validated.cents_per_point,
          effectiveDate: validated.effective_date,
          versionIdentifier: validated.version_identifier,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: policy,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'valuation_policy_updated',
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

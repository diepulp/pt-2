/**
 * Unified Reward Issuance Route
 *
 * POST /api/v1/loyalty/issue - Issue comp or entitlement from reward catalog
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Role gate: pit_boss and admin ONLY (defense-in-depth; RPC also enforces).
 * Idempotency: Required header - dedupes via ledger hash / coupon idempotency.
 * Family dispatch: Resolved server-side from reward catalog (not from client).
 *
 * @see PRD-052 §5.1 FR-5
 * @see EXEC-052 WS3
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
import type { IssuanceResultDTO } from '@/services/loyalty/dtos';
import { createPromoService } from '@/services/loyalty/promo';
import { issueRewardSchema } from '@/services/loyalty/schemas';

export const dynamic = 'force-dynamic';

/** Allowed issuer roles per PRD-052 and SEC-002. Cashier excluded. */
const ALLOWED_ISSUER_ROLES = new Set(['pit_boss', 'admin']);

/**
 * Maps DomainError codes to LOYALTY_-prefixed response codes and HTTP statuses.
 * Service layer throws DomainError codes; route maps to API-surface codes.
 *
 * @see EXEC-052 WS3 error mapping table
 */
function mapIssuanceError(error: DomainError): {
  code: string;
  status: number;
} {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      return { code: 'LOYALTY_INSUFFICIENT_BALANCE', status: 400 };
    case 'REWARD_INACTIVE':
      return { code: 'LOYALTY_REWARD_INACTIVE', status: 400 };
    case 'REWARD_NOT_FOUND':
      return { code: 'LOYALTY_REWARD_NOT_FOUND', status: 404 };
    case 'FORBIDDEN':
      return { code: 'LOYALTY_UNAUTHORIZED', status: 403 };
    case 'REWARD_FAMILY_MISMATCH':
      return { code: 'LOYALTY_REWARD_FAMILY_MISMATCH', status: 400 };
    case 'CATALOG_CONFIG_INVALID':
      return { code: 'LOYALTY_CATALOG_CONFIG_INVALID', status: 400 };
    case 'IDEMPOTENCY_CONFLICT':
      // Idempotent replay — return 200 with is_existing: true
      return { code: 'LOYALTY_IDEMPOTENCY_HIT', status: 200 };
    // PRD-061: Cadence enforcement errors
    case 'REWARD_LIMIT_REACHED':
      return { code: 'LOYALTY_LIMIT_REACHED', status: 429 };
    case 'REWARD_COOLDOWN_ACTIVE':
      return { code: 'LOYALTY_COOLDOWN_ACTIVE', status: 429 };
    case 'REWARD_VISIT_REQUIRED':
      return { code: 'LOYALTY_VISIT_REQUIRED', status: 422 };
    default:
      return { code: 'LOYALTY_FULFILLMENT_ASSEMBLY_FAILED', status: 500 };
  }
}

/**
 * POST /api/v1/loyalty/issue
 *
 * Issues a reward (comp or entitlement) from the reward catalog.
 * Requires Idempotency-Key header.
 * Role gate: pit_boss or admin only.
 * Family resolved server-side from reward catalog.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input
    const input = issueRewardSchema.parse(body);

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

        const { staffRole, casinoId } = rlsContext;
        if (!ALLOWED_ISSUER_ROLES.has(staffRole)) {
          throw new DomainError(
            'FORBIDDEN',
            `Role "${staffRole}" cannot issue rewards. Requires pit_boss or admin.`,
          );
        }

        // Dual-service instantiation: LoyaltyService for comps, PromoService for entitlements
        const loyaltyService = createLoyaltyService(mwCtx.supabase);
        const promoService = createPromoService(mwCtx.supabase);

        // Fetch reward to resolve family (uses caller's RLS context)
        const { getReward } = await import('@/services/loyalty/reward/crud');
        const reward = await getReward(mwCtx.supabase, input.reward_id);
        if (!reward) {
          throw new DomainError(
            'REWARD_NOT_FOUND',
            `Reward ${input.reward_id} not found`,
          );
        }

        // Dispatch by family
        let issuanceResult: IssuanceResultDTO;

        if (reward.family === 'points_comp') {
          issuanceResult = await loyaltyService.issueComp(
            {
              playerId: input.player_id,
              rewardId: input.reward_id,
              visitId: input.visit_id,
              idempotencyKey: input.idempotency_key,
              faceValueCents: input.face_value_cents,
              allowOverdraw: input.allow_overdraw,
              note: input.note,
            },
            casinoId,
          );
        } else if (reward.family === 'entitlement') {
          issuanceResult = await promoService.issueEntitlement({
            playerId: input.player_id,
            rewardId: input.reward_id,
            visitId: input.visit_id,
            idempotencyKey: input.idempotency_key,
            note: input.note,
          });
        } else {
          throw new DomainError(
            'REWARD_FAMILY_MISMATCH',
            `Unsupported reward family: ${reward.family}`,
          );
        }

        // Structured logging: { action: 'reward_issued', family, reward_id, player_id }
        // Emitted via withAudit middleware context; action set in options below.

        return {
          ok: true as const,
          code: 'OK' as const,
          data: issuanceResult,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'reward_issued',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 for new issuance, 200 for idempotent replay
    const status = result.data?.isExisting ? 200 : 201;
    return successResponse(ctx, result.data, 'OK', status);
  } catch (error) {
    // Map DomainError codes to LOYALTY_-prefixed response codes
    if (error instanceof DomainError) {
      const mapped = mapIssuanceError(error);

      // PRD-061: Include Retry-After header for 429 cadence responses
      if (
        mapped.status === 429 &&
        typeof error.details === 'object' &&
        error.details !== null
      ) {
        const details = error.details as Record<string, unknown>;
        const retryAfter = details.retryAfterSeconds;
        if (typeof retryAfter === 'number' && retryAfter > 0) {
          const resp = errorResponse(
            ctx,
            new DomainError(error.code, error.message, {
              httpStatus: 429,
              retryable: true,
              details: {
                responseCode: mapped.code,
                ...details,
              },
            }),
          );
          resp.headers.set('Retry-After', String(Math.ceil(retryAfter)));
          return resp;
        }
      }

      return errorResponse(
        ctx,
        new DomainError(error.code, error.message, {
          httpStatus: mapped.status,
          retryable: error.retryable,
          details: {
            responseCode: mapped.code,
            // Only spread safe primitive properties from error.details
            // to prevent cyclic object value from raw Error refs
            ...(typeof error.details === 'object' && error.details !== null
              ? Object.fromEntries(
                  Object.entries(
                    error.details as Record<string, unknown>,
                  ).filter(
                    ([, v]) =>
                      typeof v === 'string' ||
                      typeof v === 'number' ||
                      typeof v === 'boolean' ||
                      v === null,
                  ),
                )
              : {}),
          },
        }),
      );
    }
    return errorResponse(ctx, error);
  }
}

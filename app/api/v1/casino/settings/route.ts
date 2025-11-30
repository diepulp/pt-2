/**
 * Casino Settings Route Handler
 *
 * GET /api/v1/casino/settings - Get settings for authenticated user's casino
 * PATCH /api/v1/casino/settings - Update casino settings (admin only)
 *
 * Uses withServerAction middleware for auth, RLS, idempotency, and audit.
 * Casino ID is derived from mwCtx.rlsContext.casinoId (NEVER from request headers).
 *
 * @see SPEC-PRD-000-casino-foundation.md sections 5.2.6-5.2.7
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type {
  CasinoSettingsDTO,
  UpdateCasinoSettingsDTO,
} from "@/services/casino/dtos";
import { updateCasinoSettingsSchema } from "@/services/casino/schemas";

const SETTINGS_SELECT =
  "id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold";

/**
 * GET /api/v1/casino/settings
 *
 * Get settings for authenticated user's casino.
 * Casino ID is derived from RLS context (mwCtx.rlsContext.casinoId).
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const { data, error } = await mwCtx.supabase
          .from("casino_settings")
          .select(SETTINGS_SELECT)
          .eq("casino_id", casinoId)
          .single();

        if (error) {
          // Map PGRST116 (no rows) to domain-specific error
          if (error.code === "PGRST116") {
            throw new DomainError(
              "CASINO_SETTINGS_NOT_FOUND",
              "Casino settings not found",
              { details: { casinoId } },
            );
          }
          throw error;
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: data as CasinoSettingsDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "settings.get",
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
 * PATCH /api/v1/casino/settings
 *
 * Update casino settings for authenticated user's casino.
 * Requires admin role and idempotency key.
 *
 * Note: Changing timezone or gaming_day_start_time affects all downstream
 * services (Finance, MTL, Loyalty). UI should warn operators.
 */
export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    // Require idempotency key for mutation
    const idempotencyKey = requireIdempotencyKey(request);

    const supabase = await createClient();
    const body = await readJsonBody<UpdateCasinoSettingsDTO>(request);

    // Validate input with Zod schema
    const input = updateCasinoSettingsSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const { data, error } = await mwCtx.supabase
          .from("casino_settings")
          .update(input)
          .eq("casino_id", casinoId)
          .select(SETTINGS_SELECT)
          .single();

        if (error) {
          // Map PGRST116 (no rows) to domain-specific error
          if (error.code === "PGRST116") {
            throw new DomainError(
              "CASINO_SETTINGS_NOT_FOUND",
              "Casino settings not found",
              { details: { casinoId } },
            );
          }
          throw error;
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: data as CasinoSettingsDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "settings.update",
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

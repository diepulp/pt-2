/**
 * Casino Detail/Update/Delete Route
 *
 * GET /api/v1/casino/[id] - Get casino by ID
 * PATCH /api/v1/casino/[id] - Update casino
 * DELETE /api/v1/casino/[id] - Soft delete casino (set status='inactive')
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: WS3-A reference implementation per SPEC-PRD-000 section 5.2.3-5.2.5
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type { CasinoDTO, UpdateCasinoDTO } from "@/services/casino/dtos";
import { updateCasinoSchema } from "@/services/casino/schemas";
import type { Json } from "@/types/database.types";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/** Schema for route params validation */
const routeParamsSchema = z.object({
  id: z.string().uuid("Invalid casino ID format"),
});

/** Select fields for CasinoDTO projection */
const CASINO_SELECT = "id, name, location, status, created_at";

/**
 * GET /api/v1/casino/[id]
 *
 * Get casino details by ID.
 * Returns 404 if casino not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(await segmentData.params, routeParamsSchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const { data, error } = await mwCtx.supabase
          .from("casino")
          .select(CASINO_SELECT)
          .eq("id", params.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new DomainError("CASINO_NOT_FOUND", "Casino not found", {
            httpStatus: 404,
            details: { casinoId: params.id },
          });
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: data as CasinoDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "detail",
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
 * PATCH /api/v1/casino/[id]
 *
 * Update casino details.
 * Requires Idempotency-Key header.
 * Returns 404 if casino not found.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(await segmentData.params, routeParamsSchema);
    const supabase = await createClient();
    const body = await readJsonBody<UpdateCasinoDTO>(request);

    // Validate input
    const input = updateCasinoSchema.parse(body);

    // Check if there are any fields to update
    if (Object.keys(input).length === 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "No fields provided for update",
        {
          httpStatus: 400,
        },
      );
    }

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Check if casino exists
        const { data: existing } = await mwCtx.supabase
          .from("casino")
          .select("id")
          .eq("id", params.id)
          .maybeSingle();

        if (!existing) {
          throw new DomainError("CASINO_NOT_FOUND", "Casino not found", {
            httpStatus: 404,
            details: { casinoId: params.id },
          });
        }

        // If updating name, check for duplicates
        if (input.name) {
          const { data: duplicate } = await mwCtx.supabase
            .from("casino")
            .select("id")
            .eq("name", input.name)
            .neq("id", params.id)
            .maybeSingle();

          if (duplicate) {
            throw new DomainError(
              "UNIQUE_VIOLATION",
              "Casino with this name already exists",
              {
                httpStatus: 409,
                details: { field: "name", value: input.name },
              },
            );
          }
        }

        // Update casino
        const { data, error } = await mwCtx.supabase
          .from("casino")
          .update({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.location !== undefined && { location: input.location }),
            ...(input.address !== undefined && {
              address: input.address as Json,
            }),
            ...(input.company_id !== undefined && {
              company_id: input.company_id,
            }),
          })
          .eq("id", params.id)
          .select(CASINO_SELECT)
          .single();

        if (error) {
          throw error;
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: data as CasinoDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "update",
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
 * DELETE /api/v1/casino/[id]
 *
 * Soft delete casino by setting status to 'inactive'.
 * Requires Idempotency-Key header.
 * Returns 204 on success.
 */
export async function DELETE(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(await segmentData.params, routeParamsSchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Check if casino exists
        const { data: existing } = await mwCtx.supabase
          .from("casino")
          .select("id, status")
          .eq("id", params.id)
          .maybeSingle();

        if (!existing) {
          throw new DomainError("CASINO_NOT_FOUND", "Casino not found", {
            httpStatus: 404,
            details: { casinoId: params.id },
          });
        }

        // Already inactive - idempotent success
        if (existing.status === "inactive") {
          return {
            ok: true as const,
            code: "OK" as const,
            data: undefined,
            requestId: mwCtx.correlationId,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
        }

        // Soft delete by setting status to inactive
        const { error } = await mwCtx.supabase
          .from("casino")
          .update({ status: "inactive" })
          .eq("id", params.id);

        if (error) {
          throw error;
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: undefined,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "delete",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 204 No Content for successful delete
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * Casino Staff Route Handlers
 *
 * GET  /api/v1/casino/staff - List staff for authenticated user's casino
 * POST /api/v1/casino/staff - Create staff member (admin only)
 *
 * Security:
 * - casino_id forced to mwCtx.rlsContext.casinoId (NEVER from request)
 * - Admin role required for POST
 * - RLS enforced via withServerAction middleware
 *
 * @see SPEC-PRD-000-casino-foundation.md sections 5.2.8-5.2.9
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type { CreateStaffDTO, StaffDTO } from "@/services/casino/dtos";
import {
  createStaffSchema,
  staffListQuerySchema,
} from "@/services/casino/schemas";

const STAFF_SELECT =
  "id, first_name, last_name, role, status, employee_id, casino_id";

/**
 * GET /api/v1/casino/staff
 *
 * List staff for authenticated user's casino.
 * Filtered by status, role; supports cursor pagination.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, staffListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        let queryBuilder = mwCtx.supabase
          .from("staff")
          .select(STAFF_SELECT)
          .eq("casino_id", casinoId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });

        // Apply filters
        if (query.status) {
          queryBuilder = queryBuilder.eq("status", query.status);
        }
        if (query.role) {
          queryBuilder = queryBuilder.eq("role", query.role);
        }

        // Cursor pagination
        if (query.cursor) {
          queryBuilder = queryBuilder.gt("id", query.cursor);
        }

        // Limit + 1 to determine if there are more results
        queryBuilder = queryBuilder.limit(query.limit + 1);

        const { data, error } = await queryBuilder;

        if (error) throw error;

        // Determine cursor for next page
        const items = data as StaffDTO[];
        const hasMore = items.length > query.limit;
        const resultItems = hasMore ? items.slice(0, query.limit) : items;
        const nextCursor = hasMore
          ? resultItems[resultItems.length - 1]?.id
          : null;

        return {
          ok: true as const,
          code: "OK" as const,
          data: {
            items: resultItems,
            cursor: nextCursor,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "staff.list",
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
 * POST /api/v1/casino/staff
 *
 * Create a new staff member.
 * Requires admin role and idempotency key.
 * casino_id is forced to authenticated user's casino.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<CreateStaffDTO>(request);

    // Validate input (without casino_id as we'll force it from context)
    const input = createStaffSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        // Force casino_id to authenticated user's casino (security)
        const staffData = {
          ...input,
          casino_id: casinoId,
        };

        const { data, error } = await mwCtx.supabase
          .from("staff")
          .insert(staffData)
          .select(STAFF_SELECT)
          .single();

        if (error) {
          // Handle constraint violations
          if (error.code === "23514") {
            // Check constraint violation (staff role constraint)
            throw new DomainError(
              "STAFF_ROLE_CONSTRAINT_VIOLATION",
              undefined,
              {
                httpStatus: 400,
                details: { constraint: "chk_staff_role_user_id" },
              },
            );
          }
          if (error.code === "23505") {
            // Unique violation
            throw new DomainError("STAFF_ALREADY_EXISTS", undefined, {
              httpStatus: 409,
              details: { postgresCode: error.code, message: error.message },
            });
          }
          throw error;
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: data as StaffDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "casino",
        action: "staff.create",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, "OK", 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
